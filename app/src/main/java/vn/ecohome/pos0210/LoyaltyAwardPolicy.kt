package vn.ecohome.pos0210

object LoyaltyAwardPolicy {
    fun additionalAwards(progress: Long, threshold: Long, cycleMode: String, issued: Int): Int {
        if (threshold <= 0L || progress < threshold) return 0
        val eligible = if (cycleMode == "REPEAT") progress / threshold else 1L
        return (eligible - issued.toLong()).coerceAtLeast(0L).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }
}
