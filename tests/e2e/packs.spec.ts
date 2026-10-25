import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";
import { client } from "../../scripts/test-client.mjs";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
test("admin sees active and installed pack revisions and rejected validation errors", async ({
  page,
}) => {
  const c = await client();
  await c.call(
    "admin",
    "/packs/validate",
    { manifest: { id: "g01", version: "broken" } },
    400,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel(/Username|Tên đăng nhập/).fill("admin");
  await page
    .getByLabel(/Password|Mật khẩu/, { exact: true })
    .fill(env.DEMO_PASSWORD!);
  await page
    .getByRole("button", { name: /Sign In|Đăng nhập/, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Gói nghiệp vụ", exact: true })
    .click();
  await expect(
    page.locator(".packs .evidence-list li").filter({ hasText: "g01 · 1.0.0" }),
  ).toContainText("Đang kích hoạt");
  await expect(page.locator(".packs .timeline")).toContainText(
    "validation_failed",
  );
  await expect(page.locator(".packs .timeline .error").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/phase4-pack-admin-mobile.png",
    fullPage: true,
  });
});
