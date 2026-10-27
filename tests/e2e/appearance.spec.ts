// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test, expect } from "./fixtures.js";

test("glass surfaces have an opaque fallback, a persistent reduced-effects choice and mobile reflow", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Vận hành trường học", exact: true }),
  ).toBeVisible();
  const control = page.getByRole("button", {
    name: "Giảm hiệu ứng",
    exact: true,
  });
  await expect(control).toHaveAttribute("aria-pressed", "false");
  const blur = () =>
    page
      .locator(".topbar")
      .evaluate((node) => getComputedStyle(node).backdropFilter);
  const supported = await page.evaluate(() =>
    CSS.supports("backdrop-filter", "blur(1px)"),
  );
  if (supported) expect(await blur()).not.toBe("none");
  await page.screenshot({
    path: info.outputPath("glass-desktop.png"),
    fullPage: true,
  });

  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  expect(await blur()).toBe("none");
  await page.reload();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  expect(await blur()).toBe("none");
  await page.screenshot({
    path: info.outputPath("solid-desktop.png"),
    fullPage: true,
  });
  await control.click();
  await page.emulateMedia({ forcedColors: "active" });
  expect(await blur()).toBe("none");
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(control).toBeVisible();
    if (width === 390)
      await page.screenshot({
        path: info.outputPath("glass-mobile.png"),
        fullPage: true,
      });
  }
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Đến nội dung chính", exact: true }),
  ).toBeFocused();
});
