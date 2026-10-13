package vn.ecohome.pos0210.cloud

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentChange
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import vn.ecohome.pos0210.ShiftRules

/**
 * Thông báo cho chủ (không dùng Cloud Functions): máy bật tùy chọn này nghe collection shifts trên Firestore;
 * ca chuyển "pending_review" hoặc lệch tiền quá ngưỡng thì hiện thông báo cục bộ. Chỉ chạy khi app đang sống và có mạng.
 */
object ShiftAlerts {
    private const val PREFS = "pos0210_shift_alerts"
    private const val CHANNEL = "shift_alerts"
    private var registration: ListenerRegistration? = null
    private var startedUid: String? = null

    fun enabled(context: Context): Boolean = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", false)

    fun setEnabled(context: Context, value: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("enabled", value).apply()
        if (value) start(context) else stop()
    }

    fun stop() {
        registration?.remove(); registration = null; startedUid = null
    }

    fun start(context: Context) {
        if (!enabled(context)) return
        val app = context.applicationContext
        runCatching {
            val cfg = FirebaseCloudSync.config(app)
            if (!cfg.valid) return
            val fbApp = FirebaseCloudSync.firebaseApp(app, cfg)
            val uid = FirebaseAuth.getInstance(fbApp).currentUser?.uid ?: return
            if (startedUid == uid && registration != null) return
            stop()
            startedUid = uid
            registration = FirebaseFirestore.getInstance(fbApp).collection("users").document(uid).collection("stores").document("0210")
                .collection("shifts").addSnapshotListener { snap, err ->
                    if (err != null || snap == null) return@addSnapshotListener
                    val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    val recent = System.currentTimeMillis() - 24 * 3_600_000L
                    for (c in snap.documentChanges) {
                        if (c.type == DocumentChange.Type.REMOVED) continue
                        val d = c.document
                        if (d.metadata.hasPendingWrites()) continue
                        val updated = d.getLong("updatedAt") ?: 0L
                        if (updated < recent) continue
                        if (!ShiftRules.needsAlert(d.getString("status"), d.getLong("diff"))) continue
                        if (prefs.getLong("n_" + d.id, 0L) >= updated) continue
                        prefs.edit().putLong("n_" + d.id, updated).apply()
                        notify(app, d.id.hashCode(), d.getString("staffName") ?: "", d.getString("date") ?: "", d.getString("status") ?: "", d.getLong("diff"))
                    }
                }
        }
    }

    private fun notify(context: Context, id: Int, staff: String, date: String, status: String, diff: Long?) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Ca làm cần chú ý", NotificationManager.IMPORTANCE_HIGH))
        }
        val text = buildString {
            append("Ca $staff ngày $date")
            if (status == "pending_review") append(" cần xem lại")
            if (diff != null && diff != 0L && kotlin.math.abs(diff) > ShiftRules.DEFAULT_DIFF_THRESHOLD) append(" · lệch tiền ${diff}đ")
        }
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("POS 0210 · ca làm cần chú ý")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(id, n) }
    }
}
