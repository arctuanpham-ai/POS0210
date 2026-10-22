import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  collection,
  doc,
  getFirestore,
  getDoc as rawGetDoc,
  runTransaction as rawRunTransaction,
  getDocs as rawGetDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  setDoc as rawSetDoc,
  deleteDoc as rawDeleteDoc,
  writeBatch as rawWriteBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { buildProfile, profileHeadline } from "./customer-profile.js?v=20261021-07";
import { matchesPayer, normalizePayer } from "./payer-filter.js?v=20261021-07";
import { buildCancelledReceipt, buildEditedReceipt, calculateReceiptTotal, createStableDraft, freshenDraft, receiptToDraft, validateReceipt } from "./expense-domain.js?v=20261021-07";
import { shouldMarkSnapshotStale } from "./dashboard-snapshot.js?v=20261021-07";
import { FUNNEL, buildStats, dayKeyVN, dayLabel, funnelSteps, pct } from "./stats-view.js?v=20261021-07";
import { approvedKeys, vagueKey, vagueMaterials } from "./vague-materials.js?v=20261021-07";
import { normalizeMaterial, materialMatches, materialRank, filterMaterialOptions, searchMaterials } from "./material-search.js?v=20261021-07";
import { currentFlow, flowLabel, frozenRefunds, historyRows, summarizeRefunds } from "./payment-flow-view.js?v=20261021-07";
import { DETAIL_ITEMIZED, buildSummaryLines, detailGap, detailLevelSummary, detailRequired, isSummaryReceipt, validateSummaryReceipt } from "./expense-rules.js?v=20261021-07";
import { classifyMaterial, groupCodeOrNull, groupLabelOf, materialCodeFor, normalizeQuantity, reviewItems, ruleIdFor, rulesToLearn, summarizeReview } from "./expense-rules.js?v=20261021-07";
import { buildSimulation } from "./sim-data.js?v=20261021-07";
import { buildMonthlyReport, lastMonthKeys, monthKeyOf, monthlyCsv, monthlyJson, startOfPreviousMonth } from "./monthly-report.js?v=20261021-07";
import { menuCsv } from "./menu-export.js?v=20261021-07";
import { KIND_LABELS, MATERIALS, buildDynamicMaterials, catalogRules, registerDynamicMaterials, similarMaterials, costLevel, draftRecipeFor, matchMaterial, materialById, materialCosts, recipeCost, sliderSpec, unitFactor, usageVsPurchase } from "./cost-recipe.js?v=20261021-07";
import { DEFAULT_DAILY_SALES, DEMO_COLLECTION, DEMO_WASTE, averageDailySales, buildDemoReceipts, dailyMaterialUsage } from "./demo-receipts.js?v=20261021-07";
import { hourRows, hourlyTotals, topItems } from "./charts-view.js?v=20261021-07";
import { buildFlag, flagAfterEdit, flagAfterReview, flagApprovalProblem, isFlagOpen, needsOwnerReview, receiptFlag, BANK_CHOICES, FUND_PERSONAL, ROLE_BUYER, ROLE_LABELS, ROLE_OWNER, ROLE_TREASURER, STATUS_LABELS, asciiUpper, bankOf, batchCode, canTreasure, changedAfterPaid, duplicateSuspects, hashPin, isMine, legacyOpenReceipts, selfReviewBlocked, bankDeeplink, countsAsCost, initialReview, reviewStatus, isPaidOut, paidEditProblem, memberByPinHash, memberId, memberOf, myAlerts, needsReminder, payerQueues, receiptCode, reimbursementStatus, transferNote, validateBatchSelection, validPin, vietQrPayload } from "./reimburse.js?v=20261021-07";
import { bookingDate, closedMonthEditProblem, monthLabel, withShiftNote } from "./month-close.js?v=20261021-07";
import { EXPENSE_KINDS, KIND_SHORT, NON_MATERIAL, detectKind, splitByKind } from "./expense-kind.js?v=20261021-07";
import { INITIAL_CATEGORIES, fundMonth, prevMonthKey, monthRange } from "./fund-close.js?v=20261021-07";
import { otherCostRows } from "./other-costs.js?v=20261021-07";
import { paybackStatus } from "./payback.js?v=20261021-07";
import { topSellers } from "./top-banner.js?v=20261021-07";
import { reconcileDays, reconcileRevenue } from "./revenue-check.js?v=20261021-07";
import { prepList, profitRanking, tomorrowSales } from "./plan-profit.js?v=20261021-07";
import { OO_LABELS, OO_MODE_LABELS, OO_REJECT_REASONS, attentionCount, buildTransition, groupOrders, isPending, limitKeys, minutesAgoText, newOrderCodes, nextActions, ooToMillis, overdueOrders, releasedCount, validateShopConfig } from "./online-orders.js?v=20261021-07";
import { menuEditProblem, menuGroups, mergePlan, nameIssues, nextProductCode, normName, soldCombos, soldNotInMenu } from "./menu-view.js?v=20261021-07";
import { POS_CEILING, SPARK, dayUsage, lastPacificDays, nextReset, pacificDay, usageTrend } from "./usage.js?v=20261021-07";
import { AI_SCOPES, buildAiPack, scopeRange } from "./ai-export.js?v=20261021-07";
import { COUNT_ITEMS, buildDemoCounts, countToBase, varianceBetween } from "./stock-count.js?v=20261021-07";
import { mergeReceipts, planLoad } from "./receipt-cache.js?v=20261021-07";
import { ACK_TIMEOUT_MS, canRequestSync, syncCommandStatus } from "./remote-sync-view.js?v=20261021-07";
import { filterBillRows, buildBillDetail, buildBillRows, chunk, dayRange, keyOfTime, methodLabel, summarizeBillRows, timeLabel } from "./bill-history-view.js?v=20261021-07";
import { compareKeys, compareRows, weekTotals } from "./day-compare.js?v=20261021-07";
import { comboCount, formatBaseQty, materialConsumption, outputRows } from "./item-output.js?v=20261021-07";
import { SALES_PERIODS, changePct, monthSeries, periodPlan, aggregateItems, dailyKeys, dateKeyOf, liveSummary, periodDailySummary, serviceStatusLabel, summarizeDaily } from "./sales-snapshot-view.js?v=20261021-07";

const firebaseConfig = {
  apiKey: "AIzaSyDhnjjTS1Da99p76VrjMGSKQxgib3b23zk",
  authDomain: "pos0210-17ce4.firebaseapp.com",
  projectId: "pos0210-17ce4",
  storageBucket: "pos0210-17ce4.firebasestorage.app",
  messagingSenderId: "734292261602",
  appId: "1:734292261602:android:c60646ce0c9ed4c3f67cbb",
};
const STORE_OWNER_UID = "X9ln8CP7UtbOLOHfipYMCjfbb1p1";
const STORE_ID = "0210";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const root = ["users", STORE_OWNER_UID, "stores", STORE_ID];

const state = {
  dashboard: {}, tables: [], sessions: [], batches: [], items: [],
  bills: [], purchases: [], expenseReceipts: [], purchaseItems: [], movements: [], costCodes: [],
  purchaseCategories: [], profitPartners: [], assetCategories: [], suppliers: [],
  unsubs: [], paymentFlowDoc: null, refunds: [], frozenRefundDocs: [], flowError: "", dailyDocs: {}, dailyError: "", salesLoaded: false, salesDays: 7, salesPeriod: "7d", itemDay: "", dailyLoadedFrom: null, itemMode: "combined", cmpMode: "prev", compareError: "", period: "today", customFrom: null, customTo: null,
  transactionKind: "ALL", payerFilter: "ALL", user: null, investment: null, closingsAll: [], showInitial: false,
  expenseRules: [], unitOk: [], rulesError: "", simulation: null, demo: null, reimbBatches: [], payees: [], role: null, me: null, members: [], closedMonths: [], closedLoaded: false, openReceipts: [], reimbLoaded: false, reimbPerson: "", otherPurchases: [], stockCounts: [], countsLoaded: false, menuItems: [], menuCats: [], combos: [], combosLoaded: false, recipes: {}, recipesLoaded: false, recipeError: "", monthlyDocs: {}, monthlyError: "", reportFrom: 0, receiptsNote: "", detailCutoff: null, receiptsFrom: 0, summaryBlocks: [], historyDay: "today", historyDocs: {}, historyTables: null, historyError: "", historyLoading: false, billDetailCache: {},
};
let expenseDraft = null;
let editingReceipt = null;
// Chỉ phiếu đã duyệt mới tính vào chi phí (phiếu chờ duyệt / bị trả lại chưa "pass").
// Ghi chép đầu tư ban đầu (phiếu lẻ trước khai trương) chỉ để tham khảo: không cộng vào chi phí, đầu tư trong kỳ hay báo cáo.
// Vốn ban đầu dùng MỘT con số chủ quán nhập ở "Vốn đầu tư ban đầu & hoàn vốn" (config/investment).
const receiptCategory = (r) => r?.expenseCategory || r?.items?.[0]?.expenseGroup || "";
// Khoản chi trước tháng khai trương (chủ quán nhập ở mục Vốn đầu tư ban đầu) cũng là ghi chép ban đầu: đã nằm trong con số vốn.
const openingStart = () => { const m = state.investment?.openingMonth; return /^\d{4}-\d{2}$/.test(m || "") ? new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).getTime() : 0; };
const beforeOpening = (ms) => { const o = openingStart(); return o > 0 && Number(ms || 0) > 0 && Number(ms) < o; };
const isInitialReceipt = (r) => INITIAL_CATEGORIES.has(receiptCategory(r)) || beforeOpening(r?.purchaseDate);
const costReceipts = () => state.expenseReceipts.filter(countsAsCost).filter((r) => !isInitialReceipt(r));
const expenseRows = () => costReceipts().map((receipt) => ({
  id: receipt.id,
  status: receipt.status || "ACTIVE",
  purchasedAt: Number(receipt.purchaseDate || 0),
  total: Number(receipt.total || 0),
  expenseCategory: receipt.expenseCategory || receipt.items?.[0]?.expenseGroup || "OTHER_EXPENSE",
  paidByName: receipt.enteredByName || "",
  note: receipt.note || "",
  summary: isSummaryReceipt(receipt),
}));

// Chế độ mô phỏng không bao giờ được ghi Firestore: mọi đường ghi đi qua hai hàm này.
const SIM_BLOCKED = "Đang ở chế độ mô phỏng: không ghi dữ liệu thật. Tắt mô phỏng để lưu.";
/* ---------- Đếm lượt đọc / ghi của web (so với hạn mức gói Spark), lưu theo ngày Pacific vào config/webUsage-{ngày} ---------- */
const usageStore = (() => { try { return window.localStorage; } catch { return null; } })();
const usageDevice = (() => { try { let d = usageStore?.getItem("pos0210-usage-device"); if (!d) { d = Math.random().toString(36).slice(2, 10); usageStore?.setItem("pos0210-usage-device", d); } return d; } catch { return "web"; } })();
const webUsage = { day: "", reads: 0, writes: 0, deletes: 0, dirty: false, flushedAt: 0 };
function usageToday() {
  const day = pacificDay();
  if (webUsage.day !== day) {
    let saved = null; try { saved = JSON.parse(usageStore?.getItem(`pos0210-usage-${day}`) || "null"); } catch { saved = null; }
    Object.assign(webUsage, { day, reads: saved?.reads || 0, writes: saved?.writes || 0, deletes: saved?.deletes || 0, dirty: false });
  }
  return webUsage;
}
function countUsage(kind, n) {
  const u = usageToday(); u[kind] += n; u.dirty = true;
  try { usageStore?.setItem(`pos0210-usage-${u.day}`, JSON.stringify({ reads: u.reads, writes: u.writes, deletes: u.deletes })); } catch { /* bộ nhớ trình duyệt bị chặn: chỉ đếm trong phiên */ }
}
async function flushUsage(force = false) {
  const u = usageToday();
  if (!u.dirty || !state.user || state.simulation) return;
  if (!force && Date.now() - u.flushedAt < 5 * 60000) return;
  u.dirty = false; u.flushedAt = Date.now();
  countUsage("writes", 1); u.dirty = false; // chính lần lưu này cũng là một lượt ghi
  try { await rawSetDoc(doc(db, ...root, "config", `webUsage-${u.day}`), { day: u.day, devices: { [usageDevice]: { reads: u.reads, writes: u.writes, deletes: u.deletes, name: myName?.() || "", updatedAt: Date.now() } } }, { merge: true }); }
  catch { u.dirty = true; }
}
setInterval(() => flushUsage(), 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushUsage(true); });
// Firestore tính tối thiểu 1 lượt đọc cho truy vấn trả về rỗng.
const getDocs = async (q) => { const snap = await rawGetDocs(q); countUsage("reads", Math.max(1, snap.docs.length)); return snap; };
const getDoc = async (ref) => { const snap = await rawGetDoc(ref); countUsage("reads", 1); return snap; };
const deleteDoc = (...args) => { if (state.simulation) throw new Error(SIM_BLOCKED); return rawDeleteDoc(...args).then((v) => { countUsage("writes", 1); return v; }); };
const setDoc = (...args) => { if (state.simulation) throw new Error(SIM_BLOCKED); return rawSetDoc(...args).then((v) => { countUsage("writes", 1); return v; }); };
const writeBatch = (...args) => {
  if (state.simulation) throw new Error(SIM_BLOCKED);
  const b = rawWriteBatch(...args); let w = 0, d = 0;
  const proxy = { set: (...a) => { w += 1; b.set(...a); return proxy; }, update: (...a) => { w += 1; b.update(...a); return proxy; }, delete: (...a) => { d += 1; b.delete(...a); return proxy; }, commit: () => b.commit().then((v) => { countUsage("writes", w); if (d) countUsage("deletes", d); return v; }) };
  return proxy;
};
const runTransaction = (database, fn) => {
  let r = 0, w = 0;
  return rawRunTransaction(database, (tx) => fn({ get: (ref) => { r += 1; return tx.get(ref); }, set: (...a) => { w += 1; tx.set(...a); return tx; }, update: (...a) => { w += 1; tx.update(...a); return tx; }, delete: (...a) => { w += 1; tx.delete(...a); return tx; } }))
    .then((v) => { countUsage("reads", r); countUsage("writes", w); return v; });
};

/** Quy tắc đã học của quán trước, rồi tên vật tư chuẩn trong danh mục. */
const allRules = () => [...state.expenseRules, ...catalogRules];
/** Đang xem demo thì mọi phiếu nhập, sửa, huỷ đi vào collection demo và mang cờ demo; dữ liệu thật không bị đụng. */
const receiptCollection = () => (state.demo ? DEMO_COLLECTION : "expenseReceipts");
const withDemoFlags = (payload) => (state.demo ? { ...payload, demo: true, demoBatch: payload.demoBatch || "manual", source: payload.source === "DEMO" ? "DEMO" : "DEMO_MANUAL" } : payload);
const $ = (selector) => document.querySelector(selector);
const money = (value) => `${new Intl.NumberFormat("vi-VN").format(Number(value || 0))}đ`;
const dateTime = (value) => value ? new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value)) : "—";
const elapsed = (value) => {
  if (!value) return "Chưa có giờ gọi";
  const minutes = Math.max(0, Math.floor((Date.now() - Number(value)) / 60000));
  return minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)}g ${minutes % 60}p`;
};
const statusText = (statuses) => statuses.includes("SERVED") || statuses.includes("DELIVERED") ? "Đã phục vụ" : statuses.includes("WAITING") || statuses.includes("SENT") ? "Đã gửi bếp" : "Đang gọi món";
const rows = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const uuid = () => globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const endOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
const localDateInput = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const localDateTimeInput = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const EXPENSE_LABELS = {
  INVENTORY_PURCHASE: "Nhập nguyên liệu / hàng hóa",
  PAYROLL: "Lương", ELECTRICITY: "Điện", WATER: "Nước", RENT: "Thuê mặt bằng",
  MARKETING: "Marketing", CONSUMABLES: "Vật tư tiêu hao", MAINTENANCE: "Bảo trì",
  SERVICES: "Dịch vụ", BANK_FEES: "Phí ngân hàng", OTHER_EXPENSE: "Chi phí khác",
  ADDITIONAL_INVESTMENT: "Đầu tư bổ sung", CAPITAL_ASSET: "Tài sản đầu tư",
  SETUP_COST: "Chi phí setup", INITIAL_INVESTMENT_SUNK: "Đầu tư ban đầu",
};
const MOVEMENT_LABELS = {
  CAPITAL_CONTRIBUTION: "Góp vốn", PAYER_REIMBURSEMENT: "Hoàn ứng",
  OTHER_CASH_IN: "Thu khác", OTHER_CASH_ADJUSTMENT: "Điều chỉnh tiền",
  WORKING_CAPITAL: "Vốn lưu động", OWNER_WITHDRAWAL: "Rút vốn",
  PROFIT_WITHDRAWAL: "Rút lợi nhuận", RECOVERED_CAPITAL: "Thu hồi vốn",
  ASSET_DISPOSAL_IN: "Thanh lý tài sản",
};
const TRANSACTION_TYPES = {
  OPERATING_EXPENSE: { label: "Chi phí vận hành", purchase: true },
  ADDITIONAL_INVESTMENT: { label: "Đầu tư bổ sung", purchase: true, expenseCategory: "ADDITIONAL_INVESTMENT", asset: true, investmentClass: "ADDITIONAL" },
  INITIAL_INVESTMENT: { label: "Đầu tư ban đầu không thu hồi", purchase: true, expenseCategory: "INITIAL_INVESTMENT_SUNK" },
  ASSET_PURCHASE: { label: "Mua tài sản đầu tư ban đầu", purchase: true, expenseCategory: "CAPITAL_ASSET", asset: true, investmentClass: "INITIAL" },
  CAPITAL_INJECTION: { label: "Góp vốn đầu tư", movement: "CAPITAL_CONTRIBUTION" },
  WORKING_CAPITAL: { label: "Bổ sung vốn lưu động", movement: "WORKING_CAPITAL" },
  PROFIT_WITHDRAWAL: { label: "Rút lợi nhuận", movement: "PROFIT_WITHDRAWAL", partner: true },
  OWNER_WITHDRAWAL: { label: "Rút vốn", movement: "OWNER_WITHDRAWAL", partner: true },
  CAPITAL_RECOVERY: { label: "Ghi nhận hoàn vốn", movement: "RECOVERED_CAPITAL" },
  OTHER_ADJUSTMENT: { label: "Thu/điều chỉnh khác", movement: "OTHER_CASH_ADJUSTMENT" },
};
const MOVEMENT_OUT_TYPES = new Set(["PAYER_REIMBURSEMENT", "OWNER_WITHDRAWAL", "PROFIT_WITHDRAWAL"]);
const INVESTMENT_CATEGORIES = new Set(["ADDITIONAL_INVESTMENT", "CAPITAL_ASSET", "SETUP_COST", "INITIAL_INVESTMENT_SUNK"]);

function currentTable(table) {
  // tableStatus is the canonical realtime occupancy signal from the POS.
  // Historical/stale session documents must never reopen a table on the web.
  const occupied = table.occupied === true;
  const session = occupied ? state.sessions.find((row) => row.tableId === table.id && row.status === "OPEN") : null;
  const batches = session ? state.batches.filter((row) => row.sessionId === session.id && row.status !== "CANCELLED") : [];
  const batchIds = new Set(batches.map((row) => row.id));
  const items = state.items.filter((row) => batchIds.has(row.batchId));
  const itemTotal = items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.qty || 0), 0);
  return { table, occupied, session, batches, items, total: itemTotal || Number(table.currentTotal || 0) };
}

function rangeForPeriod() {
  const now = new Date();
  if (state.period === "all") return { from: -Infinity, to: Infinity, label: "Tất cả" };
  if (state.period === "yesterday") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return { from: startOfDay(d), to: endOfDay(d), label: "Hôm qua" };
  }
  if (state.period === "7d") {
    const fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    return { from: startOfDay(fromDate), to: endOfDay(now), label: "7 ngày" };
  }
  if (state.period === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: endOfDay(now), label: "Tháng này" };
  if (state.period === "custom" && state.customFrom != null && state.customTo != null) return { from: state.customFrom, to: state.customTo, label: "Tùy chọn" };
  return { from: startOfDay(now), to: endOfDay(now), label: "Hôm nay" };
}
const inRange = (value, range) => Number(value || 0) >= range.from && Number(value || 0) < range.to;

function renderCumulativeSummary() {
  const dashboard = state.dashboard;
  const cards = [
    ["Doanh thu tháng hiện tại", money(dashboard.monthRevenue)],
    ["Lợi nhuận vận hành", dashboard.operatingProfit == null ? "Chưa có" : money(dashboard.operatingProfit)],
    ["Tiền cuối kỳ ước tính", money(dashboard.closingCash)],
    ...(() => { const p = currentPayback(); return p.set ? [["Vốn đầu tư ban đầu", money(p.initial)], ["Đã thu hồi (luỹ kế)", money(p.recovered)], ["Tỷ lệ hoàn vốn", `${p.percent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`]] : [["Vốn đầu tư ban đầu", "Chưa nhập"], ["Đã thu hồi (luỹ kế)", money(p.recovered)], ["Tỷ lệ hoàn vốn", "—"]]; })(),
  ];
  const host = $("#summary");
  host.replaceChildren(...cards.map(([label, value]) => {
    const node = $("#metric-template").content.firstElementChild.cloneNode(true);
    node.querySelector("p").textContent = label;
    node.querySelector("strong").textContent = value;
    return node;
  }));
  $("#sync-status").textContent = dashboard.lastUpdatedAt ? `Dữ liệu POS cập nhật ${dateTime(dashboard.lastUpdatedAt)}` : "Chờ POS gửi dữ liệu lần đầu…";
}

function renderPeriodSummary() {
  const range = rangeForPeriod();
  const bills = state.bills.filter((b) => b.status === "PAID" && b.closedAt && inRange(b.openedAt, range));
  // Chi phí = phiếu chi đã duyệt + chi phí nhập ở Thu chi khác / máy POS (cùng nguồn với danh sách phiếu bên dưới).
  const otherRows = otherCosts().map((c) => ({ id: c.id, status: "ACTIVE", purchasedAt: c.at, total: c.amount, expenseCategory: c.category, paidByName: c.payer }));
  const allPurchases = [...expenseRows(), ...otherRows].filter((p) => p.status !== "DELETED" && inRange(p.purchasedAt, range));
  const purchases = allPurchases.filter((p) => matchesPayer(state.payerFilter, p.paidByName));
  const movements = state.movements.filter((m) => inRange(m.occurredAt, range) && matchesPayer(state.payerFilter, m.counterpartyName));
  const snapshotRevenue = range.label === "Hôm nay" ? Number(state.dashboard.revenueToday || 0) : range.label === "Tháng này" ? Number(state.dashboard.monthRevenue || 0) : 0;
  const snapshotBillCount = range.label === "Hôm nay" ? Number(state.dashboard.paidBillsToday || 0) : 0;
  // Hôm qua / 7 ngày / tùy chọn: bill không còn được đọc về Web, doanh thu lấy từ snapshot dashboardDaily mà POS đã đẩy.
  const daily = !bills.length && ["Hôm qua", "7 ngày", "Tùy chọn"].includes(range.label) ? periodDailySummary(range, state.dailyDocs) : null;
  const revenue = bills.length ? bills.reduce((s, b) => s + Number(b.total || 0), 0) : daily ? daily.totalRevenue : snapshotRevenue;
  const billCount = bills.length ? bills.length : daily ? daily.totalBills : snapshotBillCount;
  const missingNote = daily && !daily.complete ? ` (thiếu ${daily.unavailableDays.length} ngày chưa có dữ liệu từ POS)` : "";
  const expense = allPurchases.reduce((s, p) => s + Number(p.total || 0), 0);
  const selectedPayerExpense = purchases.reduce((s, p) => s + Number(p.total || 0), 0);
  const additionalInvestment = allPurchases.filter((p) => INVESTMENT_CATEGORIES.has(p.expenseCategory)).reduce((s, p) => s + Number(p.total || 0), 0);
  const operatingExpense = expense - additionalInvestment;
  const movementNet = movements.reduce((s, m) => s + (MOVEMENT_OUT_TYPES.has(m.type) ? -Number(m.amount || 0) : Number(m.amount || 0)), 0);
  const cards = [
    [`Doanh thu${missingNote}`, money(revenue)],
    ["Số bill", billCount || (range.label === "Tháng này" ? "Snapshot tháng" : 0)],
    ["Bill trung bình", money(billCount ? Math.round(revenue / billCount) : 0)],
    ["Chi vận hành", money(operatingExpense)],
    ["Đầu tư trong kỳ", money(additionalInvestment)],
    ["Chênh lệch DT - chi vận hành", money(revenue - operatingExpense)],
    ["Dòng tiền khác / vốn", money(movementNet)],
    ["Số phiếu / khoản chi", allPurchases.length],
  ];
  const host = $("#period-summary");
  host.replaceChildren(...cards.map(([label, value]) => {
    const node = $("#metric-template").content.firstElementChild.cloneNode(true);
    node.querySelector("p").textContent = `${label} · ${range.label}`;
    node.querySelector("strong").textContent = value;
    return node;
  }));
  const payerLabel = state.payerFilter === "ALL" ? "Tất cả người chi" : state.payerFilter === "UNKNOWN" ? "Chưa xác định" : state.payerFilter;
  $("#payer-total").textContent = `${payerLabel} · ${range.label}: ${money(selectedPayerExpense)} · ${purchases.length} phiếu`;
}

function renderTables() {
  const host = $("#tables");
  const live = liveSummary(state.dashboard);
  if (live.available) {
    // Snapshot mới: danh sách bàn mở nằm sẵn trong dashboard/current, không cần đọc tableStatus.
    $("#live-open-tables").textContent = live.openTables;
    $("#live-open-total").textContent = money(live.provisionalTotal);
    if (!live.tables.length) { host.innerHTML = '<p class="muted empty-state">Hiện không có bàn nào đang phục vụ.</p>'; return; }
    host.replaceChildren(...live.tables.map((row) => {
      const node = $("#table-template").content.firstElementChild.cloneNode(true);
      node.classList.add("occupied");
      node.querySelector(".table-state").textContent = "ĐANG PHỤC VỤ · TẠM TÍNH";
      node.querySelector("strong").textContent = row.name;
      node.querySelector("small").textContent = `${elapsed(row.openedAt)} · ${serviceStatusLabel(row.serviceStatus)}`;
      node.querySelector("b").textContent = money(row.currentTotal);
      node.addEventListener("click", () => showDetail({ table: { name: row.name, openedAt: row.openedAt }, session: { openedAt: row.openedAt }, batches: [{ status: row.serviceStatus }], items: row.items || [], total: row.currentTotal }));
      return node;
    }));
    return;
  }
  // POS bản cũ chưa gửi liveTables: dùng tableStatus như trước.
  const records = state.tables.filter((table) => table.active !== false).map(currentTable);
  records.sort((a, b) => String(a.table.name).localeCompare(String(b.table.name), "vi"));
  const activeRecords = records.filter((r) => r.occupied);
  $("#live-open-tables").textContent = activeRecords.length;
  $("#live-open-total").textContent = money(activeRecords.reduce((s, r) => s + r.total, 0));
  host.replaceChildren(...records.map((record) => {
    const node = $("#table-template").content.firstElementChild.cloneNode(true);
    const occupied = record.occupied;
    node.classList.toggle("occupied", occupied);
    node.querySelector(".table-state").textContent = occupied ? "ĐANG PHỤC VỤ" : "TRỐNG";
    node.querySelector("strong").textContent = record.table.name || "Bàn";
    node.querySelector("small").textContent = occupied ? `${elapsed(record.session?.openedAt || record.table.openedAt)} · ${statusText(record.batches.map((batch) => batch.status))}` : "Sẵn sàng nhận khách";
    node.querySelector("b").textContent = occupied ? money(record.total) : "";
    node.disabled = !occupied;
    node.addEventListener("click", () => showDetail(record));
    return node;
  }));
}

const shortDay = (key) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
const compactMoney = (value) => value >= 1000000 ? `${(value / 1000000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr` : value >= 1000 ? `${Math.round(value / 1000).toLocaleString("vi-VN")}k` : String(value);
const percent = (share) => `${(share * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;

function renderPaymentFlow() {
  const holder = $("#payment-flow");
  if (!holder) return;
  if (!state.salesLoaded) { holder.replaceChildren(); return; }
  const make = (tag, text, cls) => { const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; return el; };
  const nodes = [];
  if (state.flowError) nodes.push(make("p", `Không đọc được quy trình thanh toán/hoàn tiền: ${state.flowError}. Kiểm tra quy tắc Firestore.`, "sales-notice"));
  const flow = currentFlow(state.paymentFlowDoc);
  nodes.push(make("p", state.paymentFlowDoc ? `Chế độ đang dùng: ${flowLabel(flow)}` : "POS chưa gửi chế độ thanh toán (mặc định Trả sau).", "muted"));
  const history = historyRows(state.paymentFlowDoc);
  if (history.length) {
    const list = document.createElement("ul");
    history.slice(0, 10).forEach((h) => list.append(make("li", `${dateTime(h.at)} · ${h.by} · ${flowLabel(h.from)} → ${flowLabel(h.to)}`)));
    nodes.push(make("p", "Lịch sử đổi chế độ", "eyebrow"), list);
  }
  const frozenAll = frozenRefunds([...state.frozenRefundDocs, ...state.refunds.filter((r) => !state.frozenRefundDocs.some((f) => f.id === r.id))]);
  if (frozenAll.count) {
    const banner = make("p", `⚠ ${frozenAll.count} khoản CK ĐÓNG BĂNG · ${money(frozenAll.total)} chờ quản lý hoàn cho khách (không tính doanh thu). Trừ ra khi đối chiếu sao kê.`, "sales-notice");
    banner.style.fontWeight = "700";
    const frozenList = document.createElement("ul");
    frozenAll.rows.slice(0, 30).forEach((r) => frozenList.append(make("li", `${dateTime(r.createdAt)} · ${money(r.amount)} · ${r.reason}`)));
    nodes.push(banner, frozenList);
  }
  const refunds = summarizeRefunds(state.refunds, startOfDay(new Date(Date.now() - 6 * 86400000)));
  nodes.push(make("p", `Hoàn tiền 7 ngày: ${refunds.count} khoản · ${money(refunds.total)} (tiền mặt ${money(refunds.cash)} · chuyển khoản ${money(refunds.transfer)})`, "muted"));
  if (refunds.rows.length) {
    const list = document.createElement("ul");
    refunds.rows.slice(0, 20).forEach((r) => list.append(make("li", `${dateTime(r.createdAt)} · ${money(r.amount)} · ${r.method === "CASH" ? "Tiền mặt" : "Chuyển khoản"} · ${r.reason}${r.status === "FROZEN" ? " · ĐÓNG BĂNG" : r.method === "TRANSFER" && r.settledAt ? ` · đã hoàn CK ${dateTime(r.settledAt)}${r.settleNote ? ` (${r.settleNote})` : ""}` : ""}`)));
    nodes.push(list);
  }
  holder.replaceChildren(...nodes);
}

/* ---------- Doanh thu: giờ cao điểm và món bán nhiều (cột ngang, một màu, giá trị ghi ở đầu cột) ---------- */
function hbarRows(rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => `<div class="hbar-row${r.strong ? " strong" : ""}" title="${escapeHtml(r.tip)}"><span class="hbar-label">${escapeHtml(r.label)}</span><span class="hbar-track"><span class="hbar-fill" style="width:${Math.max(2, (r.value / max) * 100).toFixed(1)}%"></span></span><span class="hbar-value">${escapeHtml(r.valueText)}</span></div>`).join("");
}
function renderSalesBars(keys) {
  const hours = hourlyTotals(state.dailyDocs, keys);
  const peakHost = $("#peak-hours");
  if (!hours) peakHost.innerHTML = '<p class="muted">Chưa có số liệu theo giờ. Cần máy POS bản v158 trở lên đồng bộ lại (mở app một lần là đủ).</p>';
  else {
    const rows = hourRows(hours.total);
    const peak = rows.find((r) => r.peak);
    peakHost.innerHTML = rows.length
      ? `<p class="hbar-caption">Cao điểm ${String(peak.hour).padStart(2, "0")}:00–${String(peak.hour + 1).padStart(2, "0")}:00 · ${peak.count} bill trong ${hours.days} ngày có số liệu</p>${hbarRows(rows.map((r) => ({ label: `${String(r.hour).padStart(2, "0")}:00`, value: r.count, valueText: String(r.count), strong: r.peak, tip: `${String(r.hour).padStart(2, "0")}:00–${String(r.hour + 1).padStart(2, "0")}:00 · ${r.count} bill` })))}`
      : '<p class="muted">Chưa có bill trong giai đoạn này.</p>';
  }
  // Top 10 theo sản lượng thực làm: combo đã tách thành món lẻ để các món so sánh cùng loại.
  const items = topItems(outputRows(state.dailyDocs, keys).map((r) => ({ ...r, qty: r.total })), 10);
  $("#top-items").innerHTML = items.length
    ? hbarRows(items.map((r, i) => ({ label: r.name, value: Number(r.qty), valueText: `${Number(r.qty)} phần`, strong: i === 0, tip: `${r.name} · ${r.retail} bán lẻ + ${r.inCombo} trong combo` })))
    : '<p class="muted">Chưa có món đã bán trong giai đoạn này.</p>';
}

function renderSalesSnapshots() {
  if (!state.salesLoaded) {
    $("#live-revenue-today").textContent = "—";
    $("#live-paid-bills").textContent = "—";
    $("#sales-notice").textContent = "Bấm Làm mới để đọc doanh thu 3/7 ngày từ snapshot POS.";
    $("#sales-summary").replaceChildren();
    $("#sales-chart").replaceChildren();
    $("#sales-items").replaceChildren();
    return;
  }
  const dashboard = state.dashboard;
  const hasSnapshot = Boolean(dashboard.lastUpdatedAt);
  $("#live-revenue-today").textContent = hasSnapshot ? money(dashboard.revenueToday) : "—";
  $("#live-paid-bills").textContent = hasSnapshot ? String(Number(dashboard.paidBillsToday || 0)) : "—";

  const plan = periodPlan(state.salesPeriod);
  const keys = plan.dayKeys;
  const summary = summarizeDaily(state.dailyDocs, keys, dateKeyOf(new Date()));
  const notes = [];
  if (state.dailyError) notes.push(`Không đọc được snapshot ngày: ${state.dailyError}`);
  else if (plan.byMonth) { const have = keys.length - summary.unavailableDays.length; notes.push(`Doanh thu theo tháng lấy từ số chốt tháng của POS. Giờ cao điểm và món bán nhiều tính trên ${have} ngày có số liệu chi tiết.`); }
  else if (summary.unavailableDays.length) notes.push(summary.unavailableDays.length <= 7 ? `Chưa có snapshot ngày ${summary.unavailableDays.map(shortDay).join(", ")}: số liệu chưa đầy đủ, cần POS đồng bộ.` : `${summary.unavailableDays.length}/${keys.length} ngày chưa có số liệu ngày (quán chưa mở hoặc trước khi có đồng bộ).`);
  if (summary.needsFinalizeDays.length) notes.push(`Ngày ${summary.needsFinalizeDays.map(shortDay).join(", ")} chưa được POS chốt.`);
  if (hasSnapshot && shouldMarkSnapshotStale(dashboard.lastUpdatedAt)) notes.push("Snapshot POS cũ hơn 15 phút, cần kiểm tra máy POS.");
  $("#sales-notice").textContent = notes.join(" ");

  document.querySelectorAll("[data-sales-period]").forEach((button) => button.classList.toggle("active", button.dataset.salesPeriod === plan.period));
  document.querySelectorAll("[data-item-mode]").forEach((button) => button.classList.toggle("active", button.dataset.itemMode === state.itemMode));

  // Kỳ theo tháng: doanh thu lấy từ snapshot tháng (đủ cả những ngày trước khi có snapshot ngày).
  const series = plan.monthKeys.length ? monthSeries(plan.monthKeys, state.monthlyDocs, state.dailyDocs) : [];
  const fromMonths = plan.byMonth && series.some((m) => m.available);
  const totalRevenue = fromMonths ? series.reduce((t, m) => t + (m.revenue || 0), 0) : summary.totalRevenue;
  const totalBills = fromMonths ? series.reduce((t, m) => t + (m.paidBills || 0), 0) : summary.totalBills;
  const hasData = fromMonths || summary.days.some((day) => day.available);
  const cards = [
    [`Doanh thu đã chốt · ${plan.label}`, hasData ? money(totalRevenue) : "Chưa có dữ liệu"],
    ["Số bill đã thanh toán", hasData ? totalBills : "Chưa có dữ liệu"],
    ["Bill trung bình", hasData && totalBills ? money(Math.round(totalRevenue / totalBills)) : "Chưa có dữ liệu"],
  ];
  // So sánh: tháng này / tháng trước so với tháng liền trước; kỳ nhiều tháng thì trung bình và tháng cao nhất.
  if (plan.period === "thisMonth" || plan.period === "lastMonth") {
    const cur = plan.monthKeys[0];
    const [y, m] = cur.split("-").map(Number);
    const prevKey = `${new Date(y, m - 2, 1).getFullYear()}-${String(new Date(y, m - 2, 1).getMonth() + 1).padStart(2, "0")}`;
    const prev = monthSeries([prevKey], state.monthlyDocs, state.dailyDocs)[0];
    if (prev.available) {
      const pct = plan.period === "lastMonth" ? changePct(totalRevenue, prev.revenue) : null;
      cards.push([`Tháng ${Number(prevKey.slice(5))} cả tháng`, money(prev.revenue)]);
      if (pct !== null) cards.push(["So với tháng trước đó", `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`]);
      if (plan.period === "thisMonth") { const days = keys.length; const dim = new Date(y, m, 0).getDate(); cards.push(["Ước cả tháng (theo nhịp hiện tại)", money(Math.round(totalRevenue / days * dim))]); }
    }
  } else if (plan.byMonth) {
    const avail = series.filter((x) => x.available);
    if (avail.length) {
      const best = avail.reduce((a, b) => (b.revenue > a.revenue ? b : a));
      cards.push(["Trung bình / tháng", money(Math.round(totalRevenue / avail.length))], [`Tháng cao nhất · ${Number(best.monthKey.slice(5))}/${best.monthKey.slice(0, 4)}`, money(best.revenue)]);
    }
  }
  $("#sales-summary").replaceChildren(...cards.map(([label, value]) => {
    const node = $("#metric-template").content.firstElementChild.cloneNode(true);
    node.querySelector("p").textContent = label;
    node.querySelector("strong").textContent = value;
    return node;
  }));

  renderSalesBars(keys);
  const chart = $("#sales-chart");
  if (plan.byMonth) {
    const maxM = Math.max(1, ...series.filter((x) => x.available).map((x) => x.revenue));
    chart.classList.toggle("dense", series.length > 8);
    chart.innerHTML = series.map((x) => {
      const bar = x.available ? `<div class="bar${x.source === "daily" ? " partial" : ""}" style="height:${Math.max(2, Math.round(x.revenue / maxM * 100))}%"></div>` : '<div class="bar empty" style="height:100%"></div>';
      return `<div class="bar-col"><span class="bar-value">${x.available ? escapeHtml(compactMoney(x.revenue)) : "Chưa có"}</span><div class="bar-area">${bar}</div><small>T${Number(x.monthKey.slice(5))}</small><small>${x.available ? `${x.paidBills} bill` : ""}</small></div>`;
    }).join("");
    if (series.some((x) => x.source === "daily")) $("#sales-notice").textContent = [$("#sales-notice").textContent, "Cột nhạt: tháng chưa có snapshot tháng, đang cộng từ các ngày có số liệu."].filter(Boolean).join(" ");
  } else {
  chart.classList.toggle("dense", summary.days.length > 10);
  const max = Math.max(1, ...summary.days.filter((day) => day.available).map((day) => day.revenue));
  chart.innerHTML = summary.days.map((day) => {
    const bar = day.available
      ? `<div class="bar" style="height:${Math.max(2, Math.round(day.revenue / max * 100))}%"></div>`
      : '<div class="bar empty" style="height:100%"></div>';
    const value = day.available ? `${compactMoney(day.revenue)}` : "Chưa có";
    const bills = day.available ? `${day.paidBills} bill` : "";
    return `<div class="bar-col"><span class="bar-value">${escapeHtml(value)}</span><div class="bar-area">${bar}</div><small>${shortDay(day.dateKey)}</small><small>${escapeHtml(bills)}</small></div>`;
  }).join("");
  }

  const host = $("#sales-items");
  const table = (rows) => rows.length
    ? `<table class="sales-table"><thead><tr><th>Món</th><th>SL</th><th>Doanh thu</th><th>Tỷ trọng</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.qty}</td><td>${money(row.revenue)}</td><td>${percent(row.share)}</td></tr>`).join("")}</tbody></table>`
    : '<p class="muted empty-state">Chưa có món đã bán trong giai đoạn này.</p>';
  const dayBar = $("#sales-item-day");
  if (state.itemMode === "byDay") {
    // Từng ngày: chỉ hiện MỘT ngày (Hôm nay / Hôm qua / chọn ngày trong kỳ), không xổ dài mọi ngày.
    const days = aggregateItems(state.dailyDocs, keys, "byDay").reverse();
    const todayKey = dateKeyOf(new Date());
    const yesterdayKey = dateKeyOf(new Date(Date.now() - 86400000));
    if (!days.some((d) => d.dateKey === state.itemDay)) state.itemDay = days[0]?.dateKey || "";
    const quick = [[todayKey, "Hôm nay"], [yesterdayKey, "Hôm qua"]].filter(([k]) => days.some((d) => d.dateKey === k));
    dayBar.hidden = false;
    dayBar.innerHTML = `${quick.map(([k, label]) => `<button type="button" class="filter${state.itemDay === k ? " active" : ""}" data-item-day="${k}">${label}</button>`).join("")}<label class="inline-date">Ngày<select id="sales-item-day-select">${days.map((d) => `<option value="${d.dateKey}" ${d.dateKey === state.itemDay ? "selected" : ""}>${shortDay(d.dateKey)}</option>`).join("")}</select></label>`;
    const day = days.find((d) => d.dateKey === state.itemDay);
    host.innerHTML = day ? `<h3 class="sales-day-title">${shortDay(day.dateKey)}</h3>${table(day.rows)}` : table([]);
  } else if (state.itemMode === "output") {
    dayBar.hidden = true;
    host.innerHTML = outputView(keys);
  } else {
    dayBar.hidden = true;
    host.innerHTML = table(aggregateItems(state.dailyDocs, keys, "combined"));
  }
}

/** Công thức hiện hành của món theo tên: bản đã lưu, không có thì bản đề xuất tự động (tab Giá vốn). Đổi công thức là số tự cập nhật. */
function recipeInfoByName(name) {
  const norm = (t) => t.toLocaleLowerCase("vi").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
  const item = state.menuItems.find((m) => norm(m.name) === norm(name));
  const saved = item && state.recipes[item.id]?.lines;
  return saved ? { lines: saved, saved: true } : { lines: draftRecipeFor(name), saved: false };
}
let outputRecipeAsked = false;
/** Sản lượng thực làm (đã tách combo) + nguyên liệu tiêu hao theo công thức hiện hành. */
function outputView(keys) {
  if (!state.recipesLoaded && !outputRecipeAsked) { outputRecipeAsked = true; loadRecipes().then(() => { if (state.itemMode === "output") renderSalesSnapshots(); }); }
  const rowsOut = outputRows(state.dailyDocs, keys);
  if (!rowsOut.length) return '<p class="muted empty-state">Chưa có món đã bán trong giai đoạn này.</p>';
  const combos = comboCount(state.dailyDocs, keys);
  const main = `<table class="sales-table"><thead><tr><th>Món</th><th>Bán lẻ</th><th>Trong combo</th><th>Tổng làm</th></tr></thead><tbody>${rowsOut.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${r.retail}</td><td>${r.inCombo || "—"}</td><td><b>${r.total}</b></td></tr>`).join("")}</tbody></table>
    <p class="muted">Đã tách ${combos} combo thành món lẻ. Đây là số phần bếp thực sự làm, dùng cho tồn kho và nguyên liệu. Doanh thu giữ theo dòng bán (xem "Gộp cả giai đoạn").</p>`;
  const { usage, noRecipe, drafts } = materialConsumption(rowsOut, recipeInfoByName);
  const { costs } = currentCosts();
  const mats = Object.entries(usage).map(([id, qty]) => {
    const m = materialById.get(id);
    const c = costs[id];
    return { name: m?.name ?? id, base: m?.base ?? "", qty, value: c ? Math.round(qty * c.unitCost) : null };
  }).sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.qty - a.qty);
  const total = mats.reduce((t, m) => t + (m.value ?? 0), 0);
  const notes = [];
  if (!state.recipesLoaded) notes.push("Đang đọc công thức…");
  if (drafts.length) notes.push(`${drafts.length} món đang dùng công thức đề xuất tự động (chưa lưu): ${drafts.slice(0, 6).map(escapeHtml).join(", ")}${drafts.length > 6 ? "…" : ""}. Lưu hoặc chỉnh trong tab Giá vốn, số này tự cập nhật.`);
  if (noRecipe.length) notes.push(`${noRecipe.length} món chưa có công thức nên chưa tính nguyên liệu: ${noRecipe.slice(0, 6).map(escapeHtml).join(", ")}${noRecipe.length > 6 ? "…" : ""}.`);
  const matHtml = mats.length ? `<h3 class="sales-day-title">Nguyên liệu tiêu hao theo công thức</h3><table class="sales-table"><thead><tr><th>Vật tư</th><th>Tiêu hao</th><th>Giá trị</th></tr></thead><tbody>${mats.map((m) => `<tr><td>${escapeHtml(m.name)}</td><td>${formatBaseQty(m.qty, m.base)}</td><td>${m.value === null ? "chưa có giá" : money(m.value)}</td></tr>`).join("")}</tbody></table><p class="muted">Tổng giá trị nguyên liệu có giá: ${money(total)} (giá nhập bình quân 30 ngày). Là mức dùng theo định lượng công thức, chưa gồm hao hụt thực tế.</p>` : "";
  return main + matHtml + (notes.length ? `<p class="muted">${notes.join(" ")}</p>` : "");
}

/** Đọc snapshot ngày của cả kỳ bằng MỘT truy vấn theo dateKey (chỉ tính lượt đọc cho ngày có dữ liệu). Kỳ đã đọc không đọc lại. */
async function loadSalesPeriod() {
  const plan = periodPlan(state.salesPeriod);
  const from = plan.dayKeys[0];
  const to = plan.dayKeys[plan.dayKeys.length - 1];
  if (!from || (state.dailyLoadedFrom && state.dailyLoadedFrom <= from)) return;
  const until = state.dailyLoadedFrom && state.dailyLoadedFrom > from ? plan.dayKeys.find((k) => k >= state.dailyLoadedFrom) || to : to;
  try {
    const got = rows(await getDocs(query(collection(db, ...root, "dashboardDaily"), where("dateKey", ">=", from), where("dateKey", "<=", until), limit(400))));
    const byKey = new Map(got.map((d) => [d.dateKey || d.id, d]));
    for (const key of plan.dayKeys.filter((k) => k <= until)) if (!(key in state.dailyDocs) || byKey.has(key)) state.dailyDocs[key] = byKey.get(key) || null;
    state.dailyLoadedFrom = from;
    state.dailyError = "";
  } catch (error) { state.dailyError = error.code || error.message || "lỗi không rõ"; }
}
/** 14 ngày gần nhất để so sánh ngày với ngày và với cùng thứ tuần trước: một truy vấn theo dateKey, chỉ đọc ngày còn thiếu. */
async function loadCompareDocs() {
  const keys = compareKeys(dateKeyOf(new Date()));
  const missing = keys.filter((k) => !(k in state.dailyDocs));
  if (!missing.length) return;
  try {
    const got = rows(await getDocs(query(collection(db, ...root, "dashboardDaily"), where("dateKey", ">=", missing[0]), where("dateKey", "<=", missing[missing.length - 1]), limit(60))));
    const byKey = new Map(got.map((d) => [d.dateKey || d.id, d]));
    for (const k of missing) state.dailyDocs[k] = byKey.get(k) || null;
    state.compareError = "";
  } catch (error) { state.compareError = error.code || error.message || "lỗi không rõ"; }
}
function renderCompare() {
  const tiles = $("#cmp-week"), table = $("#cmp-table");
  if (!tiles || !table) return;
  if (!state.salesLoaded) { tiles.replaceChildren(); table.replaceChildren(); $("#cmp-note").textContent = "Bấm Làm mới để đọc số liệu so sánh."; return; }
  const todayKey = dateKeyOf(new Date());
  const w = weekTotals(state.dailyDocs, todayKey);
  let noteText = "so với 7 ngày trước";
  const fmtPct = (p) => p === null ? "" : `<small class="${p >= 0 ? "up" : "down"}">${p >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(p * 100))}% ${noteText}</small>`;
  const num = (x) => x.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  noteText = w.same ? "so với 7 ngày trước" : "(TB/ngày) so với 7 ngày trước";
  tiles.innerHTML = [
    ["Tổng số bill 7 ngày", String(w.cur.bills), w.pct.bills, `${w.cur.days} ngày có số liệu · trước: ${w.prev.bills} bill / ${w.prev.days} ngày`],
    ["Giá trị trung bình mỗi bill", money(w.cur.avgBill), w.pct.avgBill, `trước: ${money(w.prev.avgBill)}`],
    ["Tổng số món làm ra 7 ngày", num(w.cur.items), w.pct.items, `đã tách combo · trước: ${num(w.prev.items)} phần / ${w.prev.days} ngày`],
    ["Tổng doanh thu 7 ngày", money(w.cur.revenue), w.pct.revenue, `trước: ${money(w.prev.revenue)}`],
].map(([label, value, p, sub]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${fmtPct(p)}<small class="muted">${escapeHtml(sub)}</small></article>`).join("");
  document.querySelectorAll("[data-cmp-mode]").forEach((b) => b.classList.toggle("active", b.dataset.cmpMode === state.cmpMode));
  const list = compareRows(state.dailyDocs, todayKey, 7);
  const cell = (r, field, fmt) => {
    if (!r.m) return "—";
    const d = state.cmpMode === "week" ? r.vsWeek : r.vsPrev;
    const base = d ? `<small class="${d[field].diff >= 0 ? "up" : "down"}">${d[field].diff >= 0 ? "▲" : "▼"} ${d[field].pct === null ? "" : `${Math.abs(Math.round(d[field].pct * 100))}% · `}${fmt(d[field].base)}</small>` : '<small class="muted">chưa có số để so</small>';
    return `<b>${fmt(r.m[field])}</b>${base}`;
  };
  const f0 = (n) => String(Math.round(n));
  table.innerHTML = `<table class="sales-table cmp-table"><thead><tr><th>Ngày</th><th>Bill</th><th>Giá trị TB/bill</th><th>Món làm ra</th><th>Doanh thu</th></tr></thead><tbody>${list.slice().reverse().map((r) => `<tr class="${r.today ? "is-today" : ""}"><td><b>${r.weekday}</b> ${shortDay(r.dateKey)}${r.today ? "<small>đang diễn ra</small>" : ""}${state.cmpMode === "week" ? `<small>so ${shortDay(r.weekKey)}</small>` : `<small>so ${shortDay(r.prevKey)}</small>`}</td><td>${cell(r, "bills", f0)}</td><td>${cell(r, "avgBill", money)}</td><td>${cell(r, "items", f0)}</td><td>${cell(r, "revenue", money)}</td></tr>`).join("")}</tbody></table>`;
  const missing = list.filter((r) => !r.m).length;
  $("#cmp-note").textContent = state.compareError ? `Không đọc được số liệu so sánh: ${state.compareError}` : `Số này tính từ snapshot ngày do máy POS gửi. Hôm nay chưa chốt nên đang thấp hơn các ngày đã xong.${missing ? ` ${missing} ngày chưa có snapshot (quán nghỉ hoặc POS chưa đồng bộ), các ngày đó không tính là 0.` : ""} Món làm ra đã tách combo thành món lẻ.`;
}
async function loadDailyDocs() {
  // Chỉ đọc các ngày chưa có trong bộ nhớ: 3 hoặc 7 document, không đọc bill/order lịch sử.
  const missing = dailyKeys(7).filter((key) => !(key in state.dailyDocs));
  state.dailyError = "";
  await Promise.all(missing.map(async (key) => {
    try {
      const snapshot = await getDoc(doc(db, ...root, "dashboardDaily", key));
      state.dailyDocs[key] = snapshot.exists() ? snapshot.data() : null;
    } catch (error) {
      state.dailyDocs[key] = null; // lỗi đọc nghĩa là không có dữ liệu, tuyệt đối không hiển thị thành 0 đồng
      state.dailyError = error.code || error.message || "lỗi không rõ";
    }
  }));
}

/* ---------- Lịch sử bill trong ngày (chỉ Hôm nay / Hôm qua) ---------- */
const historyKey = (which) => (/^\d{4}-\d{2}-\d{2}$/.test(String(which)) ? which : keyOfTime(which === "yesterday" ? Date.now() - 86400000 : Date.now()));
const billFilter = () => ({ flow: $("#bill-filter-flow").value, method: $("#bill-filter-method").value, refund: $("#bill-filter-refund").value });

async function loadBillHistory(which, force = false) {
  const key = historyKey(which);
  if (!force && state.historyDocs[key]) return;
  const range = dayRange(key);
  if (!range) return;
  state.historyLoading = true;
  state.historyError = "";
  renderBillHistory();
  try {
    const q = (name, field, from, to, max) => getDocs(query(collection(db, ...root, name), where(field, ">=", from), where(field, "<", to), orderBy(field, "desc"), limit(max)));
    // Bill thuộc ngày MỞ bill (khách quen trả chậm qua hôm sau vẫn nằm đúng ngày bán); thanh toán đọc theo billId.
    const [billSnap, sessSnap] = await Promise.all([
      q("bills", "openedAt", range.from, range.to, 400),
      q("sessions", "openedAt", range.from - 86400000, range.to, 600),
    ]);
    const billIds = rows(billSnap).filter((b) => b.status === "PAID" || b.status === "REFUNDED").map((b) => String(b.id));
    const paySnaps = await Promise.all(chunk(billIds, 30).map((ids) => getDocs(query(collection(db, ...root, "payments"), where("billId", "in", ids)))));
    const paySnap = { docs: paySnaps.flatMap((x) => x.docs) };
    if (!state.historyTables) state.historyTables = rows(await getDocs(collection(db, ...root, "tableStatus")));
    state.historyDocs[key] = { bills: rows(billSnap), payments: rows(paySnap), sessions: rows(sessSnap), loadedAt: Date.now() };
  } catch (error) {
    state.historyError = error.code === "permission-denied" ? "Không có quyền đọc bill (cần mở quy tắc Firestore cho bills, payments, sessions)." : (error.message || "lỗi không rõ");
  }
  state.historyLoading = false;
  renderBillHistory();
  renderLiveSplit();
}

function billRowsForKey(key) {
  const data = state.historyDocs[key];
  if (!data) return null;
  const refunds = [...state.refunds, ...state.frozenRefundDocs.filter((r) => !state.refunds.some((x) => x.id === r.id))];
  return buildBillRows({ ...data, tables: state.historyTables || [], refunds, range: dayRange(key) });
}

function billHistoryRows() {
  return billRowsForKey(historyKey(state.historyDay));
}

/* Tab Bàn: tiền mặt / chuyển khoản hôm nay, tính từ từng bill đã thanh toán (cùng quy tắc với Lịch sử bill, bỏ bill đã hoàn). */
function renderLiveSplit() {
  const cashEl = $("#live-cash-today");
  const transferEl = $("#live-transfer-today");
  if (!cashEl || !transferEl) return;
  const all = billRowsForKey(keyOfTime(Date.now()));
  if (!all) { cashEl.textContent = "—"; transferEl.textContent = "—"; return; }
  const s = summarizeBillRows(all.filter((r) => !r.refund));
  cashEl.textContent = money(s.cash);
  transferEl.textContent = money(s.transfer);
  const note = $("#live-split-note");
  if (note) note.textContent = s.missingPayment ? `${s.missingPayment} bill chưa có dữ liệu thanh toán (POS chưa đồng bộ xong), số tiền mặt/CK có thể thiếu.` : "";
}

function renderBillHistory() {
  const notice = $("#bill-history-notice");
  const summaryHost = $("#bill-history-summary");
  const list = $("#bill-history-list");
  if (!list) return;
  notice.textContent = state.historyLoading ? "Đang đọc bill…" : state.historyError ? `Không đọc được lịch sử bill: ${state.historyError}` : "";
  const all = billHistoryRows();
  const data = all ? filterBillRows(all, billFilter()) : null;
  const filtered = all && data.length !== all.length;
  $("#bill-filter-note").textContent = all ? (filtered ? `Đang lọc: ${data.length}/${all.length} bill` : `${all.length} bill`) : "";
  if (!data) { summaryHost.replaceChildren(); list.innerHTML = state.historyLoading || state.historyError ? "" : '<p class="muted empty-state">Bấm Làm mới để đọc bill.</p>'; return; }
  // Doanh thu / tiền mặt / CK chỉ tính bill không hoàn (khớp doanh thu trên máy POS); bill đã hoàn hiện riêng.
  const s = summarizeBillRows(data.filter((r) => !r.refund));
  const refunded = data.filter((r) => r.refund);
  const tiles = [
    ["Số bill", refunded.length ? `${s.count} (+${refunded.length} đã hoàn)` : String(s.count)],
    ["Doanh thu", money(s.total)],
    ["Tiền mặt", money(s.cash)],
    ["Chuyển khoản", money(s.transfer)],
  ];
  if (refunded.length) tiles.push([`Đã hoàn (${refunded.length} bill)`, money(refunded.reduce((t, r) => t + r.refund.amount, 0))]);
  if (s.missingPayment + refunded.filter((r) => r.paymentMissing).length) s.missingPayment += refunded.filter((r) => r.paymentMissing).length;
  summaryHost.replaceChildren(...tiles.map(([label, value]) => {
    const node = $("#metric-template").content.firstElementChild.cloneNode(true);
    node.querySelector("p").textContent = label;
    node.querySelector("strong").textContent = value;
    return node;
  }));
  if (s.missingPayment) notice.textContent = `${s.missingPayment} bill chưa có dữ liệu thanh toán (POS chưa đồng bộ xong).`;
  list.innerHTML = data.length
    ? data.map((r) => {
      const method = r.paymentMissing ? "Chưa rõ" : methodLabel(r.method);
      const tags = `${r.flow === "prepaid" ? '<span class="bill-tag">Trả trước</span>' : '<span class="bill-tag postpaid">Trả sau</span>'}${r.refund ? `<span class="bill-tag warn">${r.refund.status === "FROZEN" ? "Hoàn CK · đóng băng" : "Đã hoàn"}</span>` : ""}`;
      return `<button type="button" class="bill-row" data-bill-id="${escapeHtml(r.id)}"><time>${timeLabel(r.closedAt)}</time><span class="bill-main"><strong>${escapeHtml(r.tableName)} · #${escapeHtml(r.billNo)}${tags}</strong><small>${escapeHtml(method)}${r.reference ? ` · ${escapeHtml(r.reference)}` : ""}</small></span><span class="bill-amount">${money(r.total)}<small>Xem chi tiết</small></span></button>`;
    }).join("")
    : `<p class="muted empty-state">${filtered || (all && all.length) ? "Không có bill nào khớp bộ lọc." : "Chưa có bill đã thanh toán trong ngày này."}</p>`;
}

async function openBillDetail(billId) {
  const row = (billHistoryRows() || []).find((r) => r.id === billId);
  if (!row) return;
  $("#bill-detail-title").textContent = `${row.tableName} · #${row.billNo}`;
  $("#bill-detail-meta").textContent = `Mở ${timeLabel(row.openedAt)} · thanh toán ${timeLabel(row.closedAt)}${row.flow === "prepaid" ? " · trả trước" : row.flow === "postpaid" ? " · trả sau" : ""}`;
  const body = $("#bill-detail-body");
  body.innerHTML = '<p class="muted">Đang đọc món…</p>';
  $("#bill-detail").showModal();
  try {
    if (!state.billDetailCache[row.id]) {
      const batches = rows(await getDocs(query(collection(db, ...root, "orderBatches"), where("sessionId", "==", row.sessionId), limit(60))));
      const ids = batches.map((b) => b.id);
      const items = (await Promise.all(chunk(ids, 30).map((part) => getDocs(query(collection(db, ...root, "orderItems"), where("batchId", "in", part)))))).flatMap((snap) => rows(snap));
      state.billDetailCache[row.id] = { batches, items };
    }
    const detail = buildBillDetail({ row, ...state.billDetailCache[row.id] });
    const groups = detail.hasItems
      ? detail.groups.filter((g) => g.lines.length).map((g) => `<div class="bill-group"><h3>Lần gọi ${g.sequence}${g.serviceNo ? ` · phiếu #${g.serviceNo}` : ""} · ${timeLabel(g.createdAt)}</h3>${g.lines.map((l) => `<div class="bill-line"><span>${l.qty}× ${escapeHtml(l.name)}${l.note ? `<small>${escapeHtml(l.note)}</small>` : ""}${l.combo ? `<small>${escapeHtml(l.combo)}</small>` : ""}</span><b>${money(l.amount)}</b></div>`).join("")}</div>`).join("")
      : '<p class="muted">Chưa có món đồng bộ cho bill này.</p>';
    const diff = detail.hasItems && detail.difference !== 0 ? `<div><span>${detail.difference < 0 ? "Giảm giá / điều chỉnh" : "Chênh lệch"}</span><b>${detail.difference < 0 ? "−" : "+"}${money(Math.abs(detail.difference))}</b></div>` : "";
    const pay = row.paymentMissing
      ? '<div class="bill-pay">Chưa có dữ liệu thanh toán.</div>'
      : `<div class="bill-pay"><div><span>Phương thức</span><b>${escapeHtml(methodLabel(row.method))}</b></div><div><span>Giờ thanh toán</span><b>${timeLabel(row.paidAt)}</b></div>${detail.hasItems ? `<div><span>Tạm tính món</span><b>${money(detail.itemsTotal)}</b></div>` : ""}${diff}<div><span>Tổng bill</span><b>${money(row.total)}</b></div><div><span>Đã thanh toán</span><b>${money(row.amountPaid)}</b></div>${row.method === "CASH" && row.cashReceived != null ? `<div><span>Khách đưa</span><b>${money(row.cashReceived)}</b></div><div><span>Trả lại</span><b>${money(row.change || 0)}</b></div>` : ""}${row.reference ? `<div><span>Mã tham chiếu</span><b>${escapeHtml(row.reference)}</b></div>` : ""}</div>`;
    const refund = row.refund ? `<div class="bill-pay"><div><span>Hoàn tiền</span><b>−${money(row.refund.amount)} · ${row.refund.method === "CASH" ? "tiền mặt" : "chuyển khoản"}</b></div><div><span>Trạng thái</span><b>${row.refund.status === "FROZEN" ? "Đóng băng, chờ hoàn CK" : "Đã hoàn xong"}</b></div>${row.refund.reason ? `<div><span>Lý do</span><b>${escapeHtml(row.refund.reason)}</b></div>` : ""}</div>` : "";
    body.innerHTML = groups + pay + refund;
  } catch (error) {
    body.innerHTML = `<p class="error">Không đọc được món: ${escapeHtml(error.code === "permission-denied" ? "thiếu quyền đọc orderBatches/orderItems" : error.message || "lỗi không rõ")}</p>`;
  }
}

function renderFinanceMetadata() {
  const keep = (select, options, fallback = "") => {
    const current = select.value;
    select.replaceChildren(...options);
    select.value = [...select.options].some((o) => o.value === current) ? current : fallback;
  };
  keep($("#entry-cost-code"), [new Option("Không mã", ""), ...state.costCodes.filter((x) => x.active !== false).map((x) => new Option(`${x.code} · ${x.name}`, x.id))]);
  keep($("#entry-purchase-category"), [new Option("Không phân mục", ""), ...state.purchaseCategories.filter((x) => x.active !== false).map((x) => new Option(x.name, x.id))]);
  keep($("#entry-asset-category"), [new Option("Chọn nhóm tài sản", ""), ...state.assetCategories.filter((x) => x.active !== false).map((x) => new Option(x.name, x.id))]);
  const people = state.profitPartners.filter((x) => x.active !== false);
  keep($("#entry-payer"), [new Option("Chưa xác định", ""), ...people.map((x) => new Option(x.name, x.name))]);
  keep($("#entry-partner"), [new Option("Chọn người", ""), ...people.map((x) => new Option(x.name, x.id))]);

  const payerNames = [...new Set([
    ...people.map((p) => normalizePayer(p.name)).filter(Boolean),
    ...expenseRows().map((p) => normalizePayer(p.paidByName)).filter(Boolean),
    ...state.movements.map((m) => normalizePayer(m.counterpartyName)).filter(Boolean),
  ])].sort((a,b)=>a.localeCompare(b,"vi"));
  const payerSelect = $("#payer-filter");
  const currentFilter = state.payerFilter;
  payerSelect.replaceChildren(new Option("Tất cả người chi", "ALL"), ...payerNames.map((name)=>new Option(name,name)));
  if ([...expenseRows().map((p)=>p.paidByName), ...state.movements.map((m)=>m.counterpartyName)].some((name)=>!normalizePayer(name))) payerSelect.append(new Option("Chưa xác định","UNKNOWN"));
  payerSelect.value = [...payerSelect.options].some((o)=>o.value===currentFilter) ? currentFilter : "ALL";
  state.payerFilter = payerSelect.value;
}

const REVIEW_TAG = { PENDING: ["Chờ duyệt · chưa tính", "warn"], REJECTED: ["Bị trả lại · chưa tính", "warn"], INITIAL: ["Ghi chép ban đầu · không tính", "warn"] };
const FUND_SHORT = { PERSONAL: "tiền cá nhân", SHOP_CASH: "quỹ quán", SHOP_BANK: "quỹ quán" };
/** Nhãn / lời nhắc / nút cho phiếu bị đánh dấu sai. */
function flagTag(rec) {
  const f = receiptFlag(rec);
  if (!f) return "";
  return f.status === "OPEN" ? ' <span class="bill-tag warn flag-tag">⚠ Cần sửa</span>' : ' <span class="bill-tag warn flag-tag">Đã sửa · chờ chủ quán duyệt lại</span>';
}
function flagNoteHtml(rec) {
  const f = receiptFlag(rec);
  if (!f) return "";
  const who = f.byName ? ` (${escapeHtml(f.byName)}, ${dateTime(f.at)})` : "";
  return f.status === "OPEN"
    ? `<small class="warn-text flag-note">⚠ Phiếu bị đánh dấu sai${who}: ${escapeHtml(f.reason || "cần kiểm tra lại")}. ${escapeHtml(rec.enteredByName || "Người tạo phiếu")} cần sửa lại, sau đó chủ quán duyệt lại mới tính vào chi phí.</small>`
    : `<small class="warn-text flag-note">Đã sửa theo yêu cầu "${escapeHtml(f.reason || "")}" · chờ chủ quán duyệt lại, chưa tính vào chi phí.</small>`;
}
function flagButtons(rec) {
  if (!canTreasure(state.role)) return "";
  const f = receiptFlag(rec);
  if (!f) return `<button type="button" class="text-button danger" data-flag-receipt="${escapeHtml(rec.id)}">Đánh dấu sai</button>`;
  if (f.status === "OPEN") return `<button type="button" class="text-button" data-unflag-receipt="${escapeHtml(rec.id)}">Gỡ đánh dấu</button>`;
  return "";
}
async function saveFlag(rec, flag, note) {
  const now = Date.now();
  const next = { ...rec, flag, updatedAt: Math.max(now, Number(rec.updatedAt || 0) + 1), ...(rec.source === "ANDROID_POS" ? { editedBy: "WEB_MANAGER" } : {}) };
  try {
    await setDoc(doc(db, ...root, receiptCollection(), rec.id), next);
    replaceLocalReceipt(next);
    state.openReceipts = state.openReceipts.map((x) => (x.id === rec.id ? next : x));
    render(); if (typeof renderReimbursements === "function") renderReimbursements();
    flashNote(note);
  } catch (error) { flashNote(`Không lưu được: ${error.message || error}`); }
}
function flagReceipt(id) {
  const rec = findReceipt(id);
  if (!rec || !canTreasure(state.role) || receiptFlag(rec)) return;
  const reason = window.prompt(`Phiếu ${receiptCode(rec)} sai ở đâu? (ví dụ: sai tên / sai nhóm vật tư, sai số lượng, thiếu hoá đơn)\nNgười tạo phiếu sẽ nhận lời nhắc và phải sửa lại.`, "");
  if (reason === null) return;
  if (!reason.trim()) { flashNote("Cần ghi lý do để người tạo phiếu biết sửa gì."); return; }
  saveFlag(rec, buildFlag({ reason, byName: myName(), byId: state.me?.id || "", now: Date.now() }), `Đã đánh dấu ${receiptCode(rec)} cần sửa; ${rec.enteredByName || "người tạo phiếu"} sẽ nhận lời nhắc.`);
}
function unflagReceipt(id) {
  const rec = findReceipt(id);
  if (!rec || !canTreasure(state.role) || !isFlagOpen(rec)) return;
  if (!window.confirm(`Gỡ đánh dấu sai của ${receiptCode(rec)}? (phiếu giữ nguyên, không cần sửa nữa)`)) return;
  saveFlag(rec, { ...rec.flag, status: "CLOSED", closedAt: Date.now(), closedBy: myName() }, `Đã gỡ đánh dấu ${receiptCode(rec)}.`);
}
function renderTransactions() {
  const term = normalizeMaterial($("#transaction-search")?.value || "");
  // Đang tìm theo từ khoá (vật tư, mã, ghi chú…) thì tìm trên toàn bộ thời gian, không bị giới hạn bởi kỳ đang chọn.
  const range = term ? { from: -Infinity, to: Infinity, label: "Tất cả" } : rangeForPeriod();
  // Mọi phiếu còn hiệu lực trong kỳ, kể cả chờ duyệt / bị trả lại (gắn nhãn, KHÔNG cộng vào tổng).
  const purchases = state.expenseReceipts
    .filter((r) => reviewStatus(r) !== "NONE" && inRange(Number(r.purchaseDate || 0), range))
    .filter((r) => !isInitialReceipt(r))
    .filter((r) => matchesPayer(state.payerFilter, r.enteredByName || ""))
    .map((r) => {
      const items = (r.items || []).map((i) => `${i.materialName}${i.qty ? ` ${Number(i.qty).toLocaleString("vi-VN")} ${i.unit || ""}` : ""}`.trim());
      const kind = kindOf(r);
      return { kind: "EXPENSE", at: Number(r.purchaseDate || 0), id: r.id, amount: Number(r.total || 0), review: reviewStatus(r),
        title: `${receiptCode(r)} · ${isSummaryReceipt(r) ? "Phiếu tổng" : kind === "MATERIAL" ? "Mua hàng" : KIND_SHORT[kind] || "Phiếu chi"}`,
        person: r.enteredByName || "", fund: FUND_SHORT[r.fundSource] || "chưa rõ nguồn tiền",
        note: [items.slice(0, 4).join(", ") + (items.length > 4 ? ` … +${items.length - 4} dòng` : ""), r.note].filter(Boolean).join(" · "),
        search: normalizeMaterial([receiptCode(r), r.enteredByName, r.note, ...items, ...(r.items || []).map((i) => i.materialCode)].join(" ")) };
    });
  const others = otherCosts()
    .filter((c) => inRange(c.at, range) && matchesPayer(state.payerFilter, c.payer))
    .map((c) => ({ kind: "EXPENSE", at: c.at, id: c.id, amount: c.amount, review: "APPROVED", title: EXPENSE_LABELS[c.category] || c.category, person: c.payer, fund: c.payer ? "tiền cá nhân" : "quỹ quán", note: [c.supplierName, c.note, "nhập ở Thu chi khác / máy POS"].filter(Boolean).join(" · "), readonly: true, search: normalizeMaterial([c.supplierName, c.note, c.payer].join(" ")) }));
  const movements = state.movements
    .filter((m) => inRange(m.occurredAt, range) && matchesPayer(state.payerFilter, m.counterpartyName))
    .map((m) => {
      // Hoàn ứng: liệt kê từng phiếu được hoàn kèm ngày mua, vì phiếu mua ngày khác không nằm trong kỳ đang xem.
      const paid = m.type === "PAYER_REIMBURSEMENT" ? state.expenseReceipts.filter((r) => r.reimbursement?.batchId === m.id) : [];
      const outside = paid.filter((r) => !inRange(Number(r.purchaseDate || 0), range));
      const detail = paid.length ? `Gồm ${paid.length} phiếu: ${paid.map((r) => `${receiptCode(r)} ${money(r.total)} (mua ${dateTime(r.purchaseDate).split(" ").pop()}${KIND_SHORT[kindOf(r)] && kindOf(r) !== "MATERIAL" ? ` · ${KIND_SHORT[kindOf(r)]}` : ""}${inRange(Number(r.purchaseDate || 0), range) ? "" : " · ngoài kỳ đang xem"})`).join("; ")}` : m.note || "";
      return { kind: "MOVEMENT", at: Number(m.occurredAt || 0), id: m.id, amount: Number(m.amount || 0), review: "APPROVED", title: MOVEMENT_LABELS[m.type] || m.type || "Dòng tiền", person: m.counterpartyName || "", note: detail, outside, reimb: m.type === "PAYER_REIMBURSEMENT", search: normalizeMaterial([m.note, m.counterpartyName, ...paid.map(receiptCode)].join(" ")) };
    });
  const ini = initialRecords();
  const iniRows = [
    ...ini.receipts.filter((r) => inRange(Number(r.purchaseDate || 0), range) && matchesPayer(state.payerFilter, r.enteredByName || "")).map((r) => ({ kind: "EXPENSE", at: Number(r.purchaseDate || 0), id: r.id, amount: Number(r.total || 0), review: "INITIAL", title: `${receiptCode(r)} · ${EXPENSE_LABELS[receiptCategory(r)] || "Đầu tư ban đầu"}`, person: r.enteredByName || "", fund: FUND_SHORT[r.fundSource] || "", note: (r.items || []).map((i) => i.materialName).join(", "), search: normalizeMaterial([receiptCode(r), r.enteredByName, r.note, ...(r.items || []).map((i) => i.materialName), ...(r.items || []).map((i) => i.materialCode)].join(" ")) })),
    ...ini.others.filter((c) => inRange(c.at, range) && matchesPayer(state.payerFilter, c.payer)).map((c) => ({ kind: "EXPENSE", at: c.at, id: c.id, amount: c.amount, review: "INITIAL", title: EXPENSE_LABELS[c.category] || c.category, person: c.payer, fund: c.payer ? "tiền cá nhân" : "quỹ quán", note: [c.supplierName, c.note].filter(Boolean).join(" · "), readonly: true, search: normalizeMaterial([c.note, c.supplierName, c.payer].join(" ")) })),
  ];
  const iniTotal = iniRows.reduce((t, r) => t + r.amount, 0);
  let rows0 = [...purchases, ...others, ...movements, ...(state.showInitial ? iniRows : [])].sort((a, b) => b.at - a.at);
  const reimbRows = movements.filter((m) => m.reimb);
  const outsideAll = reimbRows.flatMap((m) => m.outside);
  const reimbHint = reimbRows.length ? `<p class="muted">Hoàn ứng trong kỳ: ${money(reimbRows.reduce((t, m) => t + m.amount, 0))}${outsideAll.length ? ` · trong đó ${outsideAll.length} phiếu mua ngày khác (${money(outsideAll.reduce((t, r) => t + Number(r.total || 0), 0))}: ${outsideAll.map((r) => `${receiptCode(r)} mua ${dateTime(r.purchaseDate).split(" ").pop()}`).join(", ")}) không hiện trong danh sách chi của kỳ này vì danh sách tính theo <b>ngày mua</b>` : ""}. Bấm <b>Thu / vốn / hoàn ứng</b> để xem chi tiết.</p>` : "";
  if (state.transactionKind !== "ALL") rows0 = rows0.filter((r) => r.kind === state.transactionKind);
  if (term) rows0 = rows0.filter((r) => r.search.includes(term));
  // Tổng theo người chi (chỉ phiếu chi đã duyệt), để xem ai chi bao nhiêu trong kỳ.
  const spend = rows0.filter((r) => r.kind === "EXPENSE" && r.review !== "INITIAL");
  const byPerson = new Map();
  for (const r of spend) {
    const key = r.person || "Chưa rõ";
    const x = byPerson.get(key) || { name: key, count: 0, total: 0, pending: 0 };
    x.count += 1;
    if (r.review === "APPROVED") x.total += r.amount; else x.pending += r.amount;
    byPerson.set(key, x);
  }
  const people = [...byPerson.values()].sort((a, b) => b.total - a.total);
  const approvedTotal = people.reduce((t, x) => t + x.total, 0);
  const pendingTotal = people.reduce((t, x) => t + x.pending, 0);
  $("#payer-breakdown").innerHTML = spend.length ? `<p class="reimb-sub">${spend.length} phiếu chi · đã duyệt ${money(approvedTotal)}${pendingTotal ? ` · chờ duyệt / trả lại ${money(pendingTotal)} (chưa tính)` : ""}</p>${people.map((x) => `<button type="button" class="paylist-row" data-pick-payer="${escapeHtml(x.name)}"><span><strong>${escapeHtml(x.name)}</strong> · ${x.count} phiếu</span><span><b>${money(x.total)}</b>${x.pending ? `<small class="warn-text"> +${money(x.pending)} chờ</small>` : ""}</span></button>`).join("")}` : "";
  if (reimbHint) $("#payer-breakdown").insertAdjacentHTML("beforeend", reimbHint);
  if (iniRows.length) $("#payer-breakdown").insertAdjacentHTML("beforeend", `<p class="muted">${iniRows.length} ghi chép đầu tư ban đầu / chi trước tháng khai trương · ${money(iniTotal)} · <b>không tính</b> vào chi phí hay đầu tư (vốn ban đầu dùng một con số ở mục Vốn đầu tư ban đầu & hoàn vốn). <button type="button" class="text-button" data-toggle-initial>${state.showInitial ? "Ẩn" : "Xem"}</button></p>`);
  const host = $("#transactions");
  if (!rows0.length) {
    host.innerHTML = term ? '<p class="muted empty-state">Không có phiếu nào khớp từ khoá (đã tìm trên toàn bộ thời gian, theo người chi đang chọn).</p>' : '<p class="muted empty-state">Không có phiếu nào khớp kỳ / người chi / từ khoá đã chọn.</p>';
    return;
  }
  host.replaceChildren(...rows0.slice(0, 300).map((r) => {
    const node = document.createElement("article");
    node.className = "transaction-card";
    const meta = [dateTime(r.at), r.person, r.kind === "EXPENSE" ? r.fund : ""].filter(Boolean).join(" · ");
    const rec = r.kind === "EXPENSE" && !r.readonly ? findReceipt(r.id) : null;
    const tag = (REVIEW_TAG[r.review] ? ` <span class="bill-tag ${REVIEW_TAG[r.review][1]}">${REVIEW_TAG[r.review][0]}</span>` : "") + flagTag(rec);
    const flagNote = rec ? flagNoteHtml(rec) : "";
    const actions = rec ? `<div class="row-actions">${flagButtons(rec)}<button type="button" class="text-button" data-edit-receipt="${escapeHtml(r.id)}">${canEditReceipt(rec) ? "Xem / sửa" : "Xem chi tiết"}</button>${canEditReceipt(rec) && !isPaidOut(rec) ? `<button type="button" class="text-button danger" data-cancel-receipt="${escapeHtml(r.id)}">Huỷ phiếu</button>` : ""}</div>` : "";
    node.innerHTML = `<div><strong>${escapeHtml(r.title)}</strong>${tag}<small>${escapeHtml(meta)}</small><p>${escapeHtml(r.note)}</p>${flagNote}${actions}</div><b${r.review !== "APPROVED" ? ' class="muted"' : ""}>${money(r.amount)}</b>`;
    return node;
  }));
}
$("#transaction-search").addEventListener("input", renderTransactions);
$("#payer-breakdown").addEventListener("click", (e) => {
  if (e.target.closest("[data-toggle-initial]")) { state.showInitial = !state.showInitial; renderTransactions(); return; }
  const name = e.target.closest("[data-pick-payer]")?.dataset.pickPayer;
  if (!name) return;
  const sel = $("#payer-filter");
  const opt = [...sel.options].find((o) => o.textContent === name || o.value === name || normalizePayer(o.value) === normalizePayer(name));
  if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change")); }
});

function showDetail(record) {
  $("#detail-title").textContent = record.table.name || "Bàn";
  $("#detail-meta").textContent = `Mở bàn: ${dateTime(record.session?.openedAt || record.table.openedAt)} · ${statusText(record.batches.map((batch) => batch.status))}`;
  const list = $("#detail-items");
  list.replaceChildren(...record.items.map((item) => {
    const row = document.createElement("li");
    const note = item.note ? ` · ${item.note}` : "";
    row.innerHTML = `<span>${item.qty}× ${escapeHtml(item.itemName || "Món")}${escapeHtml(note)}</span><b>${money(Number(item.qty || 0) * Number(item.unitPrice || 0))}</b>`;
    return row;
  }));
  if (!record.items.length) list.innerHTML = "<li><span>Chưa có món đồng bộ (cần cập nhật app POS bản mới)</span></li>";
  $("#detail-total").textContent = `Tạm tính ${money(record.total)}`;
  $("#table-detail").showModal();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderEntryType() {
  const type = $("#entry-type").value;
  const cfg = TRANSACTION_TYPES[type] || TRANSACTION_TYPES.OPERATING_EXPENSE;
  $("#purchase-fields").hidden = !cfg.purchase;
  $("#movement-fields").hidden = Boolean(cfg.purchase);
  $("#expense-category-wrap").hidden = type !== "OPERATING_EXPENSE";
  $("#purchase-category-wrap").hidden = type !== "OPERATING_EXPENSE";
  $("#asset-fields").hidden = !cfg.asset;
  $("#movement-partner-wrap").hidden = !cfg.partner;
  if (cfg.expenseCategory) $("#entry-category").value = cfg.expenseCategory;
  const payroll = $("#entry-category").value === "PAYROLL";
  $("#entry-item-label").firstChild.textContent = payroll ? "Người nhận lương / nhân sự" : "Mặt hàng / nội dung chi";
  $("#entry-price-label").firstChild.textContent = payroll ? "Đơn giá / ngày công" : "Đơn giá";
  recalcEntryTotal();
}
function recalcEntryTotal() {
  const qty = Number($("#entry-qty").value || 0);
  const price = Number($("#entry-unit-price").value || 0);
  $("#entry-total").textContent = money(Math.round(qty * price));
}
const kindOf = (receipt) => (NON_MATERIAL.has(receipt?.expenseCategory) ? receipt.expenseCategory : "MATERIAL");
/** Phiếu vật tư: dùng cho giá vốn, giá nguyên liệu, soát phân nhóm (không lẫn thi công, sửa chữa...). */
const materialReceipts = () => state.expenseReceipts.filter((r) => kindOf(r) === "MATERIAL");
const MATERIAL_GROUPS = [["THIT","Thịt, gia cầm"],["RAU","Rau, củ, quả"],["BUN","Bún, bánh đa, tinh bột"],["BANH","Bánh mì, nguyên liệu bánh"],["SUA","Trứng, sữa, bơ"],["GIAVI","Gia vị, nước dùng"],["CAPHE","Cà phê"],["TRA","Trà, nguyên liệu pha trà"],["MUT","Siro, mứt, nguyên liệu bổ sung"],["NUOC","Đồ uống đóng chai"],["DA","Đá, nước tinh khiết"],["BAOBI","Bao bì, vật tư phục vụ"],["VESINH","Vệ sinh, vật tư tiêu hao"],["KHAC","Vật tư khác"]];
// Cùng bộ đơn vị với danh mục vật tư chuẩn (giá vốn quy đổi theo đúng các đơn vị này).
const MATERIAL_UNITS = ["kg","g","lít","ml","hộp","thùng","chai","can","quả","vỉ","khay","bó","túi","gói","cái","ổ","cây","bao","bình","con","lon","suất"];
function savedMaterials() { try { return JSON.parse(localStorage.getItem(`pos0210.materials.${state.user?.uid}`) || "[]"); } catch { return []; } }
function rememberMaterials(items) { const records = savedMaterials(); for (const item of items) { const name = String(item.materialName || "").trim(); if (!name) continue; const index = records.findIndex((r) => normalizeMaterial(r.materialName) === normalizeMaterial(name)); const record = { materialName: name, materialCode: item.materialCode, expenseGroup: item.expenseGroup, unit: item.unit }; if (index >= 0) records[index] = record; else records.push(record); } localStorage.setItem(`pos0210.materials.${state.user?.uid}`, JSON.stringify(records.slice(-500))); }
function materialOptions(field, search) {
  const values = field === "expenseGroup" ? MATERIAL_GROUPS.map(([, name]) => name) : field === "unit" ? MATERIAL_UNITS : [...new Set([...savedMaterials().map((x) => x.materialName), ...MATERIALS.map((m) => m.name), ...(expenseDraft?.items || []).map((x) => x.materialName)].filter(Boolean))];
  return filterMaterialOptions(values, search);
}
/* Gợi ý khi nhập phiếu: ô nổi tự vẽ (không dùng datalist của trình duyệt vì nó không bỏ dấu, hay không hiện trên điện thoại). */
const suggest = { input: null, items: [], active: -1 };
function suggestEl() {
  let ul = document.getElementById("expense-suggest");
  if (!ul) {
    ul = document.createElement("ul");
    ul.id = "expense-suggest"; ul.className = "recipe-results suggest-float"; ul.setAttribute("role", "listbox"); ul.hidden = true;
    ul.addEventListener("mousedown", (event) => event.preventDefault()); // bấm vào gợi ý không làm ô nhập mất focus
    ul.addEventListener("click", (event) => { const b = event.target.closest("[data-suggest]"); if (b) pickSuggestion(Number(b.dataset.suggest)); });
    $("#expense-dialog").appendChild(ul);
  }
  return ul;
}
function hideSuggest() { const ul = document.getElementById("expense-suggest"); if (ul) ul.hidden = true; suggest.input = null; suggest.items = []; suggest.active = -1; }
function suggestPool(field) {
  if (field === "expenseGroup") return MATERIAL_GROUPS.map(([, name]) => ({ name, dynamic: false }));
  if (field === "unit") return MATERIAL_UNITS.map((name) => ({ name, dynamic: false }));
  const mine = new Set(savedMaterials().map((x) => x.materialName).filter(Boolean));
  const all = [...mine, ...MATERIALS.filter((m) => m.kind !== "VH" && !m.stub).map((m) => m.name), ...(expenseDraft?.items || []).map((x) => x.materialName)].filter(Boolean);
  const dyn = new Set([...mine, ...MATERIALS.filter((m) => m.dynamic).map((m) => m.name)]);
  return [...new Set(all)].map((name) => ({ name, dynamic: dyn.has(name) }));
}
function showSuggest(input) {
  if (!input?.dataset?.field) return;
  const term = input.value.trim();
  const found = searchMaterials(suggestPool(input.dataset.field), term, 30).filter((m) => normalizeMaterial(m.name) !== normalizeMaterial(term));
  suggest.input = input; suggest.items = found.map((m) => m.name); suggest.active = found.length ? 0 : -1;
  const ul = suggestEl();
  if (!found.length) { ul.hidden = true; return; }
  ul.innerHTML = found.map((m, i) => `<li role="option"><button type="button" data-suggest="${i}" class="${i === 0 ? "active" : ""}"><span>${escapeHtml(m.name)}</span></button></li>`).join("");
  const r = input.getBoundingClientRect();
  const below = window.innerHeight - r.bottom;
  const up = below < 180 && r.top > below;
  ul.style.left = `${Math.max(8, r.left)}px`; ul.style.width = `${Math.min(r.width, window.innerWidth - 16)}px`;
  ul.style.maxHeight = `${Math.max(120, Math.min(280, (up ? r.top : below) - 12))}px`;
  if (up) { ul.style.top = "auto"; ul.style.bottom = `${window.innerHeight - r.top + 4}px`; } else { ul.style.bottom = "auto"; ul.style.top = `${r.bottom + 4}px`; }
  ul.hidden = false;
}
function pickSuggestion(index) {
  const input = suggest.input, value = suggest.items[index];
  if (!input || value === undefined) return;
  input.value = value;
  hideSuggest();
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  hideSuggest(); // sự kiện input ở trên có thể vẽ lại gợi ý, ẩn lần nữa sau khi đã chọn
}
function updateMaterialSuggestions(input) {
  const list = document.getElementById(input.getAttribute("list"));
  if (list) list.replaceChildren(); // bỏ gợi ý mặc định của trình duyệt, dùng ô gợi ý ở trên
  if (document.activeElement === input) showSuggest(input);
}
function setupMaterialSuggestions() {
  document.querySelectorAll("#expense-lines input[list]").forEach((input) => { const list = document.getElementById(input.getAttribute("list")); if (list) list.replaceChildren(); });
}
function groupLabel(value) { return MATERIAL_GROUPS.find(([code, label]) => code === value || label === value)?.[1] || ({ FOOD: "Thịt, gia cầm", DRINK: "Đồ uống đóng chai", SUPPLIES: "Bao bì, vật tư phục vụ", OTHER: "Vật tư khác" })[value] || value || "Vật tư khác"; }
function groupCode(value) { return MATERIAL_GROUPS.find(([code, label]) => code === value || label === value)?.[0] || "KHAC"; }
function nextMaterialCode(group) {
  const prefix = groupCode(group) + "-";
  return prefix + uuid().replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase();
}
function expenseLineMarkup(item) {
  const safe = (value) => escapeHtml(String(value ?? "")).replace(/"/g, "&quot;");
  const id = safe(item.id);
  const group = item.expenseGroup ? groupLabel(item.expenseGroup) : "";
  return `<article class="expense-line${NON_MATERIAL.has(item.kind) ? " non-material" : ""}" data-line-id="${id}" data-group-touched="${item.groupTouched ? 1 : 0}"><label class="kind-row">Loại chi<select data-field="kind" data-kind-touched="${item.kindTouched ? 1 : 0}">${EXPENSE_KINDS.map(([k, label]) => `<option value="${k}" ${k === (item.kind || "MATERIAL") ? "selected" : ""}>${label}</option>`).join("")}</select></label><label><span data-name-label>${NON_MATERIAL.has(item.kind) ? "Nội dung" : "Tên vật tư"}</span><input data-field="materialName" list="materials-${id}" maxlength="120" value="${safe(item.materialName)}" required autocomplete="off" /><datalist id="materials-${id}"></datalist></label><div class="two-col material-only"><label>Mã vật tư<input data-field="materialCode" maxlength="40" value="${safe(item.materialCode)}" readonly /></label><label>Nhóm vật tư<input data-field="expenseGroup" list="groups-${id}" value="${safe(group)}" required autocomplete="off" /><datalist id="groups-${id}"></datalist></label></div><p class="rule-hint material-only" data-hint aria-live="polite"></p><div class="two-col"><label>Số lượng<input data-field="qty" type="number" min="0.001" step="0.001" value="${Number(item.qty || 0)}" /></label><label>Đơn vị tính<input data-field="unit" list="units-${id}" maxlength="20" value="${safe(item.unit || "kg")}" required autocomplete="off" /><datalist id="units-${id}"></datalist></label></div><label>Đơn giá<input data-field="unitPrice" type="number" min="0" step="1" value="${Number(item.unitPrice || 0)}" /></label><button type="button" class="text-button" data-remove-line="${id}">Bỏ dòng</button></article>`;
}
function refreshRuleHint(line) {
  const hint = line.querySelector("[data-hint]");
  if (!hint) return;
  const name = line.querySelector("[data-field=materialName]").value;
  if (!name.trim()) { hint.textContent = ""; hint.className = "rule-hint"; return; }
  const s = classifyMaterial(name, allRules());
  const chosen = groupCodeOrNull(line.querySelector("[data-field=expenseGroup]").value);
  let text, warn = false;
  if (s.status === "learned" || s.status === "matched") {
    const label = groupLabelOf(s.group);
    if (!chosen) text = `Gợi ý: ${label}`;
    else if (chosen === s.group) text = `✓ Khớp quy tắc${s.status === "matched" ? ` (từ khoá “${s.matched}”)` : " (danh mục vật tư / đã học)"}: ${label}`;
    else { text = `Khác gợi ý (${label}). Lựa chọn của bạn sẽ được ghi nhớ cho lần sau.`; warn = true; }
  } else if (s.status === "ambiguous") { text = `Tên này có thể thuộc: ${s.groups.map(groupLabelOf).join(" hoặc ")}. Hãy chọn đúng nhóm.`; warn = true; }
  else { text = chosen ? "Chưa có quy tắc cho tên này; lựa chọn của bạn sẽ được ghi nhớ." : "Chưa khớp quy tắc nào, hãy chọn nhóm vật tư."; warn = true; }
  // Đơn vị phải quy đổi được thì mới ra giá vốn vật tư.
  const std = matchMaterial({ materialName: name });
  const unit = line.querySelector("[data-field=unit]")?.value;
  if (std && unit && !unitFactor(std, unit)) { text += ` · Đơn vị “${unit}” chưa quy đổi được cho ${std.name}: dùng ${std.units.map((u) => u.unit).join(", ")}.`; warn = true; }
  hint.textContent = text;
  hint.className = warn ? "rule-hint warn" : "rule-hint";
}
function renderClassificationReview() {
  const host = $("#review-list");
  const summaryHost = $("#review-summary");
  if (!host) return;
  const data = reviewItems(materialReceipts(), allRules());
  const s = summarizeReview(data);
  const tiles = [
    ["Số dòng vật tư (phiếu đã tải)", String(s.total)],
    ["Khớp quy tắc", s.okRate == null ? "—" : `${Math.round(s.okRate * 100)}% (${s.ok})`],
    ["Khác gợi ý", String(s.mismatch)],
    ["Mơ hồ / chưa khớp", `${s.ambiguous} / ${s.unmatched}`],
  ];
  summaryHost.replaceChildren(...tiles.map(([label, value]) => {
    const node = $("#metric-template").content.firstElementChild.cloneNode(true);
    node.querySelector("p").textContent = label;
    node.querySelector("strong").textContent = value;
    return node;
  }));
  const labelOf = { mismatch: "Khác gợi ý", ambiguous: "Mơ hồ", unmatched: "Chưa có quy tắc" };
  const issues = data.filter((r) => r.status !== "ok").slice(0, 100);
  const note = state.rulesError ? `<p class="error">${escapeHtml(state.rulesError)}</p>` : "";
  host.innerHTML = note + (issues.length
    ? issues.map((r) => `<article class="review-row"><div><strong>${escapeHtml(r.name || "—")}</strong><small>${dateTime(r.date)} · ${money(r.amount)}</small><small>Đang ở: ${escapeHtml(r.stored ? groupLabelOf(r.stored) : "chưa rõ")}${r.status === "mismatch" ? ` · gợi ý: ${escapeHtml(groupLabelOf(r.suggested))}` : r.status === "ambiguous" ? ` · có thể: ${escapeHtml(r.candidates.map(groupLabelOf).join(" / "))}` : ""}</small></div><div class="review-actions"><span class="bill-tag warn">${labelOf[r.status]}</span><button type="button" class="text-button" data-edit-receipt="${escapeHtml(r.receiptId)}">${canEditReceipt(findReceipt(r.receiptId)) ? "Sửa phiếu" : "Xem"}</button></div></article>`).join("")
    : (s.total ? '<p class="muted empty-state">Mọi dòng trong 7 ngày đều khớp quy tắc.</p>' : '<p class="muted empty-state">Chưa có phiếu chi trong 7 ngày.</p>'));
}
/** Duyệt bỏ qua: vật tư này tính định mức theo túi / gói của nó, từ nay (kể cả lần nhập sau) không vào diện mơ hồ nữa. */
async function approveVague(key) {
  if (!canTreasure(state.role)) return;
  const live = state.expenseReceipts.filter((r) => reviewStatus(r) !== "NONE" && !isInitialReceipt(r));
  const row = vagueMaterials(live, approvedKeys(state.unitOk)).rows.find((x) => x.key === key);
  if (!row) return;
  if (!window.confirm(`Duyệt bỏ qua "${row.name}"? Vật tư này sẽ tính định mức theo ${row.unitList.map((u) => u.unit).join(" / ")} của nó, và các lần nhập sau không bị coi là mơ hồ nữa.`)) return;
  const now = Date.now();
  const id = `u_${ruleIdFor(key).slice(2)}`;
  const rule = { id, kind: "UNIT_OK", key, name: row.name, code: row.code || "", units: row.unitList.map((u) => u.unit), updatedAt: now, updatedByName: myName() };
  try {
    await setDoc(doc(db, ...root, "expenseRules", id), rule);
    state.unitOk = [...state.unitOk.filter((x) => x.id !== id), rule];
    renderVagueMaterials();
    flashNote(`Đã duyệt bỏ qua "${row.name}".`);
  } catch (error) { flashNote(`Chưa lưu được: ${error.message || error}`); }
}
function renderVagueMaterials() {
  const host = $("#vague-list"), sumHost = $("#vague-summary");
  if (!host || !sumHost) return;
  const live = state.expenseReceipts.filter((r) => reviewStatus(r) !== "NONE" && !isInitialReceipt(r));
  const { rows, hintedCount, approvedCount } = vagueMaterials(live, approvedKeys(state.unitOk));
  const pack = rows.filter((x) => x.kind === "packaged"), unk = rows.length - pack.length;
  sumHost.replaceChildren(...[["Vật tư mơ hồ", rows.length], ["Theo túi / gói / hộp…", pack.length], ["Đơn vị lạ / trống", unk], ["Đã ghi định lượng trong tên", hintedCount], ["Đã duyệt bỏ qua", approvedCount]].map(([label, value]) => {
    const node = $("#metric-template").content.firstElementChild.cloneNode(true);
    node.querySelector("p").textContent = label;
    node.querySelector("strong").textContent = String(value);
    return node;
  }));
  host.innerHTML = rows.length ? rows.slice(0, 200).map((x) => `<article class="review-row"><div><strong>${escapeHtml(x.name)}</strong><small>${x.code ? `Mã ${escapeHtml(x.code)} · ` : "Chưa có mã · "}${x.receiptCount} phiếu · ${money(x.amount)} · gần nhất ${dateTime(x.lastAt)}</small><small>Đã mua: ${x.unitList.map((u) => `${Number(u.qty).toLocaleString("vi-VN")} ${escapeHtml(u.unit)}`).join(" · ")}</small></div><div class="review-actions"><span class="bill-tag warn">${x.kind === "packaged" ? "Chưa rõ 1 đơn vị nặng bao nhiêu" : "Đơn vị lạ"}</span>${canTreasure(state.role) ? `<button type="button" class="text-button" data-vague-ok="${escapeHtml(x.key)}">Duyệt bỏ qua</button>` : ""}<button type="button" class="text-button" data-vague-search="${escapeHtml(x.code || x.name)}">Xem các phiếu</button><button type="button" class="text-button" data-edit-receipt="${escapeHtml(x.lastReceiptId)}">Sửa phiếu gần nhất</button></div></article>`).join("") + (rows.length > 200 ? `<p class="muted">Hiện 200 / ${rows.length} vật tư đầu theo tổng tiền.</p>` : "")
    : '<p class="muted empty-state">Không có vật tư nào tính theo đơn vị mơ hồ.</p>';
  if (state.unitOk.length) host.insertAdjacentHTML("beforeend", `<details class="vague-approved"><summary>Đã duyệt bỏ qua · ${state.unitOk.length} vật tư</summary>${state.unitOk.map((x) => `<div class="reimb-receipt"><div><strong>${escapeHtml(x.name)}</strong><small>${x.code ? `Mã ${escapeHtml(x.code)} · ` : ""}tính theo ${escapeHtml((x.units || []).join(" / ") || "đơn vị riêng")} · ${escapeHtml(x.updatedByName || "")}</small></div>${canTreasure(state.role) ? `<div class="row-actions"><button type="button" class="text-button" data-vague-revoke="${escapeHtml(x.id)}">Bỏ duyệt</button></div>` : ""}</div>`).join("")}</details>`);
}
async function revokeVague(id) {
  const rule = state.unitOk.find((x) => x.id === id);
  if (!rule || !canTreasure(state.role)) return;
  if (!window.confirm(`Bỏ duyệt "${rule.name}"? Vật tư này sẽ lại vào diện mơ hồ nếu vẫn tính theo túi / gói.`)) return;
  const revoked = { ...rule, kind: "UNIT_OK_REVOKED", updatedAt: Date.now(), updatedByName: myName() };
  try { await setDoc(doc(db, ...root, "expenseRules", id), revoked); state.unitOk = state.unitOk.filter((x) => x.id !== id); renderVagueMaterials(); flashNote(`Đã bỏ duyệt "${rule.name}".`); }
  catch (error) { flashNote(`Chưa lưu được: ${error.message || error}`); }
}
$("#vague-list").addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit-receipt]");
  if (edit) { openReceiptEditor(edit.dataset.editReceipt); return; }
  const revoke = event.target.closest("[data-vague-revoke]");
  if (revoke) { revokeVague(revoke.dataset.vagueRevoke); return; }
  const ok = event.target.closest("[data-vague-ok]");
  if (ok) { approveVague(ok.dataset.vagueOk); return; }
  const find = event.target.closest("[data-vague-search]");
  if (!find) return;
  const box = $("#transaction-search");
  box.value = find.dataset.vagueSearch;
  renderTransactions();
  box.scrollIntoView({ behavior: "smooth", block: "center" });
});
function renderExpenseDraft() {
  if (!expenseDraft) return;
  $("#expense-date").value = localDateTimeInput(new Date(expenseDraft.purchaseDate));
  $("#expense-note").value = expenseDraft.note || "";
  if (isBuyer()) expenseDraft.enteredByName = myName();
  $("#expense-payer").value = expenseDraft.enteredByName || myName();
  $("#expense-payer").readOnly = isBuyer();
  $("#expense-fund").value = expenseDraft.fundSource ?? FUND_PERSONAL;
  expenseDraft.items = expenseDraft.items.map((item) => ({ ...item, kind: item.kind || detectKind(item.materialName, knownMaterial) }));
  $("#expense-lines").innerHTML = expenseDraft.items.map(expenseLineMarkup).join("");
  applyKindUi();
  setupMaterialSuggestions();
  document.querySelectorAll("#expense-lines .expense-line").forEach(refreshRuleHint);
  $("#expense-total").textContent = money(calculateReceiptTotal(expenseDraft.items));
  updateGapNote();
  if (!editingReceipt) localStorage.setItem(`pos0210.expense-draft.${state.user.uid}`, JSON.stringify(expenseDraft));
}
/** Tên đã có trong danh mục vật tư chuẩn hoặc vật tư từng nhập: chắc chắn là mua hàng. */
const knownMaterial = (name) => {
  const n = normalizeMaterial(name);
  if (!n) return false;
  const std = matchMaterial({ materialName: name });
  return Boolean((std && normalizeMaterial(std.name) === n) || savedMaterials().some((m) => normalizeMaterial(m.materialName) === n) || MATERIALS.some((m) => m.dynamic && !m.stub && normalizeMaterial(m.name) === n));
};
/** Mỗi dòng một loại chi: dòng không phải vật tư ẩn mã / nhóm vật tư; phiếu nhiều loại sẽ tách khi lưu. */
function applyKindUi() {
  const kinds = new Set();
  document.querySelectorAll("#expense-lines .expense-line").forEach((line) => {
    const kind = line.querySelector("[data-field=kind]").value;
    const nonMaterial = NON_MATERIAL.has(kind);
    kinds.add(nonMaterial ? kind : "MATERIAL");
    line.classList.toggle("non-material", nonMaterial);
    line.querySelector("[data-field=expenseGroup]").required = !nonMaterial;
    line.querySelector("[data-name-label]").textContent = nonMaterial ? "Nội dung" : "Tên vật tư";
  });
  $("#expense-fund-hint").hidden = !(canTreasure(state.role) && $("#expense-fund").value === FUND_PERSONAL);
  const notes = [];
  if (kinds.size > 1) notes.push(`Phiếu có ${kinds.size} loại chi (${[...kinds].map((k) => KIND_SHORT[k]).join(", ")}): khi lưu sẽ tự tách thành ${kinds.size} phiếu cùng ngày, cùng người mua để báo cáo tháng xếp đúng khoản mục.`);
  if (kinds.has("ADDITIONAL_INVESTMENT")) notes.push("Đầu tư nâng cấp ghi riêng dòng Đầu tư bổ sung nhưng VẪN TRỪ vào tiền chia cổ đông của tháng.");
  if (kinds.has("MATERIAL")) notes.push("Dòng mua hàng: chọn đúng nhóm vật tư để tính giá vốn.");
  $("#expense-kind-hint").textContent = notes.join(" ");
}
function applyExpenseInputs() {
  if (!expenseDraft) return;
  expenseDraft.purchaseDate = new Date($("#expense-date").value).getTime();
  expenseDraft.note = $("#expense-note").value.trim();
  expenseDraft.enteredByName = $("#expense-payer").value.trim();
  expenseDraft.payerChosen = true;
  expenseDraft.fundSource = $("#expense-fund").value;
  const allocated = new Set(expenseDraft.items.map((item) => item.materialCode).filter(Boolean));
  expenseDraft.items = [...$("#expense-lines").querySelectorAll(".expense-line")].map((node) => {
    const existing = expenseDraft.items.find((x) => x.id === node.dataset.lineId) || { id: node.dataset.lineId };
    const read = (field) => node.querySelector(`[data-field="${field}"]`).value;
    const rawGroup = read("expenseGroup");
    const group = groupCodeOrNull(rawGroup) ? groupLabel(rawGroup) : "";
    let code = read("materialCode");
    if (!read("materialName").trim()) code = "";
    else {
      if (existing.materialName && normalizeMaterial(existing.materialName) !== normalizeMaterial(read("materialName"))) code = "";
      // Đổi nhóm vật tư (sửa mã nhập sai nhóm) thì mã sinh lại theo nhóm mới.
      if (existing.expenseGroup && group && groupCodeOrNull(existing.expenseGroup) && groupCodeOrNull(existing.expenseGroup) !== groupCodeOrNull(group)) code = "";
      // Mã vật tư sinh cố định từ tên + nhóm: cùng tên luôn ra cùng mã trên mọi thiết bị. Dòng đã có mã và chưa đổi tên/nhóm giữ nguyên mã cũ.
      if (!code && group) code = materialCodeFor(groupCode(group), read("materialName"));
      if (code) allocated.add(code);
    }
    node.querySelector("[data-field=materialCode]").value = code;
    const kindSel = node.querySelector("[data-field=kind]");
    return { ...existing, kind: kindSel.value, kindTouched: kindSel.dataset.kindTouched === "1", materialName: read("materialName"), materialCode: code, expenseGroup: group, groupTouched: node.dataset.groupTouched === "1", qty: Number(read("qty")), unit: read("unit"), unitPrice: Number(read("unitPrice")) };
  });
  if (state.user && !editingReceipt) localStorage.setItem(`pos0210.expense-draft.${state.user.uid}`, JSON.stringify(expenseDraft));
}
async function saveExpenseReceipt(event) {
  event.preventDefault(); applyExpenseInputs(); const error = $("#expense-error"); error.textContent = "";
  const check = validateReceipt(expenseDraft); if (!check.ok) { error.textContent = check.error; return; }
  const dateProblem = purchaseDateProblem(expenseDraft.purchaseDate); if (dateProblem) { error.textContent = dateProblem; return; }
  const sameDate = editingReceipt && Number(editingReceipt.purchaseDate) === Number(expenseDraft.purchaseDate);
  const shift = sameDate ? { ts: Number(expenseDraft.purchaseDate), shifted: false } : bookingDate(expenseDraft.purchaseDate, state.closedMonths);
  if (editingReceipt) { const p = closedMonthEditProblem(editingReceipt, { ...editingReceipt, total: check.total, purchaseDate: shift.ts }, state.closedMonths); if (p) { error.textContent = p; return; } }
  if (!confirmBooking([shift])) return;
  if (!expenseDraft.enteredByName) { error.textContent = "Ghi tên người mua (người ứng tiền)."; return; }
  if (!expenseDraft.fundSource) { error.textContent = "Chọn nguồn tiền: tiền cá nhân (cần hoàn) hay tiền quán."; return; }
  if (editingReceipt) { const p = paidEditProblem(editingReceipt, { ...expenseDraft, total: check.total }); if (p) { error.textContent = p; return; } }
  const isMat = (item) => !NON_MATERIAL.has(item.kind);
  const missingGroup = expenseDraft.items.findIndex((item) => isMat(item) && !groupCodeOrNull(item.expenseGroup));
  if (missingGroup >= 0) { error.textContent = `Dòng ${missingGroup + 1}: hãy chọn nhóm vật tư (hoặc đổi Loại chi nếu không phải mua hàng).`; return; }
  const learnList = rulesToLearn(expenseDraft.items.filter(isMat), state.expenseRules);
  const items = expenseDraft.items.map(({ groupTouched, kindTouched, ...item }) => {
    // Không phải vật tư: nhóm của dòng là mã loại chi (máy POS đọc mã này để xếp đúng khoản mục).
    if (!isMat(item)) return { ...item, expenseGroup: item.kind, materialCode: "", ...normalizeQuantity(item.qty, item.unit), classification: { source: "KIND", suggestedGroup: null, status: "kind" } };
    const suggestion = classifyMaterial(item.materialName, allRules());
    const chosen = groupCodeOrNull(item.expenseGroup);
    const source = suggestion.group && suggestion.group === chosen ? (suggestion.status === "learned" ? "LEARNED_RULE" : "KEYWORD_RULE") : "MANUAL";
    return { ...item, kind: "MATERIAL", ...normalizeQuantity(item.qty, item.unit), classification: { source, suggestedGroup: suggestion.group, status: suggestion.status } };
  });
  // Mỗi loại chi một phiếu. Phiếu đang sửa giữ phần cùng loại với nó; phần khác loại thành phiếu mới.
  const parts = splitByKind(items);
  if (editingReceipt && isPaidOut(editingReceipt) && parts.length > 1) { error.textContent = "Phiếu đã hoàn tiền: không tách thành nhiều phiếu được, để các dòng cùng một loại chi."; return; }
  const keepKind = editingReceipt ? kindOf(editingReceipt) : parts[0].kind;
  parts.sort((x, y) => (x.kind === keepKind ? -1 : y.kind === keepKind ? 1 : 0));
  const now = Date.now();
  const sum = (lines) => lines.reduce((t, i) => t + Math.round(Number(i.qty) * Number(i.unitPrice)), 0);
  if (editingReceipt) { const p = closedMonthEditProblem(editingReceipt, { ...editingReceipt, total: parts[0].kind === keepKind ? sum(parts[0].lines) : 0, purchaseDate: shift.ts }, state.closedMonths); if (p) { error.textContent = p; return; } }
  const mainId = expenseDraft.id;
  const mainCode = editingReceipt?.code || receiptCode({ ...expenseDraft, purchaseDate: shift.shifted ? shift.original : expenseDraft.purchaseDate });
  const payloads = parts.map((part, index) => {
    const id = index === 0 ? mainId : uuid();
    const draftPart = { ...expenseDraft, id, items: part.lines };
    const original = index === 0 ? editingReceipt : null;
    const base = original
      ? { ...buildEditedReceipt(original, draftPart, { now, uid: state.user.uid }), enteredByName: expenseDraft.enteredByName, fundSource: expenseDraft.fundSource, ...(upgradeFrom ? { detailLevel: DETAIL_ITEMIZED } : {}) }
      : { ...draftPart, ...(index > 0 ? { createdAt: now, code: undefined } : {}), total: sum(part.lines), status: "ACTIVE", updatedAt: now, updatedByUid: state.user.uid, source: "WEB_MANAGER", items: part.lines.map((item) => ({ ...item, materialGroup: item.expenseGroup, amount: Math.round(item.qty * item.unitPrice) })) };
    const { payerChosen: _pc, code: _c, kind: _k, ...clean } = base;
    const code = index === 0 ? (base.code || mainCode) : receiptCode({ ...clean, purchaseDate: shift.shifted ? shift.original : clean.purchaseDate });
    const note = index === 0 ? clean.note : [clean.note, `cùng hoá đơn với ${mainCode}`].filter(Boolean).join(" · ");
    const withMeta = { ...clean, code, note, payerId: payerIdFor(expenseDraft.enteredByName, original),
      // Tháng đã chốt chia cổ đông: ghi sổ vào tháng chưa chốt gần nhất, giữ ngày mua thật và mã phiếu theo ngày thật.
      ...(shift.shifted ? { purchaseDate: shift.ts, originalPurchaseDate: shift.original, note: withShiftNote(note, shift) } : {}) };
    const typed = part.kind === "MATERIAL" ? (() => { const { expenseCategory: _ec, ...rest } = withMeta; return rest; })() : { ...withMeta, expenseCategory: part.kind };
    const reimbursed = withReimbursement(typed, original, now);
    // Phiếu cần người khác duyệt mới tính vào chi phí; phiếu đã hoàn tiền giữ nguyên đã duyệt.
    // Mọi lần sửa (kể cả phiếu đã hoàn tiền) đều phải được người khác duyệt lại.
    // Phiếu bị đánh dấu sai: sửa xong luôn quay về chờ duyệt (chủ quán duyệt lại mới tính vào chi phí), giữ lý do để đối chiếu.
    const reviewAfter = initialReview(reimbursed.payerId || state.me?.id, people());
    const flagged = original?.flag ? { flag: flagAfterEdit(original.flag, reviewAfter, now, myName()) } : {};
    return withDemoFlags({ ...reimbursed, review: reviewAfter, reviewReason: "", ...flagged, ...(original && isPaidOut(original) ? { editedAfterPaidAt: now } : {}) });
  });
  try {
    const batch = writeBatch(db);
    for (const p of payloads) batch.set(doc(db, ...root, receiptCollection(), p.id), p);
    await batch.commit();
    rememberMaterials(items.filter(isMat));
    for (const rule of state.demo ? [] : learnList) { // đang xem demo: không học quy tắc từ phiếu demo
      try {
        const learned = { id: rule.id, name: rule.name, group: rule.group, updatedAt: now, updatedByName: myName() };
        await setDoc(doc(db, ...root, "expenseRules", rule.id), learned);
        state.expenseRules = [...state.expenseRules.filter((x) => x.id !== rule.id), learned];
      } catch { /* học quy tắc là phụ: phiếu đã lưu, lần sau sẽ thử lại khi người nhập chọn nhóm khác gợi ý */ }
    }
    const wasNew = !editingReceipt;
    payloads.forEach(replaceLocalReceipt);
    if (editingReceipt) { editingReceipt = null; upgradeFrom = null; }
    else localStorage.removeItem(`pos0210.expense-draft.${state.user.uid}`);
    render();
    expenseDraft = null; $("#expense-dialog").close();
    const codes = payloads.map(receiptCode).join(", ");
    const pending = payloads.some((p) => reimbursementStatus(p) === "PENDING");
    flashNote(`${payloads.length > 1 ? `Đã tách thành ${payloads.length} phiếu theo loại chi: ${codes}.` : `Đã lưu ${codes}.`}${pending ? ` ${wasNew ? "Đã gửi" : "Đã gửi lại"} thủ quỹ duyệt.` : ""}`);
  }
  catch (e) { error.textContent = editingReceipt ? `Chưa lưu được thay đổi: ${e.message || e}` : `Chưa đồng bộ được; bản nháp đã giữ lại: ${e.message || e}`; }
}

function replaceLocalReceipt(receipt) {
  const index = state.expenseReceipts.findIndex((item) => item.id === receipt.id);
  if (index >= 0) state.expenseReceipts[index] = receipt; else state.expenseReceipts.unshift(receipt);
}

/** Chỉ người mua (người ứng tiền / người nhập) được sửa, huỷ phiếu của mình. Thủ quỹ, chủ quán chỉ xem, duyệt hoặc trả lại.
 *  Phiếu cũ chưa gắn người (nhập trước khi có PIN, nhập trên máy POS) thì chủ quán sửa được. */
function canEditReceipt(r) {
  if (!r || !state.role) return false;
  if (state.demo) return canTreasure(state.role);
  if (r.payerId) return r.payerId === state.me?.id;
  return state.role === ROLE_OWNER;
}
const findReceipt = (id) => state.expenseReceipts.find((item) => item.id === id) || state.openReceipts.find((item) => item.id === id);
function openReceiptView(r) {
  $("#receipt-view-title").textContent = `${receiptCode(r)} · ${money(r.total)}`;
  const rows = (r.items || []).map((i) => `<tr><td>${escapeHtml(i.materialName || "")}<br><small class="muted">${escapeHtml(NON_MATERIAL.has(i.expenseGroup) ? KIND_SHORT[i.expenseGroup] : (i.materialGroup || i.expenseGroup || ""))}</small></td><td>${Number(i.qty || 0).toLocaleString("vi-VN")} ${escapeHtml(i.unit || "")} × ${money(i.unitPrice)}</td><td>${money(i.amount ?? Math.round(Number(i.qty) * Number(i.unitPrice)))}</td></tr>`).join("");
  $("#receipt-view-body").innerHTML = `<p class="muted">Ngày mua ${dateTime(r.originalPurchaseDate || r.purchaseDate)}${r.originalPurchaseDate ? ` (ghi sổ ${dateTime(r.purchaseDate)})` : ""} · người mua <b>${escapeHtml(r.enteredByName || "—")}</b> · ${escapeHtml({ PERSONAL: "tiền cá nhân", SHOP_CASH: "quỹ quán", SHOP_BANK: "quỹ quán" }[r.fundSource] || "chưa rõ nguồn tiền")} · ${escapeHtml(STATUS_LABELS[reimbursementStatus(r)] || "")}</p>${r.note ? `<p>${escapeHtml(r.note)}</p>` : ""}<table><thead><tr><th>Nội dung</th><th>SL × giá</th><th>Tiền</th></tr></thead><tbody>${rows}</tbody></table><p class="muted">Sai sót: bấm "Không duyệt" và ghi lý do để người mua tự sửa.</p>`;
  $("#receipt-view-dialog").showModal();
}
$("#close-receipt-view").addEventListener("click", () => $("#receipt-view-dialog").close());
function openReceiptEditor(id) {
  const receipt = findReceipt(id);
  if (receipt && !canEditReceipt(receipt)) { openReceiptView(receipt); return; }
  if (receipt && !state.expenseReceipts.some((item) => item.id === id)) state.expenseReceipts.push(receipt);
  if (!receipt || !state.user) return;
  if (isSummaryReceipt(receipt)) { openSummaryDialog(receipt); return; }
  upgradeFrom = null;
  editingReceipt = receipt;
  expenseDraft = { ...receiptToDraft(receipt, MATERIAL_GROUPS), fundSource: receipt.fundSource === "SHOP_BANK" ? "SHOP_CASH" : (receipt.fundSource || ""), payerChosen: true };
  expenseDraft.items = expenseDraft.items.map((item) => ({ ...item, kind: kindOf(receipt), kindTouched: true }));
  $("#expense-title").textContent = "Sửa phiếu";
  $("#expense-submit").textContent = "LƯU THAY ĐỔI";
  $("#expense-error").textContent = "";
  renderExpenseDraft();
  $("#expense-dialog").showModal();
}

async function cancelReceipt(id) {
  const receipt = state.expenseReceipts.find((item) => item.id === id);
  if (!receipt || !state.user) return;
  if (!canEditReceipt(receipt)) { window.alert("Chỉ người mua được huỷ phiếu của mình. Sai thì bấm Không duyệt và ghi lý do."); return; }
  if (isPaidOut(receipt)) { window.alert("Phiếu đã hoàn tiền nên không huỷ được. Sai nội dung thì bấm Sửa (giữ nguyên tổng tiền); sai tiền thì nhập phiếu bổ sung hoặc người mua nộp lại phần thừa vào quỹ."); return; }
  const locked = closedMonthEditProblem(receipt, { ...receipt, status: "CANCELLED" }, state.closedMonths);
  if (locked) { window.alert(locked); return; }
  const label = `${dateTime(receipt.purchaseDate)} · ${money(receipt.total)}`;
  if (!window.confirm(`Huỷ phiếu chi ${label}? Phiếu sẽ không còn tính vào chi phí. Dữ liệu vẫn được giữ lại.`)) return;
  const payload = buildCancelledReceipt(receipt, { now: Date.now(), uid: state.user.uid });
  try { await setDoc(doc(db, ...root, receiptCollection(), id), withDemoFlags(payload)); replaceLocalReceipt(payload); render(); }
  catch (e) { window.alert(`Chưa huỷ được phiếu: ${e.message || e}`); }
}

function render() {
  syncMaterialRegistry();
  renderCumulativeSummary();
  renderPeriodSummary();
  renderTables();
  renderSalesSnapshots();
  renderCompare();
  renderPaymentFlow();
  renderBillHistory();
  renderLiveSplit();
  renderClassificationReview();
  renderVagueMaterials();
  renderDetailLevel();
  renderMonthlyReport();
  if (state.reimbLoaded) renderReimbursements();
  if (state.recipesLoaded) { renderRecipes(); renderUsageCheck(); if (state.countsLoaded) renderCounts(); }
  renderFinanceMetadata();
  renderTransactions();
}
/** Tháng đã chốt chia cổ đông (máy POS v160+ đẩy lên). */
async function loadClosedMonths() {
  // Tháng đã chốt = chốt trên máy POS cũ (shareholderCloses) + tháng đã lưu đối soát chia cổ đông trên web và đã kết thúc.
  // Từ app 166 chỉ chốt trên web; lưu đối soát giữa tháng đang chạy chưa tính là chốt.
  try {
    const current = monthKeyOf(Date.now());
    const [sh, fc] = await Promise.all([
      getDocs(collection(db, ...root, "shareholderCloses")).then(rows),
      getDocs(collection(db, ...root, "fundClosings")).then(rows).catch(() => []),
    ]);
    state.closedMonths = [...new Set([...sh.map((x) => x.monthKey || x.id), ...fc.map((x) => x.monthKey || x.id).filter((k) => k < current)])];
    state.closedLoaded = true;
  }
  catch { state.closedLoaded = false; }
}
async function refreshDashboard() {
  if (!state.user || !state.role) return;
  await loadClosedMonths();
  loadPayback();
  if (state.simulation) { $("#sync-status").textContent = "Đang ở chế độ mô phỏng. Tắt mô phỏng để đọc dữ liệu thật."; return; }
  if (state.demo) { $("#sync-status").textContent = "Đang xem dữ liệu DEMO. Tắt xem demo để đọc dữ liệu thật."; return; }
  $("#sync-status").textContent = "Đang đọc snapshot…";
  try {
    const dashboardDoc = await getDoc(doc(db, ...root, "dashboard", "current"));
    state.dashboard = dashboardDoc.exists() ? dashboardDoc.data() : {};
    state.dailyDocs = {};
    state.dailyLoadedFrom = null;
    state.historyDocs = {};
    state.billDetailCache = {};
    const hasLiveTables = Array.isArray(state.dashboard.liveTables);
    if (hasLiveTables) state.tables = [];
    const sevenDays = startOfDay(new Date(Date.now() - 6 * 86400000));
    const read = async (name, key, q = null) => { const snapshot = await getDocs(q || collection(db, ...root, name)); state[key] = rows(snapshot); };
    await Promise.all([
      hasLiveTables ? Promise.resolve() : read("tableStatus", "tables"),
      loadDailyDocs().then(loadSalesPeriod).then(loadCompareDocs),
      loadReceiptsCached(),
      loadMonthlyDocs(),
      loadOtherPurchases(),
      read("financialMovements", "movements", query(collection(db, ...root, "financialMovements"), where("occurredAt", ">=", sevenDays), orderBy("occurredAt", "desc"), limit(300))),
      read("costCodes", "costCodes"), read("purchaseCategories", "purchaseCategories"), read("profitPartners", "profitPartners"), read("assetCategories", "assetCategories"), read("suppliers", "suppliers"),
    ]);
    state.flowError = "";
    try {
      const cutoffDoc = await getDoc(doc(db, ...root, "config", "expenseDetail"));
      state.detailCutoff = cutoffDoc.exists() && Number(cutoffDoc.data().cutoffAt) > 0 ? Number(cutoffDoc.data().cutoffAt) : null;
    } catch { state.detailCutoff = null; }
    try {
      const flowDoc = await getDoc(doc(db, ...root, "config", "paymentFlow"));
      state.paymentFlowDoc = flowDoc.exists() ? flowDoc.data() : null;
      const refundSnap = await getDocs(query(collection(db, ...root, "refunds"), where("createdAt", ">=", sevenDays), orderBy("createdAt", "desc"), limit(200)));
      state.refunds = rows(refundSnap);
      try {
        const frozenSnap = await getDocs(query(collection(db, ...root, "refunds"), where("status", "==", "FROZEN"), limit(200)));
        state.frozenRefundDocs = rows(frozenSnap);
      } catch { state.frozenRefundDocs = []; }
    } catch (error) { state.flowError = error.message; state.paymentFlowDoc = null; state.refunds = []; }
    try {
      const ruleRows = rows(await getDocs(query(collection(db, ...root, "expenseRules"), limit(2000))));
      // Quy tắc "duyệt bỏ qua định lượng" dùng chung collection nhưng không phải quy tắc phân nhóm.
      state.unitOk = ruleRows.filter((x) => x.kind === "UNIT_OK");
      state.expenseRules = ruleRows.filter((x) => x.kind !== "UNIT_OK" && x.kind !== "UNIT_OK_REVOKED");
      state.rulesError = "";
    } catch (error) { state.expenseRules = []; state.unitOk = []; state.rulesError = error.code === "permission-denied" ? "Chưa có quyền đọc quy tắc đã học (expenseRules)." : (error.message || "lỗi không rõ"); }
    state.salesLoaded = true;
    const stale = shouldMarkSnapshotStale(state.dashboard.lastUpdatedAt);
    $("#sync-status").textContent = state.dashboard.lastUpdatedAt ? `Snapshot POS: ${dateTime(state.dashboard.lastUpdatedAt)}${stale ? " · cần kiểm tra máy POS" : ""}` : "POS chưa gửi snapshot.";
    render();
    loadBillHistory(state.historyDay, true);
    // Tab Bàn cần số hôm nay dù đang xem lịch sử ngày khác.
    if (historyKey(state.historyDay) !== historyKey("today")) loadBillHistory("today", true);
    loadReimbursements();
  } catch (error) { $("#sync-status").textContent = `Không đọc được dữ liệu: ${error.message}`; }
}

async function saveEntry(event) {
  event.preventDefault();
  const type = $("#entry-type").value;
  const cfg = TRANSACTION_TYPES[type] || TRANSACTION_TYPES.OPERATING_EXPENSE;
  let occurredAt = new Date($("#entry-datetime").value).getTime();
  let note = $("#entry-note").value.trim();
  const error = $("#entry-error");
  error.textContent = "";
  if (!Number.isFinite(occurredAt)) { error.textContent = "Ngày giờ không hợp lệ."; return; }
  const dateProblem = purchaseDateProblem(occurredAt);
  if (dateProblem) { error.textContent = dateProblem; return; }
  // Tháng đã chốt chia cổ đông: ghi vào tháng chưa chốt gần nhất, ghi chú ngày thật.
  const shift = bookingDate(occurredAt, state.closedMonths);
  if (!confirmBooking([shift])) return;
  if (shift.shifted) { occurredAt = shift.ts; note = withShiftNote(note, shift); }
  if (!state.user) { error.textContent = "Phiên đăng nhập đã hết."; return; }
  if (state.demo || state.simulation) { error.textContent = "Đang xem demo / mô phỏng: Giao dịch khác ghi vào dữ liệu thật nên tạm khoá. Tắt demo để nhập."; return; }

  const now = Date.now();
  const id = uuid();
  try {
    if (cfg.purchase) {
      const itemName = $("#entry-item-name").value.trim();
      const qty = Number($("#entry-qty").value || 0);
      const unitPrice = Number($("#entry-unit-price").value || 0);
      const total = Math.round(qty * unitPrice);
      if (!itemName || !(qty > 0) || !(unitPrice > 0) || !(total > 0)) { error.textContent = "Cần nhập nội dung, số lượng và đơn giá hợp lệ."; return; }

      let expenseCategory = type === "OPERATING_EXPENSE" ? $("#entry-category").value : cfg.expenseCategory;
      const costCodeId = $("#entry-cost-code").value || null;
      const purchaseCategoryId = $("#entry-purchase-category").value || "";
      const unit = $("#entry-unit").value.trim() || "lần";
      const selectedPayer = $("#entry-payer").value.trim();
      const customPayer = $("#entry-payer-custom").value.trim();
      const paidByName = customPayer || selectedPayer;
      const supplierName = $("#entry-supplier").value.trim();
      let supplierId = null;
      const batch = writeBatch(db);

      if (supplierName) {
        const existing = state.suppliers.find((s) => String(s.name || "").trim().toLowerCase() === supplierName.toLowerCase());
        supplierId = existing?.id || uuid();
        if (!existing) batch.set(doc(db, ...root, "suppliers", supplierId), { id: supplierId, name: supplierName, phone: "", note: "", active: true });
      }

      batch.set(doc(db, ...root, "purchases", id), {
        id, supplierId, supplierName, enteredBy: state.user.uid, purchasedAt: occurredAt, total,
        note, status: "ACTIVE", expenseCategory, paidByName, costCodeId, updatedAt: now,
        source: "WEB_MANAGER", createdAt: now, createdBy: state.user.uid,
      });
      const itemId = uuid();
      batch.set(doc(db, ...root, "purchaseItems", itemId), {
        id: itemId, purchaseId: id, categoryId: purchaseCategoryId, name: itemName,
        qty, unit, unitPrice: Math.round(unitPrice), amount: total,
      });

      if (cfg.asset) {
        const assetCategoryId = $("#entry-asset-category").value;
        const usefulLifeMonths = Number($("#entry-useful-life").value || 0);
        const residualValue = Number($("#entry-residual").value || 0);
        const estimatedLiquidationValue = Number($("#entry-liquidation").value || 0);
        if (!assetCategoryId || !(usefulLifeMonths > 0) || residualValue < 0 || residualValue > total) {
          error.textContent = "Tài sản cần nhóm tài sản, thời gian khấu hao hợp lệ và giá trị còn lại không vượt thành tiền.";
          return;
        }
        const assetId = uuid();
        batch.set(doc(db, ...root, "assets", assetId), {
          id: assetId, name: itemName, categoryId: assetCategoryId, purchaseDate: occurredAt,
          purchasePrice: Math.round(unitPrice), quantity: Math.max(1, Math.round(qty)), totalCost: total,
          supplier: supplierName, usefulLifeMonths: Math.round(usefulLifeMonths), residualValue: Math.round(residualValue),
          estimatedLiquidationValue: Math.round(estimatedLiquidationValue), status: "ACTIVE",
          disposalDate: null, disposalPrice: null, note, investmentClass: cfg.investmentClass || "INITIAL",
        });
      }
      await batch.commit();
    } else {
      const amount = Number($("#entry-amount").value || 0);
      if (!(amount > 0)) { error.textContent = "Số tiền phải lớn hơn 0."; return; }
      const partnerId = cfg.partner ? ($("#entry-partner").value || null) : null;
      if (cfg.partner && !partnerId) { error.textContent = "Cần chọn người rút."; return; }
      const partner = state.profitPartners.find((p) => p.id === partnerId);
      const movementNote = [$("#entry-movement-note").value.trim(), note].filter(Boolean).join(" · ");
      await setDoc(doc(db, ...root, "financialMovements", id), {
        id, type: cfg.movement, amount: Math.round(amount), occurredAt, partnerId,
        method: $("#entry-method").value, note: movementNote, counterpartyName: partner?.name || "",
        source: "WEB_MANAGER", createdAt: now, createdBy: state.user.uid,
      });
    }

    $("#entry-form").reset();
    $("#entry-datetime").value = localDateTimeInput(new Date());
    $("#entry-type").value = "OPERATING_EXPENSE";
    $("#entry-qty").value = "1";
    $("#entry-unit").value = "lần";
    $("#entry-residual").value = "0";
    $("#entry-liquidation").value = "0";
    renderEntryType();
    $("#entry-dialog").close();
  } catch (e) {
    error.textContent = `Không lưu được giao dịch: ${e.message || e}`;
  }
}

$("#login-button").addEventListener("click", async () => {
  const email = $("#email").value.trim();
  const password = $("#password").value;
  $("#login-error").textContent = "";
  try { await signInWithEmailAndPassword(auth, email, password); }
  catch (error) {
    const code = String(error?.code || "");
    const hint = {
      "auth/invalid-credential": "Sai email hoặc mật khẩu (bật Hiện mật khẩu để kiểm tra).",
      "auth/wrong-password": "Sai mật khẩu (bật Hiện mật khẩu để kiểm tra).",
      "auth/user-not-found": "Email này chưa có tài khoản.",
      "auth/too-many-requests": "Đăng nhập sai quá nhiều lần nên Firebase tạm khóa thiết bị này. Chờ 15–30 phút hoặc dùng trình duyệt khác.",
      "auth/network-request-failed": "Không kết nối được mạng hoặc trình duyệt trong app (Messenger/Zalo) đang chặn. Mở bằng Safari/Chrome.",
      "auth/operation-not-supported-in-this-environment": "Trình duyệt trong app này không hỗ trợ đăng nhập. Mở bằng Safari/Chrome.",
    }[code] || "Không đăng nhập được.";
    $("#login-error").textContent = `${hint}${code ? ` (${code})` : ""}`;
  }
});
$("#show-password").addEventListener("change", (event) => { $("#password").type = event.target.checked ? "text" : "password"; });
$("#password").addEventListener("keydown", (event) => { if (event.key === "Enter") $("#login-button").click(); });
$("#logout-button").addEventListener("click", () => signOut(auth));
$("#refresh-dashboard").addEventListener("click", refreshDashboard);
$("#sales-days-filters").replaceChildren(...SALES_PERIODS.map(([k, label]) => { const b = document.createElement("button"); b.type = "button"; b.className = `filter${k === "7d" ? " active" : ""}`; b.dataset.salesPeriod = k; b.textContent = label; return b; }));
$("#sales-days-filters").addEventListener("click", async (event) => {
  const period = event.target.dataset?.salesPeriod;
  if (!period) return;
  state.salesPeriod = period;
  renderSalesSnapshots();
  if (state.user && state.role) { $("#sales-notice").textContent = "Đang đọc số liệu kỳ…"; await loadSalesPeriod(); state.salesLoaded = true; }
  renderSalesSnapshots();
});
$("#cmp-modes").addEventListener("click", (event) => {
  const mode = event.target.dataset?.cmpMode;
  if (mode !== "prev" && mode !== "week") return;
  state.cmpMode = mode;
  renderCompare();
});
$("#sales-item-day").addEventListener("click", (event) => { const k = event.target.closest("[data-item-day]")?.dataset.itemDay; if (k) { state.itemDay = k; renderSalesSnapshots(); } });
$("#sales-item-day").addEventListener("change", (event) => { if (event.target.id === "sales-item-day-select") { state.itemDay = event.target.value; renderSalesSnapshots(); } });
$("#sales-item-modes").addEventListener("click", (event) => {
  const mode = event.target.dataset?.itemMode;
  if (mode !== "combined" && mode !== "byDay" && mode !== "output") return;
  state.itemMode = mode;
  renderSalesSnapshots();
});
$("#close-detail").addEventListener("click", () => $("#table-detail").close());
$("#bill-history-days").addEventListener("click", (event) => {
  const button = event.target.closest("[data-history-day]");
  if (!button) return;
  state.historyDay = button.dataset.historyDay === "yesterday" ? "yesterday" : "today";
  $("#bill-history-days").querySelectorAll(".filter").forEach((b) => b.classList.toggle("active", b === button));
  $("#bill-history-date").value = historyKey(state.historyDay);
  renderBillHistory();
  loadBillHistory(state.historyDay);
});
$("#bill-history-date").addEventListener("change", (event) => {
  const key = event.target.value;
  if (!dayRange(key)) return;
  state.historyDay = key;
  $("#bill-history-days").querySelectorAll(".filter").forEach((b) => b.classList.toggle("active", historyKey(b.dataset.historyDay) === key));
  renderBillHistory();
  loadBillHistory(key);
});
["#bill-filter-flow", "#bill-filter-method", "#bill-filter-refund"].forEach((id) => $(id).addEventListener("change", renderBillHistory));
$("#bill-history-date").value = historyKey("today");
$("#bill-history-date").max = historyKey("today");
$("#bill-history-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-bill-id]");
  if (button) openBillDetail(button.dataset.billId);
});
$("#review-list").addEventListener("click", (event) => { const edit = event.target.closest("[data-edit-receipt]"); if (edit) openReceiptEditor(edit.dataset.editReceipt); });
$("#open-summary").addEventListener("click", () => openSummaryDialog(null));
$("#close-summary").addEventListener("click", () => { editingSummary = null; $("#summary-dialog").close(); });
$("#add-summary-block").addEventListener("click", () => { readSummaryBlocks(); const last = state.summaryBlocks[state.summaryBlocks.length - 1]; state.summaryBlocks.push(blockDefaults(last?.date)); renderSummaryBlocks(); });
$("#summary-blocks").addEventListener("input", () => { readSummaryBlocks(); updateSummaryTotals(); });
$("#summary-blocks").addEventListener("click", (event) => {
  const t = event.target;
  if (t.dataset.addLine) { readSummaryBlocks(); const b = state.summaryBlocks.find((x) => x.id === t.dataset.addLine); if (b) b.lines.push({ id: uuid(), group: "", amount: "" }); renderSummaryBlocks(); }
  else if (t.dataset.removeLine) { readSummaryBlocks(); state.summaryBlocks.forEach((b) => { if (b.lines.length > 1) b.lines = b.lines.filter((l) => l.id !== t.dataset.removeLine); }); renderSummaryBlocks(); }
  else if (t.dataset.removeBlock) { readSummaryBlocks(); state.summaryBlocks = state.summaryBlocks.filter((b) => b.id !== t.dataset.removeBlock); renderSummaryBlocks(); }
});
$("#summary-form").addEventListener("submit", saveSummaryBlocks);
$("#summary-to-detail").addEventListener("click", startUpgradeToDetail);
$("#sim-toggle").addEventListener("click", () => setSimulation(!state.simulation));
$("#export-menu").addEventListener("click", exportMenu);
$("#export-monthly-csv").addEventListener("click", () => exportMonthly("csv"));
$("#export-monthly-json").addEventListener("click", () => exportMonthly("json"));
$("#save-cutoff").addEventListener("click", () => saveCutoff(false));
$("#clear-cutoff").addEventListener("click", () => saveCutoff(true));
$("#close-bill-detail").addEventListener("click", () => $("#bill-detail").close());

$("#open-entry").addEventListener("click", () => {
  $("#entry-error").textContent = "";
  $("#entry-datetime").value = localDateTimeInput(new Date());
  $("#entry-qty").value = $("#entry-qty").value || "1";
  $("#entry-unit").value = $("#entry-unit").value || "lần";
  renderFinanceMetadata();
  renderEntryType();
  $("#entry-dialog").showModal();
});
$("#close-entry").addEventListener("click", () => $("#entry-dialog").close());
function openNewExpense() {
  if (!state.user) return;
  editingReceipt = null;
  upgradeFrom = null;
  $("#expense-title").textContent = "Phiếu chi";
  $("#expense-submit").textContent = "LƯU VÀ ĐỒNG BỘ";
  const fresh = freshenDraft(createStableDraft(localStorage, state.user, uuid));
  expenseDraft = fresh.draft;
  if (fresh.reset) { try { localStorage.setItem(`pos0210.expense-draft.${state.user.uid}`, JSON.stringify(expenseDraft)); } catch { /* bỏ qua */ } }
  // Mỗi người đăng nhập tài khoản riêng: bản nháp mới mặc định người mua là chính mình.
  if (!expenseDraft.payerChosen || isBuyer()) { expenseDraft.enteredByName = myName(); expenseDraft.fundSource = expenseDraft.fundSource || FUND_PERSONAL; }
  expenseDraft.items = expenseDraft.items.map(item => ({ ...item, expenseGroup: item.materialName ? groupLabel(item.expenseGroup) : "" }));
  $("#expense-error").textContent = fresh.stale ? `Bản nháp cũ, ngày mua đang là ${dateTime(expenseDraft.purchaseDate)}. Kiểm tra lại ngày giờ trước khi lưu.` : "";
  renderExpenseDraft();
  $("#expense-dialog").showModal();
}
$("#open-expense").addEventListener("click", openNewExpense);
$("#expense-fund").addEventListener("change", applyKindUi);

$("#close-expense").addEventListener("click", () => {
  if (editingReceipt) { editingReceipt = null; upgradeFrom = null; expenseDraft = null; $("#expense-dialog").close(); updateGapNote(); return; }
  applyExpenseInputs(); renderExpenseDraft(); $("#expense-dialog").close();
});
$("#expense-dialog").addEventListener("close", () => { if (editingReceipt) { editingReceipt = null; upgradeFrom = null; expenseDraft = null; } updateGapNote(); });
$("#transactions").addEventListener("click", (event) => {
  const edit = event.target.closest?.("[data-edit-receipt]");
  if (edit) { openReceiptEditor(edit.dataset.editReceipt); return; }
  const cancel = event.target.closest?.("[data-cancel-receipt]");
  if (cancel) { cancelReceipt(cancel.dataset.cancelReceipt); return; }
  const flag = event.target.closest?.("[data-flag-receipt]");
  if (flag) { flagReceipt(flag.dataset.flagReceipt); return; }
  const unflag = event.target.closest?.("[data-unflag-receipt]");
  if (unflag) unflagReceipt(unflag.dataset.unflagReceipt);
});
$("#add-expense-line").addEventListener("click", () => { applyExpenseInputs(); expenseDraft.items.push({ id: uuid(), materialName: "", materialCode: "", expenseGroup: "", qty: 1, unit: "kg", unitPrice: 0 }); renderExpenseDraft(); });
$("#expense-lines").addEventListener("click", (event) => { const id = event.target.dataset.removeLine; if (!id || expenseDraft.items.length < 2) return; applyExpenseInputs(); expenseDraft.items = expenseDraft.items.filter((item) => item.id !== id); renderExpenseDraft(); });
$("#expense-lines").addEventListener("input", (event) => { applyExpenseInputs(); if (event.target.matches("input[list]")) updateMaterialSuggestions(event.target); $("#expense-total").textContent = money(calculateReceiptTotal(expenseDraft.items)); updateGapNote(); });
$("#expense-lines").addEventListener("focusin", (event) => { if (event.target.matches("input[list]")) showSuggest(event.target); });
$("#expense-lines").addEventListener("focusout", (event) => { if (event.target.matches("input[list]")) setTimeout(() => { if (suggest.input === event.target) hideSuggest(); }, 120); });
$("#expense-lines").addEventListener("keydown", (event) => {
  const ul = document.getElementById("expense-suggest");
  if (!ul || ul.hidden || suggest.input !== event.target) return;
  if (event.key === "Escape") { event.preventDefault(); hideSuggest(); return; } // đóng gợi ý, không đóng cả hộp thoại
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const n = suggest.items.length; if (!n) return;
    suggest.active = (suggest.active + (event.key === "ArrowDown" ? 1 : -1) + n) % n;
    ul.querySelectorAll("button").forEach((b, i) => { b.classList.toggle("active", i === suggest.active); if (i === suggest.active) b.scrollIntoView({ block: "nearest" }); });
  } else if (event.key === "Enter" && suggest.active >= 0) { event.preventDefault(); pickSuggestion(suggest.active); }
});
$("#expense-dialog").addEventListener("scroll", hideSuggest, true);
window.addEventListener("resize", hideSuggest);
$("#expense-lines").addEventListener("change", (event) => {
  const input = event.target;
  const line = input.closest(".expense-line");
  if (!line) return;
  if (input.matches("[data-field=unit]")) { applyExpenseInputs(); refreshRuleHint(line); return; }
  if (input.matches("[data-field=kind]")) { input.dataset.kindTouched = "1"; applyKindUi(); applyExpenseInputs(); return; }
  if (input.matches("[data-field=materialName]")) {
    const kindSel = line.querySelector("[data-field=kind]");
    // Loại chi tự nhận diện theo tên; người nhập đã chọn tay thì giữ nguyên.
    if (kindSel.dataset.kindTouched !== "1") { kindSel.value = detectKind(input.value, knownMaterial); applyKindUi(); }
    const suggestion = classifyMaterial(input.value, allRules());
    // Nhóm tự điền không được sót lại khi đổi tên: gợi ý rõ thì điền, mơ hồ hoặc chưa khớp thì xoá để buộc người nhập chọn.
    if (line.dataset.groupTouched !== "1") line.querySelector("[data-field=expenseGroup]").value = suggestion.group ? groupLabelOf(suggestion.group) : "";
    const known = savedMaterials().find((item) => normalizeMaterial(item.materialName) === normalizeMaterial(input.value));
    const std = matchMaterial({ materialName: input.value });
    const dyn = MATERIALS.find((m) => m.dynamic && !m.stub && normalizeMaterial(m.name) === normalizeMaterial(input.value));
    if (dyn?.groupLabel && line.dataset.groupTouched !== "1" && MATERIAL_GROUPS.some(([, name]) => name === dyn.groupLabel)) line.querySelector("[data-field=expenseGroup]").value = dyn.groupLabel;
    if (known?.unit) line.querySelector("[data-field=unit]").value = known.unit;
    else if (dyn?.lastUnit) line.querySelector("[data-field=unit]").value = dyn.lastUnit;
    else if (std && normalizeMaterial(std.name) === normalizeMaterial(input.value)) line.querySelector("[data-field=unit]").value = std.units[0].unit;
    line.querySelector("[data-field=materialCode]").value = "";
    applyExpenseInputs(); refreshRuleHint(line);
    return;
  }
  if (input.matches("[data-field=expenseGroup]")) {
    if (!MATERIAL_GROUPS.some(([, name]) => name === input.value)) { input.setCustomValidity("Chọn nhóm vật tư trong danh sách"); return; }
    input.setCustomValidity("");
    line.dataset.groupTouched = "1";
    line.querySelector("[data-field=materialCode]").value = "";
    applyExpenseInputs(); refreshRuleHint(line);
  }
});
$("#expense-date").addEventListener("change", applyExpenseInputs);
$("#expense-note").addEventListener("input", applyExpenseInputs);
$("#expense-form").addEventListener("submit", saveExpenseReceipt);
$("#entry-type").addEventListener("change", renderEntryType);
$("#entry-category").addEventListener("change", renderEntryType);
$("#entry-qty").addEventListener("input", recalcEntryTotal);
$("#entry-unit-price").addEventListener("input", recalcEntryTotal);
$("#entry-payer").addEventListener("change", () => { if ($("#entry-payer").value) $("#entry-payer-custom").value = ""; });
$("#entry-asset-category").addEventListener("change", () => {
  const category = state.assetCategories.find((x) => x.id === $("#entry-asset-category").value);
  if (category && !$("#entry-useful-life").value) $("#entry-useful-life").value = category.defaultUsefulLifeMonths || "";
});
$("#entry-cost-code").addEventListener("change", () => {
  const code = state.costCodes.find((c) => c.id === $("#entry-cost-code").value);
  if (code?.parentExpenseCategory) $("#entry-category").value = code.parentExpenseCategory;
  if (code?.defaultUnit) $("#entry-unit").value = code.defaultUnit;
  if (code?.name && !$("#entry-item-name").value) $("#entry-item-name").value = code.name;
  if (code?.defaultSupplier && !$("#entry-supplier").value) $("#entry-supplier").value = code.defaultSupplier;
  renderEntryType();
});
$("#entry-purchase-category").addEventListener("change", () => {
  const category = state.purchaseCategories.find((x) => x.id === $("#entry-purchase-category").value);
  if (category?.defaultUnit) $("#entry-unit").value = category.defaultUnit;
});
$("#entry-form").addEventListener("submit", saveEntry);
$("#payer-filter").addEventListener("change", () => {
  state.payerFilter = $("#payer-filter").value;
  renderPeriodSummary();
  renderTransactions();
});

$("#period-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-period]");
  if (!button) return;
  state.period = button.dataset.period;
  $("#period-filters").querySelectorAll(".filter").forEach((b) => b.classList.toggle("active", b === button));
  $("#custom-range").hidden = state.period !== "custom";
  render();
  ensureReceiptsLoaded();
});
/** Bấm "Xem từng khoản" ở thẻ tháng: lọc danh sách phiếu đúng tháng đó và cuộn tới. */
$("#monthly-report").addEventListener("click", (e) => {
  const key = e.target.closest("[data-month-detail]")?.dataset.monthDetail;
  if (!key) return;
  const y = Number(key.slice(0, 4)), m = Number(key.slice(5));
  const last = new Date(y, m, 0).getDate();
  $("#from-date").value = `${key}-01`; $("#to-date").value = `${key}-${String(last).padStart(2, "0")}`;
  state.period = "custom"; state.customFrom = startOfDay(new Date(y, m - 1, 1)); state.customTo = endOfDay(new Date(y, m - 1, last));
  $("#period-filters").querySelectorAll(".filter").forEach((b) => b.classList.toggle("active", b.dataset.period === "custom"));
  $("#custom-range").hidden = false;
  state.transactionKind = "EXPENSE";
  $("#transaction-filters").querySelectorAll("[data-kind]").forEach((b) => b.classList.toggle("active", b.dataset.kind === "EXPENSE"));
  render(); ensureReceiptsLoaded();
  $("#payer-breakdown").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#apply-range").addEventListener("click", () => {
  const from = $("#from-date").value;
  const to = $("#to-date").value;
  if (!from || !to) return;
  state.customFrom = startOfDay(new Date(`${from}T00:00:00`));
  state.customTo = endOfDay(new Date(`${to}T00:00:00`));
  render();
  ensureReceiptsLoaded();
});
$("#transaction-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-kind]");
  if (!button) return;
  state.transactionKind = button.dataset.kind;
  $("#transaction-filters").querySelectorAll(".filter").forEach((b) => b.classList.toggle("active", b === button));
  renderTransactions();
});

const todayInput = localDateInput(new Date());
$("#from-date").value = todayInput;
$("#to-date").value = todayInput;
$("#entry-datetime").value = localDateTimeInput(new Date());
$("#entry-type").value = "OPERATING_EXPENSE";
renderEntryType();

/* ---------- Yêu cầu máy POS ở quán đồng bộ ngay (ghi commands/sync, app nhận khi đang chạy) ---------- */
let lastSyncRequestAt = NaN;
let syncPollTimer = null;
async function requestRemoteSync() {
  const status = $("#sync-command-status");
  const now = Date.now();
  if (!state.user) return;
  if (!canRequestSync(lastSyncRequestAt, now)) { status.textContent = "Vừa gửi lệnh, chờ khoảng 30 giây rồi thử lại."; return; }
  lastSyncRequestAt = now;
  const ref = doc(db, ...root, "commands", "sync");
  try {
    await setDoc(ref, { requestedAt: now, requestedBy: myName(), scope: "" }, { merge: true });
  } catch (error) {
    lastSyncRequestAt = NaN;
    status.textContent = error.code === "permission-denied" ? "Không có quyền ghi lệnh (cần mở quy tắc Firestore cho commands)." : `Không gửi được lệnh: ${error.message}`;
    return;
  }
  status.textContent = syncCommandStatus(null, now, Date.now()).text;
  clearInterval(syncPollTimer);
  let refreshed = false;
  syncPollTimer = setInterval(async () => {
    try {
      const snap = await getDoc(ref);
      const result = syncCommandStatus(snap.exists() ? snap.data() : null, now, Date.now());
      status.textContent = result.text;
      if (result.state === "received" && !refreshed) { refreshed = true; clearInterval(syncPollTimer); setTimeout(refreshDashboard, 12000); }
      if (result.state === "timeout") clearInterval(syncPollTimer);
    } catch (error) { status.textContent = `Không đọc được trạng thái lệnh: ${error.message}`; clearInterval(syncPollTimer); }
    if (Date.now() - now > ACK_TIMEOUT_MS + 5000) clearInterval(syncPollTimer);
  }, 6000);
}
$("#request-sync").addEventListener("click", requestRemoteSync);

/* ---------- Phiếu tổng: nhập hóa đơn cũ chưa có chi tiết ---------- */
let editingSummary = null;
let upgradeFrom = null;
const summaryDateMs = (value) => new Date(`${value}T12:00:00`).getTime();
const blockDefaults = (date) => ({ id: uuid(), date: date || localDateInput(new Date()), place: "", payer: "", lines: [{ id: uuid(), group: "", amount: "" }] });

function renderSummaryBlocks() {
  const host = $("#summary-blocks");
  const safe = (v) => escapeHtml(String(v ?? "")).replace(/"/g, "&quot;");
  host.innerHTML = state.summaryBlocks.map((block, bi) => `<article class="summary-block" data-block="${safe(block.id)}">
    <div class="two-col"><label>Ngày hóa đơn<input data-field="date" type="date" value="${safe(block.date)}" required /></label><label>Nơi mua / ghi chú<input data-field="place" type="text" maxlength="120" value="${safe(block.place)}" placeholder="vd: chợ, đại lý" /></label></div>
    <label>Người chi (để trống = bạn)<input data-field="payer" type="text" maxlength="60" value="${safe(block.payer)}" /></label>
    ${block.lines.map((line) => `<div class="summary-line" data-line="${safe(line.id)}"><label>Nhóm<input data-field="group" list="summary-groups" value="${safe(line.group)}" autocomplete="off" required /></label><label>Số tiền<input data-field="amount" type="number" min="1" step="1" inputmode="numeric" value="${safe(line.amount)}" required /></label>${block.lines.length > 1 ? `<button type="button" class="text-button danger" data-remove-line="${safe(line.id)}">Bỏ</button>` : ""}</div>`).join("")}
    <div class="summary-block-actions"><button type="button" class="text-button" data-add-line="${safe(block.id)}">+ Thêm nhóm</button>${state.summaryBlocks.length > 1 && !editingSummary ? `<button type="button" class="text-button danger" data-remove-block="${safe(block.id)}">Bỏ hóa đơn ${bi + 1}</button>` : ""}</div>
  </article>`).join("");
  updateSummaryTotals();
}
function readSummaryBlocks() {
  state.summaryBlocks = [...document.querySelectorAll("#summary-blocks .summary-block")].map((node) => {
    const prev = state.summaryBlocks.find((b) => b.id === node.dataset.block) || { id: node.dataset.block };
    const field = (root0, name) => root0.querySelector(`[data-field="${name}"]`)?.value ?? "";
    return { ...prev, date: field(node, "date"), place: field(node, "place").trim(), payer: field(node, "payer").trim(),
      lines: [...node.querySelectorAll(".summary-line")].map((ln) => ({ id: ln.dataset.line, group: field(ln, "group").trim(), amount: field(ln, "amount") })) };
  });
}
function updateSummaryTotals() {
  const total = state.summaryBlocks.reduce((s, b) => s + b.lines.reduce((x, l) => x + (Number(l.amount) || 0), 0), 0);
  $("#summary-total").textContent = money(total);
  $("#summary-count").textContent = String(state.summaryBlocks.length);
}
function openSummaryDialog(receipt = null) {
  if (!state.user) return;
  editingSummary = receipt;
  $("#summary-groups").replaceChildren(...MATERIAL_GROUPS.map(([, name]) => new Option(name, name)));
  if (receipt) {
    state.summaryBlocks = [{ id: receipt.id, date: localDateInput(new Date(Number(receipt.purchaseDate))), place: receipt.note || "", payer: receipt.enteredByName || "",
      lines: (receipt.items || []).map((item) => ({ id: item.id, group: item.materialGroup || item.expenseGroup || "", amount: String(item.amount ?? "") })) }];
  } else state.summaryBlocks = [blockDefaults()];
  // Sửa phiếu tổng giữ đúng nguồn tiền cũ (không tự đổi thành tiền cá nhân → không sinh hoàn ứng nhầm).
  $("#summary-fund").value = receipt ? (receipt.fundSource === "PERSONAL" ? "PERSONAL" : receipt.fundSource ? "SHOP_CASH" : "PERSONAL") : "PERSONAL";
  $("#summary-title").textContent = receipt ? "Sửa phiếu tổng" : "Phiếu tổng";
  $("#summary-submit").textContent = receipt ? "LƯU THAY ĐỔI" : "LƯU TẤT CẢ";
  $("#add-summary-block").hidden = Boolean(receipt);
  $("#summary-to-detail").hidden = !receipt;
  $("#summary-error").textContent = "";
  renderSummaryBlocks();
  $("#summary-dialog").showModal();
}
/** Nhập bù phiếu ngày cũ lúc nào cũng được; chỉ chặn ngày trong tương lai (gõ nhầm năm/tháng). */
function purchaseDateProblem(ts) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  return Number(ts) > end.getTime() ? "Ngày mua ở tương lai: kiểm tra lại ngày tháng năm." : "";
}
/** Ngày rơi vào tháng đã chốt chia cổ đông: báo trước sẽ dời sang tháng chưa chốt. Chưa đọc được danh sách tháng chốt thì nhắc chung. */
function confirmBooking(shifts) {
  const moved = shifts.filter((x) => x.shifted);
  if (moved.length) {
    const pairs = [...new Set(moved.map((x) => `tháng ${monthLabel(x.fromKey)} → ${new Date(x.ts).toLocaleDateString("vi-VN")}`))];
    return window.confirm(`Ngày mua thuộc tháng đã chốt chia cổ đông nên sẽ tính vào tháng chưa chốt gần nhất (${pairs.join("; ")}). Ngày mua thật được ghi trong ghi chú. Đồng ý?`);
  }
  if (state.closedLoaded) return true;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const old = [...new Set(shifts.filter((x) => x.ts < monthStart.getTime()).map((x) => monthLabel(new Date(x.ts).getFullYear() + "-" + (new Date(x.ts).getMonth() + 1))))];
  return !old.length || window.confirm(`Chưa đọc được danh sách tháng đã chốt chia cổ đông. Phiếu thuộc tháng ${old.join(", ")}: nếu tháng đó đã chốt thì báo cáo trên app sẽ báo lệch. Vẫn lưu?`);
}
async function saveSummaryBlocks(event) {
  event.preventDefault();
  readSummaryBlocks();
  const error = $("#summary-error");
  error.textContent = "";
  if (!state.user) { error.textContent = "Phiên đăng nhập đã hết."; return; }
  // Kiểm tra toàn bộ trước khi ghi để không lưu dở dang.
  const prepared = [];
  for (const [index, block] of state.summaryBlocks.entries()) {
    const where = state.summaryBlocks.length > 1 ? `Hóa đơn ${index + 1}: ` : "";
    const purchaseDate = summaryDateMs(block.date);
    const check = validateSummaryReceipt({ purchaseDate, lines: block.lines });
    if (!check.ok) { error.textContent = where + check.error; return; }
    if (detailRequired(purchaseDate, state.detailCutoff)) { error.textContent = `${where}từ ngày ${new Date(state.detailCutoff).toLocaleDateString("vi-VN")} trở đi phải nhập chi tiết vật tư, không dùng phiếu tổng.`; return; }
    const dateProblem = purchaseDateProblem(purchaseDate);
    if (dateProblem) { error.textContent = `${where}${dateProblem}`; return; }
    if (editingSummary) { const p = paidEditProblem(editingSummary, { ...editingSummary, total: check.total, fundSource: $("#summary-fund").value, enteredByName: block.payer || editingSummary.enteredByName }); if (p) { error.textContent = `${where}${p}`; return; } }
    const sameDate = editingSummary && Number(editingSummary.purchaseDate) === Number(purchaseDate);
    const shift = sameDate ? { ts: purchaseDate, shifted: false } : bookingDate(purchaseDate, state.closedMonths);
    if (editingSummary) { const p = closedMonthEditProblem(editingSummary, { ...editingSummary, total: check.total, purchaseDate: shift.ts }, state.closedMonths); if (p) { error.textContent = `${where}${p}`; return; } }
    prepared.push({ block, purchaseDate: shift.ts, total: check.total, shift });
  }
  if (!confirmBooking(prepared.map((p) => p.shift))) return;
  const now = Date.now();
  const button = $("#summary-submit");
  button.disabled = true;
  const failed = [];
  let saved = 0;
  for (const { block, purchaseDate, total, shift } of prepared) {
    const items = buildSummaryLines(block.lines, () => uuid());
    const base = editingSummary ? { ...editingSummary } : { id: block.id, createdAt: now, source: "WEB_MANAGER" };
    const payload = withReimbursement({ ...base, purchaseDate, note: withShiftNote(block.place, shift), ...(shift.shifted ? { originalPurchaseDate: shift.original, code: base.code || receiptCode({ ...base, enteredByName: block.payer || myName(), purchaseDate: shift.original }) } : {}), enteredByUid: state.user.uid, enteredByName: block.payer || myName(), payerId: payerIdFor(block.payer || myName(), editingSummary), fundSource: $("#summary-fund").value,
      items, total, status: "ACTIVE", detailLevel: "SUMMARY", updatedAt: Math.max(now, Number(editingSummary?.updatedAt || 0) + 1), updatedByUid: state.user.uid }, editingSummary, now);
    payload.review = initialReview(payload.payerId || state.me?.id, people());
    payload.reviewReason = "";
    try { await setDoc(doc(db, ...root, receiptCollection(), payload.id), withDemoFlags(payload)); replaceLocalReceipt(withDemoFlags(payload)); saved += 1; }
    catch (e) { failed.push({ block, message: e.message || String(e) }); }
  }
  button.disabled = false;
  if (failed.length) {
    state.summaryBlocks = failed.map((f) => f.block);
    renderSummaryBlocks();
    error.textContent = `Đã lưu ${saved}/${prepared.length}. Còn ${failed.length} hóa đơn chưa lưu được: ${failed[0].message}`;
    render();
    return;
  }
  editingSummary = null;
  $("#summary-dialog").close();
  render();
}
function startUpgradeToDetail() {
  const original = editingSummary;
  if (!original) return;
  readSummaryBlocks();
  $("#summary-dialog").close();
  editingSummary = null;
  editingReceipt = original;
  upgradeFrom = original;
  expenseDraft = { id: original.id, purchaseDate: Number(original.purchaseDate), note: original.note || "", enteredByUid: original.enteredByUid || "", enteredByName: original.enteredByName || "",
    items: [{ id: uuid(), materialName: "", materialCode: "", expenseGroup: "", qty: 1, unit: "kg", unitPrice: 0 }] };
  $("#expense-title").textContent = "Chi tiết hóa đơn cũ";
  $("#expense-submit").textContent = "LƯU CHI TIẾT";
  $("#expense-error").textContent = "";
  renderExpenseDraft();
  $("#expense-dialog").showModal();
}
function updateGapNote() {
  const note = $("#expense-gap");
  if (!note) return;
  if (!upgradeFrom || !expenseDraft) { note.hidden = true; return; }
  const gap = detailGap(upgradeFrom.total, calculateReceiptTotal(expenseDraft.items));
  note.hidden = false;
  note.className = gap.matches ? "rule-hint" : "rule-hint warn";
  note.textContent = gap.matches ? `✓ Khớp tổng phiếu tổng gốc (${money(upgradeFrom.total)}).` : `Tổng phiếu tổng gốc ${money(upgradeFrom.total)}; chi tiết đang ${gap.difference > 0 ? "vượt" : "thiếu"} ${money(Math.abs(gap.difference))}.`;
}

/* ---------- Mốc bắt buộc chi tiết (để trống = không bắt buộc) ---------- */
function renderDetailLevel() {
  const note = $("#detail-level-note");
  if (!note) return;
  const d = detailLevelSummary(state.expenseReceipts);
  note.textContent = d.total ? `Phiếu tổng: ${d.summaryCount} (${money(d.summaryAmount)}) · Phiếu chi tiết: ${d.itemizedCount} (${money(d.itemizedAmount)}) trong các phiếu đang tải.` : "";
  $("#cutoff-note").textContent = state.detailCutoff ? `Từ ${new Date(state.detailCutoff).toLocaleDateString("vi-VN")} trở đi chỉ được nhập phiếu chi tiết.` : "Chưa đặt mốc: được phép nhập phiếu tổng cho mọi ngày.";
  const input = $("#cutoff-date");
  if (document.activeElement !== input) input.value = state.detailCutoff ? localDateInput(new Date(state.detailCutoff)) : "";
}
async function saveCutoff(clear) {
  if (!state.user) return;
  const value = $("#cutoff-date").value;
  if (!clear && !value) { $("#cutoff-note").textContent = "Chọn ngày mốc trước."; return; }
  const cutoffAt = clear ? null : new Date(`${value}T00:00:00`).getTime();
  try {
    await setDoc(doc(db, ...root, "config", "expenseDetail"), { cutoffAt, updatedAt: Date.now(), updatedBy: myName() });
    state.detailCutoff = cutoffAt;
    renderDetailLevel();
  } catch (error) { $("#cutoff-note").textContent = error.code === "permission-denied" ? "Không có quyền ghi mốc (cần mở quy tắc Firestore cho config/expenseDetail)." : `Không lưu được mốc: ${error.message}`; }
}

/* ---------- Phiếu chi: giữ ≥ từ đầu tháng trước, đọc tăng dần theo updatedAt, đệm trong trình duyệt ---------- */
const RECEIPT_CACHE_KEY = "pos0210.receipts.v1";
function readReceiptCache() { try { return JSON.parse(localStorage.getItem(RECEIPT_CACHE_KEY) || "null"); } catch { return null; } }
function writeReceiptCache(cache) { try { localStorage.setItem(RECEIPT_CACHE_KEY, JSON.stringify(cache)); } catch { /* đầy hoặc bị chặn: bỏ qua, lần sau đọc đủ */ } }
async function loadReceiptsCached() {
  const uid = state.user?.uid;
  const from = startOfPreviousMonth();
  const cache = readReceiptCache();
  const plan = planLoad(cache, { uid, from });
  try {
    const q = plan.mode === "incremental"
      ? query(collection(db, ...root, "expenseReceipts"), where("updatedAt", ">", plan.cursor), orderBy("updatedAt", "asc"), limit(500))
      : query(collection(db, ...root, "expenseReceipts"), where("purchaseDate", ">=", from), orderBy("purchaseDate", "desc"), limit(1000));
    const fetched = rows(await getDocs(q));
    const merged = mergeReceipts(plan.mode === "incremental" ? cache : null, fetched, { uid, from });
    writeReceiptCache(merged);
    state.expenseReceipts = merged.receipts;
    state.receiptsFrom = merged.from;
    state.reportFrom = merged.from;
    state.receiptsNote = plan.mode === "incremental" ? `Đọc thêm ${fetched.length} phiếu đổi` : `Đọc ${fetched.length} phiếu từ đầu tháng trước`;
  } catch (error) {
    // Lỗi mạng/quyền: dùng cache nếu có, nhưng nói rõ dữ liệu có thể cũ.
    if (cache?.uid === uid && Array.isArray(cache.receipts)) { state.expenseReceipts = cache.receipts; state.receiptsFrom = cache.from; state.reportFrom = cache.from; state.receiptsNote = `Không cập nhật được phiếu (${error.code || error.message}); đang dùng bản đã lưu`; }
    else { state.expenseReceipts = []; state.receiptsFrom = Date.now(); state.reportFrom = Date.now(); state.receiptsNote = `Không đọc được phiếu: ${error.code || error.message}`; }
  }
}

/* ---------- Tự cập nhật phiếu chi: phiếu sửa ở máy khác / vừa được duyệt thì giá vốn, công thức, gợi ý nhảy theo ---------- */
let receiptsRefreshAt = Date.now();
let receiptsRefreshing = false;
async function autoRefreshReceipts(force = false) {
  if (!state.user || !state.role || state.demo || state.simulation || receiptsRefreshing) return;
  if (document.visibilityState !== "visible") return;
  if (!force && Date.now() - receiptsRefreshAt < 30_000) return;
  if (document.querySelector("dialog[open]")) return; // đang nhập / sửa: đừng đổi dữ liệu dưới tay người dùng, lần sau sẽ cập nhật
  receiptsRefreshing = true;
  try {
    const before = JSON.stringify(state.expenseReceipts.map((r) => [r.id, r.updatedAt, r.review, r.status]));
    await loadReceiptsCached();
    receiptsRefreshAt = Date.now();
    if (before !== JSON.stringify(state.expenseReceipts.map((r) => [r.id, r.updatedAt, r.review, r.status]))) render();
  } catch { /* lần sau thử lại */ } finally { receiptsRefreshing = false; }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") autoRefreshReceipts(); });
window.addEventListener("focus", () => autoRefreshReceipts());
setInterval(() => autoRefreshReceipts(), 90_000);

/* ---------- Doanh thu theo tháng (dashboardMonthly) cho so sánh nhập hàng/doanh thu ---------- */
const MONTHLY_REPORT_MONTHS = 13;
async function loadMonthlyDocs() {
  state.monthlyError = "";
  const keys = lastMonthKeys(MONTHLY_REPORT_MONTHS);
  const current = keys[keys.length - 1];
  await Promise.all(keys.map(async (key) => {
    if (key !== current && state.monthlyDocs[key]) return; // tháng đã chốt không đọc lại
    try {
      const snap = await getDoc(doc(db, ...root, "dashboardMonthly", key));
      state.monthlyDocs[key] = snap.exists() ? snap.data() : null;
    } catch (error) { state.monthlyDocs[key] = null; state.monthlyError = error.code === "permission-denied" ? "Chưa có quyền đọc dashboardMonthly (cần mở quy tắc Firestore)." : (error.code || error.message); }
  }));
}
/** Tháng đầu tiên web có đủ phiếu: tháng của mốc nếu mốc là đầu tháng, ngược lại tháng kế tiếp. */
const reportSinceKey = () => {
  const from = new Date(state.reportFrom || Date.now());
  const startsMonth = from.getDate() === 1 && from.getHours() === 0 && from.getMinutes() === 0;
  return monthKeyOf(startsMonth ? from.getTime() : new Date(from.getFullYear(), from.getMonth() + 1, 1).getTime());
};
const currentMonthReport = () => {
  const keys = lastMonthKeys(MONTHLY_REPORT_MONTHS);
  const current = keys[keys.length - 1];
  const fallback = state.dashboard?.monthRevenue;
  return buildMonthlyReport({ receipts: costReceipts(), monthlyDocs: state.monthlyDocs, monthKeys: keys, currentMonthKey: current, revenueFallback: fallback === undefined ? null : fallback, otherCosts: otherCosts() });
};
function renderMonthlyReport() {
  const target = $("#monthly-report");
  if (!target) return;
  const all = currentMonthReport();
  const since = reportSinceKey();
  // Chỉ hiện các tháng web đã đọc đủ phiếu (từ đầu tháng của mốc đệm); tháng cũ hơn chỉ có doanh thu nên không so sánh được.
  const opening = state.investment?.openingMonth || "";
  const report = all.filter((r) => r.monthKey >= since && (!opening || r.monthKey >= opening));
  const note = [state.receiptsNote, state.monthlyError].filter(Boolean).join(" · ");
  $("#monthly-note").textContent = note;
  target.innerHTML = report.slice().reverse().map((r) => {
    const inv = Object.entries(r.otherByCategory || {}).filter(([k]) => INVESTMENT_CATEGORIES.has(k)).reduce((t, [, v]) => t + v, 0);
    const ops = r.otherExpenses - inv;
    const net = r.revenue === null ? null : r.revenue - r.purchases - ops - inv;
    const pct = (v) => (r.revenue ? ` <small class="muted">${((v / r.revenue) * 100).toFixed(1)}% DT</small>` : "");
    return `<article class="month-card"><h3>Tháng ${Number(r.monthKey.slice(5))}/${r.monthKey.slice(0, 4)}${r.monthKey === report[report.length - 1].monthKey ? " · đang chạy" : ""}</h3><dl>
    <div><dt>Doanh thu</dt><dd>${r.revenue === null ? "chưa có dữ liệu" : money(r.revenue)}</dd></div>
    <div><dt>− Nhập hàng</dt><dd>${money(r.purchases)}${pct(r.purchases)}</dd></div>
    <div><dt>− Chi vận hành khác</dt><dd>${ops ? money(ops) : "—"}${ops ? pct(ops) : ""}</dd></div>
    <div><dt>− Đầu tư bổ sung</dt><dd>${inv ? money(inv) : "—"}</dd></div>
    <div class="month-net"><dt>= Còn lại (dòng tiền ròng)</dt><dd>${net === null ? "—" : money(net)}</dd></div>
    <div class="month-sub"><dt>Số phiếu mua hàng</dt><dd>${r.receiptCount} phiếu${r.summaryAmount ? ` · ${money(r.summaryAmount)} nhập theo phiếu tổng (không có từng món)` : ""}</dd></div></dl>
    <button type="button" class="text-button" data-month-detail="${r.monthKey}">Xem từng khoản của tháng này ›</button></article>`;
  }).join("") || '<p class="muted">Chưa có phiếu trong khoảng đã tải.</p>';
}
function downloadFile(name, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function exportMonthly(kind) {
  const since = reportSinceKey();
  const report = currentMonthReport().filter((r) => r.monthKey >= since);
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === "csv") downloadFile(`${state.simulation ? "MOPHONG-" : ""}nhap-hang-theo-thang-${stamp}.csv`, "text/csv;charset=utf-8", monthlyCsv(report));
  else downloadFile(`${state.simulation ? "MOPHONG-" : ""}nhap-hang-theo-thang-${stamp}.json`, "application/json", monthlyJson(report, { rules: state.expenseRules }));
}

/* ---------- Chế độ mô phỏng: dữ liệu giả hoàn toàn trong trình duyệt, không đọc/ghi Firestore, không đụng bộ đệm ---------- */
function setSimulation(on) {
  if (on === !!state.simulation) return;
  if (on && state.demo) { $("#demo-note").textContent = "Tắt xem demo trước khi chạy mô phỏng."; return; }
  if (on) {
    const sim = buildSimulation({ months: 6 });
    state.simulation = { stash: { expenseReceipts: state.expenseReceipts, monthlyDocs: state.monthlyDocs, receiptsFrom: state.receiptsFrom, reportFrom: state.reportFrom, receiptsNote: state.receiptsNote, monthlyError: state.monthlyError, expenseRules: state.expenseRules } };
    Object.assign(state, { expenseReceipts: sim.receipts, monthlyDocs: sim.monthlyDocs, receiptsFrom: sim.from, reportFrom: sim.from, receiptsNote: "MÔ PHỎNG 6 tháng: phiếu tổng 2 tháng đầu, sau đó phiếu chi tiết; có dòng sai nhóm, tên mơ hồ, 1 tháng thiếu doanh thu, 1 phiếu huỷ", monthlyError: "", expenseRules: [] });
  } else {
    Object.assign(state, state.simulation.stash, { simulation: null });
  }
  document.body.classList.toggle("simulating", !!state.simulation);
  $("#sim-banner").hidden = !state.simulation;
  $("#sim-toggle").textContent = state.simulation ? "Tắt mô phỏng" : "Chạy mô phỏng (không ghi dữ liệu)";
  render();
}

/* ---------- Tải menu (đọc menu + nhóm món từ Firestore) để phân tích vật tư, định lượng ---------- */
async function exportMenu() {
  const note = $("#monthly-note");
  try {
    const [items, cats] = await Promise.all([getDocs(collection(db, ...root, "menu")), getDocs(collection(db, ...root, "menuCategories"))]);
    const list = rows(items);
    downloadFile(`menu-0210-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8", menuCsv(list, rows(cats)));
    note.textContent = `Đã tải menu: ${list.length} món.`;
  } catch (error) { note.textContent = error.code === "permission-denied" ? "Không có quyền đọc menu (menu, menuCategories)." : `Không tải được menu: ${error.message}`; }
}

/* ---------- Giá vốn món: menu + công thức (recipes/{menuId}) + giá vật tư từ phiếu chi ---------- */
const isFoodCategory = (name) => /an sang|com|bun|do an|an vat/.test(String(name || "").toLocaleLowerCase("vi").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d"));
const fmtQty = (q) => (Math.round(Number(q) * 100) / 100).toLocaleString("vi-VN");
const unitPriceLabel = (m, unitCost) => (m.base === "g" || m.base === "ml") ? `${money(Math.round(unitCost * 1000))}/${m.base === "g" ? "kg" : "lít"}` : `${money(Math.round(unitCost))}/${m.base}`;
let recipeEdit = null;
async function loadRecipes() {
  $("#recipe-note").textContent = "Đang đọc menu và công thức…";
  try {
    const [items, cats, recs, comboSnap] = await Promise.all([getDocs(collection(db, ...root, "menu")), getDocs(collection(db, ...root, "menuCategories")), getDocs(collection(db, ...root, "recipes")), getDocs(collection(db, ...root, "combos")).catch(() => null)]);
    state.combos = comboSnap ? rows(comboSnap).filter((c) => c.name).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)) : [];
    state.combosLoaded = !!comboSnap;
    state.menuItems = rows(items).filter((m) => m.deleted !== true && m.name);
    state.menuCats = rows(cats);
    state.recipes = Object.fromEntries(rows(recs).map((r) => [r.id, r]));
    state.recipesLoaded = true;
    state.recipeError = "";
    renderUsageCheck();
    loadCounts();
  } catch (error) { state.recipeError = error.code === "permission-denied" ? "Không có quyền đọc menu hoặc công thức (cần mở quy tắc Firestore cho recipes)." : (error.message || "lỗi không rõ"); }
  renderRecipes();
}
// Giá vật tư chỉ lấy từ phiếu ĐÃ DUYỆT: phiếu chờ duyệt / không duyệt có thể sai và sẽ làm lệch giá vốn.
// Tên vật tư thật trên các phiếu đó (và tên đang dùng trong công thức đã lưu) được đăng ký thành danh mục vật tư động.
let registryKey = "";
function syncMaterialRegistry() {
  const approved = materialReceipts().filter(countsAsCost);
  const recs = Object.values(state.recipes || {});
  const key = `${approved.length}|${approved.reduce((t, r) => Math.max(t, Number(r.updatedAt || r.purchaseDate || 0)), 0)}|${recs.length}|${recs.reduce((t, r) => Math.max(t, Number(r.updatedAt || 0)), 0)}`;
  if (key !== registryKey) { registryKey = key; registerDynamicMaterials(buildDynamicMaterials(approved, recs.flatMap((r) => r.lines || []))); }
  return approved;
}
function currentCosts() { return materialCosts(syncMaterialRegistry()); }
function recipeLinesFor(item) { return state.recipes[item.id]?.lines?.map((l) => ({ ...l })) ?? draftRecipeFor(item.name); }
function renderRecipes() {
  const host = $("#recipe-list");
  if (!host) return;
  const { costs, unconvertible, unmatched } = currentCosts();
  const priced = MATERIALS.filter((m) => costs[m.id]).length;
  $("#recipe-note").textContent = state.recipeError || `${priced}/${MATERIALS.length} vật tư đã có giá từ phiếu chi${unconvertible.length ? ` · ${unconvertible.length} dòng phiếu không quy đổi được đơn vị` : ""}${state.simulation ? " · ĐANG MÔ PHỎNG" : ""}${state.demo ? " · ĐANG XEM DỮ LIỆU DEMO" : ""}.`;
  const cats = new Map(state.menuCats.map((c) => [String(c.id), c]));
  const items = state.menuItems.filter((m) => m.active !== false).sort((a, b) => Number(cats.get(String(a.categoryId))?.sortOrder ?? 99) - Number(cats.get(String(b.categoryId))?.sortOrder ?? 99) || Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  host.innerHTML = items.map((item) => {
    const catName = cats.get(String(item.categoryId))?.name ?? "";
    const lines = recipeLinesFor(item);
    const saved = Boolean(state.recipes[item.id]);
    const r = recipeCost(lines, costs, item.price);
    // Thiếu giá vật tư nào thì không kết luận %: chỉ hiện phần đã tính được (≥).
    const level = lines.length && !r.missing.length ? costLevel(r.percent, isFoodCategory(catName)) : "unknown";
    const pct = r.percent === null || !lines.length || r.missing.length ? "—" : `${Math.round(r.percent * 100)}%`;
    const costText = !lines.length ? "—" : r.missing.length ? (r.total > 0 ? `≥ ${money(r.total)}` : "chưa đủ giá") : money(r.total);
    const status = !lines.length ? "chưa có công thức" : saved ? "đã lưu" : "bản nháp";
    return `<button type="button" class="recipe-row" data-menu-id="${escapeHtml(item.id)}"><span class="recipe-name"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(catName)} · ${status}${r.missing.length ? ` · thiếu giá: ${escapeHtml(r.missing.join(", "))}` : ""}</small></span><span class="recipe-num">${money(item.price)}</span><span class="recipe-num">${costText}</span><span class="cost-chip ${level}">${pct}</span></button>`;
  }).join("") || '<p class="muted">Chưa có món nào.</p>';
  host.querySelectorAll("[data-menu-id]").forEach((b) => b.addEventListener("click", () => openRecipe(b.dataset.menuId)));
  $("#material-costs").innerHTML = `<div class="table-wrap"><table class="mat-table"><thead><tr><th>Vật tư</th><th>Loại</th><th>Giá</th><th>Nguồn</th></tr></thead><tbody>${MATERIALS.map((m) => {
    const c = costs[m.id];
    return `<tr class="${c ? "" : "dim"}"><td>${escapeHtml(m.name)}</td><td>${KIND_LABELS[m.kind]}${m.dynamic ? " · tên từ phiếu chi" : ""}</td><td>${c ? unitPriceLabel(m, c.unitCost) : "chưa có"}</td><td>${c ? `${c.source} · ${c.buys} lần<small class="muted"> · ${c.sources.map((x) => `${escapeHtml(receiptCode(findReceipt(x.receiptId) || { code: x.code, id: x.receiptId }))}${x.name ? ` “${escapeHtml(x.name)}”` : ""}`).join("; ")}</small>` : ""}</td></tr>`;
  }).join("")}</tbody></table></div>${uncountedHtml(unconvertible)}${unmatched.length ? `<p class="reimb-sub">Dòng phiếu đã duyệt chưa ghép được vật tư chuẩn · ${unmatched.length}</p><p class="muted">Các dòng này chưa tính vào giá vật tư. Sửa tên dòng cho đúng vật tư trong danh mục (hoặc chọn từ danh sách khi nhập phiếu).</p><ul class="rc-list">${unmatched.slice(0, 30).map((x) => `<li><b>${escapeHtml(x.name)}</b> · ${x.qty} ${escapeHtml(x.unit)} · ${money(x.amount)} — phiếu ${escapeHtml(receiptCode(findReceipt(x.receiptId) || { code: x.code, id: x.receiptId }))}</li>`).join("")}</ul>` : ""}`;
}
/** Dòng phiếu chi có giá nhưng chưa vào bảng giá vật tư, kèm lý do: chờ duyệt, bị trả lại, hoặc đơn vị không quy đổi được. */
function uncountedHtml(unconvertible) {
  const rc = (id, code) => escapeHtml(receiptCode(findReceipt(id) || { code, id }));
  const editBtn = (id) => (findReceipt(id) ? ` <button type="button" class="text-button" data-edit-receipt="${escapeHtml(id)}">Xem / sửa</button>` : "");
  const pending = [], rejected = [];
  for (const r of state.expenseReceipts) {
    const st = reviewStatus(r);
    if ((st !== "PENDING" && st !== "REJECTED") || kindOf(r) !== "MATERIAL" || isSummaryReceipt(r) || isInitialReceipt(r)) continue;
    for (const line of r.items || []) {
      const qty = Number(line.qty || 0), amount = Number(line.amount ?? qty * Number(line.unitPrice || 0));
      if (!String(line.materialName || "").trim() || !(qty > 0) || !(amount > 0)) continue;
      (st === "PENDING" ? pending : rejected).push({ id: r.id, name: String(line.materialName).trim(), qty, unit: line.unit || "", amount });
    }
  }
  const seen = new Set();
  const unit = [];
  for (const x of unconvertible) {
    const k = `${x.receiptId}|${x.materialId}|${x.name}|${x.unit}`;
    if (seen.has(k)) continue; seen.add(k);
    const m = materialById.get(x.materialId);
    unit.push({ id: x.receiptId, name: String(x.name || ""), unit: x.unit || "(trống)", target: m?.name || "", base: m?.base || "" });
  }
  const block = (title, hint, list, row) => (list.length ? `<p class="reimb-sub">${title} · ${list.length}</p><p class="muted">${hint}</p><ul class="rc-list">${list.slice(0, 30).map(row).join("")}</ul>${list.length > 30 ? `<p class="muted">Hiện 30 / ${list.length} dòng.</p>` : ""}` : "");
  return block("Chờ duyệt nên chưa tính giá", "Phiếu chỉ vào bảng giá sau khi được duyệt (phiếu vừa sửa cũng phải duyệt lại).", pending, (x) => `<li><b>${escapeHtml(x.name)}</b> · ${x.qty} ${escapeHtml(x.unit)} · ${money(x.amount)} — phiếu ${rc(x.id)}${editBtn(x.id)}</li>`)
    + block("Bị trả lại nên chưa tính giá", "Người nhập cần sửa phiếu rồi gửi duyệt lại.", rejected, (x) => `<li><b>${escapeHtml(x.name)}</b> · ${x.qty} ${escapeHtml(x.unit)} · ${money(x.amount)} — phiếu ${rc(x.id)}${editBtn(x.id)}</li>`)
    + block("Đơn vị không quy đổi được", "Đơn vị trên phiếu không đổi được sang đơn vị gốc của vật tư (ví dụ phiếu ghi “túi” nhưng vật tư tính theo kg). Sửa đơn vị trên phiếu thành kg / g / lít / ml hoặc đơn vị đã khai báo cho vật tư đó.", unit, (x) => `<li><b>${escapeHtml(x.name)}</b> · đơn vị “${escapeHtml(x.unit)}”${x.target ? ` → vật tư ${escapeHtml(x.target)} tính theo ${escapeHtml(x.base)}` : ""} — phiếu ${rc(x.id)}${editBtn(x.id)}</li>`);
}
$("#material-costs").addEventListener("click", (event) => { const b = event.target.closest("[data-edit-receipt]"); if (b) openReceiptEditor(b.dataset.editReceipt); });
function openRecipe(menuId) {
  const item = state.menuItems.find((m) => m.id === menuId);
  if (!item) return;
  recipeEdit = { item, lines: recipeLinesFor(item) };
  $("#recipe-title").textContent = `${item.name} · ${money(item.price)}`;
  $("#recipe-meta").textContent = state.recipes[item.id] ? "Công thức đã lưu. Kéo thanh để tăng giảm định lượng." : "Bản nháp gợi ý, chưa lưu. Kéo thanh cho đúng định lượng của quán rồi bấm Lưu.";
  $("#recipe-error").textContent = "";
  syncMaterialRegistry();
  // Vật tư đã xác nhận loại khi lưu công thức thì giữ nguyên xác nhận; chỉ hỏi lại khi có vật tư mới giống nó xuất hiện sau lần xác nhận.
  recipeEdit.lines.forEach((l) => {
    const known = Array.isArray(l.confirmedAgainst) ? new Set(l.confirmedAgainst) : null;
    const now = similarMaterials(l.materialId).map((x) => x.id);
    l.confirmed = Boolean(l.confirmedAt) && (known === null || now.every((id) => known.has(id)));
    if (!l.confirmed) { delete l.confirmedAt; delete l.confirmedBy; delete l.confirmedAgainst; }
  });
  const { costs: pickCosts } = currentCosts();
  const opt = (m) => `<option value="${m.id}">${escapeHtml(m.name)} (${m.base})${pickCosts[m.id] ? ` · ${unitPriceLabel(m, pickCosts[m.id].unitCost)}` : ""}</option>`;
  const pickable = MATERIALS.filter((m) => m.kind !== "VH" && !m.stub);
  recipePick.items = pickable.map((m) => ({ id: m.id, name: m.name, base: m.base, dynamic: Boolean(m.dynamic), price: pickCosts[m.id] ? unitPriceLabel(m, pickCosts[m.id].unitCost) : "" }));
  $("#recipe-add-search").value = ""; hideRecipeResults();
  $("#recipe-add-select").innerHTML = `<option value="">Chọn vật tư…</option><optgroup label="Tên thật từ phiếu chi đã duyệt">${pickable.filter((m) => m.dynamic).map(opt).join("")}</optgroup><optgroup label="Danh mục chuẩn">${pickable.filter((m) => !m.dynamic).map(opt).join("")}</optgroup>`;
  renderRecipeLines();
  $("#recipe-dialog").showModal();
}
function renderRecipeLines() {
  const { costs } = currentCosts();
  const host = $("#recipe-lines");
  host.innerHTML = recipeEdit.lines.map((l, i) => {
    const m = materialById.get(l.materialId);
    const spec = sliderSpec(m?.base, l.qty);
    const c = costs[l.materialId];
    const dups = similarMaterials(l.materialId);
    const choice = (x, checked) => `<label class="recipe-dup-opt"><input type="radio" name="dup-${i}" value="${escapeHtml(x.id)}" ${checked ? "checked" : ""} /> <span><b>${escapeHtml(x.name)}</b>${x.dynamic ? " <small>(tên từ phiếu chi)</small>" : ""} · ${costs[x.id] ? `${unitPriceLabel(x, costs[x.id].unitCost)}${costs[x.id].sources?.[0] ? ` · ${escapeHtml(receiptCode(findReceipt(costs[x.id].sources[0].receiptId) || { code: costs[x.id].sources[0].code, id: costs[x.id].sources[0].receiptId }))}` : ""}` : "chưa có giá"}</span></label>`;
    const dupHtml = !dups.length ? "" : l.confirmed
      ? `<p class="recipe-dup ok">✓ Đã xác nhận loại vật tư: <b>${escapeHtml(m?.name ?? "")}</b></p>`
      : `<div class="recipe-dup warn" data-dup="${i}"><p>⚠ Vật tư này có thể trùng loại với vật tư khác. Chọn đúng loại tại thời điểm cập nhật công thức rồi bấm xác nhận:</p>${choice(m || { id: l.materialId, name: l.materialId, base: "" }, true)}${dups.map((x) => choice(x, false)).join("")}<button type="button" class="btn" data-confirm="${i}">XÁC NHẬN LOẠI VẬT TƯ NÀY</button></div>`;
    return `<div class="recipe-line" data-i="${i}"><div class="recipe-line-head"><strong>${escapeHtml(m?.name ?? l.name ?? l.materialId)}</strong><span data-cost>${c ? money(Math.round(l.qty * c.unitCost)) : "chưa có giá"}</span><button type="button" class="text-button" data-remove="${i}" aria-label="Bỏ ${escapeHtml(m?.name ?? "")}">Bỏ</button></div><div class="recipe-line-ctl"><input type="range" id="rq-${i}" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${l.qty}" aria-label="Định lượng ${escapeHtml(m?.name ?? "")}" /><input type="number" id="rn-${i}" min="0" step="${spec.step}" value="${l.qty}" aria-label="Số lượng" /><span class="unit">${escapeHtml(m?.base ?? "")}</span></div>${dupHtml}</div>`;
  }).join("") || '<p class="muted">Chưa có vật tư. Chọn vật tư bên dưới để thêm.</p>';
  host.querySelectorAll("[data-dup] input[type=radio]").forEach((radio) => radio.addEventListener("change", () => {
    const i = Number(radio.closest("[data-dup]").dataset.dup);
    recipeEdit.lines[i].materialId = radio.value;
    recipeEdit.lines[i].name = materialById.get(radio.value)?.name;
    recipeEdit.lines[i].confirmed = false; delete recipeEdit.lines[i].confirmedAt; delete recipeEdit.lines[i].confirmedBy; delete recipeEdit.lines[i].confirmedAgainst; // đổi loại vật tư thì phải xác nhận lại
    renderRecipeLines();
  }));
  host.querySelectorAll("[data-confirm]").forEach((b) => b.addEventListener("click", () => {
    const l = recipeEdit.lines[Number(b.dataset.confirm)];
    l.confirmed = true; l.confirmedAt = Date.now(); l.confirmedBy = myName();
    l.confirmedAgainst = similarMaterials(l.materialId).map((x) => x.id).sort(); // các vật tư giống nó tại thời điểm xác nhận
    renderRecipeLines();
  }));
  host.querySelectorAll(".recipe-line").forEach((row) => {
    const i = Number(row.dataset.i);
    const range = row.querySelector('input[type="range"]');
    const num = row.querySelector('input[type="number"]');
    const set = (v) => {
      const q = Math.max(0, Number(v) || 0);
      recipeEdit.lines[i].qty = q;
      range.value = q; num.value = q;
      const c = costs[recipeEdit.lines[i].materialId];
      row.querySelector("[data-cost]").textContent = c ? money(Math.round(q * c.unitCost)) : "chưa có giá";
      updateRecipeTotal();
    };
    range.addEventListener("input", () => set(range.value));
    num.addEventListener("input", () => set(num.value));
    num.addEventListener("change", () => { if (Number(num.value) > Number(range.max)) renderRecipeLines(); });
  });
  host.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => { recipeEdit.lines.splice(Number(b.dataset.remove), 1); renderRecipeLines(); }));
  updateRecipeTotal();
}
function updateRecipeTotal() {
  const { costs } = currentCosts();
  const r = recipeCost(recipeEdit.lines, costs, recipeEdit.item.price);
  const cat = state.menuCats.find((c) => String(c.id) === String(recipeEdit.item.categoryId))?.name;
  $("#recipe-total").textContent = `${money(r.total)}${r.missing.length ? ` (thiếu giá ${r.missing.length} vật tư)` : ""}`;
  const pctEl = $("#recipe-percent");
  pctEl.textContent = r.missing.length ? "chưa đủ giá để tính %" : r.percent === null ? "—" : `${Math.round(r.percent * 100)}% giá bán`;
  pctEl.className = `cost-chip ${r.missing.length ? "unknown" : costLevel(r.percent, isFoodCategory(cat))}`;
}
async function saveRecipe() {
  const live = recipeEdit.lines.filter((l) => Number(l.qty) > 0);
  const pending = live.filter((l) => similarMaterials(l.materialId).length && !l.confirmed);
  if (pending.length) { $("#recipe-error").textContent = `Còn ${pending.length} vật tư có thể trùng loại, hãy chọn đúng loại và bấm XÁC NHẬN: ${pending.map((l) => materialById.get(l.materialId)?.name ?? l.materialId).join(", ")}.`; return; }
  const lines = live.map((l) => { const m = materialById.get(l.materialId); return { materialId: l.materialId, qty: Math.round(Number(l.qty) * 100) / 100, name: m?.name ?? l.name ?? "", base: m?.base ?? l.base ?? "", ...(l.confirmedAt ? { confirmedAt: l.confirmedAt, confirmedBy: l.confirmedBy || "", confirmedAgainst: Array.isArray(l.confirmedAgainst) ? l.confirmedAgainst : similarMaterials(l.materialId).map((x) => x.id).sort() } : {}) }; });
  const payload = { id: recipeEdit.item.id, menuItemId: recipeEdit.item.id, menuName: recipeEdit.item.name, lines, updatedAt: Date.now(), updatedBy: myName() };
  try {
    await setDoc(doc(db, ...root, "recipes", recipeEdit.item.id), payload);
    state.recipes[recipeEdit.item.id] = payload;
    $("#recipe-dialog").close();
    renderRecipes();
    if (state.itemMode === "output") renderSalesSnapshots();
  } catch (error) { $("#recipe-error").textContent = error.code === "permission-denied" ? "Không có quyền lưu công thức (cần mở quy tắc Firestore cho recipes)." : error.message; }
}
$("#reload-recipes").addEventListener("click", () => { state.recipesLoaded = false; loadRecipes(); });
$("#close-recipe").addEventListener("click", () => $("#recipe-dialog").close());
$("#recipe-save").addEventListener("click", saveRecipe);
$("#recipe-draft").addEventListener("click", () => { recipeEdit.lines = draftRecipeFor(recipeEdit.item.name).map((l) => ({ ...l, confirmed: false })); renderRecipeLines(); });
/* Tìm vật tư theo chữ: không phân biệt dấu / hoa thường, không cần đúng thứ tự chữ cái (material-search.js). */
const recipePick = { items: [], matches: [], active: -1 };
const recipeResults = () => $("#recipe-add-results");
function hideRecipeResults() { const ul = recipeResults(); if (ul) { ul.hidden = true; ul.innerHTML = ""; } recipePick.matches = []; recipePick.active = -1; }
function renderRecipeResults() {
  const ul = recipeResults(), term = $("#recipe-add-search").value;
  const found = searchMaterials(recipePick.items, term);
  recipePick.matches = found; recipePick.active = found.length ? 0 : -1;
  ul.innerHTML = found.length
    ? found.map((m, i) => `<li role="option"><button type="button" data-pick-material="${escapeHtml(m.id)}" class="${i === 0 ? "active" : ""}"><span>${escapeHtml(m.name)} <small>(${escapeHtml(m.base)})</small></span><small>${escapeHtml(m.price || (m.dynamic ? "từ phiếu chi" : "danh mục"))}</small></button></li>`).join("")
    : '<li class="recipe-empty">Không có vật tư nào khớp. Thử gõ ít chữ hơn hoặc bỏ dấu.</li>';
  ul.hidden = false;
}
function chooseRecipeMaterial(id) {
  if (!id || !materialById.get(id)) return;
  $("#recipe-add-select").value = id;
  const m = materialById.get(id);
  recipeEdit.lines.push({ materialId: id, name: m.name, qty: m.base === "g" || m.base === "ml" ? 10 : 1, confirmed: false });
  $("#recipe-add-search").value = ""; hideRecipeResults();
  renderRecipeLines();
  $("#recipe-add-search").focus();
}
$("#recipe-add-search").addEventListener("input", renderRecipeResults);
$("#recipe-add-search").addEventListener("focus", renderRecipeResults);
$("#recipe-add-search").addEventListener("keydown", (event) => {
  const ul = recipeResults();
  if (event.key === "Escape") { hideRecipeResults(); return; }
  if (ul.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) { renderRecipeResults(); event.preventDefault(); return; }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const n = recipePick.matches.length; if (!n) return;
    recipePick.active = (recipePick.active + (event.key === "ArrowDown" ? 1 : -1) + n) % n;
    ul.querySelectorAll("button").forEach((b, i) => { b.classList.toggle("active", i === recipePick.active); if (i === recipePick.active) b.scrollIntoView({ block: "nearest" }); });
  } else if (event.key === "Enter") {
    event.preventDefault();
    const m = recipePick.matches[Math.max(0, recipePick.active)];
    if (m) chooseRecipeMaterial(m.id);
  }
});
recipeResults().addEventListener("mousedown", (event) => event.preventDefault()); // giữ focus ở ô tìm khi bấm vào kết quả
recipeResults().addEventListener("click", (event) => { const b = event.target.closest("[data-pick-material]"); if (b) chooseRecipeMaterial(b.dataset.pickMaterial); });
document.addEventListener("click", (event) => { if (!event.target.closest(".recipe-pick")) hideRecipeResults(); });
$("#recipe-add").addEventListener("click", () => {
  // Bấm "+ Thêm" khi đã gõ chữ: lấy kết quả đầu / kết quả đang chọn.
  if (!$("#recipe-add-search").value.trim()) { $("#recipe-add-search").focus(); renderRecipeResults(); return; }
  if (recipeResults().hidden) renderRecipeResults();
  const m = recipePick.matches[Math.max(0, recipePick.active)];
  if (m) chooseRecipeMaterial(m.id);
});

/* ---------- Dữ liệu DEMO: phiếu chi thử lưu ở collection riêng (máy POS không đọc), xoá hết được sau khi thử ---------- */
function salesForDemo() {
  const avg = averageDailySales(state.dailyDocs, dailyKeys(7));
  return Object.keys(avg).length ? { sales: avg, source: "bán thật 7 ngày gần nhất" } : { sales: DEFAULT_DAILY_SALES, source: "lượng bán giả định" };
}
/** Công thức theo tên món: bản đã lưu của món cùng tên (không dấu), không có thì bản nháp. */
function recipeByName(name) {
  const key = name.toLocaleLowerCase("vi").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
  const item = state.menuItems.find((m) => m.name.toLocaleLowerCase("vi").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim() === key);
  return (item && state.recipes[item.id]?.lines) || draftRecipeFor(name);
}
async function readDemoReceipts() { return rows(await getDocs(query(collection(db, ...root, DEMO_COLLECTION), limit(3000)))); }
function demoError(error) { return error.code === "permission-denied" ? "Không có quyền với collection demoExpenseReceipts (cần mở quy tắc Firestore)." : (error.message || "lỗi không rõ"); }
async function setDemo(on) {
  const note = $("#demo-note");
  if (on === !!state.demo) return;
  if (on && state.simulation) { note.textContent = "Tắt mô phỏng trước khi xem demo."; return; }
  if (on) {
    note.textContent = "Đang đọc phiếu demo…";
    try {
      const list = await readDemoReceipts();
      state.demo = { stash: { expenseReceipts: state.expenseReceipts, receiptsFrom: state.receiptsFrom, reportFrom: state.reportFrom, receiptsNote: state.receiptsNote } };
      const from = list.length ? Math.min(...list.map((r) => Number(r.purchaseDate || Date.now()))) : Date.now();
      const firstOfMonth = new Date(new Date(from).getFullYear(), new Date(from).getMonth(), 1).getTime();
      Object.assign(state, { expenseReceipts: list.sort((a, b) => b.purchaseDate - a.purchaseDate), receiptsFrom: firstOfMonth, reportFrom: firstOfMonth, receiptsNote: `DEMO: ${list.length} phiếu` });
      note.textContent = list.length ? `Đang xem ${list.length} phiếu demo.` : "Chưa có phiếu demo. Bấm Tạo bộ phiếu demo.";
    } catch (error) { note.textContent = demoError(error); return; }
  } else {
    Object.assign(state, state.demo.stash, { demo: null });
    note.textContent = "Đã quay về dữ liệu thật.";
  }
  document.body.classList.toggle("demo-view", !!state.demo);
  if (state.countsLoaded) loadCounts();
  if (state.reimbLoaded) loadReimbursements();
  $("#demo-banner").hidden = !state.demo;
  $("#demo-toggle").textContent = state.demo ? "Tắt xem demo" : "Xem dữ liệu demo";
  render();
}
async function createDemo() {
  const note = $("#demo-note");
  if (!state.user || state.simulation) return;
  try {
    const existing = await readDemoReceipts();
    if (existing.length) { note.textContent = `Đã có ${existing.length} phiếu demo. Xoá bộ cũ trước khi tạo bộ mới để không bị cộng trùng.`; return; }
    const existingCounts = rows(await getDocs(query(collection(db, ...root, "demoStockCounts"), limit(1))));
    if (existingCounts.length) { note.textContent = "Còn lần kiểm đếm demo cũ. Bấm Xoá toàn bộ phiếu demo trước."; return; }
    if (!state.recipesLoaded) await loadRecipes();
    const { sales, source } = salesForDemo();
    const d = new Date();
    const batch = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    const list = buildDemoReceipts({ now: Date.now(), days: 30, dailySales: sales, recipeFor: recipeByName, batch, uid: state.user.uid, seed: Date.now() % 100000 });
    if (!window.confirm(`Tạo ${list.length} phiếu chi DEMO trong 30 ngày (theo ${source})? Phiếu demo nằm riêng, không vào máy POS, xoá được hết.`)) return;
    note.textContent = `Đang ghi ${list.length} phiếu demo…`;
    for (let i = 0; i < list.length; i += 400) {
      const batchWrite = writeBatch(db);
      list.slice(i, i + 400).forEach((r) => batchWrite.set(doc(db, ...root, DEMO_COLLECTION, r.id), r));
      await batchWrite.commit();
    }
    const counts = buildDemoCounts({ receipts: list, usagePerDay: dailyMaterialUsage(sales, recipeByName), waste: DEMO_WASTE, now: Date.now(), batch });
    const cw = writeBatch(db);
    counts.forEach((c) => cw.set(doc(db, ...root, "demoStockCounts", c.id), c));
    await cw.commit();
    note.textContent = `Đã tạo ${list.length} phiếu demo (đợt ${batch}, theo ${source}).`;
    if (state.demo) { state.demo.stash && Object.assign(state, { expenseReceipts: list }); render(); } else await setDemo(true);
  } catch (error) { note.textContent = demoError(error); }
}
async function deleteDemo() {
  const note = $("#demo-note");
  try {
    const list = await readDemoReceipts();
    const counts = rows(await getDocs(query(collection(db, ...root, "demoStockCounts"), limit(500))));
    if (!list.length && !counts.length) { note.textContent = "Không có phiếu demo nào."; return; }
    if (!window.confirm(`Xoá hẳn ${list.length} phiếu demo và ${counts.length} lần kiểm đếm demo? Chỉ xoá trong mục demo, dữ liệu thật không bị đụng.`)) return;
    note.textContent = `Đang xoá ${list.length} phiếu demo…`;
    const refs = [...list.map((r) => doc(db, ...root, DEMO_COLLECTION, r.id)), ...counts.map((c) => doc(db, ...root, "demoStockCounts", c.id))];
    for (let i = 0; i < refs.length; i += 400) {
      const batchWrite = writeBatch(db);
      refs.slice(i, i + 400).forEach((ref) => batchWrite.delete(ref));
      await batchWrite.commit();
    }
    note.textContent = `Đã xoá ${list.length} phiếu demo và ${counts.length} lần kiểm đếm demo.`;
    if (state.demo) { state.expenseReceipts = []; state.stockCounts = []; render(); }
  } catch (error) { note.textContent = demoError(error); }
}
$("#demo-toggle").addEventListener("click", () => setDemo(!state.demo));
$("#demo-create").addEventListener("click", createDemo);
$("#demo-delete").addEventListener("click", deleteDemo);

/* ---------- Nhập so với định mức (7 ngày): lượng mua thực tế so với lượng lẽ ra phải dùng theo công thức ---------- */
function renderUsageCheck() {
  const host = $("#usage-check");
  if (!host) return;
  syncMaterialRegistry();
  const { sales, source } = state.demo && !Object.keys(averageDailySales(state.dailyDocs, dailyKeys(7))).length ? { sales: DEFAULT_DAILY_SALES, source: "lượng bán giả định của bộ demo" } : salesForDemo();
  const usage = dailyMaterialUsage(sales, recipeByName);
  const to = new Date(); const toMs = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).getTime();
  const fromMs = toMs - 7 * 86400000;
  const rowsUsage = usageVsPurchase({ receipts: materialReceipts(), usagePerDay: usage, from: fromMs, to: toMs });
  const fmt = (q, base) => (base === "g" || base === "ml") ? `${(q / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ${base === "g" ? "kg" : "lít"}` : `${Math.round(q * 10) / 10} ${base}`;
  const chip = (r) => r.ratio === null ? '<span class="cost-chip unknown">không có định mức</span>' : `<span class="cost-chip ${r.ratio > 1.25 || r.ratio < 0.6 ? "bad" : r.ratio > 1.1 || r.ratio < 0.85 ? "warn" : "ok"}">${Math.round(r.ratio * 100)}%</span>`;
  $("#usage-note").textContent = `Định mức tính từ ${source} × công thức. Đồ khô mua theo tuần (cà phê, sữa, gia vị) cần xem khoảng dài hơn mới đúng; đồ tươi (thịt, rau, bánh mì) xem 7 ngày là được.`;
  host.innerHTML = rowsUsage.length ? `<div class="table-wrap"><table class="mat-table"><thead><tr><th>Vật tư</th><th>Định mức 7 ngày</th><th>Thực nhập</th><th>Nhập / định mức</th></tr></thead><tbody>${rowsUsage.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${r.expected ? fmt(r.expected, r.base) : "—"}</td><td>${r.bought ? fmt(r.bought, r.base) : "chưa nhập"}</td><td>${chip(r)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Chưa có phiếu chi chi tiết trong 7 ngày.</p>';
}

/* ---------- Chi phí khác (Giao dịch khác trên web, chi phí nhập trên máy POS): collection purchases ---------- */
async function loadOtherPurchases() {
  try {
    const from = startOfPreviousMonth();
    state.otherPurchases = rows(await getDocs(query(collection(db, ...root, "purchases"), where("purchasedAt", ">=", from), orderBy("purchasedAt", "desc"), limit(800))));
  } catch { state.otherPurchases = []; }
}
/** Chi phí ngoài phiếu mua hàng; khi xem demo/mô phỏng thì không trộn dữ liệu thật vào. */
function allOtherCosts() {
  if (state.demo || state.simulation) return [];
  return otherCostRows(state.otherPurchases, new Set(state.expenseReceipts.map((r) => String(r.id))));
}
const isInitialCost = (c) => INITIAL_CATEGORIES.has(c.category) || beforeOpening(c.at);
function otherCosts() { return allOtherCosts().filter((c) => !isInitialCost(c)); }
/** Ghi chép đầu tư ban đầu cũ: hiện khi bấm xem, gắn nhãn "không tính". */
function initialRecords() {
  return {
    receipts: state.expenseReceipts.filter((r) => reviewStatus(r) !== "NONE" && isInitialReceipt(r)),
    others: allOtherCosts().filter(isInitialCost),
  };
}

/* ---------- Kiểm đếm tồn kho hằng tuần (stockCounts; khi xem demo dùng demoStockCounts) ---------- */
const countCollection = () => (state.demo ? "demoStockCounts" : "stockCounts");
async function loadCounts() {
  try {
    state.stockCounts = rows(await getDocs(query(collection(db, ...root, countCollection()), orderBy("countedAt", "desc"), limit(20)))).sort((a, b) => Number(b.countedAt) - Number(a.countedAt));
    state.countsError = "";
  } catch (error) { state.stockCounts = []; state.countsError = error.code === "permission-denied" ? `Không có quyền với ${countCollection()} (cần mở quy tắc Firestore).` : (error.message || "lỗi không rõ"); }
  state.countsLoaded = true;
  renderCounts();
}
function expectedUsageBetween(from, to) {
  const { sales } = state.demo && !Object.keys(averageDailySales(state.dailyDocs, dailyKeys(7))).length ? { sales: DEFAULT_DAILY_SALES } : salesForDemo();
  const perDay = dailyMaterialUsage(sales, recipeByName);
  const days = (to - from) / 86400000;
  return Object.fromEntries(Object.entries(perDay).map(([k, v]) => [k, v * days]));
}
function renderCounts() {
  const form = $("#count-form-items");
  if (!form) return;
  if (!$("#count-datetime").value) $("#count-datetime").value = localDateTimeInput(new Date());
  if (!form.childElementCount) form.innerHTML = COUNT_ITEMS.map(({ id, unit }) => `<label class="count-row"><span>${escapeHtml(materialById.get(id).name)}</span><input id="count-${id}" data-material="${id}" data-unit="${unit}" type="number" min="0" step="0.01" inputmode="decimal" placeholder="—" /><span class="unit">${unit}</span></label>`).join("");
  const list = state.stockCounts;
  $("#count-note").textContent = state.countsError || (list.length ? `Đã có ${list.length} lần đếm${state.demo ? " (demo)" : ""}. Lần gần nhất: ${dateTime(list[0].countedAt)}.` : `Chưa có lần đếm nào${state.demo ? " (demo)" : ""}. Cần ít nhất 2 lần đếm để tính hao hụt.`);
  const host = $("#count-variance");
  if (list.length < 2) { host.innerHTML = ""; return; }
  const [next, prev] = list;
  const { costs } = currentCosts();
  const rows2 = varianceBetween({ prev, next, receipts: state.expenseReceipts, expectedUsage: expectedUsageBetween, costs });
  const fmt = (q, base) => (base === "g" || base === "ml") ? `${(q / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ${base === "g" ? "kg" : "lít"}` : `${Math.round(q * 10) / 10} ${base}`;
  const total = rows2.reduce((s, r) => s + (r.diffValue && r.diffValue > 0 ? r.diffValue : 0), 0);
  host.innerHTML = `<p class="muted">Kỳ ${dateTime(prev.countedAt)} → ${dateTime(next.countedAt)} · hao hụt ước tính ${money(total)} (chỉ tính vật tư dùng vượt định mức).</p><div class="table-wrap"><table class="mat-table"><thead><tr><th>Vật tư</th><th>Tồn đầu</th><th>Nhập</th><th>Tồn cuối</th><th>Thực dùng</th><th>Định mức</th><th>Chênh</th></tr></thead><tbody>${rows2.map((r) => {
    const level = r.suspicious ? "bad" : r.diffPct === null ? "unknown" : r.diffPct > 0.15 ? "bad" : r.diffPct > 0.05 ? "warn" : r.diffPct < -0.15 ? "warn" : "ok";
    const label = r.suspicious ? "số đếm sai?" : r.diffPct === null ? "chưa có định mức" : `${r.diffPct > 0 ? "+" : ""}${Math.round(r.diffPct * 100)}%${r.diffValue !== null ? ` · ${money(r.diffValue)}` : ""}`;
    return `<tr><td>${escapeHtml(r.name)}</td><td>${fmt(r.opening, r.base)}</td><td>${fmt(r.bought, r.base)}</td><td>${fmt(r.closing, r.base)}</td><td>${fmt(r.actual, r.base)}</td><td>${r.expected ? fmt(r.expected, r.base) : "—"}</td><td><span class="cost-chip ${level}">${label}</span></td></tr>`;
  }).join("")}</tbody></table></div>`;
}
async function saveCount(event) {
  event.preventDefault();
  const err = $("#count-error");
  err.textContent = "";
  if (state.simulation) { err.textContent = "Đang mô phỏng: không lưu."; return; }
  const at = new Date($("#count-datetime").value).getTime();
  if (!Number.isFinite(at)) { err.textContent = "Ngày giờ đếm không hợp lệ."; return; }
  const items = {};
  for (const input of document.querySelectorAll("#count-form-items input[data-material]")) {
    if (input.value === "") continue;
    const base = countToBase(input.dataset.material, input.dataset.unit, input.value);
    if (base === null) { err.textContent = `Số đếm không hợp lệ: ${materialById.get(input.dataset.material).name}`; return; }
    items[input.dataset.material] = Math.round(base);
  }
  if (!Object.keys(items).length) { err.textContent = "Chưa nhập số đếm nào."; return; }
  const d = new Date(at);
  const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const payload = { id, countedAt: at, countedBy: myName(), items, updatedAt: Date.now(), ...(state.demo ? { demo: true, demoBatch: "manual" } : {}) };
  try {
    await setDoc(doc(db, ...root, countCollection(), id), payload);
    document.querySelectorAll("#count-form-items input").forEach((x) => { x.value = ""; });
    await loadCounts();
    $("#count-note").textContent = `Đã lưu lần đếm ${id}. ` + $("#count-note").textContent;
  } catch (error) { err.textContent = error.code === "permission-denied" ? `Không có quyền lưu vào ${countCollection()} (cần mở quy tắc Firestore).` : error.message; }
}
$("#count-form").addEventListener("submit", saveCount);

/* ---------- Hoàn ứng: mỗi người một tài khoản, cảnh báo theo người, QR động từ tài khoản ngân hàng người mua ---------- */
const isBuyer = () => state.role === ROLE_BUYER;
/** Phiếu của chính mình, đã có thủ quỹ / chủ quán khác: không tự duyệt, không tự hoàn. */
const selfBlocked = (r) => selfReviewBlocked(r, state.me?.id, people());
const myId = () => state.me?.id || "";
const myName = () => state.me?.name || "Quản lý";
/** Mọi người có thể là người mua: thành viên đã thêm và chính mình. */
const people = () => state.members.filter((m) => m.active !== false);
/** Mã người mua gắn vào phiếu: người mua tự nhập là chính mình; thủ quỹ nhập hộ thì khớp theo tên thành viên. */
function payerIdFor(name, original) {
  if (isBuyer()) return myId();
  if (original && asciiUpper(original.enteredByName) === asciiUpper(name) && original.payerId) return original.payerId;
  return memberOf({ enteredByName: name }, people())?.id || "";
}
const reimbCollection = () => (state.demo ? "demoReimbursements" : "reimbursements");
/** Gắn mã phiếu và trạng thái hoàn ứng. Phiếu đã hoàn không bị đổi trạng thái khi sửa; chênh tiền hiện ở màn thủ quỹ. */
function withReimbursement(payload, original, now) {
  const fund = payload.fundSource;
  const code = original?.code || payload.code || receiptCode(payload);
  const prev = original?.reimbursement;
  if (prev && (prev.status === "PAID" || prev.status === "CONFIRMED")) return { ...payload, code, reimbursement: prev };
  if (!fund) return { ...payload, code };
  if (fund !== FUND_PERSONAL) return { ...payload, code, reimbursement: { status: "NONE", updatedAt: now } };
  // Sửa phiếu đã duyệt hoặc bị trả lại thì gửi duyệt lại.
  return { ...payload, code, reimbursement: { status: "PENDING", requestedAt: prev?.requestedAt || now, updatedAt: now } };
}
let flashTimer = null;
function flashNote(text) {
  const el = $("#reimb-note");
  if (el) el.textContent = text;
  const bar = $("#my-alerts");
  if (!bar) return;
  bar.dataset.flash = text;
  renderAlerts();
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { delete bar.dataset.flash; renderAlerts(); }, 8000);
}
const permissionHint = "Không có quyền ghi Firestore: kiểm tra máy này đang đăng nhập đúng tài khoản quán.";

/* ---- Đăng nhập: tài khoản quán dùng chung + PIN từng người ---- */
const PERSON_KEY = "pos0210.webPerson";
const savedPerson = () => { try { return localStorage.getItem(PERSON_KEY) || ""; } catch { return ""; } };
const rememberPerson = (id) => { try { if (id) localStorage.setItem(PERSON_KEY, id); else localStorage.removeItem(PERSON_KEY); } catch { /* bỏ qua */ } };
async function loadMembers() {
  try { state.members = rows(await getDocs(collection(db, ...root, "webMembers"))); state.membersError = ""; }
  catch (error) { state.members = []; state.membersError = error.message || "lỗi không rõ"; }
  if (state.me) state.me = state.members.find((m) => m.id === state.me.id) || state.me;
}
/** Chưa có chủ quán nào có PIN: lần đầu vào thì tạo PIN chủ quán. */
const needsBootstrap = () => !state.members.some((m) => m.role === ROLE_OWNER && m.pinHash && m.active !== false);
function showPinView() {
  stopOnlineOrders();
  const boot = needsBootstrap();
  $("#login-view").hidden = true;
  $("#dashboard-view").hidden = true;
  $("#pin-view").hidden = false;
  $("#pin-title").textContent = boot ? "Tạo PIN chủ quán" : "Nhập mã PIN";
  $("#pin-hint").textContent = state.membersError ? `Không đọc được danh sách người dùng: ${state.membersError}` : boot ? "Lần đầu dùng: đặt tên và PIN cho chủ quán. Sau đó thêm thủ quỹ, người mua ở trang Tài khoản." : "Mỗi người một PIN riêng (4–6 số).";
  $("#pin-name-row").hidden = !boot;
  $("#pin-again-row").hidden = !boot;
  $("#pin-input").value = ""; $("#pin-again").value = "";
  $("#pin-error").textContent = "";
  setTimeout(() => $(boot ? "#pin-name" : "#pin-input").focus(), 50);
}
function enterAs(member) {
  state.me = member;
  state.role = member.role;
  rememberPerson(member.id);
  delete $("#my-alerts").dataset.flash;
  state.reimbLoaded = false;
  state.expenseReceipts = []; state.openReceipts = []; state.reimbBatches = [];
  $("#pin-view").hidden = true;
  $("#login-view").hidden = true;
  $("#dashboard-view").hidden = false;
  renderAccount();
  showTab();
  refreshDashboard();
  startOnlineOrders();
}
async function submitPin() {
  const err = $("#pin-error");
  err.textContent = "";
  const pin = $("#pin-input").value.trim();
  if (!validPin(pin)) { err.textContent = "PIN gồm 4–6 chữ số."; return; }
  const hash = await hashPin(pin);
  if (needsBootstrap()) {
    const name = $("#pin-name").value.trim();
    if (!name) { err.textContent = "Nhập tên của bạn."; return; }
    if ($("#pin-again").value.trim() !== pin) { err.textContent = "Hai lần nhập PIN không khớp."; return; }
    const id = memberId(name, uuid().replace(/[^a-z0-9]/gi, "").slice(-4).toLowerCase());
    const owner = { id, name, role: ROLE_OWNER, pinHash: hash, active: true, createdAt: Date.now(), updatedAt: Date.now() };
    try { await setDoc(doc(db, ...root, "webMembers", id), owner); state.members.push(owner); enterAs(owner); }
    catch (error) { err.textContent = `Chưa lưu được: ${error.message}`; }
    return;
  }
  const m = memberByPinHash(state.members, hash);
  if (!m) { err.textContent = "PIN không đúng."; $("#pin-input").value = ""; return; }
  enterAs(m);
}
$("#pin-button").addEventListener("click", submitPin);
$("#pin-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { if (needsBootstrap()) $("#pin-again").focus(); else submitPin(); } });
$("#pin-again").addEventListener("keydown", (e) => { if (e.key === "Enter") submitPin(); });
$("#pin-logout").addEventListener("click", () => { rememberPerson(""); signOut(auth); });
$("#switch-person").addEventListener("click", async () => {
  rememberPerson(""); state.me = null; state.role = null;
  await loadMembers();
  showPinView();
});
function applyRoleUi() {
  // Mọi người xem và nhập đầy đủ mọi tab. Riêng chủ quán / thủ quỹ: duyệt phiếu, chi hoàn tiền, lưu đối soát quỹ; chủ quán: quản lý người dùng, đăng xuất tài khoản chung.
  document.querySelectorAll("#tabbar [data-tab]").forEach((a) => { a.hidden = false; });
  $("#request-sync").hidden = false;
  $("#logout-button").hidden = state.role !== ROLE_OWNER;
  $("#reimb-treasurer-zone").hidden = !canTreasure(state.role);
  $("#open-summary").hidden = false;
  $("#open-entry").hidden = false;
  if ($("#fund-save")) $("#fund-save").hidden = !canTreasure(state.role);
  $("#members-zone").hidden = state.role !== ROLE_OWNER;
  $("#me-title").textContent = myName();
  $("#me-role").textContent = `${ROLE_LABELS[state.role] || ""} · vào web bằng PIN riêng`;
}
let reimbLoading = null;
/** Một lần đọc tại một thời điểm: mở tab trong lúc đang đọc không tốn thêm lượt đọc Firestore. */
function loadReimbursements() {
  if (!reimbLoading) reimbLoading = loadReimbursementsNow().finally(() => { reimbLoading = null; });
  return reimbLoading;
}
async function loadReimbursementsNow() {
  $("#reimb-note").textContent = "Đang đọc…";
  try {
    const [open, batches, payees] = await Promise.all([
      Promise.all([
        getDocs(query(collection(db, ...root, receiptCollection()), where("reimbursement.status", "in", ["PENDING", "APPROVED", "REJECTED", "PAID"]), limit(500))).then(rows).catch(() => []),
        getDocs(query(collection(db, ...root, receiptCollection()), where("review", "in", ["PENDING", "REJECTED"]), limit(500))).then(rows).catch(() => []),
      ]).then(([a, b]) => [...a, ...b.filter((x) => !a.some((y) => y.id === x.id))]),
      getDocs(query(collection(db, ...root, reimbCollection()), orderBy("paidAt", "desc"), limit(100))).then(rows),
      getDocs(collection(db, ...root, "payees")).then(rows).catch(() => []), // danh sách tài khoản cũ: chỉ dùng dự phòng khi người mua chưa tự nhập
    ]);
    state.openReceipts = open;
    state.reimbBatches = batches.sort((a, b) => Number(b.paidAt) - Number(a.paidAt));
    state.payees = payees;
    state.reimbLoaded = true;
    state.reimbError = "";
  } catch (error) { state.reimbError = error.code === "permission-denied" ? permissionHint : (error.message || "lỗi không rõ"); }
  renderReimbursements();
}
/** Phiếu dùng cho màn hoàn ứng: phiếu đã tải + phiếu còn mở ngoài khoảng tải (không để sót). */
function reimbReceipts() {
  const byId = new Map(state.expenseReceipts.map((r) => [r.id, r]));
  for (const r of state.openReceipts) if (!byId.has(r.id) && (!state.demo || r.demo)) byId.set(r.id, r);
  return [...byId.values()];
}
/** Thanh cảnh báo việc cần làm của người đang đăng nhập: hiện ở mọi trang. */
function renderAlerts() {
  const bar = $("#my-alerts");
  if (!bar || !state.user || !state.role) return;
  const a = myAlerts({ myId: myId(), role: state.role, me: state.me, receipts: reimbReceipts(), batches: state.reimbBatches, members: people(), payees: state.payees });
  const flash = bar.dataset.flash ? `<p class="alert-flash">${escapeHtml(bar.dataset.flash)}</p>` : "";
  bar.hidden = !a.items.length && !flash;
  bar.innerHTML = flash + (a.items.length ? `<strong>Việc của ${escapeHtml(myName())}</strong><ul>${a.items.map((x) => `<li class="${x.level}"><a href="#${x.key === "bank" ? "taikhoan" : "hoanung"}">${escapeHtml(x.text)}</a></li>`).join("")}</ul>` : "");
  const bank = a.items.find((x) => x.key === "bank")?.count || 0;
  const setBadge = (id, n) => { const el = $(id); if (el) { el.hidden = !n; el.textContent = String(n); } };
  setBadge("#hoanung-badge", a.badge - bank);
  setBadge("#taikhoan-badge", bank);
}
function receiptLine(r, dup, extra = "", showEdit = true) {
  const items = (r.items || []).slice(0, 3).map((i) => i.materialName).join(", ") + ((r.items || []).length > 3 ? "…" : "");
  const diff = changedAfterPaid(r);
  return `<div class="reimb-receipt"><div><strong>${escapeHtml(receiptCode(r))}</strong> · ${dateTime(r.purchaseDate)} · <b>${money(r.total)}</b><small>${escapeHtml(items)}${r.note ? ` · ${escapeHtml(r.note)}` : ""}</small>${dup ? `<small class="warn-text">Nghi trùng với ${escapeHtml(dup.join(", "))}: kiểm tra hoá đơn trước khi duyệt</small>` : ""}${flagNoteHtml(r)}${diff ? `<small class="warn-text">Phiếu bị sửa sau khi hoàn: chênh ${money(diff)}</small>` : ""}${isPaidOut(r) && reviewStatus(r) === "PENDING" ? '<small class="warn-text">Đã hoàn tiền · vừa sửa nội dung (tổng tiền không đổi) · chờ duyệt lại</small>' : ""}${reimbursementStatus(r) === "REJECTED" && r.reimbursement?.rejectReason ? `<small class="warn-text">Lý do không duyệt: ${escapeHtml(r.reimbursement.rejectReason)}</small>` : ""}</div><div class="row-actions">${extra}${flagButtons(r)}${showEdit ? `<button type="button" class="text-button" data-edit-receipt="${escapeHtml(r.id)}">${canEditReceipt(r) ? "Xem / sửa" : "Xem"}</button>` : ""}</div></div>`;
}

function batchCard(b) {
  return `<article class="reimb-card"><header><strong>${escapeHtml(b.payer)} · ${money(b.amount)}</strong><span>${escapeHtml(b.code)} · ${b.method === "CASH" ? "tiền mặt" : "CK"} · ${dateTime(b.paidAt)}</span></header><p class="muted">${b.receiptCodes?.length || b.receiptIds.length} phiếu: ${escapeHtml((b.receiptCodes || []).join(", "))} · nội dung CK "${escapeHtml(b.transferNote || "")}" · người hoàn ${escapeHtml(b.treasurer || "")}</p>${b.issue ? `<p class="warn-text">${escapeHtml(b.payer)} báo CHƯA NHẬN ĐƯỢC tiền (${dateTime(b.issue.at)})${b.issue.note ? `: ${escapeHtml(b.issue.note)}` : ""}. Kiểm tra lại giao dịch chuyển khoản.</p>` : ""}${needsReminder(b) ? '<p class="warn-text">Đã quá 1 ngày chưa xác nhận.</p>' : ""}${isMine(b, myId())
    ? `<div class="tool-row"><button type="button" class="btn strong" data-confirm="${escapeHtml(b.id)}">Tôi đã nhận tiền</button><button type="button" class="btn ghost" data-not-received="${escapeHtml(b.id)}">Chưa nhận được</button></div>`
    : `<p class="muted">Chỉ ${escapeHtml(b.payer)} tự xác nhận trên tài khoản của mình sau khi kiểm tra đã nhận tiền.</p>`}</article>`;
}
/** Phần "của tôi": ai cũng có, kể cả chủ quán / thủ quỹ khi tự ứng tiền. */
function renderMine() {
  const host = $("#reimb-mine");
  const me = myId();
  const shopMine = reimbReceipts().filter((r) => isMine(r, me) && reimbursementStatus(r) === "NONE" && ["PENDING", "REJECTED"].includes(reviewStatus(r)));
  const shopDone = reimbReceipts().filter((r) => isMine(r, me) && reimbursementStatus(r) === "NONE" && reviewStatus(r) === "APPROVED").sort((x, y) => Number(y.purchaseDate || 0) - Number(x.purchaseDate || 0));
  const mine = reimbReceipts().filter((r) => isMine(r, me) && reimbursementStatus(r) !== "NONE").sort((a, b) => Number(b.purchaseDate || 0) - Number(a.purchaseDate || 0));
  const myBatches = state.reimbBatches.filter((b) => isMine(b, me));
  const paid = myBatches.filter((b) => b.status === "PAID");
  const by = (st) => mine.filter((r) => reimbursementStatus(r) === st);
  const editable = () => true; // phiếu đã hoàn vẫn sửa được nội dung (giữ nguyên tổng tiền), sửa xong chờ duyệt lại
  const block = (st, title) => { const list = by(st); return list.length ? `<p class="reimb-sub">${title} · ${list.length} phiếu · ${money(list.reduce((s, r) => s + Number(r.total || 0), 0))}</p>${list.slice(0, st === "CONFIRMED" ? 10 : 100).map((r) => receiptLine(r, null, ["PENDING", "REJECTED", "UNKNOWN"].includes(st) ? `<button type="button" class="text-button" data-cancel-mine="${escapeHtml(r.id)}">Huỷ phiếu</button>` : "", editable(st))).join("")}` : ""; };
  const html = [
    paid.length ? `<p class="reimb-sub">Đã được hoàn · chờ bạn xác nhận</p>${paid.map(batchCard).join("")}` : "",
    block("REJECTED", "Bị trả lại · sửa rồi lưu để gửi lại"), block("PENDING", STATUS_LABELS.PENDING), block("APPROVED", STATUS_LABELS.APPROVED),
    ...[["REJECTED", "Quỹ quán · bị trả lại, sửa rồi lưu để gửi lại"], ["PENDING", "Quỹ quán · chờ duyệt (chưa tính chi phí)"]].map(([st, title]) => { const list = shopMine.filter((r) => reviewStatus(r) === st); return list.length ? `<p class="reimb-sub">${title} · ${list.length} phiếu · ${money(list.reduce((t, r) => t + Number(r.total || 0), 0))}</p>${list.map((r) => `${receiptLine(r, null, `<button type="button" class="text-button" data-cancel-mine="${escapeHtml(r.id)}">Huỷ phiếu</button>`)}${r.reviewReason ? `<small class="warn-text">Lý do: ${escapeHtml(r.reviewReason)}</small>` : ""}`).join("")}` : ""; }),
    block("PAID", "Đã hoàn"), block("CONFIRMED", "Đã nhận tiền (gần đây)"),
    shopDone.length ? `<p class="reimb-sub">Quỹ quán · đã duyệt (gần đây) · ${shopDone.length} phiếu · ${money(shopDone.reduce((t, r) => t + Number(r.total || 0), 0))}</p>${shopDone.slice(0, 10).map((r) => receiptLine(r, null, "")).join("")}` : "",
  ].join("");
  host.innerHTML = html ? `<article class="reimb-card">${html}</article>` : `<p class="muted">Chưa có phiếu nào ${isBuyer() ? "bạn" : `${escapeHtml(myName())}`} ứng tiền. Bấm <b>+ Phiếu chi</b> để nhập.</p>`;
}
/** Danh sách phiếu bị đánh dấu sai: người tạo thấy phiếu của mình; chủ quán / thủ quỹ thấy tất cả. */
function renderFlagged() {
  const host = $("#reimb-flagged");
  if (!host) return;
  const me = myId();
  const list = reimbReceipts().filter((r) => receiptFlag(r) && (canTreasure(state.role) || isMine(r, me))).sort((a, b) => Number(a.flag.at || 0) - Number(b.flag.at || 0));
  if (!list.length) { host.innerHTML = ""; return; }
  const open = list.filter(isFlagOpen).length;
  host.innerHTML = `<p class="reimb-sub warn-text">⚠ Phiếu bị đánh dấu sai · ${open} cần sửa${list.length - open ? ` · ${list.length - open} đã sửa, chờ chủ quán duyệt lại` : ""}</p>${list.map((r) => receiptLine(r, null, isFlagOpen(r) && canEditReceipt(r) ? '<span class="muted">Bấm Xem / sửa để sửa lại</span>' : "")).join("")}`;
}
/** Cập nhật số đếm trên tiêu đề từng mục thu gọn; nhớ mục nào đang mở. */
function updateFolds() {
  document.querySelectorAll("details.fold[data-fold]").forEach((d) => {
    const id = d.dataset.fold, target = document.getElementById(id), badge = d.querySelector("[data-fold-count]");
    if (!target || !badge) return;
    const n = target.querySelectorAll(".reimb-receipt, .paylist-row, .reimb-card, .panel.warn-panel").length;
    badge.hidden = !n; badge.textContent = String(n);
    badge.classList.toggle("warn", n > 0 && (id === "reimb-flagged" || id === "reimb-unknown"));
    d.classList.toggle("is-empty", !n);
  });
}
function restoreFolds() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("pos0210.folds") || "{}"); } catch { /* không có bộ nhớ trình duyệt thì mặc định thu gọn */ }
  document.querySelectorAll("details.fold[data-fold]").forEach((d) => {
    if (saved[d.dataset.fold] !== undefined) d.open = Boolean(saved[d.dataset.fold]);
    d.addEventListener("toggle", () => {
      try { const cur = JSON.parse(localStorage.getItem("pos0210.folds") || "{}"); cur[d.dataset.fold] = d.open; localStorage.setItem("pos0210.folds", JSON.stringify(cur)); } catch { /* bỏ qua */ }
    });
  });
}
restoreFolds();
function renderReimbursements() {
  renderFlagged();
  queueMicrotask(updateFolds);
  const host = $("#reimb-queues");
  if (!host || !state.role) return;
  const all = reimbReceipts();
  const names = [...new Set([...people().map((m) => m.name), ...all.map((r) => r.enteredByName), ...state.payees.map((p) => p.name)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  $("#payee-names").innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
  $("#bank-choices").innerHTML = BANK_CHOICES.map((b) => `<option value="${b}"></option>`).join("");
  $("#reimb-note").textContent = state.reimbError || (`${state.demo ? "DEMO · " : ""}Phiếu từ ${dateTime(state.receiptsFrom)} và mọi phiếu còn mở.`);
  renderMine();
  renderAlerts();
  if (!canTreasure(state.role)) return;
  const person = state.reimbPerson;
  const sel = $("#reimb-person");
  sel.innerHTML = `<option value="">Tất cả</option>${[...new Set(all.map((r) => r.enteredByName).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((n) => `<option ${n === person ? "selected" : ""}>${escapeHtml(n)}</option>`).join("")}`;
  const list = person ? all.filter((r) => r.enteredByName === person) : all;
  const batches = person ? state.reimbBatches.filter((b) => b.payer === person) : state.reimbBatches;
  const waiting = batches.filter((b) => b.status === "PAID");
  const dups = duplicateSuspects(all.filter((r) => reimbursementStatus(r) !== "NONE"));
  const pending = list.filter((r) => reimbursementStatus(r) === "PENDING");
  const approved = list.filter((r) => reimbursementStatus(r) === "APPROVED");
  $("#reimb-counters").innerHTML = [["Chờ duyệt", `${pending.length} phiếu · ${money(pending.reduce((s, r) => s + Number(r.total || 0), 0))}`], ["Chờ hoàn tiền", `${approved.length} phiếu · ${money(approved.reduce((s, r) => s + Number(r.total || 0), 0))}`], ["Đã hoàn, chờ xác nhận", `${waiting.length} đợt · ${money(waiting.reduce((s, b) => s + Number(b.amount || 0), 0))}`]]
    .map(([k, v]) => `<article><span>${k}</span><strong>${v}</strong></article>`).join("");
  const unknown = list.filter((r) => reimbursementStatus(r) === "UNKNOWN");
  $("#reimb-unknown").innerHTML = unknown.length ? `<div class="panel warn-panel"><strong>${unknown.length} phiếu chưa rõ nguồn tiền</strong><p class="muted">Phiếu nhập trước khi có quy trình hoàn ứng hoặc nhập trên máy POS. Chọn nguồn tiền để không bị sót.</p>${unknown.slice(0, 30).map((r) => receiptLine(r, dups.get(r.id), `<button type="button" class="btn" data-fund="${escapeHtml(r.id)}" data-value="PERSONAL">Cần hoàn</button><button type="button" class="btn ghost" data-fund="${escapeHtml(r.id)}" data-value="SHOP_CASH">Tiền quán</button>`)).join("")}</div>` : "";
  host.innerHTML = payerQueues(list).filter((q) => q.PENDING.length || q.APPROVED.length || q.REJECTED.length).map((q) => {
    const sample = q.APPROVED[0] || q.PENDING[0] || q.REJECTED[0];
    const bank = bankOf(sample, people(), state.payees);
    const account = memberOf(sample, people());
    return `<article class="reimb-card"><header><strong>${escapeHtml(q.payer)}</strong><span>${bank ? `${escapeHtml(bank.bank)} · ${escapeHtml(bank.account)}${bank.from === "payee" ? " (danh sách cũ)" : ""}` : `<span class="warn-text">${account ? "chưa nhập tài khoản ngân hàng" : "chưa có tài khoản web"}</span>`}</span></header>
      ${q.PENDING.length ? `<p class="reimb-sub">Chờ duyệt · ${q.PENDING.length} phiếu · ${money(q.pendingTotal)}</p>${q.PENDING.length > 1 && !q.PENDING.some(selfBlocked) ? `<div class="tool-row"><button type="button" class="btn" data-approve-all="${escapeHtml(q.payer)}">Duyệt hết ${q.PENDING.length} phiếu (${money(q.pendingTotal)})</button></div>` : ""}${q.PENDING.map((r) => receiptLine(r, dups.get(r.id), selfBlocked(r) ? '<span class="muted">Phiếu của bạn: chờ thủ quỹ duyệt</span>' : `<button type="button" class="btn" data-approve="${escapeHtml(r.id)}">Duyệt</button><button type="button" class="btn ghost" data-reject="${escapeHtml(r.id)}">Không duyệt</button>`)).join("")}` : ""}
      ${q.APPROVED.length ? `<p class="reimb-sub">Đã duyệt · chờ hoàn · ${q.APPROVED.length} phiếu · ${money(q.approvedTotal)}</p>${q.APPROVED.map((r) => receiptLine(r, dups.get(r.id), selfBlocked(r) ? "" : `<button type="button" class="btn ghost" data-unapprove="${escapeHtml(r.id)}">Huỷ duyệt</button>`)).join("")}${q.APPROVED.some(selfBlocked) ? '<p class="muted">Tiền hoàn cho bạn: thủ quỹ chuyển, bạn bấm "Tôi đã nhận tiền" ở mục Của tôi.</p>' : `<div class="tool-row"><button type="button" class="btn strong" data-pay="${escapeHtml(q.payer)}">Hoàn ${money(q.approvedTotal)} cho ${escapeHtml(q.payer)}</button></div>`}` : ""}
      ${q.REJECTED.length ? `<p class="reimb-sub">Đã trả lại · chờ người mua sửa · ${q.REJECTED.length} phiếu</p>${q.REJECTED.map((r) => receiptLine(r, null)).join("")}` : ""}</article>`;
  }).join("") || '<p class="muted">Không có phiếu nào chờ duyệt hoặc chờ hoàn.</p>';
  // Tổng phải hoàn theo từng người (mỗi người một tài khoản nên mỗi người một QR, gộp mọi phiếu đã duyệt).
  const payable = payerQueues(list).filter((q) => q.APPROVED.length && !q.APPROVED.some(selfBlocked));
  const payTotal = payable.reduce((t, q) => t + q.approvedTotal, 0);
  $("#reimb-paylist").innerHTML = payable.length ? `<p class="reimb-sub">Cần hoàn · tổng ${money(payTotal)}</p>${payable.map((q) => `<div class="paylist-row"><span><strong>${escapeHtml(q.payer)}</strong> · ${q.APPROVED.length} phiếu · <b>${money(q.approvedTotal)}</b></span><button type="button" class="btn strong" data-pay="${escapeHtml(q.payer)}">Hoàn · QR</button></div>`).join("")}` : "";
  // Phiếu chi bằng quỹ quán: người nhập (thường là thủ quỹ) không tự duyệt; người còn lại duyệt thì phiếu mới tính vào chi phí.
  const shopReview = all.filter((r) => (reimbursementStatus(r) === "NONE" || isPaidOut(r)) && reviewStatus(r) === "PENDING").sort((a, b) => Number(a.purchaseDate) - Number(b.purchaseDate));
  const shopDups = duplicateSuspects(all.filter((r) => reviewStatus(r) !== "NONE"));
  $("#reimb-shopreview").innerHTML = shopReview.length ? `<p class="reimb-sub">Phiếu quỹ quán / phiếu sửa sau khi hoàn · chờ duyệt · ${shopReview.length} phiếu · ${money(shopReview.reduce((t, r) => t + Number(r.total || 0), 0))}</p>${shopReview.map((r) => receiptLine(r, shopDups.get(r.id), selfBlocked(r) ? '<span class="muted">Phiếu của bạn: chờ người kia duyệt</span>' : `<span class="muted">${escapeHtml(r.enteredByName || "")}</span><button type="button" class="btn" data-review-ok="${escapeHtml(r.id)}">Duyệt</button><button type="button" class="btn ghost" data-review-no="${escapeHtml(r.id)}">Không duyệt</button>`)).join("")}` : '<p class="muted">Không có phiếu quỹ quán nào chờ duyệt.</p>';
  $("#reimb-paid").innerHTML = waiting.map(batchCard).join("") || '<p class="muted">Không có khoản nào chờ xác nhận.</p>';
  $("#reimb-history").innerHTML = batches.filter((b) => b.status === "CONFIRMED").slice(0, 20).map((b) => `<div class="reimb-receipt"><div><strong>${escapeHtml(b.code)}</strong> · ${escapeHtml(b.payer)} · <b>${money(b.amount)}</b><small>Hoàn ${dateTime(b.paidAt)} · xác nhận ${dateTime(b.confirmedAt)}${b.confirmedOnBehalf ? ` (${escapeHtml(b.confirmedBy || "thủ quỹ")} xác nhận hộ)` : ""} · ${b.receiptIds.length} phiếu</small></div></div>`).join("") || '<p class="muted">Chưa có.</p>';
}
async function updateReceiptReimb(id, patch) {
  const r = reimbReceipts().find((x) => x.id === id);
  if (!r) return;
  const now = Date.now();
  const st = patch.reimbursement?.status;
  const blocked = st === "APPROVED" ? flagApprovalProblem(r, state.role) : "";
  if (blocked) { flashNote(blocked); return; }
  const review = st === "APPROVED" ? "APPROVED" : st === "REJECTED" ? "REJECTED" : st === "PENDING" && !patch.fundSource ? "PENDING" : patch.fundSource ? (patch.fundSource === FUND_PERSONAL ? initialReview(r.payerId || memberOf(r, people())?.id, people()) : "APPROVED") : (r.review || undefined);
  const next = { ...r, ...(review ? { review, reviewBy: myName(), reviewAt: now, reviewReason: st === "REJECTED" ? patch.reimbursement.rejectReason : "" } : {}), ...(patch.fundSource ? { fundSource: patch.fundSource } : {}), code: receiptCode(r), reimbursement: { ...(r.reimbursement || {}), ...patch.reimbursement, updatedAt: now, by: myName() }, updatedAt: Math.max(now, Number(r.updatedAt || 0) + 1), ...(r.source === "ANDROID_POS" ? { editedBy: "WEB_MANAGER" } : {}) };
  if (!next.payerId) { const id = memberOf(next, people())?.id; if (id) next.payerId = id; }
  if (r.flag && (st === "APPROVED" || st === "REJECTED")) next.flag = flagAfterReview(r.flag, st, patch.reimbursement?.rejectReason, now, myName());
  try {
    await setDoc(doc(db, ...root, receiptCollection(), id), next);
    replaceLocalReceipt(next);
    state.openReceipts = state.openReceipts.map((x) => (x.id === id ? next : x));
    render(); renderReimbursements();
  } catch (error) { $("#reimb-note").textContent = `Không lưu được: ${error.message}`; }
}
/** Duyệt hết phiếu chờ duyệt của một người (bỏ qua phiếu nghi trùng để thủ quỹ xem kỹ từng phiếu). */
async function approveAll(payer) {
  const all = reimbReceipts();
  const dups = duplicateSuspects(all.filter((r) => reimbursementStatus(r) !== "NONE"));
  const list = all.filter((r) => r.enteredByName === payer && reimbursementStatus(r) === "PENDING" && !selfBlocked(r) && !flagApprovalProblem(r, state.role));
  const ok = list.filter((r) => !dups.has(r.id));
  if (!ok.length) { flashNote("Các phiếu đều nghi trùng: duyệt từng phiếu sau khi kiểm tra."); return; }
  if (!window.confirm(`Duyệt ${ok.length} phiếu của ${payer} · ${money(ok.reduce((t, r) => t + Number(r.total || 0), 0))}?${ok.length < list.length ? ` (${list.length - ok.length} phiếu nghi trùng để lại xem riêng)` : ""}`)) return;
  for (const r of ok) await updateReceiptReimb(r.id, { reimbursement: { status: "APPROVED", approvedAt: Date.now(), rejectReason: "" } });
  flashNote(`Đã duyệt ${ok.length} phiếu của ${payer}.`);
}
/** Duyệt / trả lại phiếu chi bằng quỹ quán (không có bước hoàn tiền). */
async function updateReceiptReview(id, status, reason) {
  const r = reimbReceipts().find((x) => x.id === id);
  if (!r) return;
  const now = Date.now();
  const blocked = status === "APPROVED" ? flagApprovalProblem(r, state.role) : "";
  if (blocked) { flashNote(blocked); return; }
  const next = { ...r, ...(r.flag ? { flag: flagAfterReview(r.flag, status, reason, now, myName()) } : {}), review: status, reviewReason: reason, reviewBy: myName(), reviewById: state.me?.id || "", reviewAt: now, updatedAt: Math.max(now, Number(r.updatedAt || 0) + 1), ...(r.source === "ANDROID_POS" ? { editedBy: "WEB_MANAGER" } : {}) };
  try {
    await setDoc(doc(db, ...root, receiptCollection(), id), next);
    replaceLocalReceipt(next);
    state.openReceipts = state.openReceipts.map((x) => (x.id === id ? next : x));
    render(); renderReimbursements();
    flashNote(`${status === "APPROVED" ? "Đã duyệt" : "Đã trả lại"} ${receiptCode(next)}.`);
  } catch (error) { $("#reimb-note").textContent = `Không lưu được: ${error.message}`; }
}
let reimbDraft = null;
function openReimbDialog(payer) {
  const approved = reimbReceipts().filter((r) => r.enteredByName === payer && reimbursementStatus(r) === "APPROVED");
  if (!approved.length || approved.some(selfBlocked)) return;
  const payerId = approved.find((r) => r.payerId)?.payerId || memberOf(approved[0], people())?.id || "";
  reimbDraft = { payer, payerId, receipts: approved, selected: new Set(approved.map((r) => r.id)), bank: bankOf({ payerId, enteredByName: payer }, people(), state.payees) };
  $("#reimb-title").textContent = `Hoàn cho ${payer}`;
  $("#reimb-error").textContent = "";
  renderReimbDialog();
  $("#reimb-dialog").showModal();
}
function reimbSelection() { return reimbDraft.receipts.filter((r) => reimbDraft.selected.has(r.id)); }
function renderReimbDialog() {
  $("#reimb-receipts").innerHTML = reimbDraft.receipts.map((r) => `<label class="reimb-check"><input type="checkbox" data-pick="${escapeHtml(r.id)}" ${reimbDraft.selected.has(r.id) ? "checked" : ""} /> <span>${escapeHtml(receiptCode(r))} · ${dateTime(r.purchaseDate)}</span><b>${money(r.total)}</b></label>`).join("");
  const sel = reimbSelection();
  const total = sel.reduce((s, r) => s + Number(r.total || 0), 0);
  $("#reimb-total").textContent = money(total);
  const code = batchCode(reimbDraft.payer, Date.now(), state.reimbBatches.map((b) => b.code));
  reimbDraft.code = code;
  reimbDraft.note = transferNote(code, sel.length);
  const bank = reimbDraft.bank;
  const host = $("#reimb-qr");
  $("#reimb-qr-actions").innerHTML = "";
  if (!sel.length) { host.innerHTML = '<p class="muted">Chọn ít nhất một phiếu.</p>'; return; }
  if (!bank) { host.innerHTML = `<p class="warn-text">${escapeHtml(reimbDraft.payer)} chưa nhập tài khoản ngân hàng ở trang Tài khoản của họ nên chưa có QR. Vẫn có thể chuyển tay với nội dung: <b>${escapeHtml(reimbDraft.note)}</b></p>`; return; }
  try {
    const payload = vietQrPayload({ bank: bank.bank, account: bank.account, holder: bank.holder, amount: total, info: reimbDraft.note });
    host.innerHTML = `<div id="reimb-qr-img" class="qr-box" aria-label="Mã QR chuyển khoản"></div><p class="qr-meta">${escapeHtml(bank.bank)} · ${escapeHtml(bank.account)} · ${escapeHtml(bank.holder)}<br>Số tiền <b>${money(total)}</b> · Nội dung <b>${escapeHtml(reimbDraft.note)}</b></p>`;
    drawQr($("#reimb-qr-img"), payload);
    // Chuyển ngay trên máy này: mở app ngân hàng của người hoàn (theo ngân hàng trong Tài khoản của họ), hoặc lưu ảnh QR rồi quét từ thư viện ảnh.
    const link = bankDeeplink({ fromBank: state.me?.bank, toBank: bank.bank, account: bank.account, holder: bank.holder, amount: total, info: reimbDraft.note });
    $("#reimb-qr-actions").innerHTML = `${link ? `<a class="btn strong" href="${escapeHtml(link)}" target="_blank" rel="noopener">Mở app ${escapeHtml(state.me?.bank || "")}</a>` : ""}<a id="reimb-save-qr" class="btn" download="${escapeHtml(reimbDraft.code)}.png" hidden>Lưu ảnh QR</a><button type="button" class="btn ghost" data-copy="${escapeHtml(bank.account)}">Chép số TK</button><button type="button" class="btn ghost" data-copy="${escapeHtml(reimbDraft.note)}">Chép nội dung</button>${link ? "" : `<p class="muted">Nhập ngân hàng của bạn ở trang Tài khoản để có nút mở thẳng app ngân hàng.</p>`}`;
  } catch (error) { host.innerHTML = `<p class="warn-text">${escapeHtml(error.message)}</p>`; }
}
let qrLib = null;
function loadQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  const urls = ["https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js", "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"];
  const tryLoad = (i) => new Promise((resolve, reject) => { const el = document.createElement("script"); el.src = urls[i]; el.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error("no qrcode"))); el.onerror = () => reject(new Error("load")); document.head.append(el); })
    .catch((e) => (i + 1 < urls.length ? tryLoad(i + 1) : Promise.reject(e)));
  if (!qrLib) qrLib = tryLoad(0).catch((e) => { qrLib = null; throw e; });
  return qrLib;
}
async function drawQr(host, payload) {
  try {
    const qr = (await loadQrLib())(0, "M");
    qr.addData(payload); qr.make();
    const url = qr.createDataURL(8, 4);
    host.innerHTML = `<img alt="Mã QR chuyển khoản" src="${url}" />`;
    const save = $("#reimb-save-qr");
    if (save) { save.href = url; save.hidden = false; }
  } catch { host.innerHTML = `<p class="warn-text">Không vẽ được QR (mất mạng?). Chuyển tay theo thông tin bên dưới.</p>`; }
}
async function payBatch(method) {
  const err = $("#reimb-error");
  err.textContent = "";
  const sel = reimbSelection();
  const treasurer = myName();
  if (!sel.length) { err.textContent = "Chọn ít nhất một phiếu."; return; }
  if (state.simulation) { err.textContent = "Đang mô phỏng: không ghi."; return; }
  const now = Date.now();
  const batchId = uuid();
  const total = sel.reduce((s, r) => s + Number(r.total || 0), 0);
  const batch = { id: batchId, code: reimbDraft.code, payer: reimbDraft.payer, payerId: reimbDraft.payerId || "", amount: total, method, transferNote: reimbDraft.note, receiptIds: sel.map((r) => r.id), receiptCodes: sel.map(receiptCode), treasurer, treasurerId: myId(), paidAt: now, status: "PAID", ...(state.demo ? { demo: true } : {}) };
  const paidInfo = (f) => ({ ...(f.reimbursement || {}), status: "PAID", batchId, batchCode: batch.code, paidAt: now, paidAmount: Number(f.total), paidBy: treasurer, updatedAt: now });
  try {
    await runTransaction(db, async (tx) => {
      const refs = sel.map((r) => doc(db, ...root, receiptCollection(), r.id));
      const fresh = [];
      for (const ref of refs) { const snap = await tx.get(ref); if (snap.exists()) fresh.push({ id: snap.id, ...snap.data() }); }
      const check = validateBatchSelection(sel, fresh);
      if (!check.ok) throw new Error(check.problems.join("; "));
      // Gắn người mua vào phiếu cũ để người mua tự thấy và tự xác nhận được trên tài khoản của họ.
      fresh.forEach((f, i) => tx.set(refs[i], { ...f, ...(batch.payerId && !f.payerId ? { payerId: batch.payerId } : {}), code: receiptCode(f), reimbursement: paidInfo(f), updatedAt: Math.max(now, Number(f.updatedAt || 0) + 1), ...(f.source === "ANDROID_POS" ? { editedBy: "WEB_MANAGER" } : {}) }));
      tx.set(doc(db, ...root, reimbCollection(), batchId), batch);
      // Ghi hoàn ứng vào sổ để công nợ người ứng trên máy POS khớp (không ghi khi đang xem demo).
      if (!state.demo) tx.set(doc(db, ...root, "financialMovements", batchId), { id: batchId, type: "PAYER_REIMBURSEMENT", amount: total, occurredAt: now, partnerId: null, method: method === "CASH" ? "CASH" : "TRANSFER", note: `${batch.code} · ${batch.receiptCodes.join(", ")}`, counterpartyName: batch.payer, source: "WEB_MANAGER", createdAt: now, createdBy: state.user.uid });
    });
    $("#reimb-dialog").close();
    for (const r of sel) { const prev = reimbReceipts().find((x) => x.id === r.id); if (prev) replaceLocalReceipt({ ...prev, ...(batch.payerId && !prev.payerId ? { payerId: batch.payerId } : {}), reimbursement: paidInfo(prev) }); }
    state.reimbLoaded = false;
    await loadReimbursements();
    flashNote(`Đã ghi hoàn ${money(total)} cho ${batch.payer} (${batch.code}). ${batch.payer} sẽ thấy cảnh báo để xác nhận khi mở web.`);
  } catch (error) { err.textContent = error.code === "permission-denied" ? permissionHint : `Chưa hoàn được: ${error.message}`; }
}
/** Người nhận báo chưa nhận được tiền: thủ quỹ thấy cảnh báo để kiểm tra lại giao dịch. */
async function reportNotReceived(id) {
  const b = state.reimbBatches.find((x) => x.id === id);
  if (!b || !isMine(b, myId())) return;
  const note = window.prompt(`Báo thủ quỹ: chưa nhận được ${money(b.amount)} (${b.code}). Ghi thêm nếu cần (VD: đã kiểm tra lúc 14h, chưa thấy tiền về):`, "");
  if (note === null) return;
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, ...root, reimbCollection(), id);
      const snap = await tx.get(ref);
      if (!snap.exists() || snap.data().status !== "PAID") throw new Error("Đợt này không còn ở trạng thái chờ xác nhận");
      tx.set(ref, { ...snap.data(), issue: { at: Date.now(), note: note.trim().slice(0, 200), by: myName() } });
    });
    state.reimbLoaded = false;
    await loadReimbursements();
    flashNote(`Đã báo thủ quỹ: chưa nhận được ${b.code}.`);
  } catch (error) { $("#reimb-note").textContent = `Chưa báo được: ${error.message}`; }
}
async function confirmBatch(id) {
  const b = state.reimbBatches.find((x) => x.id === id);
  if (!b) return;
  // Chỉ người nhận tiền tự xác nhận: thủ quỹ không xác nhận hộ (người nhận có thể chưa nhận được do trục trặc).
  const mine = isMine(b, myId());
  if (!mine) return;
  const question = `Bạn đã kiểm tra tài khoản và nhận đủ ${money(b.amount)} (${b.code})?`;
  if (!window.confirm(question)) return;
  const now = Date.now();
  const stamp = { status: "CONFIRMED", confirmedAt: now, confirmedBy: myName(), confirmedById: myId(), issue: null };
  try {
    // Đọc lại ngay lúc xác nhận để không ghi đè bằng bản cũ trong trình duyệt.
    await runTransaction(db, async (tx) => {
      const batchRef = doc(db, ...root, reimbCollection(), id);
      const batchSnap = await tx.get(batchRef);
      if (!batchSnap.exists()) throw new Error("Đợt hoàn không còn trên hệ thống");
      const current = { ...batchSnap.data() };
      if (current.status !== "PAID") throw new Error(`Đợt này đã ở trạng thái ${current.status === "CONFIRMED" ? "đã xác nhận" : current.status}`);
      const refs = b.receiptIds.map((rid) => doc(db, ...root, receiptCollection(), rid));
      const snaps = [];
      for (const ref of refs) snaps.push(await tx.get(ref));
      tx.set(batchRef, { ...current, ...stamp });
      snaps.forEach((snap, i) => {
        if (!snap.exists()) return;
        const r = { ...snap.data() };
        tx.set(refs[i], { ...r, reimbursement: { ...(r.reimbursement || {}), status: "CONFIRMED", confirmedAt: now, updatedAt: now }, updatedAt: Math.max(now, Number(r.updatedAt || 0) + 1), ...(r.source === "ANDROID_POS" ? { editedBy: "WEB_MANAGER" } : {}) });
      });
    });
    for (const rid of b.receiptIds) { const prev = reimbReceipts().find((x) => x.id === rid); if (prev) replaceLocalReceipt({ ...prev, reimbursement: { ...(prev.reimbursement || {}), status: "CONFIRMED", confirmedAt: now } }); }
    state.reimbLoaded = false;
    await loadReimbursements();
    flashNote(`Đã xác nhận ${b.code}.`);
  } catch (error) { $("#reimb-note").textContent = error.code === "permission-denied" ? permissionHint : `Chưa xác nhận được: ${error.message}`; }
}
$("#reload-reimb").addEventListener("click", () => { state.reimbLoaded = false; loadReimbursements(); });
$("#reimb-person").addEventListener("change", (e) => { state.reimbPerson = e.target.value; renderReimbursements(); });
$("#close-reimb").addEventListener("click", () => $("#reimb-dialog").close());
$("#reimb-qr-actions").addEventListener("click", async (e) => {
  const t = e.target.closest("[data-copy]");
  if (!t) return;
  try { await navigator.clipboard.writeText(t.dataset.copy); t.textContent = "Đã chép"; } catch { window.prompt("Sao chép:", t.dataset.copy); }
});
$("#reimb-paid-bank").addEventListener("click", () => payBatch("TRANSFER"));
$("#reimb-paid-cash").addEventListener("click", () => payBatch("CASH"));
$("#reimb-receipts").addEventListener("change", (e) => { const id = e.target.dataset.pick; if (!id) return; if (e.target.checked) reimbDraft.selected.add(id); else reimbDraft.selected.delete(id); renderReimbDialog(); });
$("[data-page=hoanung]").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  const target = reimbReceipts().find((r) => r.id === (t.dataset.approve || t.dataset.reject));
  if (target && selfBlocked(target)) { flashNote("Phiếu của chính bạn: để thủ quỹ duyệt."); return; }
  if (t.dataset.approveAll) { approveAll(t.dataset.approveAll); return; }
  if (t.dataset.unapprove) {
    // Lỡ bấm duyệt: đưa phiếu (chưa hoàn tiền) về chờ duyệt, phiếu thôi tính vào chi phí cho tới khi duyệt lại.
    const r = reimbReceipts().find((x) => x.id === t.dataset.unapprove);
    if (r && !selfBlocked(r) && reimbursementStatus(r) === "APPROVED" && window.confirm(`Huỷ duyệt ${receiptCode(r)} (${money(r.total)})? Phiếu về lại Chờ duyệt.`)) updateReceiptReimb(r.id, { reimbursement: { status: "PENDING", approvedAt: null } });
    return;
  }
  if (t.dataset.reviewOk || t.dataset.reviewNo) {
    const id = t.dataset.reviewOk || t.dataset.reviewNo;
    const r = reimbReceipts().find((x) => x.id === id);
    if (!r || selfBlocked(r)) return;
    if (t.dataset.reviewOk) updateReceiptReview(id, "APPROVED", "");
    else { const reason = window.prompt("Lý do không duyệt (người nhập sẽ thấy để sửa):"); if (reason && reason.trim()) updateReceiptReview(id, "REJECTED", reason.trim()); }
    return;
  }
  if (t.dataset.approve) updateReceiptReimb(t.dataset.approve, { reimbursement: { status: "APPROVED", approvedAt: Date.now(), rejectReason: "" } });
  else if (t.dataset.reject) { const reason = window.prompt("Lý do không duyệt (người mua sẽ thấy trên tài khoản của họ):"); if (reason && reason.trim()) updateReceiptReimb(t.dataset.reject, { reimbursement: { status: "REJECTED", rejectReason: reason.trim() } }); }
  else if (t.dataset.fund) updateReceiptReimb(t.dataset.fund, { fundSource: t.dataset.value, reimbursement: { status: t.dataset.value === FUND_PERSONAL ? "PENDING" : "NONE" } });
  else if (t.dataset.pay) openReimbDialog(t.dataset.pay);
  else if (t.dataset.confirm) confirmBatch(t.dataset.confirm);
  else if (t.dataset.notReceived) reportNotReceived(t.dataset.notReceived);
  else if (t.dataset.cancelMine) cancelReceipt(t.dataset.cancelMine).then(() => renderReimbursements());
  else if (t.dataset.editReceipt) openReceiptEditor(t.dataset.editReceipt);
  else if (t.dataset.flagReceipt) flagReceipt(t.dataset.flagReceipt);
  else if (t.dataset.unflagReceipt) unflagReceipt(t.dataset.unflagReceipt);
});

/* ---------- Tài khoản: thông tin cá nhân + ngân hàng + PIN của mỗi người, chủ quán quản lý thành viên ---------- */
function renderAccount() {
  if (!state.role) return;
  applyRoleUi();
  const me = state.me || {};
  const form = $("#me-form");
  if (!form.contains(document.activeElement)) {
    $("#me-name").value = me.name || "";
    $("#me-bank").value = me.bank || "";
    $("#me-account").value = me.account || "";
    $("#me-holder").value = me.holder || "";
    $("#me-pin").value = "";
  }
  if (state.role !== ROLE_OWNER) return;
  const receipts = reimbReceipts();
  $("#member-list").innerHTML = state.members.filter((m) => m.id !== myId()).sort((a, b) => String(a.name).localeCompare(String(b.name))).map((m) => {
    const legacy = legacyOpenReceipts(m, receipts).length;
    return `<div class="reimb-receipt"><div><strong>${escapeHtml(m.name)}</strong><small>${ROLE_LABELS[m.role] || m.role}${m.pinHash ? "" : " · <b>chưa có PIN</b>"}${m.active === false ? " · <b>đã khoá</b>" : ""}</small><small>${m.bank && m.account ? `${escapeHtml(m.bank)} · ${escapeHtml(m.account)}` : '<span class="warn-text">chưa nhập tài khoản ngân hàng</span>'}</small></div><div class="row-actions">${legacy ? `<button type="button" class="btn" data-link-legacy="${escapeHtml(m.id)}">Gắn ${legacy} phiếu cũ</button>` : ""}<button type="button" class="text-button" data-edit-member="${escapeHtml(m.id)}">Sửa / đổi PIN</button><button type="button" class="text-button" data-toggle-member="${escapeHtml(m.id)}">${m.active === false ? "Mở lại" : "Khoá"}</button></div></div>`;
  }).join("") || '<p class="muted">Chưa có thành viên. Thêm thủ quỹ và từng người mua, mỗi người một PIN.</p>';
}
const stripId = ({ id: _id, ...rest }) => rest;
/** PIN không được trùng với người khác (vì vào web chỉ bằng PIN). */
async function pinHashFor(pin, exceptId) {
  if (!validPin(pin)) throw new Error("PIN gồm 4–6 chữ số.");
  const hash = await hashPin(pin);
  if (state.members.some((m) => m.id !== exceptId && m.pinHash === hash)) throw new Error("PIN này đã có người dùng, chọn PIN khác.");
  return hash;
}
function upsertMember(m) { state.members = [...state.members.filter((x) => x.id !== m.id), m]; }
$("#me-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#me-error");
  err.textContent = "";
  const p = { name: $("#me-name").value.trim(), bank: $("#me-bank").value.trim(), account: $("#me-account").value.replace(/\s+/g, ""), holder: $("#me-holder").value.trim() };
  if (!p.name) { err.textContent = "Nhập tên hiển thị."; return; }
  if (p.bank || p.account) { try { vietQrPayload({ ...p, amount: 1000, info: "KIEM TRA" }); } catch (error) { err.textContent = error.message; return; } }
  if (!state.me?.id) return;
  try {
    const pin = $("#me-pin").value.trim();
    const next = { ...stripId(state.me), ...p, ...(pin ? { pinHash: await pinHashFor(pin, state.me.id) } : {}), updatedAt: Date.now() };
    await setDoc(doc(db, ...root, "webMembers", state.me.id), next);
    state.me = { ...next, id: state.me.id };
    upsertMember(state.me);
    $("#me-pin").value = "";
    renderAccount(); renderReimbursements();
    flashNote(pin ? "Đã lưu thông tin và PIN mới." : "Đã lưu thông tin tài khoản.");
  } catch (error) { err.textContent = error.message; }
});
$("#member-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#member-error");
  err.textContent = "";
  const editId = $("#member-id").value;
  const name = $("#member-name").value.trim();
  const role = $("#member-role").value;
  const pin = $("#member-pin").value.trim();
  if (!name) { err.textContent = "Nhập tên."; return; }
  const prev = state.members.find((m) => m.id === editId);
  if (!prev && !pin) { err.textContent = "Người mới cần có PIN (4–6 số)."; return; }
  if (state.members.some((m) => m.id !== editId && asciiUpper(m.name) === asciiUpper(name))) { err.textContent = "Đã có người trùng tên: thêm họ hoặc chữ phân biệt để phiếu không bị nhầm."; return; }
  try {
    const id = prev?.id || memberId(name, uuid().replace(/[^a-z0-9]/gi, "").slice(-4).toLowerCase());
    const next = { ...(prev ? stripId(prev) : { createdAt: Date.now(), active: true }), name, role, ...(pin ? { pinHash: await pinHashFor(pin, id) } : {}), updatedAt: Date.now() };
    await setDoc(doc(db, ...root, "webMembers", id), next);
    upsertMember({ ...next, id });
    e.target.reset(); $("#member-id").value = "";
    renderAccount(); renderReimbursements();
    err.textContent = `Đã lưu ${name} (${ROLE_LABELS[role]})${pin ? ", PIN mới đã có hiệu lực" : ""}.`;
  } catch (error) { err.textContent = error.message; }
});
$("#member-clear").addEventListener("click", () => { $("#member-form").reset(); $("#member-id").value = ""; $("#member-error").textContent = ""; $("#member-name").focus(); });
$("#members-zone").addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  const m = state.members.find((x) => x.id === (t.dataset.editMember || t.dataset.toggleMember || t.dataset.linkLegacy));
  if (!m) return;
  if (t.dataset.editMember) { $("#member-id").value = m.id; $("#member-name").value = m.name || ""; $("#member-role").value = m.role || ROLE_BUYER; $("#member-pin").value = ""; $("#member-pin").placeholder = "Để trống nếu giữ PIN cũ"; $("#member-name").focus(); return; }
  try {
    if (t.dataset.toggleMember) {
      const next = { ...stripId(m), active: m.active === false, updatedAt: Date.now() };
      await setDoc(doc(db, ...root, "webMembers", m.id), next);
      upsertMember({ ...next, id: m.id });
    } else {
      // Phiếu cũ nhập trước khi có PIN: gắn người dùng để người mua thấy được trên tài khoản của họ.
      const list = legacyOpenReceipts(m, reimbReceipts());
      if (!window.confirm(`Gắn ${list.length} phiếu đang mở mang tên "${m.name}" vào tài khoản của ${m.name}?`)) return;
      const batch = writeBatch(db);
      const now = Date.now();
      const updated = list.map((r) => ({ ...r, payerId: m.id, updatedAt: Math.max(now, Number(r.updatedAt || 0) + 1), ...(r.source === "ANDROID_POS" ? { editedBy: "WEB_MANAGER" } : {}) }));
      updated.forEach((r) => batch.set(doc(db, ...root, receiptCollection(), r.id), r));
      await batch.commit();
      updated.forEach((r) => { replaceLocalReceipt(r); state.openReceipts = state.openReceipts.map((x) => (x.id === r.id ? r : x)); });
    }
    renderAccount(); renderReimbursements();
  } catch (error) { $("#member-error").textContent = error.message; }
});




/* ---------- Banner "món đỉnh nhất" ở tab Doanh thu: hôm nay / 7 ngày / tháng này, tự chuyển slide ---------- */
const banner = { slides: [], index: 0, timer: null, loadedAt: 0 };
async function loadTopBanner() {
  if (!state.user || !state.role || state.demo || state.simulation) return;
  if (Date.now() - banner.loadedAt < 5 * 60000 && banner.slides.length) { renderTopBanner(); return; }
  const now = new Date();
  const first = new Date(Math.min(new Date(now.getFullYear(), now.getMonth(), 1).getTime(), new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime()));
  try {
    const got = rows(await getDocs(query(collection(db, ...root, "dashboardDaily"), where("dateKey", ">=", dateKeyOf(first)), where("dateKey", "<=", dateKeyOf(now)), limit(62))));
    for (const d of got) state.dailyDocs[d.dateKey || d.id] = d; // hôm nay luôn lấy bản mới nhất
  } catch { /* banner chỉ để vui: lỗi thì dùng dữ liệu đã có */ }
  banner.loadedAt = Date.now();
  banner.slides = topSellers(state.dailyDocs, now).filter((s) => s.name);
  renderTopBanner();
}
const BANNER_ICON = { today: "🔥", week: "🚀", month: "👑" };
const BANNER_CHEER = { today: "Đang cháy hàng!", week: "Ngôi sao của tuần", month: "Vua doanh số tháng" };
function renderTopBanner() {
  const host = $("#top-banner");
  if (!host) return;
  clearInterval(banner.timer);
  if (!banner.slides.length) { host.hidden = true; return; }
  host.hidden = false;
  banner.index = Math.min(banner.index, banner.slides.length - 1);
  const s = banner.slides[banner.index];
  host.className = `top-banner tb-${s.id}`;
  host.innerHTML = `<div class="tb-slide">
      <div class="tb-confetti" aria-hidden="true">${["✨", "🎉", "⭐", "☕", "🎊", "✨"].map((c, i) => `<span style="--i:${i}">${c}</span>`).join("")}</div>
      ${(() => { const m = state.menuItems.find((x) => normName(x.name) === normName(s.name)); const img = thumbFor(s.itemId) || (m ? thumbFor(m.id) : ""); return img ? `<div class="tb-photo"><img src="${img}" alt="" /><span>${BANNER_ICON[s.id]}</span></div>` : `<div class="tb-icon" aria-hidden="true">${BANNER_ICON[s.id]}</div>`; })()}
      <div class="tb-text"><p class="tb-label">${escapeHtml(s.label)} · ${BANNER_CHEER[s.id]}</p>
        <h3 class="tb-name">${escapeHtml(s.name)}</h3>
        <p class="tb-meta"><b>${s.qty.toLocaleString("vi-VN")}</b> phần · ${money(s.revenue)} · ${Math.round(s.share * 100)}% số món bán ra${s.runnerUp ? ` · bỏ xa <b>${escapeHtml(s.runnerUp)}</b> ${s.lead.toLocaleString("vi-VN")} phần` : ""}</p></div>
    </div><div class="tb-dots">${banner.slides.map((x, i) => `<button type="button" class="${i === banner.index ? "active" : ""}" data-banner="${i}" aria-label="${escapeHtml(x.label)}"></button>`).join("")}</div>`;
  if (banner.slides.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    banner.timer = setInterval(() => { if ($("#top-banner").offsetParent === null) return; banner.index = (banner.index + 1) % banner.slides.length; renderTopBanner(); }, 5000);
  }
}
$("#top-banner").addEventListener("click", (e) => { const i = e.target.closest("[data-banner]")?.dataset.banner; if (i !== undefined) { banner.index = Number(i); renderTopBanner(); } });




/* ---------- Menu quán + ảnh nhỏ (menuThumbs, app 164+). Ảnh nhớ trong trình duyệt để mở lại không tốn lượt đọc. ---------- */
const THUMB_CACHE = "pos0210-menu-thumbs-v2";
const menuView = { cat: "", thumbs: null, cachedAt: 0, loadedAt: 0, onlineHidden: null };
function cachedThumbs() {
  if (menuView.thumbs) return menuView.thumbs;
  try { const c = JSON.parse(usageStore?.getItem(THUMB_CACHE) || "null"); menuView.thumbs = c?.map || {}; menuView.cachedAt = Number(c?.at || 0); } catch { menuView.thumbs = {}; }
  return menuView.thumbs;
}
const thumbFor = (menuId) => cachedThumbs()[`menu_${menuId}`]?.thumb || "";
async function loadMenuView(force = false) {
  if (!state.user || !state.role) return;
  if (force || !state.recipesLoaded) await loadRecipes();
  cachedThumbs();
  if (state.role === ROLE_OWNER && (force || !menuView.onlineHidden)) {
    try { const h = await getDoc(doc(db, ...root, "online_config", "menu")); menuView.onlineHidden = new Set(Array.isArray(h.data()?.hidden) ? h.data().hidden : []); countUsage("reads", 1); } catch { menuView.onlineHidden = menuView.onlineHidden || new Set(); }
  }
  // Chỉ đọc lại ảnh khi: bấm Đọc lại, chưa có bản nhớ, bản nhớ quá 7 ngày, hoặc có món được sửa sau lần nhớ (đổi ảnh trên máy POS cũng cập nhật món).
  const newest = Math.max(0, ...state.menuItems.map((m) => Number(m.updatedAt || 0)));
  const stale = !menuView.cachedAt || Date.now() - menuView.cachedAt > 7 * 86400000 || newest > menuView.cachedAt;
  if (force || (!menuView.loadedAt && stale)) {
    $("#menu-grid").innerHTML = '<p class="muted">Đang đọc ảnh món…</p>';
    try {
      const docs = rows(await getDocs(collection(db, ...root, "menuThumbs")));
      const map = {};
      for (const d of docs) if (d.thumb) map[d.id] = { thumb: d.thumb, sha: d.sourceSha256 || "", updatedAt: Number(d.updatedAt || 0) };
      menuView.thumbs = map; menuView.loadedAt = Date.now(); menuView.cachedAt = Date.now();
      try { usageStore?.setItem(THUMB_CACHE, JSON.stringify({ at: menuView.cachedAt, map })); } catch { /* đầy bộ nhớ trình duyệt: chỉ giữ trong phiên */ }
    } catch (error) { menuView.loadedAt = Date.now(); $("#menu-issues").innerHTML = `<p class="warn-text">Chưa đọc được ảnh: ${escapeHtml(error.message || error)}</p>`; }
  }
  renderMenuView();
}
function renderMenuView() {
  const groups = menuGroups(state.menuItems, state.menuCats);
  const total = groups.reduce((t, g) => t + g.items.length, 0);
  const withImg = groups.reduce((t, g) => t + g.items.filter((m) => thumbFor(m.id)).length, 0);
  const lastUpdate = Math.max(0, ...state.menuItems.map((m) => Number(m.updatedAt || 0)));
  $("#menu-badge").textContent = `· ${groups.length} nhóm · ${total} món · ${withImg} có ảnh`;
  $("#menu-cats").innerHTML = [["all", `Tất cả (${total})`], ...groups.map((g) => [g.id, `${g.name} (${g.items.length})`])].map(([k, l]) => `<button type="button" class="filter${menuView.cat === k ? " active" : ""}" data-menu-cat="${escapeHtml(k)}">${escapeHtml(l)}</button>`).join("");
  const { costs } = currentCosts();
  if (!menuView.cat || (menuView.cat !== "all" && !groups.some((g) => g.id === menuView.cat))) menuView.cat = groups[0]?.id || "all";
  const shown = groups.filter((g) => menuView.cat === "all" || g.id === menuView.cat);
  $("#menu-grid").innerHTML = shown.map((g) => `<h3 class="menu-group">${escapeHtml(g.name)} <small class="muted">${g.items.length} món${g.active ? "" : " · nhóm đang tắt"}</small>${canEditMenu() && g.id !== "_other" ? `<button type="button" class="text-button" data-add-menu="${escapeHtml(g.id)}">+ Thêm món</button>` : ""}</h3><div class="menu-list">${g.items.map((m) => {
    const img = thumbFor(m.id);
    const lines = recipeLinesFor(m);
    const r = lines.length ? recipeCost(lines, costs, m.price) : null;
    const cost = r && !r.missing.length && m.price ? `vốn ${Math.round((r.total / m.price) * 100)}%` : "";
    return `<article class="menu-row${m.active === false ? " off" : ""}${menuView.onlineHidden?.has(m.id) ? " online-hidden" : ""}"${canEditMenu() ? ` data-edit-menu="${escapeHtml(m.id)}" role="button" tabindex="0"` : ""}>${img ? `<img src="${img}" alt="" loading="lazy" />` : `<span class="menu-initial">${escapeHtml(m.name.trim().charAt(0).toUpperCase())}</span>`}<div class="menu-info"><strong>${escapeHtml(m.name.trim())}</strong><b class="menu-price">${money(m.price)}</b><small>${[m.productCode, cost, m.active === false ? "ngừng bán" : ""].filter(Boolean).join(" · ")}</small></div>${state.role === ROLE_OWNER && menuView.onlineHidden ? `<button type="button" class="oo-vis${menuView.onlineHidden.has(m.id) ? " is-hidden" : ""}" data-online-vis="${escapeHtml(m.id)}" title="Chỉ chủ quán thấy và chỉnh nút này">${menuView.onlineHidden.has(m.id) ? "Online: ẨN" : "Online: hiện"}</button>` : ""}</article>`;
  }).join("")}</div>`).join("") || '<p class="muted">Chưa có menu trên cloud.</p>';
  if (state.combos.length) {
    const nameOf = (c) => String(c.name || "").trim();
    $("#menu-grid").innerHTML += `<h3 class="menu-group">Combo <small class="muted">${state.combos.length} combo · quản lý trên máy POS</small></h3><div class="menu-list">${state.combos.map((c) => `<article class="menu-row${c.active === false ? " off" : ""}${menuView.onlineHidden?.has(`c_${c.id}`) ? " online-hidden" : ""}"><span class="menu-initial">C</span><div class="menu-info"><strong>${escapeHtml(nameOf(c))}</strong><b class="menu-price">${money(c.price)}</b><small>${escapeHtml((c.items || []).map((x) => `${x.qty}× ${x.name}`).join(" + ") || "chưa có thành phần")}${c.active === false ? " · ngừng bán" : ""}</small></div>${state.role === ROLE_OWNER && menuView.onlineHidden ? `<button type="button" class="oo-vis${menuView.onlineHidden.has(`c_${c.id}`) ? " is-hidden" : ""}" data-online-vis="c_${escapeHtml(c.id)}" title="Chỉ chủ quán thấy và chỉnh nút này">${menuView.onlineHidden.has(`c_${c.id}`) ? "Online: ẨN" : "Online: hiện"}</button>` : ""}</article>`).join("")}</div>`;
  }
  const issues = nameIssues(state.menuItems);
  const sold = soldNotInMenu(state.dailyDocs, state.menuItems);
  const parts = [];
  if (issues.duplicates.length) parts.push(`<div class="menu-dups"><p class="warn-text">⚠ Món trùng tên (thống kê đã tự cộng chung theo tên):</p>${issues.duplicates.map((d, i) => { const p = mergePlan(d.items, soldByMenuId()); return `<div class="menu-dup"><span><b>${escapeHtml(d.name)}</b> × ${d.items.length}: ${d.items.map((m) => `${escapeHtml(m.productCode || "không mã")}${m.active === false ? " (ngừng bán)" : ""}`).join(", ")} → giữ <b>${escapeHtml(p.keep.productCode || p.keep.name.trim())}</b></span>${state.role === ROLE_OWNER ? `<button type="button" class="btn" data-merge-dup="${i}">Gộp</button>` : ""}</div>`; }).join("")}</div>`);
  if (issues.spacing.length) parts.push(`<p class="muted">Tên có khoảng trắng thừa: ${issues.spacing.map((m) => `"${escapeHtml(m.name)}"`).join(", ")}.</p>`);
  const combos = state.combos.length ? [] : soldCombos(state.dailyDocs);
  if (combos.length) parts.push(`<p class="muted">Combo bán gần đây (quản lý riêng trên máy POS; chưa có danh sách combo trên cloud: cài POS v181 và chờ đồng bộ): ${combos.slice(0, 15).map((x) => `${escapeHtml(x.name.replace(/^\s*combo\s*[·•:\-]\s*/i, ""))} (${x.qty})`).join(", ")}.</p>`);
  if (sold.length) parts.push(`<p class="warn-text">⚠ Món có trong số bán gần đây nhưng không có trong menu web: ${sold.slice(0, 15).map((x) => `<b>${escapeHtml(x.name)}</b> (${x.qty})`).join(", ")}. Thường là món đã đổi tên / xoá trên máy POS, hoặc menu web chưa đồng bộ đủ: bấm Yêu cầu máy POS đẩy menu + ảnh.</p>`);
  if (total && withImg < total) parts.push(`<p class="muted">${total - withImg} món chưa có ảnh trên web${menuView.cachedAt ? ` (ảnh nhớ lúc ${dateTime(menuView.cachedAt)})` : " (chưa đọc ảnh)"}.</p>`);
  parts.push(`<p class="muted">Menu web cập nhật gần nhất: ${lastUpdate > 1e12 ? dateTime(lastUpdate) : "lúc máy POS đồng bộ lần đầu"}.</p>`);
  $("#menu-issues").innerHTML = parts.join("");
}
/** Số phần đã bán theo mã món (từ snapshot ngày đã đọc), để chọn món giữ lại khi gộp. */
function soldByMenuId() {
  const out = {};
  for (const d of Object.values(state.dailyDocs || {})) for (const it of Array.isArray(d?.items) ? d.items : []) out[it.itemId] = (out[it.itemId] || 0) + Number(it.qty || 0);
  return out;
}
/** Gộp món trùng tên: sửa menu trên cloud (menu là nguồn chuẩn, máy POS tự kéo về ở lần đồng bộ kế tiếp). Không đổi mã, không xoá món. */
$("#menu-issues").addEventListener("click", async (e) => {
  const i = e.target.closest("[data-merge-dup]")?.dataset.mergeDup;
  if (i === undefined || state.role !== ROLE_OWNER) return;
  const group = nameIssues(state.menuItems).duplicates[Number(i)];
  const plan = group && mergePlan(group.items, soldByMenuId());
  if (!plan) return;
  const msg = `Gộp "${plan.cleanName}":\n• GIỮ: ${plan.keep.productCode || "(không mã)"} · ${money(plan.keep.price)} · đang bán\n${plan.drop.map((d) => `• NGỪNG BÁN: ${d.productCode || "(không mã)"} · ${money(d.price)} → đổi tên "${plan.cleanName} (…gộp…)"`).join("\n")}\n\nKhông xoá món, không đổi mã, bill cũ giữ nguyên. Máy POS tự nhận ở lần đồng bộ tới. Tiếp tục?`;
  if (!window.confirm(msg)) return;
  const note = $("#menu-issues");
  try {
    const now = Date.now();
    const batch = writeBatch(db);
    for (const w of plan.writes) batch.set(doc(db, ...root, "menu", w.id), { ...w.data, updatedAt: now, editedBy: `WEB:${myName()}` }, { merge: true });
    await bumpMenuVersion(batch);
    await batch.commit();
    for (const w of plan.writes) { const m = state.menuItems.find((x) => x.id === w.id); if (m) Object.assign(m, w.data, { updatedAt: now }); }
    try { await setDoc(doc(db, ...root, "commands", "sync"), { requestedAt: now, requestedBy: myName(), scope: "" }, { merge: true }); } catch { /* máy POS vẫn tự đồng bộ theo chu kỳ */ }
    renderMenuView();
    flashNote(`Đã gộp "${plan.cleanName}". Máy POS sẽ nhận ở lần đồng bộ tới.`);
  } catch (error) { note.insertAdjacentHTML("afterbegin", `<p class="warn-text">Chưa gộp được: ${escapeHtml(error.message || error)}</p>`); }
});
$("#menu-panel").addEventListener("toggle", (e) => { if (e.target.open) loadMenuView(); });
$("#menu-reload").addEventListener("click", () => loadMenuView(true));
/** Không cần máy POS: tạo ảnh nhỏ 240px ngay trên trình duyệt từ ảnh gốc đã có trên cloud (collection media), ghi vào menuThumbs. Chỉ làm món thiếu / ảnh gốc đã đổi. */
function shrinkImage(src, edge = 240) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, edge / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => reject(new Error("ảnh hỏng"));
    img.src = src;
  });
}
$("#menu-from-cloud").addEventListener("click", async () => {
  const note = $("#menu-remote-note");
  if (!state.user || state.simulation || state.demo) { note.textContent = "Tắt demo / mô phỏng để làm."; return; }
  const btn = $("#menu-from-cloud"); btn.disabled = true;
  try {
    note.textContent = "Đang đọc ảnh nhỏ hiện có…";
    const have = new Map(rows(await getDocs(collection(db, ...root, "menuThumbs"))).map((t) => [t.id, t.sourceSha256 || ""]));
    note.textContent = "Đang đọc ảnh gốc trên cloud (lần đầu có thể mất 1–2 phút)…";
    const media = rows(await getDocs(collection(db, ...root, "media"))).filter((m) => m.encoding === "jpeg-base64-v1" && m.payload && (m.entityType === "menu" || m.entityType === "combo"));
    const todo = media.filter((m) => have.get(m.id) !== (m.sourceSha256 || m.sha256));
    let done = 0, failed = 0;
    for (const m of todo) {
      try {
        const thumb = await shrinkImage(`data:image/jpeg;base64,${m.payload}`);
        await setDoc(doc(db, ...root, "menuThumbs", m.id), { id: m.id, entityType: m.entityType, entityId: m.entityId, sourceSha256: m.sourceSha256 || m.sha256 || "", thumb, bytes: Math.round(thumb.length * 0.75), updatedAt: Date.now(), source: "WEB" });
        done += 1; note.textContent = `Đang tạo ảnh nhỏ ${done}/${todo.length}…`;
      } catch { failed += 1; }
    }
    note.textContent = media.length ? `Xong: cloud có ${media.length} ảnh gốc · tạo mới ${done} ảnh nhỏ · đã có sẵn ${media.length - todo.length}${failed ? ` · lỗi ${failed}` : ""}.${media.length < state.menuItems.length ? " Món còn thiếu ảnh là món chưa từng được đẩy ảnh gốc từ máy POS." : ""}` : "Cloud chưa có ảnh gốc nào: cần máy POS đẩy ảnh (nút trên máy POS hoặc Yêu cầu máy POS ở trên, cần app 165).";
    await loadMenuView(true);
  } catch (error) { note.textContent = `Chưa làm được: ${error.message || error}`; }
  btn.disabled = false;
});
/** Gửi lệnh cho máy POS (đang chạy nền) tự đẩy toàn bộ menu + ảnh; theo dõi kết quả máy POS ghi lại. */
$("#menu-remote").addEventListener("click", async () => {
  const note = $("#menu-remote-note");
  if (!state.user || state.simulation || state.demo) { note.textContent = "Tắt demo / mô phỏng để gửi lệnh."; return; }
  const ref = doc(db, ...root, "commands", "sync");
  const now = Date.now();
  $("#menu-remote").disabled = true;
  try { await setDoc(ref, { requestedAt: now, requestedBy: myName(), scope: "menu" }, { merge: true }); }
  catch (error) { note.textContent = `Không gửi được lệnh: ${error.message}`; $("#menu-remote").disabled = false; return; }
  note.textContent = "Đã gửi lệnh, chờ máy POS nhận…";
  const started = Date.now();
  const timer = setInterval(async () => {
    try {
      const d = (await getDoc(ref)).data() || {};
      if (Number(d.menuDoneFor) === now) {
        clearInterval(timer); $("#menu-remote").disabled = false;
        note.textContent = d.menuError && !d.mediaUploaded && !d.mediaSkipped ? `Máy POS báo lỗi: ${d.menuError}` : `Máy POS (${d.device || "?"}) đã đẩy ${d.menuCategories ?? "?"} nhóm, ${d.menuItems ?? "?"} món · ảnh mới ${d.mediaUploaded ?? 0}, giữ nguyên ${d.mediaSkipped ?? 0}, lỗi ${d.mediaErrors ?? 0}${d.menuError ? ` (${d.menuError})` : ""}. Đang đọc lại menu…`;
        setTimeout(() => loadMenuView(true), 40000); // menu đẩy theo lô sau ~30 giây
        return;
      }
      if (Number(d.receivedFor) === now) note.textContent = `Máy POS (${d.device || "?"}) đã nhận lệnh, đang đẩy menu và ảnh (có thể mất 1–3 phút)…`;
      if (Date.now() - started > 5 * 60000) { clearInterval(timer); $("#menu-remote").disabled = false; note.textContent = Number(d.receivedFor) === now ? "Máy POS đã nhận nhưng chưa báo xong: thử Đọc lại menu sau ít phút." : "Máy POS chưa nhận lệnh: app có thể đã bị tắt hẳn, hoặc máy chưa cài bản 165. Mở app trên máy POS rồi thử lại."; }
    } catch (error) { clearInterval(timer); $("#menu-remote").disabled = false; note.textContent = `Không đọc được trạng thái: ${error.message}`; }
  }, 5000);
});
$("#menu-cats").addEventListener("click", (e) => { const k = e.target.closest("[data-menu-cat]")?.dataset.menuCat; if (!k) return; menuView.cat = k; renderMenuView(); });

/* ---------- Sửa / thêm món trên web: ghi menu cloud + tăng config/menuVersion, máy POS (app 167+) tự kéo về ---------- */
const canEditMenu = () => state.role === ROLE_OWNER || state.role === ROLE_TREASURER;
const menuEdit = { item: null, photo: null };
async function bumpMenuVersion(batch) { batch.set(doc(db, ...root, "config", "menuVersion"), { v: Date.now(), by: `WEB:${myName()}` }, { merge: true }); }
function openMenuEdit(item, categoryId = "") {
  const isNew = !item;
  const cat = item?.categoryId || categoryId;
  menuEdit.item = item || { id: (crypto.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`), categoryId: cat, name: "", price: 0, active: true, sortOrder: Math.max(0, ...state.menuItems.filter((m) => m.categoryId === cat).map((m) => Number(m.sortOrder || 0))) + 1, productCode: nextProductCode(state.menuItems, cat), description: "", isNew: true };
  menuEdit.photo = null;
  const m = menuEdit.item;
  $("#menu-edit-title").textContent = isNew ? "Thêm món mới" : "Sửa món";
  $("#menu-edit-name").value = (m.name || "").trim(); $("#menu-edit-price").value = m.price || ""; $("#menu-edit-code").value = m.productCode || "";
  $("#menu-edit-cat").innerHTML = (state.menuCats || []).slice().sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)).map((c) => `<option value="${escapeHtml(c.id)}"${String(c.id) === String(m.categoryId) ? " selected" : ""}>${escapeHtml(c.name)}</option>`).join("") + (m.categoryId && !(state.menuCats || []).some((c) => String(c.id) === String(m.categoryId)) ? `<option value="${escapeHtml(m.categoryId)}" selected>(nhóm hiện tại)</option>` : "");
  $("#menu-edit-active").checked = m.active !== false;
  const img = thumbFor(m.id); $("#menu-edit-img").hidden = !img; $("#menu-edit-img").src = img || ""; $("#menu-edit-noimg").hidden = Boolean(img);
  $("#menu-edit-error").textContent = ""; $("#menu-edit-file").value = "";
  $("#menu-edit-dialog").showModal();
}
/** Ảnh gốc ≤ 1280px, JPEG ≤ 450 KB (cùng chuẩn app), kèm sha256 để máy POS kiểm tra khi tải về. */
async function prepareMenuPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("Không đọc được ảnh")); i.src = url; });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    let dataUrl = "";
    for (const q of [0.82, 0.72, 0.6, 0.45, 0.3]) { dataUrl = c.toDataURL("image/jpeg", q); if (dataUrl.length * 0.75 <= 450000) break; }
    const payload = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0));
    if (bytes.length > 450000) throw new Error("Ảnh quá lớn sau khi nén");
    const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const thumb = await shrinkImage(dataUrl);
    return { payload, sha, bytes: bytes.length, thumb };
  } finally { URL.revokeObjectURL(url); }
}
$("#menu-grid").addEventListener("click", async (e) => {
  const vis = e.target.closest("[data-online-vis]");
  if (vis) {
    e.stopPropagation();
    if (state.role !== ROLE_OWNER || !menuView.onlineHidden) return;
    const id = vis.dataset.onlineVis;
    const next = new Set(menuView.onlineHidden);
    next.has(id) ? next.delete(id) : next.add(id);
    vis.disabled = true;
    try {
      await setDoc(doc(db, ...root, "online_config", "menu"), { hidden: [...next], updatedAt: Date.now(), updatedBy: myName() });
      menuView.onlineHidden = next;
    } catch (error) { window.alert(`Chưa lưu được: ${error.message || error}`); }
    renderMenuView();
    return;
  }
  const add = e.target.closest("[data-add-menu]")?.dataset.addMenu;
  if (add && canEditMenu()) { openMenuEdit(null, add); return; }
  const id = e.target.closest("[data-edit-menu]")?.dataset.editMenu;
  if (id && canEditMenu()) openMenuEdit(state.menuItems.find((m) => m.id === id));
});
$("#menu-edit-close").addEventListener("click", () => $("#menu-edit-dialog").close());
$("#menu-edit-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  $("#menu-edit-error").textContent = "Đang nén ảnh…";
  try { menuEdit.photo = await prepareMenuPhoto(file); $("#menu-edit-img").src = menuEdit.photo.thumb; $("#menu-edit-img").hidden = false; $("#menu-edit-noimg").hidden = true; $("#menu-edit-error").textContent = ""; }
  catch (error) { menuEdit.photo = null; $("#menu-edit-error").textContent = error.message || String(error); }
});
$("#menu-edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!canEditMenu() || !menuEdit.item) return;
  if (state.demo || state.simulation) { $("#menu-edit-error").textContent = "Tắt demo / mô phỏng để sửa menu thật."; return; }
  const m = menuEdit.item;
  const draft = { ...m, name: $("#menu-edit-name").value.replace(/\s+/g, " ").trim(), price: Math.round(Number($("#menu-edit-price").value)), categoryId: $("#menu-edit-cat").value, active: $("#menu-edit-active").checked };
  const problem = menuEditProblem(draft, state.menuItems);
  if (problem) { $("#menu-edit-error").textContent = problem; return; }
  if (!m.isNew && m.price !== draft.price && !window.confirm(`Đổi giá "${draft.name}" từ ${money(m.price)} thành ${money(draft.price)}? Bill đã bán giữ giá cũ.`)) return;
  $("#menu-edit-save").disabled = true;
  try {
    const now = Date.now();
    const data = { id: m.id, categoryId: draft.categoryId, name: draft.name, price: draft.price, sortOrder: Number(m.sortOrder || 0), active: draft.active, productCode: m.productCode || "", description: m.description || "", updatedAt: now, editedBy: `WEB:${myName()}` };
    const batch = writeBatch(db);
    if (menuEdit.photo) {
      const p = menuEdit.photo;
      batch.set(doc(db, ...root, "media", `menu_${m.id}`), { mediaId: `menu_${m.id}`, entityType: "menu", entityId: m.id, encoding: "jpeg-base64-v1", payload: p.payload, sha256: p.sha, sourceSha256: p.sha, bytes: p.bytes, version: now, updatedAt: now, source: "WEB" });
      batch.set(doc(db, ...root, "menuThumbs", `menu_${m.id}`), { id: `menu_${m.id}`, entityType: "menu", entityId: m.id, sourceSha256: p.sha, thumb: p.thumb, bytes: Math.round(p.thumb.length * 0.75), updatedAt: now, source: "WEB" });
      data.imageSha = p.sha;
    }
    batch.set(doc(db, ...root, "menu", m.id), data, { merge: true });
    await bumpMenuVersion(batch);
    await batch.commit();
    const local = state.menuItems.find((x) => x.id === m.id);
    if (local) Object.assign(local, data); else state.menuItems.push(data);
    if (menuEdit.photo) { cachedThumbs()[`menu_${m.id}`] = { thumb: menuEdit.photo.thumb, sha: menuEdit.photo.sha, updatedAt: now }; try { usageStore?.setItem(THUMB_CACHE, JSON.stringify({ at: Date.now(), map: cachedThumbs() })); menuView.cachedAt = Date.now(); } catch { /* bỏ qua */ } }
    $("#menu-edit-dialog").close();
    renderMenuView();
    flashNote(`Đã lưu "${draft.name}". Máy POS nhận ở lần đồng bộ tới.`);
  } catch (error) { $("#menu-edit-error").textContent = `Chưa lưu được: ${error.message || error}`; }
  $("#menu-edit-save").disabled = false;
});

/* ---------- Dự báo nguyên liệu ngày mai + xếp hạng món theo lãi gộp (dữ liệu: snapshot ngày, công thức, giá nhập) ---------- */
const planState = { loadedFrom: "", period: 7 };
async function ensurePlanData() {
  if (!state.recipesLoaded) await loadRecipes();
  const d = new Date(); const from = dateKeyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 29));
  if (planState.loadedFrom && planState.loadedFrom <= from) return;
  try {
    const got = rows(await getDocs(query(collection(db, ...root, "dashboardDaily"), where("dateKey", ">=", from), where("dateKey", "<=", dateKeyOf(d)), limit(40))));
    for (const x of got) state.dailyDocs[x.dateKey || x.id] = x;
    planState.loadedFrom = from;
  } catch { /* dùng dữ liệu đã có */ }
}
const recipeForMenu = (name, m) => (m && state.recipes[m.id]?.lines) || recipeByName(name);
async function renderPrep() {
  await ensurePlanData();
  const t = tomorrowSales(state.dailyDocs);
  const list = prepList(t.sales, (name) => recipeByName(name));
  const totalDishes = Object.values(t.sales).reduce((a, b) => a + b, 0);
  $("#prep-badge").textContent = t.days ? `· ${new Date(`${t.date}T12:00:00`).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" })}` : "· chưa đủ dữ liệu";
  if (!t.days) { $("#prep-view").innerHTML = '<p class="muted">Chưa có số bán các ngày trước để ước lượng.</p>'; return; }
  const plain = (x) => String(x).toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
  const display = (k) => state.menuItems.find((m) => plain(m.name) === plain(k))?.name.trim() || k;
  const top = Object.entries(t.sales).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, q]) => `${escapeHtml(display(n))} ~${Math.round(q)}`).join(" · ");
  $("#prep-view").innerHTML = `<p class="muted">Dự kiến ~${Math.round(totalDishes)} phần (${escapeHtml(t.basis)}): ${top}${Object.keys(t.sales).length > 8 ? " …" : ""}</p>
    ${list.length ? `<div class="prep-list">${list.map((x) => `<div class="prep-row"><span>${escapeHtml(x.name)}${x.kind === "BB" ? ' <small class="muted">bao bì</small>' : ""}</span><b>${escapeHtml(x.label)}</b></div>`).join("")}</div>` : '<p class="muted">Các món bán chưa có công thức: vào từng món ở mục Công thức bên dưới để đặt định lượng.</p>'}
    <p class="muted">Món chưa có công thức sẽ không được tính nguyên liệu. Định lượng chỉnh ở danh sách công thức bên dưới.</p>`;
}
async function renderProfit() {
  await ensurePlanData();
  const d = new Date();
  const keys = Array.from({ length: planState.period }, (_, i) => dateKeyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i)));
  const items = aggregateItems(state.dailyDocs, keys, "combined");
  const { costs } = currentCosts();
  const ranked = profitRanking(items, state.menuItems, recipeForMenu, costs);
  $("#profit-period").innerHTML = [[7, "7 ngày"], [30, "30 ngày"]].map(([n, l]) => `<button type="button" class="filter${planState.period === n ? " active" : ""}" data-profit-period="${n}">${l}</button>`).join("");
  const known = ranked.filter((r) => r.gross !== null);
  const totalGross = known.reduce((t, r) => t + r.gross, 0);
  $("#profit-badge").textContent = known.length ? `· lãi gộp ~${money(totalGross)} / ${planState.period} ngày` : "";
  $("#profit-view").innerHTML = ranked.length ? `<div class="table-wrap"><table class="profit-table"><thead><tr><th>#</th><th>Món</th><th>SL</th><th>Giá vốn / giá bán</th><th>Lãi gộp</th></tr></thead><tbody>${ranked.map((r, i) => `<tr class="${r.margin !== null && r.margin < 0.5 ? "low" : ""}"><td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td>${Math.round(r.qty)}</td><td>${r.unitCost === null ? `<small class="muted">${r.missing[0] === "chưa có công thức" ? "chưa có công thức" : `thiếu giá ${escapeHtml(r.missing.slice(0, 2).join(", "))}`}</small>` : `${money(r.unitCost)} / ${money(r.price)} <small class="muted">(${Math.round((1 - r.margin) * 100)}%)</small>`}</td><td><b>${r.gross === null ? "—" : money(r.gross)}</b></td></tr>`).join("")}</tbody></table></div>
    <p class="muted">Lãi gộp = (giá bán bình quân − giá vốn công thức theo giá nhập 30 ngày) × số lượng; chưa trừ giảm giá theo bill, lương, mặt bằng. Dòng tô nhạt: giá vốn ≥ 50% giá bán.</p>` : '<p class="muted">Chưa có số bán trong kỳ.</p>';
}
$("#prep-panel").addEventListener("toggle", (e) => { if (e.target.open) renderPrep(); });
$("#profit-panel").addEventListener("toggle", (e) => { if (e.target.open) renderProfit(); });
$("#profit-period").addEventListener("click", (e) => { const n = Number(e.target.closest("[data-profit-period]")?.dataset.profitPeriod); if (n) { planState.period = n; renderProfit(); } });
/* ---------- Bảng mức dùng Firebase (Tài khoản) ---------- */
async function loadUsage() {
  if (!state.user || !state.role) return;
  await flushUsage(true);
  const days = lastPacificDays(14);
  $("#usage-today").innerHTML = '<p class="muted">Đang đọc số đếm 14 ngày…</p>';
  const get = (id) => getDoc(doc(db, ...root, "config", id)).then((d) => (d.exists() ? d.data() : null)).catch(() => null);
  const rowsUsage = await Promise.all(days.map(async (day) => dayUsage({ day, app: await get(`quota-${day}`), web: await get(`webUsage-${day}`) })));
  // Hôm nay: cộng phần web của trình duyệt này chưa kịp lưu.
  const today = rowsUsage[rowsUsage.length - 1];
  renderUsage(usageTrend(rowsUsage), today);
}
function usageBar(label, m, extra = "") {
  const level = m.pct >= 80 ? "bad" : m.pct >= 60 ? "warn" : "ok";
  return `<div class="usage-row"><div class="usage-head"><b>${label}</b><span>${m.used.toLocaleString("vi-VN")} / ${m.limit.toLocaleString("vi-VN")} · <b>còn ${m.remainingPct.toFixed(1)}%</b> (${m.remaining.toLocaleString("vi-VN")})</span></div><div class="usage-track"><div class="usage-fill ${level}" style="width:${Math.min(100, m.pct).toFixed(1)}%"></div></div>${extra ? `<small class="muted">${extra}</small>` : ""}</div>`;
}
const USAGE_CAT = { sales: "bán hàng", dashboard: "số tổng", catalog: "menu", finance: "tài chính", people: "nhân viên/khách", backup: "sao lưu", media: "ảnh", system: "hệ thống" };
function renderUsage(trend, today) {
  const reset = nextReset();
  $("#usage-reset").textContent = new Date(reset).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const hoursLeft = Math.max(0, (reset - Date.now()) / 3600000);
  const t = trend[trend.length - 1];
  const worst = Math.max(t.reads.pct, t.writes.pct, t.deletes.pct);
  $("#usage-badge").textContent = `· hôm nay dùng ${worst.toFixed(0)}% · ${worst >= 80 ? "⚠ sắp chạm" : worst >= 60 ? "chú ý" : "an toàn"}`;
  const cats = Object.entries(t.categories).filter(([, v]) => v).map(([k, v]) => `${USAGE_CAT[k] || k} ${v.toLocaleString("vi-VN")}`).join(" · ");
  $("#usage-today").innerHTML = `<p class="reimb-sub">Ngày quota ${t.day} (Pacific) · còn ${hoursLeft.toFixed(1)} giờ đến lúc reset</p>
    ${usageBar("Ghi", t.writes, `máy POS ${t.appWrites.toLocaleString("vi-VN")}${t.hasApp ? "" : " (chưa có số đếm hôm nay)"}${cats ? ` (${cats})` : ""} · web ${t.web.writes.toLocaleString("vi-VN")} · máy POS tự dừng ở ${POS_CEILING.toLocaleString("vi-VN")}`)}
    ${usageBar("Đọc", t.reads, `web ${t.web.reads.toLocaleString("vi-VN")} (mọi trình duyệt đã lưu số đếm)`)}
    ${usageBar("Xoá", t.deletes)}
    ${t.flags.length ? `<p class="warn-text">⚠ ${t.flags.join(" · ")}</p>` : ""}`;
  const maxW = Math.max(1, ...trend.map((d) => d.writes.used)), maxR = Math.max(1, ...trend.map((d) => d.reads.used));
  $("#usage-days").innerHTML = `<p class="reimb-sub">14 ngày gần nhất</p><div class="table-wrap"><table class="usage-table"><thead><tr><th>Ngày</th><th>Ghi (POS + web)</th><th>Đọc (web)</th><th>Ghi chú</th></tr></thead><tbody>${trend.slice().reverse().map((d) => `<tr class="${d.flags.length ? "flag" : ""}">
    <td>${d.day.slice(8)}/${d.day.slice(5, 7)}</td>
    <td><div class="mini-bar"><span style="width:${(d.writes.used / maxW * 100).toFixed(0)}%"></span></div>${d.hasApp || d.hasWeb ? `${d.writes.used.toLocaleString("vi-VN")} <small class="muted">${d.writes.pct.toFixed(0)}%</small>` : "—"}</td>
    <td><div class="mini-bar read"><span style="width:${(d.reads.used / maxR * 100).toFixed(0)}%"></span></div>${d.hasWeb ? `${d.reads.used.toLocaleString("vi-VN")} <small class="muted">${d.reads.pct.toFixed(0)}%</small>` : "—"}</td>
    <td>${d.flags.length ? `<span class="warn-text">${d.flags.join(" · ")}</span>` : d.avgWrites !== null && (d.hasApp || d.hasWeb) ? `<small class="muted">TB ghi 7 ngày trước ${Math.round(d.avgWrites).toLocaleString("vi-VN")}</small>` : ""}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted">Số đếm web bắt đầu từ bản này, các ngày trước chưa có phần web. Ngày tô vàng: tăng hơn 1,5 lần trung bình 7 ngày trước hoặc vượt 70% hạn mức.</p>`;
}
$("#usage-panel").addEventListener("toggle", (e) => { if (e.target.open) loadUsage(); });
$("#usage-reload").addEventListener("click", loadUsage);
/* ---------- Đối chiếu doanh thu: dashboardMonthly (POS cộng) ↔ từng bill trên cloud ---------- */
const rc = { month: "this", cache: {} };
function rcMonthKey() { const d = new Date(); const m = rc.month === "last" ? new Date(d.getFullYear(), d.getMonth() - 1, 1) : d; return monthKeyOf(m.getTime()); }
async function readMonthBills(key) {
  const from = new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).getTime();
  const to = new Date(Number(key.slice(0, 4)), Number(key.slice(5)), 1).getTime();
  const fromKey = dateKeyOf(new Date(from)), toKey = dateKeyOf(new Date(to - 1));
  const [bills, snap, dailyRows] = await Promise.all([
    getDocs(query(collection(db, ...root, "bills"), where("openedAt", ">=", from), where("openedAt", "<", to), limit(6000))).then(rows),
    getDoc(doc(db, ...root, "dashboardMonthly", key)).then((d) => (d.exists() ? d.data() : null)),
    getDocs(query(collection(db, ...root, "dashboardDaily"), where("dateKey", ">=", fromKey), where("dateKey", "<=", toKey), limit(40))).then(rows).catch(() => []),
  ]);
  const daily = Object.fromEntries(dailyRows.map((d) => [d.dateKey || d.id, d]));
  const ids = bills.filter((b) => b.status === "PAID" || b.status === "REFUNDED").map((b) => String(b.id));
  const payments = (await Promise.all(chunk(ids, 30).map((part) => getDocs(query(collection(db, ...root, "payments"), where("billId", "in", part))).then(rows)))).flat();
  return { key, from, to, bills, payments, snapshot: snap, daily, readAt: Date.now() };
}
async function loadRevenueCheck(force = false) {
  if (!state.user || !state.role || state.demo || state.simulation) { $("#rc-view").innerHTML = '<p class="muted">Tắt demo / mô phỏng để đối chiếu số thật.</p>'; return; }
  const key = rcMonthKey();
  $("#rc-month").innerHTML = [["this", "Tháng này"], ["last", "Tháng trước"]].map(([k, l]) => `<button type="button" class="filter${rc.month === k ? " active" : ""}" data-rc="${k}">${l}</button>`).join("") + '<button type="button" class="filter" data-rc="reload">Đọc lại</button>';
  if (force || !rc.cache[key] || Date.now() - rc.cache[key].readAt > 5 * 60000) {
    $("#rc-view").innerHTML = '<p class="muted">Đang đọc bill và thanh toán của tháng…</p>';
    try { rc.cache[key] = await readMonthBills(key); } catch (error) { $("#rc-view").innerHTML = `<p class="warn-text">Không đọc được: ${escapeHtml(error.message || error)}</p>`; return; }
  }
  renderRevenueCheck(rc.cache[key]);
}
function renderRevenueCheck(data) {
  const r = reconcileRevenue({ snapshot: data.snapshot, bills: data.bills, payments: data.payments, refunds: [...state.refunds, ...state.frozenRefundDocs], range: { from: data.from, to: data.to } });
  const ok = r.diff === 0 && !r.suspects.some((s) => s.kind === "warn");
  const ddEarly = reconcileDays({ dailyDocs: data.daily || {}, bills: data.bills, payments: data.payments, range: { from: data.from, to: data.to } });
  const preExplains = ddEarly.preOpening.length > 0 && r.diff === ddEarly.preOpeningTotal && r.diffBills === ddEarly.preOpening.length;
  const onlyLate = r.diff !== 0 && r.unexplained === 0 && r.unexplainedBills === 0;
  $("#rc-badge").textContent = r.snapRevenue === null ? "· chưa có số POS" : ok ? "· ✅ khớp" : onlyLate ? "· ⏳ lệch do bill mới, chờ đồng bộ" : preExplains ? "· 🧪 lệch do bill thử trước khai trương" : "· ⚠ có lệch cần xem";
  const row = (a, b, cls = "") => `<tr class="${cls}"><td>${a}</td><td>${b}</td></tr>`;
  const signedMoney = (v) => (v > 0 ? `+${money(v)}` : v < 0 ? `−${money(-v)}` : money(0));
  const dd = reconcileDays({ dailyDocs: data.daily || {}, bills: data.bills, payments: data.payments, range: { from: data.from, to: data.to } });
  const explainsAll = dd.preOpening.length > 0 && r.diff === dd.preOpeningTotal && r.diffBills === dd.preOpening.length;
  const preHtml = r.diff === 0 || !dd.preOpening.length ? "" : `<p class="reimb-sub">🧪 Bill thử trước khai trương còn sót trên cloud · ${dd.preOpening.length} bill · ${money(dd.preOpeningTotal)}</p><p class="muted">POS báo 0 bill ở các ngày trước ${shortDay(dd.firstSalesDay)} (ngày bán đầu tiên) nhưng cloud còn các bill này. ${explainsAll ? `Bỏ các bill này thì cloud = ${money(r.cloudRevenue - dd.preOpeningTotal)} · ${r.cloudBills - dd.preOpening.length} bill, khớp đúng số POS.` : "Bỏ các bill này chưa làm hết chênh lệch."}</p><ul class="rc-list">${dd.preOpening.map((b) => `<li><b>Bill ${escapeHtml(b.billNo)}</b> · ${money(b.total)} — mở ${dateTime(b.openedAt)}</li>`).join("")}</ul>${state.role === ROLE_OWNER ? '<button type="button" class="btn" id="rc-delete-pre">XOÁ CÁC BILL THỬ NÀY KHỎI CLOUD</button>' : '<p class="muted">Chỉ chủ quán được xoá.</p>'}`;
  const dayHtml = r.diff === 0 ? "" : !dd.checkedDays ? '<p class="muted">Chưa có snapshot ngày của POS trong tháng này nên chưa đối chiếu được từng ngày.</p>'
    : dd.days.length === 0 ? `<p class="reimb-sub">Đối chiếu từng ngày</p><p class="muted">${dd.checkedDays} ngày có snapshot ngày của POS, tất cả đều KHỚP số bill và doanh thu với bill trên cloud. Vậy phần lệch không nằm ở ngày nào: số tháng của POS cũ hơn các số ngày (chờ POS đồng bộ lại) hoặc POS tính tháng khác ngày.</p>`
    : `<p class="reimb-sub">Đối chiếu từng ngày · ${dd.days.length} ngày lệch / ${dd.checkedDays} ngày có snapshot</p><p class="muted">Bill cloud − POS, tính theo ngày mở bill. Giờ lệch kèm các bill mở trong giờ đó: bill thừa nằm trong số này.</p><ul class="rc-list">${dd.days.map((d) => `<li><b>${shortDay(d.dateKey)}</b>: POS ${d.posBills} bill · ${money(d.posRevenue)}, cloud ${d.cloudBills} bill · ${money(d.cloudRevenue)} → <b>${d.diffBills > 0 ? "+" : ""}${d.diffBills} bill · ${d.diffRevenue > 0 ? "+" : ""}${money(d.diffRevenue)}</b>${d.snapshotAt ? ` (POS ghi ${dateTime(d.snapshotAt)})` : ""}${d.hasHourly ? "" : " · POS bản cũ chưa có số theo giờ"}${d.hours.length ? `<ul>${d.hours.map((h) => `<li>${String(h.hour).padStart(2, "0")}:00 — POS ${h.pos}, cloud ${h.cloud}${h.bills.length ? `: ${h.bills.map((b) => `Bill ${escapeHtml(b.billNo)} (${money(b.total)}, mở ${dateTime(b.openedAt).split(" ").pop()}, đóng ${dateTime(b.closedAt).split(" ").pop()})`).join("; ")}` : ""}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>`;
  const groups = [["warn", "⚠ Cần kiểm tra"], ["late", "⏳ Bill đóng sau lúc POS ghi số tổng"], ["excluded", "Không tính (không phải bán thật)"], ["info", "Ghi chú"]];
  $("#rc-view").innerHTML = `<table class="fund-table"><tbody>
    ${row(`Số POS cộng (ghi lúc ${data.snapshot?.updatedAt ? dateTime(data.snapshot.updatedAt) : "—"})`, r.snapRevenue === null ? "chưa có" : `${money(r.snapRevenue)} · ${r.snapBills} bill`)}
    ${row("Cộng từng bill trên cloud", `${money(r.cloudRevenue)} · ${r.cloudBills} bill`)}
    ${r.diff === null ? "" : row("Chênh (bill − POS)", `${signedMoney(r.diff)} · ${r.diffBills > 0 ? "+" : ""}${r.diffBills} bill`, "total")}
    ${r.diff ? row("· do bill đóng sau lúc POS ghi số", `${signedMoney(r.explained)} · ${r.explainedBills} bill`, "sub") : ""}
    ${r.diff ? row("· chưa giải thích được", `${signedMoney(r.unexplained)} · ${r.unexplainedBills} bill`, r.unexplained ? "total" : "sub") : ""}
  </tbody></table>
  ${r.diff === 0 ? '<p class="muted">Số POS và tổng từng bill khớp nhau.</p>' : onlyLate ? '<p class="muted">Toàn bộ chênh lệch là bill mới đóng sau lần POS ghi số tổng. Máy POS đồng bộ lần sau (tối đa ~10 phút khi còn mở app) sẽ tự khớp.</p>' : preExplains ? '<p class="muted">Phần lệch được giải thích bởi bill thử trước khai trương (xem bên dưới).</p>' : '<p class="warn-text">Còn phần lệch chưa giải thích: xem từng bill bên dưới, hoặc bấm Đọc lại sau khi máy POS đồng bộ.</p>'}
  ${preHtml}
  ${explainsAll ? "" : dayHtml}
  ${r.leads && !explainsAll ? `<p class="reimb-sub">🔎 Nghi vấn cho phần lệch ${money(r.unexplained)} · ${r.unexplainedBills} bill</p><p class="muted">POS chỉ lưu tổng nên chưa chỉ đích danh được. Thường là bill đóng sát lúc POS ghi số (POS đọc dữ liệu ngay trước khi bill đó xong). ${r.leads.combos.length ? `Có ${r.leads.combos.length} tổ hợp bill cộng đúng ${money(r.unexplained)}, đánh dấu ⭐.` : `Không có tổ hợp ${r.unexplainedBills} bill nào trong ${r.leads.windowMinutes} phút trước đó cộng đúng ${money(r.unexplained)}, nên nguyên nhân có thể không phải do thời điểm ghi.`}</p>${r.leads.bills.length ? `<ul class="rc-list">${r.leads.bills.map((b) => `<li>${b.match ? "⭐ " : ""}<b>Bill ${escapeHtml(b.billNo)}</b> · ${money(b.total)} — đóng lúc ${dateTime(b.closedAt)}</li>`).join("")}</ul>` : `<p class="muted">Không có bill nào đóng trong ${r.leads.windowMinutes} phút trước lúc POS ghi số.</p>`}` : ""}
  ${groups.map(([k, t]) => { const list = r.suspects.filter((s) => s.kind === k); return list.length ? `<p class="reimb-sub">${t} · ${list.length}</p><ul class="rc-list">${list.slice(0, 50).map((s) => `<li><b>Bill ${escapeHtml(s.billNo)}</b> · ${money(s.total)} — ${escapeHtml(s.reason)}</li>`).join("")}</ul>` : ""; }).join("")}`;
}
$("#rc-view").addEventListener("click", async (event) => {
  if (event.target.id !== "rc-delete-pre") return;
  if (state.role !== ROLE_OWNER || state.simulation || state.demo) return;
  const data = rc.cache[rcMonthKey()];
  if (!data) return;
  const dd = reconcileDays({ dailyDocs: data.daily || {}, bills: data.bills, payments: data.payments, range: { from: data.from, to: data.to } });
  if (!dd.preOpening.length) return;
  const ids = new Set(dd.preOpening.map((b) => b.id));
  const pays = data.payments.filter((p) => ids.has(String(p.billId)));
  if (!window.confirm(`Xoá ${dd.preOpening.length} bill thử trước khai trương (${money(dd.preOpeningTotal)}) và ${pays.length} bản ghi thanh toán của chúng khỏi cloud?\n${dd.preOpening.map((b) => `Bill ${b.billNo} · ${money(b.total)} · ${dateTime(b.openedAt)}`).join("\n")}\nKhông xoá được lại. Máy POS không bị ảnh hưởng (POS đã reset).`)) return;
  const button = event.target; button.disabled = true;
  try {
    const batch = writeBatch(db);
    dd.preOpening.forEach((b) => batch.delete(doc(db, ...root, "bills", b.id)));
    pays.forEach((p) => batch.delete(doc(db, ...root, "payments", String(p.id))));
    await batch.commit();
    state.historyDocs = {}; state.billDetailCache = {};
    await loadRevenueCheck(true);
  } catch (error) { button.disabled = false; window.alert(error.code === "permission-denied" ? "Không có quyền xoá bill trên cloud (cần mở quy tắc Firestore cho chủ quán)." : `Chưa xoá được: ${error.message || error}`); }
});
$("#revenue-check").addEventListener("toggle", (e) => { if (e.target.open) loadRevenueCheck(); });
$("#rc-month").addEventListener("click", (e) => { const k = e.target.closest("[data-rc]")?.dataset.rc; if (!k) return; if (k === "reload") loadRevenueCheck(true); else { rc.month = k; loadRevenueCheck(); } });
/* ---------- Xuất dữ liệu cho AI phân tích (một file Markdown: prompt + bảng CSV) ---------- */
const ai = { scope: "month", text: "", busy: false };
function renderAiScopes() {
  $("#ai-scope").innerHTML = AI_SCOPES.map(([k, label]) => `<button type="button" class="filter${ai.scope === k ? " active" : ""}" data-ai-scope="${k}">${label}</button>`).join("");
}
// Điện thoại chỉ cho mở bảng chia sẻ / ghi clipboard NGAY trong cú bấm: dữ liệu phải tạo sẵn trước khi bấm.
function prepareAi() {
  ai.text = ""; ai.pending = null; ai.version = (ai.version || 0) + 1;
  const v = ai.version;
  setAiButtons(false);
  $("#ai-status").textContent = "Đang chuẩn bị dữ liệu…";
  aiText().then(() => { if (v === ai.version) setAiButtons(true); }).catch((error) => { if (v === ai.version) $("#ai-status").textContent = `Chưa tạo được dữ liệu: ${error.message || error}`; });
}
function setAiButtons(ready) { ["#ai-share", "#ai-copy", "#ai-download"].forEach((id) => { $(id).disabled = !ready; }); }
$("#ai-scope").addEventListener("click", (e) => { const k = e.target.closest("[data-ai-scope]")?.dataset.aiScope; if (!k) return; ai.scope = k; renderAiScopes(); prepareAi(); });
$("#ai-bills").addEventListener("change", prepareAi);
$("#ai-export").addEventListener("toggle", (e) => { if (e.target.open) { renderAiScopes(); if (!ai.text && !ai.busy) prepareAi(); } });
const INITIAL_SET = INITIAL_CATEGORIES;
async function buildAiText() {
  if (state.demo || state.simulation) throw new Error("Đang xem demo / mô phỏng: tắt để xuất số thật.");
  const status = (t) => { $("#ai-status").textContent = t; };
  const now = Date.now();
  if (!state.investment && !state.closingsAll.length) await loadPayback();
  const [fundCloses, shCloses, monthlyAll] = await Promise.all([
    getDocs(collection(db, ...root, "fundClosings")).then(rows).catch(() => []),
    getDocs(collection(db, ...root, "shareholderCloses")).then(rows).catch(() => []),
    getDocs(collection(db, ...root, "dashboardMonthly")).then(rows).catch(() => []),
  ]);
  const closedKeys = [...fundCloses.map((c) => c.monthKey || c.id), ...shCloses.map((c) => c.monthKey || c.id)].filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
  const lastKey = closedKeys[closedKeys.length - 1] || "";
  const lastFund = fundCloses.find((c) => (c.monthKey || c.id) === lastKey);
  const lastSh = shCloses.find((c) => (c.monthKey || c.id) === lastKey);
  const openingMonth = state.investment?.openingMonth || "";
  const scope = scopeRange(ai.scope, { now, lastClosedMonth: lastKey, openingMonth });
  const all = scopeRange("all", { now, openingMonth });
  const dk = (ms) => dateKeyOf(new Date(ms));
  status("Đang đọc số liệu ngày, phiếu chi, dòng tiền…");
  const [daily, receiptsAll, purchasesAll, moves] = await Promise.all([
    getDocs(query(collection(db, ...root, "dashboardDaily"), where("dateKey", ">=", dk(scope.from)), where("dateKey", "<=", dk(now)), limit(800))).then(rows),
    getDocs(query(collection(db, ...root, "expenseReceipts"), where("purchaseDate", ">=", all.from), limit(5000))).then(rows),
    getDocs(query(collection(db, ...root, "purchases"), where("purchasedAt", ">=", all.from), limit(5000))).then(rows).catch(() => []),
    getDocs(query(collection(db, ...root, "financialMovements"), where("occurredAt", ">=", scope.from), limit(3000))).then(rows).catch(() => []),
  ]);
  const live = receiptsAll.filter((r) => reviewStatus(r) !== "NONE");
  const others = otherCostRows(purchasesAll, new Set(receiptsAll.map((r) => String(r.id))));
  // Theo tháng: từ khai trương đến nay, cùng quy tắc với chốt sổ (chỉ phiếu đã duyệt, bỏ ghi chép đầu tư ban đầu).
  const monthKeysAll = []; for (let d = new Date(all.from); d.getTime() <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) monthKeysAll.push(monthKeyOf(d.getTime()));
  const revByMonth = new Map(monthlyAll.map((m) => [m.monthKey || m.id, m]));
  const months = monthKeysAll.map((key) => {
    const inMonth = (ms) => monthKeyOf(Number(ms || 0)) === key;
    const rec = live.filter((r) => countsAsCost(r) && !isInitialReceipt(r) && inMonth(r.purchaseDate));
    const oth = others.filter((c) => inMonth(c.at) && !isInitialCost(c));
    const isInv = (cat) => INVESTMENT_CATEGORIES.has(cat);
    const purchases = rec.filter((r) => !r.expenseCategory || r.expenseCategory === "INVENTORY_PURCHASE").reduce((t, r) => t + Number(r.total || 0), 0);
    const investment = rec.filter((r) => isInv(r.expenseCategory)).reduce((t, r) => t + Number(r.total || 0), 0) + oth.filter((c) => isInv(c.category)).reduce((t, c) => t + c.amount, 0);
    const otherOperating = rec.filter((r) => r.expenseCategory && r.expenseCategory !== "INVENTORY_PURCHASE" && !isInv(r.expenseCategory)).reduce((t, r) => t + Number(r.total || 0), 0) + oth.filter((c) => !isInv(c.category)).reduce((t, c) => t + c.amount, 0);
    const m = revByMonth.get(key);
    const revenue = m && Number.isFinite(Number(m.revenue)) ? Number(m.revenue) : key === monthKeyOf(now) && state.dashboard?.monthRevenue != null ? Number(state.dashboard.monthRevenue) : null;
    return { monthKey: key, revenue, paidBills: m?.paidBills ?? null, purchases, otherOperating, investment, closed: closedKeys.includes(key) };
  });
  const dailyDocs = Object.fromEntries(daily.map((d) => [d.dateKey || d.id, d]));
  const dayList = Object.keys(dailyDocs).sort();
  const items = aggregateItems(dailyDocs, dayList, "combined");
  let bills = [];
  const notes = [];
  if ($("#ai-bills").checked) {
    status("Đang đọc bill…");
    const q = (name, field, from, max) => getDocs(query(collection(db, ...root, name), where(field, ">=", from), where(field, "<", now + 1), limit(max))).then(rows);
    const [billDocs, sessDocs] = await Promise.all([q("bills", "openedAt", scope.from, 6000), q("sessions", "openedAt", scope.from - 86400000, 8000)]);
    const ids = billDocs.filter((b) => b.status === "PAID" || b.status === "REFUNDED").map((b) => String(b.id));
    const pays = (await Promise.all(chunk(ids, 30).map((part) => getDocs(query(collection(db, ...root, "payments"), where("billId", "in", part))).then(rows)))).flat();
    if (!state.historyTables) state.historyTables = await getDocs(collection(db, ...root, "tableStatus")).then(rows).catch(() => []);
    bills = buildBillRows({ bills: billDocs, payments: pays, sessions: sessDocs, tables: state.historyTables || [], refunds: state.refunds, range: { from: scope.from, to: now + 1 } });
    if (billDocs.length >= 6000) notes.push("Bill bị cắt ở 6000 dòng đầu: chọn phạm vi ngắn hơn để đủ.");
  } else notes.push("Không kèm từng bill (người xuất đã bỏ chọn).");
  let reconcile = null;
  if (ai.scope !== "today") {
    status("Đang đối chiếu doanh thu tháng…");
    const key = monthKeyOf(now);
    try {
      if (!rc.cache[key] || now - rc.cache[key].readAt > 5 * 60000) rc.cache[key] = await readMonthBills(key);
      const d = rc.cache[key];
      reconcile = { monthKey: key, ...reconcileRevenue({ snapshot: d.snapshot, bills: d.bills, payments: d.payments, refunds: [...state.refunds, ...state.frozenRefundDocs], range: { from: d.from, to: d.to } }) };
    } catch { notes.push("Không đối chiếu được doanh thu tháng (lỗi đọc bill)."); }
  }
  if (!state.recipesLoaded) { status("Đang đọc menu và công thức…"); await loadRecipes(); }
  const { costs } = currentCosts();
  const cats = new Map((state.menuCats || []).map((c) => [String(c.id), c.name]));
  const menu = (state.menuItems || []).filter((m) => m.active !== false).map((m) => { const lines = recipeLinesFor(m); const r = lines.length ? recipeCost(lines, costs, m.price) : null; return { name: m.name, category: cats.get(String(m.categoryId)) || "", price: Number(m.price || 0), cost: r && !r.missing.length ? Math.round(r.total) : null }; });
  const inScope = (ms) => Number(ms || 0) >= scope.from && Number(ms || 0) <= now;
  const text = buildAiPack({
    now, shopName: "Quán cà phê 0210", scope,
    lastClose: lastKey ? { monthKey: lastKey, savedAt: Number(lastFund?.savedAt || lastSh?.closedAt || lastSh?.updatedAt || 0), distributable: lastFund ? Number(lastFund.distributable) : NaN } : null,
    months, daily: dayList.map((k) => dailyDocs[k]), items, bills,
    receipts: live.filter((r) => inScope(r.purchaseDate)).map((r) => ({ at: Number(r.purchaseDate || 0), code: receiptCode(r), kind: isInitialReceipt(r) ? "INITIAL_RECORD" : kindOf(r), payer: r.enteredByName || "", fund: r.fundSource || "", review: reviewStatus(r), reimb: reimbursementStatus(r), total: Number(r.total || 0), content: [(r.items || []).map((i) => `${i.materialName}${i.qty ? ` ${i.qty}${i.unit || ""}` : ""}`).join("; "), r.note].filter(Boolean).join(" · ") })),
    otherCosts: others.filter((c) => inScope(c.at) && !isInitialCost(c)),
    movements: moves.filter((m) => inScope(m.occurredAt)).map((m) => ({ at: Number(m.occurredAt), type: m.type, who: m.counterpartyName || "", amount: Number(m.amount || 0), note: m.note || "" })),
    closings: fundCloses.map((c) => ({ ...c, monthKey: c.monthKey || c.id })),
    payback: currentPayback(), menu,
    partners: state.profitPartners.filter((p) => p.active !== false).map((p) => ({ name: p.name, percent: Number(p.shareBasisPoints || 0) / 100 })),
    notes, reconcile,
  });
  status(`Đã tạo: ${scope.label} · ${dayList.length} ngày · ${items.length} món · ${bills.length} bill · ${live.filter((r) => inScope(r.purchaseDate)).length} phiếu chi · ${(text.length / 1024).toFixed(0)} KB.`);
  return text;
}
async function aiText() {
  if (ai.text) return ai.text;
  if (ai.pending) return ai.pending;
  const v = ai.version;
  ai.busy = true;
  ai.pending = buildAiText().then((t) => { if (v === ai.version) ai.text = t; return t; }).finally(() => { ai.busy = false; ai.pending = null; });
  return ai.pending;
}
// Chrome Android chỉ cho chia sẻ file thuộc danh sách đuôi cho phép (.txt có, .md KHÔNG): dùng .txt.
const aiFileName = () => `POS0210-AI-${ai.scope}-${dateKeyOf(new Date())}.txt`;
function aiAction(kind) {
  const text = ai.text;
  if (!text) { if (!ai.busy) prepareAi(); $("#ai-status").textContent = "Đang chuẩn bị dữ liệu, chờ vài giây rồi bấm lại."; return; }
  const fallback = (why) => { downloadFile(aiFileName(), "text/plain;charset=utf-8", text); $("#ai-status").textContent = `${why} Đã tải file ${aiFileName()}: mở app AI và đính kèm file này.`; };
  if (kind === "download") { downloadFile(aiFileName(), "text/plain;charset=utf-8", text); return; }
  if (kind === "copy") {
    const done = () => flashNote("Đã sao chép. Mở app AI và dán vào ô chat.");
    const legacy = () => { const t = Object.assign(document.createElement("textarea"), { value: text }); t.style.position = "fixed"; t.style.opacity = "0"; document.body.append(t); t.select(); const ok = document.execCommand("copy"); t.remove(); if (ok) done(); else fallback("Trình duyệt không cho sao chép."); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, legacy); else legacy();
    return;
  }
  // Gọi share đồng bộ trong cú bấm (không await gì trước đó).
  const file = new File([text], aiFileName(), { type: "text/plain" });
  let p = null;
  try {
    if (navigator.canShare?.({ files: [file] })) p = navigator.share({ files: [file], title: "Dữ liệu quán 0210", text: "Phân tích giúp tôi theo hướng dẫn trong file." });
    else if (navigator.share) p = navigator.share({ title: "Dữ liệu quán 0210", text });
  } catch (error) { p = Promise.reject(error); }
  if (!p) { fallback("Trình duyệt này không chia sẻ trực tiếp được."); return; }
  p.catch((error) => { if (error?.name !== "AbortError") fallback(`Không mở được bảng chia sẻ (${error.message || error}).`); });
}
$("#ai-share").addEventListener("click", () => aiAction("share"));
$("#ai-copy").addEventListener("click", () => aiAction("copy"));
$("#ai-download").addEventListener("click", () => aiAction("download"));
/* ---------- Vốn đầu tư ban đầu (một con số, config/investment) & hoàn vốn ---------- */
async function loadPayback() {
  if (state.demo || state.simulation) return;
  try { const c = await getDoc(doc(db, ...root, "config", "investment")); state.investment = c.exists() ? c.data() : null; } catch { state.investment = null; }
  try { state.closingsAll = rows(await getDocs(collection(db, ...root, "fundClosings"))); } catch { state.closingsAll = []; }
  renderPayback(); renderCumulativeSummary(); renderMonthlyReport(); renderTransactions(); renderPeriodSummary();
}
function currentPayback() {
  const report = currentMonthReport();
  const cur = report[report.length - 1];
  const net = cur && cur.revenue !== null ? cur.revenue - cur.purchases - cur.otherExpenses : null;
  return paybackStatus({ initial: state.investment?.amount, closings: state.closingsAll.map((c) => ({ monthKey: c.monthKey || c.id, net: c.net })), current: net === null ? null : { monthKey: cur.monthKey, net }, openingMonth: state.investment?.openingMonth || "" });
}
function renderPayback() {
  const host = $("#payback-view");
  if (!host) return;
  const p = currentPayback();
  const inv = state.investment || {};
  const owner = state.role === ROLE_OWNER;
  ["#invest-amount", "#invest-opening", "#invest-note"].forEach((id) => { $(id).disabled = !owner; });
  $("#invest-save").hidden = !owner;
  if (document.activeElement?.id?.startsWith("invest-") !== true) {
    $("#invest-amount").value = inv.amount || ""; $("#invest-opening").value = inv.openingMonth || ""; $("#invest-note").value = inv.note || "";
  }
  $("#invest-note-line").textContent = inv.amount ? `Đã lưu ${money(inv.amount)}${inv.setBy ? ` · ${inv.setBy}` : ""}${inv.setAt ? ` · ${dateTime(inv.setAt)}` : ""}${owner ? "" : " · chỉ chủ quán sửa"}` : owner ? "Chưa nhập vốn ban đầu." : "Chủ quán chưa nhập vốn ban đầu.";
  $("#payback-summary").textContent = p.set ? `· đã thu hồi ${p.percent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` : "· chưa nhập";
  const row = (a, b, cls = "") => `<tr class="${cls}"><td>${a}</td><td>${b}</td></tr>`;
  host.innerHTML = `<table class="fund-table"><tbody>
    ${row("Vốn đầu tư ban đầu", p.set ? money(p.initial) : "chưa nhập", "total")}
    ${p.months.map((m) => row(`${monthLabel(m.monthKey)}${m.saved ? "" : " · tạm tính"}`, money(m.net), "sub")).join("")}
    ${row("Đã thu hồi (luỹ kế)", money(p.recovered), "total")}
    ${p.set ? row("Còn phải thu hồi", money(p.remaining), "total") : ""}
    ${p.set ? row("Tiến độ", `${p.percent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`) : ""}
    ${p.set && p.monthsLeft !== null ? row("Ước tính còn", p.monthsLeft === 0 ? "đã hoàn vốn" : `~${Math.ceil(p.monthsLeft)} tháng (theo TB ${money(Math.round(p.avg))}/tháng)`) : ""}
  </tbody></table>${(() => { const key = monthKeyOf(Date.now()); const pend = state.expenseReceipts.filter((r) => reviewStatus(r) === "PENDING" && !isInitialReceipt(r) && monthKeyOf(Number(r.purchaseDate || 0)) === key); const amt = pend.reduce((t, r) => t + Number(r.total || 0), 0); const paid = pend.filter(isPaidOut); return pend.length ? `<p class="warn-text">⚠ Còn ${pend.length} phiếu chờ duyệt tháng này (${money(amt)}) chưa trừ vào số đã thu hồi${paid.length ? `; trong đó ${paid.length} phiếu ĐÃ HOÀN TIỀN (${money(paid.reduce((t, r) => t + Number(r.total || 0), 0))}): tiền đã ra khỏi quỹ nhưng chưa tính chi phí, nên số này đang cao hơn quỹ thực tế đúng bằng khoản đó` : ""}. Duyệt xong là khớp.</p>` : ""; })()}${p.months.some((m) => m.saved) ? "" : '<p class="muted">Chưa có tháng nào lưu đối soát: số đã thu hồi đang là tạm tính của tháng này. Cuối tháng lưu đối soát ở mục bên dưới để số được cố định.</p>'}`;
}
$("#payback-panel").addEventListener("toggle", (e) => { if (e.target.open) loadPayback(); });
$("#invest-save").addEventListener("click", async () => {
  if (state.role !== ROLE_OWNER) return;
  if (state.demo || state.simulation) { $("#invest-note-line").textContent = "Đang xem demo / mô phỏng: tắt để lưu số thật."; return; }
  const amount = Math.round(Number($("#invest-amount").value) || 0);
  if (amount <= 0) { $("#invest-note-line").textContent = "Nhập số vốn lớn hơn 0."; return; }
  const payload = { amount, openingMonth: $("#invest-opening").value || "", note: $("#invest-note").value.trim(), setBy: myName(), setAt: Date.now() };
  try { await setDoc(doc(db, ...root, "config", "investment"), payload); state.investment = payload; $("#invest-amount").blur(); renderPayback(); renderCumulativeSummary(); renderMonthlyReport(); renderTransactions(); renderPeriodSummary(); flashNote("Đã lưu vốn đầu tư ban đầu."); }
  catch (error) { $("#invest-note-line").textContent = `Chưa lưu được: ${error.message}`; }
});
/* ---------- Đối soát quỹ & chia tiền cổ đông theo tháng (fundClosings/{YYYY-MM}) ---------- */
const fundState = { key: "", receipts: [], movements: [], others: [], saved: null, prevSaved: null, loading: false, error: "" };
function fundMonthOptions() {
  const keys = lastMonthKeys(13).reverse();
  $("#fund-month").replaceChildren(...keys.map((k) => new Option(`Tháng ${Number(k.slice(5))}/${k.slice(0, 4)}`, k)));
  if (!fundState.key) fundState.key = keys[0];
  $("#fund-month").value = fundState.key;
}
async function loadFundMonth() {
  if (!state.role || state.demo || state.simulation) { $("#fund-note").textContent = state.demo || state.simulation ? "Đang xem demo / mô phỏng: tắt để đối soát số thật." : ""; return; }
  const key = fundState.key;
  const { from, to } = monthRange(key);
  fundState.loading = true; fundState.error = "";
  $("#fund-note").textContent = "Đang đọc số liệu tháng…";
  try {
    const [rec, mov, pur, saved, prev] = await Promise.all([
      getDocs(query(collection(db, ...root, "expenseReceipts"), where("purchaseDate", ">=", from), where("purchaseDate", "<", to), limit(1500))).then(rows),
      getDocs(query(collection(db, ...root, "financialMovements"), where("occurredAt", ">=", from), where("occurredAt", "<", to), limit(500))).then(rows),
      getDocs(query(collection(db, ...root, "purchases"), where("purchasedAt", ">=", from), where("purchasedAt", "<", to), limit(800))).then(rows),
      getDoc(doc(db, ...root, "fundClosings", key)),
      getDoc(doc(db, ...root, "fundClosings", prevMonthKey(key))),
    ]);
    fundState.receipts = rec;
    fundState.movements = mov;
    fundState.others = otherCostRows(pur, new Set(rec.map((r) => String(r.id))));
    fundState.saved = saved.exists() ? saved.data() : null;
    fundState.prevSaved = prev.exists() ? prev.data() : null;
    const s = fundState.saved;
    const prevClose = fundState.prevSaved ? (fundState.prevSaved.actual ?? fundState.prevSaved.expected) : null;
    $("#fund-opening").value = s ? s.opening : (prevClose ?? 0);
    $("#fund-cash").value = s?.cashCounted ?? "";
    $("#fund-bank").value = s?.bankBalance ?? "";
    $("#fund-reserve").value = s?.reserve ?? 0;
  } catch (error) { fundState.error = error.message || "lỗi không rõ"; }
  fundState.loading = false;
  renderFundMonth();
}
function currentFund() {
  const key = fundState.key;
  const revenueDoc = state.monthlyDocs[key];
  const owedPool = [...fundState.receipts, ...state.openReceipts.filter((r) => !fundState.receipts.some((x) => x.id === r.id))];
  const num = (id) => { const v = $(id).value; return v === "" ? null : Number(v); };
  return { hasRevenue: Boolean(revenueDoc), result: fundMonth({ monthKey: key, revenue: revenueDoc ? Number(revenueDoc.revenue || 0) : 0, receipts: owedPool, otherPurchases: fundState.others, movements: fundState.movements, opening: num("#fund-opening") || 0, cashCounted: num("#fund-cash"), bankBalance: num("#fund-bank"), reserve: num("#fund-reserve") || 0, partners: state.profitPartners }) };
}
function renderFundMonth() {
  const host = $("#fund-result");
  if (!host || !fundState.key) return;
  if (fundState.error) { $("#fund-note").textContent = `Không đọc được: ${fundState.error}`; host.innerHTML = ""; return; }
  const { hasRevenue, result: f } = currentFund();
  const notes = [];
  if (!hasRevenue) notes.push("Chưa có số chốt doanh thu tháng này từ máy POS (đang tính doanh thu = 0).");
  if (f.pending.count) notes.push(`⚠ Còn ${f.pending.count} phiếu chờ duyệt (${money(f.pending.total)}) chưa tính vào chi phí: duyệt xong rồi mới chốt.`);
  if (f.rejected.count) notes.push(`⚠ ${f.rejected.count} phiếu bị trả lại (${money(f.rejected.total)}) chưa tính: người nhập cần sửa hoặc huỷ.`);
  if (!f.partnersConfigured) notes.push("Chưa cấu hình tỷ lệ chia trên máy POS: tạm chia đôi 50/50.");
  if (fundState.saved) notes.push(`Đã lưu lúc ${dateTime(fundState.saved.savedAt)} bởi ${fundState.saved.savedBy || "—"}.`);
  $("#fund-note").textContent = notes.join(" ");
  const row = (label, value, cls = "") => `<tr class="${cls}"><td>${label}</td><td>${value}</td></tr>`;
  const signed = (v) => `${v < 0 ? "−" : ""}${money(Math.abs(v))}`;
  host.innerHTML = `<table class="fund-table"><tbody>
    ${row("<strong>1. Lợi nhuận tháng</strong>", "")}
    ${row("Tiền thu bán hàng (tiền mặt + CK)", money(f.revenue), "sub")}
    ${row("− Chi vận hành (phiếu đã duyệt)", signed(-f.operating), "sub")}
    ${row("− Đầu tư bổ sung", signed(-f.investment), "sub")}
    ${row("= Dòng tiền ròng (khớp báo cáo tháng trên POS)", signed(f.net), "total")}
    ${row("<strong>2. Quỹ cuối kỳ</strong>", "")}
    ${row("Quỹ đầu kỳ", money(f.opening), "sub")}
    ${row("+ Doanh thu tháng", money(f.revenue), "sub")}
    ${row("− Chi bằng quỹ quán", signed(-f.fromFund), "sub")}
    ${row("− Hoàn ứng đã trả", signed(-f.reimbursed), "sub")}
    ${f.moveIn ? row("+ Góp vốn / thu khác", money(f.moveIn), "sub") : ""}
    ${f.withdrawn ? row("− Rút vốn / rút lợi nhuận", signed(-f.withdrawn), "sub") : ""}
    ${row("= Quỹ phải có", signed(f.expected), "total")}
    ${f.actual !== null ? row("Thực tế (tiền mặt + TK)", money(f.actual), "sub") + row("Chênh lệch", `<span class="${f.diff ? "warn-text" : ""}">${signed(f.diff)}</span>`, "sub") : row("Thực tế", '<span class="muted">nhập tiền mặt + số dư TK</span>', "sub")}
    ${row("<strong>3. Tiền có thể chia</strong>", "")}
    ${row(`${f.actual !== null ? "Quỹ thực tế" : "Quỹ phải có"}`, signed(f.actual ?? f.expected), "sub")}
    ${row(`− Còn nợ hoàn ứng (${f.owedCount} phiếu đã duyệt, chưa hoàn)`, signed(-f.owedTotal), "sub")}
    ${row("− Giữ lại làm vốn", signed(-f.reserve), "sub")}
    ${row("= Có thể chia", signed(f.distributable), "total")}
    ${f.shares.map((s) => row(`${escapeHtml(s.name)} · ${s.percent}%`, money(s.amount), "sub")).join("")}
  </tbody></table>${Math.abs(f.mismatch) > 0 ? `<p class="muted">Có thể chia khác dòng tiền ròng ${signed(f.mismatch)}: do quỹ đầu kỳ, vốn giữ lại, chênh lệch thực tế hoặc phiếu chi cá nhân tháng trước mới hoàn tháng này.</p>` : '<p class="muted">Có thể chia khớp dòng tiền ròng.</p>'}`;
}
$("#fund-close").addEventListener("toggle", (e) => { if (e.target.open) { fundMonthOptions(); loadFundMonth(); } });
$("#fund-month").addEventListener("change", (e) => { fundState.key = e.target.value; loadFundMonth(); });
["#fund-opening", "#fund-cash", "#fund-bank", "#fund-reserve"].forEach((id) => $(id).addEventListener("input", renderFundMonth));
$("#fund-save").addEventListener("click", async () => {
  if (!canTreasure(state.role)) return;
  const { result: f } = currentFund();
  const payload = { monthKey: fundState.key, opening: f.opening, cashCounted: $("#fund-cash").value === "" ? null : Number($("#fund-cash").value), bankBalance: $("#fund-bank").value === "" ? null : Number($("#fund-bank").value), reserve: f.reserve, revenue: f.revenue, operating: f.operating, investment: f.investment, net: f.net, expected: f.expected, actual: f.actual, diff: f.diff, owedTotal: f.owedTotal, distributable: f.distributable, shares: f.shares, pendingCount: f.pending.count, savedBy: myName(), savedAt: Date.now() };
  try { await setDoc(doc(db, ...root, "fundClosings", fundState.key), payload); fundState.saved = payload; state.closingsAll = [...state.closingsAll.filter((c) => (c.monthKey || c.id) !== payload.monthKey), payload]; renderFundMonth(); renderPayback(); flashNote(`Đã lưu đối soát tháng ${Number(fundState.key.slice(5))}.`); }
  catch (error) { $("#fund-note").textContent = `Chưa lưu được: ${error.message}`; }
});

/* ---------- Tải phiếu cũ hơn 7 ngày khi chọn kỳ xem xa hơn (tối đa 500 phiếu) ---------- */
async function ensureReceiptsLoaded() {
  const range = rangeForPeriod();
  const from = Number.isFinite(range.from) ? Math.max(range.from, 0) : 0;
  if (!state.user || state.simulation || state.demo || from >= state.receiptsFrom) return;
  try {
    const snap = await getDocs(query(collection(db, ...root, "expenseReceipts"), where("purchaseDate", ">=", from), orderBy("purchaseDate", "desc"), limit(500)));
    const fetched = rows(snap);
    const ids = new Set(fetched.map((r) => r.id));
    state.expenseReceipts = [...fetched, ...state.expenseReceipts.filter((r) => !ids.has(r.id))];
    state.receiptsFrom = from;
    render();
  } catch (error) { $("#sync-status").textContent = `Không tải được phiếu cũ: ${error.message}`; }
}


/* ---------- Đơn đặt món online (khách đặt qua trang web-order; nhân viên xử lý ở đây) ---------- */
const OO_SITE_DEFAULT = "https://datmon0210.web.app/";
const ooCust = new Map(); // sđt -> { loading, profile, open }
const oo = { orders: [], unsub: null, shop: null, seen: null, clockOffset: 0, timer: null, error: "", busy: new Set(), loaded: false };
const ooNow = () => Date.now() + oo.clockOffset;
const ooSiteUrl = () => (oo.shop?.siteUrl || OO_SITE_DEFAULT).replace(/\/?$/, "/");

async function syncOoClock() {
  try {
    const started = Date.now();
    const response = await fetch(`${location.pathname}?_=${started}`, { method: "HEAD", cache: "no-store" });
    const header = response.headers.get("date");
    const server = header ? new Date(header).getTime() : NaN;
    if (Number.isFinite(server)) oo.clockOffset = server - (started + Date.now()) / 2;
  } catch { /* giữ giờ máy */ }
}

function startOnlineOrders() {
  if (oo.unsub || !state.role) return;
  syncOoClock();
  loadOnlineShop();
  oo.seen = null;
  const since = Timestamp.fromMillis(Date.now() - 48 * 3_600_000);
  oo.unsub = onSnapshot(
    query(collection(db, ...root, "online_orders"), where("createdAt", ">=", since)),
    (snap) => {
      countUsage("reads", Math.max(1, snap.docChanges().length));
      oo.orders = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      oo.error = "";
      oo.loaded = true;
      if (oo.seen === null) oo.seen = new Set(oo.orders.map((o) => o.id)); // đơn có sẵn lúc mở trang: không phát chuông
      const fresh = newOrderCodes(oo.orders, oo.seen);
      if (fresh.length) { fresh.forEach((c) => oo.seen.add(c)); ooBeep(); }
      renderOnline();
      sweepOverdue();
    },
    (error) => { oo.error = error.code === "permission-denied" ? "Chưa có quyền đọc đơn online: hãy dán rules đặt món vào Firestore (xem hướng dẫn)." : (error.message || "lỗi không rõ"); renderOnline(); },
  );
  oo.timer = setInterval(() => { if (!document.hidden) { renderOnline(); sweepOverdue(); } }, 10_000);
}

function stopOnlineOrders() {
  if (oo.unsub) { oo.unsub(); oo.unsub = null; }
  if (oo.timer) { clearInterval(oo.timer); oo.timer = null; }
  oo.orders = []; oo.loaded = false; oo.seen = null;
  const badge = $("#donline-badge"); if (badge) badge.hidden = true;
}

async function loadOnlineShop() {
  try { const snap = await rawGetDoc(doc(db, ...root, "online_config", "shop")); oo.shop = snap.exists() ? snap.data() : {}; }
  catch { oo.shop = oo.shop || {}; }
  // Tài khoản nhận tiền lấy từ app POS (config/safe: bank_name, bank_account, bank_holder). POS đổi tài khoản thì trang đặt món tự theo.
  if (canTreasure(state.role)) {
    try {
      const safe = await rawGetDoc(doc(db, ...root, "config", "safe"));
      const v = safe.exists() ? safe.data() : {};
      const bank = String(v.bank_name || "").trim(), account = String(v.bank_account || "").trim(), holder = String(v.bank_holder || "").trim();
      const cur = oo.shop || {};
      if (bank && account && holder && (cur.bank !== bank || cur.account !== account || cur.holder !== holder)) {
        await setDoc(doc(db, ...root, "online_config", "shop"), { bank, account, holder, bankFromPos: true, updatedAt: Date.now(), updatedBy: myName() }, { merge: true });
        oo.shop = { ...cur, bank, account, holder, bankFromPos: true };
      }
    } catch { /* không đọc được cấu hình POS: giữ thông tin đang có, vẫn nhập tay được */ }
  }
  renderOnline();
}

function ooBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [[880, 0], [1175, 0.22], [880, 0.44]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.value = freq; osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.2);
      osc.connect(gain).connect(ctx.destination); osc.start(ctx.currentTime + at); osc.stop(ctx.currentTime + at + 0.22);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch { /* trình duyệt chặn âm thanh khi chưa chạm vào trang */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

const toFirestorePatch = (patch) => Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, /At$/.test(k) && typeof v === "number" ? Timestamp.fromMillis(v) : v]));

/** Đổi trạng thái đơn trong MỘT transaction: đọc lại đơn (tránh hai nhân viên bấm cùng lúc) và trừ bộ đếm giới hạn khi đóng đơn. */
async function applyOnlineAction(order, action, { reason = "", auto = false } = {}) {
  const key = `${order.id}:${action}`;
  if (oo.busy.has(order.id)) return;
  oo.busy.add(order.id);
  try {
    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, ...root, "online_orders", order.id);
      const snap = await tx.get(orderRef);
      if (!snap.exists()) throw new Error("Đơn không còn tồn tại.");
      const current = { ...snap.data(), id: snap.id };
      const t = buildTransition(current, action, { now: ooNow(), who: state.me?.name || "", reason });
      const limitRefs = t.releasesLimit ? limitKeys(current).map((k) => doc(db, ...root, "online_limits", k)) : [];
      const limitSnaps = [];
      for (const ref of limitRefs) limitSnaps.push(await tx.get(ref));
      tx.update(orderRef, toFirestorePatch(t.patch));
      limitSnaps.forEach((ls, i) => { if (ls.exists()) tx.update(limitRefs[i], { pending: releasedCount(ls.data()) }); });
    });
    $("#oo-note").textContent = "";
  } catch (error) {
    if (!auto) $("#oo-note").textContent = `Không cập nhật được đơn ${order.code}: ${error.message || error}`;
  } finally { oo.busy.delete(order.id); renderOnline(); }
}

/** Chỉ chủ quán: xoá hẳn đơn online (dùng để dọn đơn thử). Nếu đơn còn đang chờ thì trả lại lượt giới hạn trước khi xoá. Không đụng tới bill/doanh thu của POS. */
async function deleteOnlineOrder(order) {
  if (state.role !== ROLE_OWNER) return false;
  await runTransaction(db, async (tx) => {
    const orderRef = doc(db, ...root, "online_orders", order.id);
    const snap = await tx.get(orderRef);
    if (!snap.exists()) return;
    const current = { ...snap.data(), id: snap.id };
    const refs = isPending(current) ? limitKeys(current).map((k) => doc(db, ...root, "online_limits", k)) : [];
    const limitSnaps = [];
    for (const ref of refs) limitSnaps.push(await tx.get(ref));
    tx.delete(orderRef);
    limitSnaps.forEach((ls, i) => { if (ls.exists()) tx.update(refs[i], { pending: releasedCount(ls.data()) }); });
  });
  return true;
}

function sweepOverdue() {
  for (const order of overdueOrders(oo.orders, ooNow())) applyOnlineAction(order, "expire", { auto: true });
}


function ooCustHtml(order) {
  const phone = String(order.phone || "");
  const c = ooCust.get(phone);
  if (!c) return "";
  if (c.loading) return `<div class="oo-cust"><span class="muted">Đang tải hồ sơ khách…</span></div>`;
  if (c.error) return `<div class="oo-cust"><span class="muted">Không tải được hồ sơ khách: ${escapeHtml(c.error)}</span></div>`;
  const p = buildProfile(phone, c.orders, c.note, order.code || order.id, 8);
  const fav = p.favorites.length ? `<p>Hay gọi: ${p.favorites.map(([n, q]) => `${escapeHtml(n)} (${q})`).join(", ")}</p>` : "";
  const hist = c.open && p.history.length ? `<ul class="oo-cust-hist">${p.history.map((h) => `<li><b>${escapeHtml(dayLabel(dayKeyVN(h.at)))} · ${money(h.total)}</b> <small>${escapeHtml(h.items.map((l) => `${Number(l.qty)}× ${String(l.name || "").trim()}`).join(", "))}</small></li>`).join("")}</ul>` : "";
  return `<div class="oo-cust"><p><b>${escapeHtml(profileHeadline(p, money))}</b></p>${fav}
    <p class="oo-cust-note">${p.note ? `<b>Ghi chú sở thích:</b> ${escapeHtml(p.note)}` : '<span class="muted">Chưa có ghi chú sở thích.</span>'}</p>${hist}
    <p class="oo-cust-btns">${p.history.length ? `<button type="button" class="secondary" data-oo-hist="${escapeHtml(phone)}">${c.open ? "Ẩn lịch sử" : "Xem lịch sử mua"}</button>` : ""}<button type="button" class="secondary" data-oo-cnote="${escapeHtml(phone)}" data-oo-cname="${escapeHtml(order.name || "")}">${p.note ? "Sửa" : "Thêm"} ghi chú</button></p></div>`;
}

async function ooLoadCustomer(phone) {
  if (!phone || ooCust.has(phone)) return;
  ooCust.set(phone, { loading: true });
  try {
    const [os, ns] = await Promise.all([
      rawGetDocs(query(collection(db, ...root, "online_orders"), where("phone", "==", phone), limit(100))),
      rawGetDoc(doc(db, ...root, "customerNotes", phone)),
    ]);
    countUsage("reads", os.size + 1);
    ooCust.set(phone, { orders: os.docs.map((d) => ({ ...d.data(), id: d.id })), note: ns.exists() ? ns.data() : null, open: false });
  } catch (error) {
    ooCust.set(phone, { error: String(error.message || error) });
  }
  renderOnline();
}

function ooCardHtml(order, now) {
  const created = ooToMillis(order.createdAt);
  const items = (order.items || []).map((l) => `<li><span>${Number(l.qty)}× ${escapeHtml(String(l.name || "").trim())}${l.note ? `<small>${escapeHtml(l.note)}</small>` : ""}</span><b>${money(Number(l.price) * Number(l.qty))}</b></li>`).join("");
  const where = order.mode === "delivery" ? `Giao tận nơi: ${escapeHtml(order.address || "")}` : order.mode === "dinein" ? `Tại quán · bàn ${escapeHtml(order.table || "")}` : "Mang đi";
  const expires = ooToMillis(order.expiresAt);
  let extra = "";
  if (order.status === "awaiting_payment" && expires) {
    const left = expires - now;
    extra = left > 0 ? `<span class="oo-countdown">Còn ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}</span>` : `<span class="oo-countdown">Quá hạn thanh toán</span>`;
  }
  if (order.status === "cancelled") extra = `<span class="muted">Khách tự huỷ. Nếu đã nhận tiền thì bấm ghi nhận hoặc hoàn lại cho khách.</span>`;
  if (order.status === "rejected" && order.rejectReason) extra = `<span class="muted">Lý do: ${escapeHtml(order.rejectReason)}</span>`;
  const phone = String(order.phone || "");
  const buttons = nextActions(order, now).map((a, i) => `<button type="button" class="${i === 0 ? "main" : ""}" data-oo-act="${a.key}" data-oo-id="${escapeHtml(order.id)}"${oo.busy.has(order.id) ? " disabled" : ""}>${escapeHtml(a.label)}</button>`).join("");
  return `<article class="oo-card s-${escapeHtml(order.status)}" data-oo="${escapeHtml(order.id)}">
    <div class="oo-head"><span class="oo-code">${escapeHtml(order.code || order.id)}</span><span class="oo-status">${escapeHtml(OO_LABELS[order.status] || order.status)}</span><span class="oo-time">${escapeHtml(minutesAgoText(created, now))}</span></div>
    <p class="oo-who"><b>${escapeHtml(order.name || "")}</b> · <a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></p>
    ${ooCustHtml(order)}
    <p class="oo-mode">${escapeHtml(OO_MODE_LABELS[order.mode] || "")}${order.mode === "pickup" ? "" : ` · ${where}`}</p>
    <ul class="oo-items">${items}</ul>
    ${order.note ? `<p class="oo-note-line"><b>Ghi chú:</b> ${escapeHtml(order.note)}</p>` : ""}
    <div class="oo-foot"><strong>${money(order.total)}</strong>${extra}${buttons}${state.role === ROLE_OWNER ? `<button type="button" class="oo-del" data-oo-del="${escapeHtml(order.id)}"${oo.busy.has(order.id) ? " disabled" : ""}>Xoá đơn</button>` : ""}</div>
  </article>`;
}

/* ---------- Thống kê lượt truy cập trang đặt món ---------- */
const ooStats = { days: 1, docs: [], orders: [], loaded: false, loading: false };
async function loadOoStats() {
  if (!state.role || ooStats.loading) return;
  ooStats.loading = true;
  $("#oo-stats-note").textContent = "Đang tải…";
  try {
    const [statSnap, orderSnap] = await Promise.all([
      getDocs(query(collection(db, ...root, "online_stats"), where("__name__", ">=", dayKeyVN(Date.now() - 45 * 86_400_000)), limit(60))),
      getDocs(query(collection(db, ...root, "online_orders"), where("createdAt", ">=", Timestamp.fromMillis(Date.now() - 32 * 86_400_000)))),
    ]);
    countUsage("reads", statSnap.size + orderSnap.size);
    ooStats.docs = statSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
    ooStats.orders = orderSnap.docs.map((d) => d.data());
    ooStats.loaded = true;
    $("#oo-stats-note").textContent = "";
  } catch (error) {
    $("#oo-stats-note").textContent = error.code === "permission-denied" ? "Chưa có quyền đọc thống kê (online_stats): cần cập nhật Firestore Rules." : `Không tải được: ${error.message || error}`;
  } finally { ooStats.loading = false; }
  renderOoStats();
}
function renderOoStats() {
  const host = $("#oo-stats-body");
  if (!host) return;
  if (!ooStats.loaded) { host.innerHTML = ""; return; }
  const { rows, total, hours } = buildStats(ooStats.docs, ooStats.orders, Date.now(), ooStats.days);
  const steps = funnelSteps(total);
  const top = Math.max(1, steps[0].value);
  const funnel = `<div class="st-funnel">${steps.map((x, i) => `<div class="st-step"><div class="st-step-head"><span>${escapeHtml(x.label)}</span><b>${x.value.toLocaleString("vi-VN")}</b></div><div class="st-bar"><i style="width:${Math.round((x.value / top) * 100)}%"></i></div>${i ? `<small>${pct(x.ofVisit)} so với lượt vào · giữ lại ${pct(x.ofPrev)} so với bước trước</small>` : `<small>${total.device.toLocaleString("vi-VN")} thiết bị khác nhau (mỗi thiết bị tính 1 lần mỗi ngày)</small>`}</div>`).join("")}</div>`;
  const maxH = Math.max(1, ...hours);
  const hourChart = total.visit ? `<p class="reimb-sub">Lượt vào theo giờ (giờ Việt Nam)</p><div class="st-hours" aria-label="Lượt vào theo giờ">${hours.map((n, h) => `<i style="height:${Math.round((n / maxH) * 100)}%" title="${h}h: ${n} lượt"></i>`).join("")}</div><div class="st-hours-axis"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>` : "";
  const perDay = ooStats.days > 1 ? `<p class="reimb-sub">Theo ngày</p><div class="st-scroll"><table class="st-table"><thead><tr><th>Ngày</th><th>Vào</th><th>Menu</th><th>Thêm</th><th>Giỏ</th><th>Gửi</th><th>Đơn</th><th>Trả tiền</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${dayLabel(r.day)}</td><td>${r.visit}</td><td>${r.menu}</td><td>${r.add}</td><td>${r.cart}</td><td>${r.submit}</td><td>${r.created}</td><td>${r.paid}</td></tr>`).join("")}</tbody></table></div>` : "";
  const empty = total.visit === 0 ? '<p class="muted">Chưa có lượt truy cập nào trong khoảng này. Bộ đếm chỉ bắt đầu tính từ khi trang đặt món được cập nhật.</p>' : "";
  host.innerHTML = funnel + empty + hourChart + perDay + '<p class="muted">Mỗi cấp chỉ đếm 1 lần cho mỗi lượt truy cập (tải lại trang không tính thêm). "Đơn gửi được" và "Đã thanh toán" lấy từ đơn thật, đã bỏ đơn kiểm thử.</p>';
}
$("#oo-stats-fold")?.addEventListener("toggle", (event) => { if (event.target.open && !ooStats.loaded) loadOoStats(); });
$("#oo-stats-range")?.addEventListener("click", (event) => {
  const b = event.target.closest("button"); if (!b) return;
  if (b.id === "oo-stats-reload") { loadOoStats(); return; }
  ooStats.days = Number(b.dataset.days) || 1;
  $("#oo-stats-range").querySelectorAll("[data-days]").forEach((x) => x.classList.toggle("active", x === b));
  renderOoStats();
});
function renderOnline() {
  const badge = $("#donline-badge");
  const now = ooNow();
  const count = attentionCount(oo.orders, now);
  if (badge) { badge.hidden = !count; badge.textContent = String(count); }
  const toggle = $("#oo-toggle");
  if (!toggle) return;
  const enabled = oo.shop?.orderingEnabled !== false;
  toggle.textContent = oo.shop === null ? "Đang tải…" : enabled ? "Đang NHẬN đơn online (bấm để tạm ngưng)" : "Đang TẠM NGƯNG nhận đơn (bấm để mở lại)";
  toggle.className = `secondary ${oo.shop === null ? "" : enabled ? "on" : "off"}`;
  const site = ooSiteUrl();
  $("#oo-link-line").innerHTML = `Link khách: <a href="${escapeHtml(site)}" target="_blank" rel="noopener">${escapeHtml(site.replace(/^https?:\/\//, ""))}</a> · <a href="${escapeHtml(site)}qr.html" target="_blank" rel="noopener">Mã QR để in</a>`;
  const host = $("#oo-list");
  if (oo.error) { host.innerHTML = `<p class="warn-text">${escapeHtml(oo.error)}</p>`; return; }
  if (!oo.loaded) { host.innerHTML = '<p class="muted">Đang tải đơn…</p>'; return; }
  const g = groupOrders(oo.orders, now);
  const section = (title, list) => list.length ? `<h3 class="oo-group-title">${title} (${list.length})</h3>${list.map((o) => ooCardHtml(o, now)).join("")}` : "";
  for (const o of [...g.needAction, ...g.awaiting, ...g.making]) ooLoadCustomer(String(o.phone || ""));
  const clean = $("#oo-clean"); if (clean) clean.hidden = state.role !== ROLE_OWNER;
  const bulk = state.role === ROLE_OWNER && oo.orders.length ? `<p class="oo-bulk"><button type="button" class="oo-del" data-oo-del-all="1">Xoá tất cả ${oo.orders.length} đơn đang hiển thị (dọn đơn thử)</button></p>` : "";
  host.innerHTML = bulk + section("CẦN XÁC NHẬN", g.needAction) + section("CHỜ KHÁCH THANH TOÁN", g.awaiting) + section("ĐANG LÀM / ĐANG GIAO", g.making) + section("ĐÃ XONG HÔM NAY", g.recent)
    || '<p class="muted empty-state">Chưa có đơn online nào. Đơn mới sẽ hiện ở đây và phát chuông (cần chạm vào trang một lần để trình duyệt cho phép âm thanh).</p>';
}

$("#oo-list").addEventListener("click", async (event) => {
  const histBtn = event.target.closest("[data-oo-hist]");
  if (histBtn) { const c = ooCust.get(histBtn.dataset.ooHist); if (c) { c.open = !c.open; renderOnline(); } return; }
  const noteBtn = event.target.closest("[data-oo-cnote]");
  if (noteBtn) {
    const phone = noteBtn.dataset.ooCnote; const c = ooCust.get(phone); if (!c || c.loading) return;
    const text = window.prompt("Ghi chú sở thích của khách (để trống = xoá). Ví dụ: ít đường, không đá, hay đặt vào sáng.", String(c.note?.note || ""));
    if (text === null) return;
    try {
      const ref = doc(db, ...root, "customerNotes", phone);
      const clean = text.trim().slice(0, 500);
      if (!clean) { await deleteDoc(ref); c.note = null; }
      else { c.note = { phone, name: noteBtn.dataset.ooCname.slice(0, 50), note: clean, updatedAt: Timestamp.now(), updatedBy: state.role === ROLE_OWNER ? "Chủ quán (web)" : "Quản lý (web)" }; await setDoc(ref, c.note); }
    } catch (error) { $("#oo-note").textContent = `Không lưu được ghi chú: ${error.message || error}`; }
    renderOnline();
    return;
  }
  if (state.role === ROLE_OWNER) {
    const one = event.target.closest("[data-oo-del]");
    const all = event.target.closest("[data-oo-del-all]");
    if (one || all) {
      const list = one ? oo.orders.filter((o) => o.id === one.dataset.ooDel) : [...oo.orders];
      if (!list.length) return;
      const msg = one ? `Xoá hẳn đơn ${list[0].code} (${list[0].name || ""}, ${money(list[0].total)})? Không khôi phục được.` : `Xoá HẲN ${list.length} đơn online đang hiển thị? Không khôi phục được. (Không ảnh hưởng bill, doanh thu, menu hay dữ liệu POS.)`;
      if (!window.confirm(msg)) return;
      let done = 0;
      for (const o of list) { oo.busy.add(o.id); try { if (await deleteOnlineOrder(o)) done += 1; } catch (error) { $("#oo-note").textContent = `Không xoá được đơn ${o.code}: ${error.message || error}`; } finally { oo.busy.delete(o.id); } }
      if (done) $("#oo-note").textContent = `Đã xoá ${done} đơn.`;
      renderOnline();
      return;
    }
  }
  const button = event.target.closest("[data-oo-act]");
  if (!button) return;
  const order = oo.orders.find((o) => o.id === button.dataset.ooId);
  if (!order) return;
  const action = button.dataset.ooAct;
  if (action === "reject") {
    const reason = window.prompt(`Lý do từ chối (khách sẽ thấy). Gợi ý: ${OO_REJECT_REASONS.join(" / ")}`, OO_REJECT_REASONS[0]);
    if (reason === null) return;
    applyOnlineAction(order, "reject", { reason });
  } else if (action === "expire" && !window.confirm(`Huỷ đơn ${order.code}? Khách sẽ thấy đơn hết hạn.`)) {
    return;
  } else if (action === "paid" && !window.confirm(`Xác nhận ĐÃ NHẬN ${money(order.total)} cho đơn ${order.code} (nội dung ${order.transferContent || ""})?`)) {
    return;
  } else if (action !== "reject") applyOnlineAction(order, action);
});

$("#oo-clean-btn")?.addEventListener("click", async () => {
  if (state.role !== ROLE_OWNER) return;
  const note = $("#oo-clean-note");
  const typed = window.prompt("Sẽ XOÁ HẲN toàn bộ đơn online và bộ đếm giới hạn (không khôi phục được). Gõ XOA để xác nhận:");
  if (typed === null || typed.trim().toUpperCase() !== "XOA") { note.textContent = "Đã huỷ, chưa xoá gì."; return; }
  const btn = $("#oo-clean-btn"); btn.disabled = true; note.textContent = "Đang xoá…";
  try {
    let removed = 0;
    for (const name of ["online_orders", "online_limits"]) {
      const snap = await getDocs(collection(db, ...root, name));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
        countUsage("deletes", Math.min(400, snap.docs.length - i));
      }
      if (name === "online_orders") removed = snap.size;
    }
    note.textContent = `Đã xoá ${removed} đơn online và toàn bộ bộ đếm. Bill, doanh thu, menu không bị đụng tới.`;
  } catch (error) { note.textContent = `Chưa xoá hết: ${error.message || error}`; }
  finally { btn.disabled = false; }
});

$("#oo-toggle").addEventListener("click", async () => {
  if (oo.shop === null) return;
  const next = oo.shop?.orderingEnabled === false;
  try { await setDoc(doc(db, ...root, "online_config", "shop"), { orderingEnabled: next }, { merge: true }); oo.shop = { ...oo.shop, orderingEnabled: next }; $("#oo-note").textContent = ""; }
  catch (error) { $("#oo-note").textContent = `Không lưu được: ${error.message || error}`; }
  renderOnline();
});

$("#oo-config").addEventListener("toggle", (event) => {
  if (!event.target.open) return;
  const form = $("#oo-form");
  const s = oo.shop || {};
  for (const name of ["name", "tagline", "address", "phone", "hours", "notice", "siteUrl", "bank", "account", "holder"]) form.elements[name].value = s[name] || "";
});

$("#oo-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const err = $("#oo-form-error"); err.textContent = "";
  if (!canTreasure(state.role)) { err.textContent = "Chỉ chủ quán hoặc thủ quỹ được sửa thông tin quán."; return; }
  const form = event.target;
  const checked = validateShopConfig({ ...Object.fromEntries(["name", "tagline", "address", "phone", "hours", "notice", "siteUrl", "bank", "account", "holder"].map((n) => [n, form.elements[n].value])), orderingEnabled: oo.shop?.orderingEnabled !== false });
  if (!checked.ok) { err.textContent = Object.values(checked.errors)[0]; return; }
  try {
    await setDoc(doc(db, ...root, "online_config", "shop"), { ...checked.value, updatedAt: Date.now() }, { merge: true });
    oo.shop = { ...oo.shop, ...checked.value };
    err.textContent = "Đã lưu.";
    renderOnline();
  } catch (error) { err.textContent = error.code === "permission-denied" ? "Không có quyền ghi: hãy dán rules đặt món vào Firestore." : `Không lưu được: ${error.message || error}`; }
});

/* ---------- Chia tab: mỗi tab là một trang riêng theo #hash, nút Back của trình duyệt hoạt động ---------- */
const TABS = ["ban", "donline", "doanhthu", "bill", "taichinh", "giavon", "hoanung", "taikhoan"];
function showTab() {
  if (location.hash === "#thanhtoan") history.replaceState(null, "", "#bill"); // tab cũ đã gộp vào Lịch sử bill
  const allowed = TABS;
  const name = allowed.includes(location.hash.slice(1)) ? location.hash.slice(1) : allowed[0];
  document.querySelectorAll(".page").forEach((page) => { page.hidden = page.dataset.page !== name; });
  document.querySelectorAll("#tabbar [data-tab]").forEach((link) => link.classList.toggle("active", link.dataset.tab === name));
  window.scrollTo(0, 0);
  if (name === "giavon" && state.role && !state.recipesLoaded) loadRecipes();
  if ((name === "giavon" || name === "taichinh" || name === "hoanung") && state.role) autoRefreshReceipts(true); // mở tab liên quan: lấy phiếu mới nhất
  if (name === "hoanung" && state.role && !state.reimbLoaded) loadReimbursements();
  if (name === "taikhoan" && state.role) renderAccount();
  if (name === "donline" && state.role) { startOnlineOrders(); renderOnline(); }
  if (name === "doanhthu" && state.role) loadTopBanner();
}
window.addEventListener("hashchange", showTab);
showTab();

onAuthStateChanged(auth, async (user) => {
  state.user = user || null;
  state.role = null; state.me = null;
  if (!user) { stopOnlineOrders(); $("#pin-view").hidden = true; $("#dashboard-view").hidden = true; $("#login-view").hidden = false; return; }
  $("#login-view").hidden = true;
  await loadMembers();
  // Máy này đã có người vào trước đó thì vào luôn; muốn đổi thì bấm "Đổi người".
  const last = state.members.find((m) => m.id === savedPerson() && m.active !== false && m.pinHash);
  if (last) enterAs(last); else showPinView();
});
window.__appReady = true;
