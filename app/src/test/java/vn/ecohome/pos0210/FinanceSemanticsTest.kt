package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Test

class FinanceSemanticsTest {
    @Test fun salaryDetailMapsToPayroll() {
        assertEquals(ExpenseCategories.PAYROLL, expenseCategoryForLegacyDetail("pc_salary", ExpenseCategories.OTHER_EXPENSE))
    }

    @Test fun productionDetailMapsToInventoryPurchase() {
        assertEquals(ExpenseCategories.INVENTORY_PURCHASE, expenseCategoryForLegacyDetail("pc_production", ExpenseCategories.OTHER_EXPENSE))
    }

    @Test fun fixedDetailDoesNotOverwriteFinancialGroup() {
        assertEquals(ExpenseCategories.ELECTRICITY, expenseCategoryForLegacyDetail("pc_fixed", ExpenseCategories.ELECTRICITY))
    }

    @Test fun setupAndInitialSunkCollapseToOneReportingCode() {
        assertEquals(ExpenseCategories.INITIAL_INVESTMENT_SUNK, canonicalFinancialReportCategory(ExpenseCategories.SETUP_COST))
        assertEquals(ExpenseCategories.INITIAL_INVESTMENT_SUNK, canonicalFinancialReportCategory(ExpenseCategories.INITIAL_INVESTMENT_SUNK))
    }

    @Test fun fixedAndVariableLegacyBucketsCollapseToOtherExpenseForReporting() {
        assertEquals(ExpenseCategories.OTHER_EXPENSE, canonicalFinancialReportCategory(ExpenseCategories.FIXED_EXPENSE))
        assertEquals(ExpenseCategories.OTHER_EXPENSE, canonicalFinancialReportCategory(ExpenseCategories.VARIABLE_EXPENSE))
    }

    @Test fun investmentsAreSeparatedFromOperatingExpense() {
        assertEquals(FinancialReportBucket.INITIAL_ASSET, financialReportBucket(ExpenseCategories.CAPITAL_ASSET))
        assertEquals(FinancialReportBucket.INITIAL_SUNK, financialReportBucket(ExpenseCategories.SETUP_COST))
        assertEquals(FinancialReportBucket.ADDITIONAL_INVESTMENT, financialReportBucket(ExpenseCategories.ADDITIONAL_INVESTMENT))
        assertEquals(FinancialReportBucket.OPERATING, financialReportBucket(ExpenseCategories.ELECTRICITY))
    }

    @Test fun ownerCapitalFlowsAreNeverOperatingExpense() {
        assertEquals(FinancialReportBucket.CAPITAL_FLOW, financialReportBucket(ExpenseCategories.OWNER_CONTRIBUTION))
        assertEquals(FinancialReportBucket.CAPITAL_FLOW, financialReportBucket(ExpenseCategories.WORKING_CAPITAL))
        assertEquals(FinancialReportBucket.CAPITAL_FLOW, financialReportBucket(ExpenseCategories.OWNER_WITHDRAWAL))
        assertEquals(FinancialReportBucket.CAPITAL_FLOW, financialReportBucket(ExpenseCategories.PROFIT_WITHDRAWAL))
    }
}
