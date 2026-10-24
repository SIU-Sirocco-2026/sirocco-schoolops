# Giai đoạn 5 — Môi trường PM2.5 có truy nguồn

G02 dùng một nguồn `demo-pm25`, trạm `A101-PM25` tại A101. Đây là **dữ liệu phát lại có nhãn** và **ngưỡng minh họa, không phải khuyến cáo sức khỏe**. Không quy đổi PM2.5 sang AQI hay tuyên bố dự báo/đo cảm biến thật.

## Khởi động và demo

```powershell
pnpm demo:init
pnpm demo:up
pnpm demo:users
pnpm demo:replay:g02
pnpm demo:verify:phase5
```

Trên Windows MSIX này dùng helper `C:/Users/Thai Ho Phu Gia/.codex/tools/windows-docker/ensure-docker.ps1` trước Docker như các giai đoạn trước. `demo:users` chỉ thêm các tài khoản demo mới vào realm đang có; không xóa volume/reimport realm/reset tài khoản cũ. Keycloak REST có thể tự cấp subject ID khác ID import; script liên kết subject/issuer một cách tường minh vào membership demo. API không cấp quyền dựa vào preferred_username.

Hai tài khoản mới dùng mật khẩu demo trong `.env`:

- `sensor`: chỉ POST bản tin ingestion; không được đọc hồ sơ/tệp/nguồn/lineage.
- `environment`: cán bộ nguồn, xem dữ liệu/cảnh báo và xử lý hồ sơ; không được gọi ingestion.

Đăng nhập environment → **Môi trường PM2.5** → làm mới → chọn **Truy nguồn và mở hồ sơ**. Giao diện hiển thị quy tắc, trạng thái điều kiện, các phép đo liên quan, raw/normalized, chất lượng và phiên bản gói. Phần dưới dùng lại danh sách/chi tiết/task/timeline/upload của nền tảng.

Cán bộ có thể xác nhận cần xử lý hoặc đóng sau xác minh có lý do. Khi đã xác nhận, ghi biện pháp/kết quả, tải biên bản hoặc ảnh và đợi quét sạch; đóng có lý do. Thiếu bằng chứng sạch hoặc lý do rỗng bị API chặn. Dữ liệu giảm chỉ kết thúc điều kiện môi trường; **không tự đóng workflow/hồ sơ**.

## Hợp đồng nguồn và chất lượng

`POST /api/g02/sources/demo-pm25/observations` nhận JSON:

```json
{
  "eventId": "source-event-001",
  "stationId": "A101-PM25",
  "observedAt": "2020-01-01T00:01:00Z",
  "quantity": "pm25",
  "value": 0.05,
  "unit": "mg/m3",
  "label": "replayed"
}
```

Lưu nguyên raw, hash, source/event ID, observed/received time, nhãn, normalized/unit, chất lượng/lý do, revision rule và gap/cooldown. Hỗ trợ `ug/m3` hoặc `mg/m3` (nhân 1000), chỉ nhận số 0–1000 ug/m3 theo phạm vi demo. Thiếu trường/sai đơn vị/trạm/nhãn, giá trị hoặc thời gian không hợp lệ được lưu `invalid`, không đi vào rule. PM2.5 và AQI là biến khác nhau; quantity khác bị loại.

Event ID duy nhất theo nguồn. Cùng ID và nội dung trả bản cũ, ghi attempt duplicate; đổi nội dung trả 409 và không viết đè raw. Bản thiếu ID có ID lỗi do server cấp và chỉ lưu chất lượng, không được tính hợp lệ. Các bản tin có observedAt không tăng so với watermark được lưu `late`, không cập nhật trạng thái hiện hành. Thời gian tương lai quá 5 phút bị loại. Replay dùng trục thời gian lịch sử cố định theo offset; received time vẫn là thời điểm tiếp nhận thực.

## Quy tắc, gom đợt và mất tín hiệu

Quy tắc `pm25-demo@1.0.0` nằm trong manifest gói G02: mở sau hai mẫu hợp lệ liên tiếp >35 ug/m3; kết thúc điều kiện sau hai mẫu bình thường; cooldown 300 giây sau phục hồi; khoảng thiếu mẫu >300 giây làm reset đếm liên tiếp. Invalid/duplicate/late không được đếm. Khi có mẫu trở lại sau mất tín hiệu, gap được ghi trong observation và hiển thị; đây là replay, không phải cảnh báo thời gian thực khi chưa có dữ liệu mới.

Một nguồn khóa theo dòng trong transaction. Observation, trạng thái rule, episode, quan hệ lineage, case và command outbox được commit chung. Unique episode đang mở/nguồn và khóa nguồn chống hai request cùng mở hai đợt. Mẫu tiếp theo trong đợt được nối vào cùng episode; duplicate chỉ thêm attempt. Episode đã mở pin rule snapshot/revision; đổi gói không đổi quy tắc giữa đợt. Candidate mới reset nếu active revision đổi. Hết cooldown có thể tạo đợt mới ngay cả khi công việc cũ chưa được cán bộ đóng; hai loại trạng thái được hiển thị riêng.

Gói G02 `environment-v1` dùng cùng registry, validator, schema, case projection, task/action API, evidence, audit và worker với G01. Chỉ adapter nghiệp vụ PM2.5 chịu trách nhiệm quality/episode/lineage. Không tạo một hệ hồ sơ hay uploader riêng để demo.

Lineage episode giữ nguồn/trạm, các observation mở/duy trì/phục hồi, rule snapshot/version, revision/checksum gói và case ID. Invalid/late có thể xem trong lịch sử chất lượng của nguồn, không trộn vào các mẫu hợp lệ dùng đánh giá đợt. Báo cáo nguồn hiển thị tối đa 200 bản tin gần nhất; episode list tối đa 100, phù hợp dữ liệu demo.

## Kiểm chứng và giới hạn

`connectors/environment/replay.json` có expected results: 16 observation khác nhau, một lần duplicate trong fixture, một invalid, một late, một gap, hai mẫu bị cooldown và đúng hai episode. Script chọn điểm bắt đầu sau watermark hiện có để chạy nhiều lần mà không xóa lịch sử; trong mỗi run, replay lại nguyên event ID phải không sinh thêm observation/case/episode.

`demo:verify:phase5` đối chiếu fixture, lineage/raw/normalized, quyền ingestion/cán bộ, file và báo cáo chung, thu hồi membership bằng token còn hạn, rule snapshot qua thay đổi active, lỗi engine rồi tự phục hồi. Nó có thể dừng/khởi động engine và đổi quyền demo tạm thời trong finally; chỉ chạy trên stack demo riêng, tuần tự với bộ khác.

Unit kiểm tra chất lượng/normalize và bundle; browser mở lineage và hoàn tất hồ sơ bằng chứng sạch trên điện thoại. Kết quả trong `test-results/phase5-integration.json` và `phase5-lineage-mobile.png`; không lưu secret vào report. CI kiểm tra source sạch trên Linux. Mốc review/merge vẫn do đồng đội sau các giai đoạn, không tự ghi approval.

Chưa có nguồn đo thật, nhiều trạm, rule editor/UI cấu hình, dự báo, benchmark tập lớn hoặc production. Thêm nguồn/adapter mới cần định nghĩa rõ đơn vị, nhãn, thời gian và expected results. G03 thuộc giai đoạn tiếp theo.
