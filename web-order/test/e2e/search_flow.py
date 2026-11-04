"""Chạy thử trạng thái mở/đóng cửa và ô tìm món bằng Chromium (Playwright) với Firebase giả lập. Dùng: python3 test/e2e/search_flow.py"""
import json, os, sys, threading, http.server, socketserver, functools, calendar, time
from email.utils import formatdate
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from mock_firebase import APP, AUTH, FIRESTORE

PUBLIC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "public"))
SHOTS = os.environ.get("SHOTS", "/tmp/claude-0/out/shots")
os.makedirs(SHOTS, exist_ok=True)
ROOT = "users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=PUBLIC)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{port}/"

SEED = {
  f"{ROOT}/online_config/shop": {"name": "0210 Cafe", "address": "LK 02-10 Hoàng Huy riverside", "phone": "0702.245400", "hours": "6:30 - 18:00", "orderingEnabled": True},
  f"{ROOT}/menuCategories/c1": {"id": "c1", "name": "Cà phê", "sortOrder": 1, "active": True},
  f"{ROOT}/menuCategories/c2": {"id": "c2", "name": "Ăn sáng", "sortOrder": 2, "active": True},
  f"{ROOT}/menu/a": {"id": "a", "categoryId": "c1", "name": "Bạc xỉu", "price": 30000, "active": True, "description": "Sữa đặc, cà phê"},
  f"{ROOT}/menu/b": {"id": "b", "categoryId": "c1", "name": "Americano ", "price": 35000, "active": True},
  f"{ROOT}/menu/p": {"id": "p", "categoryId": "c2", "name": "Bánh mì trứng", "price": 25000, "active": True},
}

failures = []
def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond: failures.append(msg)

