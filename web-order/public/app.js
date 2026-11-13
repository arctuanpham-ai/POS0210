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
  increment,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { APP_CHECK_SITE_KEY, DEFAULT_SHOP, MESSENGER_URL, NOTIFY_CLICK, NOTIFY_TOPIC, STORE_ID, STORE_OWNER_UID, firebaseConfig } from "./config.js";
import {
  FINAL_STATUSES, LIMITS, comboTools, pricingFor, MODE_LABELS, STATUS, STATUS_TEXT, buildOrderDoc, cartFromOrder, cartLines, changeQty, countdownText, isOrderable,
  limitKeyForPhone, limitKeyForUid, linesCount, linesTotal, makeOrderCode, menuSections, money, orderView, pendingBase, progressSteps, rememberCode,
  notifyPayload, HOME_VIEW, menuLayout, menuViews, offerMessage, comboSaving, onlineDiscountPercent, onlinePrice, phoneLinksHtml, setNote, toMillis, validateCheckout,
} from "./order-core.js";
import { vietQrPayload } from "./vietqr.js";
import { pixelTrack, startPixel } from "./fb-pixel.js";
import { STATS_COLLECTION, decide, dwellKey, keysFor, vnDayKey } from "./stats-core.js";
import { qrSvg, qrPngDataUrl } from "./qr.js";
import { openStatus } from "./hours-core.js";
import { SNAPSHOT_DOC, THUMB_DOC_PREFIX, mergeThumbChunks, usableSnapshot } from "./menu-snapshot.js";
import { attributionForOrder, parseTouch, readStored, updateAttribution, visitDocId, visitSource } from "./source-core.js";
import { fold, indexItem, searchEntries, suggestions, usableKeywords } from "./search-core.js";

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
const KEYS = { cart: "pos0210o.cart", codes: "pos0210o.codes", profile: "pos0210o.profile", menu: "pos0210o.menu5", thumbs: "pos0210o.thumbs", hist: "pos0210o.hist", attr: "pos0210o.attr" };
const MENU_TTL = 5 * 60_000;
const THUMB_TTL = 24 * 3_600_000;

const state = {
  top: [], // id các món bán chạy (từ bản chụp menu)
  snapshotAt: 0,
  snapshot: undefined, // undefined = chưa đọc, null = không có/lỗi
  promo: null,
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
  query: "",
  searchFocus: false,
  view: HOME_VIEW, // trang menu đang chọn: nổi bật / món lẻ / combo / một nhóm
  searchIndex: null,
};

const serverNow = () => Date.now() + state.clockOffset;

/* ---------- Đếm lượt truy cập theo cấp (phễu): lỗi hay bị chặn thì bỏ qua, không ảnh hưởng đặt món ---------- */
const STATS_SESSION_KEY = "pos0210o.stats.session";
function track(event) {
  try {
    const now = Date.now();
    let session = {}, device = {};
    try { session = JSON.parse(sessionStorage.getItem(STATS_SESSION_KEY) || "{}") || {}; } catch { /* không có sessionStorage: coi như phiên mới */ }
    device = store.get("pos0210o.stats.device", {}) || {};
    const result = decide(event, now, session, device);
    try { sessionStorage.setItem(STATS_SESSION_KEY, JSON.stringify(result.session)); } catch { /* bỏ qua */ }
    store.set("pos0210o.stats.device", result.device);
    if (!result.count) return;
    pixelTrack(event, event === "submit" ? priceNow(currentLines()).total : 0);
    const patch = {};
    for (const key of keysFor(event, now)) patch[key] = increment(1);
    authPromise.then((uid) => { if (uid) return setDoc(ref(STATS_COLLECTION, vnDayKey(now)), patch, { merge: true }); return null; }).catch(() => { /* đếm lỗi: bỏ qua */ });
    // Lượt vào theo nguồn (link quảng cáo có UTM, Facebook, Google, không xác định…): bộ đếm ẩn danh, mỗi lượt vào ghi thêm 1 lần.
    if (event === "visit") {
      const v = visitSource(currentTouch);
      authPromise.then((uid) => { if (uid) return setDoc(ref("online_stats_src", visitDocId(vnDayKey(now), v)), { visit: increment(1), ...v }, { merge: true }); return null; }).catch(() => { /* bỏ qua */ });
    }
  } catch { /* không bao giờ làm hỏng trang vì bộ đếm */ }
}
/* ---------- Thời gian ở lại trang: chỉ tính lúc tab đang mở, ghi 1 lần mỗi phiên, ẩn danh theo khung (không lưu theo người) ---------- */
const DWELL_FLAG = "pos0210o.stats.dwell";
// Chất lượng lượt vào: có cuộn/chạm không, trình duyệt trong app không, menu hiện nhanh hay chậm (không lưu gì theo người).
const engage = { moved: false, menuMs: 0 };
const markMoved = () => { engage.moved = true; };
addEventListener("scroll", () => { if (scrollY > 40) markMoved(); }, { passive: true });
addEventListener("pointerdown", markMoved, { passive: true });
const inAppBrowser = () => /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Zalo|Messenger/i.test(navigator.userAgent || "");
const dwell = { visible: document.visibilityState !== "hidden", since: Date.now(), acc: 0 };
const dwellSeconds = () => (dwell.acc + (dwell.visible ? Date.now() - dwell.since : 0)) / 1000;
function flushDwell(ordered) {
  try {
    const now = Date.now(), day = vnDayKey(now);
    let flag = null;
    try { flag = sessionStorage.getItem(DWELL_FLAG); } catch { /* bỏ qua */ }
    if (flag === day) return;
    try { sessionStorage.setItem(DWELL_FLAG, day); } catch { /* bỏ qua */ }
    const secs = dwellSeconds(), key = dwellKey(secs, ordered);
    if (currentTouch !== undefined) {
      const v = visitSource(currentTouch), p = { n: increment(1), ...v };
      if (secs < 10 && !ordered) p.b10 = increment(1);
      if (engage.moved || ordered) p.eng = increment(1);
      if (inAppBrowser()) p.inapp = increment(1);
      if (engage.menuMs > 3000) p.slow = increment(1);
      authPromise.then((uid) => { if (uid) return setDoc(ref("online_stats_eng", visitDocId(vnDayKey(now), v)), p, { merge: true }); return null; }).catch(() => { /* bỏ qua */ });
    }
    authPromise.then((uid) => { if (uid) return setDoc(ref(STATS_COLLECTION, vnDayKey(now)), { [key]: increment(1) }, { merge: true }); return null; }).catch(() => { /* bỏ qua */ });
  } catch { /* không bao giờ làm hỏng trang vì bộ đếm */ }
}
document.addEventListener("visibilitychange", () => {
  const hidden = document.visibilityState === "hidden", now = Date.now();
  if (hidden && dwell.visible) { dwell.acc += now - dwell.since; dwell.visible = false; flushDwell(false); }
  else if (!hidden && !dwell.visible) { dwell.since = now; dwell.visible = true; }
});
addEventListener("pagehide", () => flushDwell(false));
const menuById = () => Object.fromEntries(state.items.map((m) => [m.id, m]));
const catById = () => Object.fromEntries(state.cats.map((c) => [c.id, c]));
const currentLines = () => cartLines(state.cart, menuById(), catById());
/** Giảm giá khi đặt online (%), mọi chỗ tính tiền dùng chung để menu, giỏ, đơn gửi lên và nhãn trên ảnh luôn khớp nhau. */
const onlinePct = () => onlineDiscountPercent(state.shop);
const priceNow = (lines) => pricingFor(lines, state.promo, new Date(), { onlinePercent: onlinePct() });

