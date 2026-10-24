import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { client, root } from "./test-client.mjs";
export async function replay(c) {
  const fixture = JSON.parse(
    await readFile(`${root}/connectors/environment/replay.json`, "utf8"),
  );
  const source = (await c.call("environment", "/g02/sources")).items.find(
    (s) => s.id === fixture.sourceId,
  );
  const anchor = source.watermark
    ? new Date(source.watermark).getTime() + 600000
    : new Date("2020-01-01T00:00:00Z").getTime();
  const runId = crypto.randomUUID(),
    payloads = {},
    observations = {},
    episodes = new Map();
  let duplicates = 0;
  for (const event of fixture.events) {
    if (event.repeat) {
      const r = await c.call(
        "sensor",
        `/g02/sources/${fixture.sourceId}/observations`,
        payloads[event.repeat],
      );
      assert.equal(r.duplicate, true);
      duplicates++;
      continue;
    }
    const body = {
      eventId: `${runId}:${event.id}`,
      stationId: fixture.stationId,
      observedAt: new Date(anchor + event.second * 1000).toISOString(),
      quantity: "pm25",
      value: event.value,
      unit: event.unit,
      label: fixture.label,
    };
    payloads[event.id] = body;
    const r = await c.call(
      "sensor",
      `/g02/sources/${fixture.sourceId}/observations`,
      body,
      event.quality === "valid" ? 201 : 202,
    );
    assert.equal(r.item.quality, event.quality);
    observations[event.id] = r.item;
    if (event.opens) {
      assert.ok(r.episodeId && r.caseId);
      episodes.set(r.episodeId, r.caseId);
    }
    if (event.gap) assert.equal(r.item.gapDetected, true);
    if (event.suppressed) assert.equal(r.item.suppressed, true);
  }
  assert.equal(Object.keys(observations).length, fixture.expected.observations);
  assert.equal(episodes.size, fixture.expected.episodes);
  assert.equal(duplicates, fixture.expected.duplicates);
  return {
    fixture,
    runId,
    anchor,
    payloads,
    observations,
    episodes: [...episodes].map(([id, caseId]) => ({ id, caseId })),
  };
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/replay-g02.mjs")) {
  const result = await replay(await client());
  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        label: "replayed",
        expected: result.fixture.expected,
        episodes: result.episodes,
      },
      null,
      2,
    ),
  );
}
