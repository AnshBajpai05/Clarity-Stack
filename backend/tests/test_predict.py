import httpx, json, sys

url = sys.argv[1] if len(sys.argv) > 1 else "https://tinyurl.com/2p9x8example"
resp = httpx.post("http://localhost:8000/predict", json={"url": url}, timeout=30)
data = resp.json()
print("ssl_info:", json.dumps(data.get("ssl_info"), indent=2))
print("security_headers:", json.dumps(data.get("security_headers"), indent=2))
print("analysis_mode:", data.get("analysis_mode"))
print("verdict:", data.get("verdict"))
print("risk_score:", data.get("risk_score"))
