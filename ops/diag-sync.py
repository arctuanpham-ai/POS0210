# Chỉ ĐỌC: liệt kê các bản backup Room trên cloud (không đọc nội dung chunk).
import json, subprocess, urllib.request, datetime
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
R = "https://firestore.googleapis.com/v1/projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210/privateBackup/room"
def get(url):
    try: return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})))
    except Exception as e: return {"error": str(e)}
def show(d):
    out = {}
    for k, f in d.get("fields", {}).items():
        val = next(iter(f.values()))
        if k.lower().endswith("at") and str(val).isdigit(): val = datetime.datetime.utcfromtimestamp(int(val) / 1000).strftime("%Y-%m-%d %H:%M UTC")
        out[k] = val
    return out
for sub in ["slots", "meta", "generations"]:
    d = get(f"{R}/{sub}?pageSize=100&mask.fieldPaths=createdAt&mask.fieldPaths=bytes&mask.fieldPaths=chunks&mask.fieldPaths=format&mask.fieldPaths=businessHash&mask.fieldPaths=device&mask.fieldPaths=slot")
    print("==", sub, d.get("error", ""))
    for x in d.get("documents", []):
        print("  ", x["name"].split("/")[-1], "create", x["createTime"][:19], "update", x["updateTime"][:19], show(x))
