package vn.ecohome.pos0210.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExpenseReceiptTranslatorTest {
    @Test fun webReceiptKeepsStableLocalIdsAndEveryMaterialLine() {
        val receipt = RemoteExpenseReceipt(
            id = "receipt-42",
            purchaseDate = 1_728_000_000_000L,
            enteredByUid = "staff-a",
            enteredByName = "Hương",
            note = "Mua buổi sáng",
            status = "ACTIVE",
            updatedAt = 1_728_000_100_000L,
            items = listOf(
                RemoteExpenseLine("line-a", "Gà", "NL-GA", "Nguyên liệu", 2.0, "kg", 95_000L, 190_000L),
                RemoteExpenseLine("line-b", "Bún", "NL-BUN", "Nguyên liệu", 5.0, "kg", 18_000L, 90_000L)
            )
        )

        val translated = ExpenseReceiptTranslator.translate(receipt)

        assertEquals("web:receipt-42", translated.purchase.id)
        assertEquals("Hương", translated.purchase.paidByName)
        assertEquals(280_000L, translated.purchase.total)
        assertEquals(2, translated.items.size)
        assertEquals("web:receipt-42:line-a", translated.items[0].id)
        assertEquals("NL-GA", translated.items[0].categoryId)
        assertTrue(translated.items.all { it.purchaseId == "web:receipt-42" })
    }


    @Test fun canonicalReceiptRejectsWrongLineTotal() {
        val receipt = RemoteExpenseReceipt(
            id = "receipt-invalid",
            purchaseDate = 1_728_000_000_000L,
            enteredByUid = "staff-a",
            enteredByName = "Hương",
            note = "",
            status = "ACTIVE",
            updatedAt = 1_728_000_100_000L,
            items = listOf(RemoteExpenseLine("line-a", "Gà", "NL-GA", "Nguyên liệu", 2.0, "kg", 95_000L, 100_000L))
        )

        assertTrue(!ExpenseReceiptContract.validate(receipt).valid)
    }


    @Test fun canonicalReceiptKeepsStableIdAndComputedTotal() {
        val receipt = RemoteExpenseReceipt(
            id = "receipt-43",
            purchaseDate = 1_728_000_000_000L,
            enteredByUid = "staff-a",
            enteredByName = "Hương",
            note = "Mua buổi trưa",
            status = "ACTIVE",
            updatedAt = 1_728_000_100_000L,
            items = listOf(
                RemoteExpenseLine("line-a", "Gà", "NL-GA", "Nguyên liệu", 2.0, "kg", 95_000L, 190_000L),
                RemoteExpenseLine("line-b", "Bún", "NL-BUN", "Nguyên liệu", 5.0, "kg", 18_000L, 90_000L)
            )
        )
        val canonical = ExpenseReceiptContract.canonicalize(receipt)
        assertEquals("receipt-43", canonical.receiptId)
        assertEquals(280_000L, canonical.total)
        assertEquals(2, canonical.lines.size)
    }
}
