# ClarityStack Viva Prep — PART 2: Backend + Database + Auth + AI Pipeline

---

# 4. BACKEND (Core API — FastAPI / Python)

## 4.1 Framework: FastAPI

- Built on Starlette (ASGI) + Pydantic
- Auto-generates `/docs` (Swagger UI) and `/redoc`
- Async-capable: uses `async def` for I/O-bound endpoints
- **Why FastAPI over Flask/Django?** Built-in Pydantic validation, async support, auto docs, faster performance

## 4.2 Server Startup

```python
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=[...], allow_credentials=True)
# create_all removed (§2.3 fixed) — Alembic is now the single source of truth
# _ensure_schema_at_head() runs on startup: upgrade (fresh DB) or stamp (existing)
```

`uvicorn main:app --reload --port 8000` — Uvicorn is an ASGI server (Gunicorn equivalent for async)

## 4.3 All API Routes

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/health` | Health check (exercises DB) | No |
| POST | `/api/auth/register` | Create user (5/min rate limit) | No |
| POST | `/api/auth/login` | Login, set httpOnly cookies (10/min rate limit) | No |
| POST | `/api/auth/logout` | Clear cookies + revoke session in DB | Cookie |
| POST | `/api/auth/refresh` | Rotate refresh token, issue new pair (20/min) | Cookie |
| GET | `/api/auth/me` | Return full user profile (id, email, role, nickname, permissions) | Cookie/Bearer |
| POST | `/projects` | Create project | JWT |
| GET | `/projects` | List user's projects | JWT |
| GET | `/projects/{id}` | Get single project | JWT |
| GET | `/projects/search` | Search by project_id | JWT |
| PATCH | `/projects/{id}` | Update project fields | JWT |
| POST | `/projects/{id}/join` | Request to join public project | JWT |
| GET | `/projects/{id}/join-requests` | List join requests (PM only) | JWT |
| PATCH | `/join-requests/{id}` | Accept/reject join request | JWT |
| POST | `/projects/{id}/invite` | Invite user directly | JWT |
| POST | `/projects/{id}/chats` | Create chat | JWT |
| GET | `/projects/{id}/chats` | List chats (active/archived) | JWT |
| GET | `/chats/{id}` | Get single chat | JWT |
| PATCH | `/chats/{id}` | Update chat metadata | JWT |
| DELETE | `/chats/{id}` | Delete chat + cascade messages | JWT |
| PATCH | `/chats/{id}/pin` | Pin/unpin chat | JWT |
| PATCH | `/chats/{id}/archive` | Archive/unarchive chat | JWT |
| POST | `/chats/{id}/messages` | Add message to chat | JWT |
| GET | `/chats/{id}/messages` | List messages | JWT |
| PATCH | `/messages/{id}/include` | Toggle include_in_summary | JWT |
| PATCH | `/messages/{id}/type` | Update message type | JWT |
| POST | `/messages/{id}/accept` | Accept one AI response in group | JWT |
| POST | `/chats/{id}/ask` | **MAIN AI PIPELINE** (concurrent, async) | JWT |
| GET | `/chats/{id}/synthesis` | List all synthesis for chat | JWT |
| GET | `/chats/{id}/synthesis/{group_id}` | Get specific synthesis | JWT |
| POST | `/chats/{id}/synthesis/generate` | Manually trigger synthesis | JWT |
| GET | `/api/reasoning/chat/{id}` | Bucketed KG nodes + semantic edges for the graph view | JWT |
| POST | `/chats/{id}/kg/ingest` | **Ingest card knowledge into the Core KG** ("Commit to KG", §16.4) | JWT |
| GET | `/chats/{id}/decision-trace` | Edge-grounded "Why this decision?" (§17.4) | JWT |
| GET | `/chats/{id}/decision-readiness` | Per-decision verdict + resolve-path (§17.5) | JWT |
| GET | `/chats/{id}/synthesis/{gid}/disagreement` | Disagreement Spotlight — contested claims (§17.1) | JWT |
| GET | `/chats/{id}/synthesis/{gid}/grounding` | Per-bullet source citations + grounding ratio (§10.6) | JWT |
| GET | `/metrics` | Prometheus metrics (req/latency/LLM tokens) (§10.5) | No |


## 4.4 Middleware Chain

Every request passes through:
1. **CORS Middleware** — adds CORS headers with `allow_credentials=True`, rejects disallowed origins
2. **Request Logger** (`log_requests`) — logs method, path, status, latency in ms
3. **Rate Limiter** — per-IP sliding window (in-memory, per-process) on auth endpoints
4. **Auth Pipeline** — `extractToken()` → `verifyToken()` → `loadUser()` (cookie-first, header-fallback)

```python
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = (start_time - time.time()) * -1000
    logging.info(f"{request.method} {request.url.path} → {response.status_code} ({process_time:.2f}ms)")
    return response
