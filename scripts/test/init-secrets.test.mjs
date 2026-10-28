// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { root, removeOwnedDirectory } from "../ops-lib.mjs";
import { assertLocalStartup, localSecretNames } from "../local-secrets.mjs";

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), "schoolops-init secret-"));
  try {
    await mkdir(join(dir, "scripts"));
    for (const name of ["init.mjs", "local-config.mjs", "realm-ui.mjs", "local-secrets.mjs"])
      if (existsSync(join(root, "scripts", name))) await copyFile(join(root, "scripts", name), join(dir, "scripts", name));
    const env = { ...process.env };
    for (const name of ["SIROCCO_WEB_PORT", "SIROCCO_AUTH_PORT", "COMPOSE_PROJECT_NAME"]) delete env[name];
    const init = () => spawnSync(process.execPath, [join(dir, "scripts/init.mjs")], { cwd: dir, env, encoding: "utf8" });
    await run(dir, init);
  } finally {
    await removeOwnedDirectory(dir, tmpdir(), "schoolops-init secret-");
  }
}
const digest = data => createHash("sha256").update(data).digest("hex");
async function fingerprints(dir) {
  return Promise.all([".env", "infra/generated/realm.json", "infra/generated/s3.json"].map(async p => digest(await readFile(join(dir, p)))));
}

test("fresh init creates credentials and repeating it preserves every generated config", async () => {
  await fixture(async (dir, init) => {
    await assert.rejects(assertLocalStartup(dir, {}), /pnpm demo:init/);
    await writeFile(join(dir, ".env"), "COMPOSE_PROJECT_NAME=schoolops-init-check\nSIROCCO_WEB_PORT=8098\nSIROCCO_AUTH_PORT=8190\n");
    const first = init();
    assert.equal(first.status, 0, first.stderr);
    const before = await fingerprints(dir);
    const second = init();
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(await fingerprints(dir), before);
    const text = await readFile(join(dir, ".env"), "utf8");
    const secret = text.match(/^APP_DB_PASSWORD=(.+)$/m)[1];
    assert.ok(![first, second].some(r => (r.stdout + r.stderr).includes(secret)));
  });
});

test("a missing or empty secret after initialization fails before overwriting any config", async () => {
  for (const replacement of ["", "APP_DB_PASSWORD=", "APP_DB_PASSWORD=   "]) await fixture(async (dir, init) => {
    assert.equal(init().status, 0);
    const old = await readFile(join(dir, ".env"), "utf8");
    const marker = old.match(/^S3_SECRET_KEY=(.+)$/m)[1];
    await writeFile(join(dir, ".env"), old.replace(/^APP_DB_PASSWORD=.*$/m, replacement));
    const before = await fingerprints(dir);
    const result = init();
    assert.notEqual(result.status, 0, "must refuse to silently rotate a missing credential");
    assert.match(result.stderr, /APP_DB_PASSWORD/);
    assert.ok(!(result.stdout + result.stderr).includes(marker));
    assert.deepEqual(await fingerprints(dir), before);
  });
});

test("a lost env with generated config is not replaced with fresh credentials", async () => {
  await fixture(async (dir, init) => {
    assert.equal(init().status, 0);
    const before = (await fingerprints(dir)).slice(1);
    await unlink(join(dir, ".env"));
    const result = init();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /khôi phục .env gốc/);
    assert.equal(existsSync(join(dir, ".env")), false);
    assert.deepEqual(await Promise.all(["realm.json", "s3.json"].map(async name => digest(await readFile(join(dir, "infra/generated", name))))), before);
  });
});

test("startup rejects missing or mismatched generated config without echoing credential contents", async () => {
  await fixture(async (dir, init) => {
    assert.equal(init().status, 0);
    await assertLocalStartup(dir, {});
    const text = await readFile(join(dir, ".env"), "utf8");
    const marker = text.match(/^S3_SECRET_KEY=(.+)$/m)[1];
    const before = await fingerprints(dir);
    for (const name of localSecretNames) await assert.rejects(assertLocalStartup(dir, { [name]: "" }), error => {
      assert.match(error.message, new RegExp(name));
      assert.ok(!error.message.includes(marker));
      return true;
    });
    for (const name of ["DEMO_PASSWORD", "S3_ACCESS_KEY", "S3_SECRET_KEY"]) await assert.rejects(assertLocalStartup(dir, { [name]: "synthetic-mismatch-do-not-log" }), error => {
      assert.match(error.message, new RegExp(name));
      assert.ok(!error.message.includes("synthetic-mismatch-do-not-log"));
      return true;
    });
    assert.deepEqual(await fingerprints(dir), before);
    await writeFile(join(dir, "infra/generated/s3.json"), "invalid-json-secret-marker");
    await assert.rejects(assertLocalStartup(dir, {}), error => {
      assert.match(error.message, /s3.json/);
      assert.ok(!error.message.includes("invalid-json-secret-marker"));
      return true;
    });
  });
});

test("the startup entry point checks local credentials before calling the Docker adapter", async () => {
  await fixture(async (dir, init) => {
    assert.equal(init().status, 0);
    await copyFile(join(root, "scripts/up.mjs"), join(dir, "scripts/up.mjs"));
    // Stub only the Docker/process adapter; execute the actual startup entry and validator.
    await writeFile(join(dir, "scripts/ops-lib.mjs"), `import {writeFileSync} from "node:fs"; export const root=${JSON.stringify(dir)}; export function ensureDocker(){writeFileSync(root+"/docker-was-called", "unexpected");throw new Error("Docker adapter must not be called");} export function compose(){} export function sourceRevision(){} export function run(){}`);
    const old = await readFile(join(dir, ".env"), "utf8");
    await writeFile(join(dir, ".env"), old.replace(/^APP_DB_PASSWORD=.*$/m, "APP_DB_PASSWORD="));
    const before = await fingerprints(dir);
    const env = { ...process.env };
    for (const name of [...localSecretNames, "SIROCCO_WEB_PORT", "SIROCCO_AUTH_PORT", "COMPOSE_PROJECT_NAME"]) delete env[name];
    const result = spawnSync(process.execPath, [join(dir, "scripts/up.mjs")], { cwd: dir, env, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /APP_DB_PASSWORD/);
    assert.equal(existsSync(join(dir, "docker-was-called")), false);
    assert.deepEqual(await fingerprints(dir), before);
  });
});
