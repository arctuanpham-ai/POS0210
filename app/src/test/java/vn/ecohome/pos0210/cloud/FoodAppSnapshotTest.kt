package vn.ecohome.pos0210.cloud

import org.junit.Assert.*
import org.junit.Test
import vn.ecohome.pos0210.data.AuditEventEntity
import vn.ecohome.pos0210.data.BillEntity
import vn.ecohome.pos0210.data.PaymentEntity
import java.time.LocalDate
import java.time.ZoneId

class FoodAppSnapshotTest {
    private val zone = ZoneId.of("Asia/Ho_Chi_Minh")
    private fun ms(date: String, hour: Int) = LocalDate.parse(date).atTime(hour, 0).atZone(zone).toInstant().toEpochMilli()
    private fun bill(id: String, at: Long, total: Long, status: String = "PAID", scope: String = "LIVE") = BillEntity(id, "s$id", "B$id", at, at + 60_000, total, total, status, null, scope)
    private fun pay(id: String, bill: String, method: String, amount: Long, code: String, at: Long) = PaymentEntity("p$id", bill, method, amount, "e", at, "FA-$method-$code")
    private fun settled(bill: String, received: Long, at: Long) = AuditEventEntity("a$bill", "FOOD_APP", bill, "SETTLED", "e", null, at, "received=$received,billAmount=0,app=X")

    @Test fun emptyWhenNoFoodOrders() {
        val b = bill("1", ms("2026-10-26", 9), 30_000)
        assertNull(FoodAppSnapshot.compose(listOf(b), listOf(PaymentEntity("p", "1", "CASH", 30_000, "e", 1)), emptyList(), "2026-10-26", zone))
    }

    @Test fun pendingSettledAndDaily() {
        val bills = listOf(bill("1", ms("2026-10-26", 9), 100_000), bill("2", ms("2026-10-26", 10), 50_000), bill("3", ms("2026-10-25", 11), 80_000),
            bill("4", ms("2026-10-25", 12), 99_000, status = "DELETED"), bill("5", ms("2026-10-25", 13), 77_000, scope = "TEST"))
        val pays = listOf(pay("1", "1", "SHOPEE", 100_000, "SF1", 10), pay("2", "2", "GRAB", 50_000, "G2", 20), pay("3", "3", "GRAB", 80_000, "G3", 5),
            pay("4", "4", "GRAB", 99_000, "G4", 6), pay("5", "5", "GRAB", 77_000, "G5", 7))
        val d = FoodAppSnapshot.compose(bills, pays, listOf(settled("3", 60_000, 999)), "2026-10-26", zone)!!
        @Suppress("UNCHECKED_CAST") val pending = d["pending"] as Map<String, Map<String, Long>>
        assertEquals(1L, pending.getValue("SHOPEE")["count"]); assertEquals(100_000L, pending.getValue("SHOPEE")["amount"])
        assertEquals(1L, pending.getValue("GRAB")["count"]); assertEquals(50_000L, pending.getValue("GRAB")["amount"])
        @Suppress("UNCHECKED_CAST") val settledOrders = d["settledOrders"] as List<Map<String, Any?>>
        assertEquals(1, settledOrders.size); assertEquals(60_000L, settledOrders[0]["received"]); assertEquals("G3", settledOrders[0]["code"])
        @Suppress("UNCHECKED_CAST") val days = d["days"] as List<Map<String, Any?>>
        assertEquals(2, days.size)
        assertEquals("2026-10-26", days[0]["date"]); assertEquals(100_000L, days[0]["SHOPEE"]); assertEquals(50_000L, days[0]["GRAB"])
        assertEquals("2026-10-25", days[1]["date"]); assertEquals(80_000L, days[1]["GRAB"]) // bill đã xoá và bill TEST không tính
    }

    @Test fun fingerprintIgnoresNothingButIsStable() {
        val b = listOf(bill("1", ms("2026-10-26", 9), 10_000))
        val p = listOf(pay("1", "1", "GRAB", 10_000, "X", 1))
        val a = FoodAppSnapshot.compose(b, p, emptyList(), "2026-10-26", zone)!!
        assertEquals(FoodAppSnapshot.fingerprint(a), FoodAppSnapshot.fingerprint(FoodAppSnapshot.compose(b, p, emptyList(), "2026-10-26", zone)!!))
        val c = FoodAppSnapshot.compose(b, p, listOf(settled("1", 9_000, 5)), "2026-10-26", zone)!!
        assertNotEquals(FoodAppSnapshot.fingerprint(a), FoodAppSnapshot.fingerprint(c))
    }
}
