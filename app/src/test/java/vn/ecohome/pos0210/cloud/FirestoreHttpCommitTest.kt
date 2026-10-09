package vn.ecohome.pos0210.cloud

import java.net.ServerSocket
import java.net.InetAddress
import java.net.URL
import java.io.IOException
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class FirestoreHttpCommitTest {
    @Test fun wire_preserves_money_nulls_and_nested_fields() {
        val write=FirestoreWire.set("pos0210-17ce4","users/u/stores/0210/purchases/p",mapOf("total" to Long.MAX_VALUE,"supplierId" to null,"qty" to 1.5,"active" to true,"names" to listOf("gà","café")))
        val json=JSONObject(write).getJSONObject("update")
        assertEquals("projects/pos0210-17ce4/databases/(default)/documents/users/u/stores/0210/purchases/p",json.getString("name"))
        val fields=json.getJSONObject("fields")
        assertEquals(Long.MAX_VALUE.toString(),fields.getJSONObject("total").getString("integerValue"))
        assertTrue(fields.getJSONObject("supplierId").has("nullValue"))
        assertEquals(1.5,fields.getJSONObject("qty").getDouble("doubleValue"),0.0)
        assertEquals("gà",fields.getJSONObject("names").getJSONObject("arrayValue").getJSONArray("values").getJSONObject(0).getString("stringValue"))
    }
    @Test fun commit_requires_server_receipt_for_every_write() {
        server(200,"{\"commitTime\":\"2026-10-09T21:00:00Z\",\"writeResults\":[{\"updateTime\":\"2026-10-09T21:00:00Z\"}]}") { url ->
            assertEquals("2026-10-09T21:00:00Z",FirestoreHttpCommit.send(url,"test-token",listOf(FirestoreWire.set("p","users/u/stores/0210/purchases/a",mapOf("total" to 6000L)))))
        }
        server(200,"{\"commitTime\":\"2026-10-09T21:00:00Z\",\"writeResults\":[]}") { url ->
            val err=runCatching{FirestoreHttpCommit.send(url,"test-token",listOf(FirestoreWire.set("p","users/u/stores/0210/purchases/a",emptyMap())))}.exceptionOrNull()
            assertTrue(err?.message.orEmpty().contains("COMMIT_UNCONFIRMED"))
        }
    }
    @Test fun permission_denied_is_returned_without_silent_retry() {
        server(403,"{\"error\":{\"status\":\"PERMISSION_DENIED\",\"message\":\"Missing permissions\"}}") { url ->
            val err=runCatching{FirestoreHttpCommit.send(url,"test-token",listOf(FirestoreWire.set("p","users/u/stores/0210/purchases/a",emptyMap())))}.exceptionOrNull()
            assertTrue(err?.message.orEmpty().contains("HTTP_403 PERMISSION_DENIED"))
            assertFalse(err?.message.orEmpty().contains("test-token"))
        }
    }
    @Test fun slow_server_is_aborted_at_request_deadline() {
        server(200,"{}",delayMs=300) { url ->
            val start=System.nanoTime()
            val err=runCatching{FirestoreHttpCommit.send(url,"test-token",listOf(FirestoreWire.set("p","users/u/stores/0210/purchases/a",emptyMap())),50L)}.exceptionOrNull()
            assertTrue(err?.message.orEmpty().contains("HTTP_TIMEOUT"))
            assertTrue((System.nanoTime()-start)/1_000_000<250)
        }
    }
    private fun server(status:Int,reply:String,delayMs:Long=0,block:(URL)->Unit) {
        val server=ServerSocket(0,1,InetAddress.getByName("127.0.0.1"))
        val failure=AtomicReference<Throwable?>()
        val worker=thread(isDaemon=true) {
            try { server.accept().use { socket ->
                socket.soTimeout=3000
                val input=socket.getInputStream()
                val header=StringBuilder()
                while(!header.endsWith("\r\n\r\n")){
                    val byte=input.read();check(byte>=0);header.append(byte.toChar())
                }
                val lines=header.toString().split("\r\n")
                check(lines.first().startsWith("POST /commit "))
                val headers=lines.drop(1).mapNotNull{line->line.indexOf(':').takeIf{it>0}?.let{line.substring(0,it).lowercase() to line.substring(it+1).trim()}}.toMap()
                check(headers["authorization"]=="Bearer test-token")
                val body=ByteArray(headers["content-length"]!!.toInt())
                var read=0
                while(read<body.size){val count=input.read(body,read,body.size-read);check(count>0);read+=count}
                check(JSONObject(String(body,Charsets.UTF_8)).getJSONArray("writes").length()==1)
                val bytes=reply.toByteArray(Charsets.UTF_8)
                if(delayMs>0)Thread.sleep(delayMs)
                socket.getOutputStream().use { out ->
                    out.write("HTTP/1.1 $status Reply\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray(Charsets.US_ASCII))
                    out.write(bytes)
                }
            } } catch(e:Throwable){if(!(delayMs>0&&e is IOException))failure.set(e)}
        }
        try {
            block(URL("http://127.0.0.1:${server.localPort}/commit"))
            worker.join(1000)
            failure.get()?.let{throw it}
        } finally {server.close()}
    }
}
