import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { STORE_ID, STORE_OWNER_UID, firebaseConfig } from "./config.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* Thông tin chủ quản đọc từ online_config/shop (công khai, giống trang đặt món). Lỗi mạng thì giữ nguyên chữ "chưa tải được". */
async function load() {
  let s = {};
  try {
    const snap = await getDoc(doc(getFirestore(initializeApp(firebaseConfig)), "users", STORE_OWNER_UID, "stores", STORE_ID, "online_config", "shop"));
    if (snap.exists()) s = snap.data();
  } catch {
    $("#p-info").innerHTML = "<div><dt></dt><dd>Chưa tải được thông tin chủ quản. Vui lòng tải lại trang.</dd></div>";
    return;
  }
  $("#p-name").textContent = String(s.legalName || s.name || "0210");
  const rows = [];
  if (s.name && s.legalName && s.name !== s.legalName) rows.push(["Tên thương hiệu", esc(s.name)]);
  if (s.owner) rows.push(["Chủ hộ / đại diện", esc(s.owner)]);
  if (s.regNo) rows.push(["Mã số", esc(s.regNo)]);
  if (s.address) rows.push(["Địa chỉ", esc(s.address)]);
  if (s.phone) rows.push(["Điện thoại", `<a href="tel:${esc(String(s.phone).replace(/[^\d+]/g, ""))}">${esc(s.phone)}</a>`]);
  if (s.email) rows.push(["Email", `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`]);
  if (s.hours) rows.push(["Giờ mở cửa", esc(s.hours)]);
  $("#p-info").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("") || "<div><dt></dt><dd>Quán đang cập nhật thông tin.</dd></div>";
}
load();
