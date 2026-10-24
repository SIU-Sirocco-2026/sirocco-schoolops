# Nghiệm thu giai đoạn 2 — G01

Phạm vi đối chiếu: mục “Giai đoạn 2 — Xử lý trọn một sự cố cơ sở vật chất G01” của roadmap chức năng ngày 24/10/2026. Kế hoạch tổng thể vẫn áp dụng, với bằng chứng/quét tệp/outbox/đối soát/báo cáo ở giai đoạn 3 và validate/activate gói v1/v2 ở giai đoạn 4.

## Ma trận yêu cầu và bằng chứng

| Yêu cầu giai đoạn 2                                                                            | Hiện thực                                                                                                      | Bằng chứng kiểm tra                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chọn phòng/thiết bị, nhập mô tả, cấp mã hồ sơ                                                  | Danh mục migration 2; kiểm tra thiết bị thuộc phòng; API tạo case + process verify                             | `verify-g01.mjs`: catalog/validation, tạo `G01-xxxxxx`, kiểm tra real task ID; browser tạo máy chiếu A101 từ form điện thoại                                                   |
| Tiếp nhận hoặc trả bổ sung có lý do; người báo gửi lại                                         | verify → supplement → verify; kiểm tra lý do tối thiểu 5 ký tự; lưu mô tả cũ/mới                               | Integration và browser đi nhánh trả bổ sung, từ chối lý do rỗng; đọc lại lịch sử                                                                                               |
| Giao người/nhóm và hạn                                                                         | assign → receive; người/tổ hiện hành, người nghiệm thu khác kỹ thuật viên; dueAt trên case và task             | Integration kiểm tra trực tiếp assignee, candidate group và dueDate trên Flowable; nhóm claim task có historic assignee là người nhận                                          |
| Kỹ thuật viên nhận việc, ghi biện pháp/kết quả                                                 | receive → repair; save_work không hoàn tất task; submit → approve                                              | Integration kiểm tra trạng thái/task ID sau lưu; browser nhận/lưu/gửi trên điện thoại; chặn gửi trước nhận và nội dung rỗng                                                    |
| Nghiệm thu phê duyệt/trả lại có lý do; đóng sau phê duyệt                                      | approve → repair hoặc end; lưu decision_by/closed_at                                                           | Integration và browser đi cả vòng trả lại, kỹ thuật viên gửi lần hai, người nghiệm thu đóng; history engine xác nhận kết thúc cùng businessKey/definition                      |
| Danh sách/bộ lọc, chi tiết, công việc của tôi, timeline                                        | Tìm mã/tiêu đề/mô tả, lọc trạng thái/mine; chi tiết và hành động theo quyền; lịch sử người/thời điểm/kết quả   | Integration kiểm tra danh sách theo quyền, mine ở verify/receive/closed và bộ lọc; browser tìm, xem chi tiết, lịch sử hai vòng trả và trạng thái đóng                          |
| Vai trò, người được giao, bước hiện tại và quyền hồ sơ tại API                                 | Middleware current membership, g01-policy, kiểm tra revision + task thật trước lệnh engine                     | 18 unit/HTTP/adapter tests gồm outsider ở từng vai trò, admin không có quyền ngầm, sai bước/người, engine mismatch không ghi lệnh; integration thử sai quyền và stale revision |
| Tham chiếu gói/schema/workflow ngay từ case đầu tiên                                           | package/schema/workflow version, schema_snapshot, definition_id chính xác trong INSERT trước khi start process | Integration so các ref lúc tạo/đóng, query schema_snapshot thật và historic process definition; browser mở vùng thông tin phiên bản                                            |
| Tình huống máy chiếu A101 qua bốn vai trò, có trả lại và giữ lịch sử, không sửa DB để đẩy bước | Web → APISIX → API → PostgreSQL/Flowable; reporter/coordinator/technician/approver riêng                       | `g01.spec.ts` đi trọn luồng bằng UI. Các script chỉ dùng API nghiệp vụ để chuyển bước; query DB/engine trong verifier là read-only                                             |

## Bộ lệnh nghiệm thu

```text
pnpm typecheck
pnpm test                  # 18 tests
pnpm build
pnpm demo:up
pnpm demo:verify           # 8 nhóm kiểm tra nền tảng
pnpm demo:verify:g01       # 9 nhóm G01 với dịch vụ thật
pnpm test:e2e              # 6 tests, gồm 4 tests nền tảng và 2 tests G01
```

Kết quả local trên Windows/WSL2: các bộ trên đạt; runtime Docker Engine 29.5.3, Compose 5.1.4, PostgreSQL 17.11, Keycloak 26.8.1, Flowable 7.2.0, APISIX 3.19.0; Node 22.16.0 và pnpm 11.25.0. Các lỗi phát hiện trong lần chạy đầu được sửa trước nghiệm thu: accessible name của select, selector menu nền tảng có số đếm, ánh xạ identity link của Flowable 7.2 (`group`), lệnh thăm dò Docker trên Windows. CI chạy lại trên Linux, xem trạng thái của đúng SHA trong PR giai đoạn 2.

Artifact sinh local (không commit để tránh gom dữ liệu thử và trace đăng nhập):

- `test-results/integration.json`: kết quả nền tảng.
- `test-results/g01-integration.json`: timestamp, case/process IDs và 9 kết quả; không có password/token.
- `test-results/browser/.last-run.json`: trạng thái Playwright.
- `test-results/g01-mobile-create.png`, `g01-mobile-work.png`, `g01-mobile-closed.png`: viewport 390×844, kiểm tra không tràn ngang ở bước tạo/xử lý/đóng.
- `test-results/g01-desktop-closed.png`: trạng thái đóng, người quyết định, lịch sử và ref quy trình.
- `playwright-report/`: báo cáo đầy đủ. Không công khai trace có phiên đăng nhập thật.

Ảnh desktop và mobile đã được mở kiểm tra trực quan. Bộ test nền tảng cũ vẫn thực hiện đăng nhập/đăng xuất, tạo/hoàn tất task và quyền của cả năm tài khoản.

## Giới hạn không được diễn giải thành đã hoàn thành

- Chưa có file/evidence gate/quét virus; chỉ ghi biện pháp/kết quả văn bản ở G01 v1 này.
- Chưa có worker retry/outbox/đối soát tự động hoặc kiểm thử mọi cửa sổ lỗi phân tán. Pending/needs_reconciliation chặn tiếp tục và giữ dữ liệu/ý định; xử lý tự động thuộc giai đoạn 3.
- Chưa có CLI kích hoạt gói hoặc test v1/v2; giai đoạn 2 chỉ pin tham chiếu và definition cụ thể.
- Chưa có báo cáo tổng hợp, G02/G03, backup/restore hoặc triển khai Internet/production.
- Danh mục, tổ và quyền nhân sự dùng seed một trường; UI chưa quản trị các danh mục/nhân sự. Danh sách hiện phù hợp tập dữ liệu demo, chưa benchmark khối lượng lớn.
- PR giai đoạn 1 còn mở. Nhánh giai đoạn 2 kế thừa đúng head giai đoạn 1 và PR đặt base `feat/phase-1-foundation`; review/merge lần lượt. Không tự merge vào main.

Hướng dẫn demo và bài làm quen cho hai thành viên: [PHASE-2.md](../PHASE-2.md). Hợp đồng: [OpenAPI](../openapi.yaml). Tài liệu REST tham khảo: [Flowable REST API](https://www.flowable.com/open-source/docs/bpmn/ch14-REST); mapping đã được kiểm tra trên image Flowable 7.2.0 đang dùng thay vì chỉ dựa vào ví dụ tài liệu.
