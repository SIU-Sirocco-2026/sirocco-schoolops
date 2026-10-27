// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";

const settings = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const split = line.indexOf("=");
      return [line.slice(0, split), line.slice(split + 1)];
    }),
);

test("Vietnamese sign-in, linked case, mobile back navigation and readable metadata", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Vận hành trường học",
  );
  await page.screenshot({
    path: info.outputPath("01-welcome.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await expect(
    page.getByRole("heading", { name: "Đăng nhập SchoolOps", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.locator("#kc-header-wrapper")).toHaveCSS(
    "color",
    "rgb(32, 86, 63)",
  );
  await page.screenshot({
    path: info.outputPath("02-login.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Tên đăng nhập hoặc email", { exact: true })
    .fill("reporter");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sự cố cơ sở vật chất", exact: true }),
  ).toBeVisible();
  const title = `Kiểm tra giao diện máy chiếu ${Date.now()}`;
  await page
    .getByRole("button", { name: "Báo sự cố mới", exact: true })
    .click();
  await page.getByLabel("Tiêu đề sự cố", { exact: true }).fill(title);
  await page
    .getByLabel("Mô tả sự cố", { exact: true })
    .fill(
      "Tình huống giả lập để kiểm tra giao diện và điều hướng, không phải phản hồi người dùng.",
    );
  await page
    .getByRole("button", { name: "Gửi báo sự cố", exact: true })
    .click();
  const heading = page.locator(".case-detail h3").first();
  await expect(heading).toHaveText(title);
  await expect(heading).toBeFocused();
  await expect(page).toHaveURL(/view=g01.*case=[a-f0-9-]{36}/);
  const link = page.url();
  // Full-page capture otherwise paints sticky/fixed chrome at the form's old scroll offset.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("03-case-desktop.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(heading).toHaveText(title);
  await expect(page).toHaveURL(link);
  const metadataContrast = await page
    .locator(".timeline small")
    .first()
    .evaluate((node) => {
      const channels = getComputedStyle(node)
        .color.match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
      const luminance = channels
        .map((c) => c / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce(
          (sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index]!,
          0,
        );
      return 1.05 / (luminance + 0.05);
    });
  expect(metadataContrast).toBeGreaterThanOrEqual(4.5);
  await page.setViewportSize({ width: 390, height: 844 });
  const workspaceMenu = page.getByRole("button", {
    name: "Không gian làm việc",
    exact: true,
  });
  await expect(workspaceMenu).toHaveAttribute("aria-expanded", "false");
  await workspaceMenu.click();
  await expect(
    page.getByRole("navigation", { name: "Điều hướng" }),
  ).toBeVisible();
  await expect(workspaceMenu).toHaveAttribute("aria-expanded", "true");
  await workspaceMenu.click();
  await expect(
    page.getByRole("navigation", { name: "Điều hướng" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Về danh sách hồ sơ", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("04-case-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Về danh sách hồ sơ", exact: true })
    .click();
  await expect(page).not.toHaveURL(/case=/);
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Danh sách hồ sơ/ }),
  ).toBeFocused();
  await page.goBack();
  await expect(heading).toHaveText(title);
  await expect(page).toHaveURL(link);
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const missing = "00000000-0000-4000-8000-000000000000";
  await page.goto(`/?view=g01&case=${missing}`);
  await expect(page.locator(".detail-empty")).toContainText(
    "Chưa mở được hồ sơ",
  );
  await expect(
    page.getByRole("button", { name: "Làm mới hồ sơ", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Về danh sách hồ sơ", exact: true })
    .click();
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
