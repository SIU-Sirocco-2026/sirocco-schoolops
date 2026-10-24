import { Router } from "express";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type pg from "pg";
import type { Principal } from "./auth.js";
import { Flowable, type EngineTask } from "./workflow.js";
import { HttpError } from "./errors.js";
import {
  canReadCase,
  caseActions,
  steps,
  type CaseStatus,
  type CaseAccess,
} from "./g01-policy.js";

const schemaSnapshot = JSON.parse(
  readFileSync(
    new URL("../../../packs/g01/v1/schema.json", import.meta.url),
    "utf8",
  ),
);
const refs = {
  package: "g01@1.0.0",
  schema: "g01-case@1.0.0",
  workflow: "g01-facilities@1.0.0",
};
const report = z
  .object({
    title: z.string().trim().min(5).max(160),
    roomId: z.string().min(1).max(40),
    assetId: z.string().min(1).max(60).nullable().optional(),
    description: z.string().trim().min(10).max(4000),
  })
  .strict();
const revision = z.number().int().positive();
const reason = z.string().trim().min(5).max(2000);
const work = {
  measures: z.string().trim().min(5).max(4000),
  result: z.string().trim().min(5).max(4000),
};
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), revision }).strict(),
  z.object({ action: z.literal("return_info"), revision, reason }).strict(),
  z
    .object({ action: z.literal("resubmit"), revision, ...report.shape })
    .strict(),
  z
    .object({
      action: z.literal("assign"),
      revision,
      technicianId: z.uuid().nullable().optional(),
      teamId: z.string().max(60).nullable().optional(),
      approverId: z.uuid(),
      dueAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z.object({ action: z.literal("receive"), revision }).strict(),
  z.object({ action: z.literal("save_work"), revision, ...work }).strict(),
  z.object({ action: z.literal("submit"), revision, ...work }).strict(),
  z.object({ action: z.literal("return_work"), revision, reason }).strict(),
  z.object({ action: z.literal("approve"), revision }).strict(),
]);
type CaseRow = CaseAccess & {
  id: string;
  code: string;
  title: string;
  room_id: string;
  asset_id: string | null;
  description: string;
  revision: number;
  process_id: string | null;
  task_id: string | null;
  task_key: string | null;
  definition_id: string;
  package_version: string;
  schema_version: string;
  workflow_version: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  decision_by: string | null;
  measures: string | null;
  result: string | null;
  request_hash: string;
};
type Options = {
  pool: pg.Pool;
  workflow: Flowable;
  definitionId: () => string | undefined;
};
function fail(status: number, code: string, message: string): never {
  throw new HttpError(status, code, message);
}
const parseId = (id: unknown) =>
  z.uuid().safeParse(id).success ||
  fail(400, "INVALID_ID", "Mã hồ sơ không hợp lệ.");
