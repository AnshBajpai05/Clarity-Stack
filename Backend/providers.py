import os
import requests
from typing import List, Dict
from dotenv import load_dotenv

# =========================================================
# LOAD ENV
# =========================================================
load_dotenv()

GROQ_KEY = os.getenv("GROQ_API_KEY")
NVIDIA_KEY = os.getenv("NVIDIA_API_KEY")

# =========================================================
# IMPORTS
# =========================================================
from prompts.extraction_prompt import EXTRACTION_SYSTEM_PROMPT
from prompts.synthesis_prompt import (
    SYNTHESIS_SYSTEM_PROMPT,
    SYNTHESIS_USER_PROMPT_TEMPLATE
)

from ir_schema import EXTRACTION_IR as SECTIONS


# =========================================================
# VALIDATION
# =========================================================
if not GROQ_KEY:
    raise ValueError("Missing GROQ_API_KEY in .env")

if not NVIDIA_KEY:
    raise ValueError("Missing NVIDIA_API_KEY in .env")


# =========================================================
# SAFE HTTP CALL
# =========================================================
def _call_chat(
    api_url: str,
    headers: dict,
    payload: dict,
    timeout: int = 60
) -> str:

    try:

        response = requests.post(
            api_url,
            headers=headers,
            json=payload,
            timeout=timeout
        )

        try:
            response.raise_for_status()

        except Exception:
            raise Exception(
                f"HTTP {response.status_code}\n{response.text}"
            )

        data = response.json()

        if "choices" not in data:
            raise Exception(
                f"Invalid API response:\n{data}"
            )

        return data["choices"][0]["message"]["content"]

    except requests.exceptions.Timeout:
        raise Exception("Request timed out")

    except requests.exceptions.ConnectionError:
        raise Exception("Connection error")

    except Exception as e:
        raise Exception(str(e))


# =========================================================
# ENSURE ALL SECTIONS EXIST
# =========================================================
def _ensure_all_sections(text: str) -> str:

    out = text.strip()

    for sec in SECTIONS:

        if f"{sec}:" not in out:
            out += f"\n\n{sec}:\n- None"

    return out.strip()


# =========================================================
# ERROR BLOCK
# =========================================================
def _error_block(reason: str) -> str:
    """
    Returns an empty string so that failed provider calls are cleanly
    treated as missing (skipped by the `if not raw_block` guard in main.py),
    rather than injecting a FACT: ERROR entry that poisons the knowledge graph.
    """
    return ""


# =========================================================
# GENERIC OPENAI-COMPATIBLE CHAT
# =========================================================
def _generic_chat(
    api_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.0,
    timeout: int = 60
) -> str:

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": user_prompt
            }
        ],
        "temperature": temperature
    }

    return _call_chat(
        api_url=api_url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        payload=payload,
        timeout=timeout
    )


# =========================================================
# API URLS
# =========================================================
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"


# =========================================================
# GROQ MODELS
# =========================================================
def ask_groq_llama(prompt: str) -> str:

    try:

        raw = _generic_chat(
            api_url=GROQ_URL,
            api_key=GROQ_KEY,
            model="llama-3.3-70b-versatile",
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt
        )

        return _ensure_all_sections(raw)

    except Exception as e:
        return _error_block(str(e))


def ask_groq_mixtral(prompt: str) -> str:

    try:

        raw = _generic_chat(
            api_url=GROQ_URL,
            api_key=GROQ_KEY,
            model="llama-3.1-8b-instant",
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt
        )

        return _ensure_all_sections(raw)

    except Exception as e:
        return _error_block(str(e))


def ask_groq_gemma(prompt: str) -> str:

    try:

        raw = _generic_chat(
            api_url=GROQ_URL,
            api_key=GROQ_KEY,
            model="gemma2-9b-it",
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt
        )

        return _ensure_all_sections(raw)

    except Exception as e:
        return _error_block(str(e))


# =========================================================
# NVIDIA MODELS
# =========================================================
def ask_nvidia_llama(prompt: str) -> str:

    try:

        raw = _generic_chat(
            api_url=NVIDIA_URL,
            api_key=NVIDIA_KEY,
            model="meta/llama-3.1-70b-instruct",
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt
        )

        return _ensure_all_sections(raw)

    except Exception as e:
        return _error_block(str(e))


def ask_nvidia_mixtral(prompt: str) -> str:

    try:

        raw = _generic_chat(
            api_url=NVIDIA_URL,
            api_key=NVIDIA_KEY,
            model="mistralai/mixtral-8x22b-instruct-v0.1",
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt
        )

        return _ensure_all_sections(raw)

    except Exception as e:
        return _error_block(str(e))


