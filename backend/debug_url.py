import asyncio
from app import run_prediction, startup_load_model
import json

async def test_one():
    await startup_load_model()
    url = "https://login.microsoftonline.com"
    res = await run_prediction(url)
    print(json.dumps(res, indent=2))

if __name__ == "__main__":
    asyncio.run(test_one())
