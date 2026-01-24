import os
import requests
from dotenv import load_dotenv

load_dotenv()

GROQ_KEY = os.getenv("GROQ_API_KEY")

response = requests.post(
    "https://api.groq.com/openai/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {GROQ_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "llama-3.1-8b-instant",
        "messages": [
            {"role": "user", "content": "Write a fun haiku"}
        ]
    }
)

reply = response.json()["choices"][0]["message"]["content"]
print(reply)

