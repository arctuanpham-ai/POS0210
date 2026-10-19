"""Chạy thử toàn bộ luồng khách bằng Chromium (Playwright) với Firebase giả lập. Dùng: python3 test/e2e/customer_flow.py"""
import json, os, sys, threading, time, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from mock_firebase import APP, AUTH, FIRESTORE

PUBLIC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "public"))
SHOTS = os.environ.get("SHOTS", "/tmp/claude-0/out/shots")
os.makedirs(SHOTS, exist_ok=True)
ROOT = "users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=PUBLIC)
srv = socketserver.TCPServer(("127.0.0.1", 0), handler); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{port}/"

SEED = {
  f"{ROOT}/online_config/shop": {"name": "0210 Cafe", "tagline": "Cà phê · Ăn sáng", "address": "12 Lê Lợi, Hồng Bàng, Hải Phòng", "phone": "0912 345 678", "hours": "6:30 – 22:00 hằng ngày", "orderingEnabled": True, "bank": "Techcombank", "account": "19031234567890", "holder": "NGUYEN VAN A"},
  f"{ROOT}/menuCategories/c1": {"id": "c1", "name": "Cà phê", "sortOrder": 1, "active": True},
  f"{ROOT}/menuCategories/c2": {"id": "c2", "name": "Ăn sáng", "sortOrder": 2, "active": True},
  f"{ROOT}/menu/a": {"id": "a", "categoryId": "c1", "name": "Bạc xỉu", "price": 30000, "active": True, "description": "Sữa đặc, cà phê"},
  f"{ROOT}/menu/b": {"id": "b", "categoryId": "c1", "name": "Americano ", "price": 35000, "active": True},
  f"{ROOT}/menu/off": {"id": "off", "categoryId": "c1", "name": "Cold brew cam", "price": 50000, "active": False},
  f"{ROOT}/menu/p": {"id": "p", "categoryId": "c2", "name": "Bánh mì trứng", "price": 25000, "active": True},
}

