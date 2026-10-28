// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";
const settings = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#")).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));

test("report totals keep their permission scope while filters combine and reset without discarding a creation form", async ({ page }, info) => {
  test.setTimeout(90000);
  const { client } = await import("../../scripts/test-client.mjs");
  const c = await client();
  const row = await c.create();
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel("Tên đăng nhập hoặc email", { exact: true }).fill("reporter");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const summary = page.getByRole("region", { name: "Báo cáo hồ sơ", exact: true });
  const applied = page.locator(".filter-summary");
  await expect(summary).toContainText("không phụ thuộc bộ lọc bên dưới");
  await expect(applied).toContainText("Đang xem: Tất cả.");
  const report = await c.call("reporter", "/g01/reports");
  await expect(summary.getByRole("button", { name: /^Tất cả/ }).locator("strong")).toHaveText(String(report.total));

  await page.getByLabel("Tìm hồ sơ", { exact: true }).fill(row.code);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(applied).toContainText(`Tìm “${row.code}”`);
  await expect(applied).toContainText("1 hồ sơ phù hợp");
  await expect(summary.getByRole("button", { name: /^Tất cả/ }).locator("strong")).toHaveText(String(report.total));
  await page.getByLabel("Trạng thái", { exact: true }).selectOption("closed");
  await page.getByLabel("Công việc của tôi", { exact: true }).check();
  await expect(applied).toContainText("Đã đóng");
  await expect(applied).toContainText("Công việc của tôi");
  await expect(applied).toContainText("0 hồ sơ phù hợp");
  await expect(page.getByRole("heading", { name: "Chưa có việc cần bạn thao tác", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Báo sự cố mới", exact: true }).click();
  const draft = `Nháp giả lập giữ khi bỏ lọc ${Date.now()}`;
  await page.getByLabel("Tiêu đề sự cố", { exact: true }).fill(draft);
  let dialogs = 0;
  page.on("dialog", async dialog => { dialogs++; await dialog.dismiss(); });
  await page.getByRole("button", { name: "Bỏ bộ lọc", exact: true }).click();
  await expect(applied).toContainText(`Đang xem: Tất cả. ${report.total} hồ sơ phù hợp · Trang 1 /`);
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Trạng thái", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Công việc của tôi", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Tiêu đề sự cố", { exact: true })).toHaveValue(draft);
  await expect(page.getByRole("button", { name: "Bỏ bộ lọc", exact: true })).toBeDisabled();
  expect(dialogs).toBe(0);

  await summary.getByRole("button", { name: /^Đang mở/ }).click();
  await expect(applied).toContainText(`Đang xem: Đang mở. ${report.open} hồ sơ phù hợp`);
  await expect(summary.getByRole("button", { name: /^Đang mở/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Bỏ bộ lọc", exact: true }).click();
  await expect(summary.getByRole("button", { name: /^Tất cả/ })).toHaveAttribute("aria-pressed", "true");
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await info.attach(`filters-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  }
});
