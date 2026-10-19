import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { APP_CHECK_SITE_KEY, DEFAULT_SHOP, STORE_ID, STORE_OWNER_UID, firebaseConfig } from "./config.js";
import {
  FINAL_STATUSES, LIMITS, MODE_LABELS, STATUS, STATUS_TEXT, buildOrderDoc, cartFromOrder, cartLines, changeQty, countdownText, isOrderable,
  limitKeyForPhone, limitKeyForUid, linesCount, linesTotal, makeOrderCode, menuSections, money, orderView, pendingBase, progressSteps, rememberCode,
  setNote, toMillis, validateCheckout,
} from "./order-core.js";
import { vietQrPayload } from "./vietqr.js";
import { qrSvg } from "./qr.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ---------- Firebase ---------- */
const app = initializeApp(firebaseConfig);
// Tự chuyển sang long-polling khi mạng/trình duyệt trong Zalo, Messenger chặn streaming.
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
const auth = getAuth(app);
const root = ["users", STORE_OWNER_UID, "stores", STORE_ID];
const col = (name) => collection(db, ...root, name);
const ref = (name, id) => doc(db, ...root, name, id);

if (APP_CHECK_SITE_KEY) {
  import("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-check.js")
    .then(({ initializeAppCheck, ReCaptchaV3Provider }) => initializeAppCheck(app, { provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true }))
    .catch(() => { /* App Check lỗi thì vẫn chạy: bảo vệ chính là Firestore Rules */ });
}

/* ---------- Lưu tạm trên máy khách (có thể bị chặn trong trình duyệt nhúng: luôn bọc try/catch) ---------- */
const store = {
  get(key, fallback = null) { try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* đầy hoặc bị chặn: bỏ qua */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* bỏ qua */ } },
};
const KEYS = { cart: "pos0210o.cart", codes: "pos0210o.codes", profile: "pos0210o.profile", menu: "pos0210o.menu3", thumbs: "pos0210o.thumbs", hist: "pos0210o.hist" };
const MENU_TTL = 5 * 60_000;
const THUMB_TTL = 24 * 3_600_000;

const state = {
  uid: null,
  shop: { ...DEFAULT_SHOP },
  items: [],
  cats: [],
  thumbs: {},
  cart: store.get(KEYS.cart, {}) || {},
  clockOffset: 0,
  watch: null,
  order: null,
  code: null,
  submitting: false,
  sheetOpen: false,
  catFilter: "",
};

const serverNow = () => Date.now() + state.clockOffset;
const menuById = () => Object.fromEntries(state.items.map((m) => [m.id, m]));
const catById = () => Object.fromEntries(state.cats.map((c) => [c.id, c]));
const currentLines = () => cartLines(state.cart, menuById(), catById());

/* ---------- Giờ máy chủ: đồng hồ điện thoại khách có thể sai, nên lấy chênh lệch từ header Date của chính trang ---------- */
async function syncClock() {
  try {
    const started = Date.now();
    const response = await fetch(`${location.pathname}?_=${started}`, { method: "HEAD", cache: "no-store" });
    const header = response.headers.get("date");
    if (!header) return;
    const server = new Date(header).getTime();
    if (Number.isFinite(server)) state.clockOffset = server - (started + Date.now()) / 2;
  } catch { /* giữ chênh lệch cũ */ }
}

/* ---------- Đăng nhập ẩn danh (không cần khách làm gì) ---------- */
let authReady;
const authPromise = new Promise((resolve) => { authReady = resolve; });
onAuthStateChanged(auth, (user) => { if (user) { state.uid = user.uid; authReady(user.uid); } });
signInAnonymously(auth).catch((error) => { state.authError = error; authReady(null); });
const ensureUid = async () => (await authPromise) || state.uid;

/* ---------- Thông tin quán ---------- */
async function loadShop() {
  try {
    const snap = await getDoc(ref("online_config", "shop"));
    if (snap.exists()) state.shop = { ...DEFAULT_SHOP, ...snap.data() };
  } catch { /* dùng mặc định */ }
  renderShop();
}

function renderShop() {
  const s = state.shop;
  const name = String(s.name || DEFAULT_SHOP.name);
  document.title = `Đặt món online · ${name}`;
  $("#shop-name").textContent = name;
  $("#shop-tagline").textContent = s.tagline || "";
  $("#shop-tagline").hidden = !s.tagline;
  $("#track-name").textContent = name;
  const rows = [];
  if (s.address) rows.push(["Địa chỉ", `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}" target="_blank" rel="noopener">${esc(s.address)}</a>`]);
  if (s.phone) rows.push(["Điện thoại", `<a href="tel:${esc(String(s.phone).replace(/[^\d+]/g, ""))}">${esc(s.phone)}</a>`]);
  if (s.hours) rows.push(["Giờ mở cửa", esc(s.hours)]);
  $("#shop-info").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  $("#shop-info").hidden = !rows.length;
  const closed = s.orderingEnabled === false;
  $("#closed-banner").hidden = !closed && !s.notice;
  $("#closed-banner").textContent = closed ? (s.notice || "Quán tạm ngưng nhận đơn online. Vui lòng quay lại sau.") : s.notice || "";
  $("#closed-banner").classList.toggle("warn", closed);
  renderCartBar();
}

