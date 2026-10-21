// Tìm kiếm danh mục vật tư không dấu, không phụ thuộc thứ tự ký tự.
export function normalizeMaterial(value) {
  return String(value || "").toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();
}
export function materialMatches(value, search) {
  const text = normalizeMaterial(value), q = normalizeMaterial(search);
  if (!q) return true;
  const counts = new Map();
  for (const char of text.replace(/\s/g, "")) counts.set(char, (counts.get(char) || 0) + 1);
  for (const char of q.replace(/\s/g, "")) {
    if (!counts.get(char)) return false;
    counts.set(char, counts.get(char) - 1);
  }
  return true;
}
export function materialRank(value, search) {
  const text = normalizeMaterial(value), q = normalizeMaterial(search);
  return text === q ? 0 : text.startsWith(q) ? 1 : text.includes(q) ? 2 : 3;
}
export function filterMaterialOptions(values, search, max = 30) {
  return values.filter((value) => materialMatches(value, search)).sort((a,b) => materialRank(a,search) - materialRank(b,search) || a.localeCompare(b,"vi")).slice(0,max);
}

/** Khớp theo từng từ gõ vào: mọi từ phải nằm trong tên (không dấu, không phân biệt hoa thường, thứ tự từ tuỳ ý). */
export function tokenMatches(value, search) {
  const text = normalizeMaterial(value);
  const tokens = normalizeMaterial(search).split(" ").filter(Boolean);
  return tokens.every((t) => text.includes(t));
}
/**
 * Tìm vật tư để thêm vào công thức. Ưu tiên khớp theo từ; không có kết quả nào thì nới sang khớp theo chữ cái rời (gõ sai thứ tự).
 * items: [{name, dynamic}]. Kết quả: khớp đúng đầu tên trước, rồi chứa trong tên, vật tư từ phiếu chi trước danh mục chuẩn.
 */
export function searchMaterials(items, search, max = 40) {
  const q = String(search || "").trim();
  if (!q) return [...items].sort((a, b) => (Number(b.dynamic) - Number(a.dynamic)) || a.name.localeCompare(b.name, "vi")).slice(0, max);
  let found = items.filter((m) => tokenMatches(m.name, q));
  if (!found.length) found = items.filter((m) => materialMatches(m.name, q));
  return found.sort((a, b) => materialRank(a.name, q) - materialRank(b.name, q) || (Number(b.dynamic) - Number(a.dynamic)) || a.name.localeCompare(b.name, "vi")).slice(0, max);
}
