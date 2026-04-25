import asyncio
import json
import logging
import re
from app import startup_load_model, run_prediction

# Suppress verbose logging from playwright/httpx
logging.getLogger("playwright").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

URLS = [
    # PHISHING / IMPERSONATION
    "http://paypal-secure-auth-login.xyz",
    "https://microsoft-login-verification.vercel.app",
    "http://amazon-security-update-account.netlify.app",
    "https://secure-google-authenticate-user.com",
    "http://appleid-login-confirm.info",
    
    # TYPOSQUATTING / HOMOGLYPH
    "http://micr0soft-login.com",
    "http://paypa1.com",
    "http://goog1e-security-alert.com",
    "http://arnazon-support.net",
    "http://chatgpt-login-ai.net",
    
    # SUSPICIOUS / INFRA ABUSE
    "https://login-verification.vercel.app",
    "https://secure-auth.pages.dev",
    "https://account-check.firebaseapp.com",
    "https://user-authentication.netlify.app",
    "https://storage-bucket-login.s3.amazonaws.com",
    
    # LEGIT (CONTROL)
    "https://accounts.google.com",
    "https://login.microsoftonline.com",
    "https://github.com/login",
    "https://aws.amazon.com/console",
    "https://vercel.com/dashboard",

    # IPs
    "http://192.168.0.1/login",
    "http://185.234.217.12/secure"
]

def extract_impersonation_target(reasons):
    # Try to extract brand from reasons like:
    # "Brand/Infra mismatch detected (paypal on xyz)"
    # "Brand impersonation detected (microsoft in subdomain)"
    for reason in reasons:
        match = re.search(r'Brand/Infra mismatch detected \(([^ ]+) on', reason)
        if match:
            return match.group(1)
        match = re.search(r'Brand impersonation detected \(([^ ]+) in', reason)
        if match:
            return match.group(1)
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
                "confidence": str(res.get("confidence", "UNKNOWN")).upper(),
                "risk_probability": res.get("risk_probability"),
                "signals": {
                    "namespace_risk": signals.get("namespace_risk", 0.0),
                    "access_friction": signals.get("access_friction", 0.0),
                    "structural_anomaly": signals.get("structural_anomaly", 0.0),
                    "uncertainty": signals.get("uncertainty", 0.0),
                    "is_shortener": signals.get("is_shortener", 0.0),
                    "is_ip": signals.get("is_ip", 0.0),
                    "is_unreachable": signals.get("is_unreachable", 0.0),
                    "gnn_score": signals.get("gnn_score", 0.0),
                    "nlp_score": signals.get("nlp_score", 0.0),
                    "visual_score": signals.get("visual_score", 0.0),
                    "redirect_depth": signals.get("redirect_depth", 0.0),
                    "brand_mismatch": signals.get("brand_mismatch", 0.0),
                    "redirect_trust": signals.get("redirect_trust", 0.0)
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
            
    with open("evaluation_results.json", "w") as f:
        json.dump(results, f, indent=2)
        
    print("\n✅ Evaluation complete. Saved to evaluation_results.json")

if __name__ == "__main__":
    asyncio.run(main())
