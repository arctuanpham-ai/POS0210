package vn.ecohome.pos0210.cloud

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Base64
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.sync.withLock
import vn.ecohome.pos0210.data.PosDatabase
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream

data class CloudBackupInfo(
    val createdAt:Long,
    val bytes:Int,
    val chunks:Int,
    val slot:String=""
)

/**
 * Private Room backup stored in two alternating Firestore slots (A/B).
 * One valid slot is always left untouched while the other slot is rewritten.
 * Media stays local/SAF and is deliberately excluded.
 */
object FirestorePrivateBackup {
    private const val STORE_ID="0210"
    private const val CHUNK_SIZE=480_000
    private const val MAX_CHUNKS=200
    private const val FORMAT="POS0210_ROOM_GZIP_V2_AB"
    private const val LEGACY_FORMAT="POS0210_ROOM_GZIP_V1"

    private fun root(fs:FirebaseFirestore,uid:String)=
        fs.collection("users").document(uid)
            .collection("stores").document(STORE_ID)
            .collection("privateBackup").document("room")

    private fun slotDoc(root:com.google.firebase.firestore.DocumentReference,slot:String)=
        root.collection("slots").document(slot)

    private suspend fun <T> stage(name:String,block:suspend()->T):T =
        try{block()}catch(e:Throwable){throw IllegalStateException("$name: ${e.message}",e)}

    suspend fun upload(context:Context,fs:FirebaseFirestore,uid:String,now:Long):CloudBackupInfo {
        val staged=makeScrubbedCopy(context)
        try {
            val zipped=gzip(staged.readBytes())
            val encoded=Base64.encodeToString(zipped,Base64.NO_WRAP)
            val chunks=encoded.chunked(CHUNK_SIZE)
            require(chunks.isNotEmpty()&&chunks.size<=MAX_CHUNKS){
                "Cloud backup quá lớn; hãy lưu archive SAF và liên hệ hỗ trợ"
            }

            val privateRoot=root(fs,uid)
            val a=stage("BACKUP_READ_SLOT_A"){slotDoc(privateRoot,"A").get().await()}
            val b=stage("BACKUP_READ_SLOT_B"){slotDoc(privateRoot,"B").get().await()}
            val target=chooseTargetSlot(a,b)
            val targetDoc=slotDoc(privateRoot,target)

            // Mark only the target slot as WRITING. The other VALID slot stays untouched.
            stage("BACKUP_MARK_WRITING"){
                targetDoc.set(mapOf(
                    "slot" to target,
                    "status" to "WRITING",
                    "startedAt" to now,
                    "format" to FORMAT
                )).await()
            }

            // Clear stale chunks only from the target slot.
            stage("BACKUP_CLEAR_TARGET"){deleteSlotChunks(targetDoc)}

            chunks.chunked(350).forEachIndexed { groupIndex,group ->
                val batch=fs.batch()
                group.forEachIndexed { offset,data ->
                    val index=groupIndex*350+offset
                    batch.set(
                        targetDoc.collection("chunks").document(index.toString().padStart(4,'0')),
                        mapOf("index" to index,"data" to data)
                    )
                }
                stage("BACKUP_WRITE_CHUNKS"){batch.commit().await()}
            }

            val checksum=sha256(zipped)
            stage("BACKUP_WRITE_META"){
                targetDoc.set(mapOf(
                    "slot" to target,
                    "status" to "VALID",
                    "createdAt" to now,
                    "bytes" to zipped.size,
                    "chunks" to chunks.size,
                    "sha256" to checksum,
                    "format" to FORMAT
                )).await()
            }
            stage("BACKUP_WRITE_ROOT"){
                privateRoot.set(mapOf(
                    "activeSlot" to target,
                    "updatedAt" to now,
                    "format" to FORMAT,
                    "retentionSlots" to 2
                )).await()
            }
            return CloudBackupInfo(now,zipped.size,chunks.size,target)
        } finally {
            staged.delete()
        }
    }

