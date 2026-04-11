import os
import requests
import pandas as pd
import random
import tldextract
from urllib.parse import urlparse
import time

# ============================
# CONFIG
# ============================
PHISHTANK_URL = "http://data.phishtank.com/data/online-valid.csv"
OPENPHISH_URL = "https://openphish.com/feed.txt"
COMMONCRAWL_SAMPLE = "https://data.commoncrawl.org/crawl-data/CC-MAIN-2023-14/warc.paths.gz"

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH_CSV = os.path.join(DATA_DIR, "workspace_dataset.csv")
OUTPUT_PATH_JSON = os.path.join(DATA_DIR, "workspace_dataset.json")

TARGET_TOTAL = 2000
BENIGN_RATIO = 0.7
PHISH_RATIO = 0.3

# ============================
# HELPERS
# ============================

def normalize_url(url):
    try:
        url = str(url).strip()
        if not url.startswith("http"):
            url = "http://" + url
        parsed = urlparse(url)
        return parsed.geturl()
    except:
        return None

def is_valid_url(url):
    try:
        parsed = urlparse(url)
        return parsed.netloc != ""
    except:
        return False

def extract_domain(url):
    ext = tldextract.extract(url)
    return f"{ext.domain}.{ext.suffix}"


# ============================
# 1. PHISHTANK
# ============================

def load_phishtank(limit=500):
    print("[+] Downloading PhishTank...")
    try:
        df = pd.read_csv(PHISHTANK_URL)
        urls = df["url"].dropna().tolist()
        return urls[:limit]
    except Exception as e:
        print(f"[-] PhishTank failed: {e}")
        return []


# ============================
# 2. OPENPHISH
# ============================

def load_openphish(limit=300):
    print("[+] Downloading OpenPhish...")
    try:
        res = requests.get(OPENPHISH_URL, timeout=10)
        urls = res.text.split("\n")
        return [u for u in urls if u][:limit]
    except Exception as e:
        print(f"[-] OpenPhish failed, retrying or skipping: {e}")
        time.sleep(2)
        try:
            res = requests.get(OPENPHISH_URL, timeout=10)
            urls = res.text.split("\n")
            return [u for u in urls if u][:limit]
        except Exception as e2:
            print(f"[-] OpenPhish final failure: {e2}")
            return []


# ============================
# 3. COMMON CRAWL (SIMPLIFIED)
# ============================

def load_commoncrawl_sample(limit=700):
    print("[+] Loading Common Crawl sample...")
    
    # For simplicity: use a public curated list instead of full crawl
    sample_urls = [
        "https://medium.com",
        "https://dev.to",
        "https://nytimes.com",
        "https://bbc.com",
        "https://cnn.com",
        "https://stackoverflow.com",
        "https://github.com",
        "https://notion.so",
        "https://docs.python.org",
        "https://reactjs.org",
        "https://developer.mozilla.org",
        "https://aws.amazon.com",
        "https://azure.microsoft.com",
        "https://stripe.com/docs"
    ]
    
    urls = []
    for _ in range(limit):
        base = random.choice(sample_urls)
        # Adding some random paths to make them unique
        urls.append(f"{base}/page_{random.randint(100,9999)}")
    
    return urls


# ============================
# 4. REDDIT / HN LINKS
# ============================

def load_reddit_links(limit=700):
    print("[+] Fetching Reddit links...")
    
    headers = {"User-Agent": "Mozilla/5.0"}
    subreddits = ["programming", "technology", "startups", "cybersecurity", "india"]
    
    urls = []
    
    for sub in subreddits:
        url = f"https://www.reddit.com/r/{sub}/.json"
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code == 200:
                data = res.json()
                for post in data.get("data", {}).get("children", []):
                    link = post["data"].get("url")
                    if link and not "reddit.com" in link:
                        urls.append(link)
        except Exception as e:
            print(f"[-] Reddit {sub} fetch failed: {e}")
    
    # fallback / repeat if needed
    random.shuffle(urls)
    while len(urls) < limit and len(urls) > 0:
        urls.extend(urls)
        
    return urls[:limit]


# ============================
# 5. WORKSPACE HARD NEGATIVES
# ============================

def load_workspace_links():
    print("[+] Adding workspace-style links...")
    
    return [
        "https://bit.ly/3xYzAbc",
        "https://tinyurl.com/sample123",
        "https://drive.google.com/file/d/123/view",
        "https://docs.google.com/document/d/abc/edit",
        "https://notion.so/workspace/page",
        "https://slack.com/files/abc",
        "https://cdn.discordapp.com/attachments/file",
        "https://zoom.us/j/123456789",
        "https://app.slack.com/client/T123/C123",
        "https://trello.com/b/123/board",
        "https://miro.com/app/board/123"
    ]


# ============================
# BUILD DATASET
# ============================

def build_dataset():
    phishing = []
    benign = []
    
    # Load phishing
    phishing += load_phishtank(400)
    phishing += load_openphish(200)
    
    # Load benign
    benign += load_commoncrawl_sample(700)
    benign += load_reddit_links(700)
    
    # Add workspace links
    benign += load_workspace_links()
    
    # Normalize + clean
    def clean_list(urls):
        cleaned = []
        for u in urls:
            u = normalize_url(u)
            if u and is_valid_url(u):
                cleaned.append(u)
        return list(set(cleaned))
    
    phishing = clean_list(phishing)
    benign = clean_list(benign)
    
    # Balance
    random.shuffle(phishing)
    random.shuffle(benign)
    
    phishing = phishing[:int(TARGET_TOTAL * PHISH_RATIO)]
    benign = benign[:int(TARGET_TOTAL * BENIGN_RATIO)]
    
    # Build dataframe
    data = []
    
    for u in phishing:
        data.append({"url": u, "label": 1})
    
    for u in benign:
        data.append({"url": u, "label": 0})
    
    random.shuffle(data)
    
    df = pd.DataFrame(data)
    df.to_csv(OUTPUT_PATH_CSV, index=False)
    df.to_json(OUTPUT_PATH_JSON, orient="records", indent=2)
    
    print(f"\n✅ Dataset saved to {OUTPUT_PATH_CSV} and {OUTPUT_PATH_JSON}")
    print(f"Total: {len(df)} | Phishing: {sum(df.label)} | Benign: {len(df)-sum(df.label)}")

# ============================
# RUN
# ============================

if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    build_dataset()
