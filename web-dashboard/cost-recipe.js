// Danh mục vật tư chuẩn, giá vốn từ phiếu chi chi tiết và giá vốn món từ công thức. Hàm thuần, không Firebase, không DOM.
import { normalizeText, isSummaryReceipt, groupLabelOf } from "./expense-rules.js?v=20261018-02";

export const KIND_LABELS = { NL: "Nguyên liệu", BB: "Bao bì theo món", VH: "Vận hành" };

// [id, tên, nhóm, loại chi, đơn vị định lượng, [[đơn vị mua, quy đổi ra đơn vị định lượng], ...], [tên gọi khác]]
const M = (id, name, group, kind, base, units, aliases = []) => ({ id, name, group, kind, base, units: units.map(([unit, per]) => ({ unit, per })), aliases });
const W = [["kg", 1000], ["g", 1]];
const V = [["lít", 1000], ["ml", 1]];
export const MATERIALS = [
  M("cf_phin", "Cà phê hạt pha phin", "CAPHE", "NL", "g", W, ["ca phe phin", "cafe phin", "robusta"]),
  M("cf_espresso", "Cà phê hạt espresso", "CAPHE", "NL", "g", W, ["espresso", "arabica"]),
  M("cf_coldbrew", "Cà phê hạt cold brew", "CAPHE", "NL", "g", W, ["cold brew", "coldbrew"]),
  M("sua_dac", "Sữa đặc", "SUA", "NL", "g", [["hộp", 380], ["thùng", 380 * 48], ...W], ["sua dac", "ong tho", "ngoi sao phuong nam"]),
  M("sua_tuoi", "Sữa tươi không đường", "SUA", "NL", "ml", [["hộp", 1000], ...V], ["sua tuoi"]),
  M("kem_beo", "Kem béo (whipping)", "SUA", "NL", "ml", [["hộp", 1000], ...V], ["whipping", "kem beo", "kem tuoi"]),
  M("bo_lat", "Bơ lạt", "SUA", "NL", "g", W, ["bo lat", "bo thuc vat"]),
  M("trung", "Trứng gà", "SUA", "NL", "quả", [["quả", 1], ["vỉ", 10], ["khay", 30]], ["trung ga", "trung"]),
  M("tra_moc", "Trà mộc", "TRA", "NL", "g", W, ["tra moc", "tra thai nguyen"]),
  M("tra_da", "Trà khô pha trà đá", "TRA", "NL", "g", W, ["tra kho", "che kho", "tra da"]),
  M("tra_tui", "Trà túi lọc", "TRA", "NL", "túi", [["túi", 1], ["hộp", 25]], ["tra tui loc", "lipton"]),
  M("mo_ngam", "Mơ ngâm", "MUT", "NL", "g", W, ["mo ngam"]),
  M("nha_dam", "Nha đam", "MUT", "NL", "g", W, ["nha dam"]),
  M("cam", "Cam", "RAU", "NL", "g", W, ["cam"]),
  M("dua_hau", "Dưa hấu", "RAU", "NL", "g", W, ["dua hau"]),
  M("chanh", "Chanh", "RAU", "NL", "g", W, ["chanh"]),
  M("rau_thom", "Rau thơm, hành lá, giá", "RAU", "NL", "g", W, ["rau thom", "hanh la", "gia do", "rau song"]),
  M("dua_chuot", "Dưa chuột", "RAU", "NL", "g", W, ["dua chuot", "dua leo"]),
  M("ca_chua", "Cà chua", "RAU", "NL", "g", W, ["ca chua"]),
  M("hanh_tay", "Hành tây", "RAU", "NL", "g", W, ["hanh tay"]),
  M("khoai_tay", "Khoai tây chiên đông lạnh", "RAU", "NL", "g", W, ["khoai tay"]),
  M("ga_ta_loc", "Gà ta lọc xương", "THIT", "NL", "g", W, ["ga ta", "ga loc xuong", "thit ga"]),
  M("canh_ga", "Cánh gà", "THIT", "NL", "g", W, ["canh ga"]),
  M("dui_ga", "Đùi gà", "THIT", "NL", "g", W, ["dui ga", "ma dui"]),
  M("thit_bo", "Thịt bò", "THIT", "NL", "g", W, ["thit bo", "bo than", "than bo"]),
  M("moc", "Mọc (giò sống)", "THIT", "NL", "g", W, ["moc", "gio song"]),
  M("pate", "Pate", "THIT", "NL", "g", W, ["pate", "pa te"]),
  M("bun_tuoi", "Bún tươi", "BUN", "NL", "g", W, ["bun tuoi", "bun"]),
  M("banh_da", "Bánh đa", "BUN", "NL", "g", W, ["banh da"]),
  M("gao", "Gạo", "BUN", "NL", "g", W, ["gao"]),
  M("banh_mi", "Bánh mì", "BANH", "NL", "cái", [["cái", 1], ["ổ", 1]], ["banh mi"]),
  M("duong", "Đường cát", "GIAVI", "NL", "g", W, ["duong cat", "duong"]),
  M("muoi", "Muối", "GIAVI", "NL", "g", W, ["muoi"]),
  M("nuoc_mam", "Nước mắm", "GIAVI", "NL", "ml", [["chai", 500], ...V], ["nuoc mam"]),
  M("tieu", "Tiêu", "GIAVI", "NL", "g", W, ["tieu", "hat tieu"]),
  M("hat_nem", "Hạt nêm", "GIAVI", "NL", "g", W, ["hat nem", "bot canh"]),
  M("toi", "Tỏi", "GIAVI", "NL", "g", W, ["toi"]),
  M("dau_an", "Dầu ăn", "GIAVI", "NL", "ml", [["can", 5000], ["chai", 1000], ...V], ["dau an"]),
  M("sot_tieu", "Sốt tiêu đen", "GIAVI", "NL", "g", W, ["sot tieu"]),
  M("hat_huong_duong", "Hạt hướng dương", "KHAC", "NL", "g", W, ["huong duong"]),
  M("hat_dua", "Hạt dưa", "KHAC", "NL", "g", W, ["hat dua"]),
  M("da_vien", "Đá viên", "DA", "NL", "bao", [["bao", 1]], ["da vien", "da"]),
  M("ly_nhua", "Ly nhựa + nắp", "BAOBI", "BB", "cái", [["cái", 1], ["cây", 50]], ["ly nhua", "coc nhua"]),
  M("ly_giay", "Ly giấy nóng", "BAOBI", "BB", "cái", [["cái", 1], ["cây", 50]], ["ly giay", "coc giay"]),
  M("ong_hut", "Ống hút", "BAOBI", "BB", "cái", [["cái", 1]], ["ong hut"]),
  M("tui", "Túi đựng", "BAOBI", "BB", "cái", [["cái", 1]], ["tui"]),
  M("hop_mang_ve", "Hộp mang về", "BAOBI", "BB", "cái", [["cái", 1]], ["hop xop", "hop giay", "hop mang ve"]),
  M("gas", "Gas", "KHAC", "VH", "bình", [["bình", 1]], ["gas", "ga binh"]),
  M("nuoc_loc", "Nước lọc pha chế", "DA", "VH", "bình", [["bình", 1]], ["nuoc loc", "binh nuoc"]),
  M("giay_an", "Giấy ăn", "VESINH", "VH", "gói", [["gói", 1]], ["giay an"]),
  M("nuoc_rua_chen", "Nước rửa chén", "VESINH", "VH", "chai", [["chai", 1], ["can", 1]], ["nuoc rua chen"]),
];
export const materialById = new Map(MATERIALS.map((m) => [m.id, m]));

