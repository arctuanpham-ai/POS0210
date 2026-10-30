package vn.ecohome.pos0210.data

import android.content.Context
import android.net.Uri
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.ByteArrayOutputStream
import android.webkit.MimeTypeMap
import java.io.File
import java.util.UUID

object ManagedMedia {
    fun isManaged(uriString: String?): Boolean {
        if (uriString.isNullOrBlank()) return false
        val uri = Uri.parse(uriString)
        return uri.scheme == "file" && uri.path.orEmpty().contains("/managed_media/")
    }

    fun importImage(context: Context, uriString: String?, prefix: String): String? {
        if (uriString.isNullOrBlank()) return null
        val uri = Uri.parse(uriString)
        if (uri.scheme == "file") {
            val path = uri.path.orEmpty()
            if (path.contains("/managed_media/")) return uriString
        }

        val dir = File(context.filesDir, "managed_media").apply { mkdirs() }
        val out = File(dir, prefix + "_" + UUID.randomUUID().toString() + ".jpg")
        val source=context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?:error("Không đọc được ảnh nguồn")
        val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true}
        BitmapFactory.decodeByteArray(source,0,source.size,bounds)
        require(bounds.outWidth>0 && bounds.outHeight>0){"Ảnh không hợp lệ"}
        var sample=1
        while(maxOf(bounds.outWidth,bounds.outHeight)/sample>1280)sample*=2
        val options=BitmapFactory.Options().apply{inSampleSize=sample;inPreferredConfig=Bitmap.Config.RGB_565}
        val decoded=BitmapFactory.decodeByteArray(source,0,source.size,options)?:error("Không giải mã được ảnh")
        try{
            val scale=minOf(1f,1280f/maxOf(decoded.width,decoded.height))
            val scaled=if(scale<1f)Bitmap.createScaledBitmap(decoded,(decoded.width*scale).toInt().coerceAtLeast(1),(decoded.height*scale).toInt().coerceAtLeast(1),true) else decoded
            try{
                var output=ByteArray(0)
                for(q in listOf(85,78,70,60,48,35)){
                    val stream=ByteArrayOutputStream()
                    scaled.compress(Bitmap.CompressFormat.JPEG,q,stream)
                    output=stream.toByteArray()
                    if(output.size<=300_000)break
                }
                require(output.size<=450_000){"Ảnh quá phức tạp để nén"}
                out.writeBytes(output)
            }finally{if(scaled!==decoded)scaled.recycle()}
        }finally{decoded.recycle()}
        return Uri.fromFile(out).toString()
    }

    suspend fun migrateLegacy(context: Context, dao: PosDao): Int {
        var migrated = 0

        dao.allMenuSnapshot().forEach { item ->
            val old = item.imageUri
            if (!old.isNullOrBlank() && !isManaged(old)) {
                runCatching { importImage(context, old, "menu_" + item.id) }
                    .getOrNull()
                    ?.let { managed ->
                        dao.saveMenuItem(item.copy(imageUri = managed))
                        migrated++
                    }
            }
        }

        dao.allCombosSnapshot().forEach { combo ->
            val old = combo.imageUri
            if (!old.isNullOrBlank() && !isManaged(old)) {
                runCatching { importImage(context, old, "combo_" + combo.id) }
                    .getOrNull()
                    ?.let { managed ->
                        dao.saveCombo(combo.copy(imageUri = managed))
                        migrated++
                    }
            }
        }

        dao.allPurchasesSnapshot().forEach { purchase ->
            val old = purchase.invoiceImageUri
            if (!old.isNullOrBlank() && !isManaged(old)) {
                runCatching { importImage(context, old, "invoice_" + purchase.id) }
                    .getOrNull()
                    ?.let { managed ->
                        dao.updatePurchaseImage(purchase.id, managed)
                        migrated++
                    }
            }
        }

        return migrated
    }
}
