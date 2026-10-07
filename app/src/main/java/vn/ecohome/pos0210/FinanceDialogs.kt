package vn.ecohome.pos0210
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import vn.ecohome.pos0210.data.*
import java.text.SimpleDateFormat
import java.util.*

@Composable fun CostCodeManagerDialog(codes:List<CostCodeEntity>,onDismiss:()->Unit,onAdd:(String,String,String,String,String)->Unit){
 var code by remember{mutableStateOf("")};var name by remember{mutableStateOf("")};var unit by remember{mutableStateOf("lần")};var supplier by remember{mutableStateOf("")};var parent by remember{mutableStateOf(ExpenseCategories.OTHER_EXPENSE)}
 AlertDialog(onDismissRequest=onDismiss,confirmButton={TextButton(onClick=onDismiss){Text("ĐÓNG")}},title={Text("Mã chi phí cố định")},text={Column(Modifier.verticalScroll(androidx.compose.foundation.rememberScrollState())){
  OutlinedTextField(code,{code=it.uppercase().take(24)},Modifier.fillMaxWidth(),label={Text("Mã, ví dụ DV-DIEN")});OutlinedTextField(name,{name=it},Modifier.fillMaxWidth(),label={Text("Tên chi phí")});OutlinedTextField(unit,{unit=it},Modifier.fillMaxWidth(),label={Text("Đơn vị mặc định")});OutlinedTextField(supplier,{supplier=it},Modifier.fillMaxWidth(),label={Text("Nhà cung cấp mặc định")})
  Text("Nhóm báo cáo",Modifier.padding(top=8.dp),fontWeight=FontWeight.Bold);Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){listOf(ExpenseCategories.INVENTORY_PURCHASE,ExpenseCategories.PAYROLL,ExpenseCategories.ELECTRICITY,ExpenseCategories.WATER,ExpenseCategories.RENT,ExpenseCategories.MARKETING,ExpenseCategories.CONSUMABLES,ExpenseCategories.MAINTENANCE,ExpenseCategories.SERVICES,ExpenseCategories.BANK_FEES,ExpenseCategories.OTHER_EXPENSE,ExpenseCategories.ADDITIONAL_INVESTMENT).forEach{v->FilterChip(parent==v,{parent=v},{Text(ExpenseCategories.label(v))})}}
  Button({onAdd(code,name,parent,unit,supplier);code="";name=""},Modifier.fillMaxWidth().padding(top=8.dp),enabled=code.isNotBlank()&&name.isNotBlank()){Text("LƯU MÃ CHI PHÍ")};codes.forEach{Text("${it.code} · ${it.name} · ${it.defaultUnit}",Modifier.padding(top=6.dp),fontSize=androidx.compose.ui.unit.TextUnit.Unspecified)}
 }})
}

