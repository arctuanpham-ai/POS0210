package vn.ecohome.pos0210

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test
import vn.ecohome.pos0210.data.*
import vn.ecohome.pos0210.report.SalesItemsReport

class SalesReportUiTest {
    @get:Rule val compose=createComposeRule()
    private fun data(mismatch:Boolean=false):SalesReportData {
        val now=System.currentTimeMillis()
        val items=List(12){n->ItemSaleRow("Món ${n+1}",1,"s","i$n","m$n",10000,"cat","Cà phê")}
        return SalesReportData(listOf(BillEntity("b","s","0210-QA",now,now,if(mismatch)130000 else 120000,120000,"PAID")),items,
            listOf(PaymentEntity("p","b","CASH",120000,"e",now)),emptyList(),listOf(TableSessionEntity("s","t",now,"e",status="CLOSED")))
    }
    private fun show(data:SalesReportData){
        compose.setContent{MaterialTheme(colorScheme=lightColorScheme(background=Color(0xFFF6F0E6),surface=Color(0xFFF6F0E6),primary=Color(0xFF6D4934))){SalesItemsReport(data){}}}
    }
    @Test fun twelfthItemAppearsWithNoTopEightLimit(){
        show(data())
        compose.onNodeWithTag("sales-items-report").performScrollToNode(hasText("Món 12"))
        compose.onNodeWithText("Món 12").assertIsDisplayed()
    }
    @Test fun mismatchedBillDisplaysDifferenceAndBillNumber(){
        show(data(true))
        compose.onNodeWithTag("sales-items-report").performScrollToNode(hasText("0210-QA"))
        compose.onNodeWithText("0210-QA").assertIsDisplayed()
        compose.onNodeWithText("Chi tiết món lệch subtotal · Giảm giá/phụ thu chưa đối soát").assertExists()
    }
}
