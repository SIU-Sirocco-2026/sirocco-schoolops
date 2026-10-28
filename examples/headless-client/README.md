# Client HTTP ngoài giao diện

Ví dụ này dùng Node 22 với `fetch`, không import mã SchoolOps hoặc thư viện React/Flowable. Chép riêng `client.mjs` sang thư mục bất kỳ rồi chạy; không cần `pnpm install`, Git hoặc `node_modules` ở đó.

Phép kiểm một file nói về phụ thuộc lúc chạy. Khi phân phối lại mã, giữ [LICENSE](../../LICENSE), [NOTICE](../../NOTICE) và thông báo nguồn theo giấy phép của repo.

Client gọi hợp đồng [Identity và foundation trong OpenAPI](../../docs/openapi.yaml) qua gateway. Token do Identity cấp; API vẫn kiểm membership/quan hệ hiện tại. Client không đọc database, gọi engine trực tiếp hoặc dùng credential quản trị. Foundation là adapter probe trong backend SchoolOps; ví dụ này chưa chứng minh một lõi đa ngành hay hỗ trợ BPMN tùy ý.

## Cách dùng

Đặt `SIROCCO_API_URL` bằng URL gateway kết thúc `/api`, ví dụ `http://localhost:8098/api` nếu bản cài dùng cổng 8098. HTTP chỉ dùng loopback, máy chủ khác cần HTTPS. `SIROCCO_ACCESS_TOKEN` là access token đã được Identity cấp cho người dùng có quyền; không đặt token trong command line, URL, Git, ảnh hoặc hướng dẫn chia sẻ. Client không tự đăng nhập, refresh hay lưu token. Hết phiên thì lấy lại token qua luồng Identity được cấu hình cho client của tổ chức.

Trên PowerShell có thể đọc token từ terminal bằng secure prompt, không ghi literal vào lịch sử:

```powershell
$env:SIROCCO_API_URL = 'http://localhost:8098/api'
$env:SIROCCO_ACCESS_TOKEN = Read-Host 'Access token đã được Identity cấp' -MaskInput
node client.mjs identity
node client.mjs list
```

`-MaskInput` cần PowerShell 7. Trong Windows PowerShell 5.1, truyền token bằng cách quản lý biến môi trường phù hợp của đội thay vì nhập literal vào lịch sử. Biến môi trường không phải kho bí mật: chỉ dùng trong phiên local được kiểm soát, xóa sau khi thử và không xuất toàn environment/log tiến trình.

Reporter/coordinator tạo nhiệm vụ foundation giả lập bằng **khóa explicit**. Giữ key và title để kiểm tra lại cùng yêu cầu, không tạo key mới khi chưa biết POST đầu đã thành công hay chưa:

```powershell
$trialKey = [guid]::NewGuid().ToString()
node client.mjs create $trialKey 'Nhiệm vụ giả lập từ client ngoài UI'
node client.mjs create $trialKey 'Nhiệm vụ giả lập từ client ngoài UI'
```

Lệnh trả JSON có `status` HTTP và `data.item` gồm ID, process/definition và trạng thái. Lần đầu có thể 201 hoặc 202; **202 chưa phải workflow sẵn sàng**, cần đọc lại danh sách/đối soát theo hợp đồng trước khi hoàn tất. Cùng key nhưng title khác bị 409. Không tự retry POST khi timeout, gateway lỗi hoặc JSON bị ngắt; kết quả lỗi có `needsCheck` để chỉ việc cần đọc lại trước khi chủ động gửi tiếp.

Đổi sang token của technician được giao, rồi dùng `id` UUID ứng dụng đã trả, không dùng process ID:

```powershell
$env:SIROCCO_ACCESS_TOKEN = Read-Host 'Access token của technician được giao' -MaskInput
$trialId = Read-Host 'UUID id của nhiệm vụ vừa tạo'
node client.mjs complete $trialId
node client.mjs list
Remove-Item Env:SIROCCO_ACCESS_TOKEN
```

Reporter không được hoàn tất; technical admin không mặc định tạo/hoàn tất hoặc nhìn thấy nhiệm vụ người khác. Lỗi 401/403/404 là quyết định server, không vượt bằng cách sửa client. Client không chuyển tiếp token theo redirect.

## Kiểm tự động và phạm vi dùng lại

Trong repo nguồn và môi trường demo riêng đã khởi động:

```powershell
pnpm demo:verify:headless
```

Bộ này lấy token qua client smoke **chỉ dùng cho kiểm demo local**, chép đúng một file client ra thư mục tạm có khoảng trắng, chạy CLI bằng các token thật, kiểm tạo/replay/xung đột/sai quyền/hoàn tất qua gateway và giữ report theo SHA. Không dùng password grant của smoke client làm thiết kế đăng nhập sản phẩm. Không chạy đồng thời với các phép thu hồi membership/fault/restore trên cùng stack.

| Phần | Dùng lại thế nào | Phần cần thay nếu làm nghiệp vụ khác |
| --- | --- | --- |
| HTTP, token, timeout, xử lý lỗi và key explicit | Không cần UI hoặc SDK nội bộ | URL gateway, cấu hình client/Identity và cách cấp/refresh token |
| Danh sách/tạo/hoàn tất foundation | Gọi đúng API đã công bố | Endpoint, schema, role/quan hệ và luật nghiệp vụ khác |
| Workflow engine và lưu trạng thái | Client chỉ dùng process/definition refs API trả | Adapter backend, BPMN, assignee và mô hình dữ liệu vẫn do SchoolOps cấu hình |
| Scanner/bằng chứng/gói phiên bản | Chưa được client ví dụ này gọi | Muốn dùng G01/G02/G03 phải theo API riêng, gồm revision và `X-Task-Id` khi upload |

Không sửa backend để ví dụ chạy được. Việc client độc lập gọi được API là bằng chứng về ranh giới HTTP đã kiểm, không thay bằng chứng một ứng dụng lĩnh vực khác, đa tenant, plug-in tự do, HA hoặc trải nghiệm người dùng thật.
