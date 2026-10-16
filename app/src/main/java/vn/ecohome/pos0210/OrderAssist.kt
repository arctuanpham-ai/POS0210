package vn.ecohome.pos0210

import java.time.Instant
import java.time.ZoneId

/** Gợi ý mệnh giá khách đưa: vừa đủ, làm tròn lên 10k / 50k / 100k, và các tờ 200k / 500k đủ trả. Tối đa 5 lựa chọn. */
object CashSuggest {
    fun amounts(total: Long, max: Int = 5): List<Long> {
        if (total <= 0L) return emptyList()
        fun up(step: Long) = ((total + step - 1) / step) * step
        val raw = listOf(total, up(10_000L), up(20_000L), up(50_000L), up(100_000L), up(200_000L), up(500_000L))
        return raw.filter { it >= total }.distinct().sorted().take(max)
    }
}

/** Cảnh báo phục vụ trên màn bàn. Chỉ đọc dữ liệu đang có trên máy, không ghi gì. */
data class ServiceAlert(val tableId: String, val tableName: String, val kind: Kind, val minutes: Long, val count: Int = 0) {
    enum class Kind { SLOW_DISH, NOTHING_SENT, UNSENT_DRAFT }
}

object ServiceAlerts {
    data class Table(val id: String, val name: String)
    data class OpenSession(val id: String, val tableId: String, val openedAt: Long, val sentBatches: Int)
    data class WaitingBatch(val sessionId: String, val sentAt: Long)

    fun compute(
        tables: List<Table>, sessions: List<OpenSession>, waiting: List<WaitingBatch>, drafts: Map<String, Int>,
        now: Long, slowDishMinutes: Long = 12L, nothingSentMinutes: Long = 10L,
    ): List<ServiceAlert> {
        val name = tables.associate { it.id to it.name }
        val out = mutableListOf<ServiceAlert>()
        for (s in sessions) {
            val tableName = name[s.tableId] ?: continue
            val oldest = waiting.filter { it.sessionId == s.id }.minOfOrNull { it.sentAt }
            if (oldest != null) {
                val m = (now - oldest).coerceAtLeast(0L) / 60_000L
                if (m >= slowDishMinutes) out += ServiceAlert(s.tableId, tableName, ServiceAlert.Kind.SLOW_DISH, m, waiting.count { it.sessionId == s.id })
            }
            if (s.sentBatches == 0 && drafts[s.tableId] == null) {
                val m = (now - s.openedAt).coerceAtLeast(0L) / 60_000L
                if (m >= nothingSentMinutes) out += ServiceAlert(s.tableId, tableName, ServiceAlert.Kind.NOTHING_SENT, m)
            }
        }
        for ((tableId, count) in drafts) if (count > 0) name[tableId]?.let { out += ServiceAlert(tableId, it, ServiceAlert.Kind.UNSENT_DRAFT, 0L, count) }
        return out.sortedWith(compareBy<ServiceAlert> { it.kind.ordinal }.thenByDescending { it.minutes })
    }
}

/**
 * Dự báo doanh thu cuối ngày, chỉ từ bill trên máy.
 * Phần còn lại của hôm nay = trung bình doanh thu SAU giờ hiện tại của các ngày tham chiếu
 * (ưu tiên cùng thứ trong 4 tuần gần nhất nếu có ≥ 2 ngày, không thì 7 ngày gần nhất có bán).
 */
data class RevenueForecast(val soFar: Long, val expectedRest: Long, val total: Long, val basis: String, val days: Int)

object RevenueForecaster {
    data class Sale(val openedAt: Long, val total: Long)

    fun forecast(sales: List<Sale>, now: Long, zone: ZoneId = ZoneId.systemDefault()): RevenueForecast? {
        val nowZ = Instant.ofEpochMilli(now).atZone(zone)
        val today = nowZ.toLocalDate()
        val secondsIntoDay = nowZ.toLocalTime().toSecondOfDay()
        val byDay = sales.groupBy { Instant.ofEpochMilli(it.openedAt).atZone(zone).toLocalDate() }
        val soFar = byDay[today].orEmpty().sumOf { it.total }
        val past = byDay.keys.filter { it.isBefore(today) && !it.isBefore(today.minusDays(28)) }.sortedDescending()
        if (past.isEmpty()) return null
        val sameWeekday = past.filter { it.dayOfWeek == today.dayOfWeek }
        val (ref, basis) = if (sameWeekday.size >= 2) sameWeekday.take(4) to "cùng thứ ${sameWeekday.take(4).size} tuần trước" else past.take(7) to "${past.take(7).size} ngày gần nhất"
        val rest = ref.map { d -> byDay.getValue(d).filter { Instant.ofEpochMilli(it.openedAt).atZone(zone).toLocalTime().toSecondOfDay() >= secondsIntoDay }.sumOf { it.total } }
        val expectedRest = rest.sum() / ref.size
        return RevenueForecast(soFar, expectedRest, soFar + expectedRest, basis, ref.size)
    }
}

