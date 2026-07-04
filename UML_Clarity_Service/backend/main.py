"""
edituml Backend — Document Parse API
=====================================
Endpoints:
  POST /api/parse   — Accept PDF or Markdown, return clean extracted text
  GET  /api/health  — Healthcheck

Heartbeat logger runs every 5 seconds in the background.
"""

import asyncio
import io
import logging
import time
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env in the root UML service folder
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ─── Logging setup ────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("edituml-backend")

from api import app as api_app

# ─── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(title="EditUML Document Parser", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000", "http://localhost:8001", "http://localhost:8002",
        "http://localhost:8003", "http://localhost:8004", "http://localhost:8005",
        "http://localhost:8006", "http://localhost:8007", "http://localhost:3000",
        "http://127.0.0.1:8000", "http://127.0.0.1:8001", "http://127.0.0.1:8002",
        "http://127.0.0.1:8003", "http://127.0.0.1:8004", "http://127.0.0.1:8005",
        "http://127.0.0.1:8006", "http://127.0.0.1:8007", "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Move mount to the end to avoid shadowing proxies
# ─── Heartbeat ────────────────────────────────────────────────────────────────
START_TIME = time.time()
request_count = 0

async def heartbeat():
    """Log system status every 5 seconds."""
    while True:
        await asyncio.sleep(5)
        uptime = int(time.time() - START_TIME)
        logger.info(
            f"[HEARTBEAT] Uptime={uptime}s | Requests handled={request_count} | Status=ONLINE"
        )

@app.on_event("startup")
async def startup_event():
    logger.info("=" * 60)
    logger.info("  EditUML Backend starting up...")
    logger.info("  Document parse API ready on port 8006")
    logger.info("  Heartbeat logging every 5 seconds")
    logger.info("=" * 60)
    asyncio.create_task(heartbeat())


# ─── PDF text extraction ──────────────────────────────────────────────────────
def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract all text from a PDF using PyMuPDF (fitz)."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = []
        for i, page in enumerate(doc):
            text = page.get_text("text")
            if text.strip():
                pages.append(f"=== Page {i+1} ===\n{text.strip()}")
        doc.close()
        logger.info(f"[PDF] Extracted {len(pages)} pages of text via PyMuPDF")
        return "\n\n".join(pages)
    except ImportError:
        logger.warning("[PDF] PyMuPDF not available — trying pdfplumber fallback")
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                pages = []
                for i, page in enumerate(pdf.pages):
                    text = page.extract_text() or ""
                    if text.strip():
                        pages.append(f"=== Page {i+1} ===\n{text.strip()}")
            logger.info(f"[PDF] Extracted {len(pages)} pages via pdfplumber")
            return "\n\n".join(pages)
        except ImportError:
            raise HTTPException(
                status_code=500,
                detail="No PDF library found. Install: pip install pymupdf"
            )

import httpx
import os
import random


def _nvidia_keys() -> list[str]:
    """All configured NVIDIA keys, in priority order (NVIDIA_API_KEY, then _2, _3…)."""
    names = ["NVIDIA_API_KEY", "NVIDIA_API_KEY_2", "NVIDIA_API_KEY_3"]
    return [k.strip() for k in (os.getenv(n) for n in names) if k and k.strip()]


# ── NVIDIA circuit breaker ────────────────────────────────────────────────────
# On some networks integrate.api.nvidia.com accepts the TCP connect but never
# answers the HTTP request, so every key burns the full read timeout serially
# and the UI spinner looks frozen for minutes. After one full-chain failure we
# skip NVIDIA entirely for a cooldown window and go straight to the HF fallback.
_NVIDIA_COOLDOWN_S = 300
_nvidia_down_until = 0.0

# Direct-call read timeout per key (connect stays snappy). 120s made a dead
# provider cost 2+ minutes per key; anything healthy answers well within 45s.
_NVIDIA_TIMEOUT = httpx.Timeout(45.0, connect=8.0)

# ── HuggingFace router fallback (§ stuck-dial fix) ───────────────────────────
# Same OpenAI-compatible surface Satellite already uses successfully; mapped
# model names because HF uses org/repo ids, not NVIDIA's catalog names.
HF_TOKEN = os.getenv("HF_TOKEN")
HF_API_URL = "https://router.huggingface.co/v1/chat/completions"
_HF_MODEL_MAP = {
    "meta/llama-3.3-70b-instruct": "meta-llama/Llama-3.3-70B-Instruct",
    "meta/llama-3.1-70b-instruct": "meta-llama/Llama-3.3-70B-Instruct",
}
_HF_DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct"


