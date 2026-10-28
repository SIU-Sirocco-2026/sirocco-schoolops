// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test, expect, type Page } from "./fixtures.js";
import { readFileSync } from "node:fs";
const settings = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#")).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
async function login(page: Page, user = "reporter") {
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel("Tên đăng nhập hoặc email", { exact: true }).fill(user);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("button", { name: "Đăng xuất", exact: true })).toBeVisible();
}
async function tools(page: Page) {
  const summary = page.getByText("Công cụ kiểm tra", { exact: true });
  const button = page.getByRole("button", { name: /Nhiệm vụ nền tảng/ });
  if (!await button.isVisible()) await summary.click();
  await button.click();
}

test("unsaved creation survives rejected workspace and Back navigation, and a successful POST does not prompt", async ({ page }, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await tools(page);
  await page.getByRole("button", { name: "Sự cố cơ sở vật chất", exact: true }).click();
  await page.getByRole("button", { name: "Báo sự cố mới", exact: true }).click();
  const title = `Bản nháp điều hướng giả lập ${Date.now()}`;
  await page.getByLabel("Tiêu đề sự cố", { exact: true }).fill(title);
  await page.getByLabel("Mô tả sự cố", { exact: true }).fill("Dữ liệu giả lập kiểm bảo vệ nội dung chưa gửi, không phải phản hồi người dùng.");
  let accept = false;
  const dialogs: string[] = [];
  page.on("dialog", async dialog => { dialogs.push(dialog.type()); if (accept) await dialog.accept(); else await dialog.dismiss(); });
  await tools(page);
  await page.waitForTimeout(150);
  await info.attach("workspace-draft-observation", { contentType: "application/json", body: Buffer.from(JSON.stringify({ dialogs, route: new URL(page.url()).search, formPresent: await page.getByLabel("Tiêu đề sự cố", { exact: true }).count() })) });
  expect(dialogs).toEqual(["confirm"]);
  await expect(page.getByLabel("Tiêu đề sự cố", { exact: true })).toHaveValue(title);
  await page.evaluate(() => history.back());
  await expect.poll(() => dialogs.length).toBe(2);
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("g01");
  await expect(page.getByLabel("Tiêu đề sự cố", { exact: true })).toHaveValue(title);
  const beforeCreate = dialogs.length;
  let posts = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/g01/cases")) posts++; });
  await page.getByRole("button", { name: "Gửi báo sự cố", exact: true }).click();
  await expect(page.locator(".case-code")).toHaveText(/^G01-/);
  expect(posts).toBe(1);
  expect(dialogs.length).toBe(beforeCreate);
  await page.getByRole("button", { name: "Về danh sách hồ sơ", exact: true }).click();
  await page.getByRole("button", { name: "Báo sự cố mới", exact: true }).click();
  await page.getByLabel("Tiêu đề sự cố", { exact: true }).fill(title + " bỏ có chủ đích");
  accept = true;
  await tools(page);
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("foundation");
  const afterDiscard = dialogs.length;
  await page.evaluate(() => history.back());
  await expect(page.getByRole("button", { name: "Báo sự cố mới", exact: true })).toBeVisible();
  await page.evaluate(() => history.forward());
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("foundation");
  expect(dialogs.length).toBe(afterDiscard);
});

