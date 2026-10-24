import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readPack, validatePack, canonical } from "../src/packs.js";
const pack = await readPack(
  fileURLToPath(new URL("../../../packs/g01/v1", import.meta.url)),
);
test("complete G01 v1/v2 bundles pass schema, seed, role/action and supported BPMN graph validation", async () => {
  assert.equal((await validatePack(pack)).valid, true);
  const v2 = await readPack(
    fileURLToPath(new URL("../../../packs/g01/v2", import.meta.url)),
  );
  assert.equal((await validatePack(v2)).valid, true);
  assert.equal(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }));
  assert.deepEqual(JSON.parse(canonical(pack)),pack);
});
test("package validator rejects dangling roles, actions, tasks, schema/evidence refs, invalid seeds, duplicate IDs and unsafe BPMN", async () => {
  const mutations = [
    (p: any) => (p.manifest.tasks.verify.role = "ghost"),
    (p: any) => p.manifest.tasks.repair.actions.push("delete_all"),
    (p: any) => delete p.manifest.tasks.approve,
    (p: any) => (p.schema.$id = "wrong"),
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
