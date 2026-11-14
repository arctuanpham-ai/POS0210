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

    @Test fun acceptHasNoPaymentWindowAndReleasesLimit() {
        val t = OnlineOrderRules.transition(order("new"), "accept", 1_000_000L, "Lan")
        assertEquals("awaiting_payment", t.patch["status"])
        assertEquals("DMAB12CD", t.patch["transferContent"])
        assertTrue(t.patch["expiresAt"] === OnlineOrderRules.NULL)
        assertEquals("Lan", t.patch["handledBy"])
        assertTrue(t.releasesLimit)
    }

    @Test fun rejectNeedsReasonAndReleasesLimit() {
        try { OnlineOrderRules.transition(order("new"), "reject", 1L, reason = "  "); fail() } catch (_: IllegalArgumentException) { }
        val t = OnlineOrderRules.transition(order("new"), "reject", 1L, reason = "Hết món")
        assertEquals("rejected", t.patch["status"]); assertTrue(t.releasesLimit)
    }

    @Test fun paidReleasesLimitOnlyForLegacyPending() {
        assertFalse(OnlineOrderRules.transition(order("awaiting_payment"), "paid", 1L, method = "cash").releasesLimit)
        assertTrue(OnlineOrderRules.transition(order("awaiting_payment", expiresAt = 5L), "paid", 1L, method = "cash").releasesLimit)
        assertFalse(OnlineOrderRules.transition(order("expired"), "paid", 1L, method = "transfer").releasesLimit)
        assertFalse(OnlineOrderRules.transition(order("cancelled"), "paid", 1L, method = "transfer").releasesLimit)
    }

    @Test fun payBeforeOrAfter_doneWhenUnpaidNeedsMethod() {
        val unpaid = order("awaiting_payment", "delivery")
        assertFalse(OnlineOrderRules.isPaid(unpaid)); assertEquals("CHƯA THU", OnlineOrderRules.payLabel(unpaid))
        try { OnlineOrderRules.transition(unpaid, "done", 1L); fail() } catch (_: IllegalArgumentException) { }
        try { OnlineOrderRules.transition(unpaid, "paid", 1L); fail() } catch (_: IllegalArgumentException) { }
        val done = OnlineOrderRules.transition(unpaid, "done", 5L, method = "cash")
        assertEquals("done", done.patch["status"]); assertEquals("cash", done.patch["payMethod"]); assertEquals(5L, done.patch["paidAt"])
        val paid = OnlineOrderRules.transition(unpaid, "paid", 2L, method = "transfer")
        assertEquals("paid", paid.patch["status"])
        val paidOrder = unpaid.copy(status = "paid", paidAt = 2L, payMethod = "transfer")
        assertTrue(OnlineOrderRules.isPaid(paidOrder)); assertEquals("ĐÃ THU · CHUYỂN KHOẢN", OnlineOrderRules.payLabel(paidOrder))
        assertTrue(OnlineOrderRules.transition(paidOrder, "done", 3L).patch["payMethod"] == null)
        try { OnlineOrderRules.transition(paidOrder, "paid", 3L, method = "cash"); fail() } catch (_: IllegalStateException) { }
        // giao trước, thu sau: trạng thái vẫn đang giao
        val delivering = unpaid.copy(status = "delivering")
        assertEquals("delivering", OnlineOrderRules.transition(delivering, "paid", 4L, method = "cash").patch["status"])
        assertEquals("deliver", OnlineOrderRules.transition(unpaid, "deliver", 4L).patch.let { "deliver" })
    }

    @Test fun remindMessageHasAmountContentAndNoCodFeeAmount() {
        val m = OnlineOrderRules.remindMessage(order("awaiting_payment", "delivery"))
        assertTrue(m.contains("DMAB12CD")); assertTrue(m.contains("COD")); assertTrue(m.contains("50.000"))
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
        assertEquals(listOf("paid", "paid", "done", "done", "remind", "expire"), OnlineOrderRules.actions(order("awaiting_payment"), 0).map { it.key })
        assertEquals(listOf("done"), OnlineOrderRules.actions(order("delivering").copy(paidAt = 1L), 0).map { it.key })
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

    @Test fun staffAssistOrdersAreSilentAndAutoHandled() {
        val staff = order("new").copy(staffAssist = true)
        val web = order("new")
        assertTrue(OnlineOrderRules.unseenNew(listOf(staff), emptySet()).isEmpty())
        assertEquals(1, OnlineOrderRules.unseenNew(listOf(web), emptySet()).size)
        assertEquals(0, OnlineOrderRules.attention(listOf(staff), 0L))
        assertEquals(listOf(staff), OnlineOrderRules.staffToAccept(listOf(staff, web)))
        val paid = staff.copy(status = "paid")
        assertEquals(listOf(paid), OnlineOrderRules.staffToFinish(listOf(paid, web.copy(status = "paid"))))
    }

    @Test fun fromMapReadsStaffMedium() {
        val base = mapOf<String, Any?>("code" to "AB12CD", "status" to "new", "total" to 1000L)
        assertTrue(OnlineOrderRules.fromMap("AB12CD", base + ("src" to mapOf("source" to "facebook", "medium" to "staff_assist")), { null }).staffAssist)
        assertFalse(OnlineOrderRules.fromMap("AB12CD", base + ("src" to mapOf("source" to "facebook", "medium" to "messenger")), { null }).staffAssist)
        assertFalse(OnlineOrderRules.fromMap("AB12CD", base, { null }).staffAssist)
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
}
