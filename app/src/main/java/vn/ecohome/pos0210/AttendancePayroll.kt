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

object TimeRounding {
    const val TOLERANCE_MS=15L*60_000L
    /** Kéo mốc giờ về giờ chẵn gần nhất nếu lệch không quá 15 phút (cả hai phía, tính cả đúng 15 phút); lệch hơn thì giữ nguyên. */
    fun snapToHour(epochMillis:Long,zone:ZoneId=ZoneId.systemDefault()):Long{
        val floor=Instant.ofEpochMilli(epochMillis).atZone(zone).truncatedTo(java.time.temporal.ChronoUnit.HOURS)
        val floorMs=floor.toInstant().toEpochMilli()
        val ceilMs=floor.plusHours(1).toInstant().toEpochMilli()
        return when{
            epochMillis-floorMs<=TOLERANCE_MS->floorMs
            ceilMs-epochMillis<=TOLERANCE_MS->ceilMs
            else->epochMillis
        }
    }
}

object AttendancePayroll {
    /**
     * Giờ chấm công được làm tròn từng mốc: giờ vào và giờ ra mỗi mốc được kéo về giờ chẵn gần nhất nếu lệch
     * không quá 15 phút (trên hoặc dưới). Lệch hơn 15 phút thì giữ đúng giờ. Ca đang mở chỉ làm tròn giờ vào,
     * giờ ra là thời điểm hiện tại cho tới khi ra ca.
     */
    fun splitByDay(session:AttendanceSessionEntity, now:Long=System.currentTimeMillis(), zone:ZoneId=ZoneId.systemDefault()):List<PayrollDay>{
        val closed=session.status=="CLOSED"&&session.checkOutAt!=null
        val start=TimeRounding.snapToHour(session.checkInAt,zone)
        val rawEnd=(session.checkOutAt?:now).coerceAtLeast(session.checkInAt)
        val end=if(closed)TimeRounding.snapToHour(rawEnd,zone) else rawEnd
        if(end<=start)return emptyList()
        val segments=mutableListOf<Pair<String,Long>>()
        var cursor=start
        while(cursor<end){
            val z=Instant.ofEpochMilli(cursor).atZone(zone)
            val nextDay=z.toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
            val segmentEnd=minOf(end,nextDay)
            if(segmentEnd>cursor)segments+=z.toLocalDate().toString() to (segmentEnd-cursor)
            cursor=segmentEnd
        }
        if(segments.isEmpty())return emptyList()
        val totalMinutes=(end-start)/60_000L
        var allocated=0L
        return segments.mapIndexed{index,(date,length)->
            val minutes=if(index==segments.lastIndex)totalMinutes-allocated else (length/60_000L).also{allocated+=it}
            val amount=minutes*session.hourlyRate*session.multiplierBasisPoints/60L/10_000L
            PayrollDay(session.employeeId,date,minutes,session.hourlyRate,session.multiplierBasisPoints,amount)
        }
    }
    fun period(sessions:List<AttendanceSessionEntity>,now:Long=System.currentTimeMillis(),zone:ZoneId=ZoneId.systemDefault())=
        sessions.flatMap{splitByDay(it,now,zone)}
}
