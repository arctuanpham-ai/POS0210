# Bước 2: combo/menu lạ do máy dev. Chép combo "morning" sang vùng cách ly rồi xoá; chỉ IN thông tin món menu bị ghi đè (không sửa).
import json, subprocess, urllib.request
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
R = "projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
API = "https://firestore.googleapis.com/v1/"
def call(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try: return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e: raise SystemExit(f"HTTP {e.code} {url}: {e.read().decode()[:300]}")
combos = call("GET", f"{API}{R}/combos?pageSize=100").get("documents", [])
for d in combos:
    f = d["fields"]; print("combo", d["name"].split("/")[-1], f.get("name", {}).get("stringValue"), f.get("price", {}), "create", d["createTime"][:19], "update", d["updateTime"][:19])
hit = [d for d in combos if d["name"].split("/")[-1].startswith("6bca8b4e") and d["fields"].get("name", {}).get("stringValue", "").strip().lower() == "morning"]
print("khớp combo morning:", len(hit))
if len(hit) == 1:
    d = hit[0]; did = d["name"].split("/")[-1]
    fields = dict(d["fields"]); fields["_origPath"] = {"stringValue": f"combos/{did}"}
    call("PATCH", f"{API}{R}/quarantine_dev_sync_20261022/combos__{did}", {"fields": fields})
    call("DELETE", API + d["name"]); print("đã cách ly + xoá combo morning")
m = call("GET", f"{API}{R}/menu").get("documents", [])
for d in m:
    if d["updateTime"] >= "2026-10-22T14:00":
        print("menu bị ghi đè:", d["name"].split("/")[-1], json.dumps(d["fields"], ensure_ascii=False)[:500], "create", d["createTime"][:19], "update", d["updateTime"][:19])
