package vn.ecohome.pos0210

object DraftOrderPolicy {
    fun canDelete(
        batchStatus: String,
        batchOrdererId: String,
        currentEmployeeId: String,
        currentRole: String
    ): Boolean = batchStatus == "DRAFT" && (
        batchOrdererId == currentEmployeeId ||
            currentRole == "ADMIN" ||
            currentRole == "MANAGER"
        )
}
