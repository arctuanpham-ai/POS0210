package vn.ecohome.pos0210

import androidx.compose.animation.core.animateFloat
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
        val me by vm.currentEmployee.collectAsState()
        if (me?.role == "ADMIN" && sh.staffId != me?.id) {
            ShiftTakeover(vm, sh)
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
    val settings by vm.settings.collectAsState()
    val message by vm.shiftMessage.collectAsState()
    val today = remember { java.time.LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")) }
    var month by remember { mutableStateOf(java.time.YearMonth.from(today)) }
    var filter by remember { mutableStateOf("all") }
    var receiving by remember { mutableStateOf<ShiftEntity?>(null) }
    var reviewing by remember { mutableStateOf<ShiftEntity?>(null) }
    var editing by remember { mutableStateOf<ShiftEntity?>(null) }
    var pin by remember { mutableStateOf("") }
    val prefix = "%04d-%02d".format(month.year, month.monthValue)
    val monthShifts = shifts.filter { it.dataScope == "LIVE" && it.date.startsWith(prefix) }
    val visible = monthShifts.filter {
        when (filter) {
            "review" -> it.status == "pending_review"
            "diff" -> (it.diff ?: 0L) != 0L
            else -> true
        }
    }
    val closedDays = settings.filter { it.key.startsWith("day_closed_") && it.value.isNotBlank() }.map { it.key.removePrefix("day_closed_") }.toSet()
    val totals = monthShifts.groupBy { it.staffName }.mapValues { (_, l) -> l.sumOf { ShiftRules.shiftMinutes(it.checkInClient, it.checkOutClient) ?: 0L } }
    Column(Modifier.fillMaxSize()) {
        Header("Ca làm") { vm.screen.value = "HR" }
        if (message.isNotBlank()) Text(message, Modifier.padding(horizontal = 16.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            OutlinedButton(onClick = { month = month.minusMonths(1) }) { Text("‹") }
            Text("THÁNG %02d/%04d".format(month.monthValue, month.year), fontWeight = FontWeight.Black)
            OutlinedButton(onClick = { month = month.plusMonths(1) }) { Text("›") }
        }
        Row(Modifier.padding(horizontal = 12.dp).horizontalScroll(rememberScrollState())) {
            listOf("all" to "Tất cả", "review" to "Cần xem lại", "diff" to "Lệch tiền").forEach { (k, label) ->
                FilterChip(selected = filter == k, onClick = { filter = k }, label = { Text(label) }, modifier = Modifier.padding(end = 6.dp))
            }
            AssistChip(onClick = { vm.screen.value = "CLOSE_DAY" }, label = { Text("ĐÓNG NGÀY") })
        }
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
            if (totals.isNotEmpty()) item {
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text("Giờ công trong tháng (đã làm tròn ±15 phút)", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        totals.forEach { (n, m) -> Text("$n: ${ShiftRules.formatHours(m)}") }
                    }
                }
            }
            items(visible, key = { it.id }) { s ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text("${s.date} · ${s.staffName}${if (s.date in closedDays) " · ĐÃ ĐÓNG NGÀY" else ""}", fontWeight = FontWeight.Bold)
                        Text("${hhmm(s.checkInClient)} → ${hhmm(s.checkOutClient)} · ${ShiftRules.shiftMinutes(s.checkInClient, s.checkOutClient)?.let { ShiftRules.formatHours(it) } ?: "đang mở"} · ${statusLabel(s.status)}")
                        if (s.status != "open") {
                            Text("Tiền mặt: dự kiến ${vnd(s.cashExpected)} · đếm ${vnd(s.cashCounted)} · lệch ${vnd(s.diff)}")
                            Text("Chuyển khoản ${vnd(s.transferTotal)} · ${s.orderCount} bill", fontSize = 12.sp)
                            if (s.diffNote.isNotBlank()) Text("Ghi chú: ${s.diffNote}", fontSize = 12.sp)
                        }
                        if (s.checkOutSource != null && s.checkOutSource != "self") Text("Nguồn giờ ra: ${if (s.checkOutSource == "manager_takeover") "quản lý tiếp quản" else "tự đóng theo hoạt động cuối"}", fontSize = 12.sp)
                        if (s.editLog.isNotBlank()) {
                            Text("Lịch sử sửa:", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            s.editLog.lines().forEach { l ->
                                val p = l.split("|")
                                if (p.size >= 6) Text("• ${hhmm(p[0].toLongOrNull())} ${p[1]} sửa ${p[2]}: ${p[3].takeLast(5)} → ${p[4].takeLast(5)} (${p[5]})", fontSize = 11.sp)
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (s.status == "closed") Button(onClick = { receiving = s; pin = "" }) { Text("ĐÃ NHẬN TIỀN") }
                            if (s.status == "pending_review") Button(onClick = { reviewing = s }) { Text("NHẬP TIỀN & XÁC NHẬN") }
                            if (s.status != "open") OutlinedButton(onClick = { editing = s }) { Text("Sửa giờ ra") }
                        }
                    }
                }
            }
        }
    }
    editing?.let { s ->
        var outText by remember(s.id) { mutableStateOf(ShiftRules.formatLocalTime(s.checkOutClient)) }
        var reason by remember(s.id) { mutableStateOf("") }
        var epin by remember(s.id) { mutableStateOf("") }
        var err by remember(s.id) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text("Sửa giờ ra · ${s.staffName} ${s.date}") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    OutlinedTextField(outText, { outText = it }, label = { Text("Giờ ra (yyyy-MM-dd HH:mm)") }, singleLine = true)
                    OutlinedTextField(reason, { reason = it }, label = { Text("Lý do (bắt buộc)") })
                    OutlinedTextField(epin, { epin = it.filter(Char::isDigit).take(4) }, label = { Text("PIN ADMIN") }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
                    Text("Chỉ sửa giờ ra và giờ công; tiền mặt không tính lại.", fontSize = 11.sp)
                    if (err.isNotBlank()) Text(err, color = MaterialTheme.colorScheme.error)
                }
            },
            confirmButton = {
                TextButton(enabled = epin.length == 4, onClick = {
                    vm.editShiftCheckout(s.id, outText, reason, epin) { e -> if (e == null) editing = null else err = e }
                }) { Text("LƯU") }
            },
            dismissButton = { TextButton(onClick = { editing = null }) { Text("Huỷ") } }
        )
    }
    reviewing?.let { s ->
        var countedText by remember(s.id) { mutableStateOf("") }
        var note by remember(s.id) { mutableStateOf("") }
        var rpin by remember(s.id) { mutableStateOf("") }
        var err by remember(s.id) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { reviewing = null },
            title = { Text("Xem lại ca ${s.staffName} ${s.date}") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text("Tiền mặt theo hệ thống: ${vnd(s.cashExpected)}")
                    OutlinedTextField(countedText, { countedText = it.filter(Char::isDigit).take(10) }, label = { Text("Tiền mặt thực tế (để trống nếu không đếm được)") }, singleLine = true)
                    OutlinedTextField(note, { note = it }, label = { Text("Ghi chú") })
                    OutlinedTextField(rpin, { rpin = it.filter(Char::isDigit).take(4) }, label = { Text("PIN ADMIN") }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
                    if (err.isNotBlank()) Text(err, color = MaterialTheme.colorScheme.error)
                }
            },
            confirmButton = {
                TextButton(enabled = rpin.length == 4, onClick = {
                    vm.reviewShift(s.id, countedText.toLongOrNull(), note, rpin) { e -> if (e == null) reviewing = null else err = e }
                }) { Text("XÁC NHẬN") }
            },
            dismissButton = { TextButton(onClick = { reviewing = null }) { Text("Huỷ") } }
        )
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

