/**
 * Giờ mở cửa (chuỗi chủ quán nhập, ví dụ "6:30 - 18:00") -> trạng thái đang mở / đã đóng.
 * Tính theo giờ Việt Nam (UTC+7) từ mốc thời gian truyền vào, không phụ thuộc múi giờ máy khách.
 * Không đọc được chuỗi (có thứ trong tuần, định dạng lạ...) thì trả known:false để trang KHÔNG đoán bừa.
 */
const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MIN = 1440;
const SOON_MIN = 30;

const normalizeText = (raw) =>
  String(raw ?? "")
    .toLowerCase()
    .replace(/giờ/g, "h")
    .replace(/[–—−]/g, "-")
    .replace(/\s+(đến|tới|den|toi|to)\s+/g, " - ");

// Có thứ trong tuần / ngày lễ thì chuỗi một dòng không đủ để biết hôm nay mở hay không.
const HAS_WEEKDAY = /(^|[^a-z0-9])(t[2-7]|cn|thứ\s*\d|thu\s*\d|chủ\s*nhật|chu\s*nhat)([^a-z0-9]|$)/;

const toMinutes = (hour, minute) => {
  const h = Number(hour);
  const m = minute === undefined || minute === "" ? 0 : Number(minute);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 24 || m < 0 || m > 59) return null;
  if (h === 24 && m !== 0) return null;
  return h * 60 + m;
};

/** Đọc các khoảng giờ trong chuỗi. Trả mảng [{ start, end }] tính bằng phút; "always" nếu mở cả ngày; null nếu không đọc được. */
export function parseHours(raw) {
  const text = normalizeText(raw);
  if (!text.trim() || HAS_WEEKDAY.test(text)) return null;
  const ranges = [];
  // Mỗi vế phải có dấu : hoặc h ở ít nhất một đầu, tránh đọc nhầm "2 - 6" (thứ 2 đến thứ 6) thành giờ.
  const re = /(\d{1,2})(?:\s*([:h])\s*(\d{1,2})?)?\s*-\s*(\d{1,2})(?:\s*([:h])\s*(\d{1,2})?)?/g;
  for (const m of text.matchAll(re)) {
    if (!m[2] && !m[5]) continue;
    const start = toMinutes(m[1], m[3]);
    const end = toMinutes(m[4], m[6]);
    if (start === null || end === null) return null;
    ranges.push({ start, end });
  }
  if (ranges.length) return ranges;
  if (/24\s*\/\s*(7|24)|cả ngày|ca ngay|cả tuần|24\s*h(?!\w)/.test(text)) return "always";
  return null;
}

const clock = (minute) => {
  const m = ((minute % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

/** Phút trong ngày (giờ Việt Nam) của một mốc thời gian. */
export const vnMinuteOfDay = (nowMs) => Math.floor((((Number(nowMs) + VN_OFFSET_MS) % 86_400_000) + 86_400_000) % 86_400_000 / 60_000);

const isInside = (range, minute) =>
  range.end > range.start ? minute >= range.start && minute < range.end : range.end < range.start ? minute >= range.start || minute < range.end : true;

/**
 * @returns {{known:false}|{known:true, open:boolean, soon:boolean, label:string, detail:string}}
 *   label: "Đang mở cửa" | "Sắp đóng cửa" | "Đã đóng cửa"; detail: câu bổ sung ("đến 18:00", "mở lại lúc 6:30 ngày mai").
 */
export function openStatus(hoursText, nowMs) {
  const ranges = parseHours(hoursText);
  if (!ranges || !Number.isFinite(Number(nowMs))) return { known: false };
  if (ranges === "always") return { known: true, open: true, soon: false, label: "Đang mở cửa", detail: "cả ngày" };
  const minute = vnMinuteOfDay(nowMs);
  const current = ranges.find((r) => isInside(r, minute));
  if (current) {
    const left = (current.end - minute + DAY_MIN) % DAY_MIN || DAY_MIN;
    const soon = left <= SOON_MIN;
    return { known: true, open: true, soon, label: soon ? "Sắp đóng cửa" : "Đang mở cửa", detail: soon ? `còn ${left} phút, đóng lúc ${clock(current.end)}` : `đến ${clock(current.end)}` };
  }
  const later = ranges.map((r) => r.start).filter((s) => s > minute).sort((a, b) => a - b)[0];
  if (later !== undefined) return { known: true, open: false, soon: false, label: "Đã đóng cửa", detail: `mở lại lúc ${clock(later)}` };
  const first = ranges.map((r) => r.start).sort((a, b) => a - b)[0];
  return { known: true, open: false, soon: false, label: "Đã đóng cửa", detail: `mở lại lúc ${clock(first)} ngày mai` };
}
