package vn.ecohome.pos0210
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import vn.ecohome.pos0210.data.PurchaseEntity

class PurchasePayerTrackingTest {
    @Test fun existingPurchaseDefaultsPayerToBlank() {
        val purchase = PurchaseEntity("p", null, "employee", 1L, 100L)
        val field = runCatching { PurchaseEntity::class.java.getDeclaredField("paidByName") }.getOrNull()
        assertNotNull("PurchaseEntity must store the actual payer independently from enteredBy", field)
        field!!.isAccessible = true
        assertEquals("", field.get(purchase))
    }
}
