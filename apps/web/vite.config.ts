// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8088" } },
});
