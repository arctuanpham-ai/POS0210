package vn.ecohome.pos0210.cloud

/** Đơn đặt món online (khách đặt trên datmon0210.web.app). Logic thuần, khớp web-dashboard/online-orders.js và Firestore rules. */
data class OnlineLine(val name: String, val qty: Int, val note: String, val price: Long, val id: String = "")

data class OnlineOrder(
    val id: String, val code: String, val uid: String, val name: String, val phone: String,
    val mode: String, val address: String, val table: String, val note: String,
    val items: List<OnlineLine>, val total: Long, val status: String, val rejectReason: String,
    val createdAt: Long, val expiresAt: Long?, val paidAt: Long?,
)

object OnlineOrderRules {
    const val NEW = "new"; const val REJECTED = "rejected"; const val AWAITING = "awaiting_payment"; const val EXPIRED = "expired"
    const val PAID = "paid"; const val DELIVERING = "delivering"; const val DONE = "done"; const val CANCELLED = "cancelled"
    const val PAY_MINUTES = 10
    const val SWEEP_GRACE_MS = 3 * 60_000L
    val ACTIVE_STATUSES = listOf(NEW, AWAITING, PAID, DELIVERING)
    val REJECT_REASONS = listOf("Hết món", "Quán sắp đóng cửa", "Ngoài khu vực giao hàng", "Quán đang quá tải, xin lỗi bạn")

    fun label(status: String) = when (status) {
        NEW -> "Chờ quán xác nhận"; REJECTED -> "Đã từ chối"; AWAITING -> "Chờ khách thanh toán"; EXPIRED -> "Hết hạn"
        PAID -> "Đã nhận tiền · đang làm"; DELIVERING -> "Đang giao"; DONE -> "Hoàn thành"; CANCELLED -> "Khách đã huỷ"; else -> status
    }
    fun modeLabel(mode: String) = when (mode) { "delivery" -> "Giao tận nơi"; "dinein" -> "Tại quán"; else -> "Mang đi" }

    fun transferContent(code: String) = "DM$code"
    fun limitKeys(o: OnlineOrder) = listOf("u_${o.uid}", "p_${o.phone}")
    fun isPending(status: String) = status == NEW || status == AWAITING
    fun isOverdue(o: OnlineOrder, now: Long) = o.status == AWAITING && o.expiresAt != null && o.expiresAt <= now
    /** Giá trị mới của bộ đếm giới hạn khi đóng đơn: giảm 1, không âm. */
    fun releasedCount(pending: Any?): Long = ((pending as? Number)?.toLong() ?: 0L).minus(1).coerceAtLeast(0L)

    data class Action(val key: String, val label: String)
    fun actions(o: OnlineOrder, now: Long): List<Action> = when (o.status) {
        NEW -> listOf(Action("accept", "NHẬN ĐƠN"), Action("reject", "TỪ CHỐI"))
        AWAITING -> listOf(Action("paid", "ĐÃ NHẬN TIỀN"), Action("expire", if (isOverdue(o, now)) "ĐÓNG ĐƠN HẾT HẠN" else "HUỶ (KHÁCH KHÔNG TRẢ)"))
        EXPIRED -> listOf(Action("paid", "KHÁCH TRẢ MUỘN: ĐÃ NHẬN TIỀN"))
        CANCELLED -> listOf(Action("paid", "KHÁCH ĐÃ CK TRƯỚC KHI HUỶ: GHI NHẬN"))
        PAID -> if (o.mode == "delivery") listOf(Action("deliver", "ĐANG GIAO"), Action("done", "HOÀN THÀNH")) else listOf(Action("done", "HOÀN THÀNH"))
        DELIVERING -> listOf(Action("done", "HOÀN THÀNH"))
        else -> emptyList()
    }

    private val FROM = mapOf(
        "accept" to setOf(NEW), "reject" to setOf(NEW), "paid" to setOf(AWAITING, EXPIRED, CANCELLED),
        "expire" to setOf(AWAITING), "deliver" to setOf(PAID), "done" to setOf(PAID, DELIVERING),
    )

    /** Các trường *At là mili giây; nơi ghi chuyển thành Timestamp. */
    data class Transition(val patch: Map<String, Any>, val releasesLimit: Boolean)

    fun transition(o: OnlineOrder, action: String, now: Long, who: String = "", reason: String = ""): Transition {
        val from = FROM[action] ?: throw IllegalArgumentException("Hành động không hợp lệ: $action")
        if (o.status !in from) throw IllegalStateException("Đơn đã đổi sang \"${label(o.status)}\", hãy xem lại.")
        val by: Map<String, Any> = if (who.isNotBlank()) mapOf("handledBy" to who) else emptyMap()
        return when (action) {
            "accept" -> Transition(mapOf("status" to AWAITING, "transferContent" to transferContent(o.code), "confirmedAt" to now, "expiresAt" to now + PAY_MINUTES * 60_000L) + by, false)
            "reject" -> {
                val text = reason.trim()
                if (text.isEmpty()) throw IllegalArgumentException("Cần nhập lý do từ chối để khách biết.")
                Transition(mapOf("status" to REJECTED, "rejectReason" to text.take(200), "closedAt" to now) + by, true)
            }
            "paid" -> Transition(mapOf("status" to PAID, "paidAt" to now) + by, isPending(o.status))
            "expire" -> Transition(mapOf("status" to EXPIRED, "closedAt" to now) + by, true)
            "deliver" -> Transition(mapOf("status" to DELIVERING, "deliveringAt" to now) + by, false)
            else -> Transition(mapOf("status" to DONE, "doneAt" to now) + by, false)
        }
    }

    /** Đơn chờ thanh toán đã quá hạn thêm thời gian ân hạn: máy POS tự đóng thành "hết hạn". */
    fun overdueToClose(orders: List<OnlineOrder>, now: Long) = orders.filter { isOverdue(it, now - SWEEP_GRACE_MS) }

    /** Số đơn cần nhân viên để ý ngay: đơn mới + đơn quá hạn chờ đóng. */
    fun attention(orders: List<OnlineOrder>, now: Long) = orders.count { it.status == NEW || isOverdue(it, now) }

    /** Đơn MỚI chưa từng báo. */
    fun unseenNew(orders: List<OnlineOrder>, seen: Set<String>) = orders.filter { it.status == NEW && it.id !in seen }

    /** Câu đọc to qua loa. */
    fun announceText(fresh: List<OnlineOrder>): String =
        if (fresh.size == 1) "Có đơn online mới. ${modeLabel(fresh[0].mode)}, ${fresh[0].items.sumOf { it.qty }} món." else "Có ${fresh.size} đơn online mới."

    fun fromMap(id: String, d: Map<String, Any?>, ms: (Any?) -> Long?): OnlineOrder {
        val items = (d["items"] as? List<*>)?.mapNotNull { e ->
            (e as? Map<*, *>)?.let { OnlineLine(it["name"]?.toString().orEmpty(), (it["qty"] as? Number)?.toInt() ?: 0, it["note"]?.toString().orEmpty(), (it["price"] as? Number)?.toLong() ?: 0L, it["id"]?.toString().orEmpty()) }
        } ?: emptyList()
        fun s(k: String) = d[k]?.toString().orEmpty()
        return OnlineOrder(id, s("code").ifBlank { id }, s("uid"), s("name"), s("phone"), s("mode"), s("address"), s("table"), s("note"), items,
            (d["total"] as? Number)?.toLong() ?: 0L, s("status"), s("rejectReason"), ms(d["createdAt"]) ?: 0L, ms(d["expiresAt"]), ms(d["paidAt"]))
    }
}
