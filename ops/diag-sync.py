# Chỉ ĐỌC: xem các tài liệu tổng hợp có trường thời gian nào để biết máy nào ghi.
import json, subprocess, urllib.request, datetime
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
P = "projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
def get(path):
    try: return json.load(urllib.request.urlopen(urllib.request.Request("https://firestore.googleapis.com/v1/" + P + "/" + path, headers={"Authorization": "Bearer " + tok})))
    except Exception as e: return {"error": str(e)}
for path in ["dashboardMonthly/2026-10", "dashboardMonthly/2026-09", "dashboardDaily/2026-10-20", "dashboardDaily/2026-10-22", "dashboardDaily/2026-10-23", "dashboard/current"]:
    d = get(path)
    if "error" in d: print(path, d["error"]); continue
    f = d.get("fields", {})
    out = {}
    for k, v in f.items():
        val = next(iter(v.values()))
        if isinstance(val, (str, int)) and (k.lower().endswith("at") or k in ("date", "month", "revenue", "billCount", "revenueToday", "monthRevenue", "paidBills")):
            if k.lower().endswith("at") and str(val).isdigit(): val = f"{val} = {datetime.datetime.fromtimestamp(int(val)/1000, datetime.UTC):%m-%d %H:%M}Z"
            out[k] = val
    print(path, "| tạo", d["createTime"][5:19], "| sửa", d["updateTime"][5:19], "| trường:", sorted(f.keys())[:25], "|", out)
