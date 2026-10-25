# Ma trận nghiệm thu giai đoạn 7

Issue #17, phụ thuộc #16. Dùng [phạm vi gốc](../requirements/phase-7.md). Bảng này nêu bằng chứng bắt buộc, không tự xác nhận một lượt kiểm tra chưa chạy. Bằng chứng cuối đọc ở release/CI đúng SHA.

| Yêu cầu | Hiện thực và bằng chứng kiểm chứng | Trạng thái cần chốt |
| --- | --- | --- |
| Mobile tạo/upload/task; lỗi và bước tiếp theo rõ | G01/G03 bốn/ba role ở 390px; G02 mobile; HTTP decoder tests và browser quota giữ form/key, không tự resubmit | Đối chiếu 10 browser tests không flaky và ảnh ở đúng source SHA; người thật thử thiết bị ở checklist riêng |
| Phản hồi theo vai trò, sửa lỗi thực tế, đối soát báo cáo | `role-feedback.md` cho người thật; lỗi quota quan sát từ CI đã được sửa ở client/poll/test; restore suite so report/list all/open/overdue/completed cho G01/G02/G03/admin | **Chờ phản hồi người dùng thật**; không dùng tự động hóa thay nghiệm thu này |
| Cài/build sạch, migration/seed/check hệ thống | CI checkout đúng PR head, frozen install, unit/type/build, init/seed; restore tạo source archive sạch và build stack ở workspace/volume mới; INSTALL | Chốt CI sạch ở SHA release và source audit |
| Backup/restore DB/workflow/file, checksum/liên kết | 9 nhóm `phase7-integration.json`; ba DB toàn bảng, toàn file cold snapshot, key sai, live restore, fresh login, tiếp tục workflow/idempotency, G03 ACL/file, G02 lineage, báo cáo, chống ghi đè project và backup tiếp từ bản restore | Đọc restore-report và kết quả từng nhóm; không lấy backup tạo được làm bằng chứng restore được |
| README/OpenAPI/user/contributor/authoring/changelog/limits | Các tài liệu được link từ PHASE-7; tạo gói ở PHASE-4; `source-audit.json` kiểm tra link/API/ref/path parameters/version/pins | Chốt source audit và đọc giới hạn release notes |
| Nguồn gốc, phụ thuộc, giấy phép và notice | Apache-2.0 được chủ dự án ủy quyền lựa chọn; LICENSE/NOTICE/PROVENANCE/THIRD_PARTY_NOTICES; inventory + SBOM + full notices của package cài trên nền tảng nghiệm thu | `legal:audit` phải đạt, source SHA và hash lockfile khớp; không tuyên bố npm inventory bao phủ base OS |
| Tag/version/archive/checksum/notes; demo/evidence đúng version | `release:prepare` kiểm tra source/runtime/report/SHA, archive tái tạo được, manifest/SHA256SUMS/notes; RC cho đội review | Chốt tag, assets tải lại và SHA256SUMS; RC ghi rõ còn user acceptance/review |
| Demo G01/v1-v2/G02/G03/report | DEMO-SCRIPT và các bộ tích hợp/browser có assertions; gói v1 giữ schema/rule/policy sau đổi v2, G03 known-ID bị chặn | Gắn artifact và CI theo đúng SHA, người trình bày chạy checklist thực tế |

Kết quả local/CI, số bảng/tệp restore và URL release được đối chiếu sau khi các lượt hoàn tất; không điền suy đoán. Raw browser trace và backup không công bố trong release. CI xanh không thay approval. Giai đoạn 7 chưa được đánh dấu hoàn tất toàn bộ khi hàng phản hồi người dùng thật còn thiếu bằng chứng.
