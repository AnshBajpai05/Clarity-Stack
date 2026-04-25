import asyncio
import numpy as np
import json
import os
from app import run_prediction, startup_load_model

# TARGETED ADVERSARIAL CASES
ADVERSARIAL_TESTS = [
    # 1. SaaS Subdomain Abuse (mimicking legit infra)
    "https://secure-login-microsoft.vercel.app",
    "https://firebase-auth-portal.web.app",
    "https://github-auth-verify.netlify.app",
    "https://portal-office365.workers.dev",
    
    # 2. "Clean" Phishing (No IP, No Redirect, suspicious TLD)
    "https://login.secure-bank-update.com/verify",
    "https://auth-portal-paypal.top/signin",
    "https://verify-account-netflix.xyz",
    
    # 3. High-Traffic Legit (False Positive Stress)
    "https://login.microsoftonline.com",
    "https://zoom.us/join",
    "https://accounts.google.com/signin",
    "https://aws.amazon.com/console",
]

async def run_diagnosis():
    print("="*60)
    print("   THREATLENS ADVERSARIAL STRESS & FAILURE DIAGNOSIS")
    print("="*60)
    
    print("[+] Initializing system...")
    await startup_load_model()
    
    print("\n--- [1] ADVERSARIAL / MIMICRY TESTING ---")
    print(f"{'URL':<45} | {'SCORE':<7} | {'VERDICT':<10}")
    print("-" * 70)
    
    results = []
    for url in ADVERSARIAL_TESTS:
        try:
            res = await run_prediction(url)
            risk = res["risk_score"]
            verdict = res["verdict"]
            signals = res["signals"]
            
            print(f"{url[:44]:<45} | {risk:<7.2f} | {verdict:<10}")
            
            # Pattern check: Why did it fail?
            if "vercel.app" in url or "web.app" in url or "workers.dev" in url:
                if verdict == "SAFE":
                    print(f"   ⚠️  SaaS Bypass detected! (Anomaly: {signals['structural_anomaly']:.2f}, Uncertainty: {signals['uncertainty']:.2f})")
            
            if ".xyz" in url or ".top" in url:
                if verdict == "SAFE":
                    print(f"   ⚠️  Clean Phishing Bypass! (Namespace: {signals['namespace_risk']:.2f})")
                    
            results.append({"url": url, "score": risk, "verdict": verdict, "signals": signals})
        except Exception as e:
            print(f"[!] Error testing {url}: {e}")

    print("\n--- [2] CALIBRATION BOUNDARY ANALYSIS ---")
    scores = [r["score"] for r in results]
    print(f"Score Range: {min(scores):.2f} to {max(scores):.2f}")
    print(f"Avg Score: {np.mean(scores):.2f}")
    
    gray_zone = [r for r in results if 40 <= r["score"] <= 60]
    print(f"URLs in Gray Zone (40-60): {len(gray_zone)}")
    for g in gray_zone:
        print(f"  - {g['url']} ({g['score']:.2f})")

    print("\n[DIAGNOSIS COMPLETE]")

async def main():
    await run_diagnosis()

if __name__ == "__main__":
    asyncio.run(main())
