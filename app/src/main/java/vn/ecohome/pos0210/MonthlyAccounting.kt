package vn.ecohome.pos0210

object ExpenseCategories {
    const val UNCLASSIFIED="UNCLASSIFIED"
    const val INVENTORY_PURCHASE="INVENTORY_PURCHASE"
    const val FIXED_EXPENSE="FIXED_EXPENSE"
    const val VARIABLE_EXPENSE="VARIABLE_EXPENSE"
    const val PAYROLL="PAYROLL"
    const val ELECTRICITY="ELECTRICITY"
    const val WATER="WATER"
    const val RENT="RENT"
    const val MARKETING="MARKETING"
    const val CONSUMABLES="CONSUMABLES"
    const val MAINTENANCE="MAINTENANCE"
    const val SERVICES="SERVICES"
    const val BANK_FEES="BANK_FEES"
    const val ADDITIONAL_INVESTMENT="ADDITIONAL_INVESTMENT"
    const val CAPITAL_ASSET="CAPITAL_ASSET"
    const val SETUP_COST="SETUP_COST"
    const val OWNER_CONTRIBUTION="OWNER_CONTRIBUTION"
    const val OWNER_WITHDRAWAL="OWNER_WITHDRAWAL"
    const val PROFIT_WITHDRAWAL="PROFIT_WITHDRAWAL"
    const val WORKING_CAPITAL="WORKING_CAPITAL"
    const val INITIAL_INVESTMENT_SUNK="INITIAL_INVESTMENT_SUNK"
    const val OTHER_EXPENSE="OTHER_EXPENSE"
    val all=listOf(UNCLASSIFIED,INVENTORY_PURCHASE,PAYROLL,ELECTRICITY,WATER,RENT,MARKETING,CONSUMABLES,MAINTENANCE,SERVICES,BANK_FEES,FIXED_EXPENSE,VARIABLE_EXPENSE,OTHER_EXPENSE,ADDITIONAL_INVESTMENT,SETUP_COST,INITIAL_INVESTMENT_SUNK,CAPITAL_ASSET,WORKING_CAPITAL,OWNER_CONTRIBUTION,OWNER_WITHDRAWAL,PROFIT_WITHDRAWAL)
    fun label(value:String)=when(value){
        INVENTORY_PURCHASE->"Nguyên liệu / hàng hóa";PAYROLL->"Lương / nhân sự";ELECTRICITY->"Điện";WATER->"Nước";RENT->"Thuê mặt bằng";MARKETING->"Marketing";CONSUMABLES->"Bao bì / vật tư tiêu hao";MAINTENANCE->"Sửa chữa / bảo trì";SERVICES->"Phần mềm / dịch vụ";BANK_FEES->"Phí ngân hàng / giao dịch";ADDITIONAL_INVESTMENT->"Đầu tư bổ sung";FIXED_EXPENSE->"Chi phí cố định";VARIABLE_EXPENSE->"Chi phí biến đổi"
        CAPITAL_ASSET->"Tài sản có thể thu hồi";SETUP_COST,INITIAL_INVESTMENT_SUNK->"Đầu tư không thu hồi";OWNER_CONTRIBUTION->"Góp vốn đầu tư"
        WORKING_CAPITAL->"Vốn lưu động";OWNER_WITHDRAWAL->"Rút vốn";PROFIT_WITHDRAWAL->"Rút lợi nhuận";OTHER_EXPENSE->"Chi phí khác";else->"Chưa phân loại"
    }
}

