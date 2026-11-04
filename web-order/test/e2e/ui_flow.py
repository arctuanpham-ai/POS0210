"""Giao diện đặt món gọn (mobile-first): kích thước 360/390/430 + máy tính, thông tin quán thu gọn, ưu đãi, tìm kiếm, thanh nhóm món cuộn ngang, giỏ hàng, trạng thái đóng cửa. Dùng: python3 test/e2e/ui_flow.py"""
import json, os, sys, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from mock_firebase import APP, AUTH, FIRESTORE
PUBLIC=os.path.abspath(os.path.join(os.path.dirname(__file__),"..","..","public"))
OUT=os.environ.get("SHOTS","/tmp/claude-0/out/ui"); os.makedirs(OUT,exist_ok=True)
ROOT="users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(("127.0.0.1",0),functools.partial(Q,directory=PUBLIC)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
BASE=f"http://127.0.0.1:{port}/"
cats=[("c1","Cà phê"),("c2","Ăn sáng"),("c3","Cơm trưa"),("c4","Đồ uống"),("c5","Đồ ăn vặt")]
SEED={f"{ROOT}/online_config/shop":{"name":"0210","address":"LK 02-10 Hoàng Huy riverside","phone":"0702245400 · 0968563539","hours":"6:30 - 18:00","orderingEnabled":True,"onlineDiscountPercent":10,"bank":"Techcombank","account":"1","holder":"X"}}
for i,(cid,n) in enumerate(cats): SEED[f"{ROOT}/menuCategories/{cid}"]={"id":cid,"name":n,"sortOrder":i,"active":True}
names=["Bạc xỉu","Americano","Bánh mì trứng","Cơm gà","Trà đào","Khoai tây chiên"]
for i in range(25): SEED[f"{ROOT}/menu/m{i}"]={"id":f"m{i}","categoryId":cats[i%5][0],"name":(names[i] if i<len(names) else f"Món số {i}"),"price":25000+i*1000,"active":True,"description":"Mô tả ngắn của món"}

failures=[]
def check(c,m):
    print(("  ok   " if c else "  FAIL ")+m)
    if not c: failures.append(m)

def open_page(b,w,h,seed=SEED,clock=None):
    ctx=b.new_context(viewport={"width":w,"height":h},device_scale_factor=1,locale="vi-VN"); page=ctx.new_page()
    errs=[]; page.on("pageerror",lambda e:errs.append(str(e)))
    mods={"firebase-app.js":APP,"firebase-auth.js":AUTH,"firebase-firestore.js":FIRESTORE}
    page.route("https://www.gstatic.com/firebasejs/**",lambda r:r.fulfill(status=200,content_type="application/javascript",body=mods[r.request.url.rsplit("/",1)[-1].split("?")[0]]))
    page.add_init_script("window.__seedDocs="+json.dumps(seed)+";")
    page.add_init_script("Object.defineProperty(window,'__mock',{configurable:true,set(v){this.__m=v;for(const [k,x] of Object.entries(window.__seedDocs)) if(!(k in v.docs)) v.docs[k]=x;},get(){return this.__m;}});")
    if clock: page.clock.install(time=clock)
    page.goto(BASE); page.wait_for_function("window.__orderReady===true"); page.wait_for_selector(".dish"); page.wait_for_timeout(500)
    return ctx,page,errs

