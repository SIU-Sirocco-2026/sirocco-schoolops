// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import assert from "node:assert/strict";
import { client, recorder, png } from "./test-client.mjs";
import { compose } from "./ops-lib.mjs";

if (!process.argv.includes("--isolated-demo"))
  throw new Error(
    "Bộ kiểm tạm thay quyền tài khoản demo. Chỉ chạy tuần tự trên môi trường thử riêng với --isolated-demo.",
  );

function db(query, params = []) {
  const code =
    "import {pool} from './apps/api/dist/db.js';try{const r=await pool.query(" +
    JSON.stringify(query) +
    "," +
    JSON.stringify(params) +
    ");console.log(JSON.stringify(r.rows));}finally{await pool.end();}";
  return JSON.parse(
    compose(["exec", "-T", "api", "node", "--input-type=module"], {
      input: code,
    }).trim(),
  );
}

const ids = {
  reporter: "11111111-1111-4111-8111-111111111111",
  coordinator: "22222222-2222-4222-8222-222222222222",
  technician: "33333333-3333-4333-8333-333333333333",
  approver: "44444444-4444-4444-8444-444444444444",
};
const membershipQuery =
  "SELECT subject_id,roles,enabled FROM memberships WHERE subject_id=ANY($1::uuid[]) ORDER BY subject_id";
const membershipIds = [ids.reporter, ids.coordinator, ids.technician];
const teamQuery =
  "SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id='facilities' AND subject_id=$1) AS member";
const original = db(membershipQuery, [membershipIds]);
assert.equal(original.length, 3);
assert.ok(
  original.every((member) => member.enabled),
  "Demo memberships must be enabled before the isolated drill",
);
const originalTeam = db(teamQuery, [ids.coordinator])[0].member;
function restoreMemberships() {
  db(
    "WITH restored AS (UPDATE memberships m SET roles=v.roles,enabled=v.enabled FROM jsonb_to_recordset($1::jsonb) AS v(subject_id uuid,roles text[],enabled boolean) WHERE m.subject_id=v.subject_id RETURNING m.subject_id) DELETE FROM team_members WHERE team_id='facilities' AND subject_id=$2 AND NOT $3::boolean",
    [JSON.stringify(original), ids.coordinator, originalTeam],
  );
}

const c = await client();
const { check } = await recorder("boundaries-integration");
let acceptedCase, claimedCase, winner;
const work = {
  measures: "Kiểm tra cáp tín hiệu trên tình huống thử đồng thời.",
  result:
    "Máy chiếu giả lập đã được kiểm tra, không có dữ liệu người dùng thật.",
};
const actions = (row) => "/g01/cases/" + row.id + "/actions";
const detailPath = (row) => "/g01/cases/" + row.id;