/* ---------- Menu ---------- */
function applyMenu(items, cats) {
  state.items = items;
  state.cats = cats;
  // Dọn giỏ: món đã tắt/xoá sau lần mở trước thì bỏ khỏi giỏ.
  const ok = menuById();
  const cats2 = catById();
  let changed = false;
  for (const id of Object.keys(state.cart)) {
    if (!isOrderable(ok[id], cats2[ok[id]?.categoryId])) { delete state.cart[id]; changed = true; }
  }
  if (changed) store.set(KEYS.cart, state.cart);
  renderMenu();
  renderCartBar();
}

async function loadMenu(force = false) {
  const cached = store.get(KEYS.menu);
  if (cached && cached.items && Date.now() - cached.at < MENU_TTL && !force) applyMenu(cached.items, cached.cats);
  else if (cached && cached.items && !state.items.length) applyMenu(cached.items, cached.cats); // hiện bản cũ trong lúc tải bản mới
  if (!force && cached && Date.now() - cached.at < MENU_TTL) { loadThumbs(); return; }
  try {
    const [itemSnap, catSnap, hiddenSnap] = await Promise.all([getDocs(col("menu")), getDocs(col("menuCategories")), getDoc(ref("online_config", "menu")).catch(() => null)]);
    // Món chủ quán đã ẩn khỏi đặt món online: loại hẳn, không vào bộ nhớ đệm, không hiển thị dưới bất kỳ dạng nào.
    const hidden = new Set(Array.isArray(hiddenSnap?.data?.()?.hidden) ? hiddenSnap.data().hidden : []);
    const cats = catSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const catOff = new Set(cats.filter((c) => c.active === false).map((c) => c.id));
    // Món ngừng bán (active=false), món thuộc nhóm đang tắt, món bị ẩn riêng: loại hẳn, không hiện mờ.
    const items = itemSnap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((m) => m.deleted !== true && m.name && m.active !== false && !hidden.has(m.id) && !catOff.has(m.categoryId));
    store.set(KEYS.menu, { at: Date.now(), items, cats });
    applyMenu(items, cats);
    $("#menu-error").hidden = true;
    $("#menu-retry").hidden = true;
  } catch (error) {
    if (!state.items.length) {
      $("#menu-error").hidden = false;
      $("#menu-retry").hidden = false;
      $("#menu-error").textContent = "Không tải được menu. Vui lòng kiểm tra mạng rồi bấm Thử lại.";
    }
  }
  loadThumbs();
}

async function loadThumbs() {
  const cached = store.get(KEYS.thumbs);
  if (cached && Date.now() - cached.at < THUMB_TTL) { state.thumbs = cached.map || {}; renderMenu(); return; }
  if (cached?.map) { state.thumbs = cached.map; renderMenu(); }
  try {
    const snap = await getDocs(col("menuThumbs"));
    const map = {};
    snap.docs.forEach((d) => { const t = d.data().thumb; if (typeof t === "string" && t.startsWith("data:image/")) map[d.id] = t; });
    state.thumbs = map;
    store.set(KEYS.thumbs, { at: Date.now(), map });
    renderMenu();
  } catch { /* không có ảnh vẫn đặt được */ }
}

function dishHtml(item, cat) {
  const entry = state.cart[item.id];
  const sellable = isOrderable(item, cat);
  const thumb = state.thumbs[`menu_${item.id}`] || state.thumbs[item.id];
  const img = thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" width="72" height="72" />` : `<span class="dish-initial">${esc(String(item.name).trim().charAt(0).toUpperCase())}</span>`;
  const control = !sellable
    ? `<span class="soldout">Tạm hết</span>`
    : entry
      ? `<div class="stepper"><button type="button" data-act="dec" data-id="${esc(item.id)}" aria-label="Bớt 1 ${esc(item.name.trim())}">−</button><b aria-live="polite">${entry.qty}</b><button type="button" data-act="inc" data-id="${esc(item.id)}" aria-label="Thêm 1 ${esc(item.name.trim())}">+</button></div>`
      : `<button type="button" class="add" data-act="inc" data-id="${esc(item.id)}">Thêm</button>`;
  const note = sellable && entry ? `<input class="dish-note" data-note="${esc(item.id)}" maxlength="${LIMITS.maxLineNote}" placeholder="Ghi chú món (ít đá, ít ngọt…)" value="${esc(entry.note)}" autocomplete="off" />` : "";
  return `<article class="dish${sellable ? "" : " off"}" data-dish="${esc(item.id)}"><div class="dish-img">${img}</div><div class="dish-body"><h3>${esc(item.name.trim())}</h3>${item.description ? `<p class="desc">${esc(item.description)}</p>` : ""}<b class="price">${money(item.price)}</b></div><div class="dish-ctl">${control}</div>${note}</article>`;
}

