// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import assert from "node:assert/strict";
import { mkdtemp, copyFile, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { client, recorder } from "./test-client.mjs";
import { local } from "./local-config.mjs";
import { removeOwnedDirectory } from "./ops-lib.mjs";
import { waitForGatewayBudget } from "./gateway-budget.mjs";

const budget = await waitForGatewayBudget(local.webOrigin);
if (budget.waitedMs) console.log(`Gateway quota low; waited ${budget.waitedMs}ms before starting the client probe.`);
const c = await client();
const { check } = await recorder("headless-client-integration");
const dir = await mkdtemp(join(tmpdir(), "schoolops headless integration-"));
const source = new URL("../examples/headless-client/client.mjs", import.meta.url);
const destination = join(dir, "client.mjs");
const key = randomUUID();
const title = `Nhiệm vụ client HTTP độc lập giả lập ${Date.now()}`;
let task;
async function invoke(user, args, expectedExit = 0) {
  const token = c.tokens[user] || await c.login(user);
  let result;
  try {
    result = await promisify(execFile)(process.execPath, ["client.mjs", ...args], {
      cwd: dir, timeout: 15000, windowsHide: true,
      env: { ...process.env, SIROCCO_API_URL: `${local.webOrigin}/api`, SIROCCO_ACCESS_TOKEN: token },
    });
    result.exitCode = 0;
  } catch (error) {
    if (typeof error.code !== "number" || !error.stdout) throw new Error("Could not execute the copied headless client");
    result = { stdout: error.stdout, stderr: error.stderr, exitCode: error.code };
  }
  assert.equal(result.stderr, "", "Client must not print stack traces or credentials");
  assert.equal(result.stdout.includes(token), false, "Client must not print its access token");
  const output = JSON.parse(result.stdout);
  const status = Number.isInteger(output.status) ? output.status : "unavailable";
  const code = typeof output.code === "string" && /^[A-Z0-9_]{1,80}$/.test(output.code) ? output.code : "unavailable";
  assert.equal(result.exitCode, expectedExit, `Unexpected client exit status (HTTP ${status}, code ${code})`);
  return output;
}
try {
  await check("a single copied client outside Git and node_modules reads real Identity through the gateway", async () => {
    await copyFile(source, destination);
    assert.deepEqual(await readdir(dir), ["client.mjs"]);
    const hash = data => createHash("sha256").update(data).digest("hex");
    assert.equal(hash(await readFile(source)), hash(await readFile(destination)));
    const identity = await invoke("reporter", ["identity"]);
    assert.equal(identity.status, 200);
    assert.ok(identity.data.user.roles.includes("reporter"));
    assert.equal(identity.data.user.id, "11111111-1111-4111-8111-111111111111");
  });
  await check("reporter creates and explicitly replays the same key with one task and process while conflicting content is rejected", async () => {
    const created = await invoke("reporter", ["create", key, title]);
    assert.equal(created.status, 201);
    task = created.data.item;
    assert.equal(task.status, "waiting");
    assert.ok(task.processId && task.definitionId);
    const replay = await invoke("reporter", ["create", key, title]);
    assert.equal(replay.status, 200);
    assert.equal(replay.data.item.id, task.id);
    assert.equal(replay.data.item.processId, task.processId);
    const list = await invoke("reporter", ["list"]);
    assert.equal(list.data.items.filter(item => item.id === task.id).length, 1);
    const conflict = await invoke("reporter", ["create", key, title + " đổi nội dung"], 1);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.code, "IDEMPOTENCY_CONFLICT");
  });
  await check("tokens do not grant the wrong role completion or implicit technical-admin creation and task discovery", async () => {
    const denied = await invoke("reporter", ["complete", task.id], 1);
    assert.equal(denied.status, 403);
    const adminCreate = await invoke("admin", ["create", randomUUID(), title], 1);
    assert.equal(adminCreate.status, 403);
    const adminList = await invoke("admin", ["list"]);
    assert.ok(!adminList.data.items.some(item => item.id === task.id));
    const adminComplete = await invoke("admin", ["complete", task.id], 1);
    assert.equal(adminComplete.status, 404);
  });
  await check("the assigned technician completes the real workflow and repeated completion retains the same finished task", async () => {
    const list = await invoke("technician", ["list"]);
    assert.equal(list.data.items.find(item => item.id === task.id).canComplete, true);
    const finished = await invoke("technician", ["complete", task.id]);
    assert.equal(finished.status, 200);
    assert.equal(finished.data.item.status, "completed");
    assert.equal(finished.data.item.processId, task.processId);
    const replay = await invoke("technician", ["complete", task.id]);
    assert.equal(replay.data.item.completedAt, finished.data.item.completedAt);
    const reporterView = await invoke("reporter", ["list"]);
    assert.equal(reporterView.data.items.find(item => item.id === task.id).status, "completed");
    assert.deepEqual(await readdir(dir), ["client.mjs"]);
  });
} finally {
  await removeOwnedDirectory(dir, tmpdir(), "schoolops headless integration-");
}
console.log("Headless client probe passed through real gateway/Identity/workflow from an isolated one-file copy. This is a foundation adapter example, not a generic application platform.");
