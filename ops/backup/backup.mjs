// Sao lưu cộng dồn Firestore → Google Drive, A/B luân phiên. Chạy bằng Node 22, không cần thư viện ngoài.
// Biến môi trường: GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN (bỏ trống + DRY_RUN=1 để chỉ thử đọc Firestore).
import { execSync } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import { appendFileSync } from "node:fs";
import { DELTA, FULL, PROJECT, SCAN, expireWeekly, idOf, mergeDocs, otherSlot, rotationJobs, scanPlan, sinceFrom } from "./lib.mjs";

const DRY = process.env.DRY_RUN === "1";
const MAX_READS = Number(process.env.MAX_READS || 8000); // vượt mức này thì dừng, không ghi file thiếu
const BOOT_READS = Number(process.env.BOOT_READS || 14000);
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const root = `${FS}/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210`;
const t0 = Date.now();
const summary = [];
const note = (s) => { summary.push(s); console.log(s); };
const flush = () => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### Sao lưu POS0210\n" + summary.map((s) => `- ${s}`).join("\n") + "\n"); };

const gcloudToken = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
let reads = 0, budget = MAX_READS;
const spend = (n) => { reads += n; if (reads > budget) throw new Error(`Đã đọc ${reads} lượt, vượt mức an toàn ${budget}: dừng, không ghi bản sao lưu thiếu.`); };
const fsPost = async (url, body) => {
  const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${gcloudToken}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Firestore ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
};

/** Truy vấn có phân trang. field: lọc mốc thời gian >= since (sắp theo field rồi tên tài liệu); startAfter: con trỏ tên tài liệu khi quét. */
async function query(collection, { field = null, since = 0, startAfter = null, limit = 0, extra = null }) {
  const out = [];
  let cursor = startAfter, startInclusive = false;
  for (;;) {
    const page = Math.min(300, limit ? limit - out.length : 300);
    if (page <= 0) break;
    const q = { from: [{ collectionId: collection }], limit: page, orderBy: field ? [{ field: { fieldPath: field } }, { field: { fieldPath: "__name__" } }] : [{ field: { fieldPath: "__name__" } }] };
    const filters = [];
    if (field && since > 0) filters.push({ fieldFilter: { field: { fieldPath: field }, op: "GREATER_THAN_OR_EQUAL", value: { integerValue: String(since) } } });
    if (extra) filters.push(extra);
    if (filters.length) q.where = filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } };
    if (cursor) q.startAt = { values: cursor, before: startInclusive };
    const rows = (await fsPost(`${root}:runQuery`, { structuredQuery: q })).filter((r) => r.document);
    spend(Math.max(1, rows.length));
    out.push(...rows.map((r) => r.document));
    if (rows.length < page) break;
    const last = rows[rows.length - 1].document;
    cursor = field ? [last.fields?.[field] || { nullValue: null }, { referenceValue: last.name }] : [{ referenceValue: last.name }];
    startInclusive = false;
  }
  return out;
}
const countOf = async (collection) => {
  const r = await fsPost(`${root}:runAggregationQuery`, { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: collection }] }, aggregations: [{ alias: "n", count: {} }] } });
  spend(1);
  return Number(r[0]?.result?.aggregateFields?.n?.integerValue || 0);
};

