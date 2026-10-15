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
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  setDoc as rawSetDoc,
  writeBatch as rawWriteBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { matchesPayer, normalizePayer } from "./payer-filter.js?v=20261012-3";
import { buildCancelledReceipt, buildEditedReceipt, calculateReceiptTotal, createStableDraft, receiptToDraft, validateReceipt } from "./expense-domain.js?v=20261013-2";
import { shouldMarkSnapshotStale } from "./dashboard-snapshot.js?v=20261012-3";
import { normalizeMaterial, materialMatches, materialRank, filterMaterialOptions } from "./material-search.js?v=20261012-3";
import { currentFlow, flowLabel, frozenRefunds, historyRows, summarizeRefunds } from "./payment-flow-view.js?v=20261014-3";
import { DETAIL_ITEMIZED, buildSummaryLines, detailGap, detailLevelSummary, detailRequired, isSummaryReceipt, validateSummaryReceipt } from "./expense-rules.js?v=20261014-8";
import { classifyMaterial, groupCodeOrNull, groupLabelOf, materialCodeFor, normalizeQuantity, reviewItems, ruleIdFor, rulesToLearn, summarizeReview } from "./expense-rules.js?v=20261014-7";
import { buildSimulation } from "./sim-data.js?v=20261014-10";
import { buildMonthlyReport, lastMonthKeys, monthKeyOf, monthlyCsv, monthlyJson, startOfPreviousMonth } from "./monthly-report.js?v=20261014-9";
import { menuCsv } from "./menu-export.js?v=20261015-1";
import { KIND_LABELS, MATERIALS, catalogRules, costLevel, draftRecipeFor, materialById, materialCosts, recipeCost, sliderSpec, usageVsPurchase } from "./cost-recipe.js?v=20261016-1";
import { DEFAULT_DAILY_SALES, DEMO_COLLECTION, averageDailySales, buildDemoReceipts, dailyMaterialUsage } from "./demo-receipts.js?v=20261016-1";
import { mergeReceipts, planLoad } from "./receipt-cache.js?v=20261014-9";
import { ACK_TIMEOUT_MS, canRequestSync, syncCommandStatus } from "./remote-sync-view.js?v=20261014-6";
import { buildBillDetail, buildBillRows, chunk, dayRange, keyOfTime, methodLabel, summarizeBillRows, timeLabel } from "./bill-history-view.js?v=20261014-4";
import { aggregateItems, dailyKeys, dateKeyOf, liveSummary, periodDailySummary, serviceStatusLabel, summarizeDaily } from "./sales-snapshot-view.js?v=20261013-2";

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
  unsubs: [], paymentFlowDoc: null, refunds: [], frozenRefundDocs: [], flowError: "", dailyDocs: {}, dailyError: "", salesLoaded: false, salesDays: 7, itemMode: "combined", period: "today", customFrom: null, customTo: null,
  transactionKind: "ALL", payerFilter: "ALL", user: null,
  expenseRules: [], rulesError: "", simulation: null, demo: null, menuItems: [], menuCats: [], recipes: {}, recipesLoaded: false, recipeError: "", monthlyDocs: {}, monthlyError: "", reportFrom: 0, receiptsNote: "", detailCutoff: null, receiptsFrom: 0, summaryBlocks: [], historyDay: "today", historyDocs: {}, historyTables: null, historyError: "", historyLoading: false, billDetailCache: {},
};
let expenseDraft = null;
let editingReceipt = null;
const expenseRows = () => state.expenseReceipts.map((receipt) => ({
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
const setDoc = (...args) => { if (state.simulation) throw new Error(SIM_BLOCKED); return rawSetDoc(...args); };
const writeBatch = (...args) => { if (state.simulation) throw new Error(SIM_BLOCKED); return rawWriteBatch(...args); };

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
    ["Tổng vốn đầu tư", money(dashboard.initialInvestment)],
    ["Đã thu hồi vốn", money(dashboard.recoveredCapital)],
    ["Tỷ lệ hoàn vốn", `${(Number(dashboard.paybackBasisPoints || 0) / 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`],
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
  const allPurchases = expenseRows().filter((p) => p.status !== "DELETED" && inRange(p.purchasedAt, range));
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
    ["Tổng phiếu chi", allPurchases.length],
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
      node.addEventListener("click", () => showDetail({ table: { name: row.name, openedAt: row.openedAt }, session: { openedAt: row.openedAt }, batches: [{ status: row.serviceStatus }], items: [], total: row.currentTotal }));
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

  const keys = dailyKeys(state.salesDays);
  const summary = summarizeDaily(state.dailyDocs, keys, dateKeyOf(new Date()));
  const notes = [];
  if (state.dailyError) notes.push(`Không đọc được snapshot ngày: ${state.dailyError}`);
  else if (summary.unavailableDays.length) notes.push(`Chưa có snapshot ngày ${summary.unavailableDays.map(shortDay).join(", ")}: số liệu chưa đầy đủ, cần POS đồng bộ.`);
  if (summary.needsFinalizeDays.length) notes.push(`Ngày ${summary.needsFinalizeDays.map(shortDay).join(", ")} chưa được POS chốt.`);
  if (hasSnapshot && shouldMarkSnapshotStale(dashboard.lastUpdatedAt)) notes.push("Snapshot POS cũ hơn 15 phút, cần kiểm tra máy POS.");
  $("#sales-notice").textContent = notes.join(" ");

  document.querySelectorAll("[data-sales-days]").forEach((button) => button.classList.toggle("active", Number(button.dataset.salesDays) === keys.length));
  document.querySelectorAll("[data-item-mode]").forEach((button) => button.classList.toggle("active", button.dataset.itemMode === state.itemMode));

  const cards = [
    [`Doanh thu đã chốt · ${keys.length} ngày`, summary.days.some((day) => day.available) ? money(summary.totalRevenue) : "Chưa có dữ liệu"],
    ["Số bill đã thanh toán", summary.days.some((day) => day.available) ? summary.totalBills : "Chưa có dữ liệu"],
    ["Bill trung bình", summary.days.some((day) => day.available) ? money(summary.averageBill) : "Chưa có dữ liệu"],
  ];
  $("#sales-summary").replaceChildren(...cards.map(([label, value]) => {
    const node = $("#metric-template").content.firstElementChild.cloneNode(true);
    node.querySelector("p").textContent = label;
    node.querySelector("strong").textContent = value;
    return node;
  }));

  const max = Math.max(1, ...summary.days.filter((day) => day.available).map((day) => day.revenue));
  $("#sales-chart").innerHTML = summary.days.map((day) => {
    const bar = day.available
      ? `<div class="bar" style="height:${Math.max(2, Math.round(day.revenue / max * 100))}%"></div>`
      : '<div class="bar empty" style="height:100%"></div>';
    const value = day.available ? `${compactMoney(day.revenue)}` : "Chưa có";
    const bills = day.available ? `${day.paidBills} bill` : "";
    return `<div class="bar-col"><span class="bar-value">${escapeHtml(value)}</span><div class="bar-area">${bar}</div><small>${shortDay(day.dateKey)}</small><small>${escapeHtml(bills)}</small></div>`;
  }).join("");

  const host = $("#sales-items");
  const table = (rows) => rows.length
    ? `<table class="sales-table"><thead><tr><th>Món</th><th>SL</th><th>Doanh thu</th><th>Tỷ trọng</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.qty}</td><td>${money(row.revenue)}</td><td>${percent(row.share)}</td></tr>`).join("")}</tbody></table>`
    : '<p class="muted empty-state">Chưa có món đã bán trong giai đoạn này.</p>';
  if (state.itemMode === "byDay") {
    const days = aggregateItems(state.dailyDocs, keys, "byDay");
    host.innerHTML = days.length ? days.map((day) => `<h3 class="sales-day-title">${shortDay(day.dateKey)}</h3>${table(day.rows)}`).join("") : table([]);
  } else {
    host.innerHTML = table(aggregateItems(state.dailyDocs, keys, "combined"));
  }
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
const historyKey = (which) => keyOfTime(which === "yesterday" ? Date.now() - 86400000 : Date.now());

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
    const billIds = rows(billSnap).filter((b) => b.status === "PAID").map((b) => String(b.id));
    const paySnaps = await Promise.all(chunk(billIds, 30).map((ids) => getDocs(query(collection(db, ...root, "payments"), where("billId", "in", ids)))));
    const paySnap = { docs: paySnaps.flatMap((x) => x.docs) };
    if (!state.historyTables) state.historyTables = rows(await getDocs(collection(db, ...root, "tableStatus")));
    state.historyDocs[key] = { bills: rows(billSnap), payments: rows(paySnap), sessions: rows(sessSnap), loadedAt: Date.now() };
  } catch (error) {
    state.historyError = error.code === "permission-denied" ? "Không có quyền đọc bill (cần mở quy tắc Firestore cho bills, payments, sessions)." : (error.message || "lỗi không rõ");
  }
  state.historyLoading = false;
  renderBillHistory();
}

function billHistoryRows() {
  const key = historyKey(state.historyDay);
  const data = state.historyDocs[key];
  if (!data) return null;
  const refunds = [...state.refunds, ...state.frozenRefundDocs.filter((r) => !state.refunds.some((x) => x.id === r.id))];
  return buildBillRows({ ...data, tables: state.historyTables || [], refunds, range: dayRange(key) });
}

function renderBillHistory() {
  const notice = $("#bill-history-notice");
  const summaryHost = $("#bill-history-summary");
  const list = $("#bill-history-list");
  if (!list) return;
  notice.textContent = state.historyLoading ? "Đang đọc bill…" : state.historyError ? `Không đọc được lịch sử bill: ${state.historyError}` : "";
  const data = billHistoryRows();
  if (!data) { summaryHost.replaceChildren(); list.innerHTML = state.historyLoading || state.historyError ? "" : '<p class="muted empty-state">Bấm Làm mới để đọc bill.</p>'; return; }
  const s = summarizeBillRows(data);
  const tiles = [
    ["Số bill", String(s.count)],
    ["Doanh thu", money(s.total)],
    ["Tiền mặt", money(s.cash)],
    ["Chuyển khoản", money(s.transfer)],
  ];
  if (s.refundedCount) tiles.push([`Hoàn tiền (${s.refundedCount} bill)`, `−${money(s.refunded)}`], ["Thực thu sau hoàn", money(s.net)]);
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
      const tags = `${r.flow === "prepaid" ? '<span class="bill-tag">Trả trước</span>' : ""}${r.refund ? `<span class="bill-tag warn">${r.refund.status === "FROZEN" ? "Hoàn CK · đóng băng" : "Đã hoàn"}</span>` : ""}`;
      return `<button type="button" class="bill-row" data-bill-id="${escapeHtml(r.id)}"><time>${timeLabel(r.closedAt)}</time><span class="bill-main"><strong>${escapeHtml(r.tableName)} · #${escapeHtml(r.billNo)}${tags}</strong><small>${escapeHtml(method)}${r.reference ? ` · ${escapeHtml(r.reference)}` : ""}</small></span><span class="bill-amount">${money(r.total)}<small>Xem chi tiết</small></span></button>`;
    }).join("")
    : '<p class="muted empty-state">Chưa có bill đã thanh toán trong ngày này.</p>';
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