/** Đóng ngày (ADMIN): tổng hợp các ca của ngày, chặn nếu còn bàn chưa thanh toán, chốt tiền mặt ca của mình. */
@Composable
fun CloseDay(vm: PosViewModel) {
    val shifts by vm.shifts.collectAsState()
    val settings by vm.settings.collectAsState()
    val sessions by vm.sessions.collectAsState()
    val active by vm.activeShift.collectAsState()
    val me by vm.currentEmployee.collectAsState()
    val closed = settings.filter { it.key.startsWith("day_closed_") && it.value.isNotBlank() }.map { it.key.removePrefix("day_closed_") }.toSet()
    val date = ShiftRules.earliestOpenDay(shifts.filter { it.dataScope == "LIVE" }.map { it.date }, closed)
    var countedText by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    val dayShifts = shifts.filter { it.date == date && it.dataScope == "LIVE" }.sortedBy { it.checkInClient }
    val unpaid = sessions.count { it.dataScope == "LIVE" && it.status == "OPEN" }
    var expectedOwn by remember { mutableStateOf(0L) }
    val own = active?.takeIf { it.staffId == me?.id }
    LaunchedEffect(own?.id) { if (own != null) vm.loadShiftCheckout() }
    val totals by vm.shiftTotals.collectAsState()
    expectedOwn = if (own != null) (totals?.first ?: 0L) else 0L
    Column(Modifier.fillMaxSize()) {
        Header("Đóng ngày") { vm.screen.value = "HR" }
        if (me?.role != "ADMIN") { Text("Chỉ ADMIN được đóng ngày.", Modifier.padding(16.dp)); return@Column }
        if (date == null) { Text("Không có ngày nào cần đóng.", Modifier.padding(16.dp)); return@Column }
        Column(Modifier.fillMaxSize().padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {
            Text("Ngày $date", fontSize = 20.sp, fontWeight = FontWeight.Black)
            dayShifts.forEach { s ->
                Text("• ${s.staffName} ${hhmm(s.checkInClient)}→${hhmm(s.checkOutClient)} · ${statusLabel(s.status)}" +
                    if (s.status != "open") " · tiền mặt ${vnd(s.cashCounted ?: s.cashExpected)} · CK ${vnd(s.transferTotal)}" else "", fontSize = 13.sp)
            }
            Spacer(Modifier.height(8.dp))
            if (unpaid > 0) Text("⛔ Còn $unpaid bàn chưa thanh toán · thanh toán hoặc huỷ trước khi đóng ngày.", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
            val review = dayShifts.count { it.status == "pending_review" }
            if (review > 0) Text("⛔ Còn $review ca cần xem lại · xác nhận trong Ca làm & nhận tiền.", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
            if (active != null && own == null) {
                Text("⛔ Còn ca của ${active?.staffName} đang mở · ra ca hoặc tiếp quản trước.", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                Button(onClick = { vm.screen.value = "SHIFT_END" }) { Text("RA CA CỦA ${active?.staffName?.uppercase()}") }
            }
            if (own != null) {
                Spacer(Modifier.height(8.dp))
                Text("Tiền mặt ca của bạn phải có: ${vnd(expectedOwn)}", fontWeight = FontWeight.Bold)
                OutlinedTextField(countedText, { countedText = it.filter(Char::isDigit).take(10) }, label = { Text("Tiền mặt thực tế (đ)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedButton(onClick = { countedText = expectedOwn.toString() }) { Text("Đúng bằng doanh thu tiền mặt") }
                val diff = countedText.toLongOrNull()?.let { ShiftRules.diff(it, expectedOwn) }
                if (diff != null) Text(if (diff == 0L) "✔ KHỚP" else "✖ LỆCH ${vnd(diff)}", fontWeight = FontWeight.Bold, color = if (diff == 0L) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.error)
            }
            OutlinedTextField(note, { note = it }, label = { Text("Ghi chú ngày") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(pin, { pin = it.filter(Char::isDigit).take(4) }, label = { Text("PIN ADMIN xác nhận") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
            if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
            Button(
                onClick = { vm.closeDay(date, countedText.toLongOrNull(), note, pin) { e -> if (e != null) error = e } },
                enabled = pin.length == 4 && unpaid == 0 && (own == null || countedText.isNotBlank()),
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
            ) { Text("ĐÓNG NGÀY $date") }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
fun DayCloseReminderDialog(vm: PosViewModel, date: String) {
    AlertDialog(
        onDismissRequest = { },
        title = { Text("Chưa đóng ngày $date", fontWeight = FontWeight.Black) },
        text = { Text("Đóng ngày để chốt tiền mặt và khoá sổ ngày làm việc.") },
        confirmButton = { Button(onClick = { vm.snoozeDayClose(); vm.screen.value = "CLOSE_DAY" }) { Text("ĐÓNG NGÀY") } },
        dismissButton = { OutlinedButton(onClick = { vm.snoozeDayClose() }) { Text("Nhắc sau") } }
    )
}

@Composable
fun HrHub(vm: PosViewModel) {
    Column(Modifier.fillMaxSize()) {
        Header("Nhân sự & Lương") { vm.screen.value = "MANAGE" }
        Column(Modifier.fillMaxSize().padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {
            Rowx("Nhân viên", "Thêm · khóa · phân quyền · ai phải chấm công") { vm.screen.value = "EMP" }
            Rowx("Ca làm & nhận tiền", "Danh sách ca · tiền bàn giao · xác nhận đã nhận") { vm.screen.value = "SHIFTS" }
            Rowx("Đóng ngày", "Chốt tiền mặt cuối ngày · tổng hợp các ca") { vm.screen.value = "CLOSE_DAY" }
            Rowx("Chấm công & Bảng lương", "Giờ vào/ra · tổng giờ · lương theo tháng") { vm.screen.value = "PAYROLL" }
            Rowx("Cài đặt ca & nhắc giờ", "Giờ nhân viên về · giờ đóng cửa · nhắc lại sau") { vm.screen.value = "SHIFT_SETTINGS" }
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
fun ShiftPayBlockBanner(staffName: String, action: String, onEndShift: () -> Unit) {
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
        Text("⛔ KHÔNG ĐƯỢC ${action.uppercase()}", color = androidx.compose.ui.graphics.Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(6.dp))
        Text("Máy đang trong ca của $staffName.", color = androidx.compose.ui.graphics.Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text("Chỉ tài khoản $staffName mới $action được.", color = androidx.compose.ui.graphics.Color.White, fontSize = 16.sp)
        Spacer(Modifier.height(10.dp))
        Button(
            onClick = onEndShift,
            colors = ButtonDefaults.buttonColors(containerColor = androidx.compose.ui.graphics.Color.White, contentColor = androidx.compose.ui.graphics.Color(0xFFB71C1C)),
            modifier = Modifier.fillMaxWidth()
        ) { Text("RA CA CỦA ${staffName.uppercase()} ĐỂ ${action.uppercase()}", fontWeight = FontWeight.Black) }
    }
}

/** ADMIN ra ca thay cho nhân viên đã về: chọn giờ ra (gợi ý = hoạt động cuối), tiền chỉ tính đến giờ đó. */
@Composable
fun ShiftTakeover(vm: PosViewModel, sh: ShiftEntity) {
    val totals by vm.shiftTotals.collectAsState()
    val blockers by vm.shiftBlockers.collectAsState()
    val message by vm.shiftMessage.collectAsState()
    var cutoffText by remember { mutableStateOf(ShiftRules.formatLocalTime(ShiftRules.defaultCutoff(sh.lastActivityAt, sh.checkInClient, System.currentTimeMillis()))) }
    var countedText by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    val cutoff = ShiftRules.parseLocalTime(cutoffText)
    LaunchedEffect(cutoff) { vm.loadShiftCheckout(cutoff ?: 0L) }
    val expected = totals?.first ?: 0L
    val counted = countedText.toLongOrNull()
    val diff = counted?.let { ShiftRules.diff(it, expected) }
    val cutoffError = ShiftRules.takeoverCutoffError(cutoff, sh.checkInClient, System.currentTimeMillis())
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {
        Text("Tiếp quản ca của ${sh.staffName}", fontSize = 20.sp, fontWeight = FontWeight.Black)
        Text("Vào ca ${hhmm(sh.checkInClient)} · hoạt động cuối ${hhmm(sh.lastActivityAt)}", fontSize = 12.sp)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            cutoffText, { cutoffText = it }, label = { Text("${sh.staffName} đã về lúc (yyyy-MM-dd HH:mm)") },
            singleLine = true, isError = cutoffError != null, modifier = Modifier.fillMaxWidth()
        )
        if (cutoffError != null) Text(cutoffError, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
        Text("Chỉ tính bill thanh toán đến giờ này. Bill sau giờ này và các bàn đang mở sẽ chuyển sang ca của bạn.", fontSize = 12.sp)
        Spacer(Modifier.height(8.dp))
        Text("Tiền mặt ${sh.staffName} phải bàn giao: ${vnd(expected)}", fontSize = 20.sp, fontWeight = FontWeight.Black)
        Text("Chuyển khoản: ${vnd(totals?.second ?: 0L)} · ${totals?.third ?: 0} bill")
        if (blockers.isNotEmpty()) Text("${blockers.size} bàn đang mở sẽ chuyển sang ca của bạn.", fontSize = 12.sp)
        OutlinedTextField(
            countedText, { countedText = it.filter(Char::isDigit).take(10) }, label = { Text("Tiền mặt thực nhận từ ${sh.staffName} (đ)") },
            singleLine = true, modifier = Modifier.fillMaxWidth()
        )
        OutlinedButton(onClick = { countedText = expected.toString() }) { Text("Đúng bằng doanh thu tiền mặt") }
        if (diff != null) {
            if (diff == 0L) Text("✔ KHỚP doanh thu", fontWeight = FontWeight.Bold)
            else Text("✖ LỆCH ${vnd(diff)} so với doanh thu", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
            if (diff != 0L) OutlinedTextField(
                note, { note = it }, modifier = Modifier.fillMaxWidth(),
                label = { Text(if (ShiftRules.noteRequired(diff)) "Ghi chú chênh lệch (bắt buộc)" else "Ghi chú chênh lệch") }
            )
        }
        OutlinedTextField(
            pin, { pin = it.filter(Char::isDigit).take(4) }, label = { Text("PIN của bạn (quản lý)") },
            visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth()
        )
        if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.error)
        Button(
            onClick = { vm.takeoverShift(cutoffText, counted ?: 0L, note, pin) { } },
            enabled = counted != null && cutoffError == null && pin.length == 4 && ShiftRules.canConfirm(diff ?: 0L, note),
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
        ) { Text("XÁC NHẬN TIẾP QUẢN CA") }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun ShiftSettings(vm: PosViewModel) {
    val settings by vm.settings.collectAsState()
    fun cur(key: String, def: String) = settings.firstOrNull { it.key == key }?.value?.ifBlank { null } ?: def
    var usualEnd by remember(settings) { mutableStateOf(cur("staff_usual_end", ShiftRules.DEFAULT_STAFF_USUAL_END)) }
    var closeTime by remember(settings) { mutableStateOf(cur("shift_close_time", ShiftRules.DEFAULT_CLOSE_TIME)) }
    var snooze by remember(settings) { mutableStateOf(cur("reminder_snooze_min", ShiftRules.DEFAULT_SNOOZE_MIN.toString())) }
    var saved by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize()) {
        Header("Cài đặt ca & nhắc giờ") { vm.screen.value = "HR" }
        Column(Modifier.padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {
            OutlinedTextField(usualEnd, { usualEnd = it }, label = { Text("Giờ nhân viên thường về (HH:mm)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Text("Đến giờ này app nhắc nhân viên ra ca.", fontSize = 12.sp)
            OutlinedTextField(closeTime, { closeTime = it }, label = { Text("Giờ đóng cửa (HH:mm)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Text("Qua giờ này mà ca nhân viên vẫn mở và không còn hoạt động thì app tự đóng ca.", fontSize = 12.sp)
            OutlinedTextField(snooze, { snooze = it.filter(Char::isDigit).take(3) }, label = { Text("Nhắc lại sau (phút)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            val ctx = androidx.compose.ui.platform.LocalContext.current
            var alerts by remember { mutableStateOf(vn.ecohome.pos0210.cloud.ShiftAlerts.enabled(ctx)) }
            val permission = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                Switch(checked = alerts, onCheckedChange = {
                    alerts = it
                    vn.ecohome.pos0210.cloud.ShiftAlerts.setEnabled(ctx, it)
                    if (it && android.os.Build.VERSION.SDK_INT >= 33) permission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                })
                Text(" Máy này nhận thông báo ca cần xem lại / lệch tiền")
            }
            Text("Chỉ bật trên máy của chủ. Thông báo chỉ tới khi app đang chạy và có mạng.", fontSize = 11.sp)
            if (saved.isNotBlank()) Text(saved, color = MaterialTheme.colorScheme.error)
            Button(
                onClick = {
                    if (ShiftRules.parseHm(usualEnd) == null || ShiftRules.parseHm(closeTime) == null || (snooze.toIntOrNull() ?: 0) < 1) {
                        saved = "Giờ phải dạng HH:mm và số phút ≥ 1"
                    } else {
                        vm.saveSetting("staff_usual_end", usualEnd.trim()); vm.saveSetting("shift_close_time", closeTime.trim()); vm.saveSetting("reminder_snooze_min", snooze)
                        saved = "Đã lưu"
                    }
                },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
            ) { Text("LƯU") }
        }
    }
}

@Composable
fun ShiftReminderDialog(vm: PosViewModel) {
    val shift by vm.activeShift.collectAsState()
    val name = shift?.staffName ?: ""
    AlertDialog(
        onDismissRequest = { },
        title = { Text("Sắp về? RA CA & BÀN GIAO TIỀN", fontWeight = FontWeight.Black) },
        text = { Text("Đã tới giờ $name thường về. Ra ca để chốt công và bàn giao tiền mặt.") },
        confirmButton = { Button(onClick = { vm.snoozeReminder(); vm.screen.value = "SHIFT_END" }) { Text("RA CA NGAY") } },
        dismissButton = { OutlinedButton(onClick = { vm.snoozeReminder() }) { Text("Chưa về · nhắc sau") } }
    )
}
