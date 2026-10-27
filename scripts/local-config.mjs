// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function parseLocalEnv(source) {
  return Object.fromEntries(
    source.split(/\r?\n/).flatMap((line) => {
      const text = line.trim();
      if (!text || text.startsWith("#")) return [];
      const index = text.indexOf("=");
      if (index < 1)
        throw new Error("Cấu hình .env cần có dạng TEN_BIEN=gia_tri.");
      return [[text.slice(0, index).trim(), text.slice(index + 1)]];
    }),
  );
}

export function readLocalEnv(
  directory = new URL("../", import.meta.url),
  overrides = process.env,
) {
  let source = "";
  try {
    source = readFileSync(
      join(
        directory instanceof URL ? fileURLToPath(directory) : directory,
        ".env",
      ),
      "utf8",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { ...parseLocalEnv(source), ...overrides };
}

export function localUrls(env) {
  if (
    env.COMPOSE_PROJECT_NAME !== undefined &&
    !/^[a-z0-9][a-z0-9_-]*$/.test(env.COMPOSE_PROJECT_NAME)
  )
    throw new Error(
      "COMPOSE_PROJECT_NAME chỉ dùng chữ thường, số, dấu gạch ngang và gạch dưới.",
    );
  function port(name, fallback) {
    const text = String(env[name] ?? fallback);
    if (!/^[1-9]\d{0,4}$/.test(text) || Number(text) > 65535)
      throw new Error(`${name} phải là cổng từ 1 đến 65535.`);
    return Number(text);
  }
  const webPort = port("SIROCCO_WEB_PORT", 8088);
  const authPort = port("SIROCCO_AUTH_PORT", 8180);
  if (webPort === authPort)
    throw new Error("Cổng web và đăng nhập phải khác nhau.");
  return {
    webPort,
    authPort,
    webOrigin: `http://localhost:${webPort}`,
    authOrigin: `http://localhost:${authPort}`,
  };
}

export const local = localUrls(readLocalEnv());
