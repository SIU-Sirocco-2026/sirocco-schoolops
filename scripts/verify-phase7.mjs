// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { client, recorder, base } from "./test-client.mjs";
import { replay } from "./replay-g02.mjs";
import { backup, restore } from "./backup.mjs";
import {
  root,
  compose,
  docker,
  runningServices,
  sourceRevision,
  run,
} from "./ops-lib.mjs";

const id = randomUUID().slice(0, 8),
  project = `sirocco-restore-${id}`;
const dir = resolve(root, `.local/drill-${id}`),
  target = join(dir, "restored-source"),
  archive = join(dir, "snapshot.sirocco");
await mkdir(dir, { recursive: true });
const password = randomBytes(32).toString("hex");
const c = await client(),
  { check } = await recorder("phase7-integration");
const originalServices = runningServices(),
  originalSource = sourceRevision();
let originalPaused = false,
  restoredStarted = false,
  manifest,
  row,
  privateRow,
  file,
  privateFile,
  environment;
const key = randomUUID(),
  payload = {
    title: `Khôi phục máy chiếu — giả lập ${id}`,
    roomId: "A101",
    assetId: "A101-PROJECTOR",
    description:
      "Dữ liệu giả lập để kiểm tra hồ sơ, quy trình, tệp và quyền sau khôi phục.",
  };
