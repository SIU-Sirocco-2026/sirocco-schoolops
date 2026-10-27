// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test, expect, type Page } from "./fixtures.js";
import { readFileSync } from "node:fs";

const settings = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);

async function openTechnician(page: Page, code: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel("Tên đăng nhập hoặc email", { exact: true }).fill("technician");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toBeVisible();
  await page.getByLabel("Tìm hồ sơ", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page.getByRole("button").filter({ hasText: code }).click();
}

test("a confirmed upload survives a failed evidence refresh and a read retry never uploads twice", async ({ page }, info) => {
  test.setTimeout(120000);
  const { client, png } = await import("../../scripts/test-client.mjs");
  const c = await client();
  const row = await c.repair(await c.create());
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openTechnician(page, row.code);
  const section = page.getByRole("region", { name: "Bằng chứng hồ sơ", exact: true });
  await expect(section.getByRole("button", { name: "Chọn tệp", exact: true })).toBeVisible();
  await page.getByLabel("Biện pháp xử lý", { exact: true }).fill("Thử tải bằng chứng trên kết nối bị gián đoạn có chủ đích.");
  await page.getByLabel("Kết quả xử lý", { exact: true }).fill("Tình huống giả lập, chưa phải kết quả người dùng thật.");
  let posts = 0, failReads = false;
  await page.route(`**/api/g01/cases/${row.id}/evidence`, async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      // The POST still reaches the real API/store/scanner. Only subsequent reads fail.
      failReads = true;
      return route.continue();
    }
    if (failReads) return route.fulfill({
      status: 503,
      contentType: "text/html",
      body: "<html>deliberate read outage</html>",
    });
    await route.continue();
  });
  const filename = `bang-chung-mang-yeu-${Date.now()}.png`;
  await page.getByLabel("Ảnh hoặc tài liệu bằng chứng (tối đa 10 MB)", { exact: true })
    .setInputFiles({ name: filename, mimeType: "image/png", buffer: png });
  await section.getByRole("button", { name: "Tải bằng chứng", exact: true }).click();
  await expect(section.getByRole("status")).toContainText(`Đã nhận tệp ${filename}`);
  await expect(section.getByRole("alert")).toContainText("Chưa làm mới được danh sách bằng chứng");
  await expect(section.getByText("Chưa có bằng chứng.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Gửi nghiệm thu", exact: true })).toBeDisabled();
  expect(posts).toBe(1);
  const evidence = (await c.call("technician", `/g01/cases/${row.id}/evidence`)).items;
  expect(evidence.filter((item: { filename: string }) => item.filename === filename)).toHaveLength(1);
  await page.screenshot({ path: info.outputPath("upload-confirmed-read-failed.png"), fullPage: true });
  failReads = false;
  await section.getByRole("button", { name: "Làm mới bằng chứng", exact: true }).click();
  const entry = section.locator(".evidence-list li").filter({ has: page.getByText(filename, { exact: true }) });
  await expect(entry.locator(".scan-state")).toHaveText("Đã quét sạch", { timeout: 90000 });
  await expect(page.getByRole("button", { name: "Gửi nghiệm thu", exact: true })).toBeEnabled();
  expect(posts).toBe(1);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("upload-recovered.png"), fullPage: true });
  // Another client advances and returns the same case. A selection for the old task must clear.
  await page.getByLabel("Ảnh hoặc tài liệu bằng chứng (tối đa 10 MB)", { exact: true })
    .setInputFiles({ name: "chon-o-lan-cu.png", mimeType: "image/png", buffer: png });
  let next = await c.act(row, "technician", "submit", {
    measures: "Tình huống trả nghiệm thu giả lập.",
    result: "Dùng file đã quét sạch để chuyển bước thật.",
  });
  next = await c.act(next, "approver", "return_work", { reason: "Cần bổ sung bằng chứng cho lần xử lý mới." });
  expect(next.taskId).not.toBe(row.taskId);
  await page.getByRole("button", { name: "Làm mới hồ sơ", exact: true }).click();
  await expect(section.getByRole("button", { name: "Chọn tệp", exact: true })).toBeVisible();
  await expect(section.locator(".file-name")).toHaveText("Chưa chọn tệp");
  await expect(section.getByRole("status").filter({ hasText: "Đã nhận tệp" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Gửi nghiệm thu", exact: true })).toBeDisabled();
  expect(posts).toBe(1);
});

test("a delayed upload cannot become evidence for a later repair task", async ({ page }, info) => {
  test.setTimeout(120000);
  const { client, png, base } = await import("../../scripts/test-client.mjs");
  const { compose } = await import("../../scripts/ops-lib.mjs");
  const c = await client();
  const row = await c.repair(await c.create());
  await c.upload(row, "technician", png, "bang-chung-vong-dau.png");
  const replayKey = crypto.randomUUID();
  const uploadForReplay = (task: string) => fetch(`${base}/g01/cases/${row.id}/evidence`, {
    method: "POST", headers: { Authorization: `Bearer ${c.tokens.technician}`, "Content-Type": "application/octet-stream", "X-File-Name": "tep-giu-task-goc.png", "Idempotency-Key": replayKey, "X-Task-Id": task }, body: png,
  });
  const originalResponse = await uploadForReplay(row.taskId);
  expect(originalResponse.status).toBe(201);
  const originalFile = (await originalResponse.json()).item;
  function objects() {
    const code = `import {createRequire} from 'node:module';const require=createRequire(new URL('./apps/api/package.json',import.meta.url));const {S3Client,ListObjectsV2Command}=require('@aws-sdk/client-s3');const s3=new S3Client({endpoint:process.env.S3_ENDPOINT,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY,secretAccessKey:process.env.S3_SECRET_KEY}});const keys=[];try{for(const Bucket of ['quarantine','clean']){const r=await s3.send(new ListObjectsV2Command({Bucket,Prefix:${JSON.stringify(row.id + "/")}}));if(r.IsTruncated)throw Error('Unexpected object count for the isolated case');keys.push(...(r.Contents||[]).map(o=>o.Key));}console.log(JSON.stringify([...new Set(keys)].sort()));}finally{s3.destroy();}`;
    return JSON.parse(compose(["exec", "-T", "api", "node", "--input-type=module"], { input: code }).trim());
  }
  await openTechnician(page, row.code);
  const section = page.getByRole("region", { name: "Bằng chứng hồ sơ", exact: true });
  await expect(section.getByRole("button", { name: "Chọn tệp", exact: true })).toBeVisible();
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const arrived = new Promise<void>(resolve => { seen = resolve; });
  let taskHeader: string | undefined;
  const pattern = `**/api/g01/cases/${row.id}/evidence`;
  await page.route(pattern, async route => {
    if (route.request().method() === "POST") {
      taskHeader = route.request().headers()["x-task-id"];
      seen();
      await held;
    }
    await route.continue();
  });
  try {
    await page.getByLabel("Ảnh hoặc tài liệu bằng chứng (tối đa 10 MB)", { exact: true })
      .setInputFiles({ name: "tep-toi-muon-tu-vong-cu.png", mimeType: "image/png", buffer: png });
    await section.getByRole("button", { name: "Tải bằng chứng", exact: true }).click();
    await arrived;
    let next = await c.act(row, "technician", "submit", {
      measures: "Client khác hoàn tất vòng cũ khi POST còn bị giữ trên mạng.",
      result: "Tình huống giả lập kiểm ràng buộc bằng chứng theo task.",
    });
    next = await c.act(next, "approver", "return_work", { reason: "Cần thêm bằng chứng của vòng xử lý mới." });
    expect(next.taskId).not.toBe(row.taskId);
    const beforeFiles = await c.call("technician", `/g01/cases/${row.id}/evidence`);
    const beforeEvents = await c.call("technician", `/g01/cases/${row.id}`);
    const beforeObjects = objects();
    const received = page.waitForResponse(response => response.url().endsWith(`/g01/cases/${row.id}/evidence`) && response.request().method() === "POST");
    release();
    const response = await received;
    const result = await response.json();
    const afterFiles = await c.call("technician", `/g01/cases/${row.id}/evidence`);
    const afterEvents = await c.call("technician", `/g01/cases/${row.id}`);
    const afterObjects = objects();
    await info.attach("delayed-upload-outcome", {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ oldTask: row.taskId, newTask: next.taskId, taskHeader, status: response.status(), result, beforeFiles: beforeFiles.items.length, afterFiles: afterFiles.items.length, beforeObjects, afterObjects, beforeUploads: beforeEvents.timeline.filter((e: { action: string }) => e.action === "evidence_uploaded").length, afterUploads: afterEvents.timeline.filter((e: { action: string }) => e.action === "evidence_uploaded").length }, null, 2)),
    });
    expect(response.status()).toBe(409);
    expect(result.error.code).toBe("STALE_TASK");
    expect(taskHeader).toBe(row.taskId);
    expect(afterFiles.items.length).toBe(beforeFiles.items.length);
    expect(afterObjects).toEqual(beforeObjects);
    expect(afterEvents.timeline.filter((e: { action: string }) => e.action === "evidence_uploaded")).toHaveLength(beforeEvents.timeline.filter((e: { action: string }) => e.action === "evidence_uploaded").length);
    const replay = await uploadForReplay(row.taskId);
    expect(replay.status).toBe(200);
    const replayedFile = (await replay.json()).item;
    expect(replayedFile.id).toBe(originalFile.id);
    expect(replayedFile.taskId).toBe(row.taskId);
    const relabeled = await uploadForReplay(next.taskId);
    expect(relabeled.status).toBe(409);
    expect((await relabeled.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(objects()).toEqual(beforeObjects);
    await expect(section.getByRole("alert")).toContainText("Vòng xử lý đã thay đổi");
    await page.getByRole("button", { name: "Làm mới hồ sơ", exact: true }).click();
    await expect(section.locator(".file-name")).toHaveText("Chưa chọn tệp");
    await expect(page.getByRole("button", { name: "Gửi nghiệm thu", exact: true })).toBeDisabled();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath("late-upload-rejected.png"), fullPage: true });
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
