# APK dùng chung cho thu ngân và máy order — thiết kế cần duyệt

Mục tiêu: nhân viên gửi món từ máy order; máy thu ngân nhận cùng bàn, cùng lượt gọi và in bếp. Order/thanh toán hoạt động khi mất Internet hoặc Firebase hết quota. Cloud chỉ nhận bản sao nền phục vụ web dashboard và lưu trữ.

Hiện trạng đã kiểm tra: source hiện có Room và hàng đợi in trên từng máy, upload Cloud, pull menu/tài chính và dashboard chỉ đọc. Chưa có máy thu ngân nhận và hợp nhất order từ thiết bị khác. Cài APK giống nhau chưa tạo được luồng nhiều máy này.

## Phương án đề xuất

Một APK với hai chế độ: THU NGÂN và MÁY ORDER. Các máy cùng Wi-Fi nội bộ, không cần Internet. Thu ngân là nơi giữ dữ liệu giao dịch chính, đánh số lượt/bill và quản lý in bếp. Máy order ghép với thu ngân bằng QR mã ghép, lưu menu/bàn trong bộ nhớ đệm và lưu phiếu chờ trên máy.

Luồng gửi: máy order lưu phiếu và mã yêu cầu duy nhất trước khi gửi. Thu ngân xác thực thiết bị/nhân viên, kiểm tra bàn và menu hiện hành, ghi phiên/batch/items cùng biên nhận yêu cầu và hàng đợi in trong một giao dịch Room. Chỉ sau ghi thành công mới trả xác nhận. Gửi lại cùng mã yêu cầu trả cùng biên nhận, không tạo phiếu hoặc lệnh in mới. Mất Wi-Fi hiển thị CHỜ GỬI, giữ phiếu chờ qua tắt/mở ứng dụng và thử lại khi có kết nối. Không hiện ĐÃ GỬI BẾP chỉ vì máy order lưu local.

Ghép nối dùng khóa ngẫu nhiên riêng thiết bị, kết nối mã hóa và ghim chứng thư máy thu ngân; không công khai PIN nhân viên, toàn bộ DB hoặc dữ liệu tài chính cho máy order. Chỉ thiết bị được ghép mới gọi API. Máy thu ngân chạy dịch vụ foreground trong ca bán hàng, hiển thị trạng thái mạng/địa chỉ ghép và có nút thu hồi thiết bị.

Thu ngân áp dụng giá/combo/khuyến mại từ dữ liệu chính; nếu menu đã đổi thì báo giá cần xác nhận, không âm thầm dùng giá cũ. Bàn đã đóng/thanh toán phải xác nhận mở phiên mới trước khi nhận món cũ. Máy order chỉ gửi món và xem trạng thái bàn/phiếu; thanh toán và sửa bill thực hiện tại thu ngân.

In bếp qua hàng đợi hiện có trên thu ngân. Biên nhận phân biệt ĐÃ NHẬN ORDER và ĐÃ IN BẾP. Khi Bluetooth lỗi vẫn giữ lệnh in; không tự in lại lệnh có trạng thái kết quả chưa rõ. Phiếu thu ngân dùng đúng dữ liệu order nhận được.

Cloud publisher đặt tại thu ngân: mirror thay đổi và dashboard theo ngân sách đã triển khai, backup riêng. Không dùng Cloud để nhận/gửi order, mở bàn, tính tiền hoặc xác nhận thanh toán. Máy order không ghi bản sao bàn/menu cũ đè lên Cloud.

## Điều kiện nghiệm thu trước khi gọi là sẵn sàng khai trương

- Hai máy/emulator: ghép, tải menu/bàn, gửi món và thấy đúng trên thu ngân/bếp.
- Hai máy gọi cùng bàn đồng thời không trùng phiên hoặc số lượt.
- Gửi lặp cùng mã sau mất xác nhận và sau khởi động lại không nhân đôi món/in.
- Tắt Internet và mô phỏng HTTP 429: order, tính tiền và hàng đợi in vẫn hoạt động qua LAN.
- Mất Wi-Fi, tắt/mở máy order: giữ phiếu chờ và hiện đúng trạng thái chưa gửi.
- Thiết bị chưa ghép/đã thu hồi và nhân viên thiếu quyền bị từ chối.
- Menu đổi, bàn vừa thanh toán và lỗi in Bluetooth được báo rõ, không ghi nhận thành công giả.
- APK cùng applicationId/chữ ký với bản người dùng gửi, versionCode cao hơn; không yêu cầu gỡ app hoặc xóa dữ liệu.

Giới hạn: cần máy thu ngân mở ca và cùng mạng Wi-Fi cho việc chuyển order. Kiểm tra trên thiết bị thật/máy in của quán là bước nghiệm thu vận hành, chưa thể suy ra từ kết quả build.
