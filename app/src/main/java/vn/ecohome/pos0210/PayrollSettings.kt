package vn.ecohome.pos0210

object PayrollSettings {
    fun hourlyRate(value: String?, fallback: Long): Long {
        val parsed = value?.trim()?.toLongOrNull()
        return parsed?.takeIf { it in 1_000L..1_000_000L } ?: fallback.coerceIn(0L, 1_000_000L)
    }

    fun multiplierBasisPoints(percent: String?): Int {
        val parsed = percent?.trim()?.toIntOrNull()
        return (parsed?.takeIf { it in 50..300 } ?: 100) * 100
    }
}
