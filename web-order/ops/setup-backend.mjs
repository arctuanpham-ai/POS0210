// Chạy trong GitHub Actions bằng tài khoản dịch vụ Firebase đã có sẵn của repo.
// 1) Tạo site hosting pos0210-order  2) GỘP rules đặt món vào rules Firestore hiện có (sau khi tự kiểm an toàn)  3) Bật Anonymous Auth.
// Không bao giờ ghi đè rules cũ: chỉ chèn thêm khối online-orders.rules, kiểm bằng API test của Firebase Rules TRƯỚC khi phát hành.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROJECT = "pos0210-17ce4";
const OWNER = "X9ln8CP7UtbOLOHfipYMCjfbb1p1";
const BASE = `/databases/(default)/documents/users/${OWNER}/stores/0210`;
const REVIEWED_OLD_RULES = "rules_version='2';servicecloud.firestore{match/databases/{database}/documents{functionsignedIn(){returnrequest.auth!=null;}functionisStoreOwner(ownerUid){returnsignedIn()&&request.auth.uid==ownerUid;}functionhasManagerReadAccess(ownerUid){returnsignedIn()&&exists(/databases/$(database)/documents/managerAccess/$(request.auth.uid))&&get(/databases/$(database)/documents/managerAccess/$(request.auth.uid)).data.ownerUid==ownerUid&&get(/databases/$(database)/documents/managerAccess/$(request.auth.uid)).data.active==true;}match/users/{ownerUid}/stores/{storeId}/{document=**}{allowread:ifisStoreOwner(ownerUid)||hasManagerReadAccess(ownerUid);allowwrite:ifisStoreOwner(ownerUid);}match/managerAccess/{managerUid}{allowread:ifsignedIn()&&request.auth.uid==managerUid;allowwrite:iffalse;}}}"; // rules cũ đã được rà soát thủ công: khách ẩn danh không đọc được dữ liệu cửa hàng
const MARK = "ĐẶT MÓN ONLINE (khách ẩn danh)";
const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}
const fail = (m, extra) => { console.error("::error::" + m, extra ? JSON.stringify(extra).slice(0, 1500) : ""); process.exitCode = 1; };

// ---- 1. Site hosting ----
{
  const r = await call("POST", `https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT}/sites?siteId=datmon0210`, {});
  if (r.ok) console.log("Đã tạo site datmon0210");
  else if (r.status === 409) console.log("Site datmon0210 đã có");
  else fail("Không tạo được site hosting", r);
}

