import requests
import random
import csv
import os

OUTPUT_FILE = "backend/data/urls.csv"

def get_from_github(url, label, category, limit=5000):
    print(f"[+] Fetching from {url}...")
    try:
        res = requests.get(url, timeout=15)
        if res.status_code == 200:
            lines = res.text.splitlines()
            urls = []
            for l in lines:
                l = l.strip()
                if not l or l.startswith("#"): continue
                if "," in l:
                    parts = l.split(",")
                    domain = parts[1] if len(parts) > 1 else parts[0]
                    if not domain.startswith("http"):
                        domain = f"https://{domain}"
                    urls.append(domain)
                else:
                    if not l.startswith("http"):
                        l = f"http://{l}"
                    urls.append(l)
            print(f"[+] Found {len(urls)} items")
            return [(u, label, category) for u in urls[:limit]]
    except Exception as e:
        print(f"[-] Failed: {e}")
    return []

def main():
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    all_data = []

    # 1. PHISHING SOURCES (~5k)
    all_data += get_from_github("https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-links-ACTIVE.txt", 1, "phishing", 5000)

    # 2. BENIGN SOURCES (~5k)
    # Trying another mirror for Tranco
    all_data += get_from_github("https://raw.githubusercontent.com/opendns/top-1m/master/top-1m.csv", 0, "legit", 5000)
    
    # If still low on benign, add more simulated SaaS
    benign_count = len([x for x in all_data if x[1] == 0])
    if benign_count < 2000:
        print("[+] Benign sources failed, adding extra simulated benign...")
        common = ["google.com", "github.com", "microsoft.com", "amazon.com", "apple.com", "cloudflare.com"]
        for c in common:
            all_data.append((f"https://{c}", 0, "legit"))

    # 3. SAAS BENIGN (4k to balance)
    SAAS_ROOTS = ["amazonaws.com", "googleapis.com", "workers.dev", "vercel.app", "azurewebsites.net", "firebaseapp.com", "github.io", "netlify.app"]
    print("[+] Generating SaaS...")
    for _ in range(4000):
        root = random.choice(SAAS_ROOTS)
        sub = "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=10))
        all_data.append((f"https://{sub}.{root}", 0, "benign_complex"))

    # 4. EDGE CASES (1k)
    print("[+] Generating Edge...")
    for _ in range(1000):
        ip = ".".join(str(random.randint(1, 255)) for _ in range(4))
        all_data.append((f"http://{ip}/login", 1, "edge_case"))

    random.shuffle(all_data)

    print(f"[+] Final Dataset Size: {len(all_data)}")
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["url", "label", "category"])
        writer.writerows(all_data)
    print("[+] Done!")

if __name__ == "__main__":
    main()
