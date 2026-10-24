# Sirocco Core + SchoolOps

Nền tảng dịch vụ nguồn mở điều phối hồ sơ theo gói nghiệp vụ, minh họa bằng SchoolOps trong vận hành trường học. Dự án của đội SIU Sirocco, Olympic Phần mềm nguồn mở 2026.

## Trạng thái

Giai đoạn 4 bổ sung registry/CLI gói có phiên bản và G01 v1/v2. Xem [hướng dẫn gói](docs/PHASE-4.md); quy trình review/merge vẫn qua các PR phụ thuộc.

Đã có nền tảng giai đoạn 1, luồng G01 giai đoạn 2 và các chức năng giai đoạn 3: upload/cách ly/quét bằng chứng bằng SeaweedFS + ClamAV, chặn gửi nghiệm thu khi thiếu bằng chứng sạch, outbox/worker tự phục hồi lỗi và báo cáo theo quyền. Web/API dùng Keycloak, APISIX, PostgreSQL và Flowable thật.

Xem [hướng dẫn giai đoạn 3](docs/PHASE-3.md), [ma trận nghiệm thu](docs/verification/phase-3-acceptance.md), [G01](docs/PHASE-2.md), [nền tảng](docs/PHASE-1.md) và [OpenAPI](docs/openapi.yaml). Validate/activate gói v1/v2, G02/G03 và backup/restore thuộc các giai đoạn tiếp theo. Mã đang trên nhánh phát triển; kiểm tra CI/review và thứ tự merge của PR trước khi dùng main.

```powershell
pnpm install --frozen-lockfile
pnpm demo:init
pnpm demo:up
# Sau khi Docker/services đã sẵn sàng, mở http://localhost:8088
pnpm demo:verify
pnpm demo:verify:g01
pnpm demo:verify:phase3
pnpm test:e2e
```

## Mục tiêu

- **Sirocco Core:** tích hợp danh tính/SSO, API gateway, dữ liệu, tệp và workflow qua API.
- **G01 — Cơ sở vật chất:** báo sự cố → xác minh → giao việc → xử lý → nghiệm thu → đóng hồ sơ.
- **G02 — Môi trường:** phát lại dữ liệu PM2.5 có nhãn, kiểm tra chất lượng, cảnh báo và truy nguồn hồ sơ xử lý.
- **G03 — An toàn:** một tình huống giả lập với quyền truy cập hạn chế ở hồ sơ và tệp.
- **Gói nghiệp vụ:** kiểm tra cấu hình trước kích hoạt và giữ tham chiếu phiên bản cho từng hồ sơ.

G01 là luồng triển khai đầu tiên. Tình huống xuyên suốt: giáo viên báo máy chiếu phòng A101 không hoạt động; điều phối xác minh/giao việc; kỹ thuật viên xử lý; người nghiệm thu phê duyệt và đóng hồ sơ.

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

Giấy phép phát hành sẽ được chốt và bổ sung trước bản phát hành đầu tiên sau khi rà soát các thành phần kế thừa/phụ thuộc. Dự án hiện chưa công bố giấy phép cho mã nguồn mới.

Nếu sử dụng mã từ [Eco-Track 2025](https://github.com/SIU-Sirocco-2025/Eco-Track), đội sẽ ghi rõ nguồn gốc, giữ thông báo tác giả và tuân thủ giấy phép của phần được sử dụng.

## Dữ liệu demo

Dùng dữ liệu giả lập có nhãn. Không đưa mật khẩu, token, khóa bí mật hoặc dữ liệu cá nhân thật vào kho mã nguồn.
