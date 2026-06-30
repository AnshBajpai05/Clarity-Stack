# ClarityStack Viva Prep — PART 4: Execution Flows + Features + Master Q&A

## 11. COMPLETE EXECUTION FLOWS
### 11.1 User Sends a Chat Message (Core AI Pipeline)
1. **Frontend**: React captures input, fires `useMutation` (`fetch` via `http.ts`) to `POST http://localhost:8000/chats/{id}/ask`.
2. **Backend (8000)**: `classify_signal` scores the text. If noise, auto-reply and exit.
3. **Extraction**: Calls the 3-model ensemble concurrently via `asyncio.gather` + `to_thread` (§2.1 async fix).
   - Models: `groq:llama-3.3-70b-versatile`, `groq:openai/gpt-oss-20b`, `nvidia:meta/llama-3.1-70b-instruct`.
   - Each block is stored under its **real** label (`groq:` / `nvidia:`) — no `GROQ::`/`MIXTRAL::` fiction.
   - Failed providers return `None` and are skipped — never fed to synthesis (§6.1).
4. **Measured agreement (§10.3)**: a deterministic Jaccard metric over the per-model IR → the persisted confidence (self-report discarded).
5. **Synthesis + grounding**: `groq:llama-3.3-70b-versatile` merges into a canonical IR; each bullet is cited to source messages (§10.6); IR is structurally validated.
6. **Storage (Atomic)**: provider messages + synthesis row + synthesis message in one atomic transaction (§3.2); `knowledge_graph_builder` writes **semantic** nodes/edges (§16.2).
7. **Card Trigger**: Satellite (8003) is pinged to version Temporal Cards (per-{chat,category} lineage).

### 11.2 Generating a Temporal Card (Satellite Flow)
1. **Frontend**: Request hits `POST http://localhost:8003/api/satellite/cards/:projectId/generate`.
2. **Satellite (8003)**: Fetches synthesis from Backend (8000).
3. **Decomposition**: `cardDecomposer` breaks IR into typed fragments.
4. **Synthesis**: `cardWriter` uses Groq to create a polished Knowledge Card.
5. **Versioning**: Chainer marks old versions as `superseded` and creates a new `active` card in MongoDB.

---

## 12. ARCHITECTURE DIAGRAM (Finalized)
```
         │ :8000 (Backend)   │ :8003 (Satellite)   │ :8004 (Editor)
         ▼                   ▼                     ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────────┐
│ FastAPI Core   │  │ Express Node   │  │ Socket.io Server   │
│ SQLite / PG    │  │ MongoDB Atlas  │  │ File-based JSON    │
└────────┬───────┘  └────────┬───────┘  └────────────────────┘
         │                   │                     :8001
         │ LLM Calls         │ LLM Calls    ┌────────────────┐
         ▼                   ▼              │ SRS Service    │
    ┌──────────┐        ┌──────────┐        │ FastAPI/Python │
    │ Groq/NIM │        │ Groq/NIM │        │ PyMuPDF + ML   │
    └──────────┘        └──────────┘        └────────────────┘
```


---

## 13. MASTER VIVA Q&A
**Q: What is the current extraction ensemble? (The old "Gemini→Mixtral" answer is obsolete.)**
A: Three **genuinely heterogeneous** live models, each stored with its real label: `groq:llama-3.3-70b-versatile`, `groq:openai/gpt-oss-20b` (a non-Llama member), and `nvidia:meta/llama-3.1-70b-instruct`. There are no fictional "Gemini"/"HuggingFace" providers. The non-Llama member is deliberate — near-identical Llamas agree lexically regardless of truth, which inflated the agreement metric; `gpt-oss-20b` **decorrelates** the ensemble at the same cost (§16.1). Confidence shown to the user is the **measured** agreement across these three (§10.3), not any model's self-report.

**Q: What are the flagship "intelligence" views? (§17)**
A: **Disagreement Spotlight** (claims the ensemble didn't unanimously extract), **Devil's Advocate** + **Ask-Anyway** override, **Evolution Timeline** (content-hash knowledge deltas), **"Why this decision?"** edge-grounded trace, and **Decision Readiness** (per-decision verdict + cheapest resolve-path). All are read-only recomputations over already-persisted data — no extra model calls.

**Q: Is the system production-database ready?**
A: Yes. Alembic owns the schema (no `create_all` shadowing); the **Postgres path is validated end-to-end** (§10.7) — clean migrate cycle, `alembic check` zero drift, ORM round-trip. SQLite stays the zero-config dev default; prod sets `DATABASE_URL` + `RUN_MIGRATIONS_ON_STARTUP=0`. This unblocks pgvector-based hybrid RAG (§10.8) as the next step.

**Q: Why the 8000-8007 port mapping?**
A: To ensure a standardized, collision-free environment. It makes the system turnkey and predictable during deployment.

**Q: What is the "System Hardening" you implemented?**
A: 
1. **Auth & Tier-0:** httpOnly cookies with CSRF double-submit, unified secrets, and object-level `requireProjectAccess` guards across all services (closing cross-tenant IDORs).
2. **Resilience:** Top-level error boundaries in the Frontend to catch boot crashes, and safe `localStorage` wrappers for privacy-mode browsers.
3. **Database:** SQLite WAL mode + single engine for concurrency, and fully atomic transactions on the `/ask` pipeline to prevent orphaned records.

**Q: How did you fix the AI Pipeline latency?**
A: Previously, the 3 extraction models were called serially, taking ~0.9s. By refactoring `ask_multi_model` to use `asyncio.gather` with `asyncio.to_thread` for the blocking HTTP calls, we achieved true parallel fan-out, reducing latency to ~0.33s.

**Q: How does the Knowledge Graph avoid duplicates / fabricated edges?**
A: Two ways. (1) **Edges** are no longer a blind cartesian product — a candidate edge is created only when two nodes share real lexical evidence; no evidence → no edge (§16.2). (2) **Card → KG ingestion is idempotent** per `(chat, section, content)`, so committing the same card twice adds nothing (§16.4). Semantic node dedup via vector embeddings (pgvector) is the planned §10.8 step, now unblocked by the Postgres work.

---

## 14. QUICK-FIRE REFERENCE
| Topic | Value |
|---|---|
| Backend Port | 8000 |
| SRS Port | 8001 |
| ThreatLens Port | 8002 |
| Satellite Port | 8003 |
| Editor Port | 8004 |
| UML API Port | 8005 |
| Frontend Port | 8006 |
| UML UI Port | 8007 |
| Extraction Ensemble | `groq:llama-3.3-70b-versatile`, `groq:openai/gpt-oss-20b`, `nvidia:meta/llama-3.1-70b-instruct` |
| Synthesis Model | `groq:llama-3.3-70b-versatile` |
| Confidence | Measured inter-model agreement (§10.3), not self-reported |
| Core Database | SQLite (dev) / **Postgres** (prod, validated §10.7) |
| Other Stores | MongoDB (Satellite cards), file-based (Editor), JSON (SRS) |
| Observability | Structured logs + request-id, Prometheus `/metrics`, Sentry (§10.5) |
| Tests | Backend 110 · Satellite 20 · Frontend 20 (+ CI coverage gate) |
| Real-time Protocol | Socket.io (WebSocket) |
