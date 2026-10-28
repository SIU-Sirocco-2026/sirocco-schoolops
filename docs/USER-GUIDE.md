# Sử dụng demo theo vai trò

Trước đăng nhập, trang chủ giới thiệu ba không gian và sơ đồ phối hợp có thể bấm từng bước. Chọn **Cơ sở vật chất**, **Môi trường** hoặc **An toàn** để xem tính năng; có thể dùng phím mũi tên để chuyển mục. **Đăng nhập vào SchoolOps** mở hệ thống xác thực và đưa bạn vào không gian theo vai trò. **Kết nối lại** xuất hiện nếu chưa kết nối được dịch vụ. Đây là phần giới thiệu, không hiển thị dữ liệu hồ sơ.

Chuyển trang, mở hồ sơ, biểu đồ và xem ảnh có hiệu ứng ngắn để theo dõi thay đổi. Nếu đã bật **Giảm chuyển động** trong cài đặt trợ năng của thiết bị hoặc trình duyệt, SchoolOps tự tắt animation, kể cả ở trang đăng nhập; thao tác và dữ liệu vẫn giữ nguyên.

Đăng nhập ở `http://localhost:8088` với username bên dưới và mật khẩu local `DEMO_PASSWORD` trong `.env`. Tất cả là danh tính giả lập. Người khác vai trò có thể dùng trình duyệt/profile riêng; không chia sẻ token.

Giao diện nền sáng, logo và màu xanh được dùng chung cho đăng nhập, Foundation, G01/G02/G03 và quản lý gói. G02/G03 có cùng góc nhìn **Hồ sơ/Tổng quan**, bộ lọc, màn hình chi tiết và thư viện bằng chứng; quyền và các bước nghiệp vụ vẫn theo từng gói. Các giải thích dài và dữ liệu kỹ thuật mở khi cần. Trên điện thoại, mở **Không gian** để đổi trang; tên và vai trò của bạn nằm trên thanh tài khoản.

G01 có hai góc nhìn: **Hồ sơ** để tìm và xử lý công việc, **Tổng quan** để xem phân bổ và mở danh sách theo số tổng. Mở một hồ sơ sẽ chuyển sang màn hình chi tiết riêng, có tiến trình và người đang chịu trách nhiệm; dùng **Về danh sách** để quay lại. Khi cần trả bổ sung hoặc trả xử lý, mở dòng tương ứng trong **Bước tiếp theo**. Biểu mẫu **Báo sự cố mới** có không gian riêng; **Đóng biểu mẫu** giữ bản nháp trong phiên hiện tại.

Trên điện thoại, ô tìm kiếm nằm ngoài; mở **Bộ lọc** để chọn trạng thái, đổi **Công việc của tôi**, làm mới hoặc bỏ lọc. Khi chưa có việc cần thao tác, **Xem tất cả hồ sơ** mở danh sách trong quyền của bạn. Nếu còn bản nháp chưa gửi, chọn **Tiếp tục bản nháp** để mở lại.

Trong **Tổng quan**, biểu đồ vòng thể hiện đang mở/hoàn thành; vòng nhỏ bên trong đánh dấu phần quá hạn trên tổng hồ sơ. Bấm một hàng chú giải để mở danh sách tương ứng. Trong hồ sơ, sơ đồ biểu tượng cho biết bước hiện tại; **Thông tin khác** mở các trường phụ, **Chi tiết** trong lịch sử mở nội dung từng lần xử lý. Lý do trả lại luôn hiện trực tiếp.

Trên nhánh giao diện mới chưa phát hành, màn hình đăng nhập dùng tiếng Việt. Với stack đã có dữ liệu, chạy `pnpm demo:up` rồi `pnpm demo:users` để gắn theme và cập nhật phần trình bày; không cần tạo lại realm. Kỹ thuật viên và người nghiệm thu mở danh sách **Công việc của tôi**; cán bộ môi trường/an toàn mở đúng không gian tương ứng. Nhiệm vụ nền tảng nằm trong **Công cụ kiểm tra**.

| Tài khoản       | Việc có thể làm                                               | Việc cần quan sát                                                                |
| --------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| reporter        | Tạo G01, bổ sung hồ sơ của mình, xem kết quả                  | Điền phòng/thiết bị/mô tả, giữ mã hồ sơ; không thấy action của điều phối         |
| coordinator     | Tiếp nhận/trả bổ sung, giao cá nhân/tổ và hạn                 | Mỗi lần trả cần lý do; chỉ giao đúng vai trò                                     |
| technician      | Nhận việc, ghi biện pháp/kết quả, tải bằng chứng              | Chờ tệp quét sạch trước gửi nghiệm thu; bằng chứng phải thuộc lần xử lý hiện tại |
| approver        | Phê duyệt hoặc trả xử lý                                      | Không tự nghiệm thu phần mình xử lý; trả lại cần bằng chứng mới ở vòng sau       |
| environment     | Xem PM2.5/lineage, xác minh, xử lý hoặc bác cảnh báo có lý do | Số đo giảm không tự đóng hồ sơ; ngưỡng chỉ là minh họa                           |
| sensor          | Gửi replay qua CLI/API                                        | Không có quyền đọc hồ sơ hoặc dữ liệu môi trường                                 |
| safety_reporter | Báo tình huống G03 trung tính, xem hồ sơ được cấp quyền       | Không nhập danh tính hoặc nội dung cá nhân thật                                  |
| safety          | Tiếp nhận/giao/nhận/xử lý G03 và xem access log trong phạm vi | Cùng role chưa đủ nếu chưa có ACL/quan hệ case                                   |
| safety_reviewer | Nghiệm thu G03 khi được giao                                  | Không xem được case chưa được cấp quyền                                          |
| admin           | Kiểm tra/nạp/kích hoạt gói                                    | Không mặc định đọc G01/G02/G03                                                   |

