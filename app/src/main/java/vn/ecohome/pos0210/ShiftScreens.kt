package vn.ecohome.pos0210

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import vn.ecohome.pos0210.data.AttendanceSessionEntity
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
        Header("Ca làm") { vm.screen.value = "HR" }
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

@Composable
fun HrHub(vm: PosViewModel) {
    Column(Modifier.fillMaxSize()) {
        Header("Nhân sự & Lương") { vm.screen.value = "MANAGE" }
        Column(Modifier.fillMaxSize().padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {
            Rowx("Nhân viên", "Thêm · khóa · phân quyền · ai phải chấm công") { vm.screen.value = "EMP" }
            Rowx("Ca làm & nhận tiền", "Danh sách ca · tiền bàn giao · xác nhận đã nhận") { vm.screen.value = "SHIFTS" }
            Rowx("Chấm công & Bảng lương", "Giờ vào/ra · tổng giờ · lương theo tháng") { vm.screen.value = "PAYROLL" }
            Rowx("Sửa công thủ công", "Lịch tháng · thêm/sửa/bớt công khi máy lỗi · cần PIN nhân viên") { vm.screen.value = "ATT_EDIT" }
        }
    }
}

@Composable
fun AttendanceEdit(vm: PosViewModel) {
    val employees by vm.employees.collectAsState()
    var selected by remember { mutableStateOf<String?>(null) }
    val today = remember { java.time.LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")) }
    var month by remember { mutableStateOf(java.time.YearMonth.from(today)) }
    var openDay by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<AttendanceSessionEntity?>(null) }
    var addingDate by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize()) {
        Header("Sửa công thủ công") { vm.screen.value = "HR" }
        Text("Chọn nhân viên, chạm vào một ngày để thêm/sửa/bớt công. Mọi thay đổi cần PIN của chính nhân viên và lý do.", Modifier.padding(horizontal = 16.dp), fontSize = 12.sp)
        Row(Modifier.padding(horizontal = 12.dp, vertical = 6.dp).fillMaxWidth().horizontalScroll(rememberScrollState())) {
            employees.forEach { e ->
                FilterChip(selected = selected == e.id, onClick = { selected = e.id }, label = { Text(e.name) }, modifier = Modifier.padding(end = 6.dp))
            }
        }
        val id = selected
        if (id != null) {
            val history by remember(id) { vm.attendanceHistoryOf(id) }.collectAsState(initial = emptyList())
            val byDate = history.groupBy { ShiftRules.workDate(it.checkInAt) }
            val nowMs = System.currentTimeMillis()
            fun minutesOf(a: AttendanceSessionEntity) = (((a.checkOutAt ?: nowMs) - a.checkInAt) / 60_000L).coerceAtLeast(0)
            val monthPrefix = "%04d-%02d".format(month.year, month.monthValue)
            val monthMinutes = byDate.filterKeys { it.startsWith(monthPrefix) }.values.sumOf { list -> list.sumOf { minutesOf(it) } }
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                OutlinedButton(onClick = { month = month.minusMonths(1) }) { Text("‹") }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("THÁNG %02d/%04d".format(month.monthValue, month.year), fontWeight = FontWeight.Black)
                    Text("Tổng ${ShiftRules.formatHours(monthMinutes)} (chưa làm tròn)", fontSize = 12.sp)
                }
                OutlinedButton(onClick = { month = month.plusMonths(1) }) { Text("›") }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
                listOf("T2", "T3", "T4", "T5", "T6", "T7", "CN").forEach {
                    Text(it, Modifier.weight(1f), fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
            }
            val first = month.atDay(1)
            val offset = first.dayOfWeek.value - 1
            val cells: List<java.time.LocalDate?> = List(offset) { null } + (1..month.lengthOfMonth()).map { month.atDay(it) }
            Column(Modifier.padding(horizontal = 12.dp).verticalScroll(rememberScrollState())) {
                cells.chunked(7).forEach { week ->
                    Row(Modifier.fillMaxWidth()) {
                        for (i in 0 until 7) {
                            val d = week.getOrNull(i)
                            if (d == null) {
                                Spacer(Modifier.weight(1f).height(60.dp))
                            } else {
                                val key = d.toString()
                                val list = byDate[key].orEmpty()
                                val mins = list.sumOf { minutesOf(it) }
                                val hasOpen = list.any { it.checkOutAt == null }
                                val bg = if (list.isEmpty()) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.primaryContainer
                                Surface(
                                    onClick = { openDay = key },
                                    color = bg,
                                    shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
                                    border = if (d == today) androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                    modifier = Modifier.weight(1f).height(60.dp).padding(2.dp)
                                ) {
                                    Column(Modifier.padding(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("${d.dayOfMonth}", fontSize = 12.sp)
                                        if (list.isNotEmpty()) Text(if (hasOpen) "●" else ShiftRules.formatHours(mins), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
            openDay?.let { day ->
                val list = byDate[day].orEmpty().sortedBy { it.checkInAt }
                AlertDialog(
                    onDismissRequest = { openDay = null },
                    title = { Text("Ngày $day") },
                    text = {
                        Column(Modifier.verticalScroll(rememberScrollState())) {
                            if (list.isEmpty()) Text("Chưa có công ngày này.")
                            list.forEach { a ->
                                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text("${ShiftRules.formatLocalTime(a.checkInAt).substring(11)} → ${if (a.checkOutAt == null) "đang mở" else ShiftRules.formatLocalTime(a.checkOutAt).substring(11)} · ${ShiftRules.formatHours(minutesOf(a))}", fontWeight = FontWeight.Bold)
                                        if (a.note.isNotBlank()) Text(a.note, fontSize = 11.sp)
                                    }
                                    OutlinedButton(onClick = { editing = a; openDay = null }) { Text("Sửa / Bớt") }
                                }
                            }
                        }
                    },
                    confirmButton = { TextButton(onClick = { addingDate = day; openDay = null }) { Text("＋ THÊM CA") } },
                    dismissButton = { TextButton(onClick = { openDay = null }) { Text("Đóng") } }
                )
            }
        }
    }
    val empId = selected
    addingDate?.let { d -> if (empId != null) AttendanceEditDialog(vm, empId, null, "$d 06:00") { addingDate = null } }
    editing?.let { a -> AttendanceEditDialog(vm, a.employeeId, a, null) { editing = null } }
}

@Composable
private fun AttendanceEditDialog(vm: PosViewModel, employeeId: String, session: AttendanceSessionEntity?, presetIn: String?, onDismiss: () -> Unit) {
    var inText by remember { mutableStateOf(presetIn ?: ShiftRules.formatLocalTime(session?.checkInAt ?: System.currentTimeMillis())) }
    var outText by remember { mutableStateOf(ShiftRules.formatLocalTime(session?.checkOutAt)) }
    var reason by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (session == null) "Thêm ca công" else "Sửa / bớt ca công") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(inText, { inText = it }, label = { Text("Giờ vào (yyyy-MM-dd HH:mm)") }, singleLine = true)
                OutlinedTextField(outText, { outText = it }, label = { Text("Giờ ra (để trống = đang trong ca)") }, singleLine = true)
                OutlinedTextField(reason, { reason = it }, label = { Text("Lý do (bắt buộc)") })
                OutlinedTextField(pin, { pin = it.filter(Char::isDigit).take(4) }, label = { Text("PIN của nhân viên") }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
                if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
                if (session != null) {
                    TextButton(enabled = pin.length == 4 && reason.isNotBlank(), onClick = {
                        vm.deleteAttendance(session.id, employeeId, reason, pin) { err -> if (err == null) onDismiss() else error = err }
                    }) { Text("XOÁ HẲN CA CÔNG NÀY", color = MaterialTheme.colorScheme.error) }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = pin.length == 4, onClick = {
                vm.manualAttendance(session?.id, employeeId, inText, outText, reason, pin) { err -> if (err == null) onDismiss() else error = err }
            }) { Text("LƯU") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Huỷ") } }
    )
}

@Composable
fun LockScreen(vm: PosViewModel) {
    val e by vm.currentEmployee.collectAsState()
    val err by vm.authError.collectAsState()
    var pin by remember { mutableStateOf("") }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text("🔒 MÁY ĐÃ KHOÁ", fontSize = 26.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.height(8.dp))
            Text("Đang đăng nhập: ${e?.name ?: ""}", fontWeight = FontWeight.Bold)
            Text("Nhập PIN của bạn để tiếp tục. Nếu không phải ${e?.name ?: "người này"}, nhập PIN của chính bạn để đổi người (ca vẫn giữ nguyên).", fontSize = 12.sp)
            OutlinedTextField(
                value = pin,
                onValueChange = { v -> pin = v.filter(Char::isDigit).take(4); if (pin.length == 4) { vm.unlock(pin); pin = "" } },
                label = { Text("PIN 4 số") }, visualTransformation = PasswordVisualTransformation(), singleLine = true
            )
            if (err.isNotBlank()) Text(err, color = MaterialTheme.colorScheme.error)
        }
    }
}

/** Cảnh báo to, nhấp nháy: máy đang trong ca của người khác nên không thanh toán được. Muốn thanh toán phải ra ca của họ. */
@Composable
fun ShiftPayBlockBanner(staffName: String, onEndShift: () -> Unit) {
    val transition = androidx.compose.animation.core.rememberInfiniteTransition(label = "payBlock")
    val k by transition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = androidx.compose.animation.core.infiniteRepeatable(
            androidx.compose.animation.core.tween(550), androidx.compose.animation.core.RepeatMode.Reverse
        ), label = "blink"
    )
    val bg = androidx.compose.ui.graphics.lerp(androidx.compose.ui.graphics.Color(0xFFB71C1C), androidx.compose.ui.graphics.Color(0xFFFF5252), k)
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
            .background(bg, androidx.compose.foundation.shape.RoundedCornerShape(14.dp)).padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("⛔ KHÔNG ĐƯỢC THANH TOÁN", color = androidx.compose.ui.graphics.Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(6.dp))
        Text("Máy đang trong ca của $staffName.", color = androidx.compose.ui.graphics.Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text("Chỉ tài khoản $staffName mới thanh toán được.", color = androidx.compose.ui.graphics.Color.White, fontSize = 16.sp)
        Spacer(Modifier.height(10.dp))
        Button(
            onClick = onEndShift,
            colors = ButtonDefaults.buttonColors(containerColor = androidx.compose.ui.graphics.Color.White, contentColor = androidx.compose.ui.graphics.Color(0xFFB71C1C)),
            modifier = Modifier.fillMaxWidth()
        ) { Text("RA CA CỦA ${staffName.uppercase()} ĐỂ THANH TOÁN", fontWeight = FontWeight.Black) }
    }
}
