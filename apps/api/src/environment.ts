import { Router } from "express";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type pg from "pg";
import type { Flowable } from "./workflow.js";
import type { Principal } from "./auth.js";
import { activePack, canonical, type BusinessPack } from "./packs.js";
import { createCaseRecord } from "./case-create.js";
import { executeCommand } from "./outbox.js";
import { HttpError } from "./errors.js";
export type EnvironmentRule = NonNullable<BusinessPack["manifest"]["rule"]>;
const input = z
  .object({
    eventId: z.string().min(1).max(100),
    stationId: z.string().max(80),
    observedAt: z.iso.datetime({ offset: true }),
    quantity: z.literal("pm25"),
    value: z.number().finite(),
    unit: z.enum(["ug/m3", "mg/m3"]),
    label: z.literal("replayed"),
  })
  .strict();
export function qualityCheck(
  raw: unknown,
  station: string,
  watermark: string | null,
) {
  const parsed = input.safeParse(raw),
    errors = parsed.success
      ? []
      : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  let value: number | null = null,
    observedAt: string | null = null;
  if (parsed.success) {
    value = parsed.data.value * (parsed.data.unit === "mg/m3" ? 1000 : 1);
    observedAt = new Date(parsed.data.observedAt).toISOString();
    if (parsed.data.stationId !== station)
      errors.push("stationId không khớp nguồn");
    if (value < 0 || value > 1000)
      errors.push("PM2.5 ngoài phạm vi minh họa 0–1000 ug/m3");
    if (new Date(observedAt).getTime() > Date.now() + 300000)
      errors.push("observedAt ở tương lai");
  }
  const late = !!(
    observedAt &&
    watermark &&
    new Date(observedAt).getTime() <= new Date(watermark).getTime()
  );
  if (late)
    errors.push(
      "Bản tin đến muộn/không tăng thời gian, không cập nhật trạng thái hiện hành",
    );
  return {
    quality: errors.length
      ? late && parsed.success && errors.length === 1
        ? "late"
        : "invalid"
      : "valid",
    errors,
    value,
    observedAt,
    label: "replayed",
  };
}
function requireRole(user: Principal, name: string) {
  if (!user.roles.some((r) => r === name))
    throw new HttpError(
      403,
      "ENVIRONMENT_FORBIDDEN",
      "Không có quyền cho chức năng môi trường.",
    );
}
const view = (r: Record<string, any>) => ({
  id: r.id,
  eventId: r.event_id,
  sourceId: r.source_id,
  raw: r.raw,
  normalized:
    r.normalized_value === null
      ? null
      : { value: Number(r.normalized_value), unit: r.normalized_unit },
  observedAt: r.observed_at,
  receivedAt: r.received_at,
  label: r.label,
  quality: r.quality,
  qualityErrors: r.quality_errors,
  ruleRevisionId: r.rule_revision_id,
  gapDetected: r.gap_detected,
  suppressed: r.suppressed,
});
export function environmentRouter(pool: pg.Pool, workflow: Flowable) {
  const router = Router();
  router.post("/sources/:id/observations", async (req, res) => {
    const user = res.locals.principal as Principal;
    requireRole(user, "environment_ingestor");
    const db = await pool.connect();
    let commandId: string | undefined,
      response: any,
      status = 201;
    try {
      await db.query("BEGIN");
      const source = (
        await db.query(
          "SELECT * FROM environment_sources WHERE id=$1 AND enabled FOR UPDATE",
          [req.params.id],
        )
      ).rows[0];
      if (!source)
        throw new HttpError(
          404,
          "SOURCE_NOT_FOUND",
          "Nguồn không tồn tại hoặc đã tắt.",
        );
      const raw = req.body ?? {},
        hash = createHash("sha256").update(canonical(raw)).digest("hex");
      const candidate = (raw as any)?.eventId,
        eventId =
          typeof candidate === "string" &&
          candidate.length > 0 &&
          candidate.length <= 100
            ? candidate
            : `invalid-${randomUUID()}`;
      const old = (
        await db.query(
          "SELECT * FROM environment_observations WHERE source_id=$1 AND event_id=$2",
          [source.id, eventId],
        )
      ).rows[0];
      if (old) {
        const outcome = old.request_hash === hash ? "duplicate" : "conflict";
        await db.query(
          "INSERT INTO environment_ingest_attempts(observation_id,actor_id,outcome,request_hash) VALUES($1,$2,$3,$4)",
          [old.id, user.id, outcome, hash],
        );
        await db.query("COMMIT");
        if (outcome === "conflict")
          return res
            .status(409)
            .json({
              error: {
                code: "EVENT_ID_CONFLICT",
                message: "Event ID đã dùng với nội dung khác.",
              },
            });
        return res.json({ item: view(old), duplicate: true });
      }
      const revision = await activePack(db, "g02");
      let rule = revision.bundle.manifest.rule!;
      let episode = source.open_episode
        ? (
            await db.query("SELECT * FROM environment_episodes WHERE id=$1", [
              source.open_episode,
            ])
          ).rows[0]
        : null;
      if (episode) rule = episode.rule_snapshot;
      const q = qualityCheck(raw, source.station_id, source.watermark),
        gap =
          q.quality === "valid" &&
          source.watermark &&
          new Date(q.observedAt!).getTime() -
            new Date(source.watermark).getTime() >
            rule.gapSeconds * 1000;
      const observation = (
        await db.query(
          `INSERT INTO environment_observations(id,source_id,event_id,raw,request_hash,normalized_value,normalized_unit,observed_at,label,quality,quality_errors,rule_revision_id,gap_detected) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [
            randomUUID(),
            source.id,
            eventId,
            JSON.stringify(raw),
            hash,
            q.value,
            q.value === null ? null : "ug/m3",
            q.observedAt,
            q.label,
            q.quality,
            JSON.stringify(q.errors),
            episode?.rule_revision_id || revision.id,
            !!gap,
          ],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO environment_ingest_attempts(observation_id,actor_id,outcome,request_hash) VALUES($1,$2,'received',$3)",
        [observation.id, user.id, hash],
      );
      if (q.quality === "valid") {
        if (!episode && source.state_revision_id !== revision.id) {
          source.high_count = 0;
          source.low_count = 0;
          source.candidate_since = null;
        }
        if (gap) {
          source.high_count = 0;
          source.low_count = 0;
          source.candidate_since = null;
        }
        const high = q.value! > rule.threshold;
        if (episode) {
          source.low_count = high ? 0 : source.low_count + 1;
          await db.query(
            "INSERT INTO environment_episode_observations(episode_id,observation_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [episode.id, observation.id],
          );
          await db.query(
            "UPDATE environment_episodes SET last_observed_at=$2 WHERE id=$1",
            [episode.id, q.observedAt],
          );
          if (source.low_count >= rule.recoveryConsecutive) {
            await db.query(
              "UPDATE environment_episodes SET condition_ended_at=$2 WHERE id=$1",
              [episode.id, q.observedAt],
            );
            source.open_episode = null;
            source.last_end = q.observedAt;
            source.high_count = 0;
            source.low_count = 0;
            source.candidate_since = null;
          }
        } else {
          const cooldown =
            source.last_end &&
            new Date(q.observedAt!).getTime() -
              new Date(source.last_end).getTime() <
              rule.cooldownSeconds * 1000;
          if (high && cooldown) {
            observation.suppressed = true;
            await db.query(
              "UPDATE environment_observations SET suppressed=true WHERE id=$1",
              [observation.id],
            );
            source.high_count = 0;
            source.candidate_since = null;
          } else if (high) {
            if (source.high_count === 0) source.candidate_since = q.observedAt;
            source.high_count++;
            if (source.high_count >= rule.openConsecutive) {
              if (
                !(
                  await db.query(
                    "SELECT 1 FROM memberships WHERE subject_id=$1 AND enabled AND 'environment_officer'=ANY(roles)",
                    [source.officer_id],
                  )
                ).rowCount
              )
                throw new HttpError(
                  409,
                  "NO_ENVIRONMENT_OFFICER",
                  "Cán bộ đã bị thu hồi quyền; thử lại event sau khi khôi phục.",
                );
              const episodeId = randomUUID(),
                payload = {
                  title: `Cảnh báo PM2.5 ${source.station_id}`,
                  roomId: source.room_id,
                  assetId: null,
                  description: `Nguồn ${source.name}; dữ liệu phát lại. Quy tắc ${rule.version}: ${rule.openConsecutive} số đo liên tiếp > ${rule.threshold} ug/m3. Ngưỡng minh họa, không phải khuyến cáo sức khỏe.`,
                };
              const created = await createCaseRecord(db, {
                payload,
                pack: revision,
                reporterId: user.id,
                coordinatorId: source.officer_id,
                technicianId: source.officer_id,
                actorId: user.id,
                key: episodeId,
                hash: createHash("sha256")
                  .update(canonical(payload))
                  .digest("hex"),
              });
              if (!created) throw Error("Episode case collision");
              commandId = created.commandId;
              episode = (
                await db.query(
                  `INSERT INTO environment_episodes(id,source_id,rule_revision_id,rule_snapshot,case_id,started_at,last_observed_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
                  [
                    episodeId,
                    source.id,
                    revision.id,
                    JSON.stringify(rule),
                    created.row.id,
                    source.candidate_since,
                    q.observedAt,
                  ],
                )
              ).rows[0];
              source.open_episode = episodeId;
              source.low_count = 0;
              await db.query(
                `INSERT INTO environment_episode_observations(episode_id,observation_id) SELECT $1,id FROM environment_observations WHERE source_id=$2 AND quality='valid' AND observed_at BETWEEN $3 AND $4 ON CONFLICT DO NOTHING`,
                [episodeId, source.id, source.candidate_since, q.observedAt],
              );
            }
          } else {
            source.high_count = 0;
            source.candidate_since = null;
          }
        }
        await db.query(
          `UPDATE environment_sources SET watermark=$2,high_count=$3,low_count=$4,candidate_since=$5,open_episode=$6,last_end=$7,state_revision_id=$8,updated_at=now() WHERE id=$1`,
          [
            source.id,
            q.observedAt,
            source.high_count,
            source.low_count,
            source.candidate_since,
            source.open_episode,
            source.last_end,
            episode?.rule_revision_id || revision.id,
          ],
        );
      }
      // Ending an environmental episode never completes the human workflow.
      status = q.quality === "valid" ? 201 : 202;
      response = {
        item: view(observation),
        duplicate: false,
        episodeId: episode?.id || null,
        caseId: episode?.case_id || null,
      };
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
    if (commandId) await executeCommand(pool, workflow, commandId);
    res.status(status).json(response);
  });
  router.use((_req, res, next) => {
    try {
      requireRole(res.locals.principal, "environment_officer");
      next();
    } catch (e) {
      next(e);
    }
  });
  router.get("/sources", async (_req, res) => {
    const r = await pool.query(
      'SELECT id,name,station_id AS "stationId",watermark,high_count AS "highCount",low_count AS "lowCount",open_episode AS "openEpisode",enabled FROM environment_sources WHERE officer_id=$1 ORDER BY id',
      [res.locals.principal.id],
    );
    const pack = await activePack(pool, "g02");
    res.json({
      items: r.rows,
      rule: pack.bundle.manifest.rule,
      packRevisionId: pack.id,
    });
  });
  router.get("/sources/:id/observations", async (req, res) => {
    if (
      !(
        await pool.query(
          "SELECT 1 FROM environment_sources WHERE id=$1 AND officer_id=$2",
          [req.params.id, res.locals.principal.id],
        )
      ).rowCount
    )
      throw new HttpError(
        404,
        "SOURCE_NOT_FOUND",
        "Không tìm thấy nguồn trong quyền hiện hành.",
      );
    const r = await pool.query(
      "SELECT * FROM environment_observations WHERE source_id=$1 ORDER BY received_at DESC,id DESC LIMIT 200",
      [req.params.id],
    );
    res.json({ items: r.rows.map(view) });
  });
  router.get("/episodes", async (_req, res) => {
    const r = await pool.query(
      `SELECT e.id,e.source_id AS "sourceId",e.case_id AS "caseId",e.started_at AS "startedAt",e.condition_ended_at AS "conditionEndedAt",e.last_observed_at AS "lastObservedAt",e.rule_snapshot AS rule,c.code,c.status,c.sync_status AS "syncStatus" FROM environment_episodes e JOIN cases c ON c.id=e.case_id WHERE c.pack_id='g02' AND (c.coordinator_id=$1 OR c.technician_id=$1) ORDER BY e.created_at DESC LIMIT 100`,
      [res.locals.principal.id],
    );
    res.json({ items: r.rows });
  });
  router.get("/episodes/:id/lineage", async (req, res) => {
    if (!z.uuid().safeParse(req.params.id).success)
      throw new HttpError(400, "INVALID_ID", "Mã đợt cảnh báo không hợp lệ.");
    const e = (
      await pool.query(
        `SELECT e.*,r.checksum,r.version AS pack_version,s.name AS source_name,s.station_id FROM environment_episodes e JOIN cases c ON c.id=e.case_id JOIN pack_revisions r ON r.id=e.rule_revision_id JOIN environment_sources s ON s.id=e.source_id WHERE e.id=$1 AND c.pack_id='g02' AND (c.coordinator_id=$2 OR c.technician_id=$2)`,
        [req.params.id, res.locals.principal.id],
      )
    ).rows[0];
    if (!e)
      throw new HttpError(
        404,
        "NOT_FOUND",
        "Không tìm thấy đợt trong quyền hiện hành.",
      );
    const readings = (
      await pool.query(
        "SELECT o.* FROM environment_episode_observations l JOIN environment_observations o ON o.id=l.observation_id WHERE l.episode_id=$1 ORDER BY o.observed_at,o.id",
        [e.id],
      )
    ).rows;
    const attempts = (
      await pool.query(
        'SELECT a.id::text,a.observation_id AS "observationId",a.outcome,a.created_at AS "createdAt" FROM environment_ingest_attempts a JOIN environment_episode_observations l ON l.observation_id=a.observation_id WHERE l.episode_id=$1 ORDER BY a.id',
        [e.id],
      )
    ).rows;
    res.json({
      episode: {
        id: e.id,
        sourceId: e.source_id,
        sourceName: e.source_name,
        stationId: e.station_id,
        caseId: e.case_id,
        startedAt: e.started_at,
        conditionEndedAt: e.condition_ended_at,
        rule: e.rule_snapshot,
        packRevisionId: e.rule_revision_id,
        packVersion: e.pack_version,
        packChecksum: e.checksum,
      },
      observations: readings.map(view),
      attempts,
    });
  });
  return router;
}
