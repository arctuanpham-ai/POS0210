// Quy trình hoàn ứng: người mua ứng tiền → up phiếu → thủ quỹ duyệt → hoàn tiền (QR động) → người mua xác nhận.
// Hàm thuần: không Firebase, không DOM.

export const FUND_PERSONAL = "PERSONAL";   // tiền túi người mua, cần hoàn
export const FUND_SHOP_CASH = "SHOP_CASH"; // tiền mặt quỹ quán, không hoàn
export const FUND_SHOP_BANK = "SHOP_BANK"; // chuyển khoản từ tài khoản quán, không hoàn
export const FUND_LABELS = { PERSONAL: "Tiền cá nhân · cần hoàn", SHOP_CASH: "Tiền mặt quỹ quán", SHOP_BANK: "CK từ tài khoản quán" };
export const STATUS_LABELS = { PENDING: "Chờ duyệt", APPROVED: "Đã duyệt · chờ hoàn", REJECTED: "Không duyệt", PAID: "Đã hoàn · chờ xác nhận", CONFIRMED: "Đã nhận tiền", NONE: "Không cần hoàn", UNKNOWN: "Chưa rõ nguồn tiền" };

const pad = (n) => String(n).padStart(2, "0");
/** Không dấu, in hoa, chỉ chữ số và khoảng trắng: dùng cho nội dung chuyển khoản. */
export const asciiUpper = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
/** Tên viết tắt dễ nhận ra: tên cuối, tối đa 8 ký tự (Phạm Thị Hương → HUONG). */
export const shortName = (name) => { const w = asciiUpper(name).split(" ").filter(Boolean); return (w[w.length - 1] || "KHAC").slice(0, 8); };

/** Mã phiếu dễ đọc: PC + ngày tháng mua + tên người mua + 3 ký tự cuối của id. VD PC1610-HUONG-7F3. */
export const receiptCode = (receipt) => {
  if (receipt?.code) return receipt.code;
  const d = new Date(Number(receipt?.purchaseDate || 0));
  const tail = asciiUpper(String(receipt?.id || "")).replace(/ /g, "").slice(-3) || "000";
  return `PC${pad(d.getDate())}${pad(d.getMonth() + 1)}-${shortName(receipt?.enteredByName)}-${tail}`;
};

/** Trạng thái hoàn ứng của phiếu. Phiếu cũ chưa có thông tin nguồn tiền là UNKNOWN để không bị sót. */
export const reimbursementStatus = (receipt) => {
  if (!receipt || receipt.status === "DELETED" || receipt.status === "CANCELLED") return "NONE";
  if (receipt.fundSource && receipt.fundSource !== FUND_PERSONAL) return "NONE";
  return receipt.reimbursement?.status || (receipt.fundSource === FUND_PERSONAL ? "PENDING" : "UNKNOWN");
};

/** Phiếu nghi trùng: cùng người mua, cùng tổng tiền, ngày mua cách nhau ≤ 1 ngày. Trả Map id → danh sách mã phiếu trùng. */
export const duplicateSuspects = (receipts) => {
  const live = receipts.filter((r) => r && r.status !== "DELETED" && r.status !== "CANCELLED" && Number(r.total) > 0);
  const out = new Map();
  for (let i = 0; i < live.length; i += 1) for (let j = i + 1; j < live.length; j += 1) {
    const a = live[i], b = live[j];
    if (asciiUpper(a.enteredByName) !== asciiUpper(b.enteredByName) || Number(a.total) !== Number(b.total)) continue;
    if (Math.abs(Number(a.purchaseDate) - Number(b.purchaseDate)) > 86400000) continue;
    out.set(a.id, [...(out.get(a.id) || []), receiptCode(b)]);
    out.set(b.id, [...(out.get(b.id) || []), receiptCode(a)]);
  }
  return out;
};

/** Gom theo người mua cho màn thủ quỹ: số phiếu và tiền theo từng trạng thái. */
export const payerQueues = (receipts) => {
  const by = new Map();
  for (const r of receipts) {
    const st = reimbursementStatus(r);
    if (st === "NONE") continue;
    const key = r.enteredByName || "Chưa rõ người mua";
    const q = by.get(key) || { payer: key, PENDING: [], APPROVED: [], PAID: [], CONFIRMED: [], REJECTED: [], UNKNOWN: [] };
    q[st]?.push(r);
    by.set(key, q);
  }
  return [...by.values()].map((q) => ({ ...q, approvedTotal: q.APPROVED.reduce((s, r) => s + Number(r.total || 0), 0), pendingTotal: q.PENDING.reduce((s, r) => s + Number(r.total || 0), 0) }))
    .sort((a, b) => (b.APPROVED.length + b.PENDING.length) - (a.APPROVED.length + a.PENDING.length) || a.payer.localeCompare(b.payer));
};