```

## 4.5 Dependency Injection

FastAPI's `Depends()` is used everywhere:
```python
def get_project(project_id: str, db: Session = Depends(get_db)):
```
- `get_db` yields a SQLAlchemy session, closes it after request
- `get_current_user` extracts token from cookie **or** Bearer header, verifies JWT, returns `{ email, role }`
- `require_permissions(*perms)` — RBAC factory, checks role-to-permission map (§1.7)
- `RateLimiter(n, window, key)` — per-IP sliding window rate limiter dependency
- Dependencies are composable — can chain them

## 4.6 Signal Classifier (`signal_classify.py`) — DistilBERT (§4.3 / §6.2 / §16.8)

The live classifier is **`signal_classify`** — a fine-tuned **DistilBERT** with a heuristic
fallback. The old per-token `SequenceMatcher` keyword scorer (`count_signal_words` and its
`TECH_KEYWORDS`/`fuzzy_ratio` helpers) was a **dead shadow** and has been **deleted** from
`main.py` (§4.3) — no `SequenceMatcher` runs on the hot `/ask` path anymore.

```python
def classify_signal(text: str) -> str:   # → "high" | "medium" | "low" | "noise"
    # DistilBERT inference (heuristic fallback if the model can't load)
    ...
```

- **Noise gate:** a message classified `noise` is filtered with a canned reply — **but** the
  **Ask-Anyway override** (`force=true`) bypasses the gate so a real question is never silently
  swallowed (§16.8). A false-negative no longer eats a legit question.

## 4.7 The `/chats/{id}/ask` Pipeline — Step by Step

```python
@app.post("/chats/{chat_id}/ask")
async def ask_multi_model(chat_id: str, payload: AskPayload, db: Session = Depends(get_db),
                          current_user = Depends(get_current_user)):
```

1. **Signal classify** → if noise, save a polite rejection message, return early
2. **Context inject** → `build_chat_context()` fetches last 10 relevant messages
3. **Concurrent ensemble call** → `asyncio.gather` fans out the 3-model `EXTRACTION_ENSEMBLE` in parallel via `asyncio.to_thread` (§2.1 — ~3× latency reduction; verified 0.33s vs 0.9s serial)
4. **Honest labels** → each block is stored under its **real** model id (`groq:llama-3.3-70b`, `groq:openai/gpt-oss-20b`, `nvidia:meta/llama-3.1-70b`) — no `GROQ::`/`MIXTRAL::` fiction
5. **Store AI messages** → saved as `role="assistant"`, `accepted=False`, same `reply_group_id`
6. **Measured agreement (§10.3)** → Jaccard-cluster metric over the per-model IR → the confidence persisted on the synthesis (self-reported confidence discarded)
7. **Synthesis + grounding** → `synthesize_content()` merges via `groq:llama-3.3-70b-versatile`; IR is structurally validated and each bullet is cited to source (§10.6)
8. **Store synthesis** → `role="synthesis"`, `accepted=True`; semantic KnowledgeNodes/Edges written
9. **Return** → `{ status: "ok", reply_group_id, synthesis_id }`

**Error handling:** If any model fails, `_error_block()` returns `None` — failed providers are skipped, never fed to synthesis (§6.1 fix — prevents error-as-fact poisoning).

## 4.8 Context Builder (`context_builder.py`)

```python
def build_chat_context(db, chat_id, limit=15):
    # Fetch: user messages (not noise) + accepted AI + all synthesis
    # Limit to last 15, reverse to chronological order
    # Format as: [USER]: text \n [APPROVED_SUMMARY]: text
