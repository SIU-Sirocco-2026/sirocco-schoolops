// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evidenceContext } from "./evidence.mjs";
import { local } from "./local-config.mjs";
export const root = resolve(import.meta.dirname, "..");
export const base = `${local.webOrigin}/api`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function gatewayFetch(url, options) {
  const response = await fetch(url, options);
  const reset = Number(response.headers.get("X-RateLimit-Reset"));
  // APISIX rejects these requests before forwarding them to the API. Only
  // replay this explicit rejection, preserving the body and idempotency key.
  if (
    response.status !== 429 ||
    response.headers.get("X-Sirocco-Gateway") !== "APISIX" ||
    !response.headers.has("X-RateLimit-Reset") ||
    !Number.isFinite(reset) ||
    reset < 0 ||
    reset > 60
  )
    return response;
  await response.arrayBuffer();
  console.log(`Gateway quota reached; waiting ${reset}s before one retry.`);
  await sleep(Math.ceil(reset * 1000) + 100);
  return fetch(url, options);
}
export async function client() {
  const env = Object.fromEntries(
    (await readFile(resolve(root, ".env"), "utf8"))
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  const tokens = {};
  async function login(user) {
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
    return tokens[user];
  }
  async function call(user, path, body, expected = 200, headers = {}) {
    if (!tokens[user]) await login(user);
    const r = await gatewayFetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${tokens[user]}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${user} ${path}: HTTP ${r.status}, expected JSON`);
    }
    assert.ok(
      (Array.isArray(expected) ? expected : [expected]).includes(r.status),
      `${user} ${path}: ${r.status} ${JSON.stringify(data)}`,
    );
    return data;
  }
  async function ready(id, user = "reporter", prefix = "g01") {
    for (let i = 0; i < 90; i++) {
      const r = await call(user, `/${prefix}/cases/${id}`);
      if (r.item.syncStatus === "ready") return r.item;
      await sleep(1000);
    }
    throw Error(`Pending ${id}`);
  }
  async function act(row, user, action, fields = {}, prefix = "g01") {
    const r = await call(
      user,
      `/${prefix}/cases/${row.id}/actions`,
      { action, revision: row.revision, ...fields },
      [200, 202],
    );
    return r.item.syncStatus === "ready" ? r.item : ready(row.id, user, prefix);
  }
  async function create() {
    const r = await call(
      "reporter",
      "/g01/cases",
      {
        title: `Kiểm chứng ${Date.now()}`,
        roomId: "A101",
        assetId: "A101-PROJECTOR",
        description: "Hồ sơ giả lập kiểm chứng gói nghiệp vụ và phiên bản.",
      },
      [201, 202],
      { "Idempotency-Key": crypto.randomUUID() },
    );
    return ready(r.item.id);
  }
  async function repair(row) {
    row = await act(row, "coordinator", "accept");
    row = await act(row, "coordinator", "assign", {
      technicianId: "33333333-3333-4333-8333-333333333333",
      approverId: "44444444-4444-4444-8444-444444444444",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    return act(row, "technician", "receive");
  }
  async function upload(row, user, data, filename, prefix = "g01") {
    if (!tokens[user]) await login(user);
    const r = await gatewayFetch(`${base}/${prefix}/cases/${row.id}/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens[user]}`,
        "Content-Type": "application/octet-stream",
        "X-File-Name": encodeURIComponent(filename),
        "X-Task-Id": row.taskId,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: data,
    });
    const d = await r.json();
    assert.equal(r.status, 201, JSON.stringify(d));
    for (let i = 0; i < 90; i++) {
      const e = (
        await call(user, `/${prefix}/cases/${row.id}/evidence`)
      ).items.find((f) => f.id === d.item.id);
      if (e.scanStatus === "clean") return e;
      if (e.scanStatus === "rejected") throw Error(e.scanMessage);
      await sleep(1000);
    }
    throw Error("Scanner timeout");
  }
  return { call, login, tokens, ready, act, create, repair, upload };
}
export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvWQAAAAASUVORK5CYII=",
  "base64",
);
export async function recorder(name) {
  const provenance = evidenceContext();
  const results = [];
  async function check(title, fn) {
    try {
      await fn();
      results.push({ name: title, status: "pass" });
      console.log(`PASS ${title}`);
    } catch (e) {
      results.push({ name: title, status: "fail", message: e.message });
      throw e;
    } finally {
      await mkdir(resolve(root, "test-results"), { recursive: true });
      await writeFile(
        resolve(root, `test-results/${name}.json`),
        JSON.stringify(
          { ...provenance, testedAt: new Date().toISOString(), results },
          null,
          2,
        ),
      );
    }
  }
  return { check, results };
}