function renderMenu() {
  const sections = menuSections(state.items, state.cats);
  const cats = catById();
  $("#cat-chips").innerHTML = sections.length > 1
    ? sections.map((s) => `<a href="#cat-${esc(s.id)}" data-cat="${esc(s.id)}">${esc(s.name)}</a>`).join("")
    : "";
  $("#menu").innerHTML = sections.map((s) => `<section class="menu-section" id="cat-${esc(s.id)}"><h2>${esc(s.name)}</h2>${s.items.map((m) => dishHtml(m, cats[m.categoryId])).join("")}</section>`).join("")
    || (state.items.length ? "" : '<p class="muted center">Đang tải menu…</p>');
}

function refreshDish(id) {
  const item = menuById()[id];
  const node = document.querySelector(`[data-dish="${CSS.escape(id)}"]`);
  if (!item || !node) return;
  const focusNote = document.activeElement?.dataset?.note === id;
  node.outerHTML = dishHtml(item, catById()[item.categoryId]);
  if (focusNote) document.querySelector(`[data-note="${CSS.escape(id)}"]`)?.focus();
}

/* ---------- Giỏ hàng ---------- */
function persistCart() { store.set(KEYS.cart, state.cart); }

function renderCartBar() {
  const lines = currentLines();
  const bar = $("#cartbar");
  const closed = state.shop.orderingEnabled === false;
  bar.hidden = !lines.length || !$("#screen-track").hidden;
  $("#cart-count").textContent = `${linesCount(lines)} món`;
  $("#cart-total").textContent = money(linesTotal(lines));
  $("#cart-open").disabled = closed;
  $("#cart-open").textContent = closed ? "Tạm ngưng nhận đơn" : "Xem giỏ & đặt";
  document.body.classList.toggle("has-cart", !bar.hidden);
}

function sheetLinesHtml(lines) {
  return lines.map((l) => `<li><div><b>${esc(l.name.trim())}</b>${l.note ? `<small>${esc(l.note)}</small>` : ""}</div><div class="stepper small"><button type="button" data-sheet="dec" data-id="${esc(l.id)}" aria-label="Bớt 1">−</button><b>${l.qty}</b><button type="button" data-sheet="inc" data-id="${esc(l.id)}" aria-label="Thêm 1">+</button></div><span class="line-amount">${money(l.price * l.qty)}</span></li>`).join("");
}

function renderSheet() {
  const lines = currentLines();
  $("#sheet-lines").innerHTML = sheetLinesHtml(lines);
  $("#sheet-total").textContent = money(linesTotal(lines));
  $("#submit-total").textContent = money(linesTotal(lines));
  if (!lines.length) closeSheet();
}

function openSheet() {
  const profile = store.get(KEYS.profile, {}) || {};
  const form = $("#order-form");
  if (!form.name.value) form.name.value = profile.name || "";
  if (!form.phone.value) form.phone.value = profile.phone || "";
  if (!form.address.value) form.address.value = profile.address || "";
  if (profile.delivery) form.receive.value = "delivery";
  syncReceiveFields();
  clearErrors();
  state.sheetOpen = true;
  $("#sheet").hidden = false;
  document.body.classList.add("sheet-open");
  renderSheet();
}

function closeSheet() {
  state.sheetOpen = false;
  $("#sheet").hidden = true;
  document.body.classList.remove("sheet-open");
}

function syncReceiveFields() {
  const delivery = $("#order-form").receive.value === "delivery";
  $("#field-address").hidden = !delivery;
  $("#field-table").hidden = delivery;
}

function clearErrors() {
  document.querySelectorAll("[data-error]").forEach((n) => { n.textContent = ""; });
  $("#form-message").textContent = "";
  $("#form-message").className = "form-message";
}

function showErrors(errors) {
  clearErrors();
  for (const [field, message] of Object.entries(errors)) {
    const node = document.querySelector(`[data-error="${field}"]`);
    if (node) node.textContent = message;
  }
  const first = Object.keys(errors)[0];
  const target = first && $("#order-form").elements[first];
  if (target?.focus) target.focus();
  if (errors.cart) { $("#form-message").textContent = errors.cart; $("#form-message").className = "form-message error"; }
}

/* ---------- Gửi đơn ---------- */
const isDenied = (error) => error?.code === "permission-denied";

async function readLimit(name, key) {
  try { const snap = await getDoc(ref(name, key)); return snap.exists() ? snap.data() : null; } catch { return null; }
}

function menuChanged(before, after) {
  const byId = Object.fromEntries(after.map((m) => [m.id, m]));
  return before.some((l) => { const m = byId[l.id]; return !m || m.price !== l.price || m.name !== l.name || m.active === false || m.deleted === true; });
}

