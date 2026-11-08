package vn.ecohome.pos0210.cloud

import android.content.Context
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.util.Date

/**
 * Đơn đặt món online (khách đặt ở datmon0210.web.app) xử lý ngay trên POS.
 * Khớp từng chữ với web-dashboard/online-orders.js và rules online-orders.rules:
 * cùng trạng thái, cùng điều kiện chuyển, cùng cách trả lại bộ đếm "tối đa 2 đơn chờ".
 * Doanh thu online chỉ tính khi nhân viên bấm "Hoàn thành" (doneAt), tách riêng khỏi bill tại quán.
 */
data class OnlineLine(val name: String, val qty: Int, val price: Long, val note: String)

data class OnlineOrder(
    val id: String, val code: String, val uid: String, val name: String, val phone: String, val mode: String,
    val address: String, val table: String, val note: String, val items: List<OnlineLine>,
    val total: Long, val discount: Long, val status: String, val rejectReason: String,
    val createdAt: Long, val expiresAt: Long?, val paidAt: Long?, val doneAt: Long?
)

data class OnlineState(val orders: List<OnlineOrder> = emptyList(), val error: String? = null, val loaded: Boolean = false)

object OnlineStatus {
    const val NEW = "new"; const val REJECTED = "rejected"; const val AWAITING_PAYMENT = "awaiting_payment"; const val EXPIRED = "expired"
    const val PAID = "paid"; const val DELIVERING = "delivering"; const val DONE = "done"; const val CANCELLED = "cancelled"
    const val PAY_MINUTES = 10L
    val REJECT_REASONS = listOf("Hết món", "Quán sắp đóng cửa", "Ngoài khu vực giao hàng", "Quán đang quá tải, xin lỗi bạn")
    fun label(status: String) = when (status) {
        NEW -> "Chờ quán xác nhận"; REJECTED -> "Đã từ chối"; AWAITING_PAYMENT -> "Chờ khách thanh toán"; EXPIRED -> "Hết hạn"
        PAID -> "Đã nhận tiền · đang làm"; DELIVERING -> "Đang giao"; DONE -> "Hoàn thành"; CANCELLED -> "Khách đã huỷ"; else -> status
    }
    fun modeLabel(mode: String) = when (mode) { "delivery" -> "Giao tận nơi"; "pickup" -> "Mang đi"; "dinein" -> "Tại quán"; else -> mode }
}

enum class OnlineAction(val key: String, val from: Set<String>) {
    ACCEPT("accept", setOf("new")), REJECT("reject", setOf("new")),
    PAID("paid", setOf("awaiting_payment", "expired", "cancelled")), EXPIRE("expire", setOf("awaiting_payment")),
    DELIVER("deliver", setOf("paid")), DONE("done", setOf("paid", "delivering"))
}

data class OnlineButton(val action: OnlineAction, val label: String, val primary: Boolean)

object OnlineOrderLogic {
    fun isPending(o: OnlineOrder) = o.status == OnlineStatus.NEW || o.status == OnlineStatus.AWAITING_PAYMENT
    fun isOverdue(o: OnlineOrder, now: Long) = o.status == OnlineStatus.AWAITING_PAYMENT && o.expiresAt != null && o.expiresAt <= now

    /** Nút nhân viên được bấm theo trạng thái. Nút đầu là hành động chính. */
    fun buttons(o: OnlineOrder, now: Long): List<OnlineButton> = when (o.status) {
        OnlineStatus.NEW -> listOf(OnlineButton(OnlineAction.ACCEPT, "XÁC NHẬN ĐƠN", true), OnlineButton(OnlineAction.REJECT, "Từ chối", false))
        OnlineStatus.AWAITING_PAYMENT -> listOf(
            OnlineButton(OnlineAction.PAID, "XÁC NHẬN ĐÃ NHẬN TIỀN", true),
            OnlineButton(OnlineAction.EXPIRE, if (isOverdue(o, now)) "Đóng đơn hết hạn" else "Huỷ (khách không trả)", false)
        )
        OnlineStatus.EXPIRED -> listOf(OnlineButton(OnlineAction.PAID, "Khách trả muộn: đã nhận tiền", true))
        OnlineStatus.CANCELLED -> listOf(OnlineButton(OnlineAction.PAID, "Khách đã chuyển tiền trước khi huỷ: ghi nhận", false))
        OnlineStatus.PAID -> if (o.mode == "delivery")
            listOf(OnlineButton(OnlineAction.DELIVER, "XÁC NHẬN ĐANG GIAO", true), OnlineButton(OnlineAction.DONE, "Hoàn thành", false))
        else listOf(OnlineButton(OnlineAction.DONE, "XÁC NHẬN HOÀN THÀNH", true))
        OnlineStatus.DELIVERING -> listOf(OnlineButton(OnlineAction.DONE, "XÁC NHẬN HOÀN THÀNH", true))
        else -> emptyList()
    }

