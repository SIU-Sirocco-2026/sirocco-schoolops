// SPDX-License-Identifier: Apache-2.0
import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";

test("logout confirmation and protocol errors use the same identity theme", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  const identityOrigin = new URL(page.url()).origin;
  const metadataResponse = await page.request.get(
    `${identityOrigin}/realms/sirocco/.well-known/openid-configuration`,
  );
  expect(metadataResponse.ok()).toBe(true);
  const metadata = await metadataResponse.json();
  await page
    .getByLabel("Tên đăng nhập hoặc email", { exact: true })
    .fill("reporter");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Sự cố cơ sở vật chất",
      exact: true,
    }),
  ).toBeVisible();
  const appOrigin = new URL(page.url()).origin;
  const logout = new URL(metadata.end_session_endpoint);
  logout.searchParams.set("client_id", "schoolops-web");
  logout.searchParams.set("post_logout_redirect_uri", appOrigin);
  await page.goto(logout.href);
  await expect(page.locator("#kc-logout-confirm")).toBeVisible();
  await expect(page.locator("#kc-header-wrapper")).toHaveCSS(
    "color",
    "rgb(24, 36, 51)",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("logout-confirm-mobile.png"),
    fullPage: true,
  });
  const protocolError = new URL(metadata.authorization_endpoint);
  protocolError.searchParams.set("client_id", "schoolops-web");
  protocolError.searchParams.set("response_type", "code");
  protocolError.searchParams.set("scope", "openid");
  protocolError.searchParams.set(
    "redirect_uri",
    "http://invalid-ui-fixture.invalid/callback",
  );
  await page.goto(protocolError.href);
  await expect(page.locator("#kc-error-message")).toBeVisible();
  await expect(page.locator("#kc-header-wrapper")).toHaveCSS(
    "color",
    "rgb(24, 36, 51)",
  );
  await page.screenshot({
    path: info.outputPath("identity-error-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

const settings = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1),
    ]),
);

for (const [view, account, heading] of [
  ["g01", "reporter", "Sự cố cơ sở vật chất"],
  ["foundation", "reporter", "Công việc của tôi"],
  ["environment", "environment", "Môi trường PM2.5"],
  ["safety", "safety_reporter", "An toàn hạn chế"],
  ["packs", "admin", "Gói nghiệp vụ"],
]) {
  test(`${view} shares the modern shell on direct load, reload and responsive widths`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/?view=${view}`);
    await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
    await page
      .getByLabel("Tên đăng nhập hoặc email", { exact: true })
      .fill(account!);
    await page
      .getByLabel("Mật khẩu", { exact: true })
      .fill(settings.DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: heading!, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: heading!, exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`view=${view}`));
    await expect(page.locator(".workspace")).toHaveClass(/workspace-modern/);
    await expect(page.locator(".sidebar")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.locator(".topbar")).toHaveCSS("backdrop-filter", "none");
    await expect(
      page.getByRole("button", { name: "Giảm hiệu ứng", exact: true }),
    ).toHaveCount(0);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByRole("link", { name: "SchoolOps trang chủ", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 1440 || width === 390)
        await page.screenshot({
          path: info.outputPath(`${view}-${width}.png`),
          fullPage: true,
        });
    }
    expect(errors).toEqual([]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".page-heading")).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(page.locator(".button").first()).toHaveCSS(
      "transition-duration",
      "0s",
    );
    expect(
      await page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
    ).toBe(0);
  });
}

test("login and invalid credentials share the SchoolOps branding and keyboard controls", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await expect(
    page.getByRole("heading", { name: "Đăng nhập SchoolOps", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#kc-header-wrapper")).toHaveCSS(
    "color",
    "rgb(24, 36, 51)",
  );
  await expect(page.locator("#kc-login")).toHaveCSS(
    "background-color",
    "rgb(32, 107, 196)",
  );
  const brand = await page
    .locator("#kc-header-wrapper")
    .evaluate((node) => getComputedStyle(node, "::before").backgroundImage);
  expect(brand).toContain("schoolops-mark.png");
  const brandUrl = /url\(["']?([^"')]+)/.exec(brand)![1]!;
  expect((await page.request.get(brandUrl)).status()).toBe(200);
  await page
    .getByLabel("Tên đăng nhập hoặc email", { exact: true })
    .fill(`invalid-ui-fixture-${Date.now()}`);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("invalid-ui-fixture-password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page
      .getByText(
        "Tên đăng nhập hoặc mật khẩu chưa đúng. Vui lòng kiểm tra và thử lại.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        "Tên đăng nhập hoặc mật khẩu chưa đúng. Vui lòng kiểm tra và thử lại.",
        { exact: true },
      )
      .first(),
  ).toHaveCSS("animation-name", "schoolops-auth-fade");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Đăng nhập", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`login-error-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByLabel("Mật khẩu", { exact: true }).fill("fixture-password");
  await page
    .getByRole("button", { name: "Hiện mật khẩu", exact: true })
    .click();
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Ẩn mật khẩu", exact: true }).click();
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
});
