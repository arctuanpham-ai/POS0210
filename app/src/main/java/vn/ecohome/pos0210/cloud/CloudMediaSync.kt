package vn.ecohome.pos0210.cloud

import android.content.Context
import android.net.Uri
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import vn.ecohome.pos0210.data.PosDatabase
import java.io.File
import java.security.MessageDigest

data class CloudMediaResult(val uploaded:Int=0,val downloaded:Int=0,val skipped:Int=0,val errors:Int=0)

object CloudMediaSync {
    private const val STORE_ID="0210"
    private const val MANIFEST_TIMEOUT_MS=15_000L
    private const val ITEM_TIMEOUT_MS=20_000L
    private const val MAX_MEDIA_BYTES=12L*1024L*1024L

    private fun sha256(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
    private fun safeExt(uri:String)=when {
        uri.contains(".png",true)->"png"
        uri.contains(".webp",true)->"webp"
        else->"jpg"
    }
    private fun readLocal(context:Context,uri:String):ByteArray?=runCatching {
        val parsed=Uri.parse(uri)
        when(parsed.scheme){
            "content"->context.contentResolver.openInputStream(parsed)?.use{it.readBytes()}
            "file"->parsed.path?.let{File(it).takeIf(File::exists)?.readBytes()}
            null->File(uri).takeIf(File::exists)?.readBytes()
            else->null
        }
    }.getOrNull()?.takeIf{it.isNotEmpty()&&it.size<=MAX_MEDIA_BYTES}

    suspend fun uploadLocal(context:Context,fs:FirebaseFirestore,uid:String):CloudMediaResult {
        val dao=PosDatabase.get(context).dao()
        val items=dao.allMenuSnapshot().mapNotNull{m->m.imageUri?.takeIf(String::isNotBlank)?.let{Triple("menu",m.id,it)}}
        val combos=dao.allCombosSnapshot().mapNotNull{m->m.imageUri?.takeIf(String::isNotBlank)?.let{Triple("combo",m.id,it)}}
        val manifest=fs.collection("users").document(uid).collection("stores").document(STORE_ID).collection("media")
        val storage=FirebaseStorage.getInstance(FirebaseCloudSync.firebaseApp(context,FirebaseCloudSync.config(context))).reference
        var uploaded=0;var skipped=0;var errors=0
        for((type,id,uri) in items+combos){
            runCatching {
                val bytes=readLocal(context,uri)?:error("LOCAL_MEDIA_UNREADABLE")
                val hash=sha256(bytes)
                val mediaId="${type}_${id}"
                val doc=manifest.document(mediaId)
                val old=withTimeout(MANIFEST_TIMEOUT_MS){doc.get().await()}
                if(old.getString("sha256")==hash){skipped++;return@runCatching}
                val ext=safeExt(uri);val cloudPath="users/$uid/stores/$STORE_ID/media/$mediaId.$ext"
                withTimeout(ITEM_TIMEOUT_MS){storage.child(cloudPath).putBytes(bytes).await()}
                withTimeout(MANIFEST_TIMEOUT_MS){doc.set(mapOf("mediaId" to mediaId,"entityType" to type,"entityId" to id,"cloudPath" to cloudPath,"sha256" to hash,"bytes" to bytes.size,"version" to ((old.getLong("version")?:0L)+1L),"updatedAt" to System.currentTimeMillis())).await()}
                uploaded++
            }.onFailure{errors++}
        }
        return CloudMediaResult(uploaded=uploaded,skipped=skipped,errors=errors)
    }

    suspend fun restoreMissing(context:Context,fs:FirebaseFirestore,uid:String):CloudMediaResult {
        val dao=PosDatabase.get(context).dao()
        val docs=withTimeout(MANIFEST_TIMEOUT_MS){fs.collection("users").document(uid).collection("stores").document(STORE_ID).collection("media").get().await().documents}
        val app=FirebaseCloudSync.firebaseApp(context,FirebaseCloudSync.config(context))
        val storage=FirebaseStorage.getInstance(app).reference
        val dir=File(context.filesDir,"managed_media").apply{mkdirs()}
        var downloaded=0;var skipped=0;var errors=0
        for(doc in docs){
            runCatching {
                val type=doc.getString("entityType")?:return@runCatching
                val id=doc.getString("entityId")?:return@runCatching
                val cloudPath=doc.getString("cloudPath")?:return@runCatching
                val expected=doc.getString("sha256")?:return@runCatching
                val ext=cloudPath.substringAfterLast('.', "jpg")
                val target=File(dir,"${type}_${id}.$ext")
                val current=target.takeIf(File::exists)?.readBytes()
                if(current!=null&&sha256(current)==expected){skipped++}
                else{
                    val max=doc.getLong("bytes")?.coerceAtMost(MAX_MEDIA_BYTES)?:MAX_MEDIA_BYTES
                    val bytes=withTimeout(ITEM_TIMEOUT_MS){storage.child(cloudPath).getBytes(max.coerceAtLeast(1L)).await()}
                    require(sha256(bytes)==expected){"MEDIA_HASH_MISMATCH"}
                    val tmp=File(dir,target.name+".tmp");tmp.writeBytes(bytes)
                    if(target.exists())target.delete()
                    require(tmp.renameTo(target)){"MEDIA_RENAME_FAILED"}
                    downloaded++
                }
                val localUri=Uri.fromFile(target).toString()
                when(type){"menu"->dao.updateMenuImage(id,localUri);"combo"->dao.updateComboImage(id,localUri)}
            }.onFailure{errors++}
        }
        return CloudMediaResult(downloaded=downloaded,skipped=skipped,errors=errors)
    }
}
