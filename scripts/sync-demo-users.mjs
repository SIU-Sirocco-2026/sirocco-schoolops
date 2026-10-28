// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { realmUi } from "./realm-ui.mjs";
import { local } from "./local-config.mjs";
const env = Object.fromEntries(
  (await readFile(new URL("../.env", import.meta.url), "utf8"))
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const realm = JSON.parse(
  await readFile(
    new URL("../infra/generated/realm.json", import.meta.url),
    "utf8",
  ),
);
const response = await fetch(
  `${local.authOrigin}/realms/master/protocol/openid-connect/token`,
  {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: "admin",
      password: env.KEYCLOAK_ADMIN_PASSWORD,
    }),
  },
);
if (!response.ok) throw Error("Không đăng nhập được admin Keycloak local");
const token = (await response.json()).access_token;
async function api(path, body, method = body ? "POST" : "GET") {
  const r = await fetch(
    `${local.authOrigin}/admin/realms/sirocco${path ? `/${path}` : ""}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  if (!r.ok) throw Error(`Keycloak demo sync HTTP ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
await api("", realmUi, "PUT");
const webClients = await api("clients?clientId=schoolops-web");
if (webClients.length !== 1) throw Error("Không tìm thấy đúng một client SchoolOps.");
await api(`clients/${webClients[0].id}`, {
  redirectUris: [`${local.webOrigin}/*`, "http://localhost:5173/*"],
  webOrigins: [local.webOrigin, "http://localhost:5173"],
}, "PUT");
console.log("SchoolOps login presentation ready (Vietnamese).");
for (const user of realm.users.filter((u) =>
  [
    "environment",
    "sensor",
    "safety_reporter",
    "safety",
    "safety_reviewer",
  ].includes(u.username),
)) {
  for (const name of user.realmRoles) {
    const roles = await api("roles");
    if (!roles.some((r) => r.name === name)) await api("roles", { name });
  }
  let current = await api(
    `users?username=${encodeURIComponent(user.username)}&exact=true`,
  );
  if (!current.length) {
    await api("users", user);
    current = await api(
      `users?username=${encodeURIComponent(user.username)}&exact=true`,
    );
  }
  const actual = current[0].id;
  if (!/^[a-f0-9-]{36}$/.test(actual)) throw Error("Invalid identity subject");
  const roles = await api("roles");
  await api(
    `users/${actual}/role-mappings/realm`,
    roles.filter((r) => user.realmRoles.includes(r.name)),
  );
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "api", "node", "--input-type=module"],
    {
      cwd: new URL("..", import.meta.url),
      stdio: ["pipe", "pipe", "pipe"],
      input: `import {pool} from './apps/api/dist/db.js';await pool.query('INSERT INTO identity_bindings(subject_id,issuer,member_id) VALUES($1,$2,$3) ON CONFLICT(issuer,subject_id) DO UPDATE SET member_id=excluded.member_id',[${JSON.stringify(actual)},process.env.OIDC_ISSUER,${JSON.stringify(user.id)}]);await pool.end();`,
    },
  );
  console.log(`Demo user ready: ${user.username}`);
}
// Updates presentation and adds known demo accounts; never reimports a realm or resets credentials/volumes.