function renderTransactions() {
  const range = rangeForPeriod();
  const purchases = expenseRows()
    .filter((p) => p.status !== "DELETED" && inRange(p.purchasedAt, range))
    .filter((p) => matchesPayer(state.payerFilter, p.paidByName))
    .map((p) => ({ kind: "EXPENSE", at: Number(p.purchasedAt || 0), id: p.id, amount: Number(p.total || 0), title: `${p.summary ? "Phiếu tổng · " : ""}${EXPENSE_LABELS[p.expenseCategory] || p.expenseCategory || "Phiếu chi"}`, person: p.paidByName || "", note: p.note || "" }));
  const movements = state.movements
    .filter((m) => inRange(m.occurredAt, range) && matchesPayer(state.payerFilter, m.counterpartyName))
    .map((m) => ({ kind: "MOVEMENT", at: Number(m.occurredAt || 0), id: m.id, amount: Number(m.amount || 0), title: MOVEMENT_LABELS[m.type] || m.type || "Dòng tiền", person: m.counterpartyName || "", note: m.note || "" }));
  let rows0 = [...purchases, ...movements].sort((a, b) => b.at - a.at);
  if (state.transactionKind !== "ALL") rows0 = rows0.filter((r) => r.kind === state.transactionKind);
  rows0 = rows0.slice(0, 100);
  const host = $("#transactions");
  if (!rows0.length) {
    host.innerHTML = '<p class="muted empty-state">Chưa có phiếu trong kỳ đã chọn.</p>';
    return;
  }
  host.replaceChildren(...rows0.map((r) => {
    const node = document.createElement("article");
    node.className = "transaction-card";
    const meta = [dateTime(r.at), r.person].filter(Boolean).join(" · ");
    const actions = r.kind === "EXPENSE" ? `<div class="row-actions"><button type="button" class="text-button" data-edit-receipt="${escapeHtml(r.id)}">Sửa</button><button type="button" class="text-button danger" data-cancel-receipt="${escapeHtml(r.id)}">Huỷ phiếu</button></div>` : "";
    node.innerHTML = `<div><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(meta)}</small><p>${escapeHtml(r.note)}</p>${actions}</div><b>${money(r.amount)}</b>`;
    return node;
  }));
}

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
  if (!record.items.length) list.innerHTML = "<li><span>Chưa có món đồng bộ</span></li>";
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
const MATERIAL_GROUPS = [["THIT","Thịt, gia cầm"],["RAU","Rau, củ, quả"],["BUN","Bún, bánh đa, tinh bột"],["BANH","Bánh mì, nguyên liệu bánh"],["SUA","Trứng, sữa, bơ"],["GIAVI","Gia vị, nước dùng"],["CAPHE","Cà phê"],["TRA","Trà, nguyên liệu pha trà"],["MUT","Siro, mứt, nguyên liệu bổ sung"],["NUOC","Đồ uống đóng chai"],["DA","Đá, nước tinh khiết"],["BAOBI","Bao bì, vật tư phục vụ"],["VESINH","Vệ sinh, vật tư tiêu hao"],["KHAC","Vật tư khác"]];
const MATERIAL_UNITS = ["kg","gam","lít","ml","con","quả","bó","túi","hộp","chai","lon","gói","cái","thùng","bình","ổ","suất"];
function savedMaterials() { try { return JSON.parse(localStorage.getItem(`pos0210.materials.${state.user?.uid}`) || "[]"); } catch { return []; } }
function rememberMaterials(items) { const records = savedMaterials(); for (const item of items) { const name = String(item.materialName || "").trim(); if (!name) continue; const index = records.findIndex((r) => normalizeMaterial(r.materialName) === normalizeMaterial(name)); const record = { materialName: name, materialCode: item.materialCode, expenseGroup: item.expenseGroup, unit: item.unit }; if (index >= 0) records[index] = record; else records.push(record); } localStorage.setItem(`pos0210.materials.${state.user?.uid}`, JSON.stringify(records.slice(-500))); }
function materialOptions(field, search) {
  const values = field === "expenseGroup" ? MATERIAL_GROUPS.map(([, name]) => name) : field === "unit" ? MATERIAL_UNITS : [...new Set([...savedMaterials().map((x) => x.materialName), ...MATERIALS.map((m) => m.name), ...(expenseDraft?.items || []).map((x) => x.materialName)].filter(Boolean))];
  return filterMaterialOptions(values, search);
}
function updateMaterialSuggestions(input) {
  const list = document.getElementById(input.getAttribute("list"));
  if (!list) return;
  list.replaceChildren(...materialOptions(input.dataset.field, input.value).map((value) => new Option(value, value)));
}
function setupMaterialSuggestions() {
  document.querySelectorAll("#expense-lines input[list]").forEach(updateMaterialSuggestions);
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
  return `<article class="expense-line" data-line-id="${id}" data-group-touched="${item.groupTouched ? 1 : 0}"><label>Tên vật tư<input data-field="materialName" list="materials-${id}" maxlength="120" value="${safe(item.materialName)}" required autocomplete="off" /><datalist id="materials-${id}"></datalist></label><div class="two-col"><label>Mã vật tư<input data-field="materialCode" maxlength="40" value="${safe(item.materialCode)}" readonly /></label><label>Nhóm vật tư<input data-field="expenseGroup" list="groups-${id}" value="${safe(group)}" required autocomplete="off" /><datalist id="groups-${id}"></datalist></label></div><p class="rule-hint" data-hint aria-live="polite"></p><div class="two-col"><label>Số lượng<input data-field="qty" type="number" min="0.001" step="0.001" value="${Number(item.qty || 0)}" /></label><label>Đơn vị tính<input data-field="unit" list="units-${id}" maxlength="20" value="${safe(item.unit || "kg")}" required autocomplete="off" /><datalist id="units-${id}"></datalist></label></div><label>Đơn giá<input data-field="unitPrice" type="number" min="0" step="1" value="${Number(item.unitPrice || 0)}" /></label><button type="button" class="text-button" data-remove-line="${id}">Bỏ dòng</button></article>`;
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
    else if (chosen === s.group) text = `✓ Khớp quy tắc${s.status === "matched" ? ` (từ khoá “${s.matched}”)` : " đã học"}: ${label}`;
    else { text = `Khác gợi ý (${label}). Lựa chọn của bạn sẽ được ghi nhớ cho lần sau.`; warn = true; }
  } else if (s.status === "ambiguous") { text = `Tên này có thể thuộc: ${s.groups.map(groupLabelOf).join(" hoặc ")}. Hãy chọn đúng nhóm.`; warn = true; }
  else { text = chosen ? "Chưa có quy tắc cho tên này; lựa chọn của bạn sẽ được ghi nhớ." : "Chưa khớp quy tắc nào, hãy chọn nhóm vật tư."; warn = true; }
  hint.textContent = text;
  hint.className = warn ? "rule-hint warn" : "rule-hint";
}
function renderClassificationReview() {
  const host = $("#review-list");
  const summaryHost = $("#review-summary");
  if (!host) return;
  const data = reviewItems(state.expenseReceipts, allRules());
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
    ? issues.map((r) => `<article class="review-row"><div><strong>${escapeHtml(r.name || "—")}</strong><small>${dateTime(r.date)} · ${money(r.amount)}</small><small>Đang ở: ${escapeHtml(r.stored ? groupLabelOf(r.stored) : "chưa rõ")}${r.status === "mismatch" ? ` · gợi ý: ${escapeHtml(groupLabelOf(r.suggested))}` : r.status === "ambiguous" ? ` · có thể: ${escapeHtml(r.candidates.map(groupLabelOf).join(" / "))}` : ""}</small></div><div class="review-actions"><span class="bill-tag warn">${labelOf[r.status]}</span><button type="button" class="text-button" data-edit-receipt="${escapeHtml(r.receiptId)}">Sửa phiếu</button></div></article>`).join("")
    : (s.total ? '<p class="muted empty-state">Mọi dòng trong 7 ngày đều khớp quy tắc.</p>' : '<p class="muted empty-state">Chưa có phiếu chi trong 7 ngày.</p>'));
}
function renderExpenseDraft() {
  if (!expenseDraft) return;
  $("#expense-date").value = localDateTimeInput(new Date(expenseDraft.purchaseDate));
  $("#expense-note").value = expenseDraft.note || "";
  $("#expense-lines").innerHTML = expenseDraft.items.map(expenseLineMarkup).join("");
  setupMaterialSuggestions();
  document.querySelectorAll("#expense-lines .expense-line").forEach(refreshRuleHint);
  $("#expense-total").textContent = money(calculateReceiptTotal(expenseDraft.items));
  updateGapNote();
  if (!editingReceipt) localStorage.setItem(`pos0210.expense-draft.${state.user.uid}`, JSON.stringify(expenseDraft));
}
function applyExpenseInputs() {
  if (!expenseDraft) return;
  expenseDraft.purchaseDate = new Date($("#expense-date").value).getTime();
  expenseDraft.note = $("#expense-note").value.trim();
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
      // Mã vật tư sinh cố định từ tên + nhóm: cùng tên luôn ra cùng mã trên mọi thiết bị. Dòng đã có mã và chưa đổi tên/nhóm giữ nguyên mã cũ.
      if (!code && group) code = materialCodeFor(groupCode(group), read("materialName"));
      if (code) allocated.add(code);
    }
    node.querySelector("[data-field=materialCode]").value = code;
    return { ...existing, materialName: read("materialName"), materialCode: code, expenseGroup: group, groupTouched: node.dataset.groupTouched === "1", qty: Number(read("qty")), unit: read("unit"), unitPrice: Number(read("unitPrice")) };
  });
  if (state.user && !editingReceipt) localStorage.setItem(`pos0210.expense-draft.${state.user.uid}`, JSON.stringify(expenseDraft));
}
async function saveExpenseReceipt(event) {
  event.preventDefault(); applyExpenseInputs(); const error = $("#expense-error"); error.textContent = "";
  const check = validateReceipt(expenseDraft); if (!check.ok) { error.textContent = check.error; return; }
  const missingGroup = expenseDraft.items.findIndex((item) => !groupCodeOrNull(item.expenseGroup));
  if (missingGroup >= 0) { error.textContent = `Dòng ${missingGroup + 1}: hãy chọn nhóm vật tư.`; return; }
  const learnList = rulesToLearn(expenseDraft.items, state.expenseRules);
  expenseDraft.items = expenseDraft.items.map(({ groupTouched, ...item }) => {
    const suggestion = classifyMaterial(item.materialName, allRules());
    const chosen = groupCodeOrNull(item.expenseGroup);
    const source = suggestion.group && suggestion.group === chosen ? (suggestion.status === "learned" ? "LEARNED_RULE" : "KEYWORD_RULE") : "MANUAL";
    return { ...item, ...normalizeQuantity(item.qty, item.unit), classification: { source, suggestedGroup: suggestion.group, status: suggestion.status } };
  });
  const now = Date.now();
  const payload = editingReceipt
    ? { ...buildEditedReceipt(editingReceipt, expenseDraft, { now, uid: state.user.uid }), ...(upgradeFrom ? { detailLevel: DETAIL_ITEMIZED } : {}) }
    : { ...expenseDraft, total: check.total, status: "ACTIVE", updatedAt: now, updatedByUid: state.user.uid, source: "WEB_MANAGER", items: expenseDraft.items.map((item) => ({ ...item, materialGroup: item.expenseGroup, amount: Math.round(item.qty * item.unitPrice) })) };
  try {
    await setDoc(doc(db, ...root, receiptCollection(), expenseDraft.id), withDemoFlags(payload));
    rememberMaterials(expenseDraft.items);
    for (const rule of state.demo ? [] : learnList) { // đang xem demo: không học quy tắc từ phiếu demo
      try {
        const learned = { id: rule.id, name: rule.name, group: rule.group, updatedAt: now, updatedByName: state.user.displayName || state.user.email || "" };
        await setDoc(doc(db, ...root, "expenseRules", rule.id), learned);
        state.expenseRules = [...state.expenseRules.filter((x) => x.id !== rule.id), learned];
      } catch { /* học quy tắc là phụ: phiếu đã lưu, lần sau sẽ thử lại khi người nhập chọn nhóm khác gợi ý */ }
    }
    if (editingReceipt) { replaceLocalReceipt(payload); editingReceipt = null; upgradeFrom = null; render(); }
    else localStorage.removeItem(`pos0210.expense-draft.${state.user.uid}`);
    expenseDraft = null; $("#expense-dialog").close();
  }
  catch (e) { error.textContent = editingReceipt ? `Chưa lưu được thay đổi: ${e.message || e}` : `Chưa đồng bộ được; bản nháp đã giữ lại: ${e.message || e}`; }
}

