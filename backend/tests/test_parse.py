import tldextract

test_urls = [
    "https://paypal.com.secure-login-authenticate.xyz/login",  
    "http://paypal.com.secure-login-authenticate.xyz/login",
    "paypal.com.secure-login-authenticate.xyz/login",
]

for url in test_urls:
    e = tldextract.extract(url)
    print(f"URL: {url}")
    print(f"  subdomain={e.subdomain} domain={e.domain} suffix={e.suffix}")
    registered = f"{e.domain}.{e.suffix}"
    print(f"  registered_domain={registered}")
    
    # Check brand matching
    brands = ["paypal", "google", "amazon", "microsoft", "apple", "facebook"]
    host_lower = url.split("//")[-1].split("/")[0].lower()
    print(f"  host={host_lower}")
    matched_brand = next((b for b in brands if b in host_lower), None)
    print(f"  matched_brand={matched_brand}")
    
    is_official = registered in {"paypal.com", "google.com", "amazon.com"}
    print(f"  is_official={is_official}")
    
    if matched_brand and not is_official:
        if matched_brand in e.subdomain and matched_brand != e.domain:
            print(f"  -> SUBDOMAIN ABUSE (+50)")
        elif matched_brand != e.domain:
            print(f"  -> BRAND IMPERSONATION (+35)")
    
    # Check TLD
    suspicious_tlds = ['xyz', 'top', 'club', 'ninja', 'online', 'biz']
    if e.suffix in suspicious_tlds:
        print(f"  -> SUSPICIOUS TLD (.{e.suffix}) (+30)")
    print()