/** Quy tắc nhóm theo đúng tên vật tư chuẩn, để ô nhóm tự điền khi chọn từ danh mục. */
export const catalogRules = MATERIALS.map((m) => ({ name: normalizeText(m.name), group: m.group }));

/** Vật tư chuẩn của một dòng phiếu: theo materialId nếu có, rồi tên trùng, rồi tên gọi khác dài nhất có trong tên. */
export const matchMaterial = (line) => {
  if (line?.materialId && materialById.has(line.materialId)) return materialById.get(line.materialId);
  const name = normalizeText(line?.materialName);
  if (!name) return null;
  const exact = MATERIALS.find((m) => normalizeText(m.name) === name);
  if (exact) return exact;
  let best = null, bestLen = 0;
  const padded = ` ${name} `;
  for (const m of MATERIALS) for (const a of m.aliases) {
    const n = normalizeText(a);
    if (n && padded.includes(` ${n} `) && n.length > bestLen) { best = m; bestLen = n.length; }
  }
  return best;
};

const UNIT_ALIASES = { gam: "g", gram: "g", gr: "g", kilogram: "kg", kilo: "kg", lit: "lít", l: "lít", lít: "lít", "lit ": "lít" };
/** Số đơn vị định lượng trong một đơn vị mua, null nếu đơn vị không quy đổi được. */
export const unitFactor = (material, unit) => {
  const u = normalizeText(unit);
  const canon = UNIT_ALIASES[u] ?? u;
  const hit = material.units.find((x) => normalizeText(x.unit) === normalizeText(canon));
  return hit ? hit.per : null;
};

