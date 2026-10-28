// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { useEffect, useState } from "react";
import { G01, statusNames } from "./G01.js";
import { navigate } from "./workspace-state.js";
import { IconLeaf, IconRefresh } from "@tabler/icons-react";
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
export function Environment({ request }: { request: Request }) {
  const [sources, setSources] = useState<any[]>([]),
    [observations, setObservations] = useState<any[]>([]),
    [episodes, setEpisodes] = useState<any[]>([]),
    [rule, setRule] = useState<any>(null),
    [lineage, setLineage] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true);
    try {
      const [s, o, e] = await Promise.all([
        request<any>("/api/g02/sources"),
        request<any>("/api/g02/sources/demo-pm25/observations"),
        request<any>("/api/g02/episodes"),
      ]);
      setSources(s.items);
      setRule(s.rule);
      setObservations(o.items);
      setEpisodes(e.items);
      setError("");
    } catch (e) {
      setError((e as Error).message);
      setSources([]);
      setObservations([]);
      setEpisodes([]);
      setLineage(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function trace(e: any) {
    try {
      const nextLineage = await request(`/api/g02/episodes/${e.id}/lineage`);
      if (navigate("environment", e.caseId)) setLineage(nextLineage);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div>
      <section className="panel environment" aria-busy={loading}>
        <div className="section-heading">
          <h2>
            <IconLeaf size={21} aria-hidden="true" />
            Nguồn PM2.5
          </h2>
          <button
            className="button secondary"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <IconRefresh size={16} aria-hidden="true" />
            Làm mới môi trường
          </button>
        </div>
        <details className="module-help">
          <summary>Dữ liệu phát lại · Quy tắc cảnh báo</summary>
          <p>
            Dữ liệu phát lại có nhãn. Số đo giảm chỉ kết thúc điều kiện cảnh
            báo; cán bộ phải xác minh và đóng hồ sơ.
          </p>
          {rule && (
            <p>
              {rule.label}. Quy tắc {rule.version}: {rule.openConsecutive} lần
              liên tiếp &gt; {rule.threshold} ug/m³; phục hồi sau{" "}
              {rule.recoveryConsecutive} lần bình thường.
            </p>
          )}
        </details>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        {sources.map((s) => (
          <p key={s.id}>
            <strong>{s.name}</strong> · Trạm {s.stationId} · Thời gian mẫu cuối:{" "}
            {s.watermark
              ? new Date(s.watermark).toLocaleString("vi-VN")
              : "Chưa nhận"}
          </p>
        ))}
        {loading && (
          <p className="module-status" role="status">
            Đang tải dữ liệu nguồn…
          </p>
        )}
        <h3>Đợt cảnh báo</h3>
        {!loading && !error && !episodes.length && (
          <p className="module-empty">Chưa có đợt cảnh báo.</p>
        )}
        <ul className="evidence-list episode-list">
          {episodes.map((e) => (
            <li key={e.id}>
              <strong>{e.code}</strong>
              <p>
                {e.conditionEndedAt
                  ? "Điều kiện đã phục hồi"
                  : "Đang có điều kiện cảnh báo"}{" "}
                · Hồ sơ: {statusNames[e.status] || e.status}
              </p>
              <button
                className="button secondary"
                onClick={() => void trace(e)}
              >
                Truy nguồn và mở hồ sơ {e.code}
              </button>
            </li>
          ))}
        </ul>
        {lineage && (
          <section aria-label="Truy nguồn cảnh báo">
            <h3>Truy nguồn cảnh báo</h3>
            <p>
              Quy tắc {lineage.episode.rule.version} · Gói{" "}
              {lineage.episode.packVersion} · Nguồn {lineage.episode.sourceName}
            </p>
            <p className="mono">Checksum gói: {lineage.episode.packChecksum}</p>
            <p>
              {lineage.observations.length} phép đo liên quan;{" "}
              {
                lineage.attempts.filter((a: any) => a.outcome === "duplicate")
                  .length
              }{" "}
              lần gửi trùng.
            </p>
            <ul className="evidence-list">
              {lineage.observations.map((o: any) => (
                <li key={o.id}>
                  <strong>
                    {o.eventId}: {o.normalized?.value} {o.normalized?.unit}
                  </strong>
                  <small>
                    {o.observedAt} · {o.label} · {o.quality}
                  </small>
                  <details>
                    <summary>Dữ liệu gốc và kiểm tra chất lượng</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          raw: o.raw,
                          normalized: o.normalized,
                          receivedAt: o.receivedAt,
                          qualityErrors: o.qualityErrors,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        )}
        <details>
          <summary>
            Phép đo và chất lượng nguồn ({observations.length} bản tin gần nhất)
          </summary>
          <ul className="evidence-list">
            {observations.map((o) => (
              <li key={o.id}>
                <strong>{o.eventId}</strong>
                <span>
                  {o.normalized?.value ?? "—"} {o.normalized?.unit || ""} ·{" "}
                  {o.quality} · {o.label}
                </span>
                {o.gapDetected && (
                  <p>Khoảng mất tín hiệu; đã bắt đầu đếm liên tiếp lại.</p>
                )}
                {o.suppressed && <p>Đang trong khoảng chống lặp.</p>}
                <p>{o.qualityErrors.join("; ")}</p>
                <details>
                  <summary>Dữ liệu gốc</summary>
                  <pre>{JSON.stringify(o.raw, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        </details>
      </section>
      <G01 request={request} prefix="g02" />
    </div>
  );
}
