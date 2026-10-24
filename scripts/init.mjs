import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
let existing = "";
try {
  existing = await readFile(resolve(root, ".env"), "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const env = Object.fromEntries(
  existing
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
for (const key of [
  "POSTGRES_ADMIN_PASSWORD",
  "APP_DB_PASSWORD",
  "KEYCLOAK_DB_PASSWORD",
  "FLOWABLE_DB_PASSWORD",
  "KEYCLOAK_ADMIN_PASSWORD",
  "FLOWABLE_ADMIN_PASSWORD",
  "DEMO_PASSWORD",
])
  env[key] ||= randomBytes(24).toString("hex");
await writeFile(
  resolve(root, ".env"),
  "# Local development secrets — do not commit\n" +
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") +
    "\n",
  { mode: 0o600 },
);

const users = [
  ["11111111-1111-4111-8111-111111111111", "reporter", "Người báo", "reporter"],
  [
    "22222222-2222-4222-8222-222222222222",
    "coordinator",
    "Điều phối",
    "coordinator",
  ],
  [
    "33333333-3333-4333-8333-333333333333",
    "technician",
    "Kỹ thuật viên",
    "technician",
  ],
  [
    "44444444-4444-4444-8444-444444444444",
    "approver",
    "Nghiệm thu",
    "approver",
  ],
  [
    "55555555-5555-4555-8555-555555555555",
    "admin",
    "Quản trị kỹ thuật",
    "admin",
  ],
];
const audience = {
  name: "schoolops-audience",
  protocol: "openid-connect",
  protocolMapper: "oidc-audience-mapper",
  config: {
    "included.custom.audience": "schoolops-api",
    "id.token.claim": "false",
    "access.token.claim": "true",
  },
};
const realm = {
  realm: "sirocco",
  enabled: true,
  displayName: "Sirocco · SchoolOps",
  sslRequired: "none",
  registrationAllowed: false,
  resetPasswordAllowed: false,
  rememberMe: false,
  accessTokenLifespan: 300,
  bruteForceProtected: true,
  roles: { realm: users.map(([, , , role]) => ({ name: role })) },
  clients: [
    {
      clientId: "schoolops-web",
      name: "SchoolOps",
      enabled: true,
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      redirectUris: ["http://localhost:8088/*", "http://localhost:5173/*"],
      webOrigins: ["http://localhost:8088", "http://localhost:5173"],
      attributes: { "pkce.code.challenge.method": "S256" },
      protocolMappers: [audience],
    },
    {
      clientId: "schoolops-smoke",
      name: "Local integration tests only",
      enabled: true,
      publicClient: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: true,
      protocolMappers: [audience],
    },
  ],
  users: users.map(([id, username, firstName, role]) => ({
    id,
    username,
    firstName,
    lastName: "Demo",
    enabled: true,
    emailVerified: true,
    email: `${username}@schoolops.invalid`,
    requiredActions: [],
    credentials: [
      { type: "password", value: env.DEMO_PASSWORD, temporary: false },
    ],
    realmRoles: [role],
  })),
};
await mkdir(resolve(root, "infra/generated"), { recursive: true });
await writeFile(
  resolve(root, "infra/generated/realm.json"),
  JSON.stringify(realm, null, 2),
  { mode: 0o600 },
);
console.log(
  "Đã tạo cấu hình local. Thông tin đăng nhập nằm trong .env (DEMO_PASSWORD).",
);
console.log("Tài khoản: reporter, coordinator, technician, approver, admin.");
console.log(
  "Chạy pnpm demo:up; mở http://localhost:8088 khi dịch vụ sẵn sàng.",
);
