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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    var voice by remember { mutableStateOf(OnlineOrderService.voiceOn(context)) }
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
            Text("Đọc to qua loa", fontSize = 13.sp)
            Switch(voice, { voice = it; OnlineOrderService.setVoice(context, it) }, Modifier.padding(start = 8.dp))
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
