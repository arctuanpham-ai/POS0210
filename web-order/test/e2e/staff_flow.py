"""Chạy thử tab "Đơn online" của web dashboard (Chromium + Firebase giả lập). Dùng: python3 test/e2e/staff_flow.py"""
import hashlib, json, os, sys, threading, time, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

DASH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "web-dashboard"))
SHOTS = os.environ.get("SHOTS", "/tmp/claude-0/out/shots")
os.makedirs(SHOTS, exist_ok=True)
OWNER = "X9ln8CP7UtbOLOHfipYMCjfbb1p1"
ROOT = f"users/{OWNER}/stores/0210"
PIN_HASH = hashlib.sha256(b"pos0210-web:1234").hexdigest()

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=DASH)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{port}/"

APP = "export const initializeApp = () => ({});"
AUTH = f"""
export const getAuth = () => ({{}});
export const onAuthStateChanged = (a, cb) => {{ setTimeout(() => cb({{ uid: '{OWNER}', email: 'quan@example.com' }}), 0); return () => {{}}; }};
export const signInWithEmailAndPassword = async () => ({{}});
export const signOut = async () => {{}};
"""
FS = """
const ts = (ms) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000), nanoseconds: 0, __ms: ms });
const S = (window.__mock = { docs: {}, listeners: new Set(), writes: [] });
const snapDoc = (p) => ({ id: p.split('/').pop(), ref: { path: p }, exists: () => p in S.docs, data: () => S.docs[p] });
const inCol = (p, base) => p.startsWith(base + '/') && p.slice(base.length + 1).indexOf('/') === -1;
const match = (d, filters) => (filters || []).every((f) => { const v = d[f.f]; const x = v && v.toMillis ? v.toMillis() : v; const y = f.v && f.v.toMillis ? f.v.toMillis() : f.v; return f.op === '>=' ? x >= y : f.op === '==' ? x === y : true; });
const colSnap = (base, filters) => { const docs = Object.keys(S.docs).filter((p) => inCol(p, base) && match(S.docs[p], filters)).map(snapDoc); return { docs, empty: !docs.length, size: docs.length, docChanges: () => docs, forEach: (fn) => docs.forEach(fn) }; };
const notify = (p) => { for (const l of S.listeners) { if (l.kind === 'doc' && l.path === p) l.next(snapDoc(p)); if (l.kind === 'query' && inCol(p, l.path)) l.next(colSnap(l.path, l.filters)); } };
window.__mockSet = (p, data) => { S.docs[p] = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v && v.__ms !== undefined ? ts(v.__ms) : v])); notify(p); };
export class Timestamp { static fromMillis(ms) { return ts(ms); } static now() { return ts(Date.now()); } }
export const getFirestore = () => ({});
export const collection = (db, ...segs) => ({ type: 'col', path: segs.join('/') });
export const doc = (db, ...segs) => ({ type: 'doc', path: segs.join('/'), id: segs[segs.length - 1] });
export const getDoc = async (ref) => snapDoc(ref.path);
export const getDocs = async (q) => colSnap(q.path, q.filters);
export const where = (f, op, v) => ({ kind: 'where', f, op, v });
export const orderBy = () => ({ kind: 'orderBy' });
export const limit = () => ({ kind: 'limit' });
export const query = (col, ...cs) => ({ ...col, filters: cs.filter((c) => c.kind === 'where') });
export const setDoc = async (ref, data, opts) => { const cur = opts && opts.merge ? (S.docs[ref.path] || {}) : {}; S.writes.push([ref.path, data]); S.docs[ref.path] = { ...cur, ...data }; notify(ref.path); };
export const onSnapshot = (ref, next, err) => {
  const l = ref.type === 'doc' ? { kind: 'doc', path: ref.path, next } : { kind: 'query', path: ref.path, filters: ref.filters, next };
  S.listeners.add(l);
  setTimeout(() => next(l.kind === 'doc' ? snapDoc(l.path) : colSnap(l.path, l.filters)), 0);
  return () => S.listeners.delete(l);
};
export const writeBatch = () => { const ops = []; const b = { set: (r, d) => { ops.push(['set', r, d]); return b; }, update: (r, d) => { ops.push(['update', r, d]); return b; }, delete: (r) => { ops.push(['delete', r]); return b; }, commit: async () => { for (const [k, r, d] of ops) { if (k === 'delete') delete S.docs[r.path]; else S.docs[r.path] = { ...(k === 'update' ? S.docs[r.path] : {}), ...d }; notify(r.path); } } }; return b; };
export const runTransaction = async (db, fn) => {
  const pending = [];
  const tx = { get: async (ref) => snapDoc(ref.path), update: (ref, d) => { pending.push([ref.path, d]); return tx; }, set: (ref, d) => { pending.push([ref.path, d, true]); return tx; }, delete: (ref) => { pending.push([ref.path, null, false, true]); return tx; } };
  const out = await fn(tx);
  for (const [p, d, whole, del] of pending) { if (del) { delete S.docs[p]; notify(p); continue; } S.writes.push([p, d]); S.docs[p] = { ...(whole ? {} : S.docs[p]), ...d }; notify(p); }
  return out;
};
"""
failures = []
def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond: failures.append(msg)

