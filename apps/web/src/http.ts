// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterMs = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function decodeResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 429) {
      const seconds = Number(
        response.headers.get("X-RateLimit-Reset") ??
          response.headers.get("Retry-After") ??
          60,
      );
      const retryAfterMs =
        Number.isFinite(seconds) && seconds >= 0 && seconds <= 3600
          ? Math.ceil(seconds * 1000) + 100
          : 60100;
      throw new ApiError(
        `Có quá nhiều yêu cầu. Vui lòng chờ ${Math.ceil(retryAfterMs / 1000)} giây, sau đó bấm Làm mới hoặc thử lại thao tác.`,
        429,
        retryAfterMs,
      );
    }
    let message: string | undefined;
    if (response.headers.get("content-type")?.includes("application/json")) {
      try {
        const data = await response.json();
        message = data.error?.message;
      } catch {
        /* gateway may return an incomplete response */
      }
    }
    message ||=
      response.status === 401
        ? "Phiên đăng nhập không còn hợp lệ. Hãy đăng xuất rồi đăng nhập lại."
        : response.status === 403
          ? "Bạn không có quyền thực hiện thao tác này. Hãy làm mới hồ sơ để xem quyền hiện tại."
          : response.status === 404
            ? "Không tìm thấy dữ liệu trong phạm vi được cấp quyền. Hãy quay lại danh sách và làm mới."
            : response.status >= 500
              ? "Dịch vụ đang gián đoạn. Hãy làm mới hồ sơ để kiểm tra kết quả trước khi gửi lại thao tác."
              : "Không thể hoàn tất yêu cầu. Hãy kiểm tra thông tin rồi thử lại.";
    throw new ApiError(message, response.status);
  }
  return (
    response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : await response.blob()
  ) as T;
}
