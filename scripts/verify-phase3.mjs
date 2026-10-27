// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { evidenceContext } from "./evidence.mjs";
import { local } from "./local-config.mjs";
const provenance = evidenceContext();

const root = resolve(import.meta.dirname, ".."),
  base = `${local.webOrigin}/api/g01`;
const env = Object.fromEntries(
  (await readFile(resolve(root, ".env"), "utf8"))
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const results = [],
  cases = [],
  tokens = {};
const tech = "33333333-3333-4333-8333-333333333333",
  approver = "44444444-4444-4444-8444-444444444444";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function docker(args, input) {
  return execFileSync("docker", ["compose", ...args], {
    cwd: root,
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 180000,
  });
}
function sql(query) {
  return docker([
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
    query,
  ]).trim();
}
function inside(code) {
  return docker(["exec", "-T", "api", "node", "--input-type=module"], code);
}
async function login() {
  for (const user of [
    "reporter",
    "coordinator",
    "technician",
    "approver",
    "admin",
  ]) {
    const r = await fetch(
      `${local.authOrigin}/realms/sirocco/protocol/openid-connect/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "password",
          client_id: "schoolops-smoke",
          username: user,
          password: env.DEMO_PASSWORD,
        }),
      },
    );
    assert.equal(r.status, 200, `login ${user}`);
    tokens[user] = (await r.json()).access_token;
  }
}
async function call(user, path, body, expected = 200, headers = {}) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${tokens[user]}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  assert.ok(
    (Array.isArray(expected) ? expected : [expected]).includes(r.status),
    `${user} ${path}: ${r.status} ${JSON.stringify(data)}`,
  );
  return data;
}
async function detail(id, user = "reporter") {
  return (await call(user, `/cases/${id}`)).item;
}
async function ready(id) {
  for (let i = 0; i < 100; i++) {
    const row = await detail(id);
    if (row.syncStatus === "ready") return row;
    await sleep(1000);
  }
  throw Error(`Reconciliation timed out ${id}`);
}
async function create() {
  const key = randomUUID(),
    body = {
      title: `Kiểm chứng giai đoạn 3 ${Date.now()}`,
      roomId: "A101",
      assetId: "A101-PROJECTOR",
      description: "Dữ liệu giả lập để kiểm chứng bằng chứng và khôi phục lỗi.",
    };
  const response = await call("reporter", "/cases", body, [201, 202], {
    "Idempotency-Key": key,
  });
  cases.push(response.item.id);
  return { item: await ready(response.item.id), key, body };
}
async function act(row, user, action, fields = {}) {
  const r = await call(
    user,
    `/cases/${row.id}/actions`,
    { action, revision: row.revision, ...fields },
    [200, 202],
  );
  return r.item.syncStatus === "ready" ? r.item : ready(row.id);
}
async function repair(
  row,
  dueAt = new Date(Date.now() + 86400000).toISOString(),
) {
  row = await act(row, "coordinator", "accept");
  row = await act(row, "coordinator", "assign", {
    technicianId: tech,
    approverId: approver,
    dueAt,
  });
  return act(row, "technician", "receive");
}
async function upload(
  row,
  data = Buffer.from("Biên bản kiểm tra máy chiếu giả lập."),
  filename = "bien-ban.txt",
  key = randomUUID(),
  expected = 201,
  user = "technician",
) {
  const r = await fetch(`${base}/cases/${row.id}/evidence`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens[user]}`,
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(filename),
      "Idempotency-Key": key,
    },
    body: data,
  });
  const body = await r.json();
  assert.equal(r.status, expected, JSON.stringify(body));
  return body.item;
}
async function files(row) {
  return (await call("technician", `/cases/${row.id}/evidence`)).items;
}
async function scan(row, id, status) {
  for (let i = 0; i < 100; i++) {
    const file = (await files(row)).find((f) => f.id === id);
    if (file.scanStatus === status) return file;
    await sleep(1000);
  }
  throw Error(`Scan never became ${status}`);
}
async function download(row, file, user = "technician", status = 200) {
  const r = await fetch(
    `${base}/cases/${row.id}/evidence/${file.id}/download`,
    { headers: { Authorization: `Bearer ${tokens[user]}` } },
  );
  assert.equal(r.status, status);
  return r;
}
async function save() {
  await mkdir(resolve(root, "test-results"), { recursive: true });
  await writeFile(
    resolve(root, "test-results/phase3-integration.json"),
    JSON.stringify(
      { ...provenance, testedAt: new Date().toISOString(), cases, results },
      null,
      2,
    ),
  );
}
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: "pass" });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, status: "fail", message: e.message });
    await save();
    throw e;
  }
  await save();
}
const work = {
  measures: "Thay cáp và kiểm tra các đầu kết nối.",
  result: "Máy chiếu hoạt động ổn định trong 30 phút.",
};
await login();
let row, good;
await check(
  "concurrent creation keeps one case, one durable command and one process",
  async () => {
    const key = randomUUID(),
      payload = {
        title: `Tạo đồng thời ${Date.now()}`,
        roomId: "A101",
        assetId: "A101-PROJECTOR",
        description:
          "Năm yêu cầu tạo mới đồng thời cùng khóa và nội dung giả lập.",
      };
    const copies = await Promise.all(
      Array.from({ length: 5 }, () =>
        call("reporter", "/cases", payload, [200, 201, 202], {
          "Idempotency-Key": key,
        }),
      ),
    );
    row = await ready(copies[0].item.id);
    cases.push(row.id);
    // Exercise actual image/document bytes as well as text on the real store/scanner.
    // Reporting-step files remain visible but cannot satisfy the later repair-task gate.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvWQAAAAASUVORK5CYII=",
      "base64",
    );
    const pdf = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
    );
    for (const [data, filename, mime] of [
      [png, "anh-hien-trang.png", "image/png"],
      [pdf, "tai-lieu.pdf", "application/pdf"],
    ]) {
      const file = await upload(
        row,
        data,
        filename,
        randomUUID(),
        201,
        "reporter",
      );
      assert.equal(file.mime, mime);
      for (let i = 0; i < 90; i++) {
        const state = (
          await call("reporter", `/cases/${row.id}/evidence`)
        ).items.find((f) => f.id === file.id);
        if (state.scanStatus === "clean") break;
        if (i === 89) throw Error("Image/document scan timed out");
        await sleep(1000);
      }
      assert.deepEqual(
        Buffer.from(
          await (await download(row, file, "reporter")).arrayBuffer(),
        ),
        data,
      );
      const denied = inside(
        `const r=await fetch('http://seaweedfs:8333/clean/${row.id}/${file.id}');console.log(r.status);`,
      );
      assert.equal(denied.trim(), "403");
    }
    assert.ok(copies.every((c) => c.item.id === row.id));
    assert.equal(
      sql(
        `SELECT count(*) FROM workflow_commands WHERE case_id='${row.id}' AND action='created'`,
      ),
      "1",
    );
    const n = inside(
      `import {Flowable} from './apps/api/dist/workflow.js';const w=new Flowable(process.env.FLOWABLE_URL,process.env.FLOWABLE_USER,process.env.FLOWABLE_PASSWORD);console.log((await w.processesByBusinessKey('${row.id}')).length);`,
    );
    assert.equal(n.trim(), "1");
  },
);
await check(
  "simultaneous actions advance exactly once and reject stale revisions",
  async () => {
    const body = { action: "accept", revision: row.revision };
    const responses = await Promise.all(
      [1, 2].map(() =>
        fetch(`${base}/cases/${row.id}/actions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.coordinator}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      ),
    );
    assert.equal(
      responses.filter((r) => [200, 202].includes(r.status)).length,
      1,
    );
    assert.equal(
      responses.filter((r) => [403, 409].includes(r.status)).length,
      1,
    );
    row = await ready(row.id);
    assert.equal(row.status, "assignment");
    assert.equal(
      sql(
        `SELECT count(*) FROM case_events WHERE case_id='${row.id}' AND action='accept'`,
      ),
      "1",
    );
    row = await act(row, "coordinator", "assign", {
      technicianId: tech,
      approverId: approver,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    row = await act(row, "technician", "receive");
  },
);
await check(
  "missing evidence and spoofed, empty, oversized, unsafe-name files are blocked",
  async () => {
    assert.equal(
      (
        await call(
          "technician",
          `/cases/${row.id}/actions`,
          { action: "submit", revision: row.revision, ...work },
          409,
        )
      ).error.code,
      "EVIDENCE_REQUIRED",
    );
    await upload(
      row,
      Buffer.from("MZ fake image"),
      "fake.png",
      randomUUID(),
      400,
    );
    await upload(row, Buffer.alloc(0), "empty.txt", randomUUID(), 400);
    await upload(
      row,
      Buffer.alloc(10 * 1024 * 1024 + 1, 65),
      "large.txt",
      randomUUID(),
      413,
    );
    await upload(row, Buffer.from("safe"), "../unsafe.txt", randomUUID(), 400);
    assert.equal(
      (await files(row)).filter((f) => f.taskId === row.taskId).length,
      0,
    );
  },
);
await check(
  "worker outage leaves quarantine pending; replay is idempotent and pending cannot download or satisfy gate",
  async () => {
    docker(["stop", "worker"]);
    try {
      const data = Buffer.from("Biên bản kiểm tra và sửa chữa giả lập."),
        key = randomUUID();
      good = await upload(row, data, "bien-ban.txt", key);
      assert.equal(good.scanStatus, "pending");
      assert.equal(good.step, "repair");
      assert.equal(good.taskId, row.taskId);
      assert.equal(good.uploadedBy, tech);
      assert.equal(
        good.checksum,
        createHash("sha256").update(data).digest("hex"),
      );
      const replay = await upload(row, data, "bien-ban.txt", key, 200);
      assert.equal(replay.id, good.id);
      await upload(row, Buffer.from("Khác nội dung"), "bien-ban.txt", key, 409);
      await download(row, good, "technician", 409);
      await call(
        "technician",
        `/cases/${row.id}/actions`,
        { action: "submit", revision: row.revision, ...work },
        409,
      );
    } finally {
      docker(["start", "worker"]);
    }
    good = await scan(row, good.id, "clean");
    assert.match(good.scanVersion, /^ClamAV /);
    assert.ok(good.scannedAt);
    assert.equal(
      await (await download(row, good)).text(),
      "Biên bản kiểm tra và sửa chữa giả lập.",
    );
  },
);
await check(
  "real ClamAV rejects the EICAR test signature and rejects corrupted quarantine bytes",
  async () => {
    const badRow = await repair((await create()).item);
    // Harmless standard antivirus test signature, created only in memory.
    const signature = Buffer.from(
      [
        "X5O!P%@AP[4",
        "\\PZX54(P^)7CC)7}$",
        "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
      ].join(""),
    );
    const infected = await upload(badRow, signature, "antivirus-test.txt");
    await scan(badRow, infected.id, "rejected");
    await download(badRow, infected, "technician", 409);
    docker(["stop", "worker"]);
    let corrupt;
    try {
      corrupt = await upload(
        badRow,
        Buffer.from("Nội dung gốc cần kiểm tra"),
        "integrity.txt",
      );
      inside(
        `import {ObjectStore} from './apps/api/dist/storage.js';await new ObjectStore().put('${badRow.id}/${corrupt.id}',Buffer.from('altered bytes'));`,
      );
    } finally {
      docker(["start", "worker"]);
    }
    await scan(badRow, corrupt.id, "rejected");
    await download(badRow, corrupt, "technician", 409);
    await call(
      "technician",
      `/cases/${badRow.id}/actions`,
      { action: "submit", revision: badRow.revision, ...work },
      409,
    );
  },
);
await check(
  "scanner outage records visible error and automatically recovers without trusting unscanned files",
  async () => {
    docker(["stop", "clamav"]);
    let retry;
    try {
      retry = await upload(
        row,
        Buffer.from("Bằng chứng trong lúc máy quét gián đoạn"),
        "retry.txt",
      );
      await scan(row, retry.id, "error");
      await download(row, retry, "technician", 409);
    } finally {
      docker(["start", "clamav"]);
    }
    await scan(row, retry.id, "clean");
  },
);
await check(
  "case and file authorization, current role removal and membership revocation use a still-valid token",
  async () => {
    for (const path of [`/cases/${row.id}`, `/cases/${row.id}/evidence`])
      await call("admin", path, undefined, 404);
    await download(row, good, "admin", 404);
    await upload(
      row,
      Buffer.from("Nội dung không có quyền"),
      "wrong.txt",
      randomUUID(),
      404,
      "admin",
    );
    try {
      sql(`UPDATE memberships SET enabled=false WHERE subject_id='${tech}'`);
      for (const path of [
        `/cases/${row.id}`,
        `/cases/${row.id}/evidence`,
        "/cases",
        "/reports",
      ])
        await call("technician", path, undefined, 403);
      await download(row, good, "technician", 403);
      await upload(
        row,
        Buffer.from("Nội dung sau thu hồi"),
        "revoked.txt",
        randomUUID(),
        403,
      );
      await call(
        "technician",
        `/cases/${row.id}/actions`,
        { action: "submit", revision: row.revision, ...work },
        403,
      );
    } finally {
      sql(`UPDATE memberships SET enabled=true WHERE subject_id='${tech}'`);
    }
    try {
      sql(
        `UPDATE memberships SET roles=ARRAY['reporter'] WHERE subject_id='${tech}'`,
      );
      await call("technician", `/cases/${row.id}`, undefined, 404);
      await download(row, good, "technician", 404);
      const list = await call("technician", `/cases?q=${row.code}`);
      assert.equal(list.total, 0);
    } finally {
      sql(
        `UPDATE memberships SET roles=ARRAY['technician'] WHERE subject_id='${tech}'`,
      );
    }
    await download(row, good);
  },
);
await check(
  "removing team membership revokes the unclaimed team case without changing the token role",
  async () => {
    let team = (await create()).item;
    team = await act(team, "coordinator", "accept");
    team = await act(team, "coordinator", "assign", {
      teamId: "facilities",
      approverId: approver,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await call("technician", `/cases/${team.id}`);
    try {
      sql(
        `DELETE FROM team_members WHERE team_id='facilities' AND subject_id='${tech}'`,
      );
      await call("technician", `/cases/${team.id}`, undefined, 404);
      await call("technician", `/cases/${team.id}/evidence`, undefined, 404);
      assert.equal(
        (await call("technician", `/cases?mine=true&q=${team.code}`)).total,
        0,
      );
    } finally {
      sql(
        `INSERT INTO team_members(team_id,subject_id) VALUES('facilities','${tech}') ON CONFLICT DO NOTHING`,
      );
    }
    await call("technician", `/cases/${team.id}`);
  },
);
await check(
  "object-store outage fails closed and preserves files across restart; upload retries keep their key",
  async () => {
    docker(["stop", "seaweedfs"]);
    const key = randomUUID();
    try {
      await upload(
        row,
        Buffer.from("Bằng chứng qua lần lưu trữ gián đoạn"),
        "storage-retry.txt",
        key,
        503,
      );
    } finally {
      docker(["start", "seaweedfs"]);
    }
    for (let i = 0; i < 30; i++) {
      try {
        await download(row, good);
        break;
      } catch (e) {
        if (i === 29) throw e;
        await sleep(1000);
      }
    }
    const retry = await upload(
      row,
      Buffer.from("Bằng chứng qua lần lưu trữ gián đoạn"),
      "storage-retry.txt",
      key,
    );
    await scan(row, retry.id, "clean");
  },
);
await check(
  "submit pins evidence, policy, versions and actor audit; rework requires new evidence for its exact task",
  async () => {
    row = await act(row, "technician", "submit", work);
    const before = (await call("reporter", `/cases/${row.id}`)).timeline.find(
      (e) => e.action === "submit",
    );
    assert.ok(
      before.details.evidence.some(
        (e) => e.id === good.id && e.checksum === good.checksum,
      ),
    );
    assert.equal(before.details.evidencePolicyVersion, "g01-evidence@1.0.0");
    assert.equal(before.details.packageVersion, "g01@1.0.0");
    assert.equal(before.actorId, tech);
    const scans = (await call("reporter", `/cases/${row.id}`)).timeline.filter(
      (e) => e.action === "evidence_scanned",
    );
    assert.ok(
      scans.length > 0 &&
        scans.every(
          (e) =>
            e.actorId === "00000000-0000-4000-8000-000000000003" &&
            e.actorName === "Hệ thống quét tệp",
        ),
    );
    assert.ok(before.createdAt);
    row = await act(row, "approver", "return_work", {
      reason: "Cần kiểm tra và bổ sung ảnh sau điều chỉnh.",
    });
    await call(
      "technician",
      `/cases/${row.id}/actions`,
      { action: "submit", revision: row.revision, ...work },
      409,
    );
    const next = await upload(
      row,
      Buffer.from("Bằng chứng mới sau lần trả xử lý."),
      "rework.txt",
    );
    await scan(row, next.id, "clean");
    row = await act(row, "technician", "submit", work);
    row = await act(row, "approver", "approve");
    assert.equal(row.status, "closed");
  },
);
await check(
  "report totals and drill-down match visible case sets; overdue uses the actual deadline",
  async () => {
    let overdue = (await create()).item;
    const due = new Date(Date.now() + 5000).toISOString();
    overdue = await repair(overdue, due);
    await sleep(Math.max(0, new Date(due).getTime() - Date.now() + 300));
    for (const user of [
      "reporter",
      "coordinator",
      "technician",
      "approver",
      "admin",
    ]) {
      const report = await call(user, "/reports");
      for (const bucket of ["open", "overdue", "completed"]) {
        const list = await call(user, `/cases?bucket=${bucket}`);
        assert.equal(list.total, report[bucket]);
      }
      assert.equal(report.open + report.completed, report.total);
      if (user === "admin") assert.equal(report.total, 0);
    }
    const list = await call(
      "technician",
      `/cases?bucket=overdue&q=${overdue.code}`,
    );
    assert.equal(list.total, 1);
  },
);

// Create an isolated API process using the real production code and services, then
// terminate its executor at the precise post-engine/pre-DB-commit crash window.
function injected(operation, path, body) {
  const source = `import {createApp} from './apps/api/dist/app.js';import {pool} from './apps/api/dist/db.js';import {Flowable} from './apps/api/dist/workflow.js';import {remoteKey} from './apps/api/dist/auth.js';
 const w=new Flowable(process.env.FLOWABLE_URL,process.env.FLOWABLE_USER,process.env.FLOWABLE_PASSWORD);
 const orig=w.${operation}.bind(w);w.${operation}=async(...args)=>{await orig(...args);process.exit(77);};
 const app=createApp({pool,workflow:w,issuer:process.env.OIDC_ISSUER,audience:process.env.OIDC_AUDIENCE,key:remoteKey(process.env.OIDC_JWKS_URL),technicianId:'${tech}',definitionId:()=>'',g01DefinitionId:()=>${JSON.stringify(body.definitionId || row.definitionId)},readiness:async()=>({})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 await fetch('http://127.0.0.1:'+server.address().port+'/api/g01${path}',{method:'POST',headers:{Authorization:'Bearer ${tokens[body.actor || (operation === "startWithVariables" ? "reporter" : "coordinator")]}', 'Content-Type':'application/json','Idempotency-Key':'${body.key || randomUUID()}'},body:JSON.stringify(${JSON.stringify(body.payload)})});process.exit(78);`;
  try {
    inside(source);
    throw Error("Crash injection did not stop process");
  } catch (e) {
    assert.equal(e.status, 77, "executor must terminate after engine mutation");
  }
}
await login();
await check(
  "API process crash after engine start recovers to exactly one process after worker restart",
  async () => {
    docker(["stop", "worker"]);
    const key = randomUUID(),
      payload = {
        title: `Mất phản hồi khởi tạo ${Date.now()}`,
        roomId: "A101",
        description: "Kiểm chứng crash thật sau khi engine đã tạo quy trình.",
      };
    let id;
    try {
      injected("startWithVariables", "/cases", {
        key,
        payload,
        definitionId: row.definitionId,
      });
      id = sql(`SELECT id FROM cases WHERE idempotency_key='${key}'`);
      assert.ok(id);
      cases.push(id);
      assert.equal((await detail(id)).syncStatus, "pending");
    } finally {
      docker(["start", "worker"]);
    }
    const recovered = await ready(id);
    assert.equal(recovered.status, "verification");
    const replay = await call("reporter", "/cases", payload, 200, {
      "Idempotency-Key": key,
    });
    assert.equal(replay.item.id, id);
    const n = inside(
      `import {Flowable} from './apps/api/dist/workflow.js';const w=new Flowable(process.env.FLOWABLE_URL,process.env.FLOWABLE_USER,process.env.FLOWABLE_PASSWORD);console.log((await w.processesByBusinessKey('${id}')).length);`,
    );
    assert.equal(n.trim(), "1");
  },
);
await check(
  "API process crash after task completion reconciles by exact task history without repeating the action",
  async () => {
    const initial = (await create()).item;
    docker(["stop", "worker"]);
    try {
      injected("complete", `/cases/${initial.id}/actions`, {
        payload: { action: "accept", revision: initial.revision },
      });
      assert.equal((await detail(initial.id)).syncStatus, "pending");
    } finally {
      docker(["start", "worker"]);
    }
    const recovered = await ready(initial.id);
    assert.equal(recovered.status, "assignment");
    assert.equal(
      sql(
        `SELECT count(*) FROM case_events WHERE case_id='${initial.id}' AND action='accept'`,
      ),
      "1",
    );
  },
);
await check(
  "crash after claiming a team task resumes with the same repairer and one receipt event",
  async () => {
    let initial = (await create()).item;
    initial = await act(initial, "coordinator", "accept");
    initial = await act(initial, "coordinator", "assign", {
      teamId: "facilities",
      approverId: approver,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    docker(["stop", "worker"]);
    try {
      injected("claim", `/cases/${initial.id}/actions`, {
        actor: "technician",
        payload: { action: "receive", revision: initial.revision },
      });
    } finally {
      docker(["start", "worker"]);
    }
    const recovered = await ready(initial.id);
    assert.equal(recovered.status, "in_progress");
    assert.equal(recovered.technicianId, tech);
    assert.equal(
      sql(
        `SELECT count(*) FROM case_events WHERE case_id='${initial.id}' AND action='receive'`,
      ),
      "1",
    );
  },
);
await check(
  "engine outage preserves a pending case and worker restarts automatically reconcile it",
  async () => {
    docker(["stop", "flowable"]);
    const key = randomUUID(),
      payload = {
        title: `Engine gián đoạn ${Date.now()}`,
        roomId: "A101",
        description: "Hồ sơ giả lập tạo khi workflow engine chưa sẵn sàng.",
      };
    let pending;
    try {
      pending = (
        await call("reporter", "/cases", payload, 202, {
          "Idempotency-Key": key,
        })
      ).item;
      cases.push(pending.id);
      assert.notEqual(pending.syncStatus, "ready");
      const replay = await call("reporter", "/cases", payload, 202, {
        "Idempotency-Key": key,
      });
      assert.equal(replay.item.id, pending.id);
    } finally {
      docker(["start", "flowable"]);
    }
    const recovered = await ready(pending.id);
    assert.equal(recovered.status, "verification");
  },
);
await check(
  "an action accepted during engine outage is durably queued and completes after recovery",
  async () => {
    const initial = (await create()).item;
    docker(["stop", "flowable"]);
    try {
      const pending = await call(
        "coordinator",
        `/cases/${initial.id}/actions`,
        { action: "accept", revision: initial.revision },
        202,
      );
      assert.notEqual(pending.item.syncStatus, "ready");
      const d = await call("reporter", `/cases/${initial.id}`);
      assert.equal(d.synchronization.length, 1);
      assert.equal(d.synchronization[0].action, "accept");
    } finally {
      docker(["start", "flowable"]);
    }
    const recovered = await ready(initial.id);
    assert.equal(recovered.status, "assignment");
    assert.equal(
      sql(
        `SELECT count(*) FROM case_events WHERE case_id='${initial.id}' AND action='accept'`,
      ),
      "1",
    );
  },
);
await check(
  "engine business-key guard rejects duplicate start even after lost reply or completed process",
  async () => {
    const output = inside(
      `import {Flowable} from './apps/api/dist/workflow.js';const w=new Flowable(process.env.FLOWABLE_URL,process.env.FLOWABLE_USER,process.env.FLOWABLE_PASSWORD);let rejected=false;try{await w.startWithVariables('${row.definitionId}','${row.id}',{coordinator:'${row.coordinatorId}',reporter:'${row.reporterId}',technician:'',team:'',approver:'',dueAt:''});}catch{rejected=true;}console.log(JSON.stringify({rejected,count:(await w.processesByBusinessKey('${row.id}')).length}));`,
    );
    assert.deepEqual(JSON.parse(output), { rejected: true, count: 1 });
  },
);
await save();
console.log(
  `Phase 3 acceptance: ${results.length} checks passed. No tokens or passwords in report.`,
);
