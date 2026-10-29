// Danh mục vật tư chuẩn, giá vốn từ phiếu chi chi tiết và giá vốn món từ công thức. Hàm thuần, không Firebase, không DOM.
import { normalizeText, isSummaryReceipt, groupLabelOf } from "./expense-rules.js?v=20261029-12";

export const KIND_LABELS = { NL: "Nguyên liệu", BB: "Bao bì theo món", VH: "Vận hành" };

// [id, tên, nhóm, loại chi, đơn vị định lượng, [[đơn vị mua, quy đổi ra đơn vị định lượng], ...], [tên gọi khác]]
const M = (id, name, group, kind, base, units, aliases = []) => ({ id, name, group, kind, base, units: units.map(([unit, per]) => ({ unit, per })), aliases });
const W = [["kg", 1000], ["g", 1]];
const V = [["lít", 1000], ["ml", 1]];
export const MATERIALS = [
  M("cf_phin", "Cà phê hạt pha phin", "CAPHE", "NL", "g", W, ["ca phe phin", "cafe phin", "robusta"]),
  M("cf_espresso", "Cà phê hạt espresso", "CAPHE", "NL", "g", W, ["espresso"]),
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
  M("da_vien", "Đá viên", "DA", "NL", "g", W, ["da vien", "da"]), // mua theo kg (trước đây tính theo bao nên phiếu ghi kg không quy đổi được)
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
/** Danh mục chuẩn gốc: quy tắc ghép tên / tên gọi khác chỉ áp cho nhóm này. Vật tư động (từ phiếu chi) thêm vào MATERIALS sau. */
const STATIC_MATERIALS = MATERIALS.slice();
export const materialById = new Map(MATERIALS.map((m) => [m.id, m]));

/** Quy tắc nhóm theo đúng tên vật tư chuẩn, để ô nhóm tự điền khi chọn từ danh mục. */
export const catalogRules = MATERIALS.map((m) => ({ name: normalizeText(m.name), group: m.group }));

/** Vật tư chuẩn của một dòng phiếu: theo materialId nếu có, rồi tên trùng, rồi tên gọi khác dài nhất có trong tên. */
export const matchMaterial = (line) => {
  if (line?.materialId && materialById.has(line.materialId) && !materialById.get(line.materialId).dynamic) return materialById.get(line.materialId);
  const name = normalizeText(line?.materialName);
  if (!name) return null;
  const exact = STATIC_MATERIALS.find((m) => normalizeText(m.name) === name);
  if (exact) return exact;
  let best = null, bestLen = 0;
  const padded = ` ${name} `;
  for (const m of STATIC_MATERIALS) for (const a of m.aliases) {
    const n = normalizeText(a);
    if (n && padded.includes(` ${n} `) && n.length > bestLen) { best = m; bestLen = n.length; }
  }
  return best;
};

/* ---------- Vật tư động: tên thật trên phiếu chi đã duyệt (sát thực tế hơn danh mục chuẩn) ---------- */
const WEIGHT_UNITS = { lang: 100, kg: 1000, g: 1, gam: 1, gram: 1, gr: 1, kilogram: 1000, kilo: 1000 };
const VOLUME_UNITS = { lit: 1000, l: 1000, ml: 1 };
/** Đơn vị định lượng suy ra từ đơn vị mua: cân nặng -> g, thể tích -> ml, còn lại giữ nguyên đơn vị. */
export const dynamicBase = (unit) => {
  const u = normalizeText(unit);
  if (!u) return null;
  if (u in WEIGHT_UNITS) return { base: "g", factor: WEIGHT_UNITS[u] };
  if (u in VOLUME_UNITS) return { base: "ml", factor: VOLUME_UNITS[u] };
  return { base: String(unit).trim().toLocaleLowerCase("vi"), factor: 1 };
};
export const dynamicIdOf = (name) => `rm:${normalizeText(name).replace(/ /g, "_")}`;
const STATIC_NAME_KEYS = new Set(STATIC_MATERIALS.map((m) => normalizeText(m.name)));
/** Vật tư động của một dòng phiếu: có tên và KHÔNG trùng đúng tên vật tư chuẩn (trùng đúng tên thì dùng vật tư chuẩn). */
const dynamicFor = (line) => {
  if (line?.materialId && materialById.has(line.materialId) && !materialById.get(line.materialId).dynamic) return null;
  const key = normalizeText(line?.materialName);
  if (!key || STATIC_NAME_KEYS.has(key)) return null;
  return { id: dynamicIdOf(line.materialName), key };
};
/** Các vật tư mà một dòng phiếu được tính vào: vật tư chuẩn (theo quy tắc cũ) và/hoặc vật tư động theo đúng tên dòng. */
export const lineTargets = (line) => {
  const out = [];
  const m = matchMaterial(line);
  if (m) out.push({ id: m.id, factor: unitFactor(m, line.unit), base: m.base });
  const d = dynamicFor(line);
  if (d) { const b = dynamicBase(line.unit); out.push({ id: d.id, factor: b ? b.factor : null, base: b ? b.base : null, dynamic: true }); }
  return out;
};
const BAOBI_LABEL = normalizeText(groupLabelOf("BAOBI"));
/**
 * Danh sách vật tư động từ phiếu chi (đã lọc phiếu hợp lệ) và từ dòng công thức đã lưu (để công thức cũ vẫn có tên khi phiếu không còn).
 * Mỗi tên (không dấu) là một vật tư riêng: hãng khác, giá khác thì người nhập đặt tên khác.
 */
export const buildDynamicMaterials = (receipts, recipeLines = []) => {
  const map = new Map();
  for (const r of Array.isArray(receipts) ? receipts : []) {
    if (!r || r.status === "DELETED" || r.status === "CANCELLED" || isSummaryReceipt(r)) continue;
    const at = Number(r.purchaseDate || 0);
    for (const line of r.items || []) {
      const d = dynamicFor(line);
      const b = dynamicBase(line.unit);
      if (!d || !b || !(Number(line.qty) > 0)) continue;
      const cur = map.get(d.id);
      if (cur && cur.base !== b.base) continue;
      const label = String(line.expenseGroup || line.materialGroup || "").trim();
      if (!cur) map.set(d.id, { id: d.id, name: String(line.materialName).trim(), group: null, groupLabel: label, kind: normalizeText(label) === BAOBI_LABEL ? "BB" : "NL", base: b.base, units: [{ unit: b.base === "g" ? "kg" : b.base === "ml" ? "lít" : b.base, per: b.base === "g" || b.base === "ml" ? 1000 : 1 }, { unit: b.base, per: 1 }], aliases: [], dynamic: true, at, lastUnit: String(line.unit || "").trim() });
      else if (at >= cur.at) Object.assign(cur, { name: String(line.materialName).trim(), at, lastUnit: String(line.unit || "").trim(), groupLabel: label || cur.groupLabel });
    }
  }
  for (const l of recipeLines) {
    if (!l || !String(l.materialId || "").startsWith("rm:") || map.has(l.materialId)) continue;
    const base = l.base || "g";
    map.set(l.materialId, { id: l.materialId, name: String(l.name || l.materialId.slice(3).replace(/_/g, " ")), group: null, groupLabel: "", kind: "NL", base, units: [{ unit: base, per: 1 }], aliases: [], dynamic: true, at: 0, lastUnit: base, stub: true });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
};
/** Cập nhật MATERIALS / materialById tại chỗ để mọi nơi dùng danh mục thấy cả vật tư động. */
export const registerDynamicMaterials = (list) => {
  for (let i = MATERIALS.length - 1; i >= 0; i--) if (MATERIALS[i].dynamic) { materialById.delete(MATERIALS[i].id); MATERIALS.splice(i, 1); }
  for (const m of list) { MATERIALS.push(m); materialById.set(m.id, m); }
};

const GENERIC_TOKENS = new Set(["ca", "phe", "hat", "loai", "tuoi", "100", "kg", "goi", "hop"]);
const tokensOf = (name) => normalizeText(name).split(" ").filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
const groupKeyOf = (m) => normalizeText(m.dynamic ? m.groupLabel : groupLabelOf(m.group));
/**
 * Vật tư có thể trùng loại với `id`: cùng đơn vị định lượng, cùng nhóm, và (một trong hai là tên thật từ phiếu chi, hoặc có chung từ khoá).
 * Dùng để buộc người chỉnh công thức xác nhận đúng loại vật tư tại thời điểm cập nhật.
 */
export const similarMaterials = (id) => {
  const x = materialById.get(id);
  if (!x || x.kind === "VH") return [];
  const gx = groupKeyOf(x);
  const tx = new Set(tokensOf(x.name));
  return MATERIALS.filter((y) => y.id !== id && y.kind !== "VH" && !y.stub && y.base === x.base && gx && groupKeyOf(y) === gx
    && (x.dynamic || y.dynamic || tokensOf(y.name).some((t) => tx.has(t)))).slice(0, 8);
};

const UNIT_ALIASES = { gam: "g", gram: "g", gr: "g", kilogram: "kg", kilo: "kg", lit: "lít", l: "lít", lít: "lít", "lit ": "lít" };
/** Số đơn vị định lượng trong một đơn vị mua, null nếu đơn vị không quy đổi được. */
export const unitFactor = (material, unit) => {
  const u = normalizeText(unit);
  if (u === "lang") { const g = material.units.find((x) => normalizeText(x.unit) === "g"); return g ? g.per * 100 : null; } // 1 lạng = 100 g = 0,1 kg
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
  const unmatched = [];
  for (const r of Array.isArray(receipts) ? receipts : []) {
    if (!r || r.status === "DELETED" || r.status === "CANCELLED" || isSummaryReceipt(r)) continue;
    const at = Number(r.purchaseDate || 0);
    for (const line of r.items || []) {
      const qty = Number(line.qty || 0);
      const amount = Number(line.amount ?? qty * Number(line.unitPrice || 0));
      const targets = lineTargets(line);
      if (!targets.length) { if (qty > 0 && amount > 0 && String(line?.materialName || "").trim()) unmatched.push({ name: String(line.materialName).trim(), qty, unit: line.unit || "", amount, receiptId: r.id, code: r.code || "", at }); continue; }
      if (!(qty > 0) || !(amount > 0)) continue;
      for (const t of targets) {
        const f = t.factor;
        if (!f) { unconvertible.push({ materialId: t.id, name: line.materialName, unit: line.unit, receiptId: r.id }); continue; }
        const a = acc.get(t.id) || { inWindowAmount: 0, inWindowQty: 0, last: null, buys: 0, srcs: [], base: t.base };
        if (a.base && t.base && a.base !== t.base) { unconvertible.push({ materialId: t.id, name: line.materialName, unit: line.unit, receiptId: r.id }); continue; }
        a.srcs.push({ receiptId: r.id, code: r.code || "", at, name: String(line.materialName || ""), unitCost: amount / (qty * f) });
        const baseQty = qty * f;
        if (at >= from) { a.inWindowAmount += amount; a.inWindowQty += baseQty; }
        if (!a.last || at > a.last.at) a.last = { at, unitCost: amount / baseQty };
        a.buys += 1;
        acc.set(t.id, a);
      }
    }
  }
  const out = {};
  for (const [id, a] of acc) {
    const avg = a.inWindowQty > 0 ? a.inWindowAmount / a.inWindowQty : null;
    out[id] = { unitCost: avg ?? a.last.unitCost, source: avg !== null ? `bình quân ${windowDays} ngày` : "lần mua gần nhất", lastAt: a.last.at, lastUnitCost: a.last.unitCost, buys: a.buys, sources: a.srcs.sort((x, y) => y.at - x.at).slice(0, 4) };
  }
  return { costs: out, unconvertible, unmatched };
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
      for (const t of lineTargets(l)) {
        if (!t.factor) continue;
        const reg = materialById.get(t.id);
        if (t.dynamic && reg && reg.base !== t.base) continue;
        bought[t.id] = (bought[t.id] || 0) + Number(l.qty || 0) * t.factor;
      }
    }
  }
  const ids = new Set([...Object.keys(bought), ...Object.keys(usagePerDay || {}).filter((k) => usagePerDay[k] > 0)]);
  return [...ids].filter((id) => materialById.has(id)).map((id) => {
    const expected = (usagePerDay?.[id] || 0) * days;
    const got = bought[id] || 0;
    return { materialId: id, name: materialById.get(id).name, base: materialById.get(id).base, expected, bought: got, ratio: expected > 0 ? got / expected : null };
  }).sort((a, b) => (a.ratio === null) - (b.ratio === null) || Math.abs((b.ratio ?? 1) - 1) - Math.abs((a.ratio ?? 1) - 1) || a.name.localeCompare(b.name));
};
