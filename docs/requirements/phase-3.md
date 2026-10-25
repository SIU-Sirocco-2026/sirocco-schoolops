# Phạm vi giai đoạn 3 đã thống nhất

Trích nguyên mục giai đoạn 3 từ roadmap chức năng Sirocco SchoolOps ngày 24/10/2026, lưu trong repo để reviewer có thể đối chiếu mà không cần thư mục tài liệu riêng. Nguồn ban đầu là hồ sơ kế hoạch nội bộ của đội; phần yêu cầu được giữ dưới đây.

## Giai đoạn 3 — Hồ sơ có bằng chứng và xử lý lỗi đáng tin cậy

**Chức năng cần có**

- Upload ảnh/tài liệu; lưu checksum, người tải, bước và metadata.
- Cách ly/quét tệp, hiển thị pending/clean/rejected/error; chỉ tệp sạch được dùng làm bằng chứng theo chính sách và được tải khi có quyền.
- Chặn gửi nghiệm thu khi thiếu bằng chứng bắt buộc.
- Gửi lặp không tạo thêm hồ sơ; hai người thao tác cùng task không ghi đè kết quả.
- Outbox/retry/đối soát khi engine hoặc worker lỗi; UI hiển thị trạng thái thực.
- Audit người thực hiện, hành động, thời điểm, phiên bản và bằng chứng liên quan.
- Chặn yêu cầu mới khi quyền ứng dụng đã bị thu hồi theo cơ chế được kiểm chứng.
- Báo cáo cơ bản về hồ sơ mở, quá hạn và hoàn thành; mở từ chỉ số xuống hồ sơ nguồn theo quyền.

**Hoàn thành khi:** G01 chạy đầy đủ; thiếu evidence, sai quyền và tệp chưa sạch đều bị chặn; bộ kịch bản gửi lặp/lỗi engine không làm mất hồ sơ hoặc tạo workflow trùng sau đối soát.
