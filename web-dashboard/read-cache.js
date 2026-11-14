/* Bộ nhớ tạm cho các lần đọc Firestore tốn nhất của dashboard (mua hàng, hoàn tiền, giao dịch, ca bán...).
   Mục đích: tải lại trang / chuyển tab / mở lại tab trong vài phút không đọc lại cùng một dữ liệu (gói Spark chỉ cho 50.000 lượt đọc mỗi ngày).
   - Khóa theo chính truy vấn (đường dẫn + điều kiện + sắp xếp + giới hạn), nên mỗi khoảng ngày/tháng có một bản riêng, ghi đè khi đọc mới.
   - Hết hạn sau READ_CACHE_TTL_MS; bấm Làm mới/Đọc lại/Tải lại hoặc có ghi dữ liệu từ web thì bỏ bản cũ.
   - Khi Firebase báo hết hạn mức, vẫn dùng bản cũ (kể cả đã quá hạn) để dashboard còn xem được. */

export const READ_CACHE_TTL_MS = 4 * 60_000;
export const CACHEABLE_SOURCES = new Set([
  "purchases", "reimbursements", "financialMovements", "expenseRules", "expenseReceipts", "sessions",
  "foodAppLedger", "dashboardDaily", "dashboardMonthly", "bills", "payments",
]);
export const isCacheableSource = (name) => CACHEABLE_SOURCES.has(name);

/** Khóa ổn định của một truy vấn Firestore (null nếu không phải truy vấn thật). */
export function queryKey(q) {
  try { return q && q._query ? JSON.stringify(q._query) : null; } catch { return null; }
}

const isTimestamp = (v) => v && typeof v === "object" && typeof v.toMillis === "function" && typeof v.seconds === "number" && typeof v.nanoseconds === "number";

/** Timestamp -> {__ts:[giây, nano]} để lưu được dạng JSON mà không mất kiểu. */
export function encodeValue(v) {
  if (isTimestamp(v)) return { __ts: [v.seconds, v.nanoseconds] };
  if (Array.isArray(v)) return v.map(encodeValue);
  if (v && typeof v === "object") { const out = {}; for (const k of Object.keys(v)) out[k] = encodeValue(v[k]); return out; }
  return v;
}
export function decodeValue(v, makeTimestamp) {
  if (Array.isArray(v)) return v.map((x) => decodeValue(x, makeTimestamp));
  if (v && typeof v === "object") {
    if (Array.isArray(v.__ts) && Object.keys(v).length === 1) return makeTimestamp(v.__ts[0], v.__ts[1]);
    const out = {}; for (const k of Object.keys(v)) out[k] = decodeValue(v[k], makeTimestamp); return out;
  }
  return v;
}

/** Đóng gói các tài liệu của một snapshot thật thành dữ liệu JSON thuần. */
export const packDocs = (docs) => docs.map((d) => ({ id: d.id, path: d.ref.path, data: JSON.stringify(encodeValue(d.data())) }));

/** Snapshot giả đủ dùng cho code đọc (docs, size, empty, forEach; mỗi doc có id, ref, data(), get(), exists()). */
export function snapshotFrom(packed, { makeTimestamp, makeRef }) {
  const docs = packed.map((p) => ({
    id: p.id,
    get ref() { return makeRef(p.path); },
    exists: () => true,
    data: () => decodeValue(JSON.parse(p.data), makeTimestamp),
    get: (field) => decodeValue(JSON.parse(p.data), makeTimestamp)?.[field],
    metadata: { fromCache: false, hasPendingWrites: false },
  }));
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn), docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false }, fromReadCache: true };
}

/** Bộ nhớ trong trang (mất khi tải lại) — bản bền nằm ở createIdbStore. */
export function createMemoryCache({ ttlMs = READ_CACHE_TTL_MS, now = Date.now } = {}) {
  const map = new Map();
  return {
    get(key) { const e = map.get(key); return e && now() - e.at <= ttlMs ? e.docs : null; },
    getAny(key) { return map.get(key)?.docs || null; },
    set(key, docs, at = now()) { map.set(key, { docs, at }); },
    isFresh(entry) { return !!entry && now() - entry.at <= ttlMs; },
    clear() { map.clear(); },
    size() { return map.size; },
  };
}

/** IndexedDB nhỏ: một kho, khóa = khóa truy vấn, ghi đè theo khóa. Không có IndexedDB thì trả null. */
export function createIdbStore(name = "pos0210-readcache") {
  if (typeof indexedDB === "undefined") return null;
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("q");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("q", mode); const store = tx.objectStore("q");
      const r = fn(store);
      tx.oncomplete = () => resolve(r && "result" in r ? r.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  };
  return {
    get: (key) => run("readonly", (s) => s.get(key)),
    set: (key, value) => run("readwrite", (s) => s.put(value, key)),
    clear: () => run("readwrite", (s) => s.clear()),
  };
}
