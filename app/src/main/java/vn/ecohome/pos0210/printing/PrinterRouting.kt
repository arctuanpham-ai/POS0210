package vn.ecohome.pos0210.printing

class PrinterRouting private constructor(
    private val kitchenMac: String,
    private val receiptMac: String
) {
    fun addressFor(jobType: PrintJobType): String = when (jobType) {
        PrintJobType.KITCHEN, PrintJobType.CANCEL -> kitchenMac
        PrintJobType.PAYMENT, PrintJobType.TEST -> kitchenMac
    }

    companion object {
        fun fromSettings(
            legacyMac: String,
            kitchenMac: String = "",
            receiptMac: String = ""
        ) = PrinterRouting(
            kitchenMac.trim().ifBlank { legacyMac.trim() },
            // Bill thanh toán dùng chung máy in với phiếu bếp.
            kitchenMac.trim().ifBlank { legacyMac.trim() }
        )
    }
}
