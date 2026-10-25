# Phản hồi người dùng theo vai trò

**Trạng thái:** chủ dự án cho biết chưa thử demo trong đợt nghiệm thu 25/10/2026 và sẽ gửi phản hồi sau. Chưa có bằng chứng nghiệm thu người dùng thật. Kiểm thử tự động/đánh giá của agent là bằng chứng kỹ thuật riêng, không được ghi thay tên người thử hoặc tạo approval.

Mở demo theo [user guide](../USER-GUIDE.md). Ghi source SHA/tag, môi trường và người thử thực tế ở lần chạy; không đưa mật khẩu/token/tên cá nhân thật của hồ sơ vào form. Một người có thể thử nhiều vai trò bằng các phiên riêng, nhưng ghi đúng ai đã thực hiện.

| Vai trò | Tình huống cần thử | Kết quả thực tế / điểm khó dùng | Trạng thái |
| --- | --- | --- | --- |
| Người báo G01 trên điện thoại | Tạo báo hỏng, nhận mã, bổ sung theo yêu cầu, theo dõi đóng | Chưa có phản hồi | Chờ người thử |
| Điều phối | Tiếp nhận/trả bổ sung, giao cá nhân/tổ, đặt hạn | Chưa có phản hồi | Chờ người thử |
| Kỹ thuật viên trên điện thoại | Nhận, ghi kết quả, upload, chờ sạch rồi gửi nghiệm thu | Chưa có phản hồi | Chờ người thử |
| Người nghiệm thu | Trả xử lý rồi phê duyệt, đọc timeline và bằng chứng | Chưa có phản hồi | Chờ người thử |
| Cán bộ môi trường | Đọc quality/lineage và đóng/bác cảnh báo có lý do | Chưa có phản hồi | Chờ người thử |
| Người báo/cán bộ/ nghiệm thu G03 | Báo trung tính, giao/đóng; thử account G01 không nhìn thấy | Chưa có phản hồi | Chờ người thử |
| Quản trị/vận hành | Xem gói active/lỗi, cài sạch và đọc restore report | Chưa có phản hồi | Chờ người thử |

Mẫu phản hồi: **version/SHA — vai trò — thao tác — mong đợi — thực tế — mức ảnh hưởng**. Người triển khai ghi Issue/commit sửa và bằng chứng thử lại cho lỗi được báo. Lỗi quyền/mất dữ liệu/chặn luồng phải được xử lý trước nghiệm thu; điểm phụ có thể ghi giới hạn cụ thể nếu người nghiệm thu chấp nhận. Các thẻ báo cáo phải được đối chiếu với danh sách nguồn trong cùng quyền; bộ kiểm thử kỹ thuật có kiểm tra tự động này, người thật vẫn xác nhận có hiểu cách dùng hay không.
