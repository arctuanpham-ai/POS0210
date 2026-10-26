# Chỉ ĐỌC (ít tài liệu): doanh thu ngày/tháng trên cloud để so với báo cáo máy POS.
import json, subprocess, urllib.request
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
P = "projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})))
def val(v):
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "stringValue" in v: return v["stringValue"]
    if "mapValue" in v: return {k: val(x) for k, x in v["mapValue"].get("fields", {}).items()}
    if "arrayValue" in v: return [val(x) for x in v["arrayValue"].get("values", [])]
    return list(v.values())[0]
for col in ("dashboardDaily", "dashboardMonthly"):
    d = get(f"https://firestore.googleapis.com/v1/{P}/{col}?pageSize=60")
    print("==", col)
    for doc in sorted(d.get("documents", []), key=lambda x: x["name"]):
        f = {k: val(v) for k, v in doc["fields"].items()}
        keep = {k: f[k] for k in f if k in ("dateKey", "monthKey", "revenue", "billCount", "bills", "orderCount", "cash", "transfer", "updatedAt", "lastUpdatedAt") or "revenue" in k.lower()}
        print(doc["name"].split("/")[-1], json.dumps(keep, ensure_ascii=False)[:300])