@Composable fun PurchaseEditDialog(vm:PosViewModel,p:PurchaseEntity,line:PurchaseItemEntity,categories:List<PurchaseCategoryEntity>,costCodes:List<CostCodeEntity>,supplierInitial:String,onDismiss:()->Unit,onSaved:()->Unit){
 var payer by remember{mutableStateOf(p.paidByName)};var supplier by remember{mutableStateOf(supplierInitial)};var note by remember{mutableStateOf(p.note)};var date by remember{mutableStateOf(SimpleDateFormat("dd/MM/yyyy HH:mm",Locale.getDefault()).format(Date(p.purchasedAt)))};var qty by remember{mutableStateOf(line.qty.toString())};var unit by remember{mutableStateOf(line.unit)};var price by remember{mutableStateOf(line.unitPrice.toString())};var expense by remember{mutableStateOf(p.expenseCategory)};var detail by remember{mutableStateOf(line.categoryId)};var costCode by remember{mutableStateOf(p.costCodeId)}
 AlertDialog(onDismissRequest=onDismiss,confirmButton={Button(onClick={val at=runCatching{SimpleDateFormat("dd/MM/yyyy HH:mm",Locale.getDefault()).parse(date)?.time}.getOrNull()?:p.purchasedAt;vm.updatePurchaseFinancial(p,line,expense,detail,costCode,payer,supplier,note,at,qty.replace(',','.').toDoubleOrNull()?:0.0,unit,price.toLongOrNull()?:0);onSaved()},enabled=(qty.replace(',','.').toDoubleOrNull()?:0.0)>0&&(price.toLongOrNull()?:0)>0){Text("LƯU SỬA")}},dismissButton={TextButton(onClick=onDismiss){Text("HỦY")}},title={Text("Chỉnh sửa phiếu")},text={Column(Modifier.verticalScroll(androidx.compose.foundation.rememberScrollState())){
  OutlinedTextField(date,{date=it},Modifier.fillMaxWidth(),label={Text("Ngày giờ")});OutlinedTextField(payer,{payer=it},Modifier.fillMaxWidth(),label={Text("Người chi / ứng tiền")});OutlinedTextField(supplier,{supplier=it},Modifier.fillMaxWidth(),label={Text("Nhà cung cấp")});OutlinedTextField(note,{note=it},Modifier.fillMaxWidth(),label={Text("Ghi chú")})
  Text("Nhóm báo cáo",Modifier.padding(top=8.dp),fontWeight=FontWeight.Bold);Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){ExpenseCategories.all.forEach{v->FilterChip(expense==v,{expense=v},{Text(ExpenseCategories.label(v))})}}
  Text("Phân mục",Modifier.padding(top=8.dp),fontWeight=FontWeight.Bold);Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){categories.forEach{c->FilterChip(detail==c.id,{detail=c.id;unit=c.defaultUnit},{Text(c.name)})}}
  Text("Mã chi phí",Modifier.padding(top=8.dp),fontWeight=FontWeight.Bold);Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){FilterChip(costCode==null,{costCode=null},{Text("Không mã")});costCodes.forEach{cc->FilterChip(costCode==cc.id,{costCode=cc.id;expense=cc.parentExpenseCategory;unit=cc.defaultUnit},{Text(cc.code)})}}
  Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){OutlinedTextField(qty,{qty=it.filter{c->c.isDigit()||c=='.'||c==','}},Modifier.weight(1f),label={Text("Số lượng")});OutlinedTextField(unit,{unit=it},Modifier.weight(1f),label={Text("ĐVT")})};OutlinedTextField(price,{price=it.filter(Char::isDigit)},Modifier.fillMaxWidth(),label={Text("Đơn giá")})
 }})
}

@Composable fun PayerReimbursementDialog(payer:String,onDismiss:()->Unit,onSave:(Long,String,String)->Unit){
 var amount by remember{mutableStateOf("")};var method by remember{mutableStateOf("CASH")};var note by remember{mutableStateOf("")}
 AlertDialog(onDismissRequest=onDismiss,confirmButton={Button(onClick={onSave(amount.toLongOrNull()?:0,method,note)},enabled=(amount.toLongOrNull()?:0)>0){Text("GHI HOÀN ỨNG")}},dismissButton={TextButton(onClick=onDismiss){Text("HỦY")}},title={Text("Hoàn ứng · $payer")},text={Column{OutlinedTextField(amount,{amount=it.filter(Char::isDigit)},Modifier.fillMaxWidth(),label={Text("Số tiền")});Row(horizontalArrangement=Arrangement.spacedBy(5.dp)){FilterChip(method=="CASH",{method="CASH"},{Text("Tiền mặt")});FilterChip(method=="TRANSFER",{method="TRANSFER"},{Text("Chuyển khoản")})};OutlinedTextField(note,{note=it},Modifier.fillMaxWidth(),label={Text("Ghi chú")});Text("Hoàn ứng chỉ giảm công nợ, không tạo thêm chi phí.",Modifier.padding(top=6.dp),fontWeight=FontWeight.Bold)}})
}


private fun financeMoney(v: Long) = "%,dđ".format(v).replace(',', '.')

@Composable
fun AccountingCard(rows: List<Pair<String, Long?>>) {
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(Modifier.padding(14.dp)) {
            rows.forEach { (label, value) ->
                Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Text(
                        label,
                        Modifier.weight(1f),
                        fontWeight = if (label.uppercase() == label) FontWeight.Black else FontWeight.Normal
                    )
                    Text(value?.let { financeMoney(it) } ?: "—", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
