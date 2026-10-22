# Chỉ ĐỌC: chi tiết các tài liệu tạo/sửa trong đợt đồng bộ nhầm (từ 14:00 UTC ngày 22/10).
import json, subprocess, urllib.request
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
B = "https://firestore.googleapis.com/v1/projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})))
def docs(col):
    out, page = [], ""
    while True:
        d = get(f"{B}/{col}?pageSize=300" + (f"&pageToken={page}" if page else ""))
        out += d.get("documents", [])
        page = d.get("nextPageToken", "")
        if not page: return out
def v(f):
    for k in ("stringValue", "integerValue", "doubleValue", "booleanValue", "timestampValue"):
        if k in f: return f[k]
    return "…"
CUT = "2026-10-22T14:00"
for col in ["bills", "payments", "shifts", "days", "sessions", "refunds", "expenseReceipts", "purchases", "menu", "combos"]:
    ds = docs(col)
    created = [d for d in ds if d["createTime"] >= CUT]
    updated_old = [d for d in ds if d["updateTime"] >= CUT and d["createTime"] < CUT]
    print(f"== {col}: tạo mới sau {CUT}: {len(created)} | tạo trước nhưng bị GHI ĐÈ sau đó: {len(updated_old)}")
    for tag, lst in (("MỚI", created[:6]), ("ĐÈ", updated_old[:6])):
        for d in lst:
            f = d.get("fields", {})
            keys = ["billNo", "total", "status", "closedAt", "dataScope", "method", "amount", "date", "staffName", "name", "price"]
            print("  ", tag, d["name"].split("/")[-1][:12], d["createTime"][11:19], d["updateTime"][11:19], {k: v(f[k]) for k in keys if k in f})
for path in ["dashboard/current", "config/safe"]:
    d = get(f"{B}/{path}")
    print("==", path, "update", d.get("updateTime"), "create", d.get("createTime"))
