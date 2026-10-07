package vn.ecohome.pos0210.payment

import android.graphics.Bitmap
import android.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

object VietQrOffline {
    fun bitmap(bankId: String, account: String, holder: String, amount: Long, info: String, size: Int = 768): Result<Bitmap> =
        VietQrPayload.build(bankId, account, holder, amount, info).mapCatching { payload ->
            val matrix = QRCodeWriter().encode(
                payload, BarcodeFormat.QR_CODE, size, size,
                mapOf(EncodeHintType.CHARACTER_SET to "UTF-8", EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to 2)
            )
            Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).apply {
                for (y in 0 until size) for (x in 0 until size) setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
            }
        }
}
