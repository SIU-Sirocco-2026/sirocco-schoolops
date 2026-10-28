// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  createHash,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, open, stat, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
const magic = Buffer.from("SIROCCO-BACKUP-1\n");
function key(passphrase, salt) {
  if (!passphrase || passphrase.length < 16)
    throw new Error(
      "Set SIROCCO_BACKUP_PASSPHRASE with at least 16 characters; keep it outside the backup.",
    );
  return scryptSync(passphrase, salt, 32);
}
export async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export async function encrypt(input, output, passphrase) {
  const salt = randomBytes(16),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(passphrase, salt), iv);
  cipher.setAAD(magic);
  await writeFile(output, Buffer.concat([magic, salt, iv]), {
    mode: 0o600,
    flag: "wx",
  });
  await pipeline(
    createReadStream(input),
    cipher,
    createWriteStream(output, { flags: "a" }),
  );
  await appendFile(output, cipher.getAuthTag());
}
export async function decrypt(input, output, passphrase) {
  const size = (await stat(input)).size,
    headerSize = magic.length + 28;
  if (size < headerSize + 16) throw new Error("Truncated backup");
  const file = await open(input, "r");
  const header = Buffer.alloc(headerSize),
    tag = Buffer.alloc(16);
  try {
    await file.read(header, 0, header.length, 0);
    await file.read(tag, 0, 16, size - 16);
  } finally {
    await file.close();
  }
  if (!header.subarray(0, magic.length).equals(magic))
    throw new Error("Unsupported backup format");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(passphrase, header.subarray(magic.length, magic.length + 16)),
    header.subarray(magic.length + 16),
  );
  decipher.setAAD(magic);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(input, { start: headerSize, end: size - 17 }),
      decipher,
      createWriteStream(output, { flags: "wx", mode: 0o600 }),
    );
  } catch {
    throw new Error(
      "Backup authentication failed: wrong passphrase or damaged archive",
    );
  }
}
