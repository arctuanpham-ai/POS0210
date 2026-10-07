package vn.ecohome.pos0210.banknotification

import vn.ecohome.pos0210.data.PaymentSessionEntity

enum class MatchConfidence { HIGH, MEDIUM, AMBIGUOUS, NONE }
data class MatchResult(val confidence:MatchConfidence,val session:PaymentSessionEntity?=null)

object PaymentMatcher {
 private const val TOLERANCE_MS=30_000L
 fun match(transaction:BankTransaction,candidates:List<PaymentSessionEntity>,now:Long=transaction.receivedNotificationTime):MatchResult {
  if(transaction.direction!=TransactionDirection.CREDIT)return MatchResult(MatchConfidence.NONE)
  val eventAt=transaction.transactionTime?:transaction.receivedNotificationTime
  val eligible=candidates.filter { it.status=="WAITING" && it.expectedAmount==transaction.amount && now<=it.expiresAt && eventAt>=it.openedAt-TOLERANCE_MS }
  val strong=eligible.filter{transaction.content.contains(it.paymentCode,ignoreCase=true)}
  if(strong.size==1)return MatchResult(MatchConfidence.HIGH,strong.single())
  if(strong.size>1)return MatchResult(MatchConfidence.AMBIGUOUS)
  return when(eligible.size){1->MatchResult(MatchConfidence.MEDIUM,eligible.single());0->MatchResult(MatchConfidence.NONE);else->MatchResult(MatchConfidence.AMBIGUOUS)}
 }
}
