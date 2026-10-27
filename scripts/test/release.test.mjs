// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertIntegration,
  assertBrowser,
  assertDependencyAudit,
  browserManifest,
  requiredBrowserScenarios,
} from "../release-gates.mjs";
const source = "a".repeat(40),
  version = "0.1.0-rc.1";
const provenance = {
  sourceSha: source,
  version,
  sourceDirty: false,
  runtimeRevisions: { api: source, worker: source, web: source },
};
const dependencyAudit = {
  sourceSha: source,
  sourceDirty: false,
  lockfileSha256: "f".repeat(64),
  checkedAt: "2026-10-25T00:00:00Z",
  scope: "pnpm audit --prod",
  failAt: "moderate",
  audit: {
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
    },
  },
};
test("release requires dependency evidence for the exact clean source and lockfile", () => {
  const clean = assertDependencyAudit(dependencyAudit, source, "f".repeat(64));
  assert.equal(clean.vulnerabilities.high, 0);
  for (const change of [
    (r) => (r.sourceSha = "b".repeat(40)),
    (r) => (r.sourceDirty = true),
    (r) => (r.lockfileSha256 = "e".repeat(64)),
    (r) => delete r.checkedAt,
  ]) {
    const report = structuredClone(dependencyAudit);
    change(report);
    assert.throws(() => assertDependencyAudit(report, source, "f".repeat(64)));
  }
});
test("release rejects vulnerable or incomplete dependency audit evidence", () => {
  for (const change of [
    (r) => (r.audit.metadata.vulnerabilities.moderate = 1),
    (r) => (r.audit.metadata.vulnerabilities.high = 1),
    (r) => (r.audit.error = "registry unavailable"),
    (r) => delete r.audit.metadata.vulnerabilities.critical,
    (r) => (r.failAt = "critical"),
    (r) => (r.scope = "unrelated audit"),
  ]) {
    const report = structuredClone(dependencyAudit);
    change(report);
    assert.throws(() => assertDependencyAudit(report, source, "f".repeat(64)));
  }
});
test("release rejects interrupted, failed, duplicate or stale integration evidence", () => {
  const complete = {
    ...provenance,
    results: Array.from({ length: 9 }, (_, i) => ({
      name: `restore ${i}`,
      status: "pass",
    })),
  };
  assertIntegration(complete, "phase7-integration", source, version);
  for (const change of [
    (r) => r.results.pop(),
    (r) => (r.results[0].status = "fail"),
    (r) => (r.results[1].name = r.results[0].name),
    (r) => (r.sourceSha = "b".repeat(40)),
    (r) => (r.runtimeRevisions.worker = "unknown"),
  ]) {
    const r = structuredClone(complete);
    change(r);
    assert.throws(() =>
      assertIntegration(r, "phase7-integration", source, version),
    );
  }
});
test("release reads actual Playwright config metadata and rejects filtered, flaky or repeated scenarios", () => {
  const report = {
    config: { metadata: provenance },
    stats: {
      expected: requiredBrowserScenarios.length,
      unexpected: 0,
      flaky: 0,
      skipped: 0,
    },
    suites: [
      {
        specs: requiredBrowserScenarios.map(([file, title]) => ({
          file,
          title,
          tests: [{ projectName: "chromium", results: [{ status: "passed" }] }],
        })),
      },
    ],
  };
  const expected = browserManifest(report);
  assertBrowser(report, source, version, expected);
  for (const change of [
    (r) => (r.stats.flaky = 1),
    (r) => r.suites[0].specs.pop(),
    (r) => (r.config.metadata.sourceDirty = true),
    (r) => (r.config.metadata.runtimeRevisions.worker = "other-source"),
    (r) => (r.stats.skipped = 1),
    (r) => (r.stats.unexpected = 1),
    (r) => (r.suites[0].specs[0].title = "different scenario, same file/count"),
    (r) => (r.suites[0].specs[1] = r.suites[0].specs[0]),
    (r) => r.suites[0].specs[0].tests[0].results.push({ status: "passed" }),
    (r) => (r.suites[0].specs[0].tests[0].results[0].status = "failed"),
  ]) {
    const r = structuredClone(report);
    change(r);
    assert.throws(() => assertBrowser(r, source, version, expected));
  }
  const expanded = structuredClone(report);
  expanded.suites[0].specs.push({
    file: "new-feature.spec.ts",
    title: "additional acceptance",
    tests: [{ projectName: "chromium", results: [{ status: "passed" }] }],
  });
  expanded.stats.expected++;
  const currentSource = browserManifest(expanded);
  assertBrowser(expanded, source, version, currentSource);
  assert.throws(() => assertBrowser(report, source, version, currentSource));
  const missingRequiredSource = structuredClone(report);
  missingRequiredSource.suites[0].specs.pop();
  missingRequiredSource.stats.expected--;
  assert.throws(() =>
    assertBrowser(
      missingRequiredSource,
      source,
      version,
      browserManifest(missingRequiredSource),
    ),
  );
});
