# Phạm vi giai đoạn 5 theo roadmap

## Giai đoạn 5 — Mở rộng sang môi trường G02

**Chức năng cần có**
- Nhận một nguồn PM2.5 qua API ingestion; bản đầu dùng replay xác định có nhãn.
- Giữ raw/normalized, nguồn, event ID, thời gian đo/nhận, đơn vị và chất lượng.
- Kiểm tra dữ liệu sai/trùng/trễ; áp dụng quy tắc cảnh báo có phiên bản và chống sinh lặp đợt cảnh báo.
- Tạo/liên kết hồ sơ; cán bộ xác minh, ghi biện pháp và đóng có lý do.
- Từ cảnh báo truy được phép đo, kiểm tra chất lượng, quy tắc và hồ sơ xử lý.

**Hoàn thành khi:** bộ replay có kết quả khớp kỳ vọng, cảnh báo truy nguồn được và công việc được xử lý bằng API hồ sơ/nhiệm vụ/bằng chứng dùng chung.

Phạm vi giữ hẹp: một nguồn, một luồng minh họa. Ngưỡng demo có nhãn; số đo giảm không tự đóng công việc.

