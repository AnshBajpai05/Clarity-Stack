import asyncio
import httpx
import json
import time

# API Configuration
API_URL = "http://localhost:8001"
BATCH_PREDICT_ENDPOINT = f"{API_URL}/predict/batch"

test_data = {
    "hard_benign": [
        "https://accounts.google.com/signin/v2/identifier",
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "https://github.com/login?return_to=%2Fsettings",
        "https://aws.amazon.com/signin",
        "https://console.aws.amazon.com/console/home",
        "https://auth0.com/docs/authenticate",
        "https://developer.apple.com/account/",
        "https://id.atlassian.com/login",
        "https://accounts.spotify.com/en/login",
        "https://secure.gravatar.com/avatar/abc123",
        "https://mail.google.com/mail/u/0/#inbox",
        "https://calendar.google.com/calendar/u/0/r",
        "https://drive.google.com/drive/u/0/my-drive",
        "https://docs.google.com/forms/d/e/1FAIpQLSf",
        "https://docs.google.com/document/d/1abcXYZ/edit",
        "https://notion.so/My-Workspace-123abc",
        "https://notion.so/login-flow-explanation",
        "https://slack.com/signin#/signin",
        "https://app.slack.com/client/T123/C456",
        "https://zoom.us/signin",
        "https://zoom.us/j/123456789",
        "https://bit.ly/3GITHUBDOCS",
        "https://tinyurl.com/github-docs",
        "https://cutt.ly/react-docs",
        "https://medium.com/@login-security/update-process",
        "https://dev.to/security/login-handling",
        "https://vercel.com/login",
        "https://supabase.com/auth/v1/token",
        "https://firebase.google.com/docs/auth",
        "https://cloudflare.com/login",
        "https://digitalocean.com/account/login",
        "https://heroku.com/login",
        "https://kaggle.com/account/login",
        "https://openai.com/blog/security-update",
        "https://huggingface.co/login",
        "https://arxiv.org/login",
        "https://ieee.org/login",
        "https://springer.com/account/login",
        "https://sciencedirect.com/user/login",
        "https://nature.com/login"
    ],
    "stealth_phishing": [
        "https://accounts-google.support",
        "https://microsoft-authentication.net",
        "https://appleid-verification.com",
        "https://secure-cloud-login.net",
        "https://identity-check-service.com",
        "https://auth-session-update.com",
        "https://account-security-center.net",
        "https://user-validation-service.com",
        "https://login-authenticate-user.net",
        "https://secure-access-portal.com",
        "https://billing-support-center.net",
        "https://account-resolution-service.com",
        "https://subscription-update-service.net",
        "https://customer-verification-center.com",
        "https://secure-notification-service.net",
        "https://payment-resolution-center.com",
        "https://account-maintenance-service.net",
        "https://security-alert-center.com",
        "https://access-confirmation-service.net",
        "https://identity-resolution-center.com",
        "https://accounts.google.com.secure-update.net",
        "https://login.microsoft.com.verify-session.xyz",
        "https://paypal.com.secure-access.net",
        "https://amazon.com.account-validation.xyz",
        "https://apple.com.verify-id.net",
        "https://netflix.com.account-update.xyz",
        "https://facebook.com.security-check.net",
        "https://instagram.com.account-review.xyz",
        "https://whatsapp.com.verify-account.net",
        "https://linkedin.com.security-update.xyz",
        "https://drive.google.com.secure-access.xyz",
        "https://docs.google.com.verify-session.net",
        "https://slack.com.secure-channel.xyz",
        "https://notion.so.account-check.net",
        "https://zoom.us.session-update.xyz",
        "https://github.com.account-security.net",
        "https://aws.amazon.com.secure-console.xyz",
        "https://cloudflare.com.verify-access.net",
        "https://stripe.com.payment-check.xyz",
        "https://coinbase.com.account-access.net"
    ],
    "adversarial": [
        "https://paypa1.com/login",
        "https://g00gle.com/security",
        "https://micros0ft.com/auth",
        "https://arnazon.com/account",
        "https://faceb00k.com/login",
        "https://instagrarn.com/auth",
        "https://netf1ix.com/billing",
        "https://appIe.com/id",
        "https://secure-login-paypal.com",
        "https://login-secure-google.com",
        "https://auth-microsoft-login.com",
        "https://account-apple-security.com",
        "https://verify-amazon-account.com",
        "https://update-netflix-billing.com",
        "https://confirm-facebook-identity.com",
        "https://bit.ly/secure-paypal-login",
        "https://tinyurl.com/microsoft-auth",
        "https://cutt.ly/google-security-check",
        "https://t.co/amazon-login",
        "https://goo.gl/apple-id-login"
    ]
}

