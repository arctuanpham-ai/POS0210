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
 @Test fun punchTimesWithinFifteenMinutesSnapToTheHour(){
  fun snap(t:String)=TimeRounding.snapToHour(ms(t),zone)
  assertEquals(ms("2026-10-08T06:00:00"),snap("2026-10-08T05:50:00"))
  assertEquals(ms("2026-10-08T06:00:00"),snap("2026-10-08T06:10:00"))
  assertEquals(ms("2026-10-08T06:00:00"),snap("2026-10-08T06:15:00"))
  assertEquals(ms("2026-10-08T06:00:00"),snap("2026-10-08T05:45:00"))
  assertEquals(ms("2026-10-08T06:00:00"),snap("2026-10-08T06:00:00"))
 }
 @Test fun punchTimesBeyondFifteenMinutesKeepTheExactMinute(){
  fun snap(t:String)=TimeRounding.snapToHour(ms(t),zone)
  assertEquals(ms("2026-10-08T06:16:00"),snap("2026-10-08T06:16:00"))
  assertEquals(ms("2026-10-08T06:30:00"),snap("2026-10-08T06:30:00"))
  assertEquals(ms("2026-10-08T05:44:00"),snap("2026-10-08T05:44:00"))
 }
 @Test fun snapAcrossMidnightMovesToTheNextDay(){
  assertEquals(ms("2026-10-09T00:00:00"),TimeRounding.snapToHour(ms("2026-10-08T23:50:00"),zone))
 }
 @Test fun shiftIsPaidFromSnappedStartAndEnd(){
  val s=AttendanceSessionEntity("round","e1",ms("2026-10-08T05:55:00"),ms("2026-10-08T14:45:00"),"CLOSED",35000,10000)
  val day=AttendancePayroll.splitByDay(s,zone=zone).single()
  assertEquals(540L,day.minutes)
  assertEquals(315000L,day.amount)
 }
 @Test fun shiftOutsideToleranceKeepsExactMinutes(){
  val s=AttendanceSessionEntity("exact","e1",ms("2026-10-08T06:20:00"),ms("2026-10-08T10:10:00"),"CLOSED",60000,10000)
  val day=AttendancePayroll.splitByDay(s,zone=zone).single()
  assertEquals(220L,day.minutes)
  assertEquals(220000L,day.amount)
 }
 @Test fun shiftShorterThanToleranceIsNotPaid(){
  val s=AttendanceSessionEntity("tiny","e1",ms("2026-10-08T06:00:00"),ms("2026-10-08T06:10:00"),"CLOSED",35000,10000)
  assertEquals(emptyList<PayrollDay>(),AttendancePayroll.splitByDay(s,zone=zone))
 }
 @Test fun openShiftIsNotPrematurelyRounded(){
  val start=ms("2026-10-08T06:00:00")
  val s=AttendanceSessionEntity("open","e1",start,null,"OPEN",35000,10000)
  assertEquals(525L,AttendancePayroll.splitByDay(s,ms("2026-10-08T14:45:00"),zone).single().minutes)
 }
}
