# Giai đoạn 2 — Luồng sự cố cơ sở vật chất G01

> Tài liệu mô tả mốc giai đoạn 2. Nhánh hiện tại đã bổ sung giai đoạn 3; gửi nghiệm thu cần bằng chứng sạch của task hiện tại. Dùng [hướng dẫn giai đoạn 3](PHASE-3.md) khi chạy phiên bản mới.

Giai đoạn này hoàn thành luồng nghiệp vụ cơ bản theo `ROADMAP-CHUC-NANG-SIROCCO-SCHOOLOPS.md`: báo sự cố, xác minh/trả bổ sung, giao người hoặc tổ và hạn xử lý, nhận việc, lưu biện pháp/kết quả, nghiệm thu/trả lại, đóng và xem lịch sử. Tệp bằng chứng, quét tệp, outbox/worker và đối soát tự động thuộc giai đoạn 3.

## Khởi động và thử ngay

```powershell
cd sirocco-schoolops
pnpm install --frozen-lockfile
pnpm demo:init
pnpm demo:up
pnpm demo:verify
pnpm demo:verify:g01
pnpm test:e2e
```

Mở <http://localhost:8088>. Trên máy mới, cài Docker Desktop/WSL2, Node >=22.16 và pnpm theo `packageManager` trước. `demo:init` sinh mật khẩu riêng cho máy, không làm đổi mật khẩu của realm đã import vào database. Không xóa volume để đổi mật khẩu. Dùng `DEMO_PASSWORD` trong `.env` local; không đưa file này lên Git hay gửi người khác.

Năm tài khoản giả lập vẫn giữ từ giai đoạn 1: `reporter`, `coordinator`, `technician`, `approver`, `admin`. Mở bốn cửa sổ/profile trình duyệt riêng, hoặc đăng xuất rồi đổi tài khoản. Các tab trong cùng profile dùng chung phiên Keycloak.

1. **reporter:** “Báo sự cố mới”, chọn phòng A101 và Máy chiếu A101, nhập tiêu đề/mô tả, gửi. Ghi lại mã `G01-xxxxxx`.
2. **coordinator:** tìm theo mã, mở chi tiết. Nhập lý do rồi “Trả bổ sung”.
3. **reporter:** làm mới hồ sơ, đọc lý do trong lịch sử, sửa mô tả, “Bổ sung và gửi lại”.
4. **coordinator:** “Tiếp nhận sự cố”; chọn Kỹ thuật viên Demo **hoặc** Tổ cơ sở vật chất, chọn Nghiệm thu Demo, đặt hạn trong tương lai, “Giao xử lý”.
5. **technician:** bật “Công việc của tôi”, mở hồ sơ, “Nhận xử lý”. Nhập biện pháp và kết quả, có thể “Lưu kết quả” mà chưa chuyển bước, rồi “Gửi nghiệm thu”.
6. **approver:** xem kết quả, nhập lý do và “Trả lại xử lý”.
7. **technician:** làm mới, sửa biện pháp/kết quả, gửi nghiệm thu lần hai.
8. **approver:** “Phê duyệt và đóng hồ sơ”. Xem người quyết định và thời điểm đóng. Người xử lý không được tự nghiệm thu.
9. **reporter:** làm mới, kiểm tra trạng thái đóng, hai lý do trả lại và kết quả từng lần trong timeline. Mở thông tin phiên bản để xem package/schema/workflow/process/definition/task.

Tìm kiếm theo mã, tiêu đề hoặc mô tả; lọc trạng thái; phân trang 25 hồ sơ. “Công việc của tôi” chỉ hiện hồ sơ đang cần chính người dùng thao tác, bao gồm công việc tổ chưa được nhận. Sau khi một thành viên nhận, chỉ người đó tiếp tục xử lý. Danh sách và chi tiết đều theo quyền hiện hành.

## Quy trình và quyền

| Trạng thái   | Nhiệm vụ Flowable | Người thao tác                                  | Kết quả                                           |
| ------------ | ----------------- | ----------------------------------------------- | ------------------------------------------------- |
| verification | verify            | Điều phối được gắn vào hồ sơ                    | Tiếp nhận → assignment; trả có lý do → supplement |
| supplement   | supplement        | Người báo chính hồ sơ                           | Bổ sung → verification                            |
| assignment   | assign            | Điều phối được gắn                              | Giao người/tổ, nghiệm thu và hạn → assigned       |
| assigned     | receive           | Kỹ thuật viên được giao/thành viên tổ hiện hành | Nhận việc → in_progress                           |
| in_progress  | repair            | Kỹ thuật viên đã nhận                           | Lưu kết quả tại chỗ hoặc gửi → acceptance         |
| acceptance   | approve           | Người nghiệm thu được giao, khác người xử lý    | Trả có lý do → in_progress; phê duyệt → closed    |
| closed       | process ended     | Không còn thao tác chuyển bước                  | Lưu người quyết định/thời điểm đóng               |