/** Thao tác nhạy cảm cần kiểm soát thất thoát (huỷ món, sửa bill đã thu, hoàn tiền, đổi phương thức, chỉnh tiền ca…). */
object SensitiveAudit {
    private val actions = setOf(
        "CANCELLED", "DRAFT_DELETED", "ITEM_CORRECTION_REQUESTED", "PAYMENT_METHOD_CHANGED", "REFUND", "SETTLE_TRANSFER",
        "PREPAID_UNPAID_CANCELLED", "PREPAID_ABANDONED", "PREPAID_EDITED", "PREPAID_EDIT_START", "KITCHEN_SKIPPED_VERBAL", "KITCHEN_SKIPPED_SERVED",
        "BILL_REPRINTED", "EDIT_CHECKOUT", "TAKEOVER", "REVIEWED", "AUTO_CLOSE", "OPENING_CASH_OVERRIDE", "DENIED", "SETTING_DENIED",
        "DISCOUNT_APPLIED", "VOUCHER_REDEEMED", "RESET_PREOPENING_DATA", "CLEAR_TEST_DATA", "DEFER_TO_NEXT_SHIFT",
    )
    fun isSensitive(entityType: String, action: String, payload: String = ""): Boolean =
        (action in actions && !(action == "DISCOUNT_APPLIED" && payload.contains("auto=true"))) || (entityType == "MENU" && action == "UPDATE" && payload.contains("price:") && !Regex("price:(\\d+)->\\1\\b").containsMatchIn(payload)) || (entityType == "PRICING")

    private val labels = mapOf(
        "CANCELLED" to "Huỷ lần gọi món", "DRAFT_DELETED" to "Xoá món nháp", "ITEM_CORRECTION_REQUESTED" to "Bớt món đã giao",
        "PAYMENT_METHOD_CHANGED" to "Đổi tiền mặt ↔ chuyển khoản", "REFUND" to "Hoàn tiền bill", "SETTLE_TRANSFER" to "Chốt hoàn tiền CK",
        "PREPAID_UNPAID_CANCELLED" to "Huỷ đơn trả trước chưa thu", "PREPAID_ABANDONED" to "Bỏ đơn trả trước", "PREPAID_EDITED" to "Sửa đơn trả trước",
        "PREPAID_EDIT_START" to "Mở sửa đơn trả trước", "KITCHEN_SKIPPED_VERBAL" to "Không in bếp (báo miệng)", "KITCHEN_SKIPPED_SERVED" to "Không in bếp (đã phục vụ)",
        "BILL_REPRINTED" to "In lại bill", "EDIT_CHECKOUT" to "Sửa giờ ra ca", "TAKEOVER" to "Nhận ca thay", "REVIEWED" to "Duyệt tiền ca", "AUTO_CLOSE" to "Tự đóng ca",
        "OPENING_CASH_OVERRIDE" to "Sửa tiền đầu kỳ", "DENIED" to "Bị chặn quyền", "SETTING_DENIED" to "Bị chặn sửa cài đặt", "VOUCHER_REDEEMED" to "Dùng voucher",
        "DEFER_TO_NEXT_SHIFT" to "Dời bill sang ca sau", "RESET_PREOPENING_DATA" to "Dọn dữ liệu trước khai trương", "CLEAR_TEST_DATA" to "Xoá dữ liệu test",
    )
    fun label(entityType: String, action: String): String = labels[action] ?: when {
        entityType == "MENU" && action == "UPDATE" -> "Sửa giá món"
        entityType == "PRICING" -> "Ưu đãi / điều chỉnh giá"
        else -> action
    }
}
