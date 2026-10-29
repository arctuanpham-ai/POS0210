// Dữ liệu mô phỏng chạy hoàn toàn trong trình duyệt: không đọc, không ghi Firestore.
// Có chủ ý trộn: phiếu tổng (giai đoạn đầu), phiếu chi tiết, phiếu huỷ, dòng sai nhóm, tên mơ hồ/không khớp,
// và một tháng thiếu doanh thu, để kiểm tra báo cáo xử lý đúng các trường hợp thực tế.
import { MATERIAL_GROUPS, buildSummaryLines, groupLabelOf } from "./expense-rules.js?v=20261029-16";

const mulberry32 = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// [tên, nhóm, đơn vị, đơn giá điển hình, số lượng điển hình]
const CATALOG = [
  ["Thịt heo ba chỉ", "THIT", "kg", 130000, 6], ["Gà ta", "THIT", "kg", 110000, 4],
  ["Rau muống", "RAU", "kg", 20000, 5], ["Chanh tươi", "RAU", "kg", 45000, 3],
  ["Bún tươi", "BUN", "kg", 18000, 15], ["Gạo tẻ", "BUN", "kg", 22000, 10],
  ["Bánh mì que", "BANH", "cái", 3000, 80],
  ["Sữa đặc Ông Thọ", "SUA", "hộp", 24000, 12], ["Bơ lạt Tường An", "SUA", "cục", 38000, 3],
  ["Nước mắm", "GIAVI", "chai", 42000, 3], ["Đường cát", "GIAVI", "kg", 24000, 6],
  ["Cà phê Robusta rang mộc", "CAPHE", "kg", 160000, 5],
  ["Trà lài", "TRA", "kg", 190000, 2], ["Mứt dâu", "MUT", "hũ", 85000, 2],
  ["Nước suối", "NUOC", "thùng", 85000, 2], ["Đá viên", "DA", "bao", 25000, 15],
  ["Ống hút giấy", "BAOBI", "hộp", 60000, 3], ["Ly nhựa 360ml", "BAOBI", "cây", 52000, 6],
  ["Nước rửa chén", "VESINH", "can", 70000, 1],
];
const TRICKY = [["Bơ", "THIT"], ["Mè đen", "GIAVI"], ["Hàng chợ", "KHAC"]]; // mơ hồ / không khớp quy tắc

const round1000 = (n) => Math.max(1000, Math.round(n / 1000) * 1000);

/**
 * months: số tháng gần nhất (kể cả tháng này). Hai tháng đầu là phiếu tổng, các tháng sau là phiếu chi tiết.
 * Doanh thu bị bỏ trống ở tháng thứ 3 để thử trường hợp thiếu dữ liệu.
 */
export const buildSimulation = ({ now = Date.now(), months = 6, seed = 210 } = {}) => {
  const rand = mulberry32(seed);
  const today = new Date(now);
  const receipts = [];
  const monthlyDocs = {};
  const pad = (n) => String(n).padStart(2, "0");
  let id = 0;
  for (let m = months - 1; m >= 0; m -= 1) {
    const first = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const key = `${first.getFullYear()}-${pad(first.getMonth() + 1)}`;
    const isCurrent = m === 0;
    const daysInMonth = isCurrent ? today.getDate() : new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const seq = months - 1 - m; // 0 là tháng cũ nhất
    const summaryPhase = seq < 2;
    const revenue = round1000((isCurrent ? 18_000_000 * (daysInMonth / 30) : 18_000_000) * (0.85 + rand() * 0.3));
    if (seq !== 2) monthlyDocs[key] = { monthKey: key, revenue, paidBills: Math.round(revenue / 38000), finalized: !isCurrent };
    let purchaseBudget = revenue * (0.3 + rand() * 0.08);
    const visits = Math.max(2, Math.round(daysInMonth / 3));
    for (let v = 0; v < visits; v += 1) {
      const day = Math.min(daysInMonth, 1 + Math.floor((v * daysInMonth) / visits) + Math.floor(rand() * 2));
      const purchaseDate = new Date(first.getFullYear(), first.getMonth(), day, 7 + Math.floor(rand() * 4)).getTime();
      if (purchaseDate > now) continue;
      const share = purchaseBudget / (visits - v);
      const rid = `sim-${++id}`;
      if (summaryPhase) {
        const groups = [...new Set(Array.from({ length: 2 + Math.floor(rand() * 3) }, () => CATALOG[Math.floor(rand() * CATALOG.length)][1]))];
        const lines = buildSummaryLines(groups.map((group) => ({ group, amount: round1000(share / groups.length) })), (i) => `${rid}-l${i}`);
        const total = lines.reduce((s, l) => s + l.amount, 0);
        purchaseBudget -= total;
        receipts.push({ id: rid, status: "ACTIVE", purchaseDate, updatedAt: purchaseDate, total, detailLevel: "SUMMARY", enteredByName: "Mô phỏng", items: lines });
        continue;
      }
      const picks = Array.from({ length: 3 + Math.floor(rand() * 4) }, () => CATALOG[Math.floor(rand() * CATALOG.length)]);
      const rawTotal = picks.reduce((sum, [, , , price, qty]) => sum + price * qty, 0);
      const scale = Math.min(1.5, share / rawTotal); // đưa tổng phiếu về gần ngân sách nhập của tháng
      const items = picks.map(([name, group, unit, price, qty], i) => {
        const q = Math.max(1, Math.round(qty * scale * (0.6 + rand() * 0.8)));
        const unitPrice = round1000(price * (0.95 + rand() * 0.1));
        // ~8% dòng ghi sai nhóm để màn rà soát có việc phải bắt
        const wrong = rand() < 0.08;
        const useGroup = wrong ? MATERIAL_GROUPS[(MATERIAL_GROUPS.findIndex(([c]) => c === group) + 3) % MATERIAL_GROUPS.length][0] : group;
        return { id: `${rid}-i${i}`, materialName: name, materialGroup: groupLabelOf(useGroup), expenseGroup: groupLabelOf(useGroup), materialCode: `${useGroup}-SIM${i}`, qty: q, unit, unitPrice, amount: q * unitPrice };
      });
      if (rand() < 0.35) {
        const [name, group] = TRICKY[Math.floor(rand() * TRICKY.length)];
        items.push({ id: `${rid}-t`, materialName: name, materialGroup: groupLabelOf(group), expenseGroup: groupLabelOf(group), materialCode: `${group}-SIMT`, qty: 1, unit: "lần", unitPrice: 30000, amount: 30000 });
      }
      const total = items.reduce((s, i) => s + i.amount, 0);
      purchaseBudget -= total;
      receipts.push({ id: rid, status: "ACTIVE", purchaseDate, updatedAt: purchaseDate, total, enteredByName: "Mô phỏng", items });
    }
  }
  // Một phiếu đã huỷ: báo cáo không được tính phiếu này
  if (receipts.length) receipts.push({ ...receipts[receipts.length - 1], id: "sim-deleted", status: "DELETED", total: 999_000, items: [] });
  receipts.sort((a, b) => b.purchaseDate - a.purchaseDate);
  const oldest = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1).getTime();
  return { receipts, monthlyDocs, from: oldest };
};
