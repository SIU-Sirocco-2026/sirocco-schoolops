import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Flowable } from "../src/workflow.js";

async function engine(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    adapter: new Flowable(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      "test-user",
      "test-password",
    ),
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

test("Flowable task completion accepts HTTP 200 with an empty body", async () => {
  let requestPath = "";
  const service = await engine((req, res) => {
    requestPath = req.url!;
    res.writeHead(200);
    res.end();
  });
  try {
    await service.adapter.complete("task-1");
    assert.equal(requestPath, "/runtime/tasks/task-1");
  } finally {
    await service.close();
  }
});

test("an uncertain process creation is not automatically sent a second time", async () => {
  let requests = 0;
  const service = await engine((req) => {
    requests += 1;
    req.socket.destroy();
  });
  try {
    await assert.rejects(() =>
      service.adapter.start("definition-1", "run-1", "user-1"),
    );
    assert.equal(requests, 1);
  } finally {
    await service.close();
  }
});
