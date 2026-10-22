// Báo đơn online qua Zalo Bot từ trang quản lý. Token + chat_id chỉ lưu trong trình duyệt này (localStorage).
const BASE = "https://bot-api.zaloplatforms.com/bot";
const KEY = "pos0210.zalo";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } };

export const zaloState = () => { const s = read(); return { ready: Boolean(s.token && s.chat), token: s.token || "", chat: s.chat || "" }; };
export const zaloClear = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

export function orderText(o, money) {
  const lines = (o.items || []).map((l) => `• ${Number(l.qty)}× ${String(l.name || "").trim()}${l.note ? ` (${l.note})` : ""}`).join("\n");
  const where = o.mode === "delivery" ? `Giao: ${o.address || ""}` : o.mode === "dinein" ? `Tại quán, bàn ${o.table || ""}` : "Mang đi";
  return `ĐƠN ONLINE MỚI ${o.code || o.id}\n${o.name || ""} · ${o.phone || ""}\n${where}\n${lines}\n${o.note ? `Ghi chú: ${o.note}\n` : ""}Tổng: ${money(o.total)}`;
}

async function call(token, method, body) {
  const url = `${BASE}${token}/${method}`;
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: true, text: await r.text() };
  } catch (error) {
    if (method !== "sendMessage") throw error;
    // Nếu trình duyệt chặn đọc phản hồi (CORS), vẫn thử gửi dạng không đọc phản hồi.
    await fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) });
    return { ok: true, text: "", opaque: true };
  }
}

export async function zaloConnect(rawToken, manualChat = "") {
  const token = String(rawToken || "").trim();
  if (!/^\d+:[A-Za-z0-9]+$/.test(token)) return "Token không đúng dạng (dãy số, dấu hai chấm, rồi chữ).";
  let chat = String(manualChat || "").trim();
  if (!chat) {
    let text = "";
    try { text = (await call(token, "getUpdates", { timeout: 3 })).text; } catch (error) { return `Trình duyệt không đọc được phản hồi của Zalo (${error.message || error}). Hãy cài bản POS v191 và kết nối trong đó, hoặc nhập chat_id vào ô bên cạnh.`; }
    chat = /"chat"\s*:\s*\{[^}]*?"id"\s*:\s*"?([^",}\s]+)/.exec(text)?.[1] || "";
    if (!chat) return `Chưa thấy tin nhắn nào gửi cho bot. Mở Zalo, nhắn "hi" cho bot (hoặc nhắn trong nhóm) rồi bấm lại. (${text.slice(0, 120)})`;
  }
  write({ token, chat });
  try {
    const r = await call(token, "sendMessage", { chat_id: chat, text: "POS 0210 (trang quản lý): đã kết nối. Có đơn online mới bot sẽ nhắn ở đây." });
    return r.opaque ? "Đã lưu. Kiểm tra Zalo xem có tin thử (trình duyệt không cho đọc phản hồi)." : /"ok"\s*:\s*true/.test(r.text) ? "Đã kết nối, kiểm tra Zalo xem có tin thử." : `Đã lưu nhưng gửi thử lỗi: ${r.text.slice(0, 150)}`;
  } catch (error) { return `Đã lưu nhưng gửi thử lỗi: ${error.message || error}`; }
}

export async function zaloSend(text) {
  const s = read();
  if (!s.token || !s.chat) return;
  try { await call(s.token, "sendMessage", { chat_id: s.chat, text: String(text).slice(0, 1900) }); } catch { /* không chặn việc xử lý đơn */ }
}
