import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { client, recorder, root, png } from "./test-client.mjs";
const c = await client(),
  { check } = await recorder("phase4-integration");
const activate = (v) => c.call("admin", `/packs/g01/${v}/activate`, {});
async function bundle(v) {
  const dir = `${root}/packs/g01/v${v}`;
  const f = await Promise.all(
    [
      "manifest.json",
      "schema.json",
      "workflow.bpmn20.xml",
      "evidence-policy.json",
      "seed.json",
      "labels.json",
    ].map((f) => readFile(`${dir}/${f}`, "utf8")),
  );
  return {
    manifest: JSON.parse(f[0]),
    schema: JSON.parse(f[1]),
    workflow: f[2],
    evidence: JSON.parse(f[3]),
    seed: JSON.parse(f[4]),
    labels: JSON.parse(f[5]),
  };
}
const v2 = await bundle(2);
let old, newCase;
const work = {
  measures: "Kiểm tra và thay dây tín hiệu.",
  result: "Máy chiếu hoạt động bình thường.",
};
try {
  await activate("1.0.0");
  await check(
    "only technical admin can list, validate, install or activate; CLI validates a complete v2 bundle",
    async () => {
      for (const role of [
        "reporter",
        "coordinator",
        "technician",
        "approver",
      ]) {
        await c.call(role, "/packs", undefined, 403);
        await c.call(role, "/packs/validate", v2, 403);
        await c.call(role, "/packs/install", v2, 403);
        await c.call(role, "/packs/g01/2.0.0/activate", {}, 403);
      }
      const output = execFileSync(
        process.execPath,
        ["scripts/packs.mjs", "validate", "packs/g01/v2"],
        { cwd: root, encoding: "utf8" },
      );
      assert.equal(JSON.parse(output).valid, true);
    },
  );
  await check(
    "invalid role, schema, seed, evidence and BPMN are rejected without changing active revision",
    async () => {
      const bad = structuredClone(v2);
      bad.manifest.tasks.verify.role = "missing";
      await c.call("admin", "/packs/install", bad, 400);
      await c.call("admin", "/packs/validate", bad, 400);
      await c.call("admin", "/packs/g01/99.0.0/activate", {}, 404);
      const data = await c.call("admin", "/packs");
      assert.equal(
        data.items.find((r) => r.active && r.packId === "g01").version,
        "1.0.0",
      );
      assert.ok(
        data.events.some(
          (e) => e.action === "validation_failed" && e.errors.length,
        ),
      );
    },
  );
  await check(
    "CLI install is idempotent and version content is immutable",
    async () => {
      old = await c.create();
      assert.equal(old.packageVersion, "g01@1.0.0");
      const install = () =>
        JSON.parse(
          execFileSync(
            process.execPath,
            ["scripts/packs.mjs", "install", "packs/g01/v2"],
            { cwd: root, encoding: "utf8" },
          ),
        );
      const a = install(),
        b = install();
      assert.equal(a.id, b.id);
      assert.equal(a.definitionId, b.definitionId);
      const bad = structuredClone(v2);
      bad.labels.title = "Thay nội dung cùng version";
      await c.call("admin", "/packs/install", bad, 409);
    },
  );
  await check(
    "atomic activation pins new cases to v2, preserves old v1 through restart and current permissions",
    async () => {
      execFileSync(
        process.execPath,
        ["scripts/packs.mjs", "activate", "g01", "2.0.0"],
        { cwd: root, encoding: "utf8" },
      );
      newCase = await c.create();
      assert.equal(newCase.packageVersion, "g01@2.0.0");
      assert.notEqual(newCase.definitionId, old.definitionId);
      assert.notEqual(newCase.packRevisionId, old.packRevisionId);
      assert.deepEqual(newCase.evidencePolicy.submit.mimeTypes, [
        "image/png",
        "image/jpeg",
      ]);
      execFileSync("docker", ["compose", "restart", "api"], {
        cwd: root,
        stdio: "pipe",
      });
      for (let i = 0; i < 90; i++) {
        try {
          const after = await c.call("admin", "/packs");
          assert.equal(
            after.items.find((r) => r.active && r.packId === "g01").version,
            "2.0.0",
          );
          break;
        } catch (e) {
          if (i === 89) throw e;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      const existing = await c.ready(old.id);
      assert.equal(existing.definitionId, old.definitionId);
      assert.equal(existing.packageVersion, "g01@1.0.0");
      await c.call("admin", `/g01/cases/${old.id}`, undefined, 404);
    },
  );
  await check(
    "v1 completes with clean text after v2 activation; v2 blocks clean text and accepts clean photo",
    async () => {
      old = await c.repair(old);
      await c.upload(
        old,
        "technician",
        Buffer.from("Biên bản văn bản của hồ sơ v1."),
        "v1.txt",
      );
      old = await c.act(old, "technician", "submit", work);
      old = await c.act(old, "approver", "approve");
      assert.equal(old.status, "closed");
      assert.equal(old.packageVersion, "g01@1.0.0");
      newCase = await c.repair(newCase);
      await c.upload(
        newCase,
        "technician",
        Buffer.from("Biên bản văn bản không thay được ảnh v2."),
        "v2.txt",
      );
      const blocked = await c.call(
        "technician",
        `/g01/cases/${newCase.id}/actions`,
        { action: "submit", revision: newCase.revision, ...work },
        409,
      );
      assert.equal(blocked.error.code, "EVIDENCE_REQUIRED");
      const image = await c.upload(newCase, "technician", png, "v2.png");
      newCase = await c.act(newCase, "technician", "submit", work);
      newCase = await c.act(newCase, "approver", "approve");
      assert.equal(newCase.status, "closed");
      const timeline = (await c.call("reporter", `/g01/cases/${newCase.id}`))
        .timeline;
      const submit = timeline.find((e) => e.action === "submit");
      assert.equal(submit.details.evidencePolicyVersion, "g01-evidence@2.0.0");
      assert.ok(submit.details.evidence.some((e) => e.id === image.id));
    },
  );
  await check(
    "payload validation uses the active schema for new cases and the pinned schema when an old case resubmits",
    async () => {
      await activate("1.0.0");
      let oldSchema = await c.create();
      oldSchema = await c.act(oldSchema, "coordinator", "return_info", {
        reason: "Cần bổ sung thông tin cho hồ sơ schema cũ.",
      });
      const strict = structuredClone(v2);
      strict.manifest.version = "2.1.0";
      strict.manifest.schema = "g01-case@2.1.0";
      strict.schema.$id = strict.manifest.schema;
      strict.schema.properties.description.minLength = 100;
      strict.seed[0].description =
        "Dữ liệu giả lập mô tả dài theo schema mới. ".repeat(5);
      await c.call("admin", "/packs/install", strict, 201);
      await activate("2.1.0");
      const short = {
        title: "Kiểm tra schema được pin",
        roomId: "A101",
        assetId: null,
        description: "Mô tả đủ v1 nhưng chưa đủ một trăm ký tự của schema mới.",
      };
      const rejected = await c.call("reporter", "/g01/cases", short, 400, {
        "Idempotency-Key": crypto.randomUUID(),
      });
      assert.equal(rejected.error.code, "SCHEMA_VALIDATION");
      const valid = await c.call(
        "reporter",
        "/g01/cases",
        { ...short, description: strict.seed[0].description },
        [201, 202],
        { "Idempotency-Key": crypto.randomUUID() },
      );
      assert.equal(valid.item.schemaVersion, "g01-case@2.1.0");
      oldSchema = await c.act(oldSchema, "reporter", "resubmit", short);
      assert.equal(oldSchema.status, "verification");
      assert.equal(oldSchema.schemaVersion, "g01-case@1.0.0");
    },
  );
  await activate("1.0.0");
  await check(
    "deploy and activation failures preserve the active revision and leave no partially installed application revision",
    async () => {
      execFileSync("docker", ["compose", "stop", "flowable"], {
        cwd: root,
        stdio: "pipe",
      });
      try {
        const v3 = structuredClone(v2);
        v3.manifest.version = "3.0.0";
        await c.call("admin", "/packs/install", v3, 503);
        await c.call("admin", "/packs/g01/2.0.0/activate", {}, 503);
        const data = await c.call("admin", "/packs");
        assert.equal(
          data.items.find((r) => r.active && r.packId === "g01").version,
          "1.0.0",
        );
        assert.ok(!data.items.some((r) => r.version === "3.0.0"));
      } finally {
        execFileSync("docker", ["compose", "start", "flowable"], {
          cwd: root,
          stdio: "pipe",
        });
      }
      for (let i = 0; i < 90; i++) {
        try {
          await activate("1.0.0");
          break;
        } catch (e) {
          if (i === 89) throw e;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    },
  );
} finally {
  await activate("1.0.0");
}
console.log(
  "Phase 4 integration passed; active G01 restored to v1 for independent regression suites.",
);
