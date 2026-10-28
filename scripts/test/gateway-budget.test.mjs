// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import test from "node:test";
import assert from "node:assert/strict";
import { waitForGatewayBudget } from "../gateway-budget.mjs";

function probe(status, headers) {
  const reads = [], waits = [];
  return { reads, waits, options: {
    transport: async (url, init) => { reads.push({url,method:init.method || "GET",redirect:init.redirect});return new Response("{}", {status,headers}); },
    wait: async ms => {waits.push(ms);},
  } };
}
test("a ready gateway with enough budget only reads once and does not wait", async () => {
  const p=probe(200,{"X-RateLimit-Remaining":"100","X-RateLimit-Reset":"45"});
  assert.deepEqual(await waitForGatewayBudget("http://localhost:8098",p.options),{remaining:100,waitedMs:0});
  assert.deepEqual(p.reads,[{url:"http://localhost:8098/api/health/ready",method:"GET",redirect:"manual"}]);
  assert.deepEqual(p.waits,[]);
});
test("low budget or an explicit quota denial waits for reset without replaying any request", async () => {
  for(const status of [200,429]) {
    const p=probe(status,{"X-RateLimit-Remaining":"0","X-RateLimit-Reset":"1.25"});
    assert.equal((await waitForGatewayBudget("http://localhost:8098",p.options)).waitedMs,1450);
    assert.equal(p.reads.length,1);
    assert.deepEqual(p.waits,[1450]);
  }
});
test("unavailable readiness and malformed quota stop the probe without waiting or bypassing the gateway", async () => {
  for(const [status,headers] of [[503,{}],[302,{}],[200,{}],[200,{"X-RateLimit-Remaining":"","X-RateLimit-Reset":""}],[200,{"X-RateLimit-Remaining":"-1","X-RateLimit-Reset":"2"}],[200,{"X-RateLimit-Remaining":"20","X-RateLimit-Reset":"61"}],[200,{"X-RateLimit-Remaining":"nan","X-RateLimit-Reset":"2"}]]) {
    const p=probe(status,headers);
    await assert.rejects(waitForGatewayBudget("http://localhost:8098",p.options),/headers unavailable/);
    assert.equal(p.reads.length,1);
    assert.deepEqual(p.waits,[]);
  }
});
