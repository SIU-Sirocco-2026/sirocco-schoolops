import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { client, recorder, root, base } from "./test-client.mjs";
import { replay } from "./replay-g02.mjs";
const c = await client(),
  { check } = await recorder("phase5-integration");
let run, case1, case2;
const source = "/g02/sources/demo-pm25/observations";
await check(
  "deterministic PM2.5 replay matches normal/high/duplicate/invalid/late/gap/recovery/cooldown expectations",
  async () => {
    run = await replay(c);
    assert.equal(run.episodes.length, 2);
    assert.equal(run.observations["high-2"].normalized.value, 50);
    assert.equal(run.observations["high-2"].raw.value, 0.05);
    assert.equal(run.observations["high-2"].raw.unit, "mg/m3");
    assert.ok(run.observations["bad-unit"].qualityErrors.length);
    assert.equal(run.observations.late.quality, "late");
    assert.ok(run.observations["gap-recovered"].gapDetected);
    case1 = await c.ready(run.episodes[0].caseId, "environment", "g02");
    case2 = await c.ready(run.episodes[1].caseId, "environment", "g02");
    assert.equal(case1.status, "verification");
    assert.equal(case2.status, "verification");
    assert.equal(case1.packageVersion, "g02@1.0.0");
  },
);
await check(
  "replay is idempotent and conflicting event IDs cannot rewrite raw data or generate episodes",
  async () => {
    for (const payload of Object.values(run.payloads)) {
      const r = await c.call("sensor", source, payload);
      assert.equal(r.duplicate, true);
    }
    const duplicate = await Promise.all(
      Array.from({ length: 5 }, () =>
        c.call("sensor", source, run.payloads["high-2"]),
      ),
    );
    assert.ok(
      duplicate.every((r) => r.item.id === run.observations["high-2"].id),
    );
    await c.call(
      "sensor",
      source,
      { ...run.payloads["high-2"], value: 999 },
      409,
    );
    const episodes = (
      await c.call("environment", "/g02/episodes")
    ).items.filter((e) => run.episodes.some((x) => x.id === e.id));
    assert.equal(episodes.length, 2);
    assert.ok(episodes.every((e) => e.conditionEndedAt));
  },
);
await check(
  "lineage connects episode, exact rule/pack checksum, raw and normalized measurements, quality and duplicates",
  async () => {
    const trace = await c.call(
      "environment",
      `/g02/episodes/${run.episodes[0].id}/lineage`,
    );
    assert.equal(trace.episode.rule.version, "pm25-demo@1.0.0");
    assert.match(trace.episode.packChecksum, /^[a-f0-9]{64}$/);
    assert.equal(trace.episode.caseId, case1.id);
    assert.equal(trace.observations.length, 5);
    assert.ok(
      trace.observations.every(
        (o) =>
          o.quality === "valid" &&
          o.observedAt &&
          o.receivedAt &&
          o.label === "replayed",
      ),
    );
    assert.ok(
      !trace.observations.some((o) =>
        [run.observations.late.id, run.observations["bad-unit"].id].includes(
          o.id,
        ),
      ),
    );
    assert.ok(trace.attempts.some((a) => a.outcome === "duplicate"));
    assert.ok(trace.attempts.some((a) => a.outcome === "conflict"));
  },
);
await check(
  "ingestion and officer permissions are separate; G01 accounts/admin cannot access G02 case/file/source/lineage",
  async () => {
    await c.call("environment", source, run.payloads.normal, 403);
    for (const user of [
      "reporter",
      "coordinator",
      "technician",
      "approver",
      "admin",
      "sensor",
    ]) {
      await c.call(user, "/g02/sources", undefined, 403);
      await c.call(
        user,
        `/g02/episodes/${run.episodes[0].id}/lineage`,
        undefined,
        403,
      );
      await c.call(user, `/g02/cases/${case1.id}`, undefined, 403);
      await c.call(user, `/g02/cases/${case1.id}/evidence`, undefined, 403);
      const list = await c.call(user, `/g01/cases?q=${case1.code}`);
      assert.equal(list.total, 0);
    }
    await c.call("environment", `/g01/cases/${case1.id}`, undefined, 404);
  },
);
await check(
  "environmental recovery does not close human work; officer verifies and resolves through shared task/evidence/audit",
  async () => {
    case1 = await c.act(case1, "environment", "confirm", {}, "g02");
    assert.equal(case1.status, "in_progress");
    assert.equal(case1.taskKey, "repair");
    const work = {
      measures: "Kiểm tra nguồn bụi và thông gió phòng A101.",
      result: "Đã xử lý theo quy trình minh họa.",
      reason: "Đã kiểm tra thực địa và hoàn thành công việc.",
    };
    await c.call(
      "environment",
      `/g02/cases/${case1.id}/actions`,
      { action: "resolve", revision: case1.revision, ...work },
      409,
    );
    const evidence = await c.upload(
      case1,
      "environment",
      Buffer.from("Biên bản ứng phó môi trường, dữ liệu giả lập."),
      "g02-response.txt",
      "g02",
    );
    case1 = await c.act(
      case1,
      "environment",
      "save_work",
      { measures: work.measures, result: work.result },
      "g02",
    );
    assert.equal(case1.status, "in_progress");
    await c.call(
      "environment",
      `/g02/cases/${case1.id}/actions`,
      { action: "resolve", revision: case1.revision, ...work, reason: "" },
      400,
    );
    case1 = await c.act(case1, "environment", "resolve", work, "g02");
    assert.equal(case1.status, "closed");
    assert.ok(case1.closedAt);
    const detail = await c.call("environment", `/g02/cases/${case1.id}`);
    assert.ok(
      detail.timeline.some(
        (e) =>
          e.action === "resolve" &&
          e.details.reason === work.reason &&
          e.details.evidence.some((f) => f.id === evidence.id),
      ),
    );
    const r = await fetch(
      `${base}/g02/cases/${case1.id}/evidence/${evidence.id}/download`,
      { headers: { Authorization: `Bearer ${c.tokens.environment}` } },
    );
    assert.equal(r.status, 200);
    assert.match(await r.text(), /giả lập/);
    const forbidden = await fetch(
      `${base}/g02/cases/${case1.id}/evidence/${evidence.id}/download`,
      { headers: { Authorization: `Bearer ${c.tokens.reporter}` } },
    );
    assert.equal(forbidden.status, 403);
  },
);
await check(
  "false-positive dismissal requires a reason and shared reports/list reflect officer-visible source cases",
  async () => {
    await c.call(
      "environment",
      `/g02/cases/${case2.id}/actions`,
      { action: "dismiss", revision: case2.revision, reason: "" },
      400,
    );
    case2 = await c.act(
      case2,
      "environment",
      "dismiss",
      { reason: "Đã xác minh nguồn phát lại, không cần xử lý thực tế." },
      "g02",
    );
    assert.equal(case2.status, "closed");
    const report = await c.call("environment", "/g02/reports");
    for (const bucket of ["open", "overdue", "completed"]) {
      const list = await c.call("environment", `/g02/cases?bucket=${bucket}`);
      assert.equal(list.total, report[bucket]);
    }
  },
);
await check(
  "revoking an officer membership blocks still-valid-token requests and restoring it preserves cases",
  async () => {
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
        { cwd: root, stdio: "pipe" },
      );
    try {
      sql("UPDATE memberships SET enabled=false WHERE username='environment'");
      for (const path of [
        "/g02/sources",
        "/g02/episodes",
        "/g02/reports",
        `/g02/cases/${case1.id}`,
      ])
        await c.call("environment", path, undefined, 403);
    } finally {
      sql("UPDATE memberships SET enabled=true WHERE username='environment'");
    }
    assert.equal(
      (await c.ready(case1.id, "environment", "g02")).status,
      "closed",
    );
  },
);
await check(
  "engine outage preserves the observation, episode and outbox case; duplicate replay cannot create a second workflow",
  async () => {
    const sourceRow = (await c.call("environment", "/g02/sources")).items[0],
      anchor = new Date(sourceRow.watermark).getTime() + 600000;
    const post = (n, value) =>
      c.call(
        "sensor",
        source,
        {
          eventId: `outage-${anchor}-${n}`,
          stationId: "A101-PM25",
          observedAt: new Date(anchor + n * 60000).toISOString(),
          quantity: "pm25",
          value,
          unit: "ug/m3",
          label: "replayed",
        },
        201,
      );
    execFileSync("docker", ["compose", "stop", "flowable"], {
      cwd: root,
      stdio: "pipe",
    });
    let result;
    try {
      await post(0, 10);
      await post(1, 45);
      result = await post(2, 50);
      assert.ok(result.caseId && result.episodeId);
      const d = await c.call("environment", `/g02/cases/${result.caseId}`);
      assert.notEqual(d.item.syncStatus, "ready");
      const duplicate = await c.call("sensor", source, {
        eventId: `outage-${anchor}-2`,
        stationId: "A101-PM25",
        observedAt: new Date(anchor + 120000).toISOString(),
        quantity: "pm25",
        value: 50,
        unit: "ug/m3",
        label: "replayed",
      });
      assert.equal(duplicate.duplicate, true);
    } finally {
      execFileSync("docker", ["compose", "start", "flowable"], {
        cwd: root,
        stdio: "pipe",
      });
    }
    const row = await c.ready(result.caseId, "environment", "g02");
    assert.equal(row.status, "verification");
    await post(3, 10);
    await post(4, 10);
    const closed = await c.act(
      row,
      "environment",
      "dismiss",
      { reason: "Đã kiểm chứng phục hồi engine, kết thúc tình huống giả lập." },
      "g02",
    );
    assert.equal(closed.status, "closed");
  },
);
console.log(
  "Phase 5 acceptance passed; deterministic replay produced two expected episodes and shared human workflows completed.",
);
