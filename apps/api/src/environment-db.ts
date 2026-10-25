// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import type pg from "pg";
export const environmentOfficer = "66666666-6666-4666-8666-666666666666";
export const environmentIngestor = "77777777-7777-4777-8777-777777777777";
export async function environmentMigration(db: pg.PoolClient) {
  if (
    !(await db.query("SELECT 1 FROM schema_migrations WHERE version=6"))
      .rowCount
  ) {
    await db.query(`
  ALTER TABLE cases ADD COLUMN pack_id text NOT NULL DEFAULT 'g01';
  INSERT INTO memberships(subject_id,username,display_name,roles) VALUES
    ('${environmentOfficer}','environment','Cán bộ môi trường Demo',ARRAY['environment_officer']),
    ('${environmentIngestor}','sensor','Nguồn phát lại PM2.5 Demo',ARRAY['environment_ingestor']);
  CREATE TABLE environment_sources(id text PRIMARY KEY,name text NOT NULL,station_id text NOT NULL,room_id text NOT NULL REFERENCES rooms(id),officer_id uuid NOT NULL REFERENCES memberships(subject_id),enabled boolean NOT NULL DEFAULT true,
    state_revision_id uuid REFERENCES pack_revisions(id),watermark timestamptz,high_count int NOT NULL DEFAULT 0,low_count int NOT NULL DEFAULT 0,candidate_since timestamptz,open_episode uuid,last_end timestamptz,updated_at timestamptz NOT NULL DEFAULT now());
  INSERT INTO environment_sources(id,name,station_id,room_id,officer_id) VALUES('demo-pm25','PM2.5 A101 — dữ liệu phát lại','A101-PM25','A101','${environmentOfficer}');
  CREATE TABLE environment_episodes(id uuid PRIMARY KEY,source_id text NOT NULL REFERENCES environment_sources(id),rule_revision_id uuid NOT NULL REFERENCES pack_revisions(id),rule_snapshot jsonb NOT NULL,case_id uuid NOT NULL UNIQUE REFERENCES cases(id),started_at timestamptz NOT NULL,condition_ended_at timestamptz,last_observed_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
  ALTER TABLE environment_sources ADD CONSTRAINT environment_open_episode_fk FOREIGN KEY(open_episode) REFERENCES environment_episodes(id);
  CREATE UNIQUE INDEX environment_episode_open ON environment_episodes(source_id) WHERE condition_ended_at IS NULL;
  CREATE TABLE environment_observations(id uuid PRIMARY KEY,source_id text NOT NULL REFERENCES environment_sources(id),event_id text NOT NULL,raw jsonb NOT NULL,request_hash text NOT NULL,normalized_value numeric,normalized_unit text,observed_at timestamptz,received_at timestamptz NOT NULL DEFAULT now(),label text NOT NULL,
    quality text NOT NULL CHECK(quality IN ('valid','invalid','late')),quality_errors jsonb NOT NULL DEFAULT '[]',rule_revision_id uuid NOT NULL REFERENCES pack_revisions(id),gap_detected boolean NOT NULL DEFAULT false,suppressed boolean NOT NULL DEFAULT false,UNIQUE(source_id,event_id));
  CREATE TABLE environment_ingest_attempts(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,observation_id uuid NOT NULL REFERENCES environment_observations(id),actor_id uuid NOT NULL REFERENCES memberships(subject_id),outcome text NOT NULL,request_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE environment_episode_observations(episode_id uuid NOT NULL REFERENCES environment_episodes(id),observation_id uuid NOT NULL REFERENCES environment_observations(id),PRIMARY KEY(episode_id,observation_id));
  INSERT INTO schema_migrations(version) VALUES(6);
 `);
  }
  if (
    !(await db.query("SELECT 1 FROM schema_migrations WHERE version=7"))
      .rowCount
  ) {
    await db.query(
      `CREATE TABLE identity_bindings(subject_id uuid NOT NULL,issuer text NOT NULL,member_id uuid NOT NULL REFERENCES memberships(subject_id),PRIMARY KEY(issuer,subject_id));INSERT INTO schema_migrations(version) VALUES(7);`,
    );
  }
}
