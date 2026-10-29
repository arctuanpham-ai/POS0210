// Báo đơn online về điện thoại qua ntfy (bản miễn phí, ntfy.sh). Trang đặt món tự gửi khi có đơn; file này chỉ để hiển thị kênh và gửi thử.
// Phải trùng NOTIFY_TOPIC trong web-order/public/config.js. Tên kênh dài, ngẫu nhiên, đóng vai mật khẩu.
export const NTFY_TOPIC = "don0210-cd13b817a7538883";
export const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;
export const NTFY_CLICK = "https://pos0210-17ce4.web.app/#donline";

/** Nội dung thông báo thử, cùng dạng với thông báo đơn thật (priority 5 = khẩn). */
export const testPayload = (now = new Date()) => ({
  topic: NTFY_TOPIC,
  title: "Thử báo đơn online",
  message: `Máy ${now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} gửi thử. Nhận được cái này là điện thoại đã sẵn sàng.`,
  priority: 5,
  tags: ["bell"],
  click: NTFY_CLICK,
});

export async function sendTest() {
  const r = await fetch("https://ntfy.sh/", { method: "POST", body: JSON.stringify(testPayload()) });
  if (!r.ok) throw new Error(`ntfy trả lỗi ${r.status}`);
  return true;
}