function replaceLocalReceipt(receipt) {
  const index = state.expenseReceipts.findIndex((item) => item.id === receipt.id);
  if (index >= 0) state.expenseReceipts[index] = receipt; else state.expenseReceipts.unshift(receipt);
}

function openReceiptEditor(id) {
  const receipt = state.expenseReceipts.find((item) => item.id === id);
  if (!receipt || !state.user) return;
  if (isSummaryReceipt(receipt)) { openSummaryDialog(receipt); return; }
  upgradeFrom = null;
  editingReceipt = receipt;
  expenseDraft = receiptToDraft(receipt, MATERIAL_GROUPS);
  $("#expense-title").textContent = "Sửa phiếu";
  $("#expense-submit").textContent = "LƯU THAY ĐỔI";
  $("#expense-error").textContent = "";
  renderExpenseDraft();
  $("#expense-dialog").showModal();
}

async function cancelReceipt(id) {
  const receipt = state.expenseReceipts.find((item) => item.id === id);
  if (!receipt || !state.user) return;
  const label = `${dateTime(receipt.purchaseDate)} · ${money(receipt.total)}`;
  if (!window.confirm(`Huỷ phiếu chi ${label}? Phiếu sẽ không còn tính vào chi phí. Dữ liệu vẫn được giữ lại.`)) return;
  const payload = buildCancelledReceipt(receipt, { now: Date.now(), uid: state.user.uid });
  try { await setDoc(doc(db, ...root, receiptCollection(), id), withDemoFlags(payload)); replaceLocalReceipt(payload); render(); }
  catch (e) { window.alert(`Chưa huỷ được phiếu: ${e.message || e}`); }
}

