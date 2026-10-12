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
// Trả về bản ghi vật tư thay vì chuỗi đơn lẻ để giao diện có thể giữ đúng mã đã cấp.
export function filterMaterialRecords(records, search, max = 30) {
  return records
    .filter((record) => materialMatches(record.materialName, search) || materialMatches(record.materialCode, search))
    .sort((a, b) => {
      const rankA = Math.min(materialRank(a.materialName, search), materialRank(a.materialCode, search));
      const rankB = Math.min(materialRank(b.materialName, search), materialRank(b.materialCode, search));
      return rankA - rankB || a.materialName.localeCompare(b.materialName, "vi") || a.materialCode.localeCompare(b.materialCode, "vi");
    })
    .slice(0, max);
}
