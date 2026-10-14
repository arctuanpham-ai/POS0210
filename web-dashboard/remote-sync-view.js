// Hàm thuần cho nút "Yêu cầu đồng bộ". Không đọc Firebase, không có DOM.
// Web ghi commands/sync.requestedAt; app POS nhận và ghi receivedFor/receivedAt/device.

export const COOLDOWN_MS = 30_000;
export const ACK_TIMEOUT_MS = 30_000;

const clock = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** Có được gửi lệnh mới không (chống bấm liên tục làm tốn lượt ghi và đồng bộ lặp). */
export const canRequestSync = (lastRequestAt, now) => !Number.isFinite(lastRequestAt) || now - lastRequestAt >= COOLDOWN_MS;

/** Trạng thái hiển thị sau khi gửi lệnh `requestedAt`, dựa trên tài liệu lệnh đọc được (có thể null). */
export const syncCommandStatus = (command, requestedAt, now) => {
  const received = command && Number(command.receivedFor) === requestedAt && Number(command.receivedAt) > 0;
  if (received) {
    const device = command.device ? ` (${command.device})` : "";
    return { state: "received", text: `Máy quán${device} đã nhận lệnh lúc ${clock(Number(command.receivedAt))}. Đang đồng bộ, dữ liệu sẽ tự làm mới.` };
  }
  if (now - requestedAt >= ACK_TIMEOUT_MS) {
    return { state: "timeout", text: "Chưa thấy máy quán nhận lệnh. App có thể đang bị hệ điều hành dừng hoặc mất mạng; máy sẽ tự đồng bộ trong chu kỳ 15 phút, hoặc mở app POS trên máy quán." };
  }
  return { state: "sent", text: `Đã gửi lệnh lúc ${clock(requestedAt)}. Đang chờ máy quán nhận…` };
};
