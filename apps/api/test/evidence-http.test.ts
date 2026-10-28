// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express, { type ErrorRequestHandler } from "express";
import type pg from "pg";
import { evidenceRouter } from "../src/evidence.js";
import { HttpError } from "../src/errors.js";
import { checksum, type EvidenceStore } from "../src/storage.js";
import type { Principal } from "../src/auth.js";

const caseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "33333333-3333-4333-8333-333333333333";
const uploadKey = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const bytes = Buffer.from("Bằng chứng giả lập cho hợp đồng upload.");

// Router contract fixture: authentication/scanner behavior is covered separately.
async function fixture(existing?: Record<string, unknown>) {
  let writes = 0, objects = 0;
  let principal: Principal = { id: userId, username: "tech", name: "Tech", roles: ["technician"] };
  const row = { id: caseId, pack_id: "g01", status: "in_progress", sync_status: "ready", technician_id: userId, task_id: "task-new", task_key: "repair", revision: 5, package_version: "1.0.0" };
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes("FROM cases")) return { rows: [row] };
    if (sql.includes("FROM team_members")) return { rows: [] };
    if (sql.includes("FROM memberships")) return { rows: [{ enabled: true, roles: principal.roles }] };
    if (sql.includes("FROM evidence")) return { rows: existing ? [existing] : [] };
    if (/^(INSERT|UPDATE|DELETE)/.test(sql)) writes++;
    if (sql.startsWith("INSERT INTO evidence")) return { rows: [{ id: values[0], case_id: caseId, task_id: row.task_id, filename: "check.txt", checksum: checksum(bytes) }] };
    return { rows: [{ id: "event" }] };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool;
  const store: EvidenceStore = { put: async () => { objects++; }, get: async () => bytes, promote: async () => {}, ready: async () => {} };
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = principal; next(); });
  app.use(evidenceRouter(pool, store));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error instanceof HttpError ? error.status : 500).json({ error: { code: error.code, message: error.message } });
  };
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  async function upload(task?: string) {
    return fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/cases/${caseId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": "check.txt", "Idempotency-Key": uploadKey, ...(task === undefined ? {} : { "X-Task-Id": task }) },
      body: bytes,
    });
  }
  return { upload, writes: () => writes, objects: () => objects, outsider: () => { principal = { ...principal, id: "66666666-6666-4666-8666-666666666666" }; }, close: async () => { server.close(); await once(server, "close"); } };
}

test("upload requires an explicit current task and rejects a stale task before object or event writes", async () => {
  const f = await fixture();
  try {
    for (const [task, status, code] of [[undefined, 400, "INVALID_UPLOAD_TASK"], ["task-old", 409, "STALE_TASK"]] as const) {
      const response = await f.upload(task);
      assert.equal(response.status, status);
      assert.equal((await response.json()).error.code, code);
      assert.equal(f.objects(), 0);
      assert.equal(f.writes(), 0);
    }
    assert.equal((await f.upload("task-new")).status, 201);
    assert.equal(f.objects(), 1);
  } finally { await f.close(); }
});

test("an exact replay retains its original task and cannot be relabeled for the current task", async () => {
  const f = await fixture({ id: uploadKey, task_id: "task-old", checksum: checksum(bytes), filename: "check.txt" });
  try {
    const replay = await f.upload("task-old");
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).item.taskId, "task-old");
    const conflict = await f.upload("task-new");
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.code, "IDEMPOTENCY_CONFLICT");
    assert.equal(f.objects(), 0);
    assert.equal(f.writes(), 0);
    f.outsider();
    assert.equal((await f.upload("task-old")).status, 404);
  } finally { await f.close(); }
});
