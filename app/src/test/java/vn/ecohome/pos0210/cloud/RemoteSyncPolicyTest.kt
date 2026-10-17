package vn.ecohome.pos0210.cloud

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteSyncPolicyTest {
    private val now = 1_000_000_000_000L
    @Test fun newRequestRuns() = assertTrue(RemoteSyncPolicy.shouldRun(now - 5_000, 0L, now))
    @Test fun alreadyHandledIsIgnored() = assertFalse(RemoteSyncPolicy.shouldRun(now - 5_000, now - 5_000, now))
    @Test fun olderThanHandledIsIgnored() = assertFalse(RemoteSyncPolicy.shouldRun(now - 9_000, now - 5_000, now))
    @Test fun staleRequestIsIgnored() = assertFalse(RemoteSyncPolicy.shouldRun(now - RemoteSyncPolicy.MAX_AGE_MS - 1, 0L, now))
    @Test fun justInsideWindowRuns() = assertTrue(RemoteSyncPolicy.shouldRun(now - RemoteSyncPolicy.MAX_AGE_MS, 0L, now))
    @Test fun farFutureRequestIsIgnoredSoItCannotLockLaterOnes() = assertFalse(RemoteSyncPolicy.shouldRun(now + RemoteSyncPolicy.MAX_AGE_MS + 1, 0L, now))
    @Test fun smallClockSkewIsAccepted() = assertTrue(RemoteSyncPolicy.shouldRun(now + 30_000, 0L, now))
    @Test fun missingOrZeroIsIgnored() { assertFalse(RemoteSyncPolicy.shouldRun(null, 0L, now)); assertFalse(RemoteSyncPolicy.shouldRun(0L, 0L, now)) }
}
