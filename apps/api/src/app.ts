import express, { type ErrorRequestHandler } from "express";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type pg from "pg";
import {
  canCreate,
  canComplete,
  verifyAccessToken,
  type Principal,
  type Role,
} from "./auth.js";
import type { JWTVerifyGetKey } from "jose";
import type { Flowable } from "./workflow.js";
import { HttpError } from "./errors.js";
import { g01Router } from "./g01.js";

type Options = {
  pool: pg.Pool;
  workflow: Flowable;
  issuer: string;
  audience: string;
  key: JWTVerifyGetKey;
  technicianId: string;
  definitionId: () => string | undefined;
  g01DefinitionId?: () => string | undefined;
  readiness: () => Promise<unknown>;
};
type Run = {
  id: string;
  title: string;
  requested_by: string;
  assignee: string;
  process_id: string | null;
  definition_id: string | null;
  package_version: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  request_hash: string;
};
const createInput = z
  .object({ title: z.string().trim().min(5).max(160) })
  .strict();
const uuid = z.uuid();
export function createApp(options: Options) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    next();
  });
  app.get("/api/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/health/ready", async (_req, res) => {
    try {
      const services = await options.readiness();
      res.json({ status: "ready", services });
    } catch {
      res.status(503).json({
        status: "starting",
        message: "Một dịch vụ lõi chưa sẵn sàng.",
      });
    }
  });
  app.get("/api/config", (_req, res) =>
    res.json({
      auth: {
        url: new URL(options.issuer).origin,
        realm: "sirocco",
        clientId: "schoolops-web",
      },
      phase: 2,
    }),
  );
  app.use("/api", async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer "))
      return next(new HttpError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập."));
    let identity;
    try {
      identity = await verifyAccessToken(authorization.slice(7), options);
    } catch {
      return next(
        new HttpError(
          401,
          "INVALID_TOKEN",
          "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
        ),
      );
    }
    const result = await options.pool.query<{
      subject_id: string;
      username: string;
      display_name: string;
      roles: Role[];
      enabled: boolean;
    }>("SELECT * FROM memberships WHERE subject_id=$1", [identity.id]);
    const member = result.rows[0];
    if (!member?.enabled)
      return next(
        new HttpError(
          403,
          "MEMBERSHIP_DISABLED",
          "Tài khoản chưa được cấp quyền hoặc đã bị thu hồi quyền.",
        ),
      );
    res.locals.principal = {
      id: member.subject_id,
      username: member.username,
      name: member.display_name,
      roles: member.roles,
    } satisfies Principal;
    next();
  });
  app.get("/api/me", (_req, res) => res.json({ user: res.locals.principal }));
  app.use(
    "/api/g01",
    g01Router({
      pool: options.pool,
      workflow: options.workflow,
      definitionId: options.g01DefinitionId || (() => undefined),
    }),
  );
  app.get("/api/foundation/tasks", async (_req, res) => {
    const user = res.locals.principal as Principal;
    const result = await options.pool.query<Run>(
      "SELECT * FROM foundation_runs WHERE requested_by=$1 OR assignee=$1 ORDER BY created_at DESC LIMIT 100",
      [user.id],
    );
    res.json({
      items: result.rows.map((row) => ({
        ...view(row),
        canComplete:
          row.status === "waiting" && canComplete(user, row.assignee),
      })),
    });
  });
  app.post("/api/foundation/tasks", async (req, res) => {
    const user = res.locals.principal as Principal;
    if (!canCreate(user))
      throw new HttpError(
        403,
        "FORBIDDEN",
        "Vai trò hiện tại không được tạo nhiệm vụ thử.",
      );
    const input = createInput.safeParse(req.body);
    const key = uuid.safeParse(req.headers["idempotency-key"]);
    if (!input.success || !key.success)
      throw new HttpError(
        400,
        "INVALID_REQUEST",
        "Nhập tiêu đề từ 5–160 ký tự và Idempotency-Key dạng UUID.",
      );
    const definitionId = options.definitionId();
    if (!definitionId)
      throw new HttpError(
        503,
        "ENGINE_NOT_READY",
        "Workflow đang khởi động. Vui lòng thử lại.",
      );
    const assignee = await options.pool.query(
      "SELECT 1 FROM memberships WHERE subject_id=$1 AND enabled AND $2=ANY(roles)",
      [options.technicianId, "technician"],
    );
    if (!assignee.rowCount)
      throw new HttpError(
        409,
        "ASSIGNEE_UNAVAILABLE",
        "Kỹ thuật viên demo hiện không có quyền nhận việc.",
      );
    const hash = createHash("sha256")
      .update(JSON.stringify(input.data))
      .digest("hex");
    const id = randomUUID();
    const inserted = await options.pool.query<Run>(
      `INSERT INTO foundation_runs(id,title,requested_by,assignee,idempotency_key,request_hash,definition_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,'starting') ON CONFLICT(requested_by,idempotency_key) DO NOTHING RETURNING *`,
      [
        id,
        input.data.title,
        user.id,
        options.technicianId,
        key.data,
        hash,
        definitionId,
      ],
    );
    if (!inserted.rowCount) {
      const result = await options.pool.query<Run>(
        "SELECT * FROM foundation_runs WHERE requested_by=$1 AND idempotency_key=$2",
        [user.id, key.data],
      );
      const existing = result.rows[0]!;
      if (existing.request_hash !== hash)
        throw new HttpError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Khóa gửi lại đã được dùng cho nội dung khác.",
        );
      return res
        .status(
          existing.status === "completed" || existing.status === "waiting"
            ? 200
            : 202,
        )
        .json({ item: view(existing) });
    }
    try {
      // Never retry a create automatically: a timeout may mean the engine accepted it.
      const process = await options.workflow.start(
        definitionId,
        id,
        options.technicianId,
      );
      const client = await options.pool.connect();
      let row: Run;
      try {
        await client.query("BEGIN");
        const updated = await client.query<Run>(
          "UPDATE foundation_runs SET process_id=$2,status='waiting' WHERE id=$1 RETURNING *",
          [id, process.id],
        );
        row = updated.rows[0]!;
        await client.query(
          "INSERT INTO audit_events(resource_id,actor_id,action) VALUES($1,$2,'created')",
          [id, user.id],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      res.status(201).json({ item: view(row) });
    } catch {
      const result = await options.pool.query<Run>(
        "UPDATE foundation_runs SET status='needs_reconciliation' WHERE id=$1 RETURNING *",
        [id],
      );
      res.status(202).json({
        item: view(result.rows[0]!),
        message:
          "Kết quả đồng bộ chưa chắc chắn; giữ nguyên hồ sơ để đối soát, không tạo lại workflow.",
      });
    }
  });
  app.post("/api/foundation/tasks/:id/complete", async (req, res) => {
    const user = res.locals.principal as Principal;
    if (!uuid.safeParse(req.params.id).success)
      throw new HttpError(400, "INVALID_ID", "Mã nhiệm vụ không hợp lệ.");
    const client = await options.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<Run>(
        "SELECT * FROM foundation_runs WHERE id=$1 FOR UPDATE",
        [req.params.id],
      );
      const row = result.rows[0];
      if (!row || (row.requested_by !== user.id && row.assignee !== user.id))
        throw new HttpError(404, "NOT_FOUND", "Không tìm thấy nhiệm vụ.");
      if (!canComplete(user, row.assignee))
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Chỉ kỹ thuật viên được giao mới được hoàn tất nhiệm vụ.",
        );
      if (row.status === "completed") {
        await client.query("COMMIT");
        return res.json({ item: view(row) });
      }
      if (row.status !== "waiting" || !row.process_id)
        throw new HttpError(
          409,
          "NOT_READY",
          "Nhiệm vụ đang chờ đồng bộ hoặc cần đối soát.",
        );
      const tasks = await options.workflow.tasks(row.process_id);
      const task = tasks[0];
      if (task) {
        if (tasks.length !== 1 || task.assignee !== user.id)
          throw new HttpError(
            409,
            "ENGINE_CONFLICT",
            "Nhiệm vụ trên engine không khớp người được giao.",
          );
        await options.workflow.complete(task.id);
      }
      if (!(await options.workflow.finished(row.process_id)))
        throw new HttpError(
          409,
          "ENGINE_PENDING",
          "Engine chưa xác nhận kết thúc; vui lòng kiểm tra lại.",
        );
      const updated = await client.query<Run>(
        "UPDATE foundation_runs SET status='completed',completed_at=now() WHERE id=$1 RETURNING *",
        [row.id],
      );
      await client.query(
        "INSERT INTO audit_events(resource_id,actor_id,action) VALUES($1,$2,'completed')",
        [row.id, user.id],
      );
      await client.query("COMMIT");
      res.json({ item: view(updated.rows[0]!) });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.use((_req, _res, next) =>
    next(new HttpError(404, "NOT_FOUND", "Đường dẫn không tồn tại.")),
  );
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error?.type === "entity.too.large")
      return void res.status(413).json({
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Nội dung vượt giới hạn 64 KB.",
        },
      });
    if (error instanceof HttpError)
      return void res
        .status(error.status)
        .json({ error: { code: error.code, message: error.message } });
    if (error instanceof SyntaxError && "body" in error)
      return void res.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "Dữ liệu JSON không hợp lệ.",
        },
      });
    console.error(
      "Request failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    res.status(503).json({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message:
          "Dịch vụ tạm thời không sẵn sàng. Dữ liệu đã lưu được giữ lại; hãy kiểm tra lại trạng thái.",
      },
    });
  };
  app.use(errorHandler);
  return app;
}
function view(row: Run) {
  return {
    id: row.id,
    title: row.title,
    requestedBy: row.requested_by,
    assignee: row.assignee,
    processId: row.process_id,
    definitionId: row.definition_id,
    packageVersion: row.package_version,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}
