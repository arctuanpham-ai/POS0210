package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PurchaseReceiptLineTest {
    @Test fun receiptLineCalculatesAmountAndRejectsBlankOrZeroValues() {
        val valid = PurchaseReceiptLine("Gà", "pc_production", 2.0, "kg", 95_000L)

        assertTrue(valid.isValid)
        assertEquals(190_000L, valid.amount)
        assertTrue(!PurchaseReceiptLine("", "pc_production", 1.0, "kg", 1L).isValid)
        assertTrue(!PurchaseReceiptLine("Bún", "pc_production", 0.0, "kg", 1L).isValid)
    }
}