try {
  await check(
    "two tabs accepting the same revision produce one transition and a stale-revision conflict",
    async () => {
      const row = await c.create();
      const outcomes = await Promise.all(
        [0, 1].map(() =>
          c.call(
            "coordinator",
            actions(row),
            { action: "accept", revision: row.revision },
            [200, 202, 409],
          ),
        ),
      );
      assert.equal(outcomes.filter((result) => result.item).length, 1);
      assert.equal(
        outcomes.filter((result) => result.error?.code === "STALE_REVISION")
          .length,
        1,
      );
      acceptedCase = await c.ready(row.id, "coordinator");
      assert.equal(acceptedCase.revision, row.revision + 1);
      assert.equal(acceptedCase.processId, row.processId);
      const detail = await c.call("coordinator", detailPath(row));
      assert.equal(
        detail.timeline.filter((event) => event.action === "accept").length,
        1,
      );
    },
  );
  await check(
    "two eligible team members claim one task without duplicate assignment or history",
    async () => {
      db(
        "UPDATE memberships SET roles=array_append(roles,'technician') WHERE subject_id=$1 AND NOT 'technician'=ANY(roles)",
        [ids.coordinator],
      );
      db(
        "INSERT INTO team_members(team_id,subject_id) VALUES('facilities',$1) ON CONFLICT DO NOTHING",
        [ids.coordinator],
      );
      let row = await c.create();
      row = await c.act(row, "coordinator", "accept");
      row = await c.act(row, "coordinator", "assign", {
        teamId: "facilities",
        approverId: ids.approver,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const actors = ["technician", "coordinator"];
      const outcomes = await Promise.all(
        actors.map(async (actor) => ({
          actor,
          result: await c.call(
            actor,
            actions(row),
            { action: "receive", revision: row.revision },
            [200, 202, 404, 409],
          ),
        })),
      );
      const successes = outcomes.filter((outcome) => outcome.result.item);
      assert.equal(successes.length, 1);
      winner = successes[0].actor;
      const loser = outcomes.find((outcome) => !outcome.result.item);
      assert.ok(
        ["STALE_REVISION", "NOT_FOUND"].includes(loser.result.error?.code),
      );
      claimedCase = await c.ready(row.id, winner);
      assert.equal(claimedCase.technicianId, ids[winner]);
      assert.equal(claimedCase.revision, row.revision + 1);
      assert.equal(claimedCase.processId, row.processId);
      const detail = await c.call(winner, detailPath(row));
      assert.equal(
        detail.timeline.filter((event) => event.action === "receive").length,
        1,
      );
    },
  );
  await check(
    "concurrent saves cannot overwrite the winning revision or duplicate a saved result",
    async () => {
      const row = claimedCase;
      const outcomes = await Promise.all(
        ["A", "B"].map((tab) =>
          c.call(
            winner,
            actions(row),
            {
              action: "save_work",
              revision: row.revision,
              measures: work.measures,
              result: work.result + " Tab " + tab + ".",
            },
            [200, 409],
          ),
        ),
      );
      assert.equal(outcomes.filter((result) => result.item).length, 1);
      assert.equal(
        outcomes.filter((result) => result.error?.code === "STALE_REVISION")
          .length,
        1,
      );
      claimedCase = await c.ready(row.id, winner);
      assert.equal(claimedCase.revision, row.revision + 1);
      assert.equal(
        claimedCase.result,
        outcomes.find((result) => result.item).item.result,
      );
      const detail = await c.call(winner, detailPath(row));
      assert.equal(
        detail.timeline.filter((event) => event.action === "save_work").length,
        1,
      );
    },
  );
  await check(
    "disabling a membership rejects already-issued tokens on identity, list and known-case paths",
    async () => {
      await c.call("reporter", "/me");
      const token = c.tokens.reporter;
      try {
        db("UPDATE memberships SET enabled=false WHERE subject_id=$1", [
          ids.reporter,
        ]);
        for (const path of ["/me", "/g01/cases", detailPath(acceptedCase)]) {
          const response = await c.call("reporter", path, undefined, 403);
          assert.equal(response.error.code, "MEMBERSHIP_DISABLED");
        }
      } finally {
        db("UPDATE memberships SET enabled=$2 WHERE subject_id=$1", [
          ids.reporter,
          original.find((row) => row.subject_id === ids.reporter).enabled,
        ]);
      }
      assert.equal((await c.call("reporter", "/me")).user.id, ids.reporter);
      assert.equal(c.tokens.reporter, token);
    },
  );
  await check(
    "removed application roles cannot be regained from a cached token or expose report and evidence metadata",
    async () => {
      const token = c.tokens.reporter;
      try {
        db("UPDATE memberships SET roles=ARRAY[]::text[] WHERE subject_id=$1", [
          ids.reporter,
        ]);
        assert.deepEqual((await c.call("reporter", "/me")).user.roles, []);
        assert.equal((await c.call("reporter", "/g01/cases")).total, 0);
        assert.equal((await c.call("reporter", "/g01/reports")).total, 0);
        await c.call("reporter", detailPath(acceptedCase), undefined, 404);
        await c.call(
          "reporter",
          detailPath(acceptedCase) + "/evidence",
          undefined,
          404,
        );
      } finally {
        db("UPDATE memberships SET roles=$2::text[] WHERE subject_id=$1", [
          ids.reporter,
          original.find((row) => row.subject_id === ids.reporter).roles,
        ]);
      }
      assert.equal(c.tokens.reporter, token);
    },
  );
  await check(
    "both synthetic cases finish through real clean evidence and approval, and membership fixtures are restored",
    async () => {
      acceptedCase = await c.act(acceptedCase, "coordinator", "assign", {
        technicianId: ids.technician,
        approverId: ids.approver,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
      acceptedCase = await c.act(acceptedCase, "technician", "receive");
      for (let [row, actor] of [
        [acceptedCase, "technician"],
        [claimedCase, winner],
      ]) {
        await c.upload(row, actor, png, "concurrent-demo.png");
        row = await c.act(row, actor, "submit", work);
        row = await c.act(row, "approver", "approve");
        assert.equal(row.status, "closed");
      }
      restoreMemberships();
      assert.deepEqual(db(membershipQuery, [membershipIds]), original);
      assert.equal(db(teamQuery, [ids.coordinator])[0].member, originalTeam);
    },
  );
} finally {
  restoreMemberships();
}
console.log(
  "Concurrency and membership drill passed on an isolated synthetic-data installation.",
);
