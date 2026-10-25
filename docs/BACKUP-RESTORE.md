# Backup và diễn tập khôi phục

Phạm vi bản RC: một stack demo local, backup có thời gian bảo trì ngắn, restore vào **project và thư mục mới**. Bản sao chứa ba database `schoolops`, `keycloak`, `flowable`; toàn bộ volume SeaweedFS (quarantine/clean/metadata); `.env` và cấu hình realm/S3 cần để giữ danh tính/khóa/quyền. Chữ ký ClamAV là cache upstream, không phải dữ liệu nghiệp vụ; stack mới nạp lại từ image. Không tuyên bố đã có backup online, cluster, lịch sao lưu hay DR production.

Chạy từ Git checkout sạch; công cụ ghi source SHA và version, restore lấy source đúng commit từ Git local. Giữ source/tag tương ứng với backup; fetch commit nếu máy restore chưa có. Không thay source/pack/config trong lúc snapshot. Cần Docker/tar/Git; Windows MSIX dùng helper theo README. Backup phải nằm ngoài repo công khai, mặc định `.local/backups/` đã được ignore.

Đặt passphrase dài ít nhất 16 ký tự trong biến môi trường **chỉ cho phiên vận hành**, lấy từ trình quản lý mật khẩu và giữ ngoài backup. Không ghi secret thật trong script, shell history, log hoặc tài liệu. Ví dụ dưới đây đọc tương tác thay vì đặt giá trị trong lệnh:

```powershell
$backupSecret = Read-Host 'Passphrase backup' -AsSecureString
$env:SIROCCO_BACKUP_PASSPHRASE = [System.Net.NetworkCredential]::new('', $backupSecret).Password
pnpm backup:create
Remove-Item Env:SIROCCO_BACKUP_PASSPHRASE
```

Luồng: đóng ingress → dừng API/worker → dừng Identity/engine/file store/web → fingerprint từng bảng và SHA-256 từng tệp → `pg_dump -Fc` cả ba DB + tar file store/config → khởi động lại các dịch vụ vốn đang chạy → mã hóa archive. AES-256-GCM có xác thực, salt/IV ngẫu nhiên, key dẫn xuất bằng scrypt; passphrase không được lưu. File `.sha256` kiểm tra hỏng ngoài ý muốn; GCM mới là kiểm tra xác thực. Không ghi mật khẩu ra màn hình.

Thư mục plaintext tạm được cấp quyền riêng cho user hiện tại (POSIX 0700 hoặc ACL Windows) và xóa trong `finally`; lỗi khi snapshot cũng cố khởi động lại dịch vụ đã dừng. Nếu kill cưỡng bức/mất điện, operator kiểm tra `docker compose ps`, chạy `docker compose start`, chờ ready và xóa thư mục `backup-work-*` còn sót trong `.local` sau khi xác định không có tiến trình backup đang dùng. Xóa không bảo đảm secure erase trên SSD; bảo vệ ổ đĩa bằng mã hóa hệ điều hành. Bản backup là dữ liệu nhạy cảm dù nguồn demo hiện là giả lập.

Restore nhường các cổng 8088/8180 cho project mới. Dừng stack nguồn sau khi có backup đã xác thực, **giữ toàn bộ volume**:

```powershell
docker compose stop
# Đặt lại SIROCCO_BACKUP_PASSPHRASE từ nơi lưu riêng, như bước trên
pnpm backup:restore --input D:/Private/backup.sirocco --target D:/Private/schoolops-restored --project schoolops-restored
Remove-Item Env:SIROCCO_BACKUP_PASSPHRASE
```

Target directory phải chưa tồn tại; project chưa có container/volume. Công cụ từ chối dùng lại một project đã có dữ liệu, không xóa hoặc ghi đè volume nguồn. Sau giải mã/xác thực/checksum và kiểm tra archive không có path traversal/link/device, source được lấy từ đúng Git commit, credential/config được đặt trong workspace mới, ba DB được restore với `pg_restore --exit-on-error`. **Trước khi app ghi dữ liệu mới**, mọi fingerprint bảng và checksum file phải trùng snapshot; sau đó mới build/start stack và kiểm tra ready. Báo cáo nằm `restore-report.json` trong workspace đích. Nếu sai, project đích được giữ để chẩn đoán; không tự chuyển lưu lượng sang một bản restore không đạt.

Đánh giá sau restore: đăng nhập mới, tải bằng chứng qua API và so SHA-256, tiếp tục workflow đang xử lý, gửi lại cùng idempotency key, thử account G01/admin với ID G03, xem lineage G02 và đối soát báo cáo. Các bước này được tự động hóa bằng:

```powershell
pnpm demo:verify:phase7
```

Bài diễn tập tạo fixture có nhãn, snapshot thật, thử sai key, restore project mới từ source archive sạch, kiểm tra nội dung toàn DB/file và các luồng API trên. Cuối bài dừng project diễn tập rồi khởi động lại nguồn trong `finally`; volume nguồn không bị xóa. Project/volume diễn tập được giữ riêng để đối chiếu. Password backup trong bài thử được tạo ngẫu nhiên và chỉ giữ trong RAM, nên archive đó không phải bản backup vận hành lâu dài. Tạo backup riêng bằng lệnh vận hành nếu muốn giữ để dùng về sau.

Muốn quay lại nguồn: dừng project restore bằng `docker compose -p schoolops-restored stop` trong workspace đích, trở về checkout nguồn rồi `docker compose start`; chờ ready. Không chạy hai stack trên cùng cổng. Chỉ dọn project diễn tập sau khi xác minh đúng tên/label và không còn cần dữ liệu; tài liệu này không dùng lệnh xóa volume tự động.
