package vn.ecohome.pos0210.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
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

    private fun fields(vararg lines: Map<String, Any?>) = mapOf<String, Any?>(
        "purchaseDate" to 1_728_000_000_000L,
        "updatedAt" to 1_728_000_100_000L,
        "status" to "ACTIVE",
        "items" to lines.toList()
    )

    private fun goodLine(id: String = "line-a") = mapOf<String, Any?>(
        "id" to id, "materialName" to "Gà", "materialCode" to "NL-GA", "expenseGroup" to "Nguyên liệu",
        "qty" to 2.0, "unit" to "kg", "unitPrice" to 95_000L, "amount" to 190_000L
    )

    @Test fun parserRejectsWholeReceiptWhenOneLineIsBroken() {
        val broken = goodLine("line-b") - "materialName"
        assertNull(ExpenseReceiptParser.parse("r1", fields(goodLine(), broken)))
        assertNotNull(ExpenseReceiptParser.parse("r1", fields(goodLine())))
    }

    @Test fun parserRejectsReceiptWithoutItems() {
        assertNull(ExpenseReceiptParser.parse("r2", fields()))
    }

    @Test fun cancelledIsTreatedAsDeletedAndBlankAsActive() {
        assertEquals("DELETED", ExpenseReceiptTranslator.normalizeStatus("CANCELLED"))
        assertEquals("DELETED", ExpenseReceiptTranslator.normalizeStatus(" deleted "))
        assertEquals("ACTIVE", ExpenseReceiptTranslator.normalizeStatus(""))
        assertTrue(ExpenseReceiptTranslator.isDeleted("CANCELLED"))
        assertTrue(!ExpenseReceiptTranslator.isDeleted("ACTIVE"))
    }

    @Test fun deletedReceiptKeepsDeletedStatusWhenTranslated() {
        val receipt = RemoteExpenseReceipt(
            "r3", 1_728_000_000_000L, "staff-a", "Hương", "", "CANCELLED", 1_728_000_100_000L,
            listOf(RemoteExpenseLine("line-a", "Gà", "NL-GA", "Nguyên liệu", 2.0, "kg", 95_000L, 190_000L))
        )
        assertEquals("DELETED", ExpenseReceiptTranslator.translate(receipt).purchase.status)
    }

    @Test fun androidCategoryCodeSurvivesRoundTrip() {
        val line = RemoteExpenseLine("a", "Gà", "pc_production", "INVENTORY_PURCHASE", 1.0, "kg", 1_000L, 1_000L)
        assertEquals("INVENTORY_PURCHASE", ExpenseReceiptTranslator.categoryFor(listOf(line)))
        val webLine = line.copy(expenseGroup = "Nguyên liệu")
        assertEquals("INVENTORY_PURCHASE", ExpenseReceiptTranslator.categoryFor(listOf(webLine)))
        val unknown = line.copy(expenseGroup = "không rõ")
        assertEquals("OTHER_EXPENSE", ExpenseReceiptTranslator.categoryFor(listOf(unknown)))
    }

    @Test fun validationToleratesRoundingButNotRealMismatch() {
        fun receipt(amount: Long) = RemoteExpenseReceipt(
            "r4", 1_728_000_000_000L, "staff-a", "Hương", "", "ACTIVE", 1_728_000_100_000L,
            listOf(RemoteExpenseLine("line-a", "Gạo", "NL-GAO", "Nguyên liệu", 0.5, "kg", 25_001L, amount))
        )
        assertTrue(ExpenseReceiptContract.validate(receipt(12_500L)).valid)
        assertTrue(ExpenseReceiptContract.validate(receipt(12_501L)).valid)
        assertTrue(!ExpenseReceiptContract.validate(receipt(13_000L)).valid)
    }
}
