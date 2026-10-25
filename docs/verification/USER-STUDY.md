# Kế hoạch thử với người dùng mục tiêu

Mục tiêu đợt đầu là tìm bước khó hiểu hoặc chặn hoàn tất ở G01/G03 và cách đọc G02. Đây là kế hoạch thu dữ liệu, chưa có kết quả. Phản biện dựa trên tài liệu, thử nội bộ của người phát triển và thử của giáo viên/nhân viên trường được ghi thành ba loại riêng.

## Người thử và môi trường

Mời khoảng 3–5 người có vai trò giáo viên, hành chính hoặc kỹ thuật trường học, nếu đội có thể tiếp cận và họ đồng ý. Đây là mẫu thuận tiện cho đánh giá hình thành; không phải cỡ mẫu đã tính power hoặc đại diện cho mọi trường. Không tính số vai trò, số task hoặc lượt đo lặp của cùng người thành số người độc lập.

Đội tự thử kỹ thuật trước để loại lỗi ngăn chạy, rồi tổ chức buổi với người dùng mục tiêu trên [một môi trường chung](../SHARED-EVALUATION.md). Chỉ dùng dữ liệu giả lập. Thông báo mục đích, quyền dừng, dữ liệu thu và việc ghi màn hình; chỉ ghi nếu người thử đồng ý. Dùng mã P01/P02 trong kết quả công khai, giữ thông tin liên hệ ngoài repo.

## Thu dữ liệu trước khi sửa tiêu chí

Chọn task phù hợp chuyên môn từng người trong [checklist vai trò](role-feedback.md). Giữ cùng mô tả tình huống và dữ liệu xuất phát cho các lượt tương đương; ghi khác biệt thiết bị, mạng và mức quen phần mềm. Câu hỏi quan sát là “người thử có hoàn tất task và hiểu trạng thái không”, chưa phải “SchoolOps tốt hơn công cụ khác”.

Người điều phối đọc mục tiêu task, không chỉ nút cần bấm. Ghi giờ bắt đầu/kết thúc, kết quả, lỗi và lần cần trợ giúp. Một task dừng sau 5 phút hoặc khi người thử muốn dừng; ngưỡng này là quy tắc tổ chức đợt đầu, không phải SLO của hệ thống. Nếu cần trợ giúp để tiếp tục, ghi rõ và không tính là hoàn tất độc lập. Người dùng giữ nguyên quyền dừng dù task chưa xong.

Sau task, hỏi mức dễ thực hiện 1–5: 1 không biết cách làm; 2 cần trợ giúp nhiều; 3 làm được nhưng khó hiểu; 4 làm được với chút do dự; 5 rõ và tự làm được. Thang này là câu hỏi riêng của đội, không phải SUS. Nếu dùng SUS, người phụ trách cần chọn bản 10 câu/nguồn và cách chấm trước khi thu, lưu bản sử dụng, không đổi lời tùy ý rồi vẫn gọi là SUS. Chỉ ghi điểm sau khi có đủ câu trả lời hợp lệ.

## Cách đọc kết quả và khép lỗi

Báo số người độc lập, số task được giao, số hoàn tất độc lập/có trợ giúp/dừng và thời gian từng lượt. Mô tả điểm khó dùng kèm phiên bản, bước và ảnh đã che dữ liệu. Có thể báo median/range khi có dữ liệu, nhưng không gán ý nghĩa thống kê hoặc khẳng định tác động nhân quả từ mẫu nhỏ này. Sự học qua task và hiểu biết trước của thành viên phát triển là yếu tố gây nhiễu cần ghi.

Tách loại lỗi khỏi mức nghiêm trọng theo [mẫu phản hồi](role-feedback.md). Sau sửa, mời thử lại đúng task và lưu cả kết quả ban đầu. Nếu muốn so với Forms/Zalo/công cụ khác, lập thiết kế đối chứng riêng với task tương đương, phân bổ thứ tự và cách phân tích trước khi thu; không dùng thời gian đã học thao tác để kết luận hơn kém.

Người chịu trách nhiệm chốt nghiệm thu cuối cùng: **chưa được đội chỉ định**. Trước buổi thử, điền người phụ trách, phạm vi quyền chốt và cách lưu xác nhận trong mẫu. Agent không tự ký thay người thử hoặc người nghiệm thu.
