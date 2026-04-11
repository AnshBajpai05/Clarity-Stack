import asyncio
from app import run_prediction

urls = [
    'http://www.google.com',
    'https://amazon.com',
    'http://paypa1.com',
    'http://tinyurl.com/2p9x8example',
    'http://github.com/login',
    'http://amazon-support.top/billing',
    'http://www.wwe.com',
    'https://www.google.com/url?q=https://paypal-update.xyz/login'
]

async def run_tests():
    print('\n[DIRECT TESTING INITIATED]\n')
    for u in urls:
        print(f"Testing {u} ...")
        try:
            res = await run_prediction(u)
            print(f"  -> Original:   {res.get('url')}")
            print(f"  -> Resolved:   {res.get('resolved_url', 'None')}")
            print(f"  -> Verdict:    {res.get('verdict', '').upper()} (Score: {res.get('risk_score')})")
            print(f"  -> Confidence: {res.get('confidence', '').upper()}")
            print(f"  -> Reasons:    {res.get('reasons', [])}\n")
        except Exception as e:
            print(f"  -> ERROR: {e}\n")

if __name__ == "__main__":
    asyncio.run(run_tests())
