import { scanWorkerId } from "./phase3-db.js";
import { Router, raw } from "express";
import type pg from "pg";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Principal } from "./auth.js";
import { canReadCase, caseActions } from "./g01-policy.js";
import { HttpError } from "./errors.js";
import { recordCaseEvent } from "./outbox.js";
import {
  checksum,
  identifyFile,
  MAX_FILE_SIZE,
  type EvidenceStore,
} from "./storage.js";
import type { VirusScanner } from "./scanner.js";

async function permitted(
  db: pg.Pool | pg.PoolClient,
  id: unknown,
  user: Principal,
  lock = false,
) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(400, "INVALID_ID", "Mã hồ sơ không hợp lệ.");
  const row = (
    await db.query(
      `SELECT * FROM cases WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [id],
    )
  ).rows[0];
  const teams = (
    await db.query("SELECT team_id FROM team_members WHERE subject_id=$1", [
      user.id,
    ])
  ).rows.map((r) => r.team_id as string);
  if (!row || !canReadCase(user, row, teams))
    throw new HttpError(
      404,
      "NOT_FOUND",
      "Không tìm thấy hồ sơ hoặc bạn không có quyền xem.",
    );
  return { row, teams };
}
function evidenceView(row: Record<string, any>) {
  return {
    id: row.id,
    caseId: row.case_id,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    checksum: row.checksum,
    uploadedBy: row.uploaded_by,
    step: row.step_key,
    taskId: row.task_id,
    policyVersion: row.policy_version,
    packageVersion: row.package_version,
    scanStatus: row.scan_status,
    scanVersion: row.scan_version,
    scanMessage: row.scan_message,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    scannedAt: row.scanned_at,
  };
}
export async function requireCleanEvidence(
  db: pg.PoolClient,
  row: Record<string, any>,
) {
  const policy = row.evidence_policy?.submit;
  if (!policy || !Number.isInteger(policy.minClean) || policy.minClean < 1)
    throw new HttpError(
      409,
      "EVIDENCE_POLICY_INVALID",
      "Chính sách bằng chứng chưa hợp lệ.",
    );
  const clean = (
    await db.query(
      `SELECT id,checksum,scan_version AS "scanVersion",policy_version AS "policyVersion"
    FROM evidence WHERE case_id=$1 AND scan_status='clean' AND step_key=$2
    AND ($3::boolean=false OR task_id=$4) ORDER BY created_at`,
      [row.id, policy.step, policy.currentTask, row.task_id],
    )
  ).rows;
  if (clean.length < policy.minClean)
    throw new HttpError(
      409,
      "EVIDENCE_REQUIRED",
      "Cần ít nhất một bằng chứng đã quét sạch cho lần xử lý này trước khi gửi nghiệm thu.",
    );
  return clean;
}
export function evidenceRouter(pool: pg.Pool, store?: EvidenceStore) {
  const router = Router();
  router.get("/cases/:id/evidence", async (req, res) => {
    const user = res.locals.principal as Principal;
    const { row, teams } = await permitted(pool, req.params.id, user);
    const rows = await pool.query(
      "SELECT * FROM evidence WHERE case_id=$1 ORDER BY created_at,id",
      [req.params.id],
    );
    res.json({
      items: rows.rows.map(evidenceView),
      canUpload:
        row.sync_status === "ready" &&
        ((row.reporter_id === user.id &&
          user.roles.includes("reporter") &&
          ["verification", "supplement"].includes(row.status)) ||
          caseActions(user, row, teams).includes("submit")),
    });
  });
  router.post(
    "/cases/:id/evidence",
    async (req, res, next) => {
      try {
        await permitted(pool, req.params.id, res.locals.principal);
        next();
      } catch (e) {
        next(e);
      }
    },
    raw({ type: "application/octet-stream", limit: MAX_FILE_SIZE }),
    async (req, res) => {
      if (!store)
        throw new HttpError(
          503,
          "STORAGE_UNAVAILABLE",
          "Dịch vụ lưu tệp chưa sẵn sàng.",
        );
      const key = z.uuid().safeParse(req.headers["idempotency-key"]);
      let filename: string;
      try {
        filename = decodeURIComponent(String(req.headers["x-file-name"] || ""));
      } catch {
        throw new HttpError(400, "INVALID_FILE", "Tên tệp không hợp lệ.");
      }
      if (!key.success || !Buffer.isBuffer(req.body))
        throw new HttpError(
          400,
          "INVALID_UPLOAD",
          "Gửi tệp nhị phân với tên tệp và Idempotency-Key UUID.",
        );
      let mime: string;
      try {
        mime = identifyFile(req.body, filename);
      } catch (e) {
        throw new HttpError(400, "INVALID_FILE", (e as Error).message);
      }
      const hash = checksum(req.body),
        user = res.locals.principal as Principal;
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        const { row, teams } = await permitted(db, req.params.id, user, true);
        const member = (
          await db.query(
            "SELECT * FROM memberships WHERE subject_id=$1 FOR SHARE",
            [user.id],
          )
        ).rows[0];
        if (
          !member?.enabled ||
          JSON.stringify(member.roles) !== JSON.stringify(user.roles)
        )
          throw new HttpError(
            403,
            "MEMBERSHIP_DISABLED",
            "Quyền đã thay đổi. Vui lòng làm mới.",
          );
        const old = (
          await db.query(
            "SELECT * FROM evidence WHERE case_id=$1 AND uploaded_by=$2 AND idempotency_key=$3",
            [row.id, user.id, key.data],
          )
        ).rows[0];
        if (old) {
          if (old.checksum !== hash || old.filename !== filename)
            throw new HttpError(
              409,
              "IDEMPOTENCY_CONFLICT",
              "Khóa tải tệp đã dùng với nội dung khác.",
            );
          await db.query("COMMIT");
          return res.json({ item: evidenceView(old) });
        }
        const mayUpload =
          row.sync_status === "ready" &&
          ((row.reporter_id === user.id &&
            user.roles.includes("reporter") &&
            ["verification", "supplement"].includes(row.status)) ||
            caseActions(user, row, teams).includes("submit"));
        if (!mayUpload)
          throw new HttpError(
            403,
            "UPLOAD_FORBIDDEN",
            "Chỉ người báo ở bước báo/bổ sung hoặc người đang xử lý được thêm bằng chứng.",
          );
        const id = randomUUID(),
          objectKey = `${row.id}/${id}`;
        await store.put(objectKey, req.body);
        const saved = (
          await db.query(
            `INSERT INTO evidence(id,case_id,uploaded_by,idempotency_key,filename,mime,size,checksum,object_key,step_key,task_id,policy_version,package_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
            [
              id,
              row.id,
              user.id,
              key.data,
              filename,
              mime,
              req.body.length,
              hash,
              objectKey,
              row.task_key,
              row.task_id,
              row.evidence_policy_version,
              row.package_version,
            ],
          )
        ).rows[0];
        await recordCaseEvent(
          db,
          row,
          user.id,
          "evidence_uploaded",
          row.status,
          {
            evidenceId: id,
            filename,
            checksum: hash,
            step: row.task_key,
            taskId: row.task_id,
          },
        );
        await db.query("COMMIT");
        res.status(201).json({ item: evidenceView(saved) });
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      } finally {
        db.release();
      }
    },
  );
  router.get("/cases/:id/evidence/:evidenceId/download", async (req, res) => {
    const { row } = await permitted(pool, req.params.id, res.locals.principal);
    if (!z.uuid().safeParse(req.params.evidenceId).success)
      throw new HttpError(400, "INVALID_ID", "Mã bằng chứng không hợp lệ.");
    const file = (
      await pool.query("SELECT * FROM evidence WHERE id=$1 AND case_id=$2", [
        req.params.evidenceId,
        row.id,
      ])
    ).rows[0];
    if (!file) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy tệp.");
    if (file.scan_status !== "clean")
      throw new HttpError(
        409,
        "FILE_NOT_CLEAN",
        "Tệp chưa được xác nhận sạch; chưa thể tải xuống.",
      );
    if (!store)
      throw new HttpError(
        503,
        "STORAGE_UNAVAILABLE",
        "Dịch vụ lưu tệp chưa sẵn sàng.",
      );
    const data = await store.get(file.object_key, true);
    if (checksum(data) !== file.checksum || data.length !== file.size)
      throw new HttpError(
        409,
        "FILE_INTEGRITY",
        "Tệp không khớp checksum; không thể tải xuống.",
      );
    // Recheck current authorization after the storage round trip, never return a public URL.
    const member = (
      await pool.query("SELECT * FROM memberships WHERE subject_id=$1", [
        res.locals.principal.id,
      ])
    ).rows[0];
    if (!member?.enabled)
      throw new HttpError(
        403,
        "MEMBERSHIP_DISABLED",
        "Quyền truy cập đã bị thu hồi.",
      );
    await permitted(pool, req.params.id, {
      ...res.locals.principal,
      roles: member.roles,
    });
    res.set({
      "Content-Type": file.mime,
      "Content-Disposition": `attachment; filename="evidence"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Content-Security-Policy": "sandbox",
      "Content-Length": String(data.length),
    });
    res.send(data);
  });
  return router;
}

export async function scanNextEvidence(
  pool: pg.Pool,
  store: EvidenceStore,
  scanner: VirusScanner,
) {
  const db = await pool.connect();
  let file: Record<string, any> | undefined;
  try {
    await db.query("BEGIN");
    file = (
      await db.query(`SELECT * FROM evidence WHERE scan_status IN ('pending','error') AND next_attempt_at<=now()
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`)
    ).rows[0];
    if (!file) {
      await db.query("COMMIT");
      return false;
    }
    const data = await store.get(file.object_key);
    let status: string, message: string, version: string;
    if (checksum(data) !== file.checksum || data.length !== file.size) {
      status = "rejected";
      message = "Checksum không khớp tệp đã nhận";
      version = "integrity-check-v1";
    } else {
      const result = await scanner.scan(data);
      status = result.clean ? "clean" : "rejected";
      message = result.message;
      version = result.version;
      if (result.clean) await store.promote(file.object_key, data);
    }
    await db.query(
      `UPDATE evidence SET scan_status=$2,scan_message=$3,scan_version=$4,attempts=attempts+1,scanned_at=now() WHERE id=$1`,
      [file.id, status, message, version],
    );
    const row = (
      await db.query("SELECT * FROM cases WHERE id=$1", [file.case_id])
    ).rows[0];
    await recordCaseEvent(
      db,
      row,
      scanWorkerId,
      "evidence_scanned",
      row.status,
      {
        evidenceId: file.id,
        checksum: file.checksum,
        scanStatus: status,
        scanVersion: version,
        executor: "scan-worker",
        uploadedBy: file.uploaded_by,
      },
    );
    await db.query("COMMIT");
    return true;
  } catch (e) {
    await db.query("ROLLBACK");
    if (!file) throw e;
    await db.query(
      `UPDATE evidence SET scan_status='error',scan_message='Không xác nhận được an toàn. Hệ thống sẽ tự quét lại.',
      attempts=attempts+1,next_attempt_at=now()+make_interval(secs=>LEAST(60,POWER(2,LEAST(attempts+1,6))::int)) WHERE id=$1 AND scan_status IN ('pending','error')`,
      [file.id],
    );
    return false;
  } finally {
    db.release();
  }
}
