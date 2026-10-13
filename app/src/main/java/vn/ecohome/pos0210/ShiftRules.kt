package vn.ecohome.pos0210

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Quy tắc thuần của ca làm: tiền mặt bàn giao, chênh lệch, mệnh giá. Không phụ thuộc Android để test được. */
object ShiftRules {
    const val DEFAULT_DIFF_THRESHOLD = 20_000L
    const val PENDING_NEXT = "PENDING_NEXT"
    val denominations = listOf(500_000L, 200_000L, 100_000L, 50_000L, 20_000L, 10_000L, 5_000L, 2_000L, 1_000L)

    fun diff(counted: Long, expected: Long): Long = counted - expected

    /** Chênh lệch vượt ngưỡng thì bắt buộc ghi chú. */
    fun noteRequired(diff: Long, threshold: Long = DEFAULT_DIFF_THRESHOLD): Boolean = kotlin.math.abs(diff) > threshold

    fun canConfirm(diff: Long, note: String, threshold: Long = DEFAULT_DIFF_THRESHOLD): Boolean =
        !noteRequired(diff, threshold) || note.isNotBlank()

    fun denominationTotal(counts: Map<Long, Int>): Long = counts.entries.sumOf { it.key * it.value.coerceAtLeast(0) }

    /** Ngày làm việc theo giờ Việt Nam, yyyy-MM-dd. */
    fun workDate(epochMillis: Long): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Ho_Chi_Minh") }.format(Date(epochMillis))

    /** Chỉ chủ ca hoặc ADMIN được xác nhận ra ca. */
    fun canCloseShift(shiftStaffId: String, pinOwnerId: String, pinOwnerRole: String): Boolean =
        pinOwnerId == shiftStaffId || pinOwnerRole == "ADMIN"

    /** Chỉ ADMIN (manager/owner) được xác nhận đã nhận tiền; ca phải đang "closed". */
    fun canReceive(status: String, pinOwnerRole: String): Boolean = status == "closed" && pinOwnerRole == "ADMIN"

    /** Ca mới vào được order: có ca đang mở, hoặc đang ở chế độ thử. */
    fun canCreateOrder(hasActiveShift: Boolean, testMode: Boolean): Boolean = hasActiveShift || testMode

    /** Ai phải chấm công: ADMIN chỉ định từng tài khoản ("1"/"0"); chưa chỉ định thì STAFF có, ADMIN không. */
    fun attendanceRequired(setting: String, role: String): Boolean = when (setting) {
        "1" -> true
        "0" -> false
        else -> role != "ADMIN"
    }

    fun attendanceSettingKey(employeeId: String) = "attendance_required_$employeeId"
}
