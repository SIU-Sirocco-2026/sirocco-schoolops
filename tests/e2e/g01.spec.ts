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
  await expect(
    page.getByRole("heading", { name: "Sự cố cơ sở vật chất", exact: true }),
  ).toBeVisible();
}
async function open(page: Page, title: string) {
  await page.getByLabel("Tìm hồ sơ", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page.getByRole("button").filter({ hasText: title }).click();
  await expect(page.locator(".case-detail h3").first()).toHaveText(title);
  if ((page.viewportSize()?.width || 0) <= 1100)
    await expect
      .poll(
        async () =>
          (await page.locator(".case-detail").boundingBox())?.y ?? 9999,
      )
      .toBeLessThan(150);
}
async function state(page: Page, label: string) {
  await expect(page.locator(".case-detail > .status")).toHaveText(label);
}
async function refresh(page: Page, label: string) {
  await page
    .getByRole("button", { name: "Làm mới hồ sơ", exact: true })
    .click();
  await state(page, label);
}
function localDue() {
  const d = new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T15:00`;
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

async function cleanEvidence(page: Page, filename: string) {
  const data = Buffer.from(
    "Biên bản sửa chữa giả lập, kiểm chứng tải bằng chứng trên web.",
  );
  await expect(
    page.getByRole("button", { name: "Gửi nghiệm thu", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Ảnh hoặc tài liệu bằng chứng (tối đa 10 MB)", { exact: true })
    .setInputFiles({ name: filename, mimeType: "text/plain", buffer: data });
  await page
    .getByRole("button", { name: "Tải bằng chứng", exact: true })
    .click();
  const entry = page
    .locator(".evidence-list li")
    .filter({ has: page.getByText(filename, { exact: true }) });
  await expect(entry.locator(".scan-state")).toHaveText("Đã quét sạch", {
    timeout: 90000,
  });
  await expect(
    page.getByRole("button", { name: "Gửi nghiệm thu", exact: true }),
  ).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: `Tải xuống ${filename}`, exact: true })
      .click(),
  ]);
  expect(readFileSync((await download.path())!)).toEqual(data);
  await page.screenshot({
    path: "test-results/phase3-evidence-mobile.png",
    fullPage: true,
  });
}

test("G01 four browser roles complete both return loops with timeline, deadline and immutable refs", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ viewport: { width: 390, height: 844 } }),
    ),
  );
  const [r, c, t, a] = (await Promise.all(
    contexts.map((ctx) => ctx.newPage()),
  )) as [Page, Page, Page, Page];
  const title = `Máy chiếu A101 hỏng ${Date.now()}`;
  await login(r, "reporter");
  await r.setViewportSize({ width: 390, height: 844 });
  await r.getByRole("button", { name: "Báo sự cố mới", exact: true }).click();
  await r.getByLabel("Tiêu đề sự cố", { exact: true }).fill(title);
  await r.getByLabel("Phòng", { exact: true }).selectOption("A101");
  await r
    .getByLabel("Thiết bị", { exact: true })
    .selectOption("A101-PROJECTOR");
  await r
    .getByLabel("Mô tả sự cố", { exact: true })
    .fill("Máy chiếu không lên hình. Nội dung báo hỏng giả lập để kiểm thử.");
  await noOverflow(r);
  await r.screenshot({
    path: "test-results/g01-mobile-create.png",
    fullPage: true,
  });
  await r.getByRole("button", { name: "Gửi báo sự cố", exact: true }).click();
  await state(r, "Chờ xác minh");
  const code = await r.locator(".case-code").innerText();
  expect(code).toMatch(/^G01-\d+$/);
  await expect(
    r.getByRole("button", { name: "Tiếp nhận sự cố", exact: true }),
  ).toHaveCount(0);
  await login(c, "coordinator");
  await open(c, title);
  await c
    .getByLabel("Lý do trả lại", { exact: true })
    .fill("Cần bổ sung trạng thái đèn nguồn và cổng HDMI.");
  await c.getByRole("button", { name: "Trả bổ sung", exact: true }).click();
  await state(c, "Chờ bổ sung");
  await refresh(r, "Chờ bổ sung");
  await r
    .getByLabel("Mô tả sự cố", { exact: true })
    .fill(
      "Đèn nguồn sáng nhưng không có hình qua cổng HDMI. Nội dung giả lập đã bổ sung.",
    );
  await r
    .getByRole("button", { name: "Bổ sung và gửi lại", exact: true })
    .click();
  await state(r, "Chờ xác minh");
  await refresh(c, "Chờ xác minh");
  await c.getByRole("button", { name: "Tiếp nhận sự cố", exact: true }).click();
  await state(c, "Chờ giao việc");
  await c
    .getByLabel("Người hoặc nhóm xử lý", { exact: true })
    .selectOption("person:33333333-3333-4333-8333-333333333333");
  await c
    .getByLabel("Người nghiệm thu", { exact: true })
    .selectOption("44444444-4444-4444-8444-444444444444");
  await c.getByLabel("Hạn hoàn thành", { exact: true }).fill(localDue());
  await c.getByRole("button", { name: "Giao xử lý", exact: true }).click();
  await state(c, "Chờ nhận việc");
  await login(t, "technician");
  await open(t, title);
  await t.getByLabel("Công việc của tôi", { exact: true }).check();
  await expect(t.getByRole("button").filter({ hasText: title })).toBeVisible();
  await t.getByRole("button", { name: "Nhận xử lý", exact: true }).click();
  await state(t, "Đang xử lý");
  await t
    .getByLabel("Biện pháp xử lý", { exact: true })
    .fill("Thay cáp HDMI và vệ sinh đầu nối.");
  await t
    .getByLabel("Kết quả xử lý", { exact: true })
    .fill("Thiết bị đã lên hình, đang theo dõi.");
  await t.getByRole("button", { name: "Lưu kết quả", exact: true }).click();
  await expect(t.getByRole("status")).toContainText("Lưu kết quả xử lý");
  await state(t, "Đang xử lý");
  await t.setViewportSize({ width: 390, height: 844 });
  await noOverflow(t);
  await t.screenshot({
    path: "test-results/g01-mobile-work.png",
    fullPage: true,
  });
  await cleanEvidence(t, `ket-qua-${Date.now()}.txt`);
  await t.getByRole("button", { name: "Gửi nghiệm thu", exact: true }).click();
  await state(t, "Chờ nghiệm thu");
  await expect(
    t.getByRole("button", { name: "Phê duyệt và đóng hồ sơ", exact: true }),
  ).toHaveCount(0);
  await login(a, "approver");
  await open(a, title);
  await a
    .getByLabel("Lý do trả lại", { exact: true })
    .fill("Hình còn chớp; cần chạy thử liên tục lâu hơn.");
  await a.getByRole("button", { name: "Trả lại xử lý", exact: true }).click();
  await state(a, "Đang xử lý");
  await refresh(t, "Đang xử lý");
  await t
    .getByLabel("Biện pháp xử lý", { exact: true })
    .fill("Thay đầu nối và cố định cáp HDMI.");
  await t
    .getByLabel("Kết quả xử lý", { exact: true })
    .fill("Đã thử liên tục 30 phút, hình ảnh ổn định.");
  await cleanEvidence(t, `ket-qua-${Date.now()}.txt`);
  await t.getByRole("button", { name: "Gửi nghiệm thu", exact: true }).click();
  await state(t, "Chờ nghiệm thu");
  await refresh(a, "Chờ nghiệm thu");
  await a
    .getByRole("button", { name: "Phê duyệt và đóng hồ sơ", exact: true })
    .click();
  await state(a, "Đã đóng");
  await refresh(r, "Đã đóng");
  await expect(r.locator(".closure")).toContainText("Nghiệm thu Demo");
  await expect(r.locator(".timeline")).toContainText(
    "Cần bổ sung trạng thái đèn nguồn",
  );
  await expect(r.locator(".timeline")).toContainText("Hình còn chớp");
  await expect(r.locator(".timeline")).toContainText("Đã thử liên tục 30 phút");
  await r
    .getByText("Thông tin phiên bản và liên kết quy trình", { exact: true })
    .click();
  await expect(r.locator(".technical-details")).toContainText(
    "g01@1.0.0 / g01-case@1.0.0 / g01-facilities@1.0.0",
  );
  await noOverflow(r);
  await r.screenshot({
    path: "test-results/g01-mobile-closed.png",
    fullPage: true,
  });
  await r.setViewportSize({ width: 1440, height: 1000 });
  await r.screenshot({
    path: "test-results/g01-desktop-closed.png",
    fullPage: true,
  });
  await r.getByRole("button", { name: /^Hoàn thành/ }).click();
  await expect(r.getByRole("button", { name: /^Hoàn thành/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await r.getByLabel("Tìm hồ sơ", { exact: true }).fill(title);
  await r.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await r.getByLabel("Trạng thái", { exact: true }).selectOption("closed");
  await expect(r.getByRole("button").filter({ hasText: title })).toBeVisible();
  for (const page of [c, t, a]) await noOverflow(page);
  for (const ctx of contexts) await ctx.close();
});

test("technical admin cannot see G01 content or create cases through the UI", async ({
  page,
}) => {
  await login(page, "admin");
  await expect(
    page.getByRole("button", { name: "Báo sự cố mới", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".task-list li")).toHaveCount(0);
  for (const label of ["Tất cả", "Đang mở", "Quá hạn", "Hoàn thành"])
    await expect(
      page.getByRole("button", { name: `${label} 0`, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Chưa có hồ sơ phù hợp", exact: true }),
  ).toBeVisible();
});

test("mobile quota errors retain the form and require an explicit retry with the same creation key", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "reporter");
  await page
    .getByRole("button", { name: "Báo sự cố mới", exact: true })
    .click();
  const title = `Kiểm chứng quota giả lập ${Date.now()}`;
  await page.getByLabel("Tiêu đề sự cố", { exact: true }).fill(title);
  await page
    .getByLabel("Mô tả sự cố", { exact: true })
    .fill(
      "Dữ liệu giả lập để kiểm tra thông báo quota và giữ lại nội dung biểu mẫu.",
    );
  const keys: string[] = [];
  let attempts = 0;
  await page.route("**/api/g01/cases", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    keys.push(route.request().headers()["idempotency-key"]!);
    if (attempts === 1)
      return route.fulfill({
        status: 429,
        headers: {
          "Content-Type": "text/html",
          "X-RateLimit-Reset": "1",
          "X-Sirocco-Gateway": "APISIX",
        },
        body: "<html>gateway rejected</html>",
      });
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Gửi báo sự cố", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Có quá nhiều yêu cầu");
  await expect(page.getByRole("alert")).toContainText("thử lại thao tác");
  await expect(page.getByLabel("Tiêu đề sự cố", { exact: true })).toHaveValue(
    title,
  );
  await noOverflow(page);
  // Crossing the server's stated reset must not resubmit a form in the background.
  await page.waitForTimeout(1200);
  expect(attempts).toBe(1);
  await page
    .getByRole("button", { name: "Gửi báo sự cố", exact: true })
    .click();
  await expect(page.locator(".case-code")).toHaveText(/^G01-/);
  expect(attempts).toBe(2);
  expect(keys[1]).toBe(keys[0]);
});
