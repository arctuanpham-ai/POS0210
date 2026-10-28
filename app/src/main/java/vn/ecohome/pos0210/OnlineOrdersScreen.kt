package vn.ecohome.pos0210

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import vn.ecohome.pos0210.cloud.CustomerNote
import vn.ecohome.pos0210.cloud.CustomerProfile
import vn.ecohome.pos0210.cloud.OnlineOrder
import vn.ecohome.pos0210.cloud.OnlineOrderRules as R
import vn.ecohome.pos0210.cloud.OnlineOrderService
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val Brown = Color(0xFF6E432D)
private fun vnd(v: Long) = "%,dđ".format(v).replace(',', '.')

/** Nhân viên nhận và xử lý đơn khách đặt qua datmon0210.web.app ngay trên POS. */
@Composable
fun OnlineOrdersScreen(vm: PosViewModel) {
    val context = LocalContext.current
    val orders by vm.onlineOrders.collectAsState()
    val connected by OnlineOrderService.connected.collectAsState()
    val error by OnlineOrderService.error.collectAsState()
    val message by vm.onlineMessage.collectAsState()
    var mode by remember { mutableStateOf(OnlineOrderService.mode(context)) }
    var lampOpen by remember { mutableStateOf(false) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var rejecting by remember { mutableStateOf<OnlineOrder?>(null) }
    LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(1000L); now = System.currentTimeMillis() } }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) { if (Build.VERSION.SDK_INT >= 33) runCatching { permission.launch(Manifest.permission.POST_NOTIFICATIONS) } }

    val byTime = compareBy<OnlineOrder> { it.createdAt }
    val startOfDay = remember(now / 3_600_000L) { java.util.Calendar.getInstance().apply { set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0); set(java.util.Calendar.SECOND, 0) }.timeInMillis }
    val need = orders.filter { it.status == R.NEW }.sortedWith(byTime)
    val awaiting = orders.filter { it.status == R.AWAITING }.sortedWith(byTime)
    val making = orders.filter { it.status == R.PAID || it.status == R.DELIVERING }.sortedWith(byTime)
    val late = orders.filter { it.status == R.EXPIRED || it.status == R.CANCELLED }.sortedByDescending { it.createdAt }.filter { it.createdAt >= startOfDay }
    val recent = orders.filter { (it.status == R.DONE || it.status == R.REJECTED) && it.createdAt >= startOfDay }.sortedByDescending { it.createdAt }

    Column {
        Header("Đơn online · ${R.attention(orders, now)}") { vm.screen.value = "TABLES" }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (connected) "● Đang nghe đơn mới" else "○ Chưa kết nối", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = if (connected) Color(0xFF2F7D32) else Color(0xFFB3261E), modifier = Modifier.weight(1f))
            TextButton(onClick = { lampOpen = !lampOpen }) { Text(if (lampOpen) "ẨN" else "CÁCH BÁO ĐƠN", fontSize = 12.sp, fontWeight = FontWeight.Bold) }
        }
        if (lampOpen) Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Cách báo khi có đơn mới", fontWeight = FontWeight.Bold, fontSize = 13.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("SOUND" to "Âm thanh", "LIGHT" to "Chỉ đèn (im lặng)", "BOTH" to "Cả hai").forEach { (k, v) ->
                    FilterChip(mode == k, { mode = k; OnlineOrderService.setMode(context, k) }, { Text(v, fontSize = 12.sp, maxLines = 1, softWrap = false) })
                }
            }
            ZaloSection()
            Text("Chế độ đèn: đèn pin của máy POS và cả màn hình nháy kiểu SOS, kèm rung, không phát tiếng, tới khi đơn được nhận hoặc từ chối. Đặt máy POS nơi nhân viên nhìn thấy.", fontSize = 11.sp)
        }
        if (error.isNotBlank()) Text(error, Modifier.padding(horizontal = 16.dp), color = Color(0xFFB3261E), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        if (message.isNotBlank()) Text(message, Modifier.padding(horizontal = 16.dp), color = Brown, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        if (orders.none { it.createdAt >= startOfDay || it.status in R.ACTIVE_STATUSES }) Text("Chưa có đơn online nào hôm nay.", Modifier.padding(20.dp))
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            fun section(title: String, list: List<OnlineOrder>) {
                if (list.isEmpty()) return
                item(key = "h_$title") { Text("$title · ${list.size}", fontWeight = FontWeight.Black, fontSize = 15.sp, color = Brown, modifier = Modifier.padding(top = 6.dp)) }
                items(list, key = { "${title}_${it.id}" }) { OnlineOrderCard(vm, it, now) { rejecting = it } }
            }
            section("CẦN NHẬN NGAY", need)
            section("CHỜ KHÁCH THANH TOÁN", awaiting)
            section("ĐÃ THU TIỀN · ĐANG LÀM / GIAO", making)
            section("HẾT HẠN / KHÁCH HUỶ (hôm nay)", late)
            section("ĐÃ XONG HÔM NAY", recent)
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
    rejecting?.let { o ->
        var reason by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { rejecting = null },
            title = { Text("Từ chối đơn ${o.code}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Khách sẽ thấy lý do này.", fontSize = 12.sp)
                    R.REJECT_REASONS.forEach { r -> FilterChip(reason == r, { reason = r }, { Text(r, fontSize = 13.sp) }) }
                    OutlinedTextField(reason, { reason = it }, label = { Text("Lý do") }, singleLine = true)
                }
            },
            confirmButton = { Button(onClick = { if (reason.isNotBlank()) { vm.onlineAction(o, "reject", reason); rejecting = null } }, enabled = reason.isNotBlank()) { Text("TỪ CHỐI ĐƠN") } },
            dismissButton = { TextButton(onClick = { rejecting = null }) { Text("ĐÓNG") } },
        )
    }
}