def ask_nvidia_gemma(prompt: str) -> str:

    try:

        raw = _generic_chat(
            api_url=NVIDIA_URL,
            api_key=NVIDIA_KEY,
            model="google/gemma-2-9b-it",
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt
        )

        return _ensure_all_sections(raw)

    except Exception as e:
        return _error_block(str(e))


# =========================================================
# MULTI MODEL EXTRACTION
# =========================================================
def run_multi_model_extraction(
    prompt: str
) -> Dict[str, str]:

    outputs = {}

    models = {
        "groq_llama": ask_groq_llama,
        "groq_mixtral": ask_groq_mixtral,
        "groq_gemma": ask_groq_gemma,

        "nvidia_llama": ask_nvidia_llama,
        "nvidia_mixtral": ask_nvidia_mixtral,
        "nvidia_gemma": ask_nvidia_gemma,
    }

    for model_name, fn in models.items():

        print(f"\nRunning: {model_name}")

        try:

            outputs[model_name] = fn(prompt)

            print(f"SUCCESS: {model_name}")

        except Exception as e:

            outputs[model_name] = _error_block(str(e))

            print(f"FAILED: {model_name}")


    return outputs


# =========================================================
# SYNTHESIS
# =========================================================
def ask_synthesis(
    extracted_blocks: List[str]
) -> str:

    try:

        joined_blocks = (
            "\n\n===== SOURCE BLOCK =====\n\n"
            .join(extracted_blocks)
        )

        user_prompt = (
            SYNTHESIS_USER_PROMPT_TEMPLATE
            + "\n\n"
            + joined_blocks
        )

        raw = _generic_chat(
            api_url=GROQ_URL,
            api_key=GROQ_KEY,
            model="llama-3.3-70b-versatile",
            system_prompt=SYNTHESIS_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            timeout=120
        )

        return raw

    except Exception as e:

        return _ensure_all_sections(f"""
INPUT_AUDIT:
blocks_received: {len(extracted_blocks)}

MERGED_KNOWLEDGE:

FACT:
- SYNTHESIS ERROR: {str(e)}

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
# COMPATIBILITY WRAPPERS (FOR main.py and synthesis_service.py)
# =========================================================

def ask_groq(prompt: str) -> str:
    """Old entry point: redirects to Groq Llama 3.3 70B."""
    return ask_groq_llama(prompt)

def ask_hf(prompt: str) -> str:
    """Old entry point: redirects to NVIDIA Llama 70B (NVIDIA NIM is faster/better than HF)."""
    return ask_nvidia_llama(prompt)

def ask_hf_synthesis(extracted_blocks: List[str]) -> str:
    """Old entry point: redirects to new ask_synthesis."""
    return ask_synthesis(extracted_blocks)

def ask_gemini(prompt: str) -> str:
    """Redirects to Groq Mixtral 8x7B (Replaces the old Gemini mock)."""
    return ask_groq_mixtral(prompt)


# =========================================================
# DIRECT ANSWER
# =========================================================
def ask_direct_answer(prompt: str) -> str:
    """Provides a natural language answer without forcing structured extraction."""
    system_prompt = (
        "You are ClarityStack Assistant, a senior software architect and project manager. "
        "Help the user with their technical questions, risks, and project strategy. "
        "Be concise, professional, and practical."
    )
    
    try:
        return _generic_chat(
            api_url=GROQ_URL,
            api_key=GROQ_KEY,
            model="llama-3.3-70b-versatile",
            system_prompt=system_prompt,
            user_prompt=prompt,
            temperature=0.3
        )
    except Exception as e:
        return f"I encountered an error while trying to answer: {str(e)}"

# =========================================================
# FULL PIPELINE
# =========================================================
def full_pipeline(prompt: str):

    print("\n==============================")
    print("STARTING EXTRACTION")
    print("==============================")

    extracted_outputs = run_multi_model_extraction(prompt)

    print("\n==============================")
    print("STARTING SYNTHESIS")
    print("==============================")

    final_output = ask_synthesis(
        list(extracted_outputs.values())
    )

    return {
        "individual_outputs": extracted_outputs,
        "final_synthesis": final_output
    }


# =========================================================
# TEST
# =========================================================
if __name__ == "__main__":

    sample_prompt = """
    Build a scalable AI-powered requirement analysis platform
    that extracts ambiguity, generates UML diagrams,
    performs traceability mapping,
    and supports collaborative review.
    """

    result = full_pipeline(sample_prompt)

    print("\n\n==============================")
    print("FINAL SYNTHESIS")
    print("==============================\n")

    print(result["final_synthesis"])
