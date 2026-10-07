package vn.ecohome.pos0210.payment

import org.junit.Assert.*
import org.junit.Test

class VietQrPayloadTest {
    @Test fun payloadIsLocalDynamicVietQrWithValidCrc() {
        val payload = VietQrPayload.build("MB", "123456789", "0210", 121500, "0210 BAN 02").getOrThrow()
        assertTrue(payload.startsWith("00020101021238"))
        assertTrue(payload.contains("970422"))
        assertTrue(payload.contains("123456789"))
        assertTrue(payload.contains("5303704"))
        assertTrue(payload.contains("5406121500"))
        val body = payload.dropLast(4)
        assertEquals(VietQrPayload.crc16(body).toString(16).uppercase().padStart(4, '0'), payload.takeLast(4))
    }

    @Test fun sameInvoiceAlwaysProducesIdenticalPayload() {
        val first = VietQrPayload.build("970422", "123456789", "0210", 40000, "0210 BAN 01").getOrThrow()
        val second = VietQrPayload.build("970422", "123456789", "0210", 40000, "0210 BAN 01").getOrThrow()
        assertEquals(first, second)
    }

    @Test fun unsupportedBankReturnsTechnicalMessage() {
        val error = VietQrPayload.build("UNKNOWN", "123", "0210", 1000, "TEST").exceptionOrNull()
        assertTrue(error?.message?.contains("BANK_ID") == true)
    }
}