// ---------- Google Drive (OAuth, phạm vi drive.file: chỉ thấy file do chính script tạo) ----------
let driveToken = "";
const drive = {
  async auth() {
    const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GDRIVE_CLIENT_ID, client_secret: process.env.GDRIVE_CLIENT_SECRET, refresh_token: process.env.GDRIVE_REFRESH_TOKEN, grant_type: "refresh_token" }) });
    const j = await res.json();
    if (!res.ok) throw new Error(`Drive đăng nhập lỗi: ${JSON.stringify(j).slice(0, 200)} (nếu invalid_grant: cấp lại mã truy cập và để ứng dụng OAuth ở trạng thái "In production")`);
    driveToken = j.access_token;
  },
  async api(path, init = {}) {
    const res = await fetch(`https://www.googleapis.com${path}`, { ...init, headers: { authorization: `Bearer ${driveToken}`, ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res;
  },
  async list(q) { return (await (await this.api(`/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,size)&pageSize=200&spaces=drive`)).json()).files; },
  async folder() {
    const found = await this.list("name='POS0210-Backup' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    if (found.length) return found[0].id;
    return (await (await this.api("/drive/v3/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "POS0210-Backup", mimeType: "application/vnd.google-apps.folder" }) })).json()).id;
  },
  async find(folder, name) { return (await this.list(`name='${name}' and '${folder}' in parents and trashed=false`))[0] || null; },
  async download(id) { return Buffer.from(await (await this.api(`/drive/v3/files/${id}?alt=media`)).arrayBuffer()); },
  /** Tạo mới hoặc ghi đè cùng tên, dạng resumable cho file lớn. */
  async upload(folder, name, buf, mime) {
    const existing = await this.find(folder, name);
    const meta = existing ? {} : { name, parents: [folder] };
    const start = await this.api(`/upload/drive/v3/files${existing ? `/${existing.id}` : ""}?uploadType=resumable`, { method: existing ? "PATCH" : "POST", headers: { "content-type": "application/json", "x-upload-content-type": mime }, body: JSON.stringify(meta) });
    const res = await fetch(start.headers.get("location"), { method: "PUT", headers: { "content-type": mime }, body: buf });
    if (!res.ok) throw new Error(`Tải lên ${name} lỗi ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).id;
  },
  async copy(id, folder, name) {
    const old = await this.find(folder, name);
    if (old) await this.trash(old.id);
    await this.api(`/drive/v3/files/${id}/copy`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, parents: [folder] }) });
  },
  async trash(id) { await this.api(`/drive/v3/files/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed: true }) }); },
};

// ---------- Chạy ----------
try {
  let folder = null, state = { current: null, lastRunAt: 0, cursors: {} }, snap = null;
  if (!DRY) {
    await drive.auth();
    folder = await drive.folder();
    const sf = await drive.find(folder, "state.json");
    if (sf) state = { ...state, ...JSON.parse((await drive.download(sf.id)).toString()) };
    if (state.current) {
      const f = await drive.find(folder, `snapshot-${state.current}.json.gz`);
      if (f) snap = JSON.parse(gunzipSync(await drive.download(f.id)).toString());
    }
  }
  const bootstrap = !snap;
  if (bootstrap) { snap = { meta: {}, data: {} }; budget = BOOT_READS; note("Lần đầu: đọc toàn bộ để tạo bản gốc."); }
  const since = bootstrap ? 0 : sinceFrom(state.lastRunAt, t0);
  const added = {};
  const take = (c, docs) => {
    const r = mergeDocs(snap, c, docs);
    if (r.added || r.changed) { const a = added[c] || { added: 0, changed: 0 }; added[c] = { added: a.added + r.added, changed: a.changed + r.changed }; }
    return r;
  };

  for (const c of FULL) take(c, await query(c, {}));
  const changedBatches = new Set();
  for (const [c, fields] of Object.entries(DELTA)) {
    for (const field of fields) {
      const docs = await query(c, { field, since });
      if (c === "orderBatches") docs.forEach((d) => changedBatches.add(idOf(d.name)));
      take(c, docs);
    }
  }
  const ids = [...changedBatches];
  for (let i = 0; i < ids.length; i += 30) {
    const values = ids.slice(i, i + 30).map((s) => ({ stringValue: s }));
    take("orderItems", await query("orderItems", { extra: { fieldFilter: { field: { fieldPath: "batchId" }, op: "IN", value: { arrayValue: { values } } } } }));
  }
  let drift = 0, scanned = 0;
  if (bootstrap) take("orderItems", await query("orderItems", {}));
  else {
    const counts = Object.fromEntries(await Promise.all(SCAN.map(async (c) => [c, await countOf(c)])));
    for (const [c, n] of Object.entries(scanPlan(counts))) {
      const cur = state.cursors?.[c] ? [{ referenceValue: state.cursors[c] }] : null;
      const docs = await query(c, { startAfter: cur, limit: n });
      scanned += docs.length;
      const r = mergeDocs(snap, c, docs);
      drift += r.added + r.changed; // tài liệu mà delta không báo nhưng bản trên Firestore khác bản đã lưu
      state.cursors = { ...(state.cursors || {}), [c]: docs.length < n ? null : docs[docs.length - 1].name };
    }
  }
  const totalDocs = Object.values(snap.data).reduce((t, b) => t + Object.keys(b).length, 0);
  snap.meta = { at: t0, docs: totalDocs, collections: Object.fromEntries(Object.entries(snap.data).map(([c, b]) => [c, Object.keys(b).length])) };
  note(`Đọc ${reads} lượt · tổng ${totalDocs} tài liệu · quét kiểm tra ${scanned} · lệch phát hiện ${drift}.`);
  note("Thay đổi: " + (Object.entries(added).map(([c, v]) => `${c} +${v.added}/~${v.changed}`).join(", ") || "không"));
  note("Số tài liệu mỗi bảng: " + Object.entries(snap.meta.collections).map(([c, n]) => `${c} ${n}`).join(", "));

  if (DRY) note("DRY_RUN: không ghi lên Drive.");
  else {
    const gz = gzipSync(Buffer.from(JSON.stringify(snap)), { level: 9 });
    const slot = otherSlot(state.current || "B");
    await drive.upload(folder, `snapshot-${slot}.json.gz`, gz, "application/gzip");
    const check = await drive.find(folder, `snapshot-${slot}.json.gz`);
    if (!check || Number(check.size) !== gz.length) throw new Error("Kiểm tra sau khi tải lên không khớp kích thước: giữ nguyên bản cũ.");
    state = { ...state, current: slot, lastRunAt: t0 };
    await drive.upload(folder, "state.json", Buffer.from(JSON.stringify(state)), "application/json");
    note(`Đã ghi snapshot-${slot} (${(gz.length / 1048576).toFixed(1)} MB).`);
    const jobs = rotationJobs(t0);
    for (const name of [jobs.weekly, jobs.monthly].filter(Boolean)) { await drive.copy(check.id, folder, name); note(`Đã chốt bản ${name}.`); }
    const all = await drive.list(`'${folder}' in parents and trashed=false`);
    for (const n of expireWeekly(all.map((f) => f.name), 8)) { await drive.trash(all.find((f) => f.name === n).id); note(`Bỏ bản tuần cũ ${n} (vào thùng rác Drive).`); }
  }
  note(`Xong sau ${Math.round((Date.now() - t0) / 1000)}s.`);
  flush();
} catch (e) {
  note(`LỖI: ${e.message}`);
  flush();
  process.exit(1);
}
