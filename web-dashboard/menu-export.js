// Xuất menu (đọc từ Firestore qua tài khoản đang đăng nhập) thành CSV để phân tích vật tư và định lượng.
const cell = (v) => {
  if (v === null || v === undefined) return "";
  const t = String(v);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Một dòng mỗi món, xếp theo thứ tự nhóm rồi thứ tự món. Món tắt vẫn xuất, cột dang_ban = false. */
export const menuCsv = (items, categories) => {
  const cats = new Map((categories || []).map((c) => [String(c.id), c]));
  const rows = (items || []).slice().sort((a, b) => {
    const ca = cats.get(String(a.categoryId)), cb = cats.get(String(b.categoryId));
    return Number(ca?.sortOrder ?? 9999) - Number(cb?.sortOrder ?? 9999) || Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name));
  });
  const header = ["nhom", "ten_mon", "gia", "dang_ban", "ma_mon", "mo_ta"];
  const lines = rows.map((m) => [cats.get(String(m.categoryId))?.name ?? "", m.name ?? "", Number(m.price || 0), m.active !== false, m.productCode ?? "", m.description ?? ""].map(cell).join(","));
  return `﻿${[header.join(","), ...lines].join("\r\n")}\r\n`;
};
