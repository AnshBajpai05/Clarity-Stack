# ClarityStack: Deep Architectural & Engineering Audit

**Role:** Principal Software Architect & Codebase Auditor  
**Date:** 2026-03-04  
**Scope:** Full repo — Backend (FastAPI/Python) + Frontend (React/TypeScript/Vite)

---

## Section 1 — Project Understanding

### Purpose

ClarityStack is a **multi-model AI knowledge synthesis platform**. Its core idea is that when a user submits a text prompt ("message") inside a Chat, the system fans the prompt out to three LLM providers (Groq, Gemini, HuggingFace), receives three structured extraction blocks in an Intermediate Representation (IR) format, synthesises them into a single canonical "truth" document, and then decomposes that synthesis into a `KnowledgeGraph` (nodes and typed edges) stored in a relational database.

### Architecture Style

- **Backend:** Monolithic FastAPI application (`main.py`). No separate router files — all routes are defined inline. SQLite (via SQLAlchemy ORM). No background task scheduler. No queue.
- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS. State managed locally with `useState`/`useEffect`. Server state via raw `fetch`/`api` calls with 4-second polling intervals — no WebSockets.
- **LLM Providers:** Groq (llama-3.1-8b-instant) ← real, HuggingFace (Llama-3.2-3B-Instruct + Qwen2.5-7B for synthesis) ← real, Gemini ← **fully mocked (returns static string)**.
- **Authentication:** None. Zero auth. All endpoints are publicly accessible.
- **Database:** Single SQLite file `claritystack.db`.

### Major Modules

| Module              | Location                             | Role                                              |
| ------------------- | ------------------------------------ | ------------------------------------------------- |
| HTTP API            | `Backend/main.py`                    | All routes (1020 lines, inline)                   |
| ORM Models          | `Backend/models.py`                  | All database tables                               |
| LLM Providers       | `Backend/providers.py`               | Groq, Gemini (mock), HF calls                     |
| Synthesis Pipeline  | `Backend/synthesis_service.py`       | IR merge, IR validator, DB save                   |
| KG Builder          | `Backend/knowledge_graph_builder.py` | Node/edge creation from IR                        |
| Reasoning Queries   | `Backend/reasoning_queries.py`       | Graph traversal for decision cockpit              |
| Context Builder     | `Backend/context_builder.py`         | Chat history injection into prompts               |
| IR Schema           | `Backend/ir_schema.py`               | Canonical IR section names                        |
| Frontend API Client | `Web/Frontend/src/lib/api.ts`        | All HTTP calls + demo-mode mocks                  |
| Frontend Pages      | `Web/Frontend/src/pages/`            | Index, Projects, Chats, Messages, Cards, Settings |

---

## Section 2 — Directory Analysis

| Directory                      | Purpose                                  | Key Files                                                                     | Notes                                                             |
| ------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `Backend/`                     | Python FastAPI backend root              | `main.py`, `models.py`, `database.py`, `providers.py`, `synthesis_service.py` | Entire server logic lives here                                    |
| `Backend/prompts/`             | System prompts for LLMs                  | `extraction_prompt.py`, `synthesis_prompt.py`                                 | Controls model behaviour                                          |
| `Backend/Signal_Classifier/`   | Standalone signal classifier experiments | benchmark scripts                                                             | Not integrated directly; `signal_classify.py` at root used in-app |
| `Backend/migrations/`          | Alembic migration directory              | `env.py`, `versions/`                                                         | Migrations exist but SQLite means `create_all()` typically used   |
| `Web/Frontend/src/pages/`      | All screen-level React pages             | `ProjectsPage`, `ChatsPage`, `MessagesPage`, `CardsPage`, `SettingsPage`      | `CardsPage` is 100% mock data                                     |
| `Web/Frontend/src/lib/`        | API client + utilities                   | `api.ts`, `http.ts`, `utils.ts`                                               | `api.ts` has inline mock data + real API fan-out                  |
| `Web/Frontend/src/components/` | Reusable React components                | 67 component files                                                            | Includes cards, chats, layout, messages, shared, ui               |
| `Web/Frontend/src/hooks/`      | Custom React hooks                       | `use-toast.ts`, `use-mobile.tsx`                                              | Limited — no global state hooks                                   |
| `Mobile/`                      | Mobile placeholder                       | —                                                                             | Not implemented                                                   |
| `Reports_and_comparisons/`     | Documents                                | —                                                                             | Research / docs only                                              |

---

## Section 3 — Backend Architecture

### Request Lifecycle (Example: `POST /chats/{chat_id}/ask`)

```
Client → POST /chats/{chat_id}/ask
  → CORS Middleware (allows localhost:8080)
  → Log request (http middleware)
  → Route handler: ask_multi_model()
      1. classify_signal(text) → "high" / "medium" / "low" / "noise"
      2. If "noise" → save user msg + default reply, return early
      3. Build context from last 10 messages via build_chat_context()
      4. Fan out to: ask_groq(), ask_gemini(), ask_hf() [parallel-ish via sequential loop]
      5. Each provider returns IR-structured text or error block
      6. Tag each block with provider name
      7. generate_and_store_synthesis(db, chat_id, reply_group_id, blocks)
           → ask_hf_synthesis(blocks)        ← Qwen2.5-7B merge
           → prune_to_synthesis_ir(raw)       ← section filter
           → strip_empty_sections()
           → save_or_update_synthesis()
               → build_graph_from_ir()        ← creates KnowledgeNodes + KnowledgeEdges
               → link_previous_decisions()    ← REFINES edges across synth versions
      8. Create synthesis Message record (role="synthesis")
      9. Return { status, reply_group_id, synthesis_id }
```

