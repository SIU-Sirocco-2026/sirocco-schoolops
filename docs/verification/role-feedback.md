# Phản hồi người dùng theo vai trò

Trạng thái ngày 25/10/2026: đã có phản biện nội bộ dựa trên tài liệu bàn giao; người phản biện ghi rõ chưa thử ứng dụng hoặc kiểm tra mã/CI/PR. Chưa có kết quả thao tác theo vai trò hoặc xác nhận của người dùng mục tiêu. Bản RC sẵn sàng cho đánh giá nội bộ; các kết quả tự động được ghi riêng trong [bằng chứng](EVIDENCE.md).

Mở demo theo [user guide](../USER-GUIDE.md). Ghi source SHA/tag, môi trường và người thử thực tế ở lần chạy; không đưa mật khẩu/token/tên cá nhân thật của hồ sơ vào form. Một người có thể thử nhiều vai trò bằng các phiên riêng, nhưng ghi đúng ai đã thực hiện.

| Vai trò                          | Tình huống cần thử                                         | Kết quả thực tế / điểm khó dùng | Trạng thái    |
| -------------------------------- | ---------------------------------------------------------- | ------------------------------- | ------------- |
| Người báo G01 trên điện thoại    | Tạo báo hỏng, nhận mã, bổ sung theo yêu cầu, theo dõi đóng | Chưa có phản hồi                | Chờ người thử |
| Điều phối                        | Tiếp nhận/trả bổ sung, giao cá nhân/tổ, đặt hạn            | Chưa có phản hồi                | Chờ người thử |
| Kỹ thuật viên trên điện thoại    | Nhận, ghi kết quả, upload, chờ sạch rồi gửi nghiệm thu     | Chưa có phản hồi                | Chờ người thử |
| Người nghiệm thu                 | Trả xử lý rồi phê duyệt, đọc timeline và bằng chứng        | Chưa có phản hồi                | Chờ người thử |
| Cán bộ môi trường                | Đọc quality/lineage và đóng/bác cảnh báo có lý do          | Chưa có phản hồi                | Chờ người thử |
| Người báo/cán bộ/ nghiệm thu G03 | Báo trung tính, giao/đóng; thử account G01 không nhìn thấy | Chưa có phản hồi                | Chờ người thử |
| Quản trị/vận hành                | Xem gói active/lỗi, cài sạch và đọc restore report         | Chưa có phản hồi                | Chờ người thử |

## Điều kiện đạt

| Vai trò           | Đạt khi người thử xác nhận                                                                | Không đạt hoặc bị chặn khi                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Người báo G01     | Nhận mã sau tạo; bổ sung đúng case khi bị trả; đọc được kết quả đóng trên cùng mã         | Mất biểu mẫu/dữ liệu, tạo trùng ngoài ý định hoặc không theo dõi được case của mình           |
| Điều phối         | Trả có lý do, tiếp nhận, giao đúng người/nghiệm thu và hạn; bên được giao thấy cùng mã    | Giao sai quyền, mất hạn hoặc người được giao không nhận được công việc                        |
| Kỹ thuật viên     | Nhận đúng task, lưu kết quả, tải tệp, đợi sạch rồi gửi nghiệm thu                         | Dùng được tệp chưa sạch, mất kết quả hoặc gửi sai task/vòng xử lý                             |
| Nghiệm thu        | Trả xử lý có lý do, đọc bằng chứng mới ở vòng sau và đóng; người báo thấy kết quả         | Tự nghiệm thu việc mình xử lý, đóng thiếu điều kiện hoặc timeline sai                         |
| Môi trường        | Đọc đúng nguồn/quality/rule/case và đóng hoặc bác có lý do                                | Không truy được số đo gốc hoặc số đo giảm tự đóng công việc                                   |
| G03               | Các tài khoản được giao hoàn tất cùng case; G01/admin biết ID vẫn bị chặn nội dung và tệp | Rò case/file, số liệu hoặc thông báo ngoài quyền; cùng role tự đọc được case không có quan hệ |
| Quản trị/vận hành | Xác nhận version/SHA, health, gói active; cài sạch hoặc khôi phục theo nhiệm vụ được giao | Sai phiên bản, mất dữ liệu hoặc khôi phục không tiếp tục được workflow                        |

Mỗi hàng chỉ “đạt” khi các bước được giao đã thử và có kết quả lưu lại. Ghi riêng “chưa thử” và “bị chặn bởi môi trường”. Với báo cáo, đối chiếu từng thẻ với danh sách nguồn trong cùng quyền/bộ lọc/thời điểm. Làm mới các phiên khi bàn giao cùng case; xem [môi trường chung](../SHARED-EVALUATION.md) và [kế hoạch người dùng](USER-STUDY.md).

## Ghi lỗi và mức nghiêm trọng

Loại lỗi: quyền, dữ liệu, workflow, giao diện/khả dụng, cài đặt hoặc mạng/môi trường. Mức nghiêm trọng ghi riêng: Blocker nếu không tiếp tục thử hoặc lộ quyền/mất dữ liệu; Major nếu một tác vụ chính sai nhưng còn cách tiếp tục an toàn; Minor nếu bất tiện mà không làm sai kết quả. Người điều phối xác nhận mức; không hạ mức chỉ để chốt nghiệm thu.

```text
Người thử (mã):
Nhóm: thành viên đội / người dùng mục tiêu (vai trò chuyên môn):
Version, sourceRevision, ngày giờ, máy chủ môi trường:
Thiết bị, trình duyệt, giả lập hay điện thoại thật:
Vai trò/tài khoản demo và mã case giả lập:
Mục tiêu task và các bước tái hiện:
Kết quả mong đợi:
Kết quả thực tế:
Bắt đầu, kết thúc, thời gian thực hiện:
Hoàn tất độc lập / có trợ giúp (ghi rõ) / dừng / chưa thử:
Mức dễ thực hiện 1–5 theo USER-STUDY (không phải SUS):
Loại lỗi và mức nghiêm trọng (hai mục riêng):
Ảnh đã che dữ liệu, Issue/commit sửa nếu có:
Kết quả thử lại và người thử lại:
Người chốt nghiệm thu, phạm vi chốt và ngày xác nhận:
```

Người chốt nghiệm thu cuối cùng chưa được đội chỉ định. Ghi người phụ trách trước buổi thử và giữ xác nhận của họ cùng kết quả. Xử lý lỗi sai quyền, mất dữ liệu hoặc chặn luồng rồi thử lại trước khi chốt. Điểm phụ muốn hoãn phải có người nghiệm thu chấp nhận và ghi rõ. Phản hồi trải nghiệm và approval PR là hai kết quả cần lưu riêng.
