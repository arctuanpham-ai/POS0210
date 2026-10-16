// Loại chi của từng dòng phiếu: tự nhận diện theo tên, người nhập sửa lại được bằng danh sách chọn.
// Một phiếu nhập nhiều loại lẫn nhau thì khi lưu được tách thành nhiều phiếu, mỗi phiếu một loại
// (máy POS xếp khoản mục theo phiếu nên phải tách để báo cáo tháng chia cổ đông đúng).
// Hàm thuần: không Firebase, không DOM.

export const KIND_MATERIAL = "MATERIAL";
export const EXPENSE_KINDS = [
  ["MATERIAL", "Mua hàng · nguyên liệu, bao bì, vật tư"],
  ["MAINTENANCE", "Sửa chữa, bảo trì"],
  ["ADDITIONAL_INVESTMENT", "Đầu tư, nâng cấp quán"],
  ["OTHER_EXPENSE", "Chi vận hành khác · điện, nước, ga, dịch vụ"],
];
export const KIND_SHORT = { MATERIAL: "Mua hàng", MAINTENANCE: "Sửa chữa", ADDITIONAL_INVESTMENT: "Đầu tư", OTHER_EXPENSE: "Chi vận hành khác" };
export const NON_MATERIAL = new Set(["MAINTENANCE", "ADDITIONAL_INVESTMENT", "OTHER_EXPENSE"]);

// Giữ dấu tiếng Việt: "sửa" (sửa chữa) khác "sữa" (sữa đặc), "bàn" khác "bản".
const fold = (v) => ` ${String(v ?? "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
const has = (text, words) => words.some((w) => text.includes(` ${w} `));

const MAINTENANCE = ["sửa", "sửa chữa", "bảo trì", "bảo dưỡng", "công thợ", "tiền thợ", "thợ điện", "thợ nước", "thợ sửa", "thay lõi lọc", "vệ sinh máy", "vệ sinh điều hòa", "vệ sinh điều hoà", "nạp gas", "nạp ga", "thông cống", "hút bể phốt"];
const OTHER = ["tiền điện", "hoá đơn điện", "hóa đơn điện", "tiền nước", "hoá đơn nước", "hóa đơn nước", "internet", "wifi", "cước mạng", "bình ga", "bình gas", "đổi ga", "đổi gas", "tiền ga", "tiền rác", "phí rác", "phí ship", "tiền ship", "phí giao hàng", "thuê nhà", "tiền thuê", "tiền nhà", "phí ngân hàng", "quảng cáo", "in ấn", "in menu", "phần mềm"];
const INVESTMENT = ["thi công", "lắp đặt", "lắp", "mái", "bạt", "biển", "biển hiệu", "bảng hiệu", "máy", "tủ", "tủ lạnh", "tủ mát", "tủ đông", "bàn ghế", "bàn", "ghế", "kệ", "quạt", "điều hòa", "điều hoà", "máy lạnh", "camera", "loa", "tivi", "sơn", "ốp", "lát", "xây", "trần", "rèm", "cửa", "đèn", "nồi cơm", "bếp", "chậu cây", "cây cảnh", "thảm"];
/** Tên chứa các từ này là vật tư dù dính từ khoá khác (bàn chải, khăn bàn…). */
const MATERIAL_HINTS = ["bàn chải", "giấy", "khăn", "cốc", "ly", "ống hút", "túi", "hộp", "nước mắm", "sữa", "bột", "đường", "cà phê", "trà", "đá viên", "bánh", "thịt", "rau", "bóng đèn"];

/**
 * Đoán loại chi từ tên dòng. `isKnownMaterial(name)` (nếu có) trả true khi tên khớp danh mục vật tư / quy tắc đã học.
 * Thứ tự: vật tư đã biết → sửa chữa → chi vận hành khác → đầu tư → mặc định mua hàng.
 */
export const detectKind = (name, isKnownMaterial = () => false) => {
  const t = fold(name);
  if (!t.trim()) return KIND_MATERIAL;
  if (has(t, MAINTENANCE)) return "MAINTENANCE";
  if (isKnownMaterial(name)) return KIND_MATERIAL;
  if (has(t, OTHER)) return "OTHER_EXPENSE";
  if (has(t, INVESTMENT) && !has(t, MATERIAL_HINTS)) return "ADDITIONAL_INVESTMENT";
  return KIND_MATERIAL;
};

/** Gom dòng theo loại, giữ thứ tự xuất hiện. */
export const splitByKind = (items) => {
  const groups = new Map();
  for (const it of items) {
    const k = NON_MATERIAL.has(it.kind) ? it.kind : KIND_MATERIAL;
    groups.set(k, [...(groups.get(k) || []), it]);
  }
  return [...groups.entries()].map(([kind, lines]) => ({ kind, lines }));
};
