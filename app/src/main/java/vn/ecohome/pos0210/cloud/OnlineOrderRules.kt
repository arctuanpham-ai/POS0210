package vn.ecohome.pos0210.cloud

/** Đơn đặt món online (khách đặt trên datmon0210.web.app). Logic thuần, khớp web-dashboard/online-orders.js và Firestore rules. */
data class OnlineLine(val name: String, val qty: Int, val note: String, val price: Long, val id: String = "")

data class OnlineOrder(
    val id: String, val code: String, val uid: String, val name: String, val phone: String,
    val mode: String, val address: String, val table: String, val note: String,
    val items: List<OnlineLine>, val total: Long, val status: String, val rejectReason: String,
    val createdAt: Long, val expiresAt: Long?, val paidAt: Long?,
    val discount: Long = 0L, val surcharge: Long = 0L,
    /** Đơn do nhân viên đặt hộ khách Facebook trên link /nv (src.medium = staff_assist): POS không chuông, tự nhận đơn, chỉ ghi bill + doanh thu. */
    val staffAssist: Boolean = false,
    /** Cách thu tiền quán ghi nhận: "transfer" | "cash" (rỗng = chưa ghi; đơn cũ coi là chuyển khoản). */
    val payMethod: String = "",
)

object OnlineOrderRules {
    const val NEW = "new"; const val REJECTED = "rejected"; const val AWAITING = "awaiting_payment"; const val EXPIRED = "expired"
    const val PAID = "paid"; const val DELIVERING = "delivering"; const val DONE = "done"; const val CANCELLED = "cancelled"
    const val STAFF_MEDIUM = "staff_assist"
    const val SWEEP_GRACE_MS = 3 * 60_000L
    val ACTIVE_STATUSES = listOf(NEW, AWAITING, PAID, DELIVERING)
    val REJECT_REASONS = listOf("Hết món", "Quán sắp đóng cửa", "Ngoài khu vực giao hàng", "Quán đang quá tải, xin lỗi bạn")

    /** Đơn kiểm thử tự động của hệ thống (sau mỗi lần deploy web): POS không báo chuông, không hiển thị, không tính doanh thu. */
    const val TEST_NAME = "KIEM THU TU DONG"
    fun isTest(o: OnlineOrder) = o.name == TEST_NAME

    fun label(status: String) = when (status) {
        NEW -> "Chờ quán xác nhận"; REJECTED -> "Đã từ chối"; AWAITING -> "Đã nhận đơn · đang làm"; EXPIRED -> "Hết hạn"
        PAID -> "Đã thu tiền · đang làm"; DELIVERING -> "Đang giao"; DONE -> "Hoàn thành"; CANCELLED -> "Khách đã huỷ"; else -> status
    }
    fun modeLabel(mode: String) = when (mode) { "delivery" -> "Giao tận nơi"; "dinein" -> "Tại quán"; else -> "Mang đi" }

    fun transferContent(code: String) = "DM$code"
    fun limitKeys(o: OnlineOrder) = listOf("u_${o.uid}", "p_${o.phone}")
    /** Còn giữ lượt giới hạn 2 đơn chờ: chờ quán nhận, hoặc đơn cũ (có hạn thanh toán) đang chờ. Đơn mới: quán nhận là nhả lượt. */
    fun holdsLimit(o: OnlineOrder) = o.status == NEW || (o.status == AWAITING && o.expiresAt != null)
    const val TRANSFER = "transfer"; const val CASH = "cash"
    /** Đã thu tiền: có paidAt, hoặc đơn cũ ở trạng thái "paid", hoặc đã xong kèm cách thu. */
    fun isPaid(o: OnlineOrder) = o.paidAt != null || o.status == PAID || (o.status == DONE && o.payMethod.isNotBlank())
    fun payLabel(o: OnlineOrder) = if (!isPaid(o)) "CHƯA THU" else "ĐÃ THU · " + if (o.payMethod == CASH) "TIỀN MẶT" else "CHUYỂN KHOẢN"
    /** Lời nhắc gửi khách. Không nêu số tiền phí COD vì quán chưa có biểu phí. */
    fun remindMessage(o: OnlineOrder, bank: String = ""): String {
        val amount = "%,d".format(java.util.Locale("vi", "VN"), o.total) + "đ"
        val how = if (bank.isNotBlank()) "Bạn chuyển khoản giúp quán $amount tới $bank, nội dung: ${transferContent(o.code)}. " else "Bạn chuyển khoản giúp quán $amount, nội dung: ${transferContent(o.code)}. Mã QR có sẵn ở trang theo dõi đơn trên datmon0210.web.app. "
        val tail = if (o.mode == "delivery") "Chuyển khoản trước giúp bạn không bị mất thêm phí thu hộ COD. " else ""
        return "Chào ${o.name.trim().ifBlank { "bạn" }}, quán 0210 nhắc đơn ${o.code} chưa thanh toán. $how${tail}Cảm ơn bạn!"
    }
    fun isOverdue(o: OnlineOrder, now: Long) = o.status == AWAITING && o.expiresAt != null && o.expiresAt <= now
    /** Giá trị mới của bộ đếm giới hạn khi đóng đơn: giảm 1, không âm. */
    fun releasedCount(pending: Any?): Long = ((pending as? Number)?.toLong() ?: 0L).minus(1).coerceAtLeast(0L)