async function submitOrder(event) {
  event.preventDefault();
  if (state.submitting) return;
  clearErrors();
  if (state.shop.orderingEnabled === false) { setFormMessage("Quán đang tạm ngưng nhận đơn online.", true); return; }
  const form = $("#order-form");
  const lines = currentLines();
  const checked = validateCheckout({
    name: form.name.value, phone: form.phone.value, delivery: form.receive.value === "delivery",
    address: form.address.value, table: form.table.value, note: form.note.value, lines,
  });
  if (!checked.ok) { showErrors(checked.errors); return; }
  state.submitting = true;
  const button = $("#submit");
  button.disabled = true;
  button.querySelector("span").textContent = "Đang gửi đơn…";
  const slow = setTimeout(() => setFormMessage("Mạng đang yếu, đơn vẫn đang được gửi. Vui lòng chờ, đừng bấm lại.", false), 12_000);
  try {
    const uid = await ensureUid();
    if (!uid) throw Object.assign(new Error("auth"), { code: "auth" });
    const result = await sendOrder(uid, checked.value, lines);
    store.set(KEYS.profile, { name: checked.value.name, phone: checked.value.phone, address: form.address.value.trim(), delivery: form.receive.value === "delivery" });
    store.set(KEYS.codes, rememberCode(store.get(KEYS.codes, []), result.code));
    store.set(KEYS.hist, rememberCode(store.get(KEYS.hist, []), result.code, 40));
    state.cart = {};
    persistCart();
    form.note.value = "";
    form.table.value = "";
    closeSheet();
    renderMenu();
    watchOrder(result.code);
  } catch (error) {
    handleSubmitError(error, lines);
  } finally {
    clearTimeout(slow);
    state.submitting = false;
    button.disabled = false;
    button.querySelector("span").textContent = "Gửi đơn";
  }
}

function setFormMessage(text, isError) {
  const node = $("#form-message");
  node.textContent = text;
  node.className = `form-message${isError ? " error" : ""}`;
}

/** Ghi đơn + 2 bộ đếm giới hạn trong MỘT batch (rules bắt buộc đi cùng nhau). Thử lại 1 lần với mã mới nếu bị từ chối. */
async function sendOrder(uid, value, lines) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const now = serverNow();
    const [uLimit, pLimit] = await Promise.all([readLimit("online_limits", limitKeyForUid(uid)), readLimit("online_limits", limitKeyForPhone(value.phone))]);
    const uBase = pendingBase(uLimit, now);
    const pBase = pendingBase(pLimit, now);
    if (uBase >= LIMITS.maxPendingOrders || pBase >= LIMITS.maxPendingOrders) throw Object.assign(new Error("limit"), { code: "limit" });
    const code = makeOrderCode();
    const batch = writeBatch(db);
    batch.set(ref("online_orders", code), { ...buildOrderDoc({ code, uid, value, lines }), createdAt: serverTimestamp() });
    batch.set(ref("online_limits", limitKeyForUid(uid)), { pending: uBase + 1, lastAt: serverTimestamp(), lastOrder: code });
    batch.set(ref("online_limits", limitKeyForPhone(value.phone)), { pending: pBase + 1, lastAt: serverTimestamp(), lastOrder: code });
    try {
      await batch.commit();
      return { code };
    } catch (error) {
      lastError = error;
      if (!isDenied(error)) throw error;
    }
  }
  throw lastError;
}

async function handleSubmitError(error, lines) {
  if (error?.code === "limit") {
    setFormMessage(`Bạn đang có ${LIMITS.maxPendingOrders} đơn chờ quán xác nhận hoặc chưa thanh toán. Vui lòng đợi các đơn đó xong rồi đặt tiếp${state.shop.phone ? `, hoặc gọi ${state.shop.phone}` : ""}.`, true);
    return;
  }
  if (isDenied(error)) {
    // Có thể quán vừa đổi giá/tắt món: đọc lại menu từ máy chủ để báo đúng nguyên nhân.
    try {
      const fresh = (await getDocs(col("menu"))).docs.map((d) => ({ ...d.data(), id: d.id }));
      if (menuChanged(lines, fresh)) {
        store.del(KEYS.menu);
        await loadMenu(true);
        renderSheet();
        setFormMessage("Quán vừa cập nhật menu (giá hoặc món). Vui lòng xem lại giỏ hàng rồi gửi lại.", true);
        return;
      }
    } catch { /* rơi xuống thông báo chung */ }
    setFormMessage(`Quán chưa nhận được đơn. Có thể bạn đang có đơn chờ, hoặc hệ thống từ chối tạm thời. Vui lòng thử lại sau ít phút${state.shop.phone ? ` hoặc gọi ${state.shop.phone}` : ""}.`, true);
    return;
  }
  if (error?.code === "auth") { setFormMessage("Không kết nối được hệ thống đặt món. Vui lòng tải lại trang.", true); return; }
  setFormMessage("Mạng không ổn định, chưa gửi được đơn. Vui lòng thử lại.", true);
}

