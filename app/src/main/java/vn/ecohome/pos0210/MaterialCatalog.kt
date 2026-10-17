package vn.ecohome.pos0210

import java.text.Normalizer

/** Vật tư đã từng nhập (lấy từ các dòng phiếu chi cũ) để gợi ý khi gõ tên. */
data class KnownMaterial(val name: String, val code: String, val unit: String)

/** Một dòng vật tư đang soạn trong form phiếu chi. Mã vật tư mang tiền tố nhóm, giống Web: THIT-AB12CD34EF56. */
data class DraftReceiptLine(
    val id: String,
    val name: String = "",
    val code: String = "",
    val groupCode: String = MaterialCatalog.DEFAULT_GROUP,
    val qtyText: String = "1",
    val unit: String = "kg",
    val priceText: String = ""
) {
    val qty: Double? get() = qtyText.replace(',', '.').toDoubleOrNull()
    val unitPrice: Long? get() = priceText.toLongOrNull()
    val amount: Long get() = ((qty ?: 0.0) * (unitPrice ?: 0L)).toLong()
    val isValid: Boolean get() = name.isNotBlank() && (qty ?: 0.0) > 0.0 && unit.isNotBlank() && (unitPrice ?: 0L) > 0L
}

/** Nhóm vật tư, đơn vị, mã vật tư và tìm kiếm gợi ý. Cùng bộ nhóm và cách sinh mã với Web quản lý. */
object MaterialCatalog {
    const val DEFAULT_GROUP = "KHAC"

    val groups: List<Pair<String, String>> = listOf(
        "THIT" to "Thịt, gia cầm",
        "RAU" to "Rau, củ, quả",
        "BUN" to "Bún, bánh đa, tinh bột",
        "BANH" to "Bánh mì, nguyên liệu bánh",
        "SUA" to "Trứng, sữa, bơ",
        "GIAVI" to "Gia vị, nước dùng",
        "CAPHE" to "Cà phê",
        "TRA" to "Trà, nguyên liệu pha trà",
        "MUT" to "Siro, mứt, nguyên liệu bổ sung",
        "NUOC" to "Đồ uống đóng chai",
        "DA" to "Đá, nước tinh khiết",
        "BAOBI" to "Bao bì, vật tư phục vụ",
        "VESINH" to "Vệ sinh, vật tư tiêu hao",
        "KHAC" to "Vật tư khác"
    )

    val units: List<String> = listOf("kg", "gam", "lít", "ml", "con", "quả", "bó", "túi", "hộp", "chai", "lon", "gói", "cái", "thùng", "bình", "ổ", "suất")

    fun groupLabel(groupCode: String): String = groups.firstOrNull { it.first == groupCode }?.second ?: groups.last().second

    /** Mã nhóm từ nhãn hoặc mã; không nhận ra thì về "KHAC". */
    fun groupCodeOf(value: String): String = groups.firstOrNull { it.first == value || it.second == value }?.first ?: DEFAULT_GROUP

    /** Mã vật tư dạng NHOM-xxxx: trả về mã nhóm nếu tiền tố đúng là một nhóm đã biết, ngược lại null (mã cũ kiểu pc_production). */
    fun groupCodeFromMaterialCode(materialCode: String): String? {
        val prefix = materialCode.substringBefore('-', "")
        return groups.firstOrNull { it.first == prefix }?.first
    }

    fun groupLabelFromMaterialCode(materialCode: String): String? = groupCodeFromMaterialCode(materialCode)?.let(::groupLabel)

    fun newMaterialCode(groupCode: String, random: () -> String = { java.util.UUID.randomUUID().toString() }): String {
        val tail = random().filter { it.isLetterOrDigit() }.takeLast(12).uppercase()
        return "${groupCodeOf(groupCode)}-$tail"
    }

