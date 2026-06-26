"""
SRS Clarity — FastAPI Bridge
Minimal API connecting the Python pipeline to the React frontend.
4 endpoints. No over-engineering.
"""
import json
import shutil
import time
from pathlib import Path

# Load .env so NVIDIA_API_KEY is available via os.environ
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass  # dotenv not installed — key must be set in system environment

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from pipeline.utils import setup_logger

logger = setup_logger("api")

app = FastAPI(title="SRS Clarity API", version="1.0.0")

# CORS for Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://localhost:5174", "http://localhost:5175",
        "http://localhost:8080", "http://localhost:8081", "http://localhost:3000",
        "http://localhost:8006", "http://localhost:8007",
        "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175",
        "http://127.0.0.1:8080", "http://127.0.0.1:8081",
        "http://127.0.0.1:8006", "http://127.0.0.1:8007",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
BASE_DIR = Path(__file__).resolve().parent
CORPUS_ROOT = BASE_DIR / "data" / "raw_SRS"
PROCESSED_ROOT = BASE_DIR / "data" / "raw_SRS_processed"

CORPUS_ROOT.mkdir(parents=True, exist_ok=True)
PROCESSED_ROOT.mkdir(parents=True, exist_ok=True)


# ────────────────────────────────────────────────────────────────────
# HELPERS
# ────────────────────────────────────────────────────────────────────

def get_doc_id(filename: str) -> str:
    """Derive doc_id from filename (strip extension)."""
    return Path(filename).stem


def find_processed_file(doc_id: str, stage_dir: str, suffix: str) -> Path | None:
    """Find a processed file by doc_id in a stage directory or fallback to frontend samples."""
    target_dir = PROCESSED_ROOT / stage_dir
    candidates = []
    if target_dir.exists():
        candidates = list(target_dir.glob(f"{doc_id}*{suffix}"))
    
    # Fallback to pre-loaded frontend samples
    if not candidates:
        frontend_srs_dir = BASE_DIR.parent / "src" / "srs_data"
        if frontend_srs_dir.exists():
            candidates = list(frontend_srs_dir.glob(f"{doc_id}*{suffix}"))
            
    return candidates[0] if candidates else None

# ────────────────────────────────────────────────────────────────────
# PROGRESS STORE & 1. POST /api/upload
# ────────────────────────────────────────────────────────────────────

PROGRESS_STORE = {}

def cleanup_progress_store():
    current_time = time.time()
    to_delete = [
        doc_id for doc_id, data in PROGRESS_STORE.items()
        if current_time - data.get("updated_at", current_time) > 600
    ]
    for d in to_delete:
        del PROGRESS_STORE[d]

def run_pipeline_background(doc_id: str, pdf_path: Path):
    from run_corpus_processor import process_pdf
    import threading
    
    def progress_callback(stage: str, message: str, percent: int):
        PROGRESS_STORE[doc_id] = {
            "status": "processing",
            "stage": stage,
            "message": message,
            "percent": percent,
            "updated_at": time.time()
        }

    def status_logger():
        while doc_id in PROGRESS_STORE and PROGRESS_STORE[doc_id]["status"] == "processing":
            state = PROGRESS_STORE[doc_id]
            logger.info(f"[Monitor] doc={doc_id} | Stage: {state['stage']} | {state['percent']}% | {state['message']}")
            time.sleep(5)

    # Start the 5-second periodic logger
    threading.Thread(target=status_logger, daemon=True).start()
    
    try:
        process_pdf(pdf_path, max_stage=6, debug=False, progress_callback=progress_callback)
        if doc_id in PROGRESS_STORE:
            PROGRESS_STORE[doc_id]["status"] = "done"
            PROGRESS_STORE[doc_id]["updated_at"] = time.time()
            logger.info(f"[Monitor] doc={doc_id} | Pipeline complete.")
    except Exception as e:
        logger.error(f"Pipeline failed for {doc_id}: {e}")
        PROGRESS_STORE[doc_id] = {
            "status": "error",
            "message": str(e),
            "updated_at": time.time()
        }

