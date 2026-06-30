# ClarityStack Viva Prep — PART 3: Satellite + Editor + SRS Pipeline

---

# 8. SATELLITE SERVICE (Node.js / Express / MongoDB)

## 8.1 What is the Satellite?

The Satellite is the **AI orchestration and intelligence layer**. It runs separately from the Core API and handles:
- Generating and versioning Temporal Cards
- Computing Knowledge Graph deltas (what changed between two states)
- Discovery feed (public project listing)
- Email notifications (nodemailer)
- Scheduled stale-card sweeper (node-cron)

**Port:** 8003  
**Base path:** `/api/satellite/`

## 8.2 Satellite Routes

| Route | Purpose |
|---|---|
| `GET /api/satellite/cards/:projectId` | Get all temporal cards (chained) |
| `GET /api/satellite/cards/:projectId/label/:label` | Cards by category |
| `GET /api/satellite/cards/:projectId/history/:cardId` | Full version chain for a card |
| `POST /api/satellite/cards/:projectId/generate` | Generate card from the **latest** delta |
| `POST /api/satellite/cards/:projectId/generate/delta/:deltaId` | Generate from the **selected** delta (§15.14, new) |
| `POST /api/satellite/cards/:projectId/generate/chat/:chatId` | Generate cards from a chat (dedups — no dup versions, §16.4) |
| `POST /api/satellite/cards/:projectId/generate/label/:label` | Generate cards by category |
| `POST /api/satellite/cards/:projectId/auto-generate` | Scheduler-style auto-generation |
| `POST /api/satellite/cards/:projectId/:cardId/update-kg` | **Commit to KG** → ingests into the **Core** KG (§16.4) |
| `GET /api/satellite/kg/:projectId` | KG snapshot mirror (legacy; the live graph reads Core `/api/reasoning`) |
| `GET /api/satellite/delta/:projectId` | Get graph delta history |
| `GET /api/satellite/discovery` | Public projects feed |
| `POST /api/satellite/join/:projectId` | Join request via email |

## 8.3 JWT Auth & Authorization (`middleware/auth.js`)

```js
const { requireAuth, requireProjectAccess } = require("../middleware/auth");
router.get("/:projectId", requireAuth, requireProjectAccess, async (req, res) => { ... });
```

1. **Authentication (`requireAuth`)**: Verifies the JWT (`access_token` cookie or `Bearer` header) using the unified `JWT_SECRET` (fail-closed if unset).
2. **Authorization (`requireProjectAccess` / `requireCardAccess`)**: Closes the cross-tenant IDOR vulnerability (§1.3 fix). It delegates to Core's object-level authZ (`GET /projects/:id`) to ensure the user is a member of the requested project before proceeding.
3. **Public Routes**: `discovery.js` and `join.js` remain intentionally ungated.

## 8.4 Temporal Card System — Version Chaining

### Card Identity & lineage — scoped per `{chat, category}` (§16.4)
```
chainIndex = `${chatId}_${category}`   e.g., "abc123_risk"
```
The version parent is looked up by a pure `chainParentFilter(projectId, chatId, category)` →
`{ projectId, sourceChatIds: chatId, category, status: "active" }`. When a new version is generated:
1. Find the active card **for this chat + category** (not category alone — that previously conflated unrelated threads across chats)
2. Set `previousCardId` on the new card to point to the old one
3. Mark the old card `status: "superseded"`, set `supersededAt`
4. Save new card with `version: old.version + 1`

This creates a **singly linked list** of card versions — full playback of project evolution.
*(Repeat "Generate" with no new messages returns the existing card + `upToDate:true` — it no longer spawns near-duplicate versions.)*

### Card Status Lifecycle
```
draft → active → superseded (a newer version exists)
               → archived (manually archived)
```

