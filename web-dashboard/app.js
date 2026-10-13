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
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { matchesPayer, normalizePayer } from "./payer-filter.js?v=20261012-3";
import { buildCancelledReceipt, buildEditedReceipt, calculateReceiptTotal, createStableDraft, receiptToDraft, validateReceipt } from "./expense-domain.js?v=20261013-2";
import { shouldMarkSnapshotStale } from "./dashboard-snapshot.js?v=20261012-3";
import { normalizeMaterial, materialMatches, materialRank, filterMaterialOptions } from "./material-search.js?v=20261012-3";
import { aggregateItems, dailyKeys, dateKeyOf, liveSummary, serviceStatusLabel, summarizeDaily } from "./sales-snapshot-view.js?v=20261013-1";

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
  unsubs: [], dailyDocs: {}, dailyError: "", salesLoaded: false, salesDays: 7, itemMode: "combined", period: "today", customFrom: null, customTo: null,
  transactionKind: "ALL", payerFilter: "ALL", user: null,
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
}));

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
  const bills = state.bills.filter((b) => b.status === "PAID" && inRange(b.closedAt, range));
  const allPurchases = expenseRows().filter((p) => p.status !== "DELETED" && inRange(p.purchasedAt, range));
  const purchases = allPurchases.filter((p) => matchesPayer(state.payerFilter, p.paidByName));
  const movements = state.movements.filter((m) => inRange(m.occurredAt, range) && matchesPayer(state.payerFilter, m.counterpartyName));
  const snapshotRevenue = range.label === "Hôm nay" ? Number(state.dashboard.revenueToday || 0) : range.label === "Tháng này" ? Number(state.dashboard.monthRevenue || 0) : 0;
  const snapshotBillCount = range.label === "Hôm nay" ? Number(state.dashboard.paidBillsToday || 0) : 0;
  const revenue = bills.length ? bills.reduce((s, b) => s + Number(b.total || 0), 0) : snapshotRevenue;
  const billCount = bills.length || !snapshotBillCount ? bills.length : snapshotBillCount;
  const expense = allPurchases.reduce((s, p) => s + Number(p.total || 0), 0);
  const selectedPayerExpense = purchases.reduce((s, p) => s + Number(p.total || 0), 0);
  const additionalInvestment = allPurchases.filter((p) => INVESTMENT_CATEGORIES.has(p.expenseCategory)).reduce((s, p) => s + Number(p.total || 0), 0);
  const operatingExpense = expense - additionalInvestment;
  const movementNet = movements.reduce((s, m) => s + (MOVEMENT_OUT_TYPES.has(m.type) ? -Number(m.amount || 0) : Number(m.amount || 0)), 0);
  const cards = [
    ["Doanh thu", money(revenue)],
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
  const missing = dailyKeys(state.salesDays).filter((key) => !(key in state.dailyDocs));
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
    .map((p) => ({ kind: "EXPENSE", at: Number(p.purchasedAt || 0), id: p.id, amount: Number(p.total || 0), title: EXPENSE_LABELS[p.expenseCategory] || "Phiếu chi", person: p.paidByName || "", note: p.note || "" }));
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
  const values = field === "expenseGroup" ? MATERIAL_GROUPS.map(([, name]) => name) : field === "unit" ? MATERIAL_UNITS : [...new Set([...savedMaterials().map((x) => x.materialName), ...(expenseDraft?.items || []).map((x) => x.materialName)].filter(Boolean))];
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
  const group = groupLabel(item.expenseGroup);
  return `<article class="expense-line" data-line-id="${id}"><label>Tên vật tư<input data-field="materialName" list="materials-${id}" maxlength="120" value="${safe(item.materialName)}" required autocomplete="off" /><datalist id="materials-${id}"></datalist></label><div class="two-col"><label>Mã vật tư<input data-field="materialCode" maxlength="40" value="${safe(item.materialCode)}" readonly /></label><label>Nhóm vật tư<input data-field="expenseGroup" list="groups-${id}" value="${safe(group)}" required autocomplete="off" /><datalist id="groups-${id}"></datalist></label></div><div class="two-col"><label>Số lượng<input data-field="qty" type="number" min="0.001" step="0.001" value="${Number(item.qty || 0)}" /></label><label>Đơn vị tính<input data-field="unit" list="units-${id}" maxlength="20" value="${safe(item.unit || "kg")}" required autocomplete="off" /><datalist id="units-${id}"></datalist></label></div><label>Đơn giá<input data-field="unitPrice" type="number" min="0" step="1" value="${Number(item.unitPrice || 0)}" /></label><button type="button" class="text-button" data-remove-line="${id}">Bỏ dòng</button></article>`;
}
function renderExpenseDraft() {
  if (!expenseDraft) return;
  $("#expense-date").value = localDateTimeInput(new Date(expenseDraft.purchaseDate));
  $("#expense-note").value = expenseDraft.note || "";
  $("#expense-lines").innerHTML = expenseDraft.items.map(expenseLineMarkup).join("");
  setupMaterialSuggestions();
  $("#expense-total").textContent = money(calculateReceiptTotal(expenseDraft.items));
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
    const group = groupLabel(read("expenseGroup"));
    let code = read("materialCode");
    if (!read("materialName").trim()) code = "";
    else {
      if (existing.materialName && normalizeMaterial(existing.materialName) !== normalizeMaterial(read("materialName"))) code = "";
      if (!code) {
      const known = savedMaterials().find((item) => normalizeMaterial(item.materialName) === normalizeMaterial(read("materialName")));
      code = known?.materialCode || nextMaterialCode(group);
      while (allocated.has(code) && !known) code = nextMaterialCode(group);
      allocated.add(code);
      }
    }
    node.querySelector("[data-field=materialCode]").value = code;
    return { ...existing, materialName: read("materialName"), materialCode: code, expenseGroup: group, qty: Number(read("qty")), unit: read("unit"), unitPrice: Number(read("unitPrice")) };
  });
  if (state.user && !editingReceipt) localStorage.setItem(`pos0210.expense-draft.${state.user.uid}`, JSON.stringify(expenseDraft));
}
async function saveExpenseReceipt(event) {
  event.preventDefault(); applyExpenseInputs(); const error = $("#expense-error"); error.textContent = "";
  const check = validateReceipt(expenseDraft); if (!check.ok) { error.textContent = check.error; return; }
  const now = Date.now();
  const payload = editingReceipt
    ? buildEditedReceipt(editingReceipt, expenseDraft, { now, uid: state.user.uid })
    : { ...expenseDraft, total: check.total, status: "ACTIVE", updatedAt: now, updatedByUid: state.user.uid, source: "WEB_MANAGER", items: expenseDraft.items.map((item) => ({ ...item, materialGroup: item.expenseGroup, amount: Math.round(item.qty * item.unitPrice) })) };
  try {
    await setDoc(doc(db, ...root, "expenseReceipts", expenseDraft.id), payload);
    rememberMaterials(expenseDraft.items);
    if (editingReceipt) { replaceLocalReceipt(payload); editingReceipt = null; render(); }
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
  try { await setDoc(doc(db, ...root, "expenseReceipts", id), payload); replaceLocalReceipt(payload); render(); }
  catch (e) { window.alert(`Chưa huỷ được phiếu: ${e.message || e}`); }
}

function render() {
  renderCumulativeSummary();
  renderPeriodSummary();
  renderTables();
  renderSalesSnapshots();
  renderFinanceMetadata();
  renderTransactions();
}
async function refreshDashboard() {
  if (!state.user) return;
  $("#sync-status").textContent = "Đang đọc snapshot…";
  try {
    const dashboardDoc = await getDoc(doc(db, ...root, "dashboard", "current"));
    state.dashboard = dashboardDoc.exists() ? dashboardDoc.data() : {};
    state.dailyDocs = {};
    const hasLiveTables = Array.isArray(state.dashboard.liveTables);
    if (hasLiveTables) state.tables = [];
    const sevenDays = startOfDay(new Date(Date.now() - 6 * 86400000));
    const read = async (name, key, q = null) => { const snapshot = await getDocs(q || collection(db, ...root, name)); state[key] = rows(snapshot); };
    await Promise.all([
      hasLiveTables ? Promise.resolve() : read("tableStatus", "tables"),
      loadDailyDocs(),
      read("expenseReceipts", "expenseReceipts", query(collection(db, ...root, "expenseReceipts"), where("purchaseDate", ">=", sevenDays), orderBy("purchaseDate", "desc"), limit(300))),
      read("financialMovements", "movements", query(collection(db, ...root, "financialMovements"), where("occurredAt", ">=", sevenDays), orderBy("occurredAt", "desc"), limit(300))),
      read("costCodes", "costCodes"), read("purchaseCategories", "purchaseCategories"), read("profitPartners", "profitPartners"), read("assetCategories", "assetCategories"), read("suppliers", "suppliers"),
    ]);
    state.salesLoaded = true;
    const stale = shouldMarkSnapshotStale(state.dashboard.lastUpdatedAt);
    $("#sync-status").textContent = state.dashboard.lastUpdatedAt ? `Snapshot POS: ${dateTime(state.dashboard.lastUpdatedAt)}${stale ? " · cần kiểm tra máy POS" : ""}` : "POS chưa gửi snapshot.";
    render();
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
  catch (error) { $("#login-error").textContent = "Không đăng nhập được. Kiểm tra email hoặc mật khẩu."; }
});
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
  $("#expense-title").textContent = "Phiếu nhiều vật tư";
  $("#expense-submit").textContent = "LƯU VÀ ĐỒNG BỘ";
  expenseDraft = createStableDraft(localStorage, state.user, uuid);
  expenseDraft.items = expenseDraft.items.map(item => ({ ...item, expenseGroup: groupLabel(item.expenseGroup) }));
  $("#expense-error").textContent = "";
  renderExpenseDraft();
  $("#expense-dialog").showModal();
});
$("#close-expense").addEventListener("click", () => {
  if (editingReceipt) { editingReceipt = null; expenseDraft = null; $("#expense-dialog").close(); return; }
  applyExpenseInputs(); renderExpenseDraft(); $("#expense-dialog").close();
});
$("#expense-dialog").addEventListener("close", () => { if (editingReceipt) { editingReceipt = null; expenseDraft = null; } });
$("#transactions").addEventListener("click", (event) => {
  const edit = event.target.closest?.("[data-edit-receipt]");
  if (edit) { openReceiptEditor(edit.dataset.editReceipt); return; }
  const cancel = event.target.closest?.("[data-cancel-receipt]");
  if (cancel) cancelReceipt(cancel.dataset.cancelReceipt);
});
$("#add-expense-line").addEventListener("click", () => { applyExpenseInputs(); expenseDraft.items.push({ id: uuid(), materialName: "", materialCode: "", expenseGroup: "Thịt, gia cầm", qty: 1, unit: "kg", unitPrice: 0 }); renderExpenseDraft(); });
$("#expense-lines").addEventListener("click", (event) => { const id = event.target.dataset.removeLine; if (!id || expenseDraft.items.length < 2) return; applyExpenseInputs(); expenseDraft.items = expenseDraft.items.filter((item) => item.id !== id); renderExpenseDraft(); });
$("#expense-lines").addEventListener("input", (event) => { applyExpenseInputs(); if (event.target.matches("input[list]")) updateMaterialSuggestions(event.target); $("#expense-total").textContent = money(calculateReceiptTotal(expenseDraft.items)); });
$("#expense-lines").addEventListener("change", (event) => { const input = event.target; if (input.matches("[data-field=materialName]")) { const found = savedMaterials().find((item) => normalizeMaterial(item.materialName) === normalizeMaterial(input.value)); if (found) { const line = input.closest(".expense-line"); for (const [field, value] of [["materialCode", found.materialCode], ["expenseGroup", found.expenseGroup], ["unit", found.unit]]) line.querySelector(`[data-field="${field}"]`).value = value; applyExpenseInputs(); } return; } if (!input.matches("[data-field=expenseGroup]")) return; const line = input.closest(".expense-line"); if (!MATERIAL_GROUPS.some(([, name]) => name === input.value)) { input.setCustomValidity("Chọn nhóm vật tư trong danh sách"); return; } input.setCustomValidity(""); const code = line.querySelector("[data-field=materialCode]"); if (line.querySelector("[data-field=materialName]").value.trim()) { const known = savedMaterials().find((item) => normalizeMaterial(item.materialName) === normalizeMaterial(line.querySelector("[data-field=materialName]").value)); if (!known) code.value = nextMaterialCode(input.value); } applyExpenseInputs(); });
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
});
$("#apply-range").addEventListener("click", () => {
  const from = $("#from-date").value;
  const to = $("#to-date").value;
  if (!from || !to) return;
  state.customFrom = startOfDay(new Date(`${from}T00:00:00`));
  state.customTo = endOfDay(new Date(`${to}T00:00:00`));
  render();
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

onAuthStateChanged(auth, (user) => {
  state.user = user || null;
  $("#login-view").hidden = Boolean(user);
  $("#dashboard-view").hidden = !user;
  if (user) refreshDashboard();
});
