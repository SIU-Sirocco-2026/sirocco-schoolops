// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { pathToFileURL } from "node:url";

export class ClientError extends Error {
  constructor(message, status = 0, code = "CLIENT_ERROR", needsCheck = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.needsCheck = needsCheck;
  }
}
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
function identifier(value) {
  if (typeof value !== "string" || !uuid.test(value))
    throw new ClientError("Cần mã UUID hợp lệ, không dùng mã hiển thị hoặc process ID.");
  return value;
}

export function createClient({ apiUrl, token, transport = fetch }) {
  let base;
  try { base = new URL(apiUrl); } catch { throw new ClientError("Cần SIROCCO_API_URL đầy đủ, kết thúc bằng /api."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash ||
    base.pathname.replace(/\/$/, "") !== "/api" ||
    !(base.protocol === "https:" || (base.protocol === "http:" && loopback)))
    throw new ClientError("API phải dùng HTTPS hoặc HTTP loopback, đường dẫn /api và không chứa credential/query/fragment.");
  if (typeof token !== "string" || !token.trim() || /\s/.test(token))
    throw new ClientError("Cần SIROCCO_ACCESS_TOKEN từ Identity; không truyền token trong tham số lệnh.");
  const origin = base.origin + "/api";
  async function request(path, body, key) {
    const mutation = body !== undefined;
    let response;
    try {
      response = await transport(origin + path, {
        method: mutation ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(mutation ? { "Content-Type": "application/json" } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: mutation ? JSON.stringify(body) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ClientError("Mất kết nối hoặc hết thời gian chờ. Đọc lại danh sách để kiểm tra kết quả trước khi gửi lại.", 0, "NETWORK_ERROR", mutation);
    }
    if (response.status >= 300 && response.status < 400)
      throw new ClientError("API chuyển hướng ngoài hợp đồng; client không chuyển tiếp token hoặc lặp thao tác.", response.status, "REDIRECT_BLOCKED", mutation);
    let data;
    try {
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error();
      data = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    } catch {
      throw new ClientError("Chưa đọc được phản hồi JSON đầy đủ. Kiểm tra kết quả qua danh sách trước khi gửi lại thao tác.", response.status, "INVALID_RESPONSE", mutation);
    }
    if (!response.ok) {
      const code = typeof data.error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(data.error.code) ? data.error.code : "API_ERROR";
      // Keep server codes; never echo arbitrary gateway HTML, tokens or internal errors.
      throw new ClientError("API từ chối yêu cầu. Kiểm tra phiên, quyền và trạng thái; client không tự gửi lại.", response.status, code, mutation && response.status >= 500);
    }
    return { status: response.status, data };
  }
  return {
    identity: () => request("/me"),
    list: () => request("/foundation/tasks"),
    create: (key, title) => {
      identifier(key);
      if (typeof title !== "string" || title.trim().length < 5 || title.trim().length > 160)
        throw new ClientError("Tiêu đề cần từ 5 đến 160 ký tự.");
      return request("/foundation/tasks", { title: title.trim() }, key);
    },
    complete: (id) => request(`/foundation/tasks/${identifier(id)}/complete`, {}),
  };
}

export async function runCli(args, env = process.env) {
  const usage = "node client.mjs identity | list | create <UUID-key> <tiêu đề> | complete <UUID-id>\nĐặt SIROCCO_API_URL và SIROCCO_ACCESS_TOKEN trong môi trường. Không lưu token vào file hoặc tham số lệnh.";
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return { help: usage };
  const [operation, ...values] = args;
  if (!(["identity", "list"].includes(operation) && values.length === 0) &&
      !(operation === "complete" && values.length === 1) &&
      !(operation === "create" && values.length >= 2))
    throw new ClientError(usage);
  const client = createClient({ apiUrl: env.SIROCCO_API_URL, token: env.SIROCCO_ACCESS_TOKEN });
  if (operation === "create") return client.create(values[0], values.slice(1).join(" "));
  if (operation === "complete") return client.complete(values[0]);
  return client[operation]();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify({ ok: true, ...await runCli(process.argv.slice(2)) }, null, 2)); }
  catch (error) {
    const safe = error instanceof ClientError ? error : new ClientError("Client gặp lỗi không xác định; kiểm tra kết quả trước khi gửi lại.");
    console.log(JSON.stringify({ ok: false, status: safe.status, code: safe.code, message: safe.message, needsCheck: safe.needsCheck }));
    process.exitCode = 1;
  }
}
