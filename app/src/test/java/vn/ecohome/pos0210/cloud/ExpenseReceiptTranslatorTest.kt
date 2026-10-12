package vn.ecohome.pos0210.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExpenseReceiptTranslatorTest {
    @Test fun localWriteGuardOnlyAcceptsWebNamespacedPurchaseIds() {
        assertTrue(WebExpenseReceiptScope.accepts("web:receipt-42"))
        assertEquals(false, WebExpenseReceiptScope.accepts("bill-42"))
    }

    @Test fun parserRejectsReceiptWithoutUsableMaterialLines() {
        val parsed = ExpenseReceiptParser.parse(
            "receipt-empty",
            mapOf("purchaseDate" to 1_728_000_000_000L, "items" to emptyList<Any>())
        )

        assertEquals(null, parsed)
    }

    @Test fun cursorAdvancesByTimestampThenReceiptIdSoEqualTimestampsAreNotSkipped() {
        val initial = ExpenseReceiptCursor(1_000L, "receipt-a")

        val cursor = initial.advance("receipt-b", 1_000L).advance("receipt-a", 1_001L)

        assertEquals(1_001L, cursor.updatedAt)
        assertEquals("receipt-a", cursor.receiptId)
    }

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
                RemoteExpenseLine("line-a", "Gà", "NL-GA", "FOOD", 2.0, "kg", 95_000L, 190_000L),
                RemoteExpenseLine("line-b", "Bún", "NL-BUN", "FOOD", 5.0, "kg", 18_000L, 90_000L)
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

    @Test fun vietnameseMaterialGroupsAreClassifiedAsInventoryOrConsumables() {
        val inventory = ExpenseReceiptTranslator.translate(
            RemoteExpenseReceipt("r-1", 1L, "u", "Hương", "", "ACTIVE", 2L,
                listOf(RemoteExpenseLine("l-1", "Gà", "THIT-1", "Thịt, gia cầm", 1.0, "kg", 1L, 1L)))
        )
        val consumable = ExpenseReceiptTranslator.translate(
            RemoteExpenseReceipt("r-2", 1L, "u", "Hương", "", "ACTIVE", 2L,
                listOf(RemoteExpenseLine("l-2", "Túi", "BAOBI-1", "Bao bì, vật tư phục vụ", 1.0, "cái", 1L, 1L)))
        )

        assertEquals(vn.ecohome.pos0210.ExpenseCategories.INVENTORY_PURCHASE, inventory.purchase.expenseCategory)
        assertEquals(vn.ecohome.pos0210.ExpenseCategories.CONSUMABLES, consumable.purchase.expenseCategory)
    }
}
