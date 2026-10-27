// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test, expect } from "./fixtures.js";
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

test("a confirmed upload survives a failed evidence refresh and a read retry never uploads twice", async ({ page }, info) => {
  test.setTimeout(120000);
  const { client, png } = await import("../../scripts/test-client.mjs");
  const c = await client();
  const row = await c.repair(await c.create());
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel("Tên đăng nhập hoặc email", { exact: true }).fill("technician");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toBeVisible();
  await page.getByLabel("Tìm hồ sơ", { exact: true }).fill(row.code);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page.getByRole("button").filter({ hasText: row.code }).click();
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
