# Hoàn tác đợt đồng bộ nhầm từ máy dev (14:21 UTC 22/10/2026): chép các tài liệu MỚI sang vùng cách ly rồi xoá bản gốc.
# Chỉ đụng tài liệu có createTime trong cửa sổ đợt đồng bộ; dừng nếu số lượng lệch so với dự kiến.
import json, subprocess, urllib.request, urllib.parse
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
R = "projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
API = "https://firestore.googleapis.com/v1/"
def call(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try: return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e: raise SystemExit(f"HTTP {e.code} {url}: {e.read().decode()[:300]}")
def docs(col):
    out, page = [], ""
    while True:
        d = call("GET", f"{API}{R}/{col}?pageSize=300" + (f"&pageToken={page}" if page else ""))
        out += d.get("documents", [])
        page = d.get("nextPageToken", "")
        if not page: return out
LO, HI = "2026-10-22T14:00:00", "2026-10-22T14:25:00"
EXPECT = {"bills": 18, "payments": 18, "sessions": 24, "orderBatches": 26, "orderItems": 53, "shifts": 8}
found = {c: [d for d in docs(c) if LO <= d["createTime"] < HI] for c in EXPECT}
print({c: len(v) for c, v in found.items()})
if {c: len(v) for c, v in found.items()} != EXPECT: raise SystemExit("Số lượng lệch dự kiến, dừng, không xoá gì.")
for col, lst in found.items():
    for d in lst:
        did = d["name"].split("/")[-1]
        fields = dict(d.get("fields", {})); fields["_origPath"] = {"stringValue": f"{col}/{did}"}
        call("PATCH", f"{API}{R}/quarantine_dev_sync_20261022/{col}__{did}", {"fields": fields})
print("đã chép sang quarantine_dev_sync_20261022")
for col, lst in found.items():
    for d in lst: call("DELETE", API + d["name"])
print("đã xoá bản gốc")
