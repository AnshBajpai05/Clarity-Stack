import os
from typing import List, Dict
from dotenv import load_dotenv

import llm_gateway as gateway  # §5.1/§10.2 — single chokepoint: cache, retry, breaker, fallback

# =========================================================
# LOAD ENV
# =========================================================
load_dotenv(override=True)

import logging

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
# NON-FATAL KEY VALIDATION
# Logs warnings so the app boots and degrades gracefully.
# Endpoints that need a missing key will fail at call-time,
# not at import/boot time.
# =========================================================
if not GROQ_KEY:
    logging.warning(
        "[providers] GROQ_API_KEY is not set — Groq models will be unavailable."
    )

if not NVIDIA_KEY:
    logging.warning(
        "[providers] NVIDIA_API_KEY is not set — NVIDIA models will be unavailable."
    )


# =========================================================
# PROVIDER LABEL (for gateway routing / breaker / stats)
# =========================================================
def _provider_for(api_url: str) -> str:
    if "groq.com" in api_url:
        return "groq"
    if "nvidia.com" in api_url:
        return "nvidia"
    return "llm"


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
# ERROR BLOCK — returns None so callers skip this provider
# instead of injecting "FACT: ERROR" text into synthesis.
# =========================================================
def _error_block(reason: str) -> None:
    logging.warning(f"[providers] Provider failed: {reason}")
    return None


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
    # Single-candidate call through the gateway: gains caching (temp-0), retry+backoff,
    # circuit breaker, and token accounting without changing this function's contract.
    # Seed (§11.5) is forwarded; the gateway only attaches it when not None.
    cand = gateway.Candidate(
        provider=_provider_for(api_url),
        api_url=api_url,
        api_key=api_key,
        model=model,
    )
    return gateway.chat(
        candidates=[cand],
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=temperature,
        timeout=timeout,
        seed=MODEL_SEED,
    )


# =========================================================
# API URLS
# =========================================================
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"


# =========================================================
# MODEL REGISTRY (§11.5 — pinned, single source of truth)
# =========================================================
# Vendor model ids are deprecated on the *vendor's* timeline, not ours. The day a
# model is retired the result silently changes with no code change and no alert.
# So: pin every id in ONE place, allow a deliberate override via env, and log the
# active set at import — a vendor retirement now shows up as a config/log change,
# not silent drift. `MODEL_SEED` is sent to vendors that honor it (Groq & NVIDIA
# are OpenAI-compatible) for best-effort reproducibility — NOT bit-determinism,
# hosted LLMs are never bit-reproducible (§11.6).
def _model(env_key: str, default: str) -> str:
    return os.getenv(env_key, default).strip()

MODELS = {
    "groq_llama":     _model("MODEL_GROQ_LLAMA",     "llama-3.3-70b-versatile"),
    "groq_instant":   _model("MODEL_GROQ_INSTANT",   "llama-3.1-8b-instant"),
    "groq_gemma":     _model("MODEL_GROQ_GEMMA",     "gemma2-9b-it"),
    "nvidia_llama":   _model("MODEL_NVIDIA_LLAMA",   "meta/llama-3.1-70b-instruct"),
    "nvidia_mixtral": _model("MODEL_NVIDIA_MIXTRAL", "mistralai/mixtral-8x22b-instruct-v0.1"),
    "nvidia_gemma":   _model("MODEL_NVIDIA_GEMMA",   "google/gemma-2-9b-it"),
}

# Logical roles → which pinned model backs each task (so callers never hardcode ids).
SYNTHESIS_MODEL     = MODELS["groq_llama"]
EXTRACTION_PRIMARY  = MODELS["groq_llama"]
DIRECT_ANSWER_MODEL = MODELS["groq_llama"]

# Deterministic seed for vendors that honor it. Set MODEL_SEED="" (or "none") to
# omit it entirely (e.g. if a provider rejects the param).
def _parse_seed(raw):
    raw = (raw or "").strip().lower()
    if raw in ("", "none", "off", "false"):
        return None
    try:
        return int(raw)
    except ValueError:
        logging.warning("[providers] MODEL_SEED=%r is not an int — seeding disabled.", raw)
        return None

