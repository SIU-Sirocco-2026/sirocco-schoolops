# Giai đoạn 7 — Nghiệm thu và phát hành

Phạm vi gốc ở [yêu cầu](requirements/phase-7.md), đối chiếu [ma trận nghiệm thu](verification/phase-7-acceptance.md). Các đầu ra kỹ thuật và trạng thái phản hồi người dùng được ghi riêng; giai đoạn chỉ hoàn tất khi cả hai có bằng chứng đạt.

Các bổ sung chính:

- Web hiểu lỗi JSON lẫn lỗi HTML của gateway, hiển thị quota/reset và bước tiếp theo; giữ biểu mẫu, không tự gửi lại mutation. Poll evidence nhanh khi chờ quét, chậm khi ổn định, chờ reset khi 429. Bộ browser dùng quota thực và dành ngân sách trước mỗi tình huống thay vì tăng giới hạn gateway.
- Thử G01/G03 với các phiên 390×844, tạo/upload/nhận/xử lý/nghiệm thu; có kiểm tra không tràn ngang. Phản hồi người thật ở [checklist](verification/role-feedback.md) vẫn cần người thực hiện thật, không lấy kết quả Playwright để điền thay.
- `backup:create`, `backup:restore`, `demo:verify:phase7`: snapshot nhất quán, mã hóa có xác thực, chỉ restore vào project mới; so fingerprint mọi bảng ba DB và checksum mọi tệp trước khi chạy app; tiếp tục workflow/đăng nhập/idempotency/quyền/lineage/báo cáo sau restore. [Hướng dẫn](BACKUP-RESTORE.md).
- Source/dependency/image được cố định bằng Git SHA, lockfile và image digest. `demo:up` gắn OCI revision/version; backup và đóng gói kiểm tra runtime đúng source. Canonical checksum gói dùng thứ tự key độc lập locale; đã kiểm tra các revision demo hiện có giữ nguyên checksum.
- Apache-2.0, nguồn gốc và thông báo bên thứ ba; `legal:audit` xuất inventory/SBOM/full notices cho đúng nền tảng cài đặt. [Phạm vi](PROVENANCE.md) và [thông báo](../THIRD_PARTY_NOTICES.md).
- Tài liệu [cài đặt](INSTALL.md), [người dùng](USER-GUIDE.md), [đóng góp](../CONTRIBUTING.md), [OpenAPI](openapi.yaml), [demo](DEMO-SCRIPT.md), [bảo mật/giới hạn](../SECURITY.md). `source:verify` kiểm tra link nội bộ, coverage operation API, tham số/ref, phiên bản, file riêng tư và image pins.
- `release:prepare` từ chối source bẩn, report cũ/sai SHA/version/runtime, bài tích hợp lỗi, browser flaky/skipped, restore không khớp hoặc inventory sai lockfile. Source archive được tạo hai lần và so hash; giữ SOURCE-REVISION, LICENSE và NOTICE, loại secret/dump/cache. Sinh release manifest, SHA256SUMS, release notes và bằng chứng tổng hợp; không đưa trace hoặc backup vào assets công khai.

Bản đầu là **0.1.0-rc.1** để đội/người dùng review và thử trước. Review/merge chuỗi PR vẫn thực hiện theo CONTRIBUTING; không tạo approval thay đồng đội hoặc tự merge main chỉ vì các kiểm tra đạt. Phiên bản RC không tuyên bố đã có vận hành Internet/production, multi-tenant, retention, UI cấp/thu hồi ACL hay kiểm định an ninh độc lập.
