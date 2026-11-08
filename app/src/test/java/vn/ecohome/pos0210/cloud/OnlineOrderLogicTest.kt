package vn.ecohome.pos0210.cloud

import org.junit.Assert.*
import org.junit.Test

class OnlineOrderLogicTest {
    private fun order(status: String, mode: String = "pickup", total: Long = 100000, doneAt: Long? = null, expiresAt: Long? = null) =
        OnlineOrder("ABC234", "ABC234", "u1", "Lan", "0912345678", mode, "", "", "", listOf(OnlineLine("Cafe sữa", 1, 25000, "")),
            total, 0, status, "", 1000L, expiresAt, null, doneAt)

    @Test fun buttonsFollowTheFourConfirmations() {
        assertEquals(listOf(OnlineAction.ACCEPT, OnlineAction.REJECT), OnlineOrderLogic.buttons(order("new"), 0).map { it.action })
        assertEquals(OnlineAction.PAID, OnlineOrderLogic.buttons(order("awaiting_payment", expiresAt = 5000), 0).first().action)
        assertEquals(listOf(OnlineAction.DELIVER, OnlineAction.DONE), OnlineOrderLogic.buttons(order("paid", "delivery"), 0).map { it.action })
        assertEquals(listOf(OnlineAction.DONE), OnlineOrderLogic.buttons(order("paid", "pickup"), 0).map { it.action })
        assertEquals(listOf(OnlineAction.DONE), OnlineOrderLogic.buttons(order("delivering", "delivery"), 0).map { it.action })
        assertTrue(OnlineOrderLogic.buttons(order("done"), 0).isEmpty())
    }

    @Test fun rejectNeedsReasonAndReleasesLimit() {
        assertThrows(IllegalArgumentException::class.java) { OnlineOrderLogic.transition(order("new"), OnlineAction.REJECT, 5, "A", " ") }
        val (patch, release) = OnlineOrderLogic.transition(order("new"), OnlineAction.REJECT, 5, "A", "Hết món")
        assertEquals("rejected", patch["status"]); assertEquals("Hết món", patch["rejectReason"]); assertTrue(release)
    }

    @Test fun acceptSetsTransferContentAndDoesNotReleaseLimit() {
        val (patch, release) = OnlineOrderLogic.transition(order("new"), OnlineAction.ACCEPT, 10_000, "Hà")
        assertEquals("awaiting_payment", patch["status"]); assertEquals("DMABC234", patch["transferContent"]); assertEquals("Hà", patch["handledBy"]); assertFalse(release)
    }

    @Test fun paidReleasesLimitOnlyWhilePending() {
        assertTrue(OnlineOrderLogic.transition(order("awaiting_payment"), OnlineAction.PAID, 1, "").second)
        assertFalse(OnlineOrderLogic.transition(order("expired"), OnlineAction.PAID, 1, "").second)
    }

    @Test fun invalidStepIsRefused() {
        assertThrows(IllegalArgumentException::class.java) { OnlineOrderLogic.transition(order("new"), OnlineAction.DONE, 1, "") }
        assertThrows(IllegalArgumentException::class.java) { OnlineOrderLogic.transition(order("done"), OnlineAction.DELIVER, 1, "") }
    }

    @Test fun revenueCountsOnlyDoneInsideTheDay() {
        val orders = listOf(order("done", total = 80000, doneAt = 2000), order("paid", total = 50000), order("done", total = 30000, doneAt = 9000), order("rejected", total = 99000))
        assertEquals(Pair(80000L, 1), OnlineOrderLogic.revenue(orders, 1000, 5000))
        assertEquals(Pair(110000L, 2), OnlineOrderLogic.revenue(orders, 0, 10000))
    }

    @Test fun attentionCountsNewAndOverdue() {
        val list = listOf(order("new"), order("awaiting_payment", expiresAt = 100), order("awaiting_payment", expiresAt = 999999), order("paid"))
        assertEquals(2, OnlineOrderLogic.attention(list, 500))
    }
}
