Warning: truncated output (original token count: 70226)
Total output lines: 4536

package vn.ecohome.pos0210
import vn.ecohome.pos0210.report.SalesReport
import vn.ecohome.pos0210.report.SalesItemsReport

import android.net.Uri
import android.Manifest
import android.os.Build
import android.provider.Settings
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import coil.compose.AsyncImage
import vn.ecohome.pos0210.data.*
import vn.ecohome.pos0210.printing.PrinterText
import vn.ecohome.pos0210.printing.BluetoothPrinter
import vn.ecohome.pos0210.payment.VietQrOffline
import vn.ecohome.pos0210.payment.PaymentQrMode
import vn.ecohome.pos0210.banknotification.NotificationAccess
import vn.ecohome.pos0210.banknotification.BankPaymentAnnouncer
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.time.ZoneId
import java.util.*

private val Cream = Color(0xFFF6F0E6)
private val Coffee = Color(0xFF6E432D)
private val Tint = Color(0xFFF1ECE3)
private val Occupied = Color(0xFFE7C4AA)
private val WaitingDelivery = Color(0xFFF2B777)
private val WaitingPriority1 = Color(0xFFE86A33)
private val WaitingPriority2 = Color(0xFFF3C15F)

private fun money(v: Long) = "%,dđ".format(v).replace(',', '.')
private fun time(v: Long) = SimpleDateFormat("dd/MM HH:mm", Locale.getDefault()).format(Date(v))

@Composable
private fun OfflineVietQrImage(
    bank: String,
    account: String,
    holder: String,
    amount: Long,
    info: String,
    modifier: Modifier
) {
    val result = remember(bank, account, holder, amount, info) {
        VietQrOffline.bitmap(bank, account, holder, amount, info)
    }
    result.fold(
        onSuccess = { bitmap -> Image(bitmap.asImageBitmap(), "Mã VietQR thanh toán offline", modifier) },
        onFailure = { error -> Text("KHÔNG TẠO ĐƯỢC VIETQR\n${error.message}", modifier, color = Color.Red, textAlign = TextAlign.Center, fontWeight = FontWeight.Bold) }
    )
}

@Composable
private fun PaymentQrImage(
    mode: String,
    bank: String,
    account: String,
    holder: String,
    amount: Long,
    info: String,
    modifier: Modifier
) {
    if (PaymentQrMode.usesStaticSoundboxQr(mode)) {
        Image(
            painter = painterResource(R.drawable.soundbox_qr_clean),
            contentDescription = "Mã QR tĩnh Techcombank Soundbox",
            modifier = modifier
        )
    } else {
        OfflineVietQrImage(bank, account, holder, amount, info, modifier)
    }
}

class MainActivity : ComponentActivity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Coffee, background = Cream)) {
                Surface(Modifier.fillMaxSize().safeDrawingPadding(), color = Cream) { App() }
            }
        }
    }
}

@Composable
fun App(vm: PosViewModel = viewModel()) {
    val sc by vm.screen.collectAsState()
    val t by vm.currentTable.collectAsState()
    val s by vm.currentSession.collectAsState()
    when (sc) {
        "LOGIN" -> Login(vm)
        "TABLES" -> Tables(vm)
        "ORDER" -> t?.let { Order(vm, it) }
        "SENT" -> if (t != null && s != null) Sent(vm, t!!, s!!)
        "PAY" -> if (t != null && s != null) Pay(vm, t!!, s!!)
        "REPORT" -> Report(vm)
        "MANAGE" -> Manage(vm)
        "MENU" -> MenuManager(vm)
        "COMBO" -> ComboManager(vm)
        "PRICING" -> PricingManager(vm)
        "BUY_GET" -> BuyGetManager(vm)
        "DELIVERY" -> DeliveryQueue(vm)
        "CUSTOMERS" -> Customers(vm)
        "LOYALTY_CONFIG" -> LoyaltyConfig(vm)
        "LOYALTY_CAMPAIGNS" -> LoyaltyCampaignManager(vm)
        "FINANCE_PEOPLE" -> FinancePeopleManager(vm)
        "EMP" -> Employees(vm)
        "PAYROLL" -> PayrollManager(vm)
        "PURCHASE" -> Purchases(vm)
        "VIETQR" -> VietQr(vm)
        "PRINTER" -> Printer(vm)
        "TABLE_ADMIN" -> TableManager(vm)
        "BACKUP" -> BackupCenter(vm)
        "HEALTH" -> DataHealth(vm)
        "SETTINGS" -> Settings(vm)
        "BANK_PAYMENT_SETTINGS" -> BankPaymentSettings(vm)
        "BANK_NOTIFICATION_TEST" -> BankNotificationTest(vm)
        "CLOUD" -> CloudSyncSettings(vm)
        "RESET_PREOPENING_SALES" -> ResetPreOpeningSales(vm)
        "TEST_MODE" -> TestModeManager(vm)
    }
}

@Composable
fun Header(title: String = "", back: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
        if (back == null) {
            Column {
                Text("0210", fontSize = 32.sp, fontWeight = FontWeight.Black)
                Text("BREAKFAST · COFFEE · DRINKS", fontSize = 9.sp)
            }
        } else {
            Text("‹", Modifier.clickable { back() }.padding(6.dp), fontSize = 36.sp)
        }
        Spacer(Modifier.weight(1f))
        Text(title, fontSize = 21.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun Login(vm: PosViewModel) {
    var pin by remember { mutableStateOf("") }
    val err by vm.authError.collectAsState()
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("0210", fontSize = 48.sp, fontWeight = FontWeight.Black)
        Text("PIN NHÂN VIÊN", fontWeight = FontWeight.Bold)
        OutlinedTextField(
            value = pin,
            onValueChange = { pin = it.filter(Char::isDigit).take(4) },
            label = { Text("PIN 4 số") },
            visualTransformation = PasswordVisualTransformation()
        )
        if (err.isNotBlank()) Text(err, color = MaterialTheme.colorScheme.error)
        Button(
            onClick = { vm.login(pin) },
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            enabled = pin.length == 4
        ) { Text("ĐĂNG NHẬP") }
    }
}

@Composable
fun Operator(vm: PosViewModel) {
    val e by vm.currentEmployee.collectAsState()
    val attendance by vm.myAttendance.collectAsState()
    Row(Modifier.fillMaxWidth().padding(horizontal=12.dp),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){
        AssistChip(onClick = { vm.logout() }, label = { Text("🔒 ${e?.name} · Đổi người") })
        if(attendance==null){
            AssistChip(onClick={vm.checkIn()},label={Text("CHECK-IN")})
        }else{
            AssistChip(onClick={vm.checkOut()},label={Text("CHECK-OUT · ĐANG TRONG CA")})
        }
    }
}

@Composable
fun Tables(vm: PosViewModel) {
    val ts by vm.tables.collectAsState()
    val ss by vm.sessions.collectAsState()
    val waiting by vm.waitingBatches.collectAsState()
    val serviceTimings by vm.tableServiceTimings.collectAsState()
    val areas by vm.areas.collectAsState()
    var timerNow by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            val now = System.currentTimeMillis()
            kotlinx.coroutines.delay((60_000L - now % 60_000L).coerceAtLeast(1_000L))
            timerNow = System.currentTimeMillis()
        }
    }
    val current by vm.currentEmployee.collectAsState()
    val testMode by vm.businessTestMode.collectAsState()
    var assignmentTarget by remember { mutableStateOf("KITCHEN") }
    val canReport = current?.role == "ADMIN" || current?.canViewReport == true
    val waitingOrdered = waiting.sortedWith(compareBy<OrderBatchEntity> { it.serviceNo }.thenBy { it.createdAt })
    val waitingRankById = waitingOrdered.mapIndexed { index, batch -> batch.id to index }.toMap()

    Column {
        Header()
        Operator(vm)
        if(testMode) Surface(Modifier.fillMaxWidth(),color=Color(0xFFFFD8D8)){Text("TEST MODE · KHÔNG TÍNH DOANH THU",Modifier.fillMaxWidth().padding(8.dp),textAlign=TextAlign.Center,fontWeight=FontWeight.Black,color=Color.Red)}
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            FilterChip(true, {}, { Text("BÁN HÀNG") })
            if (canReport) {
                FilterChip(false, { vm.screen.value = "REPORT" }, { Text("LỊCH SỬ") })
                FilterChip(false, { vm.screen.value = "REPORT" }, { Text("BÁO CÁO") })
            }
        }

        val tableCards = ts.map { tb ->
                    val open = ss.firstOrNull { it.tableId == tb.id }
                    val areaName = areas.firstOrNull { it.id == tb.areaId }?.name ?: tb.areaId
                    val waitingForTable = open?.let { s -> waiting.filter { it.sessionId == s.id } } ?: emptyList()
                    val nextService = waitingForTable.minWithOrNull(compareBy<OrderBatchEntity> { it.serviceNo }.thenBy { it.createdAt })
                    val priorityRank = nextService?.let { waitingRankById[it.id] }
                    val serviceTimer = open?.let { session ->
                        serviceTimings.firstOrNull { it.sessionId == session.id }?.let { timing ->
                            serviceTimerPresentation(timing.firstOrderAt, timing.lastOrderSentAt, timing.sentBatchCount, timing.waitingBatchCount, timerNow)
                        }
                    }
                    TableCardUi(tb.id,tb.name,areaName,open!=null,nextService?.serviceNo,priorityRank,serviceTimer)
        }
        ResponsiveTableGrid(tableCards,Modifier.weight(1f).fillMaxWidth().padding(horizontal=12.dp,vertical=8.dp)){id->ts.firstOrNull{it.id==id}?.let(vm::selectTable)}

        if (waiting.isNotEmpty()) {
            Button(
                onClick = { vm.screen.value = "DELIVERY" },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)
            ) { Text("CHỜ GIAO · ${waiting.size} ĐƠN") }
        }
        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button({ vm.screen.value = "MANAGE" }, Modifier.weight(1f)) { Text("QUẢN LÝ") }
            if (canReport) {
                Button({ vm.screen.value = "REPORT" }, Modifier.weight(1f)) { Text("BÁO CÁO") }
            }
        }
    }
}

