// Đếm lượt truy cập trang đặt món theo từng cấp (phễu). Hàm thuần: không Firebase, không DOM.
// Mỗi ngày (giờ Việt Nam) một tài liệu online_stats/<yyyymmdd> chứa các bộ đếm; mỗi bước ghi tăng đúng 1.

/** Các cấp của phễu, theo thứ tự khách đi qua. */
export const STAT_EVENTS = Object.freeze(["visit", "device", "menu", "add", "cart", "submit"]);
export const STAT_LABELS = Object.freeze({
  visit: "Lượt vào trang", device: "Thiết bị khác nhau", menu: "Xem được menu", add: "Thêm món vào giỏ", cart: "Mở giỏ hàng", submit: "Bấm gửi đơn",
});
export const HOUR_KEYS = Object.freeze(Array.from({ length: 24 }, (_, h) => `vh${String(h).padStart(2, "0")}`));
export const STAT_KEYS = Object.freeze([...STAT_EVENTS, ...HOUR_KEYS]);
export const STATS_COLLECTION = "online_stats";

const VN_OFFSET_MS = 7 * 3_600_000;
export const vnDayKey = (ms) => new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, "");
export const vnHour = (ms) => new Date(ms + VN_OFFSET_MS).getUTCHours();
export const hourKey = (ms) => `vh${String(vnHour(ms)).padStart(2, "0")}`;

/** Các bộ đếm cần tăng 1 cho một sự kiện. Lượt vào còn tính vào khung giờ. */
export const keysFor = (event, ms) => {
  if (!STAT_EVENTS.includes(event)) return [];
  return event === "visit" ? ["visit", hourKey(ms)] : [event];
};

/**
 * Quyết định có đếm sự kiện này không. `session` là bản ghi theo phiên (sessionStorage), `device` là bản ghi theo thiết bị (localStorage).
 * - Mỗi cấp chỉ đếm 1 lần cho mỗi phiên (tải lại trang không tính thêm lượt).
 * - "device" chỉ đếm 1 lần mỗi ngày cho mỗi thiết bị.
 * Trả về { count, session, device } với bản ghi đã cập nhật (không sửa bản vào).
 */
export const decide = (event, ms, session = {}, device = {}) => {
  const day = vnDayKey(ms);
  const s = session.day === day ? { day, seen: { ...(session.seen || {}) } } : { day, seen: {} };
  const d = { ...device };
  if (!STAT_EVENTS.includes(event)) return { count: false, session: s, device: d };
  if (event === "device") {
    if (d.lastDay === day) return { count: false, session: s, device: d };
    d.lastDay = day;
    return { count: true, session: s, device: d };
  }
  if (s.seen[event]) return { count: false, session: s, device: d };
  s.seen[event] = 1;
  return { count: true, session: s, device: d };
};
