package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Test

class PurchaseCardPresentationTest {
    @Test fun keepsItemNameAndNoteAsSeparateVisibleFields() {
        val view = purchaseCardPresentation("Ống đựng cafe", "Mua bổ sung cho quầy")
        assertEquals("Ống đựng cafe", view.itemName)
        assertEquals("Mua bổ sung cho quầy", view.note)
    }

    @Test fun blankNoteStaysBlankInsteadOfReplacingItemName() {
        val view = purchaseCardPresentation("Tủ lạnh", "")
        assertEquals("Tủ lạnh", view.itemName)
        assertEquals("", view.note)
    }
}
