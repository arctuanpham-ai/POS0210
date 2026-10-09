package vn.ecohome.pos0210.cloud

internal data class BackupFingerprint(val slot:String,val createdAt:Long,val businessHash:String?)
internal object CloudBackupPolicy {
    fun unchanged(hash:String,slots:List<BackupFingerprint>)=slots.maxByOrNull{it.createdAt}?.takeIf{it.businessHash==hash}
}
