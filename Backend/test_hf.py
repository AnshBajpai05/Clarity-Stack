import os
from dotenv import load_dotenv
import requests

load_dotenv()

HF_TOKEN = os.getenv("HUGGING_FACE_ACCESS_TKN")
print("HF Token Loaded:", bool(HF_TOKEN))

API_URL = "https://router.huggingface.co/v1/chat/completions"

headers = {
    "Authorization": f"Bearer {HF_TOKEN}",
    "Content-Type": "application/json",
}

payload = {
    "model": "meta-llama/Llama-3.2-3B-Instruct",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Tell me a one-line programmer joke"}
    ],
    "max_tokens": 200
}

response = requests.post(API_URL, headers=headers, json=payload)

data = response.json()

reply = data["choices"][0]["message"]["content"]

print(reply)
