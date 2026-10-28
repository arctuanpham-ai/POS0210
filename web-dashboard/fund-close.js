// Đối soát quỹ & chia tiền theo tháng. Quỹ quán = toàn bộ tiền của quán (tiền mặt + tài khoản) do thủ quỹ giữ.
// Hàm thuần: không Firebase, không DOM.
import { countsAsCost, reviewStatus } from "./reimburse.js?v=20261029-05";

/** Đầu tư ban đầu (trước khai trương, đã góp và chia ngoài): không trừ vào lợi nhuận tháng, không chi từ quỹ. */
export const INITIAL_CATEGORIES = new Set(["INITIAL_INVESTMENT_SUNK", "CAPITAL_ASSET", "SETUP_COST", "INITIAL_INVESTMENT"]);
/** Dòng tiền không phải chi phí: vào / ra quỹ. */
const MOVE_IN = new Set(["CAPITAL_CONTRIBUTION", "WORKING_CAPITAL", "OTHER_CASH_IN", "RECOVERED_CAPITAL", "ASSET_DISPOSAL_IN", "OTHER_CASH_ADJUSTMENT"]);
const MOVE_OUT = new Set(["PROFIT_WITHDRAWAL", "OWNER_WITHDRAWAL", "PAYER_REIMBURSEMENT"]);

const pad = (n) => String(n).padStart(2, "0");
export const monthRange = (monthKey) => { const [y, m] = String(monthKey).split("-").map(Number); return { from: new Date(y, m - 1, 1).getTime(), to: new Date(y, m, 1).getTime() }; };
export const prevMonthKey = (monthKey) => { const [y, m] = String(monthKey).split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const categoryOf = (r) => r.expenseCategory || "MATERIAL";
const isShop = (r) => r.fundSource === "SHOP_CASH" || r.fundSource === "SHOP_BANK";

/**
 * Bảng đối soát một tháng.
 * - Lợi nhuận đem chia = doanh thu − chi vận hành − đầu tư bổ sung (chỉ phiếu ĐÃ DUYỆT, không tính đầu tư ban đầu). Khớp báo cáo tháng trên máy POS.
 * - Quỹ phải có cuối kỳ = đầu kỳ + doanh thu − chi bằng quỹ − hoàn ứng đã trả ± góp / rút vốn, rút lợi nhuận.
 * - Có thể chia = quỹ (thực đếm nếu đã nhập, không thì quỹ phải có) − còn nợ hoàn − vốn giữ lại.
 */
// foodAccrual: app food ròng theo ngày bán (bán − hoa hồng − phí), tính vào lợi nhuận tháng bán. foodCash: tiền app chuyển về TK trong tháng, tính vào quỹ.
export const fundMonth = ({ monthKey, revenue = 0, receipts = [], otherPurchases = [], movements = [], opening = 0, cashCounted = null, bankBalance = null, reserve = 0, partners = [], foodAccrual = 0, foodCash = 0 }) => {
  const { from, to } = monthRange(monthKey);
  const inMonth = (t) => Number(t) >= from && Number(t) < to;
  const mine = receipts.filter((r) => inMonth(r.purchaseDate) && reviewStatus(r) !== "NONE");
  const counted = mine.filter(countsAsCost).filter((r) => !INITIAL_CATEGORIES.has(categoryOf(r)));
  const sum = (list, f = (x) => Number(x.total || 0)) => list.reduce((s, x) => s + f(x), 0);
  const others = otherPurchases.filter((p) => inMonth(p.at) && !INITIAL_CATEGORIES.has(p.category));
  const investment = sum(counted.filter((r) => categoryOf(r) === "ADDITIONAL_INVESTMENT")) + sum(others.filter((p) => p.category === "ADDITIONAL_INVESTMENT"), (p) => Number(p.amount || 0));
  const operating = sum(counted.filter((r) => categoryOf(r) !== "ADDITIONAL_INVESTMENT")) + sum(others.filter((p) => p.category !== "ADDITIONAL_INVESTMENT"), (p) => Number(p.amount || 0));
  const fromFund = sum(counted.filter(isShop)) + sum(others.filter((p) => !p.payer), (p) => Number(p.amount || 0));
  const fromPersonal = sum(counted.filter((r) => !isShop(r))) + sum(others.filter((p) => p.payer), (p) => Number(p.amount || 0));
  const net = Number(revenue || 0) + Number(foodAccrual || 0) - operating - investment;
  const moves = movements.filter((m) => inMonth(m.occurredAt));
  const moveIn = sum(moves.filter((m) => MOVE_IN.has(m.type)), (m) => Number(m.amount || 0));
  const reimbursed = sum(moves.filter((m) => m.type === "PAYER_REIMBURSEMENT"), (m) => Number(m.amount || 0));
  const withdrawn = sum(moves.filter((m) => MOVE_OUT.has(m.type) && m.type !== "PAYER_REIMBURSEMENT"), (m) => Number(m.amount || 0));
  const expected = Number(opening || 0) + Number(revenue || 0) + Number(foodCash || 0) - fromFund - reimbursed + moveIn - withdrawn;
  const hasActual = cashCounted !== null && cashCounted !== "" && bankBalance !== null && bankBalance !== "";
  const actual = hasActual ? Number(cashCounted || 0) + Number(bankBalance || 0) : null;
  const pending = mine.filter((r) => reviewStatus(r) === "PENDING");
  const rejected = mine.filter((r) => reviewStatus(r) === "REJECTED");
  // Còn nợ người ứng tiền: phiếu tiền cá nhân đã duyệt nhưng chưa hoàn (mọi tháng, vì quỹ phải trả bằng tiền đang giữ).
  const owed = receipts.filter((r) => !isShop(r) && r.reimbursement?.status === "APPROVED" && reviewStatus(r) === "APPROVED");
  const owedTotal = sum(owed);
  const base = hasActual ? actual : expected;
  const distributable = base - owedTotal - Number(reserve || 0);
  const active = partners.filter((p) => p.active !== false && Number(p.shareBasisPoints) > 0);
  const totalBp = active.reduce((s, p) => s + Number(p.shareBasisPoints), 0);
  const people = totalBp === 10000 ? active : [{ name: "Cổ đông 1", shareBasisPoints: 5000 }, { name: "Cổ đông 2", shareBasisPoints: 5000 }];
  const shares = people.map((p) => ({ name: p.name, percent: Number(p.shareBasisPoints) / 100, amount: Math.max(0, Math.round(Math.max(0, distributable) * Number(p.shareBasisPoints) / 10000)) }));
  return {
    monthKey, revenue: Number(revenue || 0), foodAccrual: Number(foodAccrual || 0), foodCash: Number(foodCash || 0), operating, investment, net, fromFund, fromPersonal,
    opening: Number(opening || 0), moveIn, reimbursed, withdrawn, expected, actual, diff: hasActual ? actual - expected : null,
    owedTotal, owedCount: owed.length, reserve: Number(reserve || 0), distributable, shares, partnersConfigured: totalBp === 10000,
    pending: { count: pending.length, total: sum(pending) }, rejected: { count: rejected.length, total: sum(rejected) },
    mismatch: distributable - net,
  };
};
