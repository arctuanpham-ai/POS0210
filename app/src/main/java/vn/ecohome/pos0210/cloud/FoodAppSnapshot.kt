package vn.ecohome.pos0210.cloud

import vn.ecohome.pos0210.FoodApp
import vn.ecohome.pos0210.data.AuditEventEntity
import vn.ecohome.pos0210.data.BillEntity
import vn.ecohome.pos0210.data.PaymentEntity
import java.security.MessageDigest
import java.time.LocalDate
import java.time.ZoneId

/**
 * Tài liệu dashboard/foodApp cho tab "App food" trên web: tiền đang chờ app trả, đơn chờ, đơn đã nhận (kèm phí app)
 * và doanh thu 14 ngày theo ngày bán. Một tài liệu duy nhất, chỉ ghi khi nội dung đổi.
 */
object FoodAppSnapshot {
    const val DAYS = 14
    private const val MAX_PENDING = 100
    private const val MAX_SETTLED = 60


    /** Chưa có đơn app food nào thì trả null (không tạo tài liệu rỗng). */
    fun compose(bills: List<BillEntity>, payments: List<PaymentEntity>, settlements: List<AuditEventEntity>, todayKey: String, zone: ZoneId): Map<String, Any?>? {
        val paidById = bills.filter { it.status == "PAID" && it.dataScope == "LIVE" }.associateBy { it.id }
        val food = payments.filter { it.dataScope == "LIVE" && FoodApp.isFood(it.method) && it.billId in paidById }
        if (food.isEmpty()) return null
        val settledBy = settlements.filter { it.action == "SETTLED" }.associateBy { it.entityId }
        val pending = food.filter { it.billId !in settledBy }
        val settled = food.filter { it.billId in settledBy }

        fun pendingOf(app: String) = pending.filter { it.method == app }
        val pendingMap = FoodApp.APPS.associateWith { app -> mapOf("count" to pendingOf(app).size.toLong(), "amount" to pendingOf(app).sumOf { it.amount }) }
        val pendingOrders = pending.sortedByDescending { it.paidAt }.take(MAX_PENDING).map {
            mapOf("billId" to it.billId, "app" to it.method, "code" to FoodApp.codeOf(it.reference, it.method), "amount" to it.amount, "at" to it.paidAt, "billNo" to (paidById[it.billId]?.billNo ?: ""))
        }
        val settledOrders = settled.sortedByDescending { settledBy[it.billId]?.occurredAt ?: 0L }.take(MAX_SETTLED).map {
            val ev = settledBy.getValue(it.billId)
            val n = FoodApp.payloadNumbers(ev.payload)
            val received = n["received"] ?: 0L; val commission = n["commission"] ?: 0L; val vat = n["vat"] ?: 0L; val pit = n["pit"] ?: 0L
            mapOf("app" to it.method, "code" to FoodApp.codeOf(it.reference, it.method), "amount" to it.amount, "received" to received,
                "commission" to commission, "vat" to vat, "pit" to pit, "other" to (it.amount - received - commission - vat - pit).coerceAtLeast(0L), "at" to ev.occurredAt)
        }
        val today = LocalDate.parse(todayKey)
        val days = (0 until DAYS).map { today.minusDays(it.toLong()) }.mapNotNull { day ->
            val from = day.atStartOfDay(zone).toInstant().toEpochMilli()
            val to = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
            val rows = food.filter { p -> paidById[p.billId]?.let { b -> b.closedAt != null && b.openedAt in from until to } == true }
            if (rows.isEmpty()) null else {
                val m = linkedMapOf<String, Any?>("date" to day.toString())
                FoodApp.APPS.forEach { app -> m[app] = rows.filter { it.method == app }.sumOf { it.amount }; m[app + "_N"] = rows.count { it.method == app }.toLong() }
                m
            }
        }
        return mapOf("pending" to pendingMap, "pendingOrders" to pendingOrders, "settledOrders" to settledOrders, "days" to days)
    }

    fun fingerprint(data: Map<String, Any?>): String =
        MessageDigest.getInstance("SHA-256").digest(data.toSortedMap().toString().toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}