def vn_epoch(hour, minute=0):
    """Mốc giờ Việt Nam (UTC+7) của ngày 02/11/2026 -> epoch giây."""
    return calendar.timegm((2026, 11, 2, hour, minute, 0)) - 7 * 3600

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="vi-VN")
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "favicon" not in m.text and "404" not in m.text and "ERR_" not in m.text else None)
        mods = {"firebase-app.js": APP, "firebase-auth.js": AUTH, "firebase-firestore.js": FIRESTORE}
        page.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=mods[r.request.url.rsplit("/", 1)[-1].split("?")[0]]))
        page.add_init_script("window.__seedDocs = " + json.dumps(SEED) + ";")
        page.add_init_script("""
          Object.defineProperty(window, '__mock', { configurable: true, set(v) { this.__m = v; for (const [k,x] of Object.entries(window.__seedDocs)) if (!(k in v.docs)) v.docs[k] = x; }, get() { return this.__m; } });
        """)
        now = {"t": vn_epoch(11, 3)}
        # Đồng hồ trang lấy từ header Date của request HEAD: trả về giờ giả để thử các mốc trong ngày.
        def clock(route):
            if route.request.method == "HEAD":
                route.fulfill(status=200, headers={"date": formatdate(now["t"], usegmt=True)})
            else:
                route.continue_()
        page.route("**/?_=*", clock)

        def load(hour, minute=0):
            now["t"] = vn_epoch(hour, minute)
            page.goto(BASE); page.wait_for_function("window.__orderReady === true"); page.wait_for_selector(".dish")
            page.wait_for_timeout(400)

        print("1. Trạng thái mở / sắp đóng / đã đóng theo giờ")
        load(11, 3)
        text = page.inner_text("#open-status")
        check("Đang mở cửa" in text and "18:00" in text, f"11:03 -> Đang mở cửa đến 18:00 ({text!r})")
        check("open" in page.get_attribute("#open-status", "class").split(), "màu xanh (open)")
        page.screenshot(path=f"{SHOTS}/s1-open.png")
        load(17, 45)
        text = page.inner_text("#open-status")
        check("Sắp đóng cửa" in text and "15 phút" in text, f"17:45 -> Sắp đóng cửa còn 15 phút ({text!r})")
        load(20, 0)
        text = page.inner_text("#open-status")
        check("Đã đóng cửa" in text and "6:30 ngày mai" in text, f"20:00 -> Đã đóng cửa, mở lại 6:30 ngày mai ({text!r})")
        page.screenshot(path=f"{SHOTS}/s2-closed.png")
        load(4, 0)
        check("mở lại lúc 6:30" in page.inner_text("#open-status") and "ngày mai" not in page.inner_text("#open-status"), "04:00 -> mở lại lúc 6:30 (hôm nay)")
        load(11, 3)

        print("2. Ô tìm món")
        check(page.locator("#menu-search").count() == 1, "có ô tìm món")
        check(not page.locator("#kw-chips").is_visible(), "ô trống, chưa bấm: chưa hiện từ khoá gợi ý")
        page.click("#menu-search"); page.wait_for_timeout(200)
        check(page.locator("#kw-chips button").count() >= 1, "bấm vào ô tìm: có từ khoá gợi ý")
        kw = [t.strip() for t in page.locator("#kw-chips button").all_inner_texts()]
        check("Cà phê" not in kw, f"từ khoá gợi ý không trùng tên nhóm ({kw})")
        check(page.locator("#cat-chips a").count() == 2, "ô trống: có chip nhóm món")
        page.click("#menu-search"); page.keyboard.type("ca phe")
        page.wait_for_timeout(100)
        check(page.locator(".dish").count() == 2, "'ca phe' (không dấu) ra 2 món nhóm Cà phê")
        check(page.locator("#cat-chips a").count() == 0, "đang tìm: ẩn chip nhóm")
        check("2 món" in page.inner_text("#search-note"), "dòng báo số kết quả")
        check(not page.locator("#search-suggest").is_hidden(), "hiện danh sách gợi ý khi gõ")
        check("Cà phê" in page.inner_text("#search-suggest"), "gợi ý có nhóm Cà phê")
        page.screenshot(path=f"{SHOTS}/s3-search.png")
        page.fill("#menu-search", "BANH MI")
        check(page.locator(".dish").count() == 1 and "Bánh mì trứng" in page.inner_text("#menu"), "'BANH MI' ra Bánh mì trứng")
        page.fill("#menu-search", "banhmitrung")
        check(page.locator(".dish").count() == 1, "gõ liền 'banhmitrung' vẫn ra")
        page.fill("#menu-search", "cf")
        check(page.locator(".dish").count() == 2, "'cf' -> cà phê")
        page.fill("#menu-search", "do uong")
        check(page.locator(".dish").count() == 2, "'do uong' -> các món đồ uống")
        page.fill("#menu-search", "do an")
        check(page.locator(".dish").count() == 1 and "Bánh mì trứng" in page.inner_text("#menu"), "'do an' -> món ăn")

        print("3. Gợi ý, chọn gợi ý, từ khoá")
        page.fill("#menu-search", "ban")
        page.wait_for_selector("#search-suggest button")
        page.click("#search-suggest button:has-text('Bánh mì trứng')")
        check(page.input_value("#menu-search") == "Bánh mì trứng", "chọn gợi ý điền tên món vào ô")
        check(page.locator(".dish").count() == 1, "kết quả đúng 1 món")
        check(page.locator("#search-suggest").is_hidden(), "chọn xong ẩn danh sách gợi ý")

        print("4. Thêm món từ kết quả tìm kiếm")
        page.click("[data-dish='p'] [data-act='inc']")
        check(not page.locator("#cartbar").is_hidden() and "1 món" in page.inner_text("#cart-count"), "thêm món từ kết quả tìm được vào giỏ")
        page.click("#search-clear")
        check(page.input_value("#menu-search") == "", "nút × xoá từ khoá")
        check(page.locator(".dish").count() == 3 and page.locator("#cat-chips a").count() == 2, "xoá từ khoá: menu đầy đủ, chip nhóm trở lại")
        check("1 món" in page.inner_text("#cart-count"), "giỏ hàng còn nguyên")
        check(page.locator("[data-dish='p'] .stepper").count() == 1, "món vừa thêm hiện bộ đếm số lượng trong menu")

        print("5. Không có kết quả / gõ sai")
        page.fill("#menu-search", "pizza")
        check(page.locator(".dish").count() == 0, "'pizza' không có món")
        check("Không thấy món nào" in page.inner_text("#search-note"), "báo không thấy món")
        check(page.locator("#kw-chips button").count() >= 1, "không thấy: hiện từ khoá gợi ý")
        page.screenshot(path=f"{SHOTS}/s4-empty.png")
        page.click("#kw-chips button >> nth=0")
        check(page.locator(".dish").count() >= 1, "bấm từ khoá gợi ý ra món")
        page.fill("#menu-search", "americao")
        check(page.locator(".dish").count() == 1 and "gần giống" in page.inner_text("#search-note"), "gõ sai 'americao' vẫn ra Americano, báo gần giống")
        page.focus("#menu-search"); page.keyboard.press("Escape")
        check(page.input_value("#menu-search") == "", "Esc xoá từ khoá")

        check(not errors, "không có lỗi JS/console: " + "; ".join(errors[:3]))
        browser.close()

run()
print("\nTẤT CẢ ĐỀU QUA" if not failures else f"\n{len(failures)} LỖI:\n- " + "\n- ".join(failures))
sys.exit(1 if failures else 0)
