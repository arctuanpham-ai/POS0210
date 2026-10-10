package vn.ecohome.pos0210.report
import org.junit.Assert.*
import org.junit.Test
import vn.ecohome.pos0210.data.*

class OrderSnapshotsTest {
    private val menu=listOf(MenuItemEntity("coffee","cat","Cà phê",35000))
    private val cats=listOf(MenuCategoryEntity("cat","Cà phê"))
    @Test fun missingCartItemRejectsWholeSend() {
        assertTrue(runCatching{OrderSnapshots.cart(mapOf("coffee" to 1,"missing" to 2),emptyMap(),menu,emptyList(),emptyList(),cats)}.isFailure)
    }
    @Test fun hiddenCartItemRejectsWholeSend() {
        assertTrue(runCatching{OrderSnapshots.cart(mapOf("coffee" to 1),emptyMap(),menu.map{it.copy(active=false)},emptyList(),emptyList(),cats)}.isFailure)
    }
    @Test fun missingComboComponentRejectsWholeSend() {
        assertTrue(runCatching{OrderSnapshots.cart(mapOf("combo:c" to 1),emptyMap(),menu,listOf(ComboEntity("c","Combo",60000)),listOf(ComboItemEntity("p","c","missing")),cats)}.isFailure)
    }
    @Test fun categoryAndComboCompositionAreFrozenAtSend() {
        val r=OrderSnapshots.cart(mapOf("coffee" to 2,"combo:c" to 1),emptyMap(),menu,listOf(ComboEntity("c","Combo",60000)),listOf(ComboItemEntity("p","c","coffee",2)),cats)
        assertEquals("Cà phê",r.first().categoryNameSnapshot)
        assertTrue(r.last().comboPartsSnapshot!!.contains("coffee"))
        assertTrue(r.last().comboPartsSnapshot!!.contains("Cà phê"))
        assertEquals(2,r.first().qty)
    }
    @Test fun changedMenuPriceRejectsOldPreparedOrder() {
        val prepared=OrderSnapshots.cart(mapOf("coffee" to 1),emptyMap(),menu,emptyList(),emptyList(),cats)
        assertTrue(runCatching{OrderSnapshots.stamp(prepared,menu.map{it.copy(price=40000)},emptyList(),emptyList(),cats)}.isFailure)
    }
}
