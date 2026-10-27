// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { useEffect, useRef, useState } from "react";
import { AccessLog } from "./Safety.js";
import { Evidence } from "./Evidence.js";
import {
  caseLabels,
  caseViews,
  navigate,
  useWorkspaceLocation,
} from "./workspace-state.js";

type Person = { id: string; name: string; roles: string[] };
type Catalog = {
  rooms: { id: string; name: string }[];
  assets: { id: string; room_id: string; name: string }[];
  people: Person[];
  teams: { id: string; name: string }[];
  canCreate: boolean;
  canAudit?: boolean;
};
type Case = {
  id: string;
  code: string;
  title: string;
  description: string;
  roomId: string;
  assetId: string | null;
  status: string;
  syncStatus: string;
  revision: number;
  reporterId: string;
  coordinatorId: string;
  technicianId: string | null;
  teamId: string | null;
  approverId: string | null;
  dueAt: string | null;
  createdAt: string;
  closedAt: string | null;
  decisionBy: string | null;
  measures: string | null;
  result: string | null;
  actions: string[];
  evidencePolicy: { submit: { minClean: number; mimeTypes?: string[] } };
  packageVersion: string;
  schemaVersion: string;
  workflowVersion: string;
  processId: string | null;
  definitionId: string;
  taskId: string | null;
  taskKey: string | null;
};
type Event = {
  id: string;
  actorName: string;
  actorId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
  details: Record<string, string | null>;
  revision: number;
};
type Detail = { item: Case; timeline: Event[] };
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
export const statusNames: Record<string, string> = {
  verification: "Chờ xác minh",
  supplement: "Chờ bổ sung",
  assignment: "Chờ giao việc",
  assigned: "Chờ nhận việc",
  in_progress: "Đang xử lý",
  acceptance: "Chờ nghiệm thu",
  closed: "Đã đóng",
};
const actionNames: Record<string, string> = {
  confirm: "Xác minh cảnh báo",
  dismiss: "Đóng sau xác minh",
  resolve: "Hoàn tất ứng phó và đóng",
  created: "Báo sự cố",
  accept: "Tiếp nhận",
  return_info: "Yêu cầu bổ sung",
  resubmit: "Bổ sung và gửi lại",
  assign: "Giao việc",
  receive: "Nhận việc",
  save_work: "Lưu kết quả xử lý",
  submit: "Gửi nghiệm thu",
  return_work: "Trả lại xử lý",
  approve: "Phê duyệt và đóng",
  action_requested: "Đã gửi yêu cầu chuyển bước",
  workflow_started: "Đã khởi tạo quy trình",
  evidence_uploaded: "Đã tải bằng chứng",
  evidence_scanned: "Đã kiểm tra bằng chứng",
};
const date = (v: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(v));
const initial = {
  title: "",
  roomId: "A101",
  assetId: "A101-PROJECTOR",
  description: "",
};

