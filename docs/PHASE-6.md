# Giai đoạn 6 — Hồ sơ an toàn hạn chế G03

Một tình huống trung tính giả lập: đề nghị cán bộ kiểm tra vật cản ở hành lang A101. Không dùng danh tính, lời tố cáo hoặc thông tin cá nhân thật. G03 dùng cùng Case/Task/Evidence/Timeline/outbox/worker/registry/UI; khác ở adapter `safety-v1`, vai trò và quyền trên từng hồ sơ.

## Khởi động và thử

```powershell
pnpm demo:init
pnpm demo:up
pnpm demo:users
pnpm demo:verify:phase6
```

Windows MSIX dùng helper Docker như các hướng dẫn trước, không xóa volume/realm để thêm tài khoản. `demo:users` cấp ba tài khoản mới có liên kết subject/issuer minh thị; mật khẩu nằm trong `.env` local:

| Tài khoản       | Vai trò và việc thực hiện                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| safety_reporter | Báo và bổ sung phản ánh của mình, theo dõi kết quả                                                                   |
| safety          | Cán bộ tiếp nhận ban đầu; xác minh, giao người/hạn/nghiệm thu; có thể tự nhận xử lý nhưng không tự nghiệm thu        |
| safety_reviewer | Cán bộ thứ hai; chỉ thấy hồ sơ sau khi được giao xử lý hoặc nghiệm thu, không được đọc mọi hồ sơ chỉ vì cùng vai trò |

Đăng nhập → **An toàn hạn chế**. Người báo tạo phản ánh bằng form chung; chọn A101, không cần thiết bị. Cán bộ tiếp nhận → giao xử lý cho safety và nghiệm thu cho safety_reviewer → nhận việc → ghi biện pháp/kết quả và upload biên bản giả lập → chờ quét sạch → gửi nghiệm thu. Người nghiệm thu phê duyệt/đóng hoặc trả lại có lý do. Dùng profile/context riêng hoặc đăng xuất khi đổi tài khoản.

Giao diện dùng lại form/danh sách/bộ lọc/task/timeline của G01 với prefix G03. Banner giải thích tính hạn chế và dữ liệu giả lập; thông báo chỉ có thông điệp chung và mã hồ sơ được cấp quyền. Cán bộ có quyền trên case có thể mở **Xem nhật ký truy cập**; người báo không được đọc access log.

## Quyền truy cập hiện hành

Case G03 bắt đầu có `access_ids` gồm người báo và cán bộ tiếp nhận. Khi giao việc, tập này là đúng người báo + cán bộ tiếp nhận + người xử lý + người nghiệm thu. Quyền đọc cần đồng thời có membership bật, đúng vai trò an toàn hiện hành, có tên trong ACL và quan hệ tham gia hồ sơ. G01/environment/admin không tự nhận quyền từ cùng ID hoặc từ quyền quản trị kỹ thuật. Bản đầu giao người cụ thể; chưa có UI nhóm/ủy quyền linh hoạt.

Chính sách dùng chung ở SQL list/report/notification và hàm canReadCase/caseActions cho detail/action/evidence. Các API còn lọc pack_id để không dùng đường G01/G02 đọc case G03. Người khác biết case ID và file ID vẫn nhận 404; list/search/report/notification không trả nội dung hoặc count của case ngoài quyền. API catalogue G03 cũng yêu cầu vai trò an toàn.

Notification lưu liên kết event/case/recipient, không lưu nội dung phản ánh. Khi đọc, quyền trên case được kiểm tra lại: thông báo cũ không giữ quyền sau khi ACL/role/membership đã bị thu hồi. Download qua cùng API quét/checksum/current permission như giai đoạn 3, không có link S3 công khai.

Khóa idempotency được scoped theo pack + reporter + key. Tạo lại cùng key trên G03 vẫn kiểm tra quyền hiện hành trên case cũ; không dùng replay để đọc hồ sơ đã bị thu hồi ACL. Không cho chuyển một hồ sơ đang chạy tự do từ G01 sang G03.

## Nhật ký và vận hành

`restricted_access_events` ghi actor/resource UUID, loại thao tác, method, kết quả kiểm tra quyền và thời điểm trước khi phục vụ nội dung; HTTP outcome được cập nhật sau khi request kết thúc. Outcome trống nghĩa là request đang chạy/bị gián đoạn, không khẳng định thành công. `allowed` là quyết định quyền đọc ban đầu; HTTP 403 ở action có thể vẫn xuất hiện khi caller đọc được case nhưng không được thực hiện bước đó.

Không ghi request body, nội dung tìm kiếm, tiêu đề, mô tả, filename, token, mật khẩu hay raw G03 vào access journal. Case timeline giữ hành động nghiệp vụ thành công, người/thời điểm, version và evidence theo quyền hồ sơ. API access-log chỉ cho cán bộ an toàn đang được cấp quyền trên đúng case; admin và cán bộ không liên quan không có quyền đọc log này.

Thu hồi membership/role qua vận hành database như các giai đoạn trước. ACL có thể thu hồi tường minh bởi operator có quyền database; sau thay đổi, API kiểm tra lại ngay ở request mới. Ví dụ demo thu hồi quyền đọc của người báo rồi khôi phục:

```sql
UPDATE cases SET access_ids=array_remove(access_ids,'88888888-8888-4888-8888-888888888888'::uuid) WHERE id='<case-uuid>' AND pack_id='g03';
-- Sau bài thử
UPDATE cases SET access_ids=array_append(access_ids,'88888888-8888-4888-8888-888888888888'::uuid) WHERE id='<case-uuid>' AND pack_id='g03';
```

Operator cần kiểm tra đúng case và không thay đổi ACL khi có command đang xử lý; lệnh đã nhận trước thu hồi vẫn được hoàn tất theo ý định đã chấp nhận như giai đoạn 3. Chưa có màn quản trị cấp/thu hồi ACL. Thành viên có quyền database là ranh giới tin cậy, không coi database operator bị tấn công là đã được bảo vệ bởi ACL ứng dụng.

Migration 8 thêm ACL/access log/notification và mở scope unique idempotency theo pack, giữ dữ liệu G01/G02. V1 G03 được bootstrap vào cùng registry, không thay active G01/G02. Không xóa hoặc chuyển loại các case đã có.

## Nghiệm thu

`pnpm demo:verify:phase6`: tạo/replay riêng tư; thử G01/admin/environment và người cùng vai trò chưa được giao; file upload/download khi biết ID; thu hồi membership/ACL và kiểm tra lại notification/replay; người được giao hoàn tất engine thật; access journal có allowed/denied mà không lộ payload/token.

`tests/e2e/safety.spec.ts`: ba tài khoản an toàn báo/giao/xử lý/upload/đóng bằng UI chung, mở thông báo và access log, kiểm tra người G01 không thấy điều hướng/nội dung, 390px không tràn ngang. Report `phase6-integration.json`, ảnh `phase6-restricted-mobile.png`. Đối chiếu [ma trận nghiệm thu](verification/phase-6-acceptance.md) và CI đúng SHA trong PR; review đồng đội được thực hiện sau, không tự merge.

Giới hạn: một trường, một tình huống giả lập, người được giao cụ thể; chưa có ẩn danh Internet, group editor, chia sẻ file công khai, retention/audit export, backup/restore hoặc production. Các phần phát hành tổng thể còn ở giai đoạn 7.
