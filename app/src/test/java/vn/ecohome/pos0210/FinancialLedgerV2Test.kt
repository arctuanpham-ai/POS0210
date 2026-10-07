package vn.ecohome.pos0210
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FinancialLedgerV2Test {
 @Test fun cashResultUsesRevenueMinusCurrentExpenses() {
  val r=calculateFinancialPeriod(FinancialPeriodInput(100_000_000,70_000_000,0,9_000_000))
  assertEquals(30_000_000,r.operatingResultBeforeAdditionalInvestment)
  assertEquals(30_000_000,r.netCashResult)
 }
 @Test fun additionalInvestmentIsCurrentCashOutButSeparateFromOperations() {
  val r=calculateFinancialPeriod(FinancialPeriodInput(150_000_000,110_000_000,50_000_000,0))
  assertEquals(40_000_000,r.operatingResultBeforeAdditionalInvestment)
  assertEquals(-10_000_000,r.netCashResult)
 }
 @Test fun depreciationIsReferenceOnly() {
  val r=calculateFinancialPeriod(FinancialPeriodInput(100_000_000,70_000_000,0,1_000_000))
  assertEquals(30_000_000,r.netCashResult)
  assertEquals(1_000_000,r.depreciationReference)
 }
 @Test fun paybackUsesCumulativeNetCashAgainstInitialInvestment() {
  val r=calculateCashPayback(300_000_000,210_000_000)
  assertEquals(7000,r.paybackBasisPoints)
  assertEquals(90_000_000,r.remaining)
 }
 @Test fun reimbursementReducesDebtWithoutCreatingAnotherExpense() {
  val rows=calculatePayerLedger(listOf(PayerAdvance("A",5_000_000)),listOf(PayerReimbursement("A",2_000_000)))
  assertEquals(1,rows.size);assertEquals(5_000_000,rows[0].advanced);assertEquals(2_000_000,rows[0].reimbursed);assertEquals(3_000_000,rows[0].outstanding)
 }
 @Test fun costVarianceSeparatesPriceAndUsageMovement() {
  val v=calculateCostVariance(CostObservation(10.0,220_000),CostObservation(10.0,245_000))
  assertEquals(0.0,v.quantityChangePct,0.001);assertTrue(v.unitPriceChangePct>11.3);assertTrue(v.unitPriceChangePct<11.4)
 }
}
