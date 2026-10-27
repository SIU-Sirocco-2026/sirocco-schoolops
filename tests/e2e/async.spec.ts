// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";

const settings = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }),
);

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

test("an obsolete list failure cannot clear the latest loading state or show a stale error", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel("Tên đăng nhập hoặc email", { exact: true }).fill("reporter");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator(".loading")).toHaveCount(0);
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toBeVisible();

  const first = gate(), second = gate(), firstSeen = gate(), secondSeen = gate();
  // Deliberate read-only network fault injection. Identity and UI actions remain real.
  await page.route("**/api/g01/cases?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "old-query") {
      firstSeen.release();
      await first.promise;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Lỗi truy vấn cũ cần bỏ qua." } }) });
    } else if (query === "new-query") {
      secondSeen.release();
      await second.promise;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) });
    } else await route.continue();
  });
  try {
    const search = page.getByLabel("Tìm hồ sơ", { exact: true });
    await search.fill("old-query");
    await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
    await firstSeen.promise;
    await search.fill("new-query");
    await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
    await secondSeen.promise;
    const obsoleteResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get("q") === "old-query");
    first.release();
    await obsoleteResponse;
    // Allow the old promise's catch/finally to run, while the latest request is still held.
    await page.waitForTimeout(150);
    await expect(page.getByText("Đang tải hồ sơ…", { exact: true })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Lỗi truy vấn cũ" })).toHaveCount(0);
    second.release();
    await expect(page.getByText("Đang tải hồ sơ…", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Chưa có hồ sơ phù hợp", exact: true })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Lỗi truy vấn cũ" })).toHaveCount(0);
  } finally {
    first.release();
    second.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
