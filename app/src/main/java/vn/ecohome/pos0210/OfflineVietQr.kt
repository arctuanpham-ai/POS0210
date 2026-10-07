package vn.ecohome.pos0210

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import coil.ImageLoader
import coil.decode.DataSource
import coil.fetch.DrawableResult
import coil.fetch.FetchResult
import coil.fetch.Fetcher
import coil.request.Options
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import com.google.zxing.common.BitMatrix
import java.text.Normalizer
import java.util.Locale

/**
 * Purely local VietQR generator for payment images that were historically requested from img.vietqr.io.
 * No network access is performed for matching VietQR URLs.
 */
object OfflineVietQr {
    data class Request(
        val bankId: String,
        val accountNo: String,
        val amount: Long,
        val addInfo: String,
        val accountName: String = ""
    )

    private val bankBins = mapOf(
        "ICB" to "970415", "VIETINBANK" to "970415",
        "VCB" to "970436", "VIETCOMBANK" to "970436",
        "BIDV" to "970418",
        "VBA" to "970405", "AGRIBANK" to "970405",
        "OCB" to "970448",
        "MB" to "970422", "MBBANK" to "970422",
        "TCB" to "970407", "TECHCOMBANK" to "970407",
        "ACB" to "970416",
        "VPB" to "970432", "VPBANK" to "970432",
        "TPB" to "970423", "TPBANK" to "970423",
        "STB" to "970403", "SACOMBANK" to "970403",
        "HDB" to "970437", "HDBANK" to "970437",
        "VCCB" to "970454", "VIETCAPITALBANK" to "970454",
        "SCB" to "970429",
        "VIB" to "970441",
        "SHB" to "970443",
        "EIB" to "970431", "EXIMBANK" to "970431",
        "MSB" to "970426",
        "PVCB" to "970412", "PVCOMBANK" to "970412",
        "MBV" to "970414",
        "NCB" to "970419",
        "SHBVN" to "970424", "SHINHANBANK" to "970424",
        "ABB" to "970425", "ABBANK" to "970425",
        "VAB" to "970427", "VIETABANK" to "970427",
        "NAB" to "970428", "NAMABANK" to "970428",
        "PGB" to "970430", "PGBANK" to "970430",
        "VIETBANK" to "970433",
        "BVB" to "970438", "BAOVIETBANK" to "970438",
        "SEAB" to "970440", "SEABANK" to "970440",
        "COOPBANK" to "970446",
        "LPB" to "970449", "LPBANK" to "970449",
        "KLB" to "970452", "KIENLONGBANK" to "970452",
        "CIMB" to "422589",
        "WVN" to "970457", "WOORI" to "970457",
        "VRB" to "970421",
        "HSBC" to "458761",
        "SCVN" to "970410", "STANDARDCHARTERED" to "970410",
        "PBVN" to "970439", "PUBLICBANK" to "970439"
    )

    fun parseQuickLink(uri: Uri): Request? {
        if (!uri.host.equals("img.vietqr.io", ignoreCase = true)) return null
        val imagePart = uri.pathSegments.lastOrNull() ?: return null
        val stem = imagePart.substringBeforeLast('.')
        val parts = stem.split('-')
        if (parts.size < 3) return null
        val bank = parts.first()
        val account = parts.drop(1).dropLast(1).joinToString("-").trim()
        if (account.isBlank()) return null
        val amount = uri.getQueryParameter("amount")?.toLongOrNull() ?: 0L
        val info = uri.getQueryParameter("addInfo").orEmpty()
        val holder = uri.getQueryParameter("accountName").orEmpty()
        return Request(bank, account, amount, info, holder)
    }

    fun resolveBin(bankId: String): String? {
        val raw = bankId.trim()
        if (raw.matches(Regex("\\d{6}"))) return raw
        return bankBins[normalize(raw)]
    }

    fun payload(request: Request): String {
        val bin = requireNotNull(resolveBin(request.bankId)) { "Unsupported VietQR BANK_ID: ${request.bankId}" }
        require(request.accountNo.isNotBlank()) { "Missing VietQR account number" }

        val consumer = tlv("00", bin) + tlv("01", request.accountNo.trim()) + tlv("02", "QRIBFTTA")
        val merchant = tlv("00", "A000000727") + tlv("01", consumer)

        val info = sanitizeText(request.addInfo).take(25)
        val amountPart = if (request.amount > 0) tlv("54", request.amount.toString()) else ""
        val additional = if (info.isNotBlank()) tlv("62", tlv("08", info)) else ""

        val body = buildString {
            append(tlv("00", "01"))
            append(tlv("01", if (request.amount > 0) "12" else "11"))
            append(tlv("38", merchant))
            append(tlv("53", "704"))
            append(amountPart)
            append(tlv("58", "VN"))
            append(additional)
            append("6304")
        }
        return body + crc16(body)
    }

    fun bitmap(request: Request, size: Int = 900): Bitmap {
        val matrix = MultiFormatWriter().encode(payload(request), BarcodeFormat.QR_CODE, size, size)
        return matrix.toBitmap()
    }

    private fun normalize(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "")
        .replace(Regex("[^A-Za-z0-9]"), "")
        .uppercase(Locale.US)

    private fun sanitizeText(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "")
        .replace(Regex("[^A-Za-z0-9 .]"), "")
        .trim()

    private fun tlv(id: String, value: String): String = id + value.length.toString().padStart(2, '0') + value

    private fun crc16(input: String): String {
        var crc = 0xFFFF
        for (byte in input.toByteArray(Charsets.UTF_8)) {
            crc = crc xor ((byte.toInt() and 0xFF) shl 8)
            repeat(8) {
                crc = if ((crc and 0x8000) != 0) (crc shl 1) xor 0x1021 else crc shl 1
                crc = crc and 0xFFFF
            }
        }
        return crc.toString(16).uppercase(Locale.US).padStart(4, '0')
    }

    private fun BitMatrix.toBitmap(): Bitmap {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        for (y in 0 until height) {
            for (x in 0 until width) bitmap.setPixel(x, y, if (get(x, y)) Color.BLACK else Color.WHITE)
        }
        return bitmap
    }
}

class OfflineVietQrFetcher(
    private val data: Uri,
    private val options: Options
) : Fetcher {
    override suspend fun fetch(): FetchResult? {
        val request = OfflineVietQr.parseQuickLink(data) ?: return null
        val drawable = BitmapDrawable(options.context.resources, OfflineVietQr.bitmap(request))
        return DrawableResult(drawable = drawable, isSampled = false, dataSource = DataSource.MEMORY)
    }

    class Factory : Fetcher.Factory<Uri> {
        override fun create(data: Uri, options: Options, imageLoader: ImageLoader): Fetcher? {
            if (!data.host.equals("img.vietqr.io", ignoreCase = true)) return null
            return OfflineVietQrFetcher(data, options)
        }
    }
}
