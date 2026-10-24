# Kết quả kiểm chứng nền tảng giai đoạn 1

Ngày kiểm tra: 24/10/2026. Môi trường local: Windows, Node.js 22.16.0, Docker Engine 29.5.3, Docker Compose 5.1.4, Linux containers.

## Kết quả local

| Kiểm tra                       | Kết quả                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| TypeScript web và API          | Đạt                                                                                                    |
| Build web và API từ source     | Đạt                                                                                                    |
| Auth/API và adapter unit tests | Đạt; xem bộ test trong `apps/api/test`                                                                 |
| Compose start/readiness        | Đạt, các dịch vụ chạy qua cấu hình trong repo                                                          |
| Live integration               | Đạt 8 nhóm kiểm tra trong `scripts/verify.mjs`                                                         |
| Browser end-to-end             | Đạt trên Chromium; hai browser context cho người báo và kỹ thuật viên                                  |
| Viewport 390 × 844             | Đạt, không tràn ngang; luồng hoàn tất đã được kiểm tra                                                 |
| Restart API                    | Số deployment của gói nền tảng giữ 1; số hồ sơ giữ 3 và số hoàn tất giữ 2 ở snapshot trước/sau lần thử |

Kiểm tra integration gồm gateway/readiness, token sai, identity/membership, tạo process thật, gửi lặp, idempotency conflict, sai vai trò/quyền xem, kỹ thuật viên hoàn tất và người tạo đọc lại kết quả. Bộ thử tạo dữ liệu giả lập mới khi chạy; số lượng dữ liệu trên máy sau đó có thể tăng.

Sau khi kiểm tra lại việc restart, bộ integration và browser được chạy lại trên cấu hình đã sửa. Báo cáo JSON và ảnh local do script sinh ở `test-results/`; thư mục này không được commit. CI chạy cùng bộ lệnh trên runner Linux sạch và lưu artifact theo từng run.

## Các lỗi tích hợp đã phát hiện và sửa

- Flowable có thể trả HTTP 200 với body rỗng khi complete task; adapter không còn cố parse JSON trong trường hợp này.
- Deployment name của Flowable lấy từ tên tệp trước dấu chấm đầu tiên. Dùng tên `sirocco-foundation-v1-0-0` và lấy definition theo deployment ID để restart không triển khai lặp.
- APISIX image không có curl; readiness dùng OpenResty HTTP client có sẵn.
- Realm import phải đọc được bởi UID của container trên Linux. Thư mục generated giữ quyền riêng cho host, file được bind read-only vào container.

## Giới hạn kết luận

Đây là kiểm chứng một nhiệm vụ nền tảng, không phải nghiệm thu G01 đầy đủ. Chưa chứng minh restore, tải đồng thời, validator/v1-v2, tệp/quét tệp hoặc G02/G03. Các kịch bản tạo workflow không chắc kết quả vẫn cần đối soát thủ công; chưa có worker tự khôi phục.

Kết quả không chứng minh cấu hình đã sẵn sàng đưa lên Internet. Secret, dữ liệu, realm và password trong demo chỉ dành cho máy local/runner kiểm thử riêng.
