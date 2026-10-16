package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import vn.ecohome.pos0210.data.PurchaseEntity

class ShareholderMonthTest {
    private fun p(id: String, at: Long, total: Long, cat: String, status: String = "ACTIVE") = PurchaseEntity(id, null, "u", at, total, status = status, expenseCategory = cat)

    @Test fun operatingExcludesInvestmentCapitalAndDeleted() {
        val rows = ShareholderMonth.operatingByCategory(listOf(
            p("a", 10, 500, ExpenseCategories.INVENTORY_PURCHASE), p("b", 11, 300, ExpenseCategories.PAYROLL),
            p("c", 12, 200, ExpenseCategories.INVENTORY_PURCHASE), p("d", 13, 999, ExpenseCategories.ADDITIONAL_INVESTMENT),
            p("e", 14, 888, ExpenseCategories.CAPITAL_ASSET), p("f", 15, 777, ExpenseCategories.PROFIT_WITHDRAWAL),
            p("g", 16, 666, ExpenseCategories.INVENTORY_PURCHASE, status = "DELETED"), p("h", 99, 555, ExpenseCategories.RENT)
        ), 10, 50)
        assertEquals(listOf(ExpenseCategories.INVENTORY_PURCHASE to 700L, ExpenseCategories.PAYROLL to 300L), rows)
    }

    @Test fun warningsBeforeClosing() {
        val h = 3_600_000L
        assertTrue(ShareholderMonth.warnings(0, 100 * h, 101 * h, 50 * h, 0).isEmpty())
        val w = ShareholderMonth.warnings(2, 90 * h, 101 * h, 200 * h, 15000)
        assertEquals(4, w.size)
        assertTrue(w[1].contains("2 bàn"))
        assertTrue(w[2].contains("11 giờ"))
        assertTrue(w[3].contains("15.000đ"))
        assertTrue(ShareholderMonth.warnings(0, null, 101 * h, 50 * h, 0).single().contains("chưa từng"))
    }

    @Test fun closeRecordRoundTripsAndToleratesOddNames() {
        val c = ShareholderMonth.Close("2026-10", 100, 60, 5, 35, 123, "Tuấn|admin", listOf("Anh A=B;C" to 20L, "Chị D" to 15L))
        val back = ShareholderMonth.decode(ShareholderMonth.encode(c))!!
        assertEquals(35L, back.net)
        assertEquals(listOf("Anh A-B,C" to 20L, "Chị D" to 15L), back.shares)
        assertEquals("Tuấn/admin", back.closedBy)
        assertNull(ShareholderMonth.decode("rác"))
        assertNull(ShareholderMonth.decode(null))
        assertEquals("month_close_2026-10", ShareholderMonth.settingKey("2026-10"))
    }

    @Test fun summaryTextHasNumbersAndWarnings() {
        val t = ShareholderMonth.summaryText("10/2026", 1_000_000, listOf(ExpenseCategories.PAYROLL to 300_000L), 0, 700_000, listOf("A" to 700_000L), listOf("Tháng chưa kết thúc: số còn thay đổi."), null)
        assertTrue(t.contains("Tiền thu bán hàng: 1.000.000đ"))
        assertTrue(t.contains("DÒNG TIỀN RÒNG: 700.000đ"))
        assertTrue(t.contains("! Tháng chưa kết thúc"))
    }
}
