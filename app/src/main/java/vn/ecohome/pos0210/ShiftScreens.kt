package vn.ecohome.pos0210

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import vn.ecohome.pos0210.data.ShiftEntity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

private fun hhmm(t: Long?): String =
    if (t == null) "--:--" else SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Ho_Chi_Minh") }.format(Date(t))

private fun vnd(v: Long?): String = if (v == null) "—" else String.format(Locale.US, "%,d", v).replace(',', '.') + "đ"

private fun statusLabel(s: String): String = when (s) {
    "open" -> "ĐANG MỞ"
    "closed" -> "CHỜ NHẬN TIỀN"
    "received" -> "ĐÃ NHẬN TIỀN"
    "pending_review" -> "CẦN XEM LẠI"
    else -> s
}

@Composable
fun StartShift(vm: PosViewModel) {
    val e by vm.currentEmployee.collectAsState()
    val active by vm.activeShift.collectAsState()
    LaunchedEffect(active) { if (active != null) vm.screen.value = "TABLES" }
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text("0210", fontSize = 40.sp, fontWeight = FontWeight.Black)
        Text("BẮT ĐẦU CA", fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text("Người vào ca: ${e?.name ?: ""}")
        Text("Giờ vào: ${hhmm(System.currentTimeMillis())}", fontSize = 13.sp)
        Text("Chưa vào ca thì chưa gửi order được.", fontSize = 12.sp)
        Button(onClick = { vm.startShift() }, modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) { Text("BẮT ĐẦU CA") }
        TextButton(onClick = { vm.logout() }) { Text("Đổi người") }
    }
}

@Composable
fun ShiftEnd(vm: PosViewModel) {
    val shift by vm.activeShift.collectAsState()
    val blockers by vm.shiftBlockers.collectAsState()
    val totals by vm.shiftTotals.collectAsState()
    val tables by vm.tables.collectAsState()
    val message by vm.shiftMessage.collectAsState()
    var countedText by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var receivePin by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { vm.shiftMessage.value = ""; vm.loadShiftCheckout() }
    val sh = shift
    Column(Modifier.fillMaxSize()) {
        Header("Ra ca & bàn giao tiền") { vm.screen.value = "TABLES" }
        if (sh == null) {
            Text("Không có ca đang mở.", Modifier.padding(16.dp))
            return@Column
        }
        val expected = totals?.first ?: 0L
        val counted = countedText.toLongOrNull()
        val diff = counted?.let { ShiftRules.diff(it, expected) }
        Column(Modifier.fillMaxSize().padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {
            Text("Ca của ${sh.staffName} · vào ${hhmm(sh.checkInClient)} · ra ${hhmm(System.currentTimeMillis())}", fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(10.dp))
            Text("Doanh thu ca (chỉ tính bill đã thanh toán)", fontWeight = FontWeight.Bold)
            Text("Tiền mặt phải bàn giao: ${vnd(expected)}", fontSize = 20.sp, fontWeight = FontWeight.Black)
            Text("Chuyển khoản: ${vnd(totals?.second ?: 0L)} · ${totals?.third ?: 0} bill")
            if (blockers.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Còn ${blockers.size} bàn chưa thanh toán (" + blockers.joinToString { s -> tables.firstOrNull { it.id == s.tableId }?.name ?: s.tableId } +
                        "): không tính vào ca này, tự chuyển sang ca sau.",
                    fontSize = 12.sp
                )
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = countedText, onValueChange = { countedText = it.filter(Char::isDigit).take(10) },
                label = { Text("Tiền mặt thực tế bàn giao (đ)") }, singleLine = true, modifier = Modifier.fillMaxWidth()
            )
            OutlinedButton(onClick = { countedText = expected.toString() }) { Text("Đúng bằng doanh thu tiền mặt") }
            if (diff != null) {
                if (diff == 0L) Text("✔ KHỚP doanh thu", fontWeight = FontWeight.Bold)
                else Text("✖ LỆCH ${vnd(diff)} so với doanh thu", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                if (diff != 0L) OutlinedTextField(
                    value = note, onValueChange = { note = it },
                    label = { Text(if (ShiftRules.noteRequired(diff)) "Ghi chú chênh lệch (bắt buộc)" else "Ghi chú chênh lệch") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
            OutlinedTextField(
                value = pin, onValueChange = { pin = it.filter(Char::isDigit).take(4) }, label = { Text("PIN xác nhận ra ca") },
                visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = receivePin, onValueChange = { receivePin = it.filter(Char::isDigit).take(4) },
                label = { Text("PIN quản lý nhận tiền (có thể để trống)") },
                visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth()
            )
            if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.error)
            Button(
                onClick = { vm.closeShift(pin, counted ?: 0L, note, receivePin) { } },
                enabled = counted != null && pin.length == 4 && ShiftRules.canConfirm(diff ?: 0L, note) && (receivePin.isEmpty() || receivePin.length == 4),
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
            ) { Text("XÁC NHẬN RA CA") }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
fun ShiftList(vm: PosViewModel) {
    val shifts by vm.shifts.collectAsState()
    val message by vm.shiftMessage.collectAsState()
    var receiving by remember { mutableStateOf<ShiftEntity?>(null) }
    var pin by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize()) {
        Header("Ca làm") { vm.screen.value = "MANAGE" }
        if (message.isNotBlank()) Text(message, Modifier.padding(horizontal = 16.dp))
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
            items(shifts, key = { it.id }) { s ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text("${s.date} · ${s.staffName}", fontWeight = FontWeight.Bold)
                        Text("${hhmm(s.checkInClient)} → ${hhmm(s.checkOutClient)} · ${statusLabel(s.status)}")
                        if (s.status != "open") {
                            Text("Tiền mặt: dự kiến ${vnd(s.cashExpected)} · đếm ${vnd(s.cashCounted)} · lệch ${vnd(s.diff)}")
                            Text("Chuyển khoản ${vnd(s.transferTotal)} · ${s.orderCount} order", fontSize = 12.sp)
                            if (s.diffNote.isNotBlank()) Text("Ghi chú: ${s.diffNote}", fontSize = 12.sp)
                        }
                        if (s.status == "closed") Button(onClick = { receiving = s; pin = "" }) { Text("ĐÃ NHẬN TIỀN") }
                    }
                }
            }
        }
    }
    receiving?.let { s ->
        AlertDialog(
            onDismissRequest = { receiving = null },
            title = { Text("Xác nhận đã nhận tiền") },
            text = {
                OutlinedTextField(
                    value = pin, onValueChange = { pin = it.filter(Char::isDigit).take(4) }, label = { Text("PIN quản lý") },
                    visualTransformation = PasswordVisualTransformation(), singleLine = true
                )
            },
            confirmButton = { TextButton(enabled = pin.length == 4, onClick = { vm.receiveShift(s.id, pin) { ok -> if (ok) receiving = null } }) { Text("XÁC NHẬN") } },
            dismissButton = { TextButton(onClick = { receiving = null }) { Text("Huỷ") } }
        )
    }
}