### Database Models (tables)

| Model                | Table                  | Key Columns                                                                                               | Relations                                                |
| -------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `Project`            | `projects`             | id, name, purpose, success_criteria, constraints, owner                                                   | Parent of Chats                                          |
| `Chat`               | `chats`                | id, project_id, title, source_type, pinned, archived, purpose, phase, description, owner                  | Child of Project; parent of Messages, Synthesis          |
| `Message`            | `messages`             | id, chat_id, role, sender, text, signal_level, accepted, include_in_summary, reply_group_id, synthesis_id | Child of Chat                                            |
| `QuarantinedMessage` | `quarantined_messages` | id, chat_id, raw_payload, error_reason                                                                    | Isolated quarantine                                      |
| `Card`               | `cards`                | id, project_id, title, kind, phase, status, current_version_id, tags_json, review_state                   | **Never written by pipeline — no insertion code exists** |
| `CardVersion`        | `card_versions`        | id, card_id, body, summary, is_ai_generated, confidence, source_refs                                      | Child of Card                                            |
| `Synthesis`          | `synthesis`            | id, chat_id, reply_group_id, content, model_used                                                          | Child of Chat; parent of KnowledgeNodes                  |
| `KnowledgeNode`      | `knowledge_nodes`      | id, chat_id, synthesis_id, section, content, version, confidence                                          | Child of Chat + Synthesis                                |
| `KnowledgeEdge`      | `knowledge_edges`      | id, chat_id, from_node_id, to_node_id, relation                                                           | Child of Chat                                            |

### Key Missing Backend Components

