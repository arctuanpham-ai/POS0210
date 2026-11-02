/**
 * Bản chụp menu cho khách (giảm số lượt đọc Firestore): thay vì mỗi khách mới đọc ~125 tài liệu (menu, nhóm, combo, từng ảnh nhỏ),
 * quán lưu sẵn menu thành 1 tài liệu `online_menu/data` và ảnh nhỏ thành vài tài liệu `online_menu/thumbs_<n>` (mỗi cái tối đa ~600 KB, trần của Firestore là 1 MiB).
 * Khách đọc ~3 tài liệu. Bản chụp chỉ là bản sao để HIỂN THỊ: giá, món còn bán... vẫn do luật Firestore kiểm với menu thật lúc gửi đơn.
 * Hàm thuần (không Firebase, không DOM). Tệp này có bản y hệt ở web-dashboard/menu-snapshot.js (test kiểm hai bản giống nhau).
 */
export const SNAPSHOT_SCHEMA = 1;
export const SNAPSHOT_DOC = "data";
export const THUMB_DOC_PREFIX = "thumbs_";
export const THUMB_CHUNK_BYTES = 600_000;
export const MAX_THUMB_CHUNKS = 8;

/** Chỉ giữ giá trị lưu được thẳng vào Firestore: chuỗi, số, boolean, null, mảng, đối tượng thuần; Timestamp -> mili giây; bỏ undefined / hàm. */
export function plain(value, depth = 0) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (depth > 6) return null;
  if (Array.isArray(value)) return value.map((v) => plain(v, depth + 1)).filter((v) => v !== undefined);
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) { const p = v === undefined || typeof v === "function" ? undefined : plain(v, depth + 1); if (p !== undefined) out[k] = p; }
    return out;
  }
  return undefined;
}

/** JSON ổn định (khoá sắp xếp) để so sánh nội dung giữa hai lần dựng. */
export const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
};

/** Băm FNV-1a 32 bit -> chuỗi hex. Đủ để phát hiện thay đổi (không dùng cho bảo mật). */
export const fnv = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
};

const byId = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
const clean = (rows) => byId((rows || []).filter((r) => r && r.id != null).map((r) => ({ ...plain(r), id: String(r.id) })));

/** Phần nội dung của bản chụp (menu thô + danh sách món ẩn); đây là thứ được băm. */
export const menuContent = ({ items, cats, combos, hidden }) => ({
  items: clean(items), cats: clean(cats), combos: clean(combos),
  hidden: [...new Set((hidden || []).map(String))].sort(),
});

export const menuHash = (content) => fnv(stableJson(content));

/** Chia ảnh nhỏ {menu_<id>: dataUrl} thành các nhóm không vượt `maxBytes` ký tự. Ném lỗi nếu cần quá MAX_THUMB_CHUNKS nhóm. */
export function chunkThumbs(map, maxBytes = THUMB_CHUNK_BYTES) {
  const chunks = [];
  let cur = {}, size = 0;
  for (const [id, url] of Object.entries(map || {}).filter(([, u]) => typeof u === "string" && u.startsWith("data:image/")).sort(([a], [b]) => a.localeCompare(b))) {
    const cost = id.length + url.length + 8;
    if (cost > maxBytes) continue; // một ảnh quá lớn: bỏ qua, khách thấy chữ cái đầu thay ảnh
    if (size + cost > maxBytes && Object.keys(cur).length) { chunks.push(cur); cur = {}; size = 0; }
    cur[id] = url; size += cost;
  }
  if (Object.keys(cur).length) chunks.push(cur);
  if (chunks.length > MAX_THUMB_CHUNKS) throw new Error(`Ảnh nhỏ cần ${chunks.length} nhóm, quá giới hạn ${MAX_THUMB_CHUNKS}`);
  return chunks;
}

/**
 * Dựng các tài liệu cần ghi.
 * @param thumbs   {menu_<id>: dataUrl} hoặc null = giữ nguyên ảnh đang lưu (chỉ cập nhật menu)
 * @param keep     { thumbsParts, thumbsVer, thumbsBuiltAt } của bản đang lưu, dùng khi thumbs == null
 * @returns {{ data: object, thumbDocs: object|null, hash: string }}  thumbDocs: { thumbs_0: {map}, ... } hoặc null nếu không đổi ảnh
 */
export function buildSnapshot({ items, cats, combos, hidden, thumbs = null, thumbsVer = 0, keep = null, now = Date.now(), by = "" }) {
  const content = menuContent({ items, cats, combos, hidden });
  const chunks = thumbs ? chunkThumbs(thumbs) : null;
  const data = {
    schema: SNAPSHOT_SCHEMA, builtAt: now, builtBy: String(by).slice(0, 40), hash: menuHash(content),
    thumbsParts: chunks ? chunks.length : Number(keep?.thumbsParts || 0),
    thumbsVer: chunks ? Number(thumbsVer || 0) : Number(keep?.thumbsVer || 0),
    thumbsBuiltAt: chunks ? now : Number(keep?.thumbsBuiltAt || 0),
    ...content,
  };
  const thumbDocs = chunks ? Object.fromEntries(chunks.map((map, i) => [`${THUMB_DOC_PREFIX}${i}`, { map, part: i, builtAt: now }])) : null;
  return { data, thumbDocs, hash: data.hash };
}

/** Bản chụp đọc được và đúng phiên bản không? */
export const usableSnapshot = (data) =>
  Boolean(data && data.schema === SNAPSHOT_SCHEMA && Array.isArray(data.items) && Array.isArray(data.cats) && Array.isArray(data.combos) && Array.isArray(data.hidden));

/** Gộp các nhóm ảnh đọc về thành một bản đồ. */
export const mergeThumbChunks = (docs) => {
  const map = {};
  for (const d of docs || []) for (const [id, url] of Object.entries(d?.map || {})) if (typeof url === "string" && url.startsWith("data:image/")) map[id] = url;
  return map;
};
