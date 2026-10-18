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
        assertFalse(ShiftRules.shouldLock(now = 1_799_000, lastTouchAt = 0))
        assertTrue(ShiftRules.shouldLock(now = 1_800_000, lastTouchAt = 0))
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

class ShiftPhase2RulesTest {
    private fun t(s: String) = ShiftRules.parseLocalTime(s)!!

    @Test fun parseHm() {
        assertEquals(600, ShiftRules.parseHm("10:00"))
        assertEquals(null, ShiftRules.parseHm("25:00"))
        assertEquals(null, ShiftRules.parseHm("abc"))
    }

    @Test fun reminderFiresAfterUsualEndAndRespectsSnooze() {
        val checkIn = t("2026-10-13 06:00")
        assertFalse(ShiftRules.reminderDue(t("2026-10-13 09:59"), checkIn, "STAFF", "10:00", 0))
        assertTrue(ShiftRules.reminderDue(t("2026-10-13 10:00"), checkIn, "STAFF", "10:00", 0))
        assertFalse(ShiftRules.reminderDue(t("2026-10-13 10:10"), checkIn, "STAFF", "10:00", t("2026-10-13 10:15")))
        assertTrue(ShiftRules.reminderDue(t("2026-10-13 10:15"), checkIn, "STAFF", "10:00", t("2026-10-13 10:15")))
    }

    @Test fun reminderSkipsAdminAndLateStarts() {
        assertFalse(ShiftRules.reminderDue(t("2026-10-13 11:00"), t("2026-10-13 06:00"), "ADMIN", "10:00", 0))
        // vào ca sau giờ về thường lệ thì không nhắc ngay
        assertFalse(ShiftRules.reminderDue(t("2026-10-13 17:30"), t("2026-10-13 17:21"), "STAFF", "10:00", 0))
    }

    @Test fun staleShiftFromYesterdayAlwaysAutoCloses() {
        val now = t("2026-10-14 06:00")
        assertTrue(ShiftRules.shouldAutoClose(now, "2026-10-13", "STAFF", t("2026-10-13 09:30"), "22:00", 15))
        assertTrue(ShiftRules.shouldAutoClose(now, "2026-10-13", "ADMIN", t("2026-10-13 21:00"), "22:00", 15))
    }

    @Test fun staffShiftAutoClosesAfterCloseTimeOnlyWhenIdle() {
        val last = t("2026-10-13 09:30")
        assertFalse(ShiftRules.shouldAutoClose(t("2026-10-13 21:59"), "2026-10-13", "STAFF", last, "22:00", 15))
        assertTrue(ShiftRules.shouldAutoClose(t("2026-10-13 22:00"), "2026-10-13", "STAFF", last, "22:00", 15))
        assertFalse(ShiftRules.shouldAutoClose(t("2026-10-13 22:05"), "2026-10-13", "STAFF", t("2026-10-13 21:58"), "22:00", 15))
        assertFalse(ShiftRules.shouldAutoClose(t("2026-10-13 23:00"), "2026-10-13", "ADMIN", last, "22:00", 15))
    }

    @Test fun takeoverCutoffRules() {
        val checkIn = t("2026-10-13 06:00"); val now = t("2026-10-13 11:00")
        assertEquals(null, ShiftRules.takeoverCutoffError(t("2026-10-13 10:15"), checkIn, now))
        assertTrue(ShiftRules.takeoverCutoffError(t("2026-10-13 05:00"), checkIn, now) != null)
        assertTrue(ShiftRules.takeoverCutoffError(t("2026-10-13 12:00"), checkIn, now) != null)
        assertTrue(ShiftRules.takeoverCutoffError(null, checkIn, now) != null)
    }

    @Test fun defaultCutoffIsLastActivityClamped() {
        val checkIn = t("2026-10-13 06:00"); val now = t("2026-10-13 11:00")
        assertEquals(t("2026-10-13 10:15"), ShiftRules.defaultCutoff(t("2026-10-13 10:15"), checkIn, now))
        assertEquals(checkIn, ShiftRules.defaultCutoff(t("2026-10-13 05:00"), checkIn, now))
        assertEquals(now, ShiftRules.defaultCutoff(t("2026-10-13 12:00"), checkIn, now))
    }
}

class ShiftPhase3RulesTest {
    private fun t(s: String) = ShiftRules.parseLocalTime(s)!!

    @Test fun shiftMinutesUseRoundedPunches() {
        assertEquals(540L, ShiftRules.shiftMinutes(t("2026-10-13 05:55"), t("2026-10-13 14:45")))
        assertEquals(null, ShiftRules.shiftMinutes(t("2026-10-13 06:00"), null))
        assertEquals(0L, ShiftRules.shiftMinutes(t("2026-10-13 06:00"), t("2026-10-13 06:05")))
    }

    @Test fun alertsOnReviewOrLargeDiff() {
        assertTrue(ShiftRules.needsAlert("pending_review", null))
        assertTrue(ShiftRules.needsAlert("received", -30_000))
        assertFalse(ShiftRules.needsAlert("received", 20_000))
        assertFalse(ShiftRules.needsAlert("closed", null))
    }

    @Test fun editLogKeepsHistoryAndEscapesSeparators() {
        val l1 = ShiftRules.editLogLine(1, "Tuấn", "checkOut", "a", "b", "máy|lỗi")
        assertEquals(6, l1.split("|").size)
        val log = ShiftRules.appendEditLog(ShiftRules.appendEditLog("", l1), l1)
        assertEquals(2, log.lines().size)
    }

    @Test fun earliestUnclosedDayIsPickedFirst() {
        assertEquals("2026-10-12", ShiftRules.earliestOpenDay(listOf("2026-10-13", "2026-10-12", "2026-10-12"), emptySet()))
        assertEquals("2026-10-13", ShiftRules.earliestOpenDay(listOf("2026-10-13", "2026-10-12"), setOf("2026-10-12")))
        assertEquals(null, ShiftRules.earliestOpenDay(listOf("2026-10-12"), setOf("2026-10-12")))
    }

    @Test fun dayCloseReminder() {
        assertFalse(ShiftRules.dayCloseDue(t("2026-10-13 21:59"), "22:00", "2026-10-13", 0))
        assertTrue(ShiftRules.dayCloseDue(t("2026-10-13 22:00"), "22:00", "2026-10-13", 0))
        assertFalse(ShiftRules.dayCloseDue(t("2026-10-13 22:10"), "22:00", "2026-10-13", t("2026-10-13 22:15")))
        assertTrue(ShiftRules.dayCloseDue(t("2026-10-14 07:00"), "22:00", "2026-10-13", 0))
        assertFalse(ShiftRules.dayCloseDue(t("2026-10-13 23:00"), "22:00", null, 0))
    }
}
