// Nút mở thẳng app ngân hàng của khách (VietQR Deeplink: https://dl.vietqr.io/pay?app=...&ba=STK@MÃ&am=...&tn=...).
// Danh sách app lấy từ API công khai của VietQR (android-app-deeplinks / ios-app-deeplinks) tháng 10/2026.
// autofill=true: app tự điền sẵn số tiền + nội dung; false: chỉ mở app, khách dán thông tin từ nút Sao chép.
import { resolveBin } from "./vietqr.js";

export const BANK_APPS = Object.freeze([
  { id: "icb", name: "VietinBank iPay", autofill: true }, { id: "bidv", name: "BIDV SmartBanking", autofill: true },
  { id: "ocb", name: "OCB OMNI", autofill: true }, { id: "acb", name: "ACB ONE", autofill: true }, { id: "mb", name: "MB Bank", autofill: true },
  { id: "vcb", name: "VCB Digibank", autofill: false }, { id: "tcb", name: "Techcombank", autofill: false }, { id: "vpb", name: "VPBank NEO", autofill: false },
  { id: "vib-2", name: "MyVIB", autofill: false }, { id: "shb", name: "SHB SAHA", autofill: false }, { id: "lpb", name: "LPBank", autofill: false },
  { id: "seab", name: "SeAMobile", autofill: false }, { id: "scb", name: "SCB Mobile", autofill: false }, { id: "cake", name: "CAKE", autofill: false },
  { id: "hdb", name: "HDBank", autofill: false }, { id: "vba", name: "Agribank Plus", autofill: false }, { id: "tpb", name: "TPBank Mobile", autofill: false },
  { id: "timo", name: "Timo", autofill: false }, { id: "shbvn", name: "Shinhan SOL", autofill: false }, { id: "nab", name: "Nam A Bank", autofill: false },
  { id: "abb", name: "ABBank", autofill: false }, { id: "eib", name: "Eximbank EDigi", autofill: false }, { id: "coopbank", name: "Co-opBank", autofill: false },
  { id: "pvcb", name: "PVConnect", autofill: false }, { id: "klb", name: "KienlongBank Plus", autofill: false }, { id: "ncb", name: "NCB iziMobile", autofill: false },
  { id: "sgicb", name: "SAIGONBANK", autofill: false }, { id: "oceanbank", name: "Ocean Bank", autofill: false }, { id: "vab", name: "Vietbank Digital", autofill: false },
]);

// BIN ngân hàng nhận tiền -> mã ngân hàng dùng trong tham số ba (STK@mã) theo danh mục VietQR.
const CODE_BY_BIN = Object.freeze({
  "970415": "icb", "970436": "vcb", "970418": "bidv", "970405": "vba", "970422": "mb", "970407": "tcb", "970416": "acb", "970432": "vpb", "970403": "stb",
  "970423": "tpb", "970437": "hdb", "970448": "ocb", "970441": "vib", "970443": "shb", "970431": "eib", "970426": "msb", "970449": "lpb", "970440": "seab",
  "970412": "pvcb", "970419": "ncb", "970427": "vab", "970409": "bab", "970425": "abb", "970452": "klb", "970428": "nab", "546034": "cake", "963388": "timo",
});

/** Mã ngân hàng nhận tiền của quán (từ tên hoặc BIN đã cài); "" nếu không nhận ra. */
export const receivingBankCode = (bank) => CODE_BY_BIN[resolveBin(bank) || ""] || "";

/** Liên kết mở app ngân hàng `appId` với đủ thông tin chuyển khoản. Trả "" nếu thiếu dữ liệu. */
export function bankDeeplink(appId, { account, bank, amount, content, holder = "", returnUrl = "" }) {
  const code = receivingBankCode(bank);
  const acc = String(account ?? "").replace(/\s+/g, "");
  const am = Math.round(Number(amount));
  if (!appId || !code || !/^[0-9A-Za-z]{4,25}$/.test(acc) || !(am > 0) || !String(content ?? "").trim()) return "";
  const q = [["app", appId], ["ba", `${acc}@${code}`], ["am", String(am)], ["tn", String(content).trim()]];
  if (holder) q.push(["bn", String(holder).trim()]);
  q.push(["url", returnUrl || "https://datmon0210.web.app/"]);
  return `https://dl.vietqr.io/pay?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}
