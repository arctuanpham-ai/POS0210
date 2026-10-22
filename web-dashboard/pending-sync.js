// Tạm ẩn số liệu tổng hợp bị máy dev ghi đè (21:21 ngày 22/10/2026) cho tới khi máy POS thật đồng bộ lại.
// 14:45 UTC = 21:45 giờ VN: sau đợt đồng bộ nhầm và sau khi dọn. Snapshot nào có lastUpdatedAt từ mốc này trở đi là của máy thật.
export const PENDING_SYNC_BEFORE = Date.UTC(2026, 9, 22, 14, 45);
export const isPendingSync = (dashboard) => !Number(dashboard?.lastUpdatedAt) || Number(dashboard.lastUpdatedAt) < PENDING_SYNC_BEFORE;
