package vn.ecohome.pos0210.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

object DataBackup {
    private const val DB_NAME = "pos0210.db"
    private const val LATEST_NAME = "POS0210_DATA_LATEST.db"
    private const val TEMP_NAME = "POS0210_DATA_TEMP.db"
    private const val PREVIOUS_NAME = "POS0210_DATA_PREVIOUS.db"
    private const val MEDIA_LATEST_NAME = "POS0210_MEDIA_LATEST.0210"

    private fun checkpoint(context: Context): File {
        val db = PosDatabase.get(context)
        db.openHelper.writableDatabase.query("PRAGMA wal_checkpoint(FULL)").use { }
        val source = context.getDatabasePath(DB_NAME)
        require(source.exists()) { "Không tìm thấy database" }
        return source
    }

    private fun validateSqlite(file: File) {
        val header = ByteArray(16)
        file.inputStream().use { input -> require(input.read(header) == 16) }
        require(String(header, Charsets.US_ASCII).startsWith("SQLite format 3")) {
            "File DATA không hợp lệ"
        }
    }

    private fun validateSqlite(context: Context, uri: Uri) {
        val temp = File(context.cacheDir, "pos0210-validate.tmp")
        context.contentResolver.openInputStream(uri).use { input ->
            requireNotNull(input)
            temp.outputStream().use { output -> input.copyTo(output) }
        }
        validateSqlite(temp)
        temp.delete()
    }

    private fun copyUri(context: Context, source: Uri, target: Uri) {
        context.contentResolver.openInputStream(source).use { input ->
            requireNotNull(input) { "Không đọc được file nguồn" }
            SafPosStorage.overwrite(context, target) { output -> input.copyTo(output) }
        }
    }

    private fun validatedOrNull(context: Context, uri: Uri?): Uri? {
        if (uri == null) return null
        return runCatching { validateSqlite(context, uri); uri }.getOrNull()
    }

    fun ensureStructure(context: Context, rootTreeUriString: String): Result<Unit> =
        SafPosStorage.ensureSelectedRoot(context, rootTreeUriString).map { Unit }

    fun findLatest(context: Context, rootTreeUriString: String): Uri? {
        if (rootTreeUriString.isBlank()) return null
        val structure = SafPosStorage.ensureSelectedRoot(context, rootTreeUriString).getOrNull() ?: return null
        return SafPosStorage.findFile(context, structure.data, LATEST_NAME)
    }

    fun findMediaLatest(context: Context, rootTreeUriString: String): Uri? {
        if (rootTreeUriString.isBlank()) return null
        val structure = SafPosStorage.ensureSelectedRoot(context, rootTreeUriString).getOrNull() ?: return null
        return SafPosStorage.findFile(context, structure.data, MEDIA_LATEST_NAME)
    }

    fun exportDatabase(context: Context, uri: Uri): Result<Unit> = runCatching {
        val source = checkpoint(context)
        context.contentResolver.openOutputStream(uri, "wt").use { out ->
            requireNotNull(out)
            source.inputStream().use { input -> input.copyTo(out) }
        }
    }

    fun backupLatest(
        context: Context,
        rootTreeUriString: String,
        includeMedia: Boolean = true
    ): Result<Uri> = runCatching {
        val structure = SafPosStorage.ensureSelectedRoot(context, rootTreeUriString).getOrThrow()

        if (includeMedia) {
            kotlinx.coroutines.runBlocking {
                ManagedMedia.migrateLegacy(context, PosDatabase.get(context).dao())
            }
        }

        val latest = SafPosStorage.findFile(context, structure.data, LATEST_NAME)
            ?: SafPosStorage.createFile(context, structure.data, LATEST_NAME)
        val temp = SafPosStorage.findFile(context, structure.data, TEMP_NAME)
            ?: SafPosStorage.createFile(context, structure.data, TEMP_NAME)
        val previous = SafPosStorage.findFile(context, structure.data, PREVIOUS_NAME)
            ?: SafPosStorage.createFile(context, structure.data, PREVIOUS_NAME)

        val source = checkpoint(context)
        SafPosStorage.overwrite(context, temp) { out ->
            source.inputStream().use { input -> input.copyTo(out) }
        }
        validateSqlite(context, temp)

        validatedOrNull(context, latest)?.let { validLatest ->
            copyUri(context, validLatest, previous)
            validateSqlite(context, previous)
        }

        copyUri(context, temp, latest)
        validateSqlite(context, latest)

        if (includeMedia) backupMediaLatest(context, rootTreeUriString).getOrThrow()
        latest
    }