test("an unsaved restricted report can cancel reload without writing its content to browser storage", async ({ page }) => {
  test.setTimeout(90000);
  await login(page, "safety_reporter");
  await page.getByRole("button", { name: "Phản ánh an toàn mới", exact: true }).click();
  const title = `Bản nháp G03 giả lập ${Date.now()}`;
  await page.getByLabel("Tiêu đề phản ánh", { exact: true }).fill(title);
  await page.getByLabel("Mô tả phản ánh", { exact: true }).fill("Nội dung giả lập cần giữ trong bộ nhớ, không chứa dữ liệu người thật.");
  let accept = false;
  const dialogs: string[] = [];
  page.on("dialog", async dialog => { dialogs.push(dialog.type()); if (accept) await dialog.accept(); else await dialog.dismiss(); });
  const reload = page.reload({ timeout: 10000 }).catch(error => { if (!dialogs.includes("beforeunload")) throw error; });
  await expect.poll(() => dialogs.length).toBe(1);
  await reload;
  expect(dialogs[0]).toBe("beforeunload");
  await expect(page.getByLabel("Tiêu đề phản ánh", { exact: true })).toHaveValue(title);
  expect(await page.evaluate(marker => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => value.includes(marker)), title)).toBe(false);
  accept = true;
  await page.reload();
  await expect(page.getByRole("button", { name: "Phản ánh an toàn mới", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Phản ánh an toàn mới", exact: true }).click();
  await expect(page.getByLabel("Tiêu đề phản ánh", { exact: true })).toHaveValue("");
});

test("unsaved work and a selected file can cancel case exit or revision refresh, then explicitly discard", async ({ page }) => {
  test.setTimeout(90000);
  const { client, png } = await import("../../scripts/test-client.mjs");
  const c = await client();
  const row = await c.repair(await c.create());
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "technician");
  await page.getByLabel("Tìm hồ sơ", { exact: true }).fill(row.code);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page.getByRole("button").filter({ hasText: row.code }).click();
  const draft = "Biện pháp giả lập chưa lưu trên giao diện.";
  await page.getByLabel("Biện pháp xử lý", { exact: true }).fill(draft);
  await page.getByLabel("Kết quả xử lý", { exact: true }).fill("Kết quả giả lập chưa lưu trên giao diện.");
  await page.getByLabel("Ảnh hoặc tài liệu bằng chứng (tối đa 10 MB)", { exact: true }).setInputFiles({ name: "chua-gui.png", mimeType: "image/png", buffer: png });
  let accept = false;
  const dialogs: string[] = [];
  page.on("dialog", async dialog => { dialogs.push(dialog.type()); if (accept) await dialog.accept(); else await dialog.dismiss(); });
  await page.getByRole("button", { name: "Về danh sách hồ sơ", exact: true }).click();
  expect(dialogs.length).toBe(1);
  await expect(page.getByLabel("Biện pháp xử lý", { exact: true })).toHaveValue(draft);
  await expect(page.locator(".file-name")).toHaveText("chua-gui.png");
  await c.act(row, "technician", "save_work", { measures: "Kết quả đã lưu từ client khác.", result: "Tình huống giả lập revision mới." });
  await page.getByRole("button", { name: "Lưu kết quả", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Hồ sơ có phiên bản mới" })).toBeVisible();
  await expect(page.getByLabel("Biện pháp xử lý", { exact: true })).toHaveValue(draft);
  await page.getByRole("button", { name: "Làm mới hồ sơ", exact: true }).click();
  expect(dialogs.length).toBe(2);
  await expect(page.getByLabel("Biện pháp xử lý", { exact: true })).toHaveValue(draft);
  accept = true;
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { seen = resolve; });
  const pattern = `**/api/g01/cases/${row.id}`;
  await page.route(pattern, async route => {
    // Hold only a real read response. Mutations still reach the application.
    const response = await route.fetch();
    seen();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Làm mới hồ sơ", exact: true }).click();
    await requested;
    await expect(page.getByLabel("Biện pháp xử lý", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Kết quả xử lý", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Chọn tệp", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Tải bằng chứng", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Đang làm mới hồ sơ…", exact: true })).toBeDisabled();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
  await expect(page.getByLabel("Biện pháp xử lý", { exact: true })).toHaveValue("Kết quả đã lưu từ client khác.");
  await expect(page.getByLabel("Biện pháp xử lý", { exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Chọn tệp", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Về danh sách hồ sơ", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.has("case")).toBe(false);
});
