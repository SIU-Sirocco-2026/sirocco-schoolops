# Đối chiếu yêu cầu giai đoạn 1

Phạm vi đối chiếu là **Giai đoạn 1 — Có nền tảng chạy chung** trong roadmap chức năng đã thống nhất. Các chức năng G01 đầy đủ, tệp/quét tệp, gói v1/v2, G02/G03 và backup/restore giữ ở các giai đoạn tiếp theo.

## Ma trận yêu cầu và bằng chứng

| Yêu cầu                                          | Nơi triển khai                                                                 | Bằng chứng kiểm chứng                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Đăng nhập qua Identity, API nhận diện người dùng | `scripts/init.mjs`, `apps/web/src/main.tsx`, `apps/api/src/auth.ts`, `/api/me` | E2E đăng nhập thật vào Keycloak; integration đối chiếu user/role từ API và PostgreSQL                                                                            |
| Đăng xuất khỏi ứng dụng và phiên Identity        | Nút đăng xuất gọi adapter Keycloak                                             | E2E đăng xuất rồi bấm đăng nhập lại; phải hiện biểu mẫu nhập tài khoản, không tự khôi phục phiên cũ                                                              |
| Có năm vai trò ban đầu                           | Realm seed và migration `memberships`                                          | E2E đăng nhập reporter, technician, coordinator, approver, admin; đối chiếu vai trò và thao tác hiển thị                                                         |
| Web gọi API qua gateway                          | `infra/apisix/apisix.yaml`, cấu hình Vite và web/API                           | Luồng browser qua :8088; integration kiểm tra header `X-Sirocco-Gateway: APISIX`; API không publish port ra host                                                 |
| API từ chối truy cập không hợp lệ                | JWT verification và middleware đọc membership hiện hành                        | Live integration từ chối token thiếu/sai, sai vai trò và thao tác không được giao; unit tests kiểm tra issuer/audience/expiry/signature và membership bị disable |
| Kết nối dữ liệu và workflow engine thật          | `apps/api/src/db.ts`, `workflow.ts`, `packs/foundation/task.bpmn20.xml`        | Integration tạo run có process/definition ID, kỹ thuật viên hoàn tất task, history engine xác nhận kết thúc; người tạo đọc lại kết quả từ PostgreSQL             |
| Tạo, tìm và hoàn tất nhiệm vụ theo quyền         | API foundation, danh sách/chi tiết và thao tác trên web                        | E2E hai browser context độc lập; người báo tạo và đọc lại kết quả, người nhận việc hoàn tất; người khác không có thao tác tương ứng                              |
| Cấu hình mẫu và dữ liệu giả lập                  | `.env.example`, `demo:init`, realm seed, migration                             | `demo:init` sinh cấu hình local; CI khởi động bằng source và volume sạch; secret/generated files được Git ignore                                                 |
| Trạng thái sẵn sàng                              | API live/ready, Compose healthcheck                                            | Compose đợi dependency; readiness kiểm tra PostgreSQL, Keycloak và Flowable; integration gọi qua gateway                                                         |
| Hướng dẫn khởi động từ repo                      | README, `docs/PHASE-1.md`, lockfile và Dockerfiles                             | Windows local và runner Linux sạch chạy install/build/up/integration/E2E; artifact CI lưu báo cáo                                                                |

## Điều kiện nghiệm thu

- TypeScript, build và 12 unit/API/adapter tests đạt.
- Tám nhóm live integration checks đạt trên stack thật.
- Bốn browser tests đạt: luồng nhiệm vụ và đăng xuất; ba vai trò bổ sung cùng đăng xuất. Kết hợp các test bao phủ đủ năm tài khoản demo.
- Viewport điện thoại không tràn ngang; ảnh desktop/mobile được sinh bởi browser test.
- API restart không tăng số deployment của gói nền tảng và giữ dữ liệu đã lưu. Đây là phép thử restart, không phải backup/restore.
- CI của commit đang review phải thành công; xem [checks của PR #4](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/pull/4/checks).

## Giới hạn bằng chứng

Unit test dùng dependency thay thế chỉ chứng minh nhánh kiểm tra token/membership trong API. Live tests mới chứng minh kết nối Keycloak, gateway, PostgreSQL và Flowable thật. Việc một vai trò đăng nhập được không có nghĩa đã có quy trình G01 hoàn chỉnh cho vai trò đó.

Hệ thống hiện phục vụ local qua loopback. Tài liệu không tuyên bố đã triển khai production, có thu hồi tức thì mọi token sau logout, hoặc đã hoàn thành các giai đoạn sau. Phần mã bàn giao nằm trên nhánh `feat/phase-1-foundation` và PR #4; trạng thái merge được xem trực tiếp trên PR.
