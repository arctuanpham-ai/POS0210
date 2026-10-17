package vn.ecohome.pos0210

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PreOpeningResetPolicyTest {
    @Test fun only_admin_with_the_full_phrase_can_arm_the_pre_opening_reset() {
        assertTrue(PreOpeningResetPolicy.canExecute("ADMIN", "RESET KHAI TRUONG 0210"))
        assertFalse(PreOpeningResetPolicy.canExecute("MANAGER", "RESET KHAI TRUONG 0210"))
        assertFalse(PreOpeningResetPolicy.canExecute("ADMIN", "RESET KHAI TRUONG"))
    }

    @Test fun reset_scope_covers_live_sales_and_attendance_but_not_setup_or_costs() {
        val scope = PreOpeningResetPolicy.scope

        assertTrue(scope.clearPaidBills)
        assertTrue(scope.clearPayments)
        assertTrue(scope.clearAttendance)
        assertFalse(scope.clearMenu)
        assertFalse(scope.clearEmployees)
        assertFalse(scope.clearPurchases)
        assertFalse(scope.clearSettings)
    }
}
