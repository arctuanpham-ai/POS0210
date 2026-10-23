package vn.ecohome.pos0210.payment

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CheckoutPrintPolicyTest {
    @Test fun confirmationRequiresTheExactBillThatWasPrintedOrAttempted() {
        val key=CheckoutPrintPolicy.key("session-1",70000L,"0210 A01 CODE1")
        assertTrue(CheckoutPrintPolicy.canConfirm(key,key,null))
        assertTrue(CheckoutPrintPolicy.canConfirm(key,null,key))
        assertFalse(CheckoutPrintPolicy.canConfirm(CheckoutPrintPolicy.key("session-1",70000L,"0210 A01 CODE2"),key,null))
        assertFalse(CheckoutPrintPolicy.canConfirm(CheckoutPrintPolicy.key("session-1",80000L,"0210 A01 CODE1"),null,key))
    }
}
