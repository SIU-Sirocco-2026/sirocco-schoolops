import test from "node:test";
import assert from "node:assert/strict";
import { assertIntegration, assertBrowser } from "../release-gates.mjs";
const source = "a".repeat(40),
  version = "0.1.0-rc.1";
const provenance = {
  sourceSha: source,
  version,
  sourceDirty: false,
  runtimeRevisions: { api: source, worker: source, web: source },
};
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
  const counts = {
    "environment.spec.ts": 1,
    "foundation.spec.ts": 4,
    "g01.spec.ts": 3,
    "packs.spec.ts": 1,
    "safety.spec.ts": 1,
  };
  const report = {
    config: { metadata: provenance },
    stats: { expected: 10, unexpected: 0, flaky: 0, skipped: 0 },
    suites: Object.entries(counts).map(([file, n]) => ({
      specs: Array.from({ length: n }, (_, i) => ({
        file,
        title: `scenario ${i}`,
        tests: [{ projectName: "chromium", results: [{ status: "passed" }] }],
      })),
    })),
  };
  assertBrowser(report, source, version);
  for (const change of [
    (r) => (r.stats.flaky = 1),
    (r) => r.suites.pop(),
    (r) => (r.config.metadata.sourceDirty = true),
    (r) => r.suites[0].specs[0].tests[0].results.push({ status: "passed" }),
  ]) {
    const r = structuredClone(report);
    change(r);
    assert.throws(() => assertBrowser(r, source, version));
  }
});