/** Mã đợt hoàn: HU + ngày tháng + tên + số thứ tự trong ngày nếu trùng. VD HU1610-HUONG, HU1610-HUONG-2. */
export const batchCode = (payer, at, existingCodes = []) => {
  const d = new Date(at);
  const base = `HU${pad(d.getDate())}${pad(d.getMonth() + 1)}-${shortName(payer)}`;
  if (!existingCodes.includes(base)) return base;
  let n = 2; while (existingCodes.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

/** Nội dung chuyển khoản ngắn, không dấu, dễ đối soát sao kê: mã đợt + số phiếu. VD "HU1610 HUONG 3 PHIEU". */
export const transferNote = (code, count) => asciiUpper(`${code.replace(/-/g, " ")} ${count} PHIEU`).slice(0, 40);

/** Một phiếu chỉ được vào một đợt hoàn: lọc phiếu hợp lệ, báo phiếu không còn hợp lệ (đã hoàn, bị sửa, đã huỷ). */
export const validateBatchSelection = (selected, fresh) => {
  const freshById = new Map(fresh.map((r) => [r.id, r]));
  const problems = [];
  for (const r of selected) {
    const f = freshById.get(r.id);
    if (!f) { problems.push(`${receiptCode(r)}: không còn trên hệ thống`); continue; }
    if (f.status === "DELETED" || f.status === "CANCELLED") problems.push(`${receiptCode(r)}: phiếu đã huỷ`);
    else if (reimbursementStatus(f) !== "APPROVED") problems.push(`${receiptCode(r)}: trạng thái đã đổi thành "${STATUS_LABELS[reimbursementStatus(f)]}"`);
    else if (Number(f.total) !== Number(r.total)) problems.push(`${receiptCode(r)}: tổng tiền vừa bị sửa (${r.total} → ${f.total}), duyệt lại trước khi hoàn`);
  }
  return { ok: problems.length === 0, problems, total: selected.reduce((s, r) => s + Number(freshById.get(r.id)?.total ?? r.total ?? 0), 0) };
};

/** Phiếu bị sửa tổng tiền sau khi đã hoàn: số chênh (dương là phải hoàn thêm). 0 nếu không đổi. */
export const changedAfterPaid = (receipt) => {
  const paid = receipt?.reimbursement?.paidAmount;
  return paid === undefined || paid === null ? 0 : Number(receipt.total || 0) - Number(paid);
};

/** Đợt đã hoàn quá `days` ngày mà người nhận chưa xác nhận: cần nhắc. */
export const needsReminder = (batch, now = Date.now(), days = 1) => batch?.status === "PAID" && now - Number(batch.paidAt || 0) >= days * 86400000;

// ---------- VietQR động (EMVCo), cùng cách tính với app POS ----------
export const BANK_BINS = {
  VIETINBANK: "970415", ICB: "970415", VIETCOMBANK: "970436", VCB: "970436", BIDV: "970418", AGRIBANK: "970405", MB: "970422", MBBANK: "970422",
  TECHCOMBANK: "970407", TCB: "970407", ACB: "970416", VPBANK: "970432", SACOMBANK: "970403", TPBANK: "970423", HDBANK: "970437", OCB: "970448",
  VIB: "970441", SHB: "970443", EXIMBANK: "970431", MSB: "970426", LPBANK: "970449", SEABANK: "970440", PVCOMBANK: "970412", NCB: "970419",
  VIETABANK: "970427", BACABANK: "970409", ABBANK: "970425", KIENLONGBANK: "970452", NAMABANK: "970428", CAKE: "546034", TIMO: "963388",
};
export const BANK_CHOICES = ["Vietcombank", "Techcombank", "MB", "BIDV", "VietinBank", "Agribank", "ACB", "VPBank", "TPBank", "Sacombank", "HDBank", "VIB", "SHB", "MSB", "OCB", "SeABank", "LPBank", "Cake", "Timo"];
export const resolveBin = (bank) => { const c = asciiUpper(bank).replace(/ /g, ""); return /^9\d{5}$|^5\d{5}$/.test(c) ? c : BANK_BINS[c] ?? null; };

export const crc16 = (str) => {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(str)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) { crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1; crc &= 0xffff; }
  }
  return crc;
};
const tlv = (id, value) => { const len = new TextEncoder().encode(value).length; if (len > 99) throw new Error(`Dữ liệu VietQR quá dài tại trường ${id}`); return `${id}${String(len).padStart(2, "0")}${value}`; };