/* ---------- Theo dõi đơn theo thời gian thực ---------- */
function stopWatch() { if (state.watch) { state.watch(); state.watch = null; } clearInterval(tickTimer); tickTimer = null; }
let tickTimer = null;

function watchOrder(code, { quiet = false } = {}) {
  stopWatch();
  state.code = code;
  state.order = null;
  if (!quiet) { showScreen("track"); renderTrack(); }
  state.watch = onSnapshot(
    ref("online_orders", code),
    (snap) => {
      if (!snap.exists()) { if (state.order) return; renderTrack(); return; } // vừa gửi: chờ máy chủ xác nhận
      const first = state.order === null;
      const wasStatus = state.order?.status;
      state.order = { ...snap.data(), id: snap.id };
      if (first && shouldDropOld(state.order)) { forgetCode(code); showScreen("menu"); stopWatch(); return; }
      // Mở lại link: đơn đã kết thúc thì KHÔNG bật màn theo dõi, chỉ nằm trong Lịch sử.
      if (first && quiet) {
        if (orderView(state.order, serverNow()).isFinal) { forgetCode(code); stopWatch(); showScreen("menu"); return; }
        showScreen("track");
      }
      if (state.order.status === STATUS.AWAITING_PAYMENT && wasStatus !== STATUS.AWAITING_PAYMENT) syncClock();
      renderTrack();
      startTick();
      updateBanner();
    },
    (error) => {
      if (isDenied(error)) { forgetCode(code); showScreen("menu"); stopWatch(); }
      else $("#track-body").insertAdjacentHTML("afterbegin", '<p class="notice">Đang mất kết nối, sẽ tự cập nhật khi có mạng lại.</p>');
    },
  );
}

const shouldDropOld = (order) => {
  const created = toMillis(order.createdAt);
  return FINAL_STATUSES.includes(order.status) && created && serverNow() - created > 2 * 3_600_000;
};

function forgetCode(code) { store.set(KEYS.codes, (store.get(KEYS.codes, []) || []).filter((c) => c !== code)); state.code = null; state.order = null; }

function startTick() {
  clearInterval(tickTimer);
  tickTimer = null;
  const view = state.order && orderView(state.order, serverNow());
  if (!view || view.rawStatus !== STATUS.AWAITING_PAYMENT) return;
  tickTimer = setInterval(() => {
    const v = orderView(state.order, serverNow());
    const node = $("#countdown");
    if (v.status !== STATUS.AWAITING_PAYMENT) { renderTrack(); clearInterval(tickTimer); tickTimer = null; return; }
    if (node) node.textContent = countdownText(v.remainingMs);
  }, 1000);
}

function copyButton(text, label) {
  return `<button type="button" class="copy" data-copy="${esc(text)}">${label}</button>`;
}

function paymentHtml(order) {
  const s = state.shop;
  if (!s.bank || !s.account) {
    return `<div class="pay-card"><p>Quán chưa cài tài khoản nhận tiền trên hệ thống. Vui lòng liên hệ quán${s.phone ? ` qua số ${esc(s.phone)}` : ""} để được hướng dẫn chuyển khoản.</p><p class="pay-amount">${money(order.total)}</p><p>Nội dung chuyển khoản: <b>${esc(order.transferContent)}</b></p></div>`;
  }
  let qr = "";
  try {
    qr = qrSvg(vietQrPayload({ bank: s.bank, account: s.account, holder: s.holder || s.name, amount: order.total, info: order.transferContent }), { level: "M" });
  } catch (error) {
    qr = `<p class="error">Không tạo được mã QR (${esc(error.message)}). Vui lòng chuyển khoản thủ công theo thông tin bên dưới.</p>`;
  }
  return `<div class="pay-card">
    <div class="qr">${qr}</div>
    <p class="pay-amount">${money(order.total)}</p>
    <dl class="pay-info">
      <div><dt>Ngân hàng</dt><dd>${esc(s.bank)}</dd></div>
      <div><dt>Số tài khoản</dt><dd><b>${esc(s.account)}</b> ${copyButton(s.account, "Sao chép")}</dd></div>
      <div><dt>Tên tài khoản</dt><dd><b>${esc(s.holder || s.name)}</b></dd></div>
      <div><dt>Nội dung</dt><dd><b>${esc(order.transferContent)}</b> ${copyButton(order.transferContent, "Sao chép")}</dd></div>
    </dl>
    <p class="muted small">Vui lòng kiểm tra đúng tên tài khoản của quán trước khi chuyển. Giữ nguyên nội dung chuyển khoản để quán đối chiếu.</p>
  </div>`;
}

