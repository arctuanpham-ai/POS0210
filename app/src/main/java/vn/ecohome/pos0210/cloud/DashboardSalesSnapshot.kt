package vn.ecohome.pos0210.cloud

import vn.ecohome.pos0210.data.BillEntity
import vn.ecohome.pos0210.data.DiningTableEntity
import vn.ecohome.pos0210.data.OrderBatchEntity
import vn.ecohome.pos0210.data.OrderItemEntity
import vn.ecohome.pos0210.data.TableSessionEntity
import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

/** Bàn đang mở: chỉ là TẠM TÍNH, không phải doanh thu. */
data class LiveTableSnapshot(val id: String, val name: String, val openedAt: Long?, val currentTotal: Long, val serviceStatus: String) {
    fun toMap(): Map<String, Any?> = mapOf("id" to id, "name" to name, "openedAt" to openedAt, "currentTotal" to currentTotal, "serviceStatus" to serviceStatus)
}

/** Phần bổ sung cho dashboard/current. Các trường doanh thu hiện có vẫn do FirebaseCloudSync ghi như cũ. */
data class CurrentDashboardSnapshot(val openTables: Int, val provisionalOpenTotal: Long, val liveTables: List<LiveTableSnapshot>) {
    fun toMap(): Map<String, Any?> = mapOf(
        "openTables" to openTables,
        "provisionalOpenTotal" to provisionalOpenTotal,
        "liveTables" to liveTables.map { it.toMap() }
    )
}

data class DailyItemSnapshot(val itemId: String, val name: String, val qty: Long, val revenue: Long) {
    fun toMap(): Map<String, Any?> = mapOf("itemId" to itemId, "name" to name, "qty" to qty, "revenue" to revenue)
}

data class DailySalesSnapshot(
    val dateKey: String,
    val revenue: Long,
    val paidBills: Int,
    val averageBill: Long,
    val items: List<DailyItemSnapshot>,
    val finalized: Boolean
) {
    /** updatedAt do nơi ghi thêm vào; không nằm trong fingerprint. */
    fun toMap(updatedAt: Long): Map<String, Any?> = mapOf(
        "dateKey" to dateKey,
        "updatedAt" to updatedAt,
        "revenue" to revenue,
        "paidBills" to paidBills,
        "averageBill" to averageBill,
        "items" to items.map { it.toMap() },
        "finalized" to finalized,
        "schemaVersion" to 1
    )
}

/** Doanh thu một tháng đã chốt. Chỉ bill PAID, dataScope LIVE, tính theo ngày mở bill (openedAt). Doanh thu bill (sau giảm giá), không phải giá món. */
data class MonthlySalesSnapshot(val monthKey: String, val revenue: Long, val paidBills: Int, val finalized: Boolean) {
    fun toMap(updatedAt: Long): Map<String, Any?> = mapOf(
        "monthKey" to monthKey,
        "updatedAt" to updatedAt,
        "revenue" to revenue,
        "paidBills" to paidBills,
        "finalized" to finalized,
        "schemaVersion" to 1
    )
}

/**
 * Tính snapshot hoàn toàn từ dữ liệu Local đã đọc sẵn. Hàm thuần: không ghi, sửa hay xoá
 * bill, order, payment hay menu.
 */
object DashboardSalesSnapshot {
    const val MAX_ITEMS = 50
    const val DAYS = 7

