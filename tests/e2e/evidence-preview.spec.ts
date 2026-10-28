// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
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

test("evidence previews, validation, retry and keyboard dialog work on desktop and mobile", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const { client } = await import("../../scripts/test-client.mjs");
  const c = await client();
  const row = await c.repair(await c.create());
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/?view=g01&case=${row.id}`);
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page
    .getByLabel("Tên đăng nhập hoặc email", { exact: true })
    .fill("technician");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator(".case-detail h3").first()).toHaveText(row.title);
  const input = page.getByLabel("Ảnh hoặc tài liệu bằng chứng (tối đa 10 MB)", {
    exact: true,
  });
  const submit = page.getByRole("button", {
    name: "Tải bằng chứng",
    exact: true,
  });
  const evidence = page.getByRole("region", {
    name: "Bằng chứng hồ sơ",
    exact: true,
  });
  await expect(input).toBeAttached();
  await input.setInputFiles({
    name: "khong-hop-le.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(evidence.getByRole("alert")).toContainText(
    "Loại tệp chưa phù hợp",
  );
  await expect(submit).toBeDisabled();
  await expect(evidence.locator(".selected-image")).toHaveCount(0);
  await evidence.getByRole("button", { name: "Bỏ tệp", exact: true }).click();
  await expect(
    evidence.getByRole("button", { name: "Chọn tệp", exact: true }),
  ).toBeFocused();
  const data = readFileSync("apps/web/public/brand/schoolops-mark.png");
  const filename = "Ảnh kiểm chứng bố cục và xem trước bằng chứng.png";
  await input.setInputFiles({
    name: filename,
    mimeType: "image/png",
    buffer: data,
  });
  const thumbnail = evidence.getByRole("img", {
    name: `Ảnh đã chọn: ${filename}`,
    exact: true,
  });
  await expect(thumbnail).toBeVisible();
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  const zoom = evidence.getByRole("button", {
    name: `Phóng to ảnh ${filename}`,
    exact: true,
  });
  await zoom.click();
  const viewer = page.getByRole("dialog", {
    name: `Xem ảnh: ${filename}`,
    exact: true,
  });
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveCSS("animation-name", "schoolops-dialog");
  await expect(
    page.getByRole("button", { name: "Đóng xem ảnh", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(zoom).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await zoom.click();
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(zoom).toBeFocused();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const pasteUrl = await thumbnail.getAttribute("src");
  await page.locator(".upload-form").evaluate(async (form, url) => {
    const image = await (await fetch(url!)).blob();
    const transfer = new DataTransfer();
    transfer.items.add(new File([image], "anh-dan.png", { type: "image/png" }));
    form.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, pasteUrl);
  await expect(
    evidence.getByRole("img", {
      name: "Ảnh đã chọn: anh-dan.png",
      exact: true,
    }),
  ).toBeVisible();
  await expect(evidence.locator(".selected-file-info")).toContainText(
    "anh-dan.png",
  );
  await page.locator(".upload-form").dispatchEvent("drop", {
    dataTransfer: await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["Tệp thay thế giả lập"], "thay-the.txt", {
          type: "text/plain",
        }),
      );
      return transfer;
    }),
  });
  await expect(evidence.locator(".selected-file-info")).toContainText(
    "thay-the.txt",
  );
  await input.setInputFiles({
    name: filename,
    mimeType: "image/png",
    buffer: data,
  });
  await expect(thumbnail).toBeVisible();
  await evidence.screenshot({ path: info.outputPath("upload-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await evidence.screenshot({ path: info.outputPath("upload-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const keys: string[] = [];
  let failFirst = true;
  let failThumbnail = true;
  await page.route(
    `**/api/g01/cases/${row.id}/evidence/*/download`,
    async (route) => {
      if (failThumbnail) {
        failThumbnail = false;
        return route.fulfill({ status: 503, body: "Thumbnail outage fixture" });
      }
      await route.continue();
    },
  );
  await page.route(`**/api/g01/cases/${row.id}/evidence`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]!);
    if (failFirst) {
      failFirst = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Lỗi tải tệp giả lập để kiểm tra giữ bản chọn" },
        }),
      });
    }
    await route.continue();
  });
  await submit.click();
  await expect(evidence.getByRole("alert")).toContainText(
    "Lỗi tải tệp giả lập",
  );
  await expect(thumbnail).toBeVisible();
  await expect(submit).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await evidence.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await submit.click();
  await expect(thumbnail).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  const entry = evidence
    .locator(".evidence-list li")
    .filter({ hasText: filename });
  await expect(entry.locator(".scan-state")).toHaveText("Đã quét sạch", {
    timeout: 90000,
  });
  await entry.scrollIntoViewIfNeeded();
  await entry
    .getByRole("button", { name: `Tải lại ảnh ${filename}`, exact: true })
    .click();
  const savedImage = entry.getByRole("img", {
    name: `Bằng chứng: ${filename}`,
    exact: true,
  });
  await expect(savedImage).toBeVisible();
  await expect
    .poll(() =>
      savedImage.evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  const imageTile = entry.getByRole("button", {
    name: `Phóng to ảnh đã tải ${filename}`,
    exact: true,
  });
  await imageTile.click();
  await expect(viewer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(imageTile).toBeFocused();
  const open = entry.getByRole("button", {
    name: `Xem ảnh ${filename}`,
    exact: true,
  });
  await open.click();
  await expect(viewer).toBeVisible();
  await expect
    .poll(() =>
      viewer
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  expect(await viewer.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath("preview-mobile.png") });
  await page.getByRole("button", { name: "Đóng xem ảnh", exact: true }).click();
  await expect(open).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await evidence.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("evidence-desktop.png") });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    entry
      .getByRole("button", { name: `Tải xuống ${filename}`, exact: true })
      .click(),
  ]);
  expect(readFileSync((await download.path())!)).toEqual(data);
  // Drag/drop must use the same selection and validation as the file picker.
  await page.locator(".upload-form").dispatchEvent("drop", {
    dataTransfer: await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["Biên bản giả lập"], "bien-ban.txt", { type: "text/plain" }),
      );
      return transfer;
    }),
  });
  await expect(evidence.locator(".selected-file-info")).toContainText(
    "bien-ban.txt",
  );
  await expect(submit).toBeEnabled();
  await expect(evidence.locator(".selected-image")).toHaveCount(0);
  await evidence.screenshot({ path: info.outputPath("gallery-desktop.png") });
  await evidence.getByRole("button", { name: "Bỏ tệp", exact: true }).click();
  await page
    .getByRole("button", { name: "Về danh sách hồ sơ", exact: true })
    .click();
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const toggle = page.getByRole("button", {
      name: "Bộ lọc hồ sơ",
      exact: true,
    });
    if (width > 700) {
      await expect(toggle).toBeHidden();
      const inputBox = await page
        .getByLabel("Tìm hồ sơ", { exact: true })
        .boundingBox();
      const searchBox = await page
        .getByRole("button", { name: "Tìm kiếm", exact: true })
        .boundingBox();
      expect(
        Math.abs(
          inputBox!.y + inputBox!.height - searchBox!.y - searchBox!.height,
        ),
      ).toBeLessThan(2);
    } else {
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(
        page.getByLabel("Trạng thái", { exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await toggle.click();
    }
    if (width === 1920 || width === 768)
      await page.screenshot({ path: info.outputPath(`filters-${width}.png`) });
  }
  expect(errors).toEqual([]);
});
