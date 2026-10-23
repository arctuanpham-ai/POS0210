# Chỉ ĐỌC: phân tích bill trên cloud theo giờ mở/đóng bill (giờ VN) và theo đợt tạo.
import json, subprocess, urllib.request, collections, datetime
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
P = "projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})))
def docs(col):
    out, page = [], ""
    while True:
        d = get(f"https://firestore.googleapis.com/v1/{P}/{col}?pageSize=300" + (f"&pageToken={page}" if page else ""))
        out += d.get("documents", []); page = d.get("nextPageToken", "")
        if not page: return out
def iv(f, k):
    v = f.get(k, {})
    return int(v["integerValue"]) if "integerValue" in v else None
VN = datetime.timezone(datetime.timedelta(hours=7))
bills = docs("bills")
rows = []
for d in bills:
    f = d["fields"]
    c = iv(f, "closedAt"); o = iv(f, "openedAt")
    t = datetime.datetime.fromtimestamp((c or o or 0) / 1000, VN)
    rows.append(dict(id=d["name"].split("/")[-1][:8], st=f.get("status", {}).get("stringValue"), total=iv(f, "total") or 0, t=t, h=t.hour, create=d["createTime"][:16]))
print("tổng bill:", len(rows), collections.Counter(r["st"] for r in rows))
print("theo tháng:", sorted(collections.Counter(r["t"].strftime("%Y-%m") for r in rows).items()))
inside = [r for r in rows if 6 <= r["h"] < 20 and r["t"] >= datetime.datetime(2026, 10, 10, tzinfo=VN)]
out_h = [r for r in rows if not (6 <= r["h"] < 20)]
before = [r for r in rows if r["t"] < datetime.datetime(2026, 10, 10, tzinfo=VN)]
print("trong khung 6-20h và từ 10/10:", len(inside), "| tổng tiền", sum(r["total"] for r in inside))
print("NGOÀI khung 6-20h:", len(out_h), "| tổng tiền", sum(r["total"] for r in out_h))
print("TRƯỚC 10/10:", len(before), "| tổng tiền", sum(r["total"] for r in before))
print("ngoài khung theo đợt tạo (phút UTC):", sorted(collections.Counter(r["create"] for r in out_h).items())[:15])
print("trước 10/10 theo đợt tạo:", sorted(collections.Counter(r["create"] for r in before).items())[:15])
print("PAID & trong khung & từ 10/10:", len([r for r in inside if r["st"] == "PAID"]), "(so với báo cáo tháng 10 của POS: 394)")
byday = collections.defaultdict(lambda: [0, 0])
for r in inside:
    if r["st"] == "PAID": byday[r["t"].strftime("%m-%d")][0] += 1; byday[r["t"].strftime("%m-%d")][1] += r["total"]
print("theo ngày (chỉ PAID trong khung):", {k: tuple(v) for k, v in sorted(byday.items())})
