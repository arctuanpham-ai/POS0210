package vn.ecohome.pos0210.cloud

import vn.ecohome.pos0210.FoodApp
import vn.ecohome.pos0210.data.AuditEventEntity
import vn.ecohome.pos0210.data.BillEntity
import vn.ecohome.pos0210.data.PaymentEntity

/**
 * Sổ app food theo tháng, để báo cáo tháng đúng với nghiệp vụ:
 * - doanh thu ghi gốc theo ngày bán (đã nằm trong doanh thu tháng);
 * - chiết khấu + khoản trừ khác (khuyến mãi quán tài trợ...) là chi phí của THÁNG BÁN;
 * - thuế VAT/TNCN do app khấu trừ không phải chi phí, tách riêng;
 * - tiền thật về két/ngân hàng chỉ là số THỰC NHẬN, tính vào tháng app trả tiền; đơn chưa trả là khoản phải thu.
 */
object FoodAppLedger {
    data class Month(
        val grossFoodRevenue: Long,      // doanh thu app food của các bill bán trong tháng (chưa trừ gì)
        val commissionExpense: Long,     // chiết khấu + trừ khác của đơn bán trong tháng và đã chốt
        val withheldTax: Long,           // VAT + TNCN đã khấu trừ của đơn bán trong tháng và đã chốt
        val cashReceivedInMonth: Long,   // tiền thực nhận do app trả trong tháng (theo ngày chốt)
        val receivable: Long,            // doanh thu tháng này nhưng app chưa trả
    )

    fun month(bills: List<BillEntity>, payments: List<PaymentEntity>, settlements: List<AuditEventEntity>, fromMs: Long, toMs: Long): Month {
        val billById = bills.filter { it.status == "PAID" && it.dataScope == "LIVE" }.associateBy { it.id }
        val food = payments.filter { it.dataScope == "LIVE" && FoodApp.isFood(it.method) && it.billId in billById }
        val settled = settlements.filter { it.action == "SETTLED" }.associateBy { it.entityId }
        val saleInMonth = food.filter { billById.getValue(it.billId).openedAt in fromMs until toMs }
        var commission = 0L; var tax = 0L
        for (p in saleInMonth) {
            val ev = settled[p.billId] ?: continue
            val n = FoodApp.payloadNumbers(ev.payload)
            val received = n["received"] ?: 0L; val c = n["commission"] ?: 0L; val v = n["vat"] ?: 0L; val t = n["pit"] ?: 0L
            commission += c + (p.amount - received - c - v - t).coerceAtLeast(0L)
            tax += v + t
        }
        val cash = food.sumOf { p -> settled[p.billId]?.takeIf { it.occurredAt in fromMs until toMs }?.let { FoodApp.payloadNumbers(it.payload)["received"] } ?: 0L }
        val receivable = saleInMonth.filter { it.billId !in settled }.sumOf { it.amount }
        return Month(saleInMonth.sumOf { it.amount }, commission, tax, cash, receivable)
    }
}
