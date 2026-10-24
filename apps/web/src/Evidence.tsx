import { useEffect, useRef, useState } from "react";

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
}: {
  request: Request;
  caseId: string;
  taskId: string | null;
  onReady: (ready: boolean) => void;
}) {
  const [files, setFiles] = useState<FileEvidence[]>([]),
    [canUpload, setCanUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef(crypto.randomUUID()),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const data = await request<{
          items: FileEvidence[];
          canUpload: boolean;
        }>(`/api/g01/cases/${caseId}/evidence`);
        if (!active) return;
        setFiles(data.items);
        setCanUpload(data.canUpload);
        setError("");
        onReady(
          data.items.some(
            (f) =>
              f.taskId === taskId &&
              f.step === "repair" &&
              f.scanStatus === "clean",
          ),
        );
      } catch (e) {
        if (active) {
          setFiles([]);
          setCanUpload(false);
          onReady(false);
          setError((e as Error).message);
        }
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [caseId, taskId]);
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/g01/cases/${caseId}/evidence`, {
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
        `/api/g01/cases/${caseId}/evidence`,
      );
      setFiles(data.items);
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
        `/api/g01/cases/${caseId}/evidence/${f.id}/download`,
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
