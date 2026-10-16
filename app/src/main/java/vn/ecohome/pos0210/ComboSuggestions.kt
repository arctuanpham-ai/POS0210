package vn.ecohome.pos0210

/** Combo ở dạng thuần để so khớp: parts = mã món → số lượng trong một combo. */
data class ComboDef(val id: String, val name: String, val price: Long, val parts: Map<String, Int>)

data class ComboSuggestion(
    val comboId: String,
    val comboName: String,
    val kind: Kind,
    /** Số combo sẽ tạo khi áp dụng. */
    val times: Int,
    /** Món còn thiếu để thành combo (chỉ có ở PARTIAL). */
    val missing: Map<String, Int>,
    /** Tiền khách tiết kiệm so với gọi lẻ. */
    val saving: Long,
) {
    enum class Kind { FULL, PARTIAL }
}

/**
 * Gợi ý combo từ giỏ hàng, không đổi giỏ cho tới khi nhân viên bấm áp dụng.
 * - FULL: các món lẻ trong giỏ đã đủ một combo (bất kể combo từng được gọi chưa) và combo rẻ hơn gọi lẻ.
 * - PARTIAL: giỏ có một phần món của combo đã từng được gọi (thiếu tối đa 2 loại), hoặc combo bất kỳ chỉ còn thiếu đúng 1 phần; thêm món thiếu là rẻ hơn.
 */
object ComboSuggestions {
    const val COMBO_PREFIX = "combo:"
    const val MAX_MISSING_KINDS = 2

    fun suggest(
        cart: Map<String, Int>,
        combos: List<ComboDef>,
        prices: Map<String, Long>,
        history: Map<String, Int>,
        limit: Int = 2,
    ): List<ComboSuggestion> {
        val loose = cart.filter { (id, q) -> !id.startsWith(COMBO_PREFIX) && q > 0 }
        if (loose.isEmpty()) return emptyList()
        val out = mutableListOf<ComboSuggestion>()
        for (combo in combos) {
            if (combo.parts.isEmpty() || combo.parts.any { (_, q) -> q <= 0 }) continue
            if (combo.parts.keys.any { prices[it] == null }) continue
            val normal = combo.parts.entries.sumOf { (id, q) -> (prices.getValue(id)) * q }
            val saving = normal - combo.price
            if (saving <= 0L) continue
            val times = combo.parts.minOf { (id, q) -> (loose[id] ?: 0) / q }
            if (times >= 1) {
                out += ComboSuggestion(combo.id, combo.name, ComboSuggestion.Kind.FULL, times, emptyMap(), saving * times)
                continue
            }
            val covered = combo.parts.count { (id, _) -> (loose[id] ?: 0) > 0 }
            val missing = combo.parts.mapNotNull { (id, q) -> (q - (loose[id] ?: 0)).takeIf { it > 0 }?.let { id to it } }.toMap()
            // Combo từng được gọi: gợi ý khi thiếu ≤ 2 loại món. Combo chưa ai gọi: chỉ gợi ý khi thiếu đúng 1 phần (dễ chốt, ít làm phiền).
            val nearlyFull = missing.values.sum() == 1
            if (covered >= 1 && missing.size <= MAX_MISSING_KINDS && ((history[COMBO_PREFIX + combo.id] ?: 0) >= 1 || nearlyFull)) {
                out += ComboSuggestion(combo.id, combo.name, ComboSuggestion.Kind.PARTIAL, 1, missing, saving)
            }
        }
        return out.sortedWith(
            compareBy<ComboSuggestion> { it.kind != ComboSuggestion.Kind.FULL }
                .thenByDescending { history[COMBO_PREFIX + it.comboId] ?: 0 }
                .thenByDescending { it.saving }
        ).take(limit)
    }

    /** Giỏ sau khi áp dụng gợi ý: thêm món thiếu (PARTIAL), rồi đổi các món lẻ đủ bộ thành combo. Món lẻ thừa giữ nguyên. */
    fun apply(cart: Map<String, Int>, suggestion: ComboSuggestion, combo: ComboDef): Map<String, Int> {
        val next = cart.toMutableMap()
        suggestion.missing.forEach { (id, q) -> next[id] = (next[id] ?: 0) + q }
        val times = combo.parts.minOf { (id, q) -> (next[id] ?: 0) / q }.coerceAtMost(maxOf(suggestion.times, 1))
        if (times < 1) return cart
        combo.parts.forEach { (id, q) ->
            val left = (next[id] ?: 0) - q * times
            if (left > 0) next[id] = left else next.remove(id)
        }
        val key = COMBO_PREFIX + combo.id
        next[key] = (next[key] ?: 0) + times
        return next
    }
}
