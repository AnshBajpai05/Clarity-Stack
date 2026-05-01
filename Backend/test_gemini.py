import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
print("Raw key:", repr(api_key))

client = genai.Client(api_key=api_key)

resp = client.models.generate_content(
    model="models/gemini-2.5-flash",
    contents="Write a funny one-line joke about programmers."
)

print(resp.candidates[0].content.parts[0].text)
