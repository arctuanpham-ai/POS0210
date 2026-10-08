package vn.ecohome.pos0210.promotion

import org.junit.Assert.*
import org.junit.Test

class BuyGetPolicyTest {
    @Test fun sameItemRequiresAllThreeUnits() {
        val rule = BuyGetRule("r", "coffee", 2, "coffee", 1)
        assertNull(BuyGetPolicy.awards(rule, listOf(BuyGetLine("coffee", 2, 30000))))
        val award = BuyGetPolicy.awards(rule, listOf(BuyGetLine("coffee", 3, 30000)))
        assertEquals(1, award?.quantity)
        assertEquals(30000L, award?.discount)
    }

    @Test fun sameItemRepeatsOnlyForCompleteGroups() {
        val rule = BuyGetRule("r", "coffee", 2, "coffee", 1)
        assertEquals(2, BuyGetPolicy.awards(rule, listOf(BuyGetLine("coffee", 7, 30000)))?.quantity)
    }

    @Test fun differentItemNeedsGiftOnOrder() {
        val rule = BuyGetRule("r", "coffee", 2, "tea", 1)
        assertNull(BuyGetPolicy.awards(rule, listOf(BuyGetLine("coffee", 2, 30000))))
        assertEquals(20000L, BuyGetPolicy.awards(rule, listOf(BuyGetLine("coffee", 2, 30000), BuyGetLine("tea", 1, 20000)))?.discount)
    }

    @Test fun differentItemAddsExactlyTheMissingGiftQuantity() {
        val rule = BuyGetRule("r", "coffee", 2, "tea", 1)
        assertEquals(
            BuyGetGiftRequest("r", "tea", 1),
            BuyGetPolicy.giftToAdd(rule, purchasedQuantity = 2, existingGiftQuantity = 0)
        )
        assertNull(BuyGetPolicy.giftToAdd(rule, purchasedQuantity = 2, existingGiftQuantity = 1))
    }

    @Test fun bestNeverStacksWithHigherExistingDiscount() {
        val rule = BuyGetRule("r", "coffee", 2, "tea", 1)
        val lines = listOf(BuyGetLine("coffee", 2, 30000), BuyGetLine("tea", 1, 20000))
        assertNull(BuyGetPolicy.best(listOf(rule), lines, 25000))
        assertEquals("r", BuyGetPolicy.best(listOf(rule), lines, 10000)?.ruleId)
    }

    @Test fun nonRepeatingPromotionOnlyAwardsOnce() {
        val rule = BuyGetRule("r", "coffee", 2, "tea", 1, repeat = false)
        val lines = listOf(BuyGetLine("coffee", 8, 30000), BuyGetLine("tea", 5, 20000))
        assertEquals(1, BuyGetPolicy.awards(rule, lines)?.quantity)
    }
}