/* ---------- Giờ máy chủ: đồng hồ điện thoại khách có thể sai, nên lấy chênh lệch từ header Date của chính trang ---------- */
async function syncClock() {
  try {
    const started = Date.now();
    const response = await fetch(`${location.pathname}?_=${started}`, { method: "HEAD", cache: "no-store" });
    const header = response.headers.get("date");
    if (!header) return;
    const server = new Date(header).getTime();
    if (Number.isFinite(server)) { state.clockOffset = server - (started + Date.now()) / 2; renderOpenStatus(); }
  } catch { /* giữ chênh lệch cũ */ }
}

/* ---------- Đăng nhập ẩn danh (không cần khách làm gì) ---------- */
let authReady;
const authPromise = new Promise((resolve) => { authReady = resolve; });
onAuthStateChanged(auth, (user) => { if (user) { state.uid = user.uid; authReady(user.uid); } });
signInAnonymously(auth).catch((error) => { state.authError = error; authReady(null); });
let currentTouch = null; // nguồn của lượt vào hiện tại (chỉ theo URL/nơi giới thiệu của lần mở trang này); phải khai báo trước khi gọi captureSource
captureSource();
startPixel();
track("visit"); track("device");
/* Nguồn khách (UTM / nơi giới thiệu): nhớ 7 ngày trên máy khách, chỉ là dữ liệu bổ sung, lỗi gì cũng bỏ qua, không ảnh hưởng đặt món. */
function captureSource() {
  try {
    const touch = parseTouch(location.search, document.referrer, location.hostname);
    currentTouch = touch;
    const next = updateAttribution(readStored(store.get(KEYS.attr)), touch, Date.now());
    if (next) store.set(KEYS.attr, next); else store.del(KEYS.attr);
  } catch { /* bỏ qua */ }
}
const orderSource = () => { try { return attributionForOrder(readStored(store.get(KEYS.attr)), Date.now()); } catch { return null; } };
const ensureUid = async () => (await authPromise) || state.uid;

/* ---------- Thông tin quán ---------- */
async function loadShop() {
  try {
    const [snap, promoSnap] = await Promise.all([getDoc(ref("online_config", "shop")), getDoc(ref("online_config", "promo")).catch(() => null)]);
    if (snap.exists()) state.shop = { ...DEFAULT_SHOP, ...snap.data() };
    state.promo = promoSnap?.exists?.() ? promoSnap.data() : null;
  } catch { /* dùng mặc định */ }
  renderShop();
  // Menu có thể tải xong trước cấu hình quán: nếu ảnh đã nhớ cũ hơn thumbsVersion thì tải lại.
  if (state.items.length && Number(state.shop.thumbsVersion || 0) > Number(store.get(KEYS.thumbs)?.ver || 0)) loadThumbs();
}

/** "Đang mở cửa" / "Đã đóng cửa" theo giờ mở cửa của quán, tính theo giờ Việt Nam (đồng hồ chỉnh theo máy chủ). Không đọc được giờ thì ẩn. */
function renderOpenStatus() {
  const node = $("#open-status");
  const status = openStatus(state.shop.hours, serverNow());
  if (!status.known) { node.hidden = true; node.textContent = ""; return; }
  node.hidden = false;
  node.className = `open-status ${status.open ? (status.soon ? "soon" : "open") : "closed"}`;
  node.innerHTML = `<span class="dot" aria-hidden="true"></span><span><b>${esc(status.label)}</b><span class="detail"> · ${esc(status.detail)}</span></span>`;
}

/** Dòng ưu đãi đặt trực tiếp, lấy % từ cấu hình quán (không tự tính giá). */
function renderOffer() {
  const pct = onlinePct();
  const node = $("#promo-banner");
  node.hidden = !offerMessage(pct);
  $("#promo-pct").textContent = `${pct}%`;
  node.setAttribute("aria-label", offerMessage(pct) || "Ưu đãi đặt trực tiếp");
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
  if (s.phone) rows.push(["Điện thoại", phoneLinksHtml(s.phone, esc)]);
  if (s.hours) rows.push(["Giờ mở cửa", esc(s.hours)]);
  $("#shop-info").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  $("#shop-info").hidden = !rows.length;
  renderOffer();
  renderOpenStatus();
  renderLegalFooter(s, name);
  const closed = s.orderingEnabled === false;
  $("#closed-banner").hidden = !closed && !s.notice;
  $("#closed-banner").textContent = closed ? (s.notice || "Quán tạm ngưng nhận đơn online. Vui lòng quay lại sau.") : s.notice || "";
  $("#closed-banner").classList.toggle("warn", closed);
  renderCartBar();
}

/** Chân trang pháp lý: thông tin chủ quản (Luật TMĐT 2025 Điều 11 khoản 1). Chỉ hiện dòng nào đã có dữ liệu. */
function renderLegalFooter(s, name) {
  $("#legal-name").textContent = String(s.legalName || name);
  const rows = [];
  if (s.owner) rows.push(["Chủ hộ / đại diện", esc(s.owner)]);
  if (s.regNo) rows.push(["Mã số", esc(s.regNo)]);
  if (s.address) rows.push(["Địa chỉ", esc(s.address)]);
  if (s.phone) rows.push(["Điện thoại", phoneLinksHtml(s.phone, esc)]);
  if (s.email) rows.push(["Email", `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`]);
  $("#legal-info").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
}

/* ---------- Menu ---------- */
const { COMBO_CATEGORY, comboItemsFrom } = comboTools;
function applyMenu(items, cats, top = []) {
  state.items = items;
  state.cats = cats;
  state.top = Array.isArray(top) ? top : [];
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
  if (items.length) { if (!engage.menuMs) engage.menuMs = Math.round(performance.now()); track("menu"); }
}

