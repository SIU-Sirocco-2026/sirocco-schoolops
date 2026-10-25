# Thử nhiều vai trò trên cùng môi trường

Một luồng báo, giao, xử lý và nghiệm thu phải chạy trên cùng stack và database. Mỗi người cài riêng chỉ chứng minh bản cài của người đó; các hồ sơ không tự đồng bộ giữa máy. Người điều phối buổi thử chọn một máy chủ demo và thông báo thời gian giữ môi trường ổn định.

## Chọn cách truy cập

Cách đơn giản nhất là thử trên cùng máy bằng các profile trình duyệt riêng. Nếu người thử dùng máy khác, có thể dùng SSH tunnel đã được người vận hành cấp quyền vào máy chủ. Cách này giữ hai cổng ứng dụng/Identity ở loopback và giữ cùng origin `localhost` như cấu hình RC.

Ví dụ chạy trên máy người thử, thay tài khoản/máy chủ bằng thông tin được cấp riêng:

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8088:127.0.0.1:8088 -L 127.0.0.1:8180:127.0.0.1:8180 demo-user@demo-host
```

Giữ tunnel chạy rồi mở `http://localhost:8088`. Cổng 8088 và 8180 trên máy người thử phải còn trống; dừng bản cài riêng đang chiếm cổng trước. Máy chủ cần có SSH và cơ chế cấp quyền do người vận hành quản lý. Hướng dẫn này không tự bật SSH, mở firewall, cấp tài khoản hoặc triển khai VPS. Trình duyệt cần vào được cả 8088 và 8180 để đăng nhập.

Mọi người kiểm tra `/api/config` có cùng `sourceRevision` và `/api/health/ready` trả `ready`. Mỗi vai trò dùng profile riêng và tài khoản demo được cấp qua kênh nội bộ; không đưa mật khẩu vào Issue, ảnh hoặc video. Cấu hình RC dùng chung mật khẩu cho các tài khoản demo, nên chỉ dùng nhóm thử được tin cậy với dữ liệu giả lập. Nếu cần tài khoản riêng cho từng người hoặc truy cập Internet/TLS, người vận hành phải thiết kế và nghiệm thu cấu hình mới trước buổi thử.

## Buổi thử phối hợp

1. Ghi phiên bản, người điều phối, người thử, tài khoản, trình duyệt, máy chủ và khoảng thời gian. Người thử xác nhận kết quả theo [mẫu vai trò](verification/role-feedback.md).
2. `reporter` tạo một G01 giả lập, ghi mã. `coordinator` tìm đúng mã, trả bổ sung một lần, rồi tiếp nhận và giao `technician`/`approver` có hạn.
3. Người báo bổ sung trên phiên của mình. Kỹ thuật viên nhận đúng hồ sơ, ghi kết quả, tải tệp và đợi sạch. Người nghiệm thu trả xử lý một lần, yêu cầu bằng chứng mới rồi đóng. Người báo kiểm tra cùng mã và timeline đã cập nhật.
4. Thử hai phiên mở cùng case: ghi ai gửi trước, thông báo bên còn lại và kết quả sau Làm mới. Ghi lỗi nếu có ghi đè mất dữ liệu hoặc chuyển bước ngoài quyền. Không coi việc hai phiên mở được trang là đã đạt kiểm thử tranh chấp.
5. Với G03, chỉ dùng phản ánh trung tính; kiểm tra tài khoản được giao đọc/đóng được và `reporter`/`admin` không đọc được cùng case/file. Đối chiếu báo cáo theo cùng account và bộ lọc.
6. Ghi hồ sơ, task, thông báo và tệp nào đã kiểm tra; người điều phối lưu kết quả thực tế, issue sửa và lần thử lại. Không tự xác nhận các vai trò còn thiếu.

Đây là hướng dẫn tổ chức một lượt thử, chưa phải bằng chứng nhóm người thật đã chạy chung môi trường. Bộ Playwright hiện có nhiều browser context dùng chung một stack; đó là bằng chứng tự động riêng.

## Giữ môi trường ổn định

Tách môi trường người dùng khỏi demo kỹ thuật gây lỗi. Không chạy `demo:verify:phase3`, `demo:verify:phase7`, đổi gói active, backup có dừng dịch vụ hoặc restart máy chủ trong lịch thử. Chỉ thực hiện bảo trì khi người điều phối kết thúc lượt và thông báo cho người tham gia. Dùng project/volume riêng cho diễn tập; không xóa volume nguồn để làm sạch kết quả.

Việc chạy nhiều IP hoặc tunnel không thay cho bài đo tải. Gateway có quota; gặp 429 thì ghi thời gian chờ và thử lại theo UI. Nếu mạng/tunnel lỗi, tách khỏi lỗi ứng dụng trong mẫu phản hồi.