    suspend fun latestInfo(context:Context):CloudBackupInfo? {
        val config=FirebaseCloudSync.config(context)
        require(config.valid){"Chưa cấu hình Firebase"}
        val app=FirebaseCloudSync.firebaseApp(context,config)
        val uid=com.google.firebase.auth.FirebaseAuth.getInstance(app).currentUser?.uid
            ?:error("Chưa đăng nhập Firebase")
        val fs=FirebaseFirestore.getInstance(app)
        val privateRoot=root(fs,uid)
        val slots=listOf("A","B").mapNotNull { slot ->
            val doc=slotDoc(privateRoot,slot).get().await()
            doc.takeIf{isValidSlot(it)}?.let{
                CloudBackupInfo(
                    it.getLong("createdAt")?:0L,
                    it.getLong("bytes")?.toInt()?:0,
                    it.getLong("chunks")?.toInt()?:0,
                    slot
                )
            }
        }
        if(slots.isNotEmpty()) return slots.maxByOrNull{it.createdAt}
        return legacyLatestInfo(privateRoot)
    }

    suspend fun restoreLatest(context:Context):CloudBackupInfo = CloudOperationGuard.mutex.withLock { restoreLatestUnlocked(context) }

    private suspend fun restoreLatestUnlocked(context:Context):CloudBackupInfo {
        val config=FirebaseCloudSync.config(context)
        require(config.valid){"Chưa cấu hình Firebase"}
        val app=FirebaseCloudSync.firebaseApp(context,config)
        val uid=com.google.firebase.auth.FirebaseAuth.getInstance(app).currentUser?.uid
            ?:error("Chưa đăng nhập Firebase")
        val fs=FirebaseFirestore.getInstance(app)
        val privateRoot=root(fs,uid)

        val candidates=listOf("A","B").mapNotNull { slot ->
            val doc=stage("RESTORE_READ_SLOT_$slot"){slotDoc(privateRoot,slot).get().await()}
            doc.takeIf{isValidSlot(it)}?.let{slot to it}
        }.sortedByDescending { (_,doc)->doc.getLong("createdAt")?:0L }

        val errors=mutableListOf<String>()
        for((slot,manifest) in candidates){
            val attempt=runCatching{restoreSlot(context,privateRoot,slot,manifest)}
            if(attempt.isSuccess)return attempt.getOrThrow()
            errors += "$slot: ${attempt.exceptionOrNull()?.message}"
        }

        // Backward compatibility with the single-generation backup used by candidate27.
        val legacy=runCatching{restoreLegacy(context,privateRoot)}
        if(legacy.isSuccess)return legacy.getOrThrow()
        val detail=(errors+listOfNotNull(legacy.exceptionOrNull()?.message)).joinToString(" · ")
        error(if(detail.isBlank())"Chưa có cloud backup hợp lệ để khôi phục" else "Không khôi phục được backup: $detail")
    }

    private fun chooseTargetSlot(a:DocumentSnapshot,b:DocumentSnapshot):String {
        val aValid=isValidSlot(a)
        val bValid=isValidSlot(b)
        if(!aValid)return "A"
        if(!bValid)return "B"
        val aAt=a.getLong("createdAt")?:0L
        val bAt=b.getLong("createdAt")?:0L
        return if(aAt<=bAt)"A" else "B"
    }

    private fun isValidSlot(doc:DocumentSnapshot):Boolean =
        doc.exists() &&
            doc.getString("status")=="VALID" &&
            doc.getString("format")==FORMAT &&
            (doc.getLong("chunks")?:0L) in 1..MAX_CHUNKS.toLong()

