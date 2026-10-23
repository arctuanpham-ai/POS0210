package vn.ecohome.pos0210.cloud

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL
import java.util.UUID
import android.content.Context

/** Room remains the outbox; HTTP commit returns a server receipt, never a local-cache ACK. */
internal object FirestoreServerWriter {
    suspend fun set(doc:DocumentReference,data:Map<String,Any?>,operation:String=UUID.randomUUID().toString()) {
        val category=CloudQuotaPolicy.category(doc.path)
        val cached=category in setOf("dashboard","catalog","system")
        val stable=when(category){"dashboard"->data-"lastUpdatedAt";"catalog","system"->data-"updatedAt";else->data}
        val hash=java.security.MessageDigest.getInstance("SHA-256").digest(stable.toSortedMap().toString().toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
        val key="${doc.firestore.app.options.projectId}/${doc.path}"
        val ack=doc.firestore.app.applicationContext.getSharedPreferences("pos0210_cloud_ack_v1",Context.MODE_PRIVATE)
        if(cached&&ack.getString(key,null)==hash)return
        commit(doc.firestore,listOf(doc.path to data),operation)
        if(cached)ack.edit().putString(key,hash).commit()
    }
    suspend fun commit(fs:FirebaseFirestore,rows:List<Pair<String,Map<String,Any?>>>,operation:String=UUID.randomUUID().toString()) {
        execute(fs,rows.map{it.first},operation,false) { project->rows.map{FirestoreWire.set(project,it.first,it.second)} }
    }
    suspend fun delete(fs:FirebaseFirestore,paths:List<String>,operation:String=UUID.randomUUID().toString()) {
        execute(fs,paths,operation,true) { project->paths.map{FirestoreWire.delete(project,it)} }
    }
    private suspend fun execute(fs:FirebaseFirestore,paths:List<String>,operation:String,deleting:Boolean,encode:(String)->List<Map<String,Any?>>) {
        if(paths.isEmpty())return
        CloudQuotaGuard.check(fs)
        val user=FirebaseAuth.getInstance(fs.app).currentUser?:error("AUTH_SESSION_MISSING")
        val expected=vn.ecohome.pos0210.data.PosDatabase.get(fs.app.applicationContext).dao().cloudSyncStateSnapshot()?.syncedUid
        require(expected==null||expected==user.uid){"AUTH_UID_MISMATCH"}
        require(paths.all{it.startsWith("users/${user.uid}/stores/0210/")||it=="users/${user.uid}/stores/0210"}){"WRITE_SCOPE_MISMATCH"}
        val project=fs.app.options.projectId?:error("PROJECT_ID_MISSING")
        val writes=encode(project)
        var group=mutableListOf<Map<String,Any?>>()
        var bytes=0
        val groups=mutableListOf<List<Map<String,Any?>>>()
        writes.forEach { write->
            val size=JSONObject(write).toString().toByteArray(Charsets.UTF_8).size
            require(size<5_000_000){"DOCUMENT_TOO_LARGE"}
            if(group.isNotEmpty()&&(group.size==399||bytes+size>5_000_000)){groups.add(group);group=mutableListOf();bytes=0}
            group.add(write);bytes+=size
        }
        if(group.isNotEmpty())groups.add(group)
        for((index,chunk) in groups.withIndex()){
            currentCoroutineContext().ensureActive()
            val token=CloudExecution.stage("HTTP_AUTH_TOKEN",10_000L){user.getIdToken(false).await().token}?:error("AUTH_TOKEN_MISSING")
            CloudExecution.trace("HTTP_COMMIT START count=${chunk.size} group=${index+1}")
            val base="https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents"
            val charges=if(deleting)mapOf("backup" to 0L) else chunk.groupingBy{write->
                val update=write.getValue("update") as Map<*,*>
                CloudQuotaPolicy.category(update["name"].toString().substringAfter("/documents/"))
            }.eachCount().mapValues{it.value.toLong()}
            try {
                val data=withContext(Dispatchers.IO){CloudQuotaCommit.execute(project,"users/${user.uid}/stores/0210",CloudQuotaGuard.device(fs),operation,chunk,charges,System.currentTimeMillis(),
                    {path->FirestoreHttpCommit.readQuota(URL("$base/$path"),token).also{CloudQuotaGuard.observed(fs,it.data)}},
                    {writes->FirestoreHttpCommit.send(URL("$base:commit"),token,writes)})}
                CloudQuotaGuard.observed(fs,data)
            }catch(e:Exception){CloudQuotaGuard.failed(fs,e);throw e}
            currentCoroutineContext().ensureActive()
            CloudExecution.trace("HTTP_COMMIT SERVER_ACK count=${chunk.size}")
        }
    }
}