@app.post("/api/upload")
async def upload_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload a PDF and run the full pipeline (Stages 2-6) asynchronously."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    
    cleanup_progress_store()
    
    doc_id = get_doc_id(file.filename)

    # Guard: reject if pipeline already running for this doc
    if PROGRESS_STORE.get(doc_id, {}).get("status") == "processing":
        logger.warning(f"Pipeline already running for {doc_id}, ignoring duplicate request.")
        return JSONResponse({"doc_id": doc_id, "filename": file.filename, "status": "processing"})
    
    # Save uploaded PDF
    pdf_path = CORPUS_ROOT / file.filename
    with open(pdf_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    logger.info(f"Uploaded: {file.filename} → queuing pipeline...")

    # ⚡ Initialize PROGRESS_STORE synchronously so the first poll never misses it
    PROGRESS_STORE[doc_id] = {
        "status": "processing",
        "stage": "Parsing Document",
        "message": "Queued — initializing pipeline...",
        "percent": 0,
        "updated_at": time.time()
    }

    background_tasks.add_task(run_pipeline_background, doc_id, pdf_path)
    
    return JSONResponse({
        "doc_id": doc_id,
        "filename": file.filename,
        "status": "processing"
    })

@app.post("/api/upload-readme")
async def upload_readme(file: UploadFile = File(...)):
    """Upload a README/Markdown file and bypass OCR, going straight to chunking."""
    if not file.filename or not file.filename.lower().endswith((".md", ".txt")):
        raise HTTPException(status_code=400, detail="Only .md or .txt files are accepted")
    
    doc_id = get_doc_id(file.filename)
    
    # Save uploaded Markdown as a clean MD in stage 3
    stage3_dir = PROCESSED_ROOT / "Stage_3_Clean_md"
    stage3_dir.mkdir(parents=True, exist_ok=True)
    md_path = stage3_dir / f"{doc_id}_clean.md"
    
    content = await file.read()
    with open(md_path, "wb") as f:
        f.write(content)
        
    logger.info(f"Uploaded README: {file.filename} → saved to {md_path}")
    
    return JSONResponse({
        "doc_id": doc_id,
        "filename": file.filename,
        "status": "done"
    })

@app.get("/api/list-stage3")
async def list_stage3_files():
    """List all cleaned markdown files in Stage_3_Clean_md."""
    stage3_dir = PROCESSED_ROOT / "Stage_3_Clean_md"
    if not stage3_dir.exists():
        return []
    
    files = []
    for f in stage3_dir.glob("*.md"):
        files.append({
            "name": f.name,
            "doc_id": f.stem.replace("_clean", ""),
            "path": str(f.relative_to(PROCESSED_ROOT))
        })
    return files

@app.get("/api/stage3/{doc_id}/content")
async def get_stage3_content(doc_id: str):
    """Get the raw markdown content of a cleaned SRS file."""
    stage3_dir = PROCESSED_ROOT / "Stage_3_Clean_md"
    f = stage3_dir / f"{doc_id}_clean.md"
    if not f.exists():
        # Try without _clean suffix just in case
        f = stage3_dir / f"{doc_id}.md"
        if not f.exists():
            raise HTTPException(status_code=404, detail="Requirement file not found")
            
    return PlainTextResponse(open(f, "r", encoding="utf-8").read())



@app.get("/api/document/{doc_id}/status")
async def get_document_status(doc_id: str):
    """Get real-time pipeline status."""
    if doc_id not in PROGRESS_STORE:
        # Check if output exists.
        issues_file = find_processed_file(doc_id, "stage6_issues", "_issues.json")
        if issues_file:
            return {"status": "done"}
        else:
            return {"status": "error", "message": "Document not found in active queue."}
    
    return PROGRESS_STORE[doc_id]


# ────────────────────────────────────────────────────────────────────
# 2. GET /api/documents — List all processed documents
# ────────────────────────────────────────────────────────────────────

@app.get("/api/documents")
async def list_documents():
    """List all documents that have been processed through the pipeline."""
    documents = []
    
    intel_dir = PROCESSED_ROOT / "stage5_intelligence"
    issues_dir = PROCESSED_ROOT / "stage6_issues"
    
    if intel_dir.exists():
        for intel_file in intel_dir.glob("*_intelligence.json"):
            doc_id = intel_file.stem.replace("_intelligence", "")
            
            # Count issues if available
            ambiguity_count = 0
            conflict_count = 0
            gap_count = 0
            issue_file = issues_dir / f"{doc_id}_issues.json"
            if issue_file.exists():
                with open(issue_file, "r", encoding="utf-8") as f:
                    issue_data = json.load(f)
                    ambiguity_count = issue_data.get("total_ambiguities", 0)
                    conflict_count = issue_data.get("total_conflicts", 0)
                    gap_count = issue_data.get("total_gaps", 0)
            
            # Get story count
            with open(intel_file, "r", encoding="utf-8") as f:
                intel_data = json.load(f)
                story_count = intel_data.get("metadata", {}).get("total_stories", 0)
                actors = intel_data.get("actors", [])
            
            documents.append({
                "doc_id": doc_id,
                "stories": story_count,
                "actors": actors,
                "issues": ambiguity_count + conflict_count + gap_count,
                "ambiguities": ambiguity_count,
                "conflicts": conflict_count,
                "gaps": gap_count,
                "has_intelligence": True,
                "has_issues": issue_file.exists()
            })
    
    return {"documents": documents}


# ────────────────────────────────────────────────────────────────────
# 3. GET /api/document/{doc_id}/intelligence — Stage 5 JSON
# ────────────────────────────────────────────────────────────────────

@app.get("/api/document/{doc_id}/intelligence")
async def get_intelligence(doc_id: str):
    """Return the Stage 5 intelligence model for a document."""
    intel_file = find_processed_file(doc_id, "stage5_intelligence", "_intelligence.json")
    
    if not intel_file:
        raise HTTPException(status_code=404, detail=f"No intelligence data for '{doc_id}'")
    
    with open(intel_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    return data


# ────────────────────────────────────────────────────────────────────
# 4. GET /api/document/{doc_id}/issues — Stage 6 JSON
# ────────────────────────────────────────────────────────────────────

@app.get("/api/document/{doc_id}/issues")
async def get_issues(doc_id: str):
    """Return the Stage 6 issues report for a document."""
    issues_file = find_processed_file(doc_id, "stage6_issues", "_issues.json")
    
    if not issues_file:
        raise HTTPException(status_code=404, detail=f"No issues data for '{doc_id}'")
    
    with open(issues_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    return data


# ────────────────────────────────────────────────────────────────────
# 5. GET /api/document/{doc_id}/markdown — Cleaned markdown
# ────────────────────────────────────────────────────────────────────

@app.get("/api/document/{doc_id}/markdown")
async def get_markdown(doc_id: str):
    """Return the cleaned markdown for a document."""
    md_file = find_processed_file(doc_id, "stage3_cleaned_md", "_clean.md")
    
    if not md_file:
        raise HTTPException(status_code=404, detail=f"No markdown for '{doc_id}'")
    
    with open(md_file, "r", encoding="utf-8") as f:
        content = f.read()
    
    return PlainTextResponse(content)


# ────────────────────────────────────────────────────────────────────
# 6. DELETE /api/document/{doc_id} — Remove document + all artifacts
# ────────────────────────────────────────────────────────────────────

@app.delete("/api/document/{doc_id}")
async def delete_document(doc_id: str):
    """Delete processed pipeline artifacts only. Raw PDF in raw_SRS/ is preserved."""
    deleted_files = []
    
    # Delete from all stage directories (processed artifacts only)
    if PROCESSED_ROOT.exists():
        for stage_dir in PROCESSED_ROOT.iterdir():
            if stage_dir.is_dir():
                for artifact in stage_dir.glob(f"{doc_id}*"):
                    if artifact.is_file():
                        artifact.unlink()
                        deleted_files.append(str(artifact))
                    elif artifact.is_dir():
                        shutil.rmtree(artifact)
                        deleted_files.append(str(artifact))
    
    if not deleted_files:
        raise HTTPException(status_code=404, detail=f"No processed artifacts found for '{doc_id}'")
    
    logger.info(f"Deleted {len(deleted_files)} files for doc_id={doc_id}")
    # Clear any stale progress state so re-uploads start cleanly
    PROGRESS_STORE.pop(doc_id, None)
    return {"doc_id": doc_id, "deleted": len(deleted_files)}


# ─────────────────────────────────────────────────────────────────────
# PHASE 1: Semantic Chunk Endpoints — power the Multi-Pass Prompt Engine
# ─────────────────────────────────────────────────────────────────────

from document_chunker import get_chunks, get_relevant_chunks
from pydantic import BaseModel


class ChunkSearchRequest(BaseModel):
    query: str
    top_k: int = 4


@app.get("/api/document/{doc_id}/chunks")
async def get_document_chunks(doc_id: str):
    """
    Phase 1 — Semantic Chunker:
    Returns all semantic chunks parsed from the _clean.md for a document.
    Each chunk contains: heading, level, category, body, math[], figures[], story_ids[].
    """
    chunks = get_chunks(doc_id, PROCESSED_ROOT)
    if not chunks:
        raise HTTPException(status_code=404, detail=f"No _clean.md found for '{doc_id}'")
    return {
        "doc_id": doc_id,
        "total_chunks": len(chunks),
        "chunks": chunks
    }


@app.post("/api/document/{doc_id}/chunks/search")
async def search_document_chunks(doc_id: str, req: ChunkSearchRequest):
    """
    Phase 1 — Contextual Chunk Retrieval:
    Given a user's diagram prompt (e.g. 'Create use case diagram for Authentication'),
    returns the top-k most semantically relevant chunks from the _clean.md.

    Relevance is scored by keyword overlap + math/figure boost (no embedding needed).
    These chunks are injected into the LLM prompt context window by the frontend.
    """
    relevant = get_relevant_chunks(doc_id, req.query, PROCESSED_ROOT, top_k=req.top_k)
    if not relevant:
        raise HTTPException(status_code=404, detail=f"No chunks found for '{doc_id}'")
    return {
        "doc_id": doc_id,
        "query": req.query,
        "retrieved": len(relevant),
        "chunks": relevant
    }


# ─────────────────────────────────────────────────────────────────────
# LLM PROXY — Forward NVIDIA NIM requests from the browser via the backend
# This avoids browser CORS issues with direct calls to integrate.api.nvidia.com
# ─────────────────────────────────────────────────────────────────────

import os
import httpx
from pydantic import BaseModel as _BaseModel
from typing import Any

class LLMProxyRequest(_BaseModel):
    model: str
    messages: list[dict[str, Any]]
    temperature: float = 0.2
    max_tokens: int = 4096
    response_format: dict | None = None


@app.post("/api/llm")
async def llm_proxy(req: LLMProxyRequest):
    """
    Proxy LLM requests to NVIDIA NIM from the server side.
    This avoids CORS blocks when calling external APIs from the browser.
    """
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="NVIDIA_API_KEY not configured on server")

    payload: dict[str, Any] = {
        "model": req.model,
        "messages": req.messages,
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
    }
    if req.response_format:
        payload["response_format"] = req.response_format

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])

    return resp.json()


