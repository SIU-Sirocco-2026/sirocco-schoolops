// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
// Opt-in recording on a synthetic-data demo. Creates and closes one G01 case.
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { root } from "./ops-lib.mjs";

if (!process.argv.includes("--synthetic-demo"))
  throw new Error(
    "Run only on an isolated synthetic-data demo with --synthetic-demo.",
  );
const env = Object.fromEntries(
  (await readFile(join(root, ".env"), "utf8"))
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
if (!env.DEMO_PASSWORD) throw new Error("Local demo credentials missing.");
const config = await fetch("http://localhost:8088/api/config").then((r) =>
  r.json(),
);
if (
  config.version !== "0.1.0-rc.1" ||
  config.sourceRevision !== "84f2ecfe31ff12b0d4cb3cd09899e37f14975e55"
)
  throw new Error(
    "This recording script targets the immutable rc.1 runtime only.",
  );
const out = join(root, "test-results", "public-demo");
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: out, size: { width: 1280, height: 900 } },
});
const page = await ctx.newPage();
page.setDefaultTimeout(25000);
const video = page.video();
const scenes = [];
const began = Date.now();
const title = `Demo A101 ${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}`;
let code;
async function scene(label, name, seconds = 9) {
  await page.evaluate((label) => {
    document.getElementById("recording-caption")?.remove();
    const el = document.createElement("div");
    el.id = "recording-caption";
    el.textContent = `DEMO TỰ ĐỘNG · DỮ LIỆU GIẢ LẬP · ${label}`;
    Object.assign(el.style, {
      position: "fixed",
      bottom: "12px",
      left: "18px",
      right: "18px",
      padding: "12px 16px",
      background: "#102e2ef2",
      color: "white",
      font: "18px system-ui",
      zIndex: "100000",
      pointerEvents: "none",
      borderRadius: "8px",
    });
    document.body.append(el);
  }, label);
  await page.screenshot({ path: join(out, `${name}.png`) });
  scenes.push({
    label,
    screenshot: `${name}.png`,
    secondsFromStart: Math.round((Date.now() - began) / 1000),
  });
  await page.waitForTimeout(seconds * 1000);
}
async function login(username) {
  await page.goto("http://localhost:8088/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel(/Username|Tên đăng nhập/).fill(username);
  await page
    .getByLabel(/Password|Mật khẩu/, { exact: true })
    .fill(env.DEMO_PASSWORD);
  await page
    .getByRole("button", { name: /Sign In|Đăng nhập/, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sự cố cơ sở vật chất", exact: true }),
  ).toBeVisible();
}
async function logout() {
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }),
  ).toBeVisible();
}
async function open() {
  const back = page.getByRole("button", { name: "Về danh sách hồ sơ", exact: true });
  if (await back.isVisible()) await back.click();
  const mine = page.getByLabel("Công việc của tôi", { exact: true });
  if (await mine.isChecked()) await mine.uncheck();
  await page.getByLabel("Tìm hồ sơ", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page.getByRole("button").filter({ hasText: title }).click();
  await expect(page.locator(".case-detail h3").first()).toHaveText(title);
}
async function state(name) {
  await expect(page.locator(".case-detail > .status")).toHaveText(name);
}
let completed = false;
try {
  await login("reporter");
  await page
    .getByRole("button", { name: "Báo sự cố mới", exact: true })
    .click();
  await page.getByLabel("Tiêu đề sự cố", { exact: true }).fill(title);
  await page.getByLabel("Phòng", { exact: true }).selectOption("A101");
  await page
    .getByLabel("Thiết bị", { exact: true })
    .selectOption("A101-PROJECTOR");
  await page
    .getByLabel("Mô tả sự cố", { exact: true })
    .fill("Máy chiếu không lên hình. Tình huống giả lập để minh họa G01.");
  await scene("1. Người báo tạo sự cố máy chiếu A101", "01-reporter", 12);
  await page
    .getByRole("button", { name: "Gửi báo sự cố", exact: true })
    .click();
  await state("Chờ xác minh");
  code = await page.locator(".case-code").innerText();
  await scene(`2. Một mã hồ sơ xuyên suốt: ${code}`, "02-created", 10);
  await logout();
  await login("coordinator");
  await open();
  await page
    .getByRole("button", { name: "Tiếp nhận sự cố", exact: true })
    .click();
  await state("Chờ giao việc");
  await page
    .getByLabel("Người hoặc nhóm xử lý", { exact: true })
    .selectOption("person:33333333-3333-4333-8333-333333333333");
  await page
    .getByLabel("Người nghiệm thu", { exact: true })
    .selectOption("44444444-4444-4444-8444-444444444444");
  const due = new Date(Date.now() + 86400000);
  await page
    .getByLabel("Hạn hoàn thành", { exact: true })
    .fill(
      `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}T15:00`,
    );
  await scene(
    "3. Điều phối giao người xử lý, người nghiệm thu và hạn",
    "03-coordinator",
    12,
  );
  await page.getByRole("button", { name: "Giao xử lý", exact: true }).click();
  await state("Chờ nhận việc");
  await logout();
  await login("technician");
  await open();
  await page.getByRole("button", { name: "Nhận xử lý", exact: true }).click();
  await state("Đang xử lý");
  await page
    .getByLabel("Biện pháp xử lý", { exact: true })
    .fill("Kiểm tra và thay cáp HDMI trong tình huống giả lập.");
  await page
    .getByLabel("Kết quả xử lý", { exact: true })
    .fill("Máy chiếu hiển thị lại, chờ người nghiệm thu xác nhận.");
  await page.getByRole("button", { name: "Lưu kết quả", exact: true }).click();
  await scene(
    "4. Kỹ thuật viên ghi kết quả; thiếu bằng chứng chưa được gửi",
    "04-technician",
    12,
  );
  await page
    .getByLabel("Ảnh hoặc tài liệu bằng chứng (tối đa 10 MB)", { exact: true })
    .setInputFiles({
      name: "bien-ban-demo.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "Biên bản giả lập: máy chiếu A101 hiển thị sau kiểm tra cáp.",
      ),
    });
  await page
    .getByRole("button", { name: "Tải bằng chứng", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Gửi nghiệm thu", exact: true }),
  ).toBeEnabled({ timeout: 90000 });
  await page
    .getByRole("region", { name: "Bằng chứng hồ sơ", exact: true })
    .scrollIntoViewIfNeeded();
  await scene(
    "5. Tệp được quét sạch rồi mới gửi nghiệm thu",
    "05-evidence",
    12,
  );
  await page
    .getByRole("button", { name: "Gửi nghiệm thu", exact: true })
    .click();
  await state("Chờ nghiệm thu");
  await logout();
  await login("approver");
  await open();
  await scene(
    "6. Người nghiệm thu kiểm tra đúng hồ sơ và bằng chứng",
    "06-approver",
    12,
  );
  await page
    .getByRole("button", { name: "Phê duyệt và đóng hồ sơ", exact: true })
    .click();
  await state("Đã đóng");
  await scene(
    "7. Hồ sơ đã đóng; timeline giữ các bước theo vai trò",
    "07-closed",
    12,
  );
  await logout();
  await login("reporter");
  await page.getByRole("button", { name: /^Hoàn thành/ }).click();
  await open();
  await state("Đã đóng");
  await scene(
    "8. Người báo đọc kết quả trên cùng mã; báo cáo mở danh sách nguồn",
    "08-report",
    12,
  );
  await scene(
    "RC chờ người dùng mục tiêu xác nhận. Đây là demo tự động.",
    "10-status",
    3,
  );
  const left = 150000 - (Date.now() - began);
  if (left > 0) await page.waitForTimeout(left);
  completed = true;
} finally {
  await ctx.close();
  await browser.close();
  if (completed) {
    await rename(await video.path(), join(out, "schoolops-g01-rc1.webm"));
    await writeFile(
      join(out, "media-manifest.json"),
      JSON.stringify(
        {
          sourceRevision: config.sourceRevision,
          version: config.version,
          synthetic: true,
          automated: true,
          userAcceptance: "pending",
          code,
          scenes,
          capturedAt: new Date().toISOString(),
          elapsedSeconds: Math.round((Date.now() - began) / 1000),
        },
        null,
        2,
      ),
    );
    console.log(
      `Recorded synthetic G01 ${code}; ${scenes.length} scenes; runtime ${config.sourceRevision}.`,
    );
  } else
    console.error(
      "Recording incomplete; keep output private and inspect failure before publishing.",
    );
}
