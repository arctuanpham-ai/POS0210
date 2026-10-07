package vn.ecohome.pos0210

data class PurchaseCardPresentation(val itemName: String, val note: String)

fun purchaseCardPresentation(itemName: String, note: String) =
    PurchaseCardPresentation(itemName.trim(), note.trim())
