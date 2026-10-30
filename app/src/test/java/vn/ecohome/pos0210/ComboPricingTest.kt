package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Test
import vn.ecohome.pos0210.data.PricingRuleEntity

class ComboPricingTest {
    private fun rule(kind: String, pct: Int) = PricingRuleEntity(id = "$kind$pct", name = "$kind $pct%", kind = kind, percent = pct, autoApply = true, active = true)

    @Test fun comboKeepsFixedPriceWhileOtherItemsGetDiscount() {
        // 60.000 món lẻ + 100.000 combo, giảm 10%: chỉ giảm 6.000 trên món lẻ.
        val p = calculatePricing(160_000, listOf(rule("DISCOUNT", 10)), "", comboSubtotal = 100_000)
        assertEquals(6_000L, p.discount); assertEquals(154_000L, p.total); assertEquals(160_000L, p.subtotal)
    }

    @Test fun onlyComboMeansNoDiscountAndNoSurcharge() {
        val p = calculatePricing(100_000, listOf(rule("DISCOUNT", 10), rule("SURCHARGE", 5)), "", comboSubtotal = 100_000)
        assertEquals(0L, p.discount); assertEquals(0L, p.surcharge); assertEquals(100_000L, p.total)
    }

    @Test fun surchargeAndDiscountApplyOnlyToNonComboPart() {
        val p = calculatePricing(150_000, listOf(rule("SURCHARGE", 10), rule("DISCOUNT", 20)), "", comboSubtotal = 100_000)
        // món lẻ 50.000: phụ thu 5.000 → 55.000, giảm 20% = 11.000. Tổng = 150.000 + 5.000 - 11.000.
        assertEquals(5_000L, p.surcharge); assertEquals(11_000L, p.discount); assertEquals(144_000L, p.total)
        assertEquals(p.total, p.subtotal + p.surcharge - p.discount)
    }

    @Test fun giftDiscountCannotEatIntoComboPrice() {
        val p = calculatePricing(130_000, emptyList(), "", buyGetDiscount = 90_000, comboSubtotal = 100_000)
        assertEquals(30_000L, p.discount); assertEquals(100_000L, p.total)
    }

    @Test fun noComboBehavesAsBefore() {
        val p = calculatePricing(100_000, listOf(rule("DISCOUNT", 10)), "")
        assertEquals(10_000L, p.discount); assertEquals(90_000L, p.total)
    }
}