@Composable
fun Order(vm: PosViewModel, t: DiningTableEntity) {
    val ms by vm.menu.collectAsState()
    val combos by vm.combos.collectAsState()
    val cats by vm.categories.collectAsState()
    val cart by vm.cart.collectAsState()
    val cartNotes by vm.cartNotes.collectAsState()
    val selectedVoucher by vm.selectedVoucher.collectAsState()
    val voucherMessage by vm.voucherMessage.collectAsState()
    var voucherDialog by remember { mutableStateOf(false) }
    var showCart by remember { mutableStateOf(false) }
    var noteTarget by remember { mutableStateOf<Pair<String,String>?>(null) }
    val orderMessage by vm.orderMessage.collectAsState()
    var selectedCat by remember(cats) { mutableStateOf(cats.firstOrNull()?.id ?: "") }
    val visible = ms.filter { it.active && (selectedCat.isBlank() || it.categoryId == selectedCat) }
    val activeCombos = combos.filter { it.active }
    val itemCount = cart.values.sum()
    val total = cart.entries.sumOf { (id, q) ->
        if (id.startsWith("combo:")) {
            val comboId = id.removePrefix("combo:")
            (combos.firstOrNull { it.id == comboId }?.price ?: 0L) * q
        } else {
            (ms.firstOrNull { it.id == id }?.price ?: 0L) * q
        }
    }

    Column {
        Header(t.name) { vm.screen.value = "TABLES" }
        if(orderMessage.isNotBlank()) {
            Text(orderMessage,Modifier.padding(horizontal=14.dp,vertical=4.dp),fontWeight=FontWeight.Bold)
            TextButton(onClick={vm.cart.value=emptyMap();vm.cartNotes.value=emptyMap();vm.orderMessage.value=""}){Text("XÓA GIỎ ĐỂ CHỌN LẠI")}
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 4.dp).horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            cats.forEach { cat ->
                FilterChip(selectedCat == cat.id, { selectedCat = cat.id }, { Text(cat.name, fontSize = 11.sp) })
            }
            FilterChip(selectedCat == "__COMBO__", { selectedCat = "__COMBO__" }, { Text("COMBO", fontSize = 11.sp) })
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            modifier = Modifier.weight(1f).padding(horizontal = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            if (selectedCat == "__COMBO__") {
                gridItems(activeCombos, key = { "combo:" + it.id }) { combo ->
                    val key = "combo:" + combo.id
                    val q = cart[key] ?: 0
                    val note = cartNotes[key].orEmpty()
                    val parts by vm.comboItems(combo.id).collectAsState(initial = emptyList())
                    Card(
                        Modifier.fillMaxWidth().clickable { vm.addCombo(combo) },
                        colors = CardDefaults.cardColors(containerColor = if(note.isNotBlank()) Color(0xFFFFF0D8) else Color(0xFFFBF8F2))
                    ) {
                        Column {
                            ComboArtwork(combo, parts, ms, Modifier.fillMaxWidth().height(92.dp))
                            Column(Modifier.padding(8.dp)) {
                                Text(combo.name, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Text(money(combo.price), fontSize = 12.sp)
                                if (q > 0) {
                                    Row(Modifier.fillMaxWidth().padding(top = 5.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                        Text("−", Modifier.clickable { vm.subCombo(combo) }.padding(5.dp), fontWeight = FontWeight.Bold)
                                        Text(q.toString(), fontWeight = FontWeight.Black)
                                        Text("+", Modifier.clickable { vm.addCombo(combo) }.padding(5.dp), fontWeight = FontWeight.Bold)
                                    }
                                    Text(
                                        if(note.isBlank()) "+ Ghi chú" else "📝 " + note.take(24),
                                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp).clickable { noteTarget = key to combo.name },
                                        fontSize = 10.sp,
                                        fontWeight = if(note.isBlank()) FontWeight.Normal else FontWeight.Bold,
                                        color = Coffee
                                    )
                                }
                            }
                        }
                    }
                }
            } else {
                gridItems(visible, key = { it.id }) { m ->
                    val q = cart[m.id] ?: 0
                    val note = cartNotes[m.id].orEmpty()
                    Card(
                        Modifier.fillMaxWidth().clickable { vm.add(m) },
                        colors = CardDefaults.cardColors(containerColor = if(note.isNotBlank()) Color(0xFFFFF0D8) else Color(0xFFFBF8F2))
                    ) {
                        Column {
                            if (!m.imageUri.isNullOrBlank()) {
                                AsyncImage(model = m.imageUri, contentDescription = m.name, modifier = Modifier.fillMaxWidth().height(92.dp))
                            } else {
                                Box(Modifier.fillMaxWidth().height(70.dp), contentAlignment = Alignment.Center) { Text("0210", fontWeight = FontWeight.Black) }
                            }
                            Column(Modifier.padding(8.dp)) {
                                Text(m.name, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Text(money(m.price), fontSize = 12.sp)
                                if (q > 0) {
                                    Row(Modifier.fillMaxWidth().padding(top = 5.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                        Text("−", Modifier.clickable { vm.sub(m) }.padding(5.dp), fontWeight = FontWeight.Bold)
                                        Text(q.toString(), fontWeight = FontWeight.Black)
                                        Text("+", Modifier.clickable { vm.add(m) }.padding(5.dp), fontWeight = FontWeight.Bold)
                                    }
                                    Text(
                                        if(note.isBlank()) "+ Ghi chú" else "📝 " + note.take(24),
                                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp).clickable { noteTarget = m.id to m.name },
                                        fontSize = 10.sp,
                                        fontWeight = if(note.isBlank()) FontWeight.Normal else FontWeight.Bold,
                                        color = Coffee
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("$itemCount món", fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Text(money(total), fontWeight = FontWeight.Black)
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { }, modifier = Modifier.weight(1f), enabled=false) { Text("VOUCHER TẠM KHÓA") }
            OutlinedButton(onClick = { showCart = true }, modifier = Modifier.weight(1f)) { Text("GIỎ HÀNG") }
            Button(onClick = { vm.sendBatch() }, modifier = Modifier.weight(1f), enabled = cart.isNotEmpty()||selectedVoucher!=null) { Text("GỬI BẾP") }
        }
    }
    if (showCart) OrderCartNotesDialog(vm) { showCart = false }
    if(voucherDialog){
        val verifiedVoucher by vm.verifiedVoucher.collectAsState()
        val verifiedCap = verifiedVoucher?.let { VoucherPolicy.cap(it.rewardSnapshot) }
        var voucherCode by remember { mutableStateOf("") }
        AlertDialog(onDismissRequest={voucherDialog=false},title={Text("Đổi voucher 0210")},text={Column(Modifier.verticalScroll(rememberScrollState())){
            Text("Voucher được phát hành sau khi thanh toán bill LIVE đủ điều kiện tích lũy và có số điện thoại khách. Mã nằm trên phiếu in từ máy in bill.",fontSize=12.sp)
            Text("Bước 1 · Nhập mã và kiểm tra hạn mức. Bước 2 · Chọn 01 món không vượt hạn mức.",fontSize=12.sp)
            OutlinedTextField(voucherCode,{voucherCode=it.uppercase().take(20);vm.resetVoucherLookup()},Modifier.fillMaxWidth(),label={Text("Mã trên phiếu · 0210-A1B2C3")},singleLine=true)
            TextButton(onClick={vm.lookupVoucher(voucherCode)},enabled=voucherCode.trim().length>=6){Text("KIỂM TRA MÃ VOUCHER")}
            if(voucherMessage.isNotBlank())Text(voucherMessage,fontSize=12.sp,color=Coffee)
            if(verifiedCap!=null){
                Text("CHỌN MÓN ĐỔI QUÀ · TỐI ĐA "+money(verifiedCap),fontWeight=FontWeight.Bold,fontSize=12.sp)
                ms.filter{it.active && it.price in 1..verifiedCap}.forEach{item->TextButton({vm.selectVoucher(voucherCode,item.id);voucherDialog=false},Modifier.fillMaxWidth()){Text(item.name+" · "+money(item.price),Modifier.fillMaxWidth())}}
                if(ms.none{it.active && it.price in 1..verifiedCap})Text("Không có món phù hợp hạn mức",fontSize=12.sp)
            }
        }},confirmButton={TextButton({voucherDialog=false}){Text("ĐÓNG")}})
    }
    if(voucherMessage.isNotBlank())Text(voucherMessage,Modifier.padding(horizontal=14.dp,vertical=2.dp),fontSize=11.sp,fontWeight=FontWeight.Bold,color=Coffee)
    noteTarget?.let { (key,name) ->
        var noteText by remember(key) { mutableStateOf(cartNotes[key].orEmpty()) }
        AlertDialog(
            onDismissRequest = { noteTarget = null },
            title = { Text("Ghi chú · $name") },
            text = {
                Column {
                    OutlinedTextField(
                        value = noteText,
                        onValueChange = { noteText = it.take(120) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Ví dụ: không hành, ít đá...") },
                        minLines = 2
                    )
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("Không hành","Ít đá","Không đá","Ít ngọt","Không cay").forEach { quick ->
                            AssistChip(onClick = { noteText = quick }, label = { Text(quick, fontSize = 10.sp) })
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = { vm.setCartNote(key,noteText); noteTarget = null }) { Text("LƯU GHI CHÚ") }
            },
            dismissButton = {
                if(cartNotes[key].orEmpty().isNotBlank()) {
                    TextButton(onClick = { vm.setCartNote(key,""); noteTarget = null }) { Text("XÓA GHI CHÚ") }
                }
            }
        )
    }
}

@Composable
fun Sent(vm: PosViewModel, t: DiningTableEntity, s: TableSessionEntity) {
    val bs by vm.batches(s.id).collectAsState(initial = emptyList())
    val total by vm.total(s.id).collectAsState(initial = 0)
    val current by vm.currentEmployee.collectAsState()
    val printerMessage by vm.printerMessage.collectAsState()
    val printerMode = vm.setting("printer_mode").ifBlank { "TEST" }
    var pv by remember { mutableStateOf<OrderBatchEntity?>(null) }
    var deleteDraftTarget by remember { mutableStateOf<OrderBatchEntity?>(null) }
    var cancelTarget by remember { mutableStateOf<OrderBatchEntity?>(null) }
    var cancelReason by remember { mutableStateOf("") }
    var adjustmentTarget by remember { mutableStateOf<Pair<OrderBatchEntity,OrderItemEntity>?>(null) }
    var adjustmentQty by remember { mutableStateOf("1") }
    var adjustmentReason by remember { mutableStateOf("") }

    Column {
        Header(t.name) { vm.screen.value = "TABLES" }
        LazyColumn(Modifier.weight(1f)) {
            items(bs) { b ->
                Card(
                    Modifier.fillMaxWidth().padding(8.dp).clickable { pv = b },
                    colors = CardDefaults.cardColors(
                        containerColor = if (b.status == "CANCELLED") Color(0xFFF1DDDA) else Tint
                    )
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Text("Đơn #${b.sequence}", fontWeight = FontWeight.Bold)
                        Text(
                            when (b.status) {
                                "CANCELLED" -> "ĐÃ HỦY"
                                "WAITING" -> "CHỜ GIAO · #${b.serviceNo.toString().padStart(3,'0')}"
                                "DELIVERED" -> "ĐÃ GIAO ĐỦ · #${b.serviceNo.toString().padStart(3,'0')}"
                                else -> b.status
                            }
                        )
                    }
                }
            }
        }
        Text("Tạm tính ${money(total)}", Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        if (printerMessage.isNotBlank()) {
            Text(printerMessage, Modifier.padding(horizontal = 16.dp, vertical = 4.dp), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        val allCancelled = bs.isNotEmpty() && bs.all { it.status == "CANCELLED" }
        val canRelease = allCancelled && total == 0L && (current?.role == "ADMIN" || current?.role == "MANAGER")

        if (canRelease) {
            Button(
                onClick = { vm.releaseCancelledTable() },
                modifier = Modifier.fillMaxWidth().padding(16.dp)
            ) { Text("TRẢ BÀN") }
        } else {
            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { vm.addMore() }, modifier = Modifier.weight(1f)) {
                    Text("＋ GỌI THÊM")
                }
                Button(onClick = { vm.screen.value = "PAY" }, modifier = Modifier.weight(1f), enabled = total > 0) {
                    Text("THANH TOÁN")
                }
            }
        }
    }

    pv?.let { b ->
        val its by vm.items(b.id).collectAsState(initial = emptyList())
        AlertDialog(
            onDismissRequest = { pv = null },
            confirmButton = {
                if (b.status == "DRAFT") {
                    Button(onClick = { vm.markBatchSent(b); pv = null }) {
                        Text(if (printerMode == "BLUETOOTH") "IN & GỬI BẾP" else "XÁC NHẬN GỬI (TEST)")
                    }
                } else {
                    Button(onClick = { pv = null }) { Text("ĐÓNG") }
                }
            },
            dismissButton = {},
            title = { Text("Đơn #${b.sequence} · ${b.status}") },
            text = {
                Column {
                    Text("0210 · ${t.name}")
                    Text("STT phục vụ: #${b.serviceNo.toString().padStart(3,'0')}", fontWeight = FontWeight.Black)
                    its.forEach { item ->
                        Text("${item.qty} × ${item.itemNameSnapshot}")
                        if(item.note.isNotBlank()) Text("↳ ${item.note}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        if(b.status=="DELIVERED"&&item.qty>0&&item.adjustmentOfItemId==null&&(current?.role=="ADMIN"||current?.role=="MANAGER"||current?.role=="STAFF")){
                            val correctedQty by vm.correctedQty(item.id).collectAsState(initial=0)
                            val remaining=item.qty+correctedQty
                            if(remaining>0) OutlinedButton(
                                onClick={ adjustmentTarget=b to item;adjustmentQty="1";adjustmentReason="" },
                                modifier=Modifier.fillMaxWidth().padding(top=6.dp)
                            ){Text("GIẢM / HỦY MÓN CÒN $remaining")}
                        }
                    }
                    if (b.status == "WAITING") {
                        Button(
                            onClick = { vm.markDelivered(b); pv = null },
                            modifier = Modifier.fillMaxWidth().padding(top = 12.dp)
                        ) { Text("✓ ĐÃ GIAO ĐỦ") }
                    }
                    if (b.status == "DRAFT" && vm.canDeleteDraft(b)) {
                        Spacer(Modifier.height(14.dp))
                        OutlinedButton(
                            onClick = { deleteDraftTarget = b; pv = null },
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("XÓA ĐƠN NHÁP") }
                    }
                    if ((b.status == "WAITING" || b.status == "DELIVERED") && (current?.role == "ADMIN" || current?.role == "MANAGER" || current?.role == "STAFF")) {
                        Spacer(Modifier.height(14.dp))
                        OutlinedButton(
                            onClick = { cancelTarget = b; cancelReason = ""; pv = null },
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("HỦY ĐƠN · TRƯỚC THANH TOÁN") }
                    }
                }
            }
        )
    }

    deleteDraftTarget?.let { b ->
        AlertDialog(
            onDismissRequest = { deleteDraftTarget = null },
            title = { Text("Xóa Đơn Nháp #${b.sequence}") },
            text = { Text("Đơn này chưa gửi bếp. Xóa sẽ không in phiếu và vẫn lưu lịch sử thao tác.") },
            confirmButton = {
                Button(onClick = { vm.deleteDraft(b); deleteDraftTarget = null }) { Text("XÓA ĐƠN NHÁP") }
            },
            dismissButton = { TextButton(onClick = { deleteDraftTarget = null }) { Text("GIỮ LẠI") } }
        )
    }

    cancelTarget?.let { b ->
        AlertDialog(
            onDismissRequest = { cancelTarget = null },
            title = { Text("Hủy Đơn #${b.sequence}") },
            text = {
                Column {
                    Text("Chỉ hủy khi bàn chưa thanh toán. Toàn bộ đơn sẽ bị hủy; lịch sử và lý do được lưu lại. Muốn đổi một món, hãy kiểm tra kỹ trước khi xác nhận.")
                    OutlinedTextField(
                        cancelReason,
                        { cancelReason = it },
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                        label = { Text("Lý do hủy bắt buộc") }
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        vm.cancelBatch(b, cancelReason)
                        cancelTarget = null
                        cancelReason = ""
                    },
                    enabled = cancelReason.isNotBlank()
                ) { Text("XÁC NHẬN HỦY") }
            },
            dismissButton = { TextButton(onClick = { cancelTarget = null }) { Text("KHÔNG HỦY") } }
        )
    }

    adjustmentTarget?.let { (batch,item) ->
        val correctedQty by vm.correctedQty(item.id).collectAsState(initial=0)
        val remaining=item.qty+correctedQty
        val quantity=adjustmentQty.toIntOrNull()?:0
        AlertDialog(
            onDismissRequest={adjustmentTarget=null},
            title={Text("Giảm / hủy ${item.itemNameSnapshot}")},
            text={Column{
                Text("Đã gọi: ${item.qty} · còn có thể giảm/hủy: $remaining")
                Text("Hệ thống tạo một dòng điều chỉnh riêng; món gốc và lịch sử giao không bị sửa.",fontSize=12.sp,modifier=Modifier.padding(top=6.dp))
                OutlinedTextField(adjustmentQty,{adjustmentQty=it.filter(Char::isDigit).take(2)},modifier=Modifier.fillMaxWidth().padding(top=10.dp),label={Text("Số lượng giảm/hủy")})
                OutlinedTextField(adjustmentReason,{adjustmentReason=it.take(120)},modifier=Modifier.fillMaxWidth().padding(top=8.dp),label={Text("Lý do bắt buộc")},minLines=2)
            }},
            confirmButton={Button(onClick={vm.correctDeliveredItem(batch,item,quantity,adjustmentReason);adjustmentTarget=null},enabled=quantity in 1..remaining&&adjustmentReason.isNotBlank()){Text("XÁC NHẬN ĐIỀU CHỈNH")}},
            dismissButton={TextButton(onClick={adjustmentTarget=null}){Text("KHÔNG ĐỔI")}}
        )
    }
}

private fun pricingRuleInTime(rule: PricingRuleEntity, now: Long): Boolean {
    if (!rule.active) return false
    if (rule.startAt != null && now < rule.startAt) return false
    if (rule.endAt != null && now > rule.endAt) return false
    val cal = Calendar.getInstance().apply { timeInMillis = now }
    val minute = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    val start = rule.startMinute
    val end = rule.endMinute
    if (start != null && end != null) {
        val ok = if (start <= end) minute in start..end else minute >= start || minute <= end
        if (!ok) return false
    }
    return true
}

private fun settingValue(settings: List<AppSettingEntity>, key: String, fallback: String): String =
    settings.firstOrNull { it.key == key }?.value?.ifBlank { fallback } ?: fallback

private fun effectiveCustomerTier(customer: CustomerEntity?, settings: List<AppSettingEntity>, newMember: Boolean = false): String? {
    if (customer == null) return if (newMember) "MEMBER" else null
    if (customer.tierManual) return customer.tier
    val auto = settingValue(settings, "loyalty_auto_tier", "true").toBoolean()
    if (!auto) return customer.tier
    val vip = settingValue(settings, "vip_min_points", "200").toIntOrNull() ?: 200
    val vvip = settingValue(settings, "vvip_min_points", "500").toIntOrNull() ?: 500
    return when {
        customer.points >= vvip -> "VVIP"
        customer.points >= vip -> "VIP"
        else -> "MEMBER"
    }
}

private fun tierDiscountRule(tier: String?, settings: List<AppSettingEntity>): PricingRuleEntity? {
    if (tier == null) return null
    val key = when (tier) {
        "VVIP" -> "vvip_discount_percent"
        "VIP" -> "vip_discount_percent"
        else -> "member_discount_percent"
    }
    val pct = settingValue(settings, key, "0").toIntOrNull()?.coerceIn(0,100) ?: 0
    if (pct <= 0) return null
    return PricingRuleEntity(
        id = "LOYALTY_$tier",
        name = "ƯU ĐÃI HẠNG $tier",
        kind = "DISCOUNT",
        percent = pct,
        autoApply = true,
        active = true
    )
}

private fun calculatePricing(subtotal: Long, rules: List<PricingRuleEntity>, enteredCode: String, now: Long = System.currentTimeMillis(), buyGetDiscount: Long = 0L, buyGetLabel: String? = null): PricingPreview {
    val code = enteredCode.trim().uppercase()
    val eligible = rules.filter { pricingRuleInTime(it, now) }
    val codeMatches = if (code.isBlank()) emptyList() else eligible.filter { it.code.isNotBlank() && it.code.equals(code, true) }
    val surchargeRules = eligible.filter { it.kind == "SURCHARGE" && (it.autoApply || it in codeMatches) }
    val surcharge = surchargeRules.sumOf { subtotal * it.percent / 100L }
    val afterSurcharge = subtotal + surcharge
    val discountCandidates = eligible.filter { it.kind == "DISCOUNT" && (it.autoApply || it in codeMatches) }
    val bestDiscount = discountCandidates.maxByOrNull { afterSurcharge * it.percent / 100L }
    val ruleDiscount = bestDiscount?.let { afterSurcharge * it.percent / 100L } ?: 0L
    val safeBuyGetDiscount = buyGetDiscount.coerceIn(0L, afterSurcharge)
    // Compare competing discounts; never silently replace a better percentage offer.
    // Voucher selection is explicit and is handled separately by its caller.
    val useBuyGet = safeBuyGetDiscount > 0L && safeBuyGetDiscount >= ruleDiscount
    val discount = if (useBuyGet) safeBuyGetDiscount else ruleDiscount
    val appliedRule = if (useBuyGet) null else bestDiscount
    val total = (afterSurcharge - discount).coerceAtLeast(0L)
    val message = when {
        useBuyGet -> "Đã áp dụng ưu đãi ${buyGetLabel ?: "Mua X tặng Y"}."
        code.isNotBlank() && codeMatches.isEmpty() -> "Mã không hợp lệ hoặc đã hết thời gian áp dụng."
        code.isNotBlank() && appliedRule != null && appliedRule !in codeMatches -> "Mã hợp lệ nhưng hệ thống đang áp dụng ưu đãi lớn hơn: ${appliedRule.name}."
        code.isNotBlank() && appliedRule != null -> "Đã áp dụng ưu đãi tốt nhất: ${appliedRule.name}."
        else -> ""
    }
    return PricingPreview(subtotal, surcharge, discount, total, surchargeRules, appliedRule, message, if (useBuyGet) safeBuyGetDiscount else 0L, if (useBuyGet) buyGetLabel else null)
}

@Composable
fun Pay(vm: PosViewModel, t: DiningTableEntity, s: TableSessionEntity) {
    val subtotal by vm.total(s.id).collectAsState(initial = 0)
    val buyGetDiscount by vm.buyGetDiscount(s.id).collectAsState(initial = 0L)
    val voucherDiscount by vm.voucherDiscount(s.id).collectAsState(initial = 0L)
    val rules by vm.pricingRules.collectAsState()
    val e by vm.currentEmployee.collectAsState()
    val settings by vm.settings.collectAsState()
    val sessionBatches by vm.batches(s.id).collectAsState(initial = emptyList())
    val pendingDelivery = sessionBatches.filter { it.status == "DRAFT" || it.status == "WAITING" }.sortedBy { it.serviceNo }
    fun setting(key: String) = settings.firstOrNull { it.key == key }?.value ?: ""
    var codeText by remember { mutableStateOf("") }
    var appliedCode by remember { mutableStateOf("") }
    val customers by vm.customers.collectAsState()
    var customerPhone by remember { mutableStateOf("") }
    var customerName by remember { mutableStateOf("") }
    val normalizedPhone = customerPhone.filter(Char::isDigit)
    val matchedCustomer = customers.firstOrNull { it.phone == normalizedPhone }
    val effectiveTier = effectiveCustomerTier(
        matchedCustomer,
        settings,
        newMember = matchedCustomer == null && normalizedPhone.length >= 9
    )
    val loyaltyRule = tierDiscountRule(effectiveTier, settings)
    val rewardFlow = remember(matchedCustomer?.id) { matchedCustomer?.id?.let { vm.customerRewards(it) } }
    val availableRewards by (rewardFlow ?: kotlinx.coroutines.flow.flowOf(emptyList<CustomerRewardEntity>())).collectAsState(initial=emptyList())
    val billReward = availableRewards.firstOrNull {
        it.rewardSnapshot.split("|").getOrNull(1) in listOf("BILL_DISCOUNT","BILL_DISCOUNT_PERCENT") &&
        (it.expiresAt==null || it.expiresAt>System.currentTimeMillis())
    }
    var applyBillReward by remember(s.id,matchedCustomer?.id) { mutableStateOf(false) }
    val manualVoucher=if(voucherDiscount>0L) voucherDiscount else buyGetDiscount
    val manualLabel=if(voucherDiscount>0L) "Voucher 0210" else "Mua X tặng Y"
    // Both voucher and buy-get gift lines have already been persisted in the order.
    // Never replace their 100% gift discount with a percentage rule at checkout:
    // that would charge for a promised gift and leave the redeemed reward locked.
    val eligibleRules = if (manualVoucher > 0L) rules.filter { it.kind == "SURCHARGE" } else rules + listOfNotNull(loyaltyRule)
    val applyReward = applyBillReward && billReward!=null && manualVoucher==0L && s.dataScope=="LIVE"
    val rewardFields=billReward?.rewardSnapshot?.split("|").orEmpty()
    val rewardValue=rewardFields.getOrNull(2)?.toLongOrNull()?:0L
    val rewardDiscount=if(applyReward) minOf(if(rewardFields.getOrNull(1)=="BILL_DISCOUNT_PERCENT")subtotal*rewardValue/100L else rewardValue,subtotal) else 0L
    val preview = calculatePricing(subtotal,if(applyReward)emptyList() else eligibleRules,appliedCode,
        buyGetDiscount=if(applyReward)rewardDiscount else manualVoucher,
        buyGetLabel=if(applyReward)"Ưu đãi tích điểm" else manualLabel)
    val paymentSession by vm.paymentSession(s.id).collectAsState(initial = null)
    val printedCheckoutKey by vm.printedCheckoutKey.collectAsState()
    val checkoutPrinting by vm.checkoutPrinting.collectAsState()
    val bankEvents by vm.recentBankNotifications.collectAsState()
    LaunchedEffect(preview.total, s.id) { vm.openPaymentSession(s,t,preview.total) }
    val validPaymentSession=paymentSession?.takeIf{it.expectedAmount==preview.total}
    val shortTable=t.name.filter(Char::isLetterOrDigit).takeLast(3).uppercase()
    val qrInfo = "${setting("qr_prefix").ifBlank { "0210" }} $shortTable ${validPaymentSession?.paymentCode.orEmpty()}".trim()
    val checkoutKey="${s.id}:${preview.total}:$qrInfo"
    val billPrinted=printedCheckoutKey==checkoutKey
    val checkoutTestEnabled by vm.checkoutPrintTestMode.collectAsState()
    val checkoutPrintTestMode = checkoutTestEnabled && e?.role=="ADMIN"
    val qrMode = setting("payment_qr_mode")
    val soundboxStatic = PaymentQrMode.usesStaticSoundboxQr(qrMode)
    val qrConfigured = soundboxStatic || (setting("bank_name").isNotBlank() && setting("bank_account").isNotBlank())
    val ambiguousEvent=bankEvents.firstOrNull{it.matchStatus=="AMBIGUOUS"&&it.amount==preview.total&&it.receivedAt>=s.openedAt}

    Column {
        Header("Thanh toán") { vm.screen.value = "SENT" }
        Column(Modifier.weight(1f).padding(18.dp).verticalScroll(rememberScrollState())) {
            if (pendingDelivery.isNotEmpty()) {
                Card(
                    Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    colors = CardDefaults.cardColors(containerColor = WaitingPriority2)
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Text("CÒN ĐƠN CHƯA HOÀN TẤT", fontWeight = FontWeight.Black, fontSize = 18.sp)
                        Text(
                            "Không thể thanh toán khi còn đơn chưa gửi bếp hoặc chưa xác nhận giao đủ.",
                            Modifier.padding(top = 4.dp),
                            fontSize = 12.sp
                        )
                        Text(
                            pendingDelivery.joinToString(" · ") { batch ->
                                "#${batch.serviceNo.toString().padStart(3,'0')} ${if(batch.status=="DRAFT") "CHƯA GỬI" else "CHỜ GIAO"}"
                            },
                            Modifier.padding(top = 8.dp),
                            fontWeight = FontWeight.Black
                        )
                        if (pendingDelivery.none { it.status == "DRAFT" }) {
                            Button(
                                onClick = { vm.confirmAllDelivered(s.id) },
                                modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
                            ) { Text("✓ XÁC NHẬN ĐÃ GIAO ĐỦ") }
                        } else {
                            OutlinedButton(
                                onClick = { vm.screen.value = "SENT" },
                                modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
                            ) { Text("QUAY LẠI GỬI BẾP") }
                        }
                    }
                }
            }
            Text("TẠM TÍNH")
            Text(money(preview.subtotal), fontSize = 24.sp, fontWeight = FontWeight.Bold)
            if (preview.surcharge > 0) Text("Phụ thu: +${money(preview.surcharge)}", fontWeight = FontWeight.Bold)
            preview.surchargeRules.forEach { Text("• ${it.name} +${it.percent}%", fontSize = 12.sp) }
            if (preview.discount > 0) {
                Text("Ưu đãi: -${money(preview.discount)}", fontWeight = FontWeight.Bold)
                preview.buyGetLabel?.let { Text("• $it · quà tặng giảm 100%", fontSize = 12.sp) }
                preview.discountRule?.let { Text("• ${it.name} -${it.percent}%", fontSize = 12.sp) }
            }
            HorizontalDivider(Modifier.padding(vertical = 10.dp))
            Text("THÀNH TIỀN")
            Text(money(preview.total), fontSize = 38.sp, fontWeight = FontWeight.Black)

            Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = codeText,
                    onValueChange = { codeText = it.uppercase().take(30) },
                    modifier = Modifier.weight(1f),
                    label = { Text("Mã ưu đãi") },
                    singleLine = true
                )
                Spacer(Modifier.width(8.dp))
                Button(onClick = { appliedCode = codeText.trim().uppercase() }) { Text("ÁP DỤNG") }
            }
            if (appliedCode.isNotBlank()) {
                TextButton(onClick = { appliedCode = ""; codeText = "" }) { Text("BỎ MÃ") }
            }
            if (preview.message.isNotBlank()) Text(preview.message, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("Các ưu đãi giảm giá không cộng dồn; hệ thống chỉ chọn mức giảm lớn nhất.", fontSize = 11.sp)

            HorizontalDivider(Modifier.padding(vertical = 10.dp))
            Text("KHÁCH HÀNG / TÍCH ĐIỂM", fontWeight = FontWeight.Bold)
            OutlinedTextField(
                value = customerPhone,
                onValueChange = { customerPhone = it.filter(Char::isDigit).take(15) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Số điện thoại khách · không bắt buộc") },
                singleLine = true
            )
            if (matchedCustomer != null) {
                Text("${effectiveTier ?: matchedCustomer.tier} · ${matchedCustomer.points} điểm · ${matchedCustomer.visitCount} lần ghé", fontWeight = FontWeight.Bold)
                if (matchedCustomer.tierManual) Text("Hạng đặc biệt do Admin gán", fontSize = 11.sp)
                if (matchedCustomer.name.isNotBlank()) Text(matchedCustomer.name)
                loyaltyRule?.let { Text("Ưu đãi hạng: -${it.percent}%", fontSize = 12.sp, fontWeight = FontWeight.Bold) }
            } else if (normalizedPhone.length >= 9) {
                OutlinedTextField(
                    value = customerName,
                    onValueChange = { customerName = it.take(40) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Tên khách mới · tùy chọn") }
                )
                Text("Khách mới · sau thanh toán sẽ tạo Member", fontSize = 11.sp)
            }
            if(billReward!=null && manualVoucher==0L && s.dataScope=="LIVE"){
                Row(verticalAlignment=Alignment.CenterVertically){
                    Checkbox(checked=applyBillReward,onCheckedChange={applyBillReward=it})
                    Text("Dùng quyền lợi tích điểm: giảm "+(if(rewardFields.getOrNull(1)=="BILL_DISCOUNT_PERCENT")"$rewardValue%" else money(rewardValue))+" một lần",fontWeight=FontWeight.Bold,fontSize=12.sp)
                }
            }
            Text("Tích điểm: "+money(setting("loyalty_vnd_per_point").toLongOrNull()?:10000L)+" thực trả = 1 điểm", fontSize = 11.sp)

            Text("🔒 Thu tiền: ${e?.name}", Modifier.padding(vertical = 14.dp))
            if (billPrinted) {
                Text("✓ BILL ĐÃ IN · Chờ khách kiểm tra và thanh toán",fontWeight=FontWeight.Black,color=Color(0xFF41633A))
                Card(
                    modifier=Modifier.fillMaxWidth().padding(top=8.dp),
                    shape=RoundedCornerShape(22.dp),
                    colors=CardDefaults.cardColors(containerColor=Color.White),
                    border=BorderStroke(1.dp,Color(0xFFE4DBD0))
                ) {
                    Column(Modifier.fillMaxWidth().padding(horizontal=18.dp,vertical=16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if(soundboxStatic) "CHUYỂN KHOẢN TECHCOMBANK" else "THANH TOÁN VIETQR", fontWeight = FontWeight.Black, color=Coffee, fontSize=15.sp)
                        if (!qrConfigured) Text("Chưa cấu hình tài khoản thanh toán") else if(!soundboxStatic && validPaymentSession==null) Text("Đang tạo mã thanh toán riêng cho bill…") else {
                            Text(money(preview.total),fontWeight=FontWeight.Black,fontSize=30.sp,modifier=Modifier.padding(top=3.dp))
                            Text(if(soundboxStatic) "Khách tự nhập đúng số tiền trên ứng dụng ngân hàng" else "Quét mã để thanh toán",fontSize=11.sp,textAlign=TextAlign.Center,color=Color(0xFF655C55))
                            Surface(
                                modifier=Modifier.padding(vertical=12.dp),
                                shape=RoundedCornerShape(14.dp),
                                border=BorderStroke(1.dp,Color(0xFFE6DDD2)),
                                color=Color.White
                            ) { PaymentQrImage(qrMode, setting("bank_name"), setting("bank_account"), setting("bank_holder"), preview.total, qrInfo, Modifier.size(250.dp).padding(7.dp)) }
                            if(soundboxStatic){
                                Text("Quét QR Techcombank · nghe Soundbox báo tiền vào",fontSize=12.sp,fontWeight=FontWeight.Bold,textAlign=TextAlign.Center)
                                Text("Nội dung chuyển khoản: $qrInfo",fontSize=11.sp,textAlign=TextAlign.Center,color=Color(0xFF655C55),modifier=Modifier.padding(top=3.dp))
                            }else Text("${setting("bank_name")} · ${setting("bank_account")}",fontSize=12.sp)
                        }
                    }
                }
                if(soundboxStatic){
                    Text("Nghe thông báo từ Soundbox và đối chiếu số tiền trước khi xác nhận thanh toán.",Modifier.padding(top=8.dp),fontSize=11.sp)
                }else if(validPaymentSession?.status=="PAYMENT_DETECTED"){
                    Card(Modifier.fillMaxWidth().padding(top=10.dp),colors=CardDefaults.cardColors(containerColor=Color(0xFFDCE8D8))){
                        Column(Modifier.padding(14.dp)){
                            Text("✓ ĐÃ PHÁT HIỆN THANH TOÁN",fontWeight=FontWeight.Black)
                            Text("Đã nhận: ${money(validPaymentSession.detectedAmount?:preview.total)}")
                            Text("Ngân hàng: ${validPaymentSession.detectedBank.orEmpty()}",fontSize=12.sp)
                            Text("Nhân viên vẫn phải xác nhận để đóng bill.",fontSize=11.sp)
                        }
                    }
                }else if(ambiguousEvent!=null){
                    Text("Đã phát hiện giao dịch cùng số tiền nhưng chưa xác định được bill.",Modifier.padding(top=8.dp),color=Color(0xFF9A5B28),fontSize=12.sp,fontWeight=FontWeight.Bold)
                }else Text("Đang chờ thông báo ngân hàng · vẫn có thể xác nhận thủ công",Modifier.padding(top=8.dp),fontSize=11.sp)
            }
        }
        Column(Modifier.fillMaxWidth().padding(18.dp)) {
            if(checkoutPrinting) Text("ĐANG IN BILL… · Hóa đơn và QR vẫn hiển thị để khách xem", fontWeight=FontWeight.Bold)
            if(!billPrinted){
                Button(
                    onClick={
                        if(checkoutPrintTestMode) vm.confirmCheckoutBillTest(preview,qrInfo)
                        else vm.printCheckoutBill(preview,qrInfo,matchedCustomer?.name?:customerName)
                    },
                    modifier=Modifier.fillMaxWidth(),
                    enabled=!checkoutPrinting&&preview.total>0&&pendingDelivery.isEmpty()&&validPaymentSession!=null
                ){
                    Text(if(pendingDelivery.isNotEmpty()) "CHƯA GIAO ĐỦ · CHƯA THỂ IN BILL" else "IN BILL")
                }
                Text("Bill trên màn hình và mã QR luôn khả dụng. Nếu máy in lỗi, vẫn có thể xác nhận sau khi nhận đủ tiền.", Modifier.padding(top=6.dp),fontSize=11.sp)
            }
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)){
                OutlinedButton(
                    onClick={vm.close("CASH",preview,qrInfo,customerPhone,customerName,if(applyReward)billReward?.id else null)},
                    modifier=Modifier.weight(1f),
                    enabled=!checkoutPrinting&&preview.total>0&&pendingDelivery.isEmpty()&&validPaymentSession!=null
                ){Text("XÁC NHẬN\\nTIỀN MẶT".replace("\\n","\n"),textAlign=TextAlign.Center)}
                Button(
                    onClick={vm.close("TRANSFER",preview,qrInfo,customerPhone,customerName,if(applyReward)billReward?.id else null)},
                    modifier=Modifier.weight(1f),
                    enabled=!checkoutPrinting&&preview.total>0&&pendingDelivery.isEmpty()&&validPaymentSession!=null
                ){Text("XÁC NHẬN\\nCHUYỂN KHOẢN".replace("\\n","\n"),textAlign=TextAlign.Center)}
            }
        }
    }
}

@Composable
fun DeliveryQueue(vm: PosViewModel) {
    val waiting by vm.waitingBatches.collectAsState()
    val sessions by vm.sessions.collectAsState()
    val tables by vm.tables.collectAsState()
    Column {
        Header("Đơn chờ giao") { vm.screen.value = "TABLES" }
        if (waiting.isEmpty()) {
            Text("Không còn đơn chờ giao.", Modifier.padding(20.dp))
        } else {
            val ordered = waiting.sortedWith(compareBy<OrderBatchEntity> { it.serviceNo }.thenBy { it.createdAt })
            LazyColumn(Modifier.fillMaxSize().padding(12.dp)) {
                itemsIndexed(ordered, key = { _, b -> b.id }) { index, b ->
                    val session = sessions.firstOrNull { it.id == b.sessionId }
                    val table = session?.let { s -> tables.firstOrNull { it.id == s.tableId } }
                    Card(
                        Modifier.fillMaxWidth().padding(vertical = 5.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = when (index) {
                                0 -> WaitingPriority1
                                1 -> WaitingPriority2
                                else -> WaitingDelivery
                            }
                        )
                    ) {
                        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "#${b.serviceNo.toString().padStart(3,'0')} · ${table?.name ?: "Bàn"}",
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.Black
                                )
                                Text(
                                    when (index) {
                                        0 -> "ƯU TIÊN GIAO TRƯỚC"
                                        1 -> "ƯU TIÊN KẾ TIẾP"
                                        else -> "ĐANG CHỜ GIAO"
                                    },
                                    fontWeight = FontWeight.Bold
                                )
                                Text("Đơn #${b.sequence} · ${SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(b.createdAt))}")
                            }
                            Button(onClick = { vm.markDelivered(b) }) { Text("ĐÃ GIAO ĐỦ") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun Customers(vm: PosViewModel) {
    val customers by vm.customers.collectAsState()
    val itemStats by vm.customerItemStats.collectAsState()
    val bills by vm.bills.collectAsState()
    val current by vm.currentEmployee.collectAsState()
    val updateMessage by vm.customerUpdateMessage.collectAsState()
    var selected by remember { mutableStateOf<CustomerEntity?>(null) }
    var editTarget by remember { mutableStateOf<CustomerEntity?>(null) }
    var query by remember { mutableStateOf("") }
    var section by remember { mutableStateOf("LIST") }

    val normalizedQuery = query.trim().lowercase()
    val visibleCustomers = customers.filter { c ->
        normalizedQuery.isBlank() || c.phone.contains(normalizedQuery.filter(Char::isDigit)) || c.name.lowercase().contains(normalizedQuery)
    }

    fun aggregatedRows(customerIds: Set<String>, combos: Boolean): List<Pair<String, Int>> {
        return itemStats
            .filter { it.customerId in customerIds }
            .filter { if (combos) it.name.startsWith("COMBO ·") else !it.name.startsWith("COMBO ·") }
            .groupBy { it.name }
            .map { (name, rows) -> name to rows.sumOf { it.qty } }
            .sortedByDescending { it.second }
    }

    Column {
        Header("Khách hàng") { vm.screen.value = "MANAGE" }
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(section == "LIST", { section = "LIST" }, { Text("DANH SÁCH") })
            FilterChip(section == "ANALYTICS", { section = "ANALYTICS" }, { Text("PHÂN TÍCH THÀNH VIÊN") })
        }

        if (section == "LIST") {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it.take(50) },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                leadingIcon = { Text("🔍") },
                label = { Text("Tìm số điện thoại hoặc tên khách") },
                singleLine = true
            )
            Text(
                "${visibleCustomers.size} / ${customers.size} khách · Member / VIP / VVIP",
                Modifier.padding(horizontal = 16.dp),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
            if (visibleCustomers.isEmpty()) {
                Text("Không tìm thấy khách phù hợp.", Modifier.padding(20.dp))
            } else {
                LazyColumn(Modifier.fillMaxSize().padding(12.dp)) {
                    items(visibleCustomers, key = { it.id }) { c ->
                        Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { selected = c }) {
                            Column(Modifier.padding(14.dp)) {
                                Text("${c.phone} · ${c.tier}", fontWeight = FontWeight.Black)
                                if (c.name.isNotBlank()) Text(c.name)
                                if (c.address.isNotBlank()) Text(c.address, fontSize = 11.sp)
                                Text("${c.points} điểm · ${c.visitCount} lần ghé · ${money(c.totalSpend)}")
                                c.lastVisitAt?.let { Text("Gần nhất: ${time(it)}", fontSize = 11.sp) }
                            }
                        }
                    }
                }
            }
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(12.dp)) {
                item {
                    Text("PHÂN TÍCH KHÁCH THÀNH VIÊN", fontWeight = FontWeight.Black, fontSize = 20.sp)
                    Text("Tỷ lệ món tính theo tổng số phần đã gọi trong các bill còn hiệu lực.", fontSize = 11.sp)
                    Spacer(Modifier.height(8.dp))
               …40226 tokens truncated…,{excelFrom=it},Modifier.fillMaxWidth(),label={Text("Từ ngày · dd/MM/yyyy")},singleLine=true)
                    OutlinedTextField(excelTo,{excelTo=it},Modifier.fillMaxWidth(),label={Text("Đến ngày · dd/MM/yyyy")},singleLine=true)
                    Text("NGƯỜI CHI",fontWeight=FontWeight.Bold)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                        FilterChip(excelPayer=="ALL",{excelPayer="ALL"},{Text("Tất cả")})
                        purchases.map{it.paidByName}.filter{it.isNotBlank()}.distinct().sorted().forEach{name->FilterChip(excelPayer==name,{excelPayer=name},{Text(name)})}
                    }
                    Text("THU NGÂN",fontWeight=FontWeight.Bold)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                        FilterChip(excelCashier=="ALL",{excelCashier="ALL"},{Text("Tất cả")})
                        payments.map{it.cashierId}.distinct().forEach{id->FilterChip(excelCashier==id,{excelCashier=id},{Text(id.take(8))})}
                    }
                    if(excelFilterError.isNotBlank())Text(excelFilterError,color=if(excelFilterError.startsWith("LỖI")||excelFilterError.contains("lỗi",true))Color.Red else Color.DarkGray)
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
                        Button(onClick={shareExcel(true)},modifier=Modifier.weight(1f)){Text("TẢI EXCEL")}
                        Button(onClick={shareExcel(false)},modifier=Modifier.weight(1f)){Text("SHARE ZALO")}
                    }
                    Text("DỮ LIỆU PHÂN TÍCH AI",fontWeight=FontWeight.Bold)
                    OutlinedButton(onClick={shareAiExport()},modifier=Modifier.fillMaxWidth()){Text("XUẤT DỮ LIỆU JSON CHO AI")}
                }
            }
            "MONTHLY" -> MonthlyProfitReport(vm)
            "OVERVIEW" -> {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    FilterChip(singleDayOffset==0, { periodDays=1;singleDayOffset=0 }, { Text("Hôm nay") })
                    FilterChip(singleDayOffset==1, { periodDays=1;singleDayOffset=1 }, { Text("Hôm qua") })
                    FilterChip(singleDayOffset==2, { periodDays=1;singleDayOffset=2 }, { Text("Hôm kia") })
                    FilterChip(singleDayOffset==null&&periodDays==7, { periodDays=7;singleDayOffset=null }, { Text("7 ngày") })
                    FilterChip(singleDayOffset==null&&periodDays==30, { periodDays=30;singleDayOffset=null }, { Text("30 ngày") })
                    FilterChip(singleDayOffset==null&&periodDays==0, { periodDays=0;singleDayOffset=null }, { Text("Tất cả") })
                }
                LazyColumn(Modifier.fillMaxSize().padding(12.dp)) {
                    item {
                        val ids = filteredBills.map { it.id }.toSet()
                        val alerts = SalesReport.reconcile(reportData.bills,reportData.items,reportData.adjustments,reportData.payments,reportData.sessions).count { it.bill.id in ids && it.issues.isNotEmpty() }
                        if(alerts > 0 || reportData.orphanLines > 0) {
                            OutlinedButton(onClick={section="ITEMS"},modifier=Modifier.fillMaxWidth()) { Text("ĐỐI SOÁT: $alerts bill cần kiểm tra · ${reportData.orphanLines} dòng mất liên kết") }
                        }
                    }
                    item { MetricCard("Doanh thu", money(revenue)) }
                    item { MetricCard("Số bill", filteredBills.size.toString()) }
                    item { MetricCard("Bill trung bình", money(avgBill)) }
                    item { MetricCard("Tiền mặt", money(cash)) }
                    item { MetricCard("Chuyển khoản", money(transfer)) }
                    item { MetricCard("Tổng tiền chi trong kỳ", money(purchaseTotal)) }
                    item { MetricCard("Chênh lệch thu - tổng tiền chi", money(revenue - purchaseTotal)) }
                    item {
                        SalesDayChart(salesActivity.dailyRevenue,salesActivity.peakDay,reportPeriodLabel)
                    }
                    item {
                        PeakHoursChart(
                            hourlyCounts = hourlyBillCounts,
                            peakHour = peakHour,
                            periodLabel = reportPeriodLabel
                        )
                    }
                    item {
                        Text(
                            "Chi phí vận hành theo nhóm",
                            Modifier.padding(start = 8.dp, top = 16.dp, bottom = 6.dp),
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                    }
                    if (categorizedCosts.isEmpty()) {
                        item { Text("Chưa có chi phí đầu vào trong kỳ.", Modifier.padding(8.dp)) }
                    } else {
                        items(categorizedCosts) { row ->
                            val pct = if (categorizedCostTotal == 0L) 0
                            else ((row.third * 100.0 / categorizedCostTotal) + 0.5).toInt()
                            Card(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                                Row(
                                    Modifier.fillMaxWidth().padding(14.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(row.second, fontWeight = FontWeight.Bold)
                                        Text("$pct% tổng chi phí", fontSize = 11.sp)
                                    }
                                    Text(money(row.third), fontWeight = FontWeight.Black)
                                }
                            }
                        }
                    }
                    if (investmentRows.isNotEmpty()) {
                        item {
                            Text("Đầu tư trong kỳ", Modifier.padding(start = 8.dp, top = 16.dp, bottom = 6.dp), fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        }
                        items(investmentRows) { row ->
                            Card(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                                Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(row.second, Modifier.weight(1f), fontWeight = FontWeight.Bold)
                                    Text(money(row.third), fontWeight = FontWeight.Black)
                                }
                            }
                        }
                    }
                    item {
                        Text("Món khách chọn nhiều", Modifier.padding(start = 8.dp, top = 16.dp, bottom = 6.dp), fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    }
                    if (favoriteRows.isEmpty()) {
                        item { Text("Chưa đủ dữ liệu món trong kỳ.", Modifier.padding(8.dp)) }
                    } else {
                        item { ItemQuantityChart(favoriteRows) }
                        items(favoriteRows) { row ->
                            val pct = if (totalItemQty == 0) 0 else ((row.second * 100.0 / totalItemQty) + 0.5).toInt()
                            Card(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                                Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(row.first, Modifier.weight(1f), fontWeight = FontWeight.Bold)
                                    Text("${row.second} phần · $pct%")
                                }
                            }
                        }
                    }
                }
            }
            "BILLS" -> {
                Column(Modifier.fillMaxSize()) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp).horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        FilterChip(singleDayOffset==0&&historyDateText.isBlank(), { periodDays=1;singleDayOffset=0;historyDateText="";selectedBillIds=emptySet() }, { Text("Hôm nay") })
                        FilterChip(singleDayOffset==1&&historyDateText.isBlank(), { periodDays=1;singleDayOffset=1;historyDateText="";selectedBillIds=emptySet() }, { Text("Hôm qua") })
                        FilterChip(singleDayOffset==2&&historyDateText.isBlank(), { periodDays=1;singleDayOffset=2;historyDateText="";selectedBillIds=emptySet() }, { Text("Hôm kia") })
                        FilterChip(singleDayOffset==null&&periodDays==7&&historyDateText.isBlank(), { periodDays=7;singleDayOffset=null;historyDateText="";selectedBillIds=emptySet() }, { Text("7 ngày") })
                        FilterChip(singleDayOffset==null&&periodDays==30&&historyDateText.isBlank(), { periodDays=30;singleDayOffset=null;historyDateText="";selectedBillIds=emptySet() }, { Text("30 ngày") })
                        FilterChip(singleDayOffset==null&&periodDays==0&&historyDateText.isBlank(), { periodDays=0;singleDayOffset=null;historyDateText="";selectedBillIds=emptySet() }, { Text("Tất cả") })
                    }
                    OutlinedTextField(
                        value = historyDateText,
                        onValueChange = { historyDateText = it.take(10); selectedBillIds = emptySet() },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp),
                        label = { Text("Lọc đúng ngày dd/MM/yyyy") },
                        singleLine = true
                    )
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp),
                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        FilterChip(paymentFilter == "ALL", { paymentFilter = "ALL"; selectedBillIds = emptySet() }, { Text("TẤT CẢ") })
                        FilterChip(paymentFilter == "CASH", { paymentFilter = "CASH"; selectedBillIds = emptySet() }, { Text("TIỀN MẶT") })
                        FilterChip(paymentFilter == "TRANSFER", { paymentFilter = "TRANSFER"; selectedBillIds = emptySet() }, { Text("CHUYỂN KHOẢN") })
                    }
                    if (current?.role == "ADMIN" && historyBills.isNotEmpty()) {
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedButton(
                                onClick = {
                                    val ids = historyBills.map { it.id }.toSet()
                                    selectedBillIds = if (ids.all { it in selectedBillIds }) selectedBillIds - ids else selectedBillIds + ids
                                },
                                modifier = Modifier.weight(1f)
                            ) { Text(if (historyBills.all { it.id in selectedBillIds }) "BỎ CHỌN TẤT CẢ" else "CHỌN TẤT CẢ") }
                            Button(
                                onClick = { showBulkDelete = true },
                                enabled = selectedBillIds.isNotEmpty(),
                                modifier = Modifier.weight(1f)
                            ) { Text("XÓA ${selectedBillIds.size} BILL") }
                        }
                        if (selectedBillIds.isNotEmpty()) {
                            Text("Đã chọn ${selectedBillIds.size} bill · ${money(selectedTotal)}", Modifier.padding(horizontal = 16.dp, vertical = 2.dp), fontWeight = FontWeight.Bold)
                        }
                    }
                    if (historyBills.isEmpty()) {
                        Text("Không có bill theo bộ lọc", Modifier.padding(20.dp))
                    } else {
                        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
                            items(historyBills, key = { it.id }) { bill ->
                                val p = payments.firstOrNull { it.billId == bill.id }
                                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                                    Row(
                                        Modifier.fillMaxWidth().padding(10.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        if (current?.role == "ADMIN") {
                                            Checkbox(
                                                checked = bill.id in selectedBillIds,
                                                onCheckedChange = { checked ->
                                                    selectedBillIds = if (checked) selectedBillIds + bill.id else selectedBillIds - bill.id
                                                }
                                            )
                                        }
                                        Column(
                                            Modifier.weight(1f).clickable { selectedBill = bill }.padding(4.dp)
                                        ) {
                                            Text(bill.billNo, fontWeight = FontWeight.Bold)
                                            Text("${bill.closedAt?.let { time(it) } ?: "--"} · ${money(bill.total)}")
                                            Text(if (p?.method == "TRANSFER") "Chuyển khoản" else "Tiền mặt", fontSize = 12.sp)
                                        }
                                        if (current?.canCheckout == true || current?.role == "ADMIN") {
                                            OutlinedButton(onClick = { vm.reprintPaidBill(bill.id) }) { Text("IN LẠI") }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            "PURCHASES" -> {
                if (filteredPurchases.isEmpty()) {
                    Text("Chưa có phiếu nhập trong kỳ đã chọn", Modifier.padding(20.dp))
                } else {
                    LazyColumn(Modifier.fillMaxSize().padding(12.dp)) {
                        item { val who=when(payerFilter){"ALL"->"Tất cả người chi";"UNKNOWN"->"Chưa xác định";else->payerFilter};Text("Tổng chi · $who · $purchasePeriodLabel: ${money(purchaseTotal)}", fontSize = 22.sp, fontWeight = FontWeight.Bold) }
                        item {
                            if(payerTotalsForPeriod.isNotEmpty()) {
                                Text("Tổng chi theo người · $purchasePeriodLabel", Modifier.padding(top = 8.dp, bottom = 3.dp), fontWeight = FontWeight.Bold)
                                payerTotalsForPeriod.forEach { (name, amount) ->
                                    Text("$name · ${money(amount)}", fontSize = 12.sp, fontWeight = if(name==payerFilter) FontWeight.Black else FontWeight.Normal)
                                }
                            }
                        }
                        if (categorizedCosts.isNotEmpty()) {
                            item {
                                Text(
                                    "Chi phí vận hành theo nhóm",
                                    Modifier.padding(top = 12.dp, bottom = 4.dp),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 17.sp
                                )
                            }
                            items(categorizedCosts) { row ->
                                val pct = if (categorizedCostTotal == 0L) 0
                                else ((row.third * 100.0 / categorizedCostTotal) + 0.5).toInt()
                                Card(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text(row.second, Modifier.weight(1f), fontWeight = FontWeight.Bold)
                                        Text("${money(row.third)} · $pct%")
                                    }
                                }
                            }
                        }
                        if (investmentRows.isNotEmpty()) {
                            item {
                                Text("Đầu tư trong kỳ", Modifier.padding(top = 12.dp, bottom = 4.dp), fontWeight = FontWeight.Bold, fontSize = 17.sp)
                            }
                            items(investmentRows) { row ->
                                Card(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text(row.second, Modifier.weight(1f), fontWeight = FontWeight.Bold)
                                        Text(money(row.third))
                                    }
                                }
                            }
                        }
                        item {
                            Text("Phiếu nhập trong kỳ", Modifier.padding(top = 14.dp, bottom = 4.dp), fontWeight = FontWeight.Bold)
                        }
                        items(filteredPurchases) { p ->
                            val purchaseLines by vm.purchaseItems(p.id).collectAsState(initial = emptyList())
                            val card = purchaseCardPresentation(purchaseLines.firstOrNull()?.name.orEmpty(), p.note)
                            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { selectedPurchase = p }) {
                                Column(Modifier.padding(14.dp)) {
                                    Text(time(p.purchasedAt), fontWeight = FontWeight.Bold)
                                    Text("${money(p.total)} · ${card.itemName.ifBlank { "Chưa có nội dung" }}")
                                    if (card.note.isNotBlank()) Text("Ghi chú: ${card.note}", fontSize = 12.sp)
                                    Text("Người chi: ${p.paidByName.ifBlank { "Chưa xác định" }}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    Text(if (!p.invoiceImageUri.isNullOrBlank()) "📷 Có ảnh hóa đơn · Chạm để xem" else "Chạm để xem chi tiết", fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    selectedBill?.let { b ->
        BillDetailDialog(vm, b) { selectedBill = null }
    }
    selectedPurchase?.let { p ->
        PurchaseDetailDialog(vm, p) { selectedPurchase = null }
    }

    if (showBulkDelete) {
        AlertDialog(
            onDismissRequest = { showBulkDelete = false },
            title = { Text("XÓA ${selectedBills.size} BILL") },
            text = {
                Column {
                    Text("Tổng giá trị sẽ loại khỏi doanh thu: ${money(selectedTotal)}", fontWeight = FontWeight.Black)
                    Text("Bill sẽ chuyển sang DELETED, không còn tính doanh thu/tiền mặt/chuyển khoản/thống kê món.")
                    OutlinedTextField(
                        value = bulkDeleteReason,
                        onValueChange = { bulkDeleteReason = it },
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                        label = { Text("Lý do xóa bắt buộc") }
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        vm.deleteBills(selectedBills, bulkDeleteReason)
                        selectedBillIds = emptySet()
                        bulkDeleteReason = ""
                        showBulkDelete = false
                    },
                    enabled = selectedBills.isNotEmpty() && bulkDeleteReason.isNotBlank()
                ) { Text("XÁC NHẬN XÓA") }
            },
            dismissButton = { TextButton(onClick = { showBulkDelete = false }) { Text("HỦY") } }
        )
    }
}

private data class FinancePersonDraft(val id:String,val name:String,val shareText:String)

@Composable
fun FinancePeopleManager(vm:PosViewModel){
    val current by vm.currentEmployee.collectAsState()
    val partners by vm.profitPartners.collectAsState()
    if(current?.role!="ADMIN"){
        Column{Header("Người & tỷ lệ chia"){vm.screen.value="REPORT"};Text("Chỉ Admin được cấu hình.",Modifier.padding(20.dp),fontWeight=FontWeight.Bold)}
        return
    }
    var drafts by remember(partners){mutableStateOf(partners.map{FinancePersonDraft(it.id,it.name,(it.shareBasisPoints/100).toString())})}
    var alias by remember{mutableStateOf("")}
    var mergeTargetId by remember(partners){mutableStateOf(partners.firstOrNull()?.id)}
    var message by remember{mutableStateOf("")}
    val shares=drafts.map{((it.shareText.toIntOrNull()?:0).coerceIn(0,100))*100}
    val totalPercent=shares.sum()/100
    val valid=drafts.isNotEmpty()&&drafts.all{it.name.isNotBlank()}&&drafts.map{it.name.trim().lowercase()}.distinct().size==drafts.size&&validProfitPeopleShares(shares)
    Column{
        Header("Người & tỷ lệ chia"){vm.screen.value="REPORT"}
        LazyColumn(Modifier.fillMaxSize().padding(16.dp)){
            item{
                Text("DANH SÁCH NGƯỜI",fontWeight=FontWeight.Black,fontSize=20.sp)
                Text("Một người có thể vừa được chia tiền vừa ứng tiền cho quán. Đặt 0% nếu người đó chỉ ứng tiền. Tổng tỷ lệ người chia phải bằng 100%.",fontSize=12.sp)
                Text("Tổng tỷ lệ hiện tại: $totalPercent%",Modifier.padding(vertical=8.dp),fontWeight=FontWeight.Bold,color=if(totalPercent==100)Color(0xFF41633A) else Color(0xFF9A4B3D))
            }
            itemsIndexed(drafts,key={_,d->d.id}){index,d->
                Card(Modifier.fillMaxWidth().padding(vertical=4.dp)){
                    Column(Modifier.padding(12.dp)){
                        OutlinedTextField(d.name,{v->drafts=drafts.toMutableList().also{it[index]=d.copy(name=v.take(60))}},Modifier.fillMaxWidth(),label={Text("Tên người")},singleLine=true)
                        OutlinedTextField(d.shareText,{v->drafts=drafts.toMutableList().also{it[index]=d.copy(shareText=v.filter(Char::isDigit).take(3))}},Modifier.fillMaxWidth(),label={Text("% chia · 0 = chỉ ứng tiền")},singleLine=true)
                        TextButton(onClick={drafts=drafts.filterIndexed{i,_->i!=index}}){Text("BỎ KHỎI DANH SÁCH")}
                    }
                }
            }
            item{
                OutlinedButton(onClick={drafts=drafts+FinancePersonDraft(UUID.randomUUID().toString(),"","0")},Modifier.fillMaxWidth().padding(top=6.dp)){Text("＋ THÊM NGƯỜI")}
                Button(onClick={
                    vm.saveProfitPartners(drafts.mapIndexed{i,d->ProfitPartnerEntity(d.id,d.name.trim(),((d.shareText.toIntOrNull()?:0).coerceIn(0,100))*100,i,true)})
                    message="Đã lưu danh sách người và tỷ lệ chia."
                },enabled=valid,modifier=Modifier.fillMaxWidth().padding(top=8.dp)){Text("LƯU CẤU HÌNH")}
                if(!valid)Text("Cần tên không trùng và tổng tỷ lệ chia đúng 100%.",Modifier.padding(top=6.dp),fontSize=12.sp,color=Color(0xFF9A4B3D))
                if(message.isNotBlank())Text(message,Modifier.padding(top=6.dp),fontWeight=FontWeight.Bold)
                HorizontalDivider(Modifier.padding(vertical=14.dp))
                Text("GỘP TÊN NGƯỜI CHI CŨ",fontWeight=FontWeight.Black)
                Text("Dùng khi lịch sử từng nhập tên khác. Chỉ đổi tên tham chiếu người chi/hoàn ứng; không đổi số tiền hay phân loại phiếu.",fontSize=11.sp)
                OutlinedTextField(alias,{alias=it.take(60)},Modifier.fillMaxWidth(),label={Text("Tên cũ cần gộp")})
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                    partners.forEach{p->FilterChip(mergeTargetId==p.id,{mergeTargetId=p.id},{Text(p.name)})}
                }
                OutlinedButton(onClick={
                    val target=partners.firstOrNull{it.id==mergeTargetId}
                    if(target!=null&&alias.isNotBlank()){vm.mergePayerAlias(alias,target.name);message="Đã yêu cầu gộp ${alias.trim()} → ${target.name}";alias=""}
                },enabled=alias.isNotBlank()&&mergeTargetId!=null,modifier=Modifier.fillMaxWidth().padding(top=8.dp)){Text("GỘP VÀO NGƯỜI ĐÃ CHỌN")}
            }
        }
    }
}

@Composable
fun MonthlyProfitReport(vm:PosViewModel){
    val bills by vm.bills.collectAsState();val payments by vm.payments.collectAsState();val purchases by vm.purchases.collectAsState();val partners by vm.profitPartners.collectAsState()
    val assets by vm.assets.collectAsState();val movements by vm.financialMovements.collectAsState();val costCodes by vm.costCodes.collectAsState();val allItems by vm.purchaseItemsAll.collectAsState()
    var monthOffset by remember{mutableIntStateOf(0)};var reimbursementPayer by remember{mutableStateOf<String?>(null)}
    val month=remember(monthOffset){Calendar.getInstance().apply{set(Calendar.DAY_OF_MONTH,1);set(Calendar.HOUR_OF_DAY,0);set(Calendar.MINUTE,0);set(Calendar.SECOND,0);set(Calendar.MILLISECOND,0);add(Calendar.MONTH,monthOffset)}}
    val from=month.timeInMillis;val to=Calendar.getInstance().apply{timeInMillis=from;add(Calendar.MONTH,1)}.timeInMillis
    val monthBills=bills.filter{(it.closedAt?:Long.MIN_VALUE) in from until to};val billIds=monthBills.map{it.id}.toSet();val revenue=payments.filter{it.billId in billIds}.sumOf{it.amount}
    val monthPurchases=purchases.filter{it.purchasedAt in from until to}
    val initialCodes=setOf(ExpenseCategories.SETUP_COST,ExpenseCategories.INITIAL_INVESTMENT_SUNK,ExpenseCategories.CAPITAL_ASSET)
    val additional=monthPurchases.filter{it.expenseCategory==ExpenseCategories.ADDITIONAL_INVESTMENT}.sumOf{it.total}
    val operating=monthPurchases.filter{it.expenseCategory !in initialCodes&&it.expenseCategory!=ExpenseCategories.ADDITIONAL_INVESTMENT}.sumOf{it.total}
    val activeAssets=linkedAssetsForPurchases(assets,purchases,allItems).filter{it.status=="ACTIVE"||it.status=="DAMAGED"||it.status=="TRANSFERRED"}
    fun assetValue(a:AssetEntity):AssetValue{val p=Calendar.getInstance().apply{timeInMillis=a.purchaseDate};val used=((month.get(Calendar.YEAR)-p.get(Calendar.YEAR))*12+month.get(Calendar.MONTH)-p.get(Calendar.MONTH)+1).coerceAtLeast(0);return calculateAssetValue(a.totalCost,a.residualValue,a.usefulLifeMonths,used)}
    val depreciation=activeAssets.filter{it.purchaseDate<to}.sumOf{assetValue(it).monthlyDepreciation}
    val result=calculateFinancialPeriod(FinancialPeriodInput(revenue,operating,additional,depreciation))
    val shares=allocatePositiveCash(result.netCashResult,partners.map{ProfitShareInput(it.id,it.name,it.shareBasisPoints)})
    val reimbursements=movements.filter{it.type=="PAYER_REIMBURSEMENT"&&it.counterpartyName.isNotBlank()}.map{PayerReimbursement(it.counterpartyName,it.amount)}
    val payerLedger=calculatePayerLedger(purchases.filter{it.paidByName.isNotBlank()}.map{PayerAdvance(it.paidByName,it.total)},reimbursements)
    val initialInvestment=initialInvestmentFromPurchases(purchases)
    val allBillIds=bills.map{it.id}.toSet();val allRevenue=payments.filter{it.billId in allBillIds}.sumOf{it.amount};val allOperating=purchases.filter{it.expenseCategory !in initialCodes}.sumOf{it.total};val cumulativeNet=allRevenue-allOperating;val payback=calculateCashPayback(initialInvestment,cumulativeNet)
    fun periodResult(start:Long,end:Long):FinancialPeriodResult{val ids=bills.filter{(it.closedAt?:Long.MIN_VALUE) in start until end}.map{it.id}.toSet();val rev=payments.filter{it.billId in ids}.sumOf{it.amount};val ps=purchases.filter{it.purchasedAt in start until end};val add=ps.filter{it.expenseCategory==ExpenseCategories.ADDITIONAL_INVESTMENT}.sumOf{it.total};val op=ps.filter{it.expenseCategory !in initialCodes&&it.expenseCategory!=ExpenseCategories.ADDITIONAL_INVESTMENT}.sumOf{it.total};return calculateFinancialPeriod(FinancialPeriodInput(rev,op,add,0))}
    val quarterStart=Calendar.getInstance().apply{timeInMillis=from;set(Calendar.MONTH,(get(Calendar.MONTH)/3)*3);set(Calendar.DAY_OF_MONTH,1)}.timeInMillis;val yearStart=Calendar.getInstance().apply{timeInMillis=from;set(Calendar.MONTH,0);set(Calendar.DAY_OF_MONTH,1)}.timeInMillis
    val quarter=periodResult(quarterStart,to);val year=periodResult(yearStart,to)
    LazyColumn(Modifier.fillMaxSize().padding(12.dp)){
      item{Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){OutlinedButton({monthOffset--}){Text("‹")};Text(SimpleDateFormat("MM / yyyy",Locale.getDefault()).format(Date(from)),Modifier.weight(1f),textAlign=TextAlign.Center,fontWeight=FontWeight.Black,fontSize=20.sp);OutlinedButton({monthOffset++}){Text("›")}}}
      item{Text("KẾT QUẢ TIỀN THÁNG",Modifier.padding(top=12.dp,bottom=4.dp),fontWeight=FontWeight.Black,fontSize=18.sp);AccountingCard(listOf("Tiền thu bán hàng" to revenue,"Chi vận hành" to -operating,"DƯ TRƯỚC ĐẦU TƯ BỔ SUNG" to result.operatingResultBeforeAdditionalInvestment,"Đầu tư bổ sung" to -additional,"DÒNG TIỀN RÒNG THÁNG" to result.netCashResult,"Khấu hao tham khảo" to -depreciation));Text("Khấu hao chỉ để theo dõi tài sản, không trừ lần hai khỏi tiền chia.",Modifier.padding(8.dp),fontSize=12.sp,fontWeight=FontWeight.Bold)}
      item{Text("CHIA TIỀN",Modifier.padding(top=10.dp),fontWeight=FontWeight.Black,fontSize=18.sp);OutlinedButton({vm.screen.value="FINANCE_PEOPLE"},Modifier.fillMaxWidth().padding(vertical=6.dp)){Text("CẤU HÌNH NGƯỜI & TỶ LỆ CHIA")};if(result.netCashResult<=0)Text("Tháng này không có số dư dương để chia.",Modifier.padding(8.dp),fontWeight=FontWeight.Bold) else if(shares.isEmpty())Text("Cần cấu hình tỷ lệ người chia đủ 100%.",Modifier.padding(8.dp),color=Color(0xFF9A4B3D),fontWeight=FontWeight.Bold)}
      items(shares){p->MetricCard("${p.name} · ${p.shareBasisPoints/100.0}%",money(p.amount))}
      item{Text("CÔNG NỢ NGƯỜI ỨNG",Modifier.padding(top=12.dp,bottom=4.dp),fontWeight=FontWeight.Black,fontSize=18.sp)}
      if(payerLedger.isEmpty())item{Text("Chưa có khoản người cá nhân ứng tiền.",Modifier.padding(8.dp))} else items(payerLedger){row->Card(Modifier.fillMaxWidth().padding(vertical=3.dp)){Column(Modifier.padding(12.dp)){Text(row.payer,fontWeight=FontWeight.Black);Text("Đã ứng ${money(row.advanced)} · Đã hoàn ${money(row.reimbursed)}");Text("Quán còn nợ ${money(row.outstanding)}",fontWeight=FontWeight.Bold);if(row.outstanding>0)OutlinedButton({reimbursementPayer=row.payer},Modifier.fillMaxWidth().padding(top=5.dp)){Text("GHI HOÀN ỨNG")}}}}
      item{Text("ĐẦU TƯ & HOÀN VỐN",Modifier.padding(top=12.dp,bottom=4.dp),fontWeight=FontWeight.Black,fontSize=18.sp);AccountingCard(listOf("Đầu tư ban đầu" to initialInvestment,"Dòng tiền kinh doanh tích lũy" to cumulativeNet,"Còn để hoàn vốn" to payback.remaining));Text("Tiến độ hoàn vốn: ${payback.paybackBasisPoints/100.0}%",Modifier.padding(8.dp),fontWeight=FontWeight.Bold)}
      item{Text("TỔNG KẾT QUÝ / NĂM",Modifier.padding(top=12.dp,bottom=4.dp),fontWeight=FontWeight.Black,fontSize=18.sp);AccountingCard(listOf("Dòng tiền quý hiện tại" to quarter.netCashResult,"Đầu tư bổ sung quý" to -quarter.additionalInvestment,"Dòng tiền năm hiện tại" to year.netCashResult,"Đầu tư bổ sung năm" to -year.additionalInvestment))}
      item{Text("BIẾN ĐỘNG MÃ CHI PHÍ",Modifier.padding(top=12.dp,bottom=4.dp),fontWeight=FontWeight.Black,fontSize=18.sp)}
      items(costCodes){cc->val rows=purchases.filter{it.costCodeId==cc.id}.sortedBy{it.purchasedAt};val latest=rows.lastOrNull();val prev=if(rows.size>1)rows[rows.lastIndex-1] else null;val latestItem=latest?.let{p->allItems.firstOrNull{it.purchaseId==p.id}};val prevItem=prev?.let{p->allItems.firstOrNull{it.purchaseId==p.id}};val monthSpend=monthPurchases.filter{it.costCodeId==cc.id}.sumOf{it.total};Card(Modifier.fillMaxWidth().padding(vertical=3.dp)){Column(Modifier.padding(12.dp)){Text("${cc.code} · ${cc.name}",fontWeight=FontWeight.Black);Text("Chi tháng: ${money(monthSpend)}");if(latestItem!=null)Text("Lần gần nhất: ${latestItem.qty} ${latestItem.unit} × ${money(latestItem.unitPrice)}",fontSize=12.sp);if(latestItem!=null&&prevItem!=null){val v=calculateCostVariance(CostObservation(prevItem.qty,prevItem.unitPrice),CostObservation(latestItem.qty,latestItem.unitPrice));Text("Đơn giá ${"%+.1f".format(v.unitPriceChangePct)}% · Sử dụng ${"%+.1f".format(v.quantityChangePct)}%",fontSize=12.sp,fontWeight=FontWeight.Bold)}}}}
    }
    reimbursementPayer?.let{payer->PayerReimbursementDialog(payer,{reimbursementPayer=null}){amount,method,note->vm.reimbursePayer(payer,amount,method,note);reimbursementPayer=null}}
}
@Composable
fun PeakHoursChart(
    hourlyCounts: Map<Int, Int>,
    peakHour: Pair<Int, Int>?,
    periodLabel: String
) {
    val maxCount = (hourlyCounts.values.maxOrNull() ?: 0).coerceAtLeast(1)
    Card(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text("GIỜ CAO ĐIỂM", fontWeight = FontWeight.Black, fontSize = 18.sp)
            if (peakHour == null) {
                Text("Chưa đủ dữ liệu bill trong kỳ $periodLabel.", Modifier.padding(top = 6.dp))
            } else {
                Text(
                    "Cao điểm: %02d:00–%02d:00 · %d bill".format(
                        peakHour.first,
                        (peakHour.first + 1) % 24,
                        peakHour.second
                    ),
                    Modifier.padding(top = 4.dp),
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "Biểu đồ theo giờ thanh toán · $periodLabel",
                    fontSize = 11.sp
                )
            }

            Spacer(Modifier.height(12.dp))
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                hourlyCounts.forEach { (hour, count) ->
                    val ratio = count.toFloat() / maxCount.toFloat()
                    val barHeight = if (count == 0) 2.dp else (18f + 92f * ratio).dp
                    Column(
                        Modifier.width(36.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Bottom
                    ) {
                        Text(
                            count.toString(),
                            fontSize = 10.sp,
                            fontWeight = if (count == maxCount && count > 0) FontWeight.Black else FontWeight.Normal
                        )
                        Surface(
                            modifier = Modifier.width(24.dp).height(barHeight),
                            color = if (count == maxCount && count > 0) Coffee else Tint,
                            shape = RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp)
                        ) {}
                        Text("%02d".format(hour), fontSize = 10.sp)
                    }
                }
            }
            Text(
                "Trục ngang: giờ · Trục đứng: số bill",
                Modifier.padding(top = 8.dp),
                fontSize = 10.sp
            )
        }
    }
}

@Composable
fun SalesDayChart(dailyRevenue:Map<LocalDate,Long>,peakDay:LocalDate?,periodLabel:String) {
    val rows=dailyRevenue.entries.sortedBy{it.key}
    val max=(rows.maxOfOrNull{it.value} ?: 0L).coerceAtLeast(1L)
    Card(Modifier.fillMaxWidth().padding(vertical=6.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text("DOANH THU THEO NGÀY",fontWeight=FontWeight.Black,fontSize=18.sp)
            if(peakDay==null) Text("Chưa có bill PAID trong kỳ $periodLabel.",Modifier.padding(top=6.dp))
            else Text("Ngày cao điểm: ${"%02d/%02d".format(peakDay.dayOfMonth,peakDay.monthValue)} · ${money(dailyRevenue.getValue(peakDay))}",Modifier.padding(top=4.dp),fontWeight=FontWeight.Bold)
            if(rows.isNotEmpty()) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top=12.dp),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.Bottom) {
                rows.forEach{(day,total)->
                    Column(Modifier.width(52.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Bottom) {
                        Text(money(total),fontSize=9.sp,maxLines=1)
                        Surface(Modifier.width(30.dp).height(if(total==0L)2.dp else (18f+92f*total.toFloat()/max).dp),color=if(day==peakDay) Coffee else Tint,shape=RoundedCornerShape(topStart=6.dp,topEnd=6.dp)){}
                        Text("%02d/%02d".format(day.dayOfMonth,day.monthValue),fontSize=10.sp)
                    }
                }
            }
            Text("Trục ngang: ngày thanh toán · Trục đứng: doanh thu PAID",Modifier.padding(top=8.dp),fontSize=10.sp)
        }
    }
}

@Composable
fun ItemQuantityChart(rows:List<Pair<String,Int>>) {
    val max=(rows.maxOfOrNull{it.second} ?: 0).coerceAtLeast(1)
    Card(Modifier.fillMaxWidth().padding(vertical=6.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text("MÓN BÁN NHIỀU",fontWeight=FontWeight.Black,fontSize=18.sp)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top=10.dp),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.Bottom) {
                rows.forEach{(name,qty)->Column(Modifier.width(64.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Bottom){
                    Text("$qty",fontSize=10.sp,fontWeight=FontWeight.Bold)
                    Surface(Modifier.width(30.dp).height(if(qty==0)2.dp else (18f+92f*qty.toFloat()/max).dp),color=if(qty==max) Coffee else Tint,shape=RoundedCornerShape(topStart=6.dp,topEnd=6.dp)){}
                    Text(name.take(10),fontSize=10.sp,maxLines=2,textAlign=TextAlign.Center)
                }}
            }
            Text("Trục ngang: món · Trục đứng: số phần",Modifier.padding(top=8.dp),fontSize=10.sp)
        }
    }
}

@Composable
fun MetricCard(label: String, value: String) {
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, Modifier.weight(1f))
            Text(value, fontWeight = FontWeight.Black, fontSize = 20.sp)
        }
    }
}

@Composable
fun BillDetailDialog(vm: PosViewModel, bill: BillEntity, onDismiss: () -> Unit) {
    val session by vm.session(bill.sessionId).collectAsState(initial = null)
    val batches by vm.batches(bill.sessionId).collectAsState(initial = emptyList())
    val tables by vm.tables.collectAsState()
    val employees by vm.employees.collectAsState()
    val payments by vm.payments.collectAsState()
    val current by vm.currentEmployee.collectAsState()
    var showDelete by remember { mutableStateOf(false) }
    var deleteReason by remember { mutableStateOf("") }

    val payment = payments.firstOrNull { it.billId == bill.id }
    val tableName = tables.firstOrNull { it.id == session?.tableId }?.name ?: session?.tableId ?: "?"
    val cashier = employees.firstOrNull { it.id == payment?.cashierId }?.name ?: payment?.cashierId ?: "?"
    val methodText = if (payment?.method == "TRANSFER") "Chuyển khoản" else "Tiền mặt"

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { Button(onClick = onDismiss) { Text("ĐÓNG") } },
        dismissButton = {
            if (current?.role == "ADMIN") {
                TextButton(onClick = { showDelete = true }) { Text("XÓA BILL · ADMIN") }
            }
        },
        title = { Text("$tableName · ${bill.billNo}") },
        text = {
            LazyColumn {
                item {
                    Text("Mở: ${time(bill.openedAt)}")
                    Text("Đóng: ${bill.closedAt?.let { time(it) } ?: "--"}")
                    Text("Thanh toán: $methodText")
                    Text("Thu tiền: $cashier")
                    Text("Tổng bill: ${money(bill.total)}", fontWeight = FontWeight.Black)
                    Spacer(Modifier.height(8.dp))
                }
                items(batches) { batch ->
                    BillBatchDetail(vm, batch, employees)
                }
            }
        }
    )

    if (showDelete) {
        AlertDialog(
            onDismissRequest = { showDelete = false },
            title = { Text("XÓA BILL ${bill.billNo}") },
            text = {
                Column {
                    Text("Bill sẽ bị loại khỏi lịch sử và báo cáo doanh thu nhưng vẫn giữ dấu vết audit.")
                    OutlinedTextField(
                        value = deleteReason,
                        onValueChange = { deleteReason = it },
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                        label = { Text("Lý do xóa bắt buộc") }
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        vm.deleteBill(bill, deleteReason)
                        showDelete = false
                        onDismiss()
                    },
                    enabled = deleteReason.isNotBlank()
                ) { Text("XÁC NHẬN XÓA BILL") }
            },
            dismissButton = {
                TextButton(onClick = { showDelete = false }) { Text("HỦY") }
            }
        )
    }
}

@Composable
fun BillBatchDetail(vm: PosViewModel, batch: OrderBatchEntity, employees: List<EmployeeEntity>) {
    val lines by vm.items(batch.id).collectAsState(initial = emptyList())
    val orderer = employees.firstOrNull { it.id == batch.ordererId }?.name ?: batch.ordererId
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(
                "Đơn #${batch.sequence} · $orderer · ${time(batch.createdAt)}",
                fontWeight = FontWeight.Bold
            )
            lines.forEach { line ->
                Text("${line.qty} × ${line.itemNameSnapshot} · ${money(line.unitPriceSnapshot * line.qty)}")
                if (line.note.isNotBlank()) Text("  Ghi chú: ${line.note}", fontSize = 12.sp)
            }
            if (batch.status != "DRAFT" && batch.status != "CANCELLED") {
                OutlinedButton(
                    onClick = { vm.reprintKitchenBatch(batch) },
                    modifier = Modifier.padding(top = 8.dp)
                ) { Text("IN LẠI PHIẾU BẾP") }
            }
        }
    }
}

