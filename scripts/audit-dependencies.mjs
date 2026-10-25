// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { root, sourceRevision, run } from "./ops-lib.mjs";

if (!process.env.npm_execpath) throw new Error("Run with pnpm security:audit.");
const result = spawnSync(
  process.execPath,
  [process.env.npm_execpath, "audit", "--prod", "--json"],
  { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 },
);
if (result.error) throw result.error;
let audit;
try {
  audit = JSON.parse(result.stdout);
} catch {
  throw new Error("Dependency registry returned no valid audit report.");
}
const counts = audit.metadata?.vulnerabilities;
if (
  audit.error ||
  !counts ||
  ![0, 1].includes(result.status) ||
  ["info", "low", "moderate", "high", "critical"].some(
    (k) => !Number.isInteger(counts[k]) || counts[k] < 0,
  )
)
  throw new Error(
    "Dependency audit failed or returned incomplete vulnerability counts.",
  );
await mkdir(join(root, "test-results"), { recursive: true });
await writeFile(
  join(root, "test-results/dependency-audit.json"),
  JSON.stringify(
    {
      sourceSha: sourceRevision(),
      sourceDirty: Boolean(run("git", ["status", "--porcelain"]).trim()),
      lockfileSha256: createHash("sha256")
        .update(await readFile(join(root, "pnpm-lock.yaml")))
        .digest("hex"),
      checkedAt: new Date().toISOString(),
      scope:
        "pnpm audit --prod; registry advisories for production npm dependencies, not OS images or a penetration test",
      failAt: "moderate",
      audit,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Production dependency audit: ${JSON.stringify(counts)}.`);
if (counts.moderate + counts.high + counts.critical > 0)
  throw new Error(
    "Production dependency advisories at moderate or above require review/fix.",
  );
