package vn.ecohome.pos0210

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import vn.ecohome.pos0210.data.*

/** Build 285: isolated Room integration checks. Never opens the production database. */
@RunWith(AndroidJUnit4::class)
class CoffeeSalesRoomTest {
    private lateinit var db: PosDatabase
    private lateinit var dao: PosDao

    @Before fun setup() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(), PosDatabase::class.java
        ).allowMainThreadQueries().build()
        dao = db.dao()
    }

    @After fun cleanup() { db.close() }

    private suspend fun paidSession(
        id: String, scope: String = "LIVE", status: String = "DELIVERED",
        coffeeQty: Int = 2, foodQty: Int = 1, discount: Long = 0
    ) {
        dao.insertSession(TableSessionEntity(id, "table_$id", 1000L, "staff", status = "CLOSED", dataScope = scope))
        dao.insertBatch(OrderBatchEntity("batch_$id", id, 1, "staff", 1000L, status = status))
        val lines = buildList {
            if (coffeeQty > 0) add(OrderItemEntity("coffee_$id", "batch_$id", "coffee_id", "Cà phê kem muối", 35000L, coffeeQty))
            if (foodQty > 0) add(OrderItemEntity("food_$id", "batch_$id", "food_id", "Bún gà", 40000L, foodQty))
        }
        dao.insertItems(lines)
        val subtotal = coffeeQty * 35000L + foodQty * 40000L
        dao.insertBill(BillEntity("bill_$id", id, "0210-$id", 1000L, 2000L, subtotal, subtotal - discount, "PAID", dataScope = scope))
        dao.insertPayment(PaymentEntity("pay_$id", "bill_$id", "TRANSFER", subtotal - discount, "staff", 2000L, dataScope = scope))
    }

    @Test fun coffeeAndFoodAreCountedAndReconciled() = runBlocking {
        paidSession("one")
        val sales = dao.paidItemSales().first()
        assertEquals(2, sales.single { it.name == "Cà phê kem muối" }.qty)
        assertEquals(1, sales.single { it.name == "Bún gà" }.qty)
        assertEquals(110000L, dao.sessionTotalSnapshot("one"))
        assertEquals(110000L, dao.allPaidBillsSnapshot().sumOf { it.total })
    }

    @Test fun multipleBatchesSameSessionDoNotDropCoffee() = runBlocking {
        paidSession("two", coffeeQty = 1, foodQty = 0)
        dao.insertBatch(OrderBatchEntity("extra_two", "two", 2, "staff", 1001L, status = "DELIVERED"))
        dao.insertItems(listOf(OrderItemEntity("extra_coffee", "extra_two", "coffee_id", "Cà phê kem muối", 35000L, 1)))
        val rows = dao.paidItemSales().first()
        assertEquals(2, rows.filter { it.name == "Cà phê kem muối" }.sumOf { it.qty })
        // This deliberately detects a subtotal mismatch after adding a batch post-payment.
        assertNotEquals(dao.allPaidBillsSnapshot().single().subtotal, dao.sessionTotalSnapshot("two"))
    }

    @Test fun cancelledBatchExcludedFromSalesAndSubtotal() = runBlocking {
        paidSession("cancel", status = "CANCELLED")
        assertTrue(dao.paidItemSales().first().isEmpty())
        assertEquals(0L, dao.sessionTotalSnapshot("cancel"))
        assertEquals(110000L, dao.allPaidBillsSnapshot().single().subtotal)
    }

    @Test fun testScopeExcludedFromLiveReports() = runBlocking {
        paidSession("test", scope = "TEST")
        assertTrue(dao.paidItemSales().first().isEmpty())
        assertTrue(dao.allPaidBillsSnapshot().isEmpty())
    }

    @Test fun discountExplainsDifferenceBetweenSubtotalAndPaidRevenue() = runBlocking {
        paidSession("discount", discount = 20000L)
        assertEquals(110000L, dao.sessionTotalSnapshot("discount"))
        assertEquals(90000L, dao.allPaidBillsSnapshot().single().total)
    }

    @Test fun historicalNameSnapshotsSplitByName() = runBlocking {
        paidSession("name")
        dao.insertBatch(OrderBatchEntity("extra_name", "name", 2, "staff", 1001L, status = "DELIVERED"))
        dao.insertItems(listOf(OrderItemEntity("renamed", "extra_name", "coffee_id", "Cafe kem muối", 35000L, 1)))
        val rows = dao.paidItemSales().first()
        assertEquals(2, rows.map { it.name }.distinct().count { it.contains("kem muối") })
        // Existing report groups by name; the stable menuItemId is absent from paidItemSales.
    }
    @Test fun paidBillWithoutOrderRowsIsDetectedByReconciliation() = runBlocking {
        dao.insertSession(TableSessionEntity("orphan", "table_orphan", 1000L, "staff", status = "CLOSED"))
        dao.insertBill(BillEntity("bill_orphan", "orphan", "0210-orphan", 1000L, 2000L, 70000L, 70000L, "PAID"))
        dao.insertPayment(PaymentEntity("pay_orphan", "bill_orphan", "TRANSFER", 70000L, "staff", 2000L))
        assertEquals(70000L, dao.allPaidBillsSnapshot().single().total)
        assertTrue(dao.paidItemSales().first().isEmpty())
        assertEquals(0L, dao.sessionTotalSnapshot("orphan"))
    }

    @Test fun twoPaidBillsForOneSessionMustNotDoubleCountItems() = runBlocking {
        paidSession("duplicate", coffeeQty = 2, foodQty = 0)
        dao.insertBill(BillEntity("bill_second", "duplicate", "0210-second", 1000L, 2001L, 70000L, 70000L, "PAID"))
        dao.insertPayment(PaymentEntity("pay_second", "bill_second", "TRANSFER", 70000L, "staff", 2001L))
        assertEquals(2, dao.paidItemSales().first().sumOf { it.qty })
        assertEquals(140000L, dao.allPaidBillsSnapshot().sumOf { it.total })
        assertEquals(70000L, dao.sessionTotalSnapshot("duplicate"))
    }

    @Test fun closedSessionRejectsNewBatch() = runBlocking {
        paidSession("closed")
        val result = runCatching { PosRepository(db).createBatch("closed", 2, "staff", listOf(
            OrderItemEntity("", "", "coffee_id", "Cà phê", 35000L, 1)
        )) }
        assertTrue("Closed paid session must reject new order", result.isFailure)
        assertEquals(1, dao.batches("closed").first().size)
    }

    @Test fun giftDiscountHasPersistedAdjustment() = runBlocking {
        dao.insertSession(TableSessionEntity("gift", "t", 1000L, "staff"))
        dao.insertBatch(OrderBatchEntity("bg", "gift", 1, "staff", 1000L, status="DELIVERED"))
        dao.insertItems(listOf(OrderItemEntity("ig", "bg", "coffee", "🎁 Cà phê", 35000L, 1, buyGetPromotionId="promo")))
        val result = PosRepository(db).completePayment(dao.sessionSnapshotById("gift")!!,
            PricingPreview(35000L, 0L, 35000L, 0L, emptyList(), null, buyGetDiscount=35000L, buyGetLabel="Mua X tặng Y"),
            "CASH", "staff", "gift-bill")
        assertEquals(35000L, dao.adjustmentsByBillId(result.bill.id).filter { it.kind=="DISCOUNT" }.sumOf { it.amount })
    }

    @Test fun liveBillWithTestSessionMustNotLeakItems() = runBlocking {
        paidSession("cross", scope="TEST")
        dao.insertBill(BillEntity("cross_live", "cross", "cross-live", 1000L, 2000L, 110000L, 110000L, "PAID", dataScope="LIVE"))
        assertTrue("TEST order cannot become LIVE sales through bad bill scope", dao.paidItemSales().first().isEmpty())
    }

}
