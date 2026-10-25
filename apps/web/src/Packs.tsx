// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { useEffect, useState } from "react";
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Revision = {
  id: string;
  packId: string;
  version: string;
  checksum: string;
  definitionId: string;
  active: boolean;
};
type PackEvent = {
  id: string;
  packId: string;
  version: string;
  action: string;
  errors: string[];
  createdAt: string;
};
export function Packs({ request }: { request: Request }) {
  const [data, setData] = useState<{ items: Revision[]; events: PackEvent[] }>({
      items: [],
      events: [],
    }),
    [error, setError] = useState("");
  async function refresh() {
    try {
      setData(await request("/api/packs"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <section className="panel packs">
      <div className="section-heading">
        <h2>Gói nghiệp vụ</h2>
        <button className="button secondary" onClick={() => void refresh()}>
          Làm mới gói
        </button>
      </div>
      <p>
        Phiên bản đã nạp giữ nguyên nội dung. Hồ sơ mới dùng bản đang kích hoạt;
        hồ sơ cũ tiếp tục với bản đã gắn.
      </p>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <ul className="evidence-list">
        {data.items.map((r) => (
          <li key={r.id}>
            <h3>
              {r.packId} · {r.version}
            </h3>
            <span className={`scan-state ${r.active ? "scan-clean" : ""}`}>
              {r.active ? "Đang kích hoạt" : "Đã nạp"}
            </span>
            <details>
              <summary>Thông tin kiểm chứng gói</summary>
              <p className="mono">SHA-256: {r.checksum}</p>
              <p className="mono">{r.definitionId}</p>
            </details>
          </li>
        ))}
      </ul>
      <h3>Lịch sử kiểm tra và kích hoạt</h3>
      <ol className="timeline">
        {data.events.map((e) => (
          <li key={e.id}>
            <strong>
              {e.packId} {e.version} — {e.action}
            </strong>
            <small>{new Date(e.createdAt).toLocaleString("vi-VN")}</small>
            {e.errors.map((x, i) => (
              <p key={i} className="message error">
                {x}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
