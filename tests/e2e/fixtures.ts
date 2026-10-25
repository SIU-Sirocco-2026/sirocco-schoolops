import { test as base, expect } from "@playwright/test";
import { setTimeout as sleep } from "node:timers/promises";

// All browser contexts share the runner's IP and the real 300/minute quota.
// Reserve capacity before each scenario; never intercept or replay UI actions.
export const test = base.extend<{ gatewayBudget: void }>({
  gatewayBudget: [
    async ({ request }, use) => {
      const probe = await request.get("/api/health/ready");
      const headers = probe.headers();
      const remaining = Number(headers["x-ratelimit-remaining"]);
      const reset = Number(headers["x-ratelimit-reset"]);
      if (
        ![200, 429].includes(probe.status()) ||
        !Number.isFinite(remaining) ||
        !Number.isFinite(reset) ||
        reset < 0 ||
        reset > 60
      )
        throw new Error("Gateway readiness/quota headers unavailable");
      if (remaining < 200) await sleep(Math.ceil(reset * 1000) + 200);
      await use();
    },
    { auto: true, timeout: 70000 },
  ],
});
export { expect };
export type { Page } from "@playwright/test";
