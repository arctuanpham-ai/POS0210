package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PaymentFlowRulesTest {
    @Test fun unknownOrMissingFlowIsPostpaid() {
        assertEquals("postpaid", PaymentFlowRules.normalize(null))
        assertEquals("postpaid", PaymentFlowRules.normalize(""))
        assertEquals("prepaid", PaymentFlowRules.normalize("prepaid"))
    }

    @Test fun changeBlockedByOpenTablesAndCart() {
        assertTrue(PaymentFlowRules.changeBlocker("postpaid", "prepaid", listOf("Bàn 02"), true)!!.contains("Bàn 02"))
        assertTrue(PaymentFlowRules.changeBlocker("postpaid", "prepaid", emptyList(), false)!!.contains("Giỏ hàng"))
        assertNull(PaymentFlowRules.changeBlocker("postpaid", "prepaid", emptyList(), true))
        assertNull(PaymentFlowRules.changeBlocker("prepaid", "postpaid", emptyList(), true))
        assertTrue(PaymentFlowRules.changeBlocker("prepaid", "prepaid", emptyList(), true) != null)
    }

    @Test fun changeAmount() {
        assertEquals(20_000L, PaymentFlowRules.change(30_000, 50_000))
        assertEquals(0L, PaymentFlowRules.change(30_000, 30_000))
        assertNull(PaymentFlowRules.change(30_000, 20_000))
    }

    @Test fun prepaidCashNeedsEnoughMoneyPostpaidDoesNot() {
        assertFalse(PaymentFlowRules.canConfirmCash("prepaid", 30_000, null))
        assertFalse(PaymentFlowRules.canConfirmCash("prepaid", 30_000, 20_000))
        assertTrue(PaymentFlowRules.canConfirmCash("prepaid", 30_000, 50_000))
        assertTrue(PaymentFlowRules.canConfirmCash("postpaid", 30_000, null))
    }

    @Test fun historyKeepsOldAndNewMode() {
        val line = PaymentFlowRules.historyLine(1, "Tuấn", "postpaid", "prepaid")
        assertEquals(listOf("1", "Tuấn", "postpaid", "prepaid"), line.split("|"))
        assertEquals(2, PaymentFlowRules.appendHistory(line, line).lines().size)
    }

    @Test fun orderNumberAndStatusLabels() {
        assertEquals("#007", PaymentFlowRules.orderNoLabel(7))
        assertEquals("ĐANG PHA CHẾ", PaymentFlowRules.statusLabel("PAID", "WAITING"))
        assertEquals("ĐÃ GIAO", PaymentFlowRules.statusLabel("PAID", "DELIVERED"))
        assertEquals("ĐÃ HUỶ · HOÀN TIỀN", PaymentFlowRules.statusLabel("REFUNDED", "CANCELLED"))
    }
}
