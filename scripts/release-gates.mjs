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
  "boundaries-integration": 6,
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
export const requiredBrowserScenarios = [
  [
    "environment.spec.ts",
    "officer traces PM2.5 raw data and closes shared case with clean evidence on mobile",
  ],
  [
    "foundation.spec.ts",
    "browser → Identity → gateway → API → database → Flowable task → completion",
  ],
  [
    "foundation.spec.ts",
    "seeded coordinator identity has the expected application permissions",
  ],
  [
    "foundation.spec.ts",
    "seeded approver identity has the expected application permissions",
  ],
  [
    "foundation.spec.ts",
    "seeded admin identity has the expected application permissions",
  ],
  [
    "g01.spec.ts",
    "G01 four browser roles complete both return loops with timeline, deadline and immutable refs",
  ],
  [
    "g01.spec.ts",
    "technical admin cannot see G01 content or create cases through the UI",
  ],
  [
    "g01.spec.ts",
    "mobile quota errors retain the form and require an explicit retry with the same creation key",
  ],
  [
    "packs.spec.ts",
    "admin sees active and installed pack revisions and rejected validation errors",
  ],
  [
    "safety.spec.ts",
    "three safety roles complete a restricted case with shared UI, clean evidence, notification and access log",
  ],
  [
    "uiux.spec.ts",
    "Vietnamese sign-in, linked case, mobile back navigation and readable metadata",
  ],
];

function collectBrowserSpecs(browser) {
  const specs = [];
  function collect(suite) {
    specs.push(...(suite.specs || []));
    for (const child of suite.suites || []) collect(child);
  }
  collect(browser);
  return specs;
}

export function browserManifest(browser) {
  assert.ok(!browser.errors?.length, "Browser collection contains errors");
  const cases = collectBrowserSpecs(browser).map((spec) => {
    assert.equal(
      spec.tests.length,
      1,
      "One Chromium execution per scenario is required",
    );
    assert.equal(spec.tests[0].projectName, "chromium");
    assert.ok(typeof spec.file === "string" && typeof spec.title === "string");
    return JSON.stringify([
      spec.file.replaceAll("\\", "/"),
      spec.title,
      "chromium",
    ]);
  });
  assert.ok(cases.length > 0, "Browser scenario manifest is empty");
  assert.equal(
    new Set(cases).size,
    cases.length,
    "Duplicate browser scenario identity",
  );
  return cases.sort();
}

export function assertBrowser(browser, source, version, expectedCases) {
  assertProvenance(browser.config.metadata, source, version);
  assert.ok(
    Array.isArray(expectedCases) && expectedCases.length > 0,
    "Collect browser scenarios from the current source before release",
  );
  assert.equal(new Set(expectedCases).size, expectedCases.length);
  for (const [file, title] of requiredBrowserScenarios)
    assert.ok(
      expectedCases.includes(JSON.stringify([file, title, "chromium"])),
      `Required browser scenario missing from source: ${file}: ${title}`,
    );
  assert.equal(
    browser.stats.expected,
    expectedCases.length,
    "Every current browser scenario must pass",
  );
  assert.ok(
    browser.stats.unexpected === 0 &&
      browser.stats.flaky === 0 &&
      browser.stats.skipped === 0,
    "Browser acceptance must pass without flaky/skipped scenarios",
  );
  assert.deepEqual(
    browserManifest(browser),
    [...expectedCases].sort(),
    "Filtered, renamed or repeated scenarios differ from current source",
  );
  for (const spec of collectBrowserSpecs(browser)) {
    assert.deepEqual(
      spec.tests[0].results.map((r) => r.status),
      ["passed"],
    );
  }
}