```

**Why inject context?** LLMs are stateless. Without prior conversation, each new message is answered without awareness of previous decisions — leading to contradictions.

---

# 5. DATABASE BREAKDOWN

## 5.1 Polyglot Persistence Strategy

| Database | Used By | Port | Why |
|---|---|---|---|
| SQLite (dev) / **Postgres** (prod) | Backend | 8000 | SQLite = zero-config ACID dev default; **Postgres path validated** (§10.7) for multi-writer prod — same ORM, switched by `DATABASE_URL` |
| SRS (JSON) | SRS Service | 8001 | Fast ingestion of extracted PDF metadata |
| ML Model | ThreatLens | 8002 | BERT-based phishing detection engine |
| MongoDB Atlas | Satellite | 8003 | Schema-less — AI card JSON evolves across versions |
| File-based (JSON) | Editor Service | 8004 | Atomic file writes; Supabase removed (§2.2 fix) |
| UML API | UML Service | 8005 | GraphViz / PlantUML generation logic |
| Frontend | Main UI | 8006 | Central React dashboard |
| UML UI | UML Dashboard | 8007 | Visualization UI for system diagrams |


## 5.2 SQLite Schema (Backend — `models.py`)

### `users` table
```
id (UUID string, PK)
email (unique, indexed)
password (bcrypt hash)
role (default: "user")
```

### `refresh_tokens` table (§1.7 — new)
```
id (UUID string, PK = JTI)
user_id (FK→users CASCADE, indexed)
issued_at, expires_at (timezone-aware datetime)
revoked (boolean, default False)
device_info (string — browser/UA for session mgmt)
```

### `projects` table
```
id (UUID string, PK)
name, purpose, success_criteria, constraints, owner, visibility
created_at, updated_at (timezone-aware datetime)
```

### `project_members` table
```
id, project_id (FK→projects CASCADE), user_email, role ("pm"/"member")
```

### `join_requests` table
```
id, project_id (FK→projects CASCADE), user_email, status ("pending"/"accepted"/"rejected"), created_at
```

### `chats` table
```
id, project_id (FK→projects CASCADE)
title, source_type, archived, pinned, external_chat_id
purpose, phase, description, owner
created_at, updated_at
```

### `messages` table
```
id, chat_id (FK→chats CASCADE)
role ("user"/"assistant"/"synthesis")
sender, type, text
include_in_summary, has_attachments, attachments_json
topic, accepted, signal_level
reply_group_id (groups AI responses to one user prompt)
synthesis_id (FK→synthesis)
created_at, ingested_at
```

**Key design: `reply_group_id`**
When one user message triggers 3 AI responses, all share the same `reply_group_id` UUID. This groups them visually in the UI and allows the `accept` endpoint to deactivate others in the group.

### `synthesis` table
```
id, chat_id (FK→chats CASCADE)
reply_group_id (unique with chat_id)
content (full IR text), model_used
created_at, updated_at
UNIQUE constraint: (chat_id, reply_group_id)
```

### `knowledge_nodes` table
```
id, chat_id (FK→chats), synthesis_id (FK→synthesis)
section (FACT/DECISION/RISK/...), content, version, confidence
created_at
```

### `knowledge_edges` table
```
id, chat_id
from_node_id (FK→knowledge_nodes), to_node_id (FK→knowledge_nodes)
relation (SUPPORTS/CONTRADICTS/REFINES/DEPENDS_ON/BLOCKS/ALTERNATIVE_OF)
created_at
```

### `cards` table (SQL-side card tracking)
```
id, project_id (FK→projects CASCADE)
title, kind, phase, ordering, pinned
status ("active"/"archived"/"deleted")
current_version_id, tags_json, review_state
created_at, updated_at, latest_at
```

### `card_versions` table
```
id, card_id (FK→cards CASCADE)
body (full content), summary
created_by, is_ai_generated, confidence
reverted_from_version_id, source_refs
```

### `quarantined_messages` table
```
id, chat_id
raw_payload (full JSON of failed request)
error_reason, created_at
```
**Purpose:** Instead of crashing on a malformed message, the error is captured here for debugging.

## 5.3 Database Configuration (`database.py`) — env-driven (§4.2 / §10.7)

```python
# URL comes from the environment; SQLite is just the zero-config dev default.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./claritystack.db")
_IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _IS_SQLITE else {},  # SQLite-only flag
)

