import { useEffect, useState } from "react";
import { G01 } from "./G01.js";
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
export function Safety({ request }: { request: Request }) {
  const [items, setItems] = useState<
      { id: string; caseId: string; code: string; message: string }[]
    >([]),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState("");
  async function refresh() {
    try {
      setItems(
        (await request<{ items: typeof items }>("/api/g03/notifications"))
          .items,
      );
      setError("");
    } catch (e) {
      setItems([]);
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <div>
      <section className="panel safety">
        <h2>Phản ánh an toàn hạn chế</h2>
        <p>
          Dùng tình huống giả lập trung tính. Chỉ người báo và cán bộ được giao
          trên hồ sơ mới được truy cập; quản trị kỹ thuật không có quyền đọc
          ngầm.
        </p>
        <h3>Thông báo trong phạm vi được cấp quyền</h3>
        <button className="button secondary" onClick={() => void refresh()}>
          Làm mới thông báo
        </button>
        {error && (
          <p role="alert" className="message error">
            {error}
          </p>
        )}
        <ul className="evidence-list">
          {items.slice(0, 15).map((n) => (
            <li key={n.id}>
              <span>{n.message}</span>
              <button
                className="button secondary"
                onClick={() => setSelected(n.caseId)}
              >
                Mở thông báo {n.code}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <G01 request={request} prefix="g03" initialCase={selected} />
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