    private suspend fun restoreSlot(
        context:Context,
        privateRoot:com.google.firebase.firestore.DocumentReference,
        slot:String,
        manifest:DocumentSnapshot
    ):CloudBackupInfo {
        val count=manifest.getLong("chunks")?.toInt()?:0
        require(count in 1..MAX_CHUNKS){"Backup slot $slot lỗi số mảnh"}
        val parts=stage("RESTORE_READ_CHUNKS_$slot"){
            slotDoc(privateRoot,slot).collection("chunks").orderBy("index").get().await().documents
        }
        require(parts.size==count){"Backup slot $slot thiếu dữ liệu"}
        val compressed=Base64.decode(
            parts.joinToString(""){it.getString("data").orEmpty()},
            Base64.NO_WRAP
        )
        require(sha256(compressed)==manifest.getString("sha256")){"Backup slot $slot sai checksum"}
        val restored=gunzip(compressed)
        validateAndReplace(context,restored)
        return CloudBackupInfo(
            manifest.getLong("createdAt")?:0L,
            compressed.size,
            count,
            slot
        )
    }

    private suspend fun deleteSlotChunks(slot:com.google.firebase.firestore.DocumentReference){
        val docs=slot.collection("chunks").get().await().documents
        docs.chunked(400).forEach { group ->
            val batch=slot.firestore.batch()
            group.forEach{batch.delete(it.reference)}
            batch.commit().await()
        }
    }

    private suspend fun legacyLatestInfo(
        privateRoot:com.google.firebase.firestore.DocumentReference
    ):CloudBackupInfo? {
        val doc=privateRoot.collection("meta").document("latest").get().await()
        if(!doc.exists()||doc.getString("format")!=LEGACY_FORMAT)return null
        return CloudBackupInfo(
            doc.getLong("createdAt")?:0L,
            doc.getLong("bytes")?.toInt()?:0,
            doc.getLong("chunks")?.toInt()?:0,
            "LEGACY"
        )
    }

    private suspend fun restoreLegacy(
        context:Context,
        privateRoot:com.google.firebase.firestore.DocumentReference
    ):CloudBackupInfo {
        val manifest=privateRoot.collection("meta").document("latest").get().await()
        require(manifest.exists()&&manifest.getString("format")==LEGACY_FORMAT){
            "Không có backup legacy"
        }
        val count=manifest.getLong("chunks")?.toInt()?:0
        require(count in 1..MAX_CHUNKS){"Cloud backup legacy lỗi số mảnh"}
        val generation=manifest.getString("generation")?:error("Backup legacy thiếu generation")
        val parts=privateRoot.collection("generations").document(generation)
            .collection("chunks").orderBy("index").get().await().documents
        require(parts.size==count){"Backup legacy thiếu dữ liệu"}
        val compressed=Base64.decode(
            parts.joinToString(""){it.getString("data").orEmpty()},
            Base64.NO_WRAP
        )
        require(sha256(compressed)==manifest.getString("sha256")){"Backup legacy sai checksum"}
        validateAndReplace(context,gunzip(compressed))
        return CloudBackupInfo(
            manifest.getLong("createdAt")?:0L,
            compressed.size,
            count,
            "LEGACY"
        )
    }

    private fun validateDatabaseFile(file:File):Int {
        return SQLiteDatabase.openDatabase(file.absolutePath,null,SQLiteDatabase.OPEN_READONLY).use { db ->
            val integrity=db.rawQuery("PRAGMA integrity_check",null).use{cursor->
                if(cursor.moveToFirst())cursor.getString(0) else ""
            }
            require(integrity.equals("ok",ignoreCase=true)){"Cloud backup DB integrity_check lỗi: $integrity"}
            val version=db.rawQuery("PRAGMA user_version",null).use{cursor->
                if(cursor.moveToFirst())cursor.getInt(0) else 0
            }
            require(version in 3..19){"Cloud backup DB schema không được hỗ trợ: v$version"}
            val required=setOf("BillEntity","PaymentEntity","OrderBatchEntity","PurchaseEntity","EmployeeEntity","AppSettingEntity")
            val found=mutableSetOf<String>()
            db.rawQuery("SELECT name FROM sqlite_master WHERE type='table'",null).use{cursor->
                while(cursor.moveToNext())found+=cursor.getString(0)
            }
            val missing=required.filter{it !in found}
            require(missing.isEmpty()){"Cloud backup DB thiếu bảng lõi: ${missing.joinToString()}"}
            version
        }
    }

