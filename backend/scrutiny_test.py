import asyncio
import httpx
import json

BASE_URL = "http://127.0.0.1:8000"

ADVERSARIAL_SAMPLES = [
    "paypal-login-secure-auth.com",
    "microsoft-verify-user.net",
    "google-auth-reset.co",
    "apple-id-verify.icu",
    "amazon-prime-update.top",
    "login.microsoftonline.com.secure-update.net", # Subdomain abuse
    "storage.googleapis.com.phish-site.io",      # Using cloud names in subdomain
]

async def test_scrutiny():
    print("Running Adversarial Scrutiny Test...")
    print("-" * 50)
    
    async with httpx.AsyncClient() as client:
        for url in ADVERSARIAL_SAMPLES:
            try:
                resp = await client.post(f"{BASE_URL}/predict", json={"url": url})
                data = resp.json()
                verdict = data.get("verdict")
                prob = data.get("risk_probability")
                
                status = "❌ FAILED (Too Forgiving)" if verdict == "SAFE" else "✅ PASSED (Caught)"
                print(f"URL: {url}")
                print(f"Verdict: {verdict} ({prob*100:.1f}%)")
                print(f"Result: {status}")
                print("-" * 30)
            except Exception as e:
                print(f"Error testing {url}: {e}")

if __name__ == "__main__":
    asyncio.run(test_scrutiny())
