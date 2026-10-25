import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  copyFile,
  stat,
  chmod,
} from "node:fs/promises";
import { resolve, dirname, join, basename } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import {
  root,
  run,
  docker,
  compose,
  ensureDocker,
  privateDirectory,
  sourceRevision,
  runningServices,
  inspectVolume,
  utilityImage,
  removeOwnedDirectory,
} from "./ops-lib.mjs";
import { encrypt, decrypt, sha256 } from "./backup-crypto.mjs";

const databases = ["schoolops", "keycloak", "flowable"];
const payloadFiles = [
  "manifest.json",
  "schoolops.dump",
  "keycloak.dump",
  "flowable.dump",
  "seaweed.tar",
  ".env",
  "realm.json",
  "s3.json",
];
const passphrase = process.env.SIROCCO_BACKUP_PASSPHRASE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function restoreConfiguration(data, target, project) {
  const generated = join(target, "infra/generated");
  await mkdir(generated, { recursive: true, mode: 0o700 });
  await chmod(generated, 0o700);
  for (const [from, to] of [
    [".env", ".env"],
    ["realm.json", "infra/generated/realm.json"],
    ["s3.json", "infra/generated/s3.json"],
  ])
    await copyFile(join(data, from), join(target, to));
  const restoredEnv = (await readFile(join(target, ".env"), "utf8"))
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("COMPOSE_PROJECT_NAME="))
    .join("\n")
    .trimEnd();
  await writeFile(
    join(target, ".env"),
    `${restoredEnv}\nCOMPOSE_PROJECT_NAME=${project}\n`,
    { mode: 0o600 },
  );
  await chmod(join(target, ".env"), 0o600);
  // File mounts must be readable by the container UID. Private parent
  // directories prevent other host users traversing to these secret files.
  for (const name of ["realm.json", "s3.json"])
    await chmod(join(generated, name), 0o644);
}
function option(name) {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}
export function safeEntries(names) {
  for (const name of names)
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      /^[A-Za-z]:/.test(name) ||
      name.split("/").includes("..")
    )
      throw new Error("Unsafe archive entry");
}
function checkArchive(path) {
  const names = run("tar", ["-tf", path]).trim().split(/\r?\n/);
  safeEntries(names);
  if (
    run("tar", ["-tvf", path])
      .trim()
      .split(/\r?\n/)
      .some((line) => !/^[d-]/.test(line))
  )
    throw new Error("Archive contains links or special devices");
}
export function databaseInventory(options = {}) {
  const result = {};
  for (const database of databases) {
    const tables = JSON.parse(
      compose(
        [
          "exec",
          "-T",
          "postgres",
          "psql",
          "-U",
          "postgres",
          "-d",
          database,
          "-tAc",
          "SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]') FROM pg_tables WHERE schemaname='public'",
        ],
        options,
      ),
    );
    const queries = tables.map((table) => {
      const identifier = '"' + table.replaceAll('"', '""') + '"';
      const literal = "'" + table.replaceAll("'", "''") + "'";
      return `SELECT ${literal} AS name,json_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex')) AS stats FROM public.${identifier} t`;
    });
    result[database] = tables.length
      ? JSON.parse(
          compose(
            [
              "exec",
              "-T",
              "postgres",
              "psql",
              "-U",
              "postgres",
              "-d",
              database,
              "-v",
              "ON_ERROR_STOP=1",
              "-tA",
            ],
            {
              ...options,
              input: `SELECT json_object_agg(name,stats ORDER BY name) FROM (${queries.join(" UNION ALL ")}) inventory;`,
            },
          ),
        )
      : {};
  }
  return result;
}
function fileInventory(volume) {
  const code = `const f=require('fs'),p=require('path'),c=require('crypto');const out=[];function walk(dir){for(const e of f.readdirSync(dir,{withFileTypes:true})){const name=p.join(dir,e.name);if(e.isDirectory())walk(name);else if(e.isFile())out.push({path:p.relative('/data',name),size:f.statSync(name).size,sha256:c.createHash('sha256').update(f.readFileSync(name)).digest('hex')});else throw Error('Links/special files are unsupported');}}walk('/data');console.log(JSON.stringify(out.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)));`;
  return JSON.parse(
    docker([
      "run",
      "--rm",
      "--network",
      "none",
      "--mount",
      `type=volume,src=${volume},dst=/data,readonly`,
      utilityImage,
      "node",
      "-e",
      code,
    ]),
  );
}
async function scratch() {
  await mkdir(resolve(root, ".local"), { recursive: true });
  const dir = await mkdtemp(resolve(root, ".local/backup-work-"));
  privateDirectory(dir);
  return dir;
}
async function resume(services, options = {}) {
  if (services.length) compose(["start", ...services], options);
}
export async function backup(output, password = passphrase) {
  if (!password || password.length < 16)
    throw new Error(
      "SIROCCO_BACKUP_PASSPHRASE must have at least 16 characters",
    );
  ensureDocker();
  if (run("git", ["status", "--porcelain"]).trim())
    throw new Error("Commit source changes before taking a versioned backup");
  try {
    await stat(output);
    throw new Error("Backup output already exists");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const services = runningServices();
  if (!services.includes("postgres") || !services.includes("api"))
    throw new Error("A running initialized stack is required");
  const work = await scratch(),
    data = join(work, "data");
  await mkdir(data);
  const writers = services.filter((s) => !["postgres", "clamav"].includes(s));
  let stopped = false;
  try {
    console.log(
      "Pausing writers for a consistent database/workflow/file snapshot.",
    );
    const revision = sourceRevision();
    for (const service of ["api", "worker", "web"]) {
      const id = compose(["ps", "-q", service]).trim();
      if (
        !id ||
        JSON.parse(docker(["inspect", id]))[0].Config.Labels?.[
          "org.opencontainers.image.revision"
        ] !== revision
      )
        throw new Error(
          "Running images do not match this source commit. Run pnpm demo:up from the clean checkout before backup.",
        );
    }
    // Close ingress first, then API/worker before Identity, engine and file store.
    stopped = true;
    if (writers.includes("gateway")) compose(["stop", "-t", "30", "gateway"]);
    const app = writers.filter((s) => ["api", "worker"].includes(s));
    if (app.length) compose(["stop", "-t", "30", ...app]);
    const remaining = writers.filter(
      (s) => !["api", "worker", "gateway"].includes(s),
    );
    if (remaining.length) compose(["stop", "-t", "30", ...remaining]);
    const source = sourceRevision();
    const volume = inspectVolume("seaweedfs", "/data");
    const manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      source,
      sourceDirty: Boolean(run("git", ["status", "--porcelain"]).trim()),
      version: JSON.parse(await readFile(join(root, "package.json"), "utf8"))
        .version,
      databases: databaseInventory(),
      files: fileInventory(volume),
      hashes: {},
    };
    for (const database of databases)
      compose(
        [
          "exec",
          "-T",
          "postgres",
          "pg_dump",
          "-U",
          "postgres",
          "-d",
          database,
          "-Fc",
        ],
        { output: join(data, `${database}.dump`) },
      );
    docker(
      [
        "run",
        "--rm",
        "--network",
        "none",
        "--mount",
        `type=volume,src=${volume},dst=/data,readonly`,
        utilityImage,
        "tar",
        "-cf",
        "-",
        "-C",
        "/data",
        ".",
      ],
      { output: join(data, "seaweed.tar") },
    );
    for (const [from, to] of [
      [".env", ".env"],
      ["infra/generated/realm.json", "realm.json"],
      ["infra/generated/s3.json", "s3.json"],
    ])
      await copyFile(join(root, from), join(data, to));
    for (const file of payloadFiles.filter((f) => f !== "manifest.json"))
      manifest.hashes[file] = await sha256(join(data, file));
    await writeFile(
      join(data, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      { mode: 0o600 },
    );
    await resume(writers);
    stopped = false;
    const tar = join(work, "snapshot.tar");
    run("tar", ["-cf", tar, "-C", data, ...payloadFiles]);
    await mkdir(dirname(output), { recursive: true });
    await encrypt(tar, output, password);
    await writeFile(
      output + ".sha256",
      `${await sha256(output)}  ${basename(output)}\n`,
      { mode: 0o600 },
    );
    console.log(`Encrypted snapshot ready: ${output}`);
    return manifest;
  } finally {
    try {
      if (stopped) await resume(writers);
    } finally {
      await removeOwnedDirectory(work, join(root, ".local"), "backup-work-");
    }
  }
}

export async function restore(input, target, project, password = passphrase) {
  if (!/^[a-z][a-z0-9-]{2,50}$/.test(project || ""))
    throw new Error(
      "Choose a new project name (3–51 lowercase letters/digits/hyphens)",
    );
  ensureDocker();
  // Never delete/reuse a live project or an existing persistent volume.
  if (
    docker([
      "ps",
      "-aq",
      "--filter",
      `label=com.docker.compose.project=${project}`,
    ]).trim() ||
    docker([
      "volume",
      "ls",
      "-q",
      "--filter",
      `label=com.docker.compose.project=${project}`,
    ]).trim()
  )
    throw new Error(
      "Restore target project must have no containers or volumes",
    );
  try {
    await stat(target);
    throw new Error("Restore workspace must not exist");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const work = await scratch();
  let initialized = false;
  try {
    const tar = join(work, "snapshot.tar");
    await decrypt(input, tar, password);
    checkArchive(tar);
    const listed = run("tar", ["-tf", tar]).trim().split(/\r?\n/);
    if (!isDeepStrictEqual([...listed].sort(), [...payloadFiles].sort()))
      throw new Error("Unexpected backup members");
    const data = join(work, "data");
    await mkdir(data);
    for (const file of payloadFiles)
      run("tar", ["-xOf", tar, file], { output: join(data, file) });
    const manifest = JSON.parse(
      await readFile(join(data, "manifest.json"), "utf8"),
    );
    if (
      manifest.format !== 1 ||
      !/^[0-9a-f]{40}$/.test(manifest.source) ||
      manifest.sourceDirty
    )
      throw new Error("Restore requires a clean, versioned source snapshot");
    for (const file of payloadFiles.filter((f) => f !== "manifest.json"))
      if ((await sha256(join(data, file))) !== manifest.hashes[file])
        throw new Error(`Backup member checksum mismatch: ${file}`);
    checkArchive(join(data, "seaweed.tar"));
    run("git", ["cat-file", "-e", `${manifest.source}^{commit}`]);
    privateDirectory(target);
    const sourceTar = join(work, "source.tar");
    run("git", ["archive", "--format=tar", manifest.source], {
      output: sourceTar,
    });
    run("tar", ["-xf", sourceTar, "-C", target]);
    // Keep an independent Git object store, so the restored installation can
    // itself create versioned backups without depending on the source checkout.
    run("git", ["init", target]);
    run("git", [
      "-C",
      target,
      "fetch",
      "--no-tags",
      "--depth=1",
      root,
      manifest.source,
    ]);
    run("git", ["-C", target, "reset", "--mixed", manifest.source]);
    await restoreConfiguration(data, target, project);
    const options = {
      cwd: target,
      project,
      env: {
        ...process.env,
        SIROCCO_SOURCE_REVISION: manifest.source,
        SIROCCO_APP_VERSION: manifest.version,
      },
    };
    console.log(
      `Restoring ${manifest.version} (${manifest.source.slice(0, 12)}) into new project ${project}.`,
    );
    compose(["up", "-d", "--wait", "postgres"], options);
    initialized = true;
    for (const database of databases)
      compose(
        [
          "exec",
          "-T",
          "postgres",
          "pg_restore",
          "-U",
          "postgres",
          "-d",
          database,
          "--clean",
          "--if-exists",
          "--exit-on-error",
        ],
        {
          ...options,
          input: await readFile(join(data, `${database}.dump`)),
          binary: true,
        },
      );
    const actual = databaseInventory(options);
    if (!isDeepStrictEqual(actual, manifest.databases))
      throw new Error(
        "Restored database fingerprint differs from the snapshot",
      );
    compose(["up", "--no-start", "--no-deps", "seaweedfs"], options);
    const volume = inspectVolume("seaweedfs", "/data", options);
    docker(
      [
        "run",
        "--rm",
        "--network",
        "none",
        "-i",
        "--mount",
        `type=volume,src=${volume},dst=/data`,
        utilityImage,
        "tar",
        "-xf",
        "-",
        "-C",
        "/data",
      ],
      { input: await readFile(join(data, "seaweed.tar")), binary: true },
    );
    if (!isDeepStrictEqual(fileInventory(volume), manifest.files))
      throw new Error("Restored file checksums differ from the snapshot");
    const report = {
      restoredAt: new Date().toISOString(),
      source: manifest.source,
      version: manifest.version,
      databaseFingerprintsMatch: true,
      fileChecksumsMatch: true,
      tables: Object.fromEntries(
        Object.entries(actual).map(([db, tables]) => [
          db,
          Object.keys(tables).length,
        ]),
      ),
      files: manifest.files.length,
      applicationReady: false,
      project,
    };
    await writeFile(
      join(target, "restore-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      "All three databases and file checksums match. Starting the restored stack.",
    );
    compose(["up", "-d", "--build", "--wait", "--wait-timeout", "360"], {
      ...options,
      timeout: 1200000,
    });
    // Readiness covers the database/Identity/workflow; scanner has its own healthcheck.
    for (let i = 0; i < 90; i++) {
      try {
        const r = await fetch("http://localhost:8088/api/health/ready");
        if (r.ok) {
          report.applicationReady = true;
          await writeFile(
            join(target, "restore-report.json"),
            JSON.stringify(report, null, 2),
          );
          return { manifest, target, project };
        }
      } catch {
        /* bounded startup */
      }
      await sleep(2000);
    }
    throw new Error("Restored gateway did not become ready");
  } catch (e) {
    if (initialized)
      console.error(
        `Restore stopped with project ${project} preserved for diagnosis; no source volumes were changed.`,
      );
    throw e;
  } finally {
    await removeOwnedDirectory(work, join(root, ".local"), "backup-work-");
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
) {
  const action = process.argv[2];
  if (action === "create")
    await backup(
      resolve(
        option("--output") ||
          join(
            root,
            ".local/backups",
            `${new Date().toISOString().replaceAll(/[:.]/g, "-")}.sirocco`,
          ),
      ),
    );
  else if (action === "restore") {
    if (!option("--input") || !option("--target") || !option("--project"))
      throw new Error(
        "restore --input BACKUP --target NEW_DIRECTORY --project NEW_PROJECT",
      );
    await restore(
      resolve(option("--input")),
      resolve(option("--target")),
      option("--project"),
    );
  } else
    throw new Error(
      "Use create [--output PATH] or restore --input PATH --target NEW_DIRECTORY --project NEW_PROJECT",
    );
}