@Composable
fun DataHealth(vm: PosViewModel) {
    val current by vm.currentEmployee.collectAsState()
    val issues by vm.healthIssues.collectAsState()
    val message by vm.healthMessage.collectAsState()
    if (current?.role != "ADMIN") {
        Column {
            Header("Kiểm tra dữ liệu") { vm.screen.value = "MANAGE" }
            Text("Chỉ Admin được chạy kiểm tra dữ liệu.", Modifier.padding(20.dp), fontWeight = FontWeight.Bold)
        }
        return
    }
    Column {
        Header("Kiểm tra dữ liệu") { vm.screen.value = "MANAGE" }
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            Text("ĐỐI SOÁT HỆ THỐNG", fontWeight = FontWeight.Black, fontSize = 20.sp)
            Text(
                "Kiểm tra Payment ↔ Bill ↔ Session ↔ Customer ↔ Điểm. Không tự sửa dữ liệu.",
                Modifier.padding(top = 4.dp),
                fontSize = 12.sp
            )
            Button(
                onClick = { vm.runHealthCheck() },
                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)
            ) { Text("CHẠY KIỂM TRA") }
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp)) {
                    Text(message, fontWeight = FontWeight.Black)
                    if (issues.isEmpty() && message.startsWith("PASS")) {
                        Text("Không phát hiện lệch dữ liệu lõi.", Modifier.padding(top = 6.dp))
                    } else {
                        issues.forEach { issue ->
                            Text("• $issue", Modifier.padding(top = 5.dp), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        if (issues.any { it.startsWith("Session CLOSED còn đơn WAITING") }) {
                            Button(
                                onClick = { vm.reconcileLegacyWaiting() },
                                modifier = Modifier.fillMaxWidth().padding(top = 12.dp)
                            ) { Text("XỬ LÝ DỮ LIỆU CŨ") }
                            Text(
                                "Chỉ đối soát đơn WAITING thuộc session đã đóng; không sửa bill, payment, doanh thu hay điểm.",
                                Modifier.padding(top = 6.dp),
                                fontSize = 10.sp
                            )
                        }
                    }
                }
            }
            Text(
                "Nếu có cảnh báo, cần xác định nguyên nhân trước khi sửa hoặc chạy thử thật.",
                Modifier.padding(top = 12.dp),
                fontSize = 11.sp
            )
        }
    }
}

