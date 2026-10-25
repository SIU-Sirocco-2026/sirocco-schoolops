// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import type pg from "pg";
import { createApp } from "../src/app.js";
import type { Flowable } from "../src/workflow.js";
import type { Role } from "../src/auth.js";
const issuer = "https://test.invalid/realm",
  audience = "schoolops-api";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const key = createLocalJWKSet({
  keys: [{ ...(await exportJWK(publicKey)), kid: "test" }],
});
const ids = {
  reporter: "11111111-1111-4111-8111-111111111111",
  coordinator: "22222222-2222-4222-8222-222222222222",
  technician: "33333333-3333-4333-8333-333333333333",
  approver: "44444444-4444-4444-8444-444444444444",
  admin: "55555555-5555-4555-8555-555555555555",
  outsider: "66666666-6666-4666-8666-666666666666",
};
const caseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
async function fixture() {
  let actor = { id: ids.coordinator, role: "coordinator" as Role },
    writes = 0,
    engineCalls = 0;
  const row = {
    id: caseId,
    reporter_id: ids.reporter,
    coordinator_id: ids.coordinator,
    technician_id: ids.technician,
    approver_id: ids.approver,
    team_id: null,
    status: "verification",
    sync_status: "ready",
    revision: 1,
    process_id: "p1",
    task_id: "t1",
    task_key: "verify",
  };
  const query = async (sql: string) => {
    if (sql.startsWith("SELECT * FROM memberships"))
      return {
        rows: [
          {
            subject_id: actor.id,
            username: "test",
            display_name: "Test",
            roles: [actor.role],
            enabled: true,
          },
        ],
        rowCount: 1,
      };
    if (sql.includes("FROM team_members")) return { rows: [], rowCount: 0 };
    if (sql.includes("FROM cases")) return { rows: [row], rowCount: 1 };
    if (/^(INSERT|UPDATE|DELETE)/.test(sql)) writes++;
    return { rows: [], rowCount: 0 };
  };
  const pool = {
    query,
    connect: async () => ({ query, release() {} }),
  } as unknown as pg.Pool;
  const workflow = {
    tasks: async () => {
      engineCalls++;
      return [
        {
          id: "different-task",
          taskDefinitionKey: "repair",
          assignee: ids.technician,
        },
      ];
    },
  } as unknown as Flowable;
  const app = createApp({
    pool,
    workflow,
    issuer,
    audience,
    key,
    technicianId: ids.technician,
    definitionId: () => "def",
    g01DefinitionId: () => "g01-def",
    readiness: async () => ({}),
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function call(id: string, role: Role, path: string, body?: unknown) {
    actor = { id, role };
    const token = await new SignJWT({ preferred_username: "test" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject(id)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(privateKey);
    return fetch(`${base}/api/g01${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  return {
    call,
    writes: () => writes,
    engineCalls: () => engineCalls,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}
test("HTTP case detail and actions reject unrelated people in each otherwise valid role without engine or database mutation", async () => {
  const f = await fixture();
  try {
    for (const role of [
      "reporter",
      "coordinator",
      "technician",
      "approver",
      "admin",
    ] as Role[]) {
      assert.equal(
        (await f.call(ids.outsider, role, `/cases/${caseId}`)).status,
        404,
      );
      assert.equal(
        (
          await f.call(ids.outsider, role, `/cases/${caseId}/actions`, {
            action: "accept",
            revision: 1,
          })
        ).status,
        404,
      );
    }
    assert.equal(
      (
        await f.call(ids.reporter, "reporter", `/cases/${caseId}/actions`, {
          action: "accept",
          revision: 1,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.call(
          ids.coordinator,
          "coordinator",
          `/cases/${caseId}/actions`,
          { action: "approve", revision: 1 },
        )
      ).status,
      403,
    );
    assert.equal(
      (await f.call(ids.coordinator, "admin", `/cases/${caseId}`)).status,
      404,
    );
    assert.equal(f.writes(), 0);
    assert.equal(f.engineCalls(), 0);
  } finally {
    await f.close();
  }
});
test("HTTP case transition checks the actual engine task before recording a command", async () => {
  const f = await fixture();
  try {
    const response = await f.call(
      ids.coordinator,
      "coordinator",
      `/cases/${caseId}/actions`,
      { action: "accept", revision: 1 },
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "ENGINE_CONFLICT");
    assert.equal(f.engineCalls(), 1);
    assert.equal(f.writes(), 0);
  } finally {
    await f.close();
  }
});
