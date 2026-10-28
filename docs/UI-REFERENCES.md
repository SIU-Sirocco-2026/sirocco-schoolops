# Nguồn thiết kế giao diện SchoolOps

Rà nguồn ngày 28/10/2026. G01 dùng bố cục ứng dụng vận hành: danh sách hồ sơ, chi tiết và tổng quan có nhiệm vụ riêng. Giữ nguyên API, quyền, phiên bản hồ sơ và URL liên kết hiện có.

Khung `workspace-modern` được dùng cho toàn bộ trang ứng dụng: G01, Foundation, G02, G03, quản lý gói và trang trước đăng nhập. Tệp `g01-workspace.css` giữ tên từ đợt thiết kế đầu nhưng chứa style dùng chung; tên class theo không gian chỉ dùng cho ngoại lệ nghiệp vụ. Theme Keycloak trong `infra/keycloak/themes/schoolops/login` dùng cùng logo, màu, typography và control cho đăng nhập, xác nhận đăng xuất và các trang lỗi/phiên hết hạn kế thừa từ `keycloak.v2`.

| Nguồn                                                                                                      | Cách sử dụng                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Tabler](https://github.com/tabler/tabler), [demo](https://preview.tabler.io/), MIT                        | Chọn làm nền giao diện. Cài Core 1.7.1 và Icons React 3.49.0, đóng gói CSS và icon qua Vite. Tham khảo cấu trúc sidebar, toolbar, hàng dữ liệu, trạng thái và phân cấp chữ. Không sao chép cả ứng dụng demo hoặc nạp plugin bên ngoài. |
| [shadcn/ui dashboard](https://ui.shadcn.com/examples/dashboard), [source](https://github.com/shadcn-ui/ui) | Đối chiếu cách tách điều hướng, số tổng và danh sách. Không nhập mã hoặc thêm dependency từ mẫu này.                                                                                                                                   |
| [Atlassian: designing messages](https://atlassian.design/foundations/content/designing-messages)           | Đối chiếu cách viết trạng thái trống và hướng dẫn thao tác. Không nhập mã nguồn.                                                                                                                                                       |

Chọn Tabler vì có bố cục vận hành và giấy phép MIT, dùng được với React/Vite hiện tại mà không cần chuyển toàn bộ ứng dụng sang Next.js hoặc Tailwind. Các thành phần nghiệp vụ G01 vẫn là mã của SchoolOps.

## Tổ chức trải nghiệm

- Hồ sơ là màn hình mặc định; kỹ thuật viên và người nghiệm thu tiếp tục được lọc công việc của mình.
- Tổng quan hiển thị số thật trong quyền tài khoản, phân bổ đang mở/hoàn thành và liên kết đến nhóm quá hạn. Quá hạn thuộc đang mở. Không có xu hướng hoặc tỷ lệ tăng trưởng giả lập.
- Mở hồ sơ sẽ dành màn hình cho hồ sơ đó; Về danh sách và Back vẫn giữ hành vi liên kết.
- Tiến trình sáu bước và thông báo người chịu trách nhiệm giải thích trạng thái. Nhánh trả bổ sung/trả xử lý ở khu vực mở rộng, sau thao tác chính.
- G02 dùng bốn mốc Ghi nhận → Xác minh → Ứng phó → Hoàn tất, theo đúng luồng môi trường; G01/G03 giữ sáu mốc.
- Biểu mẫu tạo hồ sơ có không gian riêng. Đóng biểu mẫu chỉ ẩn bản nháp trong phiên; chuyển không gian và tải lại vẫn có kiểm tra dữ liệu chưa lưu. Không lưu nội dung vào browser storage.
- Trên điện thoại, các cột danh sách chuyển thành hàng thông tin xếp dọc. Các mốc tiến trình xuống hai hàng để không cuộn ngang.

## Tài nguyên thương hiệu

`apps/web/public/brand/schoolops-mark.png` là biểu trưng mới tạo bằng công cụ imagegen tích hợp, nền trong suốt, giữ chữ SchoolOps dưới dạng văn bản HTML. Không phải logo của Tabler hoặc của một trường thật. Không dùng hình minh họa trang trí trong danh sách công việc.

Bản sao tại `infra/keycloak/themes/schoolops/login/resources/img/schoolops-mark.png` dùng cho theme xác thực, không nạp ảnh từ bên thứ ba.

Prompt tạo ảnh: “Use case: logo-brand. Create one original compact brand mark for SchoolOps, a practical school facilities workflow application. Asset type: transparent PNG logo symbol used beside the existing text SchoolOps in a professional enterprise sidebar. A distinctive interlocking pair of simple architectural doorway shapes suggesting a school entrance and a completed handover, cobalt blue #206bc4 with a restrained darker blue secondary shape. Flat vector-like solid shapes, precise balanced geometry, thick clear forms readable at 32 pixels. Centered square composition, symbol fills 82 percent of the canvas, genuinely transparent background. No text, no letters, no gradients, no shadows, no mockup, no circles of decorative elements, no watermark. One symbol only.”

Giấy phép thành phần ngoài được ghi tại THIRD_PARTY_NOTICES.md và third-party/license-sources.json. Các kiểm tra kỹ thuật không thay thế đánh giá khả năng sử dụng từ người thật.

## Trang chủ và khả năng khám phá

`Home.tsx` là trang trước đăng nhập, dùng `home.css` trong khung `workspace-modern`. Thanh đầu trang chỉ giữ thương hiệu và liên kết giới thiệu; sidebar nghiệp vụ chỉ được render sau đăng nhập. CTA đăng nhập giữ liên kết sâu ban đầu. Khách khám phá ba không gian bằng tab có hỗ trợ Left/Right/Home/End theo [WAI-ARIA tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Sơ đồ bốn bước là minh họa phối hợp, không phải dữ liệu hồ sơ hoặc bản sao chính xác của mọi workflow.

Tham khảo cách phân cấp thông tin, giảm cạnh tranh thị giác của [Linear](https://linear.app/now/behind-the-latest-design-refresh), hệ thành phần [Tabler](https://tabler.io/admin-template), và nhịp chuyển động Carbon bên dưới. Không sao chép thiết kế hoặc mã từ Linear. Icon từ Tabler đã có trong ứng dụng; hiệu ứng chỉ phản hồi thao tác hoặc trạng thái tải, không tự chạy tour. Trang công khai không gọi API hồ sơ.

Rà tính năng phát hiện lối mở cùng một cảnh báo/thông báo sau khi quay về danh sách ở G02/G03 phụ thuộc state cũ. Đã chuyển sang định tuyến URL chung để có thể mở lại cùng hồ sơ, giữ kiểm tra bản nháp khi điều hướng. Với truy nguồn G02, chỉ đổi nội dung lineage sau khi điều hướng được chấp nhận.

## Chi tiết chuyển động

`apps/web/src/motion.css` dùng chung cho mọi view, gồm Foundation, G01/G02/G03, quản lý gói và trang chào. Theme Keycloak có cùng nhịp chuyển động tại `infra/keycloak/themes/schoolops/login/resources/css/schoolops.css`.

| Nguồn đã đối chiếu                                                                                                                                                                                  | Áp dụng trong SchoolOps                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Carbon motion](https://www.carbondesignsystem.com/building-blocks/foundations/motion/overview), [kho motion](https://github.com/carbon-design-system/carbon/tree/main/packages/motion)             | Phản hồi ngắn, easing giảm tốc, dùng chuyển động để giải thích thay đổi.                                                                                |
| [Radix animation](https://www.radix-ui.com/primitives/docs/guides/animation), [Collapsible source](https://github.com/radix-ui/primitives/blob/main/packages/react/collapsible/src/collapsible.tsx) | Phân biệt trạng thái mở/đóng, giữ hành vi bàn phím và nội dung khi người dùng thao tác. SchoolOps giữ phần tử HTML details, không nhập component Radix. |
| [Motion accessibility](https://motion.dev/docs/react-accessibility), [kho mã nguồn](https://github.com/motiondivision/motion)                                                                       | Tôn trọng và phản ứng khi prefers-reduced-motion thay đổi trong phiên. Không cài runtime Motion.                                                        |

Không sao chép mã từ các kho tham khảo và không thêm dependency. Các hiệu ứng dùng CSS và Web Animations API: nút 120 ms, chuyển trạng thái 180 ms, hiện nội dung 240 ms, vẽ cung biểu đồ 480 ms. Số liệu biểu đồ luôn lấy từ API, không đếm số giả. Danh sách chỉ giãn nhịp tối đa 80 ms cho các hàng đầu; dữ liệu polling giữ nguyên key nên không phát lại animation.

`useMotionArrival` chỉ đổi opacity khi view đổi, không remount biểu mẫu, không chặn click và không chờ animation trước khi điều hướng. Animation bị hủy khi component đổi view, unmount, tab đổi trạng thái hiển thị hoặc tùy chọn giảm chuyển động thay đổi. CSS details dùng nội suy kích thước khi trình duyệt hỗ trợ; trình duyệt cũ vẫn đóng/mở bằng HTML gốc. Spinner chỉ xuất hiện cùng trạng thái đang chờ; không có chuyển động trang trí chạy liên tục. Không dùng scroll hijacking, hiệu ứng parallax hoặc tài nguyên từ CDN.
