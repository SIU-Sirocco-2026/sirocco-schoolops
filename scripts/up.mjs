// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  root,
  compose,
  ensureDocker,
  sourceRevision,
  run,
} from "./ops-lib.mjs";
ensureDocker();
let source;
try {
  source =
    sourceRevision() +
    (run("git", ["status", "--porcelain"]).trim() ? "-dirty" : "");
} catch {
  source = (await readFile(join(root, "SOURCE-REVISION"), "utf8")).trim();
  if (!/^[a-f0-9]{40}$/.test(source))
    throw new Error("Source revision metadata is missing");
}
const version = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
).version;
console.log(`Building SchoolOps ${version} from ${source}.`);
console.log(
  compose(["up", "-d", "--build", "--wait", "--wait-timeout", "360"], {
    env: {
      ...process.env,
      SIROCCO_SOURCE_REVISION: source,
      SIROCCO_APP_VERSION: version,
    },
    timeout: 1200000,
  }),
);