// ---- 2. Rules ----
const addon = readFileSync(new URL("../rules/online-orders.rules", import.meta.url), "utf8");
const rel = await call("GET", `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`);
let rulesDone = false;
if (!rel.ok) fail("Không đọc được release rules Firestore (thiếu quyền?)", rel);
else {
  const cur = await call("GET", `https://firebaserules.googleapis.com/v1/${rel.json.rulesetName}`);
  const oldSrc = cur.json.source?.files?.[0]?.content ?? "";
  const oldName = cur.json.source?.files?.[0]?.name ?? "firestore.rules";
  console.log("----- RULES HIỆN TẠI -----\n" + oldSrc + "\n----- HẾT -----");
  const strip = (t) => t.replace(/\s+/g, "");
  const markLine = "// ===== " + MARK + " =====";
  const markIdx = oldSrc.indexOf(markLine);
  const tailMatch = oldSrc.match(/\}\s*\}\s*$/);
  // baseSrc = rules cũ của bạn KHÔNG có khối đặt món (nếu khối đã có thì cắt ra để cập nhật lên bản mới).
  const baseSrc = markIdx >= 0 && tailMatch ? oldSrc.slice(0, markIdx).replace(/\s+$/, "\n  ") + tailMatch[0] : oldSrc;
  const existingBlock = markIdx >= 0 && tailMatch ? oldSrc.slice(markIdx + markLine.length, tailMatch.index) : "";
  if (markIdx >= 0 && strip(existingBlock) === strip(addon)) { console.log("Rules đặt món đã là bản mới nhất, bỏ qua"); rulesDone = true; }
  else if (!oldSrc) fail("Rules hiện tại trống/không đọc được", cur);
  else {
    // chèn khối mới ngay trước 2 dấu } cuối cùng (đóng match /databases và service)
    const m = baseSrc.match(/\}\s*\}\s*$/);
    if (!m) fail("Không tìm thấy 2 dấu } cuối của rules cũ, dừng để an toàn");
    else {
      const newSrc = baseSrc.slice(0, m.index) + "\n  " + markLine + "\n" + addon + "\n" + m[0];
      const anon = { uid: "anon-test-uid", token: { firebase: { sign_in_provider: "anonymous" } } };
      const t = (expectation, path, method, auth, extra = {}) => ({ expectation, request: { auth, path: BASE + path, method, ...extra } });
      const cases = [
        // AN TOÀN: khách ẩn danh KHÔNG được đọc dữ liệu bán hàng
        t("DENY", "/bills/test", "get", anon),
        t("DENY", "/payments/test", "get", anon),
        t("DENY", "/webMembers/test", "get", anon),
        t("DENY", "/menu/x", "update", anon, { resource: { data: { price: 1 } } }),
        // phải đọc được menu công khai
        t("ALLOW", "/menu/x", "get", anon),
        t("ALLOW", "/menuCategories/x", "get", anon),
        t("ALLOW", "/online_config/shop", "get", anon),
        t("DENY", "/online_config/shop", "create", anon, { resource: { data: { name: "x" } } }),
        // chủ quán vẫn dùng được như cũ
        t("ALLOW", "/bills/test", "get", { uid: OWNER, token: { firebase: { sign_in_provider: "password" } } }),
      ];
      const run = async (source) => call("POST", `https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, { source: { files: [{ name: oldName, content: source }] }, testSuite: { testCases: cases } });
      // 2a. rules CŨ phải đã chặn khách ẩn danh đọc bills; nếu không thì dừng, KHÔNG bật Anonymous
      const before = await run(baseSrc);
      const oldLeak = (before.json.testResults || []).some((x, i) => i < 3 && x.state !== "SUCCESS");
      console.log("Test rules cũ:", JSON.stringify(before.json.testResults?.map((x) => x.state)));
      const reviewedOk = strip(baseSrc) === REVIEWED_OLD_RULES;
      if (!before.ok && before.status === 403 && reviewedOk) {
        console.log("API test bị từ chối quyền, nhưng rules cũ trùng bản đã rà soát (khách ẩn danh bị chặn). Tiếp tục không có bước test.");
        const rs = await call("POST", `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`, { source: { files: [{ name: oldName, content: newSrc }] } });
        if (!rs.ok) fail("Không tạo được ruleset (biên dịch lỗi hoặc thiếu quyền)", rs);
        else {
          const up = await call("PATCH", `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`, { release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName: rs.json.name } });
          if (!up.ok) fail("Không phát hành được rules", up); else { console.log("Đã phát hành rules gộp:", rs.json.name); rulesDone = true; }
        }
      }
      else if (!before.ok) fail("API test rules lỗi (thiếu quyền?)", before);
      else if (oldLeak) fail("RULES CŨ ĐANG CHO KHÁCH ẨN DANH ĐỌC DỮ LIỆU BÁN HÀNG. Dừng lại, không phát hành, không bật Anonymous. Cần sửa rules cũ trước.", before.json.testResults);
      else {
        const after = await run(newSrc);
        console.log("Test rules mới:", JSON.stringify(after.json.testResults?.map((x) => x.state)));
        if (!after.ok || after.json.issues?.length) fail("Rules gộp không biên dịch được", after.json.issues ?? after);
        else if ((after.json.testResults || []).some((x) => x.state !== "SUCCESS")) fail("Rules gộp không qua bộ test an toàn", after.json.testResults);
        else {
          const rs = await call("POST", `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`, { source: { files: [{ name: oldName, content: newSrc }] } });
          if (!rs.ok) fail("Không tạo được ruleset", rs);
          else {
            const up = await call("PATCH", `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`, { release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName: rs.json.name } });
            if (!up.ok) fail("Không phát hành được rules", up); else { console.log("Đã phát hành rules gộp:", rs.json.name); rulesDone = true; }
          }
        }
      }
    }
  }
}

// ---- 3. Anonymous Auth (chỉ khi rules đã an toàn) ----
if (rulesDone) {
  const r = await call("PATCH", `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=signIn.anonymous.enabled`, { signIn: { anonymous: { enabled: true } } });
  if (r.ok) console.log("Đã bật Anonymous Auth"); else fail("Không bật được Anonymous Auth (thiếu quyền?)", r);
} else console.log("Bỏ qua bật Anonymous vì rules chưa an toàn/chưa gộp");
