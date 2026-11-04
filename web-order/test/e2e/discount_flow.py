"""Chạy thử giảm giá khi đặt online (nhãn đỏ ở góc ảnh, giá mới + giá cũ gạch, tổng đơn, đơn ghi lên Firestore). Dùng: python3 test/e2e/discount_flow.py"""
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

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        print("1. Mặc định giảm 10% khi đặt online (shop chưa đặt mức giảm)")
        ctx, page, errors = open_page(browser, seed({}))
        sellable = page.locator(".dish:not(.off)")
        n = page.evaluate("new Set([...document.querySelectorAll('.dish:not(.off)')].map(d => d.dataset.dish)).size")
        check(n == 3, f"3 món bán được (2 món lẻ + 1 combo): {n}")
        check(page.locator(".disc-badge").count() == sellable.count(), "mỗi món bán được có nhãn giảm giá ở góc ảnh (kể cả bản hiện ở mục nổi bật)")
        check(page.locator(".dish.off .disc-badge").count() == 0, "món tạm hết không có nhãn")
        check("-10%" in page.locator(".disc-badge").first.text_content(), "nhãn ghi -10%")
        color = page.evaluate("getComputedStyle(document.querySelector('.disc-badge')).backgroundColor")
        check(color == "rgb(214, 40, 40)", f"nhãn màu đỏ ({color})")
        box = page.evaluate("(() => { const b = document.querySelector('.disc-badge').getBoundingClientRect(); const i = document.querySelector('.disc-badge').parentElement.getBoundingClientRect(); return [b.left - i.left, b.top - i.top, b.width, b.height]; })()")
        check(box[0] <= 10 and box[1] <= 10 and box[2] < 50 and box[3] < 24, f"nhãn nhỏ, nằm ở góc trên-trái của ảnh {box}")
        a = page.locator("[data-dish='a']").first
        check(a.locator(".price-now").inner_text().replace("\u00a0", " ") == "27.000đ", "Bạc xỉu 30.000đ -> 27.000đ")
        check(a.locator(".price-old").inner_text().replace("\u00a0", " ") == "30.000đ", "giá tại quán gạch ngang 30.000đ")
        check(page.evaluate("getComputedStyle(document.querySelector('[data-dish=a] .price-old')).textDecorationLine") == "line-through", "giá cũ có gạch ngang")
        combo = page.locator("[data-dish='c_x']").first
        check(combo.locator(".disc-badge").count() == 1 and "62.100" in combo.locator(".price-now").inner_text(), "combo 69.000đ -> 62.100đ, có nhãn")
        page.screenshot(path=f"{SHOTS}/d1-menu.png")

        print("2. Giỏ hàng: 2 Bạc xỉu + 1 Americano")
        page.click("[data-dish='a'] [data-act='inc']"); page.click("[data-dish='a'] [data-act='inc']"); page.click("[data-dish='b'] [data-act='inc']")
        check("85.500" in page.inner_text("#cart-total"), f"thanh giỏ: 95.000 - 10% = 85.500 ({page.inner_text('#cart-total')!r})")
        page.click("#cart-open")
        promo = page.inner_text("#sheet-promo")
        check("Tạm tính" in promo and "95.000" in promo, "giỏ hiện tạm tính 95.000đ")
        check("Đặt online giảm 10%" in promo and "9.500" in promo, f"giỏ hiện dòng giảm giá −9.500đ ({promo!r})")
        check("85.500" in page.inner_text("#sheet-total"), "tổng cộng 85.500đ")
        page.screenshot(path=f"{SHOTS}/d2-sheet.png")

        print("3. Gửi đơn: giá từng dòng giữ giá menu (luật Firestore), giảm giá nằm ở trường discount")
        page.fill("input[name='name']", "Lan"); page.fill("input[name='phone']", "0912 345 678")
        page.check("input[value='pickup']"); page.fill("input[name='table']", "5")
        page.check("input[name='consent']")
        page.click("#submit")
        page.wait_for_selector("#screen-track:not([hidden])"); page.wait_for_selector(".status-card h2")
        b = page.evaluate("window.__mock.batches")
        order = next(d for pth, d in b if "/online_orders/" in pth)
        check(order["total"] == 85500 and order["discount"] == 9500 and order["surcharge"] == 0, f"đơn: total {order['total']}, discount {order['discount']}, surcharge {order['surcharge']}")
        check(order["total"] == sum(l["price"] * l["qty"] for l in order["items"]) + order["surcharge"] - order["discount"], "total = tổng dòng + phụ thu - giảm giá")
        check(order["discount"] * 100 <= sum(l["price"] * l["qty"] for l in order["items"]) * 60, "giảm giá ≤ 60% tổng dòng (điều kiện luật)")
        check([l["price"] for l in order["items"]] == [30000, 35000], "giá từng dòng đúng giá menu (không bị sửa)")
        check(len(order) == 17, f"đơn đúng 17 trường ({len(order)})")
        page.click("details.summary summary")
        check("Giảm giá" in page.inner_text("details.summary") and "9.500" in page.inner_text("details.summary"), "màn theo dõi đơn hiện dòng Giảm giá")
        page.screenshot(path=f"{SHOTS}/d3-track.png")
        check(not errors, "không có lỗi JS/console: " + "; ".join(errors[:3]))
        ctx.close()

        print("4. Chủ quán đặt mức giảm 0 -> không còn nhãn, giá như tại quán")
        ctx, page, errors = open_page(browser, seed({"onlineDiscountPercent": 0}))
        check(page.locator(".disc-badge").count() == 0 and page.locator(".price-old").count() == 0, "không nhãn, không giá gạch")
        page.click("[data-dish='a'] [data-act='inc']")
        check("30.000" in page.inner_text("#cart-total"), "tổng đúng giá tại quán")
        ctx.close()

        print("5. Chủ quán đặt mức giảm 15%")
        ctx, page, errors = open_page(browser, seed({"onlineDiscountPercent": 15}))
        check("-15%" in page.locator(".disc-badge").first.text_content(), "nhãn -15%")
        check(page.locator("[data-dish='a'] .price-now").first.inner_text().replace("\u00a0", " ") == "25.500đ", "30.000đ -> 25.500đ")
        ctx.close()

        print("6. Ảnh món: chủ quán đổi ảnh (thumbsVersion) thì khách thấy ngay, không đổi thì dùng ảnh đã nhớ")
        def thumbs_seed(version, img):
            d = seed({"thumbsVersion": version})
            d[f"{ROOT}/menuThumbs/menu_a"] = {"id": "menu_a", "thumb": f"data:image/png;base64,{img}"}
            return d
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, locale="vi-VN")
        page = ctx.new_page()
        mods = {"firebase-app.js": APP, "firebase-auth.js": AUTH, "firebase-firestore.js": FIRESTORE}
        page.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=mods[r.request.url.rsplit("/", 1)[-1].split("?")[0]]))
        page.add_init_script("""
          Object.defineProperty(window, '__mock', { configurable: true, set(v) { this.__m = v; for (const [k,x] of Object.entries(window.__seedDocs)) if (!(k in v.docs)) v.docs[k] = x; }, get() { return this.__m; } });
        """)
        def visit(docs):
            page.add_init_script("window.__seedDocs = " + json.dumps(docs) + ";")
            page.goto(BASE); page.wait_for_function("window.__orderReady === true"); page.wait_for_selector(".dish")
            page.wait_for_timeout(600)
            return page.get_attribute("[data-dish='a'] .dish-img img", "src")
        check(visit(thumbs_seed(1000, "AAAA")).endswith("AAAA"), "lần đầu: hiện ảnh bản 1")
        check(visit(thumbs_seed(1000, "BBBB")).endswith("AAAA"), "thumbsVersion không đổi: dùng ảnh đã nhớ (không tải lại)")
        check(visit(thumbs_seed(2000, "CCCC")).endswith("CCCC"), "thumbsVersion tăng: tải lại và hiện ảnh mới ngay")
        ctx.close()
        browser.close()

run()
print("\nTẤT CẢ ĐỀU QUA" if not failures else f"\n{len(failures)} LỖI:\n- " + "\n- ".join(failures))
sys.exit(1 if failures else 0)
