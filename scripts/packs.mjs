// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { local } from "./local-config.mjs";
const [command, arg, version] = process.argv.slice(2);
const root = resolve(import.meta.dirname, "..");
async function token() {
  if (process.env.SIROCCO_TOKEN) return process.env.SIROCCO_TOKEN;
  const credentials = Object.fromEntries(
    (await readFile(resolve(root, ".env"), "utf8"))
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  const r = await fetch(
    `${local.authOrigin}/realms/sirocco/protocol/openid-connect/token`,
    {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "schoolops-smoke",
        username: "admin",
        password: credentials.DEMO_PASSWORD,
      }),
    },
  );
  if (!r.ok)
    throw Error(
      "Không đăng nhập được quản trị demo local; dùng SIROCCO_TOKEN cho môi trường khác.",
    );
  return (await r.json()).access_token;
}
async function run() {
  let path, body;
  if (["validate", "install"].includes(command) && arg) {
    const dir = resolve(root, arg),
      names = [
        "manifest.json",
        "schema.json",
        "workflow.bpmn20.xml",
        "evidence-policy.json",
        "seed.json",
        "labels.json",
      ];
    const files = await Promise.all(
      names.map((n) => readFile(resolve(dir, n), "utf8")),
    );
    body = {
      manifest: JSON.parse(files[0]),
      schema: JSON.parse(files[1]),
      workflow: files[2].replace(/\r\n?/g, "\n"),
      evidence: JSON.parse(files[3]),
      seed: JSON.parse(files[4]),
      labels: JSON.parse(files[5]),
    };
    path = `/${command}`;
  } else if (command === "activate" && arg && version) {
    path = `/${encodeURIComponent(arg)}/${encodeURIComponent(version)}/activate`;
    body = {};
  } else if (command === "list") path = "/";
  else
    throw Error(
      "Dùng: pnpm packs:validate <folder> | packs:install <folder> | packs:activate <id> <version> | packs:list",
    );
  const r = await fetch(
    `${process.env.SIROCCO_API || `${local.webOrigin}/api`}/packs${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${await token()}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const data = await r.json();
  console.log(JSON.stringify(data, null, 2));
  if (!r.ok) process.exitCode = 1;
}
run().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
