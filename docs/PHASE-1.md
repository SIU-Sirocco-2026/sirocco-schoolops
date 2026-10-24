# Giai đoạn 1 — Nền tảng dùng chung

## Phạm vi

Bản này nối web React/TypeScript, API Express, PostgreSQL, Keycloak, APISIX và một quy trình Flowable có một user task. Đây là bài kiểm chứng nền tảng; chưa phải quy trình G01 báo hỏng/nghiệm thu đầy đủ.

Mã nguồn và cấu hình được cung cấp cùng kiểm thử. Chỉ xác nhận giai đoạn hoàn thành sau khi `demo:verify` và kiểm thử trình duyệt chạy đạt trên hệ thống thật. Việc build thành công không thay cho kết quả tích hợp.

## Các phần có trong mã

- Đăng nhập/đăng xuất qua Keycloak, authorization code + PKCE S256; token chỉ ở bộ nhớ trình duyệt.
- Năm tài khoản giả lập tương ứng người báo, điều phối, kỹ thuật viên, nghiệm thu và quản trị kỹ thuật.
- APISIX định tuyến web/API và giới hạn lưu lượng; API tự xác minh chữ ký RS256, issuer, audience, hạn token và membership hiện hành trong PostgreSQL. Chưa cấu hình OIDC plugin xác minh token thêm một lần ở gateway.
- Người báo/điều phối tạo nhiệm vụ thử; hệ thống giao cho kỹ thuật viên demo. Kỹ thuật viên khác vai trò không tự có quyền tạo; người tạo không tự có quyền hoàn tất.
- Hồ sơ thử lưu PostgreSQL, process và task chạy trong Flowable; lưu process definition ID và package version trên hồ sơ.
- Danh sách/chi tiết, trạng thái nhiệm vụ, xác nhận hoàn tất và thời gian hiển thị theo giờ Việt Nam.
- Seed, migration theo phiên bản, cấu hình mẫu, kiểm tra readiness và CI.

## Luồng cần hiểu

```text
Browser ── đăng nhập ──> Keycloak
   │ access token (memory)
   ▼
APISIX :8088 ── /api/* ──> Express API
   │                          ├─ JWT + membership/role checks
   └─ /* ──> Web              ├─ PostgreSQL: runs + audit
                              └─ Flowable: process + user task
```

Identity, workflow và ứng dụng có tài khoản/database riêng. Database, API và Flowable không publish port ra host. Chỉ gateway và Keycloak bind vào loopback cho local demo. Chưa phải cấu hình triển khai Internet/production; cần hostname/HTTPS và cơ chế quản lý secret phù hợp trước khi triển khai như vậy.

## Cài và chạy

Yêu cầu: Node.js từ 22.16, pnpm 11.25, Docker Engine/Compose hoạt động với Linux containers. Trên Windows, Docker Desktop phải khởi động được và WSL phải sẵn sàng nếu dùng WSL backend.

```powershell
pnpm install --frozen-lockfile
pnpm demo:init
pnpm demo:up
```

Sau khi các dịch vụ sẵn sàng:

- SchoolOps: http://localhost:8088
- Keycloak quản trị local: http://localhost:8180 (username `admin`, password `KEYCLOAK_ADMIN_PASSWORD` trong `.env`).
- Tài khoản ứng dụng: `reporter`, `coordinator`, `technician`, `approver`, `admin`.
- Password ứng dụng: giá trị `DEMO_PASSWORD` trong `.env` của máy vừa khởi tạo. Tài khoản `admin` của realm ứng dụng khác tài khoản quản trị Keycloak.

`demo:init` sinh secret ngẫu nhiên và realm local, không ghi password vào Git hay in ra log. Chạy lại giữ secret đã có. Database được tạo ở lần khởi động PostgreSQL đầu tiên; sửa password trong `.env` không tự đổi password của database/user đã lưu. Realm import không ghi đè realm đã tồn tại.

Không chia sẻ `.env` hoặc `infra/generated/realm.json`. Mỗi máy khởi tạo cấu hình local riêng.

## Thử luồng

