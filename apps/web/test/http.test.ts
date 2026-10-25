import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, decodeResponse } from "../src/http.js";
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
