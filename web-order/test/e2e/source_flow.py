"""Chạy thử ghi nguồn khách (UTM) vào đơn: có UTM, tải lại, URL không UTM, hai chiến dịch, hết hạn 7 ngày, rules từ chối -> gửi lại không kèm nguồn. Dùng: python3 test/e2e/source_flow.py"""
import json, os, sys, threading, http.server, socketserver, functools
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

def seed(shop_extra):
    return {
      f"{ROOT}/online_config/shop": {"name": "0210 Cafe", "address": "LK 02-10 Hoàng Huy riverside", "phone": "0702.245400", "hours": "6:30 - 18:00", "orderingEnabled": True, **shop_extra},
      f"{ROOT}/menuCategories/c1": {"id": "c1", "name": "Cà phê", "sortOrder": 1, "active": True},
      f"{ROOT}/menu/a": {"id": "a", "categoryId": "c1", "name": "Bạc xỉu", "price": 30000, "active": True},
      f"{ROOT}/menu/b": {"id": "b", "categoryId": "c1", "name": "Americano ", "price": 35000, "active": True},
      f"{ROOT}/menuCategories/c2": {"id": "c2", "name": "Tạm nghỉ", "sortOrder": 2, "active": False},
      f"{ROOT}/menu/off": {"id": "off", "categoryId": "c2", "name": "Cold brew cam", "price": 50000, "active": True},
      f"{ROOT}/combos/x": {"id": "x", "name": "Cafe Ngon", "price": 69000, "active": True, "sortOrder": 1, "parts": [{"id": "a", "name": "Bạc xỉu"}, {"id": "b", "name": "Americano"}]},
    }

failures = []
def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond: failures.append(msg)

def open_page(browser, docs, query="", ctx=None):
    ctx = ctx or browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="vi-VN")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "favicon" not in m.text and "404" not in m.text and "ERR_" not in m.text else None)
    mods = {"firebase-app.js": APP, "firebase-auth.js": AUTH, "firebase-firestore.js": FIRESTORE}
    page.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=mods[r.request.url.rsplit("/", 1)[-1].split("?")[0]]))
    page.add_init_script("window.__seedDocs = " + json.dumps(docs) + ";")
    page.add_init_script("""
      Object.defineProperty(window, '__mock', { configurable: true, set(v) { this.__m = v; for (const [k,x] of Object.entries(window.__seedDocs)) if (!(k in v.docs)) v.docs[k] = x; }, get() { return this.__m; } });
    """)
    page.goto(BASE + query); page.wait_for_function("window.__orderReady === true"); page.wait_for_selector(".dish")
    page.wait_for_timeout(400)
    return ctx, page, errors

FB = "?utm_source=facebook&utm_medium=paid_social&utm_campaign=com_trua&utm_content=post_01"

_n = [0]
def visit(page, url):
    page.evaluate("localStorage.removeItem('pos0210o.codes')")
    page.goto(url); page.wait_for_function("window.__orderReady === true"); page.wait_for_timeout(600)
    if page.locator("#screen-track").is_visible(): page.click("#back-to-menu")
    page.wait_for_selector(".dish"); page.wait_for_timeout(300)

