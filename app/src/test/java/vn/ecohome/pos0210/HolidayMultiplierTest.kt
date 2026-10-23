package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Test

class HolidayMultiplierTest {
    @Test fun parses_calendar_multiplier_values() {
        assertEquals(15_000, HolidayMultiplier.basisPoints("1.5"))
        assertEquals(20_000, HolidayMultiplier.basisPoints("2"))
        assertEquals(12_500, HolidayMultiplier.basisPoints("1.25"))
    }

    @Test fun falls_back_to_normal_rate_for_invalid_multiplier() {
        assertEquals(10_000, HolidayMultiplier.basisPoints("0"))
        assertEquals(10_000, HolidayMultiplier.basisPoints("3.01"))
        assertEquals(10_000, HolidayMultiplier.basisPoints("abc"))
    }

    @Test fun toggles_multiple_calendar_dates_without_losing_previous_selection() {
        val selected = HolidayCalendarSelection.toggle(emptySet(), "2026-10-10")
        val withSecond = HolidayCalendarSelection.toggle(selected, "2026-10-11")
        assertEquals(setOf("2026-10-10", "2026-10-11"), withSecond)
        assertEquals(setOf("2026-10-11"), HolidayCalendarSelection.toggle(withSecond, "2026-10-10"))
    }

    @Test fun uses_a_date_scoped_setting_key() {
        assertEquals(
            "attendance_date_multiplier_2026-10-10",
            HolidayMultiplier.settingKey("2026-10-10")
        )
    }
}