@Composable
fun Settings(vm: PosViewModel) {
    val a by vm.audits.collectAsState()
    val employees by vm.employees.collectAsState()
    val current by vm.currentEmployee.collectAsState()
    if (current?.role != "ADMIN") {
        Column {
            Header("Nhật ký hệ thống") { vm.screen.value = "MANAGE" }
            Text("Chỉ Admin được xem audit log.", Modifier.padding(20.dp), fontWeight = FontWeight.Bold)
        }
        return
    }
    Column {
        Header("Nhật ký hệ thống") { vm.screen.value = "MANAGE" }
        Text("Các thao tác gần nhất · không sửa/xóa từ giao diện", Modifier.padding(horizontal = 16.dp), fontSize = 11.sp)
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
            items(a) { event ->
                val actor = employees.firstOrNull { it.id == event.actorId }?.name ?: event.actorId ?: "SYSTEM"
                Card(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text("${time(event.occurredAt)} · ${event.action}", fontWeight = FontWeight.Black)
                        Text("Người thực hiện: $actor", fontSize = 12.sp)
                        Text("${event.entityType} · ${event.entityId}", fontSize = 11.sp)
                        if (event.payload.isNotBlank()) {
                            Text(event.payload, Modifier.padding(top = 3.dp), fontSize = 11.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun BankPaymentSettings(vm:PosViewModel){
    val context=LocalContext.current
    val owner=LocalLifecycleOwner.current
    val settings by vm.settings.collectAsState()
    fun enabled(key:String,default:Boolean)=settings.firstOrNull{it.key==key}?.value?.toBooleanStrictOrNull()?:default
    var permissionGranted by remember{mutableStateOf(NotificationAccess.isGranted(context))}
    DisposableEffect(owner){
        val observer=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_RESUME)permissionGranted=NotificationAccess.isGranted(context)}
        owner.lifecycle.addObserver(observer);onDispose{owner.lifecycle.removeObserver(observer)}
    }
    Column{
        Header("Thanh toán chuyển khoản"){vm.screen.value="MANAGE"}
        Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())){
            Text("THEO DÕI THÔNG BÁO NGÂN HÀNG",fontWeight=FontWeight.Black)
            SettingSwitch("Theo dõi thông báo ngân hàng",enabled("bank_notification_enabled",false)){vm.saveSetting("bank_notification_enabled",it.toString())}
            Card(Modifier.fillMaxWidth().padding(vertical=8.dp)){
                Column(Modifier.padding(14.dp)){
                    Text("Quyền đọc thông báo: ${if(permissionGranted)"Đã cấp" else "Chưa cấp"}",fontWeight=FontWeight.Bold)
                    if(!permissionGranted)Text("Chưa cấp quyền đọc thông báo ngân hàng. POS vẫn thanh toán thủ công bình thường.",fontSize=12.sp)
                    Button(onClick={context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))},modifier=Modifier.fillMaxWidth().padding(top=8.dp)){Text(if(permissionGranted)"MỞ CÀI ĐẶT QUYỀN" else "CẤP QUYỀN ĐỌC THÔNG BÁO")}
                }
            }
            Text("Ngân hàng hỗ trợ: Techcombank · Vietcombank · VietinBank",fontSize=12.sp)
            Text("Chỉ đọc notification từ package ngân hàng trong whitelist; không đọc SMS, Zalo hoặc ứng dụng khác.",fontSize=11.sp)
            SettingSwitch("Rung khi nhận tiền",enabled("bank_notification_vibrate",true)){vm.saveSetting("bank_notification_vibrate",it.toString())}
            SettingSwitch("Đọc số tiền bằng loa",enabled("bank_notification_tts",true)){vm.saveSetting("bank_notification_tts",it.toString())}
            HorizontalDivider(Modifier.padding(vertical=12.dp))
            Text("Chế độ xác nhận",fontWeight=FontWeight.Bold)
            Text("Phát hiện + nhân viên xác nhận (mặc định)\nKhông tự động đóng bill.",fontSize=12.sp)
            OutlinedButton(onClick={vm.screen.value="BANK_NOTIFICATION_TEST"},modifier=Modifier.fillMaxWidth().padding(top=14.dp)){Text("TEST THÔNG BÁO NGÂN HÀNG")}
        }
    }
}

