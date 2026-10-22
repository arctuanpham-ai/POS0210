// Bộ phiếu chi DEMO để chạy thử quy trình tài chính trước khi nhập thật.
// Mọi phiếu mang demo:true + demoBatch, nằm trong collection riêng demoExpenseReceipts (máy POS không đọc),
// nên xoá hết sau khi thử mà không đụng dữ liệu thật. Hàm thuần: không Firebase, không DOM.
import { normalizeText, groupLabelOf, materialCodeFor, buildSummaryLines } from "./expense-rules.js?v=20261021-07";
import { materialById, draftRecipeFor } from "./cost-recipe.js?v=20261021-07";

export const DEMO_COLLECTION = "demoExpenseReceipts";

/** Lượng bán mỗi ngày giả định khi chưa có dữ liệu bán thật. Tên món theo menu quán. */
export const DEFAULT_DAILY_SALES = {
  "den da": 14, "cafe sua": 18, "bac xiu": 12, "cafe muoi": 10, "cafe den nong": 3, "espresso": 2, "americano": 3,
  "cold brew nguyen ban": 3, "cold brew cam": 3, "0210 mo brew": 3, "tra da": 25, "am tra moc": 2, "tra tui loc": 2,
  "tra chanh nha dam": 6, "nuoc ep dua hau": 5, "nuoc ep cam": 4, "bun ga 40": 14, "bun ga 50": 9, "canh ga": 3,
  "dui ga": 1, "bit tet": 6, "banh mi trung": 5, "banh mi bo sua": 2, "khoai tay chien": 3, "com ga chien mam": 6,
  "com bo sot tieu": 4, "banh mi them": 4, "trung chan": 2, "trung op la": 2,
};

// Hao hụt giả định (đồ tươi hỏng, làm dư) để màn "nhập so với định mức" có cái mà soi.
export const DEMO_WASTE = { rau_thom: 1.25, dua_hau: 1.15, cam: 1.1, chanh: 1.12, thit_bo: 1.12, ga_ta_loc: 1.08, banh_mi: 1.1, bun_tuoi: 1.1, dua_chuot: 1.15, ca_chua: 1.15 };
// Giá mỗi đơn vị MUA, quy cách mua và bước làm tròn số lượng.
const BUY = {
  cf_phin: ["kg", 280000, 0.5], cf_espresso: ["kg", 420000, 0.5], cf_coldbrew: ["kg", 600000, 0.5],
  sua_dac: ["hộp", 28000, 1], sua_tuoi: ["hộp", 36000, 1], kem_beo: ["hộp", 120000, 1], bo_lat: ["kg", 250000, 0.5], trung: ["vỉ", 35000, 1],
  tra_moc: ["kg", 400000, 0.5], tra_da: ["kg", 150000, 0.5], tra_tui: ["hộp", 45000, 1], mo_ngam: ["kg", 120000, 0.5], nha_dam: ["kg", 60000, 0.5],
  cam: ["kg", 35000, 0.5], dua_hau: ["kg", 18000, 0.5], chanh: ["kg", 30000, 0.1], rau_thom: ["kg", 40000, 0.1], dua_chuot: ["kg", 20000, 0.1],
  ca_chua: ["kg", 25000, 0.1], hanh_tay: ["kg", 25000, 0.1], khoai_tay: ["kg", 70000, 0.5],
  ga_ta_loc: ["kg", 220000, 0.1], canh_ga: ["kg", 90000, 0.1], dui_ga: ["kg", 95000, 0.1], thit_bo: ["kg", 260000, 0.1], moc: ["kg", 180000, 0.1], pate: ["kg", 150000, 0.5],
  bun_tuoi: ["kg", 15000, 0.5], banh_da: ["kg", 30000, 0.5], gao: ["kg", 22000, 1], banh_mi: ["cái", 4000, 1],
  duong: ["kg", 24000, 1], muoi: ["kg", 8000, 1], nuoc_mam: ["chai", 45000, 1], tieu: ["kg", 300000, 0.1], hat_nem: ["kg", 90000, 0.5],
  toi: ["kg", 60000, 0.1], dau_an: ["can", 230000, 1], sot_tieu: ["kg", 120000, 0.5], hat_huong_duong: ["kg", 120000, 0.5], hat_dua: ["kg", 180000, 0.5],
};
// Nơi mua, người đi mua và chu kỳ (ngày). Đúng thói quen quán nhỏ: chợ hằng ngày, đại lý theo tuần.
const SUPPLIERS = [
  { name: "Chợ sáng", payer: "Demo · Hương", every: 1, offset: 0, items: ["rau_thom", "chanh", "dua_chuot", "ca_chua", "ga_ta_loc", "bun_tuoi"] },
  { name: "Chợ sáng (thịt, trái cây)", payer: "Demo · Hương", every: 2, offset: 0, items: ["thit_bo", "canh_ga", "dui_ga", "cam", "dua_hau", "hanh_tay", "toi"] },
  { name: "Lò bánh mì", payer: "Demo · Hương", every: 1, offset: 0, items: ["banh_mi"] },
  { name: "Đại lý trứng", payer: "Demo · Hương", every: 3, offset: 1, items: ["trung"] },
  { name: "Đại lý cà phê", payer: "Demo · Tuấn", every: 7, offset: 2, items: ["cf_phin", "cf_espresso", "cf_coldbrew"] },
  { name: "Siêu thị", payer: "Demo · Tuấn", every: 7, offset: 4, items: ["sua_dac", "sua_tuoi", "kem_beo", "bo_lat", "pate", "mo_ngam", "nha_dam", "tra_moc", "tra_da", "tra_tui", "duong", "muoi", "nuoc_mam", "tieu", "hat_nem", "dau_an", "sot_tieu", "khoai_tay", "gao", "hat_huong_duong", "hat_dua"] },
];

