/**
 * Nhận diện nguồn khách (UTM / nơi giới thiệu) và nhớ trong trình duyệt 7 ngày. Hàm thuần: không DOM, không Firebase.
 * Quy tắc: last non-direct touch (nguồn không-trực-tiếp gần nhất) + giữ cả nguồn đầu tiên.
 * Không có thông tin đáng tin thì trả null (= "không xác định"), KHÔNG tự coi là truy cập trực tiếp.
 */
export const ATTR_TTL_MS = 7 * 86_400_000;
export const ATTR_FIELD_MAX = 40;

/** Chuẩn hoá một giá trị UTM: chữ thường, chỉ giữ chữ-số _ - . ~ và khoảng trắng đổi thành _, tối đa 40 ký tự. */
export const cleanTag = (value) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.~-]/g, "").slice(0, ATTR_FIELD_MAX);

const FACEBOOK_HOSTS = /(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch|messenger\.com)$/;
const GOOGLE_HOSTS = /(^|\.)google\.[a-z.]{2,6}$/;

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };

/**
 * Một lượt chạm từ URL hiện tại + nơi giới thiệu (document.referrer).
 * @returns {null | {source, medium, campaign, content, term, strong:boolean}}
 *   strong = có UTM (chủ động gắn); weak = chỉ đoán từ nơi giới thiệu / fbclid.
 */
export function parseTouch(search, referrer = "", ownHost = "") {
  let params;
  try { params = new URLSearchParams(String(search || "")); } catch { params = new URLSearchParams(); }
  const utm = { source: cleanTag(params.get("utm_source")), medium: cleanTag(params.get("utm_medium")), campaign: cleanTag(params.get("utm_campaign")), content: cleanTag(params.get("utm_content")), term: cleanTag(params.get("utm_term")) };
  if (utm.source || utm.medium || utm.campaign || utm.content || utm.term) {
    return { ...utm, source: utm.source || "(not_set)", strong: true };
  }
  // Facebook gắn fbclid khi khách bấm link từ Facebook; không phân biệt được quảng cáo hay bài tự nhiên nếu link thiếu UTM.
  if (params.has("fbclid")) return { source: "facebook", medium: "fbclid", campaign: "", content: "", term: "", strong: false };
  const host = hostOf(referrer);
  if (!host || host === String(ownHost).toLowerCase()) return null;
  if (FACEBOOK_HOSTS.test(host)) return { source: "facebook", medium: "referral", campaign: "", content: "", term: "", strong: false };
  if (GOOGLE_HOSTS.test(host)) return { source: "google", medium: "referral", campaign: "", content: "", term: "", strong: false };
  return { source: cleanTag(host), medium: "referral", campaign: "", content: "", term: "", strong: false };
}

const sameTouch = (a, b) => a && b && ["source", "medium", "campaign", "content", "term"].every((k) => (a[k] || "") === (b[k] || ""));
const slim = (t, at) => ({ source: t.source, medium: t.medium, campaign: t.campaign, content: t.content, term: t.term, at, strong: Boolean(t.strong) });

/**
 * Cập nhật bản nhớ khi khách vào trang.
 * stored: { first, last } hoặc null. Hết hạn 7 ngày kể từ lần chạm gần nhất thì bắt đầu lại.
 * - touch null (không có thông tin): giữ nguyên, KHÔNG ghi đè.
 * - cùng một nguồn/chiến dịch đang lưu: giữ nguyên (tải lại trang không đổi mốc thời gian).
 * - nguồn đoán (weak) không đè nguồn có UTM (strong) còn hạn.
 */
export function updateAttribution(stored, touch, nowMs) {
  const valid = stored && stored.last && Number(stored.last.at) + ATTR_TTL_MS > nowMs ? stored : null;
  if (!touch) return valid;
  if (!valid) { const t = slim(touch, nowMs); return { first: t, last: t }; }
  if (sameTouch(valid.last, touch)) return valid;
  if (!touch.strong && valid.last.strong) return valid;
  return { first: valid.first || valid.last, last: slim(touch, nowMs) };
}

const text = (v) => cleanTag(v);
/** Bản ghi nguồn gắn vào đơn (null nếu không có / đã hết hạn). Chỉ giữ trường không rỗng để tài liệu nhỏ. */
export function attributionForOrder(stored, nowMs) {
  const kept = updateAttribution(stored, null, nowMs);
  if (!kept?.last) return null;
  const pick = (t, keys) => Object.fromEntries(keys.map((k) => [k, k === "at" ? Math.floor(Number(t.at) || 0) : text(t[k])]).filter(([k, v]) => (k === "at" ? v > 0 : v !== "")));
  const last = pick(kept.last, ["source", "medium", "campaign", "content", "term", "at"]);
  if (!last.source) return null;
  const first = kept.first ? pick(kept.first, ["source", "campaign", "content", "at"]) : null;
  return first?.source ? { ...last, first } : last;
}

/** Đọc bản nhớ từ JSON bất kỳ (hỏng thì null). */
export const readStored = (raw) => {
  if (!raw || typeof raw !== "object" || !raw.last || typeof raw.last !== "object") return null;
  return { first: raw.first && typeof raw.first === "object" ? raw.first : null, last: raw.last };
};

/** Quy tắc đặt tên UTM thống nhất (chữ thường, không dấu, gạch dưới). */
export function buildUtmUrl(base, { source, medium, campaign, content, term }) {
  const url = new URL(base);
  for (const [k, v] of [["utm_source", source], ["utm_medium", medium], ["utm_campaign", campaign], ["utm_content", content], ["utm_term", term]]) {
    const c = cleanTag(v);
    if (c) url.searchParams.set(k, c);
  }
  return url.toString();
}