async function teamsFor(db: pg.Pool | pg.PoolClient, user: Principal) {
  return (
    await db.query<{ team_id: string }>(
      "SELECT team_id FROM team_members WHERE subject_id=$1",
      [user.id],
    )
  ).rows.map((r) => r.team_id);
}
async function validateCatalog(
  db: pg.Pool | pg.PoolClient,
  input: z.infer<typeof report>,
) {
  if (
    !(await db.query("SELECT 1 FROM rooms WHERE id=$1", [input.roomId]))
      .rowCount
  )
    fail(400, "INVALID_ROOM", "Phòng không thuộc danh mục.");
  if (
    input.assetId &&
    !(
      await db.query("SELECT 1 FROM assets WHERE id=$1 AND room_id=$2", [
        input.assetId,
        input.roomId,
      ])
    ).rowCount
  )
    fail(400, "INVALID_ASSET", "Thiết bị không thuộc phòng đã chọn.");
}
async function requireRole(
  db: pg.Pool | pg.PoolClient,
  id: string,
  role: string,
) {
  if (
    !(
      await db.query(
        "SELECT 1 FROM memberships WHERE subject_id=$1 AND enabled AND $2=ANY(roles)",
        [id, role],
      )
    ).rowCount
  )
    fail(
      409,
      "ASSIGNEE_UNAVAILABLE",
      "Người được chọn không còn quyền phù hợp.",
    );
}
function view(row: CaseRow, user: Principal, teams: string[]) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    roomId: row.room_id,
    assetId: row.asset_id,
    description: row.description,
    reporterId: row.reporter_id,
    coordinatorId: row.coordinator_id,
    technicianId: row.technician_id,
    teamId: row.team_id,
    approverId: row.approver_id,
    dueAt: row.due_at,
    status: row.status,
    syncStatus: row.sync_status,
    revision: row.revision,
    processId: row.process_id,
    taskId: row.task_id,
    taskKey: row.task_key,
    definitionId: row.definition_id,
    packageVersion: row.package_version,
    schemaVersion: row.schema_version,
    workflowVersion: row.workflow_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    decisionBy: row.decision_by,
    measures: row.measures,
    result: row.result,
    actions: caseActions(user, row, teams),
  };
}
async function event(
  db: pg.PoolClient,
  row: CaseRow,
  actor: string,
  action: string,
  from: string | null,
  details: unknown,
) {
  await db.query(
    "INSERT INTO case_events(case_id,actor_id,action,from_status,to_status,details,revision) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      row.id,
      actor,
      action,
      from,
      row.status,
      JSON.stringify(details),
      row.revision,
    ],
  );
}
async function checkEngine(workflow: Flowable, row: CaseRow) {
  if (!row.process_id || !row.task_id)
    fail(409, "ENGINE_CONFLICT", "Hồ sơ chưa gắn nhiệm vụ hợp lệ.");
  const tasks = await workflow.tasks(row.process_id!);
  const task = tasks[0];
  if (
    tasks.length !== 1 ||
    task?.id !== row.task_id ||
    task.taskDefinitionKey !== steps[row.status]
  )
    fail(
      409,
      "ENGINE_CONFLICT",
      "Bước trên engine không khớp hồ sơ. Cần đối soát.",
    );
  let expected: string | null = null;
  if (["verification", "assignment"].includes(row.status))
    expected = row.coordinator_id;
  if (row.status === "supplement") expected = row.reporter_id;
  if (["assigned", "in_progress"].includes(row.status))
    expected = row.technician_id;
  if (row.status === "acceptance") expected = row.approver_id;
  if ((task!.assignee || null) !== expected)
    fail(409, "ENGINE_CONFLICT", "Người xử lý trên engine không khớp hồ sơ.");
  if (row.status === "assigned" && row.team_id && !row.technician_id) {
    const links = await workflow.request<{ type: string; group: string }[]>(
      `runtime/tasks/${encodeURIComponent(task!.id)}/identitylinks`,
    );
    if (!links.some((l) => l.type === "candidate" && l.group === row.team_id))
      fail(409, "ENGINE_CONFLICT", "Nhóm ứng viên trên engine không khớp.");
  }
  return task!;
}
export function g01Router({ pool, workflow, definitionId }: Options) {
  const router = Router();
  router.get("/catalog", async (_req, res) => {
    const user = res.locals.principal as Principal;
    const [rooms, assets, people, teams] = await Promise.all([
      pool.query("SELECT * FROM rooms ORDER BY id"),
      pool.query("SELECT * FROM assets ORDER BY id"),
      pool.query(
        "SELECT subject_id AS id,display_name AS name,roles FROM memberships WHERE enabled AND roles && ARRAY['coordinator','technician','approver']::text[] ORDER BY display_name",
      ),
      pool.query(
        "SELECT t.id,t.name FROM teams t WHERE EXISTS(SELECT 1 FROM team_members tm JOIN memberships m ON m.subject_id=tm.subject_id WHERE tm.team_id=t.id AND m.enabled AND 'technician'=ANY(m.roles)) ORDER BY t.id",
      ),
    ]);
    res.json({
      rooms: rooms.rows,
      assets: assets.rows,
      people: people.rows,
      teams: teams.rows,
      canCreate: user.roles.includes("reporter"),
      versions: refs,
    });
  });
  router.get("/cases", async (req, res) => {
    const user = res.locals.principal as Principal,
      teams = await teamsFor(pool, user);
    const filter = z
      .object({
        status: z
          .enum(Object.keys(steps) as [CaseStatus, ...CaseStatus[]])
          .optional(),
        q: z.string().trim().max(160).optional(),
        mine: z.enum(["true", "false"]).optional(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .strict()
      .safeParse(req.query);
    if (!filter.success) fail(400, "INVALID_FILTER", "Bộ lọc không hợp lệ.");
    const { status, q, mine, page } = filter.data;
    const result = await pool.query<CaseRow>(
      `SELECT * FROM cases WHERE
      (('reporter'=ANY($2::text[]) AND reporter_id=$1) OR ('coordinator'=ANY($2::text[]) AND coordinator_id=$1) OR ('approver'=ANY($2::text[]) AND approver_id=$1) OR
      ('technician'=ANY($2::text[]) AND (technician_id=$1 OR (status='assigned' AND technician_id IS NULL AND team_id=ANY($3::text[])))))
      AND ($4::text IS NULL OR status=$4) AND ($5::text IS NULL OR strpos(lower(code || ' ' || title || ' ' || description),lower($5))>0)
      ORDER BY created_at DESC,id`,
      [user.id, user.roles, teams, status || null, q || null],
    );
    const items = result.rows
      .map((r) => view(r, user, teams))
      .filter((r) => mine !== "true" || r.actions.length > 0);
    res.json({
      items: items.slice((page - 1) * 25, page * 25),
      total: items.length,
      page,
      pageSize: 25,
    });
  });
  router.get("/cases/:id", async (req, res) => {
    parseId(req.params.id);
    const user = res.locals.principal as Principal,
      teams = await teamsFor(pool, user);
    const row = (
      await pool.query<CaseRow>("SELECT * FROM cases WHERE id=$1", [
        req.params.id,
      ])
    ).rows[0];
    if (!row || !canReadCase(user, row, teams))
      fail(
        404,
        "NOT_FOUND",
        "Không tìm thấy hồ sơ hoặc bạn không có quyền xem.",
      );
    const events = await pool.query(
      `SELECT e.id::text,e.action,e.from_status AS "fromStatus",e.to_status AS "toStatus",e.actor_id AS "actorId",m.display_name AS "actorName",e.created_at AS "createdAt",e.details,e.revision FROM case_events e JOIN memberships m ON m.subject_id=e.actor_id WHERE case_id=$1 ORDER BY e.id`,
      [row.id],
    );
    res.json({ item: view(row, user, teams), timeline: events.rows });
  });
  router.post("/cases", async (req, res) => {
    const user = res.locals.principal as Principal;
    if (!user.roles.includes("reporter"))
      fail(403, "FORBIDDEN", "Chỉ người báo được tạo hồ sơ G01.");
    const input = report.safeParse(req.body),
      key = z.uuid().safeParse(req.headers["idempotency-key"]);
    if (!input.success || !key.success)
      fail(
        400,
        "INVALID_REQUEST",
        "Nhập tiêu đề 5–160 ký tự, phòng, mô tả 10–4000 ký tự và Idempotency-Key UUID.",
      );
    const data = { ...input.data, assetId: input.data.assetId || null };
    const hash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
    const existing = (
      await pool.query<CaseRow>(
        "SELECT * FROM cases WHERE reporter_id=$1 AND idempotency_key=$2",
        [user.id, key.data],
      )
    ).rows[0];
    if (existing) {
      if (existing.request_hash !== hash)
        fail(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Khóa gửi đã dùng với nội dung khác.",
        );
      return res
        .status(existing.sync_status === "ready" ? 200 : 202)
        .json({ item: view(existing, user, []) });
    }
    const definition = definitionId();
    if (!definition) fail(503, "ENGINE_NOT_READY", "Quy trình đang khởi động.");
    const client = await pool.connect();
    let row: CaseRow;
    try {
      await client.query("BEGIN");
      await validateCatalog(client, data);
      const coordinator = (
        await client.query<{ subject_id: string }>(
          "SELECT subject_id FROM memberships WHERE enabled AND 'coordinator'=ANY(roles) ORDER BY subject_id LIMIT 1",
        )
      ).rows[0];
      if (!coordinator)
        fail(409, "NO_COORDINATOR", "Chưa có điều phối được cấp quyền.");
      const inserted = await client.query<CaseRow>(
        `INSERT INTO cases(id,title,room_id,asset_id,description,reporter_id,coordinator_id,status,sync_status,definition_id,package_version,schema_version,workflow_version,schema_snapshot,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,'verification','pending',$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(reporter_id,idempotency_key) DO NOTHING RETURNING *`,
        [
          randomUUID(),
          data.title,
          data.roomId,
          data.assetId,
          data.description,
          user.id,
          coordinator.subject_id,
          definition,
          refs.package,
          refs.schema,
          refs.workflow,
          JSON.stringify(schemaSnapshot),
          key.data,
          hash,
        ],
      );
      if (!inserted.rowCount) {
        const old = (
          await client.query<CaseRow>(
            "SELECT * FROM cases WHERE reporter_id=$1 AND idempotency_key=$2",
            [user.id, key.data],
          )
        ).rows[0]!;
        if (old.request_hash !== hash)
          fail(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Khóa gửi đã dùng với nội dung khác.",
          );
        await client.query("COMMIT");
        return res
          .status(old.sync_status === "ready" ? 200 : 202)
          .json({ item: view(old, user, []) });
      }
      row = inserted.rows[0]!;
      await event(client, row, user.id, "created", null, data);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    try {
      const process = await workflow.startWithVariables(
        row.definition_id,
        row.id,
        {
          coordinator: row.coordinator_id,
          reporter: user.id,
          technician: "",
          team: "",
          approver: "",
          dueAt: "",
        },
      );
      const tasks = await workflow.tasks(process.id),
        task = tasks[0];
      if (
        tasks.length !== 1 ||
        task?.taskDefinitionKey !== "verify" ||
        task.assignee !== row.coordinator_id
      )
        throw new Error("Initial task mismatch");
      row = (
        await pool.query<CaseRow>(
          "UPDATE cases SET process_id=$2,task_id=$3,task_key=$4,sync_status='ready',updated_at=now() WHERE id=$1 RETURNING *",
          [row.id, process.id, task.id, task.taskDefinitionKey],
        )
      ).rows[0]!;
      return res.status(201).json({ item: view(row, user, []) });
    } catch {
      row = (
        await pool.query<CaseRow>(
          "UPDATE cases SET sync_status='needs_reconciliation',updated_at=now() WHERE id=$1 RETURNING *",
          [row.id],
        )
      ).rows[0]!;
      return res.status(202).json({
        item: view(row, user, []),
        message:
          "Đã giữ hồ sơ; kết quả engine chưa chắc chắn, cần đối soát trước khi xử lý.",
      });
    }
  });
  router.post("/cases/:id/actions", async (req, res) => {
    parseId(req.params.id);
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success)
      fail(
        400,
        "INVALID_ACTION",
        "Dữ liệu thao tác thiếu hoặc không hợp lệ; lý do tối thiểu 5 ký tự, biện pháp/kết quả tối thiểu 5 ký tự.",
      );
    const input = parsed.data,
      user = res.locals.principal as Principal;
    const client = await pool.connect();
    let row: CaseRow,
      next: CaseRow,
      details: Record<string, unknown> = {},
      variables: Record<string, string | boolean> = {};
    let from: CaseStatus;
    try {
      await client.query("BEGIN");
      const current = (
        await client.query<CaseRow>(
          "SELECT * FROM cases WHERE id=$1 FOR UPDATE",
          [req.params.id],
        )
      ).rows[0];
      const teams = await teamsFor(client, user);
      if (!current || !canReadCase(user, current, teams))
        fail(
          404,
          "NOT_FOUND",
          "Không tìm thấy hồ sơ hoặc bạn không có quyền xem.",
        );
      row = current;
      from = row.status;
      if (!caseActions(user, row, teams).includes(input.action))
        fail(
          403,
          "FORBIDDEN_ACTION",
          "Bạn không được thực hiện thao tác này ở bước hiện tại.",
        );
      if (row.revision !== input.revision)
        fail(
          409,
          "STALE_REVISION",
          "Hồ sơ đã thay đổi. Làm mới trước khi thao tác tiếp.",
        );
      next = { ...row, revision: row.revision + 1 };
      if (input.action === "accept") {
        next.status = "assignment";
        variables.verified = true;
      }
      if (input.action === "return_info") {
        next.status = "supplement";
        variables.verified = false;
        details = { reason: input.reason };
      }
      if (input.action === "resubmit") {
        await validateCatalog(client, input);
        next.status = "verification";
        next.title = input.title;
        next.room_id = input.roomId;
        next.asset_id = input.assetId || null;
        next.description = input.description;
        details = {
          title: input.title,
          roomId: input.roomId,
          assetId: input.assetId || null,
          description: input.description,
        };
      }
      if (input.action === "assign") {
        if (Boolean(input.technicianId) === Boolean(input.teamId))
          fail(
            400,
            "INVALID_ASSIGNMENT",
            "Chọn một người hoặc một nhóm xử lý.",
          );
        if (new Date(input.dueAt).getTime() <= Date.now())
          fail(400, "INVALID_DEADLINE", "Hạn hoàn thành phải ở tương lai.");
        await requireRole(client, input.approverId, "approver");
        if (input.technicianId) {
          await requireRole(client, input.technicianId, "technician");
          if (input.approverId === input.technicianId)
            fail(400, "SELF_APPROVAL", "Người xử lý không được tự nghiệm thu.");
        }
        if (
          input.teamId &&
          !(
            await client.query(
              "SELECT 1 FROM team_members tm JOIN memberships m ON m.subject_id=tm.subject_id WHERE tm.team_id=$1 AND m.enabled AND 'technician'=ANY(m.roles) AND m.subject_id<>$2",
              [input.teamId, input.approverId],
            )
          ).rowCount
        )
          fail(
            409,
            "TEAM_UNAVAILABLE",
            "Nhóm chưa có kỹ thuật viên hợp lệ khác người nghiệm thu.",
          );
        next.status = "assigned";
        next.technician_id = input.technicianId || null;
        next.team_id = input.teamId || null;
        next.approver_id = input.approverId;
        next.due_at = new Date(input.dueAt).toISOString();
        variables = {
          technician: next.technician_id || "",
          team: next.team_id || "",
          approver: input.approverId,
          dueAt: next.due_at,
        };
        details = {
          technicianId: next.technician_id,
          teamId: next.team_id,
          approverId: input.approverId,
          dueAt: next.due_at,
        };
      }
      if (input.action === "receive") {
        if (row.approver_id === user.id)
          fail(
            403,
            "SELF_APPROVAL",
            "Người nghiệm thu không được nhận xử lý hồ sơ này.",
          );
        next.status = "in_progress";
        next.technician_id = user.id;
        variables.technician = user.id;
        details = { technicianId: user.id };
      }
      if (input.action === "save_work" || input.action === "submit") {
        next.measures = input.measures;
        next.result = input.result;
        details = { measures: input.measures, result: input.result };
        if (input.action === "submit") {
          if (!row.approver_id)
            fail(409, "NO_APPROVER", "Chưa có người nghiệm thu.");
          await requireRole(client, row.approver_id, "approver");
          next.status = "acceptance";
        }
      }
      if (input.action === "return_work") {
        next.status = "in_progress";
        variables.approved = false;
        details = { reason: input.reason };
      }
      if (input.action === "approve") {
        next.status = "closed";
        variables.approved = true;
        next.decision_by = user.id;
      }
      await checkEngine(workflow, row);
      // Persist intent before a network mutation. An uncertain result blocks further writes;
      // phase 3 adds worker reconciliation, rather than blindly repeating this command.
      await client.query(
        "UPDATE cases SET sync_status='pending',revision=$2,updated_at=now() WHERE id=$1",
        [row.id, next.revision],
      );
      if (input.action === "save_work") {
        const saved = (
          await client.query<CaseRow>(
            "UPDATE cases SET measures=$2,result=$3,sync_status='ready' WHERE id=$1 RETURNING *",
            [row.id, next.measures, next.result],
          )
        ).rows[0]!;
        await event(client, saved, user.id, input.action, from, details);
        await client.query("COMMIT");
        return res.json({ item: view(saved, user, teams) });
      }
      await event(
        client,
        { ...row, revision: next.revision },
        user.id,
        "action_requested",
        from,
        { action: input.action, ...details },
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    try {
      if (input.action === "receive" && !row.technician_id)
        await workflow.claim(row.task_id!, user.id);
      await workflow.complete(row.task_id!, variables);
      let task: EngineTask | undefined;
      if (next.status === "closed") {
        if (!(await workflow.finished(row.process_id!)))
          throw new Error("Process not finished");
      } else {
        const tasks = await workflow.tasks(row.process_id!);
        task = tasks[0];
        if (
          tasks.length !== 1 ||
          task?.taskDefinitionKey !== steps[next.status]
        )
          throw new Error("Next task mismatch");
        const expected =
          next.status === "supplement"
            ? next.reporter_id
            : ["verification", "assignment"].includes(next.status)
              ? next.coordinator_id
              : ["assigned", "in_progress"].includes(next.status)
                ? next.technician_id
                : next.approver_id;
        if ((task.assignee || null) !== expected)
          throw new Error("Next assignee mismatch");
      }
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        const saved = (
          await db.query<CaseRow>(
            `UPDATE cases SET title=$2,room_id=$3,asset_id=$4,description=$5,technician_id=$6,team_id=$7,approver_id=$8,due_at=$9,status=$10,task_id=$11,task_key=$12,measures=$13,result=$14,decision_by=$15,closed_at=CASE WHEN $10='closed' THEN now() ELSE closed_at END,sync_status='ready',updated_at=now() WHERE id=$1 RETURNING *`,
            [
              row.id,
              next.title,
              next.room_id,
              next.asset_id,
              next.description,
              next.technician_id,
              next.team_id,
              next.approver_id,
              next.due_at,
              next.status,
              task?.id || null,
              task?.taskDefinitionKey || null,
              next.measures,
              next.result,
              next.decision_by,
            ],
          )
        ).rows[0]!;
        await event(db, saved, user.id, input.action, from, details);
        await db.query("COMMIT");
        res.json({ item: view(saved, user, await teamsFor(pool, user)) });
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      } finally {
        db.release();
      }
    } catch {
      const saved = (
        await pool.query<CaseRow>(
          "UPDATE cases SET sync_status='needs_reconciliation',updated_at=now() WHERE id=$1 RETURNING *",
          [row.id],
        )
      ).rows[0]!;
      res.status(202).json({
        item: view(saved, user, await teamsFor(pool, user)),
        message:
          "Thao tác chưa được xác nhận đầy đủ. Hồ sơ đang chờ đối soát; không gửi lặp để đẩy bước.",
      });
    }
  });
  return router;
}
