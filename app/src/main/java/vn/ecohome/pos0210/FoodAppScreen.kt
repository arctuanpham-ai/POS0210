package vn.ecohome.pos0210

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val Brown = Color(0xFF6E432D)
private fun vnd(v: Long) = "%,dđ".format(v).replace(',', '.')
private fun whenText(v: Long) = SimpleDateFormat("dd/MM HH:mm", Locale.getDefault()).format(Date(v))
private fun receivedOf(payload: String): Long = payload.substringAfter("received=", "").substringBefore(',').toLongOrNull() ?: 0L

/** Đơn ShopeeFood / GrabFood: nhập đơn, theo dõi tiền chờ app trả, chốt khi app trả tiền. */
@Composable
fun FoodAppScreen(vm: PosViewModel) {
    val bills by vm.bills.collectAsState()
    val payments by vm.payments.collectAsState()
    val settlements by vm.foodSettlements.collectAsState()
    val settings by vm.settings.collectAsState()
    val message by vm.foodAppMessage.collectAsState()
    val current by vm.currentEmployee.collectAsState()
    var filter by remember { mutableStateOf("ALL") }
    var showNew by remember { mutableStateOf(false) }
    var showPrices by remember { mutableStateOf(false) }
    var settleBillId by remember { mutableStateOf<String?>(null) }

    val billsById = remember(bills) { bills.associateBy { it.id } }
    val settledMap = remember(settlements) { settlements.associate { it.entityId to it } }
    val foodPays = remember(payments, billsById) { payments.filter { FoodApp.isFood(it.method) && it.billId in billsById } }
    val pending = foodPays.filter { it.billId !in settledMap && (filter == "ALL" || it.method == filter) }
    val settled = foodPays.filter { it.billId in settledMap && (filter == "ALL" || it.method == filter) }.sortedByDescending { settledMap[it.billId]?.occurredAt ?: 0L }.take(15)
    val pendingByApp = FoodApp.APPS.associateWith { app -> foodPays.filter { it.method == app && it.billId !in settledMap }.sumOf { it.amount } }
    val isAdmin = current?.role == "ADMIN"

    Column(Modifier.fillMaxSize()) {
        Header("Đơn app food") { vm.screen.value = "TABLES" }
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(filter == "ALL", { filter = "ALL" }, { Text("TẤT CẢ") })
            FoodApp.APPS.forEach { app -> FilterChip(filter == app, { filter = app }, { Text("${FoodApp.label(app).uppercase()} · ${vnd(pendingByApp[app] ?: 0L)}") }) }
        }
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button({ vm.foodAppMessage.value = ""; showNew = true }, Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Brown)) { Text("+ ĐƠN MỚI") }
            OutlinedButton({ showPrices = true }, Modifier.weight(1f)) { Text("BẢNG GIÁ APP") }
        }
        if (message.isNotBlank()) Text(message, Modifier.padding(horizontal = 14.dp, vertical = 4.dp), color = Brown, fontWeight = FontWeight.Bold)
        Text("Doanh thu đã tính ngày bán. Tiền chưa về két hay ngân hàng cho đến khi bạn bấm ĐÃ NHẬN TIỀN.", Modifier.padding(horizontal = 14.dp), fontSize = 12.sp, color = Color.Gray)
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Text("CHỜ APP TRẢ TIỀN · ${pending.size} đơn · ${vnd(pending.sumOf { it.amount })}", fontWeight = FontWeight.Black) }
            if (pending.isEmpty()) item { Text("Không có đơn nào đang chờ.", color = Color.Gray) }
            items(pending.sortedByDescending { it.paidAt }, key = { it.id }) { p ->
                val bill = billsById[p.billId]
                Card(border = BorderStroke(1.dp, Color(0xFFD9B9A6)), shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${FoodApp.label(p.method)} · ${FoodApp.codeOf(p.reference, p.method)}", fontWeight = FontWeight.Bold)
                            Text("${whenText(p.paidAt)} · bill ${bill?.billNo ?: "?"}", fontSize = 12.sp, color = Color.Gray)
                            Text(vnd(p.amount), fontWeight = FontWeight.Black, fontSize = 18.sp)
                        }
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Button({ settleBillId = p.billId }, colors = ButtonDefaults.buttonColors(containerColor = Brown)) { Text("ĐÃ NHẬN TIỀN") }
                            OutlinedButton({ vm.repriceFoodOrder(p.billId) {} }) { Text("TÍNH LẠI GIÁ", fontSize = 12.sp) }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(8.dp)); Text("ĐÃ NHẬN TIỀN GẦN ĐÂY", fontWeight = FontWeight.Black) }
            if (settled.isEmpty()) item { Text("Chưa có đơn nào được chốt.", color = Color.Gray) }
            items(settled, key = { "s" + it.id }) { p ->
                val ev = settledMap[p.billId]
                val got = receivedOf(ev?.payload.orEmpty())
                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFF4EFEA)), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.fillMaxWidth().padding(10.dp)) {
                        Text("${FoodApp.label(p.method)} · ${FoodApp.codeOf(p.reference, p.method)}", fontWeight = FontWeight.Bold)
                        Text("Giá trị đơn ${vnd(p.amount)} · thực nhận ${vnd(got)} · phí app ${vnd((p.amount - got).coerceAtLeast(0L))}", fontSize = 12.sp)
                        Text("Nhận lúc ${ev?.occurredAt?.let { whenText(it) } ?: "--"}", fontSize = 11.sp, color = Color.Gray)
                    }
                }
            }
        }
    }

    if (showNew) NewFoodOrderDialog(vm) { showNew = false }
    if (showPrices) FoodPriceDialog(vm, isAdmin) { showPrices = false }
    settleBillId?.let { id ->
        val pay = foodPays.firstOrNull { it.billId == id }
        var text by remember(id) { mutableStateOf(pay?.amount?.toString().orEmpty()) }
        val amount = FoodApp.parseAmount(text)
        AlertDialog(
            onDismissRequest = { settleBillId = null },
            title = { Text("App đã trả tiền") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${pay?.let { FoodApp.label(it.method) }} · ${FoodApp.codeOf(pay?.reference, pay?.method.orEmpty())} · giá trị đơn ${vnd(pay?.amount ?: 0L)}")
                    OutlinedTextField(text, { text = it.filter { c -> c.isDigit() } }, label = { Text("Số tiền thực nhận (đã trừ phí app)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    if (amount != null && pay != null) Text("Phí app: ${vnd((pay.amount - amount).coerceAtLeast(0L))}", fontSize = 12.sp)
                }
            },
            confirmButton = { Button({ if (amount != null) vm.settleFoodOrder(id, amount) { settleBillId = null } }, enabled = amount != null) { Text("XÁC NHẬN") } },
            dismissButton = { TextButton({ settleBillId = null }) { Text("ĐÓNG") } }
        )
    }
}

@Composable
private fun NewFoodOrderDialog(vm: PosViewModel, onClose: () -> Unit) {
    val menu by vm.menu.collectAsState()
    val settings by vm.settings.collectAsState()
    val message by vm.foodAppMessage.collectAsState()
    val prices = remember(settings) { vm.foodPrices() }
    var app by remember { mutableStateOf(FoodApp.SHOPEE) }
    var code by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    var qty by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    val active = menu.filter { it.active }
    val shown = active.filter { search.isBlank() || it.name.contains(search, ignoreCase = true) }
    val total = qty.entries.sumOf { (id, q) -> active.firstOrNull { it.id == id }?.let { FoodApp.priceFor(it.id, it.price, prices) * q } ?: 0L }
    AlertDialog(
        onDismissRequest = { if (!busy) onClose() },
        title = { Text("Đơn app food mới") },
        text = {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FoodApp.APPS.forEach { a -> FilterChip(app == a, { app = a }, { Text(FoodApp.label(a)) }) }
                }
                OutlinedTextField(code, { code = it }, label = { Text("Mã đơn của app") }, singleLine = true)
                OutlinedTextField(search, { search = it }, label = { Text("Tìm món") }, singleLine = true)
                LazyColumn(Modifier.heightIn(max = 280.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    items(shown, key = { it.id }) { m ->
                        val q = qty[m.id] ?: 0
                        val p = FoodApp.priceFor(m.id, m.price, prices)
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(m.name, fontWeight = if (q > 0) FontWeight.Bold else FontWeight.Normal)
                                Text(vnd(p) + if (prices[m.id] == null) " (giá menu)" else "", fontSize = 11.sp, color = Color.Gray)
                            }
                            TextButton({ if (q > 0) qty = if (q == 1) qty - m.id else qty + (m.id to q - 1) }, enabled = q > 0) { Text("−", fontSize = 20.sp) }
                            Text(q.toString(), Modifier.widthIn(min = 22.dp), fontWeight = FontWeight.Black)
                            TextButton({ if (q < 99) qty = qty + (m.id to q + 1) }) { Text("+", fontSize = 20.sp) }
                        }
                    }
                }
                Text("Tổng: ${vnd(total)} · ${qty.values.sum()} món", fontWeight = FontWeight.Black)
                if (message.isNotBlank()) Text(message, color = Color(0xFFB3261E), fontSize = 12.sp)
            }
        },
        confirmButton = {
            Button({
                busy = true
                vm.addFoodOrder(app, code, qty) { ok -> busy = false; if (ok) onClose() }
            }, enabled = !busy && code.isNotBlank() && qty.isNotEmpty(), colors = ButtonDefaults.buttonColors(containerColor = Brown)) { Text("GHI ĐƠN + IN BẾP") }
        },
        dismissButton = { TextButton({ if (!busy) onClose() }) { Text("ĐÓNG") } }
    )
}

