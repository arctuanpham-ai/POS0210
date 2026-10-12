package vn.ecohome.pos0210.cloud

import vn.ecohome.pos0210.ExpenseCategories
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
    val items: List<RemoteExpenseLine>
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

object ExpenseReceiptContract {
    fun validate(receipt: RemoteExpenseReceipt): ReceiptValidation {
        if (receipt.id.isBlank()) return ReceiptValidation(false, "Thiếu mã phiếu")
        if (receipt.purchaseDate <= 0L || receipt.updatedAt <= 0L) return ReceiptValidation(false, "Ngày phiếu không hợp lệ")
        if (receipt.items.isEmpty()) return ReceiptValidation(false, "Phiếu chưa có vật tư")
        if (receipt.items.map { it.id }.toSet().size != receipt.items.size) return ReceiptValidation(false, "Trùng mã dòng vật tư")
        receipt.items.forEach { line ->
            if (line.id.isBlank() || line.materialName.isBlank() || line.qty <= 0.0 || line.unit.isBlank() || line.unitPrice <= 0L) {
                return ReceiptValidation(false, "Dòng vật tư không hợp lệ")
            }
            if (line.amount != (line.qty * line.unitPrice).toLong()) return ReceiptValidation(false, "Thành tiền dòng không khớp")
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
        val items = (fields["items"] as? List<*>)?.mapNotNull { raw ->
            val line = raw as? Map<*, *> ?: return@mapNotNull null
            val materialName = line.text("materialName") ?: return@mapNotNull null
            val qty = line.number("qty")?.takeIf { it > 0 } ?: return@mapNotNull null
            val unit = line.text("unit") ?: return@mapNotNull null
            val unitPrice = line.long("unitPrice")?.takeIf { it >= 0 } ?: return@mapNotNull null
            val lineId = line.text("id") ?: return@mapNotNull null
            RemoteExpenseLine(lineId, materialName, line.text("materialCode").orEmpty(), line.text("expenseGroup").orEmpty(), qty, unit, unitPrice, line.long("amount") ?: (qty * unitPrice).toLong())
        }.orEmpty()
        if (items.isEmpty()) return null
        return RemoteExpenseReceipt(id, purchaseDate, fields.text("enteredByUid").orEmpty(), fields.text("enteredByName").orEmpty(), fields.text("note").orEmpty(), fields.text("status").orEmpty(), updatedAt, items)
    }

    private fun Map<*, *>.text(key: String) = (this[key] as? String)?.trim()?.takeIf { it.isNotEmpty() }
    private fun Map<*, *>.long(key: String) = (this[key] as? Number)?.toLong()
    private fun Map<*, *>.number(key: String) = (this[key] as? Number)?.toDouble()
}

object ExpenseReceiptTranslator {
    fun translate(receipt: RemoteExpenseReceipt): TranslatedExpenseReceipt {
        val purchaseId = "web:${receipt.id}"
        val items = receipt.items.map { line ->
            PurchaseItemEntity("$purchaseId:${line.id}", purchaseId, line.materialCode.ifBlank { "web-${line.expenseGroup.lowercase()}" }, line.materialName, line.qty, line.unit.ifBlank { "lần" }, line.unitPrice, line.amount)
        }
        return TranslatedExpenseReceipt(
            PurchaseEntity(purchaseId, null, receipt.enteredByUid.ifBlank { "WEB_MANAGER" }, receipt.purchaseDate, items.sumOf { it.amount }, receipt.note, status = receipt.status.ifBlank { "ACTIVE" }, expenseCategory = categoryFor(receipt.items), paidByName = receipt.enteredByName, updatedAt = receipt.updatedAt),
            items
        )
    }

    private fun categoryFor(lines: List<RemoteExpenseLine>) = when (lines.firstOrNull()?.expenseGroup?.trim()?.lowercase()) {
        "food", "drink", "nguyên liệu", "đồ uống" -> ExpenseCategories.INVENTORY_PURCHASE
        "consumable", "vật tư tiêu hao" -> ExpenseCategories.CONSUMABLES
        "payroll", "lương / nhân sự" -> ExpenseCategories.PAYROLL
        "maintenance", "sửa chữa / bảo trì" -> ExpenseCategories.MAINTENANCE
        "asset", "tài sản" -> ExpenseCategories.CAPITAL_ASSET
        "operating", "chi phí vận hành" -> ExpenseCategories.VARIABLE_EXPENSE
        else -> ExpenseCategories.OTHER_EXPENSE
    }
}
