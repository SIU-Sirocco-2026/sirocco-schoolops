import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evidenceContext } from "./evidence.mjs";
const provenance = evidenceContext();
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
const base = "http://localhost:8088";
const results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, status: "pass" });
  console.log(`PASS ${name}`);
}
async function access(username) {
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
      signal: AbortSignal.timeout(10000),
    },
  );
  assert.equal(response.status, 200, `Identity login failed for ${username}`);
  return (await response.json()).access_token;
}
const ready = await fetch(`${base}/api/health/ready`, {
  signal: AbortSignal.timeout(10000),
});
await check("gateway and core readiness", async () => {
  assert.equal(ready.status, 200);
  assert.equal(ready.headers.get("X-Sirocco-Gateway"), "APISIX");
});
await check("missing/invalid tokens rejected", async () => {
  assert.equal((await fetch(`${base}/api/me`)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/api/me`, {
        headers: { Authorization: "Bearer invalid" },
      })
    ).status,
    401,
  );
});
const reporter = await access("reporter"),
  technician = await access("technician"),
  approver = await access("approver");
const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});
await check("identity and database membership", async () => {
  const response = await fetch(`${base}/api/me`, {
    headers: headers(reporter),
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).user.roles, ["reporter"]);
});
const key = crypto.randomUUID();
const payload = { title: `Kiểm tra tích hợp ${new Date().toISOString()}` };
let item;
await check("create an engine-backed task", async () => {
  const response = await fetch(`${base}/api/foundation/tasks`, {
    method: "POST",
    headers: { ...headers(reporter), "Idempotency-Key": key },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 201);
  item = (await response.json()).item;
  assert.equal(item.status, "waiting");
  assert.ok(item.processId);
  assert.ok(item.definitionId);
});
await check(
  "repeated requests keep one task and conflicting content is rejected",
  async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${base}/api/foundation/tasks`, {
          method: "POST",
          headers: { ...headers(reporter), "Idempotency-Key": key },
          body: JSON.stringify(payload),
        }),
      ),
    );
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal((await response.json()).item.id, item.id);
    }
    assert.equal(
      (
        await fetch(`${base}/api/foundation/tasks`, {
          method: "POST",
          headers: { ...headers(reporter), "Idempotency-Key": key },
          body: JSON.stringify({ title: "Nội dung khác với cùng khóa" }),
        })
      ).status,
      409,
    );
  },
);
await check("wrong roles cannot create or complete tasks", async () => {
  assert.equal(
    (
      await fetch(`${base}/api/foundation/tasks`, {
        method: "POST",
        headers: {
          ...headers(technician),
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/api/foundation/tasks/${item.id}/complete`, {
        method: "POST",
        headers: headers(reporter),
      })
    ).status,
    403,
  );
  const list = await (
    await fetch(`${base}/api/foundation/tasks`, { headers: headers(approver) })
  ).json();
  assert.equal(
    list.items.some((t) => t.id === item.id),
    false,
  );
});
await check(
  "assigned technician sees and completes the real workflow",
  async () => {
    const list = await (
      await fetch(`${base}/api/foundation/tasks`, {
        headers: headers(technician),
      })
    ).json();
    assert.equal(list.items.find((t) => t.id === item.id)?.canComplete, true);
    const response = await fetch(
      `${base}/api/foundation/tasks/${item.id}/complete`,
      { method: "POST", headers: headers(technician) },
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).item.status, "completed");
  },
);
await check(
  "completion can be repeated and result stays visible to creator",
  async () => {
    assert.equal(
      (
        await fetch(`${base}/api/foundation/tasks/${item.id}/complete`, {
          method: "POST",
          headers: headers(technician),
        })
      ).status,
      200,
    );
    const list = await (
      await fetch(`${base}/api/foundation/tasks`, {
        headers: headers(reporter),
      })
    ).json();
    const saved = list.items.find((t) => t.id === item.id);
    assert.equal(saved.status, "completed");
    assert.ok(saved.completedAt);
  },
);
await mkdir(resolve(root, "test-results"), { recursive: true });
await writeFile(
  resolve(root, "test-results/integration.json"),
  JSON.stringify(
    {
      ...provenance,
      testedAt: new Date().toISOString(),
      runId: item.id,
      processId: item.processId,
      results,
    },
    null,
    2,
  ),
);
console.log(
  "Integration verification passed. No credentials or tokens were written to the report.",
);