const mulberry32 = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const roundTo = (x, step) => Math.round(x / step) * step;
const round100 = (x) => Math.max(100, Math.round(x / 100) * 100);
const fix = (x) => Math.round(x * 1000) / 1000;

/** Món combo trong snapshot ngày có dạng "COMBO · Tên [1×A + 2×B]": tách thành các món thành phần. */
export const expandComboName = (name, qty) => {
  const m = /\[(.*)\]\s*$/.exec(String(name || ""));
  if (!String(name || "").startsWith("COMBO") || !m) return [[name, qty]];
  return m[1].split("+").map((p) => /^\s*(\d+)\s*×\s*(.+?)\s*$/.exec(p)).filter(Boolean).map((x) => [x[2], Number(x[1]) * qty]);
};

/** Bán trung bình mỗi ngày theo tên món (không dấu), từ snapshot ngày có doanh thu. Rỗng nếu chưa có ngày nào. */
export const averageDailySales = (dailyDocs, keys) => {
  const days = keys.filter((k) => dailyDocs?.[k] && Number(dailyDocs[k].revenue || 0) > 0);
  const sum = {};
  for (const k of days) for (const it of dailyDocs[k].items || []) for (const [name, q] of expandComboName(it.name, Number(it.qty || 0))) {
    const key = normalizeText(name);
    sum[key] = (sum[key] || 0) + q;
  }
  return Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v / Math.max(1, days.length)]));
};

/** Vật tư dùng mỗi ngày theo định mức = Σ món bán × công thức. recipeFor(tênMón) trả danh sách {materialId, qty}. */
export const dailyMaterialUsage = (dailySales, recipeFor = draftRecipeFor) => {
  const usage = {};
  for (const [name, qty] of Object.entries(dailySales)) for (const l of recipeFor(name)) usage[l.materialId] = (usage[l.materialId] || 0) + Number(l.qty) * qty;
  return usage;
};

const line = (id, material, buyUnit, qty, unitPrice, extra = {}) => {
  const groupLabel = groupLabelOf(material.group);
  return { id, _g: material.group, materialName: material.name, materialCode: materialCodeFor(material.group, material.name), expenseGroup: groupLabel, materialGroup: groupLabel, qty: fix(qty), unit: buyUnit, unitPrice, amount: Math.round(fix(qty) * unitPrice), ...extra };
};

