// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { root, run, sourceRevision } from "./ops-lib.mjs";
import { sha256 } from "./backup-crypto.mjs";
import {
  integrationCounts,
  assertIntegration,
  assertBrowser,
  assertDependencyAudit,
  browserManifest,
} from "./release-gates.mjs";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const source = sourceRevision();
assert.equal(
  run("git", ["status", "--porcelain"]).trim(),
  "",
  "Commit all source changes before preparing a release",
);
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/);
const summary = [];
for (const name of Object.keys(integrationCounts)) {
  const report = JSON.parse(
    await readFile(join(root, `test-results/${name}.json`), "utf8"),
  );
  assertIntegration(report, name, source, pkg.version);
  summary.push({
    name,
    testedAt: report.testedAt,
    checks: report.results.map((r) => ({ name: r.name, status: r.status })),
  });
}
const audit = JSON.parse(
  await readFile(join(root, "test-results/source-audit.json"), "utf8"),
);
assert.equal(audit.sourceSha, source);
assert.equal(audit.version, pkg.version);
const restored = JSON.parse(
  await readFile(join(root, "test-results/restore-report.json"), "utf8"),
);
assert.equal(restored.source, source);
assert.equal(restored.databaseFingerprintsMatch, true);
assert.equal(restored.fileChecksumsMatch, true);
assert.equal(restored.applicationReady, true);
const browser = JSON.parse(
  await readFile(join(root, "test-results/browser-results.json"), "utf8"),
);
// Ask Playwright to collect the current source without running fixtures/actions.
// Clear reporter environment overrides so listing cannot overwrite acceptance evidence.
const collectedBrowser = JSON.parse(
  run(
    process.execPath,
    [
      join(root, "node_modules/@playwright/test/cli.js"),
      "test",
      "--list",
      "--reporter=json",
    ],
    {
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: "",
        PLAYWRIGHT_JSON_OUTPUT_NAME: "",
        PLAYWRIGHT_JSON_OUTPUT_DIR: "",
      },
    },
  ),
);
assertBrowser(browser, source, pkg.version, browserManifest(collectedBrowser));
const legalDir = join(root, "test-results/legal");
const legal = JSON.parse(
  await readFile(join(legalDir, "dependency-inventory.json"), "utf8"),
);
assert.equal(legal.source, source);
assert.ok(legal.components.length > 0);
assert.equal(
  legal.lockfileSha256,
  hash(await readFile(join(root, "pnpm-lock.yaml"))),
);
const dependencyAudit = assertDependencyAudit(
  JSON.parse(
    await readFile(join(root, "test-results/dependency-audit.json"), "utf8"),
  ),
  source,
  legal.lockfileSha256,
);
const output = resolve(
  root,
  process.argv[2] || `test-results/release/${pkg.version}`,
);
try {
  const files = await readdir(output);
  assert.equal(
    files.length,
    0,
    "Release output must be empty; preserve previous candidates",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await mkdir(output, { recursive: true });
const prefix = `sirocco-schoolops-${pkg.version}/`;
const archiveArgs = [
  "archive",
  "--format=tar",
  `--prefix=${prefix}`,
  `--add-virtual-file=${prefix}SOURCE-REVISION:${source}\n`,
  source,
];
const tar = run("git", archiveArgs, { binary: true });
// Rebuild from the same commit to prove deterministic source bytes, including metadata.
assert.equal(
  hash(tar),
  hash(run("git", archiveArgs, { binary: true })),
  "Source archive was not reproducible",
);
const sourceName = `sirocco-schoolops-${pkg.version}-source.tar.gz`;
const archive = gzipSync(tar, { level: 9 });
assert.equal(hash(archive), hash(gzipSync(tar, { level: 9 })));
await writeFile(join(output, sourceName), archive);
const members = run("tar", ["-tzf", join(output, sourceName)])
  .trim()
  .split(/\r?\n/);
assert.ok(members.includes(prefix + "SOURCE-REVISION"));
assert.ok(
  members.every(
    (name) =>
      name.startsWith(prefix) &&
      !/(^|\/)(\.git|\.env|node_modules|\.local|generated|test-results|playwright-report)(\/|$)/.test(
        name,
      ),
  ),
  "Private/unexpected archive member",
);
for (const file of [
  "dependency-inventory.json",
  "sbom.cdx.json",
  "THIRD_PARTY_NOTICES.txt",
])
  await writeFile(join(output, file), await readFile(join(legalDir, file)));
const acceptance = {
  sourceSha: source,
  version: pkg.version,
  automatedChecks: "passed",
  userAcceptance:
    "pending actual role feedback; see docs/verification/role-feedback.md",
  integration: summary,
  browser: { passed: browser.stats.expected, flaky: 0, failed: 0, skipped: 0 },
  restore: restored,
  sourceAudit: audit,
  dependencyAudit,
};
await writeFile(
  join(output, "acceptance-evidence.json"),
  JSON.stringify(acceptance, null, 2) + "\n",
);
const notes =
  (await readFile(join(root, `docs/releases/${pkg.version}.md`), "utf8")) +
  `\n\nSource SHA: ${source}\n\nBằng chứng tự động: ${summary.reduce((n, r) => n + r.checks.length, 0)} nhóm tích hợp; ${browser.stats.expected} bài browser đạt, không flaky. Phản hồi người dùng thật và review/merge vẫn chờ; bản này là release candidate.\n`;
await writeFile(join(output, "RELEASE_NOTES.md"), notes);
const files = await readdir(output);
const assets = [];
for (const name of files.sort())
  assets.push({
    name,
    bytes: (await stat(join(output, name))).size,
    sha256: await sha256(join(output, name)),
  });
const manifest = {
  schemaVersion: 1,
  name: pkg.name,
  version: pkg.version,
  tag: `v${pkg.version}`,
  sourceSha: source,
  sourceCommitTime: run("git", ["show", "-s", "--format=%cI", source]).trim(),
  license: pkg.license,
  releaseType: "candidate",
  userAcceptance: "pending",
  toolchain: {
    node: process.version,
    pnpm: pkg.packageManager,
    images: JSON.parse(
      await readFile(join(root, "infra/images.lock.json"), "utf8"),
    ),
  },
  assets,
};
await writeFile(
  join(output, "release-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
const names = (await readdir(output)).sort();
const sums = [];
for (const name of names)
  sums.push(`${await sha256(join(output, name))}  ${name}`);
await writeFile(join(output, "SHA256SUMS"), sums.join("\n") + "\n");
console.log(
  `Release candidate prepared: ${output}; ${names.length + 1} public assets, source ${source}. No backup, secret or browser trace included.`,
);
