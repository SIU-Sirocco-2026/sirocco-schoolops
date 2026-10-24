import type pg from "pg";

export async function phase3Migration(client: pg.PoolClient) {
  const phase3 = await client.query(
    "SELECT 1 FROM schema_migrations WHERE version=3",
  );
  if (!phase3.rowCount) {
    await client.query(`
    ALTER TABLE cases ADD COLUMN evidence_policy_version text NOT NULL DEFAULT 'g01-evidence@1.0.0';
    ALTER TABLE cases ADD COLUMN evidence_policy jsonb NOT NULL DEFAULT '{"submit":{"minClean":1,"step":"repair","currentTask":true}}';
    CREATE TABLE workflow_commands (
      id uuid PRIMARY KEY, case_id uuid NOT NULL REFERENCES cases(id), actor_id uuid NOT NULL REFERENCES memberships(subject_id),
      action text NOT NULL, from_status text NOT NULL, target jsonb NOT NULL, variables jsonb NOT NULL,
      details jsonb NOT NULL, old_task_id text, expected_revision integer NOT NULL,
      state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done','blocked')),
      attempts integer NOT NULL DEFAULT 0, last_error text, next_attempt_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
      UNIQUE(case_id,expected_revision)
    );
    CREATE UNIQUE INDEX workflow_one_pending ON workflow_commands(case_id) WHERE state IN ('pending','blocked');
    ALTER TABLE case_events ADD COLUMN command_id uuid REFERENCES workflow_commands(id);
    CREATE UNIQUE INDEX case_events_command ON case_events(command_id) WHERE command_id IS NOT NULL;
    CREATE TABLE evidence (
      id uuid PRIMARY KEY, case_id uuid NOT NULL REFERENCES cases(id), uploaded_by uuid NOT NULL REFERENCES memberships(subject_id),
      idempotency_key uuid NOT NULL, filename text NOT NULL, mime text NOT NULL, size integer NOT NULL CHECK(size>0 AND size<=10485760),
      checksum text NOT NULL, object_key text NOT NULL UNIQUE, step_key text NOT NULL, task_id text,
      policy_version text NOT NULL, package_version text NOT NULL,
      scan_status text NOT NULL DEFAULT 'pending' CHECK(scan_status IN ('pending','clean','rejected','error')),
      scan_version text, scan_message text, attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), scanned_at timestamptz,
      UNIQUE(case_id,uploaded_by,idempotency_key)
    );
    CREATE INDEX evidence_case ON evidence(case_id,created_at);
    CREATE TABLE worker_heartbeat (id text PRIMARY KEY, last_seen timestamptz NOT NULL DEFAULT now());
    INSERT INTO schema_migrations(version) VALUES(3);
  `);
    // Phase 2 stored intent in audit but had no durable command payload. Never guess one.
    // Existing ambiguous cases are exposed as blocked for operator diagnosis, not replayed blindly.
    await client.query(`UPDATE cases SET sync_status='needs_reconciliation'
    WHERE sync_status='pending' AND NOT EXISTS (SELECT 1 FROM workflow_commands c WHERE c.case_id=cases.id)`);
  }
  const audit = await client.query(
    "SELECT 1 FROM schema_migrations WHERE version=4",
  );
  if (!audit.rowCount) {
    await client.query(`
      INSERT INTO memberships(subject_id,username,display_name,roles,enabled)
      VALUES('00000000-0000-4000-8000-000000000003','scan-worker','Hệ thống quét tệp',ARRAY[]::text[],false);
      UPDATE case_events SET details=details || jsonb_build_object('uploadedBy',actor_id),
        actor_id='00000000-0000-4000-8000-000000000003'
        WHERE action='evidence_scanned' AND details->>'executor'='scan-worker';
      INSERT INTO schema_migrations(version) VALUES(4);
    `);
  }
}

export const scanWorkerId = "00000000-0000-4000-8000-000000000003";
