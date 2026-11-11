// KPI và dự đoán doanh thu "hôm nay" trên tab Bàn. Hàm thuần: không Firebase, không DOM.
import { BOSS_POOLS } from "./kpi-boss-lines.js?v=20261111-1";
// Căn cứ: doanh thu đã chốt + tạm tính bàn đang mở ("khi thu đủ"), nhịp bill theo khung giờ và doanh thu cùng thứ tuần trước.

const OPEN_H = 7, CLOSE_H = 21; // giờ mở/đóng mặc định khi chưa có phân bố giờ của tuần trước

/** Tỷ lệ bill của cả ngày thường đã diễn ra tới thời điểm hiện tại (0..1), theo phân bố bill theo giờ (24 phần tử). */
export function hourFraction(hourly, hour, minute = 0) {
  const arr = Array.isArray(hourly) && hourly.length === 24 ? hourly.map((n) => Math.max(0, Number(n) || 0)) : null;
  const total = arr ? arr.reduce((t, n) => t + n, 0) : 0;
  const part = Math.min(1, Math.max(0, minute / 60));
  if (!total) {
    const span = CLOSE_H - OPEN_H;
    return Math.min(1, Math.max(0, (hour + part - OPEN_H) / span));
  }
  let done = 0;
  for (let h = 0; h < hour; h++) done += arr[h];
  done += arr[hour] * part;
  return Math.min(1, done / total);
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * Dự đoán doanh thu cả ngày.
 * { revenueClosed, openTotal, billsClosed, hour, minute, lastWeek: { revenue, bills, hourly } | null }
 * Trả về null khi không có mốc so sánh (không có KPI nếu không có số tuần trước).
 */
export function forecastToday({ revenueClosed = 0, openTotal = 0, billsClosed = 0, hour = 12, minute = 0, lastWeek = null }) {
  const full = Math.max(0, revenueClosed) + Math.max(0, openTotal); // tổng tạm tính khi thu đủ
  if (!lastWeek || !(lastWeek.revenue > 0)) return { full, target: 0, hasTarget: false };
  const target = Math.round(lastWeek.revenue);
  const frac = hourFraction(lastWeek.hourly, hour, minute);
  const avgBill = lastWeek.bills > 0 ? Math.round(lastWeek.revenue / lastWeek.bills) : (billsClosed > 0 ? Math.round(revenueClosed / billsClosed) : 0);
  // Nhịp hiện tại: nếu cả ngày giống nhịp này thì ra bao nhiêu. Chỉ tin dần khi đã qua một phần đáng kể của ngày.
  const pace = frac >= 0.12 ? full / frac : target;
  const w = clamp((frac - 0.1) / 0.6, 0, 1);
  let forecast = Math.round(w * pace + (1 - w) * target);
  if (frac >= 0.995) forecast = full; // hết giờ bán: chỉ còn số thực
  forecast = Math.max(forecast, Math.round(full));
  const ratio = forecast / target;
  const status = full >= target ? "reached" : ratio >= 1.1 ? "ahead" : ratio >= 1 ? "on" : ratio >= 0.9 ? "close" : "behind";
  const gap = Math.max(0, target - full);
  const billsNeeded = avgBill > 0 ? Math.ceil(gap / avgBill) : 0;
  const expectedNow = target * frac; // theo nhịp tuần trước thì lúc này đáng ra đã có bao nhiêu
  return { full, target, hasTarget: true, frac, forecast, ratio, status, gap, billsNeeded, avgBill, pct: clamp(full / target, 0, 9.99), expectedNow, vsPace: expectedNow > 0 ? full / expectedNow : null, lastWeekBills: lastWeek.bills || 0, billsClosed };
}

const POOLS = {
  early: [
    "Mới vào ca, cả quán khởi động nhẹ nhàng, những bill đầu tiên sẽ mở đường cho cả ngày.",
    "Ly cà phê đầu tiên của khách là khởi đầu của KPI hôm nay, chào đón thật tươi nhé.",
    "Bếp ấm, máy sẵn, ly sạch. Chỉ còn chờ khách bước vào thôi.",
    "Đầu ngày chưa cần chạy nhanh, cần chắc từng bill một.",
    "Một nụ cười đầu ca đáng giá hơn mọi chương trình khuyến mãi.",
    "Số liệu còn sớm để kết luận, cứ làm thật tốt những đơn đầu tiên.",
  ],
  ahead: [
    "Đang chạy trước nhịp tuần trước rõ rệt, giữ nhịp này là cán đích sớm.",
    "Hôm nay quán bứt tốc hơn hẳn tuần trước. Cảm ơn cả đội đã chạy rất đều.",
    "Số liệu đang đẹp, đừng để chất lượng món chùng xuống khi khách đông.",
    "Phong độ tốt thế này, thử gợi ý thêm món kèm cho mỗi bàn xem sao.",
    "Nhịp đang vượt kỳ vọng. Giờ là lúc giữ tốc độ ra món và nụ cười.",
    "Tốt hơn tuần trước rồi, hít một hơi và tiếp tục nào.",
  ],
  on: [
    "Đúng nhịp tuần trước, thêm vài bill nữa là vượt KPI.",
    "Đang bám sát mục tiêu, mỗi bàn thêm một ly nước là thấy khác ngay.",
    "Nhịp ổn định, giữ vững là đạt. Hỏi khách có dùng thêm tráng miệng không nhé.",
    "KPI nằm trong tầm tay, chỉ cần không để bàn nào chờ lâu.",
    "Mọi thứ chạy đúng kế hoạch, cứ đều tay là về đích.",
  ],
  close: [
    "Chỉ hụt một chút so với nhịp tuần trước, vài bàn đông nữa là kịp.",
    "Còn hơi chậm nhưng chưa đáng ngại, thử mời khách món combo hôm nay.",
    "Khoảng cách không lớn, một đợt khách trưa sẽ kéo lại ngay.",
    "Cả quán nhích thêm một chút nữa là chạm KPI, cố lên.",
    "Gợi ý món kèm và nước uống là cách nhanh nhất để rút ngắn khoảng cách.",
  ],
  behind: [
    "Hôm nay khách đến chậm hơn tuần trước, ưu tiên giữ chất lượng để khách quay lại.",
    "Chậm nhịp thì tranh thủ dọn dẹp, chuẩn bị nguyên liệu, đợt khách sau sẽ ra món nhanh hơn.",
    "Chưa đạt kỳ vọng thì cũng chưa hết giờ, mỗi bill vẫn có giá trị.",
    "Thử đăng món đặc biệt hoặc bật khuyến mãi online để kéo thêm đơn.",
    "Bình tĩnh, ngày bán hàng còn dài. Làm tốt từng bàn, số sẽ tự lên.",
    "Khoảng cách còn lớn, nên tập trung vào tăng giá trị mỗi bill hơn là chờ thêm khách.",
  ],
  reached: [
    "Đã chạm KPI của hôm nay! Từ giờ mỗi bill là phần thưởng thêm.",
    "Mục tiêu hoàn thành, cả quán xứng đáng một nụ cười thật tươi.",
    "KPI xong rồi, giờ thử đặt mục tiêu cao hơn cho ngày mai nhé.",
    "Vượt chỉ tiêu tuần trước, cảm ơn mọi người đã chạy hết mình.",
    "Đủ KPI rồi, phần còn lại là lợi nhuận và niềm vui, giữ chất lượng đến cuối ca.",
  ],
  lateReached: [
    "Chốt ngày với KPI đạt, một ngày làm việc đáng tự hào.",
    "Hôm nay về đích đẹp, nghỉ ngơi thật tốt để mai làm tiếp.",
    "Kết ca thành công, cảm ơn cả đội một ngày chắc tay.",
  ],
  lateMissed: [
    "Hôm nay chưa tới KPI, không sao, rút kinh nghiệm để mai bứt phá.",
    "Ngày chưa trọn vẹn nhưng đã cố hết sức, mai sẽ là một ngày khác.",
    "Số hôm nay thấp hơn tuần trước, xem lại khung giờ vắng để thử ý tưởng mới.",
  ],
};

/** Câu động viên theo KPI: đổi theo từng 15 phút (cùng một lúc thì cùng câu), không lặp câu của lần trước. */
export function cheerLine(f, { day = "", hour = 12, minute = 0, previous = "", boss = false } = {}) {
  if (!f || !f.hasTarget) return "";
  const late = f.frac >= 0.97 || hour >= 21;
  const early = f.frac < 0.08 && f.status !== "reached";
  const key = late ? (f.status === "reached" ? "lateReached" : "lateMissed") : early ? "early" : f.status;
  let h = 0;
  const seed = `${day}|${hour}|${Math.floor(minute / 15)}|${key}${boss ? "|b" : ""}`;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  let pool = (boss ? BOSS_POOLS : POOLS)[key];
  // Chế độ sếp: cứ khoảng 1/3 lượt đổi câu (khi chưa đạt KPI) chen một mẹo bán hàng.
  if (boss && !["reached", "lateReached", "lateMissed"].includes(key) && h % 3 === 0) pool = BOSS_POOLS.tips;
  let i = (h >>> 3) % pool.length;
  if (pool[i] === previous) i = (i + 1) % pool.length;
  return pool[i];
}
