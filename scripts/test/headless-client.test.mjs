// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, copyFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient, ClientError } from "../../examples/headless-client/client.mjs";
import { removeOwnedDirectory } from "../ops-lib.mjs";
const key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("headless client rejects insecure or credential-bearing destinations without dispatching", () => {
  for (const apiUrl of ["http://public.example/api", "https://user:password@example.test/api", "https://example.test/api?token=secret", "https://example.test/api#token", "file:///api", "https://example.test/other", "not a URL"]) {
    assert.throws(() => createClient({ apiUrl, token: "unit-test-token" }), ClientError);
  }
  assert.throws(() => createClient({ apiUrl: "http://localhost:8098/api", token: "" }), ClientError);
});

test("headless mutations preserve explicit keys and never replay lost, truncated, gateway or redirect replies", async () => {
  for (const reply of [
    () => { throw new Error("unit-test-token must not leak"); },
    () => new Response('{"item":', { status: 201, headers: { "Content-Type": "application/json" } }),
    () => new Response("gateway private internals", { status: 502 }),
    () => new Response(null, { status: 307, headers: { Location: "https://another.test/api" } }),
  ]) {
    let calls = 0;
    const client = createClient({ apiUrl: "http://localhost:8098/api", token: "unit-test-token", transport: async (url, init) => {
      calls++;
      assert.equal(url, "http://localhost:8098/api/foundation/tasks");
      assert.equal(init.redirect, "manual");
      assert.equal(init.headers["Idempotency-Key"], key);
      assert.deepEqual(JSON.parse(init.body), { title: "Dữ liệu giả lập" });
      return reply();
    } });
    await assert.rejects(client.create(key, "Dữ liệu giả lập"), error => error instanceof ClientError && error.needsCheck && !/unit-test-token|private internals/.test(error.message));
    assert.equal(calls, 1);
  }
});

test("headless client keeps denial codes and validates mutation inputs before sending", async () => {
  let calls = 0;
  const client = createClient({ apiUrl: "https://api.example.test/api/", token: "unit-test-token", transport: async () => {
    calls++;
    return Response.json({ error: { code: "FORBIDDEN", message: "internal unit-test-token" } }, { status: 403 });
  } });
  assert.throws(() => client.create("bad", "Valid title"));
  assert.throws(() => client.create(key, "bad"));
  assert.equal(calls, 0);
  await assert.rejects(client.complete(key), error => error.status === 403 && error.code === "FORBIDDEN" && !error.needsCheck && !error.message.includes("unit-test-token"));
  assert.equal(calls, 1);
});

test("the copied CLI runs outside the application tree with no dependencies and a path containing spaces", async () => {
  const dir = await mkdtemp(join(tmpdir(), "schoolops headless unit-"));
  let calls = 0;
  const server = createServer((req, res) => {
    calls++;
    assert.equal(req.url, "/api/me");
    assert.equal(req.headers.authorization, "Bearer unit-test-token");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ user: { id: key, roles: ["reporter"] } }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await copyFile(new URL("../../examples/headless-client/client.mjs", import.meta.url), join(dir, "client.mjs"));
    assert.deepEqual(await readdir(dir), ["client.mjs"]);
    const { stdout, stderr } = await promisify(execFile)(process.execPath, ["client.mjs", "identity"], {
      cwd: dir, timeout: 15000, env: { ...process.env, SIROCCO_API_URL: `http://127.0.0.1:${server.address().port}/api`, SIROCCO_ACCESS_TOKEN: "unit-test-token" },
    });
    assert.equal(stderr, "");
    assert.equal(JSON.parse(stdout).data.user.id, key);
    assert.equal(stdout.includes("unit-test-token"), false);
    assert.equal(calls, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await removeOwnedDirectory(dir, tmpdir(), "schoolops headless unit-");
  }
});
