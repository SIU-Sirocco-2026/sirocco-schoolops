// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";
const settings = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

test("overview totals retain their permission scope, drill into real lists and preserve a hidden creation draft", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const { client } = await import("../../scripts/test-client.mjs");
  const c = await client();
  const row = await c.create();
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page
    .getByLabel("Tên đăng nhập hoặc email", { exact: true })
    .fill("reporter");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const summary = page.getByRole("region", {
    name: "Báo cáo hồ sơ",
    exact: true,
  });
  const applied = page.locator(".filter-summary");
  const overview = page.getByRole("button", { name: "Tổng quan", exact: true });
  await expect(applied).toContainText("Đang xem: Tất cả.");
  await expect(page.locator(".case-detail-panel")).toBeHidden();
  await overview.click();
  await expect(summary).toContainText("Quá hạn là một phần của đang mở");
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toBeHidden();
  const report = await c.call("reporter", "/g01/reports");
  await expect(
    summary.getByRole("button", { name: /^Tất cả/ }).locator("strong"),
  ).toHaveText(String(report.total));
  await expect(summary.getByRole("img")).toHaveAttribute(
    "aria-label",
    `${report.open} đang mở, ${report.completed} hoàn thành trên tổng ${report.total} hồ sơ`,
  );
  await expect(summary.locator(".distribution-filter")).toHaveCount(3);
  await summary
    .getByRole("button", {
      name: `Xem nhóm Hoàn thành: ${report.completed} hồ sơ`,
      exact: true,
    })
    .click();
  await expect(applied).toContainText(
    `Đang xem: Hoàn thành. ${report.completed} hồ sơ phù hợp`,
  );
  await overview.click();
  await summary.getByRole("button", { name: /^Tất cả/ }).click();
  await page.getByLabel("Tìm hồ sơ", { exact: true }).fill(row.code);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(applied).toContainText(`Tìm “${row.code}”`);
  await expect(applied).toContainText("1 hồ sơ phù hợp");
  await page.getByLabel("Trạng thái", { exact: true }).selectOption("closed");
  await page.getByLabel("Công việc của tôi", { exact: true }).check();
  await expect(applied).toContainText("Đã đóng");
  await expect(applied).toContainText("Công việc của tôi");
  await expect(applied).toContainText("0 hồ sơ phù hợp");
  await overview.click();
  await expect(
    summary.getByRole("button", { name: /^Tất cả/ }).locator("strong"),
  ).toHaveText(String(report.total));
  await page.getByRole("button", { name: "Hồ sơ", exact: true }).click();
  await page
    .getByRole("button", { name: "Báo sự cố mới", exact: true })
    .click();
  const draft = `Nháp giả lập giữ khi bỏ lọc ${Date.now()}`;
  await page.getByLabel("Tiêu đề sự cố", { exact: true }).fill(draft);
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toBeHidden();
  await expect(page.locator(".case-list-panel")).toBeHidden();
  await page
    .getByRole("button", { name: "Đóng biểu mẫu", exact: true })
    .click();
  let dialogs = 0;
  page.on("dialog", async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Bỏ bộ lọc", exact: true }).click();
  await expect(applied).toContainText(
    `Đang xem: Tất cả. ${report.total} hồ sơ phù hợp · Trang 1 /`,
  );
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Trạng thái", { exact: true })).toHaveValue("");
  await expect(
    page.getByLabel("Công việc của tôi", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Tiếp tục bản nháp", exact: true })
    .click();
  await expect(page.getByLabel("Tiêu đề sự cố", { exact: true })).toHaveValue(
    draft,
  );
  // Switching to overview hides the form without discarding its in-memory draft.
  await overview.click();
  await expect(summary).toBeVisible();
  await summary.getByRole("button", { name: /^Đang mở/ }).click();
  await expect(applied).toContainText(
    `Đang xem: Đang mở. ${report.open} hồ sơ phù hợp`,
  );
  await overview.click();
  await expect(
    summary.getByRole("button", { name: /^Đang mở/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(dialogs).toBe(0);
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`overview-${width}.png`),
      fullPage: true,
    });
  }
});
