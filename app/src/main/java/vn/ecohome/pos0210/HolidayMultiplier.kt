package vn.ecohome.pos0210

import java.math.BigDecimal
import java.math.RoundingMode

object HolidayMultiplier {
    private const val NORMAL = 10_000
    private const val MINIMUM = 5_000
    private const val MAXIMUM = 30_000

    fun basisPoints(value: String?): Int {
        val normalized = value?.trim()?.replace(',', '.')?.takeIf { it.isNotEmpty() } ?: return NORMAL
        val basisPoints = runCatching {
            BigDecimal(normalized)
                .multiply(BigDecimal(NORMAL))
                .setScale(0, RoundingMode.HALF_UP)
                .intValueExact()
        }.getOrNull() ?: return NORMAL
        return basisPoints.takeIf { it in MINIMUM..MAXIMUM } ?: NORMAL
    }

    fun settingKey(localDate: String) = "attendance_date_multiplier_$localDate"
}
