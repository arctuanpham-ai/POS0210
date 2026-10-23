# Chỉ ĐỌC: chi tiết 5 mục còn sót và danh sách combo.
import json, subprocess, urllib.request
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
P = "projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
def get(path):
    try: return json.load(urllib.request.urlopen(urllib.request.Request("https://firestore.googleapis.com/v1/" + P + "/" + path, headers={"Authorization": "Bearer " + tok})))
    except Exception as e: return {"error": str(e)}
for c in get("combos?pageSize=50").get("documents", []):
    f = c["fields"]; print("combo", c["name"].split("/")[-1][:8], f.get("name", {}).get("stringValue"), next(iter(f.get("price", {"x": "?"}).values())), "tạo", c["createTime"][5:19], "sửa", c["updateTime"][5:19])
for path in ["dashboardDaily/2026-10-16", "shifts/31bf8780-4e73-4018-a06a-d35a271bad6b", "config/menuVersion", "online_config/promo", "menu/e7190aa8-eb41-4939-8c34-1f931954db23"]:
    d = get(path)
    print("==", path, "| tạo", d.get("createTime", "")[5:19], "| sửa", d.get("updateTime", d.get("error"))[5:19])
    print("  ", json.dumps(d.get("fields", {}), ensure_ascii=False)[:600])
