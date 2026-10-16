package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class OrderAssistTest {
    private val zone = ZoneId.of("Asia/Ho_Chi_Minh")
    private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int = 0) = LocalDateTime.of(y, mo, d, h, mi).atZone(zone).toInstant().toEpochMilli()

    @Test fun cashSuggestionsCoverTotalAndRoundUp() {
        assertEquals(listOf(135_000L, 140_000L, 150_000L, 200_000L, 500_000L), CashSuggest.amounts(135_000L))
        assertEquals(listOf(30_000L, 40_000L, 50_000L, 100_000L, 200_000L), CashSuggest.amounts(30_000L))
        assertTrue(CashSuggest.amounts(0L).isEmpty())
    }

    @Test fun alertsSlowDishNothingSentAndDraft() {
        val now = at(2026, 10, 17, 9, 30)
        val alerts = ServiceAlerts.compute(
            tables = listOf(ServiceAlerts.Table("t1", "Bàn 1"), ServiceAlerts.Table("t2", "Bàn 2"), ServiceAlerts.Table("t3", "Bàn 3")),
            sessions = listOf(ServiceAlerts.OpenSession("s1", "t1", now - 30 * 60_000L, 1), ServiceAlerts.OpenSession("s2", "t2", now - 15 * 60_000L, 0)),
            waiting = listOf(ServiceAlerts.WaitingBatch("s1", now - 14 * 60_000L)),
            drafts = mapOf("t3" to 2), now = now,
        )
        assertEquals(listOf(ServiceAlert.Kind.SLOW_DISH, ServiceAlert.Kind.NOTHING_SENT, ServiceAlert.Kind.UNSENT_DRAFT), alerts.map { it.kind })
        assertEquals(14L, alerts[0].minutes); assertEquals(2, alerts[2].count)
    }

    @Test fun draftSuppressesNothingSent() {
        val now = at(2026, 10, 17, 9, 30)
        val alerts = ServiceAlerts.compute(listOf(ServiceAlerts.Table("t2", "Bàn 2")), listOf(ServiceAlerts.OpenSession("s2", "t2", now - 15 * 60_000L, 0)), emptyList(), mapOf("t2" to 1), now)
        assertEquals(listOf(ServiceAlert.Kind.UNSENT_DRAFT), alerts.map { it.kind })
    }

    @Test fun forecastUsesSameWeekdayRestOfDay() {
        val now = at(2026, 10, 17, 14) // thứ Bảy
        val sales = listOf(
            RevenueForecaster.Sale(at(2026, 10, 17, 9), 500_000L),
            RevenueForecaster.Sale(at(2026, 10, 10, 9), 400_000L), RevenueForecaster.Sale(at(2026, 10, 10, 16), 300_000L),
            RevenueForecaster.Sale(at(2026, 10, 3, 9), 400_000L), RevenueForecaster.Sale(at(2026, 10, 3, 19), 500_000L),
            RevenueForecaster.Sale(at(2026, 10, 16, 18), 9_000_000L),
        )
        val f = RevenueForecaster.forecast(sales, now, zone)!!
        assertEquals(500_000L, f.soFar); assertEquals(400_000L, f.expectedRest); assertEquals(900_000L, f.total)
        assertTrue(f.basis.startsWith("cùng thứ"))
    }

    @Test fun forecastNullWithoutHistory() {
        assertNull(RevenueForecaster.forecast(listOf(RevenueForecaster.Sale(at(2026, 10, 17, 9), 1L)), at(2026, 10, 17, 10), zone))
    }

    @Test fun sensitiveActionsDetected() {
        assertTrue(SensitiveAudit.isSensitive("BATCH", "CANCELLED"))
        assertTrue(SensitiveAudit.isSensitive("MENU", "UPDATE", "CF-1 | name:A->A | price:30000->35000 | category:x->x"))
        assertFalse(SensitiveAudit.isSensitive("MENU", "UPDATE", "CF-1 | name:A->B | price:30000->30000 | category:x->x"))
        assertFalse(SensitiveAudit.isSensitive("PRINT", "KITCHEN_PRINTED"))
        assertFalse(SensitiveAudit.isSensitive("BILL", "DISCOUNT_APPLIED", "discount=5000,auto=true"))
        assertTrue(SensitiveAudit.isSensitive("BILL", "DISCOUNT_APPLIED", "discount=5000,auto=false"))
    }

    @Test fun comboSuggestedWhenOnlyOnePartMissingEvenWithoutHistory() {
        val combo = ComboDef("c9", "Sáng", 45_000L, mapOf("cf" to 1, "banh" to 1))
        val s = ComboSuggestions.suggest(mapOf("cf" to 1), listOf(combo), mapOf("cf" to 25_000L, "banh" to 25_000L), emptyMap())
        assertEquals(ComboSuggestion.Kind.PARTIAL, s.single().kind)
        assertTrue(ComboSuggestions.suggest(mapOf("cf" to 1), listOf(ComboDef("c8", "Lớn", 70_000L, mapOf("cf" to 1, "banh" to 2))), mapOf("cf" to 25_000L, "banh" to 25_000L), emptyMap()).isEmpty())
    }
}
