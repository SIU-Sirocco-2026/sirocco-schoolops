// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test } from "node:test";
import assert from "node:assert/strict";
import { qualityCheck } from "../src/environment.js";
import { readPack, validatePack } from "../src/packs.js";
import { fileURLToPath } from "node:url";
const sample = {
  eventId: "sample",
  stationId: "A101-PM25",
  observedAt: "2020-01-01T00:01:00Z",
  quantity: "pm25",
  value: 0.04,
  unit: "mg/m3",
  label: "replayed",
};
test("PM2.5 quality normalizes explicit units, rejects missing/invalid values, labels, stations, dates and excludes out-of-order data", () => {
  const normal = qualityCheck(sample, "A101-PM25", null);
  assert.equal(normal.quality, "valid");
  assert.equal(normal.value, 40);
  assert.equal(
    qualityCheck(sample, "A101-PM25", "2020-01-01T00:02:00Z").quality,
    "late",
  );
  for (const change of [
    { unit: "ppm" },
    { value: -1 },
    { value: 99999 },
    { value: "35" },
    { stationId: "unknown" },
    { label: "measured" },
    { observedAt: "invalid" },
    { quantity: "AQI" },
  ])
    assert.equal(
      qualityCheck({ ...sample, ...change }, "A101-PM25", null).quality,
      "invalid",
    );
});
test("G02 complete package validates the shared platform adapter and versioned illustrative rule", async () => {
  const pack = await readPack(
    fileURLToPath(new URL("../../../packs/g02/v1", import.meta.url)),
  );
  const checked = await validatePack(pack);
  assert.equal(checked.valid, true, checked.errors.join(";"));
  const bad = structuredClone(pack);
  bad.manifest.rule!.openConsecutive = 0;
  assert.equal((await validatePack(bad)).valid, false);
});
