# Changelog

## Unreleased

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
