import { pool, migrate } from "./db.js";
import { Flowable } from "./workflow.js";
import { ObjectStore } from "./storage.js";
import { ClamScanner } from "./scanner.js";
import { scanNextEvidence } from "./evidence.js";
import { executeCommand } from "./outbox.js";

const workflow = new Flowable(
  process.env.FLOWABLE_URL!,
  process.env.FLOWABLE_USER!,
  process.env.FLOWABLE_PASSWORD!,
);
const store = new ObjectStore(),
  scanner = new ClamScanner();
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
await migrate();
console.log("Workflow and evidence worker started");
// Separate lanes: scanner outage must not block workflow reconciliation or heartbeats.
async function lane(job: () => Promise<unknown>, interval: number) {
  while (!stopping) {
    try {
      await job();
    } catch (e) {
      console.warn("Worker retry:", (e as Error).message);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
await Promise.all([
  lane(() => executeCommand(pool, workflow), 1000),
  lane(async () => {
    await store.ready();
    await scanNextEvidence(pool, store, scanner);
  }, 1000),
  lane(
    () =>
      pool.query(
        "INSERT INTO worker_heartbeat(id) VALUES('phase3') ON CONFLICT(id) DO UPDATE SET last_seen=now()",
      ),
    3000,
  ),
]);
await pool.end();
