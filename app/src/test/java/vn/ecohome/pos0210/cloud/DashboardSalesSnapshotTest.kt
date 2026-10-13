package vn.ecohome.pos0210.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import vn.ecohome.pos0210.data.BillEntity
import vn.ecohome.pos0210.data.DiningTableEntity
import vn.ecohome.pos0210.data.OrderBatchEntity
import vn.ecohome.pos0210.data.OrderItemEntity
import vn.ecohome.pos0210.data.TableSessionEntity
import java.time.ZoneId
import java.time.ZonedDateTime

class DashboardSalesSnapshotTest {
    private val zone = ZoneId.of("Asia/Ho_Chi_Minh")
    private fun at(y: Int, m: Int, d: Int, h: Int, min: Int, s: Int = 0) =
        ZonedDateTime.of(y, m, d, h, min, s, 0, zone).toInstant().toEpochMilli()

    private val table = DiningTableEntity("t1", "area", "Bàn 1")
    private fun session(id: String, status: String = "OPEN", openedAt: Long = at(2026, 10, 13, 9, 0)) =
        TableSessionEntity(id, "t1", openedAt, "staff", status)
    private fun batch(id: String, sessionId: String, status: String = "WAITING") =
        OrderBatchEntity(id, sessionId, 1, "staff", at(2026, 10, 13, 9, 5), at(2026, 10, 13, 9, 6), status)
    private fun item(id: String, batchId: String, menuId: String?, name: String, price: Long, qty: Int) =
        OrderItemEntity(id, batchId, menuId, name, price, qty)
    private fun bill(id: String, sessionId: String, total: Long, closedAt: Long?, status: String = "PAID", scope: String = "LIVE") =
        BillEntity(id, sessionId, "HD-$id", at(2026, 10, 13, 9, 0), closedAt, total, total, status, null, scope)

    @Test fun openTableAddsOnlyProvisionalTotalNeverRevenue() {
        val sessions = listOf(session("s1"))
        val batches = listOf(batch("b1", "s1"))
        val items = listOf(item("i1", "b1", "m1", "Cà phê", 30_000L, 2), item("i2", "b1", "m2", "Trà", 20_000L, 1))

        val current = DashboardSalesSnapshot.composeCurrent(listOf(table), sessions, batches, items)
        val daily = DashboardSalesSnapshot.composeDaily("2026-10-13", "2026-10-13", emptyList(), batches, items, zone)

        assertEquals(1, current.openTables)
        assertEquals(80_000L, current.provisionalOpenTotal)
        assertEquals("Bàn 1", current.liveTables.single().name)
        assertEquals(0L, daily.revenue)
        assertEquals(0, daily.paidBills)
        assertTrue(daily.items.isEmpty())
    }

    @Test fun cancelledBatchIsExcludedFromProvisionalTotal() {
        val sessions = listOf(session("s1"))
        val batches = listOf(batch("b1", "s1"), batch("b2", "s1", "CANCELLED"))
        val items = listOf(item("i1", "b1", "m1", "Cà phê", 30_000L, 1), item("i2", "b2", "m2", "Trà", 99_000L, 5))

        val current = DashboardSalesSnapshot.composeCurrent(listOf(table), sessions, batches, items)

        assertEquals(30_000L, current.provisionalOpenTotal)
    }

    @Test fun closedSessionIsNotALiveTable() {
        val current = DashboardSalesSnapshot.composeCurrent(listOf(table), listOf(session("s1", "CLOSED")), emptyList(), emptyList())
        assertEquals(0, current.openTables)
        assertTrue(current.liveTables.isEmpty())
    }

    @Test fun dailyRevenueCountsOnlyPaidLiveBillsAndComputesAverage() {
        val day = at(2026, 10, 13, 12, 0)
        val bills = listOf(
            bill("a", "s1", 100_000L, day),
            bill("b", "s2", 50_000L, day),
            bill("c", "s3", 999_000L, day, status = "OPEN"),
            bill("d", "s4", 888_000L, day, scope = "TEST"),
            bill("e", "s5", 777_000L, null)
        )
        val daily = DashboardSalesSnapshot.composeDaily("2026-10-13", "2026-10-13", bills, emptyList(), emptyList(), zone)

        assertEquals(150_000L, daily.revenue)
        assertEquals(2, daily.paidBills)
        assertEquals(75_000L, daily.averageBill)
        assertTrue(!daily.finalized)
    }