    private fun validateAndReplace(context:Context,restored:ByteArray){
        val staged=File(context.cacheDir,"pos0210-cloud-restore.db")
        staged.outputStream().use{it.write(restored)}
        try{
            validateDatabaseFile(staged)
            replaceDatabase(context,staged)
        }finally{
            staged.delete()
        }
    }

    private fun makeScrubbedCopy(context:Context):File {
        val room=PosDatabase.get(context)
        room.openHelper.writableDatabase.query("PRAGMA wal_checkpoint(FULL)").close()
        val source=context.getDatabasePath("pos0210.db")
        require(source.exists()){"Không tìm thấy dữ liệu POS"}
        val copy=File(context.cacheDir,"pos0210-cloud-upload.db")
        source.copyTo(copy,true)
        SQLiteDatabase.openDatabase(copy.absolutePath,null,SQLiteDatabase.OPEN_READWRITE).use { db ->
            db.execSQL("DELETE FROM BankNotificationEventEntity")
            db.execSQL("DELETE FROM PrintJobEntity")
            db.execSQL("DELETE FROM AuditEventEntity")
            db.execSQL("DELETE FROM AppSettingEntity WHERE key IN ('autoback_tree_uri','master_config_uri','storage_root_uri','storage_write_enabled')")
            db.execSQL("UPDATE MenuItemEntity SET imageUri=NULL")
            db.execSQL("UPDATE ComboEntity SET imageUri=NULL")
            db.execSQL("UPDATE PurchaseEntity SET invoiceImageUri=NULL")
        }
        return copy
    }

    private fun gzip(raw:ByteArray)=ByteArrayOutputStream().use { out ->
        GZIPOutputStream(out).use{it.write(raw)}
        out.toByteArray()
    }
    private fun gunzip(raw:ByteArray)=
        GZIPInputStream(ByteArrayInputStream(raw)).use{it.readBytes()}
    private fun sha256(raw:ByteArray)=
        MessageDigest.getInstance("SHA-256").digest(raw).joinToString(""){"%02x".format(it)}

    private fun replaceDatabase(context:Context,staged:File){
        val target=context.getDatabasePath("pos0210.db")
        val safety=File(target.parentFile,"pos0210-before-cloud-restore.db")
        val hadTarget=target.exists()
        PosDatabase.closeForRestore()
        if(safety.exists())safety.delete()
        if(hadTarget)target.copyTo(safety,true)
        File(target.path+"-wal").delete()
        File(target.path+"-shm").delete()
        try{
            staged.copyTo(target,true)
            // Opening Room validates the identity hash and applies only supported migrations.
            val live=PosDatabase.get(context).openHelper.writableDatabase
            val integrity=live.query("PRAGMA integrity_check").use{cursor->
                if(cursor.moveToFirst())cursor.getString(0) else ""
            }
            require(integrity.equals("ok",ignoreCase=true)){"DB sau restore integrity_check lỗi: $integrity"}
            require(live.version==19){"DB sau restore sai schema: v${live.version}"}
        }catch(e:Throwable){
            PosDatabase.closeForRestore()
            File(target.path+"-wal").delete()
            File(target.path+"-shm").delete()
            if(hadTarget&&safety.exists())safety.copyTo(target,true) else target.delete()
            runCatching{
                val rolledBack=PosDatabase.get(context).openHelper.writableDatabase
                rolledBack.query("PRAGMA integrity_check").use{cursor->
                    require(cursor.moveToFirst()&&cursor.getString(0).equals("ok",ignoreCase=true))
                }
            }
            throw IllegalStateException("Cloud restore bị từ chối; dữ liệu cũ đã được phục hồi: ${e.message}",e)
        }
    }
}
