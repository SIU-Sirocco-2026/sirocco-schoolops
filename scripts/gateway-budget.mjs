// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { setTimeout as sleep } from "node:timers/promises";

// Sequential suites share an IP. Wait before a probe, never replay its mutations.
export async function waitForGatewayBudget(origin, { transport = fetch, wait = sleep, minimum = 40 } = {}) {
  if (!Number.isInteger(minimum) || minimum < 1 || minimum > 200) throw new Error("Invalid gateway probe budget");
  const response = await transport(`${origin}/api/health/ready`, { signal: AbortSignal.timeout(5000), redirect: "manual" });
  const remainingText = response.headers.get("X-RateLimit-Remaining");
  const resetText = response.headers.get("X-RateLimit-Reset");
  const remaining = Number(remainingText), reset = Number(resetText);
  await response.arrayBuffer();
  if (![200, 429].includes(response.status) || !/^\d+$/.test(remainingText ?? "") || !/^\d+(\.\d+)?$/.test(resetText ?? "") || !Number.isInteger(remaining) || remaining < 0 || !Number.isFinite(reset) || reset < 0 || reset > 60)
    throw new Error("Gateway readiness/quota headers unavailable; probe has not started");
  const waitedMs = response.status === 429 || remaining < minimum ? Math.ceil(reset * 1000) + 200 : 0;
  if (waitedMs) await wait(waitedMs);
  return { remaining, waitedMs };
}
