// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readLocalEnv } from "./local-config.mjs";

export const localSecretNames = [
  "POSTGRES_ADMIN_PASSWORD", "APP_DB_PASSWORD", "KEYCLOAK_DB_PASSWORD",
  "FLOWABLE_DB_PASSWORD", "KEYCLOAK_ADMIN_PASSWORD", "FLOWABLE_ADMIN_PASSWORD",
  "DEMO_PASSWORD", "S3_ACCESS_KEY", "S3_SECRET_KEY",
];
const generatedFiles = ["realm.json", "s3.json"];
function missingNames(env) {
  return localSecretNames.filter(name => typeof env[name] !== "string" || !env[name].trim());
}
function missingError(names, initialized = true) {
  return new Error(`Thiếu secret local: ${names.join(", ")}. ${initialized ? "Bản đã khởi tạo cần khôi phục .env gốc từ bản sao an toàn; không sinh mật khẩu mới hoặc xóa volume để sửa lỗi này." : "Với bản cài mới, chạy pnpm demo:init trước. Nếu từng có dữ liệu, khôi phục .env gốc; không xóa volume."}`);
}
export function prepareLocalSecrets(env, directory) {
  const missing = missingNames(env);
  const initialized = generatedFiles.some(name => existsSync(join(directory, "infra/generated", name)));
  if (initialized && missing.length) throw missingError(missing);
  return { ...env, ...Object.fromEntries(missing.map(name => [name, randomBytes(24).toString("hex")])) };
}
export async function assertLocalStartup(directory, overrides = process.env) {
  const env = readLocalEnv(directory, overrides);
  const missing = missingNames(env);
  if (missing.length) throw missingError(missing, generatedFiles.some(name => existsSync(join(directory, "infra/generated", name))));
  const values = [];
  for (const name of generatedFiles) {
    try {
      values.push(JSON.parse(await readFile(join(directory, "infra/generated", name), "utf8")));
    } catch {
      throw new Error(`Cấu hình infra/generated/${name} thiếu hoặc không hợp lệ. Kiểm tra .env gốc rồi chạy pnpm demo:init; chưa khởi động Docker.`);
    }
  }
  const [realm, s3] = values;
  const users = realm?.users;
  if (!Array.isArray(users) || !users.length || users.some(user => !Array.isArray(user?.credentials) || !user.credentials.some(credential => credential?.type === "password" && credential.value === env.DEMO_PASSWORD)))
    throw new Error("DEMO_PASSWORD không khớp realm config. Giữ .env gốc, kiểm tra cấu hình và chạy pnpm demo:init trước khi đồng bộ tài khoản.");
  const credentials = Array.isArray(s3?.identities) ? s3.identities.find(identity => identity?.name === "schoolops")?.credentials : undefined;
  if (!Array.isArray(credentials) || !credentials.some(credential => credential?.accessKey === env.S3_ACCESS_KEY && credential.secretKey === env.S3_SECRET_KEY))
    throw new Error("S3_ACCESS_KEY/S3_SECRET_KEY không khớp cấu hình sinh ra. Giữ .env gốc và kiểm tra trước khi chạy pnpm demo:init; chưa khởi động Docker.");
}
