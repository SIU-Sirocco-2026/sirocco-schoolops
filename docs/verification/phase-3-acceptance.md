# Nghiệm thu giai đoạn 3 — Bằng chứng và phục hồi lỗi G01

Phạm vi: toàn bộ mục **Giai đoạn 3 — Hồ sơ có bằng chứng và xử lý lỗi đáng tin cậy** trong [roadmap chức năng](../requirements/phase-3.md). Issue theo dõi: [#9](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/issues/9). Quy trình triển khai: [PHASE-3.md](../PHASE-3.md). Hợp đồng API: [OpenAPI](../openapi.yaml).

## Ma trận yêu cầu và bằng chứng

| Yêu cầu                                                                                        | Hiện thực                                                                                                                                                                       | Bằng chứng có thể chạy lại                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload ảnh/tài liệu, checksum, người tải, bước và metadata                                     | Raw upload 10 MiB, PNG/JPEG/PDF/TXT, object key do server tạo; bảng evidence có uploader/task/policy/gói/thời điểm                                                              | `verify-phase3.mjs`: metadata/checksum/task đúng; replay cùng khóa giữ một file, đổi nội dung bị từ chối; file giả định dạng/rỗng/quá cỡ/tên không hợp lệ bị chặn. Browser upload và download so bytes gốc                                                                                   |
| Cách ly/quét tệp, pending/clean/rejected/error; chỉ file sạch làm bằng chứng và tải theo quyền | SeaweedFS quarantine/clean; ClamAV INSTREAM thật; worker đối chiếu checksum, promote rồi commit; GET download kiểm tra quyền/trạng thái/checksum                                | Worker ngừng: pending không tải/gửi nghiệm thu được; ClamAV từ chối EICAR thật; checksum cách ly sai bị rejected; scanner ngừng: error, tự quét lại sau phục hồi; storage ngừng: upload thất bại an toàn và dữ liệu vẫn có sau restart                                                       |
| Chặn nghiệm thu khi thiếu bằng chứng bắt buộc                                                  | Snapshot policy `g01-evidence@1.0.0`, một file clean thuộc đúng repair task                                                                                                     | Thiếu/pending/rejected bị 409 EVIDENCE_REQUIRED; sau trả lại xử lý phải thêm file cho task mới; browser kiểm tra nút khóa/mở, đi hai vòng trả lại                                                                                                                                            |
| Gửi lặp không trùng; thao tác cùng task không ghi đè                                           | Unique reporter/key/hash và uploader/key; khóa case, revision, một command pending/case; unique event/command                                                                   | Năm request tạo mới đồng thời cho cùng khóa chỉ có một case/command/process; hai request cùng revision chỉ một được nhận và một event chuyển bước; replay khác nội dung bị 409                                                                                                               |
| Outbox/retry/đối soát khi engine/worker lỗi, UI hiện trạng thái thật                           | Lưu đầy đủ command trước gửi; executor dùng process business key, exact old task ID, history và unique engine guard; retry tối đa 60 giây; detail synchronization và polling UI | Crash tiến trình sau start và sau complete trước commit projection; khởi động worker phục hồi đúng case/task và chỉ một event. Crash sau claim tổ giữ đúng người nhận. Engine ngừng khi tạo hoặc chuyển bước: 202, tự phục hồi. Duplicate start bị DB engine chặn cả khi process đã kết thúc |
| Audit người/hành động/thời điểm/phiên bản/bằng chứng                                           | Case events gắn policy/gói/schema/workflow, submission giữ ID/checksum/scanner của file; service principal riêng cho scan worker                                                | Integration đối chiếu submit audit, uploader, policy/version, actor và timestamp; scanner event mang actor Hệ thống quét tệp; G01/browser giữ lịch sử hai lần trả lại                                                                                                                        |
| Chặn yêu cầu mới sau thu hồi quyền ứng dụng                                                    | Middleware đọc membership/role hiện hành mỗi request; kiểm tra quan hệ case/tổ; download recheck sau đọc storage                                                                | Giữ nguyên token còn hạn, disable technician: detail/list/report/upload/download/action đều 403; đổi role: case/file 404 và danh sách không lộ; xóa thành viên tổ: task chưa claim bị ẩn; khôi phục trong finally                                                                            |
| Báo cáo mở/quá hạn/hoàn thành, mở hồ sơ nguồn theo quyền                                       | Cùng predicate SQL cho report/list; bucket open/overdue/completed; UI số liệu có thể bấm                                                                                        | So count report với total của từng bucket ở cả năm tài khoản; deadline thật trôi qua tạo hồ sơ overdue; admin thấy 0; browser bấm Hoàn thành mở danh sách nguồn                                                                                                                              |

## Bộ kiểm tra và kết quả

```text
pnpm typecheck
pnpm test                    # 21 unit / HTTP / adapter tests
pnpm build
pnpm demo:up
pnpm demo:verify             # 8 nhóm nền tảng
pnpm demo:verify:g01         # 9 nhóm G01, có bằng chứng sạch mỗi lần sửa
pnpm demo:verify:phase3      # 17 nhóm nghiệm thu, gồm lỗi và crash thật
pnpm test:e2e               # 6 browser tests, 4 vai trò G01 và 5 tài khoản nền tảng
```

Các bộ kiểm tra được chạy trên stack Docker thật ở Windows/WSL2; CI chạy lại từ source trên Ubuntu. Trạng thái kết quả cuối cùng được ghi sau khi hoàn tất lượt nghiệm thu. Không dùng một unit test giả lập để thay cho bằng chứng kết nối/quét/file/workflow thật.

Các artifacts local được Git ignore:

- `test-results/integration.json`: nền tảng và process ID.
- `test-results/g01-integration.json`: hai luồng G01, case/process ID và kết quả.
- `test-results/phase3-integration.json`: timestamp, case ID và kết quả từng nhóm; lưu ngay cả khi một nhóm thất bại.
- `test-results/browser/.last-run.json` và `playwright-report/`: kết quả browser.
- `test-results/phase3-evidence-mobile.png`, `g01-mobile-*.png`, `g01-desktop-closed.png`: giao diện bằng chứng, xử lý và đóng hồ sơ.

Report JSON không chứa mật khẩu/token. Trace trình duyệt có thể chứa phiên đăng nhập; giữ ở môi trường kiểm thử riêng, không đính kèm công khai.

## Điều kiện và giới hạn

- Phạm vi đã bổ sung là giai đoạn 3 của G01, không bao gồm validate/activate gói v1/v2, G02/G03, backup/restore, retention file hoặc triển khai Internet/production.
- Chính sách bằng chứng được pin theo case; gói hiện vẫn tĩnh. Migration bổ sung chính sách ban đầu cho case từ giai đoạn 2, không chuyển bước hay mở lại case đóng.
- Chống trùng process phụ thuộc unique index trên business key của history engine. Không xóa history/guard; khi đổi engine phải kiểm tra lại. Lookup phía API riêng lẻ không được coi là đủ bằng chứng chống trùng.
- Case pending cũ trước migration, không có command đầy đủ từ giai đoạn 2, cần kiểm tra thủ công. Đối soát tự động áp dụng cho lệnh giai đoạn 3 đã lưu đầy đủ ý định.
- Tệp cách ly và file mồ côi không được công khai qua API; chưa có dọn dữ liệu tự động. Không gọi một phép thử restart là backup/restore.
- Thu hồi membership là quyền ứng dụng; lệnh đã nhận hợp lệ trước thu hồi tiếp tục được xử lý. Chưa tuyên bố Keycloak thu hồi lập tức mọi token.
- Giao diện danh mục/nhân sự và tập dữ liệu vẫn theo một trường demo, chưa benchmark khối lượng lớn. Chỉ số và danh sách đọc ở hai thời điểm có thể khác nhau khi có thay đổi đồng thời.
- Mã đi theo chuỗi PR nền tảng → G01 → quy trình cộng tác → giai đoạn 3. CI đạt không thay thế review của đồng đội; không tự merge chuỗi PR.
