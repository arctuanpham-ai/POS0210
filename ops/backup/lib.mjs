// Sao lưu Firestore → Google Drive: phần tính toán thuần (không mạng) để test được.
export const UID = "X9ln8CP7UtbOLOHfipYMCjfbb1p1";
export const PROJECT = "pos0210-17ce4";

/** Bảng nhỏ hoặc hay đổi: đọc đủ mỗi đêm. */
export const FULL = ["tableStatus", "menu", "menuCategories", "combos", "areas", "recipes", "config", "dashboard", "webMembers", "profitPartners", "costCodes", "purchaseCategories", "suppliers", "assetCategories", "assets", "payees", "expenseRules", "shareholderCloses", "monthlyAccounting", "fundClosings", "dashboardMonthly"];
/** Bảng lớn: mỗi đêm chỉ hỏi tài liệu có mốc thời gian (ms) >= mốc, nhiều trường thì hợp các kết quả. */
export const DELTA = {
  bills: ["closedAt", "openedAt"], payments: ["paidAt"], orderBatches: ["createdAt", "sentAt", "deliveredAt"], sessions: ["openedAt", "closedAt", "updatedAt"],
  expenseReceipts: ["updatedAt", "createdAt", "purchaseDate"], reimbursements: ["paidAt", "confirmedAt"], financialMovements: ["occurredAt"], purchases: ["updatedAt", "purchasedAt"],
  refunds: ["createdAt", "settledAt"], dashboardDaily: ["updatedAt"], shifts: ["updatedAt", "receivedAt", "lastActivityAt"], days: ["closedAt"], stockCounts: ["updatedAt"],
  attendance: ["updatedAt"], customers: ["updatedAt"], loyalty: ["updatedAt"], media: ["updatedAt"], menuThumbs: ["updatedAt"], privateBackup: ["updatedAt"],
};
/** orderItems không có mốc thời gian: lấy theo các đợt gọi món (orderBatches) vừa đổi. */
export const CHILD = { orderItems: { parent: "orderBatches", key: "batchId" } };
/** Bảng được quét kiểm tra luân phiên để bắt thay đổi mà mốc thời gian không báo. */
export const SCAN = [...Object.keys(DELTA).filter((c) => !["media", "menuThumbs", "privateBackup"].includes(c)), "orderItems"];

export const idOf = (docName) => docName.split("/").pop();
export const collectionPath = (c) => `users/${UID}/stores/0210/${c}`;

/** Ghép tài liệu mới (REST) vào ảnh chụp: chỉ ghi đè khi mới hơn. Trả số tài liệu thêm mới / đổi / lệch (bản cũ khác bản mới dù không có trong delta). */
export const mergeDocs = (snapshot, collection, docs) => {
  const bucket = (snapshot.data[collection] ||= {});
  let added = 0, changed = 0;
  for (const d of docs) {
    const id = idOf(d.name);
    const old = bucket[id];
    if (!old) { bucket[id] = { fields: d.fields || {}, updateTime: d.updateTime }; added += 1; }
    else if (String(d.updateTime) > String(old.updateTime)) { bucket[id] = { fields: d.fields || {}, updateTime: d.updateTime }; changed += 1; }
  }
  return { added, changed };
};

/** Chia ngân sách quét luân phiên cho các bảng theo số tài liệu (ít nhất `min` mỗi bảng có dữ liệu). */
export const scanPlan = (counts, budget = 700, min = 20) => {
  const names = SCAN.filter((c) => counts[c] > 0);
  const total = names.reduce((t, c) => t + counts[c], 0);
  const plan = {};
  for (const c of names) plan[c] = Math.min(counts[c], Math.max(min, Math.round((counts[c] / total) * budget)));
  return plan;
};

/** Giờ Việt Nam (UTC+7) của một thời điểm. */
export const vn = (ms) => new Date(ms + 7 * 3600000);
export const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 86400000 + 1) / 7)).padStart(2, "0")}`;
};
/** Việc định kỳ của lần chạy này: bản chốt tuần (chủ nhật), bản chốt tháng (ngày cuối tháng). */
export const rotationJobs = (nowMs) => {
  const d = vn(nowMs);
  const tomorrow = new Date(d.getTime() + 86400000);
  return { weekly: d.getUTCDay() === 0 ? `weekly-${isoWeek(d)}.json.gz` : null, monthly: tomorrow.getUTCDate() === 1 ? `monthly-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}.json.gz` : null };
};
/** Giữ n bản tuần mới nhất (tên có tuần ISO nên sắp theo tên); trả danh sách cần bỏ. */
export const expireWeekly = (names, keep = 8) => names.filter((n) => /^weekly-/.test(n)).sort().reverse().slice(keep);
/** Mốc thời gian để hỏi thay đổi: lần chạy trước trừ lề an toàn. */
export const sinceFrom = (lastRunAt, now, marginMs = 12 * 3600000) => (lastRunAt ? Math.max(0, lastRunAt - marginMs) : 0);
/** Chỉ số ngày chốt: A/B luân phiên. */
export const otherSlot = (cur) => (cur === "A" ? "B" : "A");
