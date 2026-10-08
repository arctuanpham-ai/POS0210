package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class PayrollPeriodTest {
    private val zone = ZoneId.of("Asia/Ho_Chi_Minh")
    private fun ms(value: String) = LocalDateTime.parse(value).atZone(zone).toInstant().toEpochMilli()

    @Test fun monthBoundsUseTheWholeLocalCalendarMonth() {
        val period = PayrollPeriod.of(2026, 10, zone)

        assertEquals(ms("2026-10-01T00:00:00"), period.startAt)
        assertEquals(ms("2026-11-01T00:00:00"), period.endAt)
    }
}
