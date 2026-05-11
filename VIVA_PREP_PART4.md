# ClarityStack Viva Prep — PART 4: Execution Flows + Features + Improvements + Master Q&A

---

# 11. COMPLETE EXECUTION FLOWS (Feature-by-Feature)

## 11.1 User Sends a Chat Message (Full Flow)

```
1. User types in MessagesPage.tsx input field
   → inputText state updates (controlled component)

2. User clicks Send
   → useMutation fires: POST /chats/{chatId}/ask { sender, text }

3. FastAPI receives request
   → CORS middleware adds headers
   → log_requests middleware starts timer
   → Pydantic validates AskPayload schema

4. classify_signal(text) runs
   → tokenizes, removes stopwords
   → fuzzy-matches tech keywords (SequenceMatcher ≥ 0.80)
   → score >= 6 → "high", else "noise"

5. If noise:
   → Save user message (signal_level="noise")
   → Save polite rejection reply
   → Return { status: "noise_filtered" }
   → Frontend shows grey badge, no AI block

6. If high/medium:
   → Save user message with signal_level
   → build_chat_context() fetches last 10 relevant messages
   → Formats into [USER], [ACCEPTED_ANSWER], [APPROVED_SUMMARY] blocks

7. Generate reply_group_id = uuid4()

8. Loop over providers [groq, gemini, hf]:
   → Call each with (history + current message)
   → On failure: substitute valid empty IR block
   → Tag with provider name: GROQ::, GEMINI::, HF::
   → Save each as role="assistant", accepted=False

9. generate_and_store_synthesis():
   → ask_hf_synthesis(all 3 blocks) → Qwen 2.5-7B merges
   → prune_to_synthesis_ir() → remove unknown sections
   → strip_empty_sections() → remove empty headers
   → save_or_update_synthesis() → save to SQLite
   → parse_ir_from_synthesis() → dict { FACT: [...], DECISION: [...] }
   → build_graph_from_ir() → create KnowledgeNode + KnowledgeEdge rows
   → link_previous_decisions() → REFINES edges to old DECISION nodes

10. Save synthesis as role="synthesis", accepted=True, signal_level="high"

11. Return { status: "ok", reply_group_id, synthesis_id }

12. Frontend: mutation.onSuccess → queryClient.invalidateQueries(['messages', chatId])
    → TanStack Query re-fetches message list
    → UI re-renders with all new messages
```

## 11.2 User Views Knowledge Graph (Full Flow)

```
1. User navigates to /projects/:projectId/kg
   → KnowledgeGraphPage.tsx mounts

2. useQuery(['kg', projectId]) fires
   → GET /projects/{projectId}/kg

3. Backend queries:
   → SELECT * FROM knowledge_nodes WHERE chat_id IN (chats of project)
   → SELECT * FROM knowledge_edges WHERE chat_id IN (chats of project)
   → Returns { nodes: [...], edges: [...] }

4. Frontend transforms data for react-force-graph-2d:
   → nodes: [{ id, label: content, color: sectionColor[section] }]
   → links: [{ source: from_node_id, target: to_node_id, label: relation }]

5. react-force-graph-2d renders canvas:
   → d3-force simulation: charge repulsion + link attraction
   → Each node = colored circle with text label
   → Each edge = line with relation label

6. User clicks a node:
   → Shows tooltip with: section, content, source chat, synthesis_id
   → Provenance: "This DECISION was extracted from Chat: [title]"
```

## 11.3 Generating a Temporal Card (Full Flow)

```
1. User clicks "Generate Cards" on TemporalCardsPage.tsx
   → POST /api/satellite/cards/:projectId/generate/chat/:chatId

2. Satellite requireAuth middleware verifies JWT

3. generateCardFromChat(projectId, chatId, token):
   → Fetch synthesis from Core API: GET /chats/{chatId}/synthesis (with JWT)
   → For each synthesis block, call cardDecomposer:
      → Splits IR into categorized fragments (risk bullets → risk card, etc.)
   → For each fragment, call cardWriter:
      → Groq LLM (Llama-3.1-70B) generates { title, summary, keyChanges, suggestedAction }
      → Model: temperature=0.3 (slight creativity for summaries)

4. Version-chain logic:
   → chainIndex = chatId + "_" + category
   → Find latest card: TemporalCard.findOne({ chainIndex }).sort({ version: -1 })
   → If exists: mark old as "superseded", new.version = old.version + 1, new.previousCardId = old._id
   → If new: version = 1, previousCardId = null

5. Save new TemporalCard to MongoDB

6. Return { cards: [...], count: N }

7. Frontend: TanStack Query invalidates ['cards', projectId]
   → TemporalCardsPage re-renders with new cards
```