/**
 * Giá vốn mỗi đơn vị định lượng của từng vật tư, từ phiếu chi CHI TIẾT chưa huỷ.
 * Bình quân gia quyền trong windowDays gần nhất; nếu trong khoảng đó không mua thì lấy lần mua gần nhất đã tải.
 * Dòng không quy đổi được đơn vị được đếm riêng để người dùng sửa.
 */
export const materialCosts = (receipts, { now = Date.now(), windowDays = 30 } = {}) => {
  const from = now - windowDays * 86400000;
  const acc = new Map();
  const unconvertible = [];
  for (const r of Array.isArray(receipts) ? receipts : []) {
    if (!r || r.status === "DELETED" || r.status === "CANCELLED" || isSummaryReceipt(r)) continue;
    const at = Number(r.purchaseDate || 0);
    for (const line of r.items || []) {
      const m = matchMaterial(line);
      if (!m) continue;
      const qty = Number(line.qty || 0);
      const amount = Number(line.amount ?? qty * Number(line.unitPrice || 0));
      const f = unitFactor(m, line.unit);
      if (!(qty > 0) || !(amount > 0)) continue;
      if (!f) { unconvertible.push({ materialId: m.id, name: line.materialName, unit: line.unit, receiptId: r.id }); continue; }
      const a = acc.get(m.id) || { inWindowAmount: 0, inWindowQty: 0, last: null, buys: 0 };
      const baseQty = qty * f;
      if (at >= from) { a.inWindowAmount += amount; a.inWindowQty += baseQty; }
      if (!a.last || at > a.last.at) a.last = { at, unitCost: amount / baseQty };
      a.buys += 1;
      acc.set(m.id, a);
    }
  }
  const out = {};
  for (const [id, a] of acc) {
    const avg = a.inWindowQty > 0 ? a.inWindowAmount / a.inWindowQty : null;
    out[id] = { unitCost: avg ?? a.last.unitCost, source: avg !== null ? `bình quân ${windowDays} ngày` : "lần mua gần nhất", lastAt: a.last.at, lastUnitCost: a.last.unitCost, buys: a.buys };
  }
  return { costs: out, unconvertible };
};

/** Giá vốn một món theo công thức. missing: vật tư chưa có giá; percent null khi giá bán 0. */
export const recipeCost = (lines, costs, price) => {
  let total = 0;
  const missing = [];
  const rows = (lines || []).filter((l) => Number(l.qty) > 0).map((l) => {
    const m = materialById.get(l.materialId);
    const c = costs[l.materialId];
    const cost = c ? Number(l.qty) * c.unitCost : null;
    if (cost === null) missing.push(m?.name ?? l.materialId); else total += cost;
    return { ...l, name: m?.name ?? l.materialId, base: m?.base ?? "", unitCost: c?.unitCost ?? null, cost };
  });
  const p = Number(price || 0);
  return { rows, total: Math.round(total), missing, percent: p > 0 ? total / p : null, complete: missing.length === 0 && rows.length > 0 };
};

/** Mức cảnh báo % giá vốn: đồ ăn ngưỡng cao hơn đồ uống. */
export const costLevel = (percent, isFood) => {
  if (percent === null || percent === undefined) return "unknown";
  const [warn, bad] = isFood ? [0.40, 0.50] : [0.30, 0.40];
  return percent >= bad ? "bad" : percent >= warn ? "warn" : "ok";
};

/** Thanh kéo: khoảng và bước hợp lý theo đơn vị và lượng hiện tại. */
export const sliderSpec = (base, qty) => {
  const q = Number(qty || 0);
  if (base === "g" || base === "ml") { const max = Math.max(50, Math.ceil((q * 3) / 50) * 50); return { min: 0, max, step: max > 300 ? 5 : 1 }; }
  return { min: 0, max: Math.max(3, Math.ceil(q * 3)), step: base === "bao" || base === "bình" ? 0.01 : 0.5 };
};

