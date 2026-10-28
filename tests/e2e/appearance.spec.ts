// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test, expect } from "./fixtures.js";

test("G01 uses opaque application surfaces, a local brand asset and responsive keyboard navigation", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Vận hành trường học", exact: true }),
  ).toBeVisible();
  const logo = page.locator(".brand-mark");
  await expect(logo).toBeVisible();
  expect(
    await logo.evaluate(
      (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".topbar")
      .evaluate((node) => getComputedStyle(node).backdropFilter),
  ).toBe("none");
  await expect(
    page.getByRole("button", { name: "Giảm hiệu ứng", exact: true }),
  ).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`welcome-${width}.png`),
      fullPage: true,
    });
  }
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await expect(
    page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }),
  ).toBeEnabled();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }),
  ).toBeEnabled();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Đến nội dung chính", exact: true }),
  ).toBeFocused();
});