function summaryHtml(order) {
  const lines = (order.items || []).map((l) => `<li><span>${l.qty}× ${esc(String(l.name).trim())}${l.note ? `<small>${esc(l.note)}</small>` : ""}</span><b>${money(l.price * l.qty)}</b></li>`).join("");
  const where = order.mode === "delivery" ? `Giao tới: ${esc(order.address)}` : order.mode === "dinein" ? `Tại quán · bàn ${esc(order.table)}` : "Mang đi";
  return `<details class="summary"><summary>Đơn ${esc(order.code)} · ${money(order.total)} · ${esc(MODE_LABELS[order.mode] || "")}</summary><ul>${lines}</ul><p class="muted small">${where}${order.note ? `<br>Ghi chú: ${esc(order.note)}` : ""}</p></details>`;
}

function progressHtml(order, view) {
  const steps = progressSteps(order);
  const index = steps.findIndex(([key]) => key === view.status);
  return `<ol class="progress">${steps.map(([key, label], i) => `<li class="${i < index ? "done" : i === index ? "now" : ""}">${label}</li>`).join("")}</ol>`;
}

function renderTrack() {
  const body = $("#track-body");
  const codes = store.get(KEYS.codes, []) || [];
  const chips = codes.length > 1 ? `<nav class="order-chips" aria-label="Đơn của bạn">${codes.map((c) => `<button type="button" class="${c === state.code ? "active" : ""}" data-switch="${esc(c)}">${esc(c)}</button>`).join("")}</nav>` : "";
  if (!state.order) {
    body.innerHTML = `${chips}<div class="status-card"><div class="spinner" aria-hidden="true"></div><h2>Đang gửi đơn đến quán…</h2><p class="muted">Mã đơn của bạn: <b class="code">${esc(state.code || "")}</b></p></div>`;
    return;
  }
  const order = state.order;
  const view = orderView(order, serverNow());
  const text = STATUS_TEXT[view.status] || STATUS_TEXT.new;
  let extra = "";
  if (view.status === STATUS.AWAITING_PAYMENT) {
    extra = `<p class="countdown-line">Thời gian còn lại <b id="countdown">${countdownText(view.remainingMs ?? 0)}</b></p>${paymentHtml(order)}<p class="pay-warning">⚠️ Lưu ý: sau khi thanh toán, bạn <b>không thể sửa đơn</b> và <b>không được hoàn tiền nếu huỷ đơn</b>. Mong bạn thông cảm.</p>`;
  }
  if (view.status === STATUS.REJECTED) extra = `<p class="reject-reason"><b>Lý do:</b> ${esc(order.rejectReason || "Quán chưa nhận được đơn lúc này.")}</p>`;
  const spinner = view.status === STATUS.NEW ? '<div class="spinner" aria-hidden="true"></div>' : "";
  const phone = state.shop.phone ? `<p class="muted small">Cần hỗ trợ? Gọi quán <a href="tel:${esc(String(state.shop.phone).replace(/[^\d+]/g, ""))}">${esc(state.shop.phone)}</a></p>` : "";
  const canEdit = view.status === STATUS.NEW || view.status === STATUS.AWAITING_PAYMENT;
  const editRow = canEdit ? `<div class="cancel-row"><button type="button" class="secondary" data-act2="edit">✏️ Sửa đơn</button><button type="button" class="danger-link" data-act2="cancel">Huỷ đơn</button></div><p class="muted small">Bạn chỉ sửa hoặc huỷ đơn được khi chưa thanh toán. Nếu đã chuyển khoản, vui lòng gọi quán để được hỗ trợ.</p>` : "";
  const actions = editRow + (view.status === STATUS.EXPIRED
    ? `<button type="button" class="primary" data-act2="reorder">Đặt lại đơn này</button>`
    : view.isFinal ? `<button type="button" class="primary" data-act2="new">Đặt đơn mới</button>` : "");
  const showProgress = ![STATUS.REJECTED, STATUS.EXPIRED, STATUS.CANCELLED].includes(view.status);
  body.innerHTML = `${chips}<div class="status-card s-${view.status}">${spinner}<p class="eyebrow">Mã đơn <b class="code">${esc(order.code)}</b></p><h2>${esc(text.title)}</h2>${text.hint ? `<p class="muted">${esc(text.hint)}</p>` : ""}${showProgress ? progressHtml(order, view) : ""}${extra}${actions}</div>${summaryHtml(order)}${phone}`;
}

/** Banner "đơn đang theo dõi" chỉ cho đơn CHƯA kết thúc. Đơn đã xong/từ chối/hết hạn chuyển sang Lịch sử. */
function updateBanner(name = !$("#screen-menu").hidden ? "menu" : "") {
  const active = state.code && !(state.order && orderView(state.order, serverNow()).isFinal);
  $("#track-banner").hidden = !(name === "menu" && active);
  const hasHist = (store.get(KEYS.hist, []) || []).length > 0;
  $("#open-history").hidden = !hasHist;
}

function showScreen(name) {
  $("#screen-menu").hidden = name !== "menu";
  $("#screen-track").hidden = name !== "track";
  $("#screen-history").hidden = name !== "history";
  updateBanner(name);
  window.scrollTo(0, 0);
  renderCartBar();
}

