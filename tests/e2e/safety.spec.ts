import { test, expect, type Page } from "./fixtures.js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
async function login(page: Page, user: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel(/Username|Tên đăng nhập/).fill(user);
  await page
    .getByLabel(/Password|Mật khẩu/, { exact: true })
    .fill(env.DEMO_PASSWORD!);
  await page
    .getByRole("button", { name: /Sign In|Đăng nhập/, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Đăng xuất", exact: true }),
  ).toBeVisible();
  if (user !== "reporter")
    await page
      .getByRole("button", { name: "An toàn hạn chế", exact: true })
      .click();
}
async function open(page: Page, title: string) {
  await page.getByLabel("Tìm hồ sơ", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page.getByRole("button").filter({ hasText: title }).click();
  await expect(page.locator(".case-detail h3").first()).toHaveText(title);
}
test("three safety roles complete a restricted case with shared UI, clean evidence, notification and access log", async ({
  browser,
}) => {
  test.setTimeout(150000);
  const contexts = await Promise.all(
      [1, 2, 3, 4].map(() =>
        browser.newContext({ viewport: { width: 390, height: 844 } }),
      ),
    ),
    [r, s, a, outsider] = await Promise.all(contexts.map((c) => c.newPage()));
  const title = `Kiểm tra vật cản hành lang giả lập ${Date.now()}`;
  await login(r!, "safety_reporter");
  await r!.getByRole("button", { name: "Báo sự cố mới", exact: true }).click();
  await r!.getByLabel("Tiêu đề sự cố", { exact: true }).fill(title);
  await r!.getByLabel("Thiết bị", { exact: true }).selectOption("");
  await r!
    .getByLabel("Mô tả sự cố", { exact: true })
    .fill(
      "Phản ánh giả lập trung tính về vật cản ở hành lang, không có danh tính thật.",
    );
  await r!.getByRole("button", { name: "Gửi báo sự cố", exact: true }).click();
  await expect(r!.locator(".case-code")).toHaveText(/^G03-/);
  const code = await r!.locator(".case-code").innerText();
  await login(outsider!, "reporter");
  await expect(
    outsider!.getByRole("button", { name: "An toàn hạn chế", exact: true }),
  ).toHaveCount(0);
  await outsider!.getByLabel("Tìm hồ sơ", { exact: true }).fill(title);
  await outsider!
    .getByRole("button", { name: "Tìm kiếm", exact: true })
    .click();
  await expect(
    outsider!.getByRole("button").filter({ hasText: title }),
  ).toHaveCount(0);
  await login(s!, "safety");
  await open(s!, title);
  await s!
    .getByRole("button", { name: "Tiếp nhận sự cố", exact: true })
    .click();
  await s!
    .getByLabel("Người hoặc nhóm xử lý", { exact: true })
    .selectOption("person:99999999-9999-4999-8999-999999999999");
  await s!
    .getByLabel("Người nghiệm thu", { exact: true })
    .selectOption("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  const due = new Date(Date.now() + 86400000);
  await s!
    .getByLabel("Hạn hoàn thành", { exact: true })
    .fill(
      `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}T15:00`,
    );
  await s!.getByRole("button", { name: "Giao xử lý", exact: true }).click();
  await s!.getByRole("button", { name: "Nhận xử lý", exact: true }).click();
  await expect(
    s!.getByRole("region", { name: "Bằng chứng hồ sơ", exact: true }),
  ).toHaveCount(1);
  await s!
    .getByLabel("Biện pháp xử lý", { exact: true })
    .fill("Kiểm tra và di chuyển vật cản giả lập.");
  await s!
    .getByLabel("Kết quả xử lý", { exact: true })
    .fill("Đã kiểm tra hành lang trong tình huống demo.");
  await expect(
    s!.getByRole("button", { name: "Gửi nghiệm thu", exact: true }),
  ).toBeDisabled();
  await s!
    .getByLabel("Ảnh hoặc tài liệu bằng chứng (tối đa 10 MB)", { exact: true })
    .setInputFiles({
      name: "bien-ban-an-toan.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Biên bản giả lập, không có dữ liệu cá nhân thật."),
    });
  await s!.getByRole("button", { name: "Tải bằng chứng", exact: true }).click();
  await expect(
    s!.getByRole("button", { name: "Gửi nghiệm thu", exact: true }),
  ).toBeEnabled({ timeout: 90000 });
  await s!.getByRole("button", { name: "Gửi nghiệm thu", exact: true }).click();
  await login(a!, "safety_reviewer");
  await a!
    .getByRole("button", { name: `Mở thông báo ${code}`, exact: true })
    .first()
    .click();
  await expect(a!.locator(".case-code")).toHaveText(code);
  await a!
    .getByRole("button", { name: "Phê duyệt và đóng hồ sơ", exact: true })
    .click();
  await expect(a!.locator(".case-detail > .status")).toHaveText("Đã đóng");
  await expect(
    a!.getByRole("region", { name: "Bằng chứng hồ sơ", exact: true }),
  ).toHaveCount(1);
  await a!
    .getByRole("button", { name: "Xem nhật ký truy cập", exact: true })
    .click();
  await expect(
    a!.getByText("case_detail · Được cấp quyền", { exact: true }).first(),
  ).toBeVisible();
  await a!.setViewportSize({ width: 390, height: 844 });
  expect(
    await a!.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await a!
    .locator(".case-detail")
    .screenshot({ path: "test-results/phase6-restricted-mobile.png" });
  for (const context of contexts) await context.close();
});
