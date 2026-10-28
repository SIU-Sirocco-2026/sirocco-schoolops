// SPDX-License-Identifier: Apache-2.0
import { test, expect } from "./fixtures.js";

test("home explains each space, supports keyboard tours and stays responsive", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const privateRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (/\/api\/(g01|g02|g03|packs|foundation)\//.test(request.url()))
      privateRequests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Vận hành trường học",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("complementary")).toHaveCount(0);
  const login = page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ });
  await expect(login).toBeEnabled();
  const tabs = page.getByRole("tablist", { name: "Khám phá không gian" });
  await tabs.getByRole("tab", { name: "Cơ sở vật chất", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    tabs.getByRole("tab", { name: "Môi trường", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Từ cảnh báo đến hành động cụ thể.",
  );
  await page.keyboard.press("End");
  await expect(page.getByRole("tabpanel")).toContainText(
    "Phối hợp xử lý trong đúng phạm vi.",
  );
  await page.keyboard.press("Home");
  await expect(page.getByRole("tabpanel")).toContainText(
    "Sự cố được theo dõi đến khi hoàn tất.",
  );
  await page
    .getByRole("button", { name: "Nghiệm thu Người được giao", exact: true })
    .click();
  await expect(page.locator(".home-stage-description")).toContainText(
    "trả lại kèm lý do",
  );
  await page.locator(".home-access summary").click();
  await expect(page.getByText("Quản trị gói", { exact: true })).toBeVisible();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: "SchoolOps trang chủ", exact: true }),
    ).toBeVisible();
    expect(
      (await page
        .getByRole("link", { name: "Tính năng", exact: true })
        .boundingBox())!.height,
    ).toBeLessThan(25);
    expect((await login.boundingBox())!.y).toBeLessThan(650);
    const footerGap = await page.evaluate(
      () =>
        document.documentElement.scrollHeight -
        document.querySelector(".page-footer")!.getBoundingClientRect().bottom -
        scrollY,
    );
    expect(footerGap).toBeLessThan(40);
    if ([1440, 390, 320].includes(width))
      await page.screenshot({
        path: info.outputPath(`home-${width}.png`),
        fullPage: true,
      });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await tabs.getByRole("tab", { name: "An toàn", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toHaveCSS("animation-name", "none");
  await page
    .getByRole("button", { name: "Xử lý Kỹ thuật", exact: true })
    .click();
  await expect(page.locator(".home-stage-description p")).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
  expect(privateRequests).toEqual([]);
});

test("home exposes connection recovery when configuration is unavailable", async ({
  page,
}) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Chưa kết nối được API");
  await expect(
    page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }),
  ).toBeDisabled();
  await page.unroute("**/api/config");
  await page.getByRole("button", { name: "Kết nối lại", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }),
  ).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