const work = {
  measures: "Kiểm tra nguồn máy chiếu giả lập.",
  result: "Đã hoạt động trong bài diễn tập khôi phục.",
};
async function getFile(user, row, file, prefix, expected = 200) {
  if (!c.tokens[user]) await c.login(user);
  const response = await fetch(
    `${base}/${prefix}/cases/${row.id}/evidence/${file.id}/download`,
    { headers: { Authorization: `Bearer ${c.tokens[user]}` } },
  );
  assert.equal(response.status, expected);
  return response;
}
try {
  await check(
    "prepare real in-flight workflows, clean public/restricted evidence and PM2.5 lineage before backup",
    async () => {
      row = (
        await c.call("reporter", "/g01/cases", payload, [201, 202], {
          "Idempotency-Key": key,
        })
      ).item;
      row = await c.ready(row.id);
      row = await c.repair(row);
      file = await c.upload(
        row,
        "technician",
        Buffer.from("Biên bản khôi phục máy chiếu giả lập."),
        "restore-g01.txt",
      );
      privateRow = (
        await c.call(
          "safety_reporter",
          "/g03/cases",
          {
            ...payload,
            title: `Vật cản hành lang giả lập — restore ${id}`,
            assetId: null,
          },
          [201, 202],
          { "Idempotency-Key": randomUUID() },
        )
      ).item;
      privateRow = await c.ready(privateRow.id, "safety_reporter", "g03");
      privateRow = await c.act(privateRow, "safety", "accept", {}, "g03");
      privateRow = await c.act(
        privateRow,
        "safety",
        "assign",
        {
          technicianId: "99999999-9999-4999-8999-999999999999",
          approverId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          dueAt: new Date(Date.now() + 86400000).toISOString(),
        },
        "g03",
      );
      privateRow = await c.act(privateRow, "safety", "receive", {}, "g03");
      privateFile = await c.upload(
        privateRow,
        "safety",
        Buffer.from("Bằng chứng vật cản giả lập hạn chế."),
        "restore-g03.txt",
        "g03",
      );
      environment = await replay(c);
      for (const episode of environment.episodes)
        await c.ready(episode.caseId, "environment", "g02");
    },
  );
  await check(
    "encrypted consistent snapshot includes all three databases, file bytes and versioned source",
    async () => {
      manifest = await backup(archive, password);
      assert.equal(manifest.source, originalSource);
      assert.equal(manifest.sourceDirty, false);
      assert.deepEqual(Object.keys(manifest.databases), [
        "schoolops",
        "keycloak",
        "flowable",
      ]);
      assert.ok(manifest.files.length > 0);
      assert.ok((await stat(archive)).size > 0);
      const checksum = (await readFile(archive + ".sha256", "utf8")).split(
        " ",
      )[0];
      const { sha256 } = await import("./backup-crypto.mjs");
      assert.equal(checksum, await sha256(archive));
    },
  );
  await check(
    "wrong key fails authentication before creating a restore workspace or containers",
    async () => {
      const badTarget = join(dir, "wrong-key");
      await assert.rejects(
        restore(archive, badTarget, `sirocco-badkey-${id}`, password + "wrong"),
        /authentication failed/,
      );
      await assert.rejects(stat(badTarget), { code: "ENOENT" });
      assert.equal(
        docker([
          "ps",
          "-aq",
          "--filter",
          `label=com.docker.compose.project=sirocco-badkey-${id}`,
        ]).trim(),
        "",
      );
    },
  );
  await check(
    "restore builds from a clean source archive into empty volumes; all table fingerprints and file checksums match",
    async () => {
      originalPaused = true;
      compose(["stop", "-t", "30", ...originalServices]);
      restoredStarted = true;
      await restore(archive, target, project, password);
      const report = JSON.parse(
        await readFile(join(target, "restore-report.json"), "utf8"),
      );
      assert.equal(report.source, originalSource);
      assert.equal(report.databaseFingerprintsMatch, true);
      assert.equal(report.fileChecksumsMatch, true);
      assert.equal(report.applicationReady, true);
      assert.equal(
        run("git", ["rev-parse", "HEAD"], { cwd: target }).trim(),
        originalSource,
      );
      assert.equal(
        run("git", ["status", "--porcelain"], { cwd: target }).trim(),
        "",
      );
      assert.equal(
        JSON.parse(compose(["config", "--format", "json"], { cwd: target }))
          .name,
        project,
      );
      await mkdir(join(root, "test-results"), { recursive: true });
      await writeFile(
        join(root, "test-results/restore-report.json"),
        JSON.stringify(report, null, 2),
      );
    },
  );
  await check(
    "restored Identity accepts fresh logins; idempotency, immutable process references and clean evidence survive",
    async () => {
      for (const user of [
        "reporter",
        "technician",
        "approver",
        "safety",
        "safety_reporter",
        "environment",
        "admin",
      ])
        await c.login(user);
      const repeated = await c.call("reporter", "/g01/cases", payload, 200, {
        "Idempotency-Key": key,
      });
      assert.equal(repeated.item.id, row.id);
      assert.equal(repeated.item.processId, row.processId);
      assert.equal(repeated.item.definitionId, row.definitionId);
      assert.equal(repeated.item.packageVersion, row.packageVersion);
      const bytes = Buffer.from(
        await (await getFile("technician", row, file, "g01")).arrayBuffer(),
      );
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        file.checksum,
      );
      row = await c.act(repeated.item, "technician", "submit", work);
      row = await c.act(row, "approver", "approve");
      assert.equal(row.status, "closed");
      const next = await c.create();
      assert.notEqual(next.code, row.code);
      assert.notEqual(next.processId, row.processId);
    },
  );
  await check(
    "restored G03 rejects known case/file IDs for G01/admin and retains authorized bytes, ACL and actionable workflow",
    async () => {
      for (const user of ["reporter", "admin"]) {
        await c.call(user, `/g03/cases/${privateRow.id}`, undefined, 404);
        await getFile(user, privateRow, privateFile, "g03", 404);
      }
      const bytes = Buffer.from(
        await (
          await getFile("safety", privateRow, privateFile, "g03")
        ).arrayBuffer(),
      );
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        privateFile.checksum,
      );
      privateRow = await c.act(privateRow, "safety", "submit", work, "g03");
      await c.login("safety_reviewer");
      privateRow = await c.act(
        privateRow,
        "safety_reviewer",
        "approve",
        {},
        "g03",
      );
      assert.equal(privateRow.status, "closed");
    },
  );
  await check(
    "restored G02 lineage and role-scoped reports reconcile with their source cases",
    async () => {
      for (const episode of environment.episodes) {
        const lineage = await c.call(
          "environment",
          `/g02/episodes/${episode.id}/lineage`,
        );
        assert.equal(lineage.episode.caseId, episode.caseId);
        assert.ok(JSON.stringify(lineage).includes(episode.id));
      }
      for (const [user, prefix] of [
        ["reporter", "g01"],
        ["environment", "g02"],
        ["safety", "g03"],
        ["admin", "g03"],
      ]) {
        const report = await c.call(user, `/${prefix}/reports`);
        for (const [bucket, field] of [
          ["all", "total"],
          ["open", "open"],
          ["completed", "completed"],
          ["overdue", "overdue"],
        ]) {
          assert.equal(
            (await c.call(user, `/${prefix}/cases?bucket=${bucket}`)).total,
            report[field],
            `${prefix} ${user} ${field}`,
          );
        }
      }
    },
  );
  await check(
    "restore refuses reuse of a populated project without changing its live case",
    async () => {
      await assert.rejects(
        restore(archive, join(dir, "forbidden-reuse"), project, password),
        /no containers or volumes/,
      );
      assert.equal(
        (await c.call("reporter", `/g01/cases/${row.id}`)).item.status,
        "closed",
      );
    },
  );
  await check(
    "restored installation can take another versioned backup using its own source history and project scope",
    async () => {
      const nextArchive = join(dir, "restored-installation.sirocco");
      run(
        process.execPath,
        ["scripts/backup.mjs", "create", "--output", nextArchive],
        {
          cwd: target,
          env: { ...process.env, SIROCCO_BACKUP_PASSPHRASE: password },
          timeout: 1200000,
        },
      );
      assert.ok((await stat(nextArchive)).size > 0);
      assert.match(
        await readFile(nextArchive + ".sha256", "utf8"),
        /^[a-f0-9]{64}  /,
      );
    },
  );
} finally {
  try {
    if (
      restoredStarted &&
      docker([
        "ps",
        "-aq",
        "--filter",
        `label=com.docker.compose.project=${project}`,
      ]).trim()
    )
      compose(["stop", "-t", "30"], { cwd: target, project });
  } finally {
    if (originalPaused) {
      compose(["start", ...originalServices]);
      for (let i = 0; i < 120; i++) {
        try {
          if ((await fetch("http://localhost:8088/api/health/ready")).ok) {
            originalPaused = false;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (originalPaused)
        throw new Error("Source project did not become ready after the drill");
    }
  }
}
console.log(
  "Phase 7 restore drill passed; original project resumed, all original volumes preserved.",
);
console.log(
  `Private drill workspace preserved locally: ${dir}; the randomly generated archive password was held only in process memory.`,
);
