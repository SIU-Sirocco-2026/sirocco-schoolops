# Bằng chứng của bản RC và giới hạn kết luận

Nguồn cố định của v0.1.0-rc.1 là commit `84f2ecfe31ff12b0d4cb3cd09899e37f14975e55`. [CI](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/actions/runs/40150424871) và [asset release](https://github.com/SIU-Sirocco-2026/sirocco-schoolops/releases/tag/v0.1.0-rc.1) chứng minh bản đó. Tài liệu sửa sau tag không được coi là đã kiểm thử trong CI cũ.

| Bằng chứng RC      | Cách hiểu và nguồn                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 38 unit/tool tests | 29 API, 4 web HTTP, 5 ops/release; xem CI đúng SHA. Không phải số dòng được phủ.                                                                                                                                                                        |
| 67 nhóm tích hợp   | 67 nhóm assertion có tên do bảy script báo cáo: nền tảng 8, G01 9, giai đoạn 3 là 17, giai đoạn 4 là 7, giai đoạn 5 là 9, giai đoạn 6 là 8, giai đoạn 7 là 9. Một nhóm có thể gồm nhiều request/kiểm tra; không gọi là 67 bộ độc lập hoặc 67 người thử. |
| 10 bài Chromium    | Cả 10 đạt ngay trong lần CI nêu trên, không phải chạy lại mới đạt. Chưa có ước lượng tỷ lệ flaky dài hạn. G03 đã chạy ba lần liên tiếp tại commit trước đó `8935c26`; không gán ba lần đó cho SHA cuối.                                                 |
| Cài source sạch    | CI cài bằng lockfile; archive RC tải về đã được frozen install/typecheck/38 tests/build trong thư mục Windows mới.                                                                                                                                      |
| Khôi phục thật     | Giai đoạn 7 gồm giải mã, khôi phục ba DB/tệp vào project mới, đối chiếu mọi bảng và file, đăng nhập mới, tiếp tục workflow và sao lưu tiếp. Lượt Windows 187 bảng thuộc commit `ad215ab`; CI Linux xác nhận toàn bộ tại SHA cuối.                       |
| Nguồn và giấy phép | `source-audit`, inventory 164 package cài trên nền tảng CI, CycloneDX SBOM, notice đầy đủ, manifest và SHA256SUMS được lưu trong release. Inventory npm chưa bao phủ base OS của image.                                                                 |
| Giới hạn quyền     | Test G03 kiểm tra case/file và known-ID access, cùng báo cáo theo quyền. Xem `scripts/verify-phase6.mjs`, `scripts/verify-phase7.mjs`, `tests/e2e/safety.spec.ts` và [ma trận quyền](ACCESS-MATRIX.md).                                                 |

`acceptance-evidence.json` trong release lưu kết quả tổng hợp đã gắn source/runtime, thay vì phụ thuộc hoàn toàn vào thời hạn lưu artifact của Actions. Đối chiếu `release-manifest.json` và `SHA256SUMS` sau khi tải. Raw trace và backup chứa thông tin nhạy cảm không nằm trong release.

## Chưa được chứng minh

Chưa có kết quả thử thao tác của người dùng mục tiêu hoặc review mã độc lập được ghi nhận trong hồ sơ này. Bản phản biện tài liệu nội bộ không thay hai kết quả đó. Chưa có báo cáo độ phủ mã, kiểm định a11y/WCAG, đo tải/hiệu năng theo SLO hoặc kiểm định bảo mật độc lập. TypeScript, test quyền, kiểm tra giấy phép và ClamAV có phạm vi riêng, không phải chứng nhận bảo mật toàn sản phẩm.

Windows/WSL2 và Ubuntu amd64 đã được dùng để kiểm tra. macOS và arm64 chưa được kiểm chứng. Chưa có số liệu về hiệu quả dự báo PM2.5, giảm thời gian xử lý ở trường hoặc khả năng chạy production.

Khi thêm bằng chứng, ghi lệnh, môi trường, source SHA, thời điểm, số lượt, kết quả và file báo cáo. Với độ phủ, ghi cả công cụ và mẫu số; với tải, ghi số người/nhịp gửi và percentiles; với quét phụ thuộc hoặc secret, lưu phạm vi và danh sách loại trừ. Không điền số 0 hoặc “đạt” cho phép đo chưa chạy.

## Quét phụ thuộc sau phản biện

Ngày 25/10/2026, lượt `pnpm audit --prod` trên lockfile RC báo hai advisory mức vừa: Ajv 8.17.1 và fast-xml-parser 5.5.8. Nhánh sửa nâng lên Ajv 8.18.0 và fast-xml-parser 5.7.0 theo [release Ajv](https://github.com/ajv-validator/ajv/releases/tag/v8.18.0) và [advisory XMLBuilder](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-gh4j-gqv2-49f6). Đây là các gói được bộ quét đánh dấu; chưa chứng minh hai đường khai thác tương ứng có thể thực thi trong SchoolOps.

Chạy `pnpm security:audit` để lưu JSON có SHA/thời điểm tại `test-results/dependency-audit.json`; CI từ chối mức vừa trở lên và báo lỗi nếu registry trả dữ liệu không hợp lệ. Một lượt sau nâng đã báo 0 advisory production ở tất cả mức. Kết quả phụ thuộc cơ sở advisory tại lúc chạy, chưa bao gồm image OS, quét secret hoặc pentest. Tag và archive RC cũ giữ nguyên dependency cũ; muốn dùng bản vá cần lấy commit nhánh sửa sau khi kiểm chứng.
