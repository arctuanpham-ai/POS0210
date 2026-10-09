package vn.ecohome.pos0210.cloud

import java.io.IOException

internal data class QuotaSnapshot(val updateTime:String?,val data:Map<String,Any?>)

/** Compare-and-set makes quota reservation and the business write one atomic server commit. */
internal object CloudQuotaCommit {
    fun execute(project:String,root:String,device:String,operation:String,writes:List<Map<String,Any?>>,charges:Map<String,Long>,now:Long,read:(String)->QuotaSnapshot,send:(List<Map<String,Any?>>)->String):Map<String,Any?> {
        require(writes.isNotEmpty()&&writes.size<=399)
        val path="$root/config/quota-${CloudQuotaPolicy.day(now)}"
        repeat(3){attempt->
            val snapshot=read(path)
            val next=CloudQuotaPolicy.next(snapshot.data,charges,device,operation,now)
            val condition=if(snapshot.updateTime==null)mapOf("exists" to false)else mapOf("updateTime" to snapshot.updateTime)
            val counter=FirestoreWire.set(project,path,next)+mapOf("currentDocument" to condition)
            try {
                send(writes+counter)
                return next
            }catch(e:IOException){
                // Only a definitive rejected CAS can be retried. A timeout may already be committed.
                val contention=e.message.orEmpty().let{it.contains("FAILED_PRECONDITION")||it.contains("ABORTED")||it.contains("ALREADY_EXISTS")}
                if(!contention||attempt==2)throw e
            }
        }
        error("QUOTA_COMMIT_UNREACHABLE")
    }
}
