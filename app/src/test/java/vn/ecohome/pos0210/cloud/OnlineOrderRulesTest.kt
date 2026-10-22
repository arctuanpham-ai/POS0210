package vn.ecohome.pos0210.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class OnlineOrderRulesTest {
    private fun order(status: String, mode: String = "pickup", expiresAt: Long? = null) = OnlineOrder(
        "AB12CD", "AB12CD", "u1", "An", "0912345678", mode, "", "", "", listOf(OnlineLine("Cà phê", 2, "", 25000)), 50000, status, "", 1000L, expiresAt, null,
    )

    @Test fun acceptSetsPaymentWindowAndTransferContent() {
        val t = OnlineOrderRules.transition(order("new"), "accept", 1_000_000L, "Lan")
        assertEquals("awaiting_payment", t.patch["status"])
        assertEquals("DMAB12CD", t.patch["transferContent"])
        assertEquals(1_000_000L + 600_000L, t.patch["expiresAt"])
        assertEquals("Lan", t.patch["handledBy"])
        assertFalse(t.releasesLimit)
    }

    @Test fun rejectNeedsReasonAndReleasesLimit() {
        try { OnlineOrderRules.transition(order("new"), "reject", 1L, reason = "  "); fail() } catch (_: IllegalArgumentException) { }
        val t = OnlineOrderRules.transition(order("new"), "reject", 1L, reason = "Hết món")
        assertEquals("rejected", t.patch["status"]); assertTrue(t.releasesLimit)
    }

    @Test fun paidReleasesLimitOnlyWhilePending() {
        assertTrue(OnlineOrderRules.transition(order("awaiting_payment"), "paid", 1L).releasesLimit)
        assertFalse(OnlineOrderRules.transition(order("expired"), "paid", 1L).releasesLimit)
        assertFalse(OnlineOrderRules.transition(order("cancelled"), "paid", 1L).releasesLimit)
    }

    @Test fun staleStatusIsRejected() {
        try { OnlineOrderRules.transition(order("paid"), "accept", 1L); fail() } catch (_: IllegalStateException) { }
        try { OnlineOrderRules.transition(order("done"), "done", 1L); fail() } catch (_: IllegalStateException) { }
    }

    @Test fun releasedCountNeverNegative() {
        assertEquals(1L, OnlineOrderRules.releasedCount(2L)); assertEquals(0L, OnlineOrderRules.releasedCount(0L)); assertEquals(0L, OnlineOrderRules.releasedCount(null))
    }

    @Test fun actionsByStatus() {
        assertEquals(listOf("accept", "reject"), OnlineOrderRules.actions(order("new"), 0).map { it.key })
        assertEquals(listOf("deliver", "done"), OnlineOrderRules.actions(order("paid", "delivery"), 0).map { it.key })
        assertEquals(listOf("done"), OnlineOrderRules.actions(order("paid", "pickup"), 0).map { it.key })
        assertEquals(listOf("paid"), OnlineOrderRules.actions(order("cancelled"), 0).map { it.key })
        assertTrue(OnlineOrderRules.actions(order("done"), 0).isEmpty())
    }

    @Test fun overdueSweepWaitsForGrace() {
        val o = order("awaiting_payment", expiresAt = 10_000_000L)
        assertTrue(OnlineOrderRules.isOverdue(o, 10_000_000L))
        assertTrue(OnlineOrderRules.overdueToClose(listOf(o), 10_000_000L + 60_000L).isEmpty())
        assertEquals(1, OnlineOrderRules.overdueToClose(listOf(o), 10_000_000L + 181_000L).size)
        assertEquals(1, OnlineOrderRules.attention(listOf(o, order("paid")), 10_000_001L))
    }

    @Test fun unseenNewAndAnnouncement() {
        val a = order("new"); val b = a.copy(id = "ZZ99ZZ", code = "ZZ99ZZ")
        assertEquals(listOf("ZZ99ZZ"), OnlineOrderRules.unseenNew(listOf(a, b), setOf("AB12CD")).map { it.id })
        assertTrue(OnlineOrderRules.announceText(listOf(a)).contains("Mang đi"))
        assertEquals("Có 2 đơn online mới.", OnlineOrderRules.announceText(listOf(a, b)))
    }

    @Test fun parsesFirestoreMap() {
        val o = OnlineOrderRules.fromMap("X", mapOf("code" to "X", "status" to "new", "total" to 50000L, "items" to listOf(mapOf("name" to "Trà", "qty" to 1L, "price" to 20000L, "note" to "ít đá")), "createdAt" to 5L), { (it as? Long) })
        assertEquals(1, o.items.size); assertEquals("ít đá", o.items[0].note); assertEquals(5L, o.createdAt); assertEquals(50000L, o.total)
    }
}

class OnlineOrderTestFilterTest {
    @org.junit.Test fun automatedTestOrdersAreIgnored() {
        val o = OnlineOrder("X", "X", "u", OnlineOrderRules.TEST_NAME, "0900000000", "pickup", "", "", "", emptyList(), 0, "new", "", 0L, null, null)
        org.junit.Assert.assertTrue(OnlineOrderRules.isTest(o))
        org.junit.Assert.assertFalse(OnlineOrderRules.isTest(o.copy(name = "An")))
    }
}

class OnlineOrderPricingFieldsTest {
    @org.junit.Test fun parsesDiscountAndSurcharge() {
        val o = OnlineOrderRules.fromMap("X", mapOf("code" to "X", "status" to "paid", "total" to 54000L, "discount" to 6000L, "surcharge" to 0L), { it as? Long })
        org.junit.Assert.assertEquals(6000L, o.discount)
        org.junit.Assert.assertEquals(0L, o.surcharge)
        val legacy = OnlineOrderRules.fromMap("Y", mapOf("code" to "Y", "status" to "paid", "total" to 1000L), { it as? Long })
        org.junit.Assert.assertEquals(0L, legacy.discount)
    }

    @Test fun priceProblemsFlagsMismatchedLongOrders() {
        fun line(id: String, price: Long, qty: Int = 1) = OnlineLine("Món $id", qty, "", price, id)
        val items = listOf(line("a", 10000), line("b", 20000, 2), line("c_x", 30000), line("d", 5000))
        val o = order("new").copy(items = items, total = 85000)
        assertTrue(OnlineOrderRules.priceProblems(o, mapOf("a" to 10000L, "b" to 20000L, "d" to 5000L), mapOf("x" to 30000L)).isEmpty())
        // khách giả giá món b, và tổng không khớp
        val bad = o.copy(items = listOf(line("a", 10000), line("b", 1000, 2), line("c_x", 30000), line("d", 5000)))
        val p = OnlineOrderRules.priceProblems(bad, mapOf("a" to 10000L, "b" to 20000L, "d" to 5000L), mapOf("x" to 30000L))
        assertTrue(p.any { it.contains("menu hiện 20000") })
        assertTrue(p.any { it.contains("Tổng tiền") })
        // món không còn trong menu
        assertTrue(OnlineOrderRules.priceProblems(o, mapOf("a" to 10000L), mapOf("x" to 30000L)).any { it.contains("không còn") })
    }
}
