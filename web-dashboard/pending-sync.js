// Tạm ẩn số liệu tổng hợp bị máy dev ghi đè (21:21 ngày 22/10/2026) cho tới khi máy POS thật ghi lại ĐẦY ĐỦ.
// Đợt ghi nhầm nằm trong cửa sổ [14:00, 14:45) UTC = 21:00 đến 21:45 giờ VN. Còn tài liệu tổng hợp nào mang dấu thời gian trong cửa sổ đó
// thì vẫn là số của máy dev. Tài liệu được máy thật ghi lại sẽ có updatedAt mới hơn nên banner tự tắt khi tất cả đã được ghi lại.
export const DEV_WRITE_FROM = Date.UTC(2026, 9, 22, 14, 0);
export const PENDING_SYNC_BEFORE = Date.UTC(2026, 9, 22, 14, 45);
const tainted = (doc) => { const t = Number(doc?.updatedAt); return Number.isFinite(t) && t >= DEV_WRITE_FROM && t < PENDING_SYNC_BEFORE; };
// Báo cáo ngày không tính: chỉ còn ngày 16/10 mang dấu máy dev (toàn số 0), đã kiểm tra các ngày còn lại là số thật.
export const isPendingSync = (dashboard, _dailyDocs = {}, monthlyDocs = {}) =>
  !Number(dashboard?.lastUpdatedAt) || Number(dashboard.lastUpdatedAt) < PENDING_SYNC_BEFORE
  || Object.values(monthlyDocs || {}).some(tainted);