    data class Action(val key: String, val label: String, val method: String = "")
    private val PAY_BTNS = listOf(Action("paid", "ĐÃ NHẬN CHUYỂN KHOẢN", TRANSFER), Action("paid", "THU TIỀN MẶT", CASH))
    private val DONE_UNPAID = listOf(Action("done", "HOÀN THÀNH (KHÁCH CK)", TRANSFER), Action("done", "HOÀN THÀNH (TIỀN MẶT)", CASH))
    private val REMIND = Action("remind", "NHẮC KHÁCH THANH TOÁN")
    fun actions(o: OnlineOrder, now: Long): List<Action> {
        val deliver = if (o.mode == "delivery") listOf(Action("deliver", "ĐANG GIAO")) else emptyList()
        return when (o.status) {
            NEW -> listOf(Action("accept", "NHẬN ĐƠN"), Action("reject", "TỪ CHỐI"))
            AWAITING -> deliver + PAY_BTNS + DONE_UNPAID + REMIND + Action("expire", "HUỶ ĐƠN")
            EXPIRED -> listOf(Action("paid", "KHÁCH TRẢ MUỘN: ĐÃ NHẬN CK", TRANSFER), Action("paid", "KHÁCH TRẢ MUỘN: TIỀN MẶT", CASH))
            CANCELLED -> listOf(Action("paid", "KHÁCH ĐÃ CK TRƯỚC KHI HUỶ: GHI NHẬN", TRANSFER))
            PAID -> deliver + Action("done", "HOÀN THÀNH")
            DELIVERING -> if (isPaid(o)) listOf(Action("done", "HOÀN THÀNH")) else DONE_UNPAID + PAY_BTNS + REMIND
            else -> emptyList()
        }
    }

    // "paid" cũng được từ expired/cancelled (khách chuyển muộn) và từ delivering (thu khi giao, giữ trạng thái đang giao).
    private val FROM = mapOf(
        "accept" to setOf(NEW), "reject" to setOf(NEW), "paid" to setOf(AWAITING, EXPIRED, CANCELLED, DELIVERING),
        "expire" to setOf(AWAITING), "deliver" to setOf(AWAITING, PAID), "done" to setOf(AWAITING, PAID, DELIVERING),
    )

    /** Các trường *At là mili giây; nơi ghi chuyển thành Timestamp. */
    data class Transition(val patch: Map<String, Any>, val releasesLimit: Boolean)

    private fun needMethod(m: String): String { if (m != TRANSFER && m != CASH) throw IllegalArgumentException("Chọn cách thu tiền: chuyển khoản hoặc tiền mặt."); return m }

    /** Đơn mới nhận không có hạn thanh toán (expiresAt null); tiền thu trước hoặc sau đều được, ghi paidAt + payMethod. */
    fun transition(o: OnlineOrder, action: String, now: Long, who: String = "", reason: String = "", method: String = ""): Transition {
        val from = FROM[action] ?: throw IllegalArgumentException("Hành động không hợp lệ: $action")
        if (o.status !in from) throw IllegalStateException("Đơn đã đổi sang \"${label(o.status)}\", hãy xem lại.")
        val by: Map<String, Any> = if (who.isNotBlank()) mapOf("handledBy" to who) else emptyMap()
        val release = holdsLimit(o)
        return when (action) {
            "accept" -> Transition(mapOf("status" to AWAITING, "transferContent" to transferContent(o.code), "confirmedAt" to now, "expiresAt" to NULL) + by, true)
            "reject" -> {
                val text = reason.trim()
                if (text.isEmpty()) throw IllegalArgumentException("Cần nhập lý do từ chối để khách biết.")
                Transition(mapOf("status" to REJECTED, "rejectReason" to text.take(200), "closedAt" to now) + by, true)
            }
            "paid" -> {
                if (isPaid(o) && o.status != EXPIRED && o.status != CANCELLED) throw IllegalStateException("Đơn này đã thu tiền rồi.")
                val status = if (o.status == DELIVERING) DELIVERING else PAID
                Transition(mapOf("status" to status, "paidAt" to now, "payMethod" to needMethod(method)) + by, release)
            }
            "expire" -> Transition(mapOf("status" to EXPIRED, "closedAt" to now) + by, release)
            "deliver" -> Transition(mapOf("status" to DELIVERING, "deliveringAt" to now) + by, release)
            else -> {
                // Hoàn thành khi chưa thu: phải chọn cách thu để bill/doanh thu đúng.
                val pay: Map<String, Any> = if (isPaid(o)) emptyMap() else mapOf("paidAt" to now, "payMethod" to needMethod(method))
                Transition(mapOf("status" to DONE, "doneAt" to now) + pay + by, release)
            }
        }
    }
    /** Giá trị đánh dấu "ghi null" trong patch (Map<String, Any> không chứa null). */
    val NULL = Any()

