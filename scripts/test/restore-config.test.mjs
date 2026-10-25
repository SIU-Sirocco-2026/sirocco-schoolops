import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreConfiguration } from "../backup.mjs";
import { removeOwnedDirectory } from "../ops-lib.mjs";
test("restored config retains secret bytes/project scope and permits container UIDs inside private host directories", async () => {
  const dir = await mkdtemp(join(tmpdir(), "schoolops-config-"));
  try {
    const data = join(dir, "data"),
      target = join(dir, "target");
    await mkdir(data);
    await writeFile(
      join(data, ".env"),
      "APP_DB_PASSWORD=simulated-secret\nCOMPOSE_PROJECT_NAME=old-project\n",
      { mode: 0o600 },
    );
    for (const name of ["realm.json", "s3.json"])
      await writeFile(join(data, name), "{}", { mode: 0o600 });
    await restoreConfiguration(data, target, "new-project");
    const env = await readFile(join(target, ".env"), "utf8");
    assert.equal(
      env,
      "APP_DB_PASSWORD=simulated-secret\nCOMPOSE_PROJECT_NAME=new-project\n",
    );
    for (const name of ["realm.json", "s3.json"])
      assert.equal(
        await readFile(join(target, "infra/generated", name), "utf8"),
        "{}",
      );
    if (process.platform !== "win32") {
      assert.equal((await stat(join(target, ".env"))).mode & 0o777, 0o600);
      assert.equal(
        (await stat(join(target, "infra/generated"))).mode & 0o777,
        0o700,
      );
      for (const name of ["realm.json", "s3.json"])
        assert.equal(
          (await stat(join(target, "infra/generated", name))).mode & 0o777,
          0o644,
        );
    }
  } finally {
    await removeOwnedDirectory(dir, tmpdir(), "schoolops-config-");
  }
});
