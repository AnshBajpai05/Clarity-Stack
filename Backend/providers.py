import os
import requests
from typing import List
from dotenv import load_dotenv

load_dotenv()

GROQ_KEY = os.getenv("GROQ_API_KEY")
HF_TOKEN = os.getenv("HUGGING_FACE_ACCESS_TKN")

from prompts.extraction_prompt import EXTRACTION_SYSTEM_PROMPT
from prompts.synthesis_prompt import SYNTHESIS_SYSTEM_PROMPT, SYNTHESIS_USER_PROMPT_TEMPLATE


from ir_schema import EXTRACTION_IR as SECTIONS



# =========================================================
# LOW-LEVEL HTTP CALL (ISOLATED + SAFE)
# =========================================================
def _call_chat(api_url, headers, payload, timeout=60) -> str:
    res = requests.post(api_url, headers=headers, json=payload, timeout=timeout)
    res.raise_for_status()
    return res.json()["choices"][0]["message"]["content"]


# =========================================================
# SECTION HARDENER (ENSURE ALL HEADERS EXIST)
# =========================================================
def _ensure_all_sections(text: str) -> str:
    out = text.strip()
    for sec in SECTIONS:
        if f"{sec}:" not in out:
            out += f"\n\n{sec}:\n- None"
    return out.strip()


# =========================================================
# ERROR BLOCK (VALID TAGGED FORMAT, NO PROVIDER NAMES)
# =========================================================
def _error_block(reason: str) -> str:
    return _ensure_all_sections(f"""
FACT:
- ERROR: {reason}

CONSTRAINT:
- None

ASSUMPTION:
- None

OPTION:
- None

DECISION:
- None

CONFLICT:
- None

EXAMPLE:
- None

UNKNOWN:
- None

CONFIDENCE:
- None
""".strip())

# =========================================================
# GROQ — TAGGED EXTRACTION
# =========================================================
def ask_groq(prompt: str) -> str:
    try:
        raw = _call_chat(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                "Authorization": f"Bearer {GROQ_KEY}",
                "Content-Type": "application/json"
            },
            {
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.0
            }
        )
        return _ensure_all_sections(raw)
    except Exception as e:
        return _error_block(str(e))


# =========================================================
# GEMINI — MOCKED (STRUCTURALLY VALID)
# =========================================================
def ask_gemini(prompt: str) -> str:
    return _ensure_all_sections("""
FACT:
- SOURCE:: GEMINI MOCK ACTIVE

CONSTRAINT:
- SOURCE:: None

ASSUMPTION:
- SOURCE:: None

OPTION:
- SOURCE:: None

DECISION:
- SOURCE:: None

CONFLICT:
- SOURCE:: None

EXAMPLE:
- SOURCE:: None

UNKNOWN:
- SOURCE:: None

CONFIDENCE:
- SOURCE:: None
""".strip())


# =========================================================
# HUGGINGFACE — TAGGED EXTRACTION
# =========================================================
def ask_hf(prompt: str) -> str:
    try:
        raw = _call_chat(
            "https://router.huggingface.co/v1/chat/completions",
            {
                "Authorization": f"Bearer {HF_TOKEN}",
                "Content-Type": "application/json"
            },
            {
                "model": "meta-llama/Llama-3.2-3B-Instruct",
                "messages": [
                    {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.0,
                "max_tokens": 900
            }
        )
        return _ensure_all_sections(raw)
    except Exception as e:
        return _error_block(str(e))


# =========================================================
# HUGGINGFACE — SYNTHESIS (TAGGED COMPILER MERGER)
# =========================================================
def ask_hf_synthesis(extracted_blocks: List[str]) -> str:
    try:
        joined_blocks = "\n\n-----SOURCE BLOCK-----\n\n".join(extracted_blocks)
        user_prompt = SYNTHESIS_USER_PROMPT_TEMPLATE + "\n\n" + joined_blocks

        return _call_chat(
            "https://router.huggingface.co/v1/chat/completions",
            {
                "Authorization": f"Bearer {HF_TOKEN}",
                "Content-Type": "application/json"
            },
            {
                "model": "Qwen/Qwen2.5-7B-Instruct",
                "messages": [
                    {"role": "system", "content": SYNTHESIS_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.0,
                "max_tokens": 2200
            },
            timeout=120
        )

    except Exception as e:
        return _ensure_all_sections(f"""
INPUT_AUDIT:
blocks_received: {len(extracted_blocks)}
valid_blocks: 0
invalid_blocks: {len(extracted_blocks)}
errors:
- SYNTHESIS FAILURE: {str(e)}

MERGED_KNOWLEDGE:

FACT:
CONSTRAINT:
ASSUMPTION:
OPTION:
DECISION:
CONFLICT:
EXAMPLE:
UNKNOWN:
CONFIDENCE:
""".strip())
