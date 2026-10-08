package vn.ecohome.pos0210

import vn.ecohome.pos0210.data.AttendanceSessionEntity
import java.time.Instant
import java.time.ZoneId

data class PayrollDay(
    val employeeId:String,
    val date:String,
    val minutes:Long,
    val hourlyRate:Long,
    val multiplierBasisPoints:Int,
    val amount:Long
)

object AttendanceQaFixtures {
    fun sample(employeeId:String,now:Long,hourlyRate:Long,zone:ZoneId=ZoneId.systemDefault()):List<AttendanceSessionEntity>{
        val anchor=Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        fun at(daysBack:Long,hour:Int,minute:Int=0)=anchor.minusDays(daysBack).atTime(hour,minute).atZone(zone).toInstant().toEpochMilli()
        return listOf(
            AttendanceSessionEntity("qa-"+employeeId+"-0",employeeId,at(0,6),at(0,10),status="CLOSED",hourlyRate=hourlyRate,multiplierBasisPoints=10000,note="QA · ca sáng 4 giờ",dataScope="TEST"),
            AttendanceSessionEntity("qa-"+employeeId+"-1",employeeId,at(1,7),at(1,16,30),status="CLOSED",hourlyRate=hourlyRate,multiplierBasisPoints=15000,note="QA · K=1.5",dataScope="TEST"),
            AttendanceSessionEntity("qa-"+employeeId+"-2",employeeId,at(2,22),at(1,2),status="CLOSED",hourlyRate=hourlyRate,multiplierBasisPoints=20000,note="QA · qua ngày · K=2",dataScope="TEST")
        )
    }
}

object AttendancePayroll {
    fun splitByDay(session:AttendanceSessionEntity, now:Long=System.currentTimeMillis(), zone:ZoneId=ZoneId.systemDefault()):List<PayrollDay>{
        val end=(session.checkOutAt?:now).coerceAtLeast(session.checkInAt)
        if(end<=session.checkInAt)return emptyList()
        val out=mutableListOf<PayrollDay>()
        var cursor=session.checkInAt
        while(cursor<end){
            val z=Instant.ofEpochMilli(cursor).atZone(zone)
            val nextDay=z.toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
            val segmentEnd=minOf(end,nextDay)
            val minutes=(segmentEnd-cursor)/60_000L
            if(minutes>0){
                val amount=minutes*session.hourlyRate*session.multiplierBasisPoints/60L/10_000L
                out+=PayrollDay(session.employeeId,z.toLocalDate().toString(),minutes,session.hourlyRate,session.multiplierBasisPoints,amount)
            }
            cursor=segmentEnd
        }
        return out
    }
    fun period(sessions:List<AttendanceSessionEntity>,now:Long=System.currentTimeMillis(),zone:ZoneId=ZoneId.systemDefault())=
        sessions.flatMap{splitByDay(it,now,zone)}
}
