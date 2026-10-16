package vn.ecohome.pos0210.cloud

import vn.ecohome.pos0210.ExpenseCategories
import vn.ecohome.pos0210.MaterialCatalog
import vn.ecohome.pos0210.data.PurchaseEntity
import vn.ecohome.pos0210.data.PurchaseItemEntity

data class RemoteExpenseReceipt(
    val id: String,
    val purchaseDate: Long,
    val enteredByUid: String,
    val enteredByName: String,
    val note: String,
    val status: String,
    val updatedAt: Long,
    val items: List<RemoteExpenseLine>,
    /** PERSONAL (người mua ứng tiền, cần hoàn) · SHOP_CASH · SHOP_BANK · rỗng = phiếu cũ chưa rõ. */
    val fundSource: String = ""
)

data class RemoteExpenseLine(
    val id: String,
    val materialName: String,
    val materialCode: String,
    val expenseGroup: String,
    val qty: Double,
    val unit: String,
    val unitPrice: Long,
    val amount: Long
)

data class TranslatedExpenseReceipt(val purchase: PurchaseEntity, val items: List<PurchaseItemEntity>)

data class ReceiptValidation(val valid: Boolean, val error: String? = null)

data class CanonicalExpenseLine(
    val lineId: String,
    val materialName: String,
    val materialCode: String,
    val expenseGroup: String,
    val qty: Double,
    val unit: String,
    val unitPrice: Long,
    val amount: Long
)

data class CanonicalExpenseReceipt(
    val receiptId: String,
    val purchaseDate: Long,
    val enteredByUid: String,
    val enteredByName: String,
    val note: String,
    val status: String,
    val updatedAt: Long,
    val total: Long,
    val lines: List<CanonicalExpenseLine>
)


object ExpenseReceiptContract {
    fun canonicalize(receipt: RemoteExpenseReceipt): CanonicalExpenseReceipt {
        val lines = receipt.items.map { line ->
            CanonicalExpenseLine(line.id, line.materialName, line.materialCode, line.expenseGroup, line.qty, line.unit, line.unitPrice, line.amount)
        }
        return CanonicalExpenseReceipt(
            receiptId = receipt.id,
            purchaseDate = receipt.purchaseDate,
            enteredByUid = receipt.enteredByUid,
            enteredByName = receipt.enteredByName,
            note = receipt.note,
            status = ExpenseReceiptTranslator.normalizeStatus(receipt.status),
            updatedAt = receipt.updatedAt,
            total = lines.sumOf { it.amount },
            lines = lines
        )
    }

    fun validate(receipt: RemoteExpenseReceipt): ReceiptValidation {
        if (receipt.id.isBlank()) return ReceiptValidation(false, "Thiếu mã phiếu")
        if (receipt.purchaseDate <= 0L || receipt.updatedAt <= 0L) return ReceiptValidation(false, "Ngày phiếu không hợp lệ")
        if (receipt.items.isEmpty()) return ReceiptValidation(false, "Phiếu chưa có vật tư")
        if (receipt.items.map { it.id }.toSet().size != receipt.items.size) return ReceiptValidation(false, "Trùng mã dòng vật tư")
        receipt.items.forEach { line ->
            if (line.id.isBlank() || line.materialName.isBlank() || line.qty <= 0.0 || line.unit.isBlank() || line.unitPrice <= 0L) {
                return ReceiptValidation(false, "Dòng vật tư không hợp lệ")
            }
            // Web làm tròn (Math.round), Android cắt phần lẻ (toLong): chấp nhận lệch dưới 1 đồng do làm tròn.
            if (kotlin.math.abs(line.amount - line.qty * line.unitPrice) >= 1.0) return ReceiptValidation(false, "Thành tiền dòng không khớp")
        }
        return ReceiptValidation(true)
    }
}


data class ExpenseReceiptCursor(val updatedAt: Long = 0L, val receiptId: String = "") {
    fun advance(candidateId: String, candidateUpdatedAt: Long) =
        if (candidateUpdatedAt > updatedAt || (candidateUpdatedAt == updatedAt && candidateId > receiptId)) {
            ExpenseReceiptCursor(candidateUpdatedAt, candidateId)
        } else this
}

