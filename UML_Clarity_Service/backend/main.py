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

from fastapi import FastAPI, UploadFile, File, HTTPException
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
    return [k for k in (os.getenv(n) for n in names) if k]


# ---------- LLM Proxy ----------
@app.post("/api/llm")
async def proxy_llm(payload: dict):
    """Proxy request to NVIDIA to avoid CORS and keep keys server-side (§1.6).

    Load-balances across multiple NVIDIA keys: a random key is tried first to
    spread quota, and on a 429 / transport error the request fails over to the
    remaining keys before giving up.
    """
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    keys = _nvidia_keys()
    if not keys:
        raise HTTPException(status_code=500, detail="No NVIDIA_API_KEY configured on server")

    order = random.sample(keys, len(keys))  # randomize start → spreads load across keys
    last_detail = "unknown error"

    async with httpx.AsyncClient() as client:
        for key in order:
            headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
            try:
                resp = await client.post(url, json=payload, headers=headers, timeout=120.0)
            except Exception as e:
                last_detail = str(e)
                continue  # transport error → try the next key

            if resp.status_code == 429:
                last_detail = "429 rate-limited"
                continue  # this key is throttled → fail over to the next one

            if not resp.is_success:
                # A real upstream error (bad request, etc.) — surface it, don't burn other keys.
                raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])

            return resp.json()

    raise HTTPException(status_code=502, detail=f"All NVIDIA keys exhausted: {last_detail}")

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
