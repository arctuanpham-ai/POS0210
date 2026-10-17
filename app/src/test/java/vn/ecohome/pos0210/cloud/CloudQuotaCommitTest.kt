package vn.ecohome.pos0210.cloud

import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import org.json.JSONObject

class CloudQuotaCommitTest {
    private val business=listOf(FirestoreWire.set("p","users/u/stores/0210/bills/b",mapOf("total" to 10L)))
    @Test fun firstCommitCreatesCounterAtomicallyWithBusinessDocument(){
        var committed=emptyList<Map<String,Any?>>()
        CloudQuotaCommit.execute("p","users/u/stores/0210", "a","op",business,mapOf("sales" to 1L),1000000L,{QuotaSnapshot(null,emptyMap())},{committed=it;"ack"})
        assertEquals(2,committed.size)
        val counter=JSONObject(committed.last())
        assertFalse(counter.getJSONObject("currentDocument").getBoolean("exists"))
        assertEquals("2",counter.getJSONObject("update").getJSONObject("fields").getJSONObject("total").getString("integerValue"))
    }
    @Test fun staleCounterIsRereadBeforeRetry(){
        var reads=0;var sends=0;var total=0L
        CloudQuotaCommit.execute("p","users/u/stores/0210","a","op",business,mapOf("sales" to 1L),1000000L,
            {reads++;QuotaSnapshot("v$reads",mapOf("total" to if(reads==1)0L else 12L))},
            {sends++;if(sends==1)throw IOException("HTTP_400 FAILED_PRECONDITION");total=JSONObject(it.last()).getJSONObject("update").getJSONObject("fields").getJSONObject("total").getString("integerValue").toLong();"ack"})
        assertEquals(2,reads);assertEquals(14L,total)
    }
    @Test fun aSecondDeviceCannotCrossCapAfterStaleRead(){
        var reads=0;var sends=0
        assertThrows(CloudQuotaDeferred::class.java){CloudQuotaCommit.execute("p","users/u/stores/0210","a","op",business,mapOf("sales" to 1L),1000000L,
            {reads++;QuotaSnapshot("v$reads",mapOf("total" to if(reads==1)15997L else 15999L))},
            {sends++;throw IOException("HTTP_409 ABORTED")})}
        assertEquals(1,sends);assertEquals(2,reads)
    }
    @Test fun unknownAcknowledgementNeverRetriesAutomatically(){
        var sends=0
        assertThrows(IOException::class.java){CloudQuotaCommit.execute("p","users/u/stores/0210","a","op",business,mapOf("sales" to 1L),1000000L,{QuotaSnapshot(null,emptyMap())},{sends++;throw IOException("HTTP_TIMEOUT")})}
        assertEquals(1,sends)
    }
    @Test fun contentionRetryIsBounded(){var sends=0;assertThrows(IOException::class.java){CloudQuotaCommit.execute("p","users/u/stores/0210","a","op",business,mapOf("sales" to 1L),1000000L,{QuotaSnapshot("v",emptyMap())},{sends++;throw IOException("HTTP_409 ABORTED")})};assertEquals(3,sends)}
}
