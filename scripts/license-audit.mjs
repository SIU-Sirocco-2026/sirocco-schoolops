// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { root, run } from "./ops-lib.mjs";
const allowed = new Set([
  "Apache-2.0",
  "MIT",
  "BSD-3-Clause",
  "BSD-2-Clause",
  "ISC",
  "MPL-2.0",
  "0BSD",
]);
if (!process.env.npm_execpath) throw new Error("Run with pnpm legal:audit");
const grouped = JSON.parse(
  run(process.execPath, [
    process.env.npm_execpath,
    "licenses",
    "list",
    "--json",
  ]),
);
const entries = Object.entries(grouped).flatMap(([license, items]) =>
  items.flatMap((item) => item.paths.map((path) => ({ license, item, path }))),
);
const parent = new Map(entries.map((e) => [e.item.name, e]));
const components = [],
  notices = [];
const pinnedNotices = JSON.parse(
  await readFile(join(root, "third-party/license-sources.json"), "utf8"),
);
for (const entry of entries) {
  const meta = JSON.parse(
    await readFile(join(entry.path, "package.json"), "utf8"),
  );
  if (!allowed.has(entry.license))
    throw new Error(
      `Unreviewed license: ${meta.name}@${meta.version}: ${entry.license}`,
    );
  let filenames = (await readdir(entry.path)).filter((n) =>
    /^(licen[cs]e|copying|notice)(\.|$|-)|^third.party.licen[cs]e/i.test(n),
  );
  let origin = "installed package",
    texts = [];
  for (const name of filenames)
    texts.push({ name, text: await readFile(join(entry.path, name), "utf8") });
  if (!texts.length && ["pg-types", "pgpass"].includes(meta.name)) {
    const readme = await readFile(join(entry.path, "README.md"), "utf8");
    const index = readme.search(/^## license\s*$/im);
    if (index < 0) throw new Error(`Missing license text for ${meta.name}`);
    texts.push({ name: "README.md#license", text: readme.slice(index) });
  }
  const pinned = pinnedNotices[`${meta.name}@${meta.version}`];
  if (!texts.length && pinned) {
    const repository =
      typeof meta.repository === "string"
        ? meta.repository
        : meta.repository?.url;
    if (entry.license !== pinned.license || repository !== pinned.repository)
      throw new Error(`Pinned notice metadata differs: ${meta.name}`);
    const text = await readFile(join(root, pinned.file), "utf8");
    if (createHash("sha256").update(text).digest("hex") !== pinned.sha256)
      throw new Error(`Pinned notice checksum differs: ${meta.name}`);
    texts.push({ name: pinned.file, text });
    origin = `pinned upstream license: ${pinned.sourceUrl}; ${pinned.reason}`;
  }
  if (!texts.length) {
    const family = meta.name.startsWith("@aws-sdk/")
      ? "@aws-sdk/client-s3"
      : meta.name.startsWith("@esbuild/")
        ? "esbuild"
        : meta.name.startsWith("@rolldown/binding-")
          ? "rolldown"
          : undefined;
    const sibling = parent.get(family);
    if (!sibling || sibling.license !== entry.license)
      throw new Error(`Missing license text: ${meta.name}@${meta.version}`);
    const siblingMeta = JSON.parse(
      await readFile(join(sibling.path, "package.json"), "utf8"),
    );
    if (family !== "@aws-sdk/client-s3" && siblingMeta.version !== meta.version)
      throw new Error(`Native binding version differs: ${meta.name}`);
    for (const name of (await readdir(sibling.path)).filter((n) =>
      /^(licen[cs]e|notice)(\.|$)|^third.party.licen[cs]e/i.test(n),
    ))
      texts.push({
        name,
        text: await readFile(join(sibling.path, name), "utf8"),
      });
    origin = `same upstream family: ${family}@${siblingMeta.version}; package declares ${entry.license}`;
  }
  if (!texts.length)
    throw new Error(`No license text collected for ${meta.name}`);
  const licenses = texts.map(({ name, text }) => ({
    name,
    sha256: createHash("sha256").update(text).digest("hex"),
  }));
  const repository =
    typeof meta.repository === "string"
      ? meta.repository
      : meta.repository?.url;
  const author =
    typeof meta.author === "string" ? meta.author : meta.author?.name;
  components.push({
    name: meta.name,
    version: meta.version,
    license: entry.license,
    repository,
    author,
    noticeOrigin: origin,
    licenseTexts: licenses,
  });
  notices.push(
    `===== ${meta.name}@${meta.version} (${entry.license}) =====\nSource: ${repository || meta.homepage || "see package metadata"}\nNotice origin: ${origin}\n${texts.map(({ name, text }) => `--- ${name} ---\n${text}`).join("\n")}\n`,
  );
}
components.sort((a, b) =>
  `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, "en"),
);
const source = run("git", ["rev-parse", "HEAD"]).trim();
const testedPlatform = `${process.platform}/${process.arch}`;
const out = resolve(root, process.argv[2] || "test-results/legal");
await mkdir(out, { recursive: true });
const inventory = {
  schemaVersion: 1,
  source,
  testedPlatform,
  scope:
    "Installed workspace dependencies, including dev/native tools for this platform. Base operating-system image packages are not included. No third-party binaries are redistributed in the SchoolOps source archive.",
  lockfileSha256: createHash("sha256")
    .update(await readFile(join(root, "pnpm-lock.yaml")))
    .digest("hex"),
  components,
};
await writeFile(
  join(out, "dependency-inventory.json"),
  JSON.stringify(inventory, null, 2) + "\n",
);
await writeFile(join(out, "THIRD_PARTY_NOTICES.txt"), notices.join("\n"));
const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "application",
      name: "sirocco-schoolops",
      version: JSON.parse(await readFile(join(root, "package.json"), "utf8"))
        .version,
    },
  },
  components: components.map((c) => ({
    type: "library",
    name: c.name,
    version: c.version,
    purl: `pkg:npm/${c.name.startsWith("@") ? c.name.replace("@", "%40") : c.name}@${c.version}`,
    licenses: [{ license: { id: c.license } }],
  })),
};
await writeFile(
  join(out, "sbom.cdx.json"),
  JSON.stringify(bom, null, 2) + "\n",
);
console.log(
  `License audit passed: ${components.length} installed packages, ${testedPlatform}; inventory, SBOM and full notices written to ${out}.`,
);
