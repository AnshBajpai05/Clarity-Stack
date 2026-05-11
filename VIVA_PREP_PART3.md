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

**Port:** 4000  
**Base path:** `/api/satellite/`

## 8.2 Satellite Routes

| Route | Purpose |
|---|---|
| `GET /api/satellite/cards/:projectId` | Get all temporal cards (chained) |
| `GET /api/satellite/cards/:projectId/label/:label` | Cards by category |
| `GET /api/satellite/cards/:projectId/expired` | Stale/expired cards |
| `GET /api/satellite/cards/:projectId/history/:cardId` | Full version chain for a card |
| `POST /api/satellite/cards/:projectId/generate` | Generate card from latest delta |
| `POST /api/satellite/cards/:projectId/generate/chat/:chatId` | Generate cards from a chat |
| `POST /api/satellite/cards/:projectId/generate/label/:label` | Generate cards by category |
| `POST /api/satellite/cards/:projectId/auto-generate` | Scheduler-style auto-generation |
| `POST /api/satellite/cards/:projectId/:cardId/refresh` | Refresh stale card (new version) |
| `POST /api/satellite/cards/:projectId/:cardId/update-kg` | Flush KG diff from card |
| `GET /api/satellite/kg/:projectId` | Get KG snapshot |
| `GET /api/satellite/delta/:projectId` | Get graph delta history |
| `GET /api/satellite/discovery` | Public projects feed |
| `POST /api/satellite/join/:projectId` | Join request via email |

## 8.3 JWT Auth Middleware (`middleware/auth.js`)

```js
const { requireAuth } = require("../middleware/auth");
router.get("/:projectId", requireAuth, async (req, res) => { ... });
```

The Satellite verifies the **same JWT** issued by the FastAPI backend:
- Reads `Authorization: Bearer <token>` header
- Verifies with `jsonwebtoken.verify(token, process.env.JWT_SECRET)`
- Attaches decoded payload to `req.user`
- **Cross-service JWT sharing**: Both Backend and Satellite use the same `SECRET_KEY` — this enables stateless auth without a shared session store

## 8.4 Temporal Card System — Version Chaining

### Card Identity: `chainIndex`
```
chainIndex = `${chatId}_${category}`
e.g., "abc123_risk"
```
All cards for the same chat + category share a chain. When a new version is generated:
1. Fetch the latest card in the chain: `TemporalCard.findOne({ chainIndex }).sort({ version: -1 })`
2. Set `previousCardId` on the new card to point to the old one
3. Mark the old card `status: "superseded"`, set `supersededAt`
4. Save new card with `version: old.version + 1`

This creates a **singly linked list** of card versions — full playback of project evolution.

### Card Status Lifecycle
```
draft → active → superseded (newer version exists)
               → stale (expiresAt passed)
               → archived (manually archived)
```

### `expiresAt` — Auto-Expiry
Cards expire **3 days** after creation by default:
```js
expiresAt: { type: Date, default: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) }
```
The `cardScheduler.js` runs a cron job every hour to mark expired cards as `stale`.

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

## 8.6 Graph Delta Engine (`services/deltaEngine.js`)

Computes what changed in the Knowledge Graph between two synthesis snapshots:
- Fetches KG snapshots from MongoDB (`KGSnapshot` collection)
- Computes `added_nodes`, `removed_nodes`, `changed_edges`
- Stores as `GraphDelta` document

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

# 9. EDITOR SERVICE (Node.js / Socket.io / Supabase)

## 9.1 Purpose

Real-time **collaborative document editor** where teams can:
- Create named workspaces
- Edit documents in sections simultaneously
- See live user count
- Create immutable snapshots for version recovery
- View activity logs

## 9.2 Architecture: In-Memory + Supabase Dual Storage

```js
const rooms = {};      // { roomId: { sections: [...] } }
const roomUsers = {};  // { roomId: Set<socketId> }
const snapshots = {};  // { snapshotId: { content, created_at } }
```

**Why in-memory first?**
- Sub-millisecond read/write for real-time operations
- Supabase (PostgreSQL) is updated via debounced save — reduces DB writes during rapid typing

**Supabase Fallback:**
```js
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
if (!supabase) console.log("Using in-memory storage only");
```
Service works without Supabase — falls back to in-memory (data lost on restart).

