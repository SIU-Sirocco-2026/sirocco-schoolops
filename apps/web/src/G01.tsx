import { useEffect, useRef, useState } from "react";

type Person = { id: string; name: string; roles: string[] };
type Catalog = {
  rooms: { id: string; name: string }[];
  assets: { id: string; room_id: string; name: string }[];
  people: Person[];
  teams: { id: string; name: string }[];
  canCreate: boolean;
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

export function G01({ request }: { request: Request }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [items, setItems] = useState<Case[]>([]),
    [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<Detail | null>(null);
  const [status, setStatus] = useState(""),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [mine, setMine] = useState(false),
    [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false),
    [form, setForm] = useState(initial),
    [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const generation = useRef(0),
    detailGeneration = useRef(0);
  async function loadList() {
    const n = ++generation.current;
    const params = new URLSearchParams({
      page: String(page),
      mine: String(mine),
    });
    if (status) params.set("status", status);
    if (search) params.set("q", search);
    const list = await request<{ items: Case[]; total: number }>(
      `/api/g01/cases?${params}`,
    );
    if (n === generation.current) {
      setItems(list.items);
      setTotal(list.total);
    }
  }
  async function loadDetail(id: string) {
    const n = ++detailGeneration.current;
    const data = await request<Detail>(`/api/g01/cases/${id}`);
    if (n === detailGeneration.current) setDetail(data);
  }
  useEffect(() => {
    void request<Catalog>("/api/g01/catalog")
      .then(setCatalog)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setLoading(true);
    void loadList()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, search, mine, page]);
  useEffect(() => {
    setDetail(null);
    if (selected) void loadDetail(selected).catch((e) => setError(e.message));
    return () => {
      detailGeneration.current++;
    };
  }, [selected]);
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
        "/api/g01/cases",
        {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({ ...form, assetId: form.assetId || null }),
        },
      );
      setSelected(data.item.id);
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
        `/api/g01/cases/${detail.item.id}/actions`,
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
  return (
    <div className="g01">
      <div className="g01-toolbar">
        <div>
          <h2>Hồ sơ G01</h2>
          <p className="intro">
            Báo hỏng, phối hợp xử lý và nghiệm thu tại một nơi.
          </p>
        </div>
        {catalog?.canCreate && (
          <button
            className="button primary"
            onClick={() => setShowCreate((v) => !v)}
            disabled={busy}
          >
            {showCreate ? "Ẩn biểu mẫu" : "Báo sự cố mới"}
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
          <h2>Báo sự cố cơ sở vật chất</h2>
          <form onSubmit={create}>
            <ReportFields
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
              {busy ? "Đang gửi…" : "Gửi báo sự cố"}
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
          disabled={busy || loading}
          onClick={() => void refresh()}
        >
          Làm mới hồ sơ
        </button>
      </form>
      <div className="work-grid g01-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>
              Danh sách hồ sơ <span className="muted-count">{total}</span>
            </h2>
            <small>{mine ? "Cần bạn thao tác" : "Theo quyền của bạn"}</small>
          </div>
          {loading ? (
            <p className="loading">Đang tải hồ sơ…</p>
          ) : items.length === 0 ? (
            <div className="empty">
              <h3>Chưa có hồ sơ phù hợp</h3>
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
                    onClick={() => setSelected(c.id)}
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
                        : "Chờ đối soát"}
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
        <section className="panel">
          <div className="section-heading">
            <h2>Chi tiết hồ sơ</h2>
          </div>
          {!detail ? (
            <p className="detail-empty">
              {selected
                ? "Đang tải chi tiết…"
                : "Chọn hồ sơ để xem bước tiếp theo và lịch sử."}
            </p>
          ) : (
            <div className="details case-detail">
              <span
                className={`status ${detail.item.status === "closed" ? "completed" : ""}`}
              >
                {statusNames[detail.item.status]}
              </span>
              <span className="case-code">{detail.item.code}</span>
              <h3>{detail.item.title}</h3>
              <p className="case-description">{detail.item.description}</p>
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
              {detail.item.syncStatus !== "ready" ? (
                <p className="message error">
                  Kết quả đồng bộ chưa được xác nhận. Hồ sơ đã được giữ lại để
                  đối soát; hiện chưa thể chuyển bước.
                </p>
              ) : (
                catalog && (
                  <Actions
                    key={`${detail.item.id}:${detail.item.revision}`}
                    item={detail.item}
                    catalog={catalog}
                    busy={busy}
                    act={act}
                  />
                )
              )}
              {detail.item.closedAt && (
                <p className="closure">
                  Đã đóng lúc {date(detail.item.closedAt)} · Quyết định bởi{" "}
                  {name(detail.item.decisionBy)}
                </p>
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
}: {
  value: typeof initial;
  catalog: Catalog;
  prefix: string;
  change: (v: typeof initial) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="report-fields">
      <label htmlFor={`${prefix}-title`}>Tiêu đề sự cố</label>
      <input
        id={`${prefix}-title`}
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
      <label htmlFor={`${prefix}-description`}>Mô tả sự cố</label>
      <textarea
        id={`${prefix}-description`}
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
  item,
  catalog,
  busy,
  act,
}: {
  item: Case;
  catalog: Catalog;
  busy: boolean;
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
    <div className="action-panel">
      <h3>Bước tiếp theo</h3>
      {has("accept") && (
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void act("accept")}
        >
          Tiếp nhận sự cố
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
      {has("submit") && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const action =
              (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ||
              "submit";
            void act(action, { measures, result });
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
              value="submit"
              disabled={busy}
            >
              Gửi nghiệm thu
            </button>
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
