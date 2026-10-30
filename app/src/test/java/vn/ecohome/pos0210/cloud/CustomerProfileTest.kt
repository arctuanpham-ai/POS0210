package vn.ecohome.pos0210.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerProfileTest {
    private fun order(code: String, status: String, at: Long, total: Long, phone: String = "0912345678", vararg items: OnlineLine, name: String = "An") =
        OnlineOrder(code, code, "u", name, phone, "pickup", "", "", "", items.toList(), total, status, "", at, null, null)
    private fun line(name: String, qty: Int) = OnlineLine(name, qty, "", 20000, "x")

    @Test fun countsOnlyPaidOrdersOfThatPhoneAndExcludesCurrent() {
        val list = listOf(
            order("A1", "done", 1000, 50000, items = arrayOf(line("Cà phê sữa", 2))),
            order("A2", "paid", 3000, 30000, items = arrayOf(line("Cà phê sữa", 1), line("Bánh mì", 1))),
            order("A3", "rejected", 4000, 99000, items = arrayOf(line("Trà", 1))),
            order("A4", "expired", 5000, 99000),
            order("B1", "done", 2000, 70000, phone = "0999999999"),
            order("CUR", "new", 6000, 40000),
        )
        val p = CustomerProfiles.build("0912345678", list, CustomerNote("ít đá"), excludeCode = "CUR")
        assertEquals(2, p.orderCount)
        assertEquals(80000L, p.totalSpend)
        assertEquals(3000L, p.lastAt)
        assertEquals(listOf("A2", "A1"), p.history.map { it.code })
        assertEquals("Cà phê sữa" to 3, p.favorites.first())
        assertTrue(p.isRepeat)
        assertEquals("ít đá", p.note.note)
        assertTrue(p.headline().contains("2 lần mua") && p.headline().contains("80.000đ"))
    }

    @Test fun newCustomerAndTestOrdersIgnored() {
        val list = listOf(order("T1", "done", 1000, 10000, name = OnlineOrderRules.TEST_NAME))
        val p = CustomerProfiles.build("0912345678", list, CustomerNote())
        assertEquals(0, p.orderCount)
        assertFalse(p.isRepeat)
        assertTrue(p.headline().startsWith("Khách mới"))
    }
}
