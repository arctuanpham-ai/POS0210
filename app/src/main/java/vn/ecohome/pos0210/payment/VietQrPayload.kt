package vn.ecohome.pos0210.payment

import java.text.Normalizer
import java.util.Locale

/** Builds the NAPAS VietQR/EMVCo payload without any network dependency. */
object VietQrPayload {
    private val bankBins = mapOf(
        "VIETINBANK" to "970415", "ICB" to "970415",
        "VIETCOMBANK" to "970436", "VCB" to "970436",
        "BIDV" to "970418", "AGRIBANK" to "970405",
        "MB" to "970422", "MBBANK" to "970422",
        "TECHCOMBANK" to "970407", "TCB" to "970407",
        "ACB" to "970416", "VPBANK" to "970432",
        "SACOMBANK" to "970403", "STB" to "970403",
        "TPBANK" to "970423", "TPB" to "970423",
        "HDBANK" to "970437", "HDB" to "970437",
        "OCB" to "970448", "VIB" to "970441", "SHB" to "970443",
        "EXIMBANK" to "970431", "EIB" to "970431",
        "MSB" to "970426", "LPBANK" to "970449", "LIENVIETPOSTBANK" to "970449",
        "SEABANK" to "970440", "PVCOMBANK" to "970412", "NCB" to "970419",
        "VIETABANK" to "970427", "BACABANK" to "970409", "ABBANK" to "970425",
        "BAOVIETBANK" to "970438", "KIENLONGBANK" to "970452",
        "SAIGONBANK" to "970400", "DONGABANK" to "970406",
        "PGBANK" to "970430", "GPBANK" to "970408", "SCB" to "970429",
        "VRB" to "970421", "SHINHANBANK" to "970424", "WOORIBANK" to "970457",
        "UOB" to "970458", "PUBLICBANK" to "970439"
    )

    fun resolveBin(bankId: String): String? {
        val compact = ascii(bankId).replace(Regex("[^A-Z0-9]"), "")
        return compact.takeIf { it.matches(Regex("970\\d{3}")) } ?: bankBins[compact]
    }

    fun build(bankId: String, account: String, holder: String, amount: Long, info: String): Result<String> = runCatching {
        val bin = requireNotNull(resolveBin(bankId)) { "BANK_ID chưa được hỗ trợ offline: $bankId. Hãy nhập BANK_ID hoặc BIN 6 số của ngân hàng." }
        val cleanAccount = account.filter(Char::isDigit)
        require(cleanAccount.isNotBlank()) { "Thiếu số tài khoản VietQR" }
        require(amount > 0) { "Số tiền thanh toán không hợp lệ" }

        val consumer = tlv("00", bin) + tlv("01", cleanAccount) + tlv("02", "QRIBFTTA")
        val merchantAccount = tlv("00", "A000000727") + tlv("01", consumer)
        val additional = tlv("08", ascii(info).take(50))
        val merchantName = ascii(holder).ifBlank { "0210" }.take(25)
        val raw = tlv("00", "01") + tlv("01", "12") + tlv("38", merchantAccount) +
            tlv("53", "704") + tlv("54", amount.toString()) + tlv("58", "VN") +
            tlv("59", merchantName) + tlv("60", "HAI PHONG") + tlv("62", additional) + "6304"
        raw + crc16(raw).toString(16).uppercase(Locale.US).padStart(4, '0')
    }

    internal fun crc16(value: String): Int {
        var crc = 0xFFFF
        value.toByteArray(Charsets.UTF_8).forEach { byte ->
            crc = crc xor ((byte.toInt() and 0xFF) shl 8)
            repeat(8) { crc = if ((crc and 0x8000) != 0) (crc shl 1) xor 0x1021 else crc shl 1; crc = crc and 0xFFFF }
        }
        return crc
    }

    private fun tlv(id: String, value: String): String {
        val size = value.toByteArray(Charsets.UTF_8).size
        require(size <= 99) { "Dữ liệu VietQR quá dài tại trường $id" }
        return id + size.toString().padStart(2, '0') + value
    }

    private fun ascii(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "").replace('đ', 'd').replace('Đ', 'D')
        .uppercase(Locale.US).trim()
}
