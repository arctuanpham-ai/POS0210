package vn.ecohome.pos0210

data class PreOpeningResetScope(
    val clearPaidBills: Boolean = true,
    val clearPayments: Boolean = true,
    val clearAttendance: Boolean = true,
    val clearMenu: Boolean = false,
    val clearEmployees: Boolean = false,
    val clearPurchases: Boolean = false,
    val clearSettings: Boolean = false
)

object PreOpeningResetPolicy {
    const val confirmationPhrase = "RESET KHAI TRUONG 0210"
    val scope = PreOpeningResetScope()

    fun canExecute(role: String?, confirmation: String): Boolean =
        role == "ADMIN" && confirmation.trim().uppercase() == confirmationPhrase
}
