package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DeliveryRulesTest {
    @Test fun remainingAndAllDelivered() {
        val lines = listOf(DeliveryRules.Line(2, 1), DeliveryRules.Line(1, 1), DeliveryRules.Line(-1, 0, isAdjustment = true))
        assertEquals(1, DeliveryRules.remaining(lines))
        assertFalse(DeliveryRules.allDelivered(lines))
        assertTrue(DeliveryRules.allDelivered(listOf(DeliveryRules.Line(2, 2), DeliveryRules.Line(1, 1))))
        assertFalse(DeliveryRules.allDelivered(emptyList()))
    }

    @Test fun clampKeepsDeliveredWithinQty() {
        assertEquals(0, DeliveryRules.clamp(-3, 2)); assertEquals(2, DeliveryRules.clamp(5, 2)); assertEquals(1, DeliveryRules.clamp(1, 2))
    }

    @Test fun reminderFiresAfterThresholdThenRepeatsOnlyAfterInterval() {
        val min = 60_000L; val now = 100 * min
        val p = listOf(DeliveryReminder.Pending("a", "Bàn 3", now - 9 * min, 2), DeliveryReminder.Pending("b", "Bàn 4", now - 3 * min, 1))
        val first = DeliveryReminder.due(p, now, 8, 5, emptyMap())
        assertEquals(listOf("a"), first.map { it.key }); assertEquals(9L, first[0].minutes)
        assertTrue(DeliveryReminder.due(p, now + 2 * min, 8, 5, mapOf("a" to now)).none { it.key == "a" })
        assertEquals(listOf("a"), DeliveryReminder.due(p, now + 5 * min, 8, 5, mapOf("a" to now)).map { it.key })
    }

    @Test fun speechIsVietnameseAndMentionsTableAndRemaining() {
        val one = DeliveryReminder.speech(listOf(DeliveryReminder.Due("a", "Bàn 3", 10, 2)))
        assertTrue(one.contains("Bàn 3") && one.contains("10 phút") && one.contains("2 món"))
        assertTrue(DeliveryReminder.speech(listOf(DeliveryReminder.Due("a", "Bàn 3", 10, 2), DeliveryReminder.Due("b", "Bàn 5", 9, 1))).startsWith("Có 2 đơn"))
        assertEquals("", DeliveryReminder.speech(emptyList()))
    }

    @Test fun paymentFixPolicyManagerAlwaysCashierOnlyWithinWindow() {
        val min = 60_000L; val paid = 1_000L * min
        assertTrue(PaymentFixPolicy.canFix("MANAGER", "m", "c", paid, paid + 500 * min))
        assertTrue(PaymentFixPolicy.canFix("STAFF", "c", "c", paid, paid + 9 * min))
        assertFalse(PaymentFixPolicy.canFix("STAFF", "c", "c", paid, paid + 11 * min))
        assertFalse(PaymentFixPolicy.canFix("STAFF", "x", "c", paid, paid + 1 * min))
    }
}
