# Sirocco Core + SchoolOps

Nền tảng dịch vụ nguồn mở điều phối hồ sơ theo gói nghiệp vụ, minh họa bằng SchoolOps trong vận hành trường học. Dự án của đội SIU Sirocco, Olympic Phần mềm nguồn mở 2026.

## Trạng thái

Bản ứng viên **0.1.0-rc.1** có nền tảng và các luồng G01/G02/G03, gói phiên bản, bằng chứng/đối soát. Giai đoạn 7 bổ sung công cụ nghiệm thu, backup/restore, giấy phép và đóng gói. Mã nằm trên chuỗi PR chờ review/merge; `main` chưa tự cập nhật. Phản hồi người dùng thật theo vai trò còn chờ; xem [ma trận giai đoạn 7](docs/verification/phase-7-acceptance.md).

Bắt đầu: [cài từ source](docs/INSTALL.md), [người dùng](docs/USER-GUIDE.md), [demo xuyên suốt](docs/DEMO-SCRIPT.md), [backup/restore](docs/BACKUP-RESTORE.md), [giới hạn/bảo mật](SECURITY.md). Kỹ thuật: [giai đoạn 7](docs/PHASE-7.md), [gói v1/v2 và cách tạo gói](docs/PHASE-4.md), [G02](docs/PHASE-5.md), [G03](docs/PHASE-6.md), [bằng chứng/worker](docs/PHASE-3.md), [G01](docs/PHASE-2.md), [nền tảng](docs/PHASE-1.md), [OpenAPI](docs/openapi.yaml).

```powershell
pnpm install --frozen-lockfile
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
pnpm exec playwright install chromium
pnpm test:e2e
pnpm demo:verify:phase7
pnpm source:verify
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

`demo:verify:phase3` chủ động dừng/khởi động engine/scanner/worker để thử lỗi: chỉ chạy trên stack demo riêng, tuần tự với các phép kiểm tra khác. Trên máy Windows MSIX này, dùng helper `C:/Users/Thai Ho Phu Gia/.codex/tools/windows-docker/ensure-docker.ps1` trước khi làm việc với Docker; xem chi tiết trong hướng dẫn giai đoạn 3.

## Các mốc dự kiến

| Mốc        | Đầu ra                                                              |
| ---------- | ------------------------------------------------------------------- |
| 29/10/2026 | Bản tích hợp lõi: đăng nhập → tạo hồ sơ → sinh và hoàn tất nhiệm vụ |
| 08/11/2026 | G01 hoàn chỉnh và bản alpha                                         |
| 15/11/2026 | Kiểm chứng gói v1/v2 và luồng G02                                   |
| 22/11/2026 | Demo ba gói SchoolOps                                               |
| 29/11/2026 | Kiểm thử cài từ source, backup/restore và lỗi tích hợp              |
| 03/12/2026 | Bản phát hành dự thi và tài liệu demo                               |

## Cộng tác

Quy trình thống nhất ở [CONTRIBUTING.md](CONTRIBUTING.md): Issue → nhánh chức năng → commit tiếng Việt nêu rõ thay đổi → PR → CI/review → merge giữ các commit có ý nghĩa. Xem [bảng đối chiếu lịch sử đã tách](docs/LICH-SU-TACH-COMMIT.md) cho các thay đổi nền tảng và G01.

Theo dõi công việc và báo lỗi bằng GitHub Issues. Mỗi việc cần có đầu ra kiểm chứng được, người phụ trách và người review. Phân công cụ thể được đội xác nhận khi khởi động.

Mỗi pull request cần nêu thay đổi, cách kiểm tra và giới hạn còn lại. Tài liệu, kiểm thử và lịch sử thay đổi được cập nhật cùng mã nguồn.

## Nguồn gốc và giấy phép

Mã và tài liệu mới dùng [Apache-2.0](LICENSE). Xem [NOTICE](NOTICE), [thành phần bên ngoài](THIRD_PARTY_NOTICES.md) và [rà soát nguồn gốc](docs/PROVENANCE.md). Phụ thuộc giữ giấy phép riêng; source archive không phân phối image hoặc binary bên thứ ba.

Lịch sử source hiện tại không nhập cây mã ứng dụng Eco-Track. Nếu dùng mã ngoài về sau, ghi nguồn/version/phạm vi sửa và giữ giấy phép tương ứng trước khi merge. Release candidate ghi source SHA, version, image digest và bằng chứng tự động; không thay nghiệm thu/review của người thật.

## Dữ liệu demo

Dùng dữ liệu giả lập có nhãn. Không đưa mật khẩu, token, khóa bí mật hoặc dữ liệu cá nhân thật vào kho mã nguồn.
