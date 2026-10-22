package vn.ecohome.pos0210

import android.app.Application
import androidx.room.withTransaction
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import vn.ecohome.pos0210.cloud.FirebaseCloudSync
import vn.ecohome.pos0210.data.PosDatabase
import java.util.Calendar

/**
 * Chỉ chạy ở bản DEV.
 * 1) Cứ 5 phút kéo menu/tài chính MỚI NHẤT từ cloud về máy (một chiều, chỉ đọc).
 * 2) Mọi dữ liệu tạo trên máy DEV đều là TEST (chế độ thử bị khoá bật); tự xoá sạch dữ liệu TEST:
 *    khi mở app sang ngày mới và mỗi ngày từ 23:00 trở đi, nên không tồn tại qua đêm.
 */
object DevAutopilot {
    private const val PREFS = "pos0210_dev_autopilot"
    private fun dayKey(c: Calendar = Calendar.getInstance()) = c.get(Calendar.YEAR) * 1000 + c.get(Calendar.DAY_OF_YEAR)

    fun start(app: Application, scope: CoroutineScope) {
        scope.launch {
            while (true) {
                runCatching { FirebaseCloudSync.devPullNow(app) }
                runCatching { purgeIfDue(app) }
                delay(5 * 60_000L)
            }
        }
    }

    private suspend fun purgeIfDue(app: Application) {
        val prefs = app.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
        val now = Calendar.getInstance()
        val today = dayKey(now)
        val lastDay = prefs.getInt("last_purge_day", -1)
        val lastEvening = prefs.getInt("last_evening_purge_day", -1)
        val newDay = lastDay != today
        val evening = now.get(Calendar.HOUR_OF_DAY) >= 23 && lastEvening != today
        if (!newDay && !evening) return
        val db = PosDatabase.get(app)
        val dao = db.dao()
        db.withTransaction {
            dao.deleteTestBillAdjustments(); dao.deleteTestPayments(); dao.deleteTestBills()
            dao.deleteTestOrderItems(); dao.deleteTestBatches(); dao.deleteTestSessions(); dao.deleteTestAttendances()
        }
        prefs.edit().putInt("last_purge_day", today).apply { if (evening) putInt("last_evening_purge_day", today) }.apply()
    }
}
