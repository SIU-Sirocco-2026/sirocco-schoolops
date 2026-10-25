# Giai đoạn 3 — Bằng chứng và phục hồi lỗi G01

Giai đoạn này bổ sung bằng chứng sạch, hàng đợi lệnh bền vững, đối soát lỗi và báo cáo theo quyền vào luồng G01 hiện có. Cơ chế validate/activate gói v1/v2, G02 và G03 vẫn thuộc các giai đoạn sau.

## Cài và chạy

Trên Windows của dự án này, chạy helper ngoài repo trước khi làm việc với Docker:

```powershell
$codexProfile = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
& (Join-Path $codexProfile 'tools/windows-docker/ensure-docker.ps1')
cd sirocco-schoolops
pnpm install --frozen-lockfile
pnpm demo:init
pnpm demo:up
```

Helper tái sử dụng engine khỏe và xử lý ngữ cảnh khởi động Windows. Không khởi động Docker Desktop trực tiếp từ shell MSIX của agent, không reset/xóa volume. Máy khác khởi động Docker bằng cách phù hợp với hệ điều hành rồi dùng các lệnh pnpm ở trên.

Mở <http://localhost:8088>. Mật khẩu tài khoản demo nằm trong `DEMO_PASSWORD` của `.env` local. `demo:init` bổ sung khóa S3 ngẫu nhiên, giữ các secret đã có và sinh `infra/generated/s3.json`; không commit hay công khai các file này. API và worker phải dùng cùng cấu hình. Khi nâng cấp realm/database đang có, không xóa volume để đổi mật khẩu.

Compose thêm SeaweedFS 4.48, ClamAV 1.5.4, worker và tác vụ `workflow-guard`. Cả S3, scanner, database và engine đều ở mạng nội bộ, không mở port ra host. API dùng S3 có credential; trình duyệt chỉ đi qua API có kiểm tra quyền. Volume `seaweed-data` giữ dữ liệu và metadata filer tại `/data`, `clamav-data` giữ cơ sở chữ ký. Lần khởi động scanner đầu có thể mất thời gian tải/cập nhật chữ ký.

`workflow-guard` kết thúc thành công rồi API mới chạy: đây là tác vụ thiết lập một lần mỗi lần Compose khởi động, không phải daemon lỗi. Migration 3 thêm bảng/cột mới và giữ dữ liệu cũ; migration 4 thêm danh tính hệ thống quét không có quyền đăng nhập và sửa cách ghi chủ thể sự kiện quét. Nó áp dụng chính sách bằng chứng ban đầu cho hồ sơ cũ; hồ sơ đã đóng không được mở lại hay chuyển bước.

## Demo qua bốn vai trò

1. Reporter tạo sự cố máy chiếu A101; coordinator xác minh và giao việc/nghiệm thu/hạn; technician nhận xử lý như giai đoạn 2.
2. Technician nhập biện pháp/kết quả. Nút gửi nghiệm thu chưa được mở khi chưa có bằng chứng sạch của lần xử lý hiện tại.
3. Chọn PNG/JPEG/PDF/TXT, tối đa **10 MiB** và bấm **Tải bằng chứng**. Giao diện hiện chờ quét, sau đó sạch/bị từ chối/lỗi. Lỗi scanner được tự thử lại; giao diện cập nhật mỗi 4 giây.
4. Khi sạch, tải xuống để kiểm tra file gốc rồi gửi nghiệm thu. API vẫn kiểm tra điều kiện bằng chứng độc lập với nút trên web.
5. Approver trả lại có lý do. Technician phải thêm bằng chứng sạch gắn với task xử lý mới; bằng chứng lần trước vẫn giữ lịch sử nhưng chưa đủ cho lần gửi mới.
6. Approver phê duyệt và đóng. Xem timeline, người/thời điểm, kết quả từng lần và thông tin bằng chứng. Chi tiết kiểm chứng tệp có checksum, người tải và phiên bản scanner.
7. Bấm số **Đang mở / Quá hạn / Hoàn thành** để mở danh sách nguồn. Các chỉ số và danh sách dùng cùng phạm vi quyền hiện hành. Quản trị kỹ thuật không có quyền đọc hồ sơ ngầm.

