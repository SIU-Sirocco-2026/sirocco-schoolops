// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { identifyFile, checksum } from "../src/storage.js";
import { ClamScanner } from "../src/scanner.js";

test("uploads validate actual signatures, extension, UTF8, unsafe names and size", () => {
  assert.equal(
    identifyFile(Buffer.from("%PDF-1.7\ncontent"), "report.pdf"),
    "application/pdf",
  );
  assert.equal(
    identifyFile(Buffer.from("Kết quả xử lý"), "report.txt"),
    "text/plain",
  );
  for (const [data, name] of [
    [Buffer.from("MZ exe"), "fake.png"],
    [Buffer.from("abc"), "../x.txt"],
    [Buffer.from([0xff, 0xff]), "invalid.txt"],
    [Buffer.alloc(0), "empty.txt"],
    [Buffer.alloc(10 * 1024 * 1024 + 1), "large.txt"],
  ] as [Buffer, string][])
    assert.throws(() => identifyFile(data, name));
  assert.notEqual(checksum(Buffer.from("a")), checksum(Buffer.from("b")));
});

test("scanner never treats truncated, error or unknown replies as clean; has bounded timeout", async () => {
  for (const reply of ["stream: ERROR\0", "stream: OKAY\0", "stream: OK", ""]) {
    const server = createServer((socket) => {
      socket.once("data", (data) => {
        if (data.toString().startsWith("zVERSION"))
          socket.end("ClamAV test/database/date\0");
        else socket.end(reply);
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      await assert.rejects(() =>
        new ClamScanner(
          "127.0.0.1",
          (server.address() as AddressInfo).port,
          100,
        ).scan(Buffer.from("safe")),
      );
    } finally {
      server.close();
      await once(server, "close");
    }
  }
});

test("an unresponsive scanner times out and rejects instead of leaving a scan trusted", async () => {
  const server = createServer((socket) => socket.on("data", () => {}));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await assert.rejects(
      () =>
        new ClamScanner(
          "127.0.0.1",
          (server.address() as AddressInfo).port,
          30,
        ).scan(Buffer.from("safe")),
      /timeout/,
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});
