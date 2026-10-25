# Giới thiệu SchoolOps

SchoolOps minh họa việc chuyển một phản ánh thành công việc có người phụ trách, hạn, bằng chứng và người nghiệm thu trong trường học. Người báo theo dõi cùng một mã hồ sơ qua các bước, kể cả khi bị trả bổ sung hoặc trả xử lý. Hiện chưa có trường đối tác xác nhận triển khai, số người dùng thực tế hoặc số liệu tiết kiệm thời gian.

## Ba tình huống

| Gói                | Người dùng dự kiến                                   | Luồng hiện có                                                                                        |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| G01 cơ sở vật chất | Giáo viên/người báo, điều phối, kỹ thuật, nghiệm thu | Báo máy chiếu A101 hỏng, xác minh, giao việc, xử lý, quét tệp, nghiệm thu và đóng                    |
| G02 môi trường     | Người vận hành nguồn và cán bộ môi trường            | Phát lại số đo PM2.5 có nhãn, kiểm tra quality/rule/lineage, xử lý hoặc bác cảnh báo có lý do        |
| G03 an toàn        | Người báo và cán bộ được cấp quyền trên hồ sơ        | Báo vật cản giả lập, giao người xử lý/nghiệm thu; hạn chế nội dung và tệp theo quan hệ với từng case |

Đối tượng trên là nhóm dự kiến để mời thử, chưa phải bằng chứng nhu cầu được khảo sát. Phạm vi RC là một trường với dữ liệu giả lập; chưa đo tải tối đa hay cam kết phục vụ một số lượng người dùng nhất định.

## Đối chiếu cách làm và công cụ sẵn có

Đây là cách định vị phạm vi, chưa phải benchmark hay kết luận SchoolOps tốt hơn các sản phẩm dưới đây. Đội chưa triển khai chúng trong cùng một phép đo.

| Cách làm / công cụ                               | Điều cần đối chiếu với SchoolOps                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Forms hoặc nhóm Zalo đang dùng tại trường | Hỏi trường hiện tiếp nhận, giao việc, lưu tệp, nhắc hạn và xác nhận hoàn tất thế nào. Đo phần nào phải đối chiếu thủ công trước khi tuyên bố một hạn chế của cách làm hiện tại.                                                                         |
| GLPI                                             | GLPI có vòng đời và quản lý ticket trong [tài liệu chính thức](https://help.glpi-project.org/documentation/modules/assistance/tickets). So cùng tình huống G01; SchoolOps chưa chứng minh lợi thế so với GLPI về độ trưởng thành hoặc chi phí vận hành. |
| Zammad                                           | [Tài liệu Zammad](https://docs.zammad.org/en/latest/) có API, role, audit log và thông báo. Cần cấu hình và thử cùng kịch bản trước khi kết luận phần nào có thể dùng lại thay cho phát triển mới.                                                      |
| Redmine                                          | [Redmine](https://www.redmine.org/projects/redmine/wiki/Features) có issue, role, workflow theo loại issue và trường tùy chỉnh. Đối chiếu cách biểu diễn phiên bản gói và yêu cầu hồ sơ của SchoolOps; không coi role/workflow là tính năng độc quyền.  |

Phần đội đang kiểm chứng là cách tích hợp gói nghiệp vụ có phiên bản, giữ schema/rule/policy của case cũ khi kích hoạt v2, kết hợp bằng chứng đã quét, outbox/đối soát và quyền case/file trong ba tình huống. Repo có mã và kiểm thử cho những hành vi này. Giá trị sử dụng so với công cụ sẵn có cần một đợt thử với người dùng mục tiêu.

## Phần đội đóng góp và khả năng dùng lại

Đội viết API/UI nghiệp vụ, migration, worker/đối soát, adapter, validator/registry gói, các gói G01/G02/G03 và công cụ kiểm chứng/khôi phục. Hệ thống tích hợp các dự án nguồn mở bên ngoài qua API; xem [nguồn gốc](PROVENANCE.md), [thành phần bên ngoài](../THIRD_PARTY_NOTICES.md) và [kiến trúc](ARCHITECTURE.md).

Người đóng góp có thể bắt đầu từ hướng dẫn [CONTRIBUTING](../CONTRIBUTING.md), sửa tài liệu theo một lần cài sạch hoặc tạo gói thử theo [PHASE-4](PHASE-4.md). Validator chỉ hỗ trợ tập BPMN đã công bố; một gói mới vẫn phải qua validate, thử quyền và thử phiên bản. Việc thêm trường/ngành nghiệp vụ khác không tự có bằng cách đổi nhãn giao diện.

Xem [bằng chứng và phần chưa kiểm chứng](verification/EVIDENCE.md), [demo](DEMO-MEDIA.md) và [kế hoạch người dùng](verification/USER-STUDY.md) trước khi dùng tài liệu này trong hồ sơ dự thi.
