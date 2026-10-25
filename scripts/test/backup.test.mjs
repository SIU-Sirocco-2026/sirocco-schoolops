import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encrypt, decrypt } from "../backup-crypto.mjs";
import { safeEntries } from "../backup.mjs";
import { removeOwnedDirectory } from "../ops-lib.mjs";
test("encrypted backup roundtrip authenticates bytes, rejects wrong key and damage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "schoolops-crypto-"));
  try {
    const source = join(dir, "source"),
      archive = join(dir, "archive"),
      restored = join(dir, "restored");
    const secret = "a private test backup passphrase";
    await writeFile(source, Buffer.from([0, 1, 2, 255, 3]));
    await encrypt(source, archive, secret);
    await decrypt(archive, restored, secret);
    assert.deepEqual(await readFile(restored), await readFile(source));
    await assert.rejects(
      decrypt(archive, join(dir, "wrong"), secret + "wrong"),
      /authentication failed/,
    );
    const bytes = await readFile(archive);
    bytes[bytes.length - 1] ^= 1;
    await writeFile(archive, bytes);
    await assert.rejects(
      decrypt(archive, join(dir, "damaged"), secret),
      /authentication failed/,
    );
    await assert.rejects(
      encrypt(source, join(dir, "short"), "short"),
      /at least 16/,
    );
  } finally {
    await assert.rejects(
      removeOwnedDirectory(dir, dir, "schoolops-crypto-"),
      /Refusing/,
    );
    assert.ok((await stat(dir)).isDirectory());
    await removeOwnedDirectory(dir, tmpdir(), "schoolops-crypto-");
  }
});
test("restore archive rejects traversal, absolute paths and Windows path tricks", () => {
  safeEntries(["./", "./safe/file", "db.dump"]);
  for (const name of ["../x", "/etc/passwd", "a/../../x", "C:/x", "a\\..\\x"])
    assert.throws(() => safeEntries([name]), /Unsafe/);
});