# WAL + FK + synchronous PRAGMAs are SQLite-specific → only registered for SQLite.
if _IS_SQLITE:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, connection_record):
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA journal_mode=WAL")     # concurrent readers + writer
        cur.execute("PRAGMA foreign_keys=ON")       # SQLite ignores FKs by default
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.close()
```

- **Both backends from one codebase:** the SQLite-only `check_same_thread` flag and the WAL/FK PRAGMA listener are guarded on the dialect, so the **same ORM serves SQLite (dev) and Postgres (prod)** with no model changes.
- **Postgres validated end-to-end (§10.7):** clean `alembic downgrade base → upgrade head` cycle on `postgres:16-alpine`, `alembic check` reports **zero drift** vs the models, and an app-engine ORM round-trip succeeds.
- **Schema management:** `create_all` removed; Alembic `_ensure_schema_at_head()` runs on startup (upgrade for fresh DBs, stamp for pre-existing) — guarded by `RUN_MIGRATIONS_ON_STARTUP` (=`0` for multi-worker prod) (§2.3).
- **Prod opt-in:** set `DATABASE_URL=postgresql+psycopg2://…` + `RUN_MIGRATIONS_ON_STARTUP=0` + `alembic upgrade head`.

## 5.4 SQLAlchemy ORM Concepts

- **Models**: Python classes inheriting `Base` → map to SQL tables
- **Session**: unit of work. Changes are tracked; `db.commit()` flushes to disk
- **`db.add(obj)`**: stages object for INSERT
- **`db.refresh(obj)`**: reloads object from DB (gets auto-generated fields like `id`, `created_at`)
- **`db.query(Model).filter(...).all()`**: SELECT with WHERE clause
- **Relationships**: Not explicitly declared (no `relationship()`) — queries done manually via FK joins
- **Indexes**: Declared at module level: `Index("idx_messages_chatid_createdat", Message.chat_id, Message.created_at)`

## 5.5 MongoDB Schema (Satellite — `TemporalCard.js`)

Mongoose schema — key fields:
```
_id: UUID string (custom, not ObjectId)
projectId: String (indexed)
chainIndex: String  → "chatId_category" (e.g., "abc123_risk")
version: Number
category: Enum [risk, decision, architecture, action, insight, progress, conflict, question, general]
title, summary, keyChanges[], sourceFragment, fragmentConfidence
previousCardId: String (linked list pointer to prior version)
status: Enum [active, superseded, stale, draft, approved, archived]
sourceChatIds: [String]  → drives per-{chat,category} lineage (§16.4)
kgUpdated: Boolean       → has this card been committed to the KG?
kgDiff: { add[], remove[], edges[], confidence, flushed }
modelUsed, generationMs
```
> **Note (§16.4):** there is **no `expiresAt` field** — card expiry is intentionally disabled
> ("cards remain active indefinitely"). Lineage is keyed on **{chat, category}** (the chain
> parent is looked up by `sourceChatIds` + category), so an unrelated card in another chat is
> never versioned over.

**Compound indexes:**
```js
TemporalCardSchema.index({ chainIndex: 1, status: 1 });
TemporalCardSchema.index({ sourceChatIds: 1, status: 1 });   // per-chat lineage lookup
TemporalCardSchema.index({ projectId: 1, category: 1, version: -1 });
```

**Why MongoDB for cards?**
- Card structure evolves — new categories, new fields added without migrations
- Each card type (risk vs architecture) may carry different metadata
- Embedded `kgDiff` avoids a separate join table

---

# 6. AUTHENTICATION & SECURITY

## 6.1 Auth Flow

### Registration (`POST /api/auth/register`)
1. Receive `{ email, password }` (Pydantic validates email format)
2. Check if email already exists → 400 if so
3. `hash_password(password)` → bcrypt hash (work factor = 12, auto-generated salt)
4. Insert `User` record → return `{ message: "User created" }`

### Login (`POST /api/auth/login`)
1. Receive `{ email, password }` (10/min rate limit)
2. Query user by email → 401 if not found
3. `verify_password(plain, hashed)` → bcrypt comparison → 401 if mismatch
4. `create_access_token({ email })` → signed JWT, **15 min** expiry (was 60 min)
5. `create_refresh_token({ email })` → returns `(token, jti)`, stores session in `refresh_tokens` table with `device_info`
6. `generate_csrf_token()` → random 32-byte hex token
7. Set three httpOnly cookies: `access_token`, `refresh_token`, `csrf_token`
8. Return `{ refreshed: True }` (no JWT in body)