with sync_playwright() as p:
    b=p.chromium.launch()
    for w,h in ((360,740),(390,844),(430,932)):
        print(f"{w}x{h}")
        ctx,page,errs=open_page(b,w,h)
        m=page.evaluate("""()=>{const r=e=>document.querySelector(e).getBoundingClientRect();const chips=[...document.querySelectorAll('#cat-chips a')].map(a=>Math.round(a.getBoundingClientRect().top));
          return {dishTop:r('.dish').top,dishBottom:r('.dish').bottom,vh:innerHeight,hs:document.documentElement.scrollWidth>innerWidth,coverH:r('#promo-banner').height,heroH:r('.hero').height,chipsOneRow:new Set(chips).size===1,chipsScroll:document.querySelector('#cat-chips').scrollWidth>document.querySelector('#cat-chips').clientWidth,offerH:r('#promo-banner').height,searchH:r('#menu-search').height,sbar:getComputedStyle(document.querySelector('#cat-chips')).scrollbarWidth}}""")
        check(not m["hs"],"không tràn ngang")
        check(m["dishTop"]<m["vh"]-60 and m["dishBottom"]>0,f"thấy thẻ món đầu tiên không cần cuộn (đỉnh {round(m['dishTop'])}px / cao {m['vh']}px)")
        check(m["dishTop"]<460,f"món đầu tiên nằm trong 460px đầu trang ({round(m['dishTop'])})")
        check(115<=m["coverH"]<=150,f"banner giảm giá cao 115–150px ({round(m['coverH'])}px)")
        check(m["chipsOneRow"] and m["chipsScroll"],"thanh nhóm một hàng, cuộn ngang được")
        check(m["searchH"]>=44,f"ô tìm đủ lớn để chạm ({round(m['searchH'])}px)")
        bt=page.inner_text("#promo-banner")
        check("Đặt món trực tiếp tại 0210" in bt and "GIẢM" in bt and "10%" in bt and "So với giá tại quán" in bt and "Giá trên web đã bao gồm ưu đãi" in bt,"banner: tiêu đề, GIẢM 10%, dòng phụ, ghi chú")
        tx=page.evaluate("""()=>{const b=document.querySelector('#promo-banner').getBoundingClientRect();return [...document.querySelectorAll('#promo-banner .promo-text > *')].every(e=>{const r=e.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom})}""")
        check(tx,"chữ trong banner không bị cắt")
        check(page.input_value("#menu-search")=="" and page.get_attribute("#menu-search","placeholder")=="Tìm món: cà phê, cơm, bánh mì...","placeholder tìm món")
        order=page.evaluate("""()=>{const y=s=>document.querySelector(s).getBoundingClientRect().top+scrollY;return [y('.hero'),y('#promo-banner'),y('#search-box'),y('#cat-chips'),y('.dish'),y('#why'),y('#shop-more')]}""")
        check(order==sorted(order),f"thứ tự: header, banner, tìm kiếm, nhóm món, món, lợi ích, thông tin quán")
        check(page.locator(".why-grid li").count()==4 and "Vì sao nên đặt trực tiếp tại 0210?" in page.inner_text("#why"),"khối lợi ích có 4 thẻ")
        check(not page.locator("#shop-info").is_visible(),"thông tin quán thu gọn mặc định")
        cols=page.evaluate("[...document.querySelectorAll('#menu .menu-section:nth-of-type(2) .dish')].slice(0,2).map(e=>Math.round(e.getBoundingClientRect().left))")
        check(len(set(cols))==2,f"món ăn xếp 2 cột trên điện thoại ({cols})")
        page.screenshot(path=f"{OUT}/m{w}.png")
        if w==390:
            page.click("#shop-more > summary"); page.wait_for_timeout(200)
            t=page.inner_text("#shop-more")
            check("0702245400" in t and "0968563539" in t and "6:30 - 18:00" in t and "dị ứng" in t and "Không cần đăng nhập" in t,"mở rộng: địa chỉ, 2 số điện thoại, giờ, hướng dẫn, dị ứng")
            check("Với những địa chỉ giao hàng xa, 0210 sẽ liên hệ xác nhận phí vận chuyển trước khi giao." in t and "phí vận chuyển" in t,"có chính sách giao hàng và lưu ý phí vận chuyển")
            print("   tel links:",page.locator("#shop-info a").evaluate_all("els=>els.map(e=>e.getAttribute('href'))"))
            check(page.locator("#shop-info a[href^='tel:']").count()==2,"2 số điện thoại bấm gọi được")
            page.evaluate("document.querySelector('#shop-more').scrollIntoView()"); page.screenshot(path=f"{OUT}/m390_open.png")
            page.click("#shop-more > summary")
            # tìm kiếm
            check(not page.locator("#kw-chips").is_visible(),"gợi ý từ khoá ẩn khi chưa bấm tìm")
            page.click("#menu-search"); page.wait_for_timeout(200)
            check(page.locator("#kw-chips button").count()>=1 and page.locator("#kw-chips").is_visible(),"bấm vào ô tìm: hiện gợi ý")
            page.keyboard.type("bạc"); page.wait_for_timeout(300)
            check(page.locator(".dish").count()>=1 and "Bạc xỉu" in page.inner_text("#menu"),"tìm được món")
            page.click("#search-clear"); page.wait_for_timeout(200); page.evaluate("document.activeElement.blur()"); page.wait_for_timeout(400)
            check(page.locator("#cat-chips a").count()==5,"xoá tìm: thanh nhóm trở lại")
            # nhóm: chọn + cuộn
            check(page.locator("#cat-chips a.active").count()==1,"có đúng 1 nhóm đang chọn")
            cid=page.get_attribute("#cat-chips a >> nth=2","data-cat")
            page.click("#cat-chips a >> nth=2"); page.wait_for_timeout(1500)
            act=page.inner_text("#cat-chips a.active"); check(act==page.inner_text("#cat-chips a >> nth=2"),f"bấm nhóm: chip đang chọn đổi ({act})")
            top=page.evaluate(f"document.querySelector('#cat-{cid}').getBoundingClientRect().top")
            check(0<=top<120,f"bấm nhóm: cuộn tới đúng mục, không bị thanh nhóm che ({round(top)}px)")
            page.evaluate("window.scrollTo(0,0)"); page.wait_for_timeout(500)
            check(page.inner_text("#cat-chips a.active")==page.inner_text("#cat-chips a >> nth=0"),"cuộn lên đầu: chip đầu được chọn")
            cid3=page.get_attribute("#cat-chips a >> nth=3","data-cat")
            page.wait_for_timeout(900)
            page.evaluate(f"window.scrollTo(0,document.querySelector('#cat-{cid3}').getBoundingClientRect().top+scrollY-64)"); page.wait_for_timeout(500)
            check(page.inner_text("#cat-chips a.active")==page.inner_text("#cat-chips a >> nth=3"),"cuộn trang: chip nhóm tương ứng sáng lên")
            page.evaluate("window.scrollTo(0,document.documentElement.scrollHeight)"); page.wait_for_timeout(500)
            check(page.inner_text("#cat-chips a.active")==page.inner_text("#cat-chips a >> nth=4"),"cuối trang: chip nhóm cuối được chọn")
            page.evaluate("window.scrollTo(0,0)")
            # giỏ hàng
            page.click(".dish .add >> nth=0"); page.wait_for_timeout(300)
            cb=page.evaluate("(()=>{const r=document.querySelector('#cartbar').getBoundingClientRect();return {vis:!document.querySelector('#cartbar').hidden,bottom:Math.round(r.bottom),vh:innerHeight}})()")
            check(cb["vis"] and cb["bottom"]<=cb["vh"],"thanh giỏ hàng cố định hiện khi có món")
            page.click("#cart-open"); page.wait_for_timeout(300)
            check(page.locator("#sheet").is_visible(),"mở được giỏ hàng")
            page.click("#sheet-close"); page.wait_for_timeout(200)
        check(not errs,f"không lỗi runtime {errs}")
        ctx.close()
    print("1440x900 + 820x1180")
    for w,h in ((1440,900),(820,1180)):
        ctx,page,errs=open_page(b,w,h)
        check(not page.locator("#shop-more").evaluate("e=>e.open"),f"{w}: thông tin quán thu gọn mặc định")
        check(not page.evaluate("document.documentElement.scrollWidth>innerWidth"),f"{w}: không tràn ngang")
        check(page.evaluate("document.querySelector('.dish').getBoundingClientRect().top")<h-80,f"{w}: thấy món đầu tiên")
        if w==1440: check(page.evaluate("new Set([...document.querySelectorAll('#cat-chips a')].map(a=>Math.round(a.getBoundingClientRect().top))).size")==1,f"{w}: các chip nhóm cùng một hàng")
        page.screenshot(path=f"{OUT}/d{w}.png"); check(not errs,f"{w}: không lỗi runtime")
        ctx.close()
    print("Đóng cửa (giờ mở cửa chỉ 1 phút nên lúc nào cũng đóng)")
    seed4=dict(SEED); seed4[f"{ROOT}/online_config/shop"]={**SEED[f"{ROOT}/online_config/shop"],"hours":"6:30 - 6:31"}
    ctx,page,errs=open_page(b,390,844,seed=seed4)
    st=page.inner_text("#open-status"); check("đóng" in st.lower() or "mở" in st.lower(),f"có trạng thái mở/đóng ({st.strip()})")
    check("Đã đóng cửa" in st,f"đóng cửa hiển thị đúng ({st.strip()})")
    check(page.evaluate("document.querySelector('.dish').getBoundingClientRect().top")<740,"đóng cửa: vẫn thấy món")
    page.screenshot(path=f"{OUT}/closed390.png"); ctx.close()
    seed2=dict(SEED); seed2[f"{ROOT}/online_config/shop"]={**SEED[f"{ROOT}/online_config/shop"],"orderingEnabled":False,"notice":"Quán tạm nghỉ"}
    ctx,page,errs=open_page(b,390,844,seed=seed2)
    check("Quán tạm nghỉ" in page.inner_text("#closed-banner") and page.locator("#closed-banner").is_visible(),"tạm ngưng nhận đơn: thông báo hiện ngay đầu trang"); ctx.close()
    seed3=dict(SEED); seed3[f"{ROOT}/online_config/shop"]={**SEED[f"{ROOT}/online_config/shop"],"onlineDiscountPercent":0}
    ctx,page,errs=open_page(b,390,844,seed=seed3)
    check(not page.locator("#offer-note").is_visible(),"không bật giảm giá: ẩn thông điệp ưu đãi (không hard-code)"); ctx.close()
    b.close()
print("\nTHẤT BẠI:",failures) if failures else print("\nUI: TẤT CẢ ĐẠT")
sys.exit(1 if failures else 0)
