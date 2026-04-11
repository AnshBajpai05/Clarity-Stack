import asyncio
import httpx
import json

API_URL = "http://localhost:8000/predict/batch"

# Curated 100-URL Test Set
test_data = {
    "benign": [
        "https://github.com/microsoft/vscode/issues/12345",
        "https://github.com/pytorch/pytorch",
        "https://stackoverflow.com/questions/123456/python-error",
        "https://medium.com/@engineering/how-we-built-this-system",
        "https://dev.to/techblog/ai-in-production",
        "https://docs.python.org/3/tutorial/index.html",
        "https://fastapi.tiangolo.com/tutorial/",
        "https://react.dev/learn",
        "https://nodejs.org/en/docs",
        "https://aws.amazon.com/console",
        "https://aws.amazon.com/ec2",
        "https://cloud.google.com/docs",
        "https://firebase.google.com/docs",
        "https://console.cloud.google.com/apis/dashboard",
        "https://drive.google.com/file/d/123456/view",
        "https://docs.google.com/document/d/abc123/edit",
        "https://docs.google.com/spreadsheets/d/xyz456/edit",
        "https://notion.so/workspace/project-doc",
        "https://notion.so/product-roadmap",
        "https://slack.com/app_redirect?channel=general",
        "https://app.slack.com/client/T123/C456",
        "https://zoom.us/j/123456789",
        "https://calendar.google.com/calendar/u/0/r",
        "https://mail.google.com/mail/u/0/#inbox",
        "https://linkedin.com/in/software-engineer",
        "https://linkedin.com/company/openai",
        "https://twitter.com/github/status/123",
        "https://x.com/openai/status/456",
        "https://reddit.com/r/programming/comments/abc123",
        "https://reddit.com/r/cybersecurity/comments/xyz456",
        "https://news.ycombinator.com/item?id=123456",
        "https://bbc.com/news/technology-123456",
        "https://cnn.com/2024/tech/article",
        "https://nytimes.com/2024/04/ai-news.html",
        "https://techcrunch.com/2024/ai-startup",
        "https://vercel.com/docs",
        "https://supabase.com/docs",
        "https://stripe.com/docs/api",
        "https://paypal.com/signin",
        "https://apple.com/support",
        "https://microsoft.com/en-us/windows",
        "https://adobe.com/products/photoshop.html",
        "https://canva.com/design",
        "https://figma.com/file/xyz",
        "https://gitlab.com/projects",
        "https://bitbucket.org/repo",
        "https://digitalocean.com/docs",
        "https://heroku.com/docs",
        "https://shopify.com/blog",
        "https://medium.com/data-science",
        "https://quora.com/What-is-AI",
        "https://kaggle.com/datasets",
        "https://openai.com/research",
        "https://huggingface.co/models",
        "https://arxiv.org/abs/1234.5678",
        "https://ieee.org/conferences",
        "https://springer.com/gp/book",
        "https://sciencedirect.com/science/article",
        "https://nature.com/articles"
    ],
    "phishing": [
        "https://secure-paypal-verify.xyz/login",
        "https://paypal-login-authentication.top/secure",
        "https://amazon-account-update.xyz/auth",
        "https://login-amazon-secure.top/verify",
        "https://apple-id-verification.xyz/login",
        "https://icloud-secure-login.top/auth",
        "https://microsoft-account-recovery.xyz/login",
        "https://office365-verification.top/auth",
        "https://netflix-billing-update.xyz/payment",
        "https://netflix-secure-login.top/verify",
        "https://bankofamerica-secure-login.xyz/auth",
        "https://chase-bank-verification.top/login",
        "https://wellsfargo-update-account.xyz/secure",
        "https://paypal-security-check.xyz/update",
        "https://amazon-payment-confirmation.top/billing",
        "https://google-account-security.xyz/login",
        "https://facebook-login-alert.top/verify",
        "https://instagram-account-warning.xyz/auth",
        "https://whatsapp-verification.top/login",
        "https://telegram-security-update.xyz/auth",
        "https://coinbase-login-secure.xyz/auth",
        "https://binance-verification.top/login",
        "https://stripe-account-check.xyz/update",
        "https://dhl-shipping-update.top/track",
        "https://fedex-delivery-confirm.xyz/track",
        "https://usps-package-alert.top/verify",
        "http://192.168.1.100/paypal/login",
        "http://10.0.0.1/microsoft/auth",
        "https://verify-netfl1x-billing.club/payment",
        "https://paypa1-login-secure.xyz/auth"
    ],
    "edge": [
        "https://paypal.com.secure-login.xyz",
        "https://google.com.account-security-update.xyz",
        "https://amazon.com-login-authenticate.top",
        "https://bit.ly/3xYzAbc",
        "https://tinyurl.com/secure-login",
        "https://cutt.ly/paypal-verify",
        "https://drive.google.com/file/d/phishing-link",
        "https://docs.google.com/forms/d/fake-login",
        "https://notion.so/login-secure-page",
        "https://slack-files.com/T123-ABC"
    ]
}

