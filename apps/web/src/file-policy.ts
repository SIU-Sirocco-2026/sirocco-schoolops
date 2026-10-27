// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
const types: Record<string, { extensions: string[]; label: string }> = {
  "image/png": { extensions: [".png"], label: "PNG" },
  "image/jpeg": { extensions: [".jpg", ".jpeg"], label: "JPEG" },
  "application/pdf": { extensions: [".pdf"], label: "PDF" },
  "text/plain": { extensions: [".txt"], label: "TXT" },
};
export const maxEvidenceBytes = 10 * 1024 * 1024;
export function filePolicy(mimeTypes?: string[]) {
  const allowed = mimeTypes ?? Object.keys(types);
  return {
    accept: allowed
      .flatMap((type) => types[type]?.extensions ?? [type])
      .join(","),
    label: allowed.map((type) => types[type]?.label ?? type).join(", "),
    validate(file: { name: string; size: number; type: string }) {
      if (!file.size)
        return "Tệp đang trống. Hãy chọn ảnh hoặc tài liệu có nội dung.";
      if (file.size > maxEvidenceBytes)
        return "Tệp lớn hơn 10 MB. Hãy giảm dung lượng rồi chọn lại.";
      const extension = /\.[^.]+$/.exec(file.name)?.[0].toLowerCase();
      const matches = allowed.some(
        (type) =>
          file.type === type ||
          (!file.type &&
            !!extension &&
            types[type]?.extensions.includes(extension)),
      );
      if (!matches)
        return `Loại tệp chưa phù hợp. Lần xử lý này nhận ${allowed.map((type) => types[type]?.label ?? type).join(", ")}.`;
      return null;
    },
  };
}
