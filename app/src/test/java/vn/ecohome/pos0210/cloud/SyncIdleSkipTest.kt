package vn.ecohome.pos0210.cloud

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncIdleSkipTest {
    private val now = 10_000_000L
    @Test fun periodicWithoutChangesWithinHourIsSkipped() {
        assertTrue(FirebaseSyncWorker.skipIdle(true, false, now - 20 * 60_000L, now))
    }
    @Test fun periodicRunsWhenDirtyOrStaleOrNeverSynced() {
        assertFalse(FirebaseSyncWorker.skipIdle(true, true, now - 60_000L, now))
        assertFalse(FirebaseSyncWorker.skipIdle(true, false, now - 61 * 60_000L, now))
        assertFalse(FirebaseSyncWorker.skipIdle(true, false, null, now))
    }
    @Test fun nonPeriodicRequestsAreNeverSkipped() {
        assertFalse(FirebaseSyncWorker.skipIdle(false, false, now - 60_000L, now))
    }
}
