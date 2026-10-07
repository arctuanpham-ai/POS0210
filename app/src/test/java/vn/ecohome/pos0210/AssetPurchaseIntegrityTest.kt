package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import vn.ecohome.pos0210.data.AssetEntity
import vn.ecohome.pos0210.data.PurchaseEntity

class AssetPurchaseIntegrityTest {
    private fun purchase(id:String,total:Long,category:String,status:String="ACTIVE",at:Long=1000L)=PurchaseEntity(
        id=id,supplierId=null,enteredBy="e0",purchasedAt=at,total=total,status=status,expenseCategory=category
    )

    @Test fun initialInvestmentComesFromActivePurchaseLedgerOnly() {
        val rows=listOf(
            purchase("asset",17_662_394,ExpenseCategories.CAPITAL_ASSET),
            purchase("sunk",1_975_323,ExpenseCategories.INITIAL_INVESTMENT_SUNK),
            purchase("ops",41_470,ExpenseCategories.CONSUMABLES),
            purchase("deleted",1_699_917,ExpenseCategories.CAPITAL_ASSET,status="DELETED")
        )
        assertEquals(19_637_717, initialInvestmentFromPurchases(rows))
    }

    @Test fun assetSignatureMustMatchItsPurchaseExactly() {
        val p=purchase("p1",228_780,ExpenseCategories.CAPITAL_ASSET,at=1234L)
        val a=AssetEntity("a1","Kim rải bột Cafe WDT","other",1234L,228_780,1,228_780,usefulLifeMonths=36,investmentClass="INITIAL")
        assertTrue(assetMatchesPurchaseSignature(a,p,"Kim rải bột Cafe WDT"))
        assertFalse(assetMatchesPurchaseSignature(a,p.copy(total=200_000),"Kim rải bột Cafe WDT"))
    }
}
