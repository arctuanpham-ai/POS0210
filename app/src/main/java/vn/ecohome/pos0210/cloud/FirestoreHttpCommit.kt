package vn.ecohome.pos0210.cloud

import java.net.URL
import java.net.HttpURLConnection
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

internal object FirestoreWire {
    private fun name(project:String,path:String):String {
        require(project.matches(Regex("[a-zA-Z0-9-]+")))
        require(path.split('/').let{it.size%2==0&&it.all(String::isNotBlank)}){"INVALID_DOCUMENT_PATH"}
        return "projects/$project/databases/(default)/documents/$path"
    }
    fun set(project:String,path:String,data:Map<String,Any?>):Map<String,Any?> =
        mapOf("update" to mapOf("name" to name(project,path),"fields" to data.mapValues{value(it.value)}))
    fun delete(project:String,path:String):Map<String,Any?> = mapOf("delete" to name(project,path))
    private fun value(v:Any?):Map<String,Any?> = when(v){
        null -> mapOf("nullValue" to JSONObject.NULL)
        is String -> mapOf("stringValue" to v)
        is Boolean -> mapOf("booleanValue" to v)
        is Byte,is Short,is Int,is Long -> mapOf("integerValue" to v.toString())
        is Float -> {require(v.isFinite());mapOf("doubleValue" to v.toDouble())}
        is Double -> {require(v.isFinite());mapOf("doubleValue" to v)}
        is List<*> -> mapOf("arrayValue" to mapOf("values" to v.map{value(it)}))
        is Map<*,*> -> {require(v.keys.all{it is String});mapOf("mapValue" to mapOf("fields" to v.entries.associate{it.key.toString() to value(it.value)}))}
        else -> error("UNSUPPORTED_FIRESTORE_VALUE ${v.javaClass.simpleName}")
    }
}
internal object FirestoreHttpCommit {
    private val watchdog=Executors.newSingleThreadScheduledExecutor{r->Thread(r,"pos0210-http-deadline").apply{isDaemon=true}}
    fun send(url:URL,token:String,writes:List<Map<String,Any?>>,deadlineMs:Long=12_000L):String {
        require(token.isNotBlank()){"AUTH_TOKEN_MISSING"}
        require(writes.isNotEmpty()&&writes.size<=400)
        val body=JSONObject(mapOf("writes" to writes)).toString().toByteArray(Charsets.UTF_8)
        require(body.size<8_000_000){"COMMIT_REQUEST_TOO_LARGE"}
        val connection=url.openConnection() as HttpURLConnection
        val expired=AtomicBoolean(false)
        val abort=watchdog.schedule({expired.set(true);connection.disconnect()},deadlineMs,TimeUnit.MILLISECONDS)
        try {
            connection.requestMethod="POST"
            connection.instanceFollowRedirects=false
            connection.connectTimeout=5_000
            connection.readTimeout=8_000
            connection.setRequestProperty("Authorization","Bearer $token")
            connection.setRequestProperty("Content-Type","application/json; charset=utf-8")
            connection.doOutput=true
            connection.setFixedLengthStreamingMode(body.size)
            connection.outputStream.use{it.write(body)}
            val status=connection.responseCode
            val stream=if(status in 200..299)connection.inputStream else connection.errorStream
            val response=stream?.bufferedReader(Charsets.UTF_8)?.use{it.readText()}.orEmpty()
            if(status !in 200..299){
                val err=runCatching{JSONObject(response).optJSONObject("error")}.getOrNull()
                throw IOException("HTTP_$status ${err?.optString("status").orEmpty()} ${err?.optString("message").orEmpty().take(180)}")
            }
            val receipt=JSONObject(response)
            val time=receipt.optString("commitTime")
            check(time.isNotBlank()&&receipt.optJSONArray("writeResults")?.length()==writes.size){"COMMIT_UNCONFIRMED"}
            return time
        } catch(e:Exception){
            if(expired.get())throw IOException("HTTP_TIMEOUT: server chưa xác nhận sau ${deadlineMs}ms",e)
            throw e
        } finally {abort.cancel(false);connection.disconnect()}
    }
}
