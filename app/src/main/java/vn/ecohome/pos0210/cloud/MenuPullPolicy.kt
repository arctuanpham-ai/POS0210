package vn.ecohome.pos0210.cloud

/** Quy tắc kéo menu từ cloud về máy. Hàm thuần để test. */
object MenuPullPolicy {
    const val MAX_AGE_MS = 24 * 60 * 60_000L

    /** Bỏ qua tải cả menu khi phiên bản trên cloud không đổi và lần tải gần nhất chưa quá 24 giờ. */
    fun skip(cloudVersion: Long, pulledVersion: Long, pulledAt: Long, now: Long): Boolean =
        cloudVersion == pulledVersion && pulledAt > 0L && now - pulledAt in 0 until MAX_AGE_MS

    /**
     * Mã món an toàn để lưu: mã từ cloud nếu không trùng món khác trên máy; trùng thì giữ mã cũ của món này;
     * món mới mà trùng mã món khác thì trả null (bỏ qua, không lưu) để không món nào bị xoá đè.
     */
    fun safeCode(wanted: String, ownerOfWanted: String?, id: String, oldCode: String?): String? =
        when {
            wanted.isBlank() -> oldCode.orEmpty()
            ownerOfWanted == null || ownerOfWanted == id -> wanted
            !oldCode.isNullOrBlank() -> oldCode
            else -> null
        }
}