/* ---------- Mở lại link: tìm đơn đang theo dõi ---------- */
async function restoreOrder() {
  const codes = store.get(KEYS.codes, []) || [];
  if (codes.length) { watchOrder(codes[0], { quiet: true }); return; }
  try {
    const uid = await ensureUid();
    if (!uid) return;
    const snap = await getDocs(query(col("online_orders"), where("uid", "==", uid), limit(10)));
    const orders = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0));
    // Chỉ khôi phục đơn CÒN đang diễn ra; đơn đã kết thúc (kể cả quá hạn thanh toán) không tự hiện lại.
    const latest = orders.find((o) => !orderView(o, serverNow()).isFinal);
    if (latest) { store.set(KEYS.codes, rememberCode([], latest.id)); watchOrder(latest.id, { quiet: true }); }
  } catch { /* không có đơn nào để khôi phục */ }
}

/* ---------- Sự kiện ---------- */
$("#menu").addEventListener("click", (event) => {
  const button = event.target.closest("[data-act]");
  if (!button) return;
  if (state.shop.orderingEnabled === false) return;
  const id = button.dataset.id;
  const delta = button.dataset.act === "inc" ? 1 : -1;
  if (delta > 0 && Object.keys(state.cart).length >= LIMITS.maxLines && !state.cart[id]) {
    $("#toast").textContent = `Mỗi đơn tối đa ${LIMITS.maxLines} loại món. Bạn có thể gửi đơn này rồi đặt thêm đơn khác.`;
    $("#toast").hidden = false;
    setTimeout(() => { $("#toast").hidden = true; }, 3500);
    return;
  }
  state.cart = changeQty(state.cart, id, delta);
  persistCart();
  refreshDish(id);
  renderCartBar();
});

$("#menu").addEventListener("input", (event) => {
  const id = event.target.dataset?.note;
  if (!id) return;
  state.cart = setNote(state.cart, id, event.target.value);
  persistCart();
});