Mỗi profile trình duyệt có phiên Keycloak riêng. Dùng bốn profile/context hoặc đăng xuất đổi tài khoản. Tệp tải về là attachment có no-store/nosniff/sandbox; không có URL S3 công khai hoặc link tải mang token.

## Hợp đồng bằng chứng

`packs/g01/v1/evidence-policy.json` khai báo `g01-evidence@1.0.0`: ít nhất một file `clean`, ở bước `repair`, gắn đúng task hiện tại. Khi tạo case, policy và version được chụp vào case. Chưa có CLI thay đổi/kích hoạt gói; không sửa nội dung policy đã phát hành để thay đổi ngầm hồ sơ đang chạy.

`POST /api/g01/cases/{id}/evidence` nhận bytes `application/octet-stream`, header `X-File-Name` là tên UTF-8 percent-encoded và `Idempotency-Key` UUID. Không nhận đường dẫn hay object key từ client. Phần mở rộng phải phù hợp chữ ký PNG/JPEG/PDF hoặc văn bản UTF-8; không phải bộ phân tích sâu mọi định dạng tài liệu. Mỗi file lưu case, người tải, task/bước, checksum SHA-256, kích thước, MIME, thời điểm và phiên bản policy/gói. Khóa lặp cùng nội dung/tên trả lại file cũ; đổi nội dung trả 409. Khi mất phản hồi upload, gửi lại cùng khóa/tệp.

Worker lấy file từ bucket `quarantine`, đối chiếu checksum/kích thước, quét qua giao thức INSTREAM của ClamAV rồi ghi bytes sạch vào bucket `clean`. Chỉ sau đó transaction mới ghi trạng thái sạch và audit. Crash trước commit khiến lần sau quét lại an toàn. File gốc cách ly được giữ để có thể xử lý lại sau crash; chưa có cơ chế tự xóa/retention ở giai đoạn này. File không có metadata do transaction upload thất bại không được truy cập qua API.

Phản hồi scanner lạ, bị cắt, lỗi hoặc timeout không được coi là sạch. `error` tự retry với backoff tối đa 60 giây; `rejected` không tự đổi thành sạch. Download kiểm tra quyền hiện hành, trạng thái sạch và checksum bytes tải về; tệp sai checksum bị chặn.

## Outbox, retry và đối soát

API khóa dòng case, kiểm tra vai trò/người/bước/revision và ghi **toàn bộ ý định** vào `workflow_commands` cùng transaction đặt case pending. Sau commit, API thử xử lý ngay để giữ trải nghiệm nhanh; worker dùng cùng executor cho các lệnh còn lại. Khi engine không truy cập được, lệnh hợp lệ vẫn được lưu, trả 202. Một xung đột task/người đã chứng minh thì bị từ chối.

Executor khóa command và case, kiểm tra process/definition/old task ID; không đẩy bước chỉ bằng trạng thái UI. Khi tạo, tra lịch sử bằng business key; khi chuyển bước, chỉ hoàn tất **task ID cũ**, hoặc xác nhận task đó đã kết thúc trong history rồi cập nhật projection. Nhóm nhận việc được claim một lần theo người đã nhận. Projection, sự kiện hoàn thành và trạng thái done của command commit chung; unique command event chặn lịch sử hoàn thành bị lặp. Hai yêu cầu cùng revision không cùng vượt bước.

**Chống trùng start không chỉ dựa vào lookup:** `infra/flowable/business-key-guard.sh`, chạy bằng tài khoản chủ DB Flowable riêng, cài unique index trên business key không rỗng của `act_hi_procinst`. Nếu request start trước vẫn đang chạy sau khi client mất kết nối, request lặp cũng phải tuân theo ràng buộc duy nhất trong transaction của engine. API không được cấp quyền vào DB engine. Không xóa history có business key hay tháo index khi còn cần đảm bảo chống trùng; khi nâng phiên bản engine phải kiểm tra lại guard. Đây là tích hợp riêng với Flowable 7.2.0 đang pin.

