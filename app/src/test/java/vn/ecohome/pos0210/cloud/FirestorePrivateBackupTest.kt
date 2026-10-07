package vn.ecohome.pos0210.cloud

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FirestorePrivateBackupTest {
    @Test fun restoreRejectsFutureRoomSchemaButAcceptsCurrentSchema() {
        assertTrue(FirestorePrivateBackup.supportsRestoreUserVersion(19))
        assertFalse(FirestorePrivateBackup.supportsRestoreUserVersion(20))
    }
}
