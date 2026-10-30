package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Test

class VoucherPolicyTest {
 @Test fun allowsExactlyOneEligibleItemWithinVoucherCap(){
  assertEquals(true,VoucherPolicy.canRedeem(itemPrice=40000L,voucherCap=40000L,alreadyAppliedDiscount=false))
  assertEquals(false,VoucherPolicy.canRedeem(itemPrice=40001L,voucherCap=40000L,alreadyAppliedDiscount=false))
  assertEquals(false,VoucherPolicy.canRedeem(itemPrice=30000L,voucherCap=40000L,alreadyAppliedDiscount=true))
 }
}