@Composable
private fun FoodPriceDialog(vm: PosViewModel, isAdmin: Boolean, onClose: () -> Unit) {
    val menu by vm.menu.collectAsState()
    val settings by vm.settings.collectAsState()
    val saved = remember(settings) { vm.foodPrices() }
    var edits by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var search by remember { mutableStateOf("") }
    val shown = menu.filter { it.active && (search.isBlank() || it.name.contains(search, ignoreCase = true)) }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Bảng giá app (Shopee + Grab)") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(if (isAdmin) "Để trống = dùng giá menu. Giá áp dụng cho đơn nhập từ lúc lưu; bill cũ giữ nguyên giá đã bán." else "Chỉ quản lý được sửa bảng giá.", fontSize = 12.sp, color = Color.Gray)
                OutlinedTextField(search, { search = it }, label = { Text("Tìm món") }, singleLine = true)
                LazyColumn(Modifier.heightIn(max = 340.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(shown, key = { it.id }) { m ->
                        val value = edits[m.id] ?: (saved[m.id]?.toString().orEmpty())
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) { Text(m.name); Text("Giá menu ${vnd(m.price)}", fontSize = 11.sp, color = Color.Gray) }
                            OutlinedTextField(value, { edits = edits + (m.id to it.filter { c -> c.isDigit() }.take(9)) }, Modifier.width(120.dp), enabled = isAdmin, singleLine = true, placeholder = { Text("giá app") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                        }
                    }
                }
            }
        },
        confirmButton = {
            if (isAdmin) Button({
                val merged = saved.toMutableMap()
                edits.forEach { (id, v) -> val n = v.toLongOrNull(); if (n == null || n <= 0L) merged.remove(id) else merged[id] = n }
                vm.saveFoodPrices(merged); onClose()
            }, colors = ButtonDefaults.buttonColors(containerColor = Brown)) { Text("LƯU") }
        },
        dismissButton = { TextButton(onClose) { Text("ĐÓNG") } }
    )
}
