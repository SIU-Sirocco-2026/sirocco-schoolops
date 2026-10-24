# Changelog

## Unreleased

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
