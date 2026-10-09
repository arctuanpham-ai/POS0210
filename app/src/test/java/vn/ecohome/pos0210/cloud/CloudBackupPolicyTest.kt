package vn.ecohome.pos0210.cloud
import org.junit.Assert.*
import org.junit.Test
class CloudBackupPolicyTest {
    @Test fun olderMatchingSlotCannotSuppressNewSnapshotAfterReversion(){val slots=listOf(BackupFingerprint("A",1,"X"),BackupFingerprint("B",2,"Y"));assertNull(CloudBackupPolicy.unchanged("X",slots))}
    @Test fun newestMatchingSlotSkipsUnchangedSnapshot(){val slots=listOf(BackupFingerprint("A",1,"X"),BackupFingerprint("B",2,"Y"));assertEquals("B",CloudBackupPolicy.unchanged("Y",slots)?.slot)}
}
