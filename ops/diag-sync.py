# Chỉ ĐỌC: tài liệu dashboard/foodApp và các lệnh foodAppSettle.
import json, subprocess, urllib.request
tok = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
P = "projects/pos0210-17ce4/databases/(default)/documents/users/X9ln8CP7UtbOLOHfipYMCjfbb1p1/stores/0210"
def get(url):
    try: return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})))
    except Exception as e: return {"error": str(e)}
print("== dashboard/foodApp"); print(json.dumps(get(f"https://firestore.googleapis.com/v1/{P}/dashboard/foodApp"), ensure_ascii=False)[:1800])
print("== foodAppSettle"); print(json.dumps(get(f"https://firestore.googleapis.com/v1/{P}/foodAppSettle?pageSize=20"), ensure_ascii=False)[:1500])