    @Test fun dailyItemsAreGroupedPaidOnlyAndSortedByRevenue() {
        val day = at(2026, 10, 13, 12, 0)
        val bills = listOf(bill("a", "s1", 90_000L, day), bill("b", "s2", 20_000L, day))
        val batches = listOf(batch("b1", "s1"), batch("b2", "s2"), batch("b3", "s2", "CANCELLED"), batch("b4", "s9"))
        val items = listOf(
            item("i1", "b1", "m1", "Cà phê", 30_000L, 2),
            item("i2", "b2", "m1", "Cà phê", 30_000L, 1),
            item("i3", "b2", "m2", "Trà", 20_000L, 1),
            item("i4", "b3", "m3", "Món đã huỷ", 500_000L, 1),
            item("i5", "b4", "m4", "Bàn chưa thanh toán", 70_000L, 1)
        )
        val daily = DashboardSalesSnapshot.composeDaily("2026-10-13", "2026-10-14", bills, batches, items, zone)

        assertEquals(listOf("m1", "m2"), daily.items.map { it.itemId })
        assertEquals(3L, daily.items[0].qty)
        assertEquals(90_000L, daily.items[0].revenue)
        assertEquals(20_000L, daily.items[1].revenue)
        assertTrue(daily.finalized)
    }

    @Test fun dailyItemsAreCappedAtFifty() {
        val day = at(2026, 10, 13, 12, 0)
        val bills = listOf(bill("a", "s1", 1L, day))
        val batches = listOf(batch("b1", "s1"))
        val items = (1..60).map { item("i$it", "b1", "m$it", "Món $it", it * 1_000L, 1) }
        val daily = DashboardSalesSnapshot.composeDaily("2026-10-13", "2026-10-13", bills, batches, items, zone)

        assertEquals(DashboardSalesSnapshot.MAX_ITEMS, daily.items.size)
        assertEquals(60_000L, daily.items.first().revenue)
    }

    @Test fun paymentsAroundLocalMidnightBelongToTheCorrectDay() {
        val bills = listOf(
            bill("late", "s1", 10_000L, at(2026, 10, 12, 23, 59, 59)),
            bill("early", "s2", 20_000L, at(2026, 10, 13, 0, 0, 0))
        )
        val before = DashboardSalesSnapshot.composeDaily("2026-10-12", "2026-10-13", bills, emptyList(), emptyList(), zone)
        val after = DashboardSalesSnapshot.composeDaily("2026-10-13", "2026-10-13", bills, emptyList(), emptyList(), zone)

        assertEquals(10_000L, before.revenue)
        assertEquals(20_000L, after.revenue)
        assertEquals("2026-10-12", DashboardSalesSnapshot.dateKey(at(2026, 10, 12, 23, 59, 59), zone))
        assertEquals("2026-10-13", DashboardSalesSnapshot.dateKey(at(2026, 10, 13, 0, 0, 0), zone))
    }

    @Test fun dailyDocumentIdIsTheDateKeyAndRetryUsesTheSameId() {
        assertEquals("2026-10-13", DashboardSalesSnapshot.dailyDocumentId("2026-10-13"))
        val first = DashboardSalesSnapshot.composeDaily("2026-10-13", "2026-10-13", emptyList(), emptyList(), emptyList(), zone)
        val retry = DashboardSalesSnapshot.composeDaily("2026-10-13", "2026-10-13", emptyList(), emptyList(), emptyList(), zone)
        assertEquals(first, retry)
        assertEquals("2026-10-13", first.toMap(1L)["dateKey"])
    }

    @Test fun invalidDateKeyIsRejected() {
        val failed = runCatching { DashboardSalesSnapshot.dailyDocumentId("../bills") }.isFailure
        assertTrue(failed)
    }

    @Test fun lastSevenDateKeysStartAtTodayAndCrossMonths() {
        val keys = DashboardSalesSnapshot.lastDateKeys("2026-10-03")
        assertEquals(7, keys.size)
        assertEquals("2026-10-03", keys.first())
        assertEquals("2026-09-27", keys.last())
    }

    @Test fun fingerprintIgnoresUpdatedAtButNotBusinessFields() {
        val a = DashboardSalesSnapshot.composeDaily("2026-10-13", "2026-10-13", listOf(bill("a", "s1", 10_000L, at(2026, 10, 13, 10, 0))), emptyList(), emptyList(), zone)
        val sameLater = a.copy()
        val changed = a.copy(revenue = 20_000L)

        assertEquals(DashboardSalesSnapshot.fingerprint(a), DashboardSalesSnapshot.fingerprint(sameLater))
        assertNotEquals(DashboardSalesSnapshot.fingerprint(a), DashboardSalesSnapshot.fingerprint(changed))
        assertNotEquals(a.toMap(1L)["updatedAt"], a.toMap(2L)["updatedAt"])
    }
}
