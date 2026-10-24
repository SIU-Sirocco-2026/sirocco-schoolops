import { createApp } from "./app.js";
import { remoteKey } from "./auth.js";
import { migrate, pool, technicianId } from "./db.js";
import { Flowable } from "./workflow.js";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
const issuer = required("OIDC_ISSUER");
const workflow = new Flowable(
  required("FLOWABLE_URL"),
  required("FLOWABLE_USER"),
  required("FLOWABLE_PASSWORD"),
);
let definition: string | undefined;
let initializing = false;
async function initialize() {
  if (initializing || definition) return;
  initializing = true;
  try {
    await migrate();
    await workflow.ready();
    definition = await workflow.deploy(required("BPMN_PATH"));
    console.log("Database and foundation workflow ready.");
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
  pool,
  workflow,
  issuer,
  audience: required("OIDC_AUDIENCE"),
  key: remoteKey(required("OIDC_JWKS_URL")),
  technicianId,
  definitionId: () => definition,
  readiness: async () => {
    if (!definition) throw new Error("Initializing");
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