### Protected Routes
```python
def get_current_user(request: Request, db: Session = Depends(get_db)):
    token = _extract_token_from_request(request)  # cookie first, then Bearer header
    payload = _verify_token(token, expected_type="access")
    _enforce_csrf(request)  # double-submit check on mutating cookie requests
    return { "email": payload["sub"], "role": payload.get("role", "user") }
```
Any route with `current_user: dict = Depends(get_current_user)` is protected.

## 6.2 bcrypt Internals

```python
bcrypt.hashpw(password[:72].encode("utf-8"), bcrypt.gensalt())
```
- `gensalt()` generates a random salt (prevents rainbow table attacks)
- Work factor (default 12): 2^12 iterations — computationally expensive to brute-force
- `[:72]`: bcrypt truncates at 72 bytes — explicit truncation prevents surprises
- Same password always produces different hash (salt is embedded in the hash string)

## 6.3 JWT Internals

```python
SECRET_KEY = os.getenv("JWT_SECRET")  # Fail-closed: raises RuntimeError if unset (§1.1 fix)
ALGORITHM = "HS256"
```

**JWT structure:** `header.payload.signature`
- Header: `{ alg: "HS256", typ: "JWT" }`
- Payload: `{ jti: uuid, sub: email, role: "user", type: "access"|"refresh", exp: timestamp }`
- Signature: `HMAC-SHA256(base64(header) + "." + base64(payload), SECRET_KEY)`

**Verification:** Backend re-computes the signature from the received token. If it matches, the token is valid and unmodified. Token `type` is enforced — an access token cannot be used as a refresh token.

**Refresh rotation (§1.7):** On `/api/auth/refresh`, the JTI is verified in `refresh_tokens` DB, old token marked `revoked=True`, a new `(token, jti)` pair is issued and stored. If a revoked JTI is replayed, all sessions for that user are immediately revoked.

## 6.4 ~~Client Login~~ — REMOVED (§5.1 fix)

The anonymous `/api/auth/client-login` endpoint was removed. It minted valid JWTs for any project using only a `project_id` — a passwordless IDOR via enumeration. Internal automation now uses a server-minted service account token (`SERVICE_ACCOUNT_EMAIL`). A proper invite/share flow is the planned replacement.

## 6.5 Security Status (Updated 2026-06-28)

| Issue | Risk | Status |
|---|---|---|
| Hardcoded `JWT_SECRET` | Critical | ✅ FIXED — env var, fail-closed at boot (§1.1) |
| Routes missing auth | Critical | ✅ FIXED — `get_chat_or_403` / `get_project_or_403` on all routes (§2.2) |
| CORS wildcard `*` in Editor | High | ✅ FIXED — explicit per-origin with `credentials: true` |
| JWT in `localStorage` | High | ✅ FIXED — httpOnly cookies, CSRF double-submit (§5.4) |
| No refresh token rotation | High | ✅ FIXED — JTI-based rotation with anomaly detection (§1.7) |
| `PRAGMA foreign_keys` off | Medium | ✅ FIXED — WAL + FK + single engine (§6.12) |
| SQLite dual `create_all` + Alembic | Medium | ✅ FIXED — Alembic only, baseline migration (§2.3) |
| Missing rate limiting | Medium | ✅ FIXED — per-IP limits on login/register/refresh (§5.6) |
| SQLite for production | Low | ✅ ADDRESSED — `DATABASE_URL` read; **Postgres path validated end-to-end** (§10.7). SQLite kept as dev default by choice |
| SSRF in ThreatLens | Critical | ⛔ DEFERRED — ThreatLens out of scope this cycle |


---

# 7. AI PIPELINE DEEP DIVE

## 7.1 Intermediate Representation (IR) Schema

```python
# ir_schema.py
EXTRACTION_IR = ["FACT","CONSTRAINT","ASSUMPTION","OPTION","DECISION","CONFLICT","EXAMPLE","UNKNOWN","CONFIDENCE"]
SYNTHESIS_IR  = ["FACT","CONSTRAINT","ASSUMPTION","OPTION","DECISION","CONFLICT","UNKNOWN","CONFIDENCE"]
```

Every LLM is forced to output in this exact format:
```
FACT:
- We decided to use PostgreSQL for ACID compliance
DECISION:
- PostgreSQL chosen over MongoDB
CONFLICT:
- None
...
```

**Why strict IR?** Prevents free-text responses that can't be parsed into database records. Treats LLM like a compiler — fixed input/output contract.

