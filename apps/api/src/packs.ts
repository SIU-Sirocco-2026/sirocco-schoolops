import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { Ajv2020 } from "ajv/dist/2020.js";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type pg from "pg";
import type { Flowable } from "./workflow.js";
import { HttpError } from "./errors.js";

const version = z.string().regex(/^\d+\.\d+\.\d+$/);
const ref = z.string().regex(/^[a-z][a-z0-9-]*@\d+\.\d+\.\d+$/);
export const manifestSchema = z
  .object({
    id: z.enum(["g01"]),
    version,
    name: z.string().min(3).max(120),
    adapter: z.literal("facility-v1"),
    schema: ref,
    workflow: ref,
    evidence: ref,
    roles: z.record(
      z.string().regex(/^[a-z]+$/),
      z.enum(["reporter", "coordinator", "technician", "approver"]),
    ),
    tasks: z.record(
      z.string(),
      z
        .object({ role: z.string(), actions: z.array(z.string()).min(1) })
        .strict(),
    ),
  })
  .strict();
const policySchema = z
  .object({
    version: ref,
    submit: z
      .object({
        minClean: z.number().int().min(1).max(10),
        step: z.literal("repair"),
        currentTask: z.literal(true),
        mimeTypes: z
          .array(
            z.enum([
              "image/png",
              "image/jpeg",
              "application/pdf",
              "text/plain",
            ]),
          )
          .min(1)
          .optional(),
      })
      .strict(),
  })
  .strict();
export type BusinessPack = {
  manifest: z.infer<typeof manifestSchema>;
  schema: Record<string, any>;
  workflow: string;
  evidence: z.infer<typeof policySchema>;
  seed: Record<string, unknown>[];
  labels: Record<string, string>;
};
const envelope = z
  .object({
    manifest: manifestSchema,
    schema: z.record(z.string(), z.unknown()),
    workflow: z.string().max(100000),
    evidence: policySchema,
    seed: z.array(z.record(z.string(), z.unknown())).min(1).max(30),
    labels: z.record(z.string(), z.string().max(200)),
  })
  .strict();
export const facilityTasks: Record<
  string,
  { role: string; actions: string[] }
> = {
  verify: { role: "coordinator", actions: ["accept", "return_info"] },
  supplement: { role: "reporter", actions: ["resubmit"] },
  assign: { role: "coordinator", actions: ["assign"] },
  receive: { role: "technician", actions: ["receive"] },
  repair: { role: "technician", actions: ["save_work", "submit"] },
  approve: { role: "approver", actions: ["approve", "return_work"] },
};
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export const packChecksum = (pack: BusinessPack) =>
  createHash("sha256").update(canonical(pack)).digest("hex");
