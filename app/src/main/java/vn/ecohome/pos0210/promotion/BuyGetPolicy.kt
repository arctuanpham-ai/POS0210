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

/** A new gift line required for a different-item promotion. */
data class BuyGetGiftRequest(val ruleId: String, val menuItemId: String, val quantity: Int)

/** A single best discount per order; no stacking with coupons or tier discounts. */
object BuyGetPolicy {
    /** Reject incomplete or self-contradictory campaigns before saving locally or syncing. */
    fun isValid(rule: BuyGetRule): Boolean =
        rule.id.isNotBlank() &&
        rule.buyMenuItemId.isNotBlank() &&
        rule.giftMenuItemId.isNotBlank() &&
        rule.buyQuantity in 1..1000 &&
        rule.giftQuantity in 1..1000

    /**
     * Returns only the gift quantity still missing from an order.
     * existingGiftQuantity must contain previously generated gift lines for this rule,
     * not manually ordered items, so recalculation is idempotent.
     */
    fun giftToAdd(
        rule: BuyGetRule,
        purchasedQuantity: Int,
        existingGiftQuantity: Int
    ): BuyGetGiftRequest? {
        if (!rule.active || !isValid(rule) || rule.buyMenuItemId == rule.giftMenuItemId) return null
        val purchased = purchasedQuantity.coerceAtLeast(0)
        val existing = existingGiftQuantity.coerceAtLeast(0)
        val groups = if (rule.repeat) purchased / rule.buyQuantity
        else if (purchased >= rule.buyQuantity) 1 else 0
        if (groups <= 0) return null
        val desired = groups.toLong() * rule.giftQuantity
        if (desired > Int.MAX_VALUE) return null
        val missing = desired.toInt() - existing
        return if (missing > 0) BuyGetGiftRequest(rule.id, rule.giftMenuItemId, missing) else null
    }

    fun awards(rule: BuyGetRule, lines: List<BuyGetLine>): BuyGetAward? {
        if (!rule.active || !isValid(rule)) return null
        val purchased = lines.filter { it.menuItemId == rule.buyMenuItemId }
            .sumOf { it.quantity.coerceAtLeast(0) }
        val repeats = if (rule.buyMenuItemId == rule.giftMenuItemId) {
            // For A == B, X purchased units and Y gifted units form one complete group.
            val groupSize = rule.buyQuantity.toLong() + rule.giftQuantity
            if (groupSize > Int.MAX_VALUE) return null
            if (rule.repeat) purchased / groupSize.toInt()
            else if (purchased >= groupSize) 1 else 0
        } else if (rule.repeat) purchased / rule.buyQuantity
            else if (purchased >= rule.buyQuantity) 1 else 0
        if (repeats <= 0) return null
        val giftLines = lines.filter { it.menuItemId == rule.giftMenuItemId && it.quantity > 0 }
        val giftPrice = giftLines.firstOrNull()?.unitPrice?.coerceAtLeast(0) ?: return null
        val qty = repeats.toLong() * rule.giftQuantity
        if (qty > Int.MAX_VALUE) return null
        // A == B: never discount more items than the order actually contains.
        val giftQty = if (rule.buyMenuItemId == rule.giftMenuItemId)
            minOf(qty.toInt(), (purchased.toLong() - repeats.toLong() * rule.buyQuantity).coerceAtLeast(0L).toInt())
            else minOf(qty.toInt(), giftLines.sumOf { it.quantity.coerceAtLeast(0) })
        if (giftQty <= 0) return null
        if (giftPrice > Long.MAX_VALUE / giftQty) return null
        return BuyGetAward(rule.id, rule.giftMenuItemId, giftQty, giftPrice * giftQty)
    }

    fun best(
        rules: List<BuyGetRule>,
        lines: List<BuyGetLine>,
        competingDiscount: Long = 0L
    ): BuyGetAward? = rules.mapNotNull { awards(it, lines) }
        .maxWithOrNull(compareBy<BuyGetAward> { it.discount }.thenBy { it.ruleId })
        ?.takeIf { it.discount > competingDiscount.coerceAtLeast(0L) }
}
