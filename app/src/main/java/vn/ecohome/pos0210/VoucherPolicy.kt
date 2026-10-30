package vn.ecohome.pos0210

object VoucherPolicy {
 fun canRedeem(itemPrice:Long,voucherCap:Long,alreadyAppliedDiscount:Boolean):Boolean =
  itemPrice in 1..voucherCap && !alreadyAppliedDiscount
 fun code(rewardId:String):String="0210-"+rewardId.filter(Char::isLetterOrDigit).takeLast(6).uppercase()
 fun cap(snapshot:String):Long?{val p=snapshot.split("|");return p.getOrNull(1)?.takeIf{it=="VOUCHER"}?.let{p.getOrNull(2)?.toLongOrNull()}}
}