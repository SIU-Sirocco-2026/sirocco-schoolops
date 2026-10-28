# Sirocco Core + SchoolOps

Nền tảng dịch vụ nguồn mở điều phối hồ sơ theo gói nghiệp vụ, minh họa bằng SchoolOps trong vận hành trường học. Dự án của đội SIU Sirocco, Olympic Phần mềm nguồn mở 2026.

## Tải đúng bản để thử

[Nhánh develop](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/tree/develop) chứa ứng dụng tích hợp cùng giao diện mới: trang giới thiệu các không gian, báo cáo và danh sách G01, xem ảnh bằng chứng, chuyển động có giảm hiệu ứng và giao diện xác thực đồng bộ. `main` còn chờ review/merge tại [PR #49](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/pull/49). Xem [quy ước nhánh](docs/BRANCHING.md).

Đây là bản để thử và ghi phản hồi, chưa phải release mới. Khi nhận lời mời review, lấy đúng SHA trong bộ hướng dẫn bàn giao; không mặc định đầu nhánh develop luôn là bản đã được reviewer thử. Kiểm tra CI của chính commit đang dùng. Bằng chứng [full CI của bản 4be87bb trước đó](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/actions/runs/40633098387) được giữ để truy vết, không tự áp dụng cho giao diện mới. Nghiệm thu người dùng thật và review đội còn chờ.

```powershell
git clone --branch develop --single-branch https://github.com/SIU-Sirocco-2026/sirocco-schoolops.git
cd sirocco-schoolops
git rev-parse HEAD
pnpm install --frozen-lockfile
pnpm demo:init
pnpm demo:up
pnpm demo:users
pnpm demo:verify
```

Cần Git, Node 22.16.0, pnpm 11.25.0 và Docker chạy Linux containers. Mở `http://localhost:8088`; mật khẩu demo là `DEMO_PASSWORD` trong `.env` trên máy chạy. Đọc [cài đặt](docs/INSTALL.md) trước khi nâng cấp bản đã có dữ liệu. Trên nhánh tài liệu mới, các hướng dẫn đánh giá có thể mới hơn bản RC; kết quả của RC chỉ chứng minh commit được ghi trong release.

Ghi lại `git rev-parse HEAD` trước khi thử. Nếu reviewer được giao một SHA cụ thể, dùng `git fetch origin SHA` rồi `git switch --detach SHA` với giá trị thật trong lời mời; không tự `git pull` giữa lượt thử. Nếu đã có stack trên máy, đặt tên Compose và cặp cổng riêng theo [hướng dẫn cách ly](docs/INSTALL.md#hai-bản-clone-trên-cùng-máy) trước init/startup; đổi riêng thư mục không tách database.

Đăng nhập thử bằng `reporter`, `coordinator`, `technician`, `approver` theo [hướng dẫn vai trò](docs/USER-GUIDE.md). Mỗi bản cài riêng có database riêng; để cùng bàn giao một hồ sơ giữa các thành viên, dùng [một môi trường chung](docs/SHARED-EVALUATION.md).

[Bản thử v0.1.0-rc.2](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/releases/tag/v0.1.0-rc.2) vẫn nằm ở tag, gồm các bản vá của [PR #19](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/pull/19) và giao diện trước đợt chỉnh này. Muốn tái lập RC2, clone với `--branch v0.1.0-rc.2` và bỏ bước switch sang SHA mới ở trên; tag RC1 cũng được giữ để tái lập lịch sử. Metadata package hiện vẫn là 0.1.0-rc.2 trong các nhánh sau RC2; cần đối chiếu sourceRevision, không chỉ dựa vào version hoặc tên artifact CI.

## Bài toán và người sử dụng

SchoolOps hướng tới việc phối hợp giữa người báo, người điều phối, người xử lý và người nghiệm thu trong một trường. Tình huống mẫu là máy chiếu A101 hỏng: cần biết ai đang giữ việc, hạn nào phải xong, bằng chứng nào đã được quét sạch và ai đã nghiệm thu. Hiện chưa có trường triển khai thử hoặc số liệu khảo sát đủ để khẳng định hiệu quả hay quy mô phục vụ thực tế.

G01 xử lý sự cố cơ sở vật chất; G02 chuyển đợt cảnh báo PM2.5 replay thành công việc có nguồn gốc số đo; G03 giới hạn người đọc từng hồ sơ và tệp. Ba gói dùng chung nền tảng hồ sơ, task và bằng chứng. Đội đóng góp lớp tích hợp, gói nghiệp vụ, API/UI và cơ chế đối soát; Keycloak, Flowable, APISIX, PostgreSQL, SeaweedFS và ClamAV giữ vai trò của các thành phần nguồn mở được tích hợp.

Xem [giới thiệu và đối chiếu giải pháp](docs/PROJECT-OVERVIEW.md), [kiến trúc](docs/ARCHITECTURE.md), [ảnh và kịch bản demo](docs/DEMO-MEDIA.md). Để thử việc bàn giao cùng hồ sơ giữa nhiều người, dùng [một môi trường chung](docs/SHARED-EVALUATION.md); không chia mỗi bước của một hồ sơ sang các bản cài có database riêng.

## Trạng thái

Nhánh develop có nền tảng và các luồng G01/G02/G03, gói phiên bản, bằng chứng/đối soát cùng các sửa lỗi nêu trên. Giai đoạn 7 có công cụ nghiệm thu, backup/restore, giấy phép và đóng gói. PR tích hợp #49 thay thế chuỗi PR cũ; `main` chưa tự cập nhật. Phản hồi người dùng thật theo vai trò còn chờ; xem [ma trận giai đoạn 7](docs/verification/phase-7-acceptance.md).

Bắt đầu: [cài từ source](docs/INSTALL.md), [người dùng](docs/USER-GUIDE.md), [demo xuyên suốt](docs/DEMO-SCRIPT.md), [backup/restore](docs/BACKUP-RESTORE.md), [giới hạn/bảo mật](SECURITY.md). Kỹ thuật: [giai đoạn 7](docs/PHASE-7.md), [gói v1/v2 và cách tạo gói](docs/PHASE-4.md), [G02](docs/PHASE-5.md), [G03](docs/PHASE-6.md), [bằng chứng/worker](docs/PHASE-3.md), [G01](docs/PHASE-2.md), [nền tảng](docs/PHASE-1.md), [OpenAPI](docs/openapi.yaml).

Kiểm chứng và đóng gói từ Git checkout trên demo kỹ thuật riêng (có các bước chủ động gây lỗi/dừng dịch vụ):

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm demo:init
pnpm demo:up
pnpm demo:users
# Sau khi Docker/services đã sẵn sàng, mở http://localhost:8088
pnpm demo:verify
pnpm demo:verify:g01
pnpm demo:verify:phase3
pnpm demo:verify:phase4
pnpm demo:verify:phase5
pnpm demo:verify:phase6
pnpm demo:verify:boundaries --isolated-demo
pnpm demo:verify:headless
pnpm exec playwright install chromium
pnpm test:e2e
pnpm demo:verify:phase7
pnpm source:verify
pnpm security:audit
pnpm legal:audit
pnpm release:prepare
```

## Mục tiêu

- **Sirocco Core:** tích hợp danh tính/SSO, API gateway, dữ liệu, tệp và workflow qua API.
- **G01 — Cơ sở vật chất:** báo sự cố → xác minh → giao việc → xử lý → nghiệm thu → đóng hồ sơ.
- **G02 — Môi trường:** phát lại dữ liệu PM2.5 có nhãn, kiểm tra chất lượng, cảnh báo và truy nguồn hồ sơ xử lý.
- **G03 — An toàn:** một tình huống giả lập với quyền truy cập hạn chế ở hồ sơ và tệp.
- **Gói nghiệp vụ:** kiểm tra cấu hình trước kích hoạt và giữ tham chiếu phiên bản cho từng hồ sơ.

G01 là luồng triển khai đầu tiên. G02 và G03 dùng lại API hồ sơ/nhiệm vụ/bằng chứng và giao diện chung với quyền, gói và adapter riêng. Tình huống xuyên suốt: giáo viên báo máy chiếu phòng A101 không hoạt động; điều phối xác minh/giao việc; kỹ thuật viên xử lý; người nghiệm thu phê duyệt và đóng hồ sơ.

## Cấu trúc dự kiến

```text
apps/
  web/       Giao diện SchoolOps
  api/       API hồ sơ, nhiệm vụ, bằng chứng và quyền
  # Worker giai đoạn 3 hiện dùng apps/api/src/worker.ts và cùng Docker image API
infra/       Cấu hình hạ tầng và môi trường chạy
packs/       Gói nghiệp vụ G01/G02/G03
docs/        Kiến trúc, API và hướng dẫn
```

`demo:verify:phase3` chủ động dừng/khởi động engine/scanner/worker để thử lỗi: chỉ chạy trên stack demo kỹ thuật riêng, tuần tự với các phép kiểm tra khác. Không chạy bài gây lỗi hoặc restore trên môi trường chung khi người khác đang thử. Xem [cài đặt](docs/INSTALL.md) cho lưu ý Windows MSIX.

## Lộ trình

| Mốc                       | Đầu ra                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| Đã có trong RC 25/10/2026 | Nền tảng, G01/G02/G03, v1/v2, backup/restore, nguồn/giấy phép và bằng chứng tự động      |
| Chờ người thực hiện       | Review mã độc lập, thử trong đội trên một môi trường chung, phản hồi người dùng mục tiêu |
| Đề xuất tiếp theo         | Image dựng sẵn, macOS/arm64, a11y, tải/hiệu năng và đánh giá bảo mật có phạm vi riêng    |
| Mục tiêu trước hạn nộp    | Đối chiếu thể lệ hiện hành, khép lỗi chặn luồng, chốt bằng chứng và bản phát hành dự thi |

Ngày trong kế hoạch ban đầu không phải ngày xác nhận hoàn thành. Xem [phạm vi bằng chứng](docs/verification/EVIDENCE.md) và [kế hoạch thử người dùng](docs/verification/USER-STUDY.md) để biết phần đã đo và phần chưa có dữ liệu.

## Cộng tác

Quy trình thống nhất ở [CONTRIBUTING.md](CONTRIBUTING.md): Issue → nhánh chức năng → commit tiếng Việt nêu rõ thay đổi → PR → CI/review → merge giữ các commit có ý nghĩa. Xem [bảng đối chiếu lịch sử đã tách](docs/LICH-SU-TACH-COMMIT.md) cho các thay đổi nền tảng và G01.

Tham gia theo [quy tắc ứng xử](CODE_OF_CONDUCT.md); báo lỗ hổng theo [SECURITY](SECURITY.md). Bản RC chưa có xác nhận review mã độc lập; người trong đội cần đọc diff, ghi nhận xét và thử lại trước khi merge chuỗi PR.

Theo dõi công việc và báo lỗi bằng GitHub Issues. Mỗi việc cần có đầu ra kiểm chứng được, người phụ trách và người review. Phân công cụ thể được đội xác nhận khi khởi động.

Mỗi pull request cần nêu thay đổi, cách kiểm tra và giới hạn còn lại. Tài liệu, kiểm thử và lịch sử thay đổi được cập nhật cùng mã nguồn.

## Nguồn gốc và giấy phép

Mã và tài liệu mới dùng [Apache-2.0](LICENSE). Xem [NOTICE](NOTICE), [thành phần bên ngoài](THIRD_PARTY_NOTICES.md) và [rà soát nguồn gốc](docs/PROVENANCE.md). Phụ thuộc giữ giấy phép riêng; source archive không phân phối image hoặc binary bên thứ ba.

Lịch sử source hiện tại không nhập cây mã ứng dụng Eco-Track. Nếu dùng mã ngoài về sau, ghi nguồn/version/phạm vi sửa và giữ giấy phép tương ứng trước khi merge. Release candidate ghi source SHA, version, image digest và bằng chứng tự động; không thay nghiệm thu/review của người thật.

## Dữ liệu demo

Dùng dữ liệu giả lập có nhãn. Không đưa mật khẩu, token, khóa bí mật hoặc dữ liệu cá nhân thật vào kho mã nguồn.