## 11.4 Collaborative Editor — Two Users Editing Simultaneously

```
User A opens /editor/workspace/abc123
  → EditorWorkspace.jsx mounts
  → socket.emit("join", "abc123")
  → Server: loads room from Supabase if not in memory
  → Server: socket.emit("load-sections", sections)
  → UI shows current sections

User B opens same URL
  → Same join sequence
  → Server: io.to("abc123").emit("user-count", 2)
  → Both users see "2 users online"

User A edits Section 1:
  → Keystroke → socket.emit("section_change", { room: "abc123", sectionId: "s1", content: "new text" })
  → Server: finds section by ID, updates rooms["abc123"].sections[0].content
  → socket.to("abc123").emit("section_update", { sectionId: "s1", content: "new text" })
    → User B's client receives this → updates their textarea
  → debouncedSave("abc123") → 1 second idle → Supabase upsert

User A adds a new section:
  → socket.emit("add_section", { room: "abc123" })
  → Server creates { id: uuid, title: "Section 2", content: "" }
  → io.to("abc123").emit("section_added", newSection)
    → BOTH User A and User B receive and add section to UI

User B disconnects:
  → socket.on("disconnect") fires
  → Remove socket.id from roomUsers["abc123"]
  → io.to("abc123").emit("user-count", 1)
```

## 11.5 SRS PDF Upload and Analysis (Full Flow)

```
1. User on SRS Dashboard uploads a PDF
   → POST /api/upload (multipart/form-data)

2. API saves PDF to data/raw_SRS/
   → doc_id = filename without extension
   → PROGRESS_STORE[doc_id] = { status: "processing", percent: 0 }
   → background_tasks.add_task(run_pipeline_background, doc_id, pdf_path)
   → Return immediately: { doc_id, status: "processing" }

3. Frontend receives response, starts polling:
   → Every 3 seconds: GET /api/document/{doc_id}/status
   → Shows progress bar: stage name + percent

4. Background pipeline runs:
   Stage 1: PyMuPDF extracts raw text → PROGRESS: 15%
   Stage 2: Structure parsing → PROGRESS: 30%
   Stage 3: Markdown cleaning → PROGRESS: 45%
   Stage 4: Equation extraction → PROGRESS: 60%
   Stage 5: Actor/Story intelligence → PROGRESS: 75%
   Stage 6: Ambiguity/Conflict/Gap detection → PROGRESS: 100%

5. PROGRESS_STORE[doc_id].status = "done"

6. Frontend polling sees "done":
   → Navigates to SRS Workspace
   → GET /api/document/{doc_id}/intelligence → actors, stories
   → GET /api/document/{doc_id}/issues → ambiguities, conflicts, gaps
   → Renders issue cards with severity badges
```

---

# 12. FEATURE INTERNALS — SMALL BUT IMPORTANT

## 12.1 Signal Level Badges (Tiny but Asked)

Every message has a `signal_level` field in the DB. Frontend reads this and shows:
- `high` → green "High Signal" badge
- `medium` → yellow badge
- `low` → grey badge
- `noise` → shown differently, no AI processing

## 12.2 Toast Notifications

Two systems used:
- `sonner` (programmatic): `toast.success("Card generated!")` called from mutation `onSuccess`
- `Toaster` (shadcn): used by Radix Dialog components internally

## 12.3 Loading States

```tsx
const { data, isLoading, isError } = useQuery(...);
if (isLoading) return <Skeleton />;
if (isError) return <ErrorState message={error.message} />;
return <MessageList data={data} />;
```

Every page handles three states: loading (skeleton), error, success.

## 12.4 Accept/Reject AI Response

