// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Principal, Role } from "../src/auth.js";
import {
  caseActions,
  canReadCase,
  type CaseAccess,
} from "../src/g01-policy.js";
const user = (id: string, role: Role): Principal => ({
  id,
  roles: [role],
  username: id,
  name: id,
});
const base: CaseAccess = {
  reporter_id: "reporter",
  coordinator_id: "coordinator",
  technician_id: "tech",
  approver_id: "approver",
  team_id: null,
  status: "verification",
  sync_status: "ready",
};
test("G01 actions require the current role, responsible person and exact step", () => {
  const matrix = [
    ["verification", "coordinator", "coordinator", ["accept", "return_info"]],
    ["supplement", "reporter", "reporter", ["resubmit"]],
    ["assignment", "coordinator", "coordinator", ["assign"]],
    ["assigned", "tech", "technician", ["receive"]],
    ["in_progress", "tech", "technician", ["save_work", "submit"]],
    ["acceptance", "approver", "approver", ["approve", "return_work"]],
  ] as const;
  for (const [status, id, role, actions] of matrix) {
    const row = { ...base, status };
    assert.deepEqual(caseActions(user(id, role), row, []), actions);
    assert.deepEqual(caseActions(user("unrelated", role), row, []), []);
    assert.deepEqual(caseActions(user(id, "admin"), row, []), []);
    assert.deepEqual(
      caseActions(user(id, role), { ...row, sync_status: "pending" }, []),
      [],
    );
    assert.deepEqual(
      caseActions(
        user(id, role),
        { ...row, sync_status: "needs_reconciliation" },
        [],
      ),
      [],
    );
  }
});
test("being in the same role or a technical admin never grants case read access", () => {
  for (const role of [
    "reporter",
    "coordinator",
    "technician",
    "approver",
    "admin",
  ] as const)
    assert.equal(canReadCase(user("outsider", role), base, []), false);
  assert.equal(canReadCase(user("reporter", "reporter"), base, []), true);
  assert.equal(canReadCase(user("tech", "admin"), base, []), false);
});
test("team tasks are visible and claimable only by current technician candidates until claimed", () => {
  const row = {
    ...base,
    status: "assigned" as const,
    technician_id: null,
    team_id: "facilities",
  };
  assert.deepEqual(
    caseActions(user("candidate", "technician"), row, ["facilities"]),
    ["receive"],
  );
  assert.equal(canReadCase(user("candidate", "technician"), row, []), false);
  assert.equal(
    canReadCase(user("candidate", "reporter"), row, ["facilities"]),
    false,
  );
  assert.deepEqual(
    caseActions(user("approver", "technician"), row, ["facilities"]),
    [],
  );
  assert.equal(
    canReadCase(
      user("other", "technician"),
      { ...row, status: "in_progress", technician_id: "candidate" },
      ["facilities"],
    ),
    false,
  );
});
test("the repairer cannot approve even when explicitly given both roles; closed cases have no actions", () => {
  const multi = {
    ...user("tech", "technician"),
    roles: ["technician", "approver"] as Role[],
  };
  assert.deepEqual(
    caseActions(
      multi,
      { ...base, status: "acceptance", approver_id: "tech" },
      [],
    ),
    [],
  );
  assert.deepEqual(
    caseActions(
      user("approver", "approver"),
      { ...base, status: "closed" },
      [],
    ),
    [],
  );
});
