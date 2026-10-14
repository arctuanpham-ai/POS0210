// Bộ nhớ đệm phiếu chi trên trình duyệt: lần đầu đọc đủ cửa sổ, các lần sau chỉ đọc phiếu đổi (updatedAt mới hơn).
// Hàm thuần, không đụng localStorage hay Firebase.

export const CACHE_VERSION = 1;
export const MAX_CACHED = 1500;

/** Cache hợp lệ nếu đúng phiên bản, cùng tài khoản và phủ được mốc cần. Ngược lại phải đọc lại đủ. */
export const planLoad = (cache, { uid, from }) => {
  if (!cache || cache.version !== CACHE_VERSION || cache.uid !== uid || !Array.isArray(cache.receipts)) return { mode: "full" };
  if (!Number.isFinite(cache.from) || cache.from > from) return { mode: "full" };
  if (!Number.isFinite(cache.cursor) || cache.cursor <= 0) return { mode: "full" };
  return { mode: "incremental", cursor: cache.cursor };
};

const updatedOf = (r) => Number(r.updatedAt || 0);

/** Gộp phiếu mới đọc vào cache theo id (phiếu mới hơn thắng), cắt theo mốc `from`, tối đa MAX_CACHED. Cursor = updatedAt lớn nhất. */
export const mergeReceipts = (cache, fetched, { uid, from }) => {
  const byId = new Map();
  for (const r of cache?.receipts || []) byId.set(String(r.id), r);
  for (const r of fetched) {
    const old = byId.get(String(r.id));
    if (!old || updatedOf(r) >= updatedOf(old)) byId.set(String(r.id), r);
  }
  const receipts = [...byId.values()]
    .filter((r) => Number(r.purchaseDate || 0) >= from)
    .sort((a, b) => Number(b.purchaseDate || 0) - Number(a.purchaseDate || 0));
  const truncated = receipts.length > MAX_CACHED;
  const kept = truncated ? receipts.slice(0, MAX_CACHED) : receipts;
  const cursor = Math.max(Number(cache?.cursor || 0), ...fetched.map(updatedOf), 0);
  // Nếu phải cắt bớt thì cache không còn phủ tới `from`; nâng from lên phiếu cũ nhất còn giữ để lần sau đọc lại đủ.
  const effectiveFrom = truncated ? Number(kept[kept.length - 1].purchaseDate || from) : from;
  return { version: CACHE_VERSION, uid, from: effectiveFrom, cursor, receipts: kept, savedAt: Date.now() };
};
