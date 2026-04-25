import asyncio
import json
import logging
import re
from app import startup_load_model, run_prediction

logging.getLogger("playwright").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

URLS = [
    # 1. ADVANCED BRAND IMPERSONATION (SaaS + Obfuscation)
    "https://microsoft-auth-user.vercel.app",
    "https://secure-paypal-login.netlify.app",
    "https://google-account-recovery.firebaseapp.com",
    "https://amazon-login-authentication.pages.dev",
    "https://appleid-verify-session.s3.amazonaws.com",

    # 2. MULTI-BRAND CONFUSION (SOCIAL ENGINEERING)
    "http://paypal-google-security-alert.com",
    "http://amazon-microsoft-login.net",
    "http://apple-paypal-verification.org",
    "http://secure-google-amazon-auth.com",
    "http://bank-secure-login-microsoft.com",

    # 3. CLEAN-LOOKING PHISHING (LOW NOISE)
    "http://secure-auth-user-login.com",
    "http://account-verification-required.net",
    "http://update-security-details.info",
    "http://confirm-identity-access.org",
    "http://login-user-authenticate.co",

    # 4. REDIRECT / INFRA EDGE CASES
    "https://bit.ly/3FakeLinkTest",
    "https://tinyurl.com/secure-auth-check",
    "https://cutt.ly/login-verify-user",
    "https://t.co/security-check-redirect",
    "https://goo.gl/account-update",

    # 5. DEEP SUBDOMAIN TRICKERY
    "http://login.secure.account.microsoft.verify-user.com",
    "http://auth.google.com.secure-login-user.net",
    "http://paypal.com.user-authentication-secure.net",
    "http://amazon.com.secure-login.verify-account.org",
    "http://microsoft.com.security-update-login.net"
]

def extract_impersonation_target(reasons):
    for reason in reasons:
        match = re.search(r'Brand/Infra mismatch detected \(([^ ]+) on', reason)
        if match: return match.group(1)
        match = re.search(r'Brand impersonation detected \(([^ ]+) in', reason)
        if match: return match.group(1)
    return "none"

async def main():
    await startup_load_model()
    results = []
    
    for url in URLS:
        try:
            print(f"Scanning: {url}...")
            res = await run_prediction(url)
            
            signals = res.get("signals", {})
            reasons = res.get("reasons", [])
            
            formatted_res = {
                "url": res.get("url", url),
                "verdict": res.get("verdict", "UNKNOWN"),
                "risk_probability": res.get("risk_probability"),
                "signals": {
                    "namespace_risk": signals.get("namespace_risk", 0.0),
                    "structural_anomaly": signals.get("structural_anomaly", 0.0),
                    "brand_mismatch": signals.get("brand_mismatch", 0.0),
                    "redirect_depth": signals.get("redirect_depth", 0.0),
                    "redirect_trust": signals.get("redirect_trust", 0.0),
                    "is_ip": signals.get("is_ip", 0.0),
                    "is_unreachable": signals.get("is_unreachable", 0.0)
                },
                "derived": {
                    "impersonation_target": extract_impersonation_target(reasons),
                    "reachability": res.get("reachability", "unknown"),
                    "analysis_mode": res.get("analysis_mode", "UNKNOWN")
                },
                "reasons": reasons
            }
            results.append(formatted_res)
        except Exception as e:
            print(f"Error processing {url}: {e}")
            
    with open("hard_mode_results.json", "w") as f:
        json.dump(results, f, indent=2)
        
    print("\n✅ Evaluation complete. Saved to hard_mode_results.json")

if __name__ == "__main__":
    asyncio.run(main())
