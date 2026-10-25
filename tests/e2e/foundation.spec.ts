import { test, expect, type Page } from "./fixtures.js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
async function login(page: Page, username: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel(/Username|Tên đăng nhập/).fill(username);
  await page
    .getByLabel(/Password|Mật khẩu/, { exact: true })
    .fill(env.DEMO_PASSWORD!);
  await page
    .getByRole("button", { name: /Sign In|Đăng nhập/, exact: true })
    .click();
  await page.getByRole("button", { name: /^Nhiệm vụ nền tảng/ }).click();
  await expect(
    page.getByRole("heading", { name: "Công việc của tôi", exact: true }),
  ).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Công việc của tôi", exact: true }),
  ).toHaveCount(0);

  // Check the Identity session too: clicking login after logout must ask for
  // credentials instead of silently restoring the previous user through SSO.
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await expect(page.getByLabel(/Username|Tên đăng nhập/)).toBeVisible();
}
test("browser → Identity → gateway → API → database → Flowable task → completion", async ({
  browser,
}) => {
  const reporter = await browser.newContext();
  const technician = await browser.newContext();
  const reporterPage = await reporter.newPage(),
    techPage = await technician.newPage();
  const title = `Nhiệm vụ trình duyệt ${Date.now()}`;
  await login(reporterPage, "reporter");
  await reporterPage.getByLabel("Nội dung nhiệm vụ").fill(title);
  await reporterPage.getByRole("button", { name: /Tạo nhiệm vụ/ }).click();
  await expect(
    reporterPage.getByRole("button").filter({ hasText: title }),
  ).toBeVisible();
  await expect(
    reporterPage.getByRole("button", {
      name: "Xác nhận hoàn tất",
      exact: true,
    }),
  ).toHaveCount(0);
  await login(techPage, "technician");
  await techPage.getByRole("button").filter({ hasText: title }).click();
  await techPage
    .getByRole("button", { name: "Xác nhận hoàn tất", exact: true })
    .click();
  await expect(techPage.getByRole("status")).toContainText(
    "Đã hoàn tất nhiệm vụ",
  );
  await reporterPage
    .getByRole("button", { name: "Làm mới", exact: true })
    .click();
  await expect(
    reporterPage.getByRole("button").filter({ hasText: title }),
  ).toContainText("Đã hoàn tất");
  await reporterPage.screenshot({
    path: "test-results/foundation-desktop.png",
    fullPage: true,
  });
  await techPage.setViewportSize({ width: 390, height: 844 });
  await expect(
    techPage.getByRole("heading", { name: "Công việc của tôi", exact: true }),
  ).toBeVisible();
  expect(
    await techPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await techPage.screenshot({
    path: "test-results/foundation-mobile.png",
    fullPage: true,
  });
  await logout(reporterPage);
  await logout(techPage);
  await technician.close();
  await reporter.close();
});

for (const account of [
  { username: "coordinator", role: "Điều phối", canCreate: true },
  { username: "approver", role: "Nghiệm thu", canCreate: false },
  { username: "admin", role: "Quản trị kỹ thuật", canCreate: false },
]) {
  test(`seeded ${account.username} identity has the expected application permissions`, async ({
    page,
  }) => {
    await login(page, account.username);
    await expect(page.locator(".summary-role")).toContainText(account.role);
    await expect(page.getByLabel("Nội dung nhiệm vụ")).toHaveCount(
      account.canCreate ? 1 : 0,
    );
    await expect(
      page.getByRole("button", { name: "Xác nhận hoàn tất", exact: true }),
    ).toHaveCount(0);

    if (!account.canCreate) {
      await expect(
        page.getByRole("heading", { name: "Chưa có nhiệm vụ" }),
      ).toBeVisible();
    }
    await logout(page);
  });
}