    fun normalize(value: String): String =
        Normalizer.normalize(value.lowercase(), Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
            .replace('đ', 'd')
            .replace(Regex("\\s+"), " ")
            .trim()

    /** Mọi ký tự của từ khoá có trong chuỗi (không phụ thuộc thứ tự), không dấu, như ô gợi ý của Web. */
    fun matches(value: String, search: String): Boolean {
        val q = normalize(search)
        if (q.isEmpty()) return true
        val counts = HashMap<Char, Int>()
        normalize(value).replace(" ", "").forEach { counts[it] = (counts[it] ?: 0) + 1 }
        for (ch in q.replace(" ", "")) {
            val left = counts[ch] ?: return false
            if (left <= 0) return false
            counts[ch] = left - 1
        }
        return true
    }

    private fun rank(value: String, search: String): Int {
        val text = normalize(value)
        val q = normalize(search)
        return when {
            text == q -> 0
            text.startsWith(q) -> 1
            text.contains(q) -> 2
            else -> 3
        }
    }

    fun suggest(known: List<KnownMaterial>, search: String, max: Int = 6): List<KnownMaterial> {
        if (normalize(search).isEmpty()) return emptyList()
        return known.filter { matches(it.name, search) }
            .sortedWith(compareBy<KnownMaterial> { rank(it.name, search) }.thenBy { normalize(it.name) })
            .take(max)
    }

    /** Một tên chỉ có một mã: giữ dòng xuất hiện sau cùng. Mã không theo dạng NHOM-xxx coi như chưa có mã. */
    fun knownFrom(items: List<Triple<String, String, String>>): List<KnownMaterial> {
        val byName = LinkedHashMap<String, KnownMaterial>()
        items.forEach { (name, code, unit) ->
            val clean = name.trim()
            if (clean.isEmpty()) return@forEach
            byName[normalize(clean)] = KnownMaterial(clean, if (groupCodeFromMaterialCode(code) != null) code else "", unit.trim())
        }
        return byName.values.toList()
    }

    fun exactMatch(known: List<KnownMaterial>, name: String): KnownMaterial? =
        known.firstOrNull { normalize(it.name) == normalize(name) }

    /**
     * Cập nhật tên: tên trống thì bỏ mã; tên trùng vật tư cũ thì dùng lại mã/nhóm/đơn vị cũ;
     * tên mới thì sinh mã theo nhóm đang chọn (giữ mã cũ nếu nó đã đúng nhóm).
     */
    fun withName(line: DraftReceiptLine, name: String, known: List<KnownMaterial>, random: () -> String = { java.util.UUID.randomUUID().toString() }): DraftReceiptLine {
        if (name.isBlank()) return line.copy(name = name, code = "")
        val match = exactMatch(known, name)
        if (match != null && match.code.isNotBlank()) {
            return line.copy(name = name, code = match.code, groupCode = groupCodeFromMaterialCode(match.code) ?: line.groupCode, unit = match.unit.ifBlank { line.unit })
        }
        val keep = line.code.isNotBlank() && groupCodeFromMaterialCode(line.code) == line.groupCode
        return line.copy(name = name, code = if (keep) line.code else newMaterialCode(line.groupCode, random))
    }

    /** Đổi nhóm: sinh lại mã theo tiền tố nhóm mới (dòng đã có tên). */
    fun withGroup(line: DraftReceiptLine, groupCode: String, random: () -> String = { java.util.UUID.randomUUID().toString() }): DraftReceiptLine {
        val code = groupCodeOf(groupCode)
        if (code == line.groupCode) return line
        return line.copy(groupCode = code, code = if (line.name.isBlank()) "" else newMaterialCode(code, random))
    }

    /** Chọn một gợi ý: điền tên, mã, nhóm, đơn vị. */
    fun withKnown(line: DraftReceiptLine, material: KnownMaterial, random: () -> String = { java.util.UUID.randomUUID().toString() }): DraftReceiptLine {
        val group = groupCodeFromMaterialCode(material.code) ?: line.groupCode
        val code = material.code.ifBlank { newMaterialCode(group, random) }
        return line.copy(name = material.name, code = code, groupCode = group, unit = material.unit.ifBlank { line.unit })
    }
}
