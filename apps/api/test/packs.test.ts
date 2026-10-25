// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  readPack,
  validatePack,
  canonical,
  installPack,
  packChecksum,
} from "../src/packs.js";
const pack = await readPack(
  fileURLToPath(new URL("../../../packs/g01/v1", import.meta.url)),
);

test("canonical package keys use locale-independent ordering across installations", () => {
  assert.equal(canonical({ á: 3, a: 2, Z: 1 }), '{"Z":1,"a":2,"á":3}');
  assert.equal(
    canonical({ nested: { z: 1, A: 2 }, list: [3, 2, 1] }),
    '{"list":[3,2,1],"nested":{"A":2,"z":1}}',
  );
});

test("legacy Windows XML newlines reinstall without changing revision bytes, checksum or workflow; real edits and corruption are rejected", async () => {
  const legacy = structuredClone(pack);
  legacy.workflow = legacy.workflow
    .replace(/\r\n?/g, "\n")
    .replaceAll("\n", "\r\n");
  const row = {
    id: "legacy",
    pack_id: "g01",
    version: "1.0.0",
    checksum: packChecksum(legacy),
    bundle: legacy,
    definition_id: "original-definition",
  };
  const statements: string[] = [];
  const query = async (sql: string) => {
    statements.push(sql);
    return {
      rows: sql.startsWith("SELECT * FROM pack_revisions") ? [row] : [],
    };
  };
  const pool = { connect: async () => ({ query, release() {} }), query } as any;
  const workflow = {
    deployXml: async () => {
      throw new Error("Must not deploy another workflow");
    },
  } as any;
  const result = await installPack(pool, workflow, pack, null);
  assert.equal(result, row);
  assert.equal(result.checksum, packChecksum(legacy));
  assert.equal(result.bundle.workflow, legacy.workflow);
  assert.ok(!statements.some((s) => /^(INSERT|UPDATE|DELETE)/.test(s)));
  const edited = structuredClone(pack);
  edited.manifest.name += " changed";
  await assert.rejects(
    installPack(pool, workflow, edited, null),
    /không được sửa nội dung/,
  );
  row.checksum = "0".repeat(64);
  await assert.rejects(installPack(pool, workflow, pack, null), /Checksum/);
});
test("complete G01 v1/v2 bundles pass schema, seed, role/action and supported BPMN graph validation", async () => {
  assert.equal((await validatePack(pack)).valid, true);
  const v2 = await readPack(
    fileURLToPath(new URL("../../../packs/g01/v2", import.meta.url)),
  );
  assert.equal((await validatePack(v2)).valid, true);
  assert.equal(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }));
  assert.deepEqual(JSON.parse(canonical(pack)), pack);
});
test("package validator rejects dangling roles, actions, tasks, schema/evidence refs, invalid seeds, duplicate IDs and unsafe BPMN", async () => {
  const mutations = [
    (p: any) => (p.manifest.tasks.verify.role = "ghost"),
    (p: any) => p.manifest.tasks.repair.actions.push("delete_all"),
    (p: any) => delete p.manifest.tasks.approve,
    (p: any) => (p.schema.$id = "wrong"),
    (p: any) => (p.manifest.workflow = "missing-workflow@1.0.0"),
    (p: any) => (p.evidence.submit.step = "missing"),
    (p: any) => (p.seed[0].title = 4),
    (p: any) => (p.schema.properties.title = { type: "imaginary" }),
    (p: any) =>
      (p.workflow = p.workflow.replace('id="approve"', 'id="repair"')),
    (p: any) =>
      (p.workflow = p.workflow.replace(
        'targetRef="verify"',
        'targetRef="absent"',
      )),
    (p: any) =>
      (p.workflow = p.workflow.replace(
        "<startEvent",
        '<scriptTask scriptFormat="javascript"><script>evil()</script></scriptTask><startEvent',
      )),
    (p: any) =>
      (p.workflow =
        '<!DOCTYPE x [<!ENTITY ext SYSTEM "file:///etc/passwd">]>' +
        p.workflow),
    (p: any) =>
      (p.workflow = p.workflow.replace(
        'flowable:assignee="${coordinator}"',
        'flowable:assignee="${admin}"',
      )),
  ];
  for (const mutate of mutations) {
    const p = structuredClone(pack);
    mutate(p);
    assert.equal((await validatePack(p)).valid, false);
  }
});
