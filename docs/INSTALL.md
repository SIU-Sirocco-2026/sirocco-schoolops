# Cài từ source và kiểm tra hệ thống

Môi trường đã kiểm chứng hướng tới Docker Engine chạy Linux containers trên Windows/WSL2 và GitHub Actions Ubuntu amd64. Node **22.16.0**, pnpm **11.25.0**, Git và Docker Compose v2 có `--wait` là công cụ của bộ nghiệm thu. Dành đủ RAM cho Java/ClamAV và đủ đĩa cho image, database, tệp cùng bản diễn tập; ClamAV có thể cần thêm RAM khi nạp lại chữ ký. Xem [upstream](https://docs.clamav.net/manual/Installing/Docker.html), không coi thông số tối thiểu của riêng ClamAV là cấu hình toàn stack. ARM và triển khai production chưa được nghiệm thu.

Từ một thư mục mới:

Các lệnh dưới lấy nhánh `feat/cai-tien-uiux` để đội thử giao diện mới. Nhánh chứa toàn bộ ứng dụng; `main` hiện chỉ có README và còn chờ chuỗi PR review/merge. Nếu cần tái lập bản đã đóng gói, thay tên nhánh trong lệnh clone bằng `v0.1.0-rc.2`; tag này giữ giao diện trước đợt chỉnh UI/UX.

```powershell
git clone --branch feat/cai-tien-uiux --single-branch https://github.com/SIU-Sirocco-2026/sirocco-schoolops.git
cd sirocco-schoolops
pnpm install --frozen-lockfile
pnpm demo:init
pnpm demo:up
pnpm demo:users
pnpm demo:verify
```

Nếu dùng source archive, kiểm tra `SHA256SUMS` của release và giải nén vào thư mục mới nằm ngoài mọi Git checkout. Chạy `pnpm install --frozen-lockfile`, `pnpm demo:init`, `pnpm demo:up` và `pnpm demo:users`. Với archive không có Git metadata, kiểm tra `GET /api/health/ready` trả `ready` và `GET /api/config` có `sourceRevision` khớp tệp `SOURCE-REVISION`, version khớp release; sau đó thử UI theo user guide.

Các bộ `demo:verify*`, `test:e2e`, `source:verify`, `security:audit`, `legal:audit`, backup/restore và đóng gói cần Git checkout đúng phiên bản để kiểm tra provenance. Clone nhánh hoặc tag cần kiểm chứng nếu muốn chạy đầy đủ các bộ này; tệp `SOURCE-REVISION` trong archive không tự chứng minh cây source còn sạch. `pnpm test`, typecheck và build có thể chạy từ archive. `main` còn chờ chuỗi PR merge. Node được ghi trong `.nvmrc`, pnpm được cố định ở trường `packageManager` của `package.json`.

Nếu dùng Codex MSIX trên Windows và có helper khởi động riêng, chạy helper trước công việc Docker:

```powershell
$codexProfile = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
& (Join-Path $codexProfile 'tools/windows-docker/ensure-docker.ps1')
```

Trên máy khác, mở Docker theo cách thông thường của máy đó. Không chạy Docker Desktop trực tiếp từ shell MSIX của agent; không xóa volume/WSL để xử lý lỗi khởi động.

Windows/WSL2 và Ubuntu amd64 là các môi trường đã kiểm chứng. macOS và arm64 chưa được kiểm chứng; chưa có kết luận rằng chúng không được hỗ trợ. Image dựng sẵn GHCR và triển khai production chưa nằm trong bản RC. [Thử trên môi trường dùng chung](SHARED-EVALUATION.md) dùng một stack và một database cho toàn bộ các vai trò.

Mở [SchoolOps](http://localhost:8088). Identity ở `http://localhost:8180`. Hai cổng chỉ bind loopback. `.env` và `infra/generated/` chứa secret local, được sinh mới và bị ignore; đọc `DEMO_PASSWORD` tại máy để đăng nhập, không gửi giá trị lên Issue/chat. `demo:init` giữ secret đã có; `demo:users` thêm/bind các tài khoản demo cần thiết, không đặt lại mật khẩu realm đang dùng. Không trộn `.env` mới với volume cũ.

API tự chạy migration 1–8 có khóa khi khởi động, seed danh mục/vai trò và gói mặc định nếu chưa có; không ghi đè active revision sau restart. Chạy lại `demo:up` không xóa dữ liệu. `demo:down` dừng/xóa container/network và giữ volume. Không dùng `down -v` trên dữ liệu cần giữ. Sau nâng cấp source, backup bản hiện tại, đọc migration/giới hạn, rồi chạy `demo:up`; bản RC này chưa có migration hạ cấp.

## Hai bản clone trên cùng máy

Tên project Compose quyết định container, network và volume của bản cài. Hai thư mục clone dùng cùng tên project vẫn trỏ vào cùng tài nguyên Docker; một clone mới chưa tự chứng minh dữ liệu mới. Trước `demo:init` của bản thứ hai, thêm ba dòng sau vào `.env` của **bản thứ hai** (hoặc đặt biến môi trường trước init):

```dotenv
COMPOSE_PROJECT_NAME=schoolops-trial
SIROCCO_WEB_PORT=8098
SIROCCO_AUTH_PORT=8190
```

Chọn tên chưa có trong `docker compose ls -a` và cặp cổng đang trống. Chạy `pnpm demo:init`, `pnpm demo:up`, `pnpm demo:users` trong thư mục đó. Init giữ các giá trị và sinh credential riêng; web ở `http://localhost:8098`, đăng nhập ở `http://localhost:8190`. Các bộ verify, Playwright, CLI gói và restore dùng cấu hình local này. Cổng vẫn chỉ bind loopback. Đặt tên riêng **và** cổng riêng; đổi riêng cổng không cách ly database.

Nếu đổi cổng một bản cài đã có, chạy lại `demo:init`, `demo:up`, `demo:users` để đồng bộ redirect đăng nhập. Không thay secret hoặc dùng `.env` của clone khác với volume cũ. Dừng bằng `docker compose stop` trong đúng thư mục; kiểm tên project trước mọi lệnh có thể ảnh hưởng dữ liệu. Bản phục hồi giữ cổng của backup và dùng project riêng; bài diễn tập tạm dừng đúng bản nguồn để nhường cặp cổng đó.

Vite dev server dùng `SIROCCO_WEB_PORT` trong `.env` gốc làm đích proxy; cổng Vite vẫn là 5173. Script quay video RC1 giữ kiểm tra phiên bản RC1 và không được dùng để ghi hình bản mới.

Để tạm dừng sau khi thử, chạy `docker compose stop` trong thư mục clone. Khi cần mở lại, chạy `pnpm demo:up`; dữ liệu cũ được giữ. Với lần cài mới trên máy khác, luôn chạy `demo:init` để sinh secret của chính máy đó.

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
pnpm demo:verify:boundaries --isolated-demo
pnpm exec playwright install chromium
pnpm test:e2e
pnpm source:verify
pnpm security:audit
pnpm legal:audit
pnpm demo:verify:phase7
```

Giai đoạn 3 chủ động gây lỗi dịch vụ; giai đoạn 7 tạm dừng nguồn để nhường cổng cho stack restore độc lập rồi khởi động lại nguồn trong `finally`. Không thao tác demo đồng thời. Bài restore giữ project/volume diễn tập và dữ liệu nguồn; xem [backup/restore](BACKUP-RESTORE.md). Ubuntu CI cài Chromium với `--with-deps`.

Bộ `boundaries` tạm thay role/membership của tài khoản demo và cho hai tác vụ gửi song song, khôi phục fixture trong `finally`. Chỉ dùng dữ liệu giả trên bản cài thử riêng với `--isolated-demo`, chạy tuần tự với các suite khác; không chạy khi đồng đội/người dùng đang thao tác cùng môi trường. Token cũ không tự cấp lại quyền đã thu hồi trong membership ứng dụng. Riêng vô hiệu hóa tại Keycloak chưa có back-channel revocation; access token đã cấp có thể còn hiệu lực tới hạn nếu membership SchoolOps vẫn được bật, nên không tuyên bố tắt Keycloak là thu hồi tức thì mọi request.

Khi lỗi: `docker compose ps`, `pnpm demo:logs`, kiểm tra `GET /api/health/ready` và report dưới `test-results/`. `429` nghĩa là chờ quota reset rồi bấm Làm mới/thử lại; UI giữ biểu mẫu và không tự gửi lại thao tác. `Chờ đối soát` nghĩa là command đã được giữ; chờ worker/engine phục hồi, không sửa database để bỏ bước. Tệp pending/error chưa được dùng làm bằng chứng. Không in `docker compose config` có secret để gửi lên mạng.

Nếu đã thấy “Đã nhận tệp” nhưng danh sách bằng chứng lỗi, dùng **Làm mới bằng chứng** khi mạng phục hồi; thao tác đó chỉ đọc lại, không tải tệp lên lần nữa. Chưa đọc được kết quả hoặc JSON trả về bị ngắt thì kiểm tra hồ sơ trước khi gửi lại. Đổi sang task xử lý mới sẽ xóa lựa chọn tệp đang giữ cho task cũ; bằng chứng vòng trước vẫn ở lịch sử nhưng không đủ điều kiện thay cho vòng mới.