When a user accepts one AI message from a reply group:
```python
# Deactivate all others in the same group
db.query(Message).filter(
    Message.reply_group_id == msg.reply_group_id,
    Message.role == "assistant",
    Message.id != msg.id
).update({ Message.accepted: False })
# Activate selected
msg.accepted = True
db.commit()
```

## 12.5 Chat Pin and Archive

Simple PATCH endpoints with boolean fields:
- `pinned=True` → chat floats to top in list (`ORDER BY pinned DESC, created_at DESC`)
- `archived=True` → chat hidden from main list (separate `/archived` endpoint)

## 12.6 Project Visibility — Public vs Private

- `private`: only owner and members can see
- `public`: appears in Discovery feed, anyone can request to join
- Join request → PM gets notified (mock email printed to console)
- PM accepts → new `ProjectMember` row created

## 12.7 Client Login (Guest Access)

```python
token = create_access_token({
    "email": f"client_{payload.project_id}",
    "role": "client",
    "project_id": payload.project_id
})
```
Stakeholders get a limited JWT scoped to one project. No password needed — just the project ID. Useful for demos.

---

# 13. IMPROVEMENTS & HONEST WEAKNESSES

## 13.1 Security Issues

| Issue | Risk | Fix |
|---|---|---|
| `SECRET_KEY = "HalaMadrid12345"` hardcoded | **Critical** — forge any token | Move to `.env`, use 256-bit random key |
| Gemini mocked | Reduces consensus to 2 models | Integrate `google-generativeai` SDK |
| No route-level auth on many endpoints | Unauthenticated chat/message access | Add `Depends(get_current_user)` to all |
| JWT in localStorage | XSS risk | Use httpOnly cookies |
| `cors(origin: "*")` in Editor | Any website can connect | Lock to frontend origin |

## 13.2 Scalability Issues

| Issue | Impact | Fix |
|---|---|---|
| SQLite concurrent writes | Blocks under load | Migrate to PostgreSQL |
| In-memory room state in Editor | Lost on restart, single instance | Redis for shared state |
| SRS BackgroundTasks single-threaded | Long PDFs block other tasks | Celery + Redis queue |
| LLM calls synchronous in `/ask` | Slow — 3 API calls in series | `asyncio.gather()` for parallel calls |

## 13.3 Missing Features

- No WebSocket for the main chat AI updates (polling needed now)
- No pagination on message list (can get slow with thousands of messages)
- No rate limiting on AI endpoints (can burn API credits)
- No email verification on register
- Gemini never integrated (just mocked)
- No unit test coverage on frontend components

## 13.4 Good Engineering Decisions

- **Quarantine engine**: malformed messages captured, not crashed
- **IR schema enforcement**: treats LLMs as compilers — reliable parsing
- **Polyglot persistence**: right DB for each use case
- **Debounced saves**: efficient DB writes in collaborative editor
- **Retry logic in MongoDB**: auto-reconnects every 30s

---

# 14. MASTER VIVA Q&A — TRICKY CROSS QUESTIONS

**Q: Why not use a single database for everything?**
A: Different data types have different requirements. User/project data is relational and needs ACID guarantees — SQLite/PostgreSQL is correct. AI card schemas evolve rapidly across versions — MongoDB's schema-less documents avoid costly migrations. Collaborative editor state needs PostgreSQL (Supabase) for its auth and real-time features. Using one database would force compromises on all three.

**Q: Why does the Satellite exist separately instead of putting card generation in the Core API?**
A: Separation of concerns. The Core API is responsible for CRUD and the AI extraction pipeline. Card generation requires calling the Core API, then calling external LLMs, then persisting to MongoDB — a completely different data flow. If merged, a card generation failure could crash the CRUD layer. Separate services also allow independent scaling.

**Q: The Gemini model is mocked. Doesn't that invalidate your "multi-model consensus" claim?**
A: Partially yes — this is a known technical debt. The system architecture is designed for true 3-model consensus. In the current implementation, Gemini returns a structurally valid empty IR block, so the synthesis only merges Groq and HuggingFace outputs. The fix is integrating the `google-generativeai` SDK and replacing the mock function.

