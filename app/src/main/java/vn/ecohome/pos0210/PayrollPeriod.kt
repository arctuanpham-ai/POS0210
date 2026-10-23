package vn.ecohome.pos0210

import java.time.LocalDate
import java.time.ZoneId

data class PayrollPeriod(
    val year: Int,
    val month: Int,
    val startAt: Long,
    val endAt: Long
) {
    companion object {
        fun of(year: Int, month: Int, zone: ZoneId): PayrollPeriod {
            val startDate = LocalDate.of(year, month, 1)
            return PayrollPeriod(
                year = year,
                month = month,
                startAt = startDate.atStartOfDay(zone).toInstant().toEpochMilli(),
                endAt = startDate.plusMonths(1).atStartOfDay(zone).toInstant().toEpochMilli()
            )
        }
    }
}
