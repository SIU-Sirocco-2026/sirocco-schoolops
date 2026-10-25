# Thành phần bên ngoài

Apache-2.0 ở [LICENSE](LICENSE) áp dụng cho mã và tài liệu mới của SchoolOps. Giấy phép của thành phần bên ngoài được giữ nguyên; không coi toàn bộ stack là Apache-2.0.

| Thành phần | Vai trò | Giấy phép công bố / nguồn |
| --- | --- | --- |
| React, React DOM | Giao diện | MIT — [React](https://github.com/facebook/react/blob/main/LICENSE) |
| keycloak-js | OIDC client | Apache-2.0 — [Keycloak JS](https://github.com/keycloak/keycloak-js) |
| Express, Ajv, fast-xml-parser, jose, pg, zod | API/schema/XML/JWT/database | MIT — văn bản trong các package đã khóa |
| AWS SDK for JavaScript v3 | S3 client | Apache-2.0 — [upstream](https://github.com/aws/aws-sdk-js-v3/blob/main/LICENSE) |
| TypeScript, Vite, tsx, Playwright, pnpm, esbuild, Rolldown, Prettier và kiểu TypeScript | Công cụ phát triển/build/test | Apache-2.0 hoặc MIT; phụ thuộc gián tiếp có BSD/ISC/0BSD |
| Lightning CSS và native binding | Công cụ build CSS không sửa đổi | MPL-2.0 — [source](https://github.com/parcel-bundler/lightningcss), [FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/). Không chuyển giấy phép các tệp này sang Apache-2.0 |
| Keycloak, Flowable, Apache APISIX, SeaweedFS | Dịch vụ riêng qua OIDC/REST/S3 | Apache-2.0 — [Keycloak](https://github.com/keycloak/keycloak), [Flowable](https://github.com/flowable/flowable-engine), [APISIX](https://github.com/apache/apisix), [SeaweedFS](https://github.com/seaweedfs/seaweedfs) |
| PostgreSQL | Database | [PostgreSQL License](https://www.postgresql.org/about/licence/) |
| ClamAV | Scanner riêng qua TCP INSTREAM | GPL-2.0 — [upstream COPYING](https://github.com/Cisco-Talos/clamav/blob/main/COPYING.txt). SchoolOps không nhúng/link libclamav hoặc phân phối image ClamAV trong source archive |
| Node.js, nginx | Runtime/base image | MIT / BSD-2-Clause và giấy phép các thành phần bên trong — [Node](https://github.com/nodejs/node/blob/main/LICENSE), [nginx](https://nginx.org/LICENSE) |

Chạy `pnpm legal:audit` sau `pnpm install --frozen-lockfile`. Công cụ kiểm tra giấy phép của **mọi package được cài trên nền tảng đó**, kể cả công cụ/native binding, tạo inventory, CycloneDX SBOM và bản đầy đủ các thông báo vào `test-results/legal/`. Tên/version/license, nguồn notice và SHA-256 văn bản được lưu; thiếu thông báo hoặc gặp giấy phép chưa rà soát sẽ dừng lệnh. Một số package chỉ đặt license trong README; native binding dùng notice cùng version của upstream; ba package AWS thiếu tệp riêng dùng Apache-2.0 của cùng monorepo và ghi rõ xuất xứ.

Release source không chứa `node_modules`, Docker image hoặc binary bên thứ ba. Các image được người cài tải từ upstream theo digest trong `infra/images.lock.json`. Nếu phân phối thêm image/binary/offline bundle, cần giữ license/notice và cung cấp source theo điều khoản của từng thành phần; inventory npm không phải SBOM của toàn bộ hệ điều hành trong image. Không sửa nguồn MPL/GPL trong bản này. Xem [rà soát nguồn gốc](docs/PROVENANCE.md).
