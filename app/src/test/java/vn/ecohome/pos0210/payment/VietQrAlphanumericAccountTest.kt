package vn.ecohome.pos0210.payment

import org.junit.Assert.*
import org.junit.Test

class VietQrAlphanumericAccountTest {
 @Test fun buildsDynamicQrForTechcombankMerchantId(){
  val p=VietQrPayload.build("TCB","MS00P0000001284119","BUNGA CAFE",4500,"0210 N01 A4YX").getOrThrow()
  assertTrue(p.contains("0006970407"))
  assertTrue(p.contains("0119MS00P0000001284119"))
  assertTrue(p.contains("QRIBFTTA"))
  assertTrue(p.contains("54044500"))
  val body=p.dropLast(4)
  assertEquals(VietQrPayload.crc16(body).toString(16).uppercase().padStart(4,'0'),p.takeLast(4))
 }
}
