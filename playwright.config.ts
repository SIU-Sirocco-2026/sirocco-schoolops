import { defineConfig, devices } from "@playwright/test";
import { evidenceContext } from "./scripts/evidence.mjs";
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/browser",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  metadata: evidenceContext(),
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "test-results/browser-results.json" }],
  ],
  use: { baseURL: "http://localhost:8088", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
