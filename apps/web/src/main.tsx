import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Keycloak from "keycloak-js";
import "./style.css";

type User = { id: string; username: string; name: string; roles: string[] };
type Task = {
  id: string;
  title: string;
  status: string;
  processId: string | null;
  packageVersion: string;
  createdAt: string;
  completedAt: string | null;
  canComplete: boolean;
};
const roleNames: Record<string, string> = {
  reporter: "Người báo",
  coordinator: "Điều phối",
  technician: "Kỹ thuật viên",
  approver: "Nghiệm thu",
  admin: "Quản trị kỹ thuật",
};
const statuses: Record<string, string> = {
  starting: "Đang đồng bộ",
  waiting: "Chờ kỹ thuật viên",
  completed: "Đã hoàn tất",
  needs_reconciliation: "Cần đối soát",
};
let keycloak: Keycloak;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  await keycloak.updateToken(30);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${keycloak.token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || "Không thể tải dữ liệu.");
  return data as T;
}
function date(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("Kiểm tra máy chiếu phòng A101");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    try {
      const [me, list] = await Promise.all([
        request<{ user: User }>("/api/me"),
        request<{ items: Task[] }>("/api/foundation/tasks"),
      ]);
      setUser(me.user);
      setTasks(list.items);
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/config");
        if (!response.ok)
          throw new Error(
            "Chưa kết nối được API. Kiểm tra các dịch vụ rồi tải lại.",
          );
        const config = await response.json();
        keycloak = new Keycloak(config.auth);
        const authenticated = await keycloak.init({
          onLoad: "check-sso",
          pkceMethod: "S256",
          checkLoginIframe: false,
        });
        setReady(true);
        if (authenticated) await refresh();
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Không thể kết nối hệ thống.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<{ item: Task; message?: string }>(
        "/api/foundation/tasks",
        {
          method: "POST",
          headers: { "Idempotency-Key": operationKey },
          body: JSON.stringify({ title }),
        },
      );
      setSelected(result.item.id);
      setOperationKey(crypto.randomUUID());
      setNotice(
        result.message ||
          "Đã tạo nhiệm vụ. Đăng nhập bằng tài khoản kỹ thuật viên để xử lý.",
      );
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Không thể tạo nhiệm vụ.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function complete(task: Task) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/api/foundation/tasks/${task.id}/complete`, {
        method: "POST",
      });
      setNotice("Đã hoàn tất nhiệm vụ trên workflow engine và lưu lịch sử.");
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Chưa thể hoàn tất nhiệm vụ.",
      );
    } finally {
      setBusy(false);
    }
  }
  const focus = tasks.find((task) => task.id === selected) || tasks[0];
  const canCreate = user?.roles.some(
    (role) => role === "reporter" || role === "coordinator",
  );
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="SchoolOps trang chủ">
          <span className="brand-symbol">
            S<span>·</span>
          </span>
          <span>
            SchoolOps<small>by Sirocco</small>
          </span>
        </a>
        <div className="workspace-label">
          <span className="school-icon">SIU</span>
          <span>
            Trường học demo<small>Môi trường phát triển</small>
          </span>
        </div>
        <div className="nav-label">KHÔNG GIAN LÀM VIỆC</div>
        <nav aria-label="Điều hướng">
          <a className="nav-item active" href="#workspace">
            <span className="nav-square" />
            Công việc của tôi
            <span className="count">
              {tasks.filter((t) => t.status !== "completed").length}
            </span>
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="small-dot" />
          <strong>Nền tảng đang khởi tạo</strong>
          <p>
            Kiểm chứng đăng nhập, dữ liệu và quy trình trước khi mở rộng nghiệp
            vụ.
          </p>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">{user?.name.charAt(0) || "S"}</span>
          <div>
            <strong>{user?.name || "Khách truy cập"}</strong>
            <small>
              {user
                ? user.roles.map((role) => roleNames[role] || role).join(", ")
                : "Chưa đăng nhập"}
            </small>
          </div>
        </div>
      </aside>
      <main id="workspace">
        <header className="topbar">
          <span>
            SchoolOps <span className="slash">/</span> Công việc của tôi
          </span>
          <span className="env-badge">
            <span className="small-dot" />
            Bản tích hợp nền tảng
          </span>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">VẬN HÀNH TRƯỜNG HỌC</div>
              <h1>
                {user ? "Công việc của tôi" : "Một nơi để phối hợp xử lý."}
              </h1>
              <p className="intro">
                {user
                  ? "Theo dõi nhiệm vụ được giao và kết quả xử lý trên cùng một nền tảng."
                  : "Đăng nhập để tiếp nhận, theo dõi và hoàn tất nhiệm vụ của bạn."}
              </p>
            </div>
            {user ? (
              <button
                className="button secondary"
                onClick={() =>
                  void keycloak.logout({ redirectUri: window.location.origin })
                }
              >
                Đăng xuất
              </button>
            ) : null}
          </div>
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              {notice}
            </div>
          )}
          {loading ? (
            <div className="panel loading" role="status">
              Đang kết nối dịch vụ và kiểm tra phiên đăng nhập…
            </div>
          ) : !user ? (
            <section className="welcome panel">
              <div className="welcome-mark">01</div>
              <div>
                <span className="eyebrow">BƯỚC ĐẦU TIÊN</span>
                <h2>Bắt đầu từ công việc của bạn.</h2>
                <p>
                  Dùng tài khoản demo theo vai trò để thử luồng tạo và hoàn tất
                  một nhiệm vụ.
                </p>
                <button
                  className="button primary"
                  disabled={!ready}
                  onClick={() =>
                    void keycloak.login({ redirectUri: window.location.origin })
                  }
                >
                  Đăng nhập vào SchoolOps <span aria-hidden="true">↗</span>
                </button>
                {!ready && (
                  <button
                    className="button secondary"
                    onClick={() => location.reload()}
                  >
                    Kết nối lại
                  </button>
                )}
              </div>
              <div className="welcome-steps">
                <div>
                  <span>1</span>Đăng nhập theo vai trò
                </div>
                <div>
                  <span>2</span>Tiếp nhận nhiệm vụ
                </div>
                <div>
                  <span>3</span>Xác nhận hoàn tất
                </div>
              </div>
            </section>
          ) : (
            <>
              <div className="summary">
                <div>
                  <span className="summary-label">Đang chờ xử lý</span>
                  <strong>
                    {tasks
                      .filter((t) => t.status === "waiting")
                      .length.toString()
                      .padStart(2, "0")}
                  </strong>
                </div>
                <div>
                  <span className="summary-label">Đã hoàn tất</span>
                  <strong>
                    {tasks
                      .filter((t) => t.status === "completed")
                      .length.toString()
                      .padStart(2, "0")}
                  </strong>
                </div>
                <div className="summary-role">
                  <span className="summary-label">Vai trò của bạn</span>
                  <strong>
                    {user.roles
                      .map((role) => roleNames[role] || role)
                      .join(", ")}
                  </strong>
                  <small>Quyền được kiểm tra tại máy chủ</small>
                </div>
              </div>
              {canCreate && (
                <section className="create-panel panel">
                  <div>
                    <h2>Tạo nhiệm vụ kiểm tra</h2>
                    <p>
                      Gửi một công việc cho kỹ thuật viên demo để kiểm tra luồng
                      phối hợp.
                    </p>
                  </div>
                  <form onSubmit={create}>
                    <label htmlFor="task-title">Nội dung nhiệm vụ</label>
                    <div className="form-row">
                      <input
                        id="task-title"
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          setOperationKey(crypto.randomUUID());
                        }}
                        minLength={5}
                        maxLength={160}
                        required
                        disabled={busy}
                      />
                      <button
                        className="button primary"
                        type="submit"
                        disabled={busy}
                      >
                        {busy ? "Đang gửi…" : "Tạo nhiệm vụ"}
                        <span aria-hidden="true">+</span>
                      </button>
                    </div>
                  </form>
                </section>
              )}
              <div className="work-grid">
                <section className="panel task-panel">
                  <div className="section-heading">
                    <h2>
                      Danh sách nhiệm vụ{" "}
                      <span className="muted-count">{tasks.length}</span>
                    </h2>
                    <button
                      className="text-button"
                      disabled={refreshing || busy}
                      onClick={() =>
                        void refresh().catch((e) => setError(e.message))
                      }
                    >
                      {refreshing ? "Đang tải…" : "Làm mới"}
                    </button>
                  </div>
                  {tasks.length === 0 ? (
                    <div className="empty">
                      <div className="empty-symbol">✓</div>
                      <h3>Chưa có nhiệm vụ</h3>
                      <p>
                        {canCreate
                          ? "Tạo nhiệm vụ đầu tiên ở biểu mẫu phía trên."
                          : "Nhiệm vụ được giao sẽ xuất hiện tại đây. Bạn có thể làm mới để kiểm tra."}
                      </p>
                    </div>
                  ) : (
                    <ul className="task-list">
                      {tasks.map((task) => (
                        <li key={task.id}>
                          <button
                            className={`task-row ${focus?.id === task.id ? "selected" : ""}`}
                            onClick={() => setSelected(task.id)}
                          >
                            <span
                              className={`task-marker ${task.status === "completed" ? "done" : ""}`}
                            >
                              {task.status === "completed" ? "✓" : "○"}
                            </span>
                            <span className="task-copy">
                              <strong>{task.title}</strong>
                              <small>{date(task.createdAt)}</small>
                            </span>
                            <span className={`status ${task.status}`}>
                              {statuses[task.status] || task.status}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="panel detail-panel">
                  <div className="section-heading">
                    <h2>Chi tiết nhiệm vụ</h2>
                  </div>
                  {focus ? (
                    <div className="details">
                      <span className={`status ${focus.status}`}>
                        {statuses[focus.status]}
                      </span>
                      <h3>{focus.title}</h3>
                      <dl>
                        <div>
                          <dt>Người xử lý</dt>
                          <dd>Kỹ thuật viên demo</dd>
                        </div>
                        <div>
                          <dt>Thời gian tạo</dt>
                          <dd>{date(focus.createdAt)}</dd>
                        </div>
                        {focus.completedAt && (
                          <div>
                            <dt>Hoàn tất lúc</dt>
                            <dd>{date(focus.completedAt)}</dd>
                          </div>
                        )}
                        <div>
                          <dt>Gói quy trình</dt>
                          <dd>{focus.packageVersion}</dd>
                        </div>
                        <div>
                          <dt>Mã nhiệm vụ</dt>
                          <dd className="mono">{focus.id}</dd>
                        </div>
                        <div>
                          <dt>Process ID</dt>
                          <dd className="mono">
                            {focus.processId || "Chờ đối soát"}
                          </dd>
                        </div>
                      </dl>
                      {focus.canComplete ? (
                        <button
                          className="button primary full"
                          disabled={busy}
                          onClick={() => void complete(focus)}
                        >
                          {busy ? "Đang xác nhận…" : "Xác nhận hoàn tất"}
                        </button>
                      ) : focus.status === "waiting" ? (
                        <p className="hint">
                          Nhiệm vụ này đang chờ kỹ thuật viên được giao xác
                          nhận.
                        </p>
                      ) : focus.status === "needs_reconciliation" ? (
                        <p className="hint">
                          Kết quả đồng bộ chưa chắc chắn. Giữ nguyên hồ sơ và
                          kiểm tra workflow trước khi thao tác tiếp.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="detail-empty">
                      Chọn một nhiệm vụ để xem thông tin và thao tác.
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>Sirocco Core + SchoolOps</span>
            <span>Dữ liệu giả lập · Phạm vi kiểm chứng nền tảng</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
