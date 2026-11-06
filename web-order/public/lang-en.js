/**
 * Dòng tiếng Anh phụ cho khách nước ngoài. MỘT trang duy nhất: tiếng Việt vẫn là chính, mỗi mục cơ bản có thêm 1 dòng tiếng Anh nhỏ bên dưới.
 * Không có nút đổi ngôn ngữ, không có phiên bản riêng. Hàm thuần (trừ annotateStatic chạm DOM) – không Firebase.
 * Tên món lấy từ menu của quán (đổi tự do), nên dịch theo từ điển: món lạ chưa có trong từ điển thì KHÔNG hiện dòng tiếng Anh (không đoán).
 */
const strip = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[()]/g, " ").replace(/\s+/g, " ").trim();

/** Phần "đầu" của tên món (danh từ chính). Khớp cụm dài nhất trước. */
const HEADS = {
  "ca phe sua": "Milk coffee", "cafe sua": "Milk coffee", "cafe den nong": "Hot black coffee", "den da": "Iced black coffee", "bac xiu": "Bac xiu (milk coffee)",
  "cafe muoi": "Salted coffee", "cafe kem cheese": "Cheese-cream coffee", "cafe": "Coffee", "ca phe": "Coffee", "americano": "Americano", "espresso": "Espresso", "matcha latte": "Matcha latte",
  "cold brew": "Cold brew", "0210 mo brew": "0210 apricot brew", "mo brew": "Apricot brew",
  "nuoc ep": "Fresh juice", "sinh to": "Smoothie", "sua chua dam": "Smashed yogurt", "cacao": "Cocoa", "sua tuoi": "Fresh milk",
  "tra chanh nha dam": "Lemon tea with aloe vera", "tra chanh": "Lemon tea", "tra da": "Iced tea", "tra tui loc": "Teabag tea", "am tra moc": "Pot of herbal tea", "tra": "Tea",
  "banh mi trung": "Egg baguette", "banh mi bo sua": "Baguette with butter & milk", "banh mi them": "Extra baguette", "banh mi": "Baguette",
  "bun ga": "Chicken noodle soup", "banh da ga": "Chicken rice-noodle soup", "banh da": "Rice noodles", "bun": "Noodles",
  "com ga chien mam": "Rice with fish-sauce fried chicken", "com bo sot tieu": "Rice with beef in pepper sauce", "com": "Rice",
  "ga ran them theo com": "Fried chicken (add-on to rice)", "dui ga": "Chicken drumstick", "canh ga": "Chicken wings",
  "moc them": "Extra meatball", "pate them": "Extra pâté", "hat huong duong": "Sunflower seeds", "hat dua": "Watermelon seeds",
  "khoai tay chien": "French fries", "bit tet": "Beefsteak", "beefsteak": "Beefsteak", "trung chan": "Poached egg", "trung op la": "Fried egg", "trung": "Egg",
  "dua hau": "Watermelon", "cam": "Orange", "tao": "Apple",
};
/** Từ bổ nghĩa đứng sau phần đầu. Số (50, 40, 25, 70) giữ nguyên. */
const MODS = {
  "cam": "orange", "chanh": "lemon", "nguyen ban": "original", "dua hau": "watermelon", "tao": "apple", "bo": "avocado", "xoai": "mango", "cacao": "cocoa",
  "dui": "drumstick", "moc": "meatball", "dac biet": "special", "db": "special", "khong nhan": "plain", "them": "extra", "kem cheese": "cheese cream",
};
const KEEP = new Set(["dep", "ngon"]); // tên riêng của combo (Đẹp, Ngon): giữ nguyên chữ gốc

const longest = (words, from, dict) => {
  for (let n = Math.min(6, words.length - from); n >= 1; n--) {
    const key = words.slice(from, from + n).join(" ");
    if (key in dict) return [dict[key], n];
  }
  return null;
};

const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const partEn = (part, original) => {
  const words = strip(part).split(" ").filter(Boolean);
  const origWords = String(original || part).replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const head = longest(words, 0, HEADS);
  if (!head) return "";
  const mods = [];
  const keeps = [];
  for (let i = head[1]; i < words.length;) {
    if (/^[\d/.,]+$/.test(words[i])) { mods.push(words[i]); i++; continue; }
    if (KEEP.has(words[i])) { keeps.push(origWords[i] || words[i]); i++; continue; }
    const m = longest(words, i, MODS);
    if (!m) return ""; // gặp từ lạ: không đoán
    mods.push(m[0]); i += m[1];
  }
  return `${head[0]}${keeps.length ? ` ${keeps.join(" ")}` : ""}${mods.length ? ` (${mods.join(", ")})` : ""}`;
};

/** "Bánh mì trứng + cafe sữa" -> "Egg baguette + Milk coffee"; chuỗi rỗng nếu có phần nào chưa dịch được. */
export function itemEn(name) {
  const text = String(name || "").trim();
  if (!text) return "";
  const parts = text.split("+").map((s) => s.trim()).filter(Boolean);
  const out = parts.map((p) => partEn(p, p));
  if (!out.length || out.some((x) => !x)) return "";
  return out.map(capital).join(" + ");
}

