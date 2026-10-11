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
  onSnapshot,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { matchesPayer, normalizePayer } from "./payer-filter.js";

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
  bills: [], purchases: [], purchaseItems: [], movements: [], costCodes: [],
  purchaseCategories: [], profitPartners: [], assetCategories: [], suppliers: [],
  unsubs: [], period: "today", customFrom: null, customTo: null,
  transactionKind: "ALL", payerFilter: "ALL", user: null,
};

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
  return { table, occupied, session, batches, items, total: items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.qty || 0), 0) };
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
  const allPurchases = state.purchases.filter((p) => p.status !== "DELETED" && inRange(p.purchasedAt, range));
  const purchases = allPurchases.filter((p) => matchesPayer(state.payerFilter, p.paidByName));
  const movements = state.movements.filter((m) => inRange(m.occurredAt, range) && matchesPayer(state.payerFilter, m.counterpartyName));
  const revenue = bills.reduce((s, b) => s + Number(b.total || 0), 0);
  const expense = allPurchases.reduce((s, p) => s + Number(p.total || 0), 0);
  const selectedPayerExpense = purchases.reduce((s, p) => s + Number(p.total || 0), 0);
  const additionalInvestment = allPurchases.filter((p) => INVESTMENT_CATEGORIES.has(p.expenseCategory)).reduce((s, p) => s + Number(p.total || 0), 0);
  const operatingExpense = expense - additionalInvestment;
  const movementNet = movements.reduce((s, m) => s + (MOVEMENT_OUT_TYPES.has(m.type) ? -Number(m.amount || 0) : Number(m.amount || 0)), 0);
  const cards = [
    ["Doanh thu", money(revenue)],
    ["Số bill", bills.length],
    ["Bill trung bình", money(bills.length ? Math.round(revenue / bills.length) : 0)],
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
    ...state.purchases.map((p) => normalizePayer(p.paidByName)).filter(Boolean),
    ...state.movements.map((m) => normalizePayer(m.counterpartyName)).filter(Boolean),
  ])].sort((a,b)=>a.localeCompare(b,"vi"));
  const payerSelect = $("#payer-filter");
  const currentFilter = state.payerFilter;
  payerSelect.replaceChildren(new Option("Tất cả người chi", "ALL"), ...payerNames.map((name)=>new Option(name,name)));
  if ([...state.purchases.map((p)=>p.paidByName), ...state.movements.map((m)=>m.counterpartyName)].some((name)=>!normalizePayer(name))) payerSelect.append(new Option("Chưa xác định","UNKNOWN"));
  payerSelect.value = [...payerSelect.options].some((o)=>o.value===currentFilter) ? currentFilter : "ALL";
  state.payerFilter = payerSelect.value;
}

function renderTransactions() {
  const range = rangeForPeriod();
  const purchases = state.purchases
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
    node.innerHTML = `<div><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(meta)}</small><p>${escapeHtml(r.note)}</p></div><b>${money(r.amount)}</b>`;
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

function render() {
  renderCumulativeSummary();
  renderPeriodSummary();
  renderTables();
  renderFinanceMetadata();
  renderTransactions();
}
function clearListeners() { state.unsubs.splice(0).forEach((unsubscribe) => unsubscribe()); }
function subscribe() {
  clearListeners();
  const watch = (path, key, transform = rows) => state.unsubs.push(onSnapshot(path, (snapshot) => { state[key] = transform(snapshot); render(); }, (error) => { $("#sync-status").textContent = `Không đọc được dữ liệu: ${error.message}`; }));
  watch(doc(db, ...root, "dashboard", "current"), "dashboard", (snapshot) => snapshot.exists() ? snapshot.data() : {});
  watch(collection(db, ...root, "tableStatus"), "tables");
  watch(collection(db, ...root, "sessions"), "sessions");
  watch(collection(db, ...root, "orderBatches"), "batches");
  watch(collection(db, ...root, "orderItems"), "items");
  watch(collection(db, ...root, "bills"), "bills");
  watch(collection(db, ...root, "purchases"), "purchases");
  watch(collection(db, ...root, "purchaseItems"), "purchaseItems");
  watch(collection(db, ...root, "financialMovements"), "movements");
  watch(collection(db, ...root, "costCodes"), "costCodes");
  watch(collection(db, ...root, "purchaseCategories"), "purchaseCategories");
  watch(collection(db, ...root, "profitPartners"), "profitPartners");
  watch(collection(db, ...root, "assetCategories"), "assetCategories");
  watch(collection(db, ...root, "suppliers"), "suppliers");
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
  if (user) subscribe(); else clearListeners();
});
