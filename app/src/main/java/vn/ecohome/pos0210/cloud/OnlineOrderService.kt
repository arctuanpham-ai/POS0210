package vn.ecohome.pos0210.cloud

import android.Manifest
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import vn.ecohome.pos0210.DeliveryAnnouncer
import vn.ecohome.pos0210.MainActivity
import vn.ecohome.pos0210.data.PosDatabase
import java.util.Date

/**
 * Đơn online cho nhân viên ngay trên app POS: nghe users/{uid}/stores/0210/online_orders (24 giờ gần nhất),
 * phát chuông + đọc giọng qua loa của máy (loa bluetooth nếu đang kết nối) khi có đơn mới, nhắc lại mỗi 45 giây tới khi xử lý,
 * và đổi trạng thái bằng transaction giống hệt trang quản lý web (kèm trả lượt giới hạn 2 đơn chờ của khách).
 * Chỉ chạy khi tiến trình app còn sống. Không đọc/ghi bill, doanh thu hay dữ liệu bán hàng.
 */
object OnlineOrderService {
    private const val PREFS = "pos0210_online_orders"
    private const val CHANNEL = "online_orders_v1"
    private const val REPEAT_MS = 45_000L
    private var job: Job? = null
    private var registration: ListenerRegistration? = null
    private var attachedUid: String? = null
    private var attachedAt = 0L
    private val seen = HashSet<String>()
    private var lastAnnounce = 0L
    private val busy = HashSet<String>()

    private val _orders = MutableStateFlow<List<OnlineOrder>>(emptyList())
    val orders: StateFlow<List<OnlineOrder>> = _orders
    private val _error = MutableStateFlow("")
    val error: StateFlow<String> = _error
    private val SOS_UNITS = intArrayOf(1, 1, 1, 1, 1, 3, 3, 1, 3, 1, 3, 3, 1, 1, 1, 1, 1, 7)
    private val _flash = MutableStateFlow(false)
    /** true đúng lúc đèn nháy sáng: màn hình nháy trắng đồng bộ với đèn pin. */
    val flash: StateFlow<Boolean> = _flash
    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected

