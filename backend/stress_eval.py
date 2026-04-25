import asyncio
import httpx
import time
import random
from typing import List, Dict

# Configuration
BASE_URL = "http://127.0.0.1:8000"
TOTAL_SAMPLES = 1000
CONCURRENCY = 10
TIMEOUT = 30.0
RETRIES = 2

# Categories and their expected ground truth (0 for safe, 1 for threat)
CATEGORIES = {
    "legit": 0,
    "complex_legit": 0,
    "phishing": 1,
    "suspicious": 1,
    "redirect": 1,
    "edge_cases": 1,
}

def generate_dataset() -> List[Dict]:
    dataset = []
    
    # Legit: Popular domains
    legit_domains = [
        "google.com", "facebook.com", "microsoft.com", "apple.com", "amazon.com", 
        "netflix.com", "spotify.com", "github.com", "linkedin.com", "twitter.com",
        "chatgpt.com", "openai.com", "cloudflare.com", "notion.so", "slack.com"
    ]
    for _ in range(200):
        dataset.append({"url": random.choice(legit_domains), "category": "legit"})
        
    # Complex Legit: Deep subdomains of popular sites
    complex_legit = [
        "docs.google.com/document/d/123", "portal.azure.com", "storage.googleapis.com", 
        "raw.githubusercontent.com", "aws.amazon.com/console", "login.microsoftonline.com",
        "app.slack.com", "drive.google.com", "s3.amazonaws.com", "pages.github.io"
    ]
    for _ in range(200):
        dataset.append({"url": random.choice(complex_legit), "category": "complex_legit"})
        
    # Phishing: Lookalikes & Adversarial
    phishing_patterns = [
        "paypa1.com", "secure-login-microsoft.net", "verify-apple-id.info", 
        "amaz0n-prime.xyz", "netflix-billing-update.com", "paypal-login-secure-auth.com",
        "microsoft-verify-user.net", "google-auth-reset.co", "apple-id-verify.icu",
        "amazon-prime-update.top", "login.microsoftonline.com.secure-update.net",
        "storage.googleapis.com.phish-site.io"
    ]
    for _ in range(200):
        dataset.append({"url": random.choice(phishing_patterns), "category": "phishing"})
        
    # Suspicious: Strange TLDs or long paths
    suspicious_patterns = [
        "get-free-coins.tk", "win-iphone-15.ml", "cryptogiveaway.ga", "urgent-notice.bid", 
        "update-browser.top", "free-vpn-now.link", "claim-reward-777.icu", "mega-prizes.click"
    ]
    for _ in range(150):
        dataset.append({"url": random.choice(suspicious_patterns), "category": "suspicious"})
        
    # Redirect: Shorteners
    shorteners = [
        "bit.ly/3Qn3Xtz", "tinyurl.com/abcde", "t.co/xyz123", "goo.gl/maps/123",
        "cutt.ly/12345", "is.gd/xyz", "buff.ly/abc"
    ]
    for _ in range(150):
        dataset.append({"url": random.choice(shorteners), "category": "redirect"})
        
    # Edge Cases: NXDOMAIN, IPs, etc
    edge_cases = [
        "192.168.1.1", "this-domain-does-not-exist-at-all-123456.com", "8.8.8.8", 
        "localhost:8000", "127.0.0.1", "0.0.0.0"
    ]
    for _ in range(100):
        dataset.append({"url": random.choice(edge_cases), "category": "edge_cases"})
        
    random.shuffle(dataset)
    return dataset[:TOTAL_SAMPLES]

async def predict_url(client, url, retries=RETRIES):
    for attempt in range(retries + 1):
        try:
            resp = await client.post(f"{BASE_URL}/predict", json={"url": url}, timeout=TIMEOUT)
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            if attempt == retries:
                return None
            await asyncio.sleep(1.0)
    return None

async def run_evaluation():
    dataset = generate_dataset()
    results = []
    
    print(f"Starting evaluation of {len(dataset)} URLs...")
    
    async with httpx.AsyncClient() as client:
        sem = asyncio.Semaphore(CONCURRENCY)
        
        async def task(item):
            async with sem:
                prediction = await predict_url(client, item["url"])
                return {"item": item, "prediction": prediction}
        
        results = await asyncio.gather(*(task(item) for item in dataset))

    successful = [r for r in results if r["prediction"] is not None]
    decided = [r for r in successful if r["prediction"].get("verdict") != "VERIFICATION_REQUIRED"]
    
    tp = fp = tn = fn = 0
    cat_stats = {cat: {"total": 0, "correct": 0, "decided": 0} for cat in CATEGORIES}
    
    for r in decided:
        item = r["item"]
        pred = r["prediction"]
        cat = item["category"]
        expected = CATEGORIES[cat]
        is_threat_pred = 1 if pred["verdict"] in ["PHISHING", "HIGH_RISK", "SUSPICIOUS"] else 0
        
        cat_stats[cat]["total"] += 1
        cat_stats[cat]["decided"] += 1
        
        if is_threat_pred == expected:
            cat_stats[cat]["correct"] += 1
            if expected == 1: tp += 1
            else: tn += 1
        else:
            if expected == 1: fn += 1
            else: fp += 1
            
    coverage = len(decided) / len(successful) if successful else 0
    accuracy = (tp + tn) / len(decided) if decided else 0
    precision = tp / (tp + fp) if (tp + fp) else 0
    recall = tp / (tp + fn) if (tp + fn) else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) else 0
    
    print(f"\nTotal: {len(dataset)}")
    print(f"Coverage: {coverage:.2f}\n")
    print(f"Accuracy: {accuracy:.2f}")
    print(f"Precision: {precision:.2f}")
    print(f"Recall: {recall:.2f}")
    print(f"F1: {f1:.2f}\n")
    
    print("Category Accuracy:")
    for cat, stats in cat_stats.items():
        acc = stats["correct"] / stats["decided"] if stats["decided"] else 0
        print(f"{cat}: {acc:.2f}")

if __name__ == "__main__":
    asyncio.run(run_evaluation())
