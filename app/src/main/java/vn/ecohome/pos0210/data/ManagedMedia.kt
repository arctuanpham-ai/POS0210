package vn.ecohome.pos0210.data

import android.content.Context
import android.net.Uri
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
        val ext = runCatching {
            context.contentResolver.getType(uri)
                ?.let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) }
        }.getOrNull()
            ?: uri.lastPathSegment?.substringAfterLast('.', "")?.takeIf { it.length in 2..5 }
            ?: "jpg"

        val out = File(dir, prefix + "_" + UUID.randomUUID().toString() + "." + ext)
        context.contentResolver.openInputStream(uri).use { input ->
            requireNotNull(input) { "Không đọc được ảnh nguồn" }
            out.outputStream().use { output -> input.copyTo(output) }
        }
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
