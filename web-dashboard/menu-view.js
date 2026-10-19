// Menu quán đồng bộ từ máy POS: nhóm món, kiểm tra trùng tên / món bán ra không có trong menu. Hàm thuần.
export const normName = (s) => String(s || "").toLocaleLowerCase("vi").normalize("NFC").replace(/\s+/g, " ").trim();

/** Nhóm theo thứ tự sortOrder của nhóm rồi của món; món mất nhóm vào "Khác". Bỏ món đã xoá. */
export function menuGroups(items = [], cats = []) {
  const catMap = new Map(cats.map((c) => [String(c.id), c]));
  const live = items.filter((m) => m && m.deleted !== true && m.name);
  const groups = new Map();
  for (const m of live) {
    const c = catMap.get(String(m.categoryId));
    const key = c ? String(c.id) : "_other";
    if (!groups.has(key)) groups.set(key, { id: key, name: c?.name || "Khác", sortOrder: Number(c?.sortOrder ?? 999), active: c ? c.active !== false : true, items: [] });
    groups.get(key).items.push(m);
  }
  const list = [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "vi"));
  list.forEach((g) => g.items.sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.name.localeCompare(b.name, "vi")));
  return list;
}

/** Tên trùng (sau khi bỏ hoa thường / khoảng trắng thừa) và tên có khoảng trắng thừa. */
export function nameIssues(items = []) {
  const live = items.filter((m) => m && m.deleted !== true && m.name);
  const byName = new Map();
  for (const m of live) { const k = normName(m.name); byName.set(k, [...(byName.get(k) || []), m]); }
  const duplicates = [...byName.values()].filter((l) => l.length > 1).map((l) => ({ name: l[0].name.trim(), items: l }));
  const spacing = live.filter((m) => m.name !== m.name.trim() || /\s{2,}/.test(m.name));
  return { duplicates, spacing };
}

/** Combo được quản lý riêng trên máy POS (không thuộc nhóm món), dashboardDaily ghi tên dạng "COMBO · ...". */
export const isComboName = (name) => /^\s*combo\s*[·•:\-]/i.test(String(name || ""));

/** Combo đã bán (gộp theo tên) để hiện thông tin riêng, không báo lỗi. */
export function soldCombos(dailyDocs = {}) {
  const out = new Map();
  for (const d of Object.values(dailyDocs || {})) {
    for (const it of Array.isArray(d?.items) ? d.items : []) {
      if (!isComboName(it.name)) continue;
      const k = normName(it.name);
      const cur = out.get(k) || { name: it.name, qty: 0 };
      cur.qty += Number(it.qty || 0);
      out.set(k, cur);
    }
  }
  return [...out.values()].sort((a, b) => b.qty - a.qty);
}

/** Món có trong số bán (dashboardDaily) nhưng không thấy trong menu web: theo mã món, rồi theo tên. Combo không tính (quản lý riêng). */
export function soldNotInMenu(dailyDocs = {}, items = []) {
  const ids = new Set(items.filter((m) => m.deleted !== true).map((m) => String(m.id)));
  const names = new Set(items.filter((m) => m.deleted !== true).map((m) => normName(m.name)));
  const out = new Map();
  for (const d of Object.values(dailyDocs || {})) {
    for (const it of Array.isArray(d?.items) ? d.items : []) {
      if (isComboName(it.name) || ids.has(String(it.itemId)) || names.has(normName(it.name))) continue;
      const k = normName(it.name);
      const cur = out.get(k) || { name: it.name, qty: 0 };
      cur.qty += Number(it.qty || 0);
      out.set(k, cur);
    }
  }
  return [...out.values()].sort((a, b) => b.qty - a.qty);
}

/**
 * Kế hoạch gộp một nhóm món trùng tên: giữ 1 món (đang bán > bán nhiều nhất > có mã > thứ tự nhỏ), các món còn lại NGỪNG BÁN
 * và đổi tên có ghi "đã gộp" để không còn trùng. KHÔNG đổi mã món (máy POS khoá mã duy nhất; đổi mã có thể đè mất món khác),
 * KHÔNG xoá món (bill cũ vẫn trỏ tới món đó). Thống kê cũ theo tên tự cộng chung.
 */
export function mergePlan(items = [], soldById = {}) {
  const live = items.filter((m) => m && m.deleted !== true);
  const score = (m) => [m.active !== false ? 1 : 0, Number(soldById[m.id] || 0), m.productCode ? 1 : 0, -Number(m.sortOrder ?? 0)];
  const sorted = live.slice().sort((a, b) => { const x = score(a), y = score(b); for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return y[i] - x[i]; return String(a.id).localeCompare(String(b.id)); });
  const [keep, ...drop] = sorted;
  if (!keep) return null;
  const clean = String(keep.name || "").replace(/\s+/g, " ").trim();
  const tag = keep.productCode ? `gộp vào ${keep.productCode}` : "đã gộp";
  return {
    keep, drop, cleanName: clean,
    writes: [
      { id: keep.id, data: { name: clean, active: true } },
      ...drop.map((d) => ({ id: d.id, data: { name: `${clean} (${tag})`, active: false, mergedInto: keep.id } })),
    ],
  };
}

/** Mã món mới không trùng: theo tiền tố đang dùng trong nhóm (vd "CF-"), số kế tiếp, 3 chữ số. */
export function nextProductCode(items = [], categoryId = "") {
  const all = new Set(items.map((m) => String(m.productCode || "")).filter(Boolean));
  const inCat = items.filter((m) => String(m.categoryId) === String(categoryId) && /^[A-Za-z]+-\d+$/.test(m.productCode || ""));
  const counts = new Map();
  for (const m of inCat) { const p = m.productCode.split("-")[0].toUpperCase(); counts.set(p, (counts.get(p) || 0) + 1); }
  const prefix = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "MN";
  let n = Math.max(0, ...[...all].filter((c) => c.toUpperCase().startsWith(`${prefix}-`)).map((c) => Number(c.split("-")[1]) || 0)) + 1;
  let code = `${prefix}-${String(n).padStart(3, "0")}`;
  while (all.has(code)) { n += 1; code = `${prefix}-${String(n).padStart(3, "0")}`; }
  return code;
}

/** Kiểm tra trước khi lưu món sửa trên web. Trả về lỗi tiếng Việt hoặc "". */
export function menuEditProblem(draft, items = []) {
  const name = String(draft.name || "").replace(/\s+/g, " ").trim();
  if (!name) return "Nhập tên món.";
  if (!Number.isFinite(Number(draft.price)) || Number(draft.price) < 0) return "Giá không hợp lệ.";
  if (Number(draft.price) % 500 !== 0 && Number(draft.price) > 0) return "Giá nên tròn 500đ (vd 35000, 2500).";
  if (!draft.categoryId) return "Chọn nhóm món.";
  const dupName = items.find((m) => m.id !== draft.id && m.deleted !== true && m.active !== false && normName(m.name) === normName(name));
  if (dupName && draft.active !== false) return `Đã có món đang bán tên "${dupName.name.trim()}".`;
  const dupCode = draft.productCode && items.find((m) => m.id !== draft.id && m.productCode === draft.productCode);
  if (dupCode) return `Mã ${draft.productCode} đã thuộc món "${dupCode.name.trim()}".`;
  return "";
}
