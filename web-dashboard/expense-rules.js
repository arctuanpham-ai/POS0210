// Quy tắc phân nhóm vật tư theo từ khoá, mã vật tư ổn định và quy đổi đơn vị.
// Hàm thuần: không đọc Firebase, không có DOM. Quy tắc mặc định khớp theo TÊN NGUYÊN LIỆU mua vào (ít đổi hơn menu);
// quy tắc "đã học" do người nhập tạo ra và dùng chung qua Firestore (collection expenseRules).

export const MATERIAL_GROUPS = [
  ["THIT", "Thịt, gia cầm"], ["RAU", "Rau, củ, quả"], ["BUN", "Bún, bánh đa, tinh bột"], ["BANH", "Bánh mì, nguyên liệu bánh"],
  ["SUA", "Trứng, sữa, bơ"], ["GIAVI", "Gia vị, nước dùng"], ["CAPHE", "Cà phê"], ["TRA", "Trà, nguyên liệu pha trà"],
  ["MUT", "Siro, mứt, nguyên liệu bổ sung"], ["NUOC", "Đồ uống đóng chai"], ["DA", "Đá, nước tinh khiết"],
  ["BAOBI", "Bao bì, vật tư phục vụ"], ["VESINH", "Vệ sinh, vật tư tiêu hao"], ["KHAC", "Vật tư khác"],
];

const GROUP_CODES = new Set(MATERIAL_GROUPS.map(([code]) => code));

/** Mã nhóm từ mã hoặc nhãn; không nhận ra thì null (khác groupCodeOf của app: không tự rơi về KHAC). */
export const groupCodeOrNull = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const found = MATERIAL_GROUPS.find(([code, label]) => code === text || label === text);
  return found ? found[0] : null;
};
export const groupLabelOf = (code) => MATERIAL_GROUPS.find(([c]) => c === code)?.[1] || "Vật tư khác";

/** Bỏ dấu, viết thường, gộp khoảng trắng. */
export const normalizeText = (value) =>
  String(value ?? "").toLocaleLowerCase("vi").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

// Từ khoá không dấu. Một từ khoá có thể thuộc nhiều nhóm: khi đó là "mơ hồ", bắt buộc người nhập chọn.
const D = (group, words) => words.map((w) => ({ keyword: w, groups: [group] }));
export const DEFAULT_RULES = [
  ...D("THIT", ["thit", "heo", "lon", "ba chi", "suon", "nac vai", "ga", "vit", "xuc xich", "cha lua", "gio lua", "pate", "lap xuong", "thit bo", "bap bo"]),
  ...D("RAU", ["rau", "cu", "qua", "hanh", "toi", "ot", "gung", "sa", "chanh", "quat", "cai", "xa lach", "dua leo", "ca chua", "khoai", "ngo", "hanh la", "rau muong"]),
  ...D("BUN", ["bun", "banh da", "banh pho", "mien", "nui", "gao", "xoi", "hu tieu"]),
  ...D("BANH", ["banh mi", "vo banh", "bot mi", "men", "bot nang", "bot banh"]),
  ...D("SUA", ["trung", "sua", "kem", "phomai", "pho mai", "whipping", "sua dac", "sua tuoi", "bo lat", "bo thuc vat"]),
  ...D("GIAVI", ["muoi", "duong", "nuoc mam", "tieu", "hat nem", "bot ngot", "dau an", "nuoc tuong", "tuong ot", "giam", "bot canh", "nuoc dung", "xuong ham"]),
  ...D("CAPHE", ["ca phe", "caphe", "cafe", "coffee", "robusta", "arabica", "culi"]),
  ...D("TRA", ["tra", "tra o long", "tra xanh", "hong tra", "tra tui loc", "matcha", "hoa cuc"]),
  ...D("MUT", ["siro", "syrup", "mut", "sot", "topping", "tran chau", "thach", "nha dam"]),
  ...D("NUOC", ["nuoc ngot", "coca", "pepsi", "7up", "bia", "nuoc suoi", "aquafina", "lavie", "red bull", "soda", "nuoc tang luc"]),
  ...D("DA", ["da", "da vien", "da bi", "da cay", "nuoc tinh khiet", "binh nuoc"]),
  ...D("BAOBI", ["ly", "coc", "ong hut", "nap", "tui", "hop", "khay", "muong nhua", "dua dung mot lan", "giay goi", "mang boc", "bao bi", "tem", "quai xach"]),
  ...D("VESINH", ["nuoc rua chen", "nuoc lau san", "xa phong", "giay ve sinh", "khan giay", "khan lau", "gang tay", "bao rac", "tui rac", "nuoc rua tay", "bot giat", "javel"]),
  // Từ dễ nhầm sau khi bỏ dấu: "bò" và "bơ" đều thành "bo"; "dầu ăn"/"đá" vẫn tách được nhờ cụm dài hơn.
  { keyword: "bo", groups: ["THIT", "SUA"] },
];

