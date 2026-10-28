# Báo lỗi bảo mật và phạm vi sử dụng

Bản 0.1.0-rc.1 phục vụ demo/nghiệm thu local, dùng dữ liệu giả lập, cổng bind loopback và Keycloak development mode. Không triển khai Internet/production với cấu hình này. Những phần cần thiết kế thêm gồm TLS, secret management, vận hành đa trường, chính sách lưu/xóa dữ liệu, giám sát và DR.

Nếu phát hiện lỗi phân quyền, lộ file/token hoặc dữ liệu thật: dừng dùng dữ liệu đó, giữ thông tin phiên bản và cách tái hiện tối thiểu, liên hệ maintainer qua kênh riêng đã thống nhất. Repo chưa công bố mailbox bảo mật riêng. Không đăng token, mật khẩu, backup, nội dung G03 hoặc dữ liệu cá nhân lên Issue công khai; có thể mở Issue mô tả chung sau khi thống nhất phạm vi công bố.

Không đưa `.env`, `infra/generated`, `.local`, report/trace chứa phiên đăng nhập hoặc dump DB vào source/release. Artifact vận hành/backup được giữ riêng, backup cần passphrase ngoài archive. Browser trace chỉ là artifact kiểm thử, phải coi là nhạy cảm và không đưa vào release công khai.

Các quyền ứng dụng được kiểm tra trên request hiện hành; operator có quyền database/host vẫn là ranh giới tin cậy. CI xanh không thay thế review mã, nghiệm thu người dùng hoặc kiểm định bảo mật độc lập.
