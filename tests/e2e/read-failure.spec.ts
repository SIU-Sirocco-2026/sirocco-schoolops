// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test, expect, type Page } from "./fixtures.js";
import { readFileSync } from "node:fs";
const settings = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#")).map(l => { const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1)]; }));
async function open(page: Page, row: {code:string}) {
  await page.goto("/");
  await page.getByRole("button", { name: /Đăng nhập vào SchoolOps/ }).click();
  await page.getByLabel("Tên đăng nhập hoặc email", { exact: true }).fill("technician");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(settings.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByLabel("Tìm hồ sơ", { exact: true }).fill(row.code);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page.getByRole("button").filter({hasText:row.code}).click();
  await expect(page.locator(".case-code")).toHaveText(row.code);
}

test("a real revision conflict followed by a failed list read keeps work and file until an explicit refresh", async ({page}, info) => {
  test.setTimeout(90000);
  const {client,png}=await import("../../scripts/test-client.mjs");
  const c=await client(), row=await c.repair(await c.create());
  await page.setViewportSize({width:390,height:844});
  await open(page,row);
  const draft="Biện pháp giả lập đang nhập khi dịch vụ đọc lỗi.";
  await page.getByLabel("Biện pháp xử lý",{exact:true}).fill(draft);
  await page.getByLabel("Kết quả xử lý",{exact:true}).fill("Kết quả giả lập chưa gửi.");
  await page.getByLabel("Ảnh hoặc tài liệu bằng chứng (tối đa 10 MB)",{exact:true}).setInputFiles({name:"giu-nhap.png",mimeType:"image/png",buffer:png});
  await c.act(row,"technician","save_work",{measures:"Nội dung từ client khác đã được server lưu.",result:"Revision mới từ phép kiểm thật."});
  const pattern="**/api/g01/cases?*";
  await page.route(pattern,route=>route.fulfill({status:503,contentType:"application/json",json:{error:{message:"Lỗi đọc danh sách giả lập E03."}}}));
  let posts=0;
  page.on("request",r=>{if(r.method()==="POST"&&r.url().endsWith(`/api/g01/cases/${row.id}/actions`))posts++;});
  try {
    await page.getByRole("button",{name:"Lưu kết quả",exact:true}).click();
    await expect(page.getByRole("alert").filter({hasText:"Hồ sơ đã thay đổi"}).first()).toBeVisible();
    await info.attach("read-failure-before-or-after",{contentType:"application/json",body:Buffer.from(JSON.stringify({caseDetail:await page.locator(".case-detail").count(),draftFields:await page.getByLabel("Biện pháp xử lý",{exact:true}).count(),posts,injection:"GET list 503 after real POST 409"}))});
    await expect(page.getByLabel("Biện pháp xử lý",{exact:true})).toHaveValue(draft);
    await expect(page.locator(".file-name")).toHaveText("giu-nhap.png");
    await expect(page.locator(".case-read-error")).toContainText("Nội dung đang nhập vẫn được giữ");
    await expect(page.getByLabel("Biện pháp xử lý",{exact:true})).toBeEnabled();
    await expect(page.getByRole("button",{name:"Lưu kết quả",exact:true})).toBeDisabled();
    await expect(page.getByRole("button",{name:"Tải bằng chứng",exact:true})).toBeDisabled();
    expect(posts).toBe(1);
  } finally {await page.unroute(pattern);}
  page.once("dialog",dialog=>dialog.accept());
  await page.getByRole("button",{name:"Làm mới hồ sơ",exact:true}).click();
  await expect(page.getByLabel("Biện pháp xử lý",{exact:true})).toHaveValue("Nội dung từ client khác đã được server lưu.");
  await expect(page.locator(".case-read-error")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Lưu kết quả",exact:true})).toBeEnabled();
  expect(posts).toBe(1);
});

for(const status of [401,403,404]) test(`a verified HTTP ${status} detail denial clears the cached case and report`,async ({page})=>{
  test.setTimeout(90000);
  const {client}=await import("../../scripts/test-client.mjs");
  const c=await client(),row=await c.repair(await c.create());
  await page.setViewportSize({width:390,height:844});
  await open(page,row);
  const pattern=`**/api/g01/cases/${row.id}`;
  // Read-only UI contract injection; server authorization is tested by the HTTP integration suites.
  await page.route(pattern,route=>route.fulfill({status,contentType:"application/json",json:{error:{message:`Từ chối đọc giả lập ${status}.`}}}));
  try {
    await page.getByRole("button",{name:"Làm mới hồ sơ",exact:true}).click();
    await expect(page.locator(".case-detail")).toHaveCount(0);
    await expect(page.getByRole("region",{name:"Báo cáo hồ sơ",exact:true})).toHaveCount(0);
    await expect(page.getByRole("alert").filter({hasText:`Từ chối đọc giả lập ${status}.`}).first()).toBeVisible();
  } finally {await page.unroute(pattern);}
});
