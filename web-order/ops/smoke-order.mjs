// Kiểm thử thật trên rules đã phát hành: đăng nhập ẩn danh, đặt thử 1 đơn món thường và 1 đơn combo, rồi dọn sạch đúng các tài liệu thử đó.
// Chạy trong GitHub Actions sau khi gcloud đã đăng nhập (dùng token quản trị chỉ để XOÁ các tài liệu thử vừa tạo).
import { execSync } from "node:child_process";
import { firebaseConfig, STORE_OWNER_UID, STORE_ID } from "../public/config.js";
import { buildOrderDoc, normalizePhone, makeOrderCode, limitKeyForUid, limitKeyForPhone } from "../public/order-core.js";

const project = firebaseConfig.projectId;
const db = `projects/${project}/databases/(default)/documents`;
const root = `${db}/users/${STORE_OWNER_UID}/stores/${STORE_ID}`;
const val = (v) => v === null ? { nullValue: null } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v }
  : Number.isInteger(v) ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));

const signIn = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
if (!signIn.idToken) { console.log("Đăng nhập ẩn danh thất bại", JSON.stringify(signIn)); process.exit(1); }
const uid = signIn.localId;
const admin = execSync("gcloud auth print-access-token").toString().trim();

const get = async (path, token) => (await fetch(`https://firestore.googleapis.com/v1/${path}`, { headers: { authorization: `Bearer ${token}` } })).json();
const menu = await get(`${root}/menu`, admin);
const combos = await get(`${root}/combos`, admin);
const plain = (menu.documents || []).find((d) => d.fields.name?.stringValue === "Cafe đen nóng") || (menu.documents || []).find((d) => d.fields.active?.booleanValue !== false && d.fields.price?.integerValue);
const combo = (combos.documents || []).find((d) => d.fields.active?.booleanValue !== false);
const cases = [];
const priceOf = (d) => Number(d.fields.price?.integerValue ?? d.fields.price?.doubleValue);
if (plain) cases.push({ label: "món thường", id: plain.name.split("/").pop(), name: plain.fields.name.stringValue, price: priceOf(plain) });
// Thử MỌI combo đang bán (tên có khoảng trắng thừa, giá số thực… từng làm đơn bị từ chối) và vài món thường khác, để lỗi bị bắt ngay khi deploy.
for (const c of (combos.documents || []).filter((d) => d.fields.active?.booleanValue !== false && d.fields.name?.stringValue && priceOf(d) > 0).slice(0, 8)) cases.push({ label: "combo", id: `c_${c.name.split("/").pop()}`, name: c.fields.name.stringValue, price: priceOf(c) });
for (const m of (menu.documents || []).filter((d) => d !== plain && d.fields.active?.booleanValue !== false && d.fields.name?.stringValue && priceOf(d) > 0).slice(0, 5)) cases.push({ label: "món", id: m.name.split("/").pop(), name: m.fields.name.stringValue, price: priceOf(m) });

