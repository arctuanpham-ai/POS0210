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
    data class Pending(val key: String, val label: String, val sentAt: Long, val remaining: Int, val detail: String = "")
    data class Due(val key: String, val label: String, val minutes: Long, val remaining: Int, val detail: String = "")

    /**
     * Đến hạn nhắc: chờ đủ firstMinutes; lặp lại sau repeatMinutes (0 = chỉ nhắc một lần); mỗi bàn tối đa maxCount lần.
     * key nên là MÃ BÀN/PHIÊN (không phải mã từng đơn) để một bàn chỉ bị nhắc một lần mỗi chu kỳ.
     */
    fun due(
        pending: List<Pending>, now: Long, firstMinutes: Long, repeatMinutes: Long, lastReminded: Map<String, Long>,
        counts: Map<String, Int> = emptyMap(), maxCount: Int = Int.MAX_VALUE,
    ): List<Due> =
        pending.mapNotNull { p ->
            val waited = (now - p.sentAt).coerceAtLeast(0L)
            if (waited < firstMinutes * 60_000L) return@mapNotNull null
            if ((counts[p.key] ?: 0) >= maxCount) return@mapNotNull null
            val last = lastReminded[p.key]
            if (last != null && (repeatMinutes <= 0L || now - last < repeatMinutes * 60_000L)) return@mapNotNull null
            Due(p.key, p.label, waited / 60_000L, p.remaining, p.detail)
        }.sortedByDescending { it.minutes }

    /** Tổng món bếp còn phải làm: "Bếp còn phải làm: 5 Cà phê sữa, 3 Trà chanh." (tối đa 8 loại). */
    fun kitchenTotalsSpeech(totals: List<Pair<Int, String>>): String {
        val real = totals.filter { it.first > 0 }
        if (real.isEmpty()) return "Không còn món nào đang đợi."
        val parts = real.take(8).map { "${it.first} ${spokenName(it.second)}" }
        return "Bếp còn phải làm: " + parts.joinToString(", ") + (if (real.size > 8) " và ${real.size - 8} loại khác" else "") + "."
    }

    /** Tên món đọc gọn: bỏ chữ COMBO và phần liệt kê trong ngoặc. */
    fun spokenName(name: String) = name.substringBefore(" [").replace("COMBO ·", "combo").replace("🎁", "").trim()

    /** "2 cà phê sữa, 1 bánh mì" (tối đa 4 món, còn lại gộp "và N món khác"). Dòng: qty còn thiếu + tên. */
    fun detail(missing: List<Pair<Int, String>>): String {
        val parts = missing.filter { it.first > 0 }.map { "${it.first} ${spokenName(it.second)}" }
        return if (parts.size <= 4) parts.joinToString(", ") else parts.take(4).joinToString(", ") + " và ${parts.size - 4} món khác"
    }

    /** Nhắc bếp chủ động theo tình hình giao đồ: "Nhắc bếp: Bàn 3 đã chờ 12 phút, còn thiếu 2 Cà phê sữa, 1 Trà chanh. Bếp làm giúp." */
    fun nudgeSpeech(label: String, minutes: Long, missing: List<Pair<Int, String>>): String {
        val merged = missing.filter { it.first > 0 }.groupBy { spokenName(it.second) }.map { (n, l) -> l.sumOf { it.first } to n }
        if (merged.isEmpty()) return "$label đã giao đủ món."
        return "Nhắc bếp: $label" + (if (minutes > 0) " đã chờ $minutes phút" else "") + ", còn thiếu " + detail(merged) + ". Bếp làm giúp."
    }

    /** Thông báo đơn mới vừa chốt/in phiếu bếp: "Có đơn mới, Bàn 3: 2 Cà phê sữa, ít đường, 1 combo Trà Ngon." Mỗi dòng: (số lượng, tên, ghi chú). */
    fun newOrderSpeech(label: String, lines: List<Triple<Int, String, String>>): String {
        val real = lines.filter { it.first > 0 }
        if (real.isEmpty()) return ""
        val parts = real.take(6).map { (q, n, note) -> "$q ${spokenName(n)}" + (if (note.isNotBlank() && note.length <= 25) ", ${note.trim()}" else "") }
        return "Có đơn mới, $label: " + parts.joinToString(", ") + (if (real.size > 6) " và ${real.size - 6} món khác" else "") + "."
    }

    /** Câu đọc bằng giọng tiếng Việt, có tên và số lượng món còn thiếu. */
    fun speech(dues: List<Due>): String = when {
        dues.isEmpty() -> ""
        dues.size == 1 -> {
            val d = dues[0]
            "${d.label} đã chờ ${d.minutes} phút" + (if (d.detail.isNotBlank()) ", còn thiếu ${d.detail}" else if (d.remaining > 0) ", còn ${d.remaining} món chưa giao" else "") + ". Vui lòng giao đồ cho khách."
        }
        else -> "Có ${dues.size} đơn chờ giao. " + dues.take(3).joinToString(". ") { d ->
            "${d.label} chờ ${d.minutes} phút" + (if (d.detail.isNotBlank()) ", còn ${d.detail}" else "")
        } + ". Vui lòng giao đồ cho khách."
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
    fun announce(context: Context, text: String, speak: Boolean, vibrate: Boolean = true, beep: Boolean = true) {
        if (vibrate) runCatching {
            val vibrator = if (Build.VERSION.SDK_INT >= 31) context.getSystemService(VibratorManager::class.java).defaultVibrator
            else @Suppress("DEPRECATION") (context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)
            val pattern = longArrayOf(0, 300, 150, 300, 150, 300)
            if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
            else @Suppress("DEPRECATION") vibrator.vibrate(pattern, -1)
        }
        if (beep) runCatching {
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

/** Gộp các món đang đợi của mọi bàn thành bảng tổng cho bếp. */
object ItemTotals {
    data class Row(val name: String, val remaining: Int, val sessionId: String, val sentAt: Long)
    data class Total(val name: String, val qty: Int, val tables: List<Pair<String, Int>>, val oldestSentAt: Long)

    fun build(rows: List<Row>, labelOf: (String) -> String): List<Total> =
        rows.filter { it.remaining > 0 }.groupBy { it.name }.map { (name, list) ->
            val perTable = list.groupBy { it.sessionId }.map { (sid, l) -> labelOf(sid) to l.sumOf { it.remaining } }
            Total(name, list.sumOf { it.remaining }, perTable.sortedBy { it.first }, list.minOf { it.sentAt })
        }.sortedWith(compareBy<Total> { it.oldestSentAt }.thenByDescending { it.qty })
}
