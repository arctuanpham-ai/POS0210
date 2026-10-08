package vn.ecohome.pos0210

object VoucherPolicy {
 fun canRedeem(itemPrice:Long,voucherCap:Long,alreadyAppliedDiscount:Boolean):Boolean =
  itemPrice in 1..voucherCap && !alreadyAppliedDiscount
}