object ExpenseReceiptParser {
    fun parse(id: String, fields: Map<String, Any?>): RemoteExpenseReceipt? {
        val purchaseDate = fields.long("purchaseDate") ?: return null
        val updatedAt = fields.long("updatedAt") ?: return null
        val rawItems = fields["items"] as? List<*> ?: return null
        // Một dòng hỏng làm hỏng cả phiếu: không nhập phiếu thiếu dòng với tổng tiền nhỏ hơn thực tế.
        val items = rawItems.map { raw ->
            val line = raw as? Map<*, *> ?: return null
            val materialName = line.text("materialName") ?: return null
            val qty = line.number("qty")?.takeIf { it > 0 } ?: return null
            val unit = line.text("unit") ?: return null
            val unitPrice = line.long("unitPrice")?.takeIf { it >= 0 } ?: return null
            val lineId = line.text("id") ?: return null
            RemoteExpenseLine(lineId, materialName, line.text("materialCode").orEmpty(), line.text("expenseGroup").orEmpty(), qty, unit, unitPrice, line.long("amount") ?: (qty * unitPrice).toLong())
        }
        if (items.isEmpty()) return null
        return RemoteExpenseReceipt(id, purchaseDate, fields.text("enteredByUid").orEmpty(), fields.text("enteredByName").orEmpty(), fields.text("note").orEmpty(), fields.text("status").orEmpty(), updatedAt, items, fields.text("fundSource").orEmpty())
    }

    private fun Map<*, *>.text(key: String) = (this[key] as? String)?.trim()?.takeIf { it.isNotEmpty() }
    private fun Map<*, *>.long(key: String) = (this[key] as? Number)?.toLong()
    private fun Map<*, *>.number(key: String) = (this[key] as? Number)?.toDouble()
}

object ExpenseReceiptTranslator {
    /** Trạng thái chuẩn: ACTIVE hoặc DELETED (Android và Web đều dùng DELETED); CANCELLED là tên gọi khác của DELETED. */
    fun normalizeStatus(status: String): String = when (val s = status.trim().uppercase()) {
        "", "ACTIVE" -> "ACTIVE"
        "DELETED", "CANCELLED" -> "DELETED"
        else -> s
    }

    fun isDeleted(status: String) = normalizeStatus(status) == "DELETED"

    /** Chỉ phiếu người mua ứng tiền mới tính vào công nợ người ứng; mua bằng tiền quán thì không ai bị nợ. */
    fun payerOf(receipt: RemoteExpenseReceipt): String = if (receipt.fundSource == "SHOP_CASH" || receipt.fundSource == "SHOP_BANK") "" else receipt.enteredByName

    fun translate(receipt: RemoteExpenseReceipt): TranslatedExpenseReceipt {
        val purchaseId = "web:${receipt.id}"
        val items = receipt.items.map { line ->
            PurchaseItemEntity("$purchaseId:${line.id}", purchaseId, line.materialCode.ifBlank { "web-${line.expenseGroup.lowercase()}" }, line.materialName, line.qty, line.unit.ifBlank { "lần" }, line.unitPrice, line.amount)
        }
        return TranslatedExpenseReceipt(
            PurchaseEntity(purchaseId, null, receipt.enteredByUid.ifBlank { "WEB_MANAGER" }, receipt.purchaseDate, items.sumOf { it.amount }, receipt.note, status = normalizeStatus(receipt.status), expenseCategory = categoryFor(receipt.items), paidByName = payerOf(receipt), updatedAt = receipt.updatedAt),
            items
        )
    }

    internal fun categoryFor(lines: List<RemoteExpenseLine>): String {
        val group = lines.firstOrNull()?.expenseGroup?.trim().orEmpty()
        // Phiếu do Android đẩy lên mang sẵn mã nhóm (INVENTORY_PURCHASE...): giữ nguyên, không rơi về OTHER_EXPENSE.
        if (group.uppercase() in ExpenseCategories.all) return group.uppercase()
        return categoryForWebGroup(group)
    }

    private fun categoryForWebGroup(group: String) = when (group.lowercase()) {
        "food", "drink", "nguyên liệu", "đồ uống" -> ExpenseCategories.INVENTORY_PURCHASE
        "consumable", "vật tư tiêu hao" -> ExpenseCategories.CONSUMABLES
        "payroll", "lương / nhân sự" -> ExpenseCategories.PAYROLL
        "maintenance", "sửa chữa / bảo trì" -> ExpenseCategories.MAINTENANCE
        "asset", "tài sản" -> ExpenseCategories.CAPITAL_ASSET
        "operating", "chi phí vận hành" -> ExpenseCategories.VARIABLE_EXPENSE
        else -> ExpenseCategories.OTHER_EXPENSE
    }
}

/** Phiếu do Android tạo và đẩy lên Web (expenseReceipts/{id}). */
object AndroidReceiptPayload {
    /** Nhóm vật tư lấy từ tiền tố mã (THIT-...). Mã cũ không có tiền tố thì giữ mã nhóm chi phí để Web không mất dữ liệu. */
    fun lineMap(line: PurchaseItemEntity, expenseCategory: String): Map<String, Any?> {
        val groupLabel = MaterialCatalog.groupLabelFromMaterialCode(line.categoryId)
        return mapOf(
            "id" to line.id,
            "materialName" to line.name,
            "materialCode" to line.categoryId,
            "materialGroup" to (groupLabel ?: ""),
            "expenseGroup" to (groupLabel ?: expenseCategory),
            "qty" to line.qty,
            "unit" to line.unit,
            "unitPrice" to line.unitPrice,
            "amount" to line.amount
        )
    }

    fun toMap(purchase: PurchaseEntity, lines: List<PurchaseItemEntity>, updatedAt: Long): Map<String, Any?> = mapOf(
        "id" to purchase.id,
        "purchaseDate" to purchase.purchasedAt,
        "enteredByUid" to purchase.enteredBy,
        "enteredByName" to purchase.paidByName,
        "note" to purchase.note,
        "status" to purchase.status,
        "updatedAt" to updatedAt,
        "source" to "ANDROID_POS",
        "expenseCategory" to purchase.expenseCategory,
        "items" to lines.map { lineMap(it, purchase.expenseCategory) },
        "total" to lines.sumOf { it.amount }
    )
}

/**
 * Web sửa hoặc huỷ phiếu do Android tạo: Web ghi lại đúng document đó, giữ source=ANDROID_POS và thêm editedBy=WEB_MANAGER.
 * Máy Android đã có phiếu này áp dụng thay đổi vào bản local. Lần Android đẩy phiếu kế tiếp sẽ ghi đè và xoá editedBy.
 */
object WebEditOfAndroidReceipt {
    const val EDITED_BY_WEB = "WEB_MANAGER"

    fun isWebEdit(fields: Map<String, Any?>): Boolean = fields["source"] == "ANDROID_POS" && fields["editedBy"] == EDITED_BY_WEB

    /** Chỉ áp dụng khi bản trên cloud mới hơn bản local; trả về null nếu không cần làm gì. */
    fun apply(local: PurchaseEntity, receipt: RemoteExpenseReceipt): TranslatedExpenseReceipt? {
        if (local.id.startsWith("web:")) return null
        if (receipt.updatedAt <= (local.updatedAt ?: 0L)) return null
        val status = if (ExpenseReceiptTranslator.isDeleted(receipt.status)) "DELETED" else "ACTIVE"
        val items = receipt.items.map { line ->
            PurchaseItemEntity(line.id, local.id, line.materialCode.ifBlank { "pc_production" }, line.materialName, line.qty, line.unit.ifBlank { "lần" }, line.unitPrice, line.amount)
        }
        val purchase = local.copy(purchasedAt = receipt.purchaseDate, total = items.sumOf { it.amount }, note = receipt.note, status = status, updatedAt = receipt.updatedAt)
        return TranslatedExpenseReceipt(purchase, items)
    }
}