/**
 * Sinh phiếu chi demo trong `days` ngày gần nhất (kết thúc hôm nay).
 * - 3 ngày đầu là PHIẾU TỔNG (mô phỏng hoá đơn cũ không nhớ chi tiết), sau đó là phiếu chi tiết theo nơi mua.
 * - Số lượng mua = định mức × số ngày của chu kỳ × hao hụt, làm tròn theo quy cách mua; giá dao động ±4%, thịt bò tăng giá 10 ngày cuối.
 * - Có vài dòng LỖI CỐ Ý (ghi rõ trong ghi chú dòng) để kiểm tra màn rà soát: tên không dấu, đơn vị không quy đổi, tên mơ hồ, sai nhóm, vật tư lạ.
 */
export const buildDemoReceipts = ({ now = Date.now(), days = 30, dailySales = DEFAULT_DAILY_SALES, recipeFor = draftRecipeFor, seed = 210, batch = "demo", uid = "" } = {}) => {
  const rand = mulberry32(seed);
  const usage = dailyMaterialUsage(dailySales, recipeFor);
  const drinks = Object.entries(dailySales).filter(([n]) => /ca phe|cafe|bac xiu|espresso|americano|brew|tra|nuoc ep|den/.test(n)).reduce((s, [, q]) => s + q, 0);
  const food = Object.entries(dailySales).filter(([n]) => /bun|com|bit tet|banh mi|canh ga|dui ga|khoai/.test(n)).reduce((s, [, q]) => s + q, 0);
  const today = new Date(now);
  const receipts = [];
  let seq = 0;
  const nextId = () => `demo-${batch}-${String(++seq).padStart(4, "0")}`;
  const lineId = () => `${batch}-l${seq}-${Math.floor(rand() * 1e9).toString(36)}`;
  const quirks = new Set();
  for (let d = days - 1; d >= 0; d -= 1) {
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
    const dayIndex = days - 1 - d;
    const dayLines = [];
    for (const sup of SUPPLIERS) {
      if ((dayIndex + sup.offset) % sup.every !== 0) continue;
      const lines = [];
      for (const id of sup.items) {
        const m = materialById.get(id);
        const buy = BUY[id];
        if (!m || !buy || !(usage[id] > 0)) continue;
        const [unit, price, step] = buy;
        const per = m.units.find((u) => u.unit === unit)?.per ?? 1;
        const need = (usage[id] * sup.every * (DEMO_WASTE[id] ?? 1.04) * (0.9 + rand() * 0.2)) / per;
        const qty = Math.max(step, roundTo(need, step));
        const drift = id === "thit_bo" && d < 10 ? 1.12 : 1;
        lines.push(line(lineId(), m, unit, qty, round100(price * drift * (0.96 + rand() * 0.08))));
      }
      if (lines.length) dayLines.push({ sup, lines });
    }
    // Vận hành và bao bì: không theo công thức món.
    const ops = [];
    const push = (id, unit, qty, price) => { const m = materialById.get(id); if (m && qty > 0) ops.push(line(lineId(), m, unit, qty, round100(price))); };
    push("da_vien", "kg", Math.max(1, Math.round((drinks * 0.8) / 40)) * 20, 1250);
    if (dayIndex % 5 === 0) push("gas", "bình", 1, 480000);
    if (dayIndex % 2 === 0) push("nuoc_loc", "bình", 2, 18000);
    if (dayIndex % 7 === 3) { push("ly_nhua", "cây", Math.max(1, Math.ceil((drinks * 0.3 * 7) / 50)), 60000); push("ly_giay", "cây", 1, 75000); push("ong_hut", "cái", Math.ceil(drinks * 0.3 * 7 / 100) * 100, 200); push("hop_mang_ve", "cái", Math.ceil(food * 0.2 * 7 / 50) * 50, 2500); push("tui", "cái", 200, 500); push("giay_an", "gói", 10, 25000); }
    if (dayIndex % 14 === 6) push("nuoc_rua_chen", "can", 1, 65000);
    if (ops.length) dayLines.push({ sup: { name: "Vận hành, bao bì", payer: "Demo · Hương" }, lines: ops });

    const at = (h) => dayStart.getTime() + h * 3600000 + Math.floor(rand() * 40) * 60000;
    if (dayIndex < 3) {
      // Phiếu tổng: gộp theo nhóm, không có tên vật tư.
      const byGroup = {};
      for (const { lines } of dayLines) for (const l of lines) byGroup[l._g] = (byGroup[l._g] || 0) + l.amount;
      const items = buildSummaryLines(Object.entries(byGroup).map(([group, amount]) => ({ group, amount: Math.round(amount / 1000) * 1000 })).filter((x) => x.amount > 0), () => lineId());
      const id = nextId();
      receipts.push({ id, demo: true, demoBatch: batch, source: "DEMO", status: "ACTIVE", detailLevel: "SUMMARY", purchaseDate: at(8), createdAt: now, updatedAt: now, enteredByUid: uid, enteredByName: "Demo · Tuấn", note: "DEMO · Hoá đơn cũ (phiếu tổng)", items, total: items.reduce((s, x) => s + x.amount, 0) });
      continue;
    }
    for (const [i, { sup, lines }] of dayLines.entries()) {
      // Lỗi cố ý, mỗi loại một lần, để màn rà soát bắt được.
      if (sup.name === "Siêu thị" && !quirks.has("variant")) { const l = lines.find((x) => x.materialName === "Sữa đặc"); if (l) { l.materialName = "sua dac ong tho"; l.note = "DEMO lỗi cố ý: tên gõ không dấu"; quirks.add("variant"); } }
      if (sup.name === "Siêu thị" && quirks.has("variant") && !quirks.has("unit") && dayIndex > 10) { const l = lines.find((x) => x.materialName === "Gạo"); if (l) { l.qty = 1; l.unit = "bao"; l.unitPrice = 550000; l.amount = 550000; l.note = "DEMO lỗi cố ý: đơn vị 'bao' chưa quy đổi được"; quirks.add("unit"); } }
      if (sup.name === "Đại lý cà phê" && !quirks.has("group") && dayIndex > 5) { const l = lines.find((x) => x.materialName === "Cà phê hạt pha phin"); if (l) { l.expenseGroup = l.materialGroup = groupLabelOf("TRA"); l.note = "DEMO lỗi cố ý: chọn sai nhóm"; quirks.add("group"); } }
      if (sup.name === "Vận hành, bao bì" && !quirks.has("unknown") && lines.some((x) => x.materialName === "Giấy ăn")) { lines.push({ id: lineId(), materialName: "Khăn lau bàn", materialCode: materialCodeFor("KHAC", "Khăn lau bàn"), expenseGroup: groupLabelOf("KHAC"), materialGroup: groupLabelOf("KHAC"), qty: 10, unit: "cái", unitPrice: 8000, amount: 80000, note: "DEMO lỗi cố ý: vật tư chưa có trong danh mục" }); quirks.add("unknown"); }
      if (sup.name === "Siêu thị" && quirks.has("unit") && !quirks.has("ambiguous")) { const l = lines.find((x) => x.materialName === "Bơ lạt"); if (l) { l.materialName = "Bơ"; l.note = "DEMO lỗi cố ý: tên mơ hồ (bơ lạt hay quả bơ?)"; quirks.add("ambiguous"); } }
      const id = nextId();
      receipts.push({ id, demo: true, demoBatch: batch, source: "DEMO", status: "ACTIVE", detailLevel: "ITEMIZED", purchaseDate: at(7 + i), createdAt: now, updatedAt: now, enteredByUid: uid, enteredByName: sup.payer, note: `DEMO · ${sup.name}`, items: lines, total: lines.reduce((s, x) => s + x.amount, 0) });
    }
  }
  // _g chỉ dùng nội bộ để gộp phiếu tổng.
  for (const r of receipts) r.items = r.items.map(({ _g, ...x }) => x);
  return receipts.sort((a, b) => b.purchaseDate - a.purchaseDate);
};
