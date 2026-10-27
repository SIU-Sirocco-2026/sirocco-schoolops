// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, authenticatedRequest, decodeResponse } from "../src/http.js";

test("refresh failure gives sign-in guidance and never dispatches a mutation", async () => {
  let calls = 0;
  const request = authenticatedRequest(
    () => ({
      token: "expired-test-token",
      updateToken: async () => {
        throw undefined;
      },
    }),
    async () => {
      calls++;
      return Response.json({});
    },
  );
  await assert.rejects(
    request("/api/g01/cases", { method: "POST", body: "{}" }),
    (error: ApiError) =>
      error instanceof ApiError &&
      error.status === 401 &&
      /đăng nhập lại/.test(error.message),
  );
  assert.equal(calls, 0);
});

test("a resolved refresh without a token cannot send Bearer undefined", async () => {
  let calls = 0;
  const request = authenticatedRequest(
    () => ({ updateToken: async () => false }),
    async () => {
      calls++;
      return Response.json({});
    },
  );
  await assert.rejects(
    request("/api/g01/cases"),
    (error: ApiError) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(calls, 0);
});

test("one valid request preserves body, idempotency key and file content type without automatic replay", async () => {
  let refreshes = 0;
  let calls = 0;
  const data = new Uint8Array([1, 2, 3]);
  const request = authenticatedRequest(
    () => ({
      token: "unit-test-token",
      updateToken: async () => {
        refreshes++;
        return false;
      },
    }),
    async (_url, init) => {
      calls++;
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), "Bearer unit-test-token");
      assert.equal(headers.get("Content-Type"), "application/octet-stream");
      assert.equal(headers.get("Idempotency-Key"), "unit-test-key");
      assert.equal(init?.body, data);
      return new Response("gateway error", { status: 502 });
    },
  );
  await assert.rejects(
    request("/api/g01/cases/id/evidence", {
      method: "POST",
      body: data,
      headers: {
        "Content-Type": "application/octet-stream",
        "Idempotency-Key": "unit-test-key",
      },
    }),
    (error: ApiError) =>
      error.status === 502 && /kiểm tra kết quả/.test(error.message),
  );
  assert.equal(refreshes, 1);
  assert.equal(calls, 1);
});
test("HTML quota response provides wait/retry guidance without exposing markup", async () => {
  await assert.rejects(
    decodeResponse(
      new Response("<html>private gateway internals</html>", {
        status: 429,
        headers: { "X-RateLimit-Reset": "12.5" },
      }),
    ),
    (e: ApiError) =>
      e.status === 429 &&
      e.retryAfterMs === 12600 &&
      /chờ 13 giây/.test(e.message) &&
      !e.message.includes("html"),
  );
});
test("missing or malformed quota reset is bounded", async () => {
  for (const value of ["bad", "-1", "999999"])
    await assert.rejects(
      decodeResponse(
        new Response("", {
          status: 429,
          headers: { "X-RateLimit-Reset": value },
        }),
      ),
      (e: ApiError) => e.retryAfterMs === 60100,
    );
});
test("HTML server failures advise checking result before repeating mutation", async () => {
  await assert.rejects(
    decodeResponse(new Response("<html>error</html>", { status: 502 })),
    (e: ApiError) => e.status === 502 && /kiểm tra kết quả/.test(e.message),
  );
});
test("business errors preserve API message and successful downloads stay binary", async () => {
  await assert.rejects(
    decodeResponse(
      Response.json(
        { error: { message: "Cần bằng chứng sạch." } },
        { status: 409 },
      ),
    ),
    /Cần bằng chứng sạch/,
  );
  assert.deepEqual(await decodeResponse(Response.json({ item: 1 })), {
    item: 1,
  });
  const blob = await decodeResponse<Blob>(
    new Response("file contents", {
      headers: { "Content-Type": "text/plain" },
    }),
  );
  assert.equal(await blob.text(), "file contents");
});
