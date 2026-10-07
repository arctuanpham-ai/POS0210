package vn.ecohome.pos0210.data

import android.content.Context
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

object AiBusinessExport {
    private fun day(v:Long?)=v?.let{SimpleDateFormat("yyyy-MM-dd HH:mm:ss",Locale.US).format(Date(it))}.orEmpty()
    private fun depreciationToDate(a:AssetEntity,now:Long):Long {
        if(a.status=="DELETED"||a.usefulLifeMonths<=0) return 0
        val depreciable=(a.totalCost-a.residualValue).coerceAtLeast(0)
        val elapsed=((now-a.purchaseDate).coerceAtLeast(0)/(30.4375*24*60*60*1000)).toInt().coerceAtMost(a.usefulLifeMonths)
        return depreciable*elapsed/a.usefulLifeMonths
    }
    suspend fun create(context:Context,dao:PosDao):File {
        val now=System.currentTimeMillis()
        val bills=dao.allPaidBillsSnapshot()
        val payments=dao.allPaymentsSnapshot()
        val sessions=dao.allSessionsSnapshot().associateBy{it.id}
        val batches=dao.allOrderBatchesSnapshot()
        val items=dao.allOrderItemsSnapshot()
        val purchases=dao.allPurchasesSnapshot().filter{it.status=="ACTIVE"}
        val purchaseItems=purchases.flatMap{p->dao.purchaseItemsSnapshot(p.id)}
        val accounting=dao.allMonthlyAccountingSnapshot()
        val assets=dao.allAssetsSnapshot().filter{it.status!="DELETED"}
        val valuations=dao.allAssetValuationsSnapshot()
        val movements=dao.allFinancialMovementsSnapshot()
        val openingCash=dao.allOpeningCashAdjustmentsSnapshot()
        val categories=dao.allPurchaseCategoriesSnapshot().associateBy{it.id}
        val batchById=batches.associateBy{it.id}
        val paidSessionIds=bills.map{it.sessionId}.toSet()
        val sold=items.filter{batchById[it.batchId]?.sessionId in paidSessionIds && batchById[it.batchId]?.status!="CANCELLED"}
        val revenue=bills.sumOf{it.total}; val avg=if(bills.isEmpty())0 else revenue/bills.size
        val itemSummary=sold.groupBy{it.itemNameSnapshot}.map{(name,rows)->
            JSONObject().put("name",name).put("qty",rows.sumOf{it.qty}).put("revenue",rows.sumOf{it.qty*it.unitPriceSnapshot})
                .put("avg_unit_price",if(rows.sumOf{it.qty}==0)0 else rows.sumOf{it.qty*it.unitPriceSnapshot}/rows.sumOf{it.qty})
        }.sortedByDescending{it.getLong("revenue")}
        val purchaseByCategory=purchaseItems.groupBy{categories[it.categoryId]?.name?:it.categoryId}.map{(name,rows)->
            JSONObject().put("category",name).put("amount",rows.sumOf{it.amount})
        }.sortedByDescending{it.getLong("amount")}
        val depreciation=assets.sumOf{depreciationToDate(it,now)}
        val remainingAssetValue=assets.sumOf{(it.totalCost-depreciationToDate(it,now)).coerceAtLeast(it.residualValue)}
        val summary=JSONObject()
            .put("generated_at",day(now)).put("paid_bill_count",bills.size).put("revenue",revenue).put("average_bill_value",avg)
            .put("cash_revenue",payments.filter{it.billId in bills.map{b->b.id}.toSet()&&it.method=="CASH"}.sumOf{it.amount})
            .put("transfer_revenue",payments.filter{it.billId in bills.map{b->b.id}.toSet()&&it.method=="TRANSFER"}.sumOf{it.amount})
            .put("purchase_total",purchases.sumOf{it.total}).put("asset_original_cost",assets.sumOf{it.totalCost})
            .put("estimated_accumulated_depreciation",depreciation).put("estimated_remaining_asset_value",remainingAssetValue)
            .put("item_sales",JSONArray(itemSummary)).put("purchase_by_category",JSONArray(purchaseByCategory))
        val root=JSONObject().put("format","POS0210_AI_BUSINESS_EXPORT_V1")
            .put("instructions_for_ai","Analyze business performance, sales mix, pricing, average bill, hourly/day trends, purchasing, operating costs, assets/depreciation, cash flow, profitability and actionable strategy. Treat transaction snapshots as historical truth. Amounts are VND.")
            .put("summary_all_time",summary)
        fun arr(rows:Iterable<JSONObject>)=JSONArray(rows.toList())
        root.put("bills",arr(bills.map{b->JSONObject().put("bill_no",b.billNo).put("session_id",b.sessionId).put("opened_at",day(b.openedAt)).put("closed_at",day(b.closedAt)).put("subtotal",b.subtotal).put("total",b.total)}))
        root.put("payments",arr(payments.filter{p->bills.any{it.id==p.billId}}.map{p->JSONObject().put("bill_id",p.billId).put("method",p.method).put("amount",p.amount).put("paid_at",day(p.paidAt))}))
        root.put("sold_items",arr(sold.map{i->JSONObject().put("session_id",batchById[i.batchId]?.sessionId).put("menu_item_id",i.menuItemId).put("name",i.itemNameSnapshot).put("unit_price",i.unitPriceSnapshot).put("qty",i.qty).put("note",i.note)}))
        root.put("sessions",arr(sessions.values.filter{it.id in paidSessionIds}.map{s->JSONObject().put("id",s.id).put("table_id",s.tableId).put("opened_at",day(s.openedAt)).put("status",s.status)}))
        root.put("purchases",arr(purchases.map{p->JSONObject().put("id",p.id).put("purchased_at",day(p.purchasedAt)).put("total",p.total).put("expense_category",p.expenseCategory).put("paid_by",p.paidByName).put("note",p.note)}))
        root.put("purchase_items",arr(purchaseItems.map{i->JSONObject().put("purchase_id",i.purchaseId).put("category",categories[i.categoryId]?.name?:i.categoryId).put("name",i.name).put("qty",i.qty).put("unit",i.unit).put("unit_price",i.unitPrice).put("amount",i.amount)}))
        root.put("monthly_accounting",arr(accounting.map{a->JSONObject().put("month",a.monthKey).put("cogs",a.cogs).put("cogs_source",a.cogsSource).put("opening_cash",a.openingCash).put("closing_cash",a.closingCashSnapshot).put("operating_profit",a.operatingProfitSnapshot).put("distributable_profit",a.distributableProfitSnapshot)}))
        root.put("assets",arr(assets.map{a->JSONObject().put("name",a.name).put("purchase_date",day(a.purchaseDate)).put("total_cost",a.totalCost).put("useful_life_months",a.usefulLifeMonths).put("residual_value",a.residualValue).put("estimated_depreciation_to_date",depreciationToDate(a,now)).put("status",a.status).put("investment_class",a.investmentClass)}))
        root.put("asset_valuations",arr(valuations.map{v->JSONObject().put("asset_id",v.assetId).put("previous_value",v.previousValue).put("new_value",v.newValue).put("changed_at",day(v.changedAt)).put("note",v.note)}))
        root.put("financial_movements",arr(movements.map{m->JSONObject().put("type",m.type).put("amount",m.amount).put("occurred_at",day(m.occurredAt)).put("method",m.method).put("counterparty",m.counterpartyName).put("note",m.note)}))
        root.put("opening_cash_adjustments",arr(openingCash.map{o->JSONObject().put("month",o.monthKey).put("previous_value",o.previousValue).put("new_value",o.newValue).put("changed_at",day(o.changedAt)).put("note",o.note)}))
        val dir=File(context.cacheDir,"ai_export").apply{mkdirs()}
        return File(dir,"POS0210_AI_DATA_"+SimpleDateFormat("yyyyMMdd_HHmmss",Locale.US).format(Date(now))+".json").apply{writeText(root.toString(2),Charsets.UTF_8)}
    }
    fun uri(context:Context,file:File)=FileProvider.getUriForFile(context,context.packageName+".fileprovider",file)
}