async def _llm_via_hf(payload: dict) -> dict | None:
    """Fallback: HuggingFace router (OpenAI-shaped response, returned as-is).
    Returns None when no HF_TOKEN configured or the call fails."""
    if not HF_TOKEN:
        return None
    body = {
        "model": _HF_MODEL_MAP.get(payload.get("model"), _HF_DEFAULT_MODEL),
        "messages": payload.get("messages"),
        "temperature": payload.get("temperature", 0.2),
        "max_tokens": payload.get("max_tokens"),
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=8.0)) as client:
            resp = await client.post(
                HF_API_URL, json=body,
                headers={"Authorization": f"Bearer {HF_TOKEN}"},
            )
        if resp.is_success:
            logger.info("[llm] HF router fallback succeeded")
            return resp.json()
        logger.warning(f"[llm] HF fallback returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"[llm] HF fallback failed: {e}")
    return None


# Last-resort fallback: Groq's OpenAI-compatible API. Separate free tier from HF's
# router credits (which deplete monthly), so the diagram generator keeps working when
# both NVIDIA (unreachable networks) and HF (402 credits) are out.
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
_GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile"


async def _llm_via_groq(payload: dict) -> dict | None:
    """Fallback: Groq (OpenAI-shaped response, returned as-is)."""
    if not GROQ_API_KEY:
        return None
    body = {
        "model": _GROQ_DEFAULT_MODEL,
        "messages": payload.get("messages"),
        "temperature": payload.get("temperature", 0.2),
        "max_tokens": payload.get("max_tokens"),
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=8.0)) as client:
            resp = await client.post(
                GROQ_API_URL, json=body,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            )
        if resp.is_success:
            logger.info("[llm] Groq fallback succeeded")
            return resp.json()
        logger.warning(f"[llm] Groq fallback returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"[llm] Groq fallback failed: {e}")
    return None


# ─── §10.2: route through the central Clarity LLM gateway when configured ───────
# Prefer the shared gateway (one cache / breaker / budget / stats across services).
# If it is not configured or is unreachable, fall back to the direct NVIDIA path
# below so this service never hard-depends on the Backend being up.
CLARITY_GATEWAY_URL = os.getenv("CLARITY_GATEWAY_URL")          # e.g. http://localhost:8000
GATEWAY_SERVICE_TOKEN = os.getenv("GATEWAY_SERVICE_TOKEN")


async def _llm_via_gateway(payload: dict, request_id: str | None = None) -> dict | None:
    """Try the central gateway. Returns an OpenAI-shaped dict on success, None to
    fall back. Re-raises HTTPException for real policy errors (budget/auth) so they
    are NOT silently masked by the local fallback."""
    if not (CLARITY_GATEWAY_URL and GATEWAY_SERVICE_TOKEN):
        return None
    body = {
        "messages": payload.get("messages"),
        "provider": "nvidia",
        "model": payload.get("model"),
        "temperature": payload.get("temperature", 0.2),
        "max_tokens": payload.get("max_tokens"),
        "response_format": payload.get("response_format"),
        "tags": "uml",
    }
    headers = {"X-Service-Token": GATEWAY_SERVICE_TOKEN}
    if request_id:
        headers["X-Request-ID"] = request_id   # §10.5: chain correlation id to the gateway
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{CLARITY_GATEWAY_URL.rstrip('/')}/llm/chat",
                json=body,
                headers=headers,
            )
        if resp.status_code == 200:
            content = resp.json().get("content", "")
            # Re-wrap to the OpenAI shape the browser already parses (choices[0].message.content).
            return {"choices": [{"message": {"content": content}}]}
        if resp.status_code in (401, 402):
            # Auth/budget are deliberate refusals — surface, don't burn local keys around them.
            raise HTTPException(status_code=resp.status_code,
                                detail=resp.json().get("detail", "gateway refused"))
        logger.warning(f"[llm] gateway returned {resp.status_code}; falling back to direct NVIDIA")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[llm] gateway unreachable ({e}); falling back to direct NVIDIA")
    return None


