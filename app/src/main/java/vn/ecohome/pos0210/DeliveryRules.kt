package vn.ecohome.pos0210

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

/** Luật giao đồ từng món. Chỉ tính trên số liệu có sẵn trên máy, không đụng tiền hay bill. */
object DeliveryRules {
    data class Line(val qty: Int, val deliveredQty: Int, val isAdjustment: Boolean = false)

    private fun real(lines: List<Line>) = lines.filter { !it.isAdjustment && it.qty > 0 }

    /** Tổng số phần còn chưa giao của một đơn. */
    fun remaining(lines: List<Line>) = real(lines).sumOf { (it.qty - it.deliveredQty).coerceAtLeast(0) }

    /** Đơn có món và mọi món đã giao đủ. */
    fun allDelivered(lines: List<Line>) = real(lines).isNotEmpty() && remaining(lines) == 0

    /** Số lượng đã giao luôn nằm trong 0..qty. */
    fun clamp(delivered: Int, qty: Int) = delivered.coerceIn(0, qty.coerceAtLeast(0))
}

/** Nhắc giao đồ theo thời gian khách chờ: tính ra đơn nào đến hạn nhắc, không tự phát âm thanh. */
object DeliveryReminder {
    data class Pending(val key: String, val label: String, val sentAt: Long, val remaining: Int)
    data class Due(val key: String, val label: String, val minutes: Long, val remaining: Int)

    fun due(pending: List<Pending>, now: Long, firstMinutes: Long, repeatMinutes: Long, lastReminded: Map<String, Long>): List<Due> =
        pending.mapNotNull { p ->
            val waited = (now - p.sentAt).coerceAtLeast(0L)
            if (waited < firstMinutes * 60_000L) return@mapNotNull null
            val last = lastReminded[p.key]
            if (last != null && now - last < repeatMinutes * 60_000L) return@mapNotNull null
            Due(p.key, p.label, waited / 60_000L, p.remaining)
        }.sortedByDescending { it.minutes }

    /** Câu đọc bằng giọng tiếng Việt. */
    fun speech(dues: List<Due>): String = when {
        dues.isEmpty() -> ""
        dues.size == 1 -> {
            val d = dues[0]
            "${d.label} đã chờ ${d.minutes} phút" + (if (d.remaining > 0) ", còn ${d.remaining} món chưa giao" else "") + ". Vui lòng giao đồ cho khách."
        }
        else -> "Có ${dues.size} đơn chờ giao: " + dues.take(3).joinToString(", ") { "${it.label} ${it.minutes} phút" } + ". Vui lòng giao đồ cho khách."
    }
}

/** Ai được sửa hình thức thanh toán: quản lý bất kỳ lúc nào; người thu tiền trong vài phút đầu để sửa nhầm tay. */
object PaymentFixPolicy {
    const val WINDOW_MINUTES = 10L
    fun canFix(role: String, employeeId: String, cashierId: String, paidAt: Long, now: Long): Boolean =
        role == "ADMIN" || role == "MANAGER" ||
            (employeeId == cashierId && now - paidAt in 0..(WINDOW_MINUTES * 60_000L))
}

/** Còi + rung + đọc giọng tiếng Việt (nếu máy có giọng vi-VN). Mọi lỗi đều bị nuốt để không ảnh hưởng bán hàng. */
object DeliveryAnnouncer {
    fun announce(context: Context, text: String, speak: Boolean) {
        runCatching {
            val vibrator = if (Build.VERSION.SDK_INT >= 31) context.getSystemService(VibratorManager::class.java).defaultVibrator
            else @Suppress("DEPRECATION") (context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)
            val pattern = longArrayOf(0, 300, 150, 300, 150, 300)
            if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
            else @Suppress("DEPRECATION") vibrator.vibrate(pattern, -1)
        }
        runCatching {
            val tone = ToneGenerator(AudioManager.STREAM_MUSIC, 90)
            tone.startTone(ToneGenerator.TONE_PROP_BEEP2, 600)
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ runCatching { tone.release() } }, 900)
        }
        if (!speak || text.isBlank()) return
        runCatching {
            val holder = arrayOfNulls<TextToSpeech>(1)
            val engine = TextToSpeech(context.applicationContext) { status ->
                val e = holder[0]
                if (status != TextToSpeech.SUCCESS || e == null) { holder[0]?.shutdown(); return@TextToSpeech }
                val r = e.setLanguage(Locale("vi", "VN"))
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) { e.shutdown(); return@TextToSpeech }
                e.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) = Unit
                    override fun onDone(utteranceId: String?) { e.shutdown() }
                    @Deprecated("Deprecated in Java") override fun onError(utteranceId: String?) { e.shutdown() }
                })
                e.speak(text, TextToSpeech.QUEUE_ADD, null, "delivery-reminder")
            }
            holder[0] = engine
        }
    }
}