## 7.2 Extraction Ensemble (`providers.py`) — UPDATED (§10.3 / §16.1)

> **The old "Groq-8B / HuggingFace-3B / Gemini→Mixtral" trio is gone.** The live
> `EXTRACTION_ENSEMBLE` is **three genuinely different models**, each stored with its **real**
> label (no fictional vendors):

```python
EXTRACTION_ENSEMBLE = [
    (f"groq:{MODELS['groq_llama']}", ask_groq_llama),   # groq:llama-3.3-70b-versatile
    (f"groq:{MODELS['groq_oss']}",   ask_groq_oss),     # groq:openai/gpt-oss-20b  (non-Llama)
    (f"nvidia:{MODELS['nvidia_llama']}", ask_nvidia_llama), # nvidia:meta/llama-3.1-70b-instruct
]
```

- **temperature 0.0** on every call (least-random; note: hosted LLMs are *not* bit-reproducible — §11.6).
- Missing IR headers are back-filled with `- None`; a provider that errors returns `None` and is **skipped** (never fed to synthesis — §6.1, no error-as-fact poisoning).
- **Why `gpt-oss-20b`?** It replaced a weak 8B Llama. Near-homogeneous Llamas agree *lexically* regardless of truth, which **inflated** the measured-agreement confidence. A non-Llama member **decorrelates** the ensemble at the same model count/cost (§16.1).
- The per-model IR blocks feed the **measured agreement** metric (§10.3) — the honest confidence shown in the UI.

## 7.3 Synthesis Model (`ask_hf_synthesis`)
- Directs to `ask_synthesis()` which uses **meta/llama-3.3-70b-versatile** on Groq.
- temperature: 0.0, max_tokens: 4096, timeout: 120s
- Better at handling long IR blocks than previous Qwen model.

## 7.4 Synthesis Service (`synthesis_service.py`)

```python
def generate_and_store_synthesis(db, chat_id, reply_group_id, assistant_replies):
    raw_merged = ask_hf_synthesis(assistant_replies) # Now uses Groq Llama 3.3
    raw_merged = prune_to_synthesis_ir(raw_merged)  # strip unknown sections
    final_clean = strip_empty_sections(raw_merged)   # remove empty headers
    synth = save_or_update_synthesis(db, chat_id, reply_group_id, final_clean)
    return synth
```

`save_or_update_synthesis` also:
1. Calls `parse_ir_from_synthesis()` → dict of `{ SECTION: [bullets] }`
2. Calls `build_graph_from_ir()` → creates KnowledgeNode + KnowledgeEdge records
3. Calls `link_previous_decisions()` → creates REFINES edges between old and new DECISION nodes

## 7.5 Knowledge Graph Construction (`knowledge_graph_builder.py`)

```python
RELATION_MAP = {
    "FACT": "SUPPORTS",
    "CONFLICT": "CONTRADICTS",
    "OPTION": "ALTERNATIVE_OF",
    "UNKNOWN": "BLOCKS",
    "ASSUMPTION": "DEPENDS_ON",
    "DECISION_VERSION": "REFINES"
}

def build_graph_from_ir(db, chat_id, synthesis_id, ir):
    for section, bullets in ir.items():
        for text in bullets:
            node = KnowledgeNode(chat_id=chat_id, synthesis_id=synthesis_id,
                                 section=section, content=text)
            db.add(node)
    # §16.2 fix: edges are NO LONGER a blind cartesian product. A candidate edge is only
    # created when the two nodes share real lexical evidence (token overlap above a floor);
    # no evidence → no edge ("honest silence beats a fabricated edge").
    for src in non_decision_nodes:
        for dst in decision_nodes:
            if _tokens(src.content) & _tokens(dst.content):      # shared-term evidence
                db.add(KnowledgeEdge(from_node_id=src.id, to_node_id=dst.id,
                                     relation=RELATION_MAP.get(src.section)))
    db.commit()
```

**Edge logic (§16.2 / §17.4):** FACT→SUPPORTS, CONFLICT→CONTRADICTS, ASSUMPTION→DEPENDS_ON — **but only when the nodes actually share terms.** This is what makes the *"Why this decision?"* trace meaningful: a decision lists only the evidence it is genuinely linked to, with the shared terms that justified each edge (was previously every node linked to every decision — semantically hollow).

---

