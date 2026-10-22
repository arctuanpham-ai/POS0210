// Chẩn đoán luật đặt đơn bằng Firebase Rules Test API (không ghi dữ liệu thật). Chạy trong CI sau gcloud auth.
import { execSync } from "node:child_process";
import { STORE_OWNER_UID, STORE_ID, firebaseConfig } from "../public/config.js";
const project = firebaseConfig.projectId;
const token = execSync("gcloud auth print-access-token").toString().trim();
const api = async (url, opt = {}) => { const r = await fetch(url, { ...opt, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const rel = await api(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`);
const rs = await api(`https://firebaserules.googleapis.com/v1/${rel.body.rulesetName}`);
let src = rs.body.source?.files?.[0]?.content || "";
console.log("[dbg] ruleset", rel.body.rulesetName?.split("/").pop(), "bytes", src.length);
const dbgBlock = `
match /dbg/{id} {
  allow create: if id == 'sum' && linesSum(request.resource.data.items) == request.resource.data.expect;
  allow update: if id == 'valid' && linesValid(request.resource.data.items);
}
`;
// chèn khối thử trước dấu } đóng của "match /databases/{database}/documents"
const idx = src.lastIndexOf("}", src.lastIndexOf("}") - 1);
const source = src.slice(0, idx) + dbgBlock + src.slice(idx);
const root = `/databases/(default)/documents/users/${STORE_OWNER_UID}/stores/${STORE_ID}`;
const line = (id, name, price, qty = 1) => ({ id, name, qty, note: "", price });
const mock = (kind, id, name, price) => ({ function: "get", args: [{ exactValue: `${root}/${kind}/${id}` }], result: { value: { data: { name, price, active: true } } } });
const auth = { uid: "g1", token: { firebase: { sign_in_provider: "anonymous" } } };
const cases = [];
for (const n of [1, 2, 3]) {
  const items = [line("a", "A", 1000), line("b", "B", 2000), line("c_x", "C", 3000)].slice(0, n);
  const expect = items.reduce((s, l) => s + l.price * l.qty, 0);
  cases.push({ label: `sum n=${n}`, tc: { expectation: "ALLOW", expressionReportLevel: "VISITED", request: { method: "create", auth, path: "/databases/(default)/documents/dbg/sum" }, resource: { data: { items, expect } } } });
  cases.push({ label: `valid n=${n}`, tc: { expectation: "ALLOW", expressionReportLevel: "VISITED", request: { method: "update", auth, path: "/databases/(default)/documents/dbg/valid" }, resource: { data: { items } }, functionMocks: [mock("menu", "a", "A", 1000), mock("menu", "b", "B", 2000), mock("combos", "x", "C", 3000)] } });
}
const res = await api(`https://firebaserules.googleapis.com/v1/projects/${project}:test`, { method: "POST", body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: source }] }, testSuite: { testCases: cases.map((c) => c.tc) } }) });
console.log("[dbg] test http", res.status, JSON.stringify(res.body).replace(/[{}"\\]/g, "").slice(0, 400));
(res.body.testResults || []).forEach((r, i) => {
  const msgs = (r.debugMessages || []).join(" / ").replace(/[{}"\\]/g, "").slice(0, 300);
  const errs = (r.errorPosition ? `err@${r.errorPosition.line}` : "");
  console.log(`[dbg] ${cases[i].label} -> ${r.state} ${errs} ${msgs}`);
});
// run 1792636213
// 1792636427
// 1792636983
