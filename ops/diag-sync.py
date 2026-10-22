# Chỉ ĐỌC: mọi tài liệu dưới cửa hàng 0210 bị tạo/sửa từ 13:00 UTC (20:00 giờ VN) ngày 22/10.
import json, subprocess, urllib.request
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
P = "projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
API = "https://firestore.googleapis.com/v1/"
def call(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try: return json.load(urllib.request.urlopen(req))
    except Exception as e: return {"error": str(e)}
CUT = "2026-10-22T14:30"
cols = call("POST", f"{API}{P}:listCollectionIds", {"pageSize": 200}).get("collectionIds", [])
print("collections:", cols)
def docs(path):
    out, page = [], ""
    while True:
        d = call("GET", f"{API}{path}?pageSize=300&mask.fieldPaths=id" + (f"&pageToken={page}" if page else ""))
        out += d.get("documents", []); page = d.get("nextPageToken", "")
        if not page or "error" in d: return out
for c in cols:
    if c in ("privateBackup",): continue
    ds = docs(f"{P}/{c}")
    new = [d for d in ds if d["createTime"] >= CUT]
    upd = [d for d in ds if d["updateTime"] >= CUT and d["createTime"] < CUT]
    if not new and not upd: print(f"{c}: {len(ds)} tài liệu, không đổi từ mốc"); continue
    print(f"{c}: {len(ds)} tài liệu | TẠO MỚI {len(new)} | SỬA {len(upd)}")
    for tag, lst in (("mới", new), ("sửa", upd)):
        for d in lst[:12]: print("    ", tag, d["name"].split("/")[-1][:40], "tạo", d["createTime"][5:19], "sửa", d["updateTime"][5:19])
        if len(lst) > 12: print("     …", len(lst) - 12, "nữa")

d = call("GET", f"{API}{P}/dashboard/current")
f = d.get("fields", {})
import datetime
lu = f.get("lastUpdatedAt", {}).get("integerValue")
print("dashboard/current lastUpdatedAt:", lu, datetime.datetime.utcfromtimestamp(int(lu)/1000) if lu else None, "| updateTime", d.get("updateTime"), "| revenueToday", f.get("revenueToday"), "| paidBillsToday", f.get("paidBillsToday"))