@Composable
private fun OnlineOrderCard(vm: PosViewModel, o: OnlineOrder, now: Long, onReject: () -> Unit) {
    val fmt = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    val overdue = R.isOverdue(o, now)
    val accent = when {
        o.status == R.NEW -> Color(0xFFB3261E)
        o.status == R.AWAITING -> if (overdue) Color(0xFFB3261E) else Color(0xFFC96A12)
        o.status == R.PAID || o.status == R.DELIVERING -> Color(0xFF41633A)
        else -> Color(0xFF9A9188)
    }
    var confirmPaid by remember { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(2.dp, accent)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(o.code, fontSize = 26.sp, fontWeight = FontWeight.Black, color = Brown)
                    Text("${R.label(o.status)} · ${fmt.format(Date(o.createdAt))}", fontSize = 12.sp, color = accent, fontWeight = FontWeight.Bold)
                }
                Text(vnd(o.total), fontSize = 22.sp, fontWeight = FontWeight.Black)
            }
            Text("${o.name} · ${o.phone}", fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 6.dp))
            if (o.status in R.ACTIVE_STATUSES) CustomerPanel(vm, o)
            Text(R.modeLabel(o.mode) + when (o.mode) { "delivery" -> ": ${o.address}"; "dinein" -> " · bàn ${o.table}"; else -> "" }, fontSize = 13.sp)
            HorizontalDivider(Modifier.padding(vertical = 6.dp))
            o.items.forEach { l ->
                Text("${l.qty}× ${l.name}", fontSize = 17.sp, fontWeight = FontWeight.Bold)
                if (l.note.isNotBlank()) Text("   ${l.note}", fontSize = 12.sp, color = Color(0xFF7A4B00))
            }
            if (o.note.isNotBlank()) Text("Ghi chú: ${o.note}", Modifier.padding(top = 4.dp), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF7A4B00))
            if (o.status == R.AWAITING && o.expiresAt != null) {
                val left = o.expiresAt - now
                Text(
                    if (left > 0) "Còn ${left / 60000}:${((left / 1000) % 60).toString().padStart(2, '0')} · nội dung CK: DM${o.code}" else "Quá hạn thanh toán · nội dung CK: DM${o.code}",
                    Modifier.padding(top = 4.dp), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = accent,
                )
            }
            if (o.status == R.REJECTED && o.rejectReason.isNotBlank()) Text("Lý do: ${o.rejectReason}", fontSize = 12.sp)
            if (o.status == R.CANCELLED) Text("Khách tự huỷ. Nếu đã nhận tiền thì ghi nhận hoặc hoàn lại cho khách.", fontSize = 12.sp)
            val actions = R.actions(o, now)
            if (actions.isNotEmpty()) Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                actions.forEachIndexed { i, a ->
                    val click = {
                        when (a.key) {
                            "reject" -> onReject()
                            "paid" -> confirmPaid = true
                            else -> vm.onlineAction(o, a.key)
                        }
                    }
                    if (i == 0) Button(onClick = { click() }, Modifier.weight(1f)) { Text(a.label, fontWeight = FontWeight.Black, fontSize = 13.sp) }
                    else OutlinedButton(onClick = { click() }, Modifier.weight(1f)) { Text(a.label, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                }
            }
            if (o.status == R.PAID || o.status == R.DELIVERING) OutlinedButton(onClick = { vm.printOnlineTicket(o) }, Modifier.fillMaxWidth().padding(top = 6.dp)) { Text("🖨 IN LẠI PHIẾU BẾP", fontWeight = FontWeight.Bold) }
        }
    }
    if (confirmPaid) AlertDialog(
        onDismissRequest = { confirmPaid = false },
        title = { Text("Đã nhận ${vnd(o.total)}?") },
        text = { Text("Kiểm tra tiền đã về tài khoản với nội dung DM${o.code}. Sau khi xác nhận sẽ in phiếu bếp.") },
        confirmButton = { Button(onClick = { confirmPaid = false; vm.onlineAction(o, "paid") }) { Text("ĐÃ NHẬN TIỀN") } },
        dismissButton = { TextButton(onClick = { confirmPaid = false }) { Text("CHƯA") } },
    )
}

