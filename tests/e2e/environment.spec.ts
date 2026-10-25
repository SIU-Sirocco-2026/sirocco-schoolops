import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";
import { client } from "../../scripts/test-client.mjs";
import { replay } from "../../scripts/replay-g02.mjs";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
test("officer traces PM2.5 raw data and closes shared case with clean evidence on mobile", async ({
  page,
}) => {
  test.setTimeout(120000);
  const c = await client(),
    run = await replay(c),
    row = await c.ready(run.episodes[0].caseId, "environment", "g02");
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel(/Username|Tên đăng nhập/).fill("environment");
  await page
    .getByLabel(/Password|Mật khẩu/, { exact: true })
    .fill(env.DEMO_PASSWORD!);
  await page
    .getByRole("button", { name: /Sign In|Đăng nhập/, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Môi trường PM2.5", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nguồn PM2.5", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: `Truy nguồn và mở hồ sơ ${row.code}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "Truy nguồn cảnh báo" }),
  ).toContainText("pm25-demo@1.0.0");
  await expect(page.locator(".case-code")).toHaveText(row.code);
  await page
    .getByRole("button", { name: "Xác nhận cần xử lý", exact: true })
    .click();
  await expect(page.locator(".case-detail > .status")).toHaveText("Đang xử lý");
  await page
    .getByLabel("Biện pháp xử lý", { exact: true })
    .fill("Kiểm tra thông gió và nguồn bụi minh họa.");
  await page
    .getByLabel("Kết quả xử lý", { exact: true })
    .fill("Đã thực hiện các biện pháp theo tình huống giả lập.");
  await page
    .getByLabel("Lý do đóng hồ sơ", { exact: true })
    .fill("Đã xác minh và hoàn thành công việc.");
  await expect(
    page.getByRole("button", { name: "Hoàn tất ứng phó và đóng", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Ảnh hoặc tài liệu bằng chứng (tối đa 10 MB)", { exact: true })
    .setInputFiles({
      name: "bien-ban-moi-truong.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Biên bản ứng phó môi trường giả lập"),
    });
  await page
    .getByRole("button", { name: "Tải bằng chứng", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Hoàn tất ứng phó và đóng", exact: true }),
  ).toBeEnabled({ timeout: 90000 });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/phase5-lineage-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Hoàn tất ứng phó và đóng", exact: true })
    .click();
  await expect(page.locator(".case-detail > .status")).toHaveText("Đã đóng");
  await expect(page.locator(".timeline").last()).toContainText(
    "Đã xác minh và hoàn thành công việc.",
  );
});