G01: **Báo sự cố mới → Gửi báo sự cố → Tiếp nhận → Giao xử lý → Nhận xử lý → ghi kết quả + tải bằng chứng → Gửi nghiệm thu → Phê duyệt và đóng**. Nhánh trả bổ sung quay về người báo; nhánh trả xử lý quay về kỹ thuật viên. Timeline ghi người, lúc thực hiện và phiên bản. Xem chi tiết [G01](PHASE-2.md) và [tệp/đối soát](PHASE-3.md).

Tệp chỉ nhận PNG/JPEG/PDF/TXT đúng định dạng, tối đa 10 MB. `Chờ quét`/`Lỗi quét` không đủ điều kiện; chỉ `Đã quét sạch` được tải xuống/dùng. Gói G01 v2 yêu cầu ảnh PNG/JPEG sạch. Tải xong vẫn chờ scanner cập nhật; không bấm gửi lặp để ép qua bước. Bản sao gửi lặp dùng cùng khóa sẽ giữ hồ sơ cũ.

Chọn hoặc kéo thả từng tệp vào **Bằng chứng**. Ảnh PNG/JPEG hiện bản xem trước ngay trên thiết bị; chọn **Xem lớn** để kiểm tra, **Đổi tệp** để chọn lại hoặc **Bỏ tệp** để hủy lựa chọn. Dòng **Chưa tải lên hồ sơ** nhắc rằng bạn vẫn cần bấm **Tải bằng chứng**. Nếu tải lỗi, tệp đã chọn được giữ để bạn kiểm tra và thử lại. Sau khi ảnh được quét sạch, dùng **Xem ảnh** để mở ngay trong hồ sơ; nhấn **Đóng** hoặc Esc để trở lại. PDF/TXT hiện thông tin tệp và nút tải xuống sau khi quét sạch.

Ảnh đã quét sạch xuất hiện trong thư viện thumbnail: bấm vào ảnh để xem lớn. Nếu thumbnail chưa tải được, dùng **Thử lại**; tệp vẫn được giữ trong hồ sơ. Trên máy tính, đặt focus trong khung tải tệp rồi nhấn **Ctrl+V** để dán ảnh từ clipboard. Cần bấm **Tải bằng chứng** để gửi tệp đã chọn hoặc đã dán lên hồ sơ.

G02: vận hành chạy `pnpm demo:replay:g02`; cán bộ mở Môi trường, chọn đợt, xem nguồn/đơn vị/quality/rule/raw/normalized và hồ sơ được liên kết. Xác minh rồi ghi biện pháp, kết quả, lý do đóng và bằng chứng sạch. Hoặc bác cảnh báo với lý do. Nguồn replay có nhãn, không dùng ngưỡng demo để quyết định y tế/môi trường thật.

G03: người báo tạo phản ánh vật cản hành lang giả lập, cán bộ được cấp quyền tiếp nhận, giao `safety` xử lý và `safety_reviewer` nghiệm thu. Thông báo chỉ mở case trong quyền hiện tại. Account G01 hoặc admin biết ID vẫn không đọc được case/file G03. Access log là chức năng giới hạn cho cán bộ được cấp quyền trên đúng hồ sơ.

Các thẻ **Tất cả / Đang mở / Quá hạn / Hoàn thành** mở danh sách nguồn theo cùng quyền. Tổng giữa các vai trò có thể khác nhau. Khi đối soát, dùng cùng account, bộ lọc và thời điểm; quá hạn được tính theo hạn thực, không cộng vào tổng mở như một nhóm độc lập.

Trên nhánh giao diện mới, mở hồ sơ sẽ thêm `view` và `case` vào địa chỉ. Có thể giữ liên kết, tải lại hoặc dùng nút Back của trình duyệt để trở về hồ sơ trước; liên kết vẫn yêu cầu đúng quyền. Trên điện thoại, **Về danh sách** đưa focus về tiêu đề danh sách. Bấm **Đến bước xử lý** để tới biểu mẫu tác vụ; phần **Cần bạn thực hiện / Tiến độ xử lý** cho biết bước đang chờ ai.

Điện thoại: bộ kiểm thử dùng viewport 390×844 cho báo/giao/nhận/upload/nghiệm thu. Khi lỗi `429`, chờ số giây được thông báo rồi thử lại; biểu mẫu được giữ. Khi mất kết nối hoặc lỗi dịch vụ, bấm **Làm mới hồ sơ** để kiểm tra kết quả trước khi gửi lại. `Đang xác nhận` hoặc `Chờ đối soát` là trạng thái cần chờ, không phải xác nhận thành công. Chọn tệp sẽ hiện tên và lỗi định dạng/kích thước ngay trong biểu mẫu; API vẫn kiểm tra nội dung và scanner vẫn phải xác nhận tệp sạch.

Sau khi thử, ghi phản hồi vào [checklist nghiệm thu theo vai trò](verification/role-feedback.md), kèm phiên bản/SHA và kết quả thực tế. Không ghi “đạt” cho vai trò chưa được người thật thử.
