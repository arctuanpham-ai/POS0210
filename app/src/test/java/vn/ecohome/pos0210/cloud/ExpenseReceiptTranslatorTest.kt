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

    private fun purchase(updatedAt: Long? = null, status: String = "ACTIVE") =
        vn.ecohome.pos0210.data.PurchaseEntity("p1", null, "emp", 1_000L, 100_000L, "ghi chú cũ", status = status, expenseCategory = "INVENTORY_PURCHASE", paidByName = "Hương", updatedAt = updatedAt)

    private fun item(id: String, code: String, name: String = "Gà", qty: Double = 1.0, price: Long = 100_000L) =
        vn.ecohome.pos0210.data.PurchaseItemEntity(id, "p1", code, name, qty, "kg", price, (qty * price).toLong())

    @Test fun androidPayloadCarriesGroupFromMaterialCodeAndReceiptCategory() {
        val map = AndroidReceiptPayload.toMap(purchase(), listOf(item("i1", "THIT-AAAAAAAAAAAA"), item("i2", "pc_production", "Điện")), 5L)
        assertEquals("ANDROID_POS", map["source"])
        assertEquals("INVENTORY_PURCHASE", map["expenseCategory"])
        assertEquals(200_000L, map["total"])
        @Suppress("UNCHECKED_CAST") val lines = map["items"] as List<Map<String, Any?>>
        assertEquals("Thịt, gia cầm", lines[0]["expenseGroup"])
        assertEquals("Thịt, gia cầm", lines[0]["materialGroup"])
        assertEquals("INVENTORY_PURCHASE", lines[1]["expenseGroup"])
        assertEquals("", lines[1]["materialGroup"])
    }

    @Test fun webEditIsRecognisedOnlyOnAndroidDocumentsMarkedByWeb() {
        assertTrue(WebEditOfAndroidReceipt.isWebEdit(mapOf("source" to "ANDROID_POS", "editedBy" to "WEB_MANAGER")))
        assertTrue(!WebEditOfAndroidReceipt.isWebEdit(mapOf("source" to "ANDROID_POS")))
        assertTrue(!WebEditOfAndroidReceipt.isWebEdit(mapOf("source" to "WEB_MANAGER", "editedBy" to "WEB_MANAGER")))
    }

    private fun remote(status: String = "ACTIVE", updatedAt: Long = 10L, lines: List<RemoteExpenseLine>) =
        RemoteExpenseReceipt("p1", 2_000L, "emp", "Hương", "ghi chú mới", status, updatedAt, lines)

    @Test fun webEditReplacesLinesNoteDateAndTotalOfTheLocalReceipt() {
        val applied = WebEditOfAndroidReceipt.apply(
            purchase(updatedAt = 5L),
            remote(lines = listOf(RemoteExpenseLine("i1", "Gà", "THIT-AAAAAAAAAAAA", "Thịt, gia cầm", 2.0, "kg", 90_000L, 180_000L), RemoteExpenseLine("new", "Chanh", "RAU-BBBBBBBBBBBB", "Rau, củ, quả", 1.0, "kg", 20_000L, 20_000L)))
        )!!
        assertEquals("p1", applied.purchase.id)
        assertEquals(200_000L, applied.purchase.total)
        assertEquals("ghi chú mới", applied.purchase.note)
        assertEquals(2_000L, applied.purchase.purchasedAt)
        assertEquals("ACTIVE", applied.purchase.status)
        assertEquals("INVENTORY_PURCHASE", applied.purchase.expenseCategory)
        assertEquals("Hương", applied.purchase.paidByName)
        assertEquals(10L, applied.purchase.updatedAt)
        assertEquals(listOf("i1", "new"), applied.items.map { it.id })
        assertTrue(applied.items.all { it.purchaseId == "p1" })
        assertEquals("THIT-AAAAAAAAAAAA", applied.items[0].categoryId)
    }

    @Test fun webCancelMarksLocalReceiptDeleted() {
        val applied = WebEditOfAndroidReceipt.apply(
            purchase(),
            remote(status = "DELETED", lines = listOf(RemoteExpenseLine("i1", "Gà", "THIT-AAAAAAAAAAAA", "Thịt, gia cầm", 1.0, "kg", 100_000L, 100_000L)))
        )!!
        assertEquals("DELETED", applied.purchase.status)
    }

    @Test fun staleOrWebCopyReceiptsAreNotApplied() {
        val line = RemoteExpenseLine("i1", "Gà", "THIT-AAAAAAAAAAAA", "Thịt, gia cầm", 1.0, "kg", 100_000L, 100_000L)
        assertNull(WebEditOfAndroidReceipt.apply(purchase(updatedAt = 10L), remote(updatedAt = 10L, lines = listOf(line))))
        assertNull(WebEditOfAndroidReceipt.apply(purchase(updatedAt = 20L), remote(updatedAt = 10L, lines = listOf(line))))
        assertNull(WebEditOfAndroidReceipt.apply(purchase().copy(id = "web:p1"), remote(lines = listOf(line))))
    }

    @Test fun shopMoneyPurchaseIsNotAPersonalAdvance() {
        fun r(fund: String) = RemoteExpenseReceipt("r-$fund", 1L, "u", "Hương", "", "ACTIVE", 2L,
            listOf(RemoteExpenseLine("l", "Gà", "THIT-1", "Thịt, gia cầm", 1.0, "kg", 100L, 100L)), fund)
        assertEquals("", ExpenseReceiptTranslator.translate(r("SHOP_CASH")).purchase.paidByName)
        assertEquals("", ExpenseReceiptTranslator.translate(r("SHOP_BANK")).purchase.paidByName)
        assertEquals("Hương", ExpenseReceiptTranslator.translate(r("PERSONAL")).purchase.paidByName)
        assertEquals("Hương", ExpenseReceiptTranslator.translate(r("")).purchase.paidByName)
        val parsed = ExpenseReceiptParser.parse("x", mapOf("purchaseDate" to 1L, "updatedAt" to 2L, "enteredByName" to "Hương", "fundSource" to "SHOP_CASH",
            "items" to listOf(mapOf("id" to "l", "materialName" to "Gà", "qty" to 1.0, "unit" to "kg", "unitPrice" to 100L, "amount" to 100L))))
        assertEquals("SHOP_CASH", parsed?.fundSource)
    }
}
