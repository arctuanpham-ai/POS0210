package vn.ecohome.pos0210

import org.junit.Assert.*
import org.junit.Test

class FoodAppTest {
    @Test fun priceTableRoundTripAndFallback() {
        val m = mapOf("a" to 35000L, "b" to 0L, "c" to 42000L)
        val back = FoodApp.parsePrices(FoodApp.encodePrices(m))
        assertEquals(mapOf("a" to 35000L, "c" to 42000L), back)
        assertEquals(35000L, FoodApp.priceFor("a", 30000L, back))
        assertEquals(30000L, FoodApp.priceFor("zzz", 30000L, back))
        assertTrue(FoodApp.parsePrices(null).isEmpty())
        assertTrue(FoodApp.parsePrices("rác\nx=abc\n=5").isEmpty())
    }
    @Test fun codeAndKey() {
        assertEquals("GF-123", FoodApp.cleanCode(" gf-123 "))
        assertEquals("SHOPEE:GF-123", FoodApp.key(FoodApp.SHOPEE, " gf-123"))
        assertEquals("GF-123", FoodApp.codeOf(FoodApp.reference(FoodApp.GRAB, "gf-123"), FoodApp.GRAB))
        assertTrue(FoodApp.isFood("GRAB")); assertFalse(FoodApp.isFood("CASH")); assertFalse(FoodApp.isFood(null))
        assertEquals("ShopeeFood", FoodApp.label("SHOPEE")); assertEquals("Chuyển khoản", FoodApp.label("TRANSFER"))
    }
    @Test fun amountParsing() {
        assertEquals(120000L, FoodApp.parseAmount("120.000"))
        assertNull(FoodApp.parseAmount(""))
        assertNull(FoodApp.parseAmount("1234567890123"))
    }
}

class FoodAppPayloadTest {
    @Test fun payloadNumbers() {
        val n = FoodApp.payloadNumbers("received=37933,commission=9817,vat=1500,pit=750,billAmount=50000,app=GRAB,by=Lan,source=web")
        assertEquals(37933L, n["received"]); assertEquals(9817L, n["commission"]); assertEquals(1500L, n["vat"]); assertEquals(750L, n["pit"])
        assertNull(n["by"])
    }
}
