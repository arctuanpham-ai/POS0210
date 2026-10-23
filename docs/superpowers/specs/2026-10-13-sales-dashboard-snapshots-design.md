# POS0210 — Snapshot doanh thu và món 7 ngày

## Mục tiêu

Web Dashboard xem được tình hình quán mà không đọc bill/order lịch sử từ Firebase:

- Doanh thu tạm tính của các bàn đang mở.
- Doanh thu đã chốt và số bill hôm nay.
- Kết quả doanh thu 3 hoặc 7 ngày gần nhất.
- Thống kê món của từng ngày và gộp theo khoảng đang xem.

Nguồn dữ liệu nghiệp vụ vẫn là Room Local trên POS. Firebase chỉ nhận snapshot đọc-được cho Dashboard.

## Ràng buộc bắt buộc

- Firebase Spark; không Cloud Functions, Blaze, Storage hay realtime listener trên Web.
- Web chỉ đọc khi vừa mở Dashboard hoặc bấm **Làm mới**.
- Không ghi, sửa, xóa bill, order, payment, món hoặc lịch sử bán hàng hiện có.
- Chỉ **XÁC NHẬN THANH TOÁN** mới được tính vào doanh thu đã chốt.
- Tổng tạm tính của bàn mở không phải doanh thu và phải hiển thị tách biệt.
- Android ghi snapshot tối đa một lần mỗi 10 phút, chỉ khi payload thay đổi. Mất mạng giữ Local; khi có mạng chỉ gửi trạng thái mới nhất.
- Giới hạn Dashboard: mục tiêu dưới 1.000 reads/ngày và 300 writes/ngày trên toàn dự án.

## Contract Firestore

Tại `users/{uid}/stores/0210`:

### `dashboard/current`

Một document duy nhất, ghi từ Android, bao gồm:

```text
updatedAt: epoch millis
revenueToday: long                 // chỉ bill PAID, ngày hiện tại
paidBillsToday: long
provisionalOpenTotal: long         // tổng currentTotal các bàn OCCUPIED
openTables: long
liveTables: [
  { id, name, openedAt, currentTotal, serviceStatus }
]
monthRevenue: long
operatingProfit, closingCash, initialInvestment,
recoveredCapital, paybackBasisPoints
```

`liveTables` thay thế nhu cầu Web phải đọc `tableStatus` hoặc order/session để tính tiền bàn. Danh sách chỉ chứa bàn đang mở, không chứa lịch sử.

### `dashboardDaily/{YYYY-MM-DD}`

Một document/một ngày, ghi từ Android:

```text
dateKey: YYYY-MM-DD
updatedAt: epoch millis
revenue: long                      // bill PAID trong ngày
paidBills: long
averageBill: long
items: [
  { itemId, name, qty, revenue }
]
finalized: boolean                 // true với ngày trước hôm nay
```

`items` là tổng hợp item đã thanh toán, không sao chép order/bill. Danh sách được sắp theo doanh thu giảm dần, giới hạn 50 món để document luôn nhỏ.

## Luồng ghi và đọc

1. POS tính snapshot hoàn toàn từ Local, read-only với dữ liệu bán hàng.
2. Fingerprint bỏ `updatedAt`; payload không đổi thì không ghi.
3. Mỗi đợt tối đa 10 phút:
   - Ghi `dashboard/current` nếu trạng thái bàn hoặc số liệu hiện tại đổi.
   - Ghi `dashboardDaily/today` chỉ nếu doanh thu/bill/món đã chốt đổi.
4. Qua ngày, POS upsert ngày hôm qua một lần với `finalized=true`; sau đó không ghi lại trừ khi Local thay đổi hợp lệ.
5. Khi nâng cấp, POS backfill tối đa 7 ngày gần nhất từ Local vào `dashboardDaily`, dùng `dateKey` làm ID nên retry không tạo bản trùng.
6. Web bấm Làm mới chỉ đọc 1 document `dashboard/current` và đúng 3 hoặc 7 documents `dashboardDaily`. Không đọc collections bill, payment, session, batch hay item.

## Hiển thị Web

Khối đầu Dashboard:

- Bàn đang phục vụ.
- Tổng tạm tính bàn mở.
- Doanh thu hôm nay đã chốt.
- Bill hôm nay đã thanh toán.
- Danh sách các bàn mở: giờ mở, trạng thái phục vụ, tổng tạm tính.

Khối “Kết quả 3 ngày / 7 ngày”:

- Bộ chọn 3 ngày và 7 ngày.
- Doanh thu từng ngày, tổng kỳ, số bill, bill trung bình.
- Biểu đồ cột doanh thu theo ngày.
- Bảng món: tên món, số lượng, doanh thu, tỷ trọng; chọn xem gộp hoặc theo từng ngày.

## Ngân sách và an toàn

- Một lượt Web Làm mới: 4 reads (3 ngày) hoặc 8 reads (7 ngày), cộng 1 document current đã tính trong con số.
- Android có tối đa 2 writes snapshot mỗi 10 phút nhưng thực tế chỉ ghi khi fingerprint đổi; snapshot ngày chỉ đổi khi có thanh toán.
- Backfill đầu tiên tối đa 7 writes daily và có thể retry idempotent.
- Không sửa Firestore Rules trong hạng mục này nếu chưa có duyệt riêng.
- Khi snapshot cũ quá 15 phút, Web phải cảnh báo dữ liệu POS cần được làm mới.
