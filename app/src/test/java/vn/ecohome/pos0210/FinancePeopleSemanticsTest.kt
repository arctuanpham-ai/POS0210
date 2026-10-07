package vn.ecohome.pos0210

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FinancePeopleSemanticsTest {
    @Test fun payrollUiMustFollowFinancialCategoryOnly() {
        assertFalse(isPayrollExpense(ExpenseCategories.INVENTORY_PURCHASE))
        assertFalse(isPayrollExpense(ExpenseCategories.ELECTRICITY))
        assertTrue(isPayrollExpense(ExpenseCategories.PAYROLL))
    }

    @Test fun zeroSharePeopleAreAllowedButActiveSharesMustTotalOneHundredPercent() {
        assertTrue(validProfitPeopleShares(listOf(5000, 5000, 0)))
        assertTrue(validProfitPeopleShares(listOf(10000, 0, 0)))
        assertFalse(validProfitPeopleShares(listOf(5000, 4000, 0)))
        assertFalse(validProfitPeopleShares(emptyList()))
    }
}
