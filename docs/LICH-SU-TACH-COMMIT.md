# Đợt tách lại commit ngày 24/10/2026

Theo yêu cầu của đội, các thay đổi nền tảng và G01 đã được tách từ commit lớn thành các commit theo chức năng, với thông điệp tiếng Việt. Đây là thao tác tổ chức lại lịch sử sau khi triển khai, không phải bằng chứng về 23 lần phát triển diễn ra trước đó. Commit mới dùng thời điểm tách hiện tại và giữ tài khoản tác giả đang thực hiện.

## Đối chiếu bản cũ và bản mới

| Nội dung | Bản gốc được giữ                            | Nhánh tách lại                                | Số commit |
| -------- | ------------------------------------------- | --------------------------------------------- | --------- |
| Nền tảng | `d58ed2d`, PR #4, `feat/phase-1-foundation` | `feat/nen-tang-dang-nhap`                     | 10        |
| G01      | `a3aa009`, PR #5, `feat/phase-2-g01`        | `feat/ho-so-su-co-g01` (kế thừa nền tảng mới) | 13        |

Các bản mới dùng snapshot cuối đã có sửa lỗi và kiểm chứng; không tái dựng lại diễn tiến phát hiện/sửa lỗi trong các commit ban đầu. Mỗi commit mới ghi nguồn gốc trong body. Các nhánh cũ không bị force-push hoặc xóa.

Kiểm tra nội dung bằng Git tree:

```text
git diff --exit-code d58ed2d feat/nen-tang-dang-nhap
git diff --exit-code a3aa009 feat/ho-so-su-co-g01
```

Cả hai lệnh trả exit code 0, không có khác biệt. Tree nền tảng: `067954a4a3dda813fb753edc7867ca25d1dd192a`; tree G01: `f53c56b6574c0623b2c427f4fcea2aa1055022e4`. Quy ước đóng góp và ghi chú lịch sử được thêm sau đó trên nhánh `docs/quy-trinh-dong-gop`, không thuộc so sánh snapshot mã sản phẩm trên.

## Các commit đã tách

Mỗi commit đã chạy `pnpm typecheck`. Những lệnh test/build bổ sung trong bảng dưới thực sự được chạy sau khi tạo nội dung commit, trước khi ghi commit. Typecheck không chứng minh đầy đủ luồng runtime; kiểm thử tích hợp/browser được xác nhận thêm bằng CI ở các PR mới.