// Đơn nhiều dòng: tách theo loại dòng để biết tổ hợp nào bị chặn.
{
  const combosL = cases.filter((x) => x.label === "combo"), plainsL = cases.filter((x) => x.label !== "combo");
  if (combosL.length >= 2 && plainsL.length >= 2) {
    const mk = (label, multi) => cases.push({ ...plainsL[0], label, multi });
    mk("2 món thường", [plainsL[0], plainsL[1]]);
    mk("2 combo", [combosL[0], combosL[1]]);
    mk("món rồi combo", [plainsL[0], combosL[0]]);
    mk("combo rồi món", [combosL[0], plainsL[0]]);
    mk("3 món thường", [plainsL[0], plainsL[1], plainsL[2] || plainsL[1]]);
    mk("combo + 2 món", [combosL[0], plainsL[0], plainsL[1]]);
  }
}
let failed = 0;
for (const [i, c] of cases.entries()) {
  const phone = `0900000${String(i).padStart(3, "0")}`;
  const code = makeOrderCode();
  const lines = (c.multi || [c]).map((x) => ({ id: x.id, name: x.name, qty: x.qty || 1, note: "", price: x.price }));
  const phoneVal = c.rawPhone ? normalizePhone(c.rawPhone) : phone;
  const order = buildOrderDoc({ code, uid, value: { name: "KIEM THU TU DONG", phone: phoneVal, mode: c.mode || "pickup", address: c.address || "", table: "", note: c.note || "" }, lines });
  const { createdAt, ...rest } = order;
  const keyU = limitKeyForUid(uid), keyP = limitKeyForPhone(phoneVal);
  const body = {
    writes: [
      { update: { name: `${root}/online_orders/${code}`, fields: fields(rest) }, updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }], currentDocument: { exists: false } },
      { update: { name: `${root}/online_limits/${keyU}`, fields: fields({ pending: 1, lastOrder: code }) }, updateTransforms: [{ fieldPath: "lastAt", setToServerValue: "REQUEST_TIME" }] },
      { update: { name: `${root}/online_limits/${keyP}`, fields: fields({ pending: 1, lastOrder: code }) }, updateTransforms: [{ fieldPath: "lastAt", setToServerValue: "REQUEST_TIME" }] },
    ],
  };
  const r = await fetch(`https://firestore.googleapis.com/v1/${db}:commit`, { method: "POST", headers: { authorization: `Bearer ${signIn.idToken}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  console.log(`[${c.label}] ${c.name} ${c.price}đ -> HTTP ${r.status} ${r.ok ? "ĐẶT ĐƯỢC" : text.slice(0, 300)}`);
  if (!r.ok) failed++;
  for (const p of [`online_orders/${code}`, `online_limits/${keyU}`, `online_limits/${keyP}`]) await fetch(`https://firestore.googleapis.com/v1/${root}/${p}`, { method: "DELETE", headers: { authorization: `Bearer ${admin}` } });
}
// Bộ đếm lượt truy cập: khách ẩn danh tăng đúng 1 (tạo rồi cập nhật) được; tăng 2 hoặc bộ đếm lạ thì bị chặn. Dọn tài liệu thử bằng quyền chủ quán.
{
  const statDoc = `${root}/online_stats/20000101`;
  const commitStat = async (transforms) => {
    const r = await fetch(`https://firestore.googleapis.com/v1/${db}:commit`, { method: "POST", headers: { authorization: `Bearer ${signIn.idToken}`, "content-type": "application/json" }, body: JSON.stringify({ writes: [{ update: { name: statDoc, fields: {} }, updateTransforms: transforms }] }) });
    return r.status;
  };
  const inc = (field, n = 1) => ({ fieldPath: field, increment: { integerValue: String(n) } });
  const results = [
    ["tạo bộ đếm +1", await commitStat([inc("visit"), inc("vh09")]), true],
    ["cập nhật +1", await commitStat([inc("visit"), inc("vh09")]), true],
    ["tăng +2 bị chặn", await commitStat([inc("visit", 2)]), false],
    ["bộ đếm lạ bị chặn", await commitStat([inc("hack")]), false],
    ["tăng 3 bộ đếm một lần bị chặn", await commitStat([inc("visit"), inc("menu"), inc("add")]), false],
  ];
  for (const [label, status, wantOk] of results) {
    const ok = status >= 200 && status < 300;
    console.log(`[thống kê] ${label} -> HTTP ${status} ${ok === wantOk ? "ĐÚNG" : "SAI"}`);
    if (ok !== wantOk) failed++;
  }
  await fetch(`https://firestore.googleapis.com/v1/${statDoc}`, { method: "DELETE", headers: { authorization: `Bearer ${admin}` } });
}
await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${firebaseConfig.apiKey}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: signIn.idToken }) });
console.log(cases.length ? (failed ? `CÓ ${failed} LỖI` : "TẤT CẢ ĐẶT THỬ ĐỀU QUA, đã dọn dữ liệu thử") : "Không có món/combo để thử");
process.exit(failed ? 1 : 0);
