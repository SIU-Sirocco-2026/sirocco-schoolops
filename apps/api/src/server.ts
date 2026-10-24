import { createApp } from "./app.js";
import { remoteKey } from "./auth.js";
import { migrate, pool, technicianId } from "./db.js";
import { Flowable } from "./workflow.js";
import { ObjectStore } from "./storage.js";
import { bootstrapPacks,bootstrapEnvironmentPack } from "./packs.js";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
const issuer = required("OIDC_ISSUER");
const store = new ObjectStore();
const workflow = new Flowable(
  required("FLOWABLE_URL"),
  required("FLOWABLE_USER"),
  required("FLOWABLE_PASSWORD"),
);
let definition: string | undefined;
let g01Definition: string | undefined;
let initializing = false;
let initialized = false;
async function initialize() {
  if (initializing || initialized) return;
  initializing = true;
  try {
    await migrate();
    await store.ready();
    await workflow.ready();
    definition = await workflow.deploy(required("BPMN_PATH"));
    g01Definition = await workflow.deploy(
      "/app/packs/g01/v1/workflow.bpmn20.xml",
      "sirocco-g01-v1-0-0",
    );
    await bootstrapPacks(pool, workflow, g01Definition);
    await bootstrapEnvironmentPack(pool,workflow);
    initialized = true;
    console.log("Database, foundation and G01 workflows ready.");
  } catch (error) {
    console.warn(
      "Waiting for core services:",
      error instanceof Error ? error.message : "Unavailable",
    );
  } finally {
    initializing = false;
  }
}
const app = createApp({
  store,
  pool,
  workflow,
  issuer,
  audience: required("OIDC_AUDIENCE"),
  key: remoteKey(required("OIDC_JWKS_URL")),
  technicianId,
  definitionId: () => definition,
  g01DefinitionId: () => g01Definition,
  readiness: async () => {
    if (!initialized || !definition || !g01Definition)
      throw new Error("Initializing");
    await Promise.all([
      pool.query("SELECT 1"),
      workflow.ready(),
      fetch(
        `${issuer.replace("http://localhost:8180", "http://keycloak:8080")}/.well-known/openid-configuration`,
        { signal: AbortSignal.timeout(4000) },
      ).then((r) => {
        if (!r.ok) throw new Error("Identity unavailable");
      }),
    ]);
    return { database: "ready", identity: "ready", workflow: "ready" };
  },
});
const server = app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log(`SchoolOps API listening on ${process.env.PORT || 3000}`),
);
await initialize();
const timer = setInterval(() => void initialize(), 5000);
async function shutdown() {
  clearInterval(timer);
  server.close();
  await pool.end();
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