failures = []
def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond: failures.append(msg)

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="vi-VN")
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "favicon" not in m.text and "shop.jpg" not in m.text and "404" not in m.text and "ERR_TUNNEL" not in m.text and "ERR_" not in m.text else None)
        mods = {"firebase-app.js": APP, "firebase-auth.js": AUTH, "firebase-firestore.js": FIRESTORE}
        def route(r):
            name = r.request.url.rsplit("/", 1)[-1].split("?")[0]
            r.fulfill(status=200, content_type="application/javascript", body=mods[name])
        page.route("https://www.gstatic.com/firebasejs/**", route)
        page.add_init_script("window.__seedDocs = " + json.dumps(SEED) + ";")
        page.add_init_script("""
          window.__initMock = () => { const S = (window.__mock = window.__mock || {}); };
        """)
        def seed():
            page.evaluate("""() => { const S = window.__mock; for (const [k,v] of Object.entries(window.__seedDocs)) if (!(k in S.docs)) S.docs[k] = v; }""")
        # Mock chỉ tồn tại sau khi module firestore chạy: nạp trang, seed rồi tải lại dữ liệu bằng cách đặt seed trước khi app đọc.
        page.add_init_script("""
          Object.defineProperty(window, '__mock', { configurable: true, set(v) { this.__m = v; for (const [k,x] of Object.entries(window.__seedDocs)) if (!(k in v.docs)) v.docs[k] = x; }, get() { return this.__m; } });
        """)

        print("1. Trang chủ + menu")
        page.goto(BASE); page.wait_for_function("window.__orderReady === true"); page.wait_for_selector(".dish")
        page.wait_for_timeout(300)
        check(page.inner_text("#shop-name") == "0210 Cafe", "tên quán lấy từ cấu hình")
        check("12 Lê Lợi" in page.inner_text("#shop-info") and "6:30" in page.inner_text("#shop-info"), "địa chỉ, giờ mở cửa hiển thị")
        check(page.locator("a[href^='tel:']").count() == 1, "có link gọi điện")
        check(page.locator(".menu-section").count() == 2, "2 nhóm món")
        check(page.locator(".dish.off").count() == 0 and "Tạm hết" not in page.inner_text("#menu") and "Món tắt" not in page.inner_text("#menu"), "món ngừng bán bị ẩn hẳn, không hiện mờ")
        check(page.locator(".dish.off [data-act]").count() == 0, "món tắt không có nút thêm")
        page.screenshot(path=f"{SHOTS}/1-menu.png")

        print("2. Giỏ hàng")
        page.click("[data-dish='a'] [data-act='inc']")
        page.click("[data-dish='a'] [data-act='inc']")
        page.fill("[data-note='a']", "ít đá")
        page.click("[data-dish='b'] [data-act='inc']")
        check("3 món" in page.inner_text("#cart-count") and "95.000" in page.inner_text("#cart-total"), "cart bar: 3 món 95.000đ")
        check(page.is_visible("#cartbar"), "giỏ cố định ở đáy")
        page.screenshot(path=f"{SHOTS}/2-cart.png")
        page.click("#cart-open")
        check(page.is_visible("#sheet"), "mở form đặt đơn")
        page.screenshot(path=f"{SHOTS}/3-sheet.png")

        print("3. Kiểm tra form")
        page.click("#submit")
        check("nhập tên" in page.inner_text("[data-error='name']"), "báo thiếu tên")
        check("chưa đúng" in page.inner_text("[data-error='phone']"), "báo SĐT sai")
        page.fill("input[name='name']", "Lan"); page.fill("input[name='phone']", "0912 345 678")
        page.check("input[value='delivery']")
        page.click("#submit")
        check("địa chỉ" in page.inner_text("[data-error='address']").lower(), "giao hàng bắt buộc địa chỉ")
        page.check("input[value='pickup']")

        print("4. Gửi đơn")
        page.fill("input[name='table']", "5")
        page.click("#submit")
        page.wait_for_selector("#screen-track:not([hidden])")
        page.wait_for_selector(".status-card h2")
        b = page.evaluate("window.__mock.batches")
        paths = [x[0] for x in b]
        order = next(d for pth, d in b if "/online_orders/" in pth)
        code = order["code"]
        check(len(b) == 3, "batch ghi đúng 3 tài liệu (đơn + 2 bộ đếm)")
        check(order["status"] == "new" and order["total"] == 95000 and order["mode"] == "dinein" and order["table"] == "5" and order["uid"] == "guest1", "đơn: status new, tổng 95.000, tại bàn 5, uid ẩn danh")
        check(order["items"][0] == {"id": "a", "name": "Bạc xỉu", "qty": 2, "note": "ít đá", "price": 30000}, "dòng món có ghi chú")
        check(any(p.endswith(f"online_limits/u_guest1") for p in paths) and any(p.endswith("online_limits/p_0912345678") for p in paths), "có 2 bộ đếm u_ và p_")
        check("Quán đang xác nhận đơn của bạn" in page.inner_text("#track-body"), "màn hình chờ xác nhận")
        check(code in page.inner_text("#track-body"), "hiện mã đơn")
        page.screenshot(path=f"{SHOTS}/4-waiting.png")
        check(page.evaluate("JSON.parse(localStorage.getItem('pos0210o.cart'))") == {}, "giỏ đã được dọn")

        print("5. Nhân viên nhận đơn -> chờ thanh toán (VietQR)")
        opath = f"{ROOT}/online_orders/{code}"
        now_ms = int(time.time() * 1000)
        page.evaluate("([p, ms, code]) => window.__mockSet(p, { ...window.__mock.docs[p], status: 'awaiting_payment', transferContent: 'DM' + code, expiresAt: { __ms: ms + 10 * 60000 } })", [opath, now_ms, code])
        page.wait_for_selector(".pay-card svg")
        txt = page.inner_text("#track-body")
        check("mời bạn thanh toán" in txt and "95.000" in txt, "hiện yêu cầu thanh toán + số tiền")
        check("NGUYEN VAN A" in txt and "19031234567890" in txt and "Techcombank" in txt, "hiện tên tài khoản, số TK, ngân hàng để đối chiếu")
        check(f"DM{code}" in txt, "hiện nội dung chuyển khoản")
        cd = page.inner_text("#countdown")
        check(cd in ("10:01", "10:00", "09:59", "09:58"), f"đồng hồ đếm ngược 10 phút ({cd})")
        time.sleep(2.2)
        check(page.inner_text("#countdown") < cd, "đồng hồ đang chạy")
        svg = page.inner_html(".qr")
        check("<svg" in svg and "<path" in svg, "có mã QR")
        page.screenshot(path=f"{SHOTS}/5-pay.png", full_page=True)

        print("6. Mở lại link: vẫn thấy đơn")
        page.reload(); page.wait_for_function("window.__orderReady === true"); page.wait_for_selector(".pay-card svg")
        check(page.is_visible("#screen-track"), "mở lại link vẫn theo dõi đơn")

        print("7. Đã nhận tiền -> đang giao -> hoàn thành")
        for st, want in (("paid", "đang làm món"), ("delivering", "đang trên đường giao"), ("done", "hoàn thành")):
            page.evaluate("([p, st]) => window.__mockSet(p, { ...window.__mock.docs[p], status: st })", [opath, st])
            page.wait_for_function("(w) => document.querySelector('#track-body').innerText.toLowerCase().includes(w)", arg=want)
            check(want in page.inner_text("#track-body").lower(), f"trạng thái {st}")
        check(page.locator("[data-act2='new']").count() == 1, "đơn xong có nút Đặt đơn mới")
        page.screenshot(path=f"{SHOTS}/6-done.png")
        page.click("[data-act2='new']")
        check(page.is_visible("#screen-menu") and not page.is_visible("#track-banner"), "về menu, không còn đơn theo dõi")

        print("8. Từ chối + lý do")
        page.evaluate("([p]) => window.__mockSet(p, { ...window.__mock.docs[p], status: 'rejected', rejectReason: 'Hết món Bạc xỉu' })", [opath])
        page.evaluate("(c) => { localStorage.setItem('pos0210o.codes', JSON.stringify([c])); }", code)
        page.reload(); page.wait_for_function("window.__orderReady === true"); page.wait_for_timeout(700)
        check(page.is_visible("#screen-menu") and not page.is_visible("#track-banner"), "mở lại link: đơn đã kết thúc KHÔNG hiện như đơn theo dõi")
        check(page.is_visible("#open-history"), "có nút Lịch sử đơn hàng")
        page.click("#open-history"); page.wait_for_selector(".hist-card")
        check("Quán không nhận" in page.inner_text("#history-body"), "lịch sử có đơn bị từ chối")
        page.click("#history-back")

        print("9. Hết hạn nằm trong lịch sử, bấm Đặt lại")
        page.evaluate("([p, ms]) => window.__mockSet(p, { ...window.__mock.docs[p], status: 'awaiting_payment', rejectReason: '', transferContent: 'DMX', expiresAt: { __ms: ms - 60000 } })", [opath, int(time.time()*1000)])
        page.click("#open-history"); page.wait_for_selector(".hist-card")
        check("Hết hạn" in page.inner_text("#history-body"), "đơn quá hạn nằm trong lịch sử, ghi Hết hạn")
        page.click("[data-reorder]")
        page.wait_for_selector("#cartbar:not([hidden])")
        check("3 món" in page.inner_text("#cart-count"), "đặt lại từ lịch sử: giỏ có lại 3 món")

        print("10. Giới hạn 2 đơn chờ")
        page.evaluate("([r]) => window.__mockSet(r + '/online_limits/u_guest1', { pending: 2, lastAt: { __ms: Date.now() }, lastOrder: 'ZZZZZZ' })", [ROOT])
        before = page.evaluate("window.__mock.batches.length")
        page.click("#cart-open"); page.click("#submit")
        page.wait_for_function("document.querySelector('#form-message').innerText.includes('2 đơn')")
        check("2 đơn chờ" in page.inner_text("#form-message"), "báo đang có 2 đơn chờ")
        check(page.evaluate("window.__mock.batches.length") == before, "không ghi thêm đơn khi vượt giới hạn")

        print("11. Quán đổi giá giữa chừng -> bị từ chối -> báo menu đã đổi")
        page.evaluate("([r]) => { delete window.__mock.docs[r + '/online_limits/u_guest1']; window.__mockSet(r + '/menu/a', { ...window.__mock.docs[r + '/menu/a'], price: 33000 }); window.__mock.denyNext = 2; }", [ROOT])
        page.click("#submit")
        page.wait_for_function("document.querySelector('#form-message').innerText.includes('cập nhật menu')")
        check("cập nhật menu" in page.inner_text("#form-message"), "báo quán vừa cập nhật menu")
        page.screenshot(path=f"{SHOTS}/7-menu-changed.png")

        print("12. Quán tạm ngưng nhận đơn")
        page.evaluate("([r]) => { window.__mockSet(r + '/online_config/shop', { ...window.__mock.docs[r + '/online_config/shop'], orderingEnabled: false }); }", [ROOT])
        page.evaluate("localStorage.removeItem('pos0210o.codes')")
        page.reload(); page.wait_for_selector(".dish")
        page.wait_for_timeout(300)
        check(page.is_visible("#closed-banner") and "tạm ngưng" in page.inner_text("#closed-banner"), "banner tạm ngưng")

        check(not errors, "không có lỗi JS/console: " + "; ".join(errors[:3]))
        browser.close()

try:
    run()
finally:
    srv.shutdown()
print("\nTHẤT BẠI:" if failures else "\nTẤT CẢ ĐỀU QUA", failures if failures else "")
sys.exit(1 if failures else 0)
