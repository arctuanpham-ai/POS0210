package vn.ecohome.pos0210.cloud

import org.junit.Assert.*
import org.junit.Test
import vn.ecohome.pos0210.data.AuditEventEntity
import vn.ecohome.pos0210.data.BillEntity
import vn.ecohome.pos0210.data.PaymentEntity

class FoodAppLedgerTest {
    private fun bill(id: String, at: Long, total: Long) = BillEntity(id, "s$id", "B$id", at, at + 1, total, total, "PAID")
    private fun pay(id: String, method: String, amount: Long) = PaymentEntity("p$id", id, method, amount, "e", 1, "FA-$method-X$id")
    private fun settled(bill: String, at: Long, payload: String) = AuditEventEntity("a$bill", "FOOD_APP", bill, "SETTLED", null, null, at, payload)

    @Test fun grabOrderSettledNextMonth() {
        // bán 31/10 (tháng 10), app trả 1/11: chi phí thuộc tháng bán, tiền thuộc tháng trả
        val oct = 0L..1000L; val sale = 500L; val paid = 1500L
        val bills = listOf(bill("1", sale, 50_000), bill("2", sale, 40_000), bill("3", sale, 10_000))
        val pays = listOf(pay("1", "GRAB", 50_000), pay("2", "GRAB", 40_000), PaymentEntity("p3", "3", "CASH", 10_000, "e", 1))
        val st = listOf(settled("1", paid, "received=37933,commission=9817,vat=1500,pit=750,billAmount=50000"))
        val m = FoodAppLedger.month(bills, pays, st, oct.first, oct.last + 1)
        assertEquals(90_000L, m.grossFoodRevenue)
        assertEquals(9_817L, m.commissionExpense)
        assertEquals(2_250L, m.withheldTax)
        assertEquals(0L, m.cashReceivedInMonth)          // chưa nhận trong tháng 10
        assertEquals(40_000L, m.receivable)              // đơn 2 chưa trả
        val nov = FoodAppLedger.month(bills, pays, st, 1001L, 2000L)
        assertEquals(37_933L, nov.cashReceivedInMonth)   // tiền về tháng 11
        assertEquals(0L, nov.commissionExpense)
        assertEquals(0L, nov.grossFoodRevenue)
    }

    @Test fun otherDeductionCountsAsExpense() {
        val bills = listOf(bill("1", 10, 50_000))
        val pays = listOf(pay("1", "SHOPEE", 50_000))
        val st = listOf(settled("1", 20, "received=37000,commission=9817,vat=1500,pit=750"))
        assertEquals(9_817L + 933L, FoodAppLedger.month(bills, pays, st, 0, 100).commissionExpense)
    }
}