# VIVA QUESTIONS — PART 2

**Q1: What is an Intermediate Representation (IR) and why use it?**
A: IR is a strict schema (`FACT:`, `DECISION:`, etc.) that all LLMs must output in. It acts like a compiler contract — converting unpredictable natural language into parseable, structured data that can be stored in a database and compared across models.

**Q2: Why is temperature set to 0.0?**
A: Temperature controls randomness in LLM outputs. At 0.0, the model always picks the highest-probability token — making outputs deterministic and reproducible. This is critical for a system that compares outputs across model runs.

**Q3: What is bcrypt and why use it over MD5/SHA?**
A: bcrypt is a password hashing function with a configurable work factor. MD5/SHA are fast hash functions — they can be brute-forced with GPUs at billions of hashes/second. bcrypt is intentionally slow (2^12 iterations by default), making brute-force attacks computationally infeasible. It also auto-generates a salt preventing rainbow table attacks.

**Q4: What is the `reply_group_id` design pattern?**
A: When one user message triggers 3 AI model calls, all responses share a UUID called `reply_group_id`. This groups them in the UI. When the user "accepts" one response, the backend deactivates all others in the same group via a bulk UPDATE. This ensures only one canonical answer per question.

**Q5: SQLite or PostgreSQL — which does the backend use?**
A: **Both, by design.** SQLite is the zero-config dev default; production opts into Postgres by setting `DATABASE_URL` (+ `RUN_MIGRATIONS_ON_STARTUP=0`). The SQLite-only `check_same_thread` flag and the WAL/FK PRAGMAs are guarded on the dialect, so one ORM serves both. The Postgres path is **validated end-to-end** (§10.7): a clean Alembic migrate cycle, `alembic check` zero schema-drift vs the models, and an app-engine ORM round-trip — it's exercised, not theoretical. SQLite's file-level write lock is exactly why prod uses Postgres.

**Q11: How is the "confidence" on a synthesis computed, and why is that a big deal?**
A: It's **measured inter-model agreement** (§10.3) — a deterministic Jaccard-clustering metric over the three models' IR — **not** the LLM's self-reported confidence, which is discarded. Showing a model's own "I'm 95% sure" as if it were measured is a research-integrity hazard (§11.4); measuring where independent models actually converge is honest and reproducible.

**Q12: Why three specific models, and why one non-Llama?**
A: An ensemble of near-identical Llamas agrees *lexically* regardless of truth, which inflates the agreement metric and floors Decision Readiness. Swapping a weak 8B Llama for OpenAI's open-weight `gpt-oss-20b` **decorrelates** the ensemble at the same model count and cost (§16.1), so agreement means something. A provider that fails just returns `None` and is skipped.

**Q6: Why is MongoDB used for Temporal Cards and not SQLite?**
A: Card schemas evolve — a "risk" card and an "architecture" card have different metadata structures. MongoDB's schema-less documents allow each card type to carry arbitrary fields without requiring ALTER TABLE migrations. The embedded `kgDiff` object would require a separate join table in SQL.

**Q7: What is the Quarantine Engine?**
A: Instead of crashing on a malformed message or database error, the system catches the exception, stores the raw payload + error reason in `quarantined_messages`, and returns a 400 response. This gives developers visibility into failures without losing data.

**Q8: How does Context Injection work?**
A: Before sending a user's message to LLMs, `build_chat_context()` queries the DB for the last 10 relevant messages (user messages not tagged as noise + accepted AI replies + all synthesis blocks). These are formatted as a structured history block prepended to the prompt, giving the LLM awareness of the prior conversation.

**Q9: What is `PRAGMA foreign_keys=ON` and why is it needed?**
A: SQLite disables foreign key constraint enforcement by default for backward compatibility. Without this pragma, DELETE CASCADE would not work — deleting a project would leave orphaned chat and message records. The event listener ensures this pragma is set on every new connection.

**Q10: What are the 6 edge relation types in the Knowledge Graph?**
A: SUPPORTS (facts backing a decision), CONTRADICTS (conflicts opposing a decision), REFINES (new version improving an old decision), DEPENDS_ON (assumptions a decision relies on), BLOCKS (unknowns that prevent decisions), ALTERNATIVE_OF (options competing with each other).

---
*→ Continue in VIVA_PREP_PART3.md: Satellite Service + Editor Service + SRS Pipeline*
