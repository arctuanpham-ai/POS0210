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