object FinancialTransactionTypes {
    const val OPERATING_EXPENSE="OPERATING_EXPENSE"
    const val ASSET_PURCHASE="ASSET_PURCHASE"
    const val ADDITIONAL_INVESTMENT="ADDITIONAL_INVESTMENT"
    const val INITIAL_INVESTMENT="INITIAL_INVESTMENT"
    const val CAPITAL_INJECTION="CAPITAL_INJECTION"
    const val WORKING_CAPITAL="WORKING_CAPITAL"
    const val PROFIT_WITHDRAWAL="PROFIT_WITHDRAWAL"
    const val OWNER_WITHDRAWAL="OWNER_WITHDRAWAL"
    const val CAPITAL_RECOVERY="CAPITAL_RECOVERY"
    const val OTHER_ADJUSTMENT="OTHER_ADJUSTMENT"
    val all=listOf(OPERATING_EXPENSE,ADDITIONAL_INVESTMENT,INITIAL_INVESTMENT,ASSET_PURCHASE,CAPITAL_INJECTION,WORKING_CAPITAL,PROFIT_WITHDRAWAL,OWNER_WITHDRAWAL,CAPITAL_RECOVERY,OTHER_ADJUSTMENT)
    fun label(v:String)=when(v){OPERATING_EXPENSE->"Chi phí vận hành";ADDITIONAL_INVESTMENT->"Đầu tư bổ sung";INITIAL_INVESTMENT->"Đầu tư ban đầu không thu hồi";ASSET_PURCHASE->"Mua tài sản đầu tư ban đầu";CAPITAL_INJECTION->"Góp vốn đầu tư";WORKING_CAPITAL->"Bổ sung vốn lưu động";PROFIT_WITHDRAWAL->"Rút lợi nhuận";OWNER_WITHDRAWAL->"Rút vốn";CAPITAL_RECOVERY->"Ghi nhận hoàn vốn";else->"Thu/điều chỉnh khác"}
    fun usesPurchaseDocument(v:String)=v in setOf(OPERATING_EXPENSE,ADDITIONAL_INVESTMENT,INITIAL_INVESTMENT,ASSET_PURCHASE)
    fun legacyExpenseCode(v:String,operatingCode:String)=when(v){ADDITIONAL_INVESTMENT->ExpenseCategories.ADDITIONAL_INVESTMENT;INITIAL_INVESTMENT->ExpenseCategories.INITIAL_INVESTMENT_SUNK;ASSET_PURCHASE->ExpenseCategories.CAPITAL_ASSET;CAPITAL_INJECTION->ExpenseCategories.OWNER_CONTRIBUTION;WORKING_CAPITAL->ExpenseCategories.WORKING_CAPITAL;PROFIT_WITHDRAWAL->ExpenseCategories.PROFIT_WITHDRAWAL;OWNER_WITHDRAWAL->ExpenseCategories.OWNER_WITHDRAWAL;OTHER_ADJUSTMENT->ExpenseCategories.UNCLASSIFIED;else->operatingCode}
    fun movementCode(v:String)=when(v){CAPITAL_INJECTION->"CAPITAL_CONTRIBUTION";WORKING_CAPITAL->"WORKING_CAPITAL";PROFIT_WITHDRAWAL->"PROFIT_WITHDRAWAL";OWNER_WITHDRAWAL->"OWNER_WITHDRAWAL";CAPITAL_RECOVERY->"RECOVERED_CAPITAL";OTHER_ADJUSTMENT->"OTHER_CASH_ADJUSTMENT";else->null}
    fun fromLegacy(code:String)=when(code){ExpenseCategories.ADDITIONAL_INVESTMENT->ADDITIONAL_INVESTMENT;ExpenseCategories.SETUP_COST,ExpenseCategories.INITIAL_INVESTMENT_SUNK->INITIAL_INVESTMENT;ExpenseCategories.CAPITAL_ASSET->ASSET_PURCHASE;ExpenseCategories.OWNER_CONTRIBUTION->CAPITAL_INJECTION;ExpenseCategories.WORKING_CAPITAL->WORKING_CAPITAL;ExpenseCategories.PROFIT_WITHDRAWAL->PROFIT_WITHDRAWAL;ExpenseCategories.OWNER_WITHDRAWAL->OWNER_WITHDRAWAL;ExpenseCategories.UNCLASSIFIED->OTHER_ADJUSTMENT;else->OPERATING_EXPENSE}
}

data class PartnerWithdrawalPosition(val partner:PartnerProfit,val withdrawn:Long,val unwithdrawn:Long,val overdrawn:Boolean)
fun calculatePartnerWithdrawalPositions(entitlements:List<PartnerProfit>,withdrawals:Map<String,Long>)=entitlements.map{p->
    val withdrawn=withdrawals[p.id]?:0L
    PartnerWithdrawalPosition(p,withdrawn,(p.amount-withdrawn).coerceAtLeast(0),withdrawn>p.amount)
}

fun resolveOpeningCash(savedOpening:Long?,overridden:Boolean,previousClosing:Long?):Long =
    if(overridden) savedOpening?:0 else previousClosing?:savedOpening?:0