- No `User` / `UserWorkspace` model (no auth tables)
- No `SemanticEmbedding` table or vector index
- No `ImportJob` model (no async import pipeline)
- No `BackgroundJob` scheduler (no temporal decay)
- `Card` table exists but **no route ever writes to it** — the Cards pipeline is completely disconnected from the Knowledge Graph
- `Synthesis` content is raw text — no JSON field exposing parsed nodes per synthesis for frontend consumption
- `KnowledgeNode` has no `source_message_ids` field (provenance to message level doesn't exist)
- `link_previous_decisions()` is called with wrong argument signature in `synthesis_service.py` line 122 — passes `old_id` as positional `chat_id` arg instead of actual `chat_id`

### Routers

All routes are inline in `main.py`. No separation into router files. There are **no** routes for:

- Knowledge Nodes CRUD (`/nodes`, `/edges`)
- Graph data endpoint (`/projects/{id}/graph`)
- Import endpoint (`/import`)
- Authentication (`/auth/login`, `/auth/register`)
- User management
- Daily briefing / dashboard summary
- Export (audit pack)
- Semantic search (`/search`)

---

## Section 4 — Frontend Architecture

### Tech Stack

React 18, TypeScript, Vite, TailwindCSS, shadcn/ui components, `react-router-dom` v6, `@tanstack/react-query` (imported but **not actually used for data fetching** — all state is `useState` + raw `fetch`), `framer-motion`, `date-fns`.

### Page Routing (`App.tsx`)

| Route                                | Component      | Status                              |
| ------------------------------------ | -------------- | ----------------------------------- |
| `/`                                  | `Index`        | Redirects to `/projects`            |
| `/projects`                          | `ProjectsPage` | Functional — real API               |
| `/projects/:projectId/chats`         | `ChatsPage`    | Functional — real API               |
| `/projects/:projectId/chats/:chatId` | `MessagesPage` | Functional — real API               |
| `/cards`                             | `CardsPage`    | **100% mock data — zero API calls** |
| `/settings`                          | `SettingsPage` | UI only, no backend mutations       |

### API Client (`lib/api.ts`)

- Hardcoded `API_BASE_URL = 'http://127.0.0.1:8000'`
- Demo mode fallback (mock data) when API is unreachable
- Two parallel HTTP utilities: `fetchApi()` (plain fetch) and `api()` from `http.ts` — inconsistent usage, both exist
- No auth headers anywhere (no `Authorization` token injection)
- No semantic search function
- No import function
- No graph endpoint function
- No KnowledgeNode/Edge fetch functions

### Data Flow

```
MessagesPage
  → getMessages(chatId)        → GET /chats/{chatId}/messages
  → askChat(chatId, ...)       → POST /chats/{chatId}/ask
  → getChat(chatId)            → GET /chats/{chatId}
  → updateChat(chatId, ...)    → PATCH /chats/{chatId}
  → KnowledgeInspector (inline component in MessagesPage)
      → fetch /api/reasoning/chat/{chatId}
      → fetch /chats/{chatId}/synthesis
```

---

## Section 5 — Backend-Frontend Integration Map

| Frontend Component                | API Call                             | Backend Route                       | Service Logic                                                         | Database Model                                           |
| --------------------------------- | ------------------------------------ | ----------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| `ProjectsPage`                    | `getProjects()`                      | `GET /projects`                     | inline query                                                          | `Project`                                                |
| `ProjectsPage`                    | `createProject()`                    | `POST /projects`                    | inline                                                                | `Project`                                                |
| `ChatsPage`                       | `getChats(projectId)`                | `GET /projects/{id}/chats`          | inline                                                                | `Chat`                                                   |
| `ChatsPage`                       | `createChat()`                       | `POST /projects/{id}/chats`         | inline                                                                | `Chat`                                                   |
| `ChatsPage`                       | `deleteChat()`                       | `DELETE /chats/{id}`                | inline                                                                | `Chat` CASCADE                                           |
| `ChatsPage`                       | `togglePinChat()`                    | `PATCH /chats/{id}/pin`             | inline                                                                | `Chat`                                                   |
| `ChatsPage`                       | `toggleArchiveChat()`                | `PATCH /chats/{id}/archive`         | inline                                                                | `Chat`                                                   |
| `ChatsPage`                       | `renameChat()`                       | `PATCH /chats/{id}`                 | `update_chat()`                                                       | `Chat`                                                   |
| `ChatsPage`                       | `getArchivedChats()`                 | `GET /projects/{id}/chats/archived` | inline                                                                | `Chat`                                                   |
| `ChatsPage`                       | `getProject()` / `updateProject()`   | `GET/PATCH /projects/{id}`          | inline                                                                | `Project`                                                |
| `MessagesPage`                    | `getMessages(chatId)`                | `GET /chats/{id}/messages`          | inline                                                                | `Message`                                                |
| `MessagesPage`                    | `askChat()`                          | `POST /chats/{id}/ask`              | `classify_signal` → multi-model → `generate_and_store_synthesis` → KG | `Message`, `Synthesis`, `KnowledgeNode`, `KnowledgeEdge` |
| `MessagesPage.KnowledgeInspector` | raw fetch `/api/reasoning/chat/{id}` | `GET /api/reasoning/chat/{id}`      | `get_decision_explanation()`                                          | `KnowledgeNode`, `KnowledgeEdge`                         |
| `MessagesPage.KnowledgeInspector` | raw fetch `/chats/{id}/synthesis`    | `GET /chats/{id}/synthesis`         | `list_synthesis_for_chat()`                                           | `Synthesis`                                              |
| `CardsPage`                       | —                                    | —                                   | —                                                                     | `Card`, `CardVersion` (never called)                     |
| `SettingsPage`                    | —                                    | —                                   | —                                                                     | none                                                     |

> **Critical Gap:** `CardsPage` is entirely decoupled. `Card` and `CardVersion` models exist in the DB but are never populated by any backend route.

---

## Section 6 — Requirement Compliance Analysis

| #   | Requirement                                        | Source              | Current Status    | Gap                                                                                                                                                                     | Required Change                                                                                                                       |
| --- | -------------------------------------------------- | ------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Semantic Search over KnowledgeNodes                | Doc 1 (Tier 1, #1)  | ❌ Missing        | No vector embeddings, no search endpoint, no search UI                                                                                                                  | Add embedding generation + vector index + `/search` endpoint + search UI                                                              |
| 2   | Decision Provenance Panel (node → source messages) | Doc 1 (Tier 1, #2)  | ⚠️ Partial        | `KnowledgeInspector` shows decisions/conflicts but `KnowledgeNode` has no `source_message_ids` FK; panel shows synthesis-level, not message-level provenance            | Add `source_message_ids` column to `KnowledgeNode`, populate at build time, expose via API and UI                                     |
| 3   | Visual Graph View (interactive node graph)         | Doc 1 (Tier 1, #3)  | ❌ Missing        | Graph exists in DB but is never rendered as a visual graph. `CardsPage` shows cards in a navigator using 100% mock data                                                 | Add new `GraphPage` using `react-force-graph` or `vis-network`, wired to real KG data; add `/projects/{id}/graph` endpoint            |
| 4   | User Auth + Workspaces (JWT, RBAC)                 | Doc 1 (Tier 1, #4)  | ❌ Missing        | No `User` table, no JWT logic, no middleware, all endpoints public, CORS only allows localhost                                                                          | Full auth system: `User` model, register/login endpoints, JWT middleware, project-level `UserProjectRole` table, all routes protected |
| 5   | Import via Paste (ChatGPT/Slack raw paste)         | Doc 1 (Tier 1, #5)  | ❌ Missing        | No import route, no paste parser, no import UI page                                                                                                                     | Add `POST /projects/{id}/import` with conversation parser, add `ImportPage` frontend                                                  |
| 6   | Today Dashboard / Daily Briefing                   | Doc 1 (Tier 2, #6)  | ❌ Missing        | No dashboard endpoint, no stale/contested node logic                                                                                                                    | Add `GET /projects/{id}/dashboard` endpoint + `DashboardPage`                                                                         |
| 7   | Conflict Resolution Workflow                       | Doc 1 (Tier 2, #7)  | ❌ Missing        | CONFLICT edges exist in KG but no resolution flag, no owner assignment, no UI workflow                                                                                  | Add `resolution_state` to `KnowledgeNode`, add `PATCH /nodes/{id}/resolve`, add resolution UI                                         |
| 8   | Export: Audit Pack (PDF/JSON-LD)                   | Doc 1 (Tier 2, #9)  | ❌ Missing        | No export endpoint                                                                                                                                                      | Add `GET /projects/{id}/export` → JSON-LD or basic structured format                                                                  |
| 9   | Temporal Confidence Decay                          | Doc 1 (Tier 2, #10) | ❌ Missing        | No background scheduler                                                                                                                                                 | Add APScheduler nightly job that decrements `confidence` on untouched nodes                                                           |
| 10  | Gemini is production-ready                         | Doc 2 (Foundation)  | ❌ Incorrect      | `ask_gemini()` returns a hardcoded static mock string for every call                                                                                                    | Wire real Gemini API (`GEMINI_API_KEY` in `.env`) using `google-generativeai` SDK                                                     |
| 11  | One-click import from everything                   | Doc 2 (Part 1, #1)  | ❌ Missing        | See #5 above                                                                                                                                                            |                                                                                                                                       |
| 12  | Genuinely useful search                            | Doc 2 (Part 1, #2)  | ❌ Missing        | See #1 above                                                                                                                                                            |                                                                                                                                       |
| 13  | Personal Daily Briefing                            | Doc 2 (Part 1, #3)  | ❌ Missing        | See #6 above                                                                                                                                                            |                                                                                                                                       |
| 14  | Multi-user / Team Support                          | Doc 2 (Part 1, #4)  | ❌ Missing        | See #4 above                                                                                                                                                            |                                                                                                                                       |
| 15  | CardsPage wired to real data                       | Doc 1, Doc 2        | ❌ Broken         | `CardsPage` uses 100% hardcoded mock data. `Card` model never populated                                                                                                 | Wire `CardsPage` to backend; add card extraction pipeline from KnowledgeNodes                                                         |
| 16  | Graph visual demo screenshot                       | Doc 1, Doc 3        | ❌ Missing        | Critical for investor/recruiter demo                                                                                                                                    | See #3 above                                                                                                                          |
| 17  | KG nodes scoped to Project (not just Chat)         | Doc 3               | ⚠️ Structural gap | All KG queries are chat-scoped. No endpoint aggregates graph at project level                                                                                           | Add project-level graph endpoint that unions all chat KGs                                                                             |
| 18  | `link_previous_decisions()` bug                    | Code                | ❌ Bug            | Called as `link_previous_decisions(db, old_id, existing.id)` — missing `chat_id` positional arg; function signature expects `(db, chat_id, old_synth_id, new_synth_id)` | Fix call site in `synthesis_service.py` line 122                                                                                      |
| 19  | Duplicate engine / FK setup in `database.py`       | Code                | ⚠️ Defect         | Engine created twice; FK pragma registered twice                                                                                                                        | Deduplicate                                                                                                                           |
| 20  | CORS origin hardcoded to localhost                 | Code                | ⚠️ Config         | `origins = ["http://localhost:8080"]` — breaks staging/prod                                                                                                             | Move to env config                                                                                                                    |
| 21  | `@tanstack/react-query` unused                     | Code                | ⚠️ Waste          | Imported in `main.tsx`, never used for data fetching                                                                                                                    | Either use it consistently or remove it                                                                                               |
| 22  | No KG-level endpoints exposed for frontend         | Code                | ❌ Missing        | No `GET /chats/{id}/nodes`, `GET /chats/{id}/edges`, `GET /projects/{id}/graph`                                                                                         | Add these for CardsPage, GraphPage, search                                                                                            |

---

## Section 7 — Required Code Changes (Master Table)

| ID     | Type               | File(s)                                          | Current Behavior                                                | Required Change                                                                                                                     | Reason                                         |
| ------ | ------------------ | ------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------- | ----------------- |
| CHG-01 | Bug Fix            | `Backend/synthesis_service.py:122`               | `link_previous_decisions(db, old_id, existing.id)` — wrong args | `link_previous_decisions(db, chat_id, old_id, existing.id)`                                                                         | Function signature requires chat_id as 2nd arg |
| CHG-02 | Bug Fix            | `Backend/database.py`                            | Engine created twice, FK pragma registered twice                | Remove duplicate engine creation + pragma                                                                                           | Causes SQLite locking issues                   |
| CHG-03 | Model Change       | `Backend/models.py`                              | `KnowledgeNode` has no message provenance field                 | Add `source_message_ids` (JSON Text column)                                                                                         | Decision Provenance Panel requirement          |
| CHG-04 | Model Change       | `Backend/models.py`                              | No `User` model                                                 | Add `User` table (id, email, password_hash, created_at)                                                                             | Auth system prerequisite                       |
| CHG-05 | Model Change       | `Backend/models.py`                              | No RBAC model                                                   | Add `UserProjectRole` table (user_id, project_id, role)                                                                             | RBAC prerequisite                              |
| CHG-06 | Model Change       | `Backend/models.py`                              | `KnowledgeNode` has no resolution/staleness fields              | Add `resolution_state` (str), `last_confirmed_at` (datetime) columns                                                                | Conflict resolution + temporal decay           |
| CHG-07 | Service Change     | `Backend/knowledge_graph_builder.py`             | Node created without message provenance                         | Capture source message ID(s) and store in `source_message_ids`                                                                      | Provenance                                     |
| CHG-08 | New Service        | `Backend/embedding_service.py` [NEW]             | No such service                                                 | Create module: generate embeddings via `sentence-transformers` and store as JSON on `KnowledgeNode`                                 | Semantic search                                |
| CHG-09 | New Service        | `Backend/import_service.py` [NEW]                | No such service                                                 | Create conversation parser: splits raw ChatGPT/Slack/Markdown text into `(role, sender, text, timestamp)` tuples                    | Import via paste                               |
| CHG-10 | Router Change      | `Backend/main.py`                                | Gemini returns static mock                                      | Wire `ask_gemini()` in `providers.py` to real Gemini API                                                                            | Multi-model consensus accuracy                 |
| CHG-11 | New Route          | `Backend/main.py`                                | No auth endpoints                                               | Add `POST /auth/register`, `POST /auth/login` returning JWT                                                                         | Authentication                                 |
| CHG-12 | New Route          | `Backend/main.py`                                | No protected middleware                                         | Add JWT dependency (`Depends(get_current_user)`) to all project/chat/message routes                                                 | RBAC enforcement                               |
| CHG-13 | New Route          | `Backend/main.py`                                | No search endpoint                                              | Add `GET /projects/{id}/search?q=...` that scores KnowledgeNodes by cosine similarity to query embedding                            | Semantic search                                |
| CHG-14 | New Route          | `Backend/main.py`                                | No import endpoint                                              | Add `POST /projects/{id}/import` with `{ raw_text, source_type }` payload                                                           | Import pipeline                                |
| CHG-15 | New Route          | `Backend/main.py`                                | No project-level graph endpoint                                 | Add `GET /projects/{id}/graph` returning `{ nodes: [...], edges: [...] }`                                                           | Visual graph + CardsPage                       |
| CHG-16 | New Route          | `Backend/main.py`                                | No card creation pipeline                                       | Add route to auto-create `Card` records from `KnowledgeNode` DECISION/RISK/FACT sections                                            | CardsPage real data                            |
| CHG-17 | New Route          | `Backend/main.py`                                | No dashboard endpoint                                           | Add `GET /projects/{id}/dashboard` returning contested/stale nodes + recent activity                                                | Daily briefing                                 |
| CHG-18 | New Route          | `Backend/main.py`                                | No export endpoint                                              | Add `GET /projects/{id}/export?format=json` returning structured JSON-LD                                                            | Audit pack                                     |
| CHG-19 | New Route          | `Backend/main.py`                                | No conflict resolution                                          | Add `PATCH /nodes/{id}/resolve` with `{ resolution: "approved_a"                                                                    | "approved_b"                                   | "rewritten", resolved_by }` | Conflict workflow |
| CHG-20 | Router Refactor    | `Backend/main.py`                                | 1020-line monolith                                              | Split into router files: `auth.py`, `projects.py`, `chats.py`, `messages.py`, `synthesis.py`, `graph.py`, `search.py`, `import_.py` | Maintainability                                |
| CHG-21 | Config Change      | `Backend/main.py`                                | CORS origins hardcoded                                          | Move `origins` to `os.getenv("CORS_ORIGINS", "http://localhost:8080").split(",")`                                                   | Environment portability                        |
| CHG-22 | New Background Job | `Backend/scheduler.py` [NEW]                     | No scheduler                                                    | Add APScheduler cron job: nightly decay of `confidence` on nodes older than 90 days without `last_confirmed_at` update              | Temporal decay                                 |
| CHG-23 | Frontend New Page  | `Web/Frontend/src/pages/GraphPage.tsx` [NEW]     | No visual graph                                                 | Create page using `react-force-graph-2d` or `vis-network-react`, wired to `GET /projects/{id}/graph`                                | Visual graph requirement                       |
| CHG-24 | Frontend New Page  | `Web/Frontend/src/pages/ImportPage.tsx` [NEW]    | No import UI                                                    | Create page with textarea + source-type selector + submit → `POST /projects/{id}/import`                                            | Import via paste                               |
| CHG-25 | Frontend New Page  | `Web/Frontend/src/pages/DashboardPage.tsx` [NEW] | No dashboard                                                    | Create Today page showing contested/stale nodes, recent activity                                                                    | Daily briefing                                 |
| CHG-26 | Frontend Change    | `Web/Frontend/src/pages/CardsPage.tsx`           | 100% mock data                                                  | Replace mock data with real API calls to `GET /projects/{id}/graph` and card endpoints                                              | Real data requirement                          |
| CHG-27 | Frontend Change    | `Web/Frontend/src/pages/MessagesPage.tsx`        | KnowledgeInspector shows synthesis-level provenance             | Show source messages that generated each node — link to exact message in chat                                                       | Provenance panel requirement                   |
| CHG-28 | Frontend Change    | `Web/Frontend/src/lib/api.ts`                    | No auth, no search, no graph fns                                | Add `login()`, `register()`, `searchNodes()`, `getProjectGraph()`, `importConversation()`, `exportProject()`                        | New endpoints                                  |
| CHG-29 | Frontend Change    | `Web/Frontend/src/App.tsx` + router              | 6 routes, no auth guard                                         | Add routes for `GraphPage`, `ImportPage`, `DashboardPage`; add protected route wrapper                                              | New pages + auth                               |
| CHG-30 | Frontend Change    | `Web/Frontend/src/lib/http.ts`                   | No JWT injection                                                | Add `Authorization: Bearer <token>` header from localStorage/context to every request                                               | Auth enforcement                               |

---

## Section 8 — Backend Changes Detailed

### 8.1 Bug Fixes (Ship Immediately)

**CHG-01 — `link_previous_decisions` wrong call**  
File: `Backend/synthesis_service.py`, line 122.

```python
# CURRENT (broken):
link_previous_decisions(db, old_id, existing.id)

# REQUIRED:
link_previous_decisions(db, chat_id, old_id, existing.id)
```

The function signature at line 65 of `knowledge_graph_builder.py` is `def link_previous_decisions(db, chat_id, old_synth_id, new_synth_id)`. The current call passes `old_id` as `chat_id`, causing all REFINES edges to be keyed to the wrong chat scope.

**CHG-02 — Duplicate engine in `database.py`**  
Lines 21–25 and 45–51 both create an engine and register FK pragma. The second binding silently overrides. Remove lines 45–52.

---

### 8.2 Authentication & RBAC (CHG-04, CHG-05, CHG-11, CHG-12)

**New Models (`models.py`)**:

```
User: id, email (unique), password_hash, display_name, created_at
UserProjectRole: id, user_id (FK users.id), project_id (FK projects.id), role (admin/contributor/viewer), created_at
```

**New Routes in `main.py` (or `routers/auth.py` after refactor)**:

- `POST /auth/register` → hashes password with `bcrypt`, creates `User`, returns JWT
- `POST /auth/login` → verifies password, returns `{ access_token, token_type }`
- `GET /auth/me` → returns current user from JWT

**JWT Dependency**:

```python
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    user = db.query(User).filter(User.id == payload["sub"]).first()
    ...
```

Apply `Depends(get_current_user)` to all existing routes except `/health`, `/auth/register`, `/auth/login`.

**Project-level RBAC**: `POST /projects/{id}/invite` adds `UserProjectRole`. Enforced by checking role before mutations.

---

### 8.3 Provenance System (CHG-03, CHG-07)

Add `source_message_ids` (JSON Text) column to `KnowledgeNode`:

```python
source_message_ids = Column(Text, nullable=True)  # JSON-encoded list of message UUIDs
```

In `build_graph_from_ir()` (`knowledge_graph_builder.py`), pass the triggering `user_message_id` through the call chain and store it:

```python
import json
node = KnowledgeNode(
    ...
    source_message_ids=json.dumps([user_message_id])
)
```

Expose via new `GET /nodes/{id}/provenance` endpoint that returns the node + related messages.

---

### 8.4 Semantic Search (CHG-08, CHG-13)

**New file: `Backend/embedding_service.py`**

```python
from sentence_transformers import SentenceTransformer
import json

MODEL = SentenceTransformer('all-MiniLM-L6-v2')  # lightweight, ~80MB

def get_embedding(text: str) -> list[float]:
    return MODEL.encode(text).tolist()
```

**Model change**: Add `embedding_json` (Text column, nullable) to `KnowledgeNode`. Populate on node creation.

**Search Route**:

```
GET /projects/{project_id}/search?q=<query>
```

1. Embed the query string
2. Fetch all `KnowledgeNode` records for the project (across all chats)
3. Compute cosine similarity between query embedding and each node embedding
4. Return top-10 sorted by similarity

---

### 8.5 Import Pipeline (CHG-09, CHG-14)

**New file: `Backend/import_service.py`**

Parses patterns for:

- ChatGPT export: `**You:** ...` / `**ChatGPT:** ...`
- Slack export: `Username [timestamp]\nMessage`
- Plain blocks: split by `\n\n`

Returns list of `{ role, sender, text, timestamp }` dicts.

**Route**: `POST /projects/{id}/import` accepts `{ raw_text, source_type, chat_title }`:

1. Creates a new `Chat` with `source_type`
2. Calls `import_service.parse()` → list of message payloads
3. Bulk-inserts `Message` records
4. Triggers synthesis pipeline (`generate_and_store_synthesis`) on batches

---

### 8.6 Graph Endpoints (CHG-15)

**New Route**: `GET /projects/{project_id}/graph`

```python
nodes = db.query(KnowledgeNode).join(Chat).filter(Chat.project_id == project_id).all()
edges = db.query(KnowledgeEdge).join(Chat).filter(Chat.project_id == project_id).all()
return { "nodes": [...], "edges": [...] }
```

**New Route**: `GET /chats/{chat_id}/nodes` and `GET /chats/{chat_id}/edges` (granular access for KnowledgeInspector).

---

### 8.7 Cards Pipeline (CHG-16)

Currently `Card` and `CardVersion` models exist but **zero code writes to them**. The pipeline must:

1. After `build_graph_from_ir()`, iterate `DECISION`/`RISK`/`FACT` nodes
2. Create `Card` records with `kind` mapped from section name, `title` extracted from first sentence of `content`
3. Create `CardVersion` linked to the card with `body = node.content`, `is_ai_generated = True`, `source_refs = synthesis_id`
4. Set `card.current_version_id` to the new version

---

### 8.8 Router Refactor (CHG-20)

Split `main.py` into:

```
Backend/routers/
  auth.py          (register, login, me)
  projects.py      (CRUD projects, invite)
  chats.py         (CRUD chats, pin, archive)
  messages.py      (messages, accept, toggle)
  synthesis.py     (synthesis CRUD + generate)
  graph.py         (nodes, edges, project graph)
  search.py        (semantic search)
  import_.py       (import endpoint)
  dashboard.py     (briefing endpoint)
  export.py        (audit pack)
  reasoning.py     (existing /api/reasoning/chat/{id})
```

---

## Section 9 — Frontend Changes Detailed

### 9.1 `lib/api.ts` Additions (CHG-28)

```typescript
// Auth
export async function register(
  email,
  password,
): Promise<{ access_token: string }>;
export async function login(email, password): Promise<{ access_token: string }>;

// Graph
export async function getProjectGraph(
  projectId: string,
): Promise<{ nodes: Node[]; edges: Edge[] }>;
export async function getNodeProvenance(
  nodeId: string,
): Promise<{ node: KNode; messages: Message[] }>;

// Search
export async function searchNodes(
  projectId: string,
  query: string,
): Promise<KNode[]>;

// Import
export async function importConversation(
  projectId: string,
  rawText: string,
  sourceType: string,
  chatTitle: string,
): Promise<Chat>;

// Export
export async function exportProject(
  projectId: string,
  format: "json",
): Promise<Blob>;
```

### 9.2 `lib/http.ts` Auth Injection (CHG-30)

```typescript
// Before every request, inject JWT from localStorage:
headers: {
  'Content-Type': 'application/json',
  ...(localStorage.getItem('cs_token')
    ? { Authorization: `Bearer ${localStorage.getItem('cs_token')}` }
    : {}),
  ...options?.headers,
}
```

### 9.3 `App.tsx` New Routes (CHG-29)

```tsx
<Route path="/projects/:projectId/graph"  element={<GraphPage />} />
<Route path="/projects/:projectId/import" element={<ImportPage />} />
<Route path="/dashboard"                  element={<DashboardPage />} />
<Route path="/login"                      element={<LoginPage />} />
```

Wrap all protected routes in an `<AuthGuard>` component that checks `localStorage.getItem('cs_token')`.

### 9.4 `GraphPage.tsx` [NEW] (CHG-23)

Install: `npm install react-force-graph-2d`

```tsx
import ForceGraph2D from "react-force-graph-2d";

// Fetch: GET /projects/{projectId}/graph
// Map nodes: { id, label: node.section, content: node.content }
// Map links: { source: edge.from_node_id, target: edge.to_node_id, label: edge.relation }

// Color scheme:
// DECISION → neon-cyan
// CONFLICT → destructive/red
// FACT → neon-mint
// RISK/UNKNOWN → amber
// ASSUMPTION → violet
```

On node click → slide-in panel showing node content + source messages (provenance).

### 9.5 `CardsPage.tsx` (CHG-26)

Replace `mockChatsWithCards` and `mockProjects` with:

```typescript
useEffect(() => {
  if (!selectedProjectId) return;
  fetch(`/projects/${selectedProjectId}/graph`)
    .then((r) => r.json())
    .then((data) => setGraphData(data));
}, [selectedProjectId]);
```

Map `KnowledgeNode` with `section === "DECISION"` → card `type: "decision"`, etc.

### 9.6 `MessagesPage.tsx` — Provenance Panel (CHG-27)

In `KnowledgeInspector`, for each displayed node, add a "Source Messages" section:

```tsx
// Call GET /nodes/{id}/provenance
// Render source messages as small message bubbles with timestamps
// Each bubble links to the chat position scrolled to that message
```

### 9.7 `ImportPage.tsx` [NEW] (CHG-24)

```tsx
// 1. Textarea for raw conversation paste
// 2. Dropdown: ChatGPT | Slack | Claude | Markdown
// 3. Text field: Chat name
// 4. Submit → POST /projects/{projectId}/import
// 5. Progress indicator with step feedback (Parsing → Messages → Synthesis → Graph)
```

---

## Section 10 — Database Changes

| Change                                            | Type                                                | Migration Required? | Notes               |
| ------------------------------------------------- | --------------------------------------------------- | ------------------- | ------------------- |
| Add `User` table                                  | New table                                           | Yes                 | Authentication      |
| Add `UserProjectRole` table                       | New table                                           | Yes                 | RBAC                |
| Add `source_message_ids` to `knowledge_nodes`     | New column (nullable TEXT)                          | Yes                 | Provenance          |
| Add `embedding_json` to `knowledge_nodes`         | New column (nullable TEXT, ~1500 chars float array) | Yes                 | Semantic search     |
| Add `resolution_state` to `knowledge_nodes`       | New column (nullable VARCHAR 50)                    | Yes                 | Conflict resolution |
| Add `last_confirmed_at` to `knowledge_nodes`      | New column (nullable DateTime)                      | Yes                 | Temporal decay      |
| Populate `cards` and `card_versions` via pipeline | Existing tables, new write path                     | No                  | Pipeline change     |

### SQLite vs. Production Note

> [!WARNING]
> `embedding_json` storing float vectors as JSON text in SQLite is suitable for demo (< 10k nodes) but will not scale. For production or investor demo with large datasets, migrate to PostgreSQL with the `pgvector` extension. The schema column definition is the same; only the similarity query changes.

### Alembic Migration Approach

Since Alembic is already configured (`Backend/alembic.ini`, `Backend/migrations/`), generate migrations:

```bash
alembic revision --autogenerate -m "add_auth_tables_and_node_provenance"
alembic upgrade head
```

---

## Section 11 — Risk & Breaking Changes

| Risk                                                                                          | Severity  | Affected Components      | Mitigation                                                                               |
| --------------------------------------------------------------------------------------------- | --------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| Adding auth breaks existing frontend (no token)                                               | 🔴 HIGH   | All pages                | Implement auth last; add `X-CS-Debug-Skip-Auth` dev header that bypasses JWT in dev mode |
| `link_previous_decisions` bug silently corrupts REFINES edges                                 | 🔴 HIGH   | `synthesis_service.py`   | Fix immediately (CHG-01) — ship before any demo                                          |
| `ask_gemini()` is mocked — synthesis quality is 2/3 real                                      | 🟡 MEDIUM | Synthesis quality        | Wire real Gemini or swap to second Groq model                                            |
| `CardsPage` mock data → switching to real data deletes visual cards                           | 🟡 MEDIUM | CardsPage UX             | Keep mock data as fallback until KG pipeline creates `Card` records                      |
| Adding `embedding_json` column to `knowledge_nodes` in SQLite re-processes all existing nodes | 🟡 MEDIUM | Existing DB data         | Run one-time backfill script after migration                                             |
| `source_message_ids` column is not backfilled for existing nodes                              | 🟡 MEDIUM | Provenance panel         | Existing nodes show "Unknown source" — acceptable for MVP                                |
| `database.py` duplicate engine may cause connection pool exhaustion                           | 🟡 MEDIUM | DB stability             | Fix immediately (CHG-02)                                                                 |
| Project-level graph endpoint without pagination could return huge payload                     | 🟡 MEDIUM | `/projects/{id}/graph`   | Add `?limit=500` and pagination from day one                                             |
| Importing large Slack exports may hit HF rate limits during synthesis                         | 🟡 MEDIUM | Import pipeline (Tier 1) | Queue imports as background tasks; show progress                                         |
| `@tanstack/react-query` is imported but unused — removing it won't break but is a dep audit   | 🟢 LOW    | `package.json`           | Either use it for caching or remove                                                      |

---

## Section 12 — Engineering TODO List (Priority Ordered)

| Priority | Task                                                                       | Affected Files                                                          | Effort | Dependencies          |
| -------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ | --------------------- |
| 🔴 P0    | Fix `link_previous_decisions` call bug                                     | `synthesis_service.py:122`                                              | 5 min  | None                  |
| 🔴 P0    | Fix duplicate engine in `database.py`                                      | `database.py`                                                           | 5 min  | None                  |
| 🔴 P0    | Wire real Gemini API (replace mock)                                        | `providers.py`, `.env`                                                  | 1–2h   | GEMINI_API_KEY        |
| 🔴 P0    | Add `/projects/{id}/graph` endpoint (nodes + edges)                        | `main.py` → `routers/graph.py`                                          | 2h     | None                  |
| 🔴 P0    | Build `GraphPage.tsx` with `react-force-graph-2d`                          | `GraphPage.tsx`, `App.tsx`, `api.ts`                                    | 4–6h   | Graph endpoint        |
| 🔴 P0    | Wire `CardsPage` to real KG data                                           | `CardsPage.tsx`, `api.ts`                                               | 3–4h   | Graph endpoint        |
| 🔴 P0    | Add `source_message_ids` to `KnowledgeNode` + populate                     | `models.py`, `knowledge_graph_builder.py`, migration                    | 2h     | None                  |
| 🔴 P0    | Expose node provenance endpoint and update Provenance Panel UI             | `main.py`, `MessagesPage.tsx`                                           | 3h     | source_message_ids    |
| 🔴 P1    | Add `ImportPage` + `POST /projects/{id}/import` backend                    | `import_service.py`, `main.py`, `ImportPage.tsx`, `App.tsx`             | 6–8h   | None                  |
| 🔴 P1    | Add semantic search (embeddings + `/search` endpoint + UI)                 | `embedding_service.py`, `models.py`, `main.py`, search route, search UI | 8–10h  | sentence-transformers |
| 🟡 P2    | JWT auth system (User model + endpoints + frontend guard)                  | `models.py`, `main.py`, `http.ts`, `LoginPage.tsx`, `App.tsx`           | 12–16h | None                  |
| 🟡 P2    | Project-level RBAC (`UserProjectRole` + invite endpoint)                   | `models.py`, `main.py`                                                  | 4h     | Auth system           |
| 🟡 P2    | Card creation pipeline (auto-populate `Card`/`CardVersion` from KG)        | `synthesis_service.py`, `main.py`                                       | 4h     | None                  |
| 🟡 P2    | Router refactor — split `main.py` into router files                        | All `routers/*.py`, `main.py`                                           | 3h     | None                  |
| 🟡 P2    | `DashboardPage` + `/projects/{id}/dashboard` backend                       | `dashboard.py`, `DashboardPage.tsx`, `App.tsx`                          | 5h     | None                  |
| 🟡 P2    | Export audit pack (`GET /projects/{id}/export`)                            | `main.py` → `routers/export.py`                                         | 3h     | None                  |
| 🟢 P3    | Conflict Resolution Workflow (resolution_state + UI)                       | `models.py`, `main.py`, new UI component                                | 5h     | None                  |
| 🟢 P3    | Temporal Confidence Decay (APScheduler nightly job)                        | `scheduler.py`, `models.py`                                             | 3h     | None                  |
| 🟢 P3    | Move CORS origins to env config                                            | `main.py`                                                               | 30 min | None                  |
| 🟢 P3    | Use `@tanstack/react-query` consistently or remove                         | `package.json`, all pages                                               | 4h     | None                  |
| 🟢 P3    | Add `GET /chats/{id}/nodes` and `GET /chats/{id}/edges` granular endpoints | `main.py` → `routers/graph.py`                                          | 1h     | None                  |
| 🟢 P3    | Knowledge Node manual edge creation from UI                                | `GraphPage.tsx`, new API route                                          | 4h     | GraphPage             |

---

## Key Architectural Summary

```
Current state:                         Target state:
────────────────────────────────       ────────────────────────────────
main.py (1020 lines, monolith)    →    routers/ (11 focused files)
SQLite + no embeddings            →    SQLite + JSON embedding column (demo)
                                         or Postgres+pgvector (production)
Gemini mocked                     →    Gemini real (google-generativeai)
No auth                           →    JWT + RBAC (python-jose + bcrypt)
CardsPage = 100% mock             →    CardsPage = KG-wired
No visual graph                   →    GraphPage (react-force-graph-2d)
No search                         →    Semantic cosine search
No import                         →    ImportPage + parser service
No provenance linkage             →    KnowledgeNode.source_message_ids
No CardVersion pipeline           →    Auto-created from synthesis
No dashboard                      →    DashboardPage + /dashboard endpoint
```

> [!IMPORTANT]
> The **three-feature demo** described in Doc 1 requires exactly these changes to be functional:
>
> 1. **Import via Paste** (CHG-14, CHG-24) — `POST /import` + `ImportPage`
> 2. **Provenance Panel** (CHG-03, CHG-07, CHG-27) — `source_message_ids` populated + panel updated
> 3. **Semantic Search** (CHG-08, CHG-13, search UI) — embeddings + cosine search
>
> These three, plus the **Visual Graph** (CHG-15, CHG-23), represent the irreducible set for a credible demo.