@Composable private fun SettingSwitch(label:String,checked:Boolean,onChange:(Boolean)->Unit){
    Row(Modifier.fillMaxWidth().padding(vertical=8.dp),verticalAlignment=Alignment.CenterVertically){Text(label,Modifier.weight(1f));Switch(checked=checked,onCheckedChange=onChange)}
}

@Composable
fun BankNotificationTest(vm:PosViewModel){
    val context=LocalContext.current
    val events by vm.recentBankNotifications.collectAsState()
    val event=events.firstOrNull()
    var demoAmount by remember { mutableStateOf("127000") }
    var demoStatus by remember { mutableStateOf("") }
    Column{
        Header("Test thông báo ngân hàng"){vm.screen.value="BANK_PAYMENT_SETTINGS"}
        Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())){
            if(event==null)Text("Chưa có notification ngân hàng trong log test.") else Card(Modifier.fillMaxWidth()){
                Column(Modifier.padding(14.dp)){
                    Text("${event.bank?:"UNKNOWN"} · ${event.parserResult}",fontWeight=FontWeight.Black)
                    Text("Title: ${event.title}",fontSize=12.sp)
                    Text("Body: ${event.body}",fontSize=11.sp)
                    Text("Amount: ${event.amount?.let(::money)?:"—"}")
                    Text("Account: ${event.account?:"—"}",fontSize=12.sp)
                    Text("Transaction time: ${event.transactionTime?.let(::time)?:"—"}",fontSize=12.sp)
                    Text("Direction: ${event.direction?:"—"} · Match: ${event.matchStatus}",fontSize=12.sp)
                    Text("Content: ${event.content?:"—"}",fontSize=11.sp)
                }
            }
            Text("DEMO RUNG VÀ ĐỌC TIỀN · KHÔNG GHI DOANH THU",fontWeight=FontWeight.Black)
            OutlinedTextField(value=demoAmount,onValueChange={demoAmount=it.filter(Char::isDigit)},label={Text("Số tiền mô phỏng (VNĐ)")},modifier=Modifier.fillMaxWidth())
            Button(onClick={
                BankPaymentAnnouncer.announce(context,demoAmount.toLongOrNull()?:127000L,"Bàn 05",true,true)
                demoStatus="Đã gửi lệnh rung và đọc loa. Nếu không nghe, kiểm tra âm lượng media và giọng đọc tiếng Việt."
            },modifier=Modifier.fillMaxWidth().padding(top=12.dp)){Text("DEMO NHẬN TIỀN · RUNG + ĐỌC LOA")}
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                OutlinedButton(onClick={BankPaymentAnnouncer.announce(context,0L,null,true,false);demoStatus="Đã gửi lệnh rung"},modifier=Modifier.weight(1f)){Text("TEST RUNG")}
                OutlinedButton(onClick={BankPaymentAnnouncer.announce(context,demoAmount.toLongOrNull()?:127000L,null,false,true);demoStatus="Đã gửi lệnh đọc loa"},modifier=Modifier.weight(1f)){Text("TEST LOA")}
            }
            if(demoStatus.isNotBlank())Text(demoStatus,fontSize=12.sp)
            OutlinedButton(onClick={vm.clearBankNotificationLog()},modifier=Modifier.fillMaxWidth().padding(top=8.dp)){Text("XÓA LOG TEST")}
            Text("Log chỉ lưu cục bộ tối đa 20 notification ngân hàng gần nhất và có thể xóa tại đây.",Modifier.padding(top=10.dp),fontSize=11.sp)
        }
    }
}