    /** Đơn chờ thanh toán đã quá hạn thêm thời gian ân hạn: máy POS tự đóng thành "hết hạn". */
    fun overdueToClose(orders: List<OnlineOrder>, now: Long) = orders.filter { isOverdue(it, now - SWEEP_GRACE_MS) }

    /** Số đơn cần nhân viên để ý ngay: đơn mới + đơn quá hạn chờ đóng. */
    fun attention(orders: List<OnlineOrder>, now: Long) = orders.count { (it.status == NEW && !it.staffAssist) || isOverdue(it, now) }

    /** Đơn MỚI chưa từng báo. */
    fun unseenNew(orders: List<OnlineOrder>, seen: Set<String>) = orders.filter { it.status == NEW && !it.staffAssist && it.id !in seen }

    /** Đơn nhân viên đặt hộ cần POS tự nhận (im lặng) / tự hoàn thành khi đã nhận tiền để ghi bill. */
    fun staffToAccept(orders: List<OnlineOrder>) = orders.filter { it.staffAssist && it.status == NEW }
    fun staffToFinish(orders: List<OnlineOrder>) = orders.filter { it.staffAssist && it.status == PAID }

    /**
     * Đối chiếu đơn với menu/combo THẬT của quán. Đơn từ 4 dòng trở lên không được máy chủ kiểm giá từng dòng (giới hạn của Firestore Rules),
     * nên POS kiểm trước khi cho NHẬN ĐƠN. menu: id món -> giá; combos: id combo (không có tiền tố "c_") -> giá. Trả danh sách lỗi (rỗng = khớp).
     */
    fun priceProblems(o: OnlineOrder, menu: Map<String, Long>, combos: Map<String, Long>): List<String> {
        val out = mutableListOf<String>()
        var sum = 0L
        for (l in o.items) {
            val real = if (l.id.startsWith("c_")) combos[l.id.removePrefix("c_")] else menu[l.id]
            val label = l.name.trim().ifBlank { l.id.ifBlank { "?" } }
            when {
                l.id.isBlank() || l.qty < 1 || l.qty > 20 || l.price <= 0 -> out += "$label: dòng món không hợp lệ"
                real == null -> out += "$label: không còn trong menu"
                real != l.price -> out += "$label: khách gửi ${l.price}đ, menu hiện ${real}đ"
            }
            sum += l.price * l.qty.coerceAtLeast(0)
        }
        if (o.items.isEmpty()) out += "Đơn không có món"
        if (o.total != sum + o.surcharge - o.discount) out += "Tổng tiền ${o.total}đ không khớp các dòng (${sum + o.surcharge - o.discount}đ)"
        return out
    }

    /** Câu đọc to qua loa. */
    fun announceText(fresh: List<OnlineOrder>): String =
        if (fresh.size == 1) "Có đơn online mới. ${modeLabel(fresh[0].mode)}, ${fresh[0].items.sumOf { it.qty }} món." else "Có ${fresh.size} đơn online mới."

    fun fromMap(id: String, d: Map<String, Any?>, ms: (Any?) -> Long?): OnlineOrder {
        val items = (d["items"] as? List<*>)?.mapNotNull { e ->
            (e as? Map<*, *>)?.let { OnlineLine(it["name"]?.toString().orEmpty(), (it["qty"] as? Number)?.toInt() ?: 0, it["note"]?.toString().orEmpty(), (it["price"] as? Number)?.toLong() ?: 0L, it["id"]?.toString().orEmpty()) }
        } ?: emptyList()
        fun s(k: String) = d[k]?.toString().orEmpty()
        return OnlineOrder(id, s("code").ifBlank { id }, s("uid"), s("name"), s("phone"), s("mode"), s("address"), s("table"), s("note"), items,
            (d["total"] as? Number)?.toLong() ?: 0L, s("status"), s("rejectReason"), ms(d["createdAt"]) ?: 0L, ms(d["expiresAt"]), ms(d["paidAt"]),
            (d["discount"] as? Number)?.toLong() ?: 0L, (d["surcharge"] as? Number)?.toLong() ?: 0L,
            ((d["src"] as? Map<*, *>)?.get("medium")?.toString() == STAFF_MEDIUM), s("payMethod"))
    }
}
