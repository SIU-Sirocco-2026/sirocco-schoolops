// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import assert from "node:assert/strict";
export const integrationCounts = {
  integration: 8,
  "g01-integration": 9,
  "phase3-integration": 17,
  "phase4-integration": 7,
  "phase5-integration": 9,
  "phase6-integration": 8,
  "phase7-integration": 9,
};
export function assertProvenance(report, source, version) {
  assert.equal(report?.sourceSha, source, "Stale source evidence");
  assert.equal(report.version, version);
  assert.equal(report.sourceDirty, false);
  assert.ok(
    Object.values(report.runtimeRevisions).length === 3 &&
      Object.values(report.runtimeRevisions).every((s) => s === source),
    "Runtime/source mismatch",
  );
}
export function assertDependencyAudit(report, source, lockfileSha256) {
  assert.equal(report?.sourceSha, source, "Stale dependency audit source");
  assert.equal(
    report.sourceDirty,
    false,
    "Dependency audit used a dirty source",
  );
  assert.equal(
    report.lockfileSha256,
    lockfileSha256,
    "Dependency audit lockfile differs",
  );
  assert.equal(report.failAt, "moderate");
  assert.match(
    report.scope,
    /^pnpm audit --prod(?:;|$)/,
    "Production audit scope required",
  );
  assert.ok(
    Number.isFinite(Date.parse(report.checkedAt)),
    "Audit timestamp missing",
  );
  const counts = report.audit?.metadata?.vulnerabilities;
  assert.ok(!report.audit?.error && counts, "Dependency audit incomplete");
  for (const key of ["info", "low", "moderate", "high", "critical"])
    assert.ok(
      Number.isInteger(counts[key]) && counts[key] >= 0,
      `Missing audit count: ${key}`,
    );
  assert.equal(
    counts.moderate + counts.high + counts.critical,
    0,
    "Production dependency advisories require review/fix",
  );
  return {
    sourceSha: source,
    lockfileSha256,
    checkedAt: report.checkedAt,
    scope: report.scope,
    vulnerabilities: counts,
    failAt: report.failAt,
  };
}
export function assertIntegration(report, name, source, version) {
  assertProvenance(report, source, version);
  assert.equal(
    report.results.length,
    integrationCounts[name],
    `Incomplete acceptance: ${name}`,
  );
  assert.equal(
    new Set(report.results.map((r) => r.name)).size,
    report.results.length,
    "Duplicate acceptance groups",
  );
  assert.ok(
    report.results.every((r) => r.status === "pass"),
    `Failed acceptance: ${name}`,
  );
}
export function assertBrowser(browser, source, version) {
  assertProvenance(browser.config.metadata, source, version);
  assert.equal(
    browser.stats.expected,
    10,
    "All ten browser scenarios are required",
  );
  assert.ok(
    browser.stats.unexpected === 0 &&
      browser.stats.flaky === 0 &&
      browser.stats.skipped === 0,
    "Browser acceptance must pass without flaky/skipped scenarios",
  );
  const specs = [];
  function collect(suite) {
    specs.push(...(suite.specs || []));
    for (const child of suite.suites || []) collect(child);
  }
  collect(browser);
  assert.equal(
    specs.length,
    10,
    "A filtered/repeated subset is not complete browser acceptance",
  );
  assert.equal(new Set(specs.map((s) => `${s.file}:${s.title}`)).size, 10);
  const counts = {};
  for (const spec of specs) {
    const file = spec.file.split(/[\\/]/).at(-1);
    counts[file] = (counts[file] || 0) + 1;
    assert.equal(spec.tests.length, 1);
    assert.equal(spec.tests[0].projectName, "chromium");
    assert.deepEqual(
      spec.tests[0].results.map((r) => r.status),
      ["passed"],
    );
  }
  assert.deepEqual(counts, {
    "environment.spec.ts": 1,
    "foundation.spec.ts": 4,
    "g01.spec.ts": 3,
    "packs.spec.ts": 1,
    "safety.spec.ts": 1,
  });
}
