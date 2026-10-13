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

class ShiftPayAndManualEditTest {
    @Test fun onlyShiftOwnerCanPayWhileShiftOpen() {
        assertTrue(ShiftRules.canPay("linh", "linh"))
        assertFalse(ShiftRules.canPay("linh", "admin"))
        assertTrue(ShiftRules.canPay(null, "admin"))
    }

    @Test fun parseAndFormatRoundTrip() {
        val t = ShiftRules.parseLocalTime("2026-10-13 06:00")!!
        assertEquals("2026-10-13 06:00", ShiftRules.formatLocalTime(t))
        assertEquals(null, ShiftRules.parseLocalTime("13/10/2026"))
    }

    @Test fun manualEditValidation() {
        val now = ShiftRules.parseLocalTime("2026-10-13 18:00")!!
        val inAt = ShiftRules.parseLocalTime("2026-10-13 06:00")
        val outAt = ShiftRules.parseLocalTime("2026-10-13 10:00")
        assertEquals(null, ShiftRules.manualAttendanceError(inAt, outAt, "x", now, "Máy lỗi"))
        assertEquals(null, ShiftRules.manualAttendanceError(inAt, null, "", now, "Máy lỗi"))
        assertTrue(ShiftRules.manualAttendanceError(inAt, outAt, "x", now, " ") != null)
        assertTrue(ShiftRules.manualAttendanceError(outAt, inAt, "x", now, "r") != null)
        assertTrue(ShiftRules.manualAttendanceError(inAt, null, "abc", now, "r") != null)
        assertTrue(ShiftRules.manualAttendanceError(null, null, "", now, "r") != null)
        assertTrue(ShiftRules.manualAttendanceError(now + 60_000, null, "", now, "r") != null)
    }
}

class IdleLockTest {
    @Test fun locksOnlyAfterTimeout() {
        assertFalse(ShiftRules.shouldLock(now = 89_000, lastTouchAt = 0))
        assertTrue(ShiftRules.shouldLock(now = 90_000, lastTouchAt = 0))
        assertTrue(ShiftRules.shouldLock(now = 3_600_000, lastTouchAt = 0))
    }
}

class FormatHoursTest {
    @Test fun formatsHoursAndMinutes() {
        assertEquals("4h30", ShiftRules.formatHours(270))
        assertEquals("9h", ShiftRules.formatHours(540))
        assertEquals("0h05", ShiftRules.formatHours(5))
        assertEquals("0h", ShiftRules.formatHours(-3))
    }
}
