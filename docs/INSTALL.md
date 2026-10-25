# Cài từ source và kiểm tra hệ thống

Môi trường đã kiểm chứng hướng tới Docker Engine chạy Linux containers trên Windows/WSL2 và GitHub Actions Ubuntu amd64. Node **22.16.0**, pnpm **11.25.0**, Git và Docker Compose v2 có `--wait` là công cụ của bộ nghiệm thu. Dành đủ RAM cho Java/ClamAV và đủ đĩa cho image, database, tệp cùng bản diễn tập; ClamAV có thể cần thêm RAM khi nạp lại chữ ký. Xem [upstream](https://docs.clamav.net/manual/Installing/Docker.html), không coi thông số tối thiểu của riêng ClamAV là cấu hình toàn stack. ARM và triển khai production chưa được nghiệm thu.

Từ một thư mục mới:

```powershell
git clone https://github.com/SIU-Sirocco-2026/sirocco-schoolops.git
cd sirocco-schoolops
git checkout v0.1.0-rc.1
pnpm install --frozen-lockfile
pnpm demo:init
pnpm demo:up
pnpm demo:users
pnpm demo:verify
```

Nếu dùng source archive, kiểm tra `SHA256SUMS` của release, giải nén vào thư mục mới rồi chạy các lệnh từ `pnpm install` trở đi. Các lệnh backup gắn commit/restore source cần Git checkout đúng phiên bản. Tag RC đã phát hành; lấy tag này để thử, vì `main` còn chờ chuỗi PR merge. Node được ghi trong `.nvmrc`, pnpm được cố định ở trường `packageManager` của `package.json`.

Nếu dùng Codex MSIX trên Windows và có helper khởi động riêng, chạy helper trước công việc Docker:

```powershell
$codexProfile = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
& (Join-Path $codexProfile 'tools/windows-docker/ensure-docker.ps1')
```

Trên máy khác, mở Docker theo cách thông thường của máy đó. Không chạy Docker Desktop trực tiếp từ shell MSIX của agent; không xóa volume/WSL để xử lý lỗi khởi động.

Windows/WSL2 và Ubuntu amd64 là các môi trường đã kiểm chứng. macOS và arm64 chưa được kiểm chứng; chưa có kết luận rằng chúng không được hỗ trợ. Image dựng sẵn GHCR và triển khai production chưa nằm trong bản RC. [Thử trên môi trường dùng chung](SHARED-EVALUATION.md) dùng một stack và một database cho toàn bộ các vai trò.

Mở [SchoolOps](http://localhost:8088). Identity ở `http://localhost:8180`. Hai cổng chỉ bind loopback. `.env` và `infra/generated/` chứa secret local, được sinh mới và bị ignore; đọc `DEMO_PASSWORD` tại máy để đăng nhập, không gửi giá trị lên Issue/chat. `demo:init` giữ secret đã có; `demo:users` thêm/bind các tài khoản demo cần thiết, không đặt lại mật khẩu realm đang dùng. Không trộn `.env` mới với volume cũ.

API tự chạy migration 1–8 có khóa khi khởi động, seed danh mục/vai trò và gói mặc định nếu chưa có; không ghi đè active revision sau restart. Chạy lại `demo:up` không xóa dữ liệu. `demo:down` dừng/xóa container/network và giữ volume. Không dùng `down -v` trên dữ liệu cần giữ. Sau nâng cấp source, backup bản hiện tại, đọc migration/giới hạn, rồi chạy `demo:up`; bản RC này chưa có migration hạ cấp.

Kiểm tra sâu, chạy **tuần tự** trên demo riêng:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm demo:verify:g01
pnpm demo:verify:phase3
pnpm demo:verify:phase4
pnpm demo:verify:phase5
pnpm demo:verify:phase6
pnpm exec playwright install chromium
pnpm test:e2e
pnpm legal:audit
pnpm demo:verify:phase7
```

Giai đoạn 3 chủ động gây lỗi dịch vụ; giai đoạn 7 tạm dừng nguồn để nhường cổng cho stack restore độc lập rồi khởi động lại nguồn trong `finally`. Không thao tác demo đồng thời. Bài restore giữ project/volume diễn tập và dữ liệu nguồn; xem [backup/restore](BACKUP-RESTORE.md). Ubuntu CI cài Chromium với `--with-deps`.

Khi lỗi: `docker compose ps`, `pnpm demo:logs`, kiểm tra `GET /api/health/ready` và report dưới `test-results/`. `429` nghĩa là chờ quota reset rồi bấm Làm mới/thử lại; UI giữ biểu mẫu và không tự gửi lại thao tác. `Chờ đối soát` nghĩa là command đã được giữ; chờ worker/engine phục hồi, không sửa database để bỏ bước. Tệp pending/error chưa được dùng làm bằng chứng. Không in `docker compose config` có secret để gửi lên mạng.
