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

test("G01 scroll ends at the footer without an empty document tail", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page
    .getByLabel("Tên đăng nhập hoặc email", { exact: true })
    .fill("reporter");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator(".task-row").first()).toBeVisible();
  for (const width of [1920, 1440, 768, 390]) {
    await page.setViewportSize({ width, height: 904 });
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const metrics = await page.evaluate(() => {
      const details = (selector: string) => {
        const node = document.querySelector(selector)!;
        const rect = node.getBoundingClientRect(),
          style = getComputedStyle(node);
        return {
          top: rect.top + scrollY,
          bottom: rect.bottom + scrollY,
          height: rect.height,
          display: style.display,
          minHeight: style.minHeight,
          margin: style.margin,
          padding: style.padding,
          flex: style.flex,
          position: style.position,
        };
      };
      return {
        viewport: innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
        body: details("body"),
        root: details("#root"),
        workspace: details(".workspace"),
        page: details(".page"),
        main: details("main"),
        footer: details(".page-footer"),
      };
    });
    await info.attach(`layout-${width}.json`, {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });
    console.log(
      `layout-${width}: document=${metrics.scrollHeight}, workspace=${metrics.workspace.bottom}, footer=${metrics.footer.bottom}`,
    );
    await page.screenshot({ path: info.outputPath(`bottom-${width}.png`) });
    expect(metrics.scrollHeight - metrics.workspace.bottom).toBeLessThanOrEqual(
      1,
    );
    expect(metrics.scrollHeight - metrics.footer.bottom).toBeLessThanOrEqual(
      25,
    );
  }
});