export function G01({
  request,
  prefix = "g01",
  initialCase = null,
  defaultMine = false,
}: {
  request: Request;
  prefix?: string;
  initialCase?: string | null;
  defaultMine?: boolean;
}) {
  const basePath = `/api/${prefix}`;
  const labels =
    caseLabels[prefix as keyof typeof caseLabels] || caseLabels.g01;
  const route = useWorkspaceLocation();
  const selected = route.view === caseViews[prefix] ? route.caseId : null;
  useEffect(() => {
    if (initialCase) chooseCase(initialCase);
  }, [initialCase]);
  const [bucket, setBucket] = useState("all"),
    [evidenceReady, setEvidenceReady] = useState(false);
  const [summary, setSummary] = useState<{
    open: number;
    overdue: number;
    completed: number;
    total: number;
  } | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [items, setItems] = useState<Case[]>([]),
    [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [status, setStatus] = useState(""),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [mine, setMine] = useState(defaultMine),
    [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false),
    [form, setForm] = useState(initial),
    [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const generation = useRef(0),
    detailGeneration = useRef(0),
    previousSelection = useRef(selected);
  const listPanel = useRef<HTMLElement | null>(null),
    detailPanel = useRef<HTMLElement | null>(null),
    listHeading = useRef<HTMLHeadingElement | null>(null),
    detailHeading = useRef<HTMLHeadingElement | null>(null),
    scrollRequested = useRef(false);
  function showDetail() {
    detailHeading.current?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 1100px)").matches)
      detailPanel.current?.scrollIntoView({ block: "start" });
  }
  function chooseCase(id: string) {
    if (detail?.item.id === id) showDetail();
    else scrollRequested.current = true;
    navigate(caseViews[prefix]!, id);
  }
  useEffect(() => {
    if (scrollRequested.current && detail?.item.id === selected) {
      scrollRequested.current = false;
      showDetail();
    }
  }, [selected, detail?.item.id]);
  async function loadList() {
    const n = ++generation.current;
    const params = new URLSearchParams({
      page: String(page),
      mine: String(mine),
      bucket,
    });
    if (status) params.set("status", status);
    if (search) params.set("q", search);
    const [list, report] = await Promise.all([
      request<{ items: Case[]; total: number }>(`${basePath}/cases?${params}`),
      request<{
        open: number;
        overdue: number;
        completed: number;
        total: number;
      }>(`${basePath}/reports`),
    ]);
    if (n === generation.current) {
      setSummary(report);
      setItems(list.items);
      setTotal(list.total);
    }
  }
  async function loadDetail(id: string) {
    const n = ++detailGeneration.current;
    try {
      const data = await request<Detail>(`${basePath}/cases/${id}`);
      if (n === detailGeneration.current) {
        setDetail(data);
        setDetailError("");
      }
    } catch (e) {
      if (n === detailGeneration.current) setDetailError((e as Error).message);
      throw e;
    }
  }
  useEffect(() => {
    void request<Catalog>(`${basePath}/catalog`)
      .then(setCatalog)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setLoading(true);
    void loadList()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, search, mine, page, bucket]);
  useEffect(() => {
    setDetail(null);
    setDetailError("");
    setEvidenceReady(false);
    scrollRequested.current = !!selected;
    if (selected) void loadDetail(selected).catch(() => {});
    else if (previousSelection.current) listHeading.current?.focus({ preventScroll: true });
    previousSelection.current = selected;
    return () => {
      detailGeneration.current++;
    };
  }, [selected]);
  useEffect(() => {
    setEvidenceReady(false);
  }, [detail?.item.taskId]);
  useEffect(() => {
    if (!selected || !detail || detail.item.syncStatus === "ready") return;
    const timer = setInterval(() => {
      void loadDetail(selected)
        .then(() => loadList())
        .catch((e) => setError(e.message));
    }, 3000);
    return () => clearInterval(timer);
  }, [selected, detail?.item.syncStatus]);
  async function refresh() {
    setError("");
    setNotice("");
    try {
      await loadList();
      if (selected) await loadDetail(selected);
    } catch (e) {
      setError((e as Error).message);
      setDetail(null);
    }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await request<{ item: Case; message?: string }>(
        `${basePath}/cases`,
        {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({ ...form, assetId: form.assetId || null }),
        },
      );
      chooseCase(data.item.id);
      setKey(crypto.randomUUID());
      setForm(initial);
      setShowCreate(false);
      setNotice(
        data.message ||
          `Đã tạo hồ sơ ${data.item.code}. Điều phối sẽ xác minh sự cố.`,
      );
      await loadList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string, fields: Record<string, unknown> = {}) {
    if (!detail) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await request<{ item: Case; message?: string }>(
        `${basePath}/cases/${detail.item.id}/actions`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            revision: detail.item.revision,
            ...fields,
          }),
        },
      );
      setNotice(
        data.message ||
          `${actionNames[action]}. Hồ sơ ${data.item.code}: ${statusNames[data.item.status]}.`,
      );
      await loadDetail(data.item.id);
      await loadList();
    } catch (e) {
      setError((e as Error).message);
      await refresh();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const name = (id: string | null) =>
    catalog?.people.find((p) => p.id === id)?.name ||
    detail?.timeline.find((e) => e.actorId === id)?.actorName ||
    (id ? "Tài khoản đã thay đổi quyền" : "Chưa giao");
  const nextStep =
    detail &&
    (detail.item.syncStatus !== "ready"
      ? "Đã nhận yêu cầu. Hệ thống đang xác nhận chuyển bước; bạn không cần gửi lại."
      : detail.item.status === "closed"
        ? "Hồ sơ đã hoàn tất. Kết quả và lịch sử được giữ tại đây."
        : detail.item.actions.includes("assign")
          ? "Chọn người xử lý, người nghiệm thu và hạn hoàn thành."
          : detail.item.actions.includes("approve")
            ? "Kiểm tra kết quả và bằng chứng, sau đó nghiệm thu hoặc trả lại xử lý."
            : detail.item.actions.includes("resolve")
              ? "Ghi kết quả ứng phó, tải bằng chứng và nêu lý do trước khi đóng hồ sơ."
              : detail.item.actions.includes("submit")
              ? "Cập nhật kết quả, tải bằng chứng của lần xử lý này rồi gửi nghiệm thu."
              : detail.item.actions.includes("receive")
                ? "Nhận công việc để bắt đầu cập nhật kết quả xử lý."
                : detail.item.actions.includes("resubmit")
                  ? "Bổ sung thông tin theo yêu cầu trong lịch sử, sau đó gửi lại."
                  : detail.item.actions.length
                    ? "Kiểm tra nội dung và chọn cách xử lý phù hợp."
                    : `Đang chờ ${detail.item.status === "acceptance" ? name(detail.item.approverId) : ["assigned", "in_progress"].includes(detail.item.status) ? (detail.item.technicianId ? name(detail.item.technicianId) : catalog?.teams.find((t) => t.id === detail.item.teamId)?.name || "người được giao") : name(detail.item.coordinatorId)} thực hiện bước tiếp theo.`);
  return (
    <div className={`g01 ${selected ? "has-selection" : ""}`}>
      {summary && (
        <section className="report-summary" aria-label="Báo cáo hồ sơ">
          {(
            [
              ["all", "Tất cả", summary.total],
              ["open", "Đang mở", summary.open],
              ["overdue", "Quá hạn", summary.overdue],
              ["completed", "Hoàn thành", summary.completed],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className="report-count"
              aria-pressed={bucket === id}
              onClick={() => {
                setBucket(id);
                setStatus("");
                setMine(false);
                setSearch("");
                setQ("");
                setPage(1);
              }}
            >
              <span>{label}</span>
              <strong>{count}</strong>
            </button>
          ))}
        </section>
      )}
      <div className="g01-toolbar">
        <div>
          <h2>{labels.heading}</h2>
          <p className="intro">
            {prefix === "g03"
              ? "Theo dõi phản ánh an toàn trong phạm vi được cấp quyền."
              : prefix === "g02"
                ? "Xác minh cảnh báo, ghi biện pháp và theo dõi kết quả xử lý."
                : "Báo hỏng, phối hợp xử lý và nghiệm thu tại một nơi."}
          </p>
        </div>
        {catalog?.canCreate && (
          <button
            className="button primary"
            onClick={() => setShowCreate((v) => !v)}
            disabled={busy}
          >
            {showCreate ? "Đóng biểu mẫu" : labels.create}
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="message error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="message success">
          {notice}
        </div>
      )}
      {showCreate && catalog && (
        <section className="panel report-panel">
          <div className="section-heading">
            <div>
              <h2>{labels.form}</h2>
              <p className="intro">
                Mô tả điều bạn quan sát được để người phụ trách có đủ thông tin
                xử lý.
              </p>
            </div>
          </div>
          <form onSubmit={create}>
            <ReportFields
                noun={labels.noun}
              value={form}
              catalog={catalog}
              prefix="new"
              disabled={busy}
              change={(v) => {
                setForm(v);
                setKey(crypto.randomUUID());
              }}
            />
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "Đang gửi…" : labels.submit}
            </button>
          </form>
        </section>
      )}
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(q);
        }}
      >
        <label>
          Tìm hồ sơ
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Mã, tiêu đề hoặc mô tả"
            maxLength={160}
          />
        </label>
        <button className="button secondary" type="submit">
          Tìm kiếm
        </button>
        <label>
          Trạng thái
          <select
            aria-label="Trạng thái"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(statusNames).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="check-filter">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => {
              setMine(e.target.checked);
              setPage(1);
            }}
          />
          Công việc của tôi
        </label>
        <button
          className="button secondary"
          type="button"
          data-list-refresh
          disabled={busy || loading}
          onClick={() => void refresh()}
        >
          Làm mới hồ sơ
        </button>
      </form>
      <div className="work-grid g01-grid">
        <section className="panel" ref={listPanel}>
          <div className="section-heading">
            <h2 ref={listHeading} tabIndex={-1}>
              Danh sách hồ sơ <span className="muted-count">{total}</span>
            </h2>
            <small>{mine ? "Cần bạn thao tác" : "Theo quyền của bạn"}</small>
          </div>
          {loading ? (
            <p className="loading">Đang tải hồ sơ…</p>
          ) : items.length === 0 ? (
            <div className="empty">
              <h3>
                {mine
                  ? "Chưa có việc cần bạn thao tác"
                  : "Chưa có hồ sơ phù hợp"}
              </h3>
              <p>
                {catalog?.canCreate
                  ? "Báo sự cố mới hoặc điều chỉnh bộ lọc."
                  : "Công việc được giao sẽ xuất hiện tại đây."}
              </p>
            </div>
          ) : (
            <ul className="task-list">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    className={`task-row ${selected === c.id ? "selected" : ""}`}
                    aria-current={selected === c.id ? "true" : undefined}
                    onClick={() => chooseCase(c.id)}
                  >
                    <span className="task-copy">
                      <small>
                        {c.code} ·{" "}
                        {catalog?.rooms.find((r) => r.id === c.roomId)?.name}
                      </small>
                      <strong>{c.title}</strong>
                      <small>
                        {c.dueAt
                          ? `Hạn: ${date(c.dueAt)}`
                          : `Tạo: ${date(c.createdAt)}`}
                      </small>
                    </span>
                    <span
                      className={`status ${c.status === "closed" ? "completed" : c.syncStatus === "ready" ? c.status : "needs_reconciliation"}`}
                    >
                      {c.syncStatus === "ready"
                        ? statusNames[c.status]
                        : "Đang xác nhận"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {total > 25 && (
            <div className="pagination">
              <button
                className="button secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Trang trước
              </button>
              <span>
                Trang {page} / {Math.ceil(total / 25)}
              </span>
              <button
                className="button secondary"
                disabled={page * 25 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Trang sau
              </button>
            </div>
          )}
        </section>
        <section className="panel" ref={detailPanel}>
          <div className="section-heading">
            <h2>Chi tiết hồ sơ</h2>
            {selected && (<div className="detail-tools">
              <button type="button" className="text-button" disabled={busy || loading} onClick={() => void refresh()}>Làm mới hồ sơ</button>
              <button
                type="button"
                className="button secondary case-list-return"
                aria-label="Về danh sách hồ sơ"
                onClick={() => navigate(caseViews[prefix]!)}
              >
                Về danh sách
              </button>
            </div>)}
          </div>
          {!detail ? (
            <div className="detail-empty">
              <p>{detailError ? "Chưa mở được hồ sơ. Thử làm mới hoặc về danh sách để chọn hồ sơ khác." : selected
                ? "Đang tải chi tiết…"
                : "Chọn hồ sơ để xem bước tiếp theo và lịch sử."}</p>
              {detailError && <p role="alert">{detailError}</p>}
            </div>
          ) : (
            <div className="details case-detail">
              <span
                className={`status ${detail.item.status === "closed" ? "completed" : ""}`}
              >
                {statusNames[detail.item.status]}
              </span>
              <span className="case-code">{detail.item.code}</span>
              <h3 ref={detailHeading} tabIndex={-1}>
                {detail.item.title}
              </h3>
              <p className="case-description">{detail.item.description}</p>
              <div className="next-step">
                <div>
                  <span className="section-kicker">
                    {detail.item.actions.length &&
                    detail.item.syncStatus === "ready"
                      ? "Cần bạn thực hiện"
                      : "Tiến độ xử lý"}
                  </span>
                  <p>{nextStep}</p>
                </div>
                {!!detail.item.actions.length &&
                  detail.item.syncStatus === "ready" && (
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => {
                        const node = document.getElementById(
                          `case-actions-${prefix}`,
                        );
                        node?.focus({ preventScroll: true });
                        node?.scrollIntoView({
                          block: "start",
                          behavior: "auto",
                        });
                      }}
                    >
                      Đến bước xử lý <span aria-hidden="true">↓</span>
                    </button>
                  )}
              </div>
              <dl className="case-facts">
                <div>
                  <dt>Người báo</dt>
                  <dd>{name(detail.item.reporterId)}</dd>
                </div>
                <div>
                  <dt>Phòng / thiết bị</dt>
                  <dd>
                    {detail.item.roomId} /{" "}
                    {catalog?.assets.find((a) => a.id === detail.item.assetId)
                      ?.name || "Chưa xác định thiết bị"}
                  </dd>
                </div>
                <div>
                  <dt>Điều phối</dt>
                  <dd>{name(detail.item.coordinatorId)}</dd>
                </div>
                <div>
                  <dt>Người / nhóm xử lý</dt>
                  <dd>
                    {detail.item.technicianId
                      ? name(detail.item.technicianId)
                      : catalog?.teams.find((t) => t.id === detail.item.teamId)
                          ?.name || "Chưa giao"}
                  </dd>
                </div>
                <div>
                  <dt>Hạn hoàn thành</dt>
                  <dd
                    className={
                      detail.item.dueAt &&
                      new Date(detail.item.dueAt) < new Date() &&
                      detail.item.status !== "closed"
                        ? "overdue"
                        : ""
                    }
                  >
                    {detail.item.dueAt
                      ? date(detail.item.dueAt)
                      : "Chưa đặt hạn"}
                  </dd>
                </div>
                <div>
                  <dt>Nghiệm thu</dt>
                  <dd>{name(detail.item.approverId)}</dd>
                </div>
                <div>
                  <dt>Tạo lúc</dt>
                  <dd>{date(detail.item.createdAt)}</dd>
                </div>
              </dl>
              {detail.item.measures && (
                <div className="work-result">
                  <h4>Biện pháp xử lý</h4>
                  <p>{detail.item.measures}</p>
                  <h4>Kết quả</h4>
                  <p>{detail.item.result}</p>
                </div>
              )}
              <Evidence
                key={`evidence-${detail.item.id}`}
                request={request}
                caseId={detail.item.id}
                taskId={detail.item.taskId}
                prefix={prefix}
                policy={detail.item.evidencePolicy.submit}
                onReady={setEvidenceReady}
              />
              {detail.item.syncStatus !== "ready" ? (
                <p className="message error">
                  Yêu cầu đã được lưu. Hệ thống đang xác nhận kết quả và sẽ tự
                  mở lại thao tác khi sẵn sàng. Hãy giữ nguyên hồ sơ, không gửi
                  lại.
                </p>
              ) : (
                catalog && (
                  <Actions
                    key={`${detail.item.id}:${detail.item.revision}`}
                    item={detail.item}
                    catalog={catalog}
                    busy={busy}
                    act={act}
                    evidenceReady={evidenceReady}
                    prefix={prefix}
                  />
                )
              )}
              {detail.item.closedAt && (
                <p className="closure">
                  Đã đóng lúc {date(detail.item.closedAt)} · Quyết định bởi{" "}
                  {name(detail.item.decisionBy)}
                </p>
              )}
              {catalog?.canAudit && (
                <AccessLog
                  key={`access-log-${detail.item.id}`}
                  request={request}
                  caseId={detail.item.id}
                />
              )}
              <h3 className="timeline-title">Lịch sử xử lý</h3>
              <ol className="timeline">
                {detail.timeline
                  .filter(
                    (e) =>
                      e.action !== "action_requested" ||
                      (detail.item.syncStatus !== "ready" &&
                        e.revision === detail.item.revision),
                  )
                  .map((e) => (
                    <li key={e.id}>
                      <strong>{actionNames[e.action] || e.action}</strong>
                      <small>
                        {e.actorName} · {date(e.createdAt)}
                      </small>
                      {e.action !== "action_requested" && (
                        <span>
                          {e.fromStatus
                            ? `${statusNames[e.fromStatus]} → `
                            : ""}
                          {statusNames[e.toStatus]}
                        </span>
                      )}
                      {Object.entries(e.details)
                        .filter(
                          ([k, v]) =>
                            v &&
                            [
                              "reason",
                              "description",
                              "measures",
                              "result",
                              "dueAt",
                              "technicianId",
                              "teamId",
                              "approverId",
                            ].includes(k),
                        )
                        .map(([k, v]) => (
                          <p key={k}>
                            <b>
                              {
                                {
                                  reason: "Lý do",
                                  description: "Mô tả",
                                  measures: "Biện pháp",
                                  result: "Kết quả",
                                  dueAt: "Hạn hoàn thành",
                                  technicianId: "Người xử lý",
                                  teamId: "Nhóm xử lý",
                                  approverId: "Người nghiệm thu",
                                }[k]
                              }
                              :
                            </b>{" "}
                            {k === "dueAt"
                              ? date(v!)
                              : k.endsWith("Id")
                                ? k === "teamId"
                                  ? catalog?.teams.find((t) => t.id === v)
                                      ?.name || v
                                  : name(v)
                                : v}
                          </p>
                        ))}
                    </li>
                  ))}
              </ol>
              <details className="technical-details">
                <summary>Thông tin phiên bản và liên kết quy trình</summary>
                <dl>
                  <div>
                    <dt>Gói / schema / workflow</dt>
                    <dd>
                      {detail.item.packageVersion} / {detail.item.schemaVersion}{" "}
                      / {detail.item.workflowVersion}
                    </dd>
                  </div>
                  <div>
                    <dt>Process / definition / task</dt>
                    <dd className="mono">
                      {detail.item.processId || "Chờ đồng bộ"}
                      <br />
                      {detail.item.definitionId}
                      <br />
                      {detail.item.taskId || "Đã kết thúc"} (
                      {detail.item.taskKey || "end"})
                    </dd>
                  </div>
                  <div>
                    <dt>Revision</dt>
                    <dd>{detail.item.revision}</dd>
                  </div>
                </dl>
              </details>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
function ReportFields({
  value,
  catalog,
  prefix,
  change,
  disabled,
  noun = "sự cố",
}: {
  value: typeof initial;
  catalog: Catalog;
  prefix: string;
  change: (v: typeof initial) => void;
  disabled: boolean;
  noun?: string;
}) {
  return (
    <fieldset disabled={disabled} className="report-fields">
      <label htmlFor={`${prefix}-title`}>Tiêu đề {noun}</label>
      <input
        id={`${prefix}-title`}
        placeholder="Mô tả ngắn điều cần xử lý"
        required
        minLength={5}
        maxLength={160}
        value={value.title}
        onChange={(e) => change({ ...value, title: e.target.value })}
      />
      <div className="field-pair">
        <label>
          Phòng
          <select
            aria-label="Phòng"
            required
            value={value.roomId}
            onChange={(e) =>
              change({ ...value, roomId: e.target.value, assetId: "" })
            }
          >
            {catalog.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Thiết bị
          <select
            aria-label="Thiết bị"
            value={value.assetId}
            onChange={(e) => change({ ...value, assetId: e.target.value })}
          >
            <option value="">Chưa xác định / sự cố tại phòng</option>
            {catalog.assets
              .filter((a) => a.room_id === value.roomId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label htmlFor={`${prefix}-description`}>Mô tả {noun}</label>
      <textarea
        id={`${prefix}-description`}
        placeholder="Hiện tượng, thời điểm bắt đầu và ảnh hưởng bạn quan sát được…"
        required
        minLength={10}
        maxLength={4000}
        rows={4}
        value={value.description}
        onChange={(e) => change({ ...value, description: e.target.value })}
      />
    </fieldset>
  );
}
function Actions({
  evidenceReady,
  prefix,
  item,
  catalog,
  busy,
  act,
}: {
  item: Case;
  catalog: Catalog;
  busy: boolean;
  evidenceReady: boolean;
  prefix: string;
  act: (action: string, fields?: Record<string, unknown>) => Promise<void>;
}) {
  const [reason, setReason] = useState(""),
    [assignment, setAssignment] = useState(""),
    [approver, setApprover] = useState(""),
    [due, setDue] = useState("");
  const [measures, setMeasures] = useState(item.measures || ""),
    [result, setResult] = useState(item.result || "");
  const [form, setForm] = useState({
    ...initial,
    title: item.title,
    roomId: item.roomId,
    assetId: item.assetId || "",
    description: item.description,
  });
  const has = (a: string) => item.actions.includes(a);
  if (!item.actions.length)
    return item.status === "closed" ? null : (
      <p className="hint">
        Hồ sơ đang chờ người có trách nhiệm tại bước “{statusNames[item.status]}
        ”.
      </p>
    );
  return (
    <div className="action-panel" aria-label="Thao tác hồ sơ">
      <h3 id={`case-actions-${prefix}`} tabIndex={-1}>
        Bước tiếp theo
      </h3>
      {has("confirm") && (
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void act("confirm")}
        >
          Xác nhận cần xử lý
        </button>
      )}
      {has("dismiss") && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act("dismiss", { reason });
          }}
        >
          <label>
            Lý do đóng sau xác minh
            <textarea
              aria-label="Lý do đóng sau xác minh"
              required
              minLength={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button className="button secondary" disabled={busy}>
            Đóng sau xác minh
          </button>
        </form>
      )}
      {has("accept") && (
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void act("accept")}
        >
          {prefix === "g03" ? "Tiếp nhận phản ánh" : "Tiếp nhận sự cố"}
        </button>
      )}
      {(has("return_info") || has("return_work")) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(has("return_info") ? "return_info" : "return_work", {
              reason,
            });
          }}
        >
          <label>
            Lý do trả lại
            <textarea
              aria-label="Lý do trả lại"
              required
              minLength={5}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            />
          </label>
          <button className="button secondary" disabled={busy}>
            {has("return_info") ? "Trả bổ sung" : "Trả lại xử lý"}
          </button>
        </form>
      )}
      {has("resubmit") && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act("resubmit", { ...form, assetId: form.assetId || null });
          }}
        >
          <ReportFields
            noun={caseLabels[prefix as keyof typeof caseLabels]?.noun}
            value={form}
            change={setForm}
            catalog={catalog}
            prefix="supplement"
            disabled={busy}
          />
          <button className="button primary" disabled={busy}>
            Bổ sung và gửi lại
          </button>
        </form>
      )}
      {has("assign") && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const [kind, id] = assignment.split(":");
            void act("assign", {
              technicianId: kind === "person" ? id : null,
              teamId: kind === "team" ? id : null,
              approverId: approver,
              dueAt: new Date(due).toISOString(),
            });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Người hoặc nhóm xử lý
              <select
                aria-label="Người hoặc nhóm xử lý"
                required
                value={assignment}
                onChange={(e) => setAssignment(e.target.value)}
              >
                <option value="">Chọn người hoặc nhóm</option>
                <optgroup label="Kỹ thuật viên">
                  {catalog.people
                    .filter((p) => p.roles.includes("technician"))
                    .map((p) => (
                      <option key={p.id} value={`person:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Nhóm">
                  {catalog.teams.map((t) => (
                    <option key={t.id} value={`team:${t.id}`}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>
              Người nghiệm thu
              <select
                aria-label="Người nghiệm thu"
                required
                value={approver}
                onChange={(e) => setApprover(e.target.value)}
              >
                <option value="">Chọn người nghiệm thu</option>
                {catalog.people
                  .filter((p) => p.roles.includes("approver"))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Hạn hoàn thành
              <input
                aria-label="Hạn hoàn thành"
                type="datetime-local"
                required
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
          </fieldset>
          <button className="button primary" disabled={busy}>
            Giao xử lý
          </button>
        </form>
      )}
      {has("receive") && (
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void act("receive")}
        >
          Nhận xử lý
        </button>
      )}
      {(has("submit") || has("resolve")) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const action =
              (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ||
              "submit";
            void act(action, {
              measures,
              result,
              ...(action === "resolve" ? { reason } : {}),
            });
          }}
        >
          <label>
            Biện pháp xử lý
            <textarea
              aria-label="Biện pháp xử lý"
              required
              minLength={5}
              maxLength={4000}
              value={measures}
              onChange={(e) => setMeasures(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Kết quả xử lý
            <textarea
              aria-label="Kết quả xử lý"
              required
              minLength={5}
              maxLength={4000}
              value={result}
              onChange={(e) => setResult(e.target.value)}
              disabled={busy}
            />
          </label>
          {has("resolve") && (
            <label>
              Lý do đóng hồ sơ
              <textarea
                aria-label="Lý do đóng hồ sơ"
                value={reason}
                minLength={5}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          <div className="action-buttons">
            <button
              className="button secondary"
              type="submit"
              value="save_work"
              disabled={busy}
            >
              Lưu kết quả
            </button>
            <button
              className="button primary"
              type="submit"
              value={has("resolve") ? "resolve" : "submit"}
              disabled={busy || !evidenceReady}
            >
              {has("resolve") ? "Hoàn tất ứng phó và đóng" : "Gửi nghiệm thu"}
            </button>
            {!evidenceReady && (
              <p>
                Cần tải ít nhất một bằng chứng cho lần xử lý này và đợi quét
                sạch để gửi nghiệm thu.
              </p>
            )}
          </div>
        </form>
      )}
      {has("approve") && (
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void act("approve")}
        >
          Phê duyệt và đóng hồ sơ
        </button>
      )}
    </div>
  );
}
