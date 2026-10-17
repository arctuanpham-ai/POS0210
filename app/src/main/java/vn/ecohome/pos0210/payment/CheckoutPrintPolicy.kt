package vn.ecohome.pos0210.payment

/** A pre-payment print authorizes only the exact current bill representation. */
object CheckoutPrintPolicy {
    fun key(sessionId:String,total:Long,qrInfo:String)="$sessionId:$total:$qrInfo"
    fun canConfirm(currentKey:String,printedKey:String?,attemptedKey:String?)=
        currentKey==printedKey || currentKey==attemptedKey
}