/** Bản chụp menu (online_menu/data): khách mới chỉ đọc ~3 tài liệu thay vì ~125. Không có / lỗi / sai phiên bản thì trả null và dùng cách đọc cũ. */
async function readSnapshot() {
  if (state.snapshot !== undefined && Date.now() - state.snapshotAt < 60_000) return state.snapshot; // dùng chung giữa menu và ảnh trong cùng một lượt tải
  state.snapshotAt = Date.now();
  try {
    const snap = await getDoc(ref("online_menu", SNAPSHOT_DOC));
    const data = snap.exists() ? snap.data() : null;
    state.snapshot = usableSnapshot(data) ? data : null;
  } catch { state.snapshot = null; }
  return state.snapshot;
}

/** Menu thô {items, cats, combos, hidden}. force = đọc thẳng collection thật (dùng khi luật từ chối đơn vì giá/món vừa đổi, cần bản mới nhất). */
async function readMenuRaw(force) {
  if (!force) {
    const snap = await readSnapshot();
    if (snap) return { items: snap.items, cats: snap.cats, combos: snap.combos, hidden: snap.hidden, top: Array.isArray(snap.top) ? snap.top : [] };
  }
  const [itemSnap, catSnap, hiddenSnap, comboSnap] = await Promise.all([getDocs(col("menu")), getDocs(col("menuCategories")), getDoc(ref("online_config", "menu")).catch(() => null), getDocs(col("combos")).catch(() => null)]);
  const rows = (snap) => (snap ? snap.docs.map((d) => ({ ...d.data(), id: d.id })) : []);
  return { top: [], items: rows(itemSnap), cats: rows(catSnap), combos: rows(comboSnap), hidden: Array.isArray(hiddenSnap?.data?.()?.hidden) ? hiddenSnap.data().hidden : [] };
}