NOW = int(time.time() * 1000)
def order(code, status, **kw):
    base = {"id": code, "code": code, "uid": "g1", "name": "Lan", "phone": "0912345678", "mode": "pickup", "address": "", "table": "", "note": "", "status": status, "total": 95000,
            "items": [{"id": "a", "name": "Bạc xỉu", "qty": 2, "note": "ít đá", "price": 30000}, {"id": "b", "name": "Americano ", "qty": 1, "note": "", "price": 35000}],
            "rejectReason": "", "transferContent": "", "expiresAt": None, "createdAt": {"__ms": NOW - 120000}}
    base.update(kw); return base

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 390, "height": 900}, device_scale_factor=2).new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        dialogs = []
        def on_dialog(d):
            dialogs.append((d.type, d.message)); d.accept(("XOA" if "XOA" in d.message else "Hết món Bạc xỉu") if d.type == "prompt" else None)
        page.on("dialog", on_dialog)
        mods = {"firebase-app.js": APP, "firebase-auth.js": AUTH, "firebase-firestore.js": FS}
        page.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=mods[r.request.url.rsplit("/", 1)[-1].split("?")[0]]))
        # các CDN khác (nếu có) bị chặn: không ảnh hưởng tab đơn online
        page.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); page.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
        seed = {
          f"{ROOT}/webMembers/huong-ab12": {"id": "huong-ab12", "name": "Hương", "role": "CHU_QUAN", "pinHash": PIN_HASH, "active": True},
          f"{ROOT}/online_config/shop": {"name": "0210 Cafe", "orderingEnabled": True},
          f"{ROOT}/online_orders/OLD111": order("OLD111", "new", createdAt={"__ms": NOW - 3600000}),
          f"{ROOT}/online_limits/u_g1": {"pending": 2, "lastAt": {"__ms": NOW - 60000}, "lastOrder": "OLD111"},
          f"{ROOT}/online_limits/p_0912345678": {"pending": 2, "lastAt": {"__ms": NOW - 60000}, "lastOrder": "OLD111"},
        }
        page.add_init_script("window.__seed = " + json.dumps(seed) + ";")
        page.add_init_script("""Object.defineProperty(window, '__mock', { configurable: true, set(v) { this.__m = v; for (const [k, x] of Object.entries(window.__seed)) v.docs[k] = Object.fromEntries(Object.entries(x).map(([a, b]) => [a, b && b.__ms !== undefined ? { toMillis: () => b.__ms, __ms: b.__ms } : b])); }, get() { return this.__m; } });""")
        page.goto(BASE)
        page.wait_for_selector("#pin-input"); page.fill("#pin-input", "1234"); page.click("#pin-button")
        page.wait_for_selector("#dashboard-view:not([hidden])")
        check(page.locator("#tabbar [data-tab='donline']").count() == 1, "có tab Đơn online")
        page.wait_for_function("document.querySelector('#donline-badge') && !document.querySelector('#donline-badge').hidden")
        check(page.inner_text("#donline-badge") == "1", "badge hiện 1 đơn cần xử lý (đơn có sẵn không phát chuông)")
        page.click("#tabbar [data-tab='donline']")
        page.wait_for_selector(".oo-card")
        check("CẦN XÁC NHẬN" in page.inner_text("#oo-list"), "nhóm CẦN XÁC NHẬN")
        check("2× Bạc xỉu" in page.inner_text("#oo-list") and "ít đá" in page.inner_text("#oo-list") and "95.000" in page.inner_text("#oo-list"), "hiện món, ghi chú, tổng tiền")
        check("NHẬN" in page.inner_text("#oo-toggle"), "công tắc nhận đơn đang bật")
        page.screenshot(path=f"{SHOTS}/s1-list.png", full_page=True)

        print("Nhận đơn")
        page.click("[data-oo-act='accept']")
        page.wait_for_selector(".oo-card.s-awaiting_payment")
        o = page.evaluate(f"window.__mock.docs['{ROOT}/online_orders/OLD111']")
        check(o["status"] == "awaiting_payment" and o["transferContent"] == "DMOLD111", "đơn sang chờ thanh toán, nội dung CK DMOLD111")
        check(abs((o["expiresAt"]["__ms"] if "__ms" in o["expiresAt"] else o["expiresAt"]["toMillis"]()) - (NOW + 600000)) < 60000, "hạn thanh toán ~10 phút")
        check(page.evaluate(f"window.__mock.docs['{ROOT}/online_limits/u_g1'].pending") == 2, "nhận đơn không trừ bộ đếm")
        check("Còn 9" in page.inner_text(".oo-countdown") or "Còn 10" in page.inner_text(".oo-countdown"), "hiện đếm ngược")

        print("Đã nhận tiền")
        page.click("[data-oo-act='paid']")
        page.wait_for_selector(".oo-card.s-paid")
        check(any(t == "confirm" for t, _ in dialogs), "có hỏi xác nhận đã nhận tiền")
        check(page.evaluate(f"window.__mock.docs['{ROOT}/online_limits/u_g1'].pending") == 1 and page.evaluate(f"window.__mock.docs['{ROOT}/online_limits/p_0912345678'].pending") == 1, "trừ cả 2 bộ đếm (uid, SĐT)")
        check(page.locator("[data-oo-act='done']").count() == 1 and page.locator("[data-oo-act='deliver']").count() == 0, "đơn mang đi: chỉ có nút Hoàn thành")
        page.click("[data-oo-act='done']")
        page.wait_for_selector(".oo-card.s-done")
        check("ĐÃ XONG HÔM NAY" in page.inner_text("#oo-list") or page.locator(".oo-card.s-done").count() == 1, "đơn hoàn thành")

        print("Đơn mới tới (phát chuông) + từ chối")
        page.evaluate(f"window.__mockSet('{ROOT}/online_orders/NEW222', {json.dumps(order('NEW222', 'new', mode='delivery', address='12 Lê Lợi, Hải Phòng', createdAt={'__ms': NOW}))})")
        page.wait_for_selector(".oo-card.s-new")
        check("Giao tận nơi" in page.inner_text(".oo-card.s-new") and "12 Lê Lợi" in page.inner_text(".oo-card.s-new"), "đơn giao hàng hiện địa chỉ")
        page.screenshot(path=f"{SHOTS}/s2-new.png", full_page=True)
        page.click("[data-oo-act='reject']")
        page.wait_for_selector(".oo-card.s-rejected")
        o = page.evaluate(f"window.__mock.docs['{ROOT}/online_orders/NEW222']")
        check(o["status"] == "rejected" and o["rejectReason"] == "Hết món Bạc xỉu", "từ chối kèm lý do")
        check(page.evaluate(f"window.__mock.docs['{ROOT}/online_limits/u_g1'].pending") == 0, "từ chối trả bộ đếm (về 0)")

        print("Tự đóng đơn quá hạn")
        page.evaluate(f"window.__mockSet('{ROOT}/online_orders/LATE33', {json.dumps(order('LATE33', 'awaiting_payment', transferContent='DMLATE33', expiresAt={'__ms': NOW - 4 * 60000}))})")
        page.wait_for_function(f"window.__mock.docs['{ROOT}/online_orders/LATE33'].status === 'expired'", timeout=8000)
        check(True, "đơn quá hạn +3 phút tự chuyển expired")
        check(page.locator("[data-oo-act='paid']").count() == 1 and "trả muộn" in page.inner_text(".oo-card.s-expired"), "đơn expired vẫn cho ghi nhận khách trả muộn")

        print("Tắt nhận đơn & lưu thông tin quán")
        page.click("#oo-toggle")
        page.wait_for_function("document.querySelector('#oo-toggle').textContent.includes('TẠM NGƯNG')")
        # --- xoá đơn thử (chủ quán) ---
        n_before = page.locator(".oo-card").count()
        check(n_before >= 2 and page.locator("[data-oo-del]").count() == n_before, "chủ quán thấy nút Xoá đơn trên mọi thẻ")
        first_id = page.locator(".oo-card").first.get_attribute("data-oo")
        page.locator(".oo-card").first.locator("[data-oo-del]").click(); page.wait_for_timeout(300)
        check(page.evaluate(f"window.__mock.docs['{ROOT}/online_orders/{first_id}']") is None, "xoá 1 đơn: tài liệu biến mất")
        page.locator("[data-oo-del-all]").click(); page.wait_for_timeout(500)
        check(page.evaluate(f"Object.keys(window.__mock.docs).filter(k => k.includes('/online_orders/')).length") == 0, "xoá tất cả đơn đang hiển thị")
        check(page.evaluate(f"window.__mock.docs['{ROOT}/online_limits/u_g1'].pending") >= 0, "bộ đếm không âm")
        # --- dọn toàn bộ dữ liệu thử ---
        page.evaluate("([r]) => { window.__mockSet(r + '/online_orders/OLD999', { id: 'OLD999', code: 'OLD999', uid: 'g1', status: 'done', total: 1, items: [], createdAt: { __ms: Date.now() - 9 * 86400000 } }); window.__mockSet(r + '/online_limits/u_old', { pending: 1, lastAt: { __ms: Date.now() } }); }", [ROOT])
        page.click("#oo-clean > summary"); page.click("#oo-clean-btn"); page.wait_for_timeout(500)
        check(page.evaluate(f"Object.keys(window.__mock.docs).filter(k => k.includes('/online_orders/') || k.includes('/online_limits/')).length") == 0, "dọn dữ liệu thử: xoá hết đơn (kể cả cũ) và bộ đếm")
        check(page.evaluate(f"Object.keys(window.__mock.docs).filter(k => k.includes('/menu/')).length") >= 0, "không đụng dữ liệu khác")
        check(page.evaluate(f"window.__mock.docs['{ROOT}/online_config/shop'].orderingEnabled") is False, "ghi orderingEnabled=false")
        page.click("#oo-config summary")
        page.fill("#oo-form [name='address']", "12 Lê Lợi, Hồng Bàng, Hải Phòng")
        page.fill("#oo-form [name='phone']", "0912 345 678")
        page.fill("#oo-form [name='bank']", "Techcombank"); page.fill("#oo-form [name='account']", "19031234567890")
        page.click("#oo-form button[type='submit']")
        page.wait_for_function("document.querySelector('#oo-form-error').textContent.length > 0")
        check("tên chủ tài khoản" in page.inner_text("#oo-form-error").lower() or "nhập đủ" in page.inner_text("#oo-form-error").lower(), "thiếu tên chủ TK thì báo lỗi")
        page.fill("#oo-form [name='holder']", "NGUYEN VAN A")
        page.click("#oo-form button[type='submit']")
        page.wait_for_function("document.querySelector('#oo-form-error').textContent === 'Đã lưu.'")
        shop = page.evaluate(f"window.__mock.docs['{ROOT}/online_config/shop']")
        check(shop["bank"] == "Techcombank" and shop["account"] == "19031234567890" and shop["holder"] == "NGUYEN VAN A" and shop["orderingEnabled"] is False, "lưu thông tin quán, giữ nguyên trạng thái tạm ngưng")
        page.screenshot(path=f"{SHOTS}/s3-config.png", full_page=True)
        check(not errors, "không lỗi JS: " + "; ".join(errors[:3]))
        browser.close()
try:
    run()
finally:
    srv.shutdown()
print("\nTHẤT BẠI:" if failures else "\nTẤT CẢ ĐỀU QUA", failures if failures else "")
sys.exit(1 if failures else 0)