### Expiry — intentionally DISABLED (§16.4)
There is **no auto-expiry**. `expireOldCards()` is a deliberate no-op ("cards remain active
indefinitely, per user request"); the schema has **no `expiresAt` field** and there is no `stale`
sweeper. (The old 3-day `expiresAt` + hourly cron described in earlier drafts was removed.)

## 8.5 Card Generation Pipeline (`services/cardChainer.js`)

### `generateCardFromChat(projectId, chatId, token)`
1. Fetch synthesis messages from Core API: `GET /chats/{chatId}/synthesis`
2. For each synthesis, call `cardDecomposer` to extract categorized fragments
3. For each fragment/category, call `cardWriter` to generate a formatted card via Groq LLM
4. Version-chain the new card against existing cards in the same chain
5. Save to MongoDB

### `cardWriter.js`
Calls Groq API (Llama-3.1-70B) with a structured prompt:
```
Given this project context and synthesis fragment, generate a Temporal Card with:
- title (max 60 chars)
- summary (2-3 sentences)
- keyChanges (bullet list)
- suggestedAction
- category: [risk/decision/architecture/...]
```
Response is parsed and saved as a `TemporalCard` document.

### `modelRouter.js`
Handles failover between LLM providers:
1. Try Groq (Llama-3.1-70B) — fastest
2. On rate limit or error → fallback to HuggingFace

## 8.6 Graph Delta Engine (`services/deltaEngine.js`) — content-keyed (§16.3 / §17.3)

Computes what genuinely **changed in knowledge** between two KG snapshots:
- Pulls the Core KG (`fetchKGFromCore`) and stores a `KGSnapshot`
- **`computeDiff` keys nodes/edges on normalized CONTENT, not UUIDs** — Core re-mints a fresh
  `nodeId` every `/ask`, so the old UUID-keyed diff reported churn on identical content. Now a
  re-minted id for the same text counts as **zero** change; only real content additions/removals
  register (§16.3). Id-less edges use a stable `from→to:relation` composite (§11.2).
- Stores the result as a `GraphDelta` document — the **Evolution Timeline** (§17.3) reads these.

## 8.7 Mailer (`services/mailer.js`)

Uses `nodemailer` for email notifications:
```js
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
```
Used for: join request notifications to project owners.

## 8.8 MongoDB Connection (`config/db.js`)

```js
await mongoose.connect(uri, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
});
```
- On failure: logs actionable error (check Atlas Network Access), retries every 30 seconds
- `mongoose.connection.on("disconnected", ...)` → triggers retry automatically
- `getConnectionStatus()` → returned in `/health` endpoint

---

# 9. EDITOR SERVICE (Node.js / Socket.io / file-based)
*(Port 8004. Supabase was removed in the §2.2 / §6.2 cleanup — persistence is now a single hardened file-based backend.)*

## 9.1 Purpose

Real-time **collaborative document editor** where teams can:
- Create named workspaces (public or private)
- Edit documents in sections simultaneously
- See live user count
- View activity logs

*(Note: Supabase dual-storage and snapshots were removed in §6.2/§2.2 cleanup in favor of reliable file-based persistence).*

## 9.2 Architecture: In-Memory + File-based Persistence

```js
const rooms = {};      // { roomId: { sections: [...] } }
const roomUsers = {};  // { roomId: Set<socketId> }
```

**Why in-memory first?**
- Sub-millisecond read/write for real-time operations
- File system is updated via debounced atomic writes — reduces disk I/O during rapid typing

**File Fallback (Tier-0 Hardened):**
The single hardened backend (`server.js`) writes atomic JSON temp-files + `rename` to prevent corruption. It includes a `MAX_SAVE_WAIT` cap so continuous typing cannot starve persistence (§3.3 fix).


## 9.3 HTTP REST Endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/workspace` | Create new workspace (returns `room_id`) |
| GET | `/workspaces` | List all workspaces |
| GET | `/workspace/:id` | Get workspace sections (403 if non-owner of private room) |
| DELETE | `/workspace/:id` | Delete workspace |
| POST | `/activity` | Log user action |
| GET | `/activity/:workspace_id` | Read activity logs |

*(Snapshot routes were removed).*


## 9.4 Socket.io Event System

### Client → Server Events

| Event | Payload | Action |
|---|---|---|
| `join` | `roomId` | Join Socket.io room, receive current sections |
| `section_change` | `{ room, sectionId, content }` | Update section content, broadcast to others |
| `section_title_change` | `{ room, sectionId, title }` | Update section title |
| `add_section` | `{ room }` | Add new section, broadcast to ALL users |
| `delete_section` | `{ room, sectionId }` | Delete section (min 1 kept), broadcast |
| `reorder_sections` | `{ room, sections }` | Replace section order, broadcast to others |

**Authentication (§1.5 fix):**
Socket handshake is authenticated via `handshake.headers.cookie` (`access_token`). The `io.use` middleware verifies the JWT using `JWT_SECRET` and attaches `socket.user`. Every mutator event is gated by `canAccessRoom()` (owners only for private rooms).


### Server → Client Events

| Event | Payload | Meaning |
|---|---|---|
| `load-sections` | `sections[]` | Initial state for joining user |
| `section_update` | `{ sectionId, content }` | Another user changed content |
| `section_title_update` | `{ sectionId, title }` | Another user renamed section |
| `section_added` | `newSection` | New section added (broadcast to ALL) |
| `section_deleted` | `{ sectionId }` | Section deleted |
| `sections_reordered` | `sections[]` | New order |
| `user-count` | `count` | Current active users in room |

### Key Design: `socket.to(room).emit` vs `io.to(room).emit`
- `socket.to(room).emit(...)` → sends to all in room **except** sender
- `io.to(room).emit(...)` → sends to **all** in room including sender
- `add_section` and `user-count` use `io.to()` — the sender also needs to see these

## 9.5 Debounced Persistence

```js
function debouncedSave(roomId) {
    if (saveTimers[roomId]) clearTimeout(saveTimers[roomId]);
    saveTimers[roomId] = setTimeout(async () => {
        await atomicWriteFile(path, data);
    }, 1000); // 1 second idle window
}
```

**Why debounce?** A fast typist produces ~10 keystrokes/second. Without debouncing, that's 10 disk writes/second per user. Debouncing collapses rapid changes into 1 write per second of idle time. The `MAX_SAVE_WAIT` cap forces a write if typing continues uninterrupted for too long.


---

# 10. SRS SERVICE (Python / FastAPI / 6-Stage Pipeline)

## 10.1 Purpose

Processes uploaded PDF Software Requirements Specification documents through a 6-stage NLP pipeline to extract:
- **Actors** (who uses the system)
- **User Stories** (what they do)
- **Entities** (data objects)
- **Ambiguities** (vague language, undefined terms)
- **Conflicts** (contradictory requirements)
- **Gaps** (missing requirements)

## 10.2 API Endpoints (`api.py`)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/upload` | Upload PDF, start background pipeline |
| GET | `/api/document/{doc_id}/status` | Poll pipeline progress |
| GET | `/api/documents` | List all processed documents |
| GET | `/api/document/{doc_id}/intelligence` | Stage 5 intelligence JSON |
| GET | `/api/document/{doc_id}/issues` | Stage 6 issues report JSON |
| GET | `/api/document/{doc_id}/markdown` | Cleaned markdown text |
| DELETE | `/api/document/{doc_id}` | Delete all processed artifacts |

## 10.3 Background Processing Pattern

```python
@app.post("/api/upload")
async def upload_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    doc_id = Path(file.filename).stem
    PROGRESS_STORE[doc_id] = { "status": "processing", "percent": 0 }
    background_tasks.add_task(run_pipeline_background, doc_id, pdf_path)
    return { "doc_id": doc_id, "status": "processing" }
```

- FastAPI's `BackgroundTasks` runs the pipeline **after** the HTTP response is returned
- `PROGRESS_STORE` (in-memory dict) tracks real-time progress per doc
- Frontend polls `/api/document/{doc_id}/status` every few seconds

**Why not async?** PDF processing is CPU-bound (PyMuPDF, ML models). `BackgroundTasks` runs in the same thread pool — for production, Celery + Redis would be better.

## 10.4 The 6-Stage Pipeline

### Stage 1: Ingest (`stage1_ingest.py`)
- Accepts PDF path
- Uses **PyMuPDF** (`fitz`) to extract raw text page by page
- Preserves page numbers, section headers

### Stage 2: Extract (`stage2_extract.py` + `stage2_extract_vlm.py`)
- Structural parsing: identifies sections, subsections, numbered requirements
- VLM variant uses **marker-pdf** (Vision Language Model) for better layout understanding
- Outputs: structured list of requirement blocks

### Stage 3: Clean (`stage3_clean.py` + `stage3_clean_vlm.py`)
- Removes boilerplate (headers, footers, page numbers, table of contents)
- Normalizes whitespace, fixes hyphenation, removes figure captions
- Outputs cleaned Markdown (`.md` file)

### Stage 4: Equations (`stage4_equations.py` + `stage4_equations_vlm.py`)
- Detects and extracts mathematical expressions and formal specifications
- Uses **sympy** for symbolic math validation
- Flags requirements with formal constraints (e.g., `response_time < 200ms`)

### Stage 5: Intelligence (`stage5_intelligence_vlm.py`)
- Uses **sentence-transformers** + **FAISS** for semantic clustering
- Identifies: Actors, User Stories (actor + action + goal), Entities
- Clusters requirements by semantic similarity
- Outputs `{doc_id}_intelligence.json`:
  ```json
  { "actors": ["Admin", "User"], "stories": [...], "entities": [...], "metadata": { "total_stories": 42 } }
  ```

### Stage 6: Ambiguity (`stage6_ambiguity_vlm.py`) — 38KB, Most Complex Stage
- Three detector types:
  1. **Ambiguity detector**: flags vague terms ("appropriate", "fast", "user-friendly", "etc.")
  2. **Conflict detector**: finds contradictory requirements using semantic similarity + negation detection
  3. **Gap detector**: identifies missing error handling, edge cases, and undefined actors
- Uses **scikit-learn** for conflict clustering
- Outputs `{doc_id}_issues.json`:
  ```json
  {
    "total_ambiguities": 12,
    "total_conflicts": 3,
    "total_gaps": 7,
    "ambiguities": [...],
    "conflicts": [...],
    "gaps": [...]
  }
  ```

## 10.5 SRS Requirements (Python packages)

| Package | Purpose |
|---|---|
| `fastapi`, `uvicorn` | API server |
| `python-multipart` | File upload parsing |
| `PyMuPDF` | PDF text extraction |
| `marker-pdf` | Vision-based PDF parsing (SOTA) |
| `torch` | Required by marker-pdf and sentence-transformers |
| `sentence-transformers` | Semantic embeddings for clustering |
| `faiss-cpu` | Fast vector similarity search |
| `scikit-learn` | Conflict clustering (KMeans, cosine similarity) |
| `numpy`, `opencv-python` | Numerical ops, image processing |
| `sympy` | Formal math expression parsing |
| `rich` | Beautiful terminal logging |

## 10.6 File Storage Pattern

```
SRS_Service/
├── data/
│   ├── raw_SRS/                    → uploaded PDFs
│   └── raw_SRS_processed/
│       ├── stage3_cleaned_md/      → {doc_id}_clean.md
│       ├── stage5_intelligence/    → {doc_id}_intelligence.json
│       └── stage6_issues/         → {doc_id}_issues.json
```

The API uses `rglob(f"{doc_id}*{suffix}")` to find files recursively — handles both flat and nested output structures.

---

# 11. THREATLENS SERVICE (Python / FastAPI / ML)

## 11.1 Purpose
An **AI Phishing Detection API** that analyzes URLs for malicious intent using a combination of structural heuristics, machine learning (BERT), and threat intelligence feeds.

**Port:** 8002  
**Responsibility:** Security auditing for external URLs.
> ⛔ **Out of scope this cycle** — ThreatLens is not yet linked into the platform; its own security findings (§1.4 SSRF, §4.1 blocking I/O) are intentionally deferred.

## 11.2 Core Detection Pipeline
1. **Redirect Resolution:** Follows shorteners and nested redirects to find the final destination.
2. **Structural Heuristics:** Detects Punycode (homograph attacks), IP-based hosts, and suspicious TLDs (.xyz, .top, etc.).
3. **Brand Impersonation:** Detects when popular brands (Google, Microsoft) are used in subdomains or misspelled (Typosquatting).
4. **ML Inference:** Uses a fine-tuned BERT model (`PhishingDetector`) to analyze the URL string and page metadata.
5. **Threat Intel:** Integrates Google Safe Browsing and SSL certificate verification.

## 11.3 Confidence Scoring
Returns a `risk_score` (0-100) and a `verdict` (safe, suspicious, phishing). The score is fused from GNN (Graph) signals and LLM-based content analysis.

---

# 12. UML CLARITY SERVICE (React + Python / FastAPI)

## 12.1 Purpose
A specialized service for **extracting UML Use Cases and generating diagrams** from SRS documents. It uses a semantic chunking engine to handle large documents that would otherwise overflow LLM context windows.

**Port:** 8007 (UI) / 8005 (API)

## 12.2 Key Features
1. **Semantic Chunker:** Splits markdown into chunks based on heading hierarchy and semantic meaning.
2. **Use Case Extractor:** Uses NLP to identify "Actors" and "Goals" from the extracted stories, grouping them into canonical use cases.
3. **UML Abstraction:** An LLM-based engine that transforms raw requirements into structured JSON ready for diagram rendering (using JointJS).
4. **NVIDIA NIM Proxy:** A server-side proxy to call high-performance NVIDIA models (like Llama 3.1 70B) without CORS issues.

## 12.3 Semantic Abstraction (Stage 7)
Goes beyond simple extraction by performing a "Multi-Pass" analysis. The LLM reviews all extracted stories and "abstracts" them into a clean, high-level UML model, which is then cached for performance.

---

# VIVA QUESTIONS — PART 3

**Q1: What is Socket.io and how does it differ from raw WebSockets?**
A: Socket.io is a library built on top of WebSockets that adds: automatic fallback to HTTP long-polling (if WebSocket is blocked), room/namespace abstractions, automatic reconnection, and event-based messaging. Raw WebSockets are lower-level — you handle everything manually.

**Q2: What is debouncing and why is it used in the Editor Service?**
A: Debouncing delays execution of a function until after a specified idle period. In the editor, every keystroke would trigger a disk write without it. Debouncing collapses all keystrokes within a 1-second idle window into a single atomic JSON write. A `MAX_SAVE_WAIT` cap ensures data flushes even during continuous typing.

**Q3: What is the Temporal Card version chain?**
A: Cards use a singly linked list pattern. Each card has a `previousCardId` pointing to its predecessor. When a new version is generated, the old card is marked "superseded" and the new one gets `version: old.version + 1`. This preserves full project history — you can traverse from the latest card back to the original.

**Q4: What does FAISS do in the SRS pipeline?**
A: FAISS (Facebook AI Similarity Search) is a library for fast vector similarity search. In Stage 5, requirement sentences are embedded into vectors using sentence-transformers. FAISS finds semantically similar requirements efficiently — O(log n) search instead of O(n²) pairwise comparison.

**Q5: How does Satellite handle Cross-Tenant IDOR?**
A: Previously, Satellite only checked if a JWT was valid, not if the user belonged to the requested project. Now, the `requireProjectAccess` middleware delegates to Core's `GET /projects/:id` endpoint. It verifies the JWT and confirms project membership before allowing access to graphs or cards, effectively closing the IDOR vulnerability.

**Q6: What is PyMuPDF (fitz) and why is it used?**
A: PyMuPDF is a Python binding for the MuPDF library — one of the fastest PDF rendering engines. It extracts text with layout information (page numbers, coordinates) more accurately than pdfminer or PyPDF2. The `marker-pdf` library extends this with vision-model-based layout understanding for complex PDFs.

**Q7: Why is the SRS pipeline split into 6 stages instead of one function?**
A: Separation of concerns and fault isolation. Each stage has a single responsibility. If Stage 4 (equation extraction) fails, Stages 5 and 6 can still run. Intermediate files allow resuming from a checkpoint without reprocessing from scratch. It also makes debugging easier — you can inspect output at each stage.

**Q8: What is the difference between `socket.to(room).emit` and `io.to(room).emit`?**
A: `socket.to(room).emit()` sends to all users in the room *except* the sender (used for content updates — sender already updated locally). `io.to(room).emit()` sends to *all* including sender (used for `section_added` and `user-count` — sender needs confirmation too).

**Q9: How does the multi-model ensemble reduce hallucination?**
A: Three **independent, deliberately heterogeneous** models (`groq:llama-3.3-70b`, `groq:gpt-oss-20b`, `nvidia:llama-3.1-70b`) each extract IR from the same prompt. A deterministic agreement metric (§10.3) measures where they actually converge — that becomes the surfaced confidence, not any model's self-report. Claims a model *fails* to corroborate become the **Disagreement Spotlight** (§17.1, contested claims), and the synthesis model (`groq:llama-3.3-70b`) merges with each bullet **grounded** to source (§10.6). A failed provider returns `None` and is skipped — never fed to synthesis (§6.1).

**Q13: What does "Commit to KG" actually do now?**
A: It ingests a card's knowledge into the **Core** Knowledge Graph (`POST /chats/{id}/kg/ingest`), attached to the card's source chat, so it renders in the live graph view (which reads Core `/api/reasoning`) and survives re-sync. Previously it wrote to a Satellite Mongo snapshot that nothing displayed and the next sync overwrote — a dead-end. Ingestion is idempotent per `(chat, section, content)`, so re-committing doesn't duplicate nodes (§16.4).

**Q10: What is `BackgroundTasks` in FastAPI?**
A: FastAPI's `BackgroundTasks` runs a function after the HTTP response has been sent to the client. The client gets an immediate response (`status: "processing"`) while the heavy pipeline runs asynchronously. The frontend then polls a status endpoint to track progress.

**Q11: How does ThreatLens detect "Homograph" attacks?**
A: It checks for Punycode (`xn--`) in the domain name. Homograph attacks use visually similar characters from different alphabets (e.g., a Cyrillic 'а' instead of a Latin 'a') to trick users.

**Q12: Why use a Semantic Chunker in UML Clarity?**
A: Large SRS documents (50+ pages) have too much text for a single LLM prompt. The chunker splits the text into meaningful units, allowing the system to perform targeted retrieval of only the most relevant sections for a specific diagram or use case.

---
*→ Continue in VIVA_PREP_PART4.md: Full Execution Flows + Feature Internals + Improvements*