function render() {
  renderCumulativeSummary();
  renderPeriodSummary();
  renderTables();
  renderSalesSnapshots();
  renderPaymentFlow();
  renderBillHistory();
  renderClassificationReview();
  renderDetailLevel();
  renderMonthlyReport();
  if (state.recipesLoaded) { renderRecipes(); renderUsageCheck(); }
  renderFinanceMetadata();
  renderTransactions();
}
async function refreshDashboard() {
  if (!state.user) return;
  if (state.simulation) { $("#sync-status").textContent = "Đang ở chế độ mô phỏng. Tắt mô phỏng để đọc dữ liệu thật."; return; }
  if (state.demo) { $("#sync-status").textContent = "Đang xem dữ liệu DEMO. Tắt xem demo để đọc dữ liệu thật."; return; }
  $("#sync-status").textContent = "Đang đọc snapshot…";
  try {
    const dashboardDoc = await getDoc(doc(db, ...root, "dashboard", "current"));
    state.dashboard = dashboardDoc.exists() ? dashboardDoc.data() : {};
    state.dailyDocs = {};
    state.historyDocs = {};
    state.billDetailCache = {};
    const hasLiveTables = Array.isArray(state.dashboard.liveTables);
    if (hasLiveTables) state.tables = [];
    const sevenDays = startOfDay(new Date(Date.now() - 6 * 86400000));
    const read = async (name, key, q = null) => { const snapshot = await getDocs(q || collection(db, ...root, name)); state[key] = rows(snapshot); };
    await Promise.all([
      hasLiveTables ? Promise.resolve() : read("tableStatus", "tables"),
      loadDailyDocs(),
      loadReceiptsCached(),
      loadMonthlyDocs(),
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
      state.expenseRules = rows(await getDocs(query(collection(db, ...root, "expenseRules"), limit(2000))));
      state.rulesError = "";
    } catch (error) { state.expenseRules = []; state.rulesError = error.code === "permission-denied" ? "Chưa có quyền đọc quy tắc đã học (expenseRules)." : (error.message || "lỗi không rõ"); }
    state.salesLoaded = true;
    const stale = shouldMarkSnapshotStale(state.dashboard.lastUpdatedAt);
    $("#sync-status").textContent = state.dashboard.lastUpdatedAt ? `Snapshot POS: ${dateTime(state.dashboard.lastUpdatedAt)}${stale ? " · cần kiểm tra máy POS" : ""}` : "POS chưa gửi snapshot.";
    render();
    loadBillHistory(state.historyDay, true);
  } catch (error) { $("#sync-status").textContent = `Không đọc được dữ liệu: ${error.message}`; }
}

async function saveEntry(event) {
  event.preventDefault();
  const type = $("#entry-type").value;
  const cfg = TRANSACTION_TYPES[type] || TRANSACTION_TYPES.OPERATING_EXPENSE;
  const occurredAt = new Date($("#entry-datetime").value).getTime();
  const note = $("#entry-note").value.trim();
  const error = $("#entry-error");
  error.textContent = "";
  if (!Number.isFinite(occurredAt)) { error.textContent = "Ngày giờ không hợp lệ."; return; }
  if (!state.user) { error.textContent = "Phiên đăng nhập đã hết."; return; }

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
$("#sales-days-filters").addEventListener("click", async (event) => {
  const days = Number(event.target.dataset?.salesDays);
  if (days !== 3 && days !== 7) return;
  state.salesDays = days;
  if (state.user) { await loadDailyDocs(); state.salesLoaded = true; }
  renderSalesSnapshots();
});
$("#sales-item-modes").addEventListener("click", (event) => {
  const mode = event.target.dataset?.itemMode;
  if (mode !== "combined" && mode !== "byDay") return;
  state.itemMode = mode;
  renderSalesSnapshots();
});
$("#close-detail").addEventListener("click", () => $("#table-detail").close());
$("#bill-history-days").addEventListener("click", (event) => {
  const button = event.target.closest("[data-history-day]");
  if (!button) return;
  state.historyDay = button.dataset.historyDay === "yesterday" ? "yesterday" : "today";
  $("#bill-history-days").querySelectorAll(".filter").forEach((b) => b.classList.toggle("active", b === button));
  renderBillHistory();
  loadBillHistory(state.historyDay);
});
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
$("#open-expense").addEventListener("click", () => {
  if (!state.user) return;
  editingReceipt = null;
  upgradeFrom = null;
  $("#expense-title").textContent = "Phiếu nhiều vật tư";
  $("#expense-submit").textContent = "LƯU VÀ ĐỒNG BỘ";
  expenseDraft = createStableDraft(localStorage, state.user, uuid);
  expenseDraft.items = expenseDraft.items.map(item => ({ ...item, expenseGroup: item.materialName ? groupLabel(item.expenseGroup) : "" }));
  $("#expense-error").textContent = "";
  renderExpenseDraft();
  $("#expense-dialog").showModal();
});
$("#close-expense").addEventListener("click", () => {
  if (editingReceipt) { editingReceipt = null; upgradeFrom = null; expenseDraft = null; $("#expense-dialog").close(); updateGapNote(); return; }
  applyExpenseInputs(); renderExpenseDraft(); $("#expense-dialog").close();
});
$("#expense-dialog").addEventListener("close", () => { if (editingReceipt) { editingReceipt = null; upgradeFrom = null; expenseDraft = null; } updateGapNote(); });
$("#transactions").addEventListener("click", (event) => {
  const edit = event.target.closest?.("[data-edit-receipt]");
  if (edit) { openReceiptEditor(edit.dataset.editReceipt); return; }
  const cancel = event.target.closest?.("[data-cancel-receipt]");
  if (cancel) cancelReceipt(cancel.dataset.cancelReceipt);
});
$("#add-expense-line").addEventListener("click", () => { applyExpenseInputs(); expenseDraft.items.push({ id: uuid(), materialName: "", materialCode: "", expenseGroup: "", qty: 1, unit: "kg", unitPrice: 0 }); renderExpenseDraft(); });
$("#expense-lines").addEventListener("click", (event) => { const id = event.target.dataset.removeLine; if (!id || expenseDraft.items.length < 2) return; applyExpenseInputs(); expenseDraft.items = expenseDraft.items.filter((item) => item.id !== id); renderExpenseDraft(); });
$("#expense-lines").addEventListener("input", (event) => { applyExpenseInputs(); if (event.target.matches("input[list]")) updateMaterialSuggestions(event.target); $("#expense-total").textContent = money(calculateReceiptTotal(expenseDraft.items)); updateGapNote(); });
$("#expense-lines").addEventListener("change", (event) => {
  const input = event.target;
  const line = input.closest(".expense-line");
  if (!line) return;
  if (input.matches("[data-field=materialName]")) {
    const suggestion = classifyMaterial(input.value, allRules());
    // Nhóm tự điền không được sót lại khi đổi tên: gợi ý rõ thì điền, mơ hồ hoặc chưa khớp thì xoá để buộc người nhập chọn.
    if (line.dataset.groupTouched !== "1") line.querySelector("[data-field=expenseGroup]").value = suggestion.group ? groupLabelOf(suggestion.group) : "";
    const known = savedMaterials().find((item) => normalizeMaterial(item.materialName) === normalizeMaterial(input.value));
    if (known?.unit) line.querySelector("[data-field=unit]").value = known.unit;
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
    await setDoc(ref, { requestedAt: now, requestedBy: state.user.email || "" }, { merge: true });
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
  $("#summary-title").textContent = receipt ? "Sửa phiếu tổng" : "Phiếu tổng";
  $("#summary-submit").textContent = receipt ? "LƯU THAY ĐỔI" : "LƯU TẤT CẢ";
  $("#add-summary-block").hidden = Boolean(receipt);
  $("#summary-to-detail").hidden = !receipt;
  $("#summary-error").textContent = "";
  renderSummaryBlocks();
  $("#summary-dialog").showModal();
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
    prepared.push({ block, purchaseDate, total: check.total });
  }
  const now = Date.now();
  const button = $("#summary-submit");
  button.disabled = true;
  const failed = [];
  let saved = 0;
  for (const { block, purchaseDate, total } of prepared) {
    const items = buildSummaryLines(block.lines, () => uuid());
    const base = editingSummary ? { ...editingSummary } : { id: block.id, createdAt: now, source: "WEB_MANAGER" };
    const payload = { ...base, purchaseDate, note: block.place, enteredByUid: state.user.uid, enteredByName: block.payer || state.user.displayName || state.user.email || "Quản lý",
      items, total, status: "ACTIVE", detailLevel: "SUMMARY", updatedAt: Math.max(now, Number(editingSummary?.updatedAt || 0) + 1), updatedByUid: state.user.uid };
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
    await setDoc(doc(db, ...root, "config", "expenseDetail"), { cutoffAt, updatedAt: Date.now(), updatedBy: state.user.email || "" });
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
  return buildMonthlyReport({ receipts: state.expenseReceipts, monthlyDocs: state.monthlyDocs, monthKeys: keys, currentMonthKey: current, revenueFallback: fallback === undefined ? null : fallback });
};
function renderMonthlyReport() {
  const target = $("#monthly-report");
  if (!target) return;
  const all = currentMonthReport();
  const since = reportSinceKey();
  // Chỉ hiện các tháng web đã đọc đủ phiếu (từ đầu tháng của mốc đệm); tháng cũ hơn chỉ có doanh thu nên không so sánh được.
  const report = all.filter((r) => r.monthKey >= since);
  const note = [state.receiptsNote, state.monthlyError].filter(Boolean).join(" · ");
  $("#monthly-note").textContent = note;
  target.innerHTML = report.slice().reverse().map((r) => `<article class="month-card"><h3>${r.monthKey}${r.monthKey === report[report.length - 1].monthKey ? " · đang chạy" : ""}</h3><dl>
    <div><dt>Nhập hàng</dt><dd>${money(r.purchases)}</dd></div>
    <div><dt>Doanh thu</dt><dd>${r.revenue === null ? "chưa có dữ liệu" : money(r.revenue)}</dd></div>
    <div><dt>Nhập / doanh thu</dt><dd>${r.ratio === null ? "—" : `${(r.ratio * 100).toFixed(1)}%`}</dd></div>
    <div><dt>Phiếu</dt><dd>${r.receiptCount} · tổng ${money(r.summaryAmount)} · chi tiết ${money(r.itemizedAmount)}</dd></div></dl></article>`).join("") || '<p class="muted">Chưa có phiếu trong khoảng đã tải.</p>';
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
    const [items, cats, recs] = await Promise.all([getDocs(collection(db, ...root, "menu")), getDocs(collection(db, ...root, "menuCategories")), getDocs(collection(db, ...root, "recipes"))]);
    state.menuItems = rows(items).filter((m) => m.deleted !== true && m.name);
    state.menuCats = rows(cats);
    state.recipes = Object.fromEntries(rows(recs).map((r) => [r.id, r]));
    state.recipesLoaded = true;
    state.recipeError = "";
    renderUsageCheck();
  } catch (error) { state.recipeError = error.code === "permission-denied" ? "Không có quyền đọc menu hoặc công thức (cần mở quy tắc Firestore cho recipes)." : (error.message || "lỗi không rõ"); }
  renderRecipes();
}
function currentCosts() { return materialCosts(state.expenseReceipts); }
function recipeLinesFor(item) { return state.recipes[item.id]?.lines?.map((l) => ({ ...l })) ?? draftRecipeFor(item.name); }
function renderRecipes() {
  const host = $("#recipe-list");
  if (!host) return;
  const { costs, unconvertible } = currentCosts();
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
    return `<tr class="${c ? "" : "dim"}"><td>${escapeHtml(m.name)}</td><td>${KIND_LABELS[m.kind]}</td><td>${c ? unitPriceLabel(m, c.unitCost) : "chưa có"}</td><td>${c ? `${c.source} · ${c.buys} lần` : ""}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}
function openRecipe(menuId) {
  const item = state.menuItems.find((m) => m.id === menuId);
  if (!item) return;
  recipeEdit = { item, lines: recipeLinesFor(item) };
  $("#recipe-title").textContent = `${item.name} · ${money(item.price)}`;
  $("#recipe-meta").textContent = state.recipes[item.id] ? "Công thức đã lưu. Kéo thanh để tăng giảm định lượng." : "Bản nháp gợi ý, chưa lưu. Kéo thanh cho đúng định lượng của quán rồi bấm Lưu.";
  $("#recipe-error").textContent = "";
  $("#recipe-add-select").innerHTML = `<option value="">Chọn vật tư…</option>${MATERIALS.filter((m) => m.kind !== "VH").map((m) => `<option value="${m.id}">${escapeHtml(m.name)} (${m.base})</option>`).join("")}`;
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
    return `<div class="recipe-line" data-i="${i}"><div class="recipe-line-head"><strong>${escapeHtml(m?.name ?? l.materialId)}</strong><span data-cost>${c ? money(Math.round(l.qty * c.unitCost)) : "chưa có giá"}</span><button type="button" class="text-button" data-remove="${i}" aria-label="Bỏ ${escapeHtml(m?.name ?? "")}">Bỏ</button></div><div class="recipe-line-ctl"><input type="range" id="rq-${i}" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${l.qty}" aria-label="Định lượng ${escapeHtml(m?.name ?? "")}" /><input type="number" id="rn-${i}" min="0" step="${spec.step}" value="${l.qty}" aria-label="Số lượng" /><span class="unit">${escapeHtml(m?.base ?? "")}</span></div></div>`;
  }).join("") || '<p class="muted">Chưa có vật tư. Chọn vật tư bên dưới để thêm.</p>';
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
  const lines = recipeEdit.lines.filter((l) => Number(l.qty) > 0).map((l) => ({ materialId: l.materialId, qty: Math.round(Number(l.qty) * 100) / 100 }));
  const payload = { id: recipeEdit.item.id, menuItemId: recipeEdit.item.id, menuName: recipeEdit.item.name, lines, updatedAt: Date.now(), updatedBy: state.user?.email || "" };
  try {
    await setDoc(doc(db, ...root, "recipes", recipeEdit.item.id), payload);
    state.recipes[recipeEdit.item.id] = payload;
    $("#recipe-dialog").close();
    renderRecipes();
  } catch (error) { $("#recipe-error").textContent = error.code === "permission-denied" ? "Không có quyền lưu công thức (cần mở quy tắc Firestore cho recipes)." : error.message; }
}
$("#reload-recipes").addEventListener("click", () => { state.recipesLoaded = false; loadRecipes(); });
$("#close-recipe").addEventListener("click", () => $("#recipe-dialog").close());
$("#recipe-save").addEventListener("click", saveRecipe);
$("#recipe-draft").addEventListener("click", () => { recipeEdit.lines = draftRecipeFor(recipeEdit.item.name); renderRecipeLines(); });
$("#recipe-add").addEventListener("click", () => {
  const id = $("#recipe-add-select").value;
  if (!id) return;
  const m = materialById.get(id);
  recipeEdit.lines.push({ materialId: id, qty: m.base === "g" || m.base === "ml" ? 10 : 1 });
  renderRecipeLines();
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
    note.textContent = `Đã tạo ${list.length} phiếu demo (đợt ${batch}, theo ${source}).`;
    if (state.demo) { state.demo.stash && Object.assign(state, { expenseReceipts: list }); render(); } else await setDemo(true);
  } catch (error) { note.textContent = demoError(error); }
}
async function deleteDemo() {
  const note = $("#demo-note");
  try {
    const list = await readDemoReceipts();
    if (!list.length) { note.textContent = "Không có phiếu demo nào."; return; }
    if (!window.confirm(`Xoá hẳn ${list.length} phiếu demo? Chỉ xoá phiếu trong mục demo, phiếu chi thật không bị đụng.`)) return;
    note.textContent = `Đang xoá ${list.length} phiếu demo…`;
    for (let i = 0; i < list.length; i += 400) {
      const batchWrite = writeBatch(db);
      list.slice(i, i + 400).forEach((r) => batchWrite.delete(doc(db, ...root, DEMO_COLLECTION, r.id)));
      await batchWrite.commit();
    }
    note.textContent = `Đã xoá ${list.length} phiếu demo.`;
    if (state.demo) { state.expenseReceipts = []; render(); }
  } catch (error) { note.textContent = demoError(error); }
}
$("#demo-toggle").addEventListener("click", () => setDemo(!state.demo));
$("#demo-create").addEventListener("click", createDemo);
$("#demo-delete").addEventListener("click", deleteDemo);

/* ---------- Nhập so với định mức (7 ngày): lượng mua thực tế so với lượng lẽ ra phải dùng theo công thức ---------- */
function renderUsageCheck() {
  const host = $("#usage-check");
  if (!host) return;
  const { sales, source } = state.demo && !Object.keys(averageDailySales(state.dailyDocs, dailyKeys(7))).length ? { sales: DEFAULT_DAILY_SALES, source: "lượng bán giả định của bộ demo" } : salesForDemo();
  const usage = dailyMaterialUsage(sales, recipeByName);
  const to = new Date(); const toMs = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).getTime();
  const fromMs = toMs - 7 * 86400000;
  const rowsUsage = usageVsPurchase({ receipts: state.expenseReceipts, usagePerDay: usage, from: fromMs, to: toMs });
  const fmt = (q, base) => (base === "g" || base === "ml") ? `${(q / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ${base === "g" ? "kg" : "lít"}` : `${Math.round(q * 10) / 10} ${base}`;
  const chip = (r) => r.ratio === null ? '<span class="cost-chip unknown">không có định mức</span>' : `<span class="cost-chip ${r.ratio > 1.25 || r.ratio < 0.6 ? "bad" : r.ratio > 1.1 || r.ratio < 0.85 ? "warn" : "ok"}">${Math.round(r.ratio * 100)}%</span>`;
  $("#usage-note").textContent = `Định mức tính từ ${source} × công thức. Đồ khô mua theo tuần (cà phê, sữa, gia vị) cần xem khoảng dài hơn mới đúng; đồ tươi (thịt, rau, bánh mì) xem 7 ngày là được.`;
  host.innerHTML = rowsUsage.length ? `<div class="table-wrap"><table class="mat-table"><thead><tr><th>Vật tư</th><th>Định mức 7 ngày</th><th>Thực nhập</th><th>Nhập / định mức</th></tr></thead><tbody>${rowsUsage.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${r.expected ? fmt(r.expected, r.base) : "—"}</td><td>${r.bought ? fmt(r.bought, r.base) : "chưa nhập"}</td><td>${chip(r)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Chưa có phiếu chi chi tiết trong 7 ngày.</p>';
}

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

/* ---------- Chia tab: mỗi tab là một trang riêng theo #hash, nút Back của trình duyệt hoạt động ---------- */
const TABS = ["ban", "doanhthu", "bill", "thanhtoan", "taichinh", "giavon"];
function showTab() {
  const name = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "ban";
  document.querySelectorAll(".page").forEach((page) => { page.hidden = page.dataset.page !== name; });
  document.querySelectorAll("#tabbar [data-tab]").forEach((link) => link.classList.toggle("active", link.dataset.tab === name));
  window.scrollTo(0, 0);
  if (name === "giavon" && state.user && !state.recipesLoaded) loadRecipes();
}
window.addEventListener("hashchange", showTab);
showTab();

onAuthStateChanged(auth, (user) => {
  state.user = user || null;
  $("#login-view").hidden = Boolean(user);
  $("#dashboard-view").hidden = !user;
  if (user) refreshDashboard();
});
