import assert from "node:assert/strict";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import YAML from "yaml";
import { root, run, sourceRevision } from "./ops-lib.mjs";
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const files = run("git", ["ls-files", "-z"]).split("\0").filter(Boolean);
for (const name of files)
  assert.ok(
    !/(^|\/)(node_modules|\.env|generated|test-results|playwright-report|\.local)(\/|$)/.test(
      name,
    ),
    `Private/generated file tracked: ${name}`,
  );
for (const name of files.filter((f) =>
  /\.(md|mjs|[cm]?ts|tsx|ya?ml)$/.test(f),
)) {
  const text = await readFile(join(root, name), "utf8");
  assert.ok(
    !/[A-Z]:[\\/]Users[\\/][^\s/\\]+/i.test(text),
    `Personal Windows profile path in published source: ${name}`,
  );
}
assert.equal((await readFile(join(root, ".nvmrc"), "utf8")).trim(), "22.16.0");
for (const path of ["apps/api/package.json", "apps/web/package.json"]) {
  const p = JSON.parse(await readFile(join(root, path), "utf8"));
  assert.equal(p.version, pkg.version);
  assert.equal(p.license, "Apache-2.0");
}
assert.equal(pkg.license, "Apache-2.0");
assert.match(await readFile(join(root, "LICENSE"), "utf8"), /Apache License/);
let checkedLinks = 0;
for (const name of files.filter((f) => f.endsWith(".md"))) {
  const text = await readFile(join(root, name), "utf8");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].split(/\s+"/)[0].replace(/^<|>$/g, "").split("#")[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    target = decodeURIComponent(target);
    await stat(resolve(root, dirname(name), target)).catch(() => {
      throw new Error(`Broken documentation link: ${name} -> ${target}`);
    });
    checkedLinks++;
  }
}
const spec = YAML.parse(
  await readFile(join(root, "docs/openapi.yaml"), "utf8"),
);
assert.equal(spec.openapi, "3.1.0");
assert.equal(spec.info.version, pkg.version);
function checkRefs(v) {
  if (!v || typeof v !== "object") return;
  if (v.$ref) {
    assert.ok(v.$ref.startsWith("#/"));
    let p = spec;
    for (const part of v.$ref.slice(2).split("/"))
      p = p?.[part.replaceAll("~1", "/").replaceAll("~0", "~")];
    assert.ok(p, `Missing OpenAPI ref ${v.$ref}`);
  }
  for (const value of Object.values(v)) checkRefs(value);
}
checkRefs(spec);
let checkedOperations = 0;
function verifyRoutes(file, prefixes, { disabledCreate = false } = {}) {
  const text = run("git", ["show", `HEAD:${file}`]);
  for (const [, method, route] of text.matchAll(
    /(?:router|app)\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/g,
  ))
    for (const prefix of prefixes) {
      if (disabledCreate && method === "post" && route === "/cases") continue;
      const path = (prefix + (route === "/" ? "" : route)).replace(
        /:([A-Za-z]+)/g,
        "{$1}",
      );
      assert.ok(
        spec.paths[path]?.[method],
        `Missing OpenAPI operation ${method} ${path} from ${file}`,
      );
      checkedOperations++;
    }
}
verifyRoutes("apps/api/src/app.ts", [""]);
verifyRoutes("apps/api/src/g01.ts", ["/api/g01", "/api/g03"]);
verifyRoutes("apps/api/src/g01.ts", ["/api/g02"], { disabledCreate: true });
verifyRoutes("apps/api/src/evidence.ts", ["/api/g01", "/api/g02", "/api/g03"]);
verifyRoutes("apps/api/src/packs.ts", ["/api/packs"]);
verifyRoutes("apps/api/src/environment.ts", ["/api/g02"]);
verifyRoutes("apps/api/src/safety.ts", ["/api/g03"]);
for (const [path, item] of Object.entries(spec.paths))
  for (const [method, operation] of Object.entries(item))
    if (["get", "post", "put", "patch", "delete"].includes(method)) {
      const parameters = [
        ...(item.parameters || []),
        ...(operation.parameters || []),
      ];
      for (const [, name] of path.matchAll(/\{([^}]+)\}/g))
        assert.ok(
          parameters.some(
            (p) => p.in === "path" && p.name === name && p.required === true,
          ),
          `Undeclared path parameter ${method} ${path}: ${name}`,
        );
      assert.ok(operation.responses, `Missing responses: ${method} ${path}`);
    }
const lock = JSON.parse(
  await readFile(join(root, "infra/images.lock.json"), "utf8"),
);
const compose = YAML.parse(await readFile(join(root, "compose.yaml"), "utf8"));
for (const service of Object.values(compose.services))
  if (service.image)
    assert.ok(
      Object.values(lock.images).includes(service.image),
      `Unpinned service image: ${service.image}`,
    );
for (const file of ["apps/api/Dockerfile", "apps/web/Dockerfile"])
  for (const [, image] of (await readFile(join(root, file), "utf8")).matchAll(
    /^FROM (\S+)/gm,
  ))
    assert.ok(
      Object.values(lock.images).includes(image),
      `Unpinned base image: ${image}`,
    );
await mkdir(join(root, "test-results"), { recursive: true });
await writeFile(
  join(root, "test-results/source-audit.json"),
  JSON.stringify(
    {
      sourceSha: sourceRevision(),
      version: pkg.version,
      checkedLinks,
      checkedOperations,
      privateFilesTracked: false,
      imageDigestsPinned: true,
      openApiValid: true,
    },
    null,
    2,
  ),
);
console.log(
  `Source audit passed: ${checkedLinks} local links, ${checkedOperations} implemented HTTP operations, version/license/image pins.`,
);
