package vn.ecohome.pos0210.cloud

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import vn.ecohome.pos0210.data.PosDatabase
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest

data class CloudMediaResult(val uploaded:Int=0,val downloaded:Int=0,val skipped:Int=0,val errors:Int=0,val firstError:String?=null)

object CloudMediaSync {
    private const val STORE_ID="0210"
    private const val TIMEOUT_MS=20_000L
    private const val MAX_SOURCE_BYTES=16L*1024L*1024L
    // Base64 overhead and Firestore's 1 MiB document limit: keep encoded payload below ~600 KiB.
    private const val MAX_COMPRESSED_BYTES=450_000
    private fun sha256(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
    private fun collection(fs:FirebaseFirestore,uid:String)=fs.collection("users").document(uid).collection("stores").document(STORE_ID).collection("media")

    private fun readLocal(context:Context,uri:String):ByteArray?=runCatching {
        val parsed=Uri.parse(uri)
        when(parsed.scheme){
            "content"->context.contentResolver.openInputStream(parsed)?.use{it.readBytes()}
            "file"->parsed.path?.let{File(it).takeIf(File::exists)?.readBytes()}
            null->File(uri).takeIf(File::exists)?.readBytes()
            else->null
        }
    }.getOrNull()?.takeIf{it.isNotEmpty()&&it.size<=MAX_SOURCE_BYTES}

    private fun compress(bytes:ByteArray):ByteArray {
        val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true}
        BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
        require(bounds.outWidth>0&&bounds.outHeight>0){"MEDIA_DECODE_FAILED"}
        var sample=1
        while(maxOf(bounds.outWidth,bounds.outHeight)/sample>1280)sample*=2
        val opts=BitmapFactory.Options().apply{inSampleSize=sample;inPreferredConfig=Bitmap.Config.RGB_565}
        val decoded=BitmapFactory.decodeByteArray(bytes,0,bytes.size,opts)?:error("MEDIA_DECODE_FAILED")
        try {
            var current=decoded
            if(maxOf(decoded.width,decoded.height)>1280){
                val scale=1280f/maxOf(decoded.width,decoded.height)
                current=Bitmap.createScaledBitmap(decoded,(decoded.width*scale).toInt().coerceAtLeast(1),(decoded.height*scale).toInt().coerceAtLeast(1),true)
            }
            try {
                for(quality in listOf(82,72,60,45,30)){
                    val out=ByteArrayOutputStream()
                    current.compress(Bitmap.CompressFormat.JPEG,quality,out)
                    val data=out.toByteArray()
                    if(data.size<=MAX_COMPRESSED_BYTES)return data
                }
                error("MEDIA_TOO_LARGE_AFTER_COMPRESSION")
            } finally {if(current!==decoded)current.recycle()}
        } finally {decoded.recycle()}
    }

    suspend fun cloudManifestCount(context:Context,fs:FirebaseFirestore,uid:String):Int =
        withTimeout(TIMEOUT_MS){collection(fs,uid).get().await().size()}

