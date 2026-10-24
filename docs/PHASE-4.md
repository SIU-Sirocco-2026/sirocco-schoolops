# Giai đoạn 4 — Gói nghiệp vụ có phiên bản

Gói cấu hình dùng adapter được viết và kiểm thử trong lõi. Gói không mang script, plugin thực thi hoặc code tùy ý. Phiên bản đã nạp giữ nguyên nội dung; mọi sửa đổi tạo version mới. Hồ sơ pin cả revision UUID, checksum của bundle (qua revision), schema snapshot, definition ID chính xác và evidence policy. Quyền hiện hành vẫn đọc từ membership mỗi request.

## Thử nhanh

```powershell
pnpm packs:list
pnpm packs:validate packs/g01/v2
pnpm packs:install packs/g01/v2
pnpm packs:activate g01 2.0.0
pnpm demo:verify:phase4
```

CLI mặc định chỉ dùng tài khoản admin demo local từ `.env` qua OIDC smoke client. Với môi trường khác cung cấp `SIROCCO_TOKEN` và `SIROCCO_API` (URL API có `/api`); không đặt token vào tham số lệnh hoặc Git. Chỉ admin được gọi API quản lý gói. Không cần quyền đọc nghiệp vụ để quản trị gói; admin vẫn không tự đọc được hồ sơ.

Đăng nhập admin trên web → **Gói nghiệp vụ** để xem version đã nạp, bản active, checksum/definition ID, lịch sử và lỗi kiểm tra/kích hoạt. Nạp và kích hoạt dùng CLI; UI hiện tại chỉ tra cứu.

`demo:verify:phase4` tạo hồ sơ v1, nạp/kích hoạt v2, hoàn tất cả hai; cố tình thử lỗi và khởi động lại dịch vụ demo. Cuối bài thử khôi phục active G01 về v1 để các bộ regression giai đoạn trước độc lập. Dùng lệnh activate v2 khi muốn giữ bản v2 cho demo. Không chạy bộ fault injection đồng thời với người đang thao tác trên cùng stack.

## Cấu trúc và cách tạo gói

Mỗi thư mục có đúng sáu đầu vào được loader đọc: `manifest.json`, `schema.json`, `workflow.bpmn20.xml`, `evidence-policy.json`, `seed.json`, `labels.json`. Không có tham chiếu đường dẫn động hoặc dependency tự chạy. Xem mẫu hoàn chỉnh trong `packs/g01/v1` và `packs/g01/v2`.

1. Sao chép v2 thành thư mục phiên bản mới; đổi manifest.version và các reference schema/workflow/evidence, đổi `$id` schema và version policy tương ứng.
2. Đổi nhãn, ràng buộc schema trên các trường adapter hỗ trợ, seed và điều kiện bằng chứng. Mẫu v1 nhận file sạch; v2 giới hạn PNG/JPEG sạch ở đúng task repair hiện tại.
3. Giữ role/action/task đúng contract adapter. Chạy validate; sửa tất cả lỗi trước install/activate. Đổi content của version đã install bị 409 IMMUTABLE_VERSION.
4. Install deploy definition ở engine nhưng chưa đổi active. Activate kiểm tra lại checksum/bundle và definition tồn tại, rồi đổi con trỏ active trong transaction có khóa theo pack.
5. Tạo case mới và kiểm chứng payload/policy. Case cũ không tra `latest`, không đổi phiên bản sau activation/restart.

Adapter `facility-v1` hỗ trợ đúng form title/roomId/assetId/description, vai trò reporter/coordinator/technician/approver và các task/action G01 đã nghiệm thu. Schema là JSON Schema 2020-12, compile strict bằng Ajv và kiểm tra seed. Payload create/resubmit thực sự kiểm tra schema snapshot, không chỉ ghi schema để trưng bày.

Phạm vi BPMN cố ý giới hạn: start/end, các user task, sequence flow và exclusive gateway của topology G01 đã kiểm thử. Validator đối chiếu cấu trúc/điều kiện/biến/thuộc tính thực thi với template tin cậy, kiểm tra ID/trùng, liên kết và khả năng tới task/end; cho đổi process ID theo tham chiếu manifest workflow (tên-v<major>), name và nhãn. DTD/entity, node script/service/listener, biểu thức tùy ý hoặc topology khác bị từ chối. Đây không phải bộ chứng minh mọi BPMN hợp lệ.

Khi cần quy trình/field/action ngoài contract, phải viết adapter mới trong lõi, thêm schema/permission/worker/UI và kiểm thử, rồi mới đăng ký tập cấu hình đó. Đổi tên file BPMN không tạo ra một adapter mới.

## Nhất quán và lỗi

Registry lưu bundle/checksum/version/definition; cài lại cùng version/checksum trả revision cũ. Install/activate tuần tự theo advisory transaction lock; case đọc active một lần và chụp tham chiếu. Nếu deploy lỗi, revision ứng dụng chưa được nạp; nếu activate lỗi, con trỏ active cũ không đổi. Definition deploy thành công nhưng DB commit thất bại có thể còn ở engine; nó chưa active cho ứng dụng và được tìm lại theo tên chứa checksum khi cài lại. Không xóa definition của case đang chạy.

Khởi tạo lần đầu nạp/active v1, backfill revision cho case G01 v1 cũ; lần sau không tự hạ v2 về v1. Migration 5 không chuyển bước hay xóa hồ sơ cũ. Dữ liệu mẫu trong gói được kiểm tra, không tự tạo hồ sơ/người thật khi install.

Nguồn kỹ thuật: [Ajv strict/2020-12](https://ajv.js.org/json-schema.html), [Flowable deployments](https://www.flowable.com/open-source/docs/bpmn/ch14-REST). Hành vi quan trọng được kiểm tra bằng dịch vụ thật.

## Nghiệm thu

- Unit: bundle v1/v2 hợp lệ; sai schema/seed/reference/role/action, thiếu task, ID trùng, nhánh hỏng, script/entity và sai assignee bị chặn.
- Integration `pnpm demo:verify:phase4`: quyền admin/CLI, lỗi không đổi active, immutable/idempotent install, pin v1/v2 qua restart, v1 văn bản/v2 ảnh và lỗi dịch vụ.
- Browser `tests/e2e/packs.spec.ts`: admin đọc trạng thái và lỗi validator trên desktop/mobile; các test G01 hiện có tiếp tục chạy.
- Báo cáo tại `test-results/phase4-integration.json`; ảnh `phase4-pack-admin-mobile.png`. CI chạy lại trên Linux tại đúng SHA PR. Không giả lập approval của đồng đội hoặc tự merge.

Ma trận đối chiếu yêu cầu và bằng chứng: [nghiệm thu giai đoạn 4](verification/phase-4-acceptance.md).
