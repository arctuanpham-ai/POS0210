package vn.ecohome.pos0210.report

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import vn.ecohome.pos0210.data.MenuCategoryEntity
import vn.ecohome.pos0210.data.MenuItemEntity

class SalesItemGroupingTest {
    @Test fun inferredCategoryMergesIntoSameHistoricalGroupWithoutDoubleRow() {
        val historical=SalesReport.ItemSummary("coffee",listOf("Cà phê"),"coffee","Cà phê","NORMAL",31,960000,30000,35000)
        val legacy=SalesReport.ItemSummary("latte",listOf("Latte"),null,"Chưa có nhóm lịch sử","NORMAL",1,30000,30000,30000)
        val groups=SalesItemGrouping.group(
            listOf(historical,legacy),
            listOf(MenuItemEntity("latte","coffee","Latte",30000)),
            listOf(MenuCategoryEntity("coffee","Cà phê"))
        )
        assertEquals(1,groups.size)
        assertEquals("Cà phê",groups.single().name)
        assertEquals(32,groups.single().directQty)
        assertEquals(990000L,groups.single().directGross)
        assertEquals(1,groups.single().inferredLineCount)
        assertTrue(groups.single().rows.contains(legacy))
    }
}
