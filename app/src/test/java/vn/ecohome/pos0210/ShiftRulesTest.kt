package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShiftRulesTest {
    @Test fun diffAndThreshold() {
        assertEquals(-5_000L, ShiftRules.diff(95_000, 100_000))
        assertFalse(ShiftRules.noteRequired(20_000))
        assertFalse(ShiftRules.noteRequired(-20_000))
        assertTrue(ShiftRules.noteRequired(20_001))
        assertTrue(ShiftRules.noteRequired(-50_000))
    }

    @Test fun overThresholdNeedsNote() {
        assertFalse(ShiftRules.canConfirm(-50_000, " "))
        assertTrue(ShiftRules.canConfirm(-50_000, "Thối nhầm"))
        assertTrue(ShiftRules.canConfirm(10_000, ""))
    }

    @Test fun denominationTotal() {
        assertEquals(1_250_000L, ShiftRules.denominationTotal(mapOf(500_000L to 2, 200_000L to 1, 50_000L to 1)))
        assertEquals(0L, ShiftRules.denominationTotal(mapOf(500_000L to -3)))
    }

    @Test fun workDateUsesVietnamTime() {
        // 2026-10-13 18:00 UTC = 01:00 ngày 14 tại Việt Nam
        assertEquals("2026-10-14", ShiftRules.workDate(java.time.Instant.parse("2026-10-13T18:00:00Z").toEpochMilli()))
    }

    @Test fun noOrderWithoutShift() {
        assertFalse(ShiftRules.canCreateOrder(hasActiveShift = false, testMode = false))
        assertTrue(ShiftRules.canCreateOrder(hasActiveShift = true, testMode = false))
        assertTrue(ShiftRules.canCreateOrder(hasActiveShift = false, testMode = true))
    }

    @Test fun whoCanCloseAndReceive() {
        assertTrue(ShiftRules.canCloseShift("s1", "s1", "STAFF"))
        assertFalse(ShiftRules.canCloseShift("s1", "s2", "STAFF"))
        assertTrue(ShiftRules.canCloseShift("s1", "a1", "ADMIN"))
        assertTrue(ShiftRules.canReceive("closed", "ADMIN"))
        assertFalse(ShiftRules.canReceive("closed", "STAFF"))
        assertFalse(ShiftRules.canReceive("open", "ADMIN"))
    }
}

class ShiftAttendanceRuleTest {
    @Test fun adminDecidesWhoClocksIn() {
        assertTrue(ShiftRules.attendanceRequired("", "STAFF"))
        assertFalse(ShiftRules.attendanceRequired("", "ADMIN"))
        assertFalse(ShiftRules.attendanceRequired("0", "STAFF"))
        assertTrue(ShiftRules.attendanceRequired("1", "ADMIN"))
    }
}
