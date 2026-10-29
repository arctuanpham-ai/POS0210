// Cấu hình công khai của trang đặt món (khoá web của Firebase không phải bí mật; bảo vệ nằm ở Firestore Rules).
export const firebaseConfig = {
  apiKey: "AIzaSyDhnjjTS1Da99p76VrjMGSKQxgib3b23zk",
  authDomain: "pos0210-17ce4.firebaseapp.com",
  projectId: "pos0210-17ce4",
  storageBucket: "pos0210-17ce4.firebasestorage.app",
  messagingSenderId: "734292261602",
  appId: "1:734292261602:android:c60646ce0c9ed4c3f67cbb",
};

// Cửa hàng nhận đơn: users/{STORE_OWNER_UID}/stores/{STORE_ID}/online_orders
export const STORE_OWNER_UID = "X9ln8CP7UtbOLOHfipYMCjfbb1p1";
export const STORE_ID = "0210";

// Khoá reCAPTCHA v3 cho Firebase App Check. Để trống = chưa bật App Check (trang vẫn chạy).
// Lấy khoá: Firebase Console > App Check > Apps > Web app > reCAPTCHA v3 (xem hướng dẫn).
export const APP_CHECK_SITE_KEY = "";

// Thông tin hiển thị mặc định. Thông tin thật do chủ quán nhập trong web dashboard (tab "Đơn online" > Thông tin quán)
// và lưu ở online_config/shop; các giá trị dưới đây chỉ dùng khi chưa có dữ liệu đó. Để trống thì trang ẩn dòng tương ứng.
export const DEFAULT_SHOP = {
  name: "0210",
  tagline: "Bữa sáng ngon · Cuộc sống đẹp hơn",
  address: "",
  phone: "",
  hours: "",
  notice: "",
  orderingEnabled: true,
  bank: "",
  account: "",
  holder: "",
};

// Kênh ntfy báo đơn mới về điện thoại chủ quán và nhân viên (cài app ntfy, đăng ký đúng tên kênh này). Để trống = tắt.
// Tên kênh dài và ngẫu nhiên đóng vai mật khẩu: ai biết tên mới đọc / gửi được. Đổi tên là hết quyền của các máy cũ.
export const NOTIFY_TOPIC = "don0210-cd13b817a7538883";
export const NOTIFY_CLICK = "https://pos0210-17ce4.web.app/#donline";
