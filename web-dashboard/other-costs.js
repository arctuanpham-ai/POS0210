// Chi phí ngoài phiếu mua hàng: ghi ở "Giao dịch khác" (web) hoặc máy POS, nằm trong collection purchases.
// Bỏ bản sao của phiếu chi: id "web:..." (phiếu web đã dịch trên máy POS) và id trùng phiếu chi (phiếu máy POS đã đẩy lên expenseReceipts).
export const otherCostRows = (purchases, receiptIds) => {
  const ids = receiptIds instanceof Set ? receiptIds : new Set(receiptIds || []);
  return (Array.isArray(purchases) ? purchases : [])
    .filter((p) => p && !String(p.id || "").startsWith("web:") && !ids.has(String(p.id)))
    .filter((p) => p.status !== "DELETED" && p.status !== "CANCELLED" && Number(p.total) > 0)
    .map((p) => ({ id: String(p.id), at: Number(p.purchasedAt || 0), amount: Number(p.total), category: p.expenseCategory || "OTHER_EXPENSE", payer: p.paidByName || "", note: p.note || "", supplierName: p.supplierName || "" }))
    .sort((a, b) => b.at - a.at);
};
