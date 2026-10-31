// Khôi phục CHỌN LỌC từ file sao lưu về Firestore. Mặc định chỉ xem trước; thêm --apply mới ghi.
// Dùng: node ops/backup/restore.mjs snapshot-A.json.gz <bảng> <id1,id2,...> [--apply]
// Mỗi tài liệu ghi là một lượt GHI (hạn mức 20.000/ngày): chỉ nên khôi phục vài chục đến vài trăm tài liệu mỗi ngày.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { PROJECT, UID } from "./lib.mjs";

const [file, collection, idList] = process.argv.slice(2);
const apply = process.argv.includes("--apply");
if (!file || !collection || !idList) { console.error("Dùng: node restore.mjs <file.json.gz> <bảng> <id1,id2,...> [--apply]"); process.exit(2); }
const raw = readFileSync(file);
const snap = JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString());
const ids = idList.split(",").map((s) => s.trim()).filter(Boolean);
if (apply && ids.length > 500) { console.error("Tối đa 500 tài liệu mỗi lần để không cạn hạn mức ghi."); process.exit(2); }
const token = apply ? execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim() : "";
console.log(`Bản sao lưu lúc ${new Date(snap.meta?.at || 0).toISOString()} · ${apply ? "GHI THẬT" : "xem trước (không ghi)"}`);
for (const id of ids) {
  const rec = snap.data?.[collection]?.[id];
  if (!rec) { console.log(`- ${collection}/${id}: không có trong bản sao lưu`); continue; }
  console.log(`- ${collection}/${id}: ${Object.keys(rec.fields || {}).length} trường, cập nhật ${rec.updateTime}`);
  if (!apply) continue;
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/${UID}/stores/0210/${collection}/${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ fields: rec.fields }) });
  console.log(res.ok ? "  đã ghi" : `  LỖI ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
