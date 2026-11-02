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
    for (const k of [4, 5, 6]) { const part = [...combosL.slice(0, 2), ...plainsL.slice(0, 4)].slice(0, k); if (part.length === k) mk(`${k} dòng`, part); }
    const seven = [...combosL.slice(0, 3), ...plainsL.slice(0, 4)];
    if (seven.length === 7) mk("7 dòng", seven);
    const many = [...combosL, ...plainsL].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i).slice(0, 12);
    if (many.length >= 10) mk(`${many.length} dòng (nhánh đơn dài)`, many);
  }
}
// Nguồn khách (src), số lượng nhiều trên 1 dòng, và các đơn nguồn sai phải bị chặn.
{
  const plainsS = cases.filter((x) => x.label !== "combo"), combosS = cases.filter((x) => x.label === "combo");
  const base = plainsS[0];
  const SRC = { source: "facebook", medium: "paid_social", campaign: "com_trua_khung_gio_202611", content: "anh_01", at: Date.now(), first: { source: "facebook", campaign: "loi_ich_dat_truc_tiep_202611", content: "anh_01", at: Date.now() } };
  if (base) {
    const push = (label, extra) => cases.push({ ...base, label, ...extra });
    push("1 món, số lượng 20 (tối đa)", { qty: 20 });
    push("1 món, số lượng 21 (phải bị chặn)", { qty: 21, expectDeny: true });
    push("có nguồn UTM đầy đủ (1 dòng)", { src: SRC });
    push("nguồn tối giản chỉ có source", { src: { source: "google" } });
    if (plainsS.length >= 3) push("có nguồn UTM (3 dòng)", { multi: plainsS.slice(0, 3), src: SRC });
    const longList = [...combosS, ...plainsS].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i).slice(0, 12);
    if (longList.length >= 8) {
      push(`có nguồn UTM (${longList.length} dòng, nhánh đơn dài)`, { multi: longList, src: SRC });
      push("8 dòng, mỗi dòng số lượng 5 (nhánh đơn dài)", { multi: longList.slice(0, 8).map((x) => ({ ...x, qty: 5 })) });
    }
    if (plainsS.length >= 3) push("3 dòng, mỗi dòng số lượng 20", { multi: plainsS.slice(0, 3).map((x) => ({ ...x, qty: 20 })) });
    push("nguồn có khoá lạ (phải bị chặn)", { src: { ...SRC, hack: "x" }, expectDeny: true });
    push("nguồn quá dài 41 ký tự (phải bị chặn)", { src: { ...SRC, campaign: "a".repeat(41) }, expectDeny: true });
    push("nguồn thiếu source (phải bị chặn)", { src: { medium: "paid_social" }, expectDeny: true });
    push("nguồn có kiểu dữ liệu sai (phải bị chặn)", { src: { source: "facebook", at: "hôm nay" }, expectDeny: true });
  }
}
let failed = 0;
for (const [i, c] of cases.entries()) {
  const phone = `0900000${String(i).padStart(3, "0")}`;
  const code = makeOrderCode();
  const lines = (c.multi || [c]).map((x) => ({ id: x.id, name: x.name, qty: x.qty || 1, note: "", price: x.price }));
  const phoneVal = c.rawPhone ? normalizePhone(c.rawPhone) : phone;
  const order = buildOrderDoc({ code, uid, value: { name: "KIEM THU TU DONG", phone: phoneVal, mode: c.mode || "pickup", address: c.address || "", table: "", note: c.note || "" }, lines, src: c.src || null });
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
  const want = !c.expectDeny;
  console.log(`[${c.label}] ${c.name} ${c.price}đ -> HTTP ${r.status} ${r.ok === want ? (want ? "ĐẶT ĐƯỢC" : "BỊ CHẶN ĐÚNG") : `SAI (mong ${want ? "đặt được" : "bị chặn"}) ${text.slice(0, 300)}`}`);
  if (r.ok !== want) failed++;
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
