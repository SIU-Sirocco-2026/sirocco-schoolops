// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { useEffect, useRef, useState } from "react";
import { ApiError } from "./http.js";

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
  error: "Lỗi quét — sẽ tự thử lại",
};
export function Evidence({
  request,
  caseId,
  taskId,
  onReady,
  policy,
  prefix = "g01",
}: {
  prefix?: string;
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
  const key = useRef(crypto.randomUUID()),
    input = useRef<HTMLInputElement>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const mimeTypesKey = JSON.stringify(policy.mimeTypes);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      let delay = 30000;
      try {
        const data = await request<{
          items: FileEvidence[];
          canUpload: boolean;
        }>(`/api/${prefix}/cases/${caseId}/evidence`);
        if (!active) return;
        setFiles(data.items);
        setCanUpload(data.canUpload);
        setError("");
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
          setError((e as Error).message);
          if (e instanceof ApiError && [401, 403, 404].includes(e.status))
            return;
          delay =
            e instanceof ApiError && e.status === 429 ? e.retryAfterMs : 10000;
        }
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
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/${prefix}/cases/${caseId}/evidence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "Idempotency-Key": key.current,
        },
        body: await file.arrayBuffer(),
      });
      key.current = crypto.randomUUID();
      setFile(null);
      if (input.current) input.current.value = "";
      const data = await request<{ items: FileEvidence[]; canUpload: boolean }>(
        `/api/${prefix}/cases/${caseId}/evidence`,
      );
      setFiles(data.items);
      setRefreshIndex((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(f: FileEvidence) {
    setError("");
    try {
      const blob = await request<Blob>(
        `/api/${prefix}/cases/${caseId}/evidence/${f.id}/download`,
      );
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = f.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="evidence-section" aria-label="Bằng chứng hồ sơ">
      <h3>Bằng chứng</h3>
      <p>
        {policy.mimeTypes?.every((m) => m.startsWith("image/"))
          ? "Phiên bản gói này yêu cầu ảnh PNG/JPEG sạch. "
          : ""}
        Chỉ tệp đã quét sạch được tải xuống. Mỗi lần gửi nghiệm thu cần bằng
        chứng sạch của lần xử lý đó.
      </p>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {canUpload && (
        <form onSubmit={(e) => void upload(e)}>
          <label htmlFor={`evidence-${caseId}`}>
            Ảnh hoặc tài liệu bằng chứng (tối đa 10 MB)
          </label>
          <input
            ref={input}
            id={`evidence-${caseId}`}
            type="file"
            accept=".png,.jpg,.jpeg,.pdf,.txt"
            required
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              key.current = crypto.randomUUID();
            }}
          />
          <button className="button secondary" disabled={busy || !file}>
            {busy ? "Đang tải tệp…" : "Tải bằng chứng"}
          </button>
        </form>
      )}
      {!files.length && <p>Chưa có bằng chứng.</p>}
      <ul className="evidence-list">
        {files.map((f) => (
          <li key={f.id}>
            <strong>{f.filename}</strong>
            <span className={`scan-state scan-${f.scanStatus}`}>
              {states[f.scanStatus]}
            </span>
            <small>
              {Math.ceil(f.size / 1024)} KB · Bước {f.step}
              {f.taskId === taskId ? " · Lần xử lý hiện tại" : ""}
            </small>
            {f.scanMessage && f.scanStatus !== "clean" && (
              <p>{f.scanMessage}</p>
            )}
            <details>
              <summary>Thông tin kiểm chứng tệp</summary>
              <p className="mono">SHA-256: {f.checksum}</p>
              <p>Người tải: {f.uploadedBy}</p>
              <p>Thời điểm: {new Date(f.createdAt).toLocaleString("vi-VN")}</p>
              <p>{f.scanVersion || "Chưa có kết quả quét"}</p>
            </details>
            {f.scanStatus === "clean" && (
              <button
                type="button"
                className="button secondary"
                onClick={() => void download(f)}
              >
                Tải xuống {f.filename}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