/** Hồ sơ khách ngay trên thẻ đơn: số lần mua, tổng chi, món hay gọi, ghi chú sở thích; bấm để xem lịch sử các lần mua. */
@Composable
private fun CustomerPanel(vm: PosViewModel, o: OnlineOrder) {
    val context = LocalContext.current
    var profile by remember(o.phone, o.code) { mutableStateOf<CustomerProfile?>(null) }
    var failed by remember(o.phone, o.code) { mutableStateOf(false) }
    var open by remember(o.phone, o.code) { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    LaunchedEffect(o.phone, o.code, reload) {
        val r = OnlineOrderService.customerProfile(context.applicationContext as android.app.Application, o.phone, o.code, force = reload > 0)
        profile = r.getOrNull(); failed = r.isFailure
    }
    val p = profile
    val day = remember { SimpleDateFormat("dd/MM/yy HH:mm", Locale.getDefault()) }
    Column(Modifier.fillMaxWidth().padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        when {
            p != null -> {
                Text(p.headline() + (p.lastAt?.let { " · gần nhất ${SimpleDateFormat("dd/MM", Locale.getDefault()).format(Date(it))}" } ?: ""), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (p.isRepeat) Color(0xFF41633A) else Color(0xFF6E432D))
                if (p.favorites.isNotEmpty()) Text("Hay gọi: " + p.favorites.joinToString(", ") { "${it.first} (${it.second})" }, fontSize = 12.sp)
                if (p.note.note.isNotBlank()) Surface(color = Color(0xFFFFF3D6), shape = RoundedCornerShape(8.dp)) {
                    Text("⭐ Sở thích/ghi chú khách: ${p.note.note}", Modifier.padding(8.dp), fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color(0xFF7A4B00))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (p.history.isNotEmpty()) TextButton(onClick = { open = !open }, contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)) { Text(if (open) "ẨN LỊCH SỬ" else "XEM LỊCH SỬ (${p.orderCount})", fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                    TextButton(onClick = { editing = true }, contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)) { Text(if (p.note.note.isBlank()) "+ GHI CHÚ SỞ THÍCH" else "SỬA GHI CHÚ", fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                }
                if (open) p.history.forEach { h ->
                    Text("${day.format(Date(h.at))} · ${vnd(h.total)} · ${R.modeLabel(h.mode)}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Text(h.items.joinToString(", ") { "${it.qty}× ${it.name}" + if (it.note.isNotBlank()) " (${it.note})" else "" }, fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp))
                }
            }
            failed -> Text("Chưa đọc được lịch sử khách (kiểm tra mạng).", fontSize = 11.sp, color = Color(0xFF9A9188))
        }
    }
    if (editing) {
        var text by remember { mutableStateOf(p?.note?.note.orEmpty()) }
        AlertDialog(
            onDismissRequest = { editing = false },
            title = { Text("Ghi chú sở thích · ${o.name}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Hiện ngay trên mọi đơn sau của số ${o.phone}. Ví dụ: ít đá, không đường, thích bàn cạnh cửa sổ. Không ghi thông tin sức khoẻ hay dữ liệu nhạy cảm của khách (khách tự ghi dị ứng trong đơn của họ).", fontSize = 12.sp)
                    OutlinedTextField(text, { text = it.take(500) }, label = { Text("Ghi chú") }, minLines = 2, maxLines = 5)
                }
            },
            confirmButton = {
                Button(onClick = {
                    editing = false
                    val who = vm.currentEmployee.value?.name.orEmpty()
                    kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                        OnlineOrderService.saveCustomerNote(context.applicationContext as android.app.Application, o.phone, o.name, text, who)
                        reload++
                    }
                }) { Text("LƯU") }
            },
            dismissButton = { TextButton(onClick = { editing = false }) { Text("ĐÓNG") } },
        )
    }
}

@Composable
private fun ZaloSection() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var token by remember { mutableStateOf("") }
    var status by remember { mutableStateOf(if (vn.ecohome.pos0210.cloud.ZaloNotifier.ready(context)) "Zalo: đã kết nối, có đơn mới bot sẽ nhắn." else "Zalo: chưa kết nối.") }
    var busy by remember { mutableStateOf(false) }
    Text("Báo đơn qua Zalo", fontWeight = FontWeight.Bold, fontSize = 13.sp)
    Text(status, fontSize = 11.sp)
    OutlinedTextField(token, { token = it }, label = { Text("Dán token Zalo Bot") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { busy = true; scope.launch { status = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { vn.ecohome.pos0210.cloud.ZaloNotifier.connect(context, token) }; busy = false; token = "" } }, enabled = token.isNotBlank() && !busy) { Text("KẾT NỐI & GỬI THỬ", fontSize = 12.sp) }
        if (vn.ecohome.pos0210.cloud.ZaloNotifier.ready(context)) TextButton(onClick = { vn.ecohome.pos0210.cloud.ZaloNotifier.clear(context); status = "Zalo: đã ngắt." }) { Text("NGẮT", fontSize = 12.sp) }
    }
}
