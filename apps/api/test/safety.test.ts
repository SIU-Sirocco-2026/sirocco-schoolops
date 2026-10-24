import { test } from "node:test";
import assert from "node:assert/strict";
import { canReadCase, caseActions } from "../src/g01-policy.js";
import { readPack, validatePack } from "../src/packs.js";
import { fileURLToPath } from "node:url";
import type { Principal } from "../src/auth.js";
const user = (id: string, roles: Principal["roles"]): Principal => ({
  id,
  roles,
  name: id,
  username: id,
});
const row = {
  pack_id: "g03",
  access_ids: ["r", "c", "t", "a"],
  reporter_id: "r",
  coordinator_id: "c",
  technician_id: "t",
  approver_id: "a",
  team_id: null,
  status: "in_progress" as const,
  sync_status: "ready",
};
test("restricted case requires current safety role AND explicit ACL AND case relation; generic roles/admin never grant access", () => {
  assert.equal(canReadCase(user("r", ["safety_reporter"]), row, []), true);
  assert.equal(canReadCase(user("t", ["technician"]), row, []), false);
  assert.equal(canReadCase(user("t", ["admin"]), row, []), false);
  assert.equal(
    canReadCase(user("stranger", ["safety_officer"]), row, []),
    false,
  );
  assert.equal(
    canReadCase(
      user("t", ["safety_officer"]),
      { ...row, access_ids: ["r", "c", "a"] },
      [],
    ),
    false,
  );
  assert.deepEqual(caseActions(user("t", ["safety_officer"]), row, []), [
    "save_work",
    "submit",
  ]);
  assert.deepEqual(
    caseActions(
      user("t", ["safety_officer"]),
      { ...row, status: "acceptance", approver_id: "t" },
      [],
    ),
    [],
  );
});
test("G03 bundle validates restricted adapter/roles without adding executable package code", async () => {
  const pack = await readPack(
    fileURLToPath(new URL("../../../packs/g03/v1", import.meta.url)),
  );
  const result = await validatePack(pack);
  assert.equal(result.valid, true, result.errors.join(";"));
  const bad = structuredClone(pack);
  bad.manifest.roles.coordinator = "coordinator";
  assert.equal((await validatePack(bad)).valid, false);
});
