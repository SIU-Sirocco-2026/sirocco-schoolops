// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { useEffect, useState } from "react";
import { G01 } from "./G01.js";
import { navigate } from "./workspace-state.js";
import { IconShieldCheck, IconRefresh, IconBell } from "@tabler/icons-react";
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
export function Safety({ request }: { request: Request }) {
  const [items, setItems] = useState<
      { id: string; caseId: string; code: string; message: string }[]
    >([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true);
    try {
      setItems(
        (await request<{ items: typeof items }>("/api/g03/notifications"))
          .items,
      );
      setError("");
    } catch (e) {
      setItems([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <div>
      <section className="panel safety" aria-busy={loading}>
        <div className="section-heading">
          <h2>
            <IconShieldCheck size={21} aria-hidden="true" />
            Phản ánh an toàn hạn chế
          </h2>
        </div>
        <details className="module-help">
          <summary>Chỉ người được cấp quyền truy cập</summary>
          <p>
            Dùng tình huống giả lập trung tính. Chỉ người báo và cán bộ được
            giao trên hồ sơ mới được truy cập; quản trị kỹ thuật không có quyền
            đọc ngầm.
          </p>
        </details>
        <div className="notification-heading">
          <h3>
            <IconBell size={18} aria-hidden="true" />
            Thông báo trong phạm vi được cấp quyền
          </h3>
          <button
            className="button secondary"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <IconRefresh size={16} aria-hidden="true" />
            Làm mới thông báo
          </button>
        </div>
        {loading && (
          <p className="module-status" role="status">
            Đang tải thông báo…
          </p>
        )}
        {!loading && !error && !items.length && (
          <p className="module-empty">Chưa có thông báo mới.</p>
        )}
        {error && (
          <p role="alert" className="message error">
            {error}
          </p>
        )}
        <ul className="evidence-list notification-list">
          {items.slice(0, 15).map((n) => (
            <li key={n.id}>
              <span>{n.message}</span>
              <button
                className="button secondary"
                onClick={() => navigate("safety", n.caseId)}
              >
                Mở thông báo {n.code}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <G01 request={request} prefix="g03" />
    </div>
  );
}
export function AccessLog({
  request,
  caseId,
}: {
  request: Request;
  caseId: string;
}) {
  const [items, setItems] = useState<any[] | null>(null),
    [error, setError] = useState("");
  async function load() {
    try {
      setItems(
        (await request<{ items: any[] }>(`/api/g03/cases/${caseId}/access-log`))
          .items,
      );
      setError("");
    } catch (e) {
      setItems(null);
      setError((e as Error).message);
    }
  }
  return (
    <section>
      <button className="button secondary" onClick={() => void load()}>
        Xem nhật ký truy cập
      </button>
      {error && <p role="alert">{error}</p>}
      {items && (
        <ul className="evidence-list">
          {items.map((e) => (
            <li key={e.id}>
              <strong>
                {e.operation} · {e.allowed ? "Được cấp quyền" : "Bị từ chối"}
              </strong>
              <small>
                {e.actorId} · {new Date(e.createdAt).toLocaleString("vi-VN")} ·
                HTTP {e.httpStatus ?? "Đang xử lý hoặc bị gián đoạn"}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
