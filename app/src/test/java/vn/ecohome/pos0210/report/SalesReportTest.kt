package vn.ecohome.pos0210.report

import org.junit.Assert.*
import org.junit.Test
import vn.ecohome.pos0210.data.*
import java.time.ZoneId
import java.time.ZonedDateTime

class SalesReportTest {
    private fun bill(id:String="b",session:String="s",subtotal:Long=70000,total:Long=subtotal)=
        BillEntity(id,session,id,0,1000,subtotal,total,"PAID")
    private fun line(name:String="Cà phê",qty:Int=2,id:String="coffee",group:String?="Cà phê")=
        ItemSaleRow(name,qty,"s",id,id,35000,"coffee-group",group,null,null,null,null)
    private fun payment(amount:Long=70000,scope:String="LIVE")=PaymentEntity("p","b","TRANSFER",amount,"e",1000,dataScope=scope)

    @Test fun stableIdMergesNameVariantsWithoutTopLimit() {
        val rows=listOf(line(),line("Cafe",1))+ (1..10).map{line("Món $it",1,"item$it")}
        val result=SalesReport.aggregate(rows)
        assertEquals(11,result.size)
        assertEquals(3,result.single{it.menuItemId=="coffee"}.qty)
        assertEquals(105000L,result.single{it.menuItemId=="coffee"}.gross)
        assertTrue(result.single{it.menuItemId=="coffee"}.names.containsAll(listOf("Cà phê","Cafe")))
    }
    @Test fun historicalCategoryChangesRemainSeparate() {
        val rows=listOf(line(),line(group="Đồ uống").copy(categoryId="other"))
        assertEquals(2,SalesReport.aggregate(rows).size)
    }
    @Test fun oldRowsAreUnknownAndNeverUseCurrentMenu() {
        assertEquals("Chưa có nhóm lịch sử",SalesReport.aggregate(listOf(line(group=null).copy(categoryId=null))).single().categoryName)
    }
    @Test fun signedCorrectionsAreCounted() {
        assertEquals(35000L,SalesReport.aggregate(listOf(line(),line(qty=-1))).single().gross)
    }
    @Test fun giftsKeepSeparateQuantityAndGrossValue() {
        val gift=line("🎁 Cà phê",1).copy(buyGetPromotionId="promo")
        assertEquals(setOf("NORMAL","GIFT"),SalesReport.aggregate(listOf(line(),gift)).map{it.kind}.toSet())
    }
    @Test fun comboComponentsCountCoffeeWithoutDuplicatingSalesValue() {
        val combo=line("COMBO · Sáng",2,"combo:c1","Combo").copy(unitPrice=60000,
            comboPartsJson="""[{"id":"coffee","name":"Cà phê","qty":1,"categoryId":"coffee-group","categoryName":"Cà phê"}]""")
        val result=SalesReport.aggregate(listOf(combo))
        assertEquals(120000L,result.sumOf{it.gross})
        assertEquals(2,result.single{it.kind=="COMPONENT"}.qty)
        assertEquals(0L,result.single{it.kind=="COMPONENT"}.gross)
    }
    @Test fun normalBillReconcilesAllThreeLevels() {
        val r=SalesReport.reconcile(listOf(bill()),listOf(line()),emptyList(),listOf(payment()),listOf(TableSessionEntity("s","t",0,"e",status="CLOSED")))
        assertTrue(r.single().issues.isEmpty())
    }
    @Test fun missingDetailsWarnWithoutChangingBillOrPayment() {
        val b=bill();val p=payment()
        val r=SalesReport.reconcile(listOf(b),emptyList(),emptyList(),listOf(p),emptyList()).single()
        assertEquals(-70000L,r.detailDelta)
        assertTrue(r.issues.isNotEmpty());assertEquals(70000L,b.total);assertEquals(70000L,p.amount)
    }
    @Test fun recordedDiscountAndSurchargeReconcile() {
        val a=listOf(BillAdjustmentEntity("a","b",null,"Giảm","DISCOUNT",0,20000,"",0,null),BillAdjustmentEntity("a2","b",null,"Phụ thu","SURCHARGE",0,5000,"",0,null))
        val r=SalesReport.reconcile(listOf(bill(total=55000)),listOf(line()),a,listOf(payment(55000)),listOf(TableSessionEntity("s","t",0,"e",status="CLOSED"))).single()
        assertTrue(r.issues.isEmpty())
    }
    @Test fun unrecordedHistoricalDiscountIsFlagged() {
        val r=SalesReport.reconcile(listOf(bill(total=50000)),listOf(line()),emptyList(),listOf(payment(50000)),emptyList()).single()
        assertEquals(20000L,r.adjustmentDelta)
    }
    @Test fun duplicateBillsFlaggedButDetailsNotMultiplied() {
        val r=SalesReport.reconcile(listOf(bill(),bill("b2")),listOf(line()),emptyList(),listOf(payment()),emptyList())
        assertTrue(r.all{it.issues.any{m->m.contains("trùng")}})
    }
    @Test fun testPaymentNeverSatisfiesLiveBill() {
        val r=SalesReport.reconcile(listOf(bill()),listOf(line()),emptyList(),listOf(payment(scope="TEST")),emptyList()).single()
        assertEquals(-70000L,r.paymentDelta)
    }
    @Test fun filterUsesClosedTimeAndVietnamMidnightExclusiveEnd() {
        val z=ZoneId.of("Asia/Ho_Chi_Minh")
        val start=ZonedDateTime.of(2026,10,10,0,0,0,0,z).toInstant().toEpochMilli()
        val end=ZonedDateTime.of(2026,10,11,0,0,0,0,z).toInstant().toEpochMilli()
        val bs=listOf(bill("before").copy(closedAt=start-1),bill("start").copy(closedAt=start),bill("last").copy(closedAt=end-1),bill("next").copy(closedAt=end),bill("test").copy(closedAt=start,dataScope="TEST"))
        assertEquals(listOf("start","last"),SalesReport.period(bs,start,end).map{it.id})
    }
}