export function validatePayload(
  schema: Record<string, unknown>,
  payload: unknown,
) {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const check = ajv.compile(schema);
  if (!check(payload))
    throw new HttpError(400, "SCHEMA_VALIDATION", ajv.errorsText(check.errors));
}
export async function readPack(directory: string): Promise<BusinessPack> {
  // Fixed filenames only. No arbitrary path, script or dependency loading from manifests.
  const files = await Promise.all(
    [
      "manifest.json",
      "schema.json",
      "workflow.bpmn20.xml",
      "evidence-policy.json",
      "seed.json",
      "labels.json",
    ].map((f) => readFile(`${directory}/${f}`, "utf8")),
  );
  return {
    manifest: JSON.parse(files[0]!),
    schema: JSON.parse(files[1]!),
    workflow: files[2]!,
    evidence: JSON.parse(files[3]!),
    seed: JSON.parse(files[4]!),
    labels: JSON.parse(files[5]!),
  };
}
function normalizeXml(xml: string) {
  if (/<!DOCTYPE|<!ENTITY|<\?[^x]|schemaLocation/i.test(xml))
    throw new Error(
      "BPMN không được khai báo DTD/entity hay tài nguyên ngoài.",
    );
  const check = XMLValidator.validate(xml);
  if (check !== true) throw new Error(`XML không hợp lệ: ${check.err.msg}`);
  const tree = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  }).parse(xml);
  const defs = tree.definitions;
  if (
    !defs ||
    Array.isArray(defs) ||
    !defs.process ||
    Array.isArray(defs.process)
  )
    throw new Error("Cần đúng một process BPMN.");
  const scrub = (v: any): any =>
    Array.isArray(v)
      ? v.map(scrub)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .filter(([k]) => k !== "@_name")
              .map(([k, x]) => [k, scrub(x)]),
          )
        : v;
  const normalized = scrub(defs);
  delete normalized.process["@_id"];
  delete normalized["@_targetNamespace"];
  return {
    normalized,
    processId: defs.process["@_id"] as string,
    process: defs.process,
  };
}
export async function validatePack(input: unknown): Promise<{
  valid: boolean;
  errors: string[];
  pack?: BusinessPack;
  checksum?: string;
}> {
  const parsed = envelope.safeParse(input);
  if (!parsed.success)
    return {
      valid: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    };
  const pack = parsed.data as BusinessPack,
    errors: string[] = [];
  try {
    if (
      pack.schema.$id !== pack.manifest.schema ||
      pack.evidence.version !== pack.manifest.evidence
    )
      throw new Error("Tham chiếu schema/evidence không khớp manifest.");
    if (pack.manifest.id !== "g01" || pack.manifest.adapter !== "facility-v1")
      throw new Error("Adapter chưa được hỗ trợ.");
    for (const role of ["reporter", "coordinator", "technician", "approver"])
      if (pack.manifest.roles[role] !== role)
        throw new Error(
          `Role ${role} cần ánh xạ đúng quyền mà adapter hỗ trợ.`,
        );
    if (Object.keys(pack.manifest.roles).length !== 4)
      throw new Error("Role ngoài tập adapter hỗ trợ.");
    if (canonical(pack.manifest.tasks) !== canonical(facilityTasks))
      throw new Error(
        "Task/role/action thiếu hoặc không đúng hợp đồng adapter.",
      );
    const schema = pack.schema;
    if (
      schema.type !== "object" ||
      schema.additionalProperties !== false ||
      canonical(Object.keys(schema.properties || {}).sort()) !==
        canonical(["assetId", "description", "roomId", "title"])
    )
      throw new Error(
        "Schema cần các trường được facility-v1 hỗ trợ và additionalProperties=false.",
      );
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const validate = ajv.compile(schema);
    for (const [i, seed] of pack.seed.entries())
      if (!validate(seed))
        throw new Error(
          `Seed ${i} không khớp schema: ${ajv.errorsText(validate.errors)}`,
        );
    const actual = normalizeXml(pack.workflow),
      trusted = normalizeXml(
        await readFile(
          new URL("../../../packs/g01/v1/workflow.bpmn20.xml", import.meta.url),
          "utf8",
        ),
      );
    if (!/^[a-z][a-z0-9-]{2,80}$/.test(actual.processId))
      throw new Error("Process ID không hợp lệ.");
    // This adapter deliberately supports one audited BPMN topology, including its
    // variables/conditions. Names and process ID may vary; executable extensions may not.
    if (canonical(actual.normalized) !== canonical(trusted.normalized))
      throw new Error(
        "BPMN ngoài tập hỗ trợ: topology, task, gateway, điều kiện hoặc thuộc tính thực thi đã đổi.",
      );
    const p = actual.process,
      ids = new Set<string>(),
      links = Array.isArray(p.sequenceFlow) ? p.sequenceFlow : [p.sequenceFlow];
    for (const [kind, values] of Object.entries(p)) {
      if (kind.startsWith("@_")) continue;
      for (const node of Array.isArray(values) ? values : [values]) {
        if (!node || typeof node !== "object") continue;
        const id = (node as any)["@_id"];
        if (!id || ids.has(id)) throw new Error("BPMN ID thiếu hoặc trùng.");
        ids.add(id);
      }
    }
    const reachable = (start: string, reverse = false) => {
      const seen = new Set([start]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const l of links) {
          const a = l[reverse ? "@_targetRef" : "@_sourceRef"],
            b = l[reverse ? "@_sourceRef" : "@_targetRef"];
          if (!ids.has(a) || !ids.has(b))
            throw new Error("Sequence tham chiếu node không tồn tại.");
          if (seen.has(a) && !seen.has(b)) {
            seen.add(b);
            changed = true;
          }
        }
      }
      return seen;
    };
    const forward = reachable(p.startEvent["@_id"]),
      back = reachable(p.endEvent["@_id"], true);
    for (const task of Object.keys(pack.manifest.tasks))
      if (!forward.has(task) || !back.has(task))
        throw new Error(`Task ${task} không có đường đi start/end.`);
    if (
      !pack.manifest.tasks[pack.evidence.submit.step]?.actions.includes(
        "submit",
      )
    )
      throw new Error("Evidence tham chiếu task/action sai.");
    for (const key of [
      "title",
      "description",
      ...Object.keys(pack.manifest.tasks),
    ])
      if (!pack.labels[key]) throw new Error(`Thiếu nhãn ${key}.`);
  } catch (e) {
    errors.push((e as Error).message);
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, errors: [], pack, checksum: packChecksum(pack) };
}

