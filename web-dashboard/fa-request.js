// Yêu cầu cập nhật doanh thu app food từ web: web chỉ ghi/đọc một tài liệu foodAppRequests/current.
// Việc lấy số liệu do tác vụ định kỳ của Claude làm (qua Chrome máy tính đã đăng nhập Grab, Shopee) vào các giờ cố định.
// Hàm thuần: không Firebase, không DOM.

export const REQUEST_COLLECTION = "foodAppRequests";
export const REQUEST_ID = "current";
export const CHECK_HOURS = Object.freeze([7, 14, 18]); // giờ Việt Nam
export const MAX_ATTEMPTS = 3;
export const OVERDUE_MS = 45 * 60_000; // quá giờ kiểm tra bao lâu mà chưa được nhận thì cảnh báo
export const STUCK_MS = 40 * 60_000; // trạng thái "đang chạy" quá lâu

const VN = 7 * 3_600_000, DAY = 86_400_000;
const two = (n) => String(n).padStart(2, "0");
export const hm = (ms) => { const d = new Date(Number(ms) + VN); return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())} ${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}`; };

/** Thời điểm kiểm tra gần nhất từ lúc `ms` trở đi (giờ cố định mỗi ngày, giờ VN). */
export const nextCheckAt = (ms) => {
  const dayStart = Math.floor((ms + VN) / DAY) * DAY - VN;
  for (const h of CHECK_HOURS) { const t = dayStart + h * 3_600_000; if (t >= ms) return t; }
  return dayStart + DAY + CHECK_HOURS[0] * 3_600_000;
};

const APP_NAME = { GRAB: "GrabFood", SHOPEE: "ShopeeFood", XANHNGON: "Xanh Ngon" };

/** Mô tả trạng thái yêu cầu để hiển thị. `req` có thể null. */
export function requestView(req, now = Date.now()) {
  const schedule = `Tự kiểm tra lúc ${CHECK_HOURS.map((h) => `${h}h`).join(", ")} hằng ngày (và 11h thứ Hai).`;
  if (!req || !req.status) return { kind: "none", busy: false, tone: "muted", title: "Chưa có yêu cầu nào.", detail: "", schedule };
  const at = Number(req.requestedAt || 0), done = Number(req.finishedAt || 0);
  const apps = Object.entries(req.details || {}).map(([k, v]) => `${APP_NAME[k] || k}: ${v?.note || (v?.ok ? "xong" : "lỗi")}`).join(" · ");
  const reason = req.reason ? ` Lý do: ${req.reason}` : "";
  switch (req.status) {
    case "pending": {
      const slot = nextCheckAt(at), overdue = now > slot + OVERDUE_MS;
      return overdue
        ? { kind: "pending", busy: true, overdue: true, tone: "warn", title: `⚠ Yêu cầu gửi lúc ${hm(at)} chưa được xử lý dù đã qua giờ kiểm tra ${hm(slot)}.`, detail: "Có thể Chrome trên máy tính chưa mở hoặc chưa kết nối. Nhắn Claude \"cập nhật app food\" để làm ngay, hoặc nhập file Grab bên dưới.", schedule }
        : { kind: "pending", busy: true, overdue: false, tone: "info", title: `Đã gửi yêu cầu lúc ${hm(at)}. Đang chờ lượt kiểm tra ${hm(slot)}.`, detail: Number(req.attempts) ? `Đã thử ${req.attempts}/${MAX_ATTEMPTS} lần.${reason}` : "", schedule };
    }
    case "running": {
      const since = Number(req.startedAt || at), stuck = now > since + STUCK_MS;
      return { kind: "running", busy: !stuck, tone: stuck ? "warn" : "info", title: stuck ? `⚠ Đang cập nhật từ ${hm(since)} nhưng chưa thấy kết quả.` : `Đang cập nhật từ ${hm(since)}…`, detail: stuck ? "Có thể phiên cập nhật bị gián đoạn. Bấm yêu cầu lại hoặc nhắn Claude." : "", schedule };
    }
    case "done":
      return { kind: "done", busy: false, tone: "ok", title: `✔ Cập nhật xong lúc ${hm(done || at)}. ${req.message || ""}`.trim(), detail: apps, schedule };
    case "nochange":
      return { kind: "nochange", busy: false, tone: "ok", title: `✔ Đã kiểm tra lúc ${hm(done || at)}, không có thay đổi. ${req.message || ""}`.trim(), detail: apps, schedule };
    case "failed":
      return { kind: "failed", busy: false, tone: "bad", title: `✖ Không cập nhật được (kiểm tra lúc ${hm(done || at)}).${reason}`, detail: `${apps ? `${apps}. ` : ""}${req.message || ""}`.trim(), schedule };
    default:
      return { kind: "none", busy: false, tone: "muted", title: "Trạng thái yêu cầu không rõ.", detail: "", schedule };
  }
}

/** Nội dung ghi khi bấm nút. Từ chối khi đang có yêu cầu chờ hoặc đang chạy (tránh bấm dồn). */
export function newRequest({ now = Date.now(), by = "", current = null }) {
  const v = requestView(current, now);
  if (v.busy && !v.overdue) return null;
  return { status: "pending", requestedAt: now, requestedByName: by, apps: ["GRAB", "SHOPEE"], attempts: 0, startedAt: 0, finishedAt: 0, message: "", reason: "", details: {} };
}
