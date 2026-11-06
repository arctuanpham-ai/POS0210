// Meta Pixel cho trang đặt món: tải trễ (sau khi trang đã hiện) để không làm chậm lượt vào; lỗi hay bị chặn thì bỏ qua.
// Chỉ gửi 4 sự kiện chuẩn để Facebook tối ưu quảng cáo theo hành động thật: ViewContent, AddToCart, InitiateCheckout, Purchase (kèm số tiền VND).
export const PIXEL_ID = "912331653705932";
export const PIXEL_EVENTS = Object.freeze({ menu: "ViewContent", add: "AddToCart", cart: "InitiateCheckout", submit: "Purchase" });

/** Tên sự kiện Pixel và tham số cho một bước của phễu; null nếu bước đó không gửi lên Facebook. */
export function pixelPayload(step, total = 0) {
  const name = PIXEL_EVENTS[step];
  if (!name) return null;
  const value = Math.max(0, Math.round(Number(total) || 0));
  const params = step === "menu" ? { content_type: "product" } : { currency: "VND", value, content_type: "product" };
  return { name, params };
}

let ready = false;
export function startPixel(win = globalThis) {
  try {
    if (ready || !win.document) return;
    ready = true;
    const go = () => {
      try {
        if (win.fbq) return;
        const n = (win.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); });
        if (!win._fbq) win._fbq = n;
        n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
        const s = win.document.createElement("script");
        s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
        win.document.head.appendChild(s);
        win.fbq("init", PIXEL_ID);
        win.fbq("track", "PageView");
      } catch { /* bỏ qua */ }
    };
    if (win.requestIdleCallback) win.requestIdleCallback(go, { timeout: 3000 }); else win.setTimeout(go, 1500);
  } catch { /* bỏ qua */ }
}

export function pixelTrack(step, total = 0, win = globalThis) {
  try {
    const p = pixelPayload(step, total);
    if (p && typeof win.fbq === "function") win.fbq("track", p.name, p.params);
  } catch { /* bỏ qua */ }
}
