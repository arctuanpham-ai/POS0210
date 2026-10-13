package vn.ecohome.pos0210

/** Quy tắc thuần của chế độ thanh toán: Trả sau (mặc định, theo bàn) và Trả trước (thu tiền rồi mới tạo đơn). */
object PaymentFlowRules {
    const val POSTPAID = "postpaid"
    const val PREPAID = "prepaid"
    const val SETTING_KEY = "payment_flow"
    const val HISTORY_KEY = "payment_flow_history"
    /** Bàn ảo cho đơn trả trước: không có khái niệm bàn mở. */
    const val PREPAID_TABLE_ID = "PREPAID"

    fun normalize(value: String?): String = if (value == PREPAID) PREPAID else POSTPAID

    fun label(flow: String): String = if (normalize(flow) == PREPAID) "Trả trước" else "Trả sau"

    /** Lỗi chặn đổi chế độ, null nếu được đổi. [openNames] là tên các bàn/đơn đang mở. */
    fun changeBlocker(current: String, target: String, openNames: List<String>, cartEmpty: Boolean): String? = when {
        normalize(current) == normalize(target) -> "Đang ở chế độ ${label(target)} rồi"
        openNames.isNotEmpty() -> "Còn ${openNames.size} bàn/đơn chưa thanh toán: ${openNames.joinToString(", ")}"
        !cartEmpty -> "Giỏ hàng đang soạn phải trống"
        else -> null
    }

    /** Tiền thối; null nếu khách đưa chưa đủ. */
    fun change(total: Long, received: Long): Long? = if (received >= total) received - total else null

    fun canConfirmCash(flow: String, total: Long, received: Long?): Boolean =
        normalize(flow) != PREPAID || (received != null && change(total, received) != null)

    fun historyLine(at: Long, by: String, old: String, new: String): String =
        listOf(at.toString(), by, normalize(old), normalize(new)).joinToString("|") { it.replace('|', '/').replace('\n', ' ') }

    fun appendHistory(history: String, line: String): String = if (history.isBlank()) line else "$history\n$line"

    /** Số thứ tự đơn trong ngày, dạng #012. */
    fun orderNoLabel(serviceNo: Int): String = "#" + serviceNo.toString().padStart(3, '0')

    /** Trạng thái hiển thị của đơn trả trước từ trạng thái bill + món. */
    fun statusLabel(billStatus: String?, batchStatus: String): String = when {
        billStatus == "REFUNDED" || batchStatus == "CANCELLED" -> "ĐÃ HUỶ · HOÀN TIỀN"
        batchStatus == "WAITING" -> "ĐANG PHA CHẾ"
        batchStatus == "DELIVERED" -> "ĐÃ GIAO"
        else -> "ĐÃ THU TIỀN"
    }
}

/** 00:00 hôm nay theo giờ máy (cùng cách tính với số thứ tự đơn trong ngày). */
object ShiftRulesTodayStart {
    fun todayStart(now: Long = System.currentTimeMillis()): Long =
        java.util.Calendar.getInstance().apply {
            timeInMillis = now
            set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0); set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0)
        }.timeInMillis
}

/** Trạng thái màn "đang in phiếu bếp" sau khi xác nhận thanh toán trả trước. phase: PRINTING | FAILED. */
data class KitchenPrintUi(val phase: String, val done: Int, val total: Int, val message: String, val tableName: String)
