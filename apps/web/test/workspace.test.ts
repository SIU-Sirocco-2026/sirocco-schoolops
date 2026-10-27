// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import test from "node:test";
import assert from "node:assert/strict";
import { defaultView, parseLocation } from "../src/workspace-state.js";
import { filePolicy, maxEvidenceBytes } from "../src/file-policy.js";

test("deep links retain only supported views and a well-formed case ID", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(parseLocation(`?view=safety&case=${id}`), {
    view: "safety",
    caseId: id,
  });
  assert.deepEqual(parseLocation("?view=unknown&case=<script>"), {
    view: null,
    caseId: null,
  });
  assert.deepEqual(parseLocation(""), { view: null, caseId: null });
});
test("first login opens work appropriate to the membership, including non-facility roles", () => {
  for (const role of ["reporter", "coordinator", "technician", "approver"])
    assert.equal(defaultView([role]), "g01");
  assert.equal(defaultView(["admin"]), "packs");
  assert.equal(defaultView(["environment_officer"]), "environment");
  assert.equal(defaultView(["safety_reporter"]), "safety");
  assert.equal(defaultView(["safety_officer"]), "safety");
});
test("image-only policies reject PDF and misleading filename MIME before upload", () => {
  const policy = filePolicy(["image/png", "image/jpeg"]);
  assert.equal(policy.accept, ".png,.jpg,.jpeg");
  assert.ok(
    policy.validate({ name: "proof.pdf", type: "application/pdf", size: 200 }),
  );
  assert.ok(
    policy.validate({ name: "proof.png", type: "application/pdf", size: 200 }),
  );
  assert.equal(
    policy.validate({ name: "proof.JPG", type: "", size: 200 }),
    null,
  );
  assert.equal(
    policy.validate({ name: "proof.png", type: "image/png", size: 200 }),
    null,
  );
});
test("file guidance distinguishes unsupported, empty and oversized files", () => {
  const policy = filePolicy();
  assert.equal(
    policy.validate({ name: "proof.pdf", type: "application/pdf", size: 200 }),
    null,
  );
  assert.match(
    policy.validate({ name: "proof.txt", type: "text/plain", size: 0 })!,
    /trống/,
  );
  assert.match(
    policy.validate({
      name: "proof.txt",
      type: "text/plain",
      size: maxEvidenceBytes + 1,
    })!,
    /10 MB/,
  );
});
