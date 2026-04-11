import urllib.request
import json
import time

urls = [
    'http://www.wwe.com',
    'https://amazon.com',
    'http://paypa1.com',
    'http://tinyurl.com/2p9x8example',
    'https://google.com/url?q=https://paypal-update.xyz/login'
]

print('\nTesting Local API...\n')
for url in urls:
    print(f"Testing {url} ...")
    try:
        data = json.dumps({'urls': [url]}).encode('utf-8')
        req = urllib.request.Request('http://localhost:8001/predict/batch', data=data, headers={'Content-Type': 'application/json'})
        response = urllib.request.urlopen(req, timeout=10)
        res = json.loads(response.read().decode())[0]
        
        print(f"  -> Resolved: {res.get('resolved_url', 'None')}")
        print(f"  -> Verdict: {res.get('verdict', '').upper()} (Score: {res.get('risk_score', '')})")
        print(f"  -> Confidence: {res.get('confidence', '').upper()}")
        print(f"  -> Reasons: {res.get('reasons', [])}\n")
    except Exception as e:
        print(f"  -> ERROR: {e}\n")

print('Tests Complete.')