Lỗi tạm thời giữ `needs_reconciliation`, số lần thử/lỗi/lần thử tiếp nằm trong detail `synchronization`; worker retry tối đa mỗi 60 giây. Web khóa thao tác và tự cập nhật 3 giây khi chờ. Scanner và workflow có vòng xử lý riêng để scanner lỗi không chặn đối soát workflow. Worker health dựa trên heartbeat database.

Nếu một hồ sơ từ giai đoạn 2 đã pending trước khi nâng cấp mà không có đầy đủ command, migration giữ `needs_reconciliation`; không đoán lệnh từ trạng thái. Kiểm tra case_events, engine runtime/history và dữ liệu gốc trước xử lý thủ công. Hồ sơ/lệnh mới của giai đoạn 3 có đầy đủ payload để tự phục hồi.

## Quyền ứng dụng và báo cáo

Mỗi yêu cầu xác minh JWT và đọc `memberships` hiện hành ở database; JWT còn hạn không giữ được quyền đã thu hồi trong ứng dụng. Quyền hồ sơ/tệp còn phụ thuộc vai trò, người được giao, bước và thành viên tổ hiện hành. Download kiểm tra lại membership và quyền sau khi đọc object store. Lệnh đã được chấp nhận hợp lệ trước thu hồi vẫn là công việc đã nhận; thu hồi chặn yêu cầu mới.

Hiện cấu hình nhân sự qua vận hành database; chưa có màn quản trị nhân sự. Ví dụ thu hồi/bật lại technician demo bằng operator có quyền database local:

```powershell
docker compose exec -T postgres psql -U schoolops -d schoolops -c "UPDATE memberships SET enabled=false WHERE username='technician'"
# Khôi phục sau bài thử
docker compose exec -T postgres psql -U schoolops -d schoolops -c "UPDATE memberships SET enabled=true WHERE username='technician'"
```

Đây là thu hồi **quyền ứng dụng**, chưa tuyên bố thu hồi ngay toàn bộ phiên/token Keycloak. Kiểm thử dùng cùng token còn hạn trước và sau khi thay đổi membership/role.

`GET /api/g01/reports`: open là chưa đóng, overdue là chưa đóng và quá `due_at` theo giờ database, completed là đã đóng. `GET /cases?bucket=open|overdue|completed` mở danh sách tương ứng. Chỉ số có thể thay đổi nếu dữ liệu đổi giữa hai lần đọc; không phải snapshot báo cáo cố định. Danh sách phân trang 25 hồ sơ như giai đoạn 2, phù hợp dữ liệu demo; chưa benchmark tập lớn.

## Kiểm chứng

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm demo:up
pnpm demo:verify
pnpm demo:verify:g01
pnpm demo:verify:phase3
pnpm test:e2e
```

`demo:verify:phase3` chủ động dừng/khởi động worker, scanner và engine của **môi trường demo này**, tạo dữ liệu thử có nhãn và tạm thay đổi quyền technician rồi khôi phục trong finally. Chạy tuần tự, không chạy khi người khác đang demo/làm việc trên cùng stack. Test crash dùng tiến trình API phụ chạy production code; dừng đột ngột sau engine mutation và trước commit projection. Nó không sửa DB để đẩy bước nghiệp vụ. File EICAR chỉ là chuỗi kiểm thử antivirus vô hại, tạo trong bộ nhớ.

Xem [ma trận nghiệm thu](verification/phase-3-acceptance.md), [OpenAPI](openapi.yaml). Các phép thử lưu report JSON không chứa secret vào `test-results`; Playwright lưu ảnh và báo cáo local. Không công khai trace có phiên đăng nhập. Kiểm tra CI tại đúng SHA trong PR; bằng chứng local không thay cho trạng thái CI.

Nguồn giao thức/khả năng đã đối chiếu: [ClamD INSTREAM](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), [Flowable REST runtime/history](https://www.flowable.com/open-source/docs/bpmn/ch14-REST), [SeaweedFS](https://github.com/seaweedfs/seaweedfs). Các hành vi quan trọng đã được thử lại trên image pin trong Compose.
