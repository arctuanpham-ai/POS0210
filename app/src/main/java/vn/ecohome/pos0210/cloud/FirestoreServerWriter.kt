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

/** Room remains the outbox; HTTP commit returns a server receipt, never a local-cache ACK. */
internal object FirestoreServerWriter {
    suspend fun set(doc:DocumentReference,data:Map<String,Any?>) = commit(doc.firestore,listOf(doc.path to data))
    suspend fun commit(fs:FirebaseFirestore,rows:List<Pair<String,Map<String,Any?>>>) {
        execute(fs,rows.map{it.first}) { project->rows.map{FirestoreWire.set(project,it.first,it.second)} }
    }
    suspend fun delete(fs:FirebaseFirestore,paths:List<String>) {
        execute(fs,paths) { project->paths.map{FirestoreWire.delete(project,it)} }
    }
    private suspend fun execute(fs:FirebaseFirestore,paths:List<String>,encode:(String)->List<Map<String,Any?>>) {
        if(paths.isEmpty())return
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
            if(group.isNotEmpty()&&(group.size==400||bytes+size>5_000_000)){groups.add(group);group=mutableListOf();bytes=0}
            group.add(write);bytes+=size
        }
        if(group.isNotEmpty())groups.add(group)
        for((index,chunk) in groups.withIndex()){
            currentCoroutineContext().ensureActive()
            val token=CloudExecution.stage("HTTP_AUTH_TOKEN",10_000L){user.getIdToken(false).await().token}?:error("AUTH_TOKEN_MISSING")
            CloudExecution.trace("HTTP_COMMIT START count=${chunk.size} group=${index+1}")
            val receipt=withContext(Dispatchers.IO){FirestoreHttpCommit.send(URL("https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents:commit"),token,chunk)}
            currentCoroutineContext().ensureActive()
            CloudExecution.trace("HTTP_COMMIT SERVER_ACK count=${chunk.size} commitTime=$receipt")
        }
    }
}
