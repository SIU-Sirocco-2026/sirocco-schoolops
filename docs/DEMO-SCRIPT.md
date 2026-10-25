# Demo xuyên suốt — 0.1.0-rc.1

Trước buổi demo: checkout đúng tag/SHA, giữ cấu hình/volume demo riêng, chạy [cài đặt](INSTALL.md), đợi stack healthy. Ghi version và `sourceRevision` từ `/api/config`, SHA/tag của release và thời điểm chạy. Không làm demo đồng thời với các bộ gây lỗi/restore. Dùng các tài khoản giả lập trong [user guide](USER-GUIDE.md); giữ mật khẩu ngoài slide/video/repo.

| Chặng | Người thực hiện và thao tác | Kết quả cần chỉ ra |
| --- | --- | --- |
| 1. G01 | reporter báo máy chiếu A101 không lên hình trên màn hình điện thoại | Có mã; account khác không tùy ý xử lý |
| 2. Nhánh trả lại | coordinator trả bổ sung với lý do, reporter bổ sung; sau đó tiếp nhận và giao technician/approver có hạn | Timeline giữ mô tả và hai lần chuyển; người không được giao không thao tác được |
| 3. Bằng chứng | technician nhận việc, ghi biện pháp/kết quả; thử gửi khi thiếu evidence; upload TXT/ảnh giả lập và chờ sạch | Thiếu/chưa sạch bị chặn; checksum/uploader/bước được giữ; approver trả xử lý rồi yêu cầu bằng chứng mới, sau đó phê duyệt |
| 4. Phiên bản gói | Tạo case v1 còn mở, admin nạp/kích hoạt v2; tạo case mới | Case v1 giữ chính sách cũ, v2 chỉ nhận ảnh sạch bắt buộc. Gói sai không đổi active; quản trị không đọc nội dung case |
| 5. G02 | Chạy replay xác định, environment mở cảnh báo/lineage, xác minh và đóng có lý do/bằng chứng | Truy được raw/normalized/quality/rule/case; trùng không sinh đôi; số đo hồi phục không tự đóng việc |
| 6. G03 | safety_reporter báo vật cản trung tính; safety giao/xử lý, safety_reviewer đóng; thử reporter/admin biết ID | Account G01/admin không thấy nội dung/file/count G03; người được cấp quyền hoàn tất, access log có allowed/denied |
| 7. Báo cáo | Mỗi role mở thẻ tổng/đang mở/quá hạn/hoàn thành rồi mở danh sách nguồn | Tổng đối chiếu trong cùng quyền, không cộng “quá hạn” thành nhóm tách khỏi “đang mở” |
| 8. Cài/restore/release | Mở restore report, ma trận nghiệm thu, source archive và SHA256SUMS | Ba DB và tệp đã khôi phục; workflow đang xử lý tiếp tục được; assets gắn đúng SHA, không giả đồng đội đã review |

Lệnh chuẩn bị gói, sau khi đăng nhập CLI admin bằng cấu hình local:

```powershell
pnpm packs:validate packs/g01/v2
pnpm packs:install packs/g01/v2
pnpm packs:activate g01 2.0.0
# Sau phần minh họa, đưa mặc định tạo mới về v1; các case cũ vẫn pin revision
pnpm packs:activate g01 1.0.0
pnpm demo:replay:g02
```

Không sửa trực tiếp database để ép luồng demo thành công. Thu hồi role/ACL trong các bài kỹ thuật là phép thử riêng có khôi phục trạng thái, không phải giao diện quản trị đã hoàn thiện. `pnpm demo:verify:phase4/5/6` là cách chạy lại các tình huống đó có assertions; không dùng dấu gạch chéo này như một lệnh shell, chạy từng script tên đầy đủ trong README.

Nghiệm thu tự động: nền tảng → G01 → lỗi/bằng chứng → v1/v2 → G02 → G03 → 10 bài browser (gồm quota có chủ ý) → backup/restore và đối soát báo cáo. Report JSON có source SHA, version, runtime revision và kết quả; ảnh browser ở `test-results/`. Browser CI từ chối flaky/skipped khi đóng gói ứng viên. Raw trace/backup không được đính kèm release công khai.

Cuối demo, mời từng người thử ghi thao tác khó hiểu/lỗi thực tế theo [mẫu phản hồi](verification/role-feedback.md). Bản ứng viên chưa được coi là người dùng thật đã nghiệm thu khi checklist này còn trống.
