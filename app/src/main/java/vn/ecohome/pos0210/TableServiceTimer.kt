package vn.ecohome.pos0210

enum class ServiceAgeBand { NORMAL, WARM, ORANGE, OVERDUE }
data class ServiceTimerPresentation(val totalMinutes:Long,val lastOrderMinutes:Long?,val statusLabel:String,val ageBand:ServiceAgeBand)

fun serviceTimerPresentation(firstOrderAt:Long?,lastOrderSentAt:Long?,sentBatchCount:Int,waitingBatchCount:Int,now:Long):ServiceTimerPresentation? {
 if(firstOrderAt==null||sentBatchCount<=0)return null
 val total=((now-firstOrderAt).coerceAtLeast(0L))/60_000L
 val latest=lastOrderSentAt?.takeIf{sentBatchCount>1&&it>firstOrderAt}?.let{((now-it).coerceAtLeast(0L))/60_000L}
 val band=when{total<=10L->ServiceAgeBand.NORMAL;total<=20L->ServiceAgeBand.WARM;total<=30L->ServiceAgeBand.ORANGE;else->ServiceAgeBand.OVERDUE}
 return ServiceTimerPresentation(total,latest,if(waitingBatchCount>0)"đang làm" else "đã lên đủ",band)
}