def order_it(page):
    _n[0] += 1
    page.click("[data-dish='a'] [data-act='inc']")
    page.click("#cart-open")
    page.fill("input[name='name']", "Lan"); page.fill("input[name='phone']", f"09123456{_n[0]:02d}")
    page.check("input[value='pickup']"); page.fill("input[name='table']", "5")
    page.check("input[name='consent']")
    page.click("#submit")
    page.wait_for_selector("#screen-track:not([hidden])"); page.wait_for_selector(".status-card h2")
    b = page.evaluate("window.__mock.batches")
    return [d for pth, d in b if "/online_orders/" in pth][-1]

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        seedd = seed({"onlineDiscountPercent": 0})

        print("1. Vào từ Facebook Ads và đặt ngay")
        ctx, page, errors = open_page(browser, seedd, FB)
        o = order_it(page)
        src = o.get("src") or {}
        check(src.get("source") == "facebook" and src.get("medium") == "paid_social" and src.get("campaign") == "com_trua" and src.get("content") == "post_01", f"đơn mang nguồn/chiến dịch/nội dung: {src}")
        check(isinstance(src.get("at"), int) and src["at"] > 0, "có thời điểm ghi nhận nguồn")
        check(o["code"] and len(o) == 18, f"đơn 18 trường (17 + src), mã đơn vẫn sinh như cũ: {o['code']} / {len(o)}")
        check(o["total"] == 30000 and o["discount"] == 0, "giá, giảm giá không đổi")
        check(not errors, "không lỗi JS: " + "; ".join(errors[:3]))
        ctx.close()

        print("2. Quay lại bằng URL không UTM / tải lại: vẫn giữ nguồn (cùng trình duyệt)")
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, locale="vi-VN")
        _, page, errors = open_page(browser, seedd, FB, ctx)
        visit(page, BASE)
        page.reload(); page.wait_for_function("window.__orderReady === true"); page.wait_for_timeout(600)
        if page.locator("#screen-track").is_visible(): page.click("#back-to-menu")
        page.wait_for_selector(".dish")
        stored = page.evaluate("JSON.parse(localStorage.getItem('pos0210o.attr'))")
        check(stored and stored["last"]["campaign"] == "com_trua", f"nguồn còn sau khi chuyển URL không UTM + reload: {stored and stored['last']['campaign']}")
        o = order_it(page)
        check((o.get("src") or {}).get("campaign") == "com_trua", "đơn đặt sau đó vẫn mang nguồn Facebook Ads")

        print("3. Hai chiến dịch khác nhau: nguồn gần nhất cập nhật, nguồn đầu tiên giữ")
        visit(page, BASE + "?utm_source=facebook&utm_medium=paid_social&utm_campaign=loi_ich_dat_truc_tiep&utm_content=v1")
        stored = page.evaluate("JSON.parse(localStorage.getItem('pos0210o.attr'))")
        check(stored["last"]["campaign"] == "loi_ich_dat_truc_tiep" and stored["first"]["campaign"] == "com_trua", f"last={stored['last']['campaign']} first={stored['first']['campaign']}")

        print("4. Hết hạn 7 ngày: không còn gắn nguồn")
        page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('pos0210o.attr')); s.last.at -= 8*86400000; s.first.at -= 8*86400000; localStorage.setItem('pos0210o.attr', JSON.stringify(s)); })()")
        visit(page, BASE)
        o = order_it(page)
        check("src" not in o and len(o) == 17, f"đơn không có src, đúng 17 trường ({len(o)})")
        ctx.close()

        print("5. Trình duyệt khác / không UTM: đơn bình thường, không src")
        ctx, page, errors = open_page(browser, seedd, "")
        o = order_it(page)
        check("src" not in o and len(o) == 17, "đơn 17 trường, đặt món không lỗi")
        ctx.close()

        print("6. UTM sai / quá dài: được làm sạch, đặt món vẫn chạy")
        ctx, page, errors = open_page(browser, seedd, "?utm_source=Face%20Book%3Cscript%3E&utm_campaign=" + "x" * 300)
        o = order_it(page); src = o.get("src") or {}
        check(src.get("source") == "face_bookscript" and len(src.get("campaign", "")) == 40, f"làm sạch + cắt 40 ký tự: {src.get('source')} / {len(src.get('campaign',''))}")
        ctx.close()

        print("7. Rules từ chối đơn có src (chưa cập nhật rules): tự gửi lại KHÔNG kèm nguồn, không mất đơn")
        ctx, page, errors = open_page(browser, seedd, FB)
        page.evaluate("window.__mock.denyNext = 1")
        o = order_it(page)
        check("src" not in o and o["code"], "đơn vẫn được ghi (lần thử lại không có src)")
        ctx.close()
        browser.close()
    print("\nKẾT QUẢ:", "TẤT CẢ ĐẠT" if not failures else f"{len(failures)} LỖI")
    sys.exit(1 if failures else 0)

run()
