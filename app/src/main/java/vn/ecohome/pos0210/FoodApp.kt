package vn.ecohome.pos0210

/**
 * Đơn ShopeeFood / GrabFood. Đơn được ghi thành bill thật ngay lúc bán (doanh thu tính ngày bán),
 * hình thức thanh toán là "SHOPEE" hoặc "GRAB": KHÔNG vào két tiền mặt, KHÔNG vào chuyển khoản.
 * Đến khi app trả tiền, nhân viên bấm "Đã nhận" và nhập số tiền thực nhận (đã trừ hoa hồng).
 */
object FoodApp {
    const val SHOPEE = "SHOPEE"
    const val GRAB = "GRAB"
    val APPS = listOf(SHOPEE, GRAB)
    /** Bàn ảo của đơn app food (giống bàn ảo "ONLINE"). */
    const val TABLE_ID = "FOODAPP"
    /** Khoá lưu bảng giá app trong cài đặt. */
    const val PRICE_KEY = "foodapp_prices"

    fun isFood(method: String?) = method == SHOPEE || method == GRAB

    fun label(method: String?): String = when (method) {
        SHOPEE -> "ShopeeFood"
        GRAB -> "GrabFood"
        "TRANSFER" -> "Chuyển khoản"
        else -> "Tiền mặt"
    }

    fun cleanCode(code: String): String = code.trim().uppercase().replace(Regex("\\s+"), "")

    fun reference(app: String, code: String) = "FA-$app-${cleanCode(code)}"

    /** Khoá chống ghi trùng một đơn app. */
    fun key(app: String, code: String) = "$app:${cleanCode(code)}"

    /** Mã đơn app lấy lại từ reference của thanh toán. */
    fun codeOf(reference: String?, app: String): String = reference.orEmpty().removePrefix("FA-$app-")

    /** Bảng giá app: mỗi dòng "idMón=giá". Món không có dòng nào thì dùng giá menu. */
    fun parsePrices(text: String?): Map<String, Long> =
        text.orEmpty().lineSequence().mapNotNull { line ->
            val i = line.lastIndexOf('=')
            if (i <= 0) return@mapNotNull null
            val price = line.substring(i + 1).trim().toLongOrNull() ?: return@mapNotNull null
            if (price <= 0L) null else line.substring(0, i).trim() to price
        }.toMap()

    fun encodePrices(prices: Map<String, Long>): String =
        prices.filterValues { it > 0L }.entries.joinToString("\n") { "${it.key.replace('\n', ' ').replace('=', '-')}=${it.value}" }

    fun priceFor(menuItemId: String, menuPrice: Long, prices: Map<String, Long>): Long = prices[menuItemId]?.takeIf { it > 0L } ?: menuPrice

    /** Đọc các cặp khoá=số trong payload của sự kiện SETTLED (received, commission, vat, pit...). */
    fun payloadNumbers(payload: String): Map<String, Long> =
        payload.split(',').mapNotNull { part ->
            val i = part.indexOf('='); if (i <= 0) return@mapNotNull null
            part.substring(0, i).trim() to (part.substring(i + 1).trim().toLongOrNull() ?: return@mapNotNull null)
        }.toMap()

    /** Số tiền thực nhận hợp lệ: 0 đến mức rất lớn, không âm. */
    fun parseAmount(text: String): Long? = text.filter { it.isDigit() }.takeIf { it.isNotEmpty() && it.length <= 12 }?.toLongOrNull()
}
