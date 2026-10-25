# Đóng góp cho Sirocco Core + SchoolOps

Đội dùng quy trình nhánh → commit theo chức năng → Pull Request → kiểm thử → review → merge. Cách làm dựa trên [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow); ngôn ngữ commit tiếng Việt là quy ước riêng của dự án.

## Một đầu việc cần rõ điều gì?

Với tính năng hoặc lỗi có phạm vi đáng kể, tạo Issue trước: vấn đề của người dùng, kết quả mong muốn, phạm vi và cách chứng minh đã hoàn thành. Sửa lỗi chính tả nhỏ có thể mở PR trực tiếp. Giai đoạn/milestone dùng để theo dõi tiến độ; không dùng “xong phase 1/2” thay mô tả thay đổi.

Tách nhánh theo việc, ví dụ `feat/bao-su-co`, `feat/giao-viec`, `fix/han-xu-ly`, `docs/cai-dat`. Trước khi làm, cập nhật nhánh gốc và kiểm tra không ghi đè thay đổi người khác. Hai người làm các phần độc lập trên nhánh riêng, thống nhất contract khi cùng sửa API/quy trình.

## Quy ước commit

```text
loại(phạm-vi): mô tả thay đổi bằng tiếng Việt

Vì sao cần thay đổi và hành vi sau thay đổi.
Chi tiết đáng chú ý hoặc giới hạn nếu có.

Kiểm tra: lệnh đã thực sự chạy và kết quả.
Liên quan: #số-issue
```

Giữ `feat`, `fix`, `test`, `docs`, `refactor`, `build`, `ci`, `chore` để phân loại; phạm vi dùng tên ngắn không dấu như `ho-so`, `giao-viec`, `dang-nhap`. Nội dung sau dấu `:` và phần giải thích viết tiếng Việt. Không bắt buộc mọi commit có phạm vi hoặc body nếu thay đổi nhỏ đã rõ.

Ví dụ:

```text
feat(ho-so): cấp mã sự cố và kiểm tra thiết bị thuộc phòng
feat(xac-minh): trả bổ sung hồ sơ kèm lý do
feat(giao-viec): giao tổ kỹ thuật và đặt hạn hoàn thành
fix(phan-quyen): chặn người xử lý tự nghiệm thu hồ sơ
test(g01): kiểm tra nhánh trả lại và người được giao
docs(cai-dat): hướng dẫn tạo cấu hình demo local
```

Mỗi commit là một thay đổi có ý nghĩa, đủ để review và hiểu khi đọc riêng. Có thể gồm mã, test và tài liệu đi kèm cùng hành vi. Giữ dependency và lockfile cùng commit. Tách thay đổi không liên quan, đổi định dạng hàng loạt hoặc refactor khỏi tính năng nếu có thể.

Commit khi hoàn thành một bước kiểm chứng được; push sớm để đồng đội thấy tiến độ. Không chờ xong cả giai đoạn mới commit. Cũng không tách vụn từng dòng/từng file chỉ để tăng số lượng commit. Tránh `update code`, `fix bug`, `hoàn thành phase 2` vì không nói được điều gì đã đổi.

Bật mẫu commit cho clone hiện tại nếu muốn:

```powershell
git config --local commit.template .gitmessage
git commit
```

Khi dùng `git commit -m`, tự viết nội dung theo cùng quy ước.

## Kiểm tra và mở Pull Request

Chạy phép kiểm tra phù hợp với thay đổi. Mã TypeScript dùng `pnpm typecheck`, `pnpm test`, `pnpm build`; thay đổi luồng tích hợp chạy thêm các bộ liên quan:

```powershell
pnpm demo:up
pnpm demo:verify
pnpm demo:verify:g01
pnpm test:e2e
```

Sửa tài liệu thuần túy cần đối chiếu nội dung/lệnh/đường dẫn; không cần thêm unit test chỉ để đủ hình thức. Chỉ ghi “đạt” cho lệnh thực sự chạy. Nếu chưa chạy được, ghi rõ phép kiểm tra còn thiếu và lý do; CI tiếp tục kiểm tra trong PR.

PR nêu vấn đề, hành vi sau thay đổi, phạm vi, bằng chứng và giới hạn còn lại; liên kết Issue tương ứng. Ưu tiên một chức năng hoặc một nhóm thay đổi gắn chặt với nhau. Mở Draft khi đang làm dở. Nhánh phụ thuộc PR khác phải ghi rõ nhánh gốc và thứ tự review/merge.

Người còn lại review mã và thử tình huống chính, tình huống sai quyền/trả lại nếu thay đổi tác vụ. Không tự ghi rằng đồng đội đã review hoặc chấp thuận. Sửa phản hồi bằng commit bổ sung có mô tả rõ. CI đạt là điều kiện kỹ thuật, không thay thế review.

Merge sau khi các kiểm tra liên quan đạt và phản hồi review được xử lý. Với PR chứa nhiều commit chức năng đã tách hợp lý, ưu tiên **Create a merge commit** để giữ lịch sử; không squash lại thành một commit “xong giai đoạn”. Sau merge, đồng đội cập nhật `main`. Không đổi cấu hình bảo vệ nhánh hoặc tự merge chỉ vì CI xanh.

## Lịch sử và nguồn gốc phải trung thực

- Không sửa ngày commit để tạo cảm giác đã phát triển từ trước; không gán tác giả hay đóng góp cho người không thực hiện.
- Không force-push nhánh chung mà chưa thống nhất với người đang dùng nhánh đó.
- Khi cần tách lại lịch sử đã push, ưu tiên nhánh mới, giữ bản cũ, ghi nguồn commit gốc và so sánh tree để chứng minh không mất mã. [Đợt tách lịch sử hiện tại](docs/LICH-SU-TACH-COMMIT.md) ghi rõ cách làm này.
- Không tạo số lượng Issue/PR/commit giả để làm đẹp hồ sơ thi. Lịch sử SCM là bằng chứng công việc, không phải chỉ tiêu số lượng.
- Giữ nguồn/tác giả/thông báo giấy phép khi dùng mã bên ngoài. Không commit `.env`, token, mật khẩu, file sinh hoặc dữ liệu cá nhân thật.

Mã mới dùng Apache-2.0; xem LICENSE, NOTICE, THIRD_PARTY_NOTICES.md và docs/PROVENANCE.md. Đóng góp cần có quyền phân phối theo giấy phép này, giữ thông báo nguồn của phần kế thừa. Trước phát hành chạy thêm pnpm legal:audit, bộ restore giai đoạn 7 và checklist phản hồi theo vai trò; không dùng kiểm thử tự động thay approval/nhận xét của người thật.
