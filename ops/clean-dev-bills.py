# Dọn bill của máy dev trên cloud: bill mở/đóng trước 10/10/2026 hoặc ngoài khung 6h-20h (giờ VN), cùng phiên bàn / lượt gọi / dòng món / thanh toán liên quan.
# MODE=dry (mặc định): chỉ đếm. MODE=apply: chép sang vùng cách ly rồi xoá; dừng nếu số bill lệch EXPECT_BILLS.
import json, subprocess, urllib.request, collections, datetime, os
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
R = "projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
API = "https://firestore.googleapis.com/v1/"
def call(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try: return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e: raise SystemExit(f"HTTP {e.code} {url}: {e.read().decode()[:300]}")
def docs(col):
    out, page = [], ""
    while True:
        d = call("GET", f"{API}{R}/{col}?pageSize=300" + (f"&pageToken={page}" if page else ""))
        out += d.get("documents", []); page = d.get("nextPageToken", "")
        if not page: return out
def iv(f, k):
    v = f.get(k, {}); return int(v["integerValue"]) if "integerValue" in v else None
def sv(f, k): return f.get(k, {}).get("stringValue")
VN = datetime.timezone(datetime.timedelta(hours=7))
OPEN = datetime.datetime(2026, 10, 10, tzinfo=VN)
def bad_time(ms):
    if not ms: return False
    t = datetime.datetime.fromtimestamp(ms / 1000, VN)
    return t < OPEN or not (6 <= t.hour < 20)
bills = docs("bills")
dev_bills = {}
for d in bills:
    f = d["fields"]
    if bad_time(iv(f, "closedAt") or iv(f, "openedAt")) or bad_time(iv(f, "openedAt")):
        dev_bills[d["name"].split("/")[-1]] = d
sessions_of = {sv(d["fields"], "sessionId") for d in dev_bills.values()}
sess = {d["name"].split("/")[-1]: d for d in docs("sessions") if d["name"].split("/")[-1] in sessions_of}
# an toàn: phiên bàn chỉ xoá nếu mọi bill của phiên đó đều thuộc nhóm dev
all_by_session = collections.defaultdict(list)
for d in bills: all_by_session[sv(d["fields"], "sessionId")].append(d["name"].split("/")[-1])
sess = {k: v for k, v in sess.items() if all(b in dev_bills for b in all_by_session[k])}
batches = {d["name"].split("/")[-1]: d for d in docs("orderBatches") if sv(d["fields"], "sessionId") in sess}
items = {d["name"].split("/")[-1]: d for d in docs("orderItems") if sv(d["fields"], "batchId") in batches}
pays = {d["name"].split("/")[-1]: d for d in docs("payments") if sv(d["fields"], "billId") in dev_bills}
plan = {"bills": dev_bills, "sessions": sess, "orderBatches": batches, "orderItems": items, "payments": pays}
print("kế hoạch:", {k: len(v) for k, v in plan.items()}, "| trạng thái bill:", collections.Counter(sv(d["fields"], "status") for d in dev_bills.values()), "| tổng tiền bill:", sum(iv(d["fields"], "total") or 0 for d in dev_bills.values()))
print("bill theo tháng:", sorted(collections.Counter(datetime.datetime.fromtimestamp((iv(d["fields"], "closedAt") or iv(d["fields"], "openedAt") or 0) / 1000, VN).strftime("%Y-%m") for d in dev_bills.values()).items()))
if os.environ.get("MODE") == "apply":
    expect = int(os.environ["EXPECT_BILLS"])
    if len(dev_bills) != expect: raise SystemExit(f"Số bill {len(dev_bills)} khác dự kiến {expect}, dừng.")
    for col, m in plan.items():
        for did, d in m.items():
            fields = dict(d.get("fields", {})); fields["_origPath"] = {"stringValue": f"{col}/{did}"}
            call("PATCH", f"{API}{R}/quarantine_dev_bills_20261023/{col}__{did}", {"fields": fields})
    print("đã chép sang quarantine_dev_bills_20261023")
    for col, m in plan.items():
        for did, d in m.items(): call("DELETE", API + d["name"])
    print("đã xoá bản gốc")
