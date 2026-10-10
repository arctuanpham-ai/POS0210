package vn.ecohome.pos0210

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import vn.ecohome.pos0210.data.*
import vn.ecohome.pos0210.report.SalesReport

@RunWith(AndroidJUnit4::class)
class SalesIntegrityRoomTest {
    private lateinit var db:PosDatabase
    private lateinit var dao:PosDao
    private lateinit var repo:PosRepository
    @Before fun setup()= runBlocking {
        db=Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(),PosDatabase::class.java).build()
        dao=db.dao();repo=PosRepository(db)
        dao.saveCategory(MenuCategoryEntity("coffee","Cà phê"))
        dao.saveCategory(MenuCategoryEntity("food","Đồ ăn"))
        dao.saveMenuItem(MenuItemEntity("c","coffee","Cà phê kem muối",35000,productCode="CF-001"))
        dao.saveMenuItem(MenuItemEntity("f","food","Bún gà",40000,productCode="FO-001"))
    }
    @After fun close(){db.close()}
    private suspend fun batch(s:TableSessionEntity,cart:Map<String,Int>):OrderBatchEntity {
        val b=repo.createBatch(s.id,1,"e",repo.prepareCart(cart,emptyMap()))
        dao.transitionBatch(b.id,"DRAFT","WAITING",1)
        dao.markDelivered(b.id,2,"e")
        return b
    }
    private suspend fun pay(s:TableSessionEntity,method:String="TRANSFER",discount:Long=0):BillEntity {
        val total=dao.sessionTotalSnapshot(s.id)
        return repo.completePayment(s,PricingPreview(total,0,discount,total-discount,emptyList(),null),method,"e","bill-${s.id}").bill
    }
    @Test fun manyTablesBatchesAndCashTransferReconcile()=runBlocking {
        repeat(4){n->val s=repo.openSession("t$n","e");batch(s,mapOf("c" to 2,"f" to 1));batch(s,mapOf("c" to 3));pay(s,if(n%2==0)"CASH" else "TRANSFER")}
        val lines=dao.paidItemSales().first()
        assertEquals(20,lines.filter{it.menuItemId=="c"}.sumOf{it.qty})
        assertEquals(860000L,dao.allPaidBillsSnapshot().sumOf{it.total})
        assertTrue(SalesReport.reconcile(dao.allPaidBillsSnapshot(),lines,dao.reportAdjustmentsSnapshot(),dao.reportPaymentsSnapshot(),dao.cloudSessionsSnapshot()).all{it.issues.isEmpty()})
    }
    @Test fun realDiscountPaymentPersistsAndReconciles()=runBlocking {
        val s=repo.openSession("t","e");batch(s,mapOf("c" to 2));val b=pay(s,discount=20000)
        assertEquals(50000L,b.total)
        assertTrue(SalesReport.reconcile(listOf(b),dao.paidItemSales().first(),dao.reportAdjustmentsSnapshot(),dao.reportPaymentsSnapshot(),dao.cloudSessionsSnapshot()).single().issues.isEmpty())
    }
    @Test fun comboCoffeeHasHistoricalCompositionAndSingleRevenue()=runBlocking {
        dao.saveCombo(ComboEntity("cb","Bữa sáng",60000))
        listOf(ComboItemEntity("part","cb","c",1),ComboItemEntity("part2","cb","f",1)).forEach{dao.saveComboItem(it)}
        val s=repo.openSession("t","e");batch(s,mapOf("combo:cb" to 2));pay(s)
        val r=SalesReport.aggregate(dao.paidItemSales().first())
        assertEquals(2,r.single{it.menuItemId=="c"}.qty)
        assertEquals(120000L,r.sumOf{it.gross})
    }
    @Test fun renamedMovedHiddenMenuDoesNotRewriteHistory()=runBlocking {
        val s=repo.openSession("t","e");batch(s,mapOf("c" to 2));pay(s)
        dao.saveMenuItem(dao.menuItemById("c")!!.copy(name="Cafe mới",categoryId="food",active=false,price=50000))
        val r=dao.paidItemSales().first().single()
        assertEquals("Cà phê kem muối",r.name);assertEquals("Cà phê",r.categoryName);assertEquals(35000L,r.unitPrice)
    }
    @Test fun catalogUpdateWhileSessionOpenKeepsExistingOrders()=runBlocking {
        val s=repo.openSession("t","e");val b=batch(s,mapOf("c" to 2))
        dao.saveMenuItem(dao.menuItemById("c")!!.copy(price=45000))
        assertEquals(70000L,dao.sessionTotalSnapshot(s.id));assertEquals(35000L,dao.batchItems(b.id).first().single().unitPriceSnapshot)
        assertEquals("OPEN",dao.sessionSnapshotById(s.id)!!.status)
    }
    @Test fun changedCatalogBetweenPreparationAndCommitRollsBackWholeBatch()=runBlocking {
        val s=repo.openSession("t","e");val cart=repo.prepareCart(mapOf("c" to 1,"f" to 1),emptyMap())
        dao.saveMenuItem(dao.menuItemById("c")!!.copy(active=false))
        assertTrue(runCatching{repo.createBatch(s.id,1,"e",cart)}.isFailure)
        assertTrue(dao.batches(s.id).first().isEmpty());assertEquals(0L,dao.sessionTotalSnapshot(s.id))
    }
    @Test fun cancelDraftAndWaitingExcludedWithoutDeletingDetails()=runBlocking {
        val s=repo.openSession("t","e")
        val d=repo.createBatch(s.id,1,"e",repo.prepareCart(mapOf("c" to 5),emptyMap()))
        assertEquals(1,dao.cancelBatch(d.id))
        val w=repo.createBatch(s.id,2,"e",repo.prepareCart(mapOf("c" to 4),emptyMap()))
        dao.transitionBatch(w.id,"DRAFT","WAITING",1);assertEquals(1,dao.cancelBatch(w.id))
        batch(s,mapOf("c" to 2));pay(s)
        assertEquals(2,dao.paidItemSales().first().sumOf{it.qty});assertEquals(5,dao.batchItems(d.id).first().single().qty)
    }
    @Test fun paidSessionCannotCancelOrAppendOrders()=runBlocking {
        val s=repo.openSession("t","e");val b=batch(s,mapOf("c" to 2));pay(s)
        assertEquals(0,dao.cancelBatch(b.id))
        assertTrue(runCatching{repo.createBatch(s.id,2,"e",repo.prepareCart(mapOf("c" to 1),emptyMap()))}.isFailure)
        assertEquals(70000L,dao.sessionTotalSnapshot(s.id))
    }
    @Test fun repeatedPaymentDoesNotCreateDuplicateBillOrPayment()=runBlocking {
        val s=repo.openSession("t","e");batch(s,mapOf("c" to 2));pay(s)
        assertTrue(runCatching{pay(s,"CASH")}.isFailure)
        assertEquals(1,dao.allPaidBillsSnapshot().size);assertEquals(1,dao.reportPaymentsSnapshot().size)
    }
    @Test fun testAndLiveSameMenuNeverMix()=runBlocking {
        val test=repo.openSession("test","e","TEST");batch(test,mapOf("c" to 40));pay(test)
        val live=repo.openSession("live","e");batch(live,mapOf("c" to 2));pay(live)
        assertEquals(2,dao.paidItemSales().first().sumOf{it.qty});assertEquals(70000L,dao.allPaidBillsSnapshot().sumOf{it.total})
    }
    @Test fun corruptedBatchLinkIsVisibleAsOrphanAndMismatch()=runBlocking {
        val s=repo.openSession("t","e");val b=batch(s,mapOf("c" to 2));val bill=pay(s)
        db.openHelper.writableDatabase.execSQL("UPDATE OrderItemEntity SET batchId='missing' WHERE batchId=?",arrayOf(b.id))
        assertEquals(1,dao.reportOrphanLineCount())
        val r=SalesReport.reconcile(listOf(bill),dao.paidItemSales().first(),emptyList(),dao.reportPaymentsSnapshot(),dao.cloudSessionsSnapshot()).single()
        assertEquals(-70000L,r.detailDelta);assertEquals(70000L,bill.total)
    }
    @Test fun signedAdjustmentInSecondBatchReconciles()=runBlocking {
        val s=repo.openSession("t","e");val b=batch(s,mapOf("c" to 3));val original=dao.batchItems(b.id).first().single()
        val correction=repo.createBatch(s.id,2,"e",listOf(original.copy(id="",batchId="",qty=-1,adjustmentOfItemId=original.id)))
        dao.transitionBatch(correction.id,"DRAFT","WAITING",1);dao.markDelivered(correction.id,2,"e");pay(s)
        assertEquals(2,dao.paidItemSales().first().sumOf{it.qty});assertEquals(70000L,dao.allPaidBillsSnapshot().single().total)
    }
}
