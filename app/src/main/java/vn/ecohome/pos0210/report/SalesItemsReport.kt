package vn.ecohome.pos0210.report

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import vn.ecohome.pos0210.data.*
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle
import java.text.NumberFormat
import java.util.Locale

private fun amount(n:Long)=NumberFormat.getNumberInstance(Locale("vi","VN")).format(n)+"đ"
private fun kindLabel(kind:String)=when(kind){"COMBO"->"Combo";"COMPONENT"->"Thành phần combo · chỉ số lượng";"GIFT"->"Quà tặng";"DISCOUNTED"->"Có giảm giá bill";else->"Món thường"}

@Composable
fun SalesItemsReport(data:SalesReportData,onBill:(BillEntity)->Unit) {
    val zone=ZoneId.of("Asia/Ho_Chi_Minh")
    val fmt=DateTimeFormatter.ofPattern("dd/MM/uuuu").withResolverStyle(ResolverStyle.STRICT)
    var fromText by remember{mutableStateOf(LocalDate.now(zone).format(fmt))}
    var untilText by remember{mutableStateOf(LocalDate.now(zone).format(fmt))}
    var group by remember{mutableStateOf("ALL")}
    val start=runCatching{if(fromText.isBlank()) null else LocalDate.parse(fromText,fmt).atStartOfDay(zone).toInstant().toEpochMilli()}.getOrNull()
    val end=runCatching{if(untilText.isBlank()) null else LocalDate.parse(untilText,fmt).plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()}.getOrNull()
    val invalid=(fromText.isNotBlank()&&start==null)||(untilText.isNotBlank()&&end==null)||(start!=null&&end!=null&&start>=end)
    val bills=if(invalid) emptyList() else SalesReport.period(data.bills,start,end)
    val ids=bills.map{it.id}.toSet()
    val sessions=bills.map{it.sessionId}.toSet()
    val lines=data.items.filter{it.sessionId in sessions}
    val all=SalesReport.aggregate(lines)
    fun groupKey(r:SalesReport.ItemSummary)=(r.categoryId ?: "UNKNOWN")+"|"+r.categoryName
    val groups=all.groupBy{groupKey(it)}
    val rows=all.filter{group=="ALL"||groupKey(it)==group}
    val reconciliation=SalesReport.reconcile(data.bills,data.items,data.adjustments,data.payments,data.sessions).filter{it.bill.id in ids}
    val issues=reconciliation.filter{it.issues.isNotEmpty()}
    LazyColumn(Modifier.fillMaxSize().padding(12.dp).testTag("sales-items-report"),verticalArrangement=Arrangement.spacedBy(8.dp)) {
        item {
            Text("THỐNG KÊ MÓN",fontWeight=FontWeight.Bold)
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(fromText,{fromText=it},Modifier.weight(1f),label={Text("Từ · dd/MM/yyyy")},singleLine=true)
                OutlinedTextField(untilText,{untilText=it},Modifier.weight(1f),label={Text("Đến · dd/MM/yyyy")},singleLine=true)
            }
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                TextButton(onClick={val d=LocalDate.now(zone).format(fmt);fromText=d;untilText=d}){Text("HÔM NAY")}
                TextButton(onClick={fromText="";untilText=""}){Text("TẤT CẢ")}
            }
            if(invalid)Text("Ngày không hợp lệ; nhập dd/MM/yyyy, từ ngày không sau đến ngày.")
            Text("${bills.size} bill · Doanh thu ${amount(bills.sumOf{it.total})}")
            Text("Giá trị món = số lượng × giá chốt khi order, trước giảm giá/phụ thu bill. Quà tặng giữ riêng giá trị danh nghĩa. Thành phần combo chỉ cộng số lượng; tiền tính ở combo.")
            if(lines.any{it.categoryName==null})Text("Dữ liệu cũ chưa lưu nhóm: hiển thị ‘Chưa có nhóm lịch sử’, không suy ra từ menu hiện tại.")
            if(data.bills.any{it.closedAt==null})Text("${data.bills.count{it.closedAt==null}} bill thiếu ngày thanh toán; xem khi chọn TẤT CẢ.")
            if(lines.any{SalesReport.compositionIssue(it)!=null&&it.comboPartsJson!=null})Text("Có snapshot combo lỗi/không đầy đủ: số lượng thành phần chưa thể xác nhận. Xem cảnh báo đối soát.")
            if(lines.any{it.menuItemId?.startsWith("combo:")==true&&it.comboPartsJson==null})Text("Combo cũ thiếu snapshot thành phần; chưa thể xác nhận số Cà phê bên trong.")
        }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                FilterChip(group=="ALL",{group="ALL"},{Text("Tất cả nhóm")})
                groups.forEach{(key,rs)->FilterChip(group==key,{group=key},{Text(rs.first().categoryName)})}
            }
        }
        item { Text("TỔNG THEO NHÓM",fontWeight=FontWeight.Bold) }
        items(groups.values.toList().filter{group=="ALL"||groupKey(it.first())==group}){rs->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(rs.first().categoryName,fontWeight=FontWeight.Bold)
                    val direct=rs.filter{it.kind!="COMPONENT"}
                    val parts=rs.filter{it.kind=="COMPONENT"}.sumOf{it.qty}
                    Text("${direct.sumOf{it.qty}} phần trực tiếp · ${amount(direct.sumOf{it.gross})}")
                    if(parts!=0)Text("$parts phần trong combo · tiền nằm ở nhóm Combo")
                }
            }
        }
        item { Text("TẤT CẢ MÓN · ${rows.size} dòng",fontWeight=FontWeight.Bold) }
        items(rows){r->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(r.names.joinToString(" / "),fontWeight=FontWeight.Bold)
                    Text("${r.categoryName} · ${kindLabel(r.kind)}")
                    if(r.kind=="COMPONENT")Text("${r.qty} phần · không phân bổ giá combo")
                    else {
                        val price=if(r.minPrice==r.maxPrice)amount(r.minPrice) else "${amount(r.minPrice)} – ${amount(r.maxPrice)}"
                        Text("${r.qty} phần · đơn giá $price")
                        Text("Giá trị ${amount(r.gross)}",fontWeight=FontWeight.Bold)
                    }
                }
            }
        }
        item {
            Text("ĐỐI SOÁT · ${issues.size} bill cần kiểm tra",fontWeight=FontWeight.Bold)
            Text("Chi tiết ↔ subtotal; subtotal − giảm giá + phụ thu ↔ total; bill ↔ payment. Chỉ đọc dữ liệu, không tự sửa.")
            if(data.orphanLines>0)Text("Toàn CSDL: ${data.orphanLines} dòng món mất liên kết batch/phiên, không xác định được ngày hay bill.")
            if(issues.isEmpty()&&bills.isNotEmpty())Text("Các bill trong kỳ khớp ba cấp đối soát.")
        }
        items(issues){r->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(r.bill.billNo,fontWeight=FontWeight.Bold)
                    Text(r.issues.joinToString(" · "))
                    Text("Món ${amount(r.details)} / subtotal ${amount(r.bill.subtotal)} · lệch ${amount(r.detailDelta)}")
                    Text("Giảm ${amount(r.discount)} · phụ thu ${amount(r.surcharge)} · lệch total ${amount(r.adjustmentDelta)}")
                    Text("Bill ${amount(r.bill.total)} / thanh toán ${amount(r.paid)} · lệch ${amount(r.paymentDelta)}")
                    TextButton(onClick={onBill(r.bill)}){Text("XEM BILL")}
                }
            }
        }
    }
}