data class ProfitShareInput(val id:String,val name:String,val shareBasisPoints:Int)
data class PartnerProfit(val id:String,val name:String,val shareBasisPoints:Int,val amount:Long)
data class MonthlyAccountingInput(
    val grossRevenue:Long,val discounts:Long=0,val refunds:Long=0,val revenueAdjustments:Long=0,val cogs:Long?,
    val fixedExpense:Long=0,val variableExpense:Long=0,val otherExpense:Long=0,val setupCost:Long=0,
    val inventoryPurchases:Long=0,val capitalAssets:Long=0,val ownerContribution:Long=0,val ownerWithdrawal:Long=0,
    val unclassified:Long=0,val openingCash:Long=0,val revenueReceived:Long=0,val reserveBasisPoints:Int=1000,
    val partners:List<ProfitShareInput> = emptyList(),val depreciationExpense:Long=0,val otherCashIn:Long=0,
    val workingCapitalContribution:Long=0,val profitWithdrawal:Long=0,val investmentCashOut:Long=0
)
data class MonthlyAccountingResult(
    val netRevenue:Long,val grossProfit:Long?,val operatingProfit:Long?,val reserve:Long?,val distributableProfit:Long?,
    val closingCash:Long,val partnerProfits:List<PartnerProfit>,val shareConfigurationValid:Boolean,
    val retainedProfit:Long?=reserve,val profitWithdrawn:Long=0
)

fun calculateMonthlyAccounting(i:MonthlyAccountingInput):MonthlyAccountingResult {
    require(i.reserveBasisPoints in 0..10_000)
    require(i.partners.all{it.shareBasisPoints in 0..10_000})
    val validShares=i.partners.isNotEmpty()&&i.partners.sumOf{it.shareBasisPoints}==10_000
    val net=i.grossRevenue-i.discounts-i.refunds+i.revenueAdjustments
    val gross=i.cogs?.let{net-it}
    val operating=gross?.let{it-i.fixedExpense-i.variableExpense-i.otherExpense-i.depreciationExpense}
    val reserve=operating?.takeIf{it>0}?.let{it*i.reserveBasisPoints/10_000L}?:operating?.let{0L}
    val distributable=operating?.let{it-(reserve?:0L)}
    var allocated=0L
    val shares=if(validShares&&distributable!=null&&distributable>0) i.partners.mapIndexed{index,p->
        val amount=if(index==i.partners.lastIndex) distributable-allocated else distributable*p.shareBasisPoints/10_000L
        allocated+=amount;PartnerProfit(p.id,p.name,p.shareBasisPoints,amount)
    } else emptyList()
    val cashExpenses=i.fixedExpense+i.variableExpense+i.otherExpense+i.unclassified
    val investmentOut=if(i.investmentCashOut>0)i.investmentCashOut else i.capitalAssets+i.setupCost
    val closing=i.openingCash+i.revenueReceived+i.otherCashIn+i.ownerContribution+i.workingCapitalContribution-cashExpenses-i.inventoryPurchases-investmentOut-i.ownerWithdrawal-i.profitWithdrawal
    return MonthlyAccountingResult(net,gross,operating,reserve,distributable,closing,shares,validShares,reserve,i.profitWithdrawal)
}

data class AssetValue(val monthlyDepreciation:Long,val accumulatedDepreciation:Long,val bookValue:Long)
fun calculateAssetValue(totalCost:Long,residualValue:Long,usefulLifeMonths:Int,monthsUsed:Int):AssetValue{
    require(totalCost>=0&&residualValue in 0..totalCost&&usefulLifeMonths>0)
    val depreciable=totalCost-residualValue
    val monthly=depreciable/usefulLifeMonths
    val accumulated=(depreciable*monthsUsed.coerceIn(0,usefulLifeMonths)/usefulLifeMonths).coerceAtMost(depreciable)
    return AssetValue(monthly,accumulated,(totalCost-accumulated).coerceAtLeast(residualValue))
}

data class PaybackResult(val remainingToRecover:Long,val paybackBasisPoints:Int,val estimatedMonthsRemaining:Double?)
fun calculatePayback(initialInvestment:Long,recoveredCapital:Long,recentMonthlyProfits:List<Long>):PaybackResult{
    require(initialInvestment>=0&&recoveredCapital>=0)
    val remaining=(initialInvestment-recoveredCapital).coerceAtLeast(0)
    val percent=if(initialInvestment==0L)0 else ((recoveredCapital.coerceAtMost(initialInvestment)*10_000)/initialInvestment).toInt()
    val average=recentMonthlyProfits.takeLast(3).takeIf{it.isNotEmpty()}?.average()?:0.0
    return PaybackResult(remaining,percent,if(average>0)remaining/average else null)
}
