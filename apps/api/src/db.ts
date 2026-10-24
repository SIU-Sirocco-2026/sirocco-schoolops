import pg from "pg";

export const demoUsers = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    username: "reporter",
    name: "Người báo Demo",
    role: "reporter",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    username: "coordinator",
    name: "Điều phối Demo",
    role: "coordinator",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    username: "technician",
    name: "Kỹ thuật viên Demo",
    role: "technician",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    username: "approver",
    name: "Nghiệm thu Demo",
    role: "approver",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    username: "admin",
    name: "Quản trị kỹ thuật Demo",
    role: "admin",
  },
];
export const technicianId = demoUsers[2]!.id;
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000,
});
pool.on("error", (error) =>
  console.error("Database connection:", error.message),
);

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // A transaction lock also makes startup safe if two API instances boot together.
    await client.query("SELECT pg_advisory_xact_lock(731042)");
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    const done = await client.query(
      "SELECT version FROM schema_migrations WHERE version=1",
    );
    if (!done.rowCount) {
      await client.query(`
        CREATE TABLE memberships (
          subject_id uuid PRIMARY KEY, username text UNIQUE NOT NULL, display_name text NOT NULL,
          roles text[] NOT NULL, enabled boolean NOT NULL DEFAULT true
        );
        CREATE TABLE foundation_runs (
          id uuid PRIMARY KEY, title text NOT NULL, requested_by uuid NOT NULL REFERENCES memberships(subject_id),
          assignee uuid NOT NULL REFERENCES memberships(subject_id), idempotency_key uuid NOT NULL,
          request_hash text NOT NULL, process_id text, definition_id text,
          package_version text NOT NULL DEFAULT 'foundation@1.0.0',
          status text NOT NULL CHECK(status IN ('starting','waiting','completed','needs_reconciliation')),
          created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
          UNIQUE(requested_by, idempotency_key)
        );
        CREATE TABLE audit_events (
          id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          resource_id uuid NOT NULL REFERENCES foundation_runs(id), actor_id uuid NOT NULL REFERENCES memberships(subject_id),
          action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX foundation_runs_visible ON foundation_runs(requested_by,assignee,created_at DESC);
        INSERT INTO schema_migrations(version) VALUES (1);
      `);
      for (const user of demoUsers)
        await client.query(
          "INSERT INTO memberships(subject_id,username,display_name,roles) VALUES($1,$2,$3,$4)",
          [user.id, user.username, user.name, [user.role]],
        );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
