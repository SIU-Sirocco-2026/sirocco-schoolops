// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";

const settings = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("an obsolete list failure cannot clear the latest loading state or show a stale error", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page
    .getByLabel("Tên đăng nhập hoặc email", { exact: true })
    .fill("reporter");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toBeVisible();
  await expect(page.locator(".loading")).toHaveCount(0);

  const first = gate(),
    second = gate(),
    firstSeen = gate(),
    secondSeen = gate();
  // Deliberate read-only network fault injection. Identity and UI actions remain real.
  await page.route("**/api/g01/cases?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "old-query") {
      firstSeen.release();
      await first.promise;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Lỗi truy vấn cũ cần bỏ qua." },
        }),
      });
    } else if (query === "new-query") {
      secondSeen.release();
      await second.promise;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      });
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
    const obsoleteResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).searchParams.get("q") === "old-query",
    );
    first.release();
    await obsoleteResponse;
    // Allow the old promise's catch/finally to run, while the latest request is still held.
    await page.waitForTimeout(150);
    await expect(
      page.getByText("Đang tải hồ sơ…", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "Lỗi truy vấn cũ" }),
    ).toHaveCount(0);
    second.release();
    await expect(
      page.getByText("Đang tải hồ sơ…", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Chưa có hồ sơ phù hợp", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "Lỗi truy vấn cũ" }),
    ).toHaveCount(0);
  } finally {
    first.release();
    second.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("pending reconciliation polling stays serial on a slow read and cannot report errors after leaving", async ({ page }, info) => {
  test.setTimeout(60000);
  const { client } = await import("../../scripts/test-client.mjs");
  const c = await client();
  const row = await c.create();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel("Tên đăng nhập hoặc email", { exact: true }).fill("reporter");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toBeVisible();
  await page.getByLabel("Tìm hồ sơ", { exact: true }).fill(row.code);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  const held = gate(), seen = gate();
  let reads = 0, activeReads = 0, peakReads = 0;
  const pattern = `**/api/g01/cases/${row.id}`;
  // Controlled read-state/fault injection exercises the UI scheduler. No mutation is mocked.
  await page.route(pattern, async route => {
    reads++;
    if (reads === 1) {
      const response = await route.fetch();
      const data = await response.json();
      data.item.syncStatus = "needs_reconciliation";
      data.item.actions = [];
      return route.fulfill({ response, json: data });
    }
    activeReads++;
    peakReads = Math.max(peakReads, activeReads);
    seen.release();
    await held.promise;
    try {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Lỗi polling của hồ sơ đã rời." } }) });
    } finally { activeReads--; }
  });
  try {
    await page.getByRole("button").filter({ hasText: row.code }).click();
    await expect(page.locator(".case-detail")).toBeVisible();
    await seen.promise;
    // Keep one GET outstanding beyond two old three-second timer ticks.
    await page.waitForTimeout(6500);
    expect.soft(peakReads).toBe(1);
    await page.getByRole("button", { name: "Về danh sách hồ sơ", exact: true }).click();
    const readsOnExit = reads;
    held.release();
    await expect.poll(() => activeReads).toBe(0);
    await page.waitForTimeout(3500);
    expect(reads).toBe(readsOnExit);
    await expect(page.getByRole("alert").filter({ hasText: "Lỗi polling của hồ sơ đã rời" })).toHaveCount(0);
    await info.attach("polling-scheduler-observation", { contentType: "application/json", body: Buffer.from(JSON.stringify({ reads, readsOnExit, peakReads, activeReads, stateInjection: "read-only pending projection and delayed 503" })) });
  } finally {
    held.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("pending polling pauses for hidden state and stops when the real ready projection returns", async ({ page }) => {
  test.setTimeout(60000);
  const { client } = await import("../../scripts/test-client.mjs");
  const c = await client();
  const row = await c.create();
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel("Tên đăng nhập hoặc email", { exact: true }).fill("reporter");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByLabel("Tìm hồ sơ", { exact: true })).toBeVisible();
  await page.getByLabel("Tìm hồ sơ", { exact: true }).fill(row.code);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  let reads = 0;
  const listQueries: string[] = [];
  await page.route("**/api/g01/cases?*", async route => {
    listQueries.push(new URL(route.request().url()).searchParams.get("status") || "");
    await route.continue();
  });
  const pattern = `**/api/g01/cases/${row.id}`;
  await page.route(pattern, async route => {
    reads++;
    const response = await route.fetch();
    const data = await response.json();
    if (reads === 1) { data.item.syncStatus = "needs_reconciliation"; data.item.actions = []; }
    await route.fulfill({ response, json: data });
  });
  try {
    await page.getByRole("button").filter({ hasText: row.code }).click();
    await expect(page.getByText("Yêu cầu đã được lưu.", { exact: false })).toBeVisible();
    // Explicit visibility-state injection, not a claim about a real phone backgrounding.
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(3500);
    expect(reads).toBe(1);
    // Changing filters during reconciliation must not let an old polling closure restore them.
    await page.getByLabel("Trạng thái", { exact: true }).selectOption("closed");
    await expect(page.getByRole("heading", { name: "Chưa có hồ sơ phù hợp", exact: true })).toBeVisible();
    const listReadsBeforeVisible = listQueries.length;
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByText("Yêu cầu đã được lưu.", { exact: false })).toHaveCount(0);
    expect(reads).toBe(2);
    await expect.poll(() => listQueries.length).toBeGreaterThan(listReadsBeforeVisible);
    expect(listQueries.slice(listReadsBeforeVisible).every(status => status === "closed")).toBe(true);
    await page.waitForTimeout(3500);
    expect(reads).toBe(2);
  } finally {
    await page.evaluate(() => { delete (document as unknown as { hidden?: boolean }).hidden; });
    await page.unrouteAll({ behavior: "wait" });
  }
});
