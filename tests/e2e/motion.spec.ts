// SPDX-License-Identifier: Apache-2.0
import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";

const settings = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1),
    ]),
);
test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });

test("motion interpolates real chart data, preserves drafts and keeps disclosure keyboard behavior", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?view=g01");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await expect(page.locator(".pf-v5-c-login__main")).toHaveCSS(
    "animation-name",
    "schoolops-auth-arrive",
  );
  await page
    .getByLabel("Tên đăng nhập hoặc email", { exact: true })
    .fill("reporter");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator(".task-row").first()).toBeVisible();
  const overview = page.getByRole("button", { name: "Tổng quan", exact: true });
  const [frames] = await Promise.all([
    page.evaluate(
      () =>
        new Promise<{ opacity: number; dash: number }[]>((resolve) => {
          document
            .querySelector(".workspace-views button:last-child")!
            .addEventListener(
              "click",
              () => {
                const frames: { opacity: number; dash: number }[] = [];
                let start = 0;
                const read = (time: number) => {
                  start ||= time;
                  const region = document.querySelector(".g01")!;
                  const arc = document.querySelector(".chart-arc")!;
                  frames.push({
                    opacity: Number(getComputedStyle(region).opacity),
                    dash: parseFloat(getComputedStyle(arc).strokeDasharray),
                  });
                  if (time - start < 600) requestAnimationFrame(read);
                  else resolve(frames);
                };
                requestAnimationFrame(read);
              },
              { once: true },
            );
        }),
    ),
    overview.click(),
  ]);
  expect(frames.some((f) => f.opacity > 0.72 && f.opacity < 1)).toBe(true);
  expect(frames.at(-1)!.opacity).toBe(1);
  const arc = page.locator(".chart-arc").first();
  const target = parseFloat((await arc.getAttribute("stroke-dasharray"))!);
  if (target > 0)
    expect(frames.some((f) => f.dash > 0 && f.dash < target)).toBe(true);
  expect(frames.at(-1)!.dash).toBeCloseTo(target, 2);
  await page.screenshot({
    path: info.outputPath("overview-motion.png"),
    fullPage: true,
  });

  const scope = page.locator(".report-scope");
  const summary = scope.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(scope).toHaveAttribute("open", "");
  await expect
    .poll(() =>
      scope.evaluate((node) =>
        Number(getComputedStyle(node, "::details-content").opacity),
      ),
    )
    .toBe(1);
  await page.keyboard.press("Enter");
  await expect(scope).not.toHaveAttribute("open");
  await expect(summary).toBeFocused();

  await page.getByRole("button", { name: "Hồ sơ", exact: true }).click();
  await page
    .getByRole("button", { name: "Báo sự cố mới", exact: true })
    .click();
  const title = page.getByLabel("Tiêu đề sự cố", { exact: true });
  await title.fill("Bản nháp kiểm tra chuyển động");
  await page
    .getByRole("button", { name: "Đóng biểu mẫu", exact: true })
    .click();
  await overview.click();
  await page.getByRole("button", { name: "Hồ sơ", exact: true }).click();
  await page
    .getByRole("button", { name: "Tiếp tục bản nháp", exact: true })
    .click();
  await expect(title).toHaveValue("Bản nháp kiểm tra chuyển động");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(title).toHaveValue("Bản nháp kiểm tra chuyển động");
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    ),
  ).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("draft-reduced-mobile.png"),
    fullPage: true,
  });
});

test("reduced motion keeps authentication and guest controls immediately usable", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".welcome")).toHaveCSS("animation-name", "none");
  const login = page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ });
  await expect(login).toHaveCSS("transition-duration", "0s");
  await login.click();
  await expect(page.locator(".pf-v5-c-login__main")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator("#kc-login")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page
    .getByLabel("Tên đăng nhập hoặc email", { exact: true })
    .fill("motion-invalid-fixture");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("invalid-fixture");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const error = page
    .getByText(
      "Tên đăng nhập hoặc mật khẩu chưa đúng. Vui lòng kiểm tra và thử lại.",
      { exact: true },
    )
    .first();
  await expect(error).toBeVisible();
  await expect(error).toHaveCSS("animation-name", "none");
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    ),
  ).toBe(0);
  await page.screenshot({
    path: info.outputPath("login-reduced-mobile.png"),
    fullPage: true,
  });
});
