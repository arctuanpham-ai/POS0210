package vn.ecohome.pos0210.cloud

import android.app.Application
import android.content.Context
import android.os.Build
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import vn.ecohome.pos0210.data.PosDatabase

/**
 * Quyết định có chạy lệnh đồng bộ từ xa hay không. Hàm thuần để test.
 * - Lệnh đã xử lý (requestedAt <= handledAt) bị bỏ qua, nên app khởi động lại không chạy lại lệnh cũ.
 * - Lệnh quá cũ (> 10 phút) bị bỏ qua, tránh đồng bộ bất ngờ khi mở app sau nhiều giờ.
 * - Lệnh có mốc ở tương lai quá 10 phút (đồng hồ web lệch nặng) bị bỏ qua để không khoá các lệnh sau.
 */
object RemoteSyncPolicy {
    const val MAX_AGE_MS = 10 * 60_000L
    fun shouldRun(requestedAt: Long?, handledAt: Long, now: Long): Boolean {
        if (requestedAt == null || requestedAt <= 0L) return false
        if (requestedAt <= handledAt) return false
        if (now - requestedAt > MAX_AGE_MS) return false
        if (requestedAt - now > MAX_AGE_MS) return false
        return true
    }
}

/**
 * Lắng nghe tài liệu users/{uid}/stores/0210/commands/sync. Web ghi requestedAt khi chủ quán bấm "Yêu cầu đồng bộ";
 * app nhận, xếp lịch đồng bộ đầy đủ ngay (có mạng là chạy) và ghi receivedAt để web biết máy quán đã nhận lệnh.
 * Chỉ hoạt động khi tiến trình app còn sống; nếu hệ điều hành đã dừng app thì vẫn còn chu kỳ 15 phút làm dự phòng.
 * Không ghi, sửa hay xoá dữ liệu bán hàng, chỉ gọi đúng đường đồng bộ sẵn có.
 */
object RemoteSyncCommand {
    private const val PREFS = "pos0210_remote_sync_v1"
    private const val KEY_HANDLED = "handledAt"
    private var job: Job? = null

    fun start(app: Application, scope: CoroutineScope) {
        if (job?.isActive == true) return
        job = scope.launch {
            var registration: ListenerRegistration? = null
            var attachedUid: String? = null
            try {
                while (isActive) {
                    runCatching {
                        val enabled = PosDatabase.get(app).dao().cloudSyncStateSnapshot()?.enabled == true
                        val uid = if (enabled) FirebaseCloudSync.currentUid(app) else null
                        if (uid != attachedUid) {
                            registration?.remove(); registration = null; attachedUid = null
                            if (uid != null) {
                                val config = FirebaseCloudSync.config(app)
                                if (config.valid) {
                                    val doc = FirebaseFirestore.getInstance(FirebaseCloudSync.firebaseApp(app, config))
                                        .collection("users").document(uid).collection("stores").document("0210")
                                        .collection("commands").document("sync")
                                    registration = attach(app, doc)
                                    attachedUid = uid
                                }
                            }
                        }
                    }
                    delay(60_000L)
                }
            } finally {
                registration?.remove()
            }
        }
    }

    private fun attach(app: Application, doc: DocumentReference): ListenerRegistration =
        doc.addSnapshotListener { snapshot, error ->
            if (error != null || snapshot == null || !snapshot.exists()) return@addSnapshotListener
            val requestedAt = snapshot.getLong("requestedAt")
            val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val now = System.currentTimeMillis()
            if (!RemoteSyncPolicy.shouldRun(requestedAt, prefs.getLong(KEY_HANDLED, 0L), now)) return@addSnapshotListener
            prefs.edit().putLong(KEY_HANDLED, requestedAt!!).commit()
            val request = OneTimeWorkRequestBuilder<FirebaseSyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(app).enqueueUniqueWork("pos0210-remote-sync", ExistingWorkPolicy.KEEP, request)
            doc.set(mapOf("receivedAt" to now, "receivedFor" to requestedAt, "device" to Build.MODEL), SetOptions.merge())
            // Web yêu cầu thêm "menu": đẩy lại toàn bộ nhóm món + món và ảnh (kèm ảnh nhỏ) từ máy này. Chỉ đọc menu trên máy.
            if (snapshot.getString("scope") == "menu") pushMenu(app, doc, requestedAt)
        }

    private fun pushMenu(app: Application, doc: DocumentReference, requestedAt: Long) {
        CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            val result = runCatching {
                val dao = PosDatabase.get(app).dao()
                val now = System.currentTimeMillis()
                val cats = dao.allCategoriesSnapshot(); val items = dao.allMenuSnapshot()
                cats.forEach { dao.enqueueSync(vn.ecohome.pos0210.data.SyncQueueEntity(java.util.UUID.randomUUID().toString(), "MENU_CATEGORY", it.id, "UPSERT", "", now, now)) }
                items.forEach { dao.enqueueSync(vn.ecohome.pos0210.data.SyncQueueEntity(java.util.UUID.randomUUID().toString(), "MENU_ITEM", it.id, "UPSERT", "", now, now)) }
                dao.audit(vn.ecohome.pos0210.data.AuditEventEntity(java.util.UUID.randomUUID().toString(), "MENU", "ALL", "CLOUD_FULL_SYNC_REMOTE", null, "WEB", now, "categories=${cats.size} items=${items.size}"))
                FirebaseCloudSync.enqueueCatalog(app)
                val uid = FirebaseCloudSync.currentUid(app) ?: error("Chưa đăng nhập Firebase")
                val fs = FirebaseFirestore.getInstance(FirebaseCloudSync.firebaseApp(app, FirebaseCloudSync.config(app)))
                val media = CloudMediaSync.uploadLocal(app, fs, uid)
                mapOf("menuDoneFor" to requestedAt, "menuDoneAt" to System.currentTimeMillis(), "menuCategories" to cats.size, "menuItems" to items.size,
                    "mediaUploaded" to media.uploaded, "mediaSkipped" to media.skipped, "mediaErrors" to media.errors, "menuError" to (media.firstError ?: ""))
            }.getOrElse { mapOf("menuDoneFor" to requestedAt, "menuDoneAt" to System.currentTimeMillis(), "menuError" to (it.message ?: it.javaClass.simpleName)) }
            runCatching { doc.set(result, SetOptions.merge()) }
        }
    }
}
