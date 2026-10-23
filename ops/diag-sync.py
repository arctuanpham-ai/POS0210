# Chỉ ĐỌC: kiểm tra các mục còn lại sau khi máy thật ghi lại toàn bộ.
import json, subprocess, urllib.request
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
P = "projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
def get(path):
    try: return json.load(urllib.request.urlopen(urllib.request.Request("https://firestore.googleapis.com/v1/" + P + "/" + path, headers={"Authorization": "Bearer " + tok})))
    except Exception as e: return {"error": str(e)}
DEV = ("2026-10-22T14:00", "2026-10-22T14:45")
def lst(col):
    out, page = [], ""
    while True:
        d = get(f"{col}?pageSize=300&mask.fieldPaths=id" + (f"&pageToken={page}" if page else ""))
        out += d.get("documents", []); page = d.get("nextPageToken", "")
        if not page or "error" in d: return out
bad = 0
for col in ["days", "shifts", "config", "online_config", "dashboardDaily", "dashboardMonthly", "dashboard", "menu", "combos", "bills", "payments", "sessions", "orderBatches", "orderItems"]:
    ds = lst(col)
    still = [d for d in ds if DEV[0] <= d["updateTime"][:16] < DEV[1]]
    bad += len(still)
    print(f"{col}: {len(ds)} tài liệu | còn mang dấu giờ máy dev (14:00-14:45Z): {len(still)}", [d['name'].split('/')[-1][:30] for d in still[:6]])
print("TỔNG còn dấu máy dev:", bad)
for path in ["config/paymentFlow", "config/menuVersion", "online_config/promo"]:
    d = get(path); print(path, "sửa", d.get("updateTime", d.get("error"))[:19])
