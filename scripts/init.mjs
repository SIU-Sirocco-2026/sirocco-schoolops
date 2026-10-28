// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseLocalEnv, localUrls } from "./local-config.mjs";
import { prepareLocalSecrets } from "./local-secrets.mjs";

const root = resolve(import.meta.dirname, "..");
let existing = "";
try {
  existing = await readFile(resolve(root, ".env"), "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let env = parseLocalEnv(existing);
// Persist these inputs so Compose and commands run in a later shell agree.
for (const name of ["SIROCCO_WEB_PORT", "SIROCCO_AUTH_PORT", "COMPOSE_PROJECT_NAME"])
  if (process.env[name] !== undefined) env[name] = process.env[name];
const urls = localUrls(env);
env = prepareLocalSecrets(env, root);
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
users.push(
  [
    "66666666-6666-4666-8666-666666666666",
    "environment",
    "Cán bộ môi trường",
    "environment_officer",
  ],
  [
    "77777777-7777-4777-8777-777777777777",
    "sensor",
    "Nguồn phát lại",
    "environment_ingestor",
  ],
);
users.push(
  [
    "88888888-8888-4888-8888-888888888888",
    "safety_reporter",
    "Người báo an toàn",
    "safety_reporter",
  ],
  [
    "99999999-9999-4999-8999-999999999999",
    "safety",
    "Cán bộ an toàn",
    "safety_officer",
  ],
  [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "safety_reviewer",
    "Nghiệm thu an toàn",
    "safety_officer",
  ],
);
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
const { realmUi } = await import("./realm-ui.mjs");
const realm = {
  realm: "sirocco",
  enabled: true,
  ...realmUi,
  sslRequired: "none",
  registrationAllowed: false,
  resetPasswordAllowed: false,
  rememberMe: false,
  accessTokenLifespan: 300,
  bruteForceProtected: true,
  roles: {
    realm: [...new Set(users.map(([, , , role]) => role))].map((name) => ({
      name,
    })),
  },
  clients: [
    {
      clientId: "schoolops-web",
      name: "SchoolOps",
      enabled: true,
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      redirectUris: [`${urls.webOrigin}/*`, "http://localhost:5173/*"],
      webOrigins: [urls.webOrigin, "http://localhost:5173"],
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
await mkdir(resolve(root, "infra/generated"), { recursive: true, mode: 0o700 });
await writeFile(
  resolve(root, "infra/generated/realm.json"),
  JSON.stringify(realm, null, 2),
  { mode: 0o644 },
);
// The container has a different UID. Its read-only file mount must be readable;
// the private parent directory prevents other host users traversing to the file.
if (process.platform !== "win32") {
  await chmod(resolve(root, "infra/generated"), 0o700);
  await chmod(resolve(root, "infra/generated/realm.json"), 0o644);
}
console.log(
  "Đã tạo cấu hình local. Thông tin đăng nhập nằm trong .env (DEMO_PASSWORD).",
);
console.log("Tài khoản demo: " + users.map((u) => u[1]).join(", ") + ".");
console.log(
  `Chạy pnpm demo:up; mở ${urls.webOrigin} khi dịch vụ sẵn sàng.`,
);

await writeFile(
  resolve(root, "infra/generated/s3.json"),
  JSON.stringify(
    {
      identities: [
        {
          name: "schoolops",
          credentials: [
            { accessKey: env.S3_ACCESS_KEY, secretKey: env.S3_SECRET_KEY },
          ],
          actions: ["Admin", "Read", "Write", "List", "Tagging"],
        },
      ],
    },
    null,
    2,
  ),
  { mode: 0o644 },
);
