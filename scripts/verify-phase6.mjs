import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { client, recorder, root, base, sleep } from "./test-client.mjs";
const c = await client(),
  { check } = await recorder("phase6-integration"),
  reporter = "88888888-8888-4888-8888-888888888888",
  officer = "99999999-9999-4999-8999-999999999999",
  reviewer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sql = (q) =>
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "schoolops",
      "-d",
      "schoolops",
      "-v",
      "ON_ERROR_STOP=1",
      "-tAc",
      q,
    ],
    { cwd: root, encoding: "utf8" },
  ).trim();
let row,
  key = crypto.randomUUID(),
  file;
const payload = {
  title: `Nguy cơ tại hành lang — giả lập ${Date.now()}`,
  roomId: "A101",
  assetId: null,
  description:
    "Dữ liệu giả lập trung tính: đề nghị kiểm tra vật cản tại hành lang, không có danh tính thật.",
};
const uri = () => `/g03/cases/${row.id}`;
async function getFile(user, expected) {
  if (!c.tokens[user]) await c.login(user);
  const r = await fetch(`${base}${uri()}/evidence/${file.id}/download`, {
    headers: { Authorization: `Bearer ${c.tokens[user]}` },
  });
  assert.equal(r.status, expected);
  return r;
}
await check(
  "authorized safety reporter creates an explicitly scoped case and idempotency replay preserves its pinned package",
  async () => {
    const before = (await c.call("safety_reviewer", "/g03/reports")).total;
    row = (
      await c.call("safety_reporter", "/g03/cases", payload, [201, 202], {
        "Idempotency-Key": key,
      })
    ).item;
    row = await c.ready(row.id, "safety_reporter", "g03");
    assert.match(row.code, /^G03-/);
    assert.equal(row.packageVersion, "g03@1.0.0");
    const again = await c.call("safety_reporter", "/g03/cases", payload, 200, {
      "Idempotency-Key": key,
    });
    assert.equal(again.item.id, row.id);
    await c.call("safety", uri());
    await c.call("safety_reviewer", uri(), undefined, 404);
    assert.equal(
      (await c.call("safety_reviewer", `/g03/cases?q=${row.code}`)).total,
      0,
    );
    assert.equal(
      (await c.call("safety_reviewer", "/g03/reports")).total,
      before,
    );
    assert.ok(
      !(await c.call("safety_reviewer", "/g03/notifications")).items.some(
        (n) => n.caseId === row.id,
      ),
    );
  },
);
await check(
  "idempotency is scoped by pack and cannot return a private G03 case through a G01 creation replay",
  async () => {
    try {
      sql(
        "UPDATE memberships SET roles=ARRAY['safety_reporter','reporter'] WHERE username='safety_reporter'",
      );
      const publicCase = await c.call(
        "safety_reporter",
        "/g01/cases",
        {
          title: "Kiểm tra scope idempotency giả lập",
          roomId: "A101",
          assetId: null,
          description:
            "Một hồ sơ G01 độc lập, không phải chuyển loại hồ sơ G03.",
        },
        [201, 202],
        { "Idempotency-Key": key },
      );
      assert.notEqual(publicCase.item.id, row.id);
      assert.equal(publicCase.item.packageVersion, "g01@1.0.0");
      const replay = await c.call(
        "safety_reporter",
        "/g03/cases",
        payload,
        200,
        { "Idempotency-Key": key },
      );
      assert.equal(replay.item.id, row.id);
    } finally {
      sql(
        "UPDATE memberships SET roles=ARRAY['safety_reporter'] WHERE username='safety_reporter'",
      );
    }
  },
);
await check(
  "G01 users and technical admin cannot discover restricted content or counts through list/search/report/notifications/detail/actions",
  async () => {
    for (const user of [
      "reporter",
      "coordinator",
      "technician",
      "approver",
      "admin",
      "environment",
    ]) {
      assert.equal(
        (await c.call(user, `/g03/cases?q=${encodeURIComponent(row.code)}`))
          .total,
        0,
      );
      assert.equal((await c.call(user, "/g03/reports")).total, 0);
      assert.equal((await c.call(user, "/g03/notifications")).items.length, 0);
      await c.call(user, uri(), undefined, 404);
      await c.call(user, `${uri()}/evidence`, undefined, 404);
      await c.call(
        user,
        `${uri()}/actions`,
        { action: "accept", revision: row.revision },
        404,
      );
      await c.call(user, `/g01/cases/${row.id}`, undefined, 404);
      assert.equal((await c.call(user, `/g01/cases?q=${row.code}`)).total, 0);
    }
    const notes = await c.call("safety_reporter", "/g03/notifications");
    assert.ok(notes.items.some((n) => n.caseId === row.id));
    assert.ok(
      notes.items.every(
        (n) => !JSON.stringify(n).includes(payload.description),
      ),
    );
  },
);
await check(
  "same safety role is insufficient until assigned; unrelated facility personnel and self-approval are rejected",
  async () => {
    row = await c.act(row, "safety", "accept", {}, "g03");
    await c.call("safety_reviewer", uri(), undefined, 404);
    await c.call(
      "safety",
      `${uri()}/actions`,
      {
        action: "assign",
        revision: row.revision,
        technicianId: "33333333-3333-4333-8333-333333333333",
        approverId: reviewer,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      },
      409,
    );
    await c.call(
      "safety",
      `${uri()}/actions`,
      {
        action: "assign",
        revision: row.revision,
        technicianId: officer,
        approverId: officer,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      },
      400,
    );
    row = await c.act(
      row,
      "safety",
      "assign",
      {
        technicianId: officer,
        approverId: reviewer,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      },
      "g03",
    );
    await c.call("safety_reviewer", uri());
    row = await c.act(row, "safety", "receive", {}, "g03");
    assert.equal(row.status, "in_progress");
  },
);
await check(
  "restricted evidence uses shared quarantine/scanner and download ACL even when unauthorized users know both IDs",
  async () => {
    const work = {
      measures: "Kiểm tra và di chuyển vật cản giả lập.",
      result: "Hành lang được kiểm tra theo tình huống demo.",
    };
    await c.call(
      "safety",
      `${uri()}/actions`,
      { action: "submit", revision: row.revision, ...work },
      409,
    );
    file = await c.upload(
      row,
      "safety",
      Buffer.from("Biên bản giả lập xử lý vật cản, không có danh tính thật."),
      "g03-evidence.txt",
      "g03",
    );
    for (const user of [
      "reporter",
      "coordinator",
      "technician",
      "approver",
      "admin",
      "environment",
    ]) {
      await getFile(user, 404);
      const deniedUpload = await fetch(`${base}${uri()}/evidence`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.tokens[user]}`,
          "Content-Type": "application/octet-stream",
          "X-File-Name": "forbidden.txt",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: Buffer.from("Không có quyền thêm dữ liệu"),
      });
      assert.equal(deniedUpload.status, 404);
      await c.call(user, `${uri()}/access-log`, undefined, 404);
    }
    assert.match(
      await (await getFile("safety_reporter", 200)).text(),
      /giả lập/,
    );
    row = await c.act(row, "safety", "submit", work, "g03");
    await c.call(
      "safety",
      `${uri()}/actions`,
      { action: "approve", revision: row.revision },
      403,
    );
  },
);
await check(
  "current membership and per-case ACL revocation immediately hide case/file/notifications including idempotency replay",
  async () => {
    try {
      sql(
        `UPDATE cases SET access_ids=array_remove(access_ids,'${reporter}'::uuid) WHERE id='${row.id}'`,
      );
      await c.call("safety_reporter", uri(), undefined, 404);
      assert.equal(
        (await c.call("safety_reporter", `/g03/cases?q=${row.code}`)).total,
        0,
      );
      assert.ok(
        !(await c.call("safety_reporter", "/g03/notifications")).items.some(
          (n) => n.caseId === row.id,
        ),
      );
      await getFile("safety_reporter", 404);
      await c.call("safety_reporter", "/g03/cases", payload, 404, {
        "Idempotency-Key": key,
      });
    } finally {
      sql(
        `UPDATE cases SET access_ids=array_append(access_ids,'${reporter}'::uuid) WHERE id='${row.id}'`,
      );
    }
    try {
      sql(
        "UPDATE memberships SET enabled=false WHERE username='safety_reviewer'",
      );
      await c.call("safety_reviewer", uri(), undefined, 403);
      await c.call(
        "safety_reviewer",
        `${uri()}/actions`,
        { action: "approve", revision: row.revision },
        403,
      );
    } finally {
      sql(
        "UPDATE memberships SET enabled=true WHERE username='safety_reviewer'",
      );
    }
  },
);
await check(
  "designated reviewer closes real workflow; timeline and notifications remain scoped with actor/time/evidence",
  async () => {
    row = await c.act(row, "safety_reviewer", "approve", {}, "g03");
    assert.equal(row.status, "closed");
    assert.equal(row.decisionBy, reviewer);
    const detail = await c.call("safety_reporter", uri());
    assert.ok(
      detail.timeline.some(
        (e) =>
          e.action === "submit" &&
          e.details.evidence.some((f) => f.id === file.id),
      ),
    );
    assert.equal(detail.timeline.at(-1).actorId, reviewer);
    const report = await c.call("safety_reporter", "/g03/reports");
    assert.ok(report.completed >= 1);
    const visible = await c.call(
      "safety_reporter",
      `/g03/cases?bucket=completed&q=${row.code}`,
    );
    assert.equal(visible.total, 1);
  },
);
await check(
  "case-scoped access journal records allowed and denied attempts without raw content, search text, filename or token",
  async () => {
    await sleep(200);
    const journal = await c.call("safety", `${uri()}/access-log`);
    assert.ok(journal.items.some((e) => e.allowed === false));
    assert.ok(journal.items.some((e) => e.allowed === true));
    assert.ok(
      journal.items.some(
        (e) => e.operation === "file_download" && e.httpStatus === 404,
      ),
    );
    const text = JSON.stringify(journal);
    for (const secret of [
      payload.title,
      payload.description,
      "g03-evidence.txt",
      ...Object.values(c.tokens),
    ])
      assert.ok(!text.includes(secret));
    await c.call("safety_reporter", `${uri()}/access-log`, undefined, 403);
  },
);
console.log(
  "Phase 6 acceptance passed; no G03 case/file leakage through known-ID, list/search/report/notification paths.",
);
