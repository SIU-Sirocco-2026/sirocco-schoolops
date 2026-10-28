// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { useEffect, useRef, useState } from "react";
import {
  IconUpload,
  IconPhoto,
  IconFileText,
  IconX,
  IconEye,
  IconDownload,
  IconRefresh,
  IconShieldCheck,
  IconClipboard,
} from "@tabler/icons-react";
import "./evidence.css";
import { ApiError } from "./http.js";
import { filePolicy } from "./file-policy.js";
import { useUnsavedChanges } from "./unsaved.js";
import { caseViews } from "./workspace-state.js";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type FileEvidence = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  checksum: string;
  step: string;
  taskId: string;
  uploadedBy: string;
  createdAt: string;
  scanStatus: string;
  scanVersion: string | null;
  scanMessage: string | null;
  nextAttemptAt: string;
};
const states: Record<string, string> = {
  pending: "Chờ quét",
  clean: "Đã quét sạch",
  rejected: "Bị từ chối",
  error: "Chưa quét được · sẽ tự thử lại",
};
function fileSize(size: number) {
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.ceil(size / 1024))} KB`;
}
function isImage(file: { type: string; name: string }) {
  return (
    ["image/png", "image/jpeg"].includes(file.type) ||
    (!file.type && /\.(png|jpe?g)$/i.test(file.name))
  );
}
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function EvidenceImage({
  request,
  path,
  filename,
  blocked,
  open,
}: {
  request: Request;
  path: string;
  filename: string;
  blocked: boolean;
  open: (blob: Blob, trigger: HTMLButtonElement) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [media, setMedia] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setMedia(null);
    if (!visible || blocked) return;
    const controller = new AbortController();
    let active = true,
      objectUrl: string | undefined;
    setFailed(false);
    void request<Blob>(path, { signal: controller.signal })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setMedia({ blob, url: objectUrl });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [request, path, visible, blocked, attempt]);
  return (
    <div className="evidence-photo" ref={container}>
      <button
        type="button"
        className="evidence-photo-open"
        aria-label={`Phóng to ảnh đã tải ${filename}`}
        disabled={!media || failed || blocked}
        onClick={(e) => {
          if (media) open(media.blob, e.currentTarget);
        }}
      >
        {media && !failed ? (
          <img
            src={media.url}
            alt={`Bằng chứng: ${filename}`}
            onError={() => setFailed(true)}
          />
        ) : (
          <IconPhoto size={38} aria-hidden="true" />
        )}
        <span>
          <IconEye size={16} aria-hidden="true" />
          {failed ? "Chưa đọc được ảnh" : media ? "Xem lớn" : "Đang tải ảnh…"}
        </span>
      </button>
      {failed && (
        <button
          className="button secondary thumbnail-retry"
          type="button"
          aria-label={`Tải lại ảnh ${filename}`}
          onClick={() => setAttempt((n) => n + 1)}
        >
          <IconRefresh size={16} aria-hidden="true" />
          Thử lại
        </button>
      )}
    </div>
  );
}
function ImageViewer({
  blob,
  name,
  close,
}: {
  blob: Blob;
  name: string;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    dialog.current?.showModal();
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return (
    <dialog
      ref={dialog}
      className="image-viewer"
      aria-label={`Xem ảnh: ${name}`}
      onClose={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
    >
      <div className="image-viewer-content">
        <div className="image-viewer-heading">
          <strong>{name}</strong>
          <button
            autoFocus
            type="button"
            className="button secondary"
            aria-label="Đóng xem ảnh"
            onClick={() => dialog.current?.close()}
          >
            <IconX size={18} aria-hidden="true" />
            Đóng
          </button>
        </div>
        {failed ? (
          <p role="alert">
            Không đọc được ảnh này. Bạn có thể tải xuống để kiểm tra tệp.
          </p>
        ) : (
          url && (
            <img
              src={url}
              alt={`Xem trước ${name}`}
              onError={() => setFailed(true)}
            />
          )
        )}
        <div className="image-viewer-footer">
          <span>
            <kbd>Esc</kbd> Đóng ảnh
          </span>
          <button
            type="button"
            className="button secondary"
            onClick={() => saveBlob(blob, name)}
          >
            <IconDownload size={17} aria-hidden="true" />
            Tải ảnh xuống
          </button>
        </div>
      </div>
    </dialog>
  );
}
export function Evidence({
  request,
  caseId,
  taskId,
  onReady,
  policy,
  prefix = "g01",
  disabled = false,
}: {
  prefix?: string;
  disabled?: boolean;
  request: Request;
  caseId: string;
  taskId: string | null;
  onReady: (ready: boolean) => void;
  policy: { minClean: number; mimeTypes?: string[] };
}) {
  const [files, setFiles] = useState<FileEvidence[]>([]),
    [canUpload, setCanUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [readError, setReadError] = useState(""),
    [notice, setNotice] = useState(""),
    [loaded, setLoaded] = useState(false),
    [reading, setReading] = useState(false);
  const key = useRef(crypto.randomUUID()),
    input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true),
    uploading = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [localPreview, setLocalPreview] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [viewer, setViewer] = useState<{
    blob: Blob;
    name: string;
    trigger: HTMLButtonElement;
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const previewRequest = useRef<AbortController | null>(null);
  const uploadSaved = useUnsavedChanges(!!file, {
    view: caseViews[prefix]!,
    caseId,
  });
  const mimeTypesKey = JSON.stringify(policy.mimeTypes);
  const allowed = filePolicy(policy.mimeTypes);
  const validationError = file ? allowed.validate(file) : null;
  useEffect(() => {
    setPreviewFailed(false);
    if (!file || validationError || !isImage(file)) {
      setLocalPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, validationError]);
  useEffect(() => () => previewRequest.current?.abort(), []);
  function selectFile(next: File | null) {
    if (busy || disabled) return;
    setFile(next);
    setError("");
    setNotice("");
    key.current = crypto.randomUUID();
    // Selection lives in React, so choosing the same file after a drop must still fire change.
    if (input.current) input.current.value = "";
  }
  async function preview(f: FileEvidence, trigger: HTMLButtonElement) {
    previewRequest.current?.abort();
    const controller = new AbortController();
    previewRequest.current = controller;
    setPreviewBusy(f.id);
    setError("");
    try {
      const blob = await request<Blob>(
        `/api/${prefix}/cases/${caseId}/evidence/${f.id}/download`,
        { signal: controller.signal },
      );
      if (mounted.current && !controller.signal.aborted)
        setViewer({ blob, name: f.filename, trigger });
    } catch (e) {
      if (mounted.current && !controller.signal.aborted)
        setError(`Chưa mở được ảnh. ${(e as Error).message}`);
    } finally {
      if (mounted.current && previewRequest.current === controller)
        setPreviewBusy(null);
    }
  }
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      let delay = 30000;
      setReading(true);
      try {
        const data = await request<{
          items: FileEvidence[];
          canUpload: boolean;
        }>(`/api/${prefix}/cases/${caseId}/evidence`);
        if (!active) return;
        setFiles(data.items);
        setCanUpload(data.canUpload);
        setLoaded(true);
        setReadError("");
        onReady(
          data.items.filter(
            (f) =>
              f.taskId === taskId &&
              f.step === "repair" &&
              f.scanStatus === "clean" &&
              (!policy.mimeTypes || policy.mimeTypes.includes(f.mime)),
          ).length >= policy.minClean,
        );
        if (data.items.some((f) => ["pending", "error"].includes(f.scanStatus)))
          delay = 4000;
      } catch (e) {
        if (active) {
          setFiles([]);
          setCanUpload(false);
          onReady(false);
          setReadError(
            `Chưa làm mới được danh sách bằng chứng. ${(e as Error).message}`,
          );
          if (e instanceof ApiError && [401, 403, 404].includes(e.status))
            return;
          delay =
            e instanceof ApiError && e.status === 429 ? e.retryAfterMs : 10000;
        }
      } finally {
        if (active) setReading(false);
      }
      if (active) timer = setTimeout(() => void poll(), delay);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [caseId, taskId, prefix, refreshIndex, policy.minClean, mimeTypesKey]);
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || validationError || uploading.current || disabled) return;
    if (!taskId) {
      setError(
        "Chưa xác định được vòng xử lý. Làm mới hồ sơ trước khi tải tệp.",
      );
      return;
    }
    uploading.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const bytes = await file.arrayBuffer();
      if (!mounted.current) return;
      await request(`/api/${prefix}/cases/${caseId}/evidence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "Idempotency-Key": key.current,
          "X-Task-Id": taskId,
        },
        body: bytes,
      });
      if (!mounted.current) return;
      uploadSaved();
      key.current = crypto.randomUUID();
      setNotice(
        `Đã nhận tệp ${file.name}. Hệ thống sẽ tự cập nhật kết quả kiểm tra; bạn không cần tải lại.`,
      );
      setFile(null);
      if (input.current) input.current.value = "";
      setRefreshIndex((n) => n + 1);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      uploading.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function download(f: FileEvidence) {
    if (downloadBusy) return;
    setDownloadBusy(f.id);
    setError("");
    try {
      const blob = await request<Blob>(
        `/api/${prefix}/cases/${caseId}/evidence/${f.id}/download`,
      );
      if (!mounted.current) return;
      saveBlob(blob, f.filename);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setDownloadBusy(null);
    }
  }
  return (
    <section className="evidence-section" aria-label="Bằng chứng hồ sơ">
      <div className="evidence-heading">
        <h3>
          Bằng chứng <span className="evidence-count">{files.length}</span>
        </h3>
        <button
          type="button"
          className="button secondary evidence-refresh"
          disabled={busy || reading || disabled}
          onClick={() => setRefreshIndex((n) => n + 1)}
        >
          <IconRefresh size={16} aria-hidden="true" />
          {reading ? "Đang làm mới bằng chứng…" : "Làm mới bằng chứng"}
        </button>
      </div>
      <details className="evidence-help">
        <summary>
          <IconShieldCheck size={16} aria-hidden="true" />
          Quy tắc bằng chứng
        </summary>
        <p className="section-help">
          Mỗi lần hoàn tất xử lý cần bằng chứng của chính lần đó. Tệp được kiểm
          tra trước khi sử dụng.
        </p>
      </details>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="message success">
          {notice}
        </p>
      )}
      {readError && (
        <p role="alert" className="message error">
          {readError}
        </p>
      )}
      {canUpload && (
        <form
          className={`upload-form ${dragging ? "is-dragging" : ""}`}
          tabIndex={0}
          aria-label="Tải tệp bằng chứng"
          aria-busy={busy}
          onSubmit={(e) => void upload(e)}
          onPaste={(e) => {
            const pasted = e.clipboardData.files;
            if (!pasted.length) return;
            e.preventDefault();
            if (busy || disabled) return;
            if (pasted.length !== 1) {
              setError("Hãy chọn từng tệp để xem trước và tải lên.");
              return;
            }
            selectFile(pasted[0]!);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy && !disabled && e.dataTransfer.types.includes("Files"))
              setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null))
              setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy || disabled) return;
            if (e.dataTransfer.files.length !== 1) {
              setError("Hãy chọn từng tệp để xem trước và tải lên.");
              return;
            }
            selectFile(e.dataTransfer.files[0]!);
          }}
        >
          <label className="visually-hidden" htmlFor={`evidence-${caseId}`}>
            Ảnh hoặc tài liệu bằng chứng (tối đa 10 MB)
          </label>
          <div className="file-picker">
            <input
              className="file-input"
              tabIndex={-1}
              ref={input}
              id={`evidence-${caseId}`}
              type="file"
              accept={allowed.accept}
              aria-describedby={`evidence-help-${caseId}${validationError ? ` evidence-error-${caseId}` : ""}`}
              aria-invalid={!!validationError || undefined}
              disabled={busy || disabled}
              onChange={(e) => {
                selectFile(e.target.files?.[0] || null);
              }}
            />
            <IconUpload
              size={40}
              className="upload-symbol"
              aria-hidden="true"
            />
            <div className="file-picker-copy">
              <strong>
                {dragging
                  ? "Thả để chọn tệp"
                  : file
                    ? "Thay tệp khác"
                    : "Thả ảnh vào đây"}
              </strong>
              <span className="file-name visually-hidden" aria-live="polite">
                {file?.name || "Chưa chọn tệp"}
              </span>
            </div>
            <button
              type="button"
              className="button secondary file-picker-button"
              ref={picker}
              disabled={busy || disabled}
              onClick={() => input.current?.click()}
            >
              {file ? "Đổi tệp" : "Chọn tệp"}
            </button>
          </div>
          <p className="field-help" id={`evidence-help-${caseId}`}>
            {allowed.label} · 10 MB{" "}
            <span className="paste-hint">
              <IconClipboard size={14} aria-hidden="true" /> <kbd>Ctrl</kbd>+
              <kbd>V</kbd> dán ảnh
            </span>
          </p>
          {file && (
            <div className="selected-evidence">
              {localPreview && !previewFailed ? (
                <button
                  type="button"
                  className="selected-image"
                  aria-label={`Phóng to ảnh ${file.name}`}
                  onClick={(e) =>
                    setViewer({
                      blob: file,
                      name: file.name,
                      trigger: e.currentTarget,
                    })
                  }
                >
                  <img
                    src={localPreview}
                    alt={`Ảnh đã chọn: ${file.name}`}
                    onError={() => setPreviewFailed(true)}
                  />
                  <span>
                    <IconEye size={16} aria-hidden="true" />
                    Xem lớn
                  </span>
                </button>
              ) : (
                <div className="selected-document">
                  <IconFileText size={32} aria-hidden="true" />
                  <span>
                    {previewFailed
                      ? "Không đọc được ảnh xem trước"
                      : "Tài liệu đính kèm"}
                  </span>
                </div>
              )}
              <div className="selected-file-info">
                <strong>{file.name}</strong>
                <span>{fileSize(file.size)}</span>
                <small>Chưa tải lên hồ sơ</small>
              </div>
              <button
                type="button"
                className="button secondary remove-selected"
                disabled={busy || disabled}
                onClick={() => {
                  selectFile(null);
                  picker.current?.focus();
                }}
              >
                <IconX size={16} aria-hidden="true" />
                Bỏ tệp
              </button>
            </div>
          )}
          {validationError && (
            <p
              className="field-error"
              role="alert"
              id={`evidence-error-${caseId}`}
            >
              {validationError}
            </p>
          )}
          <button
            className="button primary upload-submit"
            disabled={busy || disabled || !file || !!validationError}
          >
            <IconUpload size={17} aria-hidden="true" />
            {busy ? "Đang tải tệp…" : "Tải bằng chứng"}
          </button>
          {busy && (
            <p className="upload-status" role="status">
              Đang gửi tệp lên hồ sơ. Vui lòng chờ…
            </p>
          )}
        </form>
      )}
      {!loaded && !readError && <p>Đang tải bằng chứng…</p>}
      {loaded && !readError && !files.length && !canUpload && (
        <p className="evidence-empty">
          <IconPhoto size={30} aria-hidden="true" /> Chưa có bằng chứng
        </p>
      )}
      {files.some(
        (f) =>
          f.taskId === taskId && ["pending", "error"].includes(f.scanStatus),
      ) && (
        <p className="scan-progress" role="status">
          <IconShieldCheck size={17} aria-hidden="true" />
          Đang kiểm tra tệp…
        </p>
      )}
      <ul className="evidence-list">
        {files.map((f) => (
          <li key={f.id} className="evidence-gallery-card">
            {f.scanStatus === "clean" &&
            ["image/png", "image/jpeg"].includes(f.mime) ? (
              <EvidenceImage
                request={request}
                path={`/api/${prefix}/cases/${caseId}/evidence/${f.id}/download`}
                filename={f.filename}
                blocked={disabled}
                open={(blob, trigger) =>
                  setViewer({ blob, name: f.filename, trigger })
                }
              />
            ) : (
              <div className="evidence-document-cover" aria-hidden="true">
                {["image/png", "image/jpeg"].includes(f.mime) ? (
                  <IconPhoto size={42} />
                ) : (
                  <IconFileText size={42} />
                )}
                <span>{f.filename.split(".").pop()?.toUpperCase()}</span>
              </div>
            )}
            <div className="evidence-card-body">
              <div className="evidence-file-heading">
                <div className="evidence-file-copy">
                  <strong title={f.filename}>{f.filename}</strong>
                  <small>{fileSize(f.size)}</small>
                </div>
                <span className={`scan-state scan-${f.scanStatus}`}>
                  {states[f.scanStatus]}
                </span>
              </div>
              <small>
                {f.step === "repair"
                  ? "Xử lý"
                  : f.step === "verify"
                    ? "Ban đầu"
                    : f.step}
                {f.taskId === taskId ? " · Hiện tại" : ""}
              </small>
              {f.scanMessage && f.scanStatus !== "clean" && (
                <p>{f.scanMessage}</p>
              )}
              <details>
                <summary>Thông tin kiểm chứng tệp</summary>
                <p className="mono">SHA-256: {f.checksum}</p>
                <p>Người tải: {f.uploadedBy}</p>
                <p>
                  Thời điểm: {new Date(f.createdAt).toLocaleString("vi-VN")}
                </p>
                <p>{f.scanVersion || "Chưa có kết quả quét"}</p>
              </details>
              {f.scanStatus === "clean" && (
                <div className="evidence-file-actions">
                  {["image/png", "image/jpeg"].includes(f.mime) && (
                    <button
                      type="button"
                      className="button secondary"
                      aria-label={`Xem ảnh ${f.filename}`}
                      disabled={previewBusy === f.id}
                      onClick={(e) => void preview(f, e.currentTarget)}
                    >
                      <IconEye size={17} aria-hidden="true" />
                      {previewBusy === f.id ? "Đang mở ảnh…" : "Xem ảnh"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={`Tải xuống ${f.filename}`}
                    disabled={downloadBusy !== null}
                    onClick={() => void download(f)}
                  >
                    <IconDownload size={17} aria-hidden="true" />
                    {downloadBusy === f.id ? "Đang tải xuống…" : "Tải xuống"}
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {viewer && (
        <ImageViewer
          blob={viewer.blob}
          name={viewer.name}
          close={() => {
            viewer.trigger.focus();
            setViewer(null);
          }}
        />
      )}
    </section>
  );
}
