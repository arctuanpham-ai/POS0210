package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Test

class PrepaidEditTest {
    @Test fun rebuildsCartFromSavedItemsSkippingGifts() {
        val (cart, notes) = PrepaidEdit.rebuild(listOf(
            PrepaidEdit.Line("cafe", 2, "ít đá"),
            PrepaidEdit.Line("banh", 1),
            PrepaidEdit.Line("cafe", 1, "nhiều sữa"),
            PrepaidEdit.Line("banh", 1, gift = true),
            PrepaidEdit.Line(null, 1),
        ))
        assertEquals(mapOf("cafe" to 3, "banh" to 1), cart)
        assertEquals(mapOf("cafe" to "ít đá"), notes)
    }

    @Test fun negativeCorrectionsReduceAndZeroLinesDisappear() {
        val (cart, _) = PrepaidEdit.rebuild(listOf(PrepaidEdit.Line("tra", 2), PrepaidEdit.Line("tra", -2), PrepaidEdit.Line("bun", 1)))
        assertEquals(mapOf("bun" to 1), cart)
    }

    @Test fun splitServedAndAdded() {
        val served = mapOf("cafe" to 2, "banh" to 1)
        val (base, extra) = PrepaidEdit.split(mapOf("cafe" to 3, "banh" to 1, "tra" to 1), served)
        assertEquals(mapOf("cafe" to 2, "banh" to 1), base)
        assertEquals(mapOf("cafe" to 1, "tra" to 1), extra)
        val (base2, extra2) = PrepaidEdit.split(mapOf("cafe" to 1), served)
        assertEquals(mapOf("cafe" to 1), base2)
        assertEquals(emptyMap<String, Int>(), extra2)
        val (base3, extra3) = PrepaidEdit.split(mapOf("cafe" to 1), null)
        assertEquals(emptyMap<String, Int>(), base3)
        assertEquals(mapOf("cafe" to 1), extra3)
    }

    /** Thoát ra vào lại sửa nhiều lần: mỗi lần dựng lại từ đơn đã lưu nên không mất món, mốc "đã phục vụ" giữ nguyên. */
    @Test fun repeatedEditCyclesKeepEverything() {
        val served = mapOf("cafe" to 2)
        var saved = listOf(PrepaidEdit.Line("cafe", 2))
        repeat(3) { round ->
            val (cart, _) = PrepaidEdit.rebuild(saved)
            val next = cart.toMutableMap().apply { put("banh${round}", 1) }
            val (base, extra) = PrepaidEdit.split(next, served)
            saved = base.map { PrepaidEdit.Line(it.key, it.value) } + extra.map { PrepaidEdit.Line(it.key, it.value) }
            assertEquals(mapOf("cafe" to 2), base)
        }
        assertEquals(mapOf("cafe" to 2, "banh0" to 1, "banh1" to 1, "banh2" to 1), PrepaidEdit.rebuild(saved).first)
        assertEquals("banh0+1", PrepaidEdit.diff(mapOf("cafe" to 2), mapOf("cafe" to 2, "banh0" to 1)))
    }
}