/** Chuỗi VietQR có số tiền và nội dung. Lỗi rõ ràng nếu thiếu ngân hàng / số tài khoản / số tiền. */
export const vietQrPayload = ({ bank, account, holder, amount, info }) => {
  const bin = resolveBin(bank);
  if (!bin) throw new Error(`Chưa hỗ trợ ngân hàng "${bank}". Nhập tên ngân hàng trong danh sách hoặc mã BIN 6 số.`);
  const acc = asciiUpper(account).replace(/ /g, "");
  if (!acc) throw new Error("Thiếu số tài khoản nhận tiền");
  if (acc.length > 19) throw new Error("Số tài khoản tối đa 19 ký tự");
  if (!(Number(amount) > 0) || !Number.isInteger(Number(amount))) throw new Error("Số tiền hoàn không hợp lệ");
  const merchant = tlv("00", "A000000727") + tlv("01", tlv("00", bin) + tlv("01", acc)) + tlv("02", "QRIBFTTA");
  const raw = tlv("00", "01") + tlv("01", "12") + tlv("38", merchant) + tlv("53", "704") + tlv("54", String(Number(amount))) + tlv("58", "VN") +
    tlv("59", (asciiUpper(holder) || "0210").slice(0, 25)) + tlv("60", "HAI PHONG") + tlv("62", tlv("08", asciiUpper(info).slice(0, 50))) + "6304";
  return raw + crc16(raw).toString(16).toUpperCase().padStart(4, "0");
};

// ---------- Tài khoản từng người: vai trò, tài khoản ngân hàng, cảnh báo việc cần làm ----------
export const ROLE_OWNER = "CHU_QUAN";      // tài khoản chủ quán (toàn quyền)
export const ROLE_TREASURER = "THU_QUY";   // duyệt, hoàn tiền, xem toàn bộ
export const ROLE_BUYER = "NGUOI_MUA";     // chỉ nhập phiếu của mình, xem hoàn ứng của mình, xác nhận đã nhận
export const ROLE_LABELS = { CHU_QUAN: "Chủ quán", THU_QUY: "Thủ quỹ", NGUOI_MUA: "Người mua" };
export const normEmail = (v) => String(v ?? "").trim().toLowerCase();
/** Duyệt và hoàn tiền: chủ quán hoặc thủ quỹ. */
export const canTreasure = (role) => role === ROLE_OWNER || role === ROLE_TREASURER;

/** Người mua của phiếu: theo email nếu có, phiếu cũ thì khớp theo tên. */
export const memberOf = (receiptOrBatch, members = []) => {
  const email = normEmail(receiptOrBatch?.payerEmail);
  if (email) { const m = members.find((x) => normEmail(x.email) === email); if (m) return m; }
  const name = asciiUpper(receiptOrBatch?.enteredByName ?? receiptOrBatch?.payer);
  return name ? members.find((x) => asciiUpper(x.name) === name) || null : null;
};
/** Phiếu / đợt hoàn là của tài khoản đang đăng nhập. */
export const isMine = (receiptOrBatch, email) => Boolean(normEmail(email)) && normEmail(receiptOrBatch?.payerEmail) === normEmail(email);
/** Tài khoản nhận hoàn để tạo QR: hồ sơ người dùng trước, danh sách cũ (payees) theo tên sau. */
export const bankOf = (receiptOrBatch, members = [], payees = []) => {
  const m = memberOf(receiptOrBatch, members);
  if (m?.bank && m?.account) return { bank: m.bank, account: m.account, holder: m.holder || m.name, name: m.name, from: "member" };
  const name = asciiUpper(receiptOrBatch?.enteredByName ?? receiptOrBatch?.payer ?? m?.name);
  const p = payees.find((x) => asciiUpper(x.name) === name);
  return p ? { bank: p.bank, account: p.account, holder: p.holder || p.name, name: p.name, from: "payee" } : null;
};
/** Phiếu cũ chưa gắn email (nhập trước khi có tài khoản riêng) còn đang mở, trùng tên với thành viên. */
export const legacyOpenReceipts = (member, receipts) => receipts.filter((r) => !normEmail(r.payerEmail) && asciiUpper(r.enteredByName) === asciiUpper(member?.name) && asciiUpper(member?.name)
  && ["PENDING", "APPROVED", "REJECTED", "PAID"].includes(reimbursementStatus(r)));

