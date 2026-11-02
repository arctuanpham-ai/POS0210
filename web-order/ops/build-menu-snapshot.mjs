// Dựng bản chụp menu cho khách (online_menu/data + online_menu/thumbs_*) bằng quyền quản trị. Chạy trong GitHub Actions sau khi gcloud đã đăng nhập.
//   node web-order/ops/build-menu-snapshot.mjs            -> chỉ ghi khi menu đổi / ảnh đổi / ảnh quá 24 giờ chưa làm mới
//   node web-order/ops/build-menu-snapshot.mjs --force    -> luôn dựng lại cả menu lẫn ảnh
// Chi phí đọc mỗi lần chạy khi không có gì đổi: khoảng 75 lượt (menu + nhóm + combo + vài cấu hình); chỉ đọc thêm ~50 ảnh nhỏ khi cần.
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { STORE_ID, STORE_OWNER_UID, firebaseConfig } from "../public/config.js";
import { SNAPSHOT_DOC, THUMB_DOC_PREFIX, TOP_REFRESH_MS, buildSnapshot, menuContent, menuHash, topSellerIds, usableSnapshot } from "../public/menu-snapshot.js";

export const THUMB_MAX_AGE_MS = 24 * 3_600_000;

/** Giá trị Firestore REST -> giá trị JS thường. */
export function decodeValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  return null;
}
export const decodeFields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, decodeValue(v)]));

/** Giá trị JS thường -> Firestore REST. */
export function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { mapValue: { fields: encodeFields(v) } };
}
export const encodeFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, encodeValue(v)]));

/** Có cần dựng lại không; có cần đọc lại ảnh / thống kê bán hàng không? (thống kê chỉ đọc lại sau 12 giờ để tiết kiệm lượt đọc) */
export function planRebuild({ existing, hash, shopThumbsVer, now, force = false }) {
  if (force || !usableSnapshot(existing)) return { write: true, thumbs: true, top: true, why: force ? "bắt buộc" : "chưa có bản chụp / sai phiên bản" };
  const thumbsStale = Number(existing.thumbsVer || 0) < Number(shopThumbsVer || 0) || !Number(existing.thumbsParts) || now - Number(existing.thumbsBuiltAt || 0) > THUMB_MAX_AGE_MS;
  const topStale = now - Number(existing.topAt || 0) > TOP_REFRESH_MS;
  if (existing.hash !== hash) return { write: true, thumbs: thumbsStale, top: topStale, why: "menu đổi" };
  if (thumbsStale || topStale) return { write: true, thumbs: thumbsStale, top: topStale, why: thumbsStale ? "ảnh đổi hoặc quá 24 giờ" : "làm mới món bán chạy" };
  return { write: false, thumbs: false, top: false, why: "không đổi" };
}

async function main() {
  const force = process.argv.includes("--force");
  const project = firebaseConfig.projectId;
  const db = `projects/${project}/databases/(default)/documents`;
  const root = `${db}/users/${STORE_OWNER_UID}/stores/${STORE_ID}`;
  const token = execSync("gcloud auth print-access-token").toString().trim();
  const api = (path, init = {}) => fetch(`https://firestore.googleapis.com/v1/${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) } });
  let reads = 0;
  const list = async (name) => {
    const out = []; let pageToken = "";
    do {
      const r = await api(`${root}/${name}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      if (!r.ok) throw new Error(`đọc ${name}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      for (const d of j.documents || []) out.push({ id: d.name.split("/").pop(), ...decodeFields(d.fields) });
      pageToken = j.nextPageToken || "";
    } while (pageToken);
    reads += out.length;
    return out;
  };
  const one = async (path) => {
    const r = await api(`${root}/${path}`);
    reads += 1;
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`đọc ${path}: HTTP ${r.status}`);
    return decodeFields((await r.json()).fields);
  };
  const [items, cats, combos, hiddenDoc, shop, existing] = await Promise.all([list("menu"), list("menuCategories"), list("combos"), one("online_config/menu"), one("online_config/shop"), one(`online_menu/${SNAPSHOT_DOC}`)]);
  const hidden = Array.isArray(hiddenDoc?.hidden) ? hiddenDoc.hidden : [];
  const now = Date.now();
  const hash = menuHash(menuContent({ items, cats, combos, hidden }));
  const plan = planRebuild({ existing, hash, shopThumbsVer: shop?.thumbsVersion, now, force });
  if (!plan.write) { console.log(`Bản chụp menu: ${plan.why} (đã đọc ${reads} tài liệu).`); return; }
  let thumbs = null;
  if (plan.thumbs) {
    const rows = await list("menuThumbs");
    thumbs = Object.fromEntries(rows.filter((t) => typeof t.thumb === "string").map((t) => [t.id, t.thumb]));
  }
  let top = null;
  if (plan.top) {
    const dailies = await list("dashboardDaily");
    top = topSellerIds(dailies, items, { hidden });
  }
  const built = buildSnapshot({ items, cats, combos, hidden, thumbs, thumbsVer: Number(shop?.thumbsVersion || 0), top, keep: existing, now, by: "ACTIONS" });
  const writes = [{ update: { name: `${root}/online_menu/${SNAPSHOT_DOC}`, fields: encodeFields(built.data) } }];
  for (const [id, data] of Object.entries(built.thumbDocs || {})) writes.push({ update: { name: `${root}/online_menu/${id}`, fields: encodeFields(data) } });
  // Số nhóm ảnh giảm so với bản cũ: xoá các nhóm dư.
  if (built.thumbDocs) for (let i = built.data.thumbsParts; i < Number(existing?.thumbsParts || 0); i += 1) writes.push({ delete: `${root}/online_menu/${THUMB_DOC_PREFIX}${i}` });
  // Ghi ảnh trước rồi mới ghi menu (cùng một commit nguyên tử): khách không bao giờ thấy menu mới kèm danh sách nhóm ảnh cũ.
  const r = await api(`${db}:commit`, { method: "POST", body: JSON.stringify({ writes: [...writes.slice(1), writes[0]] }) });
  if (!r.ok) throw new Error(`ghi bản chụp: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  console.log(`Bản chụp menu đã cập nhật (${plan.why}): ${built.data.items.length} món, ${built.data.cats.length} nhóm, ${built.data.combos.length} combo, ${built.data.thumbsParts} nhóm ảnh${plan.thumbs ? " (đã làm mới ảnh)" : ""}${plan.top ? `, ${built.data.top.length} món bán chạy` : ""}. Đã đọc ${reads} tài liệu.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(`LỖI: ${e.message}`); process.exit(1); });
