package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ComboSuggestionsTest {
    private val prices = mapOf("cf" to 25_000L, "banh" to 20_000L, "tra" to 30_000L, "sua" to 15_000L)
    private val combo = ComboDef("c1", "Sáng", 40_000L, mapOf("cf" to 1, "banh" to 1)) // lẻ 45.000 → tiết kiệm 5.000
    private val history = mapOf("combo:c1" to 3)

    @Test fun fullMatchSuggestsComboAndSaving() {
        val s = ComboSuggestions.suggest(mapOf("cf" to 1, "banh" to 1), listOf(combo), prices, emptyMap())
        assertEquals(1, s.size)
        assertEquals(ComboSuggestion.Kind.FULL, s[0].kind)
        assertEquals(5_000L, s[0].saving)
    }

    @Test fun twoSetsInCartGiveTimesTwo() {
        val s = ComboSuggestions.suggest(mapOf("cf" to 2, "banh" to 3), listOf(combo), prices, emptyMap())
        assertEquals(2, s[0].times)
        assertEquals(10_000L, s[0].saving)
        val next = ComboSuggestions.apply(mapOf("cf" to 2, "banh" to 3), s[0], combo)
        assertEquals(mapOf("banh" to 1, "combo:c1" to 2), next)
    }

    @Test fun partialOnlyForCombosOrderedBeforeAndNeverMoreThanTwoMissingKinds() {
        val partial = ComboSuggestions.suggest(mapOf("cf" to 1), listOf(combo), prices, history)
        assertEquals(ComboSuggestion.Kind.PARTIAL, partial[0].kind)
        assertEquals(mapOf("banh" to 1), partial[0].missing)
        // combo chưa từng được gọi thì không gợi ý khi mới có một phần
        assertTrue(ComboSuggestions.suggest(mapOf("cf" to 1), listOf(combo), prices, emptyMap()).isEmpty())
        val big = ComboDef("c2", "Lớn", 60_000L, mapOf("cf" to 1, "banh" to 1, "tra" to 1, "sua" to 1)) // lẻ 90.000
        assertTrue(ComboSuggestions.suggest(mapOf("cf" to 1), listOf(big), prices, mapOf("combo:c2" to 9)).isEmpty())
    }

    @Test fun applyPartialAddsMissingThenConverts() {
        val s = ComboSuggestions.suggest(mapOf("cf" to 1), listOf(combo), prices, history)[0]
        assertEquals(mapOf("combo:c1" to 1), ComboSuggestions.apply(mapOf("cf" to 1), s, combo))
    }

    @Test fun noSuggestionWhenComboIsNotCheaperOrCartHasOnlyCombos() {
        val pricey = combo.copy(price = 45_000L)
        assertTrue(ComboSuggestions.suggest(mapOf("cf" to 1, "banh" to 1), listOf(pricey), prices, history).isEmpty())
        assertTrue(ComboSuggestions.suggest(mapOf("combo:c1" to 1), listOf(combo), prices, history).isEmpty())
        assertTrue(ComboSuggestions.suggest(emptyMap(), listOf(combo), prices, history).isEmpty())
    }

    @Test fun unknownPriceOrEmptyComboIsSkipped() {
        assertTrue(ComboSuggestions.suggest(mapOf("cf" to 1, "x" to 1), listOf(ComboDef("c3", "X", 1L, mapOf("cf" to 1, "x" to 1))), prices, history).isEmpty())
        assertTrue(ComboSuggestions.suggest(mapOf("cf" to 1), listOf(ComboDef("c4", "Rỗng", 1L, emptyMap())), prices, history).isEmpty())
    }

    @Test fun fullBeatsPartialAndMostOrderedComesFirst() {
        val a = ComboDef("a", "A", 40_000L, mapOf("cf" to 1, "banh" to 1))
        val b = ComboDef("b", "B", 35_000L, mapOf("cf" to 1, "sua" to 1)) // lẻ 40.000
        val s = ComboSuggestions.suggest(mapOf("cf" to 1, "banh" to 1), listOf(b, a), prices, mapOf("combo:a" to 1, "combo:b" to 8))
        assertEquals("a", s[0].comboId)           // FULL trước PARTIAL
        assertEquals(ComboSuggestion.Kind.PARTIAL, s[1].kind)
    }
}