const sum = (list, key) => list.reduce((s, x) => s + Number(x[key] || 0), 0);
/**
 * Việc cần làm của người đang đăng nhập. Mỗi mục: { key, level: "warn" | "info", count, text }.
 * `badge` = số việc phải tự tay xử lý (hiện chấm đỏ ở tab Hoàn ứng).
 */
export const myAlerts = ({ email, role, me = null, receipts = [], batches = [], members = [], payees = [], now = Date.now() }) => {
  const out = [];
  const vnd = (n) => `${Number(n || 0).toLocaleString("vi-VN")}đ`;
  // Phần của người mua (chủ quán / thủ quỹ cũng có thể là người mua).
  const mine = receipts.filter((r) => isMine(r, email));
  const rejected = mine.filter((r) => reimbursementStatus(r) === "REJECTED");
  if (rejected.length) out.push({ key: "rejected", level: "warn", count: rejected.length, text: `${rejected.length} phiếu của bạn bị trả lại: xem lý do, sửa rồi lưu để gửi duyệt lại.` });
  const paidMine = batches.filter((b) => b.status === "PAID" && isMine(b, email));
  if (paidMine.length) {
    const late = paidMine.filter((b) => needsReminder(b, now)).length;
    out.push({ key: "confirm", level: "warn", count: paidMine.length, text: `Bạn đã được hoàn ${vnd(sum(paidMine, "amount"))} (${paidMine.length} đợt): kiểm tra tài khoản rồi bấm "Tôi đã nhận tiền".${late ? ` ${late} đợt đã quá 1 ngày.` : ""}` });
  }
  const waitingMine = mine.filter((r) => ["PENDING", "APPROVED"].includes(reimbursementStatus(r)));
  if (waitingMine.length) out.push({ key: "waiting", level: "info", count: 0, text: `${waitingMine.length} phiếu của bạn đang chờ thủ quỹ (${vnd(sum(waitingMine, "total"))}).` });
  const openMine = mine.some((r) => ["PENDING", "APPROVED"].includes(reimbursementStatus(r)));
  if (normEmail(email) && (!me?.bank || !me?.account) && (openMine || role === ROLE_BUYER)) out.push({ key: "bank", level: "warn", count: openMine ? 1 : 0, text: "Bạn chưa nhập tài khoản ngân hàng: vào Tài khoản để thủ quỹ tạo được QR hoàn tiền." });
  if (!canTreasure(role)) return { items: out, badge: out.reduce((s, x) => s + x.count, 0) };
  // Phần của thủ quỹ.
  const pending = receipts.filter((r) => reimbursementStatus(r) === "PENDING");
  if (pending.length) out.push({ key: "approve", level: "warn", count: pending.length, text: `${pending.length} phiếu mới chờ duyệt (${vnd(sum(pending, "total"))}).` });
  const approved = receipts.filter((r) => reimbursementStatus(r) === "APPROVED");
  if (approved.length) out.push({ key: "pay", level: "warn", count: approved.length, text: `${approved.length} phiếu đã duyệt chờ hoàn tiền (${vnd(sum(approved, "total"))}).` });
  const unknown = receipts.filter((r) => reimbursementStatus(r) === "UNKNOWN");
  if (unknown.length) out.push({ key: "unknown", level: "warn", count: unknown.length, text: `${unknown.length} phiếu chưa rõ nguồn tiền (tiền cá nhân hay tiền quán).` });
  const noBank = [...new Set(approved.filter((r) => !bankOf(r, members, payees)).map((r) => r.enteredByName || "Chưa rõ"))];
  if (noBank.length) out.push({ key: "nobank", level: "info", count: 0, text: `Chưa có tài khoản ngân hàng của: ${noBank.join(", ")} (chưa tạo được QR).` });
  const late = batches.filter((b) => needsReminder(b, now) && !isMine(b, email));
  if (late.length) out.push({ key: "late", level: "info", count: 0, text: `${late.length} khoản đã hoàn quá 1 ngày người nhận chưa xác nhận: ${[...new Set(late.map((b) => b.payer))].join(", ")}.` });
  return { items: out, badge: out.reduce((s, x) => s + x.count, 0) };
};
