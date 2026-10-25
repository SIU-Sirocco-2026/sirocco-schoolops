import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root, run, compose, docker, sourceRevision } from "./ops-lib.mjs";
export function evidenceContext() {
  const sourceSha = sourceRevision();
  const version = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ).version;
  const runtimeRevisions = {};
  for (const service of ["api", "worker", "web"]) {
    const id = compose(["ps", "-q", service]).trim();
    runtimeRevisions[service] = id
      ? JSON.parse(docker(["inspect", id]))[0].Config.Labels?.[
          "org.opencontainers.image.revision"
        ] || "unknown"
      : "missing";
  }
  return {
    sourceSha,
    version,
    sourceDirty: Boolean(run("git", ["status", "--porcelain"]).trim()),
    runtimeRevisions,
  };
}
