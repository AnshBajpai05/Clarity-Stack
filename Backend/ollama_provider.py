import requests

OLLAMA_URL = "http://localhost:11434/api/chat"

def ask_ollama_synthesis(system_prompt: str, user_prompt: str) -> str:
    payload = {
        "model": "gemma3:4b",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "stream": False,
        "options": {
            "num_ctx": 16384,
            "temperature": 0.0
        }
    }

    r = requests.post("http://localhost:11434/api/chat", json=payload, timeout=300)
    r.raise_for_status()
    return r.json()["message"]["content"]
