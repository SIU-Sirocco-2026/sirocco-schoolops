// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { localUrls, parseLocalEnv, readLocalEnv } from "../local-config.mjs";
import { removeOwnedDirectory } from "../ops-lib.mjs";

test("local endpoints preserve defaults and agree on a separate pair of ports", () => {
  assert.deepEqual(localUrls({}), {
    webPort: 8088, authPort: 8180,
    webOrigin: "http://localhost:8088", authOrigin: "http://localhost:8180",
  });
  assert.deepEqual(localUrls({ SIROCCO_WEB_PORT: "8098", SIROCCO_AUTH_PORT: "8190", COMPOSE_PROJECT_NAME: "schoolops-trial" }), {
    webPort: 8098, authPort: 8190,
    webOrigin: "http://localhost:8098", authOrigin: "http://localhost:8190",
  });
});

test("invalid or overlapping ports and ambiguous project names fail before startup without echoing values", () => {
  for (const value of ["", "0", "65536", "-1", "12.5", "8098:9080", "password-not-a-port", "08088"])
    assert.throws(() => localUrls({ SIROCCO_WEB_PORT: value }), (error) => {
      assert.equal(error.message, "SIROCCO_WEB_PORT phải là cổng từ 1 đến 65535.");
      return true;
    });
  assert.throws(() => localUrls({ SIROCCO_AUTH_PORT: "8088" }), /phải khác nhau/);
  for (const name of ["", "UPPER", "../other", "with space"])
    assert.throws(() => localUrls({ COMPOSE_PROJECT_NAME: name }), /COMPOSE_PROJECT_NAME/);
});

test("local env parsing preserves values containing equals and rejects malformed lines without leaking them", () => {
  assert.deepEqual(parseLocalEnv("# comment\r\n\nDEMO_PASSWORD=a=b\r\nSIROCCO_WEB_PORT=8098\n"), {
    DEMO_PASSWORD: "a=b", SIROCCO_WEB_PORT: "8098",
  });
  assert.throws(() => parseLocalEnv("private-content-without-assignment"), /TEN_BIEN=gia_tri/);
});

test("restore can read its own configuration rather than inheriting the source environment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "schoolops-local-config-"));
  try {
    await writeFile(join(dir, ".env"), "SIROCCO_WEB_PORT=8098\nSIROCCO_AUTH_PORT=8190\n");
    assert.equal(localUrls(readLocalEnv(dir, {})).webOrigin, "http://localhost:8098");
    assert.equal(localUrls(readLocalEnv(dir, { SIROCCO_WEB_PORT: "8099" })).webPort, 8099);
  } finally {
    await removeOwnedDirectory(dir, tmpdir(), "schoolops-local-config-");
  }
});
