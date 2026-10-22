package vn.ecohome.pos0210.cloud

import android.content.Context

/** Công tắc chặn chiều cloud → máy POS khi đồng bộ (kéo menu, phiếu chi web, dữ liệu tài chính). Mặc định CHẶN để một máy lạ không kéo/đẩy sai dữ liệu. */
object CloudPullGuard {
    private const val PREFS = "pos0210_cloud_guard"
    fun blocked(c: Context): Boolean = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("block_pull", true)
    fun setBlocked(c: Context, v: Boolean) { c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("block_pull", v).apply() }
    /** Máy gốc: xoá bộ nhớ "đã ghi" để lần đồng bộ tới ghi lại toàn bộ dữ liệu của máy này lên cloud. */
    fun forgetAcks(c: Context) { c.getSharedPreferences("pos0210_cloud_ack_v1", Context.MODE_PRIVATE).edit().clear().apply() }
}