    /** Kiểu báo đơn mới: SOUND = bíp + đọc giọng + rung; LIGHT = im lặng, chỉ đèn pin nháy + rung + đèn ngoài; BOTH = cả hai. */
    fun mode(context: Context): String = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("mode", "SOUND") ?: "SOUND"
    fun setMode(context: Context, value: String) { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("mode", value).apply(); if (!lightOn(context)) lights(context, false) }
    private fun soundOn(context: Context) = mode(context) != "LIGHT"
    private fun lightOn(context: Context) = mode(context) != "SOUND"
    /** Đèn ngoài (ổ cắm/relay WiFi như Shelly, Sonoff Tasmota): gọi đường dẫn http bật khi có đơn chờ nhận, tắt khi hết. */
    fun lampUrl(context: Context, on: Boolean) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(if (on) "lamp_on" else "lamp_off", "").orEmpty()
    fun setLampUrls(context: Context, onUrl: String, offUrl: String) { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("lamp_on", onUrl.trim()).putString("lamp_off", offUrl.trim()).apply() }
    fun testLamp(app: Application) { CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch { callLamp(lampUrl(app, true)); delay(3000L); callLamp(lampUrl(app, false)); _error.value = "" } }
    private fun callLamp(url: String) {
        if (!url.startsWith("http")) return
        runCatching { (java.net.URL(url).openConnection() as java.net.HttpURLConnection).apply { connectTimeout = 3000; readTimeout = 3000 }.also { it.responseCode; it.disconnect() } }
            .onFailure { _error.value = "Không gọi được đèn ngoài: ${it.message}" }
    }
    private var torchState = false
    private var lampState = false
    private fun setTorch(context: Context, on: Boolean) {
        if (torchState == on) return
        runCatching {
            val cm = context.getSystemService(Context.CAMERA_SERVICE) as android.hardware.camera2.CameraManager
            val id = cm.cameraIdList.firstOrNull { cm.getCameraCharacteristics(it).get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE) == true } ?: return
            cm.setTorchMode(id, on); torchState = on
        }
    }
    /** Bật/tắt toàn bộ đèn cảnh báo (đèn pin nháy do vòng lặp riêng; đèn ngoài chỉ gọi khi đổi trạng thái). */
    private fun lights(context: Context, on: Boolean) {
        if (!on) setTorch(context, false)
        if (on != lampState) {
            lampState = on
            val url = lampUrl(context, on)
            if (url.isNotBlank()) CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch { callLamp(url) }
        }
    }

    private fun ms(v: Any?): Long? = when (v) { is Timestamp -> v.toDate().time; is Number -> v.toLong(); is Date -> v.time; else -> null }

    fun start(app: Application, scope: CoroutineScope) {
        if (job?.isActive == true) return
        job = scope.launch {
            var tick = 0
            launch {
                // Nháy kiểu SOS (… --- …) bằng đèn pin và toàn màn hình, im lặng, tới khi mọi đơn mới được nhận/từ chối.
                var idx = 0
                while (isActive) {
                    val waiting = _orders.value.any { it.status == OnlineOrderRules.NEW }
                    if (waiting && lightOn(app)) {
                        val on = idx % 2 == 0
                        setTorch(app, on); _flash.value = on
                        delay(SOS_UNITS[idx] * 220L)
                        idx = (idx + 1) % SOS_UNITS.size
                    } else { idx = 0; setTorch(app, false); _flash.value = false; delay(500L) }
                }
            }
            while (isActive) {
                runCatching { ensureAttached(app) }.onFailure { _error.value = it.message ?: it.javaClass.simpleName }
                runCatching { remindAndSweep(app) }
                tick++
                delay(15_000L)
            }
        }
    }

    private suspend fun ensureAttached(app: Application) {
        val stale = System.currentTimeMillis() - attachedAt > 6 * 3_600_000L
        if (registration != null && !stale && FirebaseCloudSync.currentUid(app) == attachedUid) return
        registration?.remove(); registration = null; attachedUid = null; _connected.value = false
        val enabled = PosDatabase.get(app).dao().cloudSyncStateSnapshot()?.enabled == true
        if (!enabled) { _error.value = "Đồng bộ cloud đang tắt: vào Quản lý > Đồng bộ cloud để bật, rồi đơn online mới về máy."; return }
        val config = FirebaseCloudSync.config(app)
        if (!config.valid) { _error.value = "Chưa cài cấu hình Firebase trong app."; return }
        // Khởi tạo app Firebase trước (nếu chưa có) rồi mới lấy người dùng đã đăng nhập.
        val fbApp = FirebaseCloudSync.firebaseApp(app, config)
        val uid = com.google.firebase.auth.FirebaseAuth.getInstance(fbApp).currentUser?.uid
        if (uid == null) { _error.value = "Chưa đăng nhập Firebase trên máy này: vào Đồng bộ cloud, đăng nhập rồi đồng bộ 1 lần."; return }
        _error.value = ""
        val fs = FirebaseFirestore.getInstance(fbApp)
        val since = Timestamp(Date(System.currentTimeMillis() - 24 * 3_600_000L))
        val query = fs.collection("users").document(uid).collection("stores").document("0210").collection("online_orders")
            .whereGreaterThanOrEqualTo("createdAt", since).orderBy("createdAt", Query.Direction.DESCENDING)
        attachedAt = System.currentTimeMillis(); attachedUid = uid
        registration = query.addSnapshotListener { snap, err ->
            if (err != null) { _error.value = "Không nghe được đơn online: ${err.message}"; _connected.value = false; return@addSnapshotListener }
            if (snap == null) return@addSnapshotListener
            _error.value = ""; _connected.value = true
            val list = snap.documents.mapNotNull { d -> d.data?.let { OnlineOrderRules.fromMap(d.id, it, ::ms) } }.filterNot { OnlineOrderRules.isTest(it) }
            _orders.value = list
            val fresh = OnlineOrderRules.unseenNew(list, seen)
            if (fresh.isNotEmpty()) {
                seen.addAll(fresh.map { it.id })
                announce(app, fresh)
            }
        }
    }

    private fun announce(app: Application, fresh: List<OnlineOrder>) {
        lastAnnounce = System.currentTimeMillis()
        val text = OnlineOrderRules.announceText(fresh)
        DeliveryAnnouncer.announce(app, text, soundOn(app), vibrate = true, beep = soundOn(app))
        notify(app, fresh.size, text)
        fresh.take(5).forEach { ZaloNotifier.send(app, ZaloNotifier.orderText(it)) }
    }

    private fun remindAndSweep(app: Application) {
        val now = System.currentTimeMillis()
        val list = _orders.value
        val waiting = list.filter { it.status == OnlineOrderRules.NEW }
        if (waiting.isNotEmpty() && now - lastAnnounce >= REPEAT_MS) {
            lastAnnounce = now
            DeliveryAnnouncer.announce(app, "Còn ${waiting.size} đơn online chưa nhận.", soundOn(app), vibrate = true, beep = soundOn(app))
        }
        if (_connected.value) OnlineOrderRules.overdueToClose(list, now).forEach { o ->
            CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch { runCatching { apply(app, o.id, "expire", "POS") } }
        }
    }

    private fun notify(context: Context, count: Int, text: String) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        if (Build.VERSION.SDK_INT >= 26) {
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(NotificationChannel(CHANNEL, "Đơn online", NotificationManager.IMPORTANCE_HIGH))
        }
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("POS 0210 · đơn online mới").setContentText(text).setAutoCancel(true).setContentIntent(open)
            .setPriority(NotificationCompat.PRIORITY_HIGH).build()
        runCatching { NotificationManagerCompat.from(context).notify(7001, n) }
    }

    /** Đổi trạng thái trong MỘT transaction (đọc lại đơn để tránh hai máy bấm cùng lúc; trả lượt giới hạn khi đóng đơn). */
    suspend fun apply(app: Application, orderId: String, action: String, who: String, reason: String = ""): Result<Unit> = runCatching {
        if (!busy.add(orderId)) return@runCatching
        try {
            val uid = attachedUid ?: FirebaseCloudSync.currentUid(app) ?: error("Chưa đăng nhập Firebase")
            val fs = FirebaseFirestore.getInstance(FirebaseCloudSync.firebaseApp(app, FirebaseCloudSync.config(app)))
            val root: DocumentReference = fs.collection("users").document(uid).collection("stores").document("0210")
            val orderRef = root.collection("online_orders").document(orderId)
            fs.runTransaction { tx ->
                val snap = tx.get(orderRef)
                if (!snap.exists()) throw IllegalStateException("Đơn không còn tồn tại.")
                val current = OnlineOrderRules.fromMap(snap.id, snap.data.orEmpty(), ::ms)
                val t = OnlineOrderRules.transition(current, action, System.currentTimeMillis(), who, reason)
                val limitRefs = if (t.releasesLimit) OnlineOrderRules.limitKeys(current).map { root.collection("online_limits").document(it) } else emptyList()
                val limitSnaps = limitRefs.map { tx.get(it) }
                tx.update(orderRef, t.patch.mapValues { (k, v) -> if (k.endsWith("At") && v is Long) Timestamp(Date(v)) else v })
                limitSnaps.forEachIndexed { i, ls -> if (ls.exists()) tx.update(limitRefs[i], "pending", OnlineOrderRules.releasedCount(ls.get("pending"))) }
                null
            }.await()
        } finally { busy.remove(orderId) }
    }

    // ---- Hồ sơ khách theo số điện thoại: lịch sử mua + ghi chú sở thích (users/{uid}/stores/0210/customerNotes/{sđt}) ----
    private val profileCache = HashMap<String, Pair<Long, CustomerProfile>>()
    private suspend fun storeRoot(app: Application): DocumentReference? {
        val uid = attachedUid ?: FirebaseCloudSync.currentUid(app) ?: return null
        val fs = FirebaseFirestore.getInstance(FirebaseCloudSync.firebaseApp(app, FirebaseCloudSync.config(app)))
        return fs.collection("users").document(uid).collection("stores").document("0210")
    }
    /** Đọc đơn cũ (chỉ lọc theo số điện thoại, không cần chỉ mục) + ghi chú. Cache 60 giây mỗi số để thẻ đơn không đọc lại liên tục. */
    suspend fun customerProfile(app: Application, phone: String, excludeCode: String, force: Boolean = false): Result<CustomerProfile> = runCatching {
        val key = "$phone|$excludeCode"
        val cached = profileCache[key]
        if (!force && cached != null && System.currentTimeMillis() - cached.first < 60_000L) return@runCatching cached.second
        val root = storeRoot(app) ?: error("Chưa đăng nhập Firebase")
        val ordersSnap = root.collection("online_orders").whereEqualTo("phone", phone).limit(100).get().await()
        val orders = ordersSnap.documents.mapNotNull { d -> d.data?.let { OnlineOrderRules.fromMap(d.id, it, ::ms) } }
        val noteDoc = root.collection("customerNotes").document(phone).get().await()
        val note = noteDoc.data?.let { CustomerNote(it["note"]?.toString().orEmpty(), ms(it["updatedAt"]) ?: 0L, it["updatedBy"]?.toString().orEmpty()) } ?: CustomerNote()
        CustomerProfiles.build(phone, orders, note, excludeCode).also { profileCache[key] = System.currentTimeMillis() to it }
    }
    /** Lưu ghi chú sở thích của khách (rỗng = xoá ghi chú). */
    suspend fun saveCustomerNote(app: Application, phone: String, name: String, note: String, who: String): Result<Unit> = runCatching {
        val root = storeRoot(app) ?: error("Chưa đăng nhập Firebase")
        val ref = root.collection("customerNotes").document(phone)
        val text = note.trim().take(500)
        if (text.isEmpty()) ref.delete().await()
        else ref.set(mapOf("phone" to phone, "name" to name.take(50), "note" to text, "updatedAt" to Timestamp(Date()), "updatedBy" to who)).await()
        profileCache.clear()
    }
}
