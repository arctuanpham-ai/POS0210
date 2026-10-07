package vn.ecohome.pos0210
import org.junit.Assert.*
import org.junit.Test
class TableServiceTimerTest {
 private val m=60_000L
 @Test fun noConfirmedOrderHasNoTimer(){assertNull(serviceTimerPresentation(null,null,0,0,50*m))}
 @Test fun firstOrderUsesPersistedTimestamp(){val x=serviceTimerPresentation(5*m,5*m,1,1,20*m)!!;assertEquals(15L,x.totalMinutes);assertNull(x.lastOrderMinutes);assertEquals("đang làm",x.statusLabel);assertEquals(ServiceAgeBand.WARM,x.ageBand)}
 @Test fun supplementaryOrderKeepsTotal(){val x=serviceTimerPresentation(0,20*m,2,1,26*m)!!;assertEquals(26L,x.totalMinutes);assertEquals(6L,x.lastOrderMinutes);assertEquals(ServiceAgeBand.ORANGE,x.ageBand)}
 @Test fun deliveredUsesExistingStatus(){val x=serviceTimerPresentation(0,0,1,0,34*m)!!;assertEquals("đã lên đủ",x.statusLabel);assertEquals(ServiceAgeBand.OVERDUE,x.ageBand)}
 @Test fun clockSkewNeverShowsNegative(){assertEquals(0L,serviceTimerPresentation(20*m,20*m,1,1,10*m)!!.totalMinutes)}
}
