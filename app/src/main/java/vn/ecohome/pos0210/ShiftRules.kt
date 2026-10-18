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

    /** Đang có ca thì chỉ chủ ca được thanh toán (tránh thanh toán nhầm khi người khác đăng nhập). Hết ca thì ai có quyền cũng thanh toán được. */
    fun canPay(activeShiftStaffId: String?, userId: String): Boolean = activeShiftStaffId == null || activeShiftStaffId == userId

    const val TIME_PATTERN = "yyyy-MM-dd HH:mm"

    /** "2026-10-13 06:00" theo giờ Việt Nam; sai định dạng trả null. */
    fun parseLocalTime(text: String): Long? = runCatching {
        SimpleDateFormat(TIME_PATTERN, Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Ho_Chi_Minh"); isLenient = false }.parse(text.trim())?.time
    }.getOrNull()

    fun formatLocalTime(epochMillis: Long?): String =
        if (epochMillis == null) "" else SimpleDateFormat(TIME_PATTERN, Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Ho_Chi_Minh") }.format(Date(epochMillis))

    /** Lỗi của một lần sửa công thủ công, null nếu hợp lệ. */
    fun manualAttendanceError(checkIn: Long?, checkOut: Long?, checkOutText: String, now: Long, reason: String): String? = when {
        checkIn == null -> "Giờ vào sai định dạng (yyyy-MM-dd HH:mm)"
        checkOutText.isNotBlank() && checkOut == null -> "Giờ ra sai định dạng (yyyy-MM-dd HH:mm)"
        checkIn > now -> "Giờ vào không được ở tương lai"
        checkOut != null && checkOut <= checkIn -> "Giờ ra phải sau giờ vào"
        checkOut != null && checkOut > now -> "Giờ ra không được ở tương lai"
        reason.isBlank() -> "Bắt buộc ghi lý do sửa công"
        else -> null
    }

    const val LOCK_TIMEOUT_MS = 30 * 60_000L

    /** Máy tự khoá khi không ai chạm đủ lâu (kể cả lúc tắt màn hình), để người khác cầm máy không vô tình dùng dưới tài khoản người trước. */
    fun shouldLock(now: Long, lastTouchAt: Long, timeoutMs: Long = LOCK_TIMEOUT_MS): Boolean = now - lastTouchAt >= timeoutMs

    /** 270 phút -> "4h30"; 0 -> "0h". */
    fun formatHours(minutes: Long): String {
        val m = minutes.coerceAtLeast(0)
        return if (m % 60 == 0L) "${m / 60}h" else "${m / 60}h${(m % 60).toString().padStart(2, '0')}"
    }

    const val DEFAULT_STAFF_USUAL_END = "10:00"
    const val DEFAULT_CLOSE_TIME = "22:00"
    const val DEFAULT_SNOOZE_MIN = 15
    private val VN_ZONE = java.time.ZoneId.of("Asia/Ho_Chi_Minh")

    /** "10:00" -> 600 phút trong ngày; sai định dạng trả null. */
    fun parseHm(text: String): Int? {
        val parts = text.trim().split(":")
        if (parts.size != 2) return null
        val h = parts[0].toIntOrNull() ?: return null
        val m = parts[1].toIntOrNull() ?: return null
        return if (h in 0..23 && m in 0..59) h * 60 + m else null
    }

    /** Mốc "giờ về thường lệ" của ngày chứa lúc vào ca (epoch ms). */
    fun usualEndOfShiftDay(checkIn: Long, usualEnd: String): Long? {
        val hm = parseHm(usualEnd) ?: return null
        val day = java.time.Instant.ofEpochMilli(checkIn).atZone(VN_ZONE).toLocalDate()
        return day.atTime(hm / 60, hm % 60).atZone(VN_ZONE).toInstant().toEpochMilli()
    }

    /** Nhắc ra ca: ca của nhân viên (không phải ADMIN), vào ca trước giờ về thường lệ, nay đã tới giờ và hết thời gian nhắc sau. */
    fun reminderDue(now: Long, checkIn: Long, role: String, usualEnd: String, snoozeUntil: Long): Boolean {
        if (role == "ADMIN") return false
        val end = usualEndOfShiftDay(checkIn, usualEnd) ?: return false
        return checkIn < end && now >= end && now >= snoozeUntil
    }

    /** Ca sót cần tự đóng: ca của ngày trước, hoặc ca nhân viên đã qua giờ đóng cửa và không còn hoạt động. */
    fun shouldAutoClose(now: Long, shiftDate: String, role: String, lastActivityAt: Long, closeTime: String, idleMinutes: Int): Boolean {
        if (shiftDate < workDate(now)) return true
        if (role == "ADMIN") return false
        val hm = parseHm(closeTime) ?: return false
        val local = java.time.Instant.ofEpochMilli(now).atZone(VN_ZONE)
        val afterClose = local.hour * 60 + local.minute >= hm
        return afterClose && now - lastActivityAt >= idleMinutes * 60_000L
    }

    /** Giờ ra khi quản lý tiếp quản: không trước giờ vào, không sau hiện tại. */
    fun takeoverCutoffError(cutoff: Long?, checkIn: Long, now: Long): String? = when {
        cutoff == null -> "Giờ ra sai định dạng (yyyy-MM-dd HH:mm)"
        cutoff < checkIn -> "Giờ ra không được trước giờ vào ca"
        cutoff > now -> "Giờ ra không được ở tương lai"
        else -> null
    }

    /** Giờ ra mặc định của ca bị tiếp quản/tự đóng: hoạt động cuối, kẹp trong [vào ca, hiện tại]. */
    fun defaultCutoff(lastActivityAt: Long, checkIn: Long, now: Long): Long = lastActivityAt.coerceIn(checkIn, maxOf(checkIn, now))

    /** Số phút công của ca: giờ vào và giờ ra mỗi mốc làm tròn về giờ chẵn nếu lệch ≤15 phút. Chưa ra ca thì null. */
    fun shiftMinutes(checkIn: Long, checkOut: Long?): Long? {
        if (checkOut == null) return null
        val a = TimeRounding.snapToHour(checkIn, VN_ZONE)
        val b = TimeRounding.snapToHour(checkOut, VN_ZONE)
        return if (b > a) (b - a) / 60_000L else 0L
    }

    fun needsAlert(status: String?, diff: Long?, threshold: Long = DEFAULT_DIFF_THRESHOLD): Boolean =
        status == "pending_review" || (diff != null && kotlin.math.abs(diff) > threshold)

    fun editLogLine(at: Long, by: String, field: String, old: String, new: String, reason: String): String =
        listOf(at.toString(), by, field, old, new, reason).joinToString("|") { it.replace('|', '/').replace('\n', ' ') }

    fun appendEditLog(log: String, line: String): String = if (log.isBlank()) line else "$log\n$line"

    fun dayClosedKey(date: String) = "day_closed_$date"

    /** Ngày làm việc sớm nhất có ca mà chưa đóng. */
    fun earliestOpenDay(shiftDates: Collection<String>, closedDates: Set<String>): String? =
        shiftDates.distinct().sorted().firstOrNull { it !in closedDates }

    /** Nhắc "Chưa đóng ngày": ngày cũ chưa đóng, hoặc hôm nay đã qua giờ đóng cửa; lặp lại theo thời gian nhắc sau. */
    fun dayCloseDue(now: Long, closeTime: String, openDate: String?, snoozeUntil: Long): Boolean {
        if (openDate == null || now < snoozeUntil) return false
        if (openDate < workDate(now)) return true
        val hm = parseHm(closeTime) ?: return false
        val local = java.time.Instant.ofEpochMilli(now).atZone(VN_ZONE)
        return local.hour * 60 + local.minute >= hm
    }
}
