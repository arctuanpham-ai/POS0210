package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Test
import vn.ecohome.pos0210.data.AttendanceSessionEntity
import java.time.LocalDateTime
import java.time.ZoneId

class AttendancePayrollTest {
 private val zone=ZoneId.of("Asia/Ho_Chi_Minh")
 private fun ms(s:String)=LocalDateTime.parse(s).atZone(zone).toInstant().toEpochMilli()
 @Test fun crossMidnightIsSplitIntoCorrectDays(){
  val s=AttendanceSessionEntity("a","e1",ms("2026-10-08T22:00:00"),ms("2026-10-09T02:00:00"),"CLOSED",35000,10000)
  val d=AttendancePayroll.splitByDay(s,zone=zone)
  assertEquals(listOf("2026-10-08","2026-10-09"),d.map{it.date})
  assertEquals(listOf(120L,120L),d.map{it.minutes})
  assertEquals(listOf(70000L,70000L),d.map{it.amount})
 }
 @Test fun multiplierUsesSnapshot(){
  val s=AttendanceSessionEntity("a","e1",ms("2026-10-08T06:00:00"),ms("2026-10-08T10:00:00"),"CLOSED",35000,15000)
  assertEquals(210000L,AttendancePayroll.splitByDay(s,zone=zone).single().amount)
 }
 @Test fun qaFixtureIncludesRegularHolidayAndCrossMidnightShifts(){
  val rows=AttendanceQaFixtures.sample("e1",ms("2026-10-08T12:00:00"),35000,zone)
  assertEquals(3,rows.size)
  assertEquals(listOf(10000,15000,20000),rows.map{it.multiplierBasisPoints})
  assertEquals(setOf("TEST"),rows.map{it.dataScope}.toSet())
  assertEquals(listOf(120L,120L),AttendancePayroll.splitByDay(rows.last(),zone=zone).map{it.minutes})
 }
}
