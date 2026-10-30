package vn.ecohome.pos0210.cloud

import android.app.Application
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import vn.ecohome.pos0210.data.PosDatabase
import vn.ecohome.pos0210.data.PosRepository

/**
 * Web ghi giá trị đơn thực trên app + tiền thực nhận vào users/{uid}/stores/0210/foodAppSettle/{billId} (applied=false).
 * Máy POS lắng nghe các tài liệu chưa xử lý, ghi vào bill (xem PosRepository.applyFoodAppWebEntry) rồi đánh dấu applied=true.
 * Chỉ đọc đúng những tài liệu applied=false nên tốn rất ít lượt đọc; không kéo bill nào từ cloud về.
 */
object FoodAppWebInbox {
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
                                    val col = FirebaseFirestore.getInstance(FirebaseCloudSync.firebaseApp(app, config))
                                        .collection("users").document(uid).collection("stores").document("0210").collection("foodAppSettle")
                                    registration = col.whereEqualTo("applied", false).addSnapshotListener { snap, error ->
                                        if (error != null || snap == null) return@addSnapshotListener
                                        val docs = snap.documents.toList()
                                        if (docs.isNotEmpty()) scope.launch(Dispatchers.IO) { docs.forEach { handle(app, it) } }
                                    }
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

    private suspend fun handle(app: Application, d: DocumentSnapshot) {
        val billId = d.getString("billId") ?: d.id
        val orderValue = d.getLong("orderValue") ?: return
        val received = d.getLong("received") ?: return
        val by = d.getString("by").orEmpty()
        val commission = d.getLong("commission") ?: 0L
        val vat = d.getLong("vat") ?: 0L
        val pit = d.getLong("pit") ?: 0L
        val db = PosDatabase.get(app)
        val repo = PosRepository(db)
        val result = runCatching { repo.applyFoodAppWebEntry(billId, orderValue, received, by, commission, vat, pit) }
        if (result.isFailure) return // lỗi tạm thời: giữ applied=false để thử lại lần sau
        val note = if (result.getOrNull() == true) "ok" else "skipped"
        runCatching { d.reference.set(mapOf("applied" to true, "appliedAt" to System.currentTimeMillis(), "result" to note), SetOptions.merge()) }
        if (result.getOrNull() == true) {
            db.dao().markCloudDirty()
            runCatching { FirebaseCloudSync.syncDashboardNow(app) }
        }
    }
}
