// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { enqueueCommand, recordCaseEvent } from "./outbox.js";
import { validatePayload, type PackRevision } from "./packs.js";

export async function createCaseRecord(
  db: pg.PoolClient,
  input: {
    payload: {
      title: string;
      roomId: string;
      assetId?: string | null;
      description: string;
    };
    pack: PackRevision;
    reporterId: string;
    coordinatorId: string;
    technicianId?: string | null;
    actorId: string;
    key: string;
    hash: string;
  },
) {
  const { payload: p, pack: r } = input;
  validatePayload(r.bundle.schema, p);
  const inserted = await db.query(
    `INSERT INTO cases(id,code,title,room_id,asset_id,description,reporter_id,coordinator_id,technician_id,status,sync_status,
  definition_id,package_version,schema_version,workflow_version,schema_snapshot,idempotency_key,request_hash,evidence_policy,evidence_policy_version,pack_revision_id,pack_id,access_ids)
  VALUES($1,upper($18)||'-'||lpad(nextval('g01_case_number')::text,6,'0'),$2,$3,$4,$5,$6,$7,$19,'verification','pending',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$20)
  ON CONFLICT(pack_id,reporter_id,idempotency_key) DO NOTHING RETURNING *`,
    [
      randomUUID(),
      p.title,
      p.roomId,
      p.assetId || null,
      p.description,
      input.reporterId,
      input.coordinatorId,
      r.definition_id,
      `${r.pack_id}@${r.version}`,
      r.bundle.manifest.schema,
      r.bundle.manifest.workflow,
      JSON.stringify(r.bundle.schema),
      input.key,
      input.hash,
      JSON.stringify(r.bundle.evidence),
      r.bundle.evidence.version,
      r.id,
      r.pack_id,
      input.technicianId || null,
      r.pack_id === "g03" ? [input.reporterId, input.coordinatorId] : [],
    ],
  );
  if (!inserted.rowCount) return null;
  const row = inserted.rows[0];
  await recordCaseEvent(db, row, input.actorId, "created", null, p);
  const commandId = await enqueueCommand(
    db,
    row,
    input.actorId,
    "created",
    row.status,
    row,
    {
      coordinator: row.coordinator_id,
      reporter: row.reporter_id,
      technician: row.technician_id || "",
      team: "",
      approver: "",
      dueAt: "",
    },
    p,
  );
  return { row, commandId };
}