1. Đăng nhập `reporter`, nhập nội dung và tạo nhiệm vụ.
2. Xem mã nhiệm vụ/process ID ở chi tiết. Người báo không có nút hoàn tất.
3. Đăng xuất; đăng nhập `technician` trong cùng trình duyệt, hoặc dùng browser context/profile riêng.
4. Mở nhiệm vụ và chọn **Xác nhận hoàn tất**.
5. Đăng nhập lại `reporter` hoặc làm mới phiên người báo: nhiệm vụ có trạng thái đã hoàn tất.
6. Đăng nhập `approver`: không thấy nhiệm vụ không thuộc quyền của tài khoản này.

## Kiểm tra tự động

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm demo:verify
pnpm exec playwright install chromium
pnpm test:e2e
```

`demo:verify` kiểm tra gateway, readiness, token sai, membership, tạo task thật, gửi lặp, nội dung khác cùng khóa, quyền, hoàn tất và khả năng đọc lại kết quả. Script dùng client `schoolops-smoke` chỉ phục vụ kiểm thử local bằng password grant; ứng dụng web luôn dùng authorization code + PKCE. Không mang client smoke này sang production.

Playwright thử đăng nhập browser qua Keycloak bằng hai context, tạo task, hoàn tất, xem lại kết quả và kiểm tra viewport điện thoại. Báo cáo/ảnh ở `test-results/` và `playwright-report/`; các thư mục này được Git ignore.

Unit/API tests không dùng dịch vụ Docker; chúng kiểm tra token với khóa RSA tạm và hành vi API với dependency thay thế. Chúng không chứng minh engine/database thật đã chạy.

## Lệnh vận hành

```powershell
pnpm demo:logs
docker compose ps
pnpm demo:down
```

Lệnh down giữ volume dữ liệu. Chưa cung cấp reset/xóa volume hoặc backup/restore ở giai đoạn này.

Để sửa web nhanh khi full stack đã chạy, dùng `pnpm dev` rồi mở http://localhost:5173. Vite chuyển `/api` qua gateway đang chạy ở :8088. Sau khi sửa API hoặc cấu hình build, dùng `pnpm demo:up` để build và chạy lại.

## Lỗi và giới hạn

- Khi kết quả tạo workflow chưa chắc chắn, API giữ hồ sơ `needs_reconciliation` thay vì tự tạo lại process. Giai đoạn này chưa có worker/CLI tự đối soát các hồ sơ đó. Kiểm tra theo business key bằng run ID trên Flowable trước khi khôi phục.
- Cùng Idempotency-Key/nội dung trả lại hồ sơ cũ; khác nội dung bị conflict. Không tuyên bố exactly-once toàn hệ thống.
- Khi complete timeout, lần thử tiếp theo kiểm tra task/history trước khi ghi kết quả local; vẫn cần kiểm thử lỗi một phần sâu hơn ở giai đoạn độ tin cậy.
- Chưa có tệp/SeaweedFS/ClamAV, G01 đầy đủ, G02/G03, validator gói hay báo cáo nghiệp vụ. Chúng thuộc các giai đoạn sau.
- Không coi membership local và trạng thái khóa tài khoản Keycloak là cùng một cơ chế thu hồi tức thời. Token hết hạn ngắn; disable membership tại ứng dụng chặn request mới theo unit/API test, cần tiếp tục kiểm chứng trên stack thật.
- Giấy phép phát hành của mã mới còn chờ rà soát/chốt. Giai đoạn này không sao chép mã Eco-Track.

## Bài làm quen cho hai người

1. Đọc `apps/web/src/main.tsx`: tìm chỗ đăng nhập, gắn token và gọi API.
2. Đọc `apps/api/src/auth.ts` và `app.ts`: xem JWT được kiểm tra và vì sao chỉ assignee/technician được complete.
3. Đọc `packs/foundation/task.bpmn20.xml`: nhận diện start, user task, end và biến assignee.
4. Thử đổi nhãn màn hình; sau đó thêm một trường hiển thị ở web/API có kiểm tra đầu vào. Không đổi workflow đã triển khai dưới cùng tên phiên bản.

## Tài liệu công nghệ đã đối chiếu

- [Keycloak JavaScript adapter và PKCE](https://www.keycloak.org/securing-apps/javascript-adapter)
- [Keycloak container](https://www.keycloak.org/server/containers)
- [APISIX file-driven standalone](https://apisix.apache.org/docs/apisix/deployment-modes/)
- [Flowable OSS REST API](https://www.flowable.com/open-source/docs/bpmn/ch14-REST)
