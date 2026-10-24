import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from "jose";
import {
  canCreate,
  canComplete,
  verifyAccessToken,
  type Principal,
} from "../src/auth.js";
import { createApp } from "../src/app.js";
import type pg from "pg";
import type { Flowable } from "../src/workflow.js";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

const issuer = "https://identity.schoolops.test/realms/sirocco";
const audience = "schoolops-api";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test" };
const key = createLocalJWKSet({ keys: [jwk] });
const subject = "33333333-3333-4333-8333-333333333333";
async function token(
  overrides: Record<string, unknown> = {},
  signingKey = privateKey,
) {
  return new SignJWT({
    sub: subject,
    preferred_username: "technician",
    iss: issuer,
    aud: audience,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .sign(signingKey);
}
test("accepts an access token with the expected signature, issuer and audience", async () => {
  assert.deepEqual(
    await verifyAccessToken(await token(), { issuer, audience, key }),
    { id: subject, username: "technician" },
  );
});
for (const [name, claims] of [
  ["wrong issuer", { iss: "https://other.test" }],
  ["wrong audience", { aud: "other-api" }],
  ["expired token", { exp: 1 }],
  ["missing identity", { preferred_username: null }],
  ["missing expiry", { exp: undefined }],
] as const)
  test(`rejects ${name}`, async () => {
    const tokenValue = await token(claims);
    await assert.rejects(() =>
      verifyAccessToken(tokenValue, { issuer, audience, key }),
    );
  });

test("rejects a token signed by an unrelated key", async () => {
  const other = await generateKeyPair("RS256");
  const tokenValue = await token({}, other.privateKey);
  await assert.rejects(() =>
    verifyAccessToken(tokenValue, { issuer, audience, key }),
  );
});
test("only the assigned technician can complete a task; technical admin has no implicit task access", () => {
  const user: Principal = {
    id: subject,
    username: "technician",
    name: "Demo",
    roles: ["technician"],
  };
  assert.equal(canComplete(user, subject), true);
  assert.equal(canComplete(user, "another-user"), false);
  assert.equal(canComplete({ ...user, roles: ["admin"] }, subject), false);
  assert.equal(canCreate(user), false);
  assert.equal(canCreate({ ...user, roles: ["reporter"] }), true);
});

test("HTTP API rejects absent/malformed auth, respects membership revocation and gates task creation", async () => {
  let enabled = true;
  const fakePool = {
    query: async () => ({
      rows: [
        {
          subject_id: subject,
          username: "technician",
          display_name: "Demo",
          roles: ["technician"],
          enabled,
        },
      ],
      rowCount: 1,
    }),
  } as unknown as pg.Pool;
  const app = createApp({
    pool: fakePool,
    workflow: {} as Flowable,
    issuer,
    audience,
    key,
    technicianId: subject,
    definitionId: () => undefined,
    readiness: async () => ({}),
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${base}/api/health/live`)).status, 200);
    assert.equal((await fetch(`${base}/api/me`)).status, 401);
    assert.equal(
      (
        await fetch(`${base}/api/me`, {
          headers: { Authorization: "Bearer invalid" },
        })
      ).status,
      401,
    );
    const accessToken = await token();
    const headers = { Authorization: `Bearer ${accessToken}` };
    assert.equal((await fetch(`${base}/api/me`, { headers })).status, 200);
    assert.equal(
      (await fetch(`${base}/api/foundation/tasks`, { method: "POST", headers }))
        .status,
      403,
    );
    enabled = false;
    assert.equal((await fetch(`${base}/api/me`, { headers })).status, 403);
  } finally {
    server.close();
    await once(server, "close");
  }
});