## 9.3 HTTP REST Endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/workspace` | Create new workspace (returns `room_id`) |
| GET | `/workspaces` | List all workspaces (memory + Supabase) |
| GET | `/workspace/:id` | Get workspace sections |
| DELETE | `/workspace/:id` | Delete workspace |
| POST | `/snapshot` | Create immutable snapshot |
| GET | `/snapshot/:id` | Read snapshot |
| POST | `/activity` | Log user action |
| GET | `/activity/:workspace_id` | Read activity logs |

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
const saveTimers = {};
function debouncedSave(roomId) {
    if (saveTimers[roomId]) clearTimeout(saveTimers[roomId]);
    saveTimers[roomId] = setTimeout(async () => {
        const content = JSON.stringify(rooms[roomId].sections);
        await supabase.from("workspaces").upsert({ id: roomId, content, updated_at: new Date() });
    }, 1000); // 1 second idle window
}
```

**Why debounce?** A fast typist produces ~10 keystrokes/second. Without debouncing, that's 10 DB writes/second per user. Debouncing collapses rapid changes into 1 write per second of idle time.

**Tradeoff:** If the server crashes in the 1-second window after a change, that change is lost.

## 9.6 Supabase Tables Used

| Table | Columns | Purpose |
|---|---|---|
| `workspaces` | id, content (JSON), name, owner_id, is_public, created_at, updated_at | Workspace storage |
| `snapshots` | id, content, workspace_id, created_at | Immutable point-in-time versions |
| `activity_logs` | id, workspace_id, user_id, action, content_preview, cursor_position, created_at | Audit trail |

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

# VIVA QUESTIONS — PART 3

**Q1: What is Socket.io and how does it differ from raw WebSockets?**
A: Socket.io is a library built on top of WebSockets that adds: automatic fallback to HTTP long-polling (if WebSocket is blocked), room/namespace abstractions, automatic reconnection, and event-based messaging. Raw WebSockets are lower-level — you handle everything manually.

**Q2: What is debouncing and why is it used in the Editor Service?**
A: Debouncing delays execution of a function until after a specified idle period. In the editor, every keystroke would trigger a Supabase write without it — potentially 600 DB writes per minute per user. Debouncing collapses all keystrokes within a 1-second idle window into a single write, drastically reducing DB load.

**Q3: What is the Temporal Card version chain?**
A: Cards use a singly linked list pattern. Each card has a `previousCardId` pointing to its predecessor. When a new version is generated, the old card is marked "superseded" and the new one gets `version: old.version + 1`. This preserves full project history — you can traverse from the latest card back to the original.

**Q4: What does FAISS do in the SRS pipeline?**
A: FAISS (Facebook AI Similarity Search) is a library for fast vector similarity search. In Stage 5, requirement sentences are embedded into vectors using sentence-transformers. FAISS finds semantically similar requirements efficiently — O(log n) search instead of O(n²) pairwise comparison.

**Q5: Why does the Satellite use its own JWT verification instead of calling the Core API?**
A: Calling the Core API for every request would add network latency and create a dependency. Since both services share the same `JWT_SECRET` environment variable, the Satellite can verify tokens locally with `jsonwebtoken.verify()` — stateless, fast, no cross-service call needed.

**Q6: What is PyMuPDF (fitz) and why is it used?**
A: PyMuPDF is a Python binding for the MuPDF library — one of the fastest PDF rendering engines. It extracts text with layout information (page numbers, coordinates) more accurately than pdfminer or PyPDF2. The `marker-pdf` library extends this with vision-model-based layout understanding for complex PDFs.

**Q7: Why is the SRS pipeline split into 6 stages instead of one function?**
A: Separation of concerns and fault isolation. Each stage has a single responsibility. If Stage 4 (equation extraction) fails, Stages 5 and 6 can still run. Intermediate files allow resuming from a checkpoint without reprocessing from scratch. It also makes debugging easier — you can inspect output at each stage.

**Q8: What is the difference between `socket.to(room).emit` and `io.to(room).emit`?**
A: `socket.to(room).emit()` sends to all users in the room *except* the sender (used for content updates — sender already updated locally). `io.to(room).emit()` sends to *all* including sender (used for `section_added` and `user-count` — sender needs confirmation too).

**Q9: How does the multi-model consensus reduce hallucination?**
A: Each model independently extracts IR blocks from the same prompt. The synthesis model (Qwen) merges them — facts agreed on by multiple models get higher confidence. If Groq extracts a DECISION that HuggingFace contradicts, this surfaces as a CONFLICT in the synthesis output, flagged for human review rather than silently accepted.

**Q10: What is `BackgroundTasks` in FastAPI?**
A: FastAPI's `BackgroundTasks` runs a function after the HTTP response has been sent to the client. The client gets an immediate response (`status: "processing"`) while the heavy pipeline runs asynchronously. The frontend then polls a status endpoint to track progress.

---
*→ Continue in VIVA_PREP_PART4.md: Full Execution Flows + Feature Internals + Improvements*