**Q: What happens if the HuggingFace synthesis call times out after 120 seconds?**
A: The `try/except` in `ask_hf_synthesis` catches the timeout exception and returns a fallback IR block with `SYNTHESIS FAILURE` noted in the FACT section. The synthesis is still saved — just with error content. The user sees the synthesis block with the error note and can manually regenerate.

**Q: How does your Knowledge Graph avoid duplicate nodes?**
A: Currently it doesn't — every `/ask` call creates new KnowledgeNode rows. The system relies on `synthesis_id` scoping to logically group nodes per conversation turn. A proper deduplication layer would use semantic similarity (embedding distance) to merge nodes with near-identical content across synthesis runs.

**Q: Why is `check_same_thread=False` needed for SQLite?**
A: SQLite by default only allows the thread that created the connection to use it. FastAPI uses a thread pool (via Starlette) where different threads may handle different parts of the same request lifecycle. Setting `check_same_thread=False` removes this restriction — SQLAlchemy's session factory handles thread safety at a higher level.

**Q: What is the difference between `reply_group_id` and `synthesis_id`?**
A: `reply_group_id` is a UUID generated when the user sends a message — it groups the 3 AI responses and 1 synthesis message that result from that single prompt. `synthesis_id` is the primary key of the `Synthesis` table row containing the merged IR content. Messages that belong to the synthesis result have `synthesis_id` pointing to this record. They serve different purposes: one groups messages visually, the other links to the structured output.

**Q: How would you scale this to 10,000 concurrent users?**
A: 
1. Replace SQLite with PostgreSQL (connection pooling via PgBouncer)
2. Add Redis for Socket.io horizontal scaling (multiple Editor nodes)
3. Replace BackgroundTasks with Celery + Redis for SRS pipeline
4. Add async LLM calls (`asyncio.gather`) to parallelize Groq + HF calls
5. Add API rate limiting (slowapi for FastAPI)
6. Deploy Core API with Gunicorn (multiple workers) behind Nginx
7. Use MongoDB Atlas auto-scaling for Satellite

**Q: What is the Virtual DOM and why does React use it?**
A: The real DOM is slow to update — every change triggers reflow/repaint cycles. React maintains a lightweight JavaScript copy (Virtual DOM). On state change, React re-renders the virtual tree and diffs it with the previous version (reconciliation). Only the minimal set of real DOM operations needed are executed. This batching makes React UIs fast for complex, frequently-updating views.

**Q: Why use `uuid4()` for primary keys instead of auto-increment integers?**
A: UUIDs are globally unique — no coordination needed across distributed systems. If you later shard the database or merge datasets, there are no ID collisions. Auto-increment IDs are sequential and predictable, creating a security risk (users can enumerate records by incrementing the ID). UUIDs as strings are slightly larger and slower to index, but the tradeoffs are worth it for a distributed system.

**Q: Explain the `PRAGMA foreign_keys=ON` issue in detail.**
A: SQLite was designed to be a zero-config embedded database. For backward compatibility with older databases that had no FK constraints, SQLite ignores FK violations by default. The `PRAGMA foreign_keys=ON` statement enables enforcement per-connection. Since SQLAlchemy creates a new connection per request (via `SessionLocal()`), this pragma must be set on every new connection — which is why a `@event.listens_for(Engine, "connect")` listener is used, not a one-time setup call.

---

# 15. ARCHITECTURE DIAGRAMS (Textual)

## 15.1 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (React SPA)                   │
│  Vite + TypeScript + TailwindCSS + TanStack Query        │
│  Axios (REST) │ Socket.io-client (WS)                   │
└────────┬───────────────┬──────────────┬────────────────-─┘
         │ :8000         │ :4000        │ :8003
         ▼               ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐
│  Core API    │ │  Satellite   │ │   Editor Service      │
│  FastAPI/Py  │ │  Express/JS  │ │   Express+Socket.io   │
│  SQLite      │ │  MongoDB     │ │   Supabase/PostgreSQL │
└──────┬───────┘ └──────┬───────┘ └──────────────────────┘
       │                │                     :8002
       │ LLM calls      │ LLM calls    ┌──────────────────┐
       ▼                ▼              │   SRS Service     │
  ┌─────────┐     ┌──────────┐        │   FastAPI/Python  │
  │  Groq   │     │  Groq    │        │   PyMuPDF+ML      │
  │  HF     │     │  HF      │        └──────────────────-┘
  └─────────┘     └──────────┘