@Composable
fun BuyGetManager(vm: PosViewModel) {
    val rules by vm.buyGetPromotions.collectAsState()
    val menu by vm.menu.collectAsState()
    var adding by remember { mutableStateOf(false) }
    Column {
        Header("Mua X tặng Y") { vm.screen.value = "PRICING" }
        Text("Mỗi order chỉ lấy ưu đãi có lợi nhất; quà hiển thị riêng cho bếp và hóa đơn.", Modifier.padding(horizontal = 16.dp, vertical = 6.dp), fontSize = 12.sp)
        Button(onClick = { adding = true }, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) { Text("＋ TẠO MUA–TẶNG") }
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
            items(rules) { rule ->
                val buy = menu.firstOrNull { it.id == rule.buyMenuItemId }?.name ?: "Món đã xoá"
                val gift = menu.firstOrNull { it.id == rule.giftMenuItemId }?.name ?: "Món đã xoá"
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(rule.name, fontWeight = FontWeight.Bold)
                            Text("Mua ${rule.buyQuantity} $buy · tặng ${rule.giftQuantity} $gift")
                            Text(if (rule.repeat) "Lặp lại khi đủ điều kiện" else "Chỉ áp dụng một lần", fontSize = 11.sp)
                        }
                        Switch(checked = rule.active, onCheckedChange = { vm.toggleBuyGetPromotion(rule) })
                    }
                }
            }
        }
    }
    if (adding) BuyGetRuleDialog(menu = menu.filter { it.active }, onDismiss = { adding = false }) { name,buy,buyQty,gift,giftQty,repeat ->
        vm.saveBuyGetPromotion(name,buy,buyQty,gift,giftQty,repeat,null,null)
        adding = false
    }
}