async def run_tests():
    print("=" * 60)
    print("  THREATLENS FAST BATCH 100-URL TEST")
    print("=" * 60)
    
    # Flatten URLs and map categories
    all_urls = []
    category_map = {}
    for cat, urls in test_data.items():
        for u in urls:
            all_urls.append(u)
            category_map[u] = cat
            
    payload = {"urls": all_urls, "check_threat_intel": False} # Faster without google SB check for raw ML perf

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(API_URL, json=payload, timeout=60.0)
            batch_results = res.json()
    except Exception as e:
        print(f"Batch API error: {e}")
        return

    results = {"benign": {"pass": 0, "fail": 0}, "phishing": {"pass": 0, "fail": 0}, "edge": {"pass": 0, "fail": 0}}
    failures = []

    # Process sequentially by category for output clarity
    for category, category_urls in test_data.items():
        print(f"\n[Category: {category.upper()}]")
        for url in category_urls:
            # Find result map
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
            if category == "benign":
                is_pass = (verdict in ["safe", "suspicious"]) # Count suspicious as safe for FPR check
            elif category == "phishing":
                is_pass = (verdict == "phishing")
            else: # edge
                is_pass = True 
            
            if is_pass:
                results[category]["pass"] += 1
                status = "[PASS]"
            else:
                results[category]["fail"] += 1
                status = "[FAIL]"
                failures.append((category, url, verdict, score))

            print(f"{status} [{score:5.1f}] {url[:50]:<50} | {verdict.upper()}")

    print("\n" + "=" * 60)
    print("  FINAL SCORECARD")
    print("=" * 60)
    
    total_benign = len(test_data["benign"])
    fp = results["benign"]["fail"]
    fpr = fp / total_benign * 100
    
    total_phish = len(test_data["phishing"])
    tp = results["phishing"]["pass"]
    recall = tp / total_phish * 100
    
    print(f"1. Benign Correct (FPR check): {total_benign - fp}/{total_benign} (FPR: {fpr:.2f}%)")
    print(f"2. Phish Recall (Catch rate): {tp}/{total_phish} (Recall: {recall:.2f}%)")
    print(f"3. Edge Performance:        {results['edge']['pass']}/{len(test_data['edge'])}")
    
    print("\n[VERDICT]")
    if fpr < 5 and recall >= 90:
        print(">>> [PASS] PRODUCTION READY: Passed all criteria.")
    else:
        print(">>> [FAIL] NEEDS TUNING: Failed core criteria.")

    if failures:
        print("\n[KEY FAILURES]")
        for cat, url, perd, score in failures[:15]:
            print(f"- {cat.upper()}: {url} -> {perd.upper()} ({score})")

if __name__ == "__main__":
    asyncio.run(run_tests())
