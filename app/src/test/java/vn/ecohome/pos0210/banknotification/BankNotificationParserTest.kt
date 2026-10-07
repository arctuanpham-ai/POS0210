package vn.ecohome.pos0210.banknotification

import org.junit.Assert.*
import org.junit.Test

class BankNotificationParserTest {
 private val vcbBody="Số dư TK VCB 0031000209036 +2,000 VND lúc 15-09-2026 14:18:16. Số dư 9,652,433 VND. Ref 6258IBT1cJMZQNX3.PHAM ANH TUAN Chuyen tien.20260915.141816.105871325106.PHAM ANH TUAN.970415"
 private val vietinBody="""VietinBank:15/09/2026 14:19
TK:105871325106
GD:+3,000,000 VND
SDC:3,228,800 VND
ND:CT DEN:164T2690PJ300DB4 MBVCB.16065678956.848811.PHAM ANH TUAN chuyen tien.CT tu 0031000209036"""

 @Test fun parsesVcbCredit(){val tx=VcbNotificationParser().parse("Thông báo VCB",vcbBody,1)!!;assertEquals("VCB",tx.bank);assertEquals("0031000209036",tx.account);assertEquals(2000,tx.amount);assertEquals(TransactionDirection.CREDIT,tx.direction);assertNotNull(tx.transactionTime)}
 @Test fun parsesVietinCredit(){val tx=VietinbankNotificationParser().parse("Tin biến động số dư",vietinBody,1)!!;assertEquals("VIETINBANK",tx.bank);assertEquals("105871325106",tx.account);assertEquals(3_000_000,tx.amount);assertEquals(TransactionDirection.CREDIT,tx.direction);assertTrue(tx.content.startsWith("CT DEN"))}
 @Test fun debitIsNotCredit(){val tx=VcbNotificationParser().parse("Thông báo VCB",vcbBody.replace("+2,000","-2,000"),1)!!;assertEquals(TransactionDirection.DEBIT,tx.direction)}
 @Test fun malformedFailsSafely(){assertNull(VietinbankNotificationParser().parse("Tin biến động số dư","format mới chưa hỗ trợ",1))}
 @Test fun repostHasSameFingerprint(){val p=VcbNotificationParser();assertEquals(p.parse("a",vcbBody,1)!!.rawHash,p.parse("a",vcbBody,2)!!.rawHash)}
}
