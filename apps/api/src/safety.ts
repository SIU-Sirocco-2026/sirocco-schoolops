import { Router } from "express";
import type pg from "pg";
import { z } from "zod";
import { canReadCase, caseScopeSql } from "./g01-policy.js";
import type { Principal } from "./auth.js";
import { HttpError } from "./errors.js";
export const safetyUsers = [
  {
    id: "88888888-8888-4888-8888-888888888888",
    username: "safety_reporter",
    name: "Người báo an toàn Demo",
    roles: ["safety_reporter"],
  },
  {
    id: "99999999-9999-4999-8999-999999999999",
    username: "safety",
    name: "Cán bộ an toàn Demo",
    roles: ["safety_officer"],
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    username: "safety_reviewer",
    name: "Nghiệm thu an toàn Demo",
    roles: ["safety_officer"],
  },
];
export async function safetyMigration(db: pg.PoolClient) {
  if (
    (await db.query("SELECT 1 FROM schema_migrations WHERE version=8")).rowCount
  )
    return;
  await db.query(`ALTER TABLE cases ADD COLUMN access_ids uuid[] NOT NULL DEFAULT '{}';
  ALTER TABLE cases DROP CONSTRAINT cases_reporter_id_idempotency_key_key;
  ALTER TABLE cases ADD CONSTRAINT cases_pack_reporter_key UNIQUE(pack_id,reporter_id,idempotency_key);
  CREATE TABLE restricted_access_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id uuid REFERENCES memberships(subject_id),resource_id uuid,operation text NOT NULL,method text NOT NULL,allowed boolean NOT NULL,http_status int,created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE case_notifications(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,case_id uuid NOT NULL REFERENCES cases(id),event_id bigint NOT NULL REFERENCES case_events(id),recipient_id uuid NOT NULL REFERENCES memberships(subject_id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,recipient_id));
  INSERT INTO schema_migrations(version) VALUES(8);`);
  for (const u of safetyUsers)
    await db.query(
      "INSERT INTO memberships(subject_id,username,display_name,roles) VALUES($1,$2,$3,$4)",
      [u.id, u.username, u.name, u.roles],
    );
}
export function safetyRouter(pool: pg.Pool) {
  const router = Router();
  router.use(async (req, res, next) => {
    const user = res.locals.principal as Principal;
    const hasRole = user.roles.some((r) =>
      ["safety_reporter", "safety_officer"].includes(r),
    );
    const match = req.path.match(/^\/cases\/([^/]+)/),
      resourceId =
        match && z.uuid().safeParse(match[1]).success ? match[1] : null;
    let allowed = hasRole;
    if (match) {
      const row = resourceId
        ? (
            await pool.query(
              "SELECT * FROM cases WHERE id=$1 AND pack_id='g03'",
              [resourceId],
            )
          ).rows[0]
        : null;
      allowed = !!row && canReadCase(user, row, []);
    }
    const operation = match
      ? req.path.endsWith("/download")
        ? "file_download"
        : req.path.endsWith("/actions")
          ? "case_action"
          : req.path.includes("/evidence")
            ? "case_evidence"
            : req.path.endsWith("/access-log")
              ? "case_access_log"
              : "case_detail"
      : req.path === "/reports"
        ? "report"
        : req.path === "/notifications"
          ? "notification"
          : req.path === "/catalog"
            ? "catalog"
            : "case_collection";
    const log = (
      await pool.query(
        "INSERT INTO restricted_access_events(actor_id,resource_id,operation,method,allowed) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [user.id, resourceId, operation, req.method, allowed],
      )
    ).rows[0];
    // The access decision is durable before serving content. HTTP outcome is attached
    // afterwards; a missing outcome means an interrupted request, never a claimed success.
    res.once("finish", () => {
      void pool
        .query(
          "UPDATE restricted_access_events SET http_status=$2 WHERE id=$1",
          [log.id, res.statusCode],
        )
        .catch(() => console.warn("Restricted access outcome unavailable"));
    });
    if (match && !allowed)
      return next(
        new HttpError(
          404,
          "NOT_FOUND",
          "Không tìm thấy hồ sơ hoặc bạn không có quyền xem.",
        ),
      );
    if (
      !hasRole &&
      !(
        req.method === "GET" &&
        ["/cases", "/reports", "/notifications"].includes(req.path)
      )
    )
      return next(
        new HttpError(
          403,
          "SAFETY_FORBIDDEN",
          "Chưa được cấp quyền nghiệp vụ an toàn.",
        ),
      );
    next();
  });
  router.get("/notifications", async (_req, res) => {
    const user = res.locals.principal as Principal;
    const data = await pool.query(
      `SELECT n.id::text,n.case_id AS "caseId",c.code,n.created_at AS "createdAt" FROM case_notifications n JOIN cases c ON c.id=n.case_id WHERE n.recipient_id=$1 AND ${caseScopeSql} AND pack_id=$4 ORDER BY n.id DESC LIMIT 100`,
      [user.id, user.roles, [], "g03"],
    );
    res.json({
      items: data.rows.map((r) => ({
        ...r,
        message: "Có cập nhật hồ sơ an toàn trong phạm vi được cấp quyền.",
      })),
    });
  });
  router.get("/cases/:id/access-log", async (req, res) => {
    if (!res.locals.principal.roles.includes("safety_officer"))
      throw new HttpError(
        403,
        "SAFETY_AUDIT_FORBIDDEN",
        "Chỉ cán bộ an toàn được xem nhật ký truy cập hồ sơ đã được cấp quyền.",
      );
    const data = await pool.query(
      'SELECT id::text,actor_id AS "actorId",operation,method,allowed,http_status AS "httpStatus",created_at AS "createdAt" FROM restricted_access_events WHERE resource_id=$1 ORDER BY id DESC LIMIT 200',
      [req.params.id],
    );
    res.json({ items: data.rows });
  });
  return router;
}
