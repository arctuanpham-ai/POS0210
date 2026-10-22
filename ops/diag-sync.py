# Chỉ ĐỌC: tìm các tài liệu bị đẩy lên hàng loạt trong vài giờ qua (theo createTime) ở từng collection đồng bộ.
import json, sys, subprocess, collections, urllib.request, urllib.parse
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
B = "https://firestore.googleapis.com/v1/projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
def get(url):
    r = urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})
    return json.load(urllib.request.urlopen(r))
def docs(col):
    out, page = [], ""
    while True:
        d = get(f"{B}/{col}?pageSize=300&mask.fieldPaths=id" + (f"&pageToken={page}" if page else ""))
        out += d.get("documents", [])
        page = d.get("nextPageToken", "")
        if not page: return out
for col in ["bills","payments","sessions","orderBatches","orderItems","refunds","shifts","days","tableStatus","expenseReceipts","purchases","suppliers","menu","menuCategories","combos","areas"]:
    try: ds = docs(col)
    except Exception as e: print(col, "ERROR", e); continue
    c = collections.Counter(d["createTime"][:16] for d in ds)  # theo phút
    hours = collections.Counter(d["createTime"][:13] for d in ds)
    print(f"== {col}: {len(ds)} tài liệu; tạo theo giờ UTC (5 giờ gần nhất):", sorted(hours.items())[-5:])
    big = [(k, v) for k, v in sorted(c.items()) if v >= 15]
    print("   phút có >=15 tài liệu được tạo:", big[-8:])
