// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, copyFile, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeOwnedDirectory } from "../ops-lib.mjs";

test("pack CLI gets its token and lists packs at the configured local endpoints", async () => {
  const dir = await mkdtemp(join(tmpdir(), "schoolops-pack-cli-"));
  let identityCalls = 0,
    apiCalls = 0;
  const identity = createServer(async (req, res) => {
    assert.equal(req.url, "/realms/sirocco/protocol/openid-connect/token");
    let body = "";
    for await (const chunk of req) body += chunk;
    const form = new URLSearchParams(body);
    assert.equal(form.get("username"), "admin");
    assert.equal(form.get("password"), "unit-test-password");
    identityCalls++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ access_token: "unit-test-token" }));
  });
  const api = createServer((req, res) => {
    assert.equal(req.url, "/api/packs/");
    assert.equal(req.headers.authorization, "Bearer unit-test-token");
    apiCalls++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ items: [{ packId: "test-pack" }] }));
  });
  try {
    identity.listen(0, "localhost");
    api.listen(0, "localhost");
    await Promise.all([once(identity, "listening"), once(api, "listening")]);
    await mkdir(join(dir, "scripts"));
    for (const file of ["packs.mjs", "local-config.mjs"])
      await copyFile(
        new URL(`../${file}`, import.meta.url),
        join(dir, "scripts", file),
      );
    await writeFile(join(dir, ".env"), "DEMO_PASSWORD=unit-test-password\n");
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["scripts/packs.mjs", "list"],
      {
        cwd: dir,
        timeout: 15000,
        env: {
          ...process.env,
          SIROCCO_TOKEN: "",
          SIROCCO_API: "",
          COMPOSE_PROJECT_NAME: "schoolops-cli-test",
          SIROCCO_WEB_PORT: String(api.address().port),
          SIROCCO_AUTH_PORT: String(identity.address().port),
        },
      },
    );
    assert.deepEqual(JSON.parse(stdout), { items: [{ packId: "test-pack" }] });
    assert.equal(identityCalls, 1);
    assert.equal(apiCalls, 1);
  } finally {
    await Promise.all([
      new Promise((resolve) => identity.close(resolve)),
      new Promise((resolve) => api.close(resolve)),
    ]);
    await removeOwnedDirectory(dir, tmpdir(), "schoolops-pack-cli-");
  }
});
