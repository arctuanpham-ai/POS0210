package vn.ecohome.pos0210

/**
 * Sửa đơn trả trước chưa thu tiền mà không mất dữ liệu.
 * - Giỏ hàng để sửa được dựng lại từ chính các món đã lưu của đơn (không phụ thuộc bộ nhớ tạm của màn hình).
 * - Đơn mở lại từ "Chưa thu tiền" thường đã được bếp làm/giao theo lời: phần món cũ là "đã phục vụ",
 *   chỉ phần khách gọi thêm mới cần in phiếu bếp.
 */
object PrepaidEdit {
    data class Line(val menuItemId: String?, val qty: Int, val note: String = "", val gift: Boolean = false)

    /** Giỏ hàng (mã món → số lượng) và ghi chú từ các dòng món còn hiệu lực. Bỏ quà tặng / voucher (hệ thống tự thêm lại). */
    fun rebuild(lines: List<Line>): Pair<Map<String, Int>, Map<String, String>> {
        val qty = linkedMapOf<String, Int>()
        val notes = linkedMapOf<String, String>()
        for (l in lines) {
            val id = l.menuItemId ?: continue
            if (l.gift) continue
            qty[id] = (qty[id] ?: 0) + l.qty
            if (l.note.isNotBlank() && notes[id].isNullOrBlank()) notes[id] = l.note.trim()
        }
        val cart = qty.filterValues { it > 0 }
        return cart to notes.filterKeys { it in cart }
    }

    /** Tách giỏ mới thành phần đã phục vụ (≤ đơn cũ) và phần gọi thêm. Không có mốc cũ thì tất cả là gọi thêm. */
    fun split(cart: Map<String, Int>, served: Map<String, Int>?): Pair<Map<String, Int>, Map<String, Int>> {
        if (served.isNullOrEmpty()) return emptyMap<String, Int>() to cart.filterValues { it > 0 }
        val base = linkedMapOf<String, Int>()
        val extra = linkedMapOf<String, Int>()
        for ((id, q) in cart) {
            if (q <= 0) continue
            val b = minOf(q, served[id] ?: 0)
            if (b > 0) base[id] = b
            if (q - b > 0) extra[id] = q - b
        }
        return base to extra
    }

    /** Mô tả ngắn phần thay đổi so với đơn cũ, để ghi nhật ký và hiện cho nhân viên. */
    fun diff(old: Map<String, Int>, new: Map<String, Int>): String =
        (old.keys + new.keys).distinct().mapNotNull { id ->
            val d = (new[id] ?: 0) - (old[id] ?: 0)
            if (d == 0) null else "$id${if (d > 0) "+" else ""}$d"
        }.joinToString(",")
}
