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

        page.goto(f"http://127.0.0.1:{port}/qr.html"); page.wait_for_timeout(1200)
        check("12 Lê Lợi" in page.inner_text("#info"), "tờ in có địa chỉ/SĐT/giờ mở")
        check(page.locator("#name").count() == 0, "không còn tên quán lặp dưới logo")
        page.screenshot(path=f"{SHOTS}/Q-page.png", full_page=True)
        with page.expect_download() as dl: page.click("#download")
        path = os.path.join(SHOTS, "Q-download.png"); dl.value.save_as(path)
        check(os.path.getsize(path) > 20000, "tải được ảnh PNG đầy đủ")
        browser.close()

try:
    run()
finally:
    srv.shutdown()
print("\nTHẤT BẠI:" if failures else "\nTẤT CẢ ĐỀU QUA", failures if failures else "")
sys.exit(1 if failures else 0)