    suspend fun uploadLocal(context:Context,fs:FirebaseFirestore,uid:String):CloudMediaResult=withContext(Dispatchers.IO){
        CloudQuotaGuard.check(fs)
        val dao=PosDatabase.get(context).dao()
        val items=dao.allMenuSnapshot().mapNotNull{m->m.imageUri?.takeIf(String::isNotBlank)?.let{Triple("menu",m.id,it)}}
        val combos=dao.allCombosSnapshot().mapNotNull{m->m.imageUri?.takeIf(String::isNotBlank)?.let{Triple("combo",m.id,it)}}
        val manifest=collection(fs,uid)
        var uploaded=0;var skipped=0;var errors=0;var firstError:String?=null
        for((type,id,uri) in items+combos){
            try {
                val source=readLocal(context,uri)?:error("LOCAL_MEDIA_UNREADABLE")
                val sourceHash=sha256(source)
                val doc=manifest.document("${type}_${id}")
                val old=withTimeout(TIMEOUT_MS){doc.get().await()}
                if(old.getString("sourceSha256")==sourceHash&&old.getString("encoding")=="jpeg-base64-v1"&&old.getString("payload")?.isNotBlank()==true&&old.getString("sha256")?.isNotBlank()==true){skipped++;continue}
                val compressed=compress(source)
                val payload=Base64.encodeToString(compressed,Base64.NO_WRAP)
                val data=mapOf("mediaId" to "${type}_${id}","entityType" to type,"entityId" to id,
                    "encoding" to "jpeg-base64-v1","payload" to payload,"sha256" to sha256(compressed),
                    "sourceSha256" to sourceHash,"bytes" to compressed.size,
                    "version" to ((old.getLong("version")?:0L)+1L),"updatedAt" to System.currentTimeMillis())
                withTimeout(45_000L){FirestoreServerWriter.set(doc,data)}
                uploaded++
            }catch(e:Exception){
                if(e is kotlinx.coroutines.CancellationException)throw e
                errors++;if(firstError==null)firstError=e.message?:e.javaClass.simpleName
                if(!CloudQuotaGuard.retry(e))break
            }
        }
        CloudMediaResult(uploaded=uploaded,skipped=skipped,errors=errors,firstError=firstError)
    }

    suspend fun restoreMissing(context:Context,fs:FirebaseFirestore,uid:String):CloudMediaResult=withContext(Dispatchers.IO){
        val dao=PosDatabase.get(context).dao()
        val docs=withTimeout(TIMEOUT_MS){collection(fs,uid).get().await().documents}
        val dir=File(context.filesDir,"managed_media").apply{mkdirs()}
        var downloaded=0;var skipped=0;var errors=0;var firstError:String?=null
        for(doc in docs){
            try {
                if(doc.getString("encoding")!="jpeg-base64-v1"){skipped++;continue}
                val type=doc.getString("entityType")?:error("MEDIA_TYPE_MISSING")
                require(type=="menu"||type=="combo"){"MEDIA_TYPE_INVALID"}
                val id=doc.getString("entityId")?:error("MEDIA_ID_MISSING")
                require(id.matches(Regex("[a-zA-Z0-9_-]{1,120}"))){"MEDIA_ID_INVALID"}
                val expected=doc.getString("sha256")?:error("MEDIA_HASH_MISSING")
                val target=File(dir,"${type}_${id}.jpg")
                val current=target.takeIf(File::exists)?.readBytes()
                if(current!=null&&sha256(current)==expected){skipped++}
                else {
                    val payload=doc.getString("payload")?:error("MEDIA_PAYLOAD_MISSING")
                    require(payload.length<=650_000){"MEDIA_PAYLOAD_TOO_LARGE"}
                    val bytes=Base64.decode(payload,Base64.DEFAULT)
                    require(bytes.isNotEmpty()&&bytes.size<=MAX_COMPRESSED_BYTES&&sha256(bytes)==expected){"MEDIA_HASH_MISMATCH"}
                    val tmp=File(dir,target.name+".tmp");tmp.writeBytes(bytes)
                    require(tmp.renameTo(target)||run{target.delete()&&tmp.renameTo(target)}){"MEDIA_RENAME_FAILED"}
                    downloaded++
                }
                // Never overwrite a readable original on the source device with a compressed copy.
                val existing=when(type){"menu"->dao.allMenuSnapshot().firstOrNull{it.id==id}?.imageUri;else->dao.allCombosSnapshot().firstOrNull{it.id==id}?.imageUri}
                if(existing.isNullOrBlank()||readLocal(context,existing)==null){
                    val localUri=Uri.fromFile(target).toString()
                    if(type=="menu")dao.updateMenuImage(id,localUri) else dao.updateComboImage(id,localUri)
                }
            }catch(e:Exception){
                if(e is kotlinx.coroutines.CancellationException)throw e
                errors++;if(firstError==null)firstError=e.message?:e.javaClass.simpleName
                if(!CloudQuotaGuard.retry(e))break
            }
        }
        CloudMediaResult(downloaded=downloaded,skipped=skipped,errors=errors,firstError=firstError)
    }
}
