package vn.ecohome.pos0210.banknotification

import org.junit.Assert.*
import org.junit.Test
import vn.ecohome.pos0210.data.PaymentSessionEntity

class PaymentMatcherTest {
 private fun session(id:String,amount:Long=100_000,code:String="K8P2",opened:Long=1_000)=PaymentSessionEntity(id,"ts$id",null,"t$id",amount,code,opened,opened+600_000)
 private fun tx(amount:Long=100_000,content:String="",direction:TransactionDirection=TransactionDirection.CREDIT,time:Long=2_000)=BankTransaction("VCB","1",amount,direction,time,2_000,content,null,"fp")
 @Test fun strongCodeMatchWins(){val r=PaymentMatcher.match(tx(content="0210 B05 K8P2"),listOf(session("a"),session("b",code="Q7W9")),2_000);assertEquals(MatchConfidence.HIGH,r.confidence);assertEquals("a",r.session?.id)}
 @Test fun uniqueAmountIsMedium(){assertEquals(MatchConfidence.MEDIUM,PaymentMatcher.match(tx(),listOf(session("a")),2_000).confidence)}
 @Test fun sameAmountIsAmbiguous(){assertEquals(MatchConfidence.AMBIGUOUS,PaymentMatcher.match(tx(),listOf(session("a"),session("b")),2_000).confidence)}
 @Test fun wrongAmountDoesNotMatch(){assertEquals(MatchConfidence.NONE,PaymentMatcher.match(tx(99_000),listOf(session("a")),2_000).confidence)}
 @Test fun debitDoesNotMatch(){assertEquals(MatchConfidence.NONE,PaymentMatcher.match(tx(direction=TransactionDirection.DEBIT),listOf(session("a")),2_000).confidence)}
 @Test fun oldTransactionDoesNotMatch(){assertEquals(MatchConfidence.NONE,PaymentMatcher.match(tx(time=900),listOf(session("a",opened=100_000)),100_100).confidence)}
 @Test fun expiredSessionDoesNotMatch(){assertEquals(MatchConfidence.NONE,PaymentMatcher.match(tx(time=700_000),listOf(session("a")),700_000).confidence)}
}