    fun dateKey(epochMillis: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalDate().toString()

    /** ID document daily chính là dateKey: chạy lại cùng ngày luôn ghi đè cùng một document. */
    fun dailyDocumentId(dateKey: String): String {
        require(Regex("""\d{4}-\d{2}-\d{2}""").matches(dateKey)) { "DATE_KEY_INVALID" }
        return dateKey
    }

    /** Hôm nay và 6 ngày trước đó, mới nhất trước. */
    fun lastDateKeys(todayKey: String, days: Int = DAYS): List<String> {
        val today = LocalDate.parse(todayKey)
        return (0 until days).map { today.minusDays(it.toLong()).toString() }
    }

    fun composeCurrent(
        tables: List<DiningTableEntity>,
        sessions: List<TableSessionEntity>,
        batches: List<OrderBatchEntity>,
        items: List<OrderItemEntity>
    ): CurrentDashboardSnapshot {
        val tableById = tables.associateBy { it.id }
        val itemsByBatch = items.groupBy { it.batchId }
        val live = sessions.filter { it.status == "OPEN" }.mapNotNull { session ->
            val table = tableById[session.tableId] ?: return@mapNotNull null
            // Lô đã huỷ không được cộng vào tạm tính.
            val active = batches.filter { it.sessionId == session.id && it.status != "CANCELLED" }
            val total = active.sumOf { batch -> itemsByBatch[batch.id].orEmpty().sumOf { it.unitPriceSnapshot * it.qty } }
            LiveTableSnapshot(table.id, table.name, session.openedAt, total, active.firstOrNull()?.status.orEmpty())
        }.sortedBy { it.openedAt ?: Long.MAX_VALUE }
        return CurrentDashboardSnapshot(live.size, live.sumOf { it.currentTotal }, live)
    }

    /**
     * Doanh thu một ngày. Chỉ bill PAID, dataScope LIVE; ngày tính theo ngày MỞ bill (openedAt) trong múi giờ [zone]: bill trả chậm qua hôm sau vẫn về đúng ngày bán.
     * Món lấy từ các lô không huỷ của phiên có bill đó, nên tổng món là trước giảm giá.
     */
    fun composeDaily(
        dateKey: String,
        todayKey: String,
        bills: List<BillEntity>,
        batches: List<OrderBatchEntity>,
        items: List<OrderItemEntity>,
        zone: ZoneId = ZoneId.systemDefault()
    ): DailySalesSnapshot {
        dailyDocumentId(dateKey)
        val day = LocalDate.parse(dateKey)
        val from = day.atStartOfDay(zone).toInstant().toEpochMilli()
        val to = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val paid = bills.filter { it.status == "PAID" && it.dataScope == "LIVE" && it.closedAt != null && it.openedAt in from until to }
        val revenue = paid.sumOf { it.total }
        // Một phiên chỉ được tính món một lần dù có nhiều bill.
        val sessionIds = paid.map { it.sessionId }.toSet()
        val batchIds = batches.filter { it.sessionId in sessionIds && it.status != "CANCELLED" }.map { it.id }.toSet()
        data class Acc(var name: String, var qty: Long, var revenue: Long)
        val grouped = linkedMapOf<String, Acc>()
        items.filter { it.batchId in batchIds }.forEach { item ->
            val id = item.menuItemId?.takeIf { it.isNotBlank() } ?: item.itemNameSnapshot
            val acc = grouped.getOrPut(id) { Acc(item.itemNameSnapshot, 0L, 0L) }
            acc.qty += item.qty
            acc.revenue += item.unitPriceSnapshot * item.qty
        }
        val rows = grouped.map { (id, acc) -> DailyItemSnapshot(id, acc.name, acc.qty, acc.revenue) }
            .sortedWith(compareByDescending<DailyItemSnapshot> { it.revenue }.thenBy { it.itemId })
            .take(MAX_ITEMS)
        return DailySalesSnapshot(
            dateKey = dateKey,
            revenue = revenue,
            paidBills = paid.size,
            averageBill = if (paid.isEmpty()) 0L else revenue / paid.size,
            items = rows,
            finalized = dateKey < todayKey
        )
    }

    const val MONTHS = 13

    fun monthKey(epochMillis: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        YearMonth.from(Instant.ofEpochMilli(epochMillis).atZone(zone)).toString()

    /** ID document monthly chính là monthKey (YYYY-MM): chạy lại cùng tháng luôn ghi đè cùng một document. */
    fun monthlyDocumentId(monthKey: String): String {
        require(Regex("""\d{4}-\d{2}""").matches(monthKey)) { "MONTH_KEY_INVALID" }
        return monthKey
    }

    /** Tháng hiện tại và 12 tháng trước đó, mới nhất trước. */
    fun lastMonthKeys(currentMonthKey: String, months: Int = MONTHS): List<String> {
        val current = YearMonth.parse(currentMonthKey)
        return (0 until months).map { current.minusMonths(it.toLong()).toString() }
    }

    fun composeMonthly(monthKey: String, currentMonthKey: String, bills: List<BillEntity>, zone: ZoneId = ZoneId.systemDefault()): MonthlySalesSnapshot {
        monthlyDocumentId(monthKey)
        val month = YearMonth.parse(monthKey)
        val from = month.atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val to = month.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val paid = bills.filter { it.status == "PAID" && it.dataScope == "LIVE" && it.closedAt != null && it.openedAt in from until to }
        return MonthlySalesSnapshot(monthKey, paid.sumOf { it.total }, paid.size, monthKey < currentMonthKey)
    }

    fun fingerprint(snapshot: MonthlySalesSnapshot): String =
        MessageDigest.getInstance("SHA-256")
            .digest(snapshot.toMap(0L).toSortedMap().toString().toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    /** Dấu vân tay chỉ gồm dữ liệu nghiệp vụ; bỏ updatedAt để không ghi lại khi chỉ đổi giờ. */
    fun fingerprint(snapshot: DailySalesSnapshot): String =
        MessageDigest.getInstance("SHA-256")
            .digest(snapshot.toMap(0L).toSortedMap().toString().toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