/** Danh sách token (mảng) tìm thấy liên tiếp trong tokens. */
const containsSequence = (tokens, seq) => {
  if (!seq.length || seq.length > tokens.length) return false;
  for (let i = 0; i <= tokens.length - seq.length; i += 1) {
    let ok = true;
    for (let j = 0; j < seq.length; j += 1) if (tokens[i + j] !== seq[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
};

/**
 * Gợi ý nhóm cho một tên vật tư.
 * Thứ tự ưu tiên: tên đã học chính xác > từ khoá do người dùng thêm > từ khoá mặc định (cụm dài thắng cụm ngắn).
 * learned: [{ name (đã chuẩn hoá), group (mã), keyword? }] từ Firestore.
 * Trả về { status: "learned" | "matched" | "ambiguous" | "none", group, groups, matched }.
 */
export const classifyMaterial = (name, learned = []) => {
  const normalized = normalizeText(name);
  if (!normalized) return { status: "none", group: null, groups: [], matched: "" };
  const exact = learned.find((rule) => !rule.keyword && normalizeText(rule.name) === normalized && GROUP_CODES.has(rule.group));
  if (exact) return { status: "learned", group: exact.group, groups: [exact.group], matched: normalized };
  const tokens = normalized.split(" ");
  const candidates = [
    ...learned.filter((rule) => rule.keyword && GROUP_CODES.has(rule.group)).map((rule) => ({ keyword: normalizeText(rule.keyword), groups: [rule.group], bonus: 1000 })),
    ...DEFAULT_RULES.map((rule) => ({ ...rule, bonus: 0 })),
  ];
  let best = null;
  const winners = [];
  for (const rule of candidates) {
    const seq = rule.keyword.split(" ").filter(Boolean);
    if (!containsSequence(tokens, seq)) continue;
    const score = rule.bonus + seq.length * 100 + rule.keyword.length;
    if (!best || score > best) { best = score; winners.length = 0; }
    if (score === best) winners.push(rule);
  }
  if (!winners.length) return { status: "none", group: null, groups: [], matched: "" };
  const groups = [...new Set(winners.flatMap((rule) => rule.groups))];
  const matched = winners[0].keyword;
  return groups.length === 1 ? { status: "matched", group: groups[0], groups, matched } : { status: "ambiguous", group: null, groups, matched };
};

// FNV-1a 32 bit với hai hạt giống khác nhau, ghép thành 12 ký tự hex.
const fnv = (text, seed) => {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash.toString(16).padStart(8, "0");
};
/** Mã ổn định theo tên: cùng tên (sau chuẩn hoá) và cùng nhóm luôn ra cùng mã, trên mọi thiết bị. Dạng NHOM-XXXXXXXXXXXX. */
export const materialCodeFor = (groupCode, name) => {
  const normalized = normalizeText(name);
  return `${groupCode}-${(fnv(normalized, 2166136261) + fnv(normalized, 3735928559)).slice(0, 12).toUpperCase()}`;
};
/** Id tài liệu quy tắc đã học: ổn định theo tên chuẩn hoá. */
export const ruleIdFor = (name) => `r_${fnv(normalizeText(name), 2166136261)}${fnv(normalizeText(name), 3735928559)}`;

const UNIT_FACTORS = { lạng: ["kg", 0.1], lang: ["kg", 0.1], gam: ["kg", 0.001], g: ["kg", 0.001], kg: ["kg", 1], ml: ["lít", 0.001], lít: ["lít", 1], l: ["lít", 1] };
/** Quy đổi về đơn vị gốc để cộng và so giá: gam→kg, ml→lít; đơn vị khác giữ nguyên. */
export const normalizeQuantity = (qty, unit) => {
  const u = String(unit ?? "").trim().toLocaleLowerCase("vi");
  const factor = UNIT_FACTORS[u];
  const value = Number(qty || 0);
  if (!factor) return { baseQty: value, baseUnit: String(unit ?? "").trim() };
  return { baseQty: Math.round(value * factor[1] * 1e6) / 1e6, baseUnit: factor[0] };
};

/** Nhóm cần học: dòng người nhập chọn khác gợi ý, hoặc không có gợi ý rõ ràng. Trả về quy tắc tên→nhóm. */
export const rulesToLearn = (lines, learned = []) => {
  const out = new Map();
  for (const line of lines) {
    const name = normalizeText(line.materialName);
    const group = groupCodeOrNull(line.expenseGroup);
    if (!name || !group) continue;
    const suggestion = classifyMaterial(line.materialName, learned);
    if (suggestion.status === "matched" && suggestion.group === group) continue;
    if (suggestion.status === "learned" && suggestion.group === group) continue;
    out.set(name, { id: ruleIdFor(name), name, group });
  }
  return [...out.values()];
};

/** Rà soát các dòng đã lưu so với quy tắc hiện tại. status: ok | mismatch | ambiguous | unmatched. */
export const reviewItems = (receipts, learned = []) => {
  const rows = [];
  for (const receipt of Array.isArray(receipts) ? receipts : []) {
    if (receipt.status === "DELETED" || isSummaryReceipt(receipt)) continue; // phiếu tổng không có tên vật tư để khớp quy tắc
    for (const item of receipt.items || []) {
      const stored = groupCodeOrNull(item.materialGroup) || groupCodeOrNull(item.expenseGroup) || (String(item.materialCode || "").includes("-") ? groupCodeOrNull(String(item.materialCode).split("-")[0]) : null);
      const suggestion = classifyMaterial(item.materialName, learned);
      let status;
      if (suggestion.status === "ambiguous") status = "ambiguous";
      else if (suggestion.status === "none") status = "unmatched";
      else status = stored && stored === suggestion.group ? "ok" : "mismatch";
      rows.push({
        receiptId: String(receipt.id ?? ""), date: Number(receipt.purchaseDate || 0), name: String(item.materialName ?? ""),
        stored, suggested: suggestion.group, candidates: suggestion.groups, matched: suggestion.matched, amount: Number(item.amount ?? (Number(item.qty || 0) * Number(item.unitPrice || 0))), status,
      });
    }
  }
  return rows;
};

export const summarizeReview = (rows) => {
  const count = (status) => rows.filter((r) => r.status === status).length;
  const total = rows.length;
  const ok = count("ok");
  return { total, ok, mismatch: count("mismatch"), ambiguous: count("ambiguous"), unmatched: count("unmatched"), okRate: total ? ok / total : null };
};

// ---------- Phiếu tổng (hóa đơn cũ chưa có chi tiết) ----------
// Dòng phiếu tổng giữ đúng khuôn mà app Android chấp nhận (tên, SL > 0, đơn vị, SL × đơn giá = thành tiền)
// nhưng mang cờ kind = SUMMARY_LINE và phiếu mang detailLevel = SUMMARY, nên phân tích giá/khối lượng theo vật tư phải bỏ qua.
export const DETAIL_SUMMARY = "SUMMARY";
export const DETAIL_ITEMIZED = "ITEMIZED";
export const SUMMARY_LINE_KIND = "SUMMARY_LINE";

export const isSummaryReceipt = (receipt) =>
  receipt?.detailLevel === DETAIL_SUMMARY || (Array.isArray(receipt?.items) && receipt.items.length > 0 && receipt.items.every((item) => item.kind === SUMMARY_LINE_KIND));

/** Dòng nhập vào: { group (mã hoặc nhãn), amount, note? }. Trả về các dòng phiếu đúng khuôn. */
export const buildSummaryLines = (lines, createId) => lines.map((line, index) => {
  const code = groupCodeOrNull(line.group);
  const label = groupLabelOf(code);
  const amount = Math.round(Number(line.amount || 0));
  return {
    id: line.id || createId(index),
    materialName: `Tổng hợp · ${label}`,
    materialCode: "",
    expenseGroup: label,
    materialGroup: label,
    qty: 1,
    unit: "lần",
    unitPrice: amount,
    amount,
    kind: SUMMARY_LINE_KIND,
    note: String(line.note ?? "").trim(),
  };
});

export const validateSummaryReceipt = ({ purchaseDate, lines }) => {
  if (!Number.isFinite(Number(purchaseDate)) || Number(purchaseDate) <= 0) return { ok: false, error: "Ngày mua không hợp lệ" };
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, error: "Phiếu chưa có dòng nào" };
  for (const [index, line] of lines.entries()) {
    const n = index + 1;
    if (!groupCodeOrNull(line.group)) return { ok: false, error: `Dòng ${n}: hãy chọn nhóm` };
    const amount = Number(line.amount);
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount) !== amount) return { ok: false, error: `Dòng ${n}: số tiền phải là số nguyên lớn hơn 0` };
  }
  return { ok: true, total: lines.reduce((sum, line) => sum + Number(line.amount), 0) };
};

/** Chênh lệch giữa tổng phiếu tổng gốc và tổng các dòng chi tiết nhập thay thế. */
export const detailGap = (summaryTotal, itemizedTotal) => {
  const difference = Math.round(Number(itemizedTotal || 0) - Number(summaryTotal || 0));
  return { difference, matches: difference === 0 };
};

/** Ngày mốc bắt buộc chi tiết: chưa đặt (null/NaN/0) thì không bắt buộc gì. */
export const detailRequired = (purchaseDate, cutoffAt) => {
  const cutoff = Number(cutoffAt);
  return Number.isFinite(cutoff) && cutoff > 0 && Number(purchaseDate) >= cutoff;
};

/** Thống kê mức chi tiết của các phiếu còn hiệu lực. */
export const detailLevelSummary = (receipts) => {
  const live = (Array.isArray(receipts) ? receipts : []).filter((r) => r.status !== "DELETED");
  const summary = live.filter(isSummaryReceipt);
  const sum = (list) => list.reduce((s, r) => s + Number(r.total || 0), 0);
  return { total: live.length, summaryCount: summary.length, itemizedCount: live.length - summary.length, summaryAmount: sum(summary), itemizedAmount: sum(live) - sum(summary) };
};
