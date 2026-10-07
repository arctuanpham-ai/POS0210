package vn.ecohome.pos0210

/** Legacy input-detail buckets are secondary metadata. Only obvious semantic details
 * may preselect a financial group; generic legacy buckets must never overwrite a
 * financial category explicitly chosen by the user.
 */
fun expenseCategoryForLegacyDetail(categoryId: String, current: String): String = when (categoryId) {
    "pc_salary" -> ExpenseCategories.PAYROLL
    "pc_production" -> ExpenseCategories.INVENTORY_PURCHASE
    "pc_fixed" -> current
    else -> current
}

object FinancialReportBucket {
    const val OPERATING = "OPERATING"
    const val ADDITIONAL_INVESTMENT = "ADDITIONAL_INVESTMENT"
    const val INITIAL_ASSET = "INITIAL_ASSET"
    const val INITIAL_SUNK = "INITIAL_SUNK"
    const val CAPITAL_FLOW = "CAPITAL_FLOW"
}

/** Presentation-only canonicalization. Historical rows are not mutated. */
fun canonicalFinancialReportCategory(code: String): String = when (code) {
    ExpenseCategories.SETUP_COST,
    ExpenseCategories.INITIAL_INVESTMENT_SUNK -> ExpenseCategories.INITIAL_INVESTMENT_SUNK
    ExpenseCategories.FIXED_EXPENSE,
    ExpenseCategories.VARIABLE_EXPENSE -> ExpenseCategories.OTHER_EXPENSE
    else -> code
}

fun financialReportBucket(code: String): String = when (canonicalFinancialReportCategory(code)) {
    ExpenseCategories.ADDITIONAL_INVESTMENT -> FinancialReportBucket.ADDITIONAL_INVESTMENT
    ExpenseCategories.CAPITAL_ASSET -> FinancialReportBucket.INITIAL_ASSET
    ExpenseCategories.INITIAL_INVESTMENT_SUNK -> FinancialReportBucket.INITIAL_SUNK
    ExpenseCategories.OWNER_CONTRIBUTION,
    ExpenseCategories.WORKING_CAPITAL,
    ExpenseCategories.OWNER_WITHDRAWAL,
    ExpenseCategories.PROFIT_WITHDRAWAL -> FinancialReportBucket.CAPITAL_FLOW
    else -> FinancialReportBucket.OPERATING
}

fun isPayrollExpense(expenseCategory: String): Boolean = expenseCategory == ExpenseCategories.PAYROLL

fun validProfitPeopleShares(shares: List<Int>): Boolean =
    shares.isNotEmpty() && shares.all { it in 0..10000 } && shares.sum() == 10000
