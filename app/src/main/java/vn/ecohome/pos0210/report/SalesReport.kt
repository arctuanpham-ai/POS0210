package vn.ecohome.pos0210.report

import org.json.JSONArray
import vn.ecohome.pos0210.data.*

/** Read-only calculations. No database writes or inferred historical menu categories. */
object SalesReport {
    data class ItemSummary(val menuItemId:String?, val names:List<String>, val categoryId:String?,
        val categoryName:String, val kind:String, val qty:Int, val gross:Long,
        val minPrice:Long, val maxPrice:Long)
    data class Reconciliation(val bill:BillEntity, val details:Long, val discount:Long, val surcharge:Long,
        val paid:Long, val detailDelta:Long, val adjustmentDelta:Long, val paymentDelta:Long,
        val issues:List<String>)

    fun period(bills:List<BillEntity>,from:Long?,until:Long?):List<BillEntity> = bills.filter {
        it.status=="PAID" && it.dataScope=="LIVE" &&
            ((from==null&&until==null) || (it.closedAt!=null &&
            (from==null || it.closedAt>=from) && (until==null || it.closedAt<until)))
    }
    fun kind(row:ItemSaleRow):String = when {
        row.menuItemId?.startsWith("combo:")==true -> "COMBO"
        row.loyaltyRewardId!=null || row.buyGetPromotionId!=null -> "GIFT"
        row.discounted -> "DISCOUNTED"
        else -> "NORMAL"
    }
    private fun validPart(p:org.json.JSONObject):Boolean = p.optString("id").isNotBlank() &&
        p.optString("name").isNotBlank() && p.optInt("qty",0)>0 &&
        p.optString("categoryId").isNotBlank() && p.optString("categoryName").isNotBlank()
    fun compositionIssue(r:ItemSaleRow):String? {
        if(r.menuItemId?.startsWith("combo:")!=true)return null
        if(r.comboPartsJson==null)return "Thiếu snapshot thành phần combo lịch sử"
        return runCatching {
            val parts=JSONArray(r.comboPartsJson)
            if(parts.length()==0 || (0 until parts.length()).any{!validPart(parts.getJSONObject(it))})
                "Snapshot thành phần combo không hợp lệ" else null
        }.getOrElse { "Snapshot thành phần combo không đọc được" }
    }
    fun aggregate(rows:List<ItemSaleRow>):List<ItemSummary> {
        val components=rows.flatMap { r ->
            val parts=runCatching{JSONArray(r.comboPartsJson ?: "[]")}.getOrNull()
            if(parts==null)emptyList() else (0 until parts.length()).mapNotNull { n ->
                runCatching {
                    val p=parts.getJSONObject(n)
                    if(!validPart(p))null else
                    r.copy(name=p.getString("name"),menuItemId=p.getString("id"),qty=r.qty*p.getInt("qty"),
                        unitPrice=0,categoryId=p.getString("categoryId"),categoryName=p.getString("categoryName"),comboPartsJson=null)
                }.getOrNull()
            }
        }
        return summarize(rows,false)+summarize(components,true)
    }
    private fun summarize(rows:List<ItemSaleRow>,component:Boolean):List<ItemSummary> = rows.groupBy {
        listOf(it.menuItemId ?: "legacy:${it.name}", it.categoryId, it.categoryName,
            if(component) "COMPONENT" else kind(it))
    }.values.map { rs ->
        val r=rs.first()
        ItemSummary(r.menuItemId,rs.map{it.name}.distinct().sorted(),r.categoryId,
            r.categoryName ?: if(r.menuItemId?.startsWith("combo:")==true) "Combo" else "Chưa có nhóm lịch sử",
            if(component) "COMPONENT" else kind(r),rs.sumOf{it.qty},rs.sumOf{it.qty.toLong()*it.unitPrice},
            rs.minOf{it.unitPrice},rs.maxOf{it.unitPrice})
    }.sortedWith(compareByDescending<ItemSummary>{it.qty}.thenBy{it.names.first()})

    fun reconcile(bills:List<BillEntity>,rows:List<ItemSaleRow>,adjustments:List<BillAdjustmentEntity>,
        payments:List<PaymentEntity>,sessions:List<TableSessionEntity>):List<Reconciliation> {
        val live=bills.filter{it.status=="PAID"&&it.dataScope=="LIVE"}
        val duplicateSessions=live.groupingBy{it.sessionId}.eachCount()
        val detailsBySession=rows.groupBy{it.sessionId}
        val adjustmentsByBill=adjustments.groupBy{it.billId}
        val paymentsByBill=payments.groupBy{it.billId}
        val sessionsById=sessions.associateBy{it.id}
        return live.map { b ->
            val items=detailsBySession[b.sessionId].orEmpty()
            val detail=items.sumOf{it.qty.toLong()*it.unitPrice}
            val a=adjustmentsByBill[b.id].orEmpty()
            val discount=a.filter{it.kind=="DISCOUNT"}.sumOf{it.amount}
            val surcharge=a.filter{it.kind=="SURCHARGE"}.sumOf{it.amount}
            val ps=paymentsByBill[b.id].orEmpty()
            val valid=ps.filter{it.dataScope=="LIVE"&&it.method in listOf("CASH","TRANSFER")&&it.amount>=0}
            val paid=valid.sumOf{it.amount}
            val d=detail-b.subtotal
            val aDelta=(b.subtotal-discount+surcharge).coerceAtLeast(0)-b.total
            val pDelta=paid-b.total
            val problems=buildList {
                if(b.closedAt==null)add("Thiếu ngày thanh toán")
                items.mapNotNull{compositionIssue(it)}.distinct().forEach{add(it)}
                if(d!=0L)add("Chi tiết món lệch subtotal")
                if(items.isEmpty())add("Thiếu chi tiết món hợp lệ")
                if(aDelta!=0L)add("Giảm giá/phụ thu chưa đối soát")
                if(pDelta!=0L || valid.size!=1)add("Thanh toán thiếu, trùng hoặc sai số tiền")
                if(valid.size!=ps.size)add("Thanh toán sai phạm vi/phương thức")
                if((duplicateSessions[b.sessionId] ?: 0)>1)add("Bill PAID trùng phiên")
                val session=sessionsById[b.sessionId]
                if(session==null)add("Thiếu liên kết phiên bán")
                else if(session.dataScope!="LIVE"||session.status!="CLOSED")add("Phiên sai phạm vi/trạng thái")
                if(a.any{it.kind !in listOf("DISCOUNT","SURCHARGE")||it.amount<0})add("Điều chỉnh chưa được hỗ trợ")
            }
            Reconciliation(b,detail,discount,surcharge,paid,d,aDelta,pDelta,problems)
        }
    }
}
