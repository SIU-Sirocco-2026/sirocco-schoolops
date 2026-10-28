# Nhánh và phiên bản bàn giao

| Nhánh | Mục đích |
| --- | --- |
| `main` | Nhánh đích sau kiểm thử và review; không cập nhật tự động từ develop |
| `develop` | Bản tích hợp hiện tại để kiểm thử và chuẩn bị bàn giao |
| `feat/<topic>` | Tính năng đang làm, ví dụ `feat/environment-connectors` |
| `fix/<topic>` | Sửa lỗi cụ thể, ví dụ `fix/evidence-access` |
| `docs/<topic>` | Thay đổi tài liệu độc lập |

Tên nhánh dùng tiếng Anh, chữ thường và dấu gạch nối. Commit vẫn theo quy ước tiếng Việt trong [CONTRIBUTING](../CONTRIBUTING.md). Nhánh công việc chỉ giữ khi còn việc/PR độc lập; sau khi tích hợp và giữ được lịch sử thì xóa nhánh dư.

## Đợt thu gọn hiện tại

`review/ung-vien-tich-hop` được đổi thành `develop`. GitHub đóng PR #49 khi đổi tên nhánh nguồn; PR #50 thay thế để review bản tích hợp vào main. Chuỗi PR phụ thuộc cũ được đóng vì đã nằm trong bản tích hợp, không được trình bày là đã có đồng đội approve. Các commit của chúng vẫn truy được qua develop và các PR đã đóng.

Hai nhánh thử nghiệm `feat/phase-1-foundation` và `feat/phase-2-g01` thuộc lịch sử trước đợt tách commit, được giữ bằng tag `archive/phase-1-foundation` và `archive/phase-2-g01`. Các tag phát hành `v0.1.0-rc.1`, `v0.1.0-rc.2` và tài sản release cũ được giữ nguyên.

Không rewrite lịch sử, force-push hoặc xóa commit riêng của người khác khi dọn nhánh. Nếu một nhánh có commit chưa nằm trong develop, phải giữ lại bằng ref phù hợp trước khi bỏ tên nhánh cũ.

## Gửi reviewer

Gửi link cây nguồn theo SHA đầy đủ và hướng dẫn cài cùng phiên bản. Người nhận ghi SHA khi bắt đầu và không tự pull giữa lượt review. Nhiều commit có thể cùng version `0.1.0-rc.2`; `sourceRevision` từ `/api/config` mới phân biệt được bản đang chạy.

CI đạt là bằng chứng kỹ thuật. PR #50 còn chờ review trước khi merge main; phản hồi người dùng được ghi riêng, không tự điền từ kiểm thử tự động.