API kiểm tra JWT, membership đang bật, vai trò, quyền trên hồ sơ, người/nhóm được giao, revision và nhiệm vụ hiện tại trên engine. Có cùng vai trò không đồng nghĩa được đọc mọi hồ sơ. Quản trị kỹ thuật không mặc định có quyền nghiệp vụ. Điều phối demo là tài khoản điều phối đang bật đầu tiên theo ID; hỗ trợ nhiều điều phối hoặc chuyển người phụ trách chưa nằm trong giao diện này.

Hạn được nhập theo giờ máy người dùng, chuyển ISO UTC trong API, hiển thị theo giờ Việt Nam. Task nhận việc/xử lý trên engine có cùng hạn. Hạn qua không tự đóng hồ sơ hoặc tự đánh giá kết quả.

## Những phần mã cần học

- `apps/api/src/db.ts`: migration 2 thêm danh mục 3 phòng/4 thiết bị, tổ và thành viên, hồ sơ và sự kiện. Migration giữ nguyên dữ liệu nền tảng.
- `packs/g01/v1/workflow.bpmn20.xml`: các task/gateway và hai vòng trả lại. Luồng chạy thật trên Flowable, không sửa trạng thái trực tiếp để demo.
- `apps/api/src/g01-policy.ts`: quyền đọc và hành động theo người, vai trò và bước.
- `apps/api/src/g01.ts`: validation, tạo mã, idempotency, gắn phiên bản, nối task, thao tác và lịch sử.
- `apps/api/src/workflow.ts`: adapter REST dùng chung, không chứa tên phòng hay quy tắc trường học.
- `apps/web/src/G01.tsx`: danh sách/bộ lọc, biểu mẫu, chi tiết, tác vụ và timeline dùng API thật. Màn thử giai đoạn 1 vẫn có ở “Nhiệm vụ nền tảng”.

Hồ sơ giữ `g01@1.0.0`, `g01-case@1.0.0`, `g01-facilities@1.0.0`, bản chụp schema và **process definition ID chính xác** ngay từ khi tạo. API không tra `latest` khi chuyển bước. Đây là tham chiếu tĩnh của giai đoạn 2; CLI validate/activate gói và nâng v1/v2 được làm ở giai đoạn 4.

## Tính nhất quán và giới hạn

Gửi lại cùng Idempotency-Key/nội dung trả hồ sơ cũ; khác nội dung trả 409. Các thao tác phải gửi revision đang xem. API khóa dòng để hai yêu cầu không cùng vượt bước và ghi ý định trước khi gọi engine. Nếu kết quả gọi engine không chắc chắn, hồ sơ giữ trạng thái pending/cần đối soát và chặn thao tác tiếp. **Chưa có worker tự phục hồi**, không gửi lại mù để đẩy bước; đó là giai đoạn 3. Không coi các cơ chế cơ bản này là đã hoàn tất kiểm thử mọi lỗi phân tán.

Giai đoạn 2 chưa có upload/quét/chính sách bằng chứng bắt buộc, báo cáo tổng hợp, gói có thể kích hoạt, G02/G03 hoặc cấu hình production. Mẫu G01 v1 hiện cho gửi nghiệm thu bằng biện pháp/kết quả văn bản; chỉ gọi là G01 hoàn chỉnh về bằng chứng sau giai đoạn 3.

## Khi Docker gặp lại lỗi socket trên Windows

Nếu hộp lỗi chứa `dockerInference` hoặc `docker-secrets-engine/engine.sock` và engine không chạy:

```powershell
pnpm docker:repair
pnpm demo:up
```

Helper chỉ xử lý các socket runtime 0 byte/reparse point đã biết trong LocalAppData, dừng tiến trình Docker và distro `docker-desktop`, đổi tên thư mục runtime sang bản dự phòng rồi mở lại Docker. Không xóa image/volume/WSL disk. Nếu engine đang chạy, helper dừng ngay mà không khởi động lại. Nếu có nội dung lạ trong thư mục runtime, helper báo lỗi để kiểm tra thủ công. Không dùng “Reset to factory defaults” cho lỗi này. Đây là workaround cho máy Windows này, chưa khẳng định sửa nguyên nhân nội bộ Docker.

Sau khi khởi động lại, mở từ <http://localhost:8088> và đăng nhập lại; không dùng URL auth cũ có state/nonce của phiên trước.

## Bài tập cho hai người

- **Bạn:** chạy kiểm thử tích hợp, lần theo một request `assign` từ API tới task Flowable; giải thích vì sao biết ID hồ sơ vẫn chưa đủ quyền đọc. Thử gọi thao tác nghiệm thu bằng reporter và quan sát bị chặn.
- **Người còn lại:** demo hai vòng trả lại trên web; lần theo task `repair` và gateway nghiệm thu trong BPMN; ghi lại một điểm UX cần cải thiện. Chạy `pnpm test:e2e` sau khi thay đổi.
- **Cùng làm:** tạo một hồ sơ mới không theo dữ liệu kiểm thử, hoàn tất qua bốn tài khoản và đối chiếu timeline. Chốt yêu cầu bằng chứng để triển khai giai đoạn 3.
