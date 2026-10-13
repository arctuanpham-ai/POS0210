package vn.ecohome.pos0210

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import vn.ecohome.pos0210.data.PrepaidOrderRow
import vn.ecohome.pos0210.data.WaitingOrderRow
import vn.ecohome.pos0210.data.OrderBatchEntity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private fun vnd(v: Long) = "%,dđ".format(v).replace(',', '.')

/** Danh sách đơn trả trước hôm nay: trạng thái, tiền khách đưa/thối, huỷ & hoàn tiền (bắt buộc lý do). */
@Composable
fun PrepaidOrders(vm: PosViewModel) {
    val orders by vm.prepaidOrders.collectAsState()
    var refundTarget by remember { mutableStateOf<PrepaidOrderRow?>(null) }
    var reason by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf("") }
    val fmt = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    Column {
        Header("Đơn hôm nay") { vm.screen.value = "TABLES" }
        if (msg.isNotBlank()) Text(msg, Modifier.padding(horizontal = 16.dp), fontWeight = FontWeight.Bold, color = Color(0xFF9A2B1F))
        if (orders.isEmpty()) {
            Text("Chưa có đơn trả trước nào hôm nay.", Modifier.padding(20.dp))
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(12.dp)) {
                items(orders, key = { it.batchId }) { o ->
                    val refunded = o.billStatus == "REFUNDED" || o.batchStatus == "CANCELLED"
                    Card(Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
                        Column(Modifier.padding(14.dp)) {
                            Row {
                                Text("${o.tableName.ifBlank { "Trả trước" }.uppercase()} · ${PaymentFlowRules.orderNoLabel(o.serviceNo)}", fontSize = 22.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
                                Text(PaymentFlowRules.statusLabel(o.billStatus, o.batchStatus), fontWeight = FontWeight.Bold,
                                    color = if (refunded) Color(0xFF9A2B1F) else Color(0xFF41633A))
                            }
                            Text("${vnd(o.total ?: 0L)} · ${if (o.method == "CASH") "Tiền mặt" else if (o.method == "TRANSFER") "Chuyển khoản" else "—"}" +
                                (o.paidAt?.let { " · ${fmt.format(Date(it))}" } ?: ""))
                            o.itemsText?.lines()?.forEach { Text(it, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 2.dp)) }
                            if (o.method == "CASH" && o.cashReceived != null) Text("Khách đưa ${vnd(o.cashReceived)} · thối ${vnd(o.change ?: 0L)}", fontSize = 12.sp)
                            if (!refunded && o.billId != null) {
                                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (o.batchStatus == "WAITING") Button(onClick = {
                                        vm.markDelivered(vn.ecohome.pos0210.data.OrderBatchEntity(o.batchId,o.sessionId,1,"",o.openedAt,null,o.batchStatus,o.serviceNo))
                                    }) { Text("ĐÃ GIAO") }
                                    OutlinedButton(onClick = { reason = ""; msg = ""; refundTarget = o }) { Text("HUỶ & HOÀN TIỀN") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    refundTarget?.let { o ->
        AlertDialog(
            onDismissRequest = { refundTarget = null },
            title = { Text("Huỷ ${PaymentFlowRules.orderNoLabel(o.serviceNo)} · hoàn ${vnd(o.total ?: 0L)}") },
            text = {
                Column {
                    Text("Đơn không bị xoá, chỉ ghi khoản hoàn. Bắt buộc nhập lý do.", fontSize = 12.sp)
                    OutlinedTextField(reason, { reason = it.take(120) }, label = { Text("Lý do") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                }
            },
            confirmButton = {
                TextButton(enabled = reason.isNotBlank(), onClick = {
                    vm.refundPrepaidOrder(o.sessionId, o.batchId, reason) { err -> msg = err ?: ""; if (err == null) refundTarget = null }
                }) { Text("XÁC NHẬN HOÀN") }
            },
            dismissButton = { TextButton(onClick = { refundTarget = null }) { Text("ĐÓNG") } }
        )
    }
}

/** Công tắc Trả sau / Trả trước + lịch sử đổi (chỉ ADMIN). */
@Composable
fun PaymentFlowSettings(vm: PosViewModel) {
    val settings by vm.settings.collectAsState()
    val me by vm.currentEmployee.collectAsState()
    fun get(k: String) = settings.firstOrNull { it.key == k }?.value ?: ""
    val current = PaymentFlowRules.normalize(get(PaymentFlowRules.SETTING_KEY))
    val target = if (current == PaymentFlowRules.PREPAID) PaymentFlowRules.POSTPAID else PaymentFlowRules.PREPAID
    var confirm by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf("") }
    val fmt = remember { SimpleDateFormat("dd/MM HH:mm", Locale.getDefault()) }
    val history = get(PaymentFlowRules.HISTORY_KEY).lines().filter { it.isNotBlank() }.reversed()
    Column {
        Header("Quy trình thanh toán") { vm.screen.value = "MANAGE" }
        Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
            Text("CHẾ ĐỘ HIỆN TẠI", fontSize = 12.sp)
            Text(PaymentFlowRules.label(current).uppercase(), fontSize = 34.sp, fontWeight = FontWeight.Black)
            Text(
                if (current == PaymentFlowRules.PREPAID) "Chọn món → Thanh toán → đơn được tạo và chuyển sang pha chế. Không có bàn mở."
                else "Mở bàn → gọi món → gửi bếp → thanh toán sau khi dùng xong.",
                Modifier.padding(vertical = 8.dp)
            )
            if (me?.role != "ADMIN") {
                Text("Chỉ ADMIN được đổi chế độ.", fontWeight = FontWeight.Bold)
            } else {
                Button(onClick = { msg = ""; confirm = true }, Modifier.fillMaxWidth()) { Text("ĐỔI SANG ${PaymentFlowRules.label(target).uppercase()}") }
                Text("Chỉ đổi được khi không còn bàn/đơn chưa thanh toán và giỏ hàng trống. Đổi hoàn toàn offline.", fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
            }
            if (msg.isNotBlank()) Text(msg, Modifier.padding(top = 10.dp), fontWeight = FontWeight.Black, color = Color(0xFF9A2B1F))
            HorizontalDivider(Modifier.padding(vertical = 14.dp))
            Text("LỊCH SỬ ĐỔI", fontWeight = FontWeight.Bold)
            if (history.isEmpty()) Text("Chưa đổi lần nào.", fontSize = 12.sp)
            history.forEach { line ->
                val p = line.split("|")
                if (p.size >= 4) Text("${fmt.format(Date(p[0].toLongOrNull() ?: 0L))} · ${p[1]} · ${PaymentFlowRules.label(p[2])} → ${PaymentFlowRules.label(p[3])}", Modifier.padding(vertical = 2.dp))
            }
        }
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Đổi sang ${PaymentFlowRules.label(target)}?") },
            text = { Text("Đơn mới từ giờ sẽ theo quy trình ${PaymentFlowRules.label(target)}. Dữ liệu cũ giữ nguyên.") },
            confirmButton = {
                TextButton(onClick = {
                    confirm = false
                    vm.changePaymentFlow(target) { err -> msg = err ?: "" }
                }) { Text("XÁC NHẬN ĐỔI") }
            },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("HUỶ") } }
        )
    }
}


private val Brown = Color(0xFF6E432D)

/** Hàng chờ pha chế/giao: mỗi đơn là một thẻ lớn (số thẻ bàn, số đơn, thời gian chờ, danh sách món) + nhắc bếp / đã giao. */
@Composable
fun DeliveryQueue(vm: PosViewModel) {
    val orders by vm.waitingOrders.collectAsState()
    val reminders by vm.reminders.collectAsState()
    val message by vm.printerMessage.collectAsState()
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(15_000L); now = System.currentTimeMillis() } }
    val fmt = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    Column {
        Header("Đơn chờ giao · ${orders.size}") { vm.screen.value = "TABLES" }
        if (message.isNotBlank()) Text(message, Modifier.padding(horizontal = 16.dp, vertical = 2.dp), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Brown)
        if (orders.isEmpty()) {
            Text("Không còn đơn chờ giao.", Modifier.padding(20.dp))
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(orders, key = { it.batchId }) { o ->
                    val waited = ((now - (o.sentAt ?: o.createdAt)) / 60_000L).coerceAtLeast(0)
                    val waitColor = when { waited >= 10 -> Color(0xFFB3261E); waited >= 5 -> Color(0xFFC96A12); else -> Color(0xFF41633A) }
                    val remind = reminders[o.batchId]
                    val stub = OrderBatchEntity(o.batchId, o.sessionId, o.sequence, "", o.createdAt, o.sentAt, "WAITING", o.serviceNo)
                    Card(
                        Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(2.dp, waitColor)
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(o.tableName.ifBlank { "TRẢ TRƯỚC" }.uppercase(), fontSize = 28.sp, fontWeight = FontWeight.Black, color = Brown)
                                    Text("${PaymentFlowRules.orderNoLabel(o.serviceNo)} · lúc ${fmt.format(Date(o.sentAt ?: o.createdAt))} · ${if (o.flow == PaymentFlowRules.PREPAID) "ĐÃ THU TIỀN" else "TRẢ SAU"}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                                Text("⏱ ${waited}'", fontSize = 26.sp, fontWeight = FontWeight.Black, color = waitColor)
                            }
                            HorizontalDivider(Modifier.padding(vertical = 8.dp))
                            (o.itemsText ?: "").lines().filter { it.isNotBlank() }.forEach {
                                Text(it, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 2.dp))
                            }
                            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = { vm.remindKitchen(o) }, Modifier.weight(1f)) {
                                    Text(if (remind != null) "🔔 NHẮC BẾP (${remind.first})" else "🔔 NHẮC BẾP", fontWeight = FontWeight.Bold)
                                }
                                Button(onClick = { vm.markDelivered(stub) }, Modifier.weight(1f)) { Text("ĐÃ GIAO ĐỦ", fontWeight = FontWeight.Black) }
                            }
                            TextButton(onClick = { vm.reprintKitchenBatch(stub) }) { Text("IN LẠI PHIẾU BẾP", fontSize = 12.sp) }
                        }
                    }
                }
            }
        }
    }
}
