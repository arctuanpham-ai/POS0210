package vn.ecohome.pos0210

import vn.ecohome.pos0210.data.PurchaseEntity

/**
 * Báo cáo tháng để chia tiền cổ đông: phân loại chi, cảnh báo trước khi chốt, bản chốt số và nội dung gửi cổ đông.
 * Hàm thuần, chỉ đọc dữ liệu đã có; bản chốt lưu thành một dòng cài đặt riêng, không đụng dữ liệu bán hàng.
 */
object ShareholderMonth {
    /** Không phải chi phí: góp/rút vốn, rút lợi nhuận, vốn lưu động. Nếu lỡ nhập thành phiếu chi thì không trừ vào tiền chia. */
    val NON_EXPENSE = setOf(ExpenseCategories.WORKING_CAPITAL, ExpenseCategories.OWNER_CONTRIBUTION, ExpenseCategories.OWNER_WITHDRAWAL, ExpenseCategories.PROFIT_WITHDRAWAL)
    val INITIAL = setOf(ExpenseCategories.SETUP_COST, ExpenseCategories.INITIAL_INVESTMENT_SUNK, ExpenseCategories.CAPITAL_ASSET)

    fun isOperating(category: String) = category !in INITIAL && category != ExpenseCategories.ADDITIONAL_INVESTMENT && category !in NON_EXPENSE

    /** Chi vận hành trong [from, to) theo nhóm, nhiều tiền nhất trước. Chỉ phiếu ACTIVE. */
    fun operatingByCategory(purchases: List<PurchaseEntity>, from: Long, to: Long): List<Pair<String, Long>> =
        purchases.filter { it.status == "ACTIVE" && it.purchasedAt in from until to && isOperating(it.expenseCategory) }
            .groupBy { it.expenseCategory }.map { (k, v) -> k to v.sumOf { it.total } }
            .sortedWith(compareByDescending<Pair<String, Long>> { it.second }.thenBy { it.first })

    /** Lý do CHƯA NÊN chốt chia tiền. Rỗng nghĩa là có thể chốt. */
    fun warnings(openSessionsOpenedInMonth: Int, lastPullAt: Long?, now: Long, monthEnd: Long, unclassified: Long): List<String> = buildList {
        if (now < monthEnd) add("Tháng chưa kết thúc: số còn thay đổi.")
        if (openSessionsOpenedInMonth > 0) add("Còn $openSessionsOpenedInMonth bàn/đơn mở trong tháng chưa thanh toán: doanh thu tháng chưa đủ.")
        if (lastPullAt == null) add("Máy chưa từng kéo phiếu chi từ web: chi phí có thể thiếu.")
        else if (now - lastPullAt > 6 * 3_600_000L) add("Phiếu chi từ web cập nhật cách đây ${(now - lastPullAt) / 3_600_000L} giờ: bấm đồng bộ trước khi chốt.")
        if (unclassified > 0) add("Có ${"%,d".format(unclassified).replace(',', '.')}đ chi phí chưa phân loại.")
    }

    data class Close(val monthKey: String, val revenue: Long, val operating: Long, val additional: Long, val net: Long, val closedAt: Long, val closedBy: String, val shares: List<Pair<String, Long>>)

    fun settingKey(monthKey: String) = "month_close_$monthKey"

    /** Bản chốt dạng một dòng: an toàn với ký tự | và ; trong tên. */
    fun encode(c: Close): String {
        fun clean(s: String) = s.replace('|', '/').replace(';', ',').replace('=', '-').replace('\n', ' ')
        return listOf("v1", c.monthKey, c.revenue, c.operating, c.additional, c.net, c.closedAt, clean(c.closedBy), c.shares.joinToString(";") { "${clean(it.first)}=${it.second}" }).joinToString("|")
    }

    fun decode(raw: String?): Close? = runCatching {
        val p = raw!!.split("|")
        require(p[0] == "v1" && p.size == 9)
        val shares = if (p[8].isBlank()) emptyList() else p[8].split(";").map { s -> s.substringBeforeLast("=") to s.substringAfterLast("=").toLong() }
        Close(p[1], p[2].toLong(), p[3].toLong(), p[4].toLong(), p[5].toLong(), p[6].toLong(), p[7], shares)
    }.getOrNull()

    private fun vnd(v: Long) = "%,dđ".format(v).replace(',', '.')

    /** Nội dung gửi cổ đông qua Zalo. */
    fun summaryText(monthLabel: String, revenue: Long, byCategory: List<Pair<String, Long>>, additional: Long, net: Long, shares: List<Pair<String, Long>>, warnings: List<String>, close: Close?): String = buildString {
        appendLine("BÁO CÁO THÁNG $monthLabel · 0210")
        appendLine("Tiền thu bán hàng: ${vnd(revenue)}")
        appendLine("Chi vận hành: ${vnd(byCategory.sumOf { it.second })}")
        byCategory.forEach { (k, v) -> appendLine("  · ${ExpenseCategories.label(k)}: ${vnd(v)}") }
        if (additional != 0L) appendLine("Đầu tư bổ sung: ${vnd(additional)}")
        appendLine("DÒNG TIỀN RÒNG: ${vnd(net)}")
        if (shares.isNotEmpty()) { appendLine("Chia:"); shares.forEach { (n, v) -> appendLine("  · $n: ${vnd(v)}") } }
        else appendLine(if (net <= 0) "Tháng này không có số dư dương để chia." else "Chưa cấu hình đủ tỷ lệ chia 100%.")
        if (close != null) appendLine("Đã chốt số lúc ${java.text.SimpleDateFormat("HH:mm dd/MM/yyyy", java.util.Locale.getDefault()).format(java.util.Date(close.closedAt))} bởi ${close.closedBy}.")
        if (warnings.isNotEmpty()) { appendLine("Lưu ý:"); warnings.forEach { appendLine("  ! $it") } }
    }.trimEnd()
}
