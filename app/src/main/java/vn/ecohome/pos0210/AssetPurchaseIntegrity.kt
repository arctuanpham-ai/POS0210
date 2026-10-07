package vn.ecohome.pos0210

import vn.ecohome.pos0210.data.AssetEntity
import vn.ecohome.pos0210.data.PurchaseEntity
import vn.ecohome.pos0210.data.PurchaseItemEntity

private val INITIAL_INVESTMENT_CODES = setOf(
    ExpenseCategories.CAPITAL_ASSET,
    ExpenseCategories.SETUP_COST,
    ExpenseCategories.INITIAL_INVESTMENT_SUNK
)

fun initialInvestmentFromPurchases(purchases: List<PurchaseEntity>): Long =
    purchases.asSequence()
        .filter { it.status == "ACTIVE" && it.expenseCategory in INITIAL_INVESTMENT_CODES }
        .sumOf { it.total }

fun assetIdForPurchase(purchaseId: String): String = "purchase:$purchaseId"

fun assetInvestmentClassForExpense(expenseCategory: String): String? = when (expenseCategory) {
    ExpenseCategories.CAPITAL_ASSET -> "INITIAL"
    ExpenseCategories.ADDITIONAL_INVESTMENT -> "ADDITIONAL"
    else -> null
}

fun assetMatchesPurchaseSignature(asset: AssetEntity, purchase: PurchaseEntity, itemName: String): Boolean {
    val expectedClass = assetInvestmentClassForExpense(purchase.expenseCategory) ?: return false
    return asset.status == "ACTIVE" &&
        asset.investmentClass == expectedClass &&
        (asset.id == assetIdForPurchase(purchase.id) || (
            asset.name == itemName &&
            asset.purchaseDate == purchase.purchasedAt &&
            asset.totalCost == purchase.total
        ))
}

fun linkedAssetsForPurchases(
    assets: List<AssetEntity>,
    purchases: List<PurchaseEntity>,
    items: List<PurchaseItemEntity>
): List<AssetEntity> {
    val activePurchases = purchases.filter { it.status == "ACTIVE" && assetInvestmentClassForExpense(it.expenseCategory) != null }
    val itemNameByPurchase = items.groupBy { it.purchaseId }.mapValues { (_, rows) -> rows.firstOrNull()?.name.orEmpty() }
    return assets.filter { asset ->
        activePurchases.any { purchase ->
            assetMatchesPurchaseSignature(asset, purchase, itemNameByPurchase[purchase.id].orEmpty())
        }
    }
}