    /** Patch cho tài liệu đơn + có phải trả lại bộ đếm giới hạn không. Ném lỗi nếu trạng thái không hợp lệ. */
    fun transition(o: OnlineOrder, action: OnlineAction, now: Long, who: String, reason: String = ""): Pair<Map<String, Any>, Boolean> {
        require(o.status in action.from) { "Đơn đã đổi sang \"${OnlineStatus.label(o.status)}\", hãy xem lại." }
        val by: Map<String, Any> = if (who.isNotBlank()) mapOf("handledBy" to who) else emptyMap()
        return when (action) {
            OnlineAction.ACCEPT -> Pair(mapOf<String, Any>(
                "status" to OnlineStatus.AWAITING_PAYMENT, "transferContent" to "DM${o.code}",
                "confirmedAt" to ts(now), "expiresAt" to ts(now + OnlineStatus.PAY_MINUTES * 60_000)) + by, false)
            OnlineAction.REJECT -> {
                val text = reason.trim()
                require(text.isNotEmpty()) { "Cần nhập lý do từ chối để khách biết." }
                Pair(mapOf<String, Any>("status" to OnlineStatus.REJECTED, "rejectReason" to text.take(200), "closedAt" to ts(now)) + by, true)
            }
            OnlineAction.PAID -> Pair(mapOf<String, Any>("status" to OnlineStatus.PAID, "paidAt" to ts(now)) + by, isPending(o))
            OnlineAction.EXPIRE -> Pair(mapOf<String, Any>("status" to OnlineStatus.EXPIRED, "closedAt" to ts(now)) + by, true)
            OnlineAction.DELIVER -> Pair(mapOf<String, Any>("status" to OnlineStatus.DELIVERING, "deliveringAt" to ts(now)) + by, false)
            OnlineAction.DONE -> Pair(mapOf<String, Any>("status" to OnlineStatus.DONE, "doneAt" to ts(now)) + by, false)
        }
    }

    private fun ts(ms: Long) = Timestamp(Date(ms))

    /** Số đơn cần để ý: đơn mới + đơn quá hạn thanh toán. */
    fun attention(orders: List<OnlineOrder>, now: Long) = orders.count { it.status == OnlineStatus.NEW || isOverdue(it, now) }

    /** Doanh thu online ghi nhận khi bấm Hoàn thành trong khoảng [from, to), tách riêng khỏi bill tại quán. */
    fun revenue(orders: List<OnlineOrder>, from: Long, to: Long): Pair<Long, Int> {
        val done = orders.filter { it.status == OnlineStatus.DONE && (it.doneAt ?: it.paidAt ?: it.createdAt) in from until to }
        return Pair(done.sumOf { it.total }, done.size)
    }

    fun newCodes(orders: List<OnlineOrder>, seen: Set<String>) = orders.filter { it.status == OnlineStatus.NEW && it.id !in seen }.map { it.id }
}

object OnlineOrdersCloud {
    private const val LOOKBACK_MS = 7L * 24 * 3600 * 1000

    private fun millis(v: Any?): Long? = when (v) { is Timestamp -> v.toDate().time; is Long -> v; is Number -> v.toLong(); is Date -> v.time; else -> null }