@Composable
private fun BuyGetRuleDialog(
    menu: List<MenuItemEntity>,
    onDismiss: () -> Unit,
    onSave: (String,String,Int,String,Int,Boolean) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var buyId by remember { mutableStateOf(menu.firstOrNull()?.id.orEmpty()) }
    var giftId by remember { mutableStateOf(menu.firstOrNull()?.id.orEmpty()) }
    var buyQty by remember { mutableStateOf("1") }
    var giftQty by remember { mutableStateOf("1") }
    var repeat by remember { mutableStateOf(true) }
    var selectingBuy by remember { mutableStateOf(true) }
    val buyName = menu.firstOrNull { it.id == buyId }?.name ?: "Chọn món cần mua"
    val giftName = menu.firstOrNull { it.id == giftId }?.name ?: "Chọn món tặng"
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Tạo chương trình mua–tặng") },
        confirmButton = {
            Button(
                onClick = { onSave(name,buyId,buyQty.toIntOrNull() ?: 0,giftId,giftQty.toIntOrNull() ?: 0,repeat) },
                enabled = name.isNotBlank() && buyId.isNotBlank() && giftId.isNotBlank() && (buyQty.toIntOrNull() ?: 0) > 0 && (giftQty.toIntOrNull() ?: 0) > 0
            ) { Text("LƯU") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("HỦY") } },
        text = {
            LazyColumn {
                item {
                    OutlinedTextField(name,{name=it},Modifier.fillMaxWidth(),label={Text("Tên chương trình")})
                    Text("Món cần mua", Modifier.padding(top=8.dp), fontWeight=FontWeight.Bold)
                    OutlinedButton(onClick={selectingBuy=true},Modifier.fillMaxWidth()){Text(buyName)}
                    OutlinedTextField(buyQty,{buyQty=it.filter(Char::isDigit).take(4)},Modifier.fillMaxWidth(),label={Text("Số lượng X")})
                    Text("Món tặng", Modifier.padding(top=8.dp), fontWeight=FontWeight.Bold)
                    OutlinedButton(onClick={selectingBuy=false},Modifier.fillMaxWidth()){Text(giftName)}
                    OutlinedTextField(giftQty,{giftQty=it.filter(Char::isDigit).take(4)},Modifier.fillMaxWidth(),label={Text("Số lượng Y")})
                    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("Lặp lại khi đủ điều kiện",Modifier.weight(1f));Switch(repeat,{repeat=it})}
                    Text(if (buyId==giftId) "Cùng món: hệ thống thêm đủ món nhận được và giảm 100% phần quà." else "Khác món: món quà được tự thêm vào order.",fontSize=11.sp)
                    Text("Chọn ${if(selectingBuy) "món cần mua" else "món tặng"}",Modifier.padding(top=8.dp),fontWeight=FontWeight.Bold)
                }
                items(menu){ item ->
                    TextButton(onClick={if(selectingBuy)buyId=item.id else giftId=item.id},modifier=Modifier.fillMaxWidth()){Text("${item.name} · ${money(item.price)}",Modifier.fillMaxWidth())}
                }
            }
        }
    )
}
