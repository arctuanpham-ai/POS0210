package vn.ecohome.pos0210.cloud

/** Lịch sử mua của một khách đặt online (theo số điện thoại) + ghi chú sở thích do nhân viên nhập. Logic thuần, có test. */
data class CustomerNote(val note: String = "", val updatedAt: Long = 0L, val updatedBy: String = "")

data class PastOrder(val code: String, val at: Long, val total: Long, val mode: String, val items: List<OnlineLine>)

data class CustomerProfile(
    val phone: String,
    val orderCount: Int,
    val totalSpend: Long,
    val lastAt: Long?,
    val favorites: List<Pair<String, Int>>,
    val history: List<PastOrder>,
    val note: CustomerNote,
) {
    val isRepeat get() = orderCount > 0
    /** Dòng tóm tắt cho thẻ đơn. */
    fun headline(): String = if (orderCount == 0) "Khách mới (chưa có đơn nào được thanh toán)"
    else "Khách quen · $orderCount lần mua · tổng ${CustomerProfiles.vnd(totalSpend)}"
}

object CustomerProfiles {
    /** Đơn được tính là đã mua: đã thu tiền trở đi. */
    val PURCHASED = setOf(OnlineOrderRules.PAID, OnlineOrderRules.DELIVERING, OnlineOrderRules.DONE)

    fun vnd(v: Long) = "%,d".format(v).replace(',', '.') + "đ"

    /** orders: mọi đơn của số điện thoại này (kể cả đơn hiện tại, được loại bằng excludeCode). */
    fun build(phone: String, orders: List<OnlineOrder>, note: CustomerNote, excludeCode: String = "", historyLimit: Int = 8): CustomerProfile {
        val bought = orders.filter { it.phone == phone && it.status in PURCHASED && it.code != excludeCode && !OnlineOrderRules.isTest(it) }
            .sortedByDescending { it.createdAt }
        val favorites = bought.flatMap { it.items }.filter { it.name.isNotBlank() }
            .groupBy { it.name.trim() }.mapValues { (_, v) -> v.sumOf { it.qty } }
            .entries.sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key }).take(3).map { it.key to it.value }
        return CustomerProfile(
            phone, bought.size, bought.sumOf { it.total }, bought.firstOrNull()?.createdAt, favorites,
            bought.take(historyLimit).map { PastOrder(it.code, it.createdAt, it.total, it.mode, it.items) }, note,
        )
    }
}
