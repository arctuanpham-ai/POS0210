package vn.ecohome.pos0210

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.graphics.asImageBitmap
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
    var mgrPin by remember { mutableStateOf("") }
    var settleTarget by remember { mutableStateOf<vn.ecohome.pos0210.data.RefundEntity?>(null) }
    var settleNote by remember { mutableStateOf("") }
    val refunds by vm.refunds.collectAsState()
    val frozen = refunds.filter { it.status == "FROZEN" }
    val frozenByBatch = frozen.associateBy { it.batchId }
    val fmt = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    Column {
        Header("Đơn hôm nay") { vm.screen.value = "TABLES" }
        if (msg.isNotBlank()) Text(msg, Modifier.padding(horizontal = 16.dp), fontWeight = FontWeight.Bold, color = Color(0xFF9A2B1F))
        FrozenRefundBanner(frozen)
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
                            frozenByBatch[o.batchId]?.let { fr ->
                                Surface(Modifier.fillMaxWidth().padding(top = 6.dp), color = Color(0xFFFFE0DC), shape = RoundedCornerShape(8.dp)) {
                                    Column(Modifier.padding(10.dp)) {
                                        Text("ĐÓNG BĂNG · ${vnd(fr.amount)} CK chờ hoàn cho khách", fontWeight = FontWeight.Black, color = Color(0xFF9A2B1F))
                                        Text("Lý do: ${fr.reason}", fontSize = 12.sp)
                                        OutlinedButton(onClick = { settleNote = ""; msg = ""; settleTarget = fr }, Modifier.padding(top = 4.dp)) { Text("ĐÃ HOÀN CK (quản lý)") }
                                    }
                                }
                            }
                            if (!refunded && o.billId != null) {
                                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (o.batchStatus == "WAITING") Button(onClick = {
                                        vm.markDelivered(vn.ecohome.pos0210.data.OrderBatchEntity(o.batchId,o.sessionId,1,"",o.openedAt,null,o.batchStatus,o.serviceNo))
                                    }) { Text("ĐÃ GIAO") }
                                    OutlinedButton(onClick = { reason = ""; mgrPin = ""; msg = ""; refundTarget = o }) { Text("HUỶ & HOÀN TIỀN") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    settleTarget?.let { fr ->
        AlertDialog(
            onDismissRequest = { settleTarget = null },
            title = { Text("Đã hoàn CK ${vnd(fr.amount)}?") },
            text = { Column {
                Text("Ghi cách đã hoàn để đối soát.", fontSize = 12.sp)
                OutlinedTextField(settleNote, { settleNote = it.take(120) }, label = { Text("VD: CK lại 14h20 qua VCB") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
            } },
            confirmButton = { TextButton(enabled = settleNote.isNotBlank(), onClick = { vm.settleFrozenRefund(fr.id, settleNote) { err -> msg = err ?: ""; if (err == null) settleTarget = null } }) { Text("XÁC NHẬN") } },
            dismissButton = { TextButton(onClick = { settleTarget = null }) { Text("ĐÓNG") } }
        )
    }
    refundTarget?.let { o ->
        AlertDialog(
            onDismissRequest = { refundTarget = null },
            title = { Text("Huỷ ${PaymentFlowRules.orderNoLabel(o.serviceNo)} · hoàn ${vnd(o.total ?: 0L)}") },
            text = {
                Column {
                    val late = o.paidAt != null && System.currentTimeMillis() - o.paidAt > 90_000L
                    Text(if (o.method == "CASH") "Tiền mặt: trả lại khách, đơn không tính doanh thu." else "Chuyển khoản: đơn bị ĐÓNG BĂNG, không tính doanh thu, quản lý hoàn CK cho khách rồi xác nhận.", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Text(if (late) "Đã quá 90 giây từ lúc thanh toán: cần quản lý nhập PIN." else "Trong 90 giây đầu nhân viên tự hoàn được.", fontSize = 12.sp, color = if (late) Color(0xFF9A2B1F) else Color.Unspecified)
                    OutlinedTextField(reason, { reason = it.take(120) }, label = { Text("Lý do") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                    if (late) OutlinedTextField(mgrPin, { mgrPin = it.filter(Char::isDigit).take(12) }, label = { Text("PIN quản lý") }, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                    if (msg.isNotBlank()) Text(msg, fontWeight = FontWeight.Bold, color = Color(0xFF9A2B1F), modifier = Modifier.padding(top = 6.dp))
                }
            },
            confirmButton = {
                TextButton(enabled = reason.isNotBlank(), onClick = {
                    vm.refundPrepaidOrder(o.sessionId, o.batchId, reason, mgrPin) { err -> msg = err ?: ""; if (err == null) refundTarget = null }
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

/** Phủ toàn màn hình khi đang in phiếu bếp sau thanh toán trả trước: chặn thao tác cho tới khi in xong; lỗi thì chọn in lại / tự báo bếp. */
@Composable
fun KitchenPrintOverlay(vm: PosViewModel, ui: KitchenPrintUi) {
    Surface(Modifier.fillMaxSize().clickable {}, color = Color(0xF2F7F0E8)) {
        Column(Modifier.fillMaxSize().padding(28.dp), horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            if (ui.phase == "PRINTING") {
                CircularProgressIndicator(Modifier.size(72.dp), color = Brown)
                Text("ĐANG IN PHIẾU BẾP…", Modifier.padding(top = 24.dp), fontSize = 26.sp, fontWeight = FontWeight.Black, color = Brown)
                Text(ui.tableName.uppercase(), fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 6.dp))
                if (ui.total > 0) Text("Phiếu ${ui.done}/${ui.total}", fontSize = 18.sp, modifier = Modifier.padding(top = 6.dp))
                Text("Đã thu tiền. Chờ máy in xong, không thoát màn hình.", fontSize = 12.sp, modifier = Modifier.padding(top = 14.dp))
            } else {
                Text("⚠ PHIẾU BẾP CHƯA IN ĐƯỢC", fontSize = 26.sp, fontWeight = FontWeight.Black, color = Color(0xFFB3261E), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                Text(ui.tableName.uppercase(), fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
                Text(ui.message, Modifier.padding(top = 10.dp), fontSize = 14.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                Text("Đơn ĐÃ thu tiền và đã ghi. Kiểm tra máy in/giấy rồi in lại.", Modifier.padding(top = 10.dp), fontSize = 12.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                Button(onClick = { vm.retryPaidKitchenPrint() }, Modifier.fillMaxWidth().padding(top = 22.dp).height(56.dp)) { Text("IN LẠI PHIẾU BẾP", fontWeight = FontWeight.Black) }
                OutlinedButton(onClick = { vm.skipPaidKitchenPrint() }, Modifier.fillMaxWidth().padding(top = 10.dp).height(52.dp)) { Text("TÔI BÁO BẾP TRỰC TIẾP") }
                Text("Đơn vẫn nằm trong Đơn chờ giao để in lại hoặc nhắc bếp.", Modifier.padding(top = 8.dp), fontSize = 11.sp)
            }
        }
    }
}

/** Xem trước các phiếu bếp (TEST / chưa bật máy in): hiện đúng ảnh sẽ in, mỗi dòng món một phiếu. */
@Composable
fun KitchenPreviewScreen(vm: PosViewModel, title: String, tickets: List<android.graphics.Bitmap>) {
    Surface(Modifier.fillMaxSize().clickable {}, color = Color(0xFFF7F0E8)) {
        Column(Modifier.fillMaxSize()) {
            Surface(color = Color(0xFFFFD8D8), modifier = Modifier.fillMaxWidth()) {
                Text("XEM THỬ · CHƯA IN GIẤY (chế độ TEST/không có máy in)", Modifier.padding(10.dp), fontWeight = FontWeight.Black, color = Color(0xFFB3261E), fontSize = 13.sp)
            }
            Text("$title · ${tickets.size} phiếu", Modifier.padding(12.dp), fontSize = 20.sp, fontWeight = FontWeight.Black, color = Brown)
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                tickets.forEachIndexed { i, bmp ->
                    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                        androidx.compose.foundation.Image(bmp.asImageBitmap(), contentDescription = "Phiếu ${i + 1}", modifier = Modifier.fillMaxWidth().padding(8.dp), contentScale = androidx.compose.ui.layout.ContentScale.FillWidth)
                    }
                }
            }
            Button(onClick = { vm.closeKitchenPreview() }, Modifier.fillMaxWidth().padding(14.dp).height(56.dp)) { Text("ĐÃ XEM · ĐÓNG", fontWeight = FontWeight.Black) }
        }
    }
}

/** Soát đơn trước khi tạo đơn và in bill: sửa số lượng, ghi chú, quay lại thêm món. Chưa tạo đơn nên chưa tốn số thứ tự. */
@Composable
fun PrepaidReview(vm: PosViewModel, t: vn.ecohome.pos0210.data.DiningTableEntity) {
    val cart by vm.cart.collectAsState()
    val notes by vm.cartNotes.collectAsState()
    val menu by vm.menu.collectAsState()
    val combos by vm.combos.collectAsState()
    val message by vm.orderMessage.collectAsState()
    val keys = cart.keys.toList()
    var total = 0L
    keys.forEach { k ->
        val qty = (cart[k] ?: 0).toLong()
        val price = if (k.startsWith("combo:")) combos.firstOrNull { it.id == k.removePrefix("combo:") }?.price else menu.firstOrNull { it.id == k }?.price
        total += (price ?: 0L) * qty
    }
    Column {
        Header("Soát đơn · ${t.name}") { vm.screen.value = "ORDER" }
        Text("Đọc lại đơn với khách. Đúng rồi mới sang thanh toán và in bill.", Modifier.padding(horizontal = 18.dp), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Brown)
        if (message.isNotBlank()) Text(message, Modifier.padding(horizontal = 18.dp, vertical = 4.dp), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFFB3261E))
        if (keys.isEmpty()) {
            Text("Giỏ hàng trống.", Modifier.padding(20.dp))
        }
        LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(keys, key = { it }) { k ->
                val qty = cart[k] ?: 0
                val isCombo = k.startsWith("combo:")
                val combo = if (isCombo) combos.firstOrNull { it.id == k.removePrefix("combo:") } else null
                val item = if (!isCombo) menu.firstOrNull { it.id == k } else null
                val name = combo?.name ?: item?.name ?: "Món"
                val price = combo?.price ?: item?.price ?: 0L
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Column(Modifier.padding(12.dp)) {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(name, fontSize = 20.sp, fontWeight = FontWeight.Black)
                                Text(vnd(price * qty), fontSize = 13.sp)
                            }
                            OutlinedButton(onClick = { if (combo != null) vm.subCombo(combo) else item?.let { vm.sub(it) } }, contentPadding = PaddingValues(0.dp), modifier = Modifier.size(44.dp)) { Text("−", fontSize = 22.sp) }
                            Text("$qty", Modifier.padding(horizontal = 14.dp), fontSize = 24.sp, fontWeight = FontWeight.Black)
                            OutlinedButton(onClick = { if (combo != null) vm.addCombo(combo) else item?.let { vm.add(it) } }, contentPadding = PaddingValues(0.dp), modifier = Modifier.size(44.dp)) { Text("+", fontSize = 22.sp) }
                        }
                        OutlinedTextField(
                            value = notes[k].orEmpty(),
                            onValueChange = { vm.setCartNote(k, it) },
                            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                            label = { Text("Ghi chú cho bếp") },
                            singleLine = true
                        )
                    }
                }
            }
        }
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                Text("${cart.values.sum()} món", Modifier.weight(1f), fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text("Tạm tính ${vnd(total)}", fontSize = 20.sp, fontWeight = FontWeight.Black)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { vm.screen.value = "ORDER" }, Modifier.weight(1f).height(56.dp)) { Text("THÊM / SỬA MÓN", fontWeight = FontWeight.Bold) }
                Button(onClick = { vm.sendBatch() }, Modifier.weight(1.3f).height(56.dp), enabled = keys.isNotEmpty()) { Text("ĐÚNG RỒI\nTHANH TOÁN".replace("\\n", "\n"), fontWeight = FontWeight.Black, textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
            }
        }
    }
}

/** Dải đỏ báo các khoản chuyển khoản đã đóng băng, chưa hoàn cho khách. */
@Composable
fun FrozenRefundBanner(frozen: List<vn.ecohome.pos0210.data.RefundEntity>) {
    if (frozen.isEmpty()) return
    Surface(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), color = Color(0xFF9A2B1F), shape = RoundedCornerShape(8.dp)) {
        Text("⚠ ${frozen.size} khoản CK ĐÓNG BĂNG · ${vnd(frozen.sumOf { it.amount })} chờ quản lý hoàn cho khách (không tính doanh thu)",
            Modifier.padding(10.dp), color = Color.White, fontWeight = FontWeight.Black, fontSize = 13.sp)
    }
}
