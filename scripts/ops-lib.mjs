// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { spawnSync } from "node:child_process";
import { openSync, closeSync, existsSync, chmodSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { homedir } from "node:os";
import { realpath, lstat, rm } from "node:fs/promises";
export const root = resolve(import.meta.dirname, "..");
export const utilityImage =
  "node:22.16.0-alpine@sha256:41e4389f3d988d2ed55392df4db1420ad048ae53324a8e2b7c6d19508288107e";
export function run(command, args, options = {}) {
  const fd = options.output ? openSync(options.output, "w", 0o600) : undefined;
  try {
    const r = spawnSync(command, args, {
      cwd: options.cwd || root,
      env: options.env || process.env,
      input: options.input,
      encoding: options.binary ? undefined : "utf8",
      timeout: options.timeout || 600000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: fd === undefined ? ["pipe", "pipe", "pipe"] : ["pipe", fd, "pipe"],
    });
    if (r.error || r.status !== 0)
      throw new Error(
        `${command} failed: ${r.error?.message || String(r.stderr).slice(-1500)}`,
      );
    return r.stdout;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
export function docker(args, options) {
  return run("docker", args, options);
}
export function compose(args, options = {}) {
  return docker(
    ["compose", ...(options.project ? ["-p", options.project] : []), ...args],
    options,
  );
}
export function ensureDocker() {
  const helper = join(
    process.env.CODEX_HOME || join(homedir(), ".codex"),
    "tools",
    "windows-docker",
    "ensure-docker.ps1",
  );
  if (process.platform === "win32" && existsSync(helper))
    run("powershell", ["-NoProfile", "-File", helper]);
  docker(["info", "--format", "{{.ServerVersion}}"]);
}
export function privateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (process.platform === "win32") {
    const user = run("whoami", []).trim();
    run("icacls", [path, "/inheritance:r", "/grant:r", `${user}:(OI)(CI)F`]);
  } else chmodSync(path, 0o700);
}
export function sourceRevision() {
  return run("git", ["rev-parse", "HEAD"]).trim();
}
export async function removeOwnedDirectory(path, parent, prefix) {
  const base = await realpath(parent),
    target = await realpath(path);
  if (
    dirname(target) !== base ||
    !basename(target).startsWith(prefix) ||
    (await lstat(path)).isSymbolicLink()
  )
    throw new Error(
      "Refusing recursive cleanup outside the owned temporary directory",
    );
  await rm(target, { recursive: true, force: true });
}
export function runningServices(options = {}) {
  return compose(["ps", "--services", "--status", "running"], options)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}
export function inspectVolume(service, target, options = {}) {
  const id = compose(["ps", "-a", "-q", service], options).trim();
  if (!id) throw new Error(`${service} container is missing`);
  const info = JSON.parse(docker(["inspect", id]))[0];
  const mount = info.Mounts.find(
    (m) => m.Destination === target && m.Type === "volume",
  );
  if (!mount) throw new Error(`${service} persistent volume is missing`);
  return mount.Name;
}