| Commit                                                                                                           | Thay đổi                                                                   | Kiểm tra bổ sung          |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------- |
| [40d395a](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/40d395ae069fedff3ea64d06784159ba62ce4933) | chore(workspace): khởi tạo pnpm và cấu hình TypeScript cho API, web        | `pnpm build`              |
| [d5151a2](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/d5151a2d0de68fd56af638cf2ac3830a0d85f234) | feat(du-lieu): tạo tài khoản demo, migration và cấu hình Identity          | —                         |
| [dc61eee](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/dc61eee5c4ba162a6bf67179b31dee90295ea0e5) | feat(dang-nhap): xác minh JWT và quyền tạo, hoàn tất nhiệm vụ              | —                         |
| [26c0b3f](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/26c0b3fd6c9f500a1d116c0da1316c676e3239c2) | feat(workflow): tích hợp nhiệm vụ Flowable và cố định phiên bản triển khai | `pnpm test`               |
| [6879395](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/6879395a698e10533669eae7edbcbae0d26eb0b9) | feat(api): tạo và hoàn tất nhiệm vụ theo tài khoản được cấp quyền          | `pnpm test`; `pnpm build` |
| [ad27af6](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/ad27af6b7d72b662de4ae8745df17a22f8bb4b2f) | feat(giao-dien): đăng nhập và xử lý nhiệm vụ trên SchoolOps                | `pnpm build`              |
| [c8be3a0](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/c8be3a0458c44db4d9294601cf052cee4ae0a814) | build(ha-tang): chạy dịch vụ bằng Compose và đưa API qua gateway           | —                         |
| [03319b9](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/03319b9d88becd6783dd001085cfaf64b41b9c03) | test(nen-tang): kiểm tra luồng thật, đăng xuất và năm vai trò demo         | —                         |
| [91df459](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/91df4598ba2fbeaf726d6a945a4b718ffdfe781e) | ci: tự động build và kiểm thử nền tảng trên môi trường sạch                | —                         |
| [b67e313](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/b67e313eaf7df6c553df6ad580b7c9deb7b36e24) | docs(nen-tang): hướng dẫn cài đặt, API và đối chiếu nghiệm thu             | —                         |
| [7722b1c](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/7722b1ccbcdb1878464cd44926f6a29fdc6fabd2) | feat(g01): thêm dữ liệu hồ sơ, danh mục và quy trình sự cố                 | —                         |
| [869c4db](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/869c4db2e61aed3768115304df6b40a0e8779783) | feat(workflow): truyền biến xử lý và nhận nhiệm vụ của tổ                  | `pnpm test`               |
| [011ea0f](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/011ea0f737fbdc3f4cfd99092423d9a58f5860a2) | feat(phan-quyen): giới hạn hồ sơ G01 theo người, tổ và bước xử lý          | `pnpm test`               |
| [aaa0017](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/aaa0017cc84f1a99fa2d87a87aed51ce2df83add) | feat(ho-so): tạo, tìm và xem chi tiết sự cố theo quyền                     | `pnpm test`               |
| [7455003](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/74550037868f545d20b7dab9bfafd57c1fba7bcf) | feat(xac-minh): tiếp nhận hoặc trả bổ sung hồ sơ có lý do                  | —                         |
| [a33ba0d](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/a33ba0ddae1f32c9b7b55e619f5704b2dff4e5f2) | feat(giao-viec): giao người hoặc tổ, đặt hạn và nhận xử lý                 | —                         |
| [5da55ff](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/5da55ff7ea728f978eeb4950e1491d9c99b20c95) | feat(xu-ly): lưu biện pháp, kết quả và gửi nghiệm thu                      | —                         |
| [ad2ce25](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/ad2ce25485662d975c4b1e35de82c378114bfd93) | feat(nghiem-thu): trả lại xử lý hoặc phê duyệt đóng hồ sơ                  | `pnpm test`; `pnpm build` |
| [de30c61](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/de30c6104fa2702df7cd3e928661bd81bf1d6cf1) | feat(giao-dien): bổ sung biểu mẫu, chi tiết và timeline sự cố              | `pnpm build`              |
| [a30a354](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/a30a354e30442bff9192abb15798bd90fdfa39fc) | feat(schoolops): nối màn hình sự cố vào không gian làm việc                | `pnpm build`              |
| [3b873d7](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/3b873d79d296869fca5b119b84110daa2f4f955b) | test(g01): kiểm chứng bốn vai trò, giao tổ và hai vòng trả lại             | `pnpm test`               |
| [bf69544](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/bf695444ce7dbc9301e4a163befd9217060500eb) | fix(docker): phục hồi socket runtime lỗi trên Windows                      | —                         |
| [c77c294](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/commit/c77c29401f17cfc71e81d96663d5ac3315d21b8e) | docs(g01): mô tả API, kịch bản demo và tiêu chí nghiệm thu                 | `pnpm test`; `pnpm build` |

## Review và tiếp tục phát triển

Review lần lượt PR nền tảng → PR G01 → PR tài liệu quy trình. PR mới ghi liên kết thay thế PR cũ; PR cũ đóng dưới trạng thái superseded sau khi PR mới được tạo và kiểm chứng. Không merge cả hai chuỗi lịch sử cùng lúc. Giữ từng commit khi merge bằng merge commit, tránh squash toàn giai đoạn.

Từ công việc tiếp theo, commit ngay khi hoàn thành chức năng nhỏ và đã kiểm tra phù hợp; không cần thực hiện lại đợt tái cấu trúc này. Không tăng số commit để làm đẹp số liệu, không gán công việc cho đồng đội chưa thực hiện. Xem [quy trình đóng góp](../CONTRIBUTING.md).