export async function packsMigration(db: pg.PoolClient) {
  if (
    (await db.query("SELECT 1 FROM schema_migrations WHERE version=5")).rowCount
  )
    return;
  await db.query(`CREATE TABLE pack_revisions(id uuid PRIMARY KEY,pack_id text NOT NULL,version text NOT NULL,checksum text NOT NULL,bundle jsonb NOT NULL,definition_id text NOT NULL,installed_by uuid REFERENCES memberships(subject_id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(pack_id,version));
    CREATE TABLE active_packs(pack_id text PRIMARY KEY,revision_id uuid NOT NULL REFERENCES pack_revisions(id),activated_by uuid REFERENCES memberships(subject_id),activated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE pack_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,pack_id text,version text,actor_id uuid REFERENCES memberships(subject_id),action text NOT NULL,errors jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE cases ADD COLUMN pack_revision_id uuid REFERENCES pack_revisions(id);
    INSERT INTO schema_migrations(version) VALUES(5);`);
}
export type PackRevision = {
  id: string;
  pack_id: string;
  version: string;
  checksum: string;
  bundle: BusinessPack;
  definition_id: string;
};
export async function activePack(
  db: pg.Pool | pg.PoolClient,
  id = "g01",
): Promise<PackRevision> {
  const row = (
    await db.query<PackRevision>(
      "SELECT r.* FROM active_packs a JOIN pack_revisions r ON r.id=a.revision_id WHERE a.pack_id=$1",
      [id],
    )
  ).rows[0];
  if (!row)
    throw new HttpError(
      503,
      "PACK_NOT_READY",
      "Chưa có gói nghiệp vụ đang kích hoạt.",
    );
  return row;
}
async function attempt(
  pool: pg.Pool,
  actor: string | null,
  pack: unknown,
  action: string,
  errors: string[],
) {
  const manifest = (pack as any)?.manifest;
  await pool.query(
    "INSERT INTO pack_events(pack_id,version,actor_id,action,errors) VALUES($1,$2,$3,$4,$5)",
    [
      typeof manifest?.id === "string" ? manifest.id.slice(0, 80) : null,
      typeof manifest?.version === "string"
        ? manifest.version.slice(0, 80)
        : null,
      actor,
      action,
      JSON.stringify(errors),
    ],
  );
}
export async function installPack(
  pool: pg.Pool,
  workflow: Flowable,
  input: unknown,
  actor: string | null,
  bootstrapDefinition?: string,
) {
  const result = await validatePack(input);
  if (!result.valid) {
    await attempt(pool, actor, input, "validation_failed", result.errors);
    throw new HttpError(400, "INVALID_PACK", result.errors.join("; "));
  }
  const pack = result.pack!,
    hash = result.checksum!,
    db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `pack:${pack.manifest.id}`,
    ]);
    const old = (
      await db.query<PackRevision>(
        "SELECT * FROM pack_revisions WHERE pack_id=$1 AND version=$2",
        [pack.manifest.id, pack.manifest.version],
      )
    ).rows[0];
    if (old) {
      if (old.checksum !== hash)
        throw new HttpError(
          409,
          "IMMUTABLE_VERSION",
          "Phiên bản đã nạp không được sửa nội dung.",
        );
      await db.query("COMMIT");
      return old;
    }
    const definition =
      bootstrapDefinition ||
      (await workflow.deployXml(
        pack.workflow,
        `sirocco-${pack.manifest.id}-${pack.manifest.version.replaceAll(".", "-")}-${hash.slice(0, 16)}`,
      ));
    const row = (
      await db.query<PackRevision>(
        "INSERT INTO pack_revisions(id,pack_id,version,checksum,bundle,definition_id,installed_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          randomUUID(),
          pack.manifest.id,
          pack.manifest.version,
          hash,
          JSON.stringify(pack),
          definition,
          actor,
        ],
      )
    ).rows[0]!;
    await db.query(
      "INSERT INTO pack_events(pack_id,version,actor_id,action) VALUES($1,$2,$3,'installed')",
      [row.pack_id, row.version, actor],
    );
    await db.query("COMMIT");
    return row;
  } catch (e) {
    await db.query("ROLLBACK");
    await attempt(pool, actor, pack, "install_failed", [(e as Error).message]);
    throw e;
  } finally {
    db.release();
  }
}
export async function activatePack(
  pool: pg.Pool,
  workflow: Flowable,
  packId: string,
  version: string,
  actor: string | null,
  onlyIfMissing = false,
) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `pack:${packId}`,
    ]);
    const row = (
      await db.query<PackRevision>(
        "SELECT * FROM pack_revisions WHERE pack_id=$1 AND version=$2",
        [packId, version],
      )
    ).rows[0];
    if (!row)
      throw new HttpError(404, "PACK_NOT_FOUND", "Chưa nạp phiên bản gói này.");
    if (
      onlyIfMissing &&
      (await db.query("SELECT 1 FROM active_packs WHERE pack_id=$1", [packId]))
        .rowCount
    ) {
      await db.query("COMMIT");
      return row;
    }
    const checked = await validatePack(row.bundle);
    if (!checked.valid || checked.checksum !== row.checksum)
      throw new HttpError(
        409,
        "PACK_INTEGRITY",
        "Checksum/nội dung gói không hợp lệ.",
      );
    await workflow.request(
      `repository/process-definitions/${encodeURIComponent(row.definition_id)}`,
    );
    await db.query(
      "INSERT INTO active_packs(pack_id,revision_id,activated_by) VALUES($1,$2,$3) ON CONFLICT(pack_id) DO UPDATE SET revision_id=excluded.revision_id,activated_by=excluded.activated_by,activated_at=now()",
      [packId, row.id, actor],
    );
    await db.query(
      "INSERT INTO pack_events(pack_id,version,actor_id,action) VALUES($1,$2,$3,'activated')",
      [packId, version, actor],
    );
    await db.query("COMMIT");
    return row;
  } catch (e) {
    await db.query("ROLLBACK");
    await attempt(
      pool,
      actor,
      { manifest: { id: packId, version } },
      "activation_failed",
      [(e as Error).message],
    );
    throw e;
  } finally {
    db.release();
  }
}
export async function bootstrapPacks(
  pool: pg.Pool,
  workflow: Flowable,
  definition: string,
) {
  const pack = await readPack(
    fileURLToPath(new URL("../../../packs/g01/v1", import.meta.url)),
  );
  const revision = await installPack(pool, workflow, pack, null, definition);
  await activatePack(pool, workflow, "g01", "1.0.0", null, true);
  await pool.query(
    "UPDATE cases SET pack_revision_id=$1 WHERE pack_revision_id IS NULL AND package_version='g01@1.0.0'",
    [revision.id],
  );
}
export function packsRouter(pool: pg.Pool, workflow: Flowable) {
  const router = Router();
  router.use((_req, res, next) => {
    if (!res.locals.principal.roles.includes("admin"))
      return next(
        new HttpError(
          403,
          "PACK_ADMIN_REQUIRED",
          "Chỉ quản trị kỹ thuật được quản lý gói.",
        ),
      );
    next();
  });
  router.get("/", async (_req, res) => {
    const [revisions, events] = await Promise.all([
      pool.query(
        'SELECT r.id,r.pack_id AS "packId",r.version,r.checksum,r.definition_id AS "definitionId",r.created_at AS "createdAt",(a.revision_id=r.id) IS TRUE AS active FROM pack_revisions r LEFT JOIN active_packs a ON a.pack_id=r.pack_id ORDER BY r.pack_id,r.created_at',
      ),
      pool.query(
        'SELECT id::text,pack_id AS "packId",version,action,errors,created_at AS "createdAt" FROM pack_events ORDER BY id DESC LIMIT 30',
      ),
    ]);
    res.json({ items: revisions.rows, events: events.rows });
  });
  router.post("/validate", async (req, res) => {
    const result = await validatePack(req.body);
    await attempt(
      pool,
      res.locals.principal.id,
      req.body,
      result.valid ? "validated" : "validation_failed",
      result.errors,
    );
    res.status(result.valid ? 200 : 400).json({
      valid: result.valid,
      errors: result.errors,
      checksum: result.checksum,
    });
  });
  router.post("/install", async (req, res) => {
    const row = await installPack(
      pool,
      workflow,
      req.body,
      res.locals.principal.id,
    );
    res.status(201).json({
      id: row.id,
      packId: row.pack_id,
      version: row.version,
      checksum: row.checksum,
      definitionId: row.definition_id,
    });
  });
  router.post("/:id/:version/activate", async (req, res) => {
    const row = await activatePack(
      pool,
      workflow,
      String(req.params.id),
      String(req.params.version),
      res.locals.principal.id,
    );
    res.json({ id: row.id, packId: row.pack_id, version: row.version });
  });
  return router;
}
