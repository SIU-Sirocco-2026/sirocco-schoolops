// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Keycloak from "keycloak-js";
import "./workspace.css";
import { Safety } from "./Safety.js";
import { Environment } from "./Environment.js";
import { Packs } from "./Packs.js";
import { G01 } from "./G01.js";
import { authenticatedRequest } from "./http.js";
import {
  defaultView,
  navigate,
  useWorkspaceLocation,
  type View,
} from "./workspace-state.js";

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
  safety_reporter: "Người báo an toàn",
  safety_officer: "Cán bộ an toàn",
  environment_officer: "Cán bộ môi trường",
  environment_ingestor: "Nguồn phát lại",
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

const request = authenticatedRequest(() => keycloak);
function date(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function App() {
  const location = useWorkspaceLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.view, location.caseId]);
  const [reduceEffects, setReduceEffects] = useState(() => {
    try {
      const preference = localStorage.getItem("schoolops-reduce-effects");
      if (preference !== null) return preference === "true";
    } catch {
      /* The interface also works when browser storage is unavailable. */
    }
    return window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
  });
  const [user, setUser] = useState<User | null>(null);
  const mode = location.view ?? (user ? defaultView(user.roles) : "g01");
  const setMode = (view: View) => navigate(view);
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
  useEffect(() => {
    if (user && !location.view)
      navigate(defaultView(user.roles), location.caseId, true);
  }, [user, location.view]);
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
      setNotice("Đã hoàn tất nhiệm vụ và lưu lịch sử xử lý.");
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
    <div
      className={`workspace ${!user ? "guest-workspace" : ""} ${user && location.caseId && ["g01", "environment", "safety"].includes(mode) ? "has-open-case" : ""} ${reduceEffects ? "solid-effects" : ""}`}
    >
      <a className="skip-link" href="#workspace">
        Đến nội dung chính
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="SchoolOps trang chủ">
          <span className="brand-symbol">S</span>
          <span>
            SchoolOps<small>SIROCCO</small>
          </span>
        </a>
        <button
          className="mobile-workspace-toggle"
          aria-label="Không gian làm việc"
          aria-controls="schoolops-navigation"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          Không gian <span aria-hidden="true">⌄</span>
        </button>
        <div className="workspace-label">
          <span className="school-icon">SIU</span>
          <span>
            Trường học demo<small>Vận hành nội bộ</small>
          </span>
        </div>
        <div className="nav-label">Không gian làm việc</div>
        <nav
          id="schoolops-navigation"
          className={mobileNavOpen ? "mobile-open" : ""}
          aria-label="Điều hướng"
        >
          <button
            className={`nav-item ${mode === "g01" ? "active" : ""}`}
            aria-current={mode === "g01" ? "page" : undefined}
            onClick={() => setMode("g01")}
          >
            Sự cố cơ sở vật chất
          </button>
          {user?.roles.includes("admin") && (
            <button
              className={`nav-item ${mode === "packs" ? "active" : ""}`}
              aria-current={mode === "packs" ? "page" : undefined}
              onClick={() => setMode("packs")}
            >
              Gói nghiệp vụ
            </button>
          )}
          {user?.roles.includes("environment_officer") && (
            <button
              className={`nav-item ${mode === "environment" ? "active" : ""}`}
              aria-current={mode === "environment" ? "page" : undefined}
              onClick={() => setMode("environment")}
            >
              Môi trường PM2.5
            </button>
          )}
          {user?.roles.some((r) =>
            ["safety_reporter", "safety_officer"].includes(r),
          ) && (
            <button
              className={`nav-item ${mode === "safety" ? "active" : ""}`}
              aria-current={mode === "safety" ? "page" : undefined}
              onClick={() => setMode("safety")}
            >
              An toàn hạn chế
            </button>
          )}
          {user && (
            <details
              className="nav-tools"
              open={mode === "foundation" || undefined}
            >
              <summary>Công cụ kiểm tra</summary>
              <button
                className={`nav-item ${mode === "foundation" ? "active" : ""}`}
                aria-current={mode === "foundation" ? "page" : undefined}
                onClick={() => setMode("foundation")}
              >
                Nhiệm vụ nền tảng{" "}
                <span className="count">
                  {tasks.filter((t) => t.status !== "completed").length}
                </span>
              </button>
            </details>
          )}
        </nav>
        <div className="sidebar-note">
          <strong>Phối hợp xử lý sự cố</strong>
          <p>Từ phản ánh ban đầu đến kết quả đã nghiệm thu.</p>
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
      <main id="workspace" tabIndex={-1}>
        <header className="topbar">
          <span>
            SchoolOps <span className="slash">/</span>{" "}
            {mode === "environment"
              ? "Môi trường PM2.5"
              : mode === "g01"
                ? "Sự cố cơ sở vật chất"
                : mode === "packs"
                  ? "Gói nghiệp vụ"
                  : mode === "safety"
                    ? "An toàn hạn chế"
                    : "Nhiệm vụ nền tảng"}
          </span>
          <div className="topbar-tools">
            <span className="env-badge">
              <span className="small-dot" />
              Môi trường demo
            </span>
            <button
              className="appearance-control"
              aria-pressed={reduceEffects}
              title="Dùng nền đặc để giảm hiệu ứng trong suốt"
              onClick={() => {
                const next = !reduceEffects;
                setReduceEffects(next);
                try {
                  localStorage.setItem(
                    "schoolops-reduce-effects",
                    String(next),
                  );
                } catch {
                  /* Session-only preference. */
                }
              }}
            >
              Giảm hiệu ứng
            </button>
            {user && (
              <button
                className="text-button logout-control"
                onClick={() =>
                  void keycloak.logout({ redirectUri: window.location.origin })
                }
              >
                Đăng xuất
              </button>
            )}
          </div>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {user ? "Vận hành trường học" : "SchoolOps / Đăng nhập"}
              </div>
              <h1>
                {user
                  ? mode === "safety"
                    ? "An toàn hạn chế"
                    : mode === "environment"
                      ? "Môi trường PM2.5"
                      : mode === "g01"
                        ? "Sự cố cơ sở vật chất"
                        : mode === "packs"
                          ? "Gói nghiệp vụ"
                          : "Công việc của tôi"
                  : "Vận hành trường học"}
              </h1>
              <p className="intro">
                {user
                  ? mode === "g01"
                    ? user.roles.includes("technician")
                      ? "Nhận việc được giao, cập nhật kết quả và gửi nghiệm thu."
                      : user.roles.includes("approver")
                        ? "Kiểm tra kết quả xử lý và bằng chứng trước khi nghiệm thu."
                        : user.roles.includes("coordinator")
                          ? "Xác minh phản ánh, giao người xử lý và theo dõi hạn hoàn thành."
                          : "Báo sự cố và theo dõi tiến độ trên cùng một mã hồ sơ."
                    : mode === "safety"
                      ? "Theo dõi phản ánh trong phạm vi bạn được cấp quyền."
                      : mode === "environment"
                        ? "Xác minh cảnh báo và theo dõi công việc xử lý."
                        : mode === "packs"
                          ? "Kiểm tra phiên bản đang dùng và lịch sử thay đổi."
                          : "Kiểm tra kết nối và quy trình bằng nhiệm vụ demo."
                  : "Báo sự cố, phối hợp xử lý và kiểm tra kết quả trong trường học."}
              </p>
            </div>
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
              <div>
                <span className="welcome-kicker">
                  Dành cho người báo, điều phối và kỹ thuật
                </span>
                <h2>Vào không gian làm việc</h2>
                <p>
                  Đăng nhập bằng tài khoản được cấp. Hệ thống hiển thị hồ sơ và
                  thao tác theo vai trò của bạn.
                </p>
                <button
                  className="button primary"
                  disabled={!ready}
                  onClick={() =>
                    void keycloak.login({
                      redirectUri: window.location.href.split("#")[0],
                      locale: "vi",
                    })
                  }
                >
                  Đăng nhập vào SchoolOps <span aria-hidden="true">→</span>
                </button>
                {!ready && (
                  <button
                    className="button secondary"
                    onClick={() => window.location.reload()}
                  >
                    Kết nối lại
                  </button>
                )}
              </div>
              <div className="welcome-steps">
                <div>
                  <span>01</span>
                  <div>
                    <strong>Ghi nhận</strong>
                    <p>Phản ánh sự cố, giữ mã để theo dõi.</p>
                  </div>
                </div>
                <div>
                  <span>02</span>
                  <div>
                    <strong>Phối hợp</strong>
                    <p>Giao việc, cập nhật kết quả và bằng chứng.</p>
                  </div>
                </div>
                <div>
                  <span>03</span>
                  <div>
                    <strong>Nghiệm thu</strong>
                    <p>Kiểm tra kết quả trước khi đóng hồ sơ.</p>
                  </div>
                </div>
              </div>
            </section>
          ) : mode === "safety" ? (
            <Safety request={request} />
          ) : mode === "environment" ? (
            <Environment request={request} />
          ) : mode === "packs" ? (
            <Packs request={request} />
          ) : mode === "g01" ? (
            <G01
              request={request}
              defaultMine={user.roles.some((r) =>
                ["technician", "approver"].includes(r),
              )}
            />
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
            <span>Môi trường demo · Dữ liệu giả lập</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