# ─────────────────────────────────────────────────────────────────────
# USE CASES EXTRACTOR — Smart semantic extraction from intelligence JSON
# Groups stories by feature-section and returns clean high-level goals
# ─────────────────────────────────────────────────────────────────────

import re as _re

@app.get("/api/document/{doc_id}/use-cases")
async def get_use_cases(doc_id: str):
    """
    Extract clean, high-level use cases from the Stage 5 intelligence JSON.
    Groups requirements by feature section (detected via 'Description:' markers)
    and returns one canonical use-case label per feature.
    """
    intel_file = find_processed_file(doc_id, "stage5_intelligence", "_intelligence.json")
    if not intel_file:
        raise HTTPException(status_code=404, detail=f"No intelligence data for '{doc_id}'")

    with open(intel_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    stories  = data.get("user_stories", [])
    actors   = data.get("actors", [])

    def clean_label(text: str, max_words: int = 6) -> str:
        """Strip SRS boilerplate and return an action-oriented label."""
        t = text.strip()
        # Remove list prefixes
        t = _re.sub(r'^[\-\*\d\.\)]+\s*', '', t)
        # Remove "- N. FeatureName:" style headers
        t = _re.sub(r'^\d+\.\s+[A-Z][^:]+:\s*', '', t)
        # Strip "Enables/Allows users to" → keep the verb
        t = _re.sub(r'^(enables?|allows?)\s+(users?\s+)?to\s+', '', t, flags=_re.I)
        # Strip "The system/user must/shall/should/will/can"
        t = _re.sub(r'^(the\s+)?(system|user|app|application)\s+(must|shall|should|will|can)\s+', '', t, flags=_re.I)
        t = _re.sub(r'^(users?\s+)?(must|shall|should|will|can)\s+', '', t, flags=_re.I)
        t = _re.sub(r'^(must|shall|should|will|can)\s+', '', t, flags=_re.I)
        # Take first clause only
        t = _re.split(r'[,;.]|\bto ensure\b|\bin order\b', t)[0].strip()
        # Capitalise and limit words
        words = t.split()[:max_words]
        if not words:
            return ''
        words[0] = words[0].capitalize()
        return ' '.join(words)

    use_cases = []
    seen_labels: set = set()
    current_context_actor = "System"

    for story in stories:
        goal       = (story.get("goal") or "").strip()
        role       = story.get("role", "System")
        stype      = story.get("type", "")
        confidence = story.get("confidence", 0.0)

        # ── Update context actor from feature descriptions or stimuli ──
        if stype == "contextual_information":
            if "Stimulus:" in goal:
                # Extract actor from "Stimulus: [Actor] does something"
                stimulus_text = goal.split("Stimulus:")[1].strip()
                # Find the first word that looks like a role
                for possible_actor in ["Admin", "Administrator", "Manager", "Employee", "User", "Patient", "Customer"]:
                    if possible_actor.lower() in stimulus_text.lower():
                        current_context_actor = possible_actor
                        break
            elif "Description:" in goal:
                for possible_actor in ["Admin", "Administrator", "Manager", "Employee", "User", "Patient", "Customer"]:
                    if possible_actor.lower() in goal.lower():
                        current_context_actor = possible_actor
                        break
            continue

        # ── Emit actual functional requirements ──
        if stype not in ("contextual_information", "metadata") and confidence >= 0.70:
            label = clean_label(goal)
            
            # In UML use case diagrams, the actor is the entity that INITIATES the use case.
            # 1. Highest priority: if the sentence explicitly starts with an actor (e.g. "Admins shall create...").
            # 2. Second priority: the human context actor who triggered this section (from Stimulus).
            # 3. Third priority: the AI's extracted role, if it's human.
            human_roles = {"User", "Employee", "Admin", "Administrator", "Manager", "Client", "Customer", "Patient", "Doctor"}
            
            explicit_actor = None
            for r in human_roles:
                # check if label starts with the role (e.g. "Admin shall..." or "Admins shall...")
                if label.lower().startswith(r.lower() + " ") or label.lower().startswith(r.lower() + "s "):
                    explicit_actor = r
                    break
                    
            if explicit_actor:
                final_actor = explicit_actor
            elif current_context_actor != "System":
                final_actor = current_context_actor
            elif role in human_roles:
                final_actor = role
            else:
                final_actor = "User"

            key = label.lower().replace(' ', '')[:15]
            if label and len(label) >= 4 and key not in seen_labels:
                seen_labels.add(key)
                use_cases.append({
                    "label":            label,
                    "actor":            final_actor,
                    "full_description": goal,
                    "category":         "use_case",
                    "confidence":       confidence,
                    "index":            len(use_cases)
                })

    # ── SEMANTIC UML ABSTRACTION (Phase 1, 2, 3) ──
    # Check if we already have a cached semantic abstraction
    semantic_dir = PROCESSED_ROOT / "stage7_uml_semantic"
    semantic_dir.mkdir(parents=True, exist_ok=True)
    semantic_file = semantic_dir / f"{doc_id}_semantic.json"

    if semantic_file.exists():
        logger.info(f"Loading cached semantic UML from {semantic_file}")
        with open(semantic_file, "r", encoding="utf-8") as f:
            return JSONResponse(json.load(f))

    # If not cached, we run the LLM abstraction
    logger.info("No cached semantic UML found. Triggering LLM abstraction...")
    from pipeline.uml_semantic_engine import generate_semantic_uml

    # We pass the full list of parsed stories to the LLM so it has all context to abstract
    semantic_data = generate_semantic_uml(stories)

    # Attach doc_id
    semantic_data["doc_id"] = doc_id

    # Cache the result
    with open(semantic_file, "w", encoding="utf-8") as f:
        json.dump(semantic_data, f, indent=2)

    return JSONResponse(semantic_data)
