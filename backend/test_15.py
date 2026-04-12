import asyncio
from app import run_prediction, startup_load_model

urls = [
    # Safe - Legit Sites
    "https://google.com",
    "https://github.com",
    "https://amazon.com",
    "https://linkedin.com",
    "https://microsoft.com",
    # Phishing - Typosquatting
    "http://paypa1.com",
    "http://g00gle-login.com",
    "http://amaz0n-verify.com",
    # Phishing - Subdomain Abuse
    "http://accounts.paypal.com.verify-now.xyz",
    "http://secure.google.com.phish.top",
    # Phishing - Open Redirect
    "https://www.google.com/url?q=https://paypal-update.xyz/login",
    # Phishing - Suspicious TLD
    "http://amazon-support.top/billing",
    "http://microsoft-update.tk/security",
    # URL Shorteners
    "http://tinyurl.com/2p9x8example",
    # IP Address
    "http://192.168.1.1/admin",
]

async def run_tests():
    print('\n' + '='*65)
    print("Loading ThreatLens ML Model (PyTorch)...")
    await startup_load_model()
    print('='*65)
    print('  THREATLENS LIVE VALIDATION — REAL ML INFERENCE')
    print('='*65 + '\n')
    for u in urls:
        try:
            res = await run_prediction(u)
            verdict = res.get('verdict', '?').upper()
            score = res.get('risk_score', '?')
            conf = res.get('confidence', '?').upper()
            reasons = res.get('reasons', [])
            resolved = res.get('resolved_url')
            gnn = round(res.get('scores', {}).get('gnn_score', 0) * 100)
            llm = round(res.get('scores', {}).get('llm_score', 0) * 100)
            tag = '[SAFE]' if verdict == 'SAFE' else '[WARN]' if verdict == 'SUSPICIOUS' else '[PHISHING]'
            print(f"{tag} {u[:65]}")
            print(f"   -> {verdict} | Score:{score} | Conf:{conf} | GNN:{gnn} LLM:{llm}")
            if resolved:
                print(f"   -> Resolved: {resolved}")
            print(f"   -> {', '.join(reasons[:3])}\n")
        except Exception as e:
            print(f"[ERROR] {u}\n   -> {e}\n")

if __name__ == "__main__":
    asyncio.run(run_tests())