    fun backupMediaLatest(context: Context, rootTreeUriString: String): Result<Uri> = runCatching {
        val structure = SafPosStorage.ensureSelectedRoot(context, rootTreeUriString).getOrThrow()
        val existing = SafPosStorage.findFile(context, structure.data, MEDIA_LATEST_NAME)
        val target = existing ?: SafPosStorage.createFile(context, structure.data, MEDIA_LATEST_NAME)
        val dir = File(context.filesDir, "managed_media").apply { mkdirs() }

        SafPosStorage.overwrite(context, target) { raw ->
            ZipOutputStream(raw).use { zip ->
                dir.listFiles()
                    ?.filter { it.isFile }
                    ?.sortedBy { it.name }
                    ?.forEach { file ->
                        zip.putNextEntry(ZipEntry(file.name))
                        file.inputStream().use { input -> input.copyTo(zip) }
                        zip.closeEntry()
                    }
            }
        }
        validateMediaArchive(context, target)
        target
    }

    private fun validateMediaArchive(context: Context, uri: Uri) {
        context.contentResolver.openInputStream(uri).use { raw ->
            requireNotNull(raw)
            ZipInputStream(raw).use { zip ->
                while (zip.nextEntry != null) zip.closeEntry()
            }
        }
    }

    private fun restoreMediaFromUri(context: Context, uri: Uri) {
        val dir = File(context.filesDir, "managed_media").apply { mkdirs() }
        context.contentResolver.openInputStream(uri).use { raw ->
            requireNotNull(raw)
            ZipInputStream(raw).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    val safeName = entry.name.substringAfterLast('/').replace(Regex("[^A-Za-z0-9._-]"), "_")
                    if (safeName.isNotBlank()) {
                        File(dir, safeName).outputStream().use { output -> zip.copyTo(output) }
                    }
                    zip.closeEntry()
                }
            }
        }
    }

    private fun displayName(context: Context, uri: Uri): String? = runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    }.getOrNull()

    fun restoreMediaLatest(context: Context, rootTreeUriString: String): Result<Unit> = runCatching {
        val uri = findMediaLatest(context, rootTreeUriString) ?: return@runCatching
        restoreMediaFromUri(context, uri)
    }

    fun archiveSnapshot(context: Context, rootTreeUriString: String): Result<Uri> = runCatching {
        val structure = SafPosStorage.ensureSelectedRoot(context, rootTreeUriString).getOrThrow()
        kotlinx.coroutines.runBlocking {
            ManagedMedia.migrateLegacy(context, PosDatabase.get(context).dao())
        }
        val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val name = "POS0210_DATA_$stamp.db"
        val target = SafPosStorage.createFile(context, structure.archive, name)
        exportDatabase(context, target).getOrThrow()
        validateSqlite(context, target)

        val mediaName = "POS0210_MEDIA_$stamp.0210"
        val mediaTarget = SafPosStorage.createFile(context, structure.archive, mediaName)
        val dir = File(context.filesDir, "managed_media").apply { mkdirs() }
        SafPosStorage.overwrite(context, mediaTarget) { raw ->
            ZipOutputStream(raw).use { zip ->
                dir.listFiles()
                    ?.filter { it.isFile }
                    ?.sortedBy { it.name }
                    ?.forEach { file ->
                        zip.putNextEntry(ZipEntry(file.name))
                        file.inputStream().use { input -> input.copyTo(zip) }
                        zip.closeEntry()
                    }
            }
        }
        validateMediaArchive(context, mediaTarget)
        target
    }

    fun restoreLatest(context: Context, rootTreeUriString: String): Result<Unit> = runCatching {
        val structure = SafPosStorage.ensureSelectedRoot(context, rootTreeUriString).getOrThrow()
        val latest = validatedOrNull(context, SafPosStorage.findFile(context, structure.data, LATEST_NAME))
        val previous = validatedOrNull(context, SafPosStorage.findFile(context, structure.data, PREVIOUS_NAME))
        val uri = latest ?: previous ?: error("Không tìm thấy DATA backup hợp lệ")
        restoreDatabase(context, uri).getOrThrow()
        restoreMediaLatest(context, rootTreeUriString).getOrThrow()
        val master = ConfigBackup.findMaster(context, rootTreeUriString)
        if (master != null) {
            ConfigBackup.importConfig(context, master).getOrThrow()
        }
        kotlinx.coroutines.runBlocking {
            PosDatabase.get(context).dao().apply {
                saveSetting(AppSettingEntity("storage_root_uri", rootTreeUriString))
                saveSetting(AppSettingEntity("storage_write_enabled", "true"))
            }
        }
    }

    fun autoBackup(context: Context, rootTreeUriString: String): Result<Unit> =
        backupLatest(context, rootTreeUriString, includeMedia = false).map { Unit }

    fun restoreDatabase(context: Context, uri: Uri): Result<Unit> = runCatching {
        val temp = File(context.cacheDir, "pos0210-restore.tmp")
        val rollback = File(context.cacheDir, "pos0210-pre-restore.db")
        context.contentResolver.openInputStream(uri).use { input ->
            requireNotNull(input)
            temp.outputStream().use { output -> input.copyTo(output) }
        }
        validateSqlite(temp)

        PosDatabase.closeForRestore()
        val target = context.getDatabasePath(DB_NAME)
        target.parentFile?.mkdirs()

        if (target.exists()) {
            target.copyTo(rollback, overwrite = true)
        } else {
            rollback.delete()
        }

        fun clearSidecars() {
            File(target.path + "-wal").delete()
            File(target.path + "-shm").delete()
        }

        try {
            temp.copyTo(target, overwrite = true)
            clearSidecars()

            PosDatabase.get(context).openHelper.writableDatabase
            DatabaseHealth.validate(context).getOrThrow()

            rollback.delete()
            temp.delete()
        } catch (restoreError: Throwable) {
            PosDatabase.closeForRestore()
            if (rollback.exists()) {
                rollback.copyTo(target, overwrite = true)
                clearSidecars()
                runCatching {
                    PosDatabase.get(context).openHelper.writableDatabase
                    DatabaseHealth.validate(context).getOrThrow()
                }
            }
            temp.delete()
            throw IllegalStateException(
                "Khôi phục DATA thất bại, đã quay lại database trước đó: ${restoreError.message}",
                restoreError
            )
        }
    }

    fun restoreDatabaseAndApplyMaster(context: Context, uri: Uri, rootTreeUriString: String): Result<Unit> = runCatching {
        restoreDatabase(context, uri).getOrThrow()
        val dbName = displayName(context, uri).orEmpty()
        val archiveStamp = Regex("""POS0210_DATA_(\d{8}_\d{6})\.db""").matchEntire(dbName)?.groupValues?.get(1)
        if (archiveStamp != null) {
            val structure = SafPosStorage.ensureSelectedRoot(context, rootTreeUriString).getOrThrow()
            val media = SafPosStorage.findFile(context, structure.archive, "POS0210_MEDIA_${archiveStamp}.0210")
                ?: error("Thiếu MEDIA archive cùng mốc $archiveStamp; không dùng MEDIA_LATEST để tránh ghép sai dữ liệu")
            validateMediaArchive(context, media)
            restoreMediaFromUri(context, media)
        } else {
            restoreMediaLatest(context, rootTreeUriString).getOrThrow()
        }
        val master = ConfigBackup.findMaster(context, rootTreeUriString)
        if (master != null) {
            ConfigBackup.importConfig(context, master).getOrThrow()
        }
        kotlinx.coroutines.runBlocking {
            PosDatabase.get(context).dao().apply {
                saveSetting(AppSettingEntity("storage_root_uri", rootTreeUriString))
                saveSetting(AppSettingEntity("storage_write_enabled", "true"))
            }
        }
    }
}