/** Tên nhóm / trang menu. */
const CATS = {
  "noi bat": "Featured", "ban chay": "Best sellers", "mon le": "Single items", "combo": "Combos", "mon le noi bat": "Featured single items", "mon ban chay": "Best-selling items", "combo tien loi": "Handy combos",
  "com trua": "Lunch rice", "com": "Rice", "nuoc ep": "Fresh juice", "do an vat": "Snacks", "ca phe": "Coffee", "cafe": "Coffee", "an sang": "Breakfast", "tra": "Tea", "sinh to": "Smoothies", "khac": "Other",
  "do uong": "Drinks", "ket qua tim mon": "Search results", "tat ca": "All",
};
export const catEn = (name) => CATS[strip(name)] || "";

/** Chuỗi giao diện dùng khi dựng HTML động. */
export const UI = Object.freeze({
  soldOut: "Sold out",
  noteHint: "Item note (less ice, less sugar…)",
  orderOnline: "online order",
  viewCart: "View cart & order",
  paused: "Ordering paused",
  orderCode: "Order code",
  timeLeft: "Time left",
  editOrder: "Edit order", cancelOrder: "Cancel order", reorder: "Order again", newOrder: "New order",
  loading: "Loading menu…",
  searchResults: "Search results",
});
export const countEn = (n) => `${n} ${n === 1 ? "item" : "items"}`;
export const discountEn = (pct) => `${pct}% off online`;

export const STATUS_EN = Object.freeze({
  new: ["The shop is confirming your order", "Please keep this page open."],
  rejected: ["The shop could not accept this order", ""],
  awaiting_payment: ["Order accepted — please pay", "Scan the QR with your banking app, or transfer the exact amount and reference below."],
  expired: ["Order expired (not paid in time)", "You can order again."],
  paid: ["Payment received — preparing your order", ""],
  delivering: ["On the way to you", ""],
  done: ["Order complete. Thank you!", ""],
  cancelled: ["You cancelled this order", "You can order again any time."],
});
export const STEP_EN = Object.freeze({ new: "Confirming", awaiting_payment: "Payment", paid: "Preparing", delivering: "Delivering", done: "Done" });
export const MODE_EN = Object.freeze({ delivery: "Delivery", pickup: "Takeaway", dinein: "Dine-in" });

/** <small class="en"> an toàn (text đã là hằng của mình hoặc đã qua hàm dịch; vẫn escape). */
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const enLine = (text) => (text ? `<small class="en" lang="en">${escHtml(text)}</small>` : "");

/** Phần tĩnh của index.html: [selector, tiếng Anh]. Thêm 1 dòng nhỏ sau chữ Việt; chạy 1 lần, không lặp. */
export const STATIC_EN = [
  ["#open-history span", "My orders"],
  [".promo-title", "Order direct from 0210"],
  [".promo-sub", "vs. in-store prices"],
  ["#track-banner", "You have an order in progress. Tap to view"],
  ["#menu-retry", "Try again"],
  ["details.info summary .t", "Shop info & how to order"],
  [".shop-more-body p:nth-of-type(1)", "Orders go straight to the shop. No login or app needed."],
  [".shop-more-body p:nth-of-type(2)", "Delivery area, fee and time (if any) are confirmed by the shop when it accepts your order."],
  [".hero-note.allergen", "Dishes may contain or touch allergens (milk, egg, peanut, gluten…). If you have an allergy, write it in the note or call the shop before ordering."],
  ["#back-to-menu", "Back to menu"],
  ["#history-back", "Back to menu"],
  ["#sheet-close", "Close"],
  [".sheet-head h2", "Your order"],
  ["#tax-note", "Prices include tax (if any). Surcharges and promotions (if any) are shown separately above."],
  ["fieldset legend", "Receive"],
  ["#submit span", "Place order"],
];
export const PLACEHOLDER_EN = [
  ["#menu-search", "Search: coffee, rice, baguette…"],
  ["input[name=name]", "e.g. Lan"],
  ["input[name=phone]", "Phone number"],
  ["textarea[name=address]", "Street, ward…"],
  ["input[name=table]", "Leave blank for takeaway"],
  ["textarea[name=note]", "e.g. call before delivery"],
];
export const LABEL_EN = [
  ["input[name=name]", "Your name", "before"],
  ["input[name=phone]", "Phone number", "before"],
  ["textarea[name=address]", "Delivery address", "before"],
  ["input[name=table]", "Table no. (if dining in)", "before"],
  ["textarea[name=note]", "Note for the shop", "before"],
  ["input[name=receive][value=pickup] + span", "Takeaway / dine-in", "inside"],
  ["input[name=receive][value=delivery] + span", "Delivery", "inside"],
  ["input[name=consent] + span", "I agree the shop may use my name, phone, address and note to process my order.", "inside"],
];

/** Gắn dòng tiếng Anh vào phần tĩnh. Idempotent. */
export function annotateStatic(doc = document) {
  const mk = (text) => {
    const small = doc.createElement("small");
    small.className = "en"; small.lang = "en"; small.textContent = text;
    return small;
  };
  for (const [sel, text] of STATIC_EN) {
    const el = doc.querySelector(sel);
    if (el && !el.querySelector(":scope > small.en")) el.appendChild(mk(text));
  }
  for (const [sel, text, where] of LABEL_EN) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    if (where === "inside") { if (!el.querySelector("small.en")) el.appendChild(mk(text)); continue; }
    const label = el.closest("label");
    if (label && !label.querySelector(":scope > small.en")) label.insertBefore(mk(text), el);
  }
  for (const [sel, text] of PLACEHOLDER_EN) {
    const el = doc.querySelector(sel);
    if (el && !el.dataset.en) { el.dataset.en = "1"; el.placeholder = `${el.placeholder} / ${text}`; }
  }
}
