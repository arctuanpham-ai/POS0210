# POS0210 — Đồng bộ phiếu chi/mua hàng thống nhất

## Mục tiêu
Một phiếu chi nhiều vật tư có cùng cấu trúc và cùng mã trên Android, Firebase và Web Dashboard. Android giữ Local là nguồn vận hành đầy đủ; Firebase là lớp đồng bộ; Web chỉ xem và nhập phiếu trong 7 ngày gần nhất.

## Phạm vi an toàn
Chỉ áp dụng cho phiếu chi/mua hàng. Không đọc, ghi, xóa, thay đổi schema hoặc quy trình của bàn, order, bill, thanh toán, doanh thu bán hàng và dữ liệu khách hàng.

## Bản ghi chuẩn
Đường dẫn Firebase:
`users/{uid}/stores/0210/expenseReceipts/{receiptId}`

Các trường tối thiểu:
- `id`, `purchaseDate`, `note`, `status`
- `createdAt`, `updatedAt`, `source`, `updatedByUid`
- `items[]`: `id`, `materialName`, `materialCode`, `expenseGroup`, `qty`, `unit`, `unitPrice`, `amount`
- `total`

`receiptId` được tạo một lần tại nơi nhập và không đổi. `amount = qty × unitPrice`; `total = tổng amount`.

## Luồng Android
1. Người dùng lưu phiếu: ghi transaction vào Local trước.
2. App xếp phiếu vào hàng đợi đồng bộ `expenseReceipts`.
3. Có mạng: ghi cùng `receiptId` lên Firebase.
4. Đồng bộ kéo về đọc theo cặp `updatedAt + receiptId`, thay thế nguyên tử toàn bộ dòng của một phiếu Local.
5. Phiếu do chính App vừa đẩy được nhận diện bằng `receiptId`; không tạo bản sao.
6. Lỗi mạng không làm mất phiếu Local; hàng đợi giữ lại để thử lại.

## Luồng Web Dashboard
1. Web ghi đúng bản ghi chuẩn vào `expenseReceipts`.
2. Nếu ghi thất bại, giữ nháp cục bộ và báo rõ chưa đồng bộ.
3. Khi bấm Làm mới, Web chỉ đọc `expenseReceipts` trong 7 ngày gần nhất, không nghe realtime liên tục.
4. Web không đọc/ghi sang `purchases` hoặc `purchaseItems` để hiển thị phiếu chi.

## Xử lý xung đột
- Mỗi lần sửa tăng `updatedAt`.
- Bản có `updatedAt` mới hơn thắng cho cùng `receiptId`.
- Không xóa im lặng: trạng thái hủy dùng `status = CANCELLED` và đồng bộ như một cập nhật.
- App không đẩy snapshot Local cũ để ghi đè dữ liệu Firebase mới hơn.

## Hiển thị Android
Màn Chi phí mua hàng dùng form riêng, cùng thứ tự Web:
- Ngày mua, ghi chú
- Danh sách dòng vật tư: tên, mã vật tư, nhóm, số lượng, đơn vị, đơn giá, bỏ dòng
- Thêm vật tư, tổng phiếu, Lưu và đồng bộ
- Lưu Local xong hiển thị trạng thái: Đã lưu cục bộ / Đã đồng bộ Firebase / Chờ mạng.

## Kiểm thử bắt buộc
- Android tạo phiếu offline, có mạng sau đó: Firebase và Web nhận đúng một phiếu.
- Web tạo/sửa phiếu: Android nhập về đúng một phiếu và đúng các dòng.
- Đồng bộ lặp lại không tạo dòng trùng.
- Phiếu hủy cập nhật trạng thái, không xóa lịch sử.
- Luồng bán hàng trước/sau đồng bộ không thay đổi.