# ---------- LLM Proxy ----------
@app.post("/api/llm")
async def proxy_llm(payload: dict, request: Request):
    """Proxy request to NVIDIA to avoid CORS and keep keys server-side (§1.6).

    §10.2: prefers the central Clarity gateway (shared cache/breaker/budget/stats);
    on absence/outage it falls back to the direct, key-load-balanced NVIDIA path —
    a random key is tried first to spread quota, and on a 429 / transport error the
    request fails over to the remaining keys before giving up.
    """
    global _nvidia_down_until

    gw = await _llm_via_gateway(payload, request_id=request.headers.get("x-request-id"))
    if gw is not None:
        return gw

    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    keys = _nvidia_keys()
    if not keys and not HF_TOKEN:
        raise HTTPException(status_code=500, detail="No NVIDIA_API_KEY or HF_TOKEN configured on server")

    last_detail = "unknown error"

    if keys and time.time() >= _nvidia_down_until:
        order = random.sample(keys, len(keys))  # randomize start → spreads load across keys
        async with httpx.AsyncClient(timeout=_NVIDIA_TIMEOUT) as client:
            for key in order:
                headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
                try:
                    resp = await client.post(url, json=payload, headers=headers)
                except Exception as e:
                    last_detail = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
                    continue  # transport error → try the next key

                if resp.status_code == 429:
                    last_detail = "429 rate-limited"
                    continue  # this key is throttled → fail over to the next one

                if resp.status_code in (400, 404, 413, 422):
                    # Payload-shaped errors fail identically on every key — surface now.
                    raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])

                if not resp.is_success:
                    # 401/403 (bad or exhausted key) and 5xx (provider hiccup) are
                    # per-key/per-moment failures: the next key — or the HF/Groq
                    # fallbacks below — may still succeed. Keep going.
                    last_detail = f"NVIDIA {resp.status_code}: {resp.text[:200]}"
                    logger.warning(f"[llm] key failed with {resp.status_code}; trying next key")
                    continue

                _nvidia_down_until = 0.0  # provider healthy again
                return resp.json()

        # Every key failed at the transport/429 level → open the breaker so the
        # next request doesn't re-pay the full serial timeout chain.
        _nvidia_down_until = time.time() + _NVIDIA_COOLDOWN_S
        logger.warning(f"[llm] NVIDIA chain exhausted ({last_detail}); breaker open {_NVIDIA_COOLDOWN_S}s")
    elif keys:
        last_detail = "NVIDIA breaker open (provider unresponsive recently)"

    hf = await _llm_via_hf(payload)
    if hf is not None:
        return hf

    groq = await _llm_via_groq(payload)
    if groq is not None:
        return groq

    raise HTTPException(
        status_code=502,
        detail=(
            "All AI providers are exhausted right now — most likely the free-tier "
            "limits are used up or the providers are down. Please try again in a "
            f"few minutes. (last error: {last_detail})"
        ),
    )

# ---------- Chunk Search Proxy (Stub or Real) ----------
@app.post("/api/document/{doc_id}/chunks/search")
async def search_chunks(doc_id: str, payload: dict):
    from api import search_document_chunks, ChunkSearchRequest
    return await search_document_chunks(doc_id, ChunkSearchRequest(**payload))

@app.get("/api/document/{doc_id}/chunks")
async def proxy_chunks(doc_id: str):
    from api import get_document_chunks
    return await get_document_chunks(doc_id)

@app.get("/api/document/{doc_id}/markdown")
async def proxy_markdown(doc_id: str):
    from api import get_markdown
    return await get_markdown(doc_id)

@app.get("/api/list-stage3")
async def proxy_list_stage3():
    from api import list_stage3_files
    return await list_stage3_files()

@app.get("/api/stage3/{doc_id}/content")
async def proxy_stage3_content(doc_id: str):
    from api import get_stage3_content
    return await get_stage3_content(doc_id)

@app.get("/api/documents")
async def proxy_list_documents():
    from api import list_documents
    return await list_documents()

@app.post("/api/upload")
async def proxy_upload(file: UploadFile = File(...)):
    from api import upload_document
    return await upload_document(file)

@app.post("/api/upload-readme")
async def proxy_upload_readme(file: UploadFile = File(...)):
    from api import upload_readme
    return await upload_readme(file)

@app.get("/api/document/{doc_id}/use-cases")
async def proxy_use_cases(doc_id: str):
    from api import get_use_cases
    return await get_use_cases(doc_id)

@app.get("/api/document/{doc_id}/intelligence")
async def proxy_intelligence(doc_id: str):
    from api import get_document_intelligence
    return await get_document_intelligence(doc_id)

# ... existing endpoints ...
@app.get("/api/health")
async def health():
    return {"status": "online", "uptime_seconds": int(time.time() - START_TIME)}

@app.post("/api/parse")
async def parse_document(file: UploadFile = File(...)):
    """
    Accept a PDF or Markdown file, extract clean text, return it for AI analysis.
    The AI extraction itself runs on the frontend (Groq) — this endpoint only
    handles the file → text pipeline.
    """
    global request_count
    request_count += 1

    filename = file.filename or ""
    content  = await file.read()

    logger.info(f"[PARSE] Received file: {filename} ({len(content)} bytes)")

    if filename.lower().endswith(".pdf"):
        logger.info(f"[PARSE] Processing PDF: {filename}")
        t0 = time.time()
        text = extract_text_from_pdf(content)
        elapsed = round(time.time() - t0, 2)
        logger.info(f"[PARSE] PDF extraction done in {elapsed}s — {len(text)} chars")

    elif filename.lower().endswith((".md", ".txt")):
        logger.info(f"[PARSE] Processing Markdown/Text: {filename}")
        text = content.decode("utf-8", errors="replace")
        logger.info(f"[PARSE] Text loaded — {len(text)} chars")

    else:
        logger.warning(f"[PARSE] Unsupported file type: {filename}")
        raise HTTPException(status_code=400, detail="Only PDF, .md, and .txt files are supported.")

    word_count = len(text.split())
    logger.info(f"[PARSE] Complete — {word_count} words ready for AI analysis")

    return JSONResponse({
        "filename": filename,
        "word_count": word_count,
        "char_count": len(text),
        "text": text,
    })

app.mount("/api/uml", api_app)
