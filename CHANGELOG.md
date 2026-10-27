# Changelog

## Chưa phát hành — giao diện làm việc

- Sắp xếp không gian theo vai trò; chuyển nhiệm vụ nền tảng vào công cụ kiểm tra, giữ phần việc đang chờ và hướng dẫn bước tiếp theo trong hồ sơ.
- Dùng liên kết có mã hồ sơ, hỗ trợ tải lại và lịch sử trình duyệt; trên màn hình nhỏ tách danh sách với chi tiết, trả focus khi quay lại.
- Chỉnh bố cục, tương phản, kích thước thao tác và chọn tệp; kiểm tra định dạng/kích thước theo chính sách của từng phiên bản gói trước khi tải.
- Việt hóa đăng nhập bằng theme kế thừa của Keycloak, đồng bộ cấu hình trình bày mà không tạo lại realm hoặc dữ liệu.
- Thêm kiểm thử điều hướng, chính sách tệp, đăng nhập tiếng Việt và bố cục mobile. Bản này cần phản hồi người dùng thật; các tag RC đã phát hành giữ nguyên.

## 0.1.0-rc.2 — 2026-10-25

- Dependency audit được lưu trong bằng chứng release và ràng buộc source sạch/lockfile; release notes được chọn theo phiên bản thay vì cố định RC1.
- Ghi SPDX Apache-2.0 và tham chiếu LICENSE/NOTICE trong từng tệp mã/công cụ do đội viết; giữ riêng giấy phép thành phần bên ngoài và không đổi bundle đã pin.
- Xử lý phản biện tài liệu: hướng dẫn lấy đúng source, mô tả bài toán/đóng góp, sơ đồ kiến trúc, ảnh và video G01 có revision/checksum.
- Bổ sung thử nhiều vai trò trên một stack, kế hoạch người dùng mục tiêu, điều kiện đạt/rớt, ma trận quyền, mẫu lỗi và CODE_OF_CONDUCT; giữ trạng thái chờ người thử và review mã.
- Nâng Ajv lên 8.18.0 và fast-xml-parser lên 5.7.0 sau audit production; thêm cổng CI và lưu notice MIT của entities từ commit upstream đã pin.
- Bỏ đường dẫn profile cá nhân trong source mới, giữ helper Docker Windows theo cấu hình local; kiểm tra đường dẫn công khai và phiên bản Node.

## 0.1.0-rc.1 — 2026-10-25

- Thêm cold backup mã hóa và restore vào project mới; kiểm chứng ba database, checksum kho tệp, đăng nhập/workflow/idempotency/ACL/lineage và đối soát báo cáo sau khôi phục.
- Thông báo lỗi gateway/quota có bước tiếp theo, giữ biểu mẫu, điều tiết polling; kiểm thử mobile cho các vai trò xử lý và từ chối browser flaky khi đóng gói.
- Khóa digest image, gắn source/version vào runtime/report, kiểm tra OpenAPI/link/nguồn riêng tư, tạo archive tái tạo được cùng manifest/checksum/notes/bằng chứng.
- Chốt Apache-2.0 cho mã mới, nguồn gốc/notice, inventory/SBOM, hướng dẫn cài/người dùng/vận hành/demo/bảo mật. Phản hồi người dùng thật và review chuỗi PR còn chờ.

## Nội dung tích hợp từ các giai đoạn trước

- Thêm G02 PM2.5 replay có expected results, quality/raw/normalized, rule/episode/lineage và cán bộ đóng có lý do qua Case/Task/Evidence dùng chung.
- Thêm G03 tình huống an toàn giả lập, ACL theo case/current role, kiểm tra mọi đường list/search/report/notification/file, nhật ký truy cập không ghi nội dung; admin không có quyền đọc ngầm.
- Bổ sung tài khoản demo theo subject/issuer, bộ nghiệm thu 4–6, kiểm thử browser mobile và tài liệu/OpenAPI/CI.

- Thêm registry gói bất biến, validator schema/seed/role/action/BPMN trong tập hỗ trợ, CLI validate/install/activate và UI trạng thái/lỗi; case pin revision, v1 giữ chính sách cũ còn v2 yêu cầu ảnh sạch.

- Thêm upload/cách ly bằng chứng vào SeaweedFS, kiểm tra định dạng/kích thước/checksum, quét ClamAV thật và tải tệp theo quyền; nghiệm thu yêu cầu bằng chứng sạch gắn với lần xử lý hiện tại.
- Thêm outbox/worker/retry/đối soát theo business key và task history; guard duy nhất tại engine chặn trùng workflow sau mất phản hồi; audit ghi policy/phiên bản/bằng chứng và phân biệt hệ thống quét với người tải.
- Thêm báo cáo đang mở/quá hạn/hoàn thành và danh sách nguồn dùng cùng quyền; kiểm chứng thu hồi membership/role/tổ bằng token còn hạn.
- Bổ sung kiểm thử lỗi engine/worker/scanner/storage và crash sau engine mutation, kiểm thử web upload/download và hai vòng trả lại; cập nhật Compose, OpenAPI, CI và hướng dẫn giai đoạn 3.

- Tách lại lịch sử nền tảng/G01 thành các commit tiếng Việt theo chức năng trên nhánh mới; giữ nhánh cũ, ghi đối chiếu snapshot và kết quả kiểm tra, bổ sung hướng dẫn đóng góp và mẫu Issue/PR.

- Add full phase 2 G01 business flow: incident catalog/report/case code, verification and supplementation, individual/team assignment with deadline, receipt, work notes, acceptance/rework and approval/closure.
- Add case-scoped role/assignee/step checks, revision checks, pinned package/schema snapshot/workflow definition and chronological actor/action history.
- Add responsive case list/search/status/my-work filters, detail/action forms and timeline; retain the phase 1 task screen.
- Add live G01 verification, HTTP permission/engine mapping tests, four-role browser scenario and phase 2 learning/demo guide.
- Add a bounded Windows helper for the observed stale Docker runtime socket issue; preserve data volumes.

- Add phase 1 web/API workspace, local Compose services and generated demo realm.
- Add JWT verification/current membership checks and one engine-backed task flow.
- Add API/auth tests, live integration verification, browser test and CI workflow.
- Add setup/architecture/learning guide and initial OpenAPI contract.

Full-stack acceptance requires the live integration and browser suites to pass; see `docs/PHASE-1.md`.
