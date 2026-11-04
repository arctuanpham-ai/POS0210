"""Menu khách đọc từ bản chụp online_menu (ít lượt đọc Firestore): đúng nội dung, có ảnh, ẩn món, tải lại từ bản chụp, và tự đọc collection thật khi không có bản chụp. Dùng: python3 test/e2e/snapshot_flow.py"""
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

def open_page(browser, docs):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="vi-VN")
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
    page.goto(BASE); page.wait_for_function("window.__orderReady === true"); page.wait_for_selector(".dish")
    page.wait_for_timeout(400)
    return ctx, page, errors

PX = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="

def snap_seed():
    d = seed({"onlineDiscountPercent": 0, "thumbsVersion": 50})
    # collection thật có tên KHÁC bản chụp: nếu trang đọc nhầm collection thì phát hiện ngay
    for k in list(d):
        if "/menu/a" in k or "/menu/b" in k: d[k] = {**d[k], "name": d[k]["name"] + " (collection)"}
    d[f"{ROOT}/online_menu/data"] = {
        "schema": 1, "builtAt": 1, "hash": "x", "thumbsParts": 2, "thumbsVer": 50, "hidden": ["b"],
        "items": [
            {"id": "a", "categoryId": "c1", "name": "Bạc xỉu (bản chụp)", "price": 30000, "active": True},
            {"id": "b", "categoryId": "c1", "name": "Món bị ẩn", "price": 35000, "active": True},
            {"id": "n", "categoryId": "c1", "name": "Món mới thêm", "price": 41000, "active": True},
        ],
        "cats": [{"id": "c1", "name": "Cà phê", "sortOrder": 1, "active": True}],
        "combos": [{"id": "x", "name": "Cafe Ngon", "price": 69000, "active": True, "sortOrder": 1, "items": [{"menuItemId": "a", "name": "Bạc xỉu", "qty": 1}]}],
    }
    d[f"{ROOT}/online_menu/thumbs_0"] = {"map": {"menu_a": PX}, "part": 0}
    d[f"{ROOT}/online_menu/thumbs_1"] = {"map": {"menu_n": PX}, "part": 1}
    return d

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        print("1. Có bản chụp: menu + ảnh đọc từ bản chụp, rất ít lượt đọc")
        ctx, page, errors = open_page(browser, snap_seed())
        names = page.locator(".dish h3").all_inner_texts()
        check("Bạc xỉu (bản chụp)" in " ".join(names) and "collection" not in " ".join(names), f"hiện tên từ bản chụp, không từ collection: {names}")
        check("Món mới thêm" in " ".join(names), "món mới (chỉ có trong bản chụp) hiện ra")
        check("Món bị ẩn" not in " ".join(names), "món ẩn riêng bị loại")
        check(page.locator("[data-dish='c_x']").count() == 1, "combo dựng từ bản chụp")
        page.wait_for_timeout(500)
        check(page.locator("[data-dish='a'] .dish-img img").count() >= 1 and page.locator("[data-dish='n'] .dish-img img").count() >= 1, "ảnh từ cả 2 nhóm ảnh đều hiện")
        reads = page.evaluate("window.__reads")
        check(reads <= 8, f"tổng lượt đọc Firestore lúc mở trang: {reads} (cũ ~125)")
        print(f"      (lượt đọc khi mở trang: {reads})")
        check(not errors, "không lỗi JS: " + "; ".join(errors[:3]))
        ctx.close()

        print("2. Không có bản chụp: tự đọc collection thật như cũ")
        ctx, page, errors = open_page(browser, seed({"onlineDiscountPercent": 0}))
        names = " ".join(page.locator(".dish h3").all_inner_texts())
        check("Bạc xỉu" in names and "Americano" in names, f"menu đọc từ collection: {names}")
        ctx.close()

        print("3. Bản chụp sai phiên bản bị bỏ qua")
        d = snap_seed(); d[f"{ROOT}/online_menu/data"]["schema"] = 99
        ctx, page, errors = open_page(browser, d)
        names = " ".join(page.locator(".dish h3").all_inner_texts())
        check("(collection)" in names and "bản chụp" not in names, f"dùng collection khi bản chụp không hợp lệ: {names}")
        ctx.close()

        print("4. Thứ tự: Món lẻ nổi bật, Combo tiện lợi, rồi các nhóm; món nổi bật hiện 2 chỗ vẫn đồng bộ số lượng")
        d = snap_seed()
        s = d[f"{ROOT}/online_menu/data"]
        s["cats"] = [{"id": "c1", "name": "Cà phê", "sortOrder": 1, "active": True}, {"id": "c0", "name": "Ăn sáng", "sortOrder": 2, "active": True}, {"id": "c3", "name": "cơm trưa", "sortOrder": 3, "active": True}]
        s["items"] = [
            {"id": "a", "categoryId": "c1", "name": "Bạc xỉu", "price": 30000, "active": True},
            {"id": "n", "categoryId": "c1", "name": "Cà phê muối", "price": 35000, "active": True},
            {"id": "m", "categoryId": "c0", "name": "Bánh mì trứng", "price": 25000, "active": True},
            {"id": "k", "categoryId": "c3", "name": "Cơm gà", "price": 45000, "active": True},
        ]
        s["hidden"] = []; s["top"] = ["k", "n", "ghost"]
        ctx, page, errors = open_page(browser, d)
        heads = page.locator("#menu h2").all_inner_texts()
        check(heads == ["Món bán chạy", "Combo tiện lợi", "cơm trưa", "Cà phê", "Ăn sáng"], f"thứ tự nhóm: {heads}")
        top_items = page.locator("#cat-_featured .dish h3").all_inner_texts()
        check(top_items == ["Cơm gà", "Cà phê muối"], f"món bán chạy: đúng danh sách thống kê (bỏ món không tồn tại): {top_items}")
        check(page.locator("#cat-_top").count() == 0, "không còn mục Bán chạy nhất")
        check(page.locator("[data-dish='k']").count() == 2, "món nổi bật hiện thêm trong nhóm riêng")
        page.locator("#cat-_featured [data-dish='k'] [data-act='inc']").click()
        check(page.locator("[data-dish='k'] .stepper").count() == 2, "bấm Thêm ở mục nổi bật: cả 2 chỗ đều hiện số lượng")
        check("45.000" in page.inner_text("#cart-total"), "giỏ chỉ tính 1 phần")
        page.screenshot(path=f"{SHOTS}/s4-order.png")
        check(not errors, "không lỗi JS: " + "; ".join(errors[:3]))
        ctx.close()
        browser.close()
    print("\nKẾT QUẢ:", "TẤT CẢ ĐẠT" if not failures else f"{len(failures)} LỖI")
    sys.exit(1 if failures else 0)

run()
