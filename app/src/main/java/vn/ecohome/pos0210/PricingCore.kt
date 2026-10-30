package vn.ecohome.pos0210

import vn.ecohome.pos0210.data.PricingPreview
import vn.ecohome.pos0210.data.PricingRuleEntity
import java.util.Calendar

internal fun pricingRuleInTime(rule: PricingRuleEntity, now: Long): Boolean {
    if (!rule.active) return false
    if (rule.startAt != null && now < rule.startAt) return false
    if (rule.endAt != null && now > rule.endAt) return false
    val cal = Calendar.getInstance().apply { timeInMillis = now }
    val minute = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    val start = rule.startMinute
    val end = rule.endMinute
    if (start != null && end != null) {
        val ok = if (start <= end) minute in start..end else minute >= start || minute <= end
        if (!ok) return false
    }
    return true
}

/**
 * Tính giá thanh toán. GIÁ COMBO LÀ GIÁ CỐ ĐỊNH: [comboSubtotal] (tổng tiền các dòng combo, đã nằm trong [subtotal])
 * không chịu bất kỳ chương trình nào: không giảm giá %, không phụ thu, không mã ưu đãi, không hạng thành viên,
 * không quyền lợi tích điểm. Mọi chương trình chỉ tính trên phần còn lại (món lẻ).
 * Luôn giữ: total = subtotal + surcharge - discount.
 */
internal fun calculatePricing(
    subtotal: Long, rules: List<PricingRuleEntity>, enteredCode: String, now: Long = System.currentTimeMillis(),
    buyGetDiscount: Long = 0L, buyGetLabel: String? = null, comboSubtotal: Long = 0L,
): PricingPreview {
    val code = enteredCode.trim().uppercase()
    val base = (subtotal - comboSubtotal.coerceIn(0L, subtotal)).coerceAtLeast(0L)
    val eligible = rules.filter { pricingRuleInTime(it, now) }
    val codeMatches = if (code.isBlank()) emptyList() else eligible.filter { it.code.isNotBlank() && it.code.equals(code, true) }
    val surchargeRules = eligible.filter { it.kind == "SURCHARGE" && (it.autoApply || it in codeMatches) }
    val surcharge = surchargeRules.sumOf { base * it.percent / 100L }
    val afterSurcharge = base + surcharge
    val discountCandidates = eligible.filter { it.kind == "DISCOUNT" && (it.autoApply || it in codeMatches) }
    val bestDiscount = discountCandidates.maxByOrNull { afterSurcharge * it.percent / 100L }
    val ruleDiscount = bestDiscount?.let { afterSurcharge * it.percent / 100L } ?: 0L
    val safeBuyGetDiscount = buyGetDiscount.coerceIn(0L, afterSurcharge)
    // Compare competing discounts; never silently replace a better percentage offer.
    // Voucher selection is explicit and is handled separately by its caller.
    val useBuyGet = safeBuyGetDiscount > 0L && safeBuyGetDiscount >= ruleDiscount
    val discount = if (useBuyGet) safeBuyGetDiscount else ruleDiscount
    val appliedRule = if (useBuyGet) null else bestDiscount
    val total = (subtotal + surcharge - discount).coerceAtLeast(0L)
    val message = when {
        useBuyGet -> "Đã áp dụng ưu đãi ${buyGetLabel ?: "Mua X tặng Y"}."
        code.isNotBlank() && codeMatches.isEmpty() -> "Mã không hợp lệ hoặc đã hết thời gian áp dụng."
        code.isNotBlank() && appliedRule != null && appliedRule !in codeMatches -> "Mã hợp lệ nhưng hệ thống đang áp dụng ưu đãi lớn hơn: ${appliedRule.name}."
        code.isNotBlank() && appliedRule != null -> "Đã áp dụng ưu đãi tốt nhất: ${appliedRule.name}."
        else -> ""
    }
    return PricingPreview(subtotal, surcharge, discount, total, surchargeRules, appliedRule, message, if (useBuyGet) safeBuyGetDiscount else 0L, if (useBuyGet) buyGetLabel else null)
}
