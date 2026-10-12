package vn.ecohome.pos0210.cloud

import vn.ecohome.pos0210.ExpenseCategories
import vn.ecohome.pos0210.data.PurchaseEntity
import vn.ecohome.pos0210.data.PurchaseItemEntity

/** Immutable representation of the compact receipt written by the web dashboard. */
data class RemoteExpenseReceipt(
    val id:String,
    val purchaseDate:Long,
    val enteredByUid:String,
    val enteredByName:String,
    val note:String,
    val status:String,
    val updatedAt:Long,
    val items:List<RemoteExpenseLine>
)

data class RemoteExpenseLine(
    val id:String,
    val materialName:String,
    val materialCode:String,
    val expenseGroup:String,
    val qty:Double,
    val unit:String,
    val unitPrice:Long,
    val amount:Long
)

data class TranslatedExpenseReceipt(val purchase:PurchaseEntity,val items:List<PurchaseItemEntity>)

/** Cursor persisted only after the corresponding Local Database transaction succeeds. */
data class ExpenseReceiptCursor(val updatedAt:Long=0L,val receiptId:String="") {
    fun advance(candidateId:String,candidateUpdatedAt:Long):ExpenseReceiptCursor =
        if(candidateUpdatedAt>updatedAt || (candidateUpdatedAt==updatedAt && candidateId>receiptId)) {
            ExpenseReceiptCursor(candidateUpdatedAt,candidateId)
        } else this
}

object WebExpenseReceiptScope {
    fun accepts(purchaseId:String)=purchaseId.startsWith("web:")
}

/** Boundary parser: malformed cloud data is ignored before it can reach Room. */
object ExpenseReceiptParser {
    fun parse(id:String,fields:Map<String,Any?>):RemoteExpenseReceipt? {
        val purchaseDate=fields.long("purchaseDate") ?: return null
        val updatedAt=fields.long("updatedAt") ?: return null
        val items=(fields["items"] as? List<*>)?.mapNotNull { raw ->
            val line=raw as? Map<*,*> ?: return@mapNotNull null
            val materialName=line.text("materialName") ?: return@mapNotNull null
            val qty=line.number("qty")?.takeIf { it>0 } ?: return@mapNotNull null
            val unit=line.text("unit") ?: return@mapNotNull null
            val unitPrice=line.long("unitPrice")?.takeIf { it>=0 } ?: return@mapNotNull null
            val lineId=line.text("id") ?: return@mapNotNull null
            RemoteExpenseLine(
                id=lineId,materialName=materialName,materialCode=line.text("materialCode").orEmpty(),
                expenseGroup=line.text("expenseGroup").orEmpty(),qty=qty,unit=unit,
                unitPrice=unitPrice,amount=line.long("amount") ?: (qty*unitPrice).toLong()
            )
        }.orEmpty()
        if(items.isEmpty()) return null
        return RemoteExpenseReceipt(
            id=id,purchaseDate=purchaseDate,enteredByUid=fields.text("enteredByUid").orEmpty(),
            enteredByName=fields.text("enteredByName").orEmpty(),note=fields.text("note").orEmpty(),
            status=fields.text("status").orEmpty(),updatedAt=updatedAt,items=items
        )
    }

    private fun Map<*,*>.text(key:String):String?=(this[key] as? String)?.trim()?.takeIf { it.isNotEmpty() }
    private fun Map<*,*>.long(key:String):Long?=(this[key] as? Number)?.toLong()
    private fun Map<*,*>.number(key:String):Double?=(this[key] as? Number)?.toDouble()
}

/**
 * Keeps browser-submitted expense records in a namespace that cannot collide with
 * sales-side or device-entered purchase IDs. It deliberately has no order/bill/payment input.
 */
object ExpenseReceiptTranslator {
    private const val WEB_PREFIX="web:"

    fun translate(receipt:RemoteExpenseReceipt):TranslatedExpenseReceipt {
        val localId="$WEB_PREFIX${receipt.id}"
        val lines=receipt.items.map { line ->
            PurchaseItemEntity(
                id="$localId:${line.id}",
                purchaseId=localId,
                categoryId=line.materialCode.ifBlank { "web-${line.expenseGroup.lowercase()}" },
                name=line.materialName,
                qty=line.qty,
                unit=line.unit.ifBlank { "lần" },
                unitPrice=line.unitPrice,
                amount=line.amount
            )
        }
        val total=lines.sumOf { it.amount }
        return TranslatedExpenseReceipt(
            purchase=PurchaseEntity(
                id=localId,
                supplierId=null,
                enteredBy=receipt.enteredByUid.ifBlank { "WEB_MANAGER" },
                purchasedAt=receipt.purchaseDate,
                total=total,
                note=receipt.note,
                status=receipt.status.ifBlank { "ACTIVE" },
                expenseCategory=expenseCategoryFor(receipt.items),
                paidByName=receipt.enteredByName,
                updatedAt=receipt.updatedAt
            ),
            items=lines
        )
    }

    private fun expenseCategoryFor(lines:List<RemoteExpenseLine>):String = when(lines.firstOrNull()?.expenseGroup){
        "FOOD", "DRINK", "Thịt, gia cầm", "Rau, củ, quả", "Bún, bánh đa, tinh bột",
        "Bánh mì, nguyên liệu bánh", "Trứng, sữa, bơ", "Gia vị, nước dùng", "Cà phê",
        "Trà, nguyên liệu pha trà", "Siro, mứt, nguyên liệu bổ sung", "Đồ uống đóng chai", "Đá, nước tinh khiết" -> ExpenseCategories.INVENTORY_PURCHASE
        "CONSUMABLE", "Bao bì, vật tư phục vụ", "Vệ sinh, vật tư tiêu hao" -> ExpenseCategories.CONSUMABLES
        "PAYROLL" -> ExpenseCategories.PAYROLL
        "MAINTENANCE" -> ExpenseCategories.MAINTENANCE
        "ASSET" -> ExpenseCategories.CAPITAL_ASSET
        "OPERATING" -> ExpenseCategories.VARIABLE_EXPENSE
        else -> ExpenseCategories.OTHER_EXPENSE
    }
}