$("#cat-chips").addEventListener("click", (event) => {
  const link = event.target.closest("[data-cat]");
  if (!link) return;
  event.preventDefault();
  document.getElementById(`cat-${link.dataset.cat}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#cart-open").addEventListener("click", openSheet);
$("#sheet-close").addEventListener("click", closeSheet);
$("#sheet-lines").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sheet]");
  if (!button) return;
  state.cart = changeQty(state.cart, button.dataset.id, button.dataset.sheet === "inc" ? 1 : -1);
  persistCart();
  renderSheet();
  refreshDish(button.dataset.id);
  renderCartBar();
});
$("#order-form").addEventListener("change", (event) => { if (event.target.name === "receive") syncReceiveFields(); });
$("#order-form").addEventListener("submit", submitOrder);
$("#menu-retry").addEventListener("click", () => loadMenu(true));

$("#track-body").addEventListener("click", async (event) => {
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    try { await navigator.clipboard.writeText(copy.dataset.copy); copy.textContent = "Đã chép"; }
    catch { const area = document.createElement("textarea"); area.value = copy.dataset.copy; document.body.append(area); area.select(); try { document.execCommand("copy"); copy.textContent = "Đã chép"; } catch { copy.textContent = "Hãy chép tay"; } area.remove(); }
    setTimeout(() => { copy.textContent = "Sao chép"; }, 1800);
    return;
  }
  const sw = event.target.closest("[data-switch]");
  if (sw) { watchOrder(sw.dataset.switch); return; }
  const act = event.target.closest("[data-act2]")?.dataset.act2;
  if (act === "reorder") {
    state.cart = cartFromOrder(state.order, menuById(), catById());
    persistCart();
    renderMenu();
    if (state.code) forgetCode(state.code);
    stopWatch();
    showScreen("menu");
    renderCartBar();
  } else if (act === "cancel") {
    cancelCurrentOrder(false);
  } else if (act === "edit") {
    cancelCurrentOrder(true);
  } else if (act === "new") {
    if (state.code) forgetCode(state.code);
    stopWatch();
    showScreen("menu");
  }
});

/* ---------- Khách tự huỷ / sửa đơn (chỉ khi chưa thanh toán) ---------- */
async function cancelCurrentOrder(thenEdit) {
  const order = state.order;
  if (!order || ![STATUS.NEW, STATUS.AWAITING_PAYMENT].includes(order.status) || state.cancelling) return;
  const ask = thenEdit
    ? "Huỷ đơn này để chọn lại món?\n\nNếu bạn ĐÃ chuyển khoản thì vui lòng KHÔNG huỷ, hãy gọi quán."
    : "Huỷ đơn này?\n\nNếu bạn ĐÃ chuyển khoản thì vui lòng KHÔNG huỷ, hãy gọi quán.";
  if (!window.confirm(ask)) return;
  state.cancelling = true;
  try {
    const keys = [limitKeyForUid(order.uid), limitKeyForPhone(order.phone)];
    const limits = await Promise.all(keys.map((k) => readLimit("online_limits", k)));
    const batch = writeBatch(db);
    batch.update(ref("online_orders", order.code), { status: STATUS.CANCELLED, cancelledAt: serverTimestamp() });
    keys.forEach((key, i) => { const n = Number(limits[i]?.pending) || 0; if (limits[i] && n > 0) batch.update(ref("online_limits", key), { pending: n - 1, released: order.code }); });
    await batch.commit();
  } catch {
    state.cancelling = false;
    $("#toast").textContent = "Không huỷ được: quán vừa cập nhật đơn. Vui lòng xem trạng thái mới của đơn.";
    $("#toast").hidden = false; setTimeout(() => { $("#toast").hidden = true; }, 4000);
    return;
  }
  state.cancelling = false;
  if (!thenEdit) return; // màn theo dõi tự chuyển sang "Bạn đã huỷ đơn này" qua onSnapshot
  state.cart = cartFromOrder(order, menuById(), catById());
  persistCart();
  if (state.code) forgetCode(state.code);
  stopWatch();
  renderMenu();
  showScreen("menu");
  renderCartBar();
  openSheet();
  $("#toast").textContent = "Đã huỷ đơn cũ. Bạn chỉnh món rồi gửi lại nhé.";
  $("#toast").hidden = false; setTimeout(() => { $("#toast").hidden = true; }, 3500);
}

/* ---------- Lịch sử đơn hàng ---------- */
const fmtWhen = (ms) => { if (!ms) return ""; const d = new Date(ms); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
let histOrders = [];
async function openHistory() {
  showScreen("history");
  const body = $("#history-body");
  body.innerHTML = '<p class="muted center">Đang tải lịch sử…</p>';
  try {
    const uid = await ensureUid();
    const snap = await getDocs(query(col("online_orders"), where("uid", "==", uid), limit(30)));
    histOrders = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((x, y) => (toMillis(y.createdAt) || 0) - (toMillis(x.createdAt) || 0));
  } catch { body.innerHTML = '<p class="notice error">Không tải được lịch sử. Vui lòng kiểm tra mạng.</p>'; return; }
  const list = histOrders.filter((o) => orderView(o, serverNow()).isFinal);
  if (!list.length) { body.innerHTML = '<p class="muted center">Chưa có đơn nào đã hoàn tất.</p>'; return; }
  body.innerHTML = list.map((o) => {
    const v = orderView(o, serverNow());
    const done = v.status === STATUS.DONE;
    const label = done ? "Đã hoàn thành" : v.status === STATUS.REJECTED ? "Quán không nhận" : v.status === STATUS.CANCELLED ? "Bạn đã huỷ" : "Hết hạn";
    return `<article class="hist-card${done ? "" : " dim"}"><header><b class="code">${esc(o.code || o.id)}</b><span class="badge${done ? "" : " bad"}">${label}</span><span class="when">${esc(fmtWhen(toMillis(o.createdAt)))}</span></header><ul>${(o.items || []).map((l) => `<li>${Number(l.qty)}× ${esc(String(l.name || "").trim())}${l.note ? ` <small class="muted">(${esc(l.note)})</small>` : ""}</li>`).join("")}</ul><div class="hist-actions"><span class="tot">${money(o.total)}</span><button type="button" class="secondary" data-reorder="${esc(o.id)}">Đặt lại</button></div></article>`;
  }).join("");
}
$("#open-history").addEventListener("click", openHistory);
$("#history-back").addEventListener("click", () => showScreen("menu"));
$("#history-body").addEventListener("click", (event) => {
  const id = event.target.closest("[data-reorder]")?.dataset.reorder;
  const order = histOrders.find((o) => o.id === id);
  if (!order) return;
  state.cart = cartFromOrder(order, menuById(), catById());
  persistCart();
  renderMenu();
  showScreen("menu");
  renderCartBar();
  $("#toast").textContent = Object.keys(state.cart).length ? "Đã thêm các món còn bán vào giỏ." : "Các món trong đơn này hiện không còn bán.";
  $("#toast").hidden = false;
  setTimeout(() => { $("#toast").hidden = true; }, 3000);
});

$("#back-to-menu").addEventListener("click", () => { showScreen("menu"); });
$("#track-banner").addEventListener("click", () => { if (state.code) showScreen("track"); });

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { syncClock(); if (state.order) renderTrack(); } });

/* ---------- Khởi động ---------- */
renderShop();
renderMenu();
{ let h = store.get(KEYS.hist, []) || []; for (const c of [...(store.get(KEYS.codes, []) || [])].reverse()) h = rememberCode(h, c, 40); store.set(KEYS.hist, h); }
{ let h = store.get(KEYS.hist, []) || []; for (const c of [...(store.get(KEYS.codes, []) || [])].reverse()) h = rememberCode(h, c, 40); store.set(KEYS.hist, h); }
renderCartBar();
updateBanner();
syncClock();
loadShop();
loadMenu();
restoreOrder();
window.__orderReady = true;