    internal fun parse(d: DocumentSnapshot): OnlineOrder? {
        val status = d.getString("status") ?: return null
        val items = (d.get("items") as? List<*>)?.mapNotNull { raw ->
            val m = raw as? Map<*, *> ?: return@mapNotNull null
            OnlineLine(m["name"]?.toString().orEmpty().trim(), (m["qty"] as? Number)?.toInt() ?: 1, (m["price"] as? Number)?.toLong() ?: 0L, m["note"]?.toString().orEmpty())
        }.orEmpty()
        return OnlineOrder(
            id = d.id, code = d.getString("code") ?: d.id, uid = d.getString("uid").orEmpty(), name = d.getString("name").orEmpty(),
            phone = d.getString("phone").orEmpty(), mode = d.getString("mode").orEmpty(), address = d.getString("address").orEmpty(),
            table = d.getString("table").orEmpty(), note = d.getString("note").orEmpty(), items = items,
            total = d.getLong("total") ?: 0L, discount = d.getLong("discount") ?: 0L, status = status, rejectReason = d.getString("rejectReason").orEmpty(),
            createdAt = millis(d.get("createdAt")) ?: 0L, expiresAt = millis(d.get("expiresAt")), paidAt = millis(d.get("paidAt")), doneAt = millis(d.get("doneAt"))
        )
    }

    private suspend fun root(context: Context): Pair<FirebaseFirestore, com.google.firebase.firestore.DocumentReference> {
        val c = FirebaseCloudSync.config(context)
        require(c.valid) { "Chưa cấu hình Firebase" }
        val app = FirebaseCloudSync.firebaseApp(context, c)
        val uid = FirebaseAuth.getInstance(app).currentUser?.uid ?: error("Chưa đăng nhập Firebase (vào Quản lý > Đồng bộ đám mây)")
        val fs = FirebaseFirestore.getInstance(app)
        return Pair(fs, fs.collection("users").document(uid).collection("stores").document("0210"))
    }

    /** Nghe đơn của 7 ngày gần nhất theo thời gian thực (chỉ tải phần thay đổi sau lần đầu). */
    fun observe(context: Context): Flow<OnlineState> = callbackFlow {
        val pair = runCatching { root(context) }.getOrElse { trySend(OnlineState(error = it.message, loaded = true)); close(); return@callbackFlow }
        val since = Timestamp(Date(System.currentTimeMillis() - LOOKBACK_MS))
        val reg = pair.second.collection("online_orders").whereGreaterThanOrEqualTo("createdAt", since).orderBy("createdAt", Query.Direction.ASCENDING)
            .addSnapshotListener { snap, error ->
                if (error != null) trySend(OnlineState(error = if (error.code == com.google.firebase.firestore.FirebaseFirestoreException.Code.PERMISSION_DENIED) "Chưa có quyền đọc đơn online (kiểm tra Firestore Rules)" else error.message, loaded = true))
                else trySend(OnlineState(orders = snap?.documents?.mapNotNull { parse(it) }.orEmpty(), loaded = true))
            }
        awaitClose { reg.remove() }
    }

    /** Đổi trạng thái trong MỘT transaction: đọc lại đơn (tránh 2 người bấm cùng lúc) và trả bộ đếm giới hạn khi đóng đơn. */
    suspend fun apply(context: Context, orderId: String, action: OnlineAction, who: String, reason: String = ""): Result<Unit> = runCatching {
        val (fs, rootRef) = root(context)
        val orderRef = rootRef.collection("online_orders").document(orderId)
        fs.runTransaction { tx ->
            val snap = tx.get(orderRef)
            if (!snap.exists()) throw IllegalStateException("Đơn không còn tồn tại.")
            val current = parse(snap) ?: throw IllegalStateException("Đơn lỗi dữ liệu.")
            val (patch, release) = OnlineOrderLogic.transition(current, action, System.currentTimeMillis(), who, reason)
            val limitRefs = if (release) listOf("u_${current.uid}", "p_${current.phone}").map { rootRef.collection("online_limits").document(it) } else emptyList()
            val limitSnaps = limitRefs.map { tx.get(it) }
            tx.update(orderRef, patch)
            limitSnaps.forEachIndexed { i, ls -> if (ls.exists()) tx.update(limitRefs[i], "pending", maxOf(0L, (ls.getLong("pending") ?: 0L) - 1)) }
            null
        }.await()
        Unit
    }
}