async function loadMenu(force = false) {
  const cached = store.get(KEYS.menu);
  if (cached && cached.items && Date.now() - cached.at < MENU_TTL && !force) applyMenu(cached.items, cached.cats, cached.top);
  else if (cached && cached.items && !state.items.length) applyMenu(cached.items, cached.cats, cached.top); // hiện bản cũ trong lúc tải bản mới
  if (!force && cached && Date.now() - cached.at < MENU_TTL) { loadThumbs(); return; }
  try {
    const raw = await readMenuRaw(force);
    // Món chủ quán đã ẩn khỏi đặt món online: loại hẳn, không vào bộ nhớ đệm, không hiển thị dưới bất kỳ dạng nào.
    const hidden = new Set(raw.hidden);
    const cats = raw.cats.map((c) => ({ ...c }));
    const combos = raw.combos;
    const catOff = new Set(cats.filter((c) => c.active === false).map((c) => c.id));
    // Món ngừng bán (active=false), món thuộc nhóm đang tắt, món bị ẩn riêng: loại hẳn, không hiện mờ.
    const items = raw.items.map((m) => ({ ...m })).filter((m) => m.deleted !== true && m.name && m.active !== false && !hidden.has(m.id) && !catOff.has(m.categoryId));
    const comboItems = comboItemsFrom(combos, hidden);
    if (comboItems.length) { items.push(...comboItems); cats.push(COMBO_CATEGORY); }
    const top = (raw.top?.length ? raw.top : state.top).filter((id) => items.some((m) => m.id === id)); // món bán chạy còn bán được
    store.set(KEYS.menu, { at: Date.now(), items, cats, top });
    applyMenu(items, cats, top);
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

let thumbsInFlight = null;
/** Ảnh món (menuThumbs). Nhớ trên máy khách 24 giờ; nếu chủ quán vừa đổi ảnh (thumbsVersion trong online_config/shop lớn hơn bản đã nhớ) thì tải lại ngay. */
async function loadThumbs() {
  const cached = store.get(KEYS.thumbs);
  const want = Number(state.shop.thumbsVersion || 0);
  const fresh = cached && Date.now() - cached.at < THUMB_TTL && Number(cached.ver || 0) >= want;
  if (fresh) { state.thumbs = cached.map || {}; renderMenu(); return; }
  if (cached?.map) { state.thumbs = cached.map; renderMenu(); }
  if (thumbsInFlight) return thumbsInFlight;
  thumbsInFlight = (async () => {
    try {
      let map = {}, ver = Number(state.shop.thumbsVersion || 0);
      const shot = await readSnapshot();
      if (shot) {
        // Ảnh nằm trong vài tài liệu gộp sẵn (thumbs_0, thumbs_1…): ~2-3 lượt đọc thay vì ~52.
        const parts = Math.max(0, Math.min(8, Math.floor(Number(shot.thumbsParts) || 0)));
        const docs = await Promise.all(Array.from({ length: parts }, (_, i) => getDoc(ref("online_menu", `${THUMB_DOC_PREFIX}${i}`)).then((x) => (x.exists() ? x.data() : null))));
        map = mergeThumbChunks(docs);
        ver = Number(shot.thumbsVer || 0); // bản chụp cũ hơn thumbsVersion thì lần sau tự tải lại (rẻ), không bị kẹt
      } else {
        const snap = await getDocs(col("menuThumbs"));
        snap.docs.forEach((d) => { const t = d.data().thumb; if (typeof t === "string" && t.startsWith("data:image/")) map[d.id] = t; });
      }
      state.thumbs = map;
      store.set(KEYS.thumbs, { at: Date.now(), map, ver });
      renderMenu();
    } catch { /* không có ảnh vẫn đặt được */ } finally { thumbsInFlight = null; }
  })();
  return thumbsInFlight;
}

function saveLine(item, pct) {
  const s = comboSaving(item, state.items);
  return `<p class="save-line"><b>${s ? `Tiết kiệm ${money(s)}` : "Combo tiết kiệm"}</b>${pct > 0 ? ` <span>+ giảm thêm ${pct}%</span>` : ""}</p>`;
}
function dishHtml(item, cat) {
  const entry = state.cart[item.id];
  const sellable = isOrderable(item, cat);
  const pct = onlinePct();
  const promoOn = sellable && pct > 0;
  const thumb = state.thumbs[`menu_${item.id}`] || state.thumbs[item.id];
  // Combo: ghép ảnh các món thành phần, dấu + ở giữa.
  const tile = (id, name) => { const t = state.thumbs[`menu_${id}`] || state.thumbs[id]; return t ? `<img src="${esc(t)}" alt="" loading="lazy" width="56" height="56" />` : `<span class="dish-initial small">${esc(String(name || "?").trim().charAt(0).toUpperCase())}</span>`; };
  const comboImg = item.parts?.length ? item.parts.map((p) => `<span class="ct">${tile(p.id, p.name)}</span>`).join('<b class="plus">+</b>') : "";
  const img = thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" width="72" height="72" />` : `<span class="dish-initial">${esc(String(item.name).trim().charAt(0).toUpperCase())}</span>`;
  const control = !sellable
    ? `<span class="soldout">Tạm hết</span>`
    : entry
      ? `<div class="stepper"><button type="button" data-act="dec" data-id="${esc(item.id)}" aria-label="Bớt 1 ${esc(item.name.trim())}">−</button><b aria-live="polite">${entry.qty}</b><button type="button" data-act="inc" data-id="${esc(item.id)}" aria-label="Thêm 1 ${esc(item.name.trim())}">+</button></div>`
      : `<button type="button" class="add" data-act="inc" data-id="${esc(item.id)}" aria-label="Thêm ${esc(item.name.trim())}"><span aria-hidden="true">+</span></button>`;
  const note = sellable && entry ? `<input class="dish-note" data-note="${esc(item.id)}" maxlength="${LIMITS.maxLineNote}" placeholder="Ghi chú món (ít đá, ít ngọt…)" value="${esc(entry.note)}" autocomplete="off" />` : "";
  return `<article class="dish${sellable ? "" : " off"}${comboImg ? " combo-dish" : ""}${entry ? " in-cart" : ""}" data-dish="${esc(item.id)}"><div class="dish-img${comboImg ? " combo" : ""}">${comboImg || img}${promoOn ? `<span class="disc-badge" title="Giảm ${pct}% khi đặt online"><span class="sr-only">Giảm ${pct}% khi đặt online</span><span aria-hidden="true">-${pct}%</span></span>` : ""}</div><div class="dish-body"><h3>${esc(item.name.trim())}</h3>${comboImg ? saveLine(item, promoOn ? pct : 0) : ""}<b class="price">${promoOn ? `<span class="price-now">${money(onlinePrice(item.price, pct))}</span><s class="price-old">${money(item.price)}</s>` : money(item.price)}</b></div><div class="dish-ctl">${control}</div>${note}</article>`;
}

/** Chỉ mục tìm kiếm (đã bỏ dấu) dựng lại khi menu đổi; kèm các từ khoá gợi ý còn ra món. */
function searchData() {
  const cached = state.searchIndex;
  if (cached && cached.items === state.items && cached.cats === state.cats) return cached;
  const sections = menuSections(state.items, state.cats, { top: state.top });
  const entries = sections.flatMap((s) => s.items.map((m) => indexItem(m, s.name)));
  const categoryNames = sections.map((s) => s.name);
  // Từ khoá gợi ý bỏ những từ trùng tên nhóm (nhóm đã có hàng chip riêng bên dưới).
  const keywords = usableKeywords(entries, 20).filter((kw) => !categoryNames.some((n) => fold(n) === fold(kw))).slice(0, 8);
  state.searchIndex = { items: state.items, cats: state.cats, entries, categoryNames, keywords };
  return state.searchIndex;
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const keywordChipsHtml = (list) => list.map((kw) => `<button type="button" data-kw="${esc(kw)}">${esc(capitalize(kw))}</button>`).join("");

/** Dòng báo kết quả và các từ khoá gợi ý, theo từ khoá đang gõ. */
function renderSearchNote(found, query) {
  const note = $("#search-note");
  const chips = $("#kw-chips");
  const { keywords } = searchData();
  const showKeywords = (on) => { chips.hidden = !on || !keywords.length; chips.innerHTML = on ? keywordChipsHtml(keywords) : ""; };
  if (!query || !state.items.length) { note.hidden = true; showKeywords(!!state.items.length && state.searchFocus); return; }
  note.hidden = false;
  if (!found.items.length) {
    note.textContent = `Không thấy món nào khớp “${query}”. Thử một từ khoá khác:`;
    showKeywords(true);
  } else if (found.fuzzy) {
    note.textContent = `Không có món khớp đúng “${query}”. Đây là các món gần giống:`;
    showKeywords(false);
  } else {
    note.textContent = `${found.items.length} món cho “${query}”`;
    showKeywords(false);
  }
}

const CHIP_SVG = {
  home: '<path d="M12 3l2.2 5.3L20 9l-4.3 3.8L17 18.5 12 15.6 7 18.5l1.3-5.7L4 9l5.8-.7z"/>',
  retail: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2.5 1.5-3.5 4-3.5 7.5H17"/>',
  combo: '<path d="M4 8h16v4H4zM6 12v8h12v-8M12 8v12M12 8c-2 0-4-.8-4-2.5S9.5 3 12 8zM12 8c2 0 4-.8 4-2.5S14.5 3 12 8z"/>',
  rice: '<path d="M3 12h18a9 9 0 0 1-18 0zM8 9c0-2 1.5-3 4-3s4 1 4 3M9 21h6"/>',
  coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5zM16 10h2a2.5 2.5 0 0 1 0 5h-2M8 3v3M12 3v3"/>',
  bread: '<path d="M5 11a4 4 0 0 1 2-7h10a4 4 0 0 1 2 7v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/>',
  tea: '<path d="M4 10h13v3a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6zM17 11h1.5a2.5 2.5 0 0 1 0 5H17M9 3c-1 1 1 2 0 4M13 3c-1 1 1 2 0 4"/>',
  snack: '<path d="M6 10h12l-1.5 11h-9zM8 10l-1-5M12 10V4M16 10l1-5"/>',
  juice: '<path d="M6 5h12l-1.5 15h-9zM7 10h10M14 5l2-3"/>',
};
const chipIconKey = (v) => {
  const n = String(v.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  if (v.id === HOME_VIEW) return "home";
  if (v.id === "retail") return "retail";
  if (v.id === "combo") return "combo";
  if (/com|bun|pho|mi |bit tet/.test(n + " ")) return "rice";
  if (/ca phe|cafe|coffee/.test(n)) return "coffee";
  if (/an sang|banh/.test(n)) return "bread";
  if (/tra|matcha/.test(n)) return "tea";
  if (/an vat|snack/.test(n)) return "snack";
  if (/nuoc|ep|sinh to|smoothie/.test(n)) return "juice";
  return "retail";
};
const chipIcon = (v) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${CHIP_SVG[chipIconKey(v)]}</svg>`;
const sectionHtml = (sec, cats) => `<section class="menu-section" id="cat-${esc(sec.id)}"><div class="sec-head"><h2>${esc(sec.name)}</h2>${sec.more ? `<button type="button" class="see-all" data-view="${esc(sec.more.view)}">${esc(sec.more.label)} <span aria-hidden="true">→</span></button>` : ""}</div>${sec.items.map((m) => dishHtml(m, cats[m.categoryId])).join("")}</section>`;

function renderMenu() {
  const sections = menuSections(state.items, state.cats, { top: state.top });
  const cats = catById();
  const query = state.query.trim();
  if (query && state.items.length) {
    const found = searchEntries(searchData().entries, query);
    $("#cat-chips").innerHTML = "";
    $("#menu").innerHTML = found.items.length
      ? `<section class="menu-section" id="cat-_search"><h2>Kết quả tìm món</h2>${found.items.map((m) => dishHtml(m, cats[m.categoryId])).join("")}</section>`
      : "";
    renderSearchNote(found, query);
    return;
  }
  renderSearchNote(null, "");
  const views = menuViews(sections);
  if (!views.some((v) => v.id === state.view)) state.view = HOME_VIEW; // trang đang xem không còn (menu đổi): về Nổi bật
  $("#cat-chips").innerHTML = views.length > 1
    ? views.map((v) => `<a href="#cat-${esc(v.id)}" data-view="${esc(v.id)}"${v.id === state.view ? ' class="active" aria-current="true"' : ""}>${chipIcon(v)}<span>${esc(v.name)}</span></a>`).join("")
    : "";
  $("#menu").innerHTML = menuLayout(sections, state.view).map((sec) => sectionHtml(sec, cats)).join("")
    || (state.items.length ? "" : '<p class="muted center">Đang tải menu…</p>');
}

/** Chọn trang menu (Nổi bật / Món lẻ / Combo / một nhóm): chỉ hiện đúng danh sách đó, đưa khách về đầu danh sách, chip đang chọn luôn nằm trong tầm nhìn. */
function setView(id) {
  if (!id || id === state.view) return;
  state.view = id;
  renderMenu();
  const bar = $("#cat-chips");
  const chip = bar.querySelector(".active");
  if (chip && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  const top = $("#menu").getBoundingClientRect().top + window.scrollY - (bar.getBoundingClientRect().height || 0) - 12;
  if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function refreshDish(id) {
  const item = menuById()[id];
  const nodes = [...document.querySelectorAll(`[data-dish="${CSS.escape(id)}"]`)]; // món có thể hiện 2 lần (mục "Bán chạy nhất" và nhóm riêng)
  if (!item || !nodes.length) return;
  const focusNote = document.activeElement?.dataset?.note === id;
  const html = dishHtml(item, catById()[item.categoryId]);
  for (const node of nodes) node.outerHTML = html;
  if (focusNote) document.querySelector(`[data-note="${CSS.escape(id)}"]`)?.focus();
}

/* ---------- Giỏ hàng ---------- */
function persistCart() { store.set(KEYS.cart, state.cart); }

function renderCartBar() {
  const lines = currentLines();
  const bar = $("#cartbar");
  $("#chat-fab").href = MESSENGER_URL;
  const closed = state.shop.orderingEnabled === false;
  bar.hidden = !lines.length || !$("#screen-track").hidden;
  $("#cart-count").textContent = `${linesCount(lines)} món`;
  $("#cart-total").textContent = money(priceNow(lines).total);
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
  const pr = priceNow(lines);
  $("#sheet-total").textContent = money(pr.total);
  $("#submit-total").textContent = money(pr.total);
  const promoRows = [];
  if (pr.surcharge > 0 || pr.discount > 0) {
    promoRows.push(`<span>Tạm tính</span><span>${money(pr.subtotal)}</span>`);
    if (pr.surcharge > 0) promoRows.push(`<span>Phụ thu${pr.surchargeNames.length ? ` (${esc(pr.surchargeNames.join(", "))})` : ""}</span><span>+${money(pr.surcharge)}</span>`);
    if (pr.discount > 0) promoRows.push(`<span>Khuyến mãi${pr.discountName ? ` (${esc(pr.discountName)})` : ""}</span><span class="promo-minus">−${money(pr.discount)}</span>`);
  }
  $("#sheet-promo").innerHTML = promoRows.join("");
  $("#sheet-promo").hidden = !promoRows.length;
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
  track("cart");
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
  const shown = document.querySelector(`[data-error="${first}"]`) || target;
  if (shown?.scrollIntoView) shown.scrollIntoView({ block: "center", behavior: "smooth" });
  const list = Object.values(errors);
  setFormMessage(errors.cart || (list.length > 1 ? `Vui lòng kiểm tra lại ${list.length} mục còn thiếu hoặc chưa đúng (đánh dấu đỏ ở trên).` : `${list[0]}.`), true);
}

/* ---------- Gửi đơn ---------- */
const isDenied = (error) => error?.code === "permission-denied";

async function readLimit(name, key) {
  try { const snap = await getDoc(ref(name, key)); return snap.exists() ? snap.data() : null; } catch { return null; }
}

/** Đối chiếu từng dòng giỏ với menu VÀ combo mới nhất trên máy chủ. Trả danh sách dòng khác (rỗng nếu khớp hết). */
function catalogChanges(lines, menuDocs, comboDocs) {
  const menu = Object.fromEntries(menuDocs.map((m) => [m.id, m]));
  const combos = Object.fromEntries(comboDocs.map((m) => [m.id, m]));
  const out = [];
  for (const l of lines) {
    const isCombo = String(l.id).startsWith("c_");
    const m = (isCombo ? combos : menu)[isCombo ? String(l.id).slice(2) : l.id];
    if (!m || m.active === false || m.deleted === true) out.push({ name: l.name, why: "không còn bán" });
    else if (Math.round(Number(m.price)) !== l.price) out.push({ name: l.name, why: `giá đã đổi (${Math.round(Number(m.price)).toLocaleString("vi-VN")}đ)` });
    else if (m.name !== l.name) out.push({ name: l.name, why: "tên món đã đổi" });
  }
  return out;
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
  if (!form.consent.checked) { showErrors({ consent: "Vui lòng đồng ý để quán xử lý thông tin đặt món." }); return; }
  state.submitting = true;
  const button = $("#submit");
  button.disabled = true;
  button.querySelector("span").textContent = "Đang gửi đơn…";
  const slow = setTimeout(() => setFormMessage("Mạng đang yếu, đơn vẫn đang được gửi. Vui lòng chờ, đừng bấm lại.", false), 12_000);
  try {
    const uid = await ensureUid();
    if (!uid) throw Object.assign(new Error("auth"), { code: "auth" });
    track("submit");
    lastValue = checked.value;
    const result = await sendOrder(uid, checked.value, lines);
    flushDwell(true);
    store.set(KEYS.profile, { name: checked.value.name, phone: checked.value.phone, address: form.address.value.trim(), delivery: form.receive.value === "delivery" });
    store.set(KEYS.codes, rememberCode(store.get(KEYS.codes, []), result.code));
    store.set(KEYS.hist, rememberCode(store.get(KEYS.hist, []), result.code, 40));
    state.cart = {};
    persistCart();
    form.note.value = "";
    form.table.value = "";
    form.consent.checked = false;
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

/** Báo đơn mới về điện thoại qua ntfy. Chạy sau khi đơn đã ghi xong; lỗi mạng ở đây không được làm hỏng việc đặt món. */
function notifyShop(code, order) {
  if (!NOTIFY_TOPIC) return;
  try {
    // text/plain: yêu cầu "đơn giản", trình duyệt không cần hỏi trước (preflight).
    fetch("https://ntfy.sh/", { method: "POST", keepalive: true, body: JSON.stringify(notifyPayload({ topic: NOTIFY_TOPIC, code, order, click: NOTIFY_CLICK })) }).catch(() => {});
  } catch { /* bỏ qua */ }
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
    // Lần thử đầu kèm nguồn khách; nếu bị từ chối (ví dụ rules chưa cập nhật) thì lần thử lại gửi đơn KHÔNG kèm nguồn để không mất đơn.
    const orderDoc = buildOrderDoc({ code, uid, value, lines, pricing: priceNow(lines), src: attempt === 0 ? orderSource() : null });
    batch.set(ref("online_orders", code), { ...orderDoc, createdAt: serverTimestamp() });
    batch.set(ref("online_limits", limitKeyForUid(uid)), { pending: uBase + 1, lastAt: serverTimestamp(), lastOrder: code });
    batch.set(ref("online_limits", limitKeyForPhone(value.phone)), { pending: pBase + 1, lastAt: serverTimestamp(), lastOrder: code });
    try {
      await batch.commit();
      notifyShop(code, orderDoc);
      return { code };
    } catch (error) {
      lastError = error;
      if (!isDenied(error)) throw error;
    }
  }
  throw lastError;
}

let lastValue = null;
/** Link chat Messenger của fanpage; có đơn đang theo dõi thì gắn mã đơn (ref + nội dung điền sẵn) để quán biết khách hỏi về đơn nào. */
const chatUrl = (code) => (code ? `${MESSENGER_URL}?ref=${encodeURIComponent(`don_${code}`)}&text=${encodeURIComponent(`Mình cần hỗ trợ đơn #${code}`)}` : MESSENGER_URL);
const openChat = (anchor) => {
  const code = state.code || "";
  anchor.href = chatUrl(code);
  const label = anchor.querySelector("span") || anchor;
  const old = label.textContent;
  label.textContent = "Đang mở Messenger…";
  setTimeout(() => { label.textContent = old; }, 5000);
  try { navigator.clipboard?.writeText(code ? `Mình cần hỗ trợ đơn #${code}` : "Mình cần hỗ trợ").catch(() => {}); } catch { /* không sao chép được thì bỏ qua */ }
};

/** Ghi nhật ký lỗi (không có tên/SĐT) để quán biết vì sao đơn bị từ chối. Lỗi ở đây không được ảnh hưởng khách. */
async function reportOrderError(eref, error, lines, value) {
  try {
    const uid = auth.currentUser?.uid || "";
    const pricing = priceNow(lines);
    const checks = await Promise.all(lines.slice(0, 8).map(async (l) => {
      const isCombo = String(l.id).startsWith("c_");
      try {
        const s = await getDoc(ref(isCombo ? "combos" : "menu", isCombo ? String(l.id).slice(2) : String(l.id)));
        const m = s.exists() ? s.data() : null;
        return { id: String(l.id).slice(0, 12), n: l.name, p: l.price, q: l.qty, sv: m ? { n: m.name === l.name ? "=" : m.name, p: m.price === l.price ? "=" : m.price, a: m.active, d: m.deleted } : "KHONG_CO" };
      } catch (e) { return { id: String(l.id).slice(0, 12), err: e?.code || "x" }; }
    }));
    const lim = async (key) => { try { const s = await getDoc(ref("online_limits", key)); return s.exists() ? { p: s.data().pending, at: s.data().lastAt?.toMillis?.() } : null; } catch { return "err"; } };
    const info = {
      err: error?.code || "", msg: String(error?.message || "").slice(0, 160), now: Date.now(), srv: serverNow(),
      ua: navigator.userAgent.slice(0, 140), v: document.querySelector('script[src*="app.js"]')?.src.slice(-40) || "",
      mode: value?.mode || "", addr: String(value?.address || "").length, note: String(value?.note || "").length, name: String(value?.name || "").length, phone: String(value?.phone || "").length,
      total: pricing.total, disc: pricing.discount, sur: pricing.surcharge, lines: checks,
      uLim: await lim(limitKeyForUid(uid)), pLim: value?.phone ? await lim(limitKeyForPhone(value.phone)) : null,
    };
    await setDoc(eref, { code: String(error?.code || "denied"), at: serverTimestamp(), info: JSON.stringify(info).slice(0, 2400) });
  } catch { /* bỏ qua */ }
}

async function handleSubmitError(error, lines) {
  if (error?.code === "limit") {
    setFormMessage(`Bạn đang có ${LIMITS.maxPendingOrders} đơn chờ quán xác nhận hoặc chưa thanh toán. Vui lòng đợi các đơn đó xong rồi đặt tiếp${state.shop.phone ? `, hoặc gọi ${state.shop.phone}` : ""}.`, true);
    return;
  }
  if (isDenied(error)) {
    const eref = doc(col("online_errors"));
    const errNo = eref.id.slice(0, 6).toUpperCase();
    reportOrderError(eref, error, lines, lastValue);
    // Có thể quán vừa đổi giá/tắt món: đọc lại menu từ máy chủ để báo đúng nguyên nhân.
    try {
      const [menuSnap, comboSnap] = await Promise.all([getDocs(col("menu")), getDocs(col("combos"))]);
      const changes = catalogChanges(lines, menuSnap.docs.map((d) => ({ ...d.data(), id: d.id })), comboSnap.docs.map((d) => ({ ...d.data(), id: d.id })));
      if (changes.length) {
        store.del(KEYS.menu);
        await loadMenu(true);
        renderSheet();
        setFormMessage(`Quán vừa cập nhật: ${changes.slice(0, 3).map((c) => `${c.name.trim()} (${c.why})`).join("; ")}. Vui lòng xem lại giỏ hàng rồi gửi lại.`, true);
        return;
      }
    } catch { /* rơi xuống thông báo chung */ }
    setFormMessage(`Rất tiếc, hệ thống chưa nhận được đơn của bạn (mã lỗi ${errNo}). Quán đã ghi nhận lỗi để xử lý. Bạn vui lòng thử lại sau ít phút${state.shop.phone ? ` hoặc gọi ${state.shop.phone} kèm mã lỗi này` : ""}.`, true);
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
    const payload = vietQrPayload({ bank: s.bank, account: s.account, holder: s.holder || s.name, amount: order.total, info: order.transferContent });
    const png = qrPngDataUrl(payload, { level: "M", caption: [money(order.total), order.transferContent, s.holder || s.name] });
    // Ảnh PNG thật (không phải SVG nội tuyến) để nhấn giữ -> "Lưu ảnh" hoạt động trên mọi trình duyệt, kể cả trong Zalo/Facebook.
    qr = png ? `<img class="qr-img" src="${png}" alt="Mã QR thanh toán ${money(order.total)}" width="260" />` : qrSvg(payload, { level: "M" });
  } catch (error) {
    qr = `<p class="error">Không tạo được mã QR (${esc(error.message)}). Vui lòng chuyển khoản thủ công theo thông tin bên dưới.</p>`;
  }
  return `<div class="pay-card">
    <div class="qr">${qr}</div>
    <p class="pay-amount">${money(order.total)}</p>
    <button type="button" class="secondary save-qr" data-save-qr>Lưu ảnh QR vào máy</button>
    <p class="muted small">Hoặc <b>nhấn giữ vào mã QR</b> rồi chọn "Lưu ảnh". Sau đó mở app ngân hàng, chọn Quét QR và chọn ảnh trong thư viện.</p>
    <dl class="pay-info">
      <div><dt>Ngân hàng</dt><dd>${esc(s.bank)}</dd></div>
      <div><dt>Số tài khoản</dt><dd><b>${esc(s.account)}</b> ${copyButton(s.account, "Sao chép")}</dd></div>
      <div><dt>Tên tài khoản</dt><dd><b>${esc(s.holder || s.name)}</b></dd></div>
      <div><dt>Nội dung</dt><dd><b>${esc(order.transferContent)}</b> ${copyButton(order.transferContent, "Sao chép")}</dd></div>
    </dl>
    <p class="muted small">Vui lòng kiểm tra đúng tên tài khoản của quán trước khi chuyển. Giữ nguyên nội dung chuyển khoản để quán đối chiếu.</p>
  </div>`;
}

/** Lưu mã QR: bảng chia sẻ của điện thoại (có "Lưu ảnh") nếu có, không thì tải PNG. Mọi bước đồng bộ để còn trong thao tác bấm của khách. */
async function saveQrImage(button) {
  const img = document.querySelector("#track-body .qr-img");
  if (!img?.src.startsWith("data:image/png")) { button.textContent = "Hãy nhấn giữ vào mã QR để lưu ảnh"; setTimeout(() => { button.textContent = "Lưu ảnh QR vào máy"; }, 3000); return; }
  const label = button.textContent;
  try {
    const bytes = Uint8Array.from(atob(img.src.split(",")[1]), (ch) => ch.charCodeAt(0));
    const file = new File([bytes], `QR-${state.code || "thanh-toan"}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
    else { const a = document.createElement("a"); a.href = img.src; a.download = file.name; document.body.append(a); a.click(); a.remove(); }
    button.textContent = "Đã lưu ảnh QR";
  } catch (error) {
    if (error?.name !== "AbortError") button.textContent = "Chưa lưu được: hãy nhấn giữ vào mã QR";
  }
  setTimeout(() => { button.textContent = label; }, 2500);
}

function summaryHtml(order) {
  const adjust = [
    Number(order.surcharge) > 0 ? `<li class="sum-adj"><span>Phụ thu</span><b>+${money(order.surcharge)}</b></li>` : "",
    Number(order.discount) > 0 ? `<li class="sum-adj"><span>Giảm giá</span><b>−${money(order.discount)}</b></li>` : "",
  ].join("");
  const lines = (order.items || []).map((l) => `<li><span>${l.qty}× ${esc(String(l.name).trim())}${l.note ? `<small>${esc(l.note)}</small>` : ""}</span><b>${money(l.price * l.qty)}</b></li>`).join("") + adjust;
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
    extra = `${view.isDelivery ? '<p class="muted small">🛵 Phí giao hàng bạn trả trực tiếp cho tài xế khi nhận hàng, không nằm trong số tiền chuyển khoản bên dưới.</p>' : ""}<p class="countdown-line">Thời gian còn lại <b id="countdown">${countdownText(view.remainingMs ?? 0)}</b></p>${paymentHtml(order)}<p class="pay-warning">⚠️ Lưu ý: quán làm món ngay khi xác nhận đơn, nên <b>muốn sửa hoặc huỷ đơn bạn cần liên hệ quán và được quán đồng ý</b>. Nếu quán không thực hiện được đơn, giao thiếu/sai món hoặc món có lỗi, quán sẽ <b>hoàn tiền</b> (xem <a href="chinh-sach#hoan-tien" target="_blank" rel="noopener">chính sách đổi trả, hoàn tiền</a>).</p>`;
  }
  if (view.status === STATUS.REJECTED) extra = `<p class="reject-reason"><b>Lý do:</b> ${esc(order.rejectReason || "Quán chưa nhận được đơn lúc này.")}</p>`;
  const spinner = view.status === STATUS.NEW ? '<div class="spinner" aria-hidden="true"></div>' : "";
  const chat = `<a class="chat-link" href="${esc(chatUrl(order.code))}" target="_blank" rel="noopener" data-chat="${esc(order.code)}">💬 Cần hỗ trợ thêm về đơn #${esc(order.code)} · chat ngay</a>`;
  const phone = chat + (state.shop.phone ? `<p class="muted small">Cần hỗ trợ? Gọi quán ${phoneLinksHtml(state.shop.phone, esc)}</p>` : "");
  const canEdit = view.status === STATUS.NEW;
  const editRow = canEdit ? `<div class="cancel-row"><button type="button" class="secondary" data-act2="edit">✏️ Sửa đơn</button><button type="button" class="danger-link" data-act2="cancel">Huỷ đơn</button></div><p class="muted small">Bạn tự sửa hoặc huỷ được khi quán chưa xác nhận đơn.</p>` : "";
  const actions = editRow + (view.status === STATUS.EXPIRED
    ? `<button type="button" class="primary" data-act2="reorder">Đặt lại đơn này</button>`
    : view.isFinal ? `<button type="button" class="primary" data-act2="new">Đặt đơn mới</button>` : "");
  const showProgress = ![STATUS.REJECTED, STATUS.EXPIRED, STATUS.CANCELLED].includes(view.status);
  body.innerHTML = `${chips}<div class="status-card s-${view.status}">${spinner}<p class="eyebrow">Mã đơn <b class="code">${esc(order.code)}</b></p><h2>${esc(text.title)}</h2>${text.hint ? `<p class="muted">${esc(text.hint)}</p>` : ""}${showProgress ? progressHtml(order, view) : ""}${extra}${actions}</div>${summaryHtml(order)}${phone}`;
}

/** Banner "đơn đang theo dõi" chỉ cho đơn CHƯA kết thúc. Đơn đã xong/từ chối/hết hạn chuyển sang Lịch sử. */
function updateBanner(name = !$("#screen-menu").hidden ? "menu" : "") {
  const active = state.code && !(state.order && orderView(state.order, serverNow()).isFinal);
  const fabText = $("#chat-fab span");
  if (fabText) fabText.textContent = active && state.code ? `Cần hỗ trợ thêm về đơn #${state.code} · chat ngay` : "Cần hỗ trợ? Chat ngay";
  const banner = $("#track-banner");
  banner.hidden = !(name === "menu" && active);
  if (!banner.hidden) {
    const st = state.order ? orderView(state.order, serverNow()).status : STATUS.NEW;
    const code = state.code ? ` #${state.code}` : "";
    const txt = st === STATUS.AWAITING_PAYMENT ? `💳 Quán đã xác nhận đơn${code}. BẤM ĐỂ THANH TOÁN`
      : st === STATUS.PAID ? `👨‍🍳 Quán đã nhận tiền, đang làm đơn${code}. Bấm để xem`
      : st === STATUS.DELIVERING ? `🛵 Đơn${code} đang trên đường giao. Bấm để xem`
      : `🔔 Bạn có đơn${code} đang theo dõi. Bấm để xem trạng thái và mã thanh toán`;
    banner.textContent = txt;
    banner.classList.toggle("pay-now", st === STATUS.AWAITING_PAYMENT);
  }
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
  if (delta > 0) track("add");
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

/* ---------- Ô tìm món: gõ là lọc, gợi ý tên món / nhóm, từ khoá gợi ý ---------- */
const searchInput = $("#menu-search");
let suggestHideTimer = null;

function hideSuggest() {
  $("#search-suggest").hidden = true;
  searchInput.setAttribute("aria-expanded", "false");
}

function renderSuggest() {
  const list = $("#search-suggest");
  const query = state.query.trim();
  const found = query && state.items.length ? suggestions(searchData().entries, searchData().categoryNames, query) : [];
  if (!found.length || document.activeElement !== searchInput) { hideSuggest(); return; }
  list.innerHTML = found.map((x) => `<li role="option"><button type="button" data-suggest="${esc(x.text)}"><span class="s-kind">${x.type === "category" ? "Nhóm" : "Món"}</span>${esc(x.text)}</button></li>`).join("");
  list.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
}

function setQuery(value, { fromChoice = false } = {}) {
  state.query = String(value ?? "").slice(0, 60);
  if (searchInput.value !== state.query) searchInput.value = state.query;
  $("#search-clear").hidden = !state.query;
  renderMenu();
  if (fromChoice) { hideSuggest(); searchInput.blur(); $("#search-note").scrollIntoView({ behavior: "smooth", block: "start" }); } else renderSuggest();
}

searchInput.addEventListener("input", () => setQuery(searchInput.value));
/* Từ khoá gợi ý chỉ hiện khi khách bấm vào ô tìm (hoặc khi không có kết quả) để không chiếm chỗ đầu trang. */
searchInput.addEventListener("focus", () => { clearTimeout(suggestHideTimer); state.searchFocus = true; if (!state.query.trim()) renderSearchNote(null, ""); renderSuggest(); });
searchInput.addEventListener("blur", () => { suggestHideTimer = setTimeout(() => { hideSuggest(); state.searchFocus = false; if (!state.query.trim()) renderSearchNote(null, ""); }, 180); });
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); hideSuggest(); searchInput.blur(); }
  else if (event.key === "Escape") { setQuery(""); hideSuggest(); }
});
$("#search-clear").addEventListener("click", () => { setQuery(""); searchInput.focus(); });
$("#search-suggest").addEventListener("click", (event) => {
  const button = event.target.closest("[data-suggest]");
  if (button) setQuery(button.dataset.suggest, { fromChoice: true });
});
$("#kw-chips").addEventListener("click", (event) => {
  const button = event.target.closest("[data-kw]");
  if (button) setQuery(button.dataset.kw, { fromChoice: true });
});
$("#search-note").addEventListener("click", (event) => {
  const button = event.target.closest("[data-kw]");
  if (button) setQuery(button.dataset.kw, { fromChoice: true });
});

$("#cat-chips").addEventListener("click", (event) => {
  const link = event.target.closest("[data-view]");
  if (!link) return;
  event.preventDefault();
  setView(link.dataset.view);
});
$("#menu").addEventListener("click", (event) => {
  const more = event.target.closest(".see-all[data-view]");
  if (more) setView(more.dataset.view);
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
  const save = event.target.closest("[data-save-qr]");
  if (save) { await saveQrImage(save); return; }
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    const label = copy.textContent;
    try { await navigator.clipboard.writeText(copy.dataset.copy); copy.textContent = "Đã chép"; }
    catch { const area = document.createElement("textarea"); area.value = copy.dataset.copy; document.body.append(area); area.select(); try { document.execCommand("copy"); copy.textContent = "Đã chép"; } catch { copy.textContent = "Hãy chép tay"; } area.remove(); }
    setTimeout(() => { copy.textContent = label; }, 1800);
    return;
  }
  const chatAnchor = event.target.closest("[data-chat], #chat-fab");
  if (chatAnchor) { openChat(chatAnchor); return; }
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
    ? "Huỷ đơn này để chọn lại món?\n\nNếu bạn ĐÃ chuyển khoản, hãy liên hệ quán để được hoàn lại tiền theo chính sách."
    : "Huỷ đơn này?\n\nNếu bạn ĐÃ chuyển khoản, hãy liên hệ quán để được hoàn lại tiền theo chính sách.";
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

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { syncClock(); renderOpenStatus(); if (state.order) renderTrack(); } });
setInterval(renderOpenStatus, 30_000);

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
/* Gợi ý lần đầu: làm mờ nền, nổi cụm 3 nút hỗ trợ; chạm vào nền (hoặc bấm một nút) để tắt, chỉ hiện một lần */
(() => {
  const KEY = "oo-fab-tip";
  const seen = () => { try { return localStorage.getItem(KEY) === "1" || sessionStorage.getItem(KEY) === "1"; } catch { return false; } };
  const remember = () => { try { localStorage.setItem(KEY, "1"); } catch { try { sessionStorage.setItem(KEY, "1"); } catch { /* không lưu được thì thôi */ } } };
  if (seen()) return;
  const overlay = $("#fab-overlay"), tip = $("#fab-tip"), stack = $("#fab-stack");
  if (!overlay || !tip || !stack) return;
  const close = () => { document.body.classList.remove("fab-spot"); overlay.hidden = true; tip.hidden = true; remember(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  setTimeout(() => {
    if (seen()) return;
    document.body.classList.add("fab-spot"); overlay.hidden = false; tip.hidden = false;
    overlay.addEventListener("click", close);
    stack.addEventListener("click", (e) => { if (e.target.closest("a")) close(); }, true);
    document.addEventListener("keydown", onKey);
  }, 900);
})();
window.__orderReady = true;
