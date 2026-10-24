import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  (await readFile(resolve(root, ".env"), "utf8"))
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const base = "http://localhost:8088/api/g01",
  results = [],
  tokens = {};
for (const username of [
  "reporter",
  "coordinator",
  "technician",
  "approver",
  "admin",
]) {
  const response = await fetch(
    "http://localhost:8180/realms/sirocco/protocol/openid-connect/token",
    {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "schoolops-smoke",
        username,
        password: env.DEMO_PASSWORD,
      }),
    },
  );
  assert.equal(response.status, 200, `login ${username}`);
  tokens[username] = (await response.json()).access_token;
}
async function call(role, path, body, expected = 200, extra = {}) {
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${tokens[role]}`,
      "Content-Type": "application/json",
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(
    response.status,
    expected,
    `${role} ${path}: ${JSON.stringify(data)}`,
  );
  return data;
}
async function check(name, fn) {
  await fn();
  results.push({ name, status: "pass" });
  console.log(`PASS ${name}`);
}
function engine(path) {
  const code = `const h={Authorization:'Basic '+Buffer.from(process.env.FLOWABLE_USER+':'+process.env.FLOWABLE_PASSWORD).toString('base64')};const r=await fetch(process.env.FLOWABLE_URL+'/'+${JSON.stringify(path)},{headers:h});if(!r.ok)throw Error('engine '+r.status);console.log(JSON.stringify(await r.json()));`;
  return JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "api",
        "node",
        "--input-type=module",
        "-e",
        code,
      ],
      { cwd: root, encoding: "utf8" },
    ),
  );
}
const tech = "33333333-3333-4333-8333-333333333333",
  approver = "44444444-4444-4444-8444-444444444444";
const payload = {
  title: `Máy chiếu A101 hỏng — kiểm thử ${Date.now()}`,
  roomId: "A101",
  assetId: "A101-PROJECTOR",
  description: "Máy chiếu không lên hình khi bật nguồn. Dữ liệu giả lập.",
};
const key = crypto.randomUUID();
let item;
const action = async (role, name, fields = {}, expected = 200) => {
  const data = await call(
    role,
    `/cases/${item.id}/actions`,
    { action: name, revision: item.revision, ...fields },
    expected,
  );
  if (expected === 200) item = data.item;
  return data;
};
await check("catalog, creation validation and role gate", async () => {
  const catalog = await call("reporter", "/catalog");
  assert.equal(catalog.rooms.length, 3);
  assert.ok(catalog.assets.some((a) => a.id === "A101-PROJECTOR"));
  await call("technician", "/cases", payload, 403, {
    "Idempotency-Key": crypto.randomUUID(),
  });
  await call("reporter", "/cases", { ...payload, roomId: "unknown" }, 400, {
    "Idempotency-Key": crypto.randomUUID(),
  });
  await call("reporter", "/cases", { ...payload, assetId: "B201-PC" }, 400, {
    "Idempotency-Key": crypto.randomUUID(),
  });
  await call("reporter", "/cases", { ...payload, description: "short" }, 400, {
    "Idempotency-Key": crypto.randomUUID(),
  });
  item = (
    await call("reporter", "/cases", payload, 201, { "Idempotency-Key": key })
  ).item;
  assert.match(item.code, /^G01-\d+$/);
  assert.equal(item.status, "verification");
  assert.equal(item.taskKey, "verify");
  assert.equal(item.packageVersion, "g01@1.0.0");
  assert.equal(item.schemaVersion, "g01-case@1.0.0");
  assert.equal(item.workflowVersion, "g01-facilities@1.0.0");
  const task = engine(`runtime/tasks?processInstanceId=${item.processId}`)
    .data[0];
  assert.equal(task.id, item.taskId);
  assert.equal(task.assignee, item.coordinatorId);
});
await check(
  "creation replay preserves case, process and immutable version references",
  async () => {
    const again = (
      await call("reporter", "/cases", payload, 200, { "Idempotency-Key": key })
    ).item;
    assert.equal(again.id, item.id);
    assert.equal(again.processId, item.processId);
    assert.equal(again.definitionId, item.definitionId);
    await call(
      "reporter",
      "/cases",
      { ...payload, title: "Khác nội dung yêu cầu" },
      409,
      { "Idempotency-Key": key },
    );
  },
);
await check(
  "case list/detail/actions are scoped; role cannot skip the current step",
  async () => {
    for (const role of ["admin", "technician", "approver"]) {
      await call(role, `/cases/${item.id}`, undefined, 404);
      const list = await call(
        role,
        `/cases?q=${encodeURIComponent(item.code)}`,
      );
      assert.equal(list.total, 0);
      await action(role, "accept", {}, 404);
    }
    await action("reporter", "accept", {}, 403);
    await action("coordinator", "approve", {}, 403);
    const mine = await call("coordinator", `/cases?mine=true&q=${item.code}`);
    assert.equal(mine.total, 1);
  },
);
await check(
  "return for information requires a reason; reporter resubmits and history keeps both descriptions",
  async () => {
    await action("coordinator", "return_info", { reason: "" }, 400);
    await action("coordinator", "return_info", {
      reason: "Cần xác định đèn nguồn và cổng kết nối.",
    });
    assert.equal(item.status, "supplement");
    assert.equal(item.taskKey, "supplement");
    await action("coordinator", "accept", {}, 403);
    await action("reporter", "resubmit", {
      ...payload,
      description:
        "Đèn nguồn sáng nhưng không có hình qua cả HDMI và VGA. Dữ liệu giả lập.",
    });
    assert.equal(item.status, "verification");
    const d = await call("reporter", `/cases/${item.id}`);
    assert.ok(
      d.timeline.some(
        (e) =>
          e.action === "return_info" && e.details.reason.includes("đèn nguồn"),
      ),
    );
    assert.ok(
      d.timeline.some(
        (e) =>
          e.action === "created" &&
          e.details.description === payload.description,
      ),
    );
  },
);
const dueAt = new Date(Date.now() + 86400000).toISOString();
const versionRefs = () => [
  item.packageVersion,
  item.schemaVersion,
  item.workflowVersion,
  item.definitionId,
];
let pinned;
await check(
  "acceptance, assignee validation, future deadline and stale revision protection",
  async () => {
    pinned = versionRefs();
    const old = item.revision;
    await action("coordinator", "accept");
    assert.equal(item.status, "assignment");
    await call(
      "coordinator",
      `/cases/${item.id}/actions`,
      {
        action: "assign",
        revision: old,
        technicianId: tech,
        approverId: approver,
        dueAt,
      },
      409,
    );
    await action(
      "coordinator",
      "assign",
      {
        technicianId: tech,
        approverId: approver,
        dueAt: "2020-01-01T00:00:00Z",
      },
      400,
    );
    await action(
      "coordinator",
      "assign",
      {
        technicianId: "55555555-5555-4555-8555-555555555555",
        approverId: approver,
        dueAt,
      },
      409,
    );
    await action(
      "coordinator",
      "assign",
      { technicianId: tech, teamId: "facilities", approverId: approver, dueAt },
      400,
    );
    await action("coordinator", "assign", {
      technicianId: tech,
      approverId: approver,
      dueAt,
    });
    assert.equal(item.status, "assigned");
    assert.equal(item.technicianId, tech);
    assert.equal(new Date(item.dueAt).toISOString(), dueAt);
    const task = engine(`runtime/tasks?processInstanceId=${item.processId}`)
      .data[0];
    assert.equal(task.assignee, tech);
    assert.equal(new Date(task.dueDate).toISOString(), dueAt);
  },
);
await check(
  "technician must receive work; records measures/result without advancing before submission",
  async () => {
    await action(
      "technician",
      "submit",
      { measures: "Thay cáp HDMI", result: "Máy chiếu hoạt động" },
      403,
    );
    await action("technician", "receive");
    assert.equal(item.status, "in_progress");
    const taskId = item.taskId;
    await action("technician", "save_work", {
      measures: "Kiểm tra nguồn và thay cáp HDMI.",
      result: "Đã lên hình, cần kiểm tra độ ổn định.",
    });
    assert.equal(item.taskId, taskId);
    assert.equal(item.status, "in_progress");
    await action("technician", "submit", { measures: "", result: "" }, 400);
    await action("technician", "submit", {
      measures: "Thay cáp HDMI và vệ sinh đầu nối.",
      result: "Máy chiếu lên hình sau khi thử 10 phút.",
    });
    assert.equal(item.status, "acceptance");
    assert.equal(item.taskKey, "approve");
    await action("technician", "approve", {}, 403);
  },
);
await check(
  "approver returns with reason; same process reopens repair and keeps first result",
  async () => {
    const process = item.processId;
    await action("approver", "return_work", { reason: "" }, 400);
    await action("approver", "return_work", {
      reason: "Hình ảnh vẫn chớp, cần thử liên tục lâu hơn.",
    });
    assert.equal(item.status, "in_progress");
    assert.equal(item.processId, process);
    assert.equal(item.taskKey, "repair");
    await action("technician", "submit", {
      measures: "Thay đầu nối HDMI và kiểm tra lại toàn bộ cáp.",
      result: "Hình ảnh ổn định trong 30 phút, không chớp.",
    });
    const d = await call("reporter", `/cases/${item.id}`);
    assert.ok(
      d.timeline.some(
        (e) => e.action === "return_work" && e.details.reason.includes("chớp"),
      ),
    );
    assert.equal(d.timeline.filter((e) => e.action === "submit").length, 2);
  },
);
await check(
  "only designated approver closes after approval; engine history and timeline agree",
  async () => {
    await action("reporter", "approve", {}, 403);
    await action("approver", "approve");
    assert.equal(item.status, "closed");
    assert.ok(item.closedAt);
    assert.equal(item.decisionBy, approver);
    assert.equal(item.taskId, null);
    assert.deepEqual(versionRefs(), pinned);
    await action("approver", "approve", {}, 403);
    const history = engine(
      `history/historic-process-instances?processInstanceId=${item.processId}&finished=true`,
    ).data;
    assert.equal(history.length, 1);
    assert.equal(history[0].businessKey, item.id);
    assert.equal(history[0].processDefinitionId, item.definitionId);
    const d = await call("reporter", `/cases/${item.id}`);
    assert.ok(d.timeline.every((e) => e.actorId && e.actorName && e.createdAt));
    assert.equal(d.timeline.at(-1).action, "approve");
    assert.equal(d.timeline.at(-1).actorId, approver);
    const mine = await call("technician", `/cases?mine=true&q=${item.code}`);
    assert.equal(mine.total, 0);
    const filtered = await call(
      "reporter",
      `/cases?status=closed&q=${item.code}`,
    );
    assert.equal(filtered.total, 1);
    assert.equal(
      (await call("reporter", `/cases?status=verification&q=${item.code}`))
        .total,
      0,
    );
    const snapshot = execFileSync(
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
        "-tAc",
        `SELECT schema_snapshot->>'$id' FROM cases WHERE id='${item.id}'`,
      ],
      { cwd: root, encoding: "utf8" },
    ).trim();
    assert.equal(snapshot, "g01-case@1.0.0");
  },
);
const closed = { id: item.id, code: item.code, processId: item.processId };
await check(
  "team assignment has a real candidate group; member receives and completes normal path",
  async () => {
    item = (
      await call(
        "reporter",
        "/cases",
        { ...payload, title: `Sự cố giao tổ kỹ thuật ${Date.now()}` },
        201,
        { "Idempotency-Key": crypto.randomUUID() },
      )
    ).item;
    await action("coordinator", "accept");
    await action("coordinator", "assign", {
      teamId: "facilities",
      approverId: approver,
      dueAt,
    });
    assert.equal(item.technicianId, null);
    const links = engine(`runtime/tasks/${item.taskId}/identitylinks`);
    assert.ok(
      links.some((l) => l.group === "facilities" && l.type === "candidate"),
    );
    const mine = await call("technician", `/cases?mine=true&q=${item.code}`);
    assert.equal(mine.total, 1);
    await action("technician", "receive");
    assert.equal(item.technicianId, tech);
    assert.equal(item.status, "in_progress");
    const received = engine(
      `history/historic-task-instances?processInstanceId=${item.processId}&taskDefinitionKey=receive`,
    ).data;
    assert.equal(received.length, 1);
    assert.equal(received[0].assignee, tech);
    await action("technician", "submit", {
      measures: "Kiểm tra và khắc phục đường dây tín hiệu.",
      result: "Thiết bị hoạt động bình thường.",
    });
    await action("approver", "approve");
    assert.equal(item.status, "closed");
  },
);
await mkdir(resolve(root, "test-results"), { recursive: true });
await writeFile(
  resolve(root, "test-results/g01-integration.json"),
  JSON.stringify(
    {
      testedAt: new Date().toISOString(),
      cases: [
        closed,
        { id: item.id, code: item.code, processId: item.processId },
      ],
      results,
    },
    null,
    2,
  ),
);
console.log(
  "G01 integration passed against real Identity/gateway/API/PostgreSQL/Flowable. No secrets recorded.",
);
