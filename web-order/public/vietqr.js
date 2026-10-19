/* VietQR (NAPAS/EMVCo) tạo cục bộ, không gọi dịch vụ ngoài. Cùng thuật toán với app POS (VietQrPayload.kt) và web dashboard (reimburse.js). */
export const BANK_BINS = {
  VIETINBANK: "970415", ICB: "970415", VIETCOMBANK: "970436", VCB: "970436", BIDV: "970418", AGRIBANK: "970405", MB: "970422", MBBANK: "970422",
  TECHCOMBANK: "970407", TCB: "970407", ACB: "970416", VPBANK: "970432", SACOMBANK: "970403", STB: "970403", TPBANK: "970423", TPB: "970423",
  HDBANK: "970437", HDB: "970437", OCB: "970448", VIB: "970441", SHB: "970443", EXIMBANK: "970431", EIB: "970431", MSB: "970426",
  LPBANK: "970449", SEABANK: "970440", PVCOMBANK: "970412", NCB: "970419", VIETABANK: "970427", BACABANK: "970409", ABBANK: "970425",
  KIENLONGBANK: "970452", NAMABANK: "970428", CAKE: "546034", TIMO: "963388",
};

export const asciiUpper = (value) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase().trim();

/** BIN ngân hàng từ tên (Techcombank, TCB…) hoặc chính mã BIN 6 số; null nếu không nhận ra. */
export const resolveBin = (bank) => {
  const c = asciiUpper(bank).replace(/[^A-Z0-9]/g, "");
  return /^9\d{5}$|^5\d{5}$/.test(c) ? c : BANK_BINS[c] ?? null;
};

export const crc16 = (str) => {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(str)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) { crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1; crc &= 0xffff; }
  }
  return crc;
};

const tlv = (id, value) => {
  const len = new TextEncoder().encode(value).length;
  if (len > 99) throw new Error(`Dữ liệu VietQR quá dài tại trường ${id}`);
  return `${id}${String(len).padStart(2, "0")}${value}`;
};

/** Chuỗi VietQR có số tiền và nội dung chuyển khoản. Ném lỗi rõ ràng nếu thiếu thông tin. */
export const vietQrPayload = ({ bank, account, holder, amount, info }) => {
  const bin = resolveBin(bank);
  if (!bin) throw new Error(`Chưa hỗ trợ ngân hàng "${bank}"`);
  const acc = asciiUpper(account).replace(/[^A-Z0-9]/g, "");
  if (!acc) throw new Error("Thiếu số tài khoản nhận tiền");
  if (acc.length > 19) throw new Error("Số tài khoản tối đa 19 ký tự");
  const money = Number(amount);
  if (!(money > 0) || !Number.isInteger(money)) throw new Error("Số tiền không hợp lệ");
  const merchant = tlv("00", "A000000727") + tlv("01", tlv("00", bin) + tlv("01", acc)) + tlv("02", "QRIBFTTA");
  const raw = tlv("00", "01") + tlv("01", "12") + tlv("38", merchant) + tlv("53", "704") + tlv("54", String(money)) + tlv("58", "VN") +
    tlv("59", (asciiUpper(holder) || "0210").slice(0, 25)) + tlv("60", "HAI PHONG") + tlv("62", tlv("08", asciiUpper(info).slice(0, 50))) + "6304";
  return raw + crc16(raw).toString(16).toUpperCase().padStart(4, "0");
};
