// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL("../../", import.meta.url)), "");
  const port = process.env.SIROCCO_WEB_PORT ?? env.SIROCCO_WEB_PORT ?? "8088";
  if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535)
    throw new Error("SIROCCO_WEB_PORT phải là cổng từ 1 đến 65535.");
  return {
    plugins: [react()],
    server: { proxy: { "/api": `http://localhost:${port}` } },
  };
});
