package vn.ecohome.pos0210.promotion

/**
 * Pure, offline-safe buy-X-get-Y calculation. The caller must persist the selected
 * promotion and gift lines atomically with the order; this policy does not mutate data.
 */
data class BuyGetRule(
    val id: String,
    val buyMenuItemId: String,
    val buyQuantity: Int,
    val giftMenuItemId: String,
    val giftQuantity: Int,
    val repeat: Boolean = true,
    val active: Boolean = true
)

data class BuyGetLine(val menuItemId: String, val quantity: Int, val unitPrice: Long)
data class BuyGetAward(val ruleId: String, val menuItemId: String, val quantity: Int, val discount: Long)

/** A single best discount per order; no stacking with coupons or tier discounts. */
object BuyGetPolicy {
    fun awards(rule: BuyGetRule, lines: List<BuyGetLine>): BuyGetAward? {
        if (!rule.active || rule.buyQuantity <= 0 || rule.giftQuantity <= 0) return null
        val purchased = lines.filter { it.menuItemId == rule.buyMenuItemId }
            .sumOf { it.quantity.coerceAtLeast(0) }
        val repeats = if (rule.repeat) purchased / rule.buyQuantity
            else if (purchased >= rule.buyQuantity) 1 else 0
        if (repeats <= 0) return null
        val giftLines = lines.filter { it.menuItemId == rule.giftMenuItemId && it.quantity > 0 }
        val giftPrice = giftLines.firstOrNull()?.unitPrice?.coerceAtLeast(0) ?: return null
        val qty = repeats.toLong() * rule.giftQuantity
        if (qty > Int.MAX_VALUE) return null
        // A == B: never discount more items than the order actually contains.
        val giftQty = if (rule.buyMenuItemId == rule.giftMenuItemId)
            minOf(qty.toInt(), (purchased - repeats * rule.buyQuantity).coerceAtLeast(0))
            else minOf(qty.toInt(), giftLines.sumOf { it.quantity.coerceAtLeast(0) })
        if (giftQty <= 0) return null
        if (giftPrice > Long.MAX_VALUE / giftQty) return null
        return BuyGetAward(rule.id, rule.giftMenuItemId, giftQty, giftPrice * giftQty))
    }

    fun best(
        rules: List<BuyGetRule>,
        lines: List<BuyGetLine>,
        competingDiscount: Long = 0L
    ): BuyGetAward? = rules.mapNotNull { awards(it, lines) }
        .maxWithOrNull(compareBy<BuyGetAward> { it.discount }.thenBy { it.ruleId })
        ?.takeIf { it.discount > competingDiscount.coerceAtLeast(0L) }
}