async def run_tests():
    print("=" * 60)
    print("  THREATLENS: AAR YA PAAR EXTREME TEST (100 URLs)")
    print("=" * 60)
    
    all_urls = []
    for cat, urls in test_data.items():
        all_urls.extend(urls)
            
    payload = {"urls": all_urls, "check_threat_intel": False}

    print(f"[*] Sending batch prediction request for {len(all_urls)} URLs...")
    start_time = time.time()
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(BATCH_PREDICT_ENDPOINT, json=payload, timeout=90.0)
            batch_results = res.json()
    except Exception as e:
        print(f"Batch API error: {e}")
        return
    
    elapsed = time.time() - start_time
    print(f"[*] Received results in {elapsed:.2f}s")

    results = {
        "hard_benign": {"pass": 0, "fail": 0}, 
        "stealth_phishing": {"pass": 0, "fail": 0}, 
        "adversarial": {"pass": 0, "fail": 0}
    }
    failures = []

    for category, category_urls in test_data.items():
        print(f"\n[Category: {category.upper()}]")
        for url in category_urls:
            data_list = [r for r in batch_results if r.get('url') == url]
            if not data_list:
                print(f"[-ERROR-] Missing result for {url}")
                continue
            data = data_list[0]
            
            error = data.get("error")
            if error:
                 print(f"[-ERROR-] API internal error for {url}: {error}")
                 continue
                 
            verdict = data.get("verdict", "error").lower()
            score = data.get("risk_score", -1)
            
            is_pass = False
            if category == "hard_benign":
                is_pass = (verdict in ["safe", "suspicious"])
            else: # phishing categories
                is_pass = (verdict == "phishing")
            
            if is_pass:
                results[category]["pass"] += 1
                status = "[PASS]"
            else:
                results[category]["fail"] += 1
                status = "[FAIL]"
                failures.append((category, url, verdict, score))

            print(f"{status} [{score:5.1f}] {url[:50]:<50} | {verdict.upper()}")

    print("\n" + "=" * 60)
    print("  FINAL EXTREME SCORECARD")
    print("=" * 60)
    
    total_benign = len(test_data["hard_benign"])
    fp = results["hard_benign"]["fail"]
    fpr = fp / total_benign * 100
    
    total_stealth = len(test_data["stealth_phishing"])
    tp_stealth = results["stealth_phishing"]["pass"]
    recall = tp_stealth / total_stealth * 100
    
    total_adv = len(test_data["adversarial"])
    tp_adv = results["adversarial"]["pass"]
    adv_acc = tp_adv / total_adv * 100
    
    print(f"1. FPR (Hard Benign):  {fp}/{total_benign} (FPR: {fpr:.2f}%)")
    print(f"2. Recall (Stealth):   {tp_stealth}/{total_stealth} (Recall: {recall:.2f}%)")
    print(f"3. Adversarial Robust: {tp_adv}/{total_adv} (Accuracy: {adv_acc:.2f}%)")
    
    print("\n[VERDICT]")
    if fpr <= 3 and recall >= 85 and adv_acc >= 70:
        print(">>> [PASS] CLEAR FOR DEPLOYMENT: Passed extreme criteria.")
    else:
        print(">>> [FAIL] DO NOT DEPLOY: Failed core criteria.")

    if failures:
        print("\n[TOP FAILURES]")
        for cat, url, perd, score in failures[:20]:
            print(f"- {cat.upper()}: {url} -> {perd.upper()} ({score})")

if __name__ == "__main__":
    asyncio.run(run_tests())
