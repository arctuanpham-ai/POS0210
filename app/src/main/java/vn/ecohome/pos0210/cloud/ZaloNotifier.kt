package vn.ecohome.pos0210.cloud

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URL
import java.text.NumberFormat
import java.util.Locale

/** Báo đơn online qua Zalo Bot (bot-api.zaloplatforms.com). Token + chat_id lưu trên máy POS, không đưa vào code hay Firestore. */
object ZaloNotifier {
    private const val PREFS = "pos0210_zalo"
    private const val BASE = "https://bot-api.zaloplatforms.com/bot"

    fun token(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("token", "").orEmpty()
    fun chatId(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("chat", "").orEmpty()
    fun ready(c: Context) = token(c).isNotBlank() && chatId(c).isNotBlank()
    fun clear(c: Context) { c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply() }

    private fun post(token: String, method: String, json: String): String {
        val conn = URL("$BASE$token/$method").openConnection() as HttpURLConnection
        return try {
            conn.requestMethod = "POST"; conn.connectTimeout = 10_000; conn.readTimeout = 20_000; conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(json.toByteArray()) }
            val stream = if (conn.responseCode in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
            stream.bufferedReader().readText()
        } finally { conn.disconnect() }
    }

    private fun esc(s: String) = s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "")

    /** Dán token, bấm kết nối: lấy chat_id từ tin nhắn gần nhất người dùng gửi cho bot rồi gửi tin thử. */
    fun connect(c: Context, rawToken: String): String {
        val token = rawToken.trim()
        if (!Regex("^\\d+:[A-Za-z0-9]+$").matches(token)) return "Token không đúng dạng (dãy số, dấu hai chấm, rồi chữ)."
        return runCatching {
            val body = post(token, "getUpdates", """{"timeout":3}""")
            val id = Regex("\"chat\"\\s*:\\s*\\{[^}]*?\"id\"\\s*:\\s*\"?([^\",}\\s]+)").find(body)?.groupValues?.get(1)
                ?: return "Chưa thấy tin nhắn nào gửi cho bot. Mở Zalo, nhắn \"hi\" cho bot rồi bấm lại. (${body.take(120)})"
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("token", token).putString("chat", id).apply()
            val r = post(token, "sendMessage", """{"chat_id":"$id","text":"POS 0210: đã kết nối. Có đơn online mới bot sẽ nhắn ở đây."}""")
            if (r.contains("\"ok\":true") || r.contains("\"ok\": true")) "Đã kết nối, kiểm tra Zalo xem có tin thử." else "Đã lưu nhưng gửi thử lỗi: ${r.take(150)}"
        }.getOrElse { "Không kết nối được: ${it.message}" }
    }

    fun send(c: Context, text: String) {
        if (!ready(c)) return
        val token = token(c); val chat = chatId(c)
        CoroutineScope(Dispatchers.IO).launch { runCatching { post(token, "sendMessage", """{"chat_id":"$chat","text":"${esc(text.take(1900))}"}""") } }
    }

    fun orderText(o: OnlineOrder): String {
        val money = NumberFormat.getInstance(Locale("vi", "VN"))
        val lines = o.items.joinToString("\n") { "• ${it.qty}× ${it.name.trim()}${if (it.note.isNotBlank()) " (${it.note})" else ""}" }
        val where = when (o.mode) { "delivery" -> "Giao: ${o.address}"; "dinein" -> "Tại quán, bàn ${o.table}"; else -> "Mang đi" }
        return "ĐƠN ONLINE MỚI ${o.code}\n${o.name} · ${o.phone}\n$where\n$lines\n${if (o.note.isNotBlank()) "Ghi chú: ${o.note}\n" else ""}Tổng: ${money.format(o.total)}đ"
    }
}
