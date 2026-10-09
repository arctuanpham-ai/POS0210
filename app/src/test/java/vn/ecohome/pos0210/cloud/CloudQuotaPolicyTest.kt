package vn.ecohome.pos0210.cloud

import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class CloudQuotaPolicyTest {
    private val now=Instant.parse("2026-10-09T12:00:00Z").toEpochMilli()
    private fun next(data:Map<String,Any?> = emptyMap(), category:String="sales", amount:Long=1, device:String="a", operation:String="op", at:Long=now)=CloudQuotaPolicy.next(data,mapOf(category to amount),device,operation,at)
    @Test fun countsDocumentsAndCounterInSameCommit(){val data=next(amount=14);assertEquals(15L,data["total"]);assertEquals(14L,data["sales"]);assertEquals(1L,data["system"])}
    @Test fun hardCeilingRejectsWholeBatch(){assertThrows(CloudQuotaDeferred::class.java){next(mapOf("total" to 15999L),amount=1)}}
    @Test fun salesCanBorrowUnusedOptionalBudgets(){assertEquals(15002L,next(mapOf("total" to 15000L,"sales" to 9000L))["total"])}
    @Test fun optionalTasksStopAtFourteenThousand(){for(c in listOf("dashboard","backup","media"))assertThrows(CloudQuotaDeferred::class.java){next(mapOf("total" to 14000L),c)}}
    @Test fun dashboardCadenceAndPublisherAreShared(){val first=next(category="dashboard");assertThrows(CloudQuotaDeferred::class.java){next(first,"dashboard",device="b",operation="other",at=now+60000)};assertThrows(CloudQuotaDeferred::class.java){next(first,"dashboard",operation="other",at=now+59000)};assertEquals(4L,next(first,"dashboard",operation="other",at=now+60000)["total"])}
    @Test fun dashboardSlowsAfterTarget(){val first=next(mapOf("total" to 12000L),"dashboard");assertThrows(CloudQuotaDeferred::class.java){next(first,"dashboard",operation="other",at=now+60000)};assertEquals(12004L,next(first,"dashboard",operation="other",at=now+300000)["total"])}
    @Test fun backupAllowsItsOwnChunksButDefersAnotherSnapshot(){val first=next(category="backup",amount=8);assertEquals(18L,next(first,"backup",amount=8)["total"]);assertThrows(CloudQuotaDeferred::class.java){next(first,"backup",operation="other",at=now+60000)}}
    @Test fun optionalCategoryLimitsAreDaily(){assertThrows(CloudQuotaDeferred::class.java){next(mapOf("media" to 200L,"total" to 500L),"media")}}
    @Test fun pacificDaysHandleBothDstOffsets(){assertEquals("2026-10-08",CloudQuotaPolicy.day(Instant.parse("2026-10-09T06:59:59Z").toEpochMilli()));assertEquals("2026-10-09",CloudQuotaPolicy.day(Instant.parse("2026-10-09T07:00:00Z").toEpochMilli()));assertEquals(Instant.parse("2026-12-10T08:00:00Z").toEpochMilli(),CloudQuotaPolicy.reset(Instant.parse("2026-12-09T12:00:00Z").toEpochMilli()))}
    @Test fun metadataOnlySettingsDoNotChangeBusinessFingerprint(){assertEquals(CloudQuotaPolicy.businessSettings(mapOf("shop_name" to "A")),CloudQuotaPolicy.businessSettings(mapOf("shop_name" to "A","cloud_sync_last_trace" to "error","cloud_backup_confirmed_at" to "123","firebase_email" to "x")))}
    @Test fun corruptCounterFailsClosed(){assertThrows(IllegalArgumentException::class.java){next(mapOf("total" to -1L))}}
}