```

## 15.2 Authentication Flow

```
Client → POST /api/auth/login { email, password }
       → Query User table → bcrypt.checkpw()
       → jwt.encode({ sub: email, role, exp }) → SECRET_KEY
       → Return { access_token }

Client → Any protected route (Authorization: Bearer <token>)
       → OAuth2PasswordBearer extracts token
       → jwt.decode(token, SECRET_KEY)
       → Return { email, role } to route handler
```

## 15.3 AI Pipeline Sequence

```
User Message
     ↓
classify_signal()  →  noise? → reject + polite reply
     ↓ (high/medium)
build_chat_context()  →  last 10 relevant messages
     ↓
┌─────────┬──────────┬──────────┐
│  Groq   │  Gemini  │    HF    │  (parallel calls, same prompt)
│ Llama   │  (mock)  │  Llama   │
└────┬────┴─────┬────┴────┬─────┘
     └──────────┴─────────┘
              ↓ 3 IR blocks
     ask_hf_synthesis()  →  Qwen 2.5-7B merges
              ↓
     prune + strip + validate
              ↓
     save_or_update_synthesis()
              ↓
     parse_ir → build_graph_from_ir()
              ↓
     KnowledgeNode + KnowledgeEdge → SQLite
```

## 15.4 Temporal Card Chain

```
Version 1 (active)         Version 2 (superseded)      Version 3 (active)
┌─────────────────┐        ┌─────────────────┐         ┌─────────────────┐
│ id: "card_v1"   │◄───────│ id: "card_v2"   │◄────────│ id: "card_v3"   │
│ category: risk  │        │ category: risk  │         │ category: risk  │
│ version: 1      │        │ version: 2      │         │ version: 3      │
│ status: supersed│        │ status: supersed│         │ status: active  │
│ previousCardId:─│        │ previousCardId:─│         │ previousCardId:─│
│   null          │        │   "card_v1"     │         │   "card_v2"     │
└─────────────────┘        └─────────────────┘         └─────────────────┘
```

---

# 16. QUICK-FIRE REFERENCE TABLE

| Topic | Answer |
|---|---|
| Backend framework | FastAPI (Python) |
| Backend port | 8000 |
| Backend DB | SQLite (file: claritystack.db) |
| ORM | SQLAlchemy |
| Auth mechanism | JWT (HS256, 60min expiry) |
| Password hashing | bcrypt |
| Frontend framework | React 18 + TypeScript |
| Build tool | Vite + SWC |
| Frontend port | 8080 |
| CSS framework | Tailwind CSS |
| State (server) | TanStack Query v5 |
| State (client) | Zustand |
| HTTP client | Axios with interceptors |
| Satellite port | 4000 |
| Satellite DB | MongoDB Atlas |
| Card versioning | Singly linked list (previousCardId) |
| Card schema | Mongoose |
| Editor port | 8003 |
| Editor protocol | Socket.io (WebSocket) |
| Editor DB | Supabase (PostgreSQL) |
| Editor persistence | Debounced (1s) upsert |
| SRS port | 8002 |
| SRS PDF library | PyMuPDF + marker-pdf |
| SRS semantic lib | sentence-transformers + FAISS |
| LLM for extraction | Groq (Llama-3.1-8B) + HF (Llama-3.2-3B) |
| LLM for synthesis | HF (Qwen-2.5-7B) |
| LLM for cards | Groq (Llama-3.1-70B) |
| IR format | FACT/CONSTRAINT/ASSUMPTION/OPTION/DECISION/CONFLICT/UNKNOWN/CONFIDENCE |
| Signal levels | high (≥6), medium (≥3), low (≥1), noise (0) |
| KG edge types | SUPPORTS/CONTRADICTS/REFINES/DEPENDS_ON/BLOCKS/ALTERNATIVE_OF |
| Startup script | start_project.bat (5 parallel terminals) |

---

*All 4 parts complete. Files saved as VIVA_PREP_PART1.md through VIVA_PREP_PART4.md*