MODEL_SEED = _parse_seed(os.getenv("MODEL_SEED", "42"))


def get_model_manifest() -> dict:
    """Active pinned model set + seed. For boot logging, /version, and §10.10 eval."""
    return {"models": dict(MODELS), "seed": MODEL_SEED}

logging.info("[providers] Pinned model manifest: %s", get_model_manifest())


# =========================================================
# GROQ MODELS
# =========================================================
def ask_groq_llama(prompt: str) -> str:

    try:

        raw = _generic_chat(
            api_url=GROQ_URL,
            api_key=GROQ_KEY,
            model=MODELS["groq_llama"],
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt
        )

        return _ensure_all_sections(raw)

    except Exception as e:
        return _error_block(str(e))   # returns None — caller skips


def ask_groq_mixtral(prompt: str) -> "str | None":

    try:

        raw = _generic_chat(
            api_url=GROQ_URL,
            api_key=GROQ_KEY,
            model=MODELS["groq_instant"],
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt
        )

        return _ensure_all_sections(raw)

    except Exception as e:
        return _error_block(str(e))   # returns None — caller skips


def ask_groq_gemma(prompt: str) -> "str | None":

    try:

        raw = _generic_chat(
            api_url=GROQ_URL,
            api_key=GROQ_KEY,
            model=MODELS["groq_gemma"],
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt
        )

        return _ensure_all_sections(raw)

    except Exception as e:
        return _error_block(str(e))   # returns None — caller skips


# =========================================================
# NVIDIA MODELS
# =========================================================
def ask_nvidia_llama(prompt: str) -> "str | None":

    try:

        raw = _generic_chat(
            api_url=NVIDIA_URL,
            api_key=NVIDIA_KEY,
            model=MODELS["nvidia_llama"],
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt
        )

        return _ensure_all_sections(raw)

    except Exception as e:
        return _error_block(str(e))   # returns None — caller skips


def ask_nvidia_mixtral(prompt: str) -> "str | None":

    try:

        raw = _generic_chat(
            api_url=NVIDIA_URL,
            api_key=NVIDIA_KEY,
            model=MODELS["nvidia_mixtral"],
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt
        )

        return _ensure_all_sections(raw)

    except Exception as e:
        return _error_block(str(e))   # returns None — caller skips


def ask_nvidia_gemma(prompt: str) -> "str | None":

    try:

        raw = _generic_chat(
            api_url=NVIDIA_URL,
            api_key=NVIDIA_KEY,
            model=MODELS["nvidia_gemma"],
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=prompt
        )

        return _ensure_all_sections(raw)

    except Exception as e:
        return _error_block(str(e))   # returns None — caller skips


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
            result = fn(prompt)
            if result is None:
                # _error_block returned None — provider failed, skip it
                print(f"SKIPPED (provider failure): {model_name}")
                continue
            outputs[model_name] = result
            print(f"SUCCESS: {model_name}")

        except Exception as e:
            logging.warning(f"[providers] {model_name} raised unexpectedly: {e}")
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

        # Fallback chain: Groq Llama is primary; on a Groq outage/quota the gateway
        # falls over to NVIDIA Llama (both OpenAI-compatible) instead of failing the
        # whole synthesis. Previously a single Groq failure 503'd every "ask".
        candidates = [
            gateway.Candidate("groq", GROQ_URL, GROQ_KEY, SYNTHESIS_MODEL),
            gateway.Candidate("nvidia", NVIDIA_URL, NVIDIA_KEY, MODELS["nvidia_llama"]),
        ]

        return gateway.chat(
            candidates=candidates,
            system_prompt=SYNTHESIS_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.0,
            timeout=120,
            seed=MODEL_SEED,
            tags="synthesis",
        )

    except Exception as e:
        # Synthesis itself failed (all providers) — raise so the caller returns a clean 503
        raise RuntimeError(f"Synthesis failed: {str(e)}") from e


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
            model=DIRECT_ANSWER_MODEL,
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
