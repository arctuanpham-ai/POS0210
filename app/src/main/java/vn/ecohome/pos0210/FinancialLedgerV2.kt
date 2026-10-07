package vn.ecohome.pos0210

data class FinancialPeriodInput(val revenue:Long,val operatingExpenses:Long,val additionalInvestment:Long=0,val depreciationReference:Long=0)
data class FinancialPeriodResult(val revenue:Long,val operatingExpenses:Long,val operatingResultBeforeAdditionalInvestment:Long,val additionalInvestment:Long,val netCashResult:Long,val depreciationReference:Long)
fun calculateFinancialPeriod(i:FinancialPeriodInput)=FinancialPeriodResult(i.revenue,i.operatingExpenses,i.revenue-i.operatingExpenses,i.additionalInvestment,i.revenue-i.operatingExpenses-i.additionalInvestment,i.depreciationReference)

data class CashPaybackResult(val initialInvestment:Long,val cumulativeNetCash:Long,val paybackBasisPoints:Int,val remaining:Long)
fun calculateCashPayback(initialInvestment:Long,cumulativeNetCash:Long):CashPaybackResult{
 require(initialInvestment>=0)
 val recovered=cumulativeNetCash.coerceAtLeast(0)
 val bp=if(initialInvestment==0L)10000 else ((recovered.coerceAtMost(initialInvestment)*10000L)/initialInvestment).toInt()
 return CashPaybackResult(initialInvestment,cumulativeNetCash,bp,(initialInvestment-recovered).coerceAtLeast(0))
}

data class PayerAdvance(val payer:String,val amount:Long)
data class PayerReimbursement(val payer:String,val amount:Long)
data class PayerLedgerLine(val payer:String,val advanced:Long,val reimbursed:Long,val outstanding:Long)
fun calculatePayerLedger(advances:List<PayerAdvance>,reimbursements:List<PayerReimbursement>):List<PayerLedgerLine>{
 val names=(advances.map{it.payer.trim()}.filter{it.isNotBlank()}+reimbursements.map{it.payer.trim()}.filter{it.isNotBlank()}).distinct()
 return names.map{name->
  val a=advances.filter{it.payer.trim()==name}.sumOf{it.amount};val r=reimbursements.filter{it.payer.trim()==name}.sumOf{it.amount}
  PayerLedgerLine(name,a,r,(a-r).coerceAtLeast(0))
 }.sortedByDescending{it.outstanding}
}

data class CostObservation(val quantity:Double,val unitPrice:Long){val total:Double get()=quantity*unitPrice}
data class CostVariance(val quantityChangePct:Double,val unitPriceChangePct:Double,val totalChangePct:Double)
private fun pct(old:Double,new:Double)=if(old==0.0)0.0 else (new-old)*100.0/old
fun calculateCostVariance(previous:CostObservation,current:CostObservation)=CostVariance(pct(previous.quantity,current.quantity),pct(previous.unitPrice.toDouble(),current.unitPrice.toDouble()),pct(previous.total,current.total))

fun allocatePositiveCash(result:Long,partners:List<ProfitShareInput>):List<PartnerProfit>{
 if(result<=0||partners.isEmpty()||partners.sumOf{it.shareBasisPoints}!=10000)return emptyList()
 var allocated=0L
 return partners.mapIndexed{i,p->val amount=if(i==partners.lastIndex)result-allocated else result*p.shareBasisPoints/10000L;allocated+=amount;PartnerProfit(p.id,p.name,p.shareBasisPoints,amount)}
}