const R = (pairs) => pairs.map(([materialId, qty]) => ({ materialId, qty }));
/** Công thức nháp theo tên món (không dấu). Người dùng sửa và lưu thì bản đã lưu thay thế. */
export const DRAFT_RECIPES = {
  "den da": R([["cf_phin", 20], ["duong", 10]]),
  "cafe sua": R([["cf_phin", 20], ["sua_dac", 30]]),
  "bac xiu": R([["cf_phin", 10], ["sua_dac", 30], ["sua_tuoi", 60]]),
  "cafe den nong": R([["cf_phin", 20]]),
  "cafe muoi": R([["cf_phin", 20], ["sua_dac", 25], ["kem_beo", 30], ["sua_tuoi", 10], ["muoi", 1]]),
  "espresso": R([["cf_espresso", 18]]),
  "americano": R([["cf_espresso", 18]]),
  "cold brew nguyen ban": R([["cf_coldbrew", 25]]),
  "cold brew cam": R([["cf_coldbrew", 20], ["cam", 200], ["duong", 10]]),
  "0210 mo brew": R([["cf_coldbrew", 20], ["mo_ngam", 30]]),
  "tra da": R([["tra_da", 2]]),
  "am tra moc": R([["tra_moc", 8]]),
  "tra tui loc": R([["tra_tui", 1]]),
  "tra chanh nha dam": R([["tra_da", 3], ["chanh", 30], ["duong", 25], ["nha_dam", 40]]),
  "nuoc ep dua hau": R([["dua_hau", 400], ["duong", 10]]),
  "nuoc ep cam": R([["cam", 500]]),
  "bun ga 40": R([["bun_tuoi", 200], ["ga_ta_loc", 100], ["rau_thom", 20]]),
  "bun ga 50": R([["bun_tuoi", 200], ["ga_ta_loc", 150], ["rau_thom", 20]]),
  "canh ga": R([["canh_ga", 200], ["dau_an", 30]]),
  "dui ga": R([["dui_ga", 350]]),
  "bit tet": R([["thit_bo", 150], ["pate", 30], ["trung", 1], ["banh_mi", 1], ["bo_lat", 10]]),
  "banh mi trung": R([["banh_mi", 1], ["trung", 2], ["dau_an", 10]]),
  "banh mi bo sua": R([["banh_mi", 1], ["bo_lat", 15], ["sua_dac", 20]]),
  "khoai tay chien": R([["khoai_tay", 200], ["dau_an", 50], ["muoi", 2]]),
  "com ga chien mam": R([["gao", 120], ["dui_ga", 200], ["nuoc_mam", 15], ["duong", 10], ["toi", 5], ["dua_chuot", 50]]),
  "com bo sot tieu": R([["gao", 120], ["thit_bo", 150], ["sot_tieu", 30], ["hanh_tay", 50]]),
  "banh mi them": R([["banh_mi", 1]]),
  "trung chan": R([["trung", 1]]),
  "trung op la": R([["trung", 1], ["dau_an", 5]]),
  "bun banh da khong nhan": R([["bun_tuoi", 200]]),
};
export const draftRecipeFor = (menuName) => (DRAFT_RECIPES[normalizeText(menuName)] || []).map((l) => ({ ...l }));
export const groupLabelForMaterial = (m) => groupLabelOf(m.group);

/**
 * Nhập so với định mức trong [from, to): lượng mua (đổi ra đơn vị định lượng, chỉ phiếu chi tiết)
 * so với lượng lẽ ra phải dùng = định mức mỗi ngày × số ngày. ratio > 1 là mua nhiều hơn định mức (hao hụt, tồn kho tăng);
 * < 1 là mua ít hơn (dùng tồn kho cũ, hoặc định mức đang đặt cao). Đồ khô mua theo tuần cần khoảng dài mới đúng.
 */
export const usageVsPurchase = ({ receipts, usagePerDay, from, to }) => {
  const days = Math.max(1, Math.round((to - from) / 86400000));
  const bought = {};
  for (const r of Array.isArray(receipts) ? receipts : []) {
    if (!r || r.status === "DELETED" || r.status === "CANCELLED" || isSummaryReceipt(r)) continue;
    const at = Number(r.purchaseDate || 0);
    if (at < from || at >= to) continue;
    for (const l of r.items || []) {
      const m = matchMaterial(l);
      const f = m && unitFactor(m, l.unit);
      if (!m || !f) continue;
      bought[m.id] = (bought[m.id] || 0) + Number(l.qty || 0) * f;
    }
  }
  const ids = new Set([...Object.keys(bought), ...Object.keys(usagePerDay || {}).filter((k) => usagePerDay[k] > 0)]);
  return [...ids].filter((id) => materialById.has(id)).map((id) => {
    const expected = (usagePerDay?.[id] || 0) * days;
    const got = bought[id] || 0;
    return { materialId: id, name: materialById.get(id).name, base: materialById.get(id).base, expected, bought: got, ratio: expected > 0 ? got / expected : null };
  }).sort((a, b) => (a.ratio === null) - (b.ratio === null) || Math.abs((b.ratio ?? 1) - 1) - Math.abs((a.ratio ?? 1) - 1) || a.name.localeCompare(b.name));
};
