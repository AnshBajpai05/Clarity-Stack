# Take a Step Forward — Deep Engineering Audit of ClarityStack

> A principal-architect-level assessment of what it would take to turn ClarityStack
> from an impressive multi-feature student/research prototype into a **fully-backed,
> production-grade, research-grade, scalable** system.
>
> **Scope:** the entire monorepo — Core Backend, SRS-Clarity, ThreatLens, Knowledge
> Satellite, Collaborative Editor, UML-Clarity (backend + UI), and the main Web frontend.
>
> **Constraint honored:** this is a *report only*. No code was written, refactored, or implemented.
>
> **Date:** 2026-06-09 · **Audit branch:** `clarity_stack_v2`
>
> **Progress overlay added:** 2026-06-28 · **Implemented on branch:** `UI_enhanced`
> (security/correctness commits `6247596` + `ab14653`, UI overhaul `6d958aa`). Status
> markers below reflect what is *actually wired in the code on that branch*, verified
> file-by-file — not what the commit messages claim.

---

## 0a. Implementation status snapshot

**Legend:** ✅ **DONE** (shipped & verified in code) · 🟡 **PARTIAL** (started, gaps remain) · ⏳ **PENDING** (untouched).

**✅ Issues Fixed [REVIEW REQUIRED]:**
- **§5.4** localStorage tokens → httpOnly cookies (Hybrid Auth + CSRF + Refresh Tokens). Files touched:
  - `Backend/auth.py`
  - `Backend/main.py`
  - `Satellite/middleware/auth.js`
  - `Satellite/server.js`
  - `Editor_Service/server.js`
  - `Web/Frontend/src/lib/http.ts`
  - `Web/Frontend/src/lib/api.ts`
  - `Web/Frontend/src/pages/Login.tsx`
  - `Web/Frontend/src/pages/Register.tsx`
  - `Web/Frontend/src/components/RequireAuth.tsx`
  - `Web/Frontend/src/pages/editor/socket.js`
  - `Web/Frontend/src/pages/MessagesPage.tsx`
  - `Web/Frontend/src/pages/SettingsPage.tsx`
  - `Web/Frontend/src/pages/editor/Dashboard.jsx`
  - `Web/Frontend/src/pages/editor/Workspace.jsx`
- **§1.7** Auth Operational Hardening (Refresh Rotation, Session Management, RBAC, Silent Refresh). Files touched:
  - `Backend/models.py` (new `RefreshToken` table)
  - `Backend/auth.py` (`jti`, `get_cookie_name`, `require_permissions`, cookie prefix helpers)
  - `Backend/main.py` (`/refresh` rotation, `/logout` revoke, `/me` richer, rate-limit `/refresh`)
  - `Backend/migrations/versions/0029088d6806_add_refresh_tokens.py`
  - `Web/Frontend/src/lib/http.ts` (silent refresh state machine, `__Host-` cookie prefix support)
  - `Web/Frontend/src/lib/api.ts` (`fetchSatellite` 401 → silent refresh, not hard redirect)
  - 📄 See [`auth_hardening_walkthrough.md`](./auth_hardening_walkthrough.md) for full details. Also in [`issue_fixed.md §D`](./issue_fixed.md).



**🟡 Partial:**
- **§2.3** Browser key leak — ✅ **NOW CLOSED (2026-06-28).** `Dashboard.jsx` + `pureFrontendEngine.js` rewritten to call the server proxy `${VITE_API_URL}/api/llm`; all `VITE_GROQ/GEMINI/NVIDIA_API_KEY` usages and direct `api.groq.com`/`generativelanguage` fetches deleted (grep-verified). Proxy load-balances two server-side NVIDIA keys. See `existing_issues.md` §1.6.
- **§2.4** SQLite — integrity hardened (WAL/FK/single-engine) but **still SQLite**; Postgres is only a comment block, no migration.
- **Dead-code purge (§6/§10)** — `test_*.py`/`alter_db.py`/`fix_db.py`/`check_*.py` removed from `Backend/`, **but relocated to a top-level `scratch/`** (not deleted); `ollama_provider.py` and both service `scratch/` dirs remain.

**⏳ Pending (everything else):** §2.5 (async/queue — `ask_multi_model` still sync, sequential for-loop), most of §5 (**§5.1 LLM Gateway now 🟡 v1 — library shipped & wired into Core, see below**; RAG, honest/parallel ensemble, queue, verification, eval, observability, Docker/CI, agent still pending), §6.2–6.9 (incl. localStorage tokens, `Math.random` ids), all of §7 (MCP), and §8 local-first inference. **§6.10–6.11 (ThreatLens SSRF + CORS `*`) deferred — ThreatLens is held entirely out of scope this pass (see `existing_issues.md` banner).**

---


> **Scope decision (2026-06-28): stay cloud-dependent for now.** Per explicit request, **local-model replacement is deferred** — §8 (API dependency reduction) and §10.11 (local-first inference) remain ⏳ PENDING. The system intentionally **remains dependent on cloud LLMs** (NVIDIA NIM for Core/UML, Groq for Core/Satellite, HF for Satellite cards, cloud VLM for SRS/UML). To manage rate-limit load the UML proxy now spreads requests across **two** NVIDIA keys, but this is load-management, **not** a step toward local inference. Revisit §8/§10.11 only after the Tier-1 platform/gateway work.

**Still open after this pass (next up):** the Tier-1 platform work (LLM Gateway §5.1, Postgres §2.4, honest/parallel ensemble §5.3, Docker/CI §5.8, observability §5.7) and the remaining non-Tier-0 defects (localStorage tokens §5.4, demo-mode data loss §3.1, atomic ask-pipeline §3.2, rate-limiting §5.6, etc.). ThreatLens stays out of scope.


## 0. How to read this document

This report is deliberately blunt. ClarityStack is a genuinely ambitious system — eight
cooperating services, a multi-model reasoning pipeline, a temporal knowledge graph, a
GNN-based threat model, a VLM document pipeline, and a real-time collaborative editor.
That breadth is the achievement. It is also the problem: the system is **wide but thin** —
many capabilities, each resting on assumptions that will not survive real users, real
scale, or external scrutiny.

The recommendations are ordered by *leverage*, not by *politeness*. Section 11 prioritizes
everything into Tier 1/2/3 with realistic time estimates.

---

## 1. System Overview (what is actually here)

### 1.1 Service topology (standardized ports 8000–8007)

| # | Service | Port | Stack | Datastore | Role |
|---|---------|------|-------|-----------|------|
| 1 | Core Backend | 8000 | FastAPI (sync) | **SQLite** (`claritystack.db`) | Auth, projects, chats, messages, reasoning ensemble, KG build |
| 2 | SRS-Clarity | 8001 | FastAPI | filesystem (`data/raw_SRS`) | PDF→SRS intelligence, ambiguity detection (VLM pipeline) |
| 3 | ThreatLens | 8002 | FastAPI | filesystem + Tranco data | URL/threat classification — **local PyTorch GNN** |
| 4 | Knowledge Satellite | 8003 | Node/Express 5 | **MongoDB** (mongoose) | Temporal cards, KG snapshots, graph deltas, card scheduler |
| 5 | Collaborative Editor | 8004 | Node/Express + Socket.io | **Supabase** (Postgres+realtime) | Real-time docs, workspaces, snapshots |
| 6 | UML-Clarity API | 8005 | FastAPI | filesystem | SRS→UML semantic engine, `/api/llm` proxy, chunk store |
| 7 | Main Web UI | 8006 | Vite/React/TS | — (calls 8000–8005) | Primary dashboard |
| 8 | UML-Clarity UI | 8007 | Vite/React/JointJS | — (calls 8005) | Diagram editor, embedded as `<iframe>` in 8006 |

**Three independent datastores (SQLite + MongoDB + Supabase) with no shared schema, no
cross-store transactions, and no single source of truth.** The KG exists *twice*: built in
the Core via `knowledge_graph_builder.py` (SQLAlchemy) and re-fetched/snapshotted into
MongoDB by the Satellite `deltaEngine.js`.

### 1.2 The reasoning core (the research heart)

Evidence: `Backend/providers.py`, `Backend/main.py:777-949`, `Backend/synthesis_service.py`,
`Backend/prompts/`.

The flow on `POST /chats/{chat_id}/ask`:

1. `classify_signal()` — heuristic noise filter (normalize + fuzzy match + signal-word count;
   `main.py:1002-1052`). A BERT classifier exists on disk (`Backend/Signal_Classifier/`) but
   the live path is the heuristic.
2. If not "noise": build a 10-message sliding-window context (`context_builder.build_chat_context`).
3. **"Multi-model extraction ensemble"** — *as actually wired in `main.py:830-834`*:
   ```python
   providers = [("groq", ask_groq), ("gemini", ask_gemini), ("huggingface", ask_hf)]
   ```
   But in `providers.py`: `ask_gemini → ask_groq_mixtral` and `ask_hf → ask_nvidia_llama`.
   **So the "three-provider ensemble" is really Groq-llama-70b + Groq-8b-instant + NVIDIA-llama-70b, mislabeled as "gemini" and "huggingface".**
4. Each model emits a structured IR (`FACT / CONSTRAINT / ASSUMPTION / OPTION / DECISION /
   CONFLICT / EXAMPLE / UNKNOWN / CONFIDENCE`).
5. `generate_and_store_synthesis()` merges the blocks via a single Groq-llama-70b call →
   persisted as a `synthesis` message and fed to the KG builder.

`providers.py` also defines a *richer* 6-model pipeline (`run_multi_model_extraction`,
`full_pipeline`) that the live endpoint **does not use** — it is reachable only via the
`__main__` test block. So there are two ensembles and the production one is the weaker, mislabeled three.

### 1.3 External dependencies (hard)

| Provider | Used by | Purpose | Key var |
|----------|---------|---------|---------|
| **Groq** | Core reasoning + synthesis | extraction + merge | `GROQ_API_KEY` |
| **NVIDIA NIM** | Core reasoning, UML `/api/llm` | extraction, diagram gen | `NVIDIA_API_KEY` |
| **HuggingFace router** | Satellite cards (`hfClient.js`) | card writing/decomposition | `HF_TOKEN` |
| **Supabase** | Editor (auth + realtime + DB) | collaboration backbone | service keys |
| Cloud VLM | SRS + UML PDF pipeline (`stage*_vlm.py`) | document parsing | (env) |
| External feeds | ThreatLens (`threat_intel.py`) | reputation/Tranco | — |

`providers.py:29-33` raises `ValueError` at **import time** if `GROQ_API_KEY` or
`NVIDIA_API_KEY` is missing → the entire Core Backend refuses to boot without both vendors.

### 1.4 What is *missing* entirely

No tests (only ad-hoc `test_*.py` scripts, no `pytest.ini`/`conftest.py`/jest config) ·
No CI/CD (no `.github/`) · No containerization (no Dockerfile/compose; launch is a Windows
`start_project.bat` opening 8 terminal tabs) · No metrics/tracing/error-tracking · No queue
or background-job system (only `node-cron` in one service) · No retrieval/RAG (10-message
window only) · No evaluation harness · No experiment tracking · No rate-limiting/backoff/
circuit-breakers · No secret manager.

---

## 2. CRITICAL PRODUCTION BLOCKERS (fix before anyone outside the team touches it)

These are not "improvements." They are reasons the system cannot be deployed publicly today.



### 2.3 🔴 Vendor API key shipped to the browser [⭐⭐⭐⭐⭐] · 🟡 PARTIAL

`UML_Clarity_Service/src/joint-logic/promptEngine.js:18` references
`import.meta.env.VITE_NVIDIA_API_KEY`. **Any `VITE_`-prefixed variable is inlined into the
client bundle by Vite** — so the NVIDIA key string is extractable from the shipped JS / network
tab by any visitor. The UML `.env` also stores it in plaintext (gitignored, so not in history —
but it *is* in every build artifact). This is a live credential-leak and a billing/abuse risk.

- **Fix direction:** never expose provider keys to the client; route all model calls through
  the server-side `/api/llm` proxy (which the code already has) and delete the `VITE_NVIDIA_*`
  usage. **Effort: 2–4 hours.** **Impact: closes key-exfiltration + uncontrolled spend.**

### 2.4 🟠 SQLite as the primary OLTP store under a multi-user, multi-writer system [⭐⭐⭐⭐] · 🟡 PARTIAL

`Backend/database.py:8` → `sqlite:///./claritystack.db`, `check_same_thread: False`, and a
**duplicated `create_engine` (lines 21 and 45)** where the second silently drops the pragma
listener. SQLite serializes writes with a file lock; under concurrent message ingestion +
synthesis writes you get `database is locked` errors and lost throughput. It cannot be shared
across processes/replicas, so the Core can never be horizontally scaled.

- **Fix direction:** migrate to Postgres (keep SQLAlchemy + Alembic; the ORM abstracts it).
  **Effort: 3–5 days** (schema, data migration, connection pooling, the dual-engine cleanup).
  **Impact: unlocks concurrency + horizontal scale; removes a hard ceiling.**

### 2.5 🟠 Synchronous LLM pipeline inside the request thread [⭐⭐⭐⭐] · ⏳ PENDING

`ask_multi_model` is a **sync** FastAPI handler that runs 3 sequential LLM calls + a synthesis
call + DB writes inline (10–40 s wall-clock). Uvicorn runs sync handlers in a bounded
threadpool (~40 threads); a handful of concurrent `/ask` calls will exhaust it and the whole
API stalls — including health checks and unrelated reads. This is a denial-of-service waiting
to happen, self-inflicted under modest load.

- **Fix direction:** move synthesis to a job queue (see §5.4); return a job id; stream/poll
  results. Short-term mitigation: make the handler `async` and fan out provider calls
  concurrently. **Effort: 1–2 days (mitigation) / 1–2 weeks (full async pipeline).**

> **Tier-0 rule of thumb:** §2.1–2.3 are hours of work and are non-negotiable before any
> external exposure. §2.4–2.5 are the first scaling cliffs.

---

## 3. Architectural Analysis

### 3.1 Scale

- **Stateful single-file DB (SQLite)** ⇒ Core is single-writer, single-node. Hard ceiling.
- **Sequential, in-request LLM fan-out** ⇒ latency scales with #models, throughput collapses
  under concurrency (§2.5).
- **No caching anywhere** ⇒ identical prompts re-run the full ensemble every time; the
  Satellite re-fetches the entire KG per delta computation (`deltaEngine.fetchKGFromCore`
  loops every chat → N+1 HTTP calls to the Core).
- **`node-cron` single-process scheduler** (`Satellite/services/cardScheduler.js`) ⇒ if two
  Satellite instances ever run, cron fires twice; if zero run, nothing fires. Not HA.
- **Three datastores, no event bus** ⇒ consistency is maintained by hopeful HTTP calls
  (`_call_satellite_cleanup` in `main.py:593`), which silently swallow failures.

### 3.2 Maintainability

- **1321-line `main.py` monolith** mixing auth, CRUD, the LLM pipeline, signal heuristics,
  and KG wiring; imports repeated *inside* functions (`main.py:757-765`).
- **Misleading names** (`ask_hf` calls NVIDIA, `ask_gemini` calls Groq) — the code lies about
  what it does, which is corrosive for a research artifact.
- **Dead/scratch code committed**: `ollama_provider.py`, `test_gemini.py/test_groq.py/test_hf.py`,
  `alter_db.py`, `fix_db.py`, `check_*.py`, `SRS_Service/scratch/debug_*.py`,
  `UML_Clarity_Service/backend/scratch/*`. (Three `fix_*.cjs/.py` port-rewrite scripts were
  already removed during prior cleanup.)
- **No shared types** between the three datastores and the TS frontend; the frontend re-maps
  backend shapes ad hoc (`CardsPage` builds `ExtendedCardData` by hand).

### 3.3 Extensibility

The current "add a feature = add a microservice + a sidebar link + hardcode its port" pattern
does not compose. Each new service repeats: its own CORS list, its own auth (or none), its own
datastore, its own provider client. There is **no platform layer** (shared auth, shared model
gateway, shared config, shared observability). Adding the 9th capability will be as expensive
as the 8th — there is no economy of scale. This is the single biggest *architectural* signal
that the system is a collection of demos rather than a platform.

---

## 4. The Central Architectural Move: introduce a Platform Layer

Before the individual "step-forward" items, the highest-order recommendation:

> **Extract the cross-cutting concerns into a shared platform, so services stop
> re-implementing them.** Specifically: (a) an **LLM Gateway**, (b) a **shared auth/identity
> service**, (c) a **unified config/secret source**, (d) **shared observability**, and
> (e) a **typed contract layer** between services and the frontend.

Everything in §5 becomes 3–5× cheaper once this exists. Without it, each improvement is
re-done per service.

---

## 5. Major "Step Forward" Improvements

### 5.1 Unified LLM Gateway (model router + cache + retry + budget) [⭐⭐⭐⭐⭐] — **highest single ROI** · 🟡 PARTIAL (v1)

> **v1 shipped (Clarity_Stack_V3):** `Backend/llm_gateway.py` — single server-side chokepoint that `providers._generic_chat` routes through. Delivers temp-0 caching, retry+backoff, per-provider circuit breaker, ordered fallback chains (synthesis Groq→NVIDIA), token accounting + per-call logging, optional token budget, admin `GET /llm/stats`. Offline-tested 14/14. **Remaining:** in-process→Redis (with §5.4 queue), route the Node Satellite (`hfClient.js`) + UML `/api/llm` proxy through a shared gateway, per-tenant budgets + cost/latency routing. See `existing_issues.md §10.2`.

**Problem:** model calls are scattered across Python (`providers.py`), Node (`hfClient.js`),
and even the browser (`promptEngine.js`), each with its own URL, key, error handling, and no
caching/retry/observability. Model names are hardcoded and already stale (Groq removed
`mixtral`; the code "renamed" it to `llama-3.1-8b-instant` but kept the function name
`ask_groq_mixtral`).

**Move:** one internal service (or library) that every component calls. It provides:
- provider-agnostic `chat()` with an OpenAI-compatible schema (Groq/NVIDIA/HF/local are all OAI-compatible);
- **model routing** by task + cost + latency + availability;
- **fallback chains** (provider A → B → local) for graceful degradation instead of `_error_block` poisoning;
- **response caching** keyed on (model, prompt, temperature) — extraction is `temperature=0`, so it is perfectly cacheable;
- **retry with exponential backoff + circuit breaker**;
- **per-tenant token/cost budgets + rate limiting**;
- one place for **request/response logging + token accounting**.

**Impact:** removes the §2.3 browser-key issue, kills duplicate latency, makes the system
resilient to a single vendor outage, and gives you cost telemetry you currently lack entirely.
**Tradeoffs:** one more internal hop (negligible vs. LLM latency); a single dependency to keep
healthy. **Effort: 1–2 weeks** for a solid v1.

### 5.2 Replace the sliding-window context with a real retrieval (RAG) layer [⭐⭐⭐] · ⏳ PENDING

**Problem:** the assistant sees only the last 10 messages (`build_chat_context(limit=10)`).
It cannot recall earlier decisions, cross-chat knowledge, or the project KG it is supposedly
building. This caps reasoning quality far below what the data supports.

**Move:** add a vector store (pgvector if you adopt Postgres, or Qdrant/LanceDB), embed
messages + temporal cards + KG nodes, and retrieve top-k relevant context per query. Because
you already produce a **structured KG**, do *hybrid* retrieval: semantic (vectors) + symbolic
(graph queries over decisions/conflicts). This is the bridge from "chat summarizer" to
"persistent project memory."

**Impact:** materially better synthesis, cross-thread recall, fewer hallucinated "facts."
**Tradeoffs:** embedding cost/latency; index freshness. **Effort: 2–4 weeks** (ingestion,
chunking, hybrid retriever, eval).

### 5.3 Redesign the "ensemble" into a real, honest multi-model system [⭐⭐⭐⭐] · ⏳ PENDING

**Problem:** the live ensemble is 3 mislabeled, Groq-dominated models, merged by one LLM with
no agreement scoring. The richer 6-model pipeline is dead code. "Confidence" is LLM
self-reported, not measured. For a *research* artifact this is a credibility problem: the
headline claim (multi-provider ensemble extraction) is not what runs.

**Move:**
- Run the genuinely diverse model set **in parallel** (asyncio/`asyncio.gather`), not a for-loop.
- Compute **inter-model agreement** per IR field (e.g., Jaccard/embedding similarity of
  extracted facts) and derive a *measured* confidence, not a self-reported one.
- Treat provider failures as *missing votes*, not as `FACT: ERROR …` injected into the merge
  (the current `_error_block` poisons synthesis — see §6.1).
- Make model names + the ensemble composition **config-driven and versioned** so experiments
  are reproducible and model deprecations don't silently change results.

**Impact:** real research credibility + a calibratable confidence signal + ~3× lower latency
via parallelism. **Effort: 1–2 weeks.**

### 5.4 Event-driven / queued orchestration [⭐⭐⭐] · ⏳ PENDING

**Problem:** synthesis runs in the request thread (§2.5); cross-service consistency is
fire-and-forget HTTP (`_call_satellite_cleanup` swallows errors); the card scheduler is a
single-process cron.

**Move:** introduce a job queue / broker (Redis + RQ/Celery for Python, BullMQ for Node, or a
single Redis Streams bus shared by both). `/ask` enqueues an extraction+synthesis job and
returns a job id; the UI streams progress. KG snapshots / delta computation / card generation
become idempotent workers. Cross-service effects (e.g., "chat deleted → purge cards") become
durable events with retries, not best-effort calls.

**Impact:** the API stays responsive under load; long jobs become observable and retryable;
schedulers become HA. **Tradeoffs:** operational complexity (a broker to run). **Effort: 2–4 weeks.**

### 5.5 Verification & self-correction layer (hallucination control) [⭐⭐⭐] · ⏳ PENDING

**Problem:** nothing checks the synthesis against the source. Extracted "facts" can be
invented; conflicts can be missed; the KG ingests whatever the LLM emits.

**Move:** add a lightweight verifier pass: (a) **grounding check** — every synthesized FACT
must be traceable to a source message/chunk (citation spans); drop or flag the ungrounded; (b)
**schema/consistency validation** of the IR before it reaches the KG (you partly do this —
`synthesis_validation_failed` exists; make it real and typed); (c) optional **self-correction
loop** — if grounding < threshold, re-prompt with the violations. This pairs naturally with
the agreement-confidence from §5.3.

**Impact:** trustworthy KG; defensible research claims; fewer downstream "garbage in" errors.
**Effort: 1–2 weeks** for grounding+validation; +1 week for the correction loop.

### 5.6 Evaluation harness + reproducibility (research-grade) [⭐⭐⭐] · ⏳ PENDING

**Problem:** there is no way to answer "is the extraction good?" or "did this prompt change
help?" Only `benchmark_signal_classifier.py` exists, for the classifier alone. Model names are
hardcoded and drift; there are no seeds, no frozen datasets, no metrics.

**Move:**
- A **golden dataset** of (chat → expected IR/cards) and (SRS PDF → expected issues/UML).
- An **offline eval runner** computing extraction precision/recall vs. gold, synthesis
  faithfulness, ambiguity-detection F1, classifier accuracy — all versioned.
- **Experiment tracking** (MLflow or Weights & Biases) capturing model id, prompt version,
  dataset hash, metrics, cost. Pin prompt versions (they live in `Backend/prompts/` — version them).
- A CI job that fails on metric regressions.

**Impact:** turns subjective "it looks good" into evidence; protects against silent prompt/model
regressions; this is the difference between a demo and a paper. **Effort: 2–4 weeks.**

### 5.7 Observability (logs, metrics, traces, cost) [⭐⭐⭐] · ⏳ PENDING

**Problem:** the only instrumentation is a `log_requests` middleware printing to stdout across
8 separately-launched terminals. You cannot answer "what failed, where, how often, how much did
it cost."

**Move:** structured JSON logging with correlation ids that propagate across services;
Prometheus metrics (latency, error rate, queue depth, tokens/$ per request); OpenTelemetry
traces spanning UI→Core→Gateway→provider; error tracking (Sentry). A Grafana board.

**Impact:** you can operate the system, debug incidents, and report cost/latency credibly.
**Effort: 1–2 weeks** (much cheaper once the platform layer + gateway exist).

### 5.8 Containerization + reproducible environments + CI/CD [⭐⭐⭐⭐] · ⏳ PENDING

**Problem:** the system only starts via a Windows-specific `.bat` that opens 8 tabs, each
assuming a pre-built venv and a local MongoDB/Supabase. There is no Dockerfile, no compose, no
CI. A new contributor (or a reviewer, or a deployment target) cannot reliably bring it up.
Python deps are pinned in **UTF-16** `requirements_*.txt` files (tooling-hostile).

**Move:** a Dockerfile per service + a single `docker-compose.yml` (services + Postgres +
Mongo + Redis + Qdrant) so `docker compose up` boots the whole stack cross-platform. A GitHub
Actions pipeline: lint → typecheck (`tsc` is already clean) → tests → build images. Re-save
requirements as UTF-8 and consider `uv`/`poetry` lockfiles.

**Impact:** reproducibility, onboarding in minutes, a path to any cloud. **Effort: 1–2 weeks.**

### 5.9 An (optional) agent/orchestration layer [⭐ (Overdoing)] · ⏳ PENDING

**Problem:** the pipeline is a fixed sequence. There is no planning, no tool use, no dynamic
routing ("this is a security question → ThreatLens; this needs a diagram → UML"). The services
are siblings that don't cooperate at reasoning time.

**Move:** introduce a thin orchestrator that, given a user request, *plans* which capabilities
to invoke (extraction, KG query, SRS analysis, UML gen, threat check), calls them as tools, and
composes the result. This is where multi-agent design genuinely helps — but only *after* §5.1
(gateway) and §5.4 (queue) exist; otherwise it amplifies the current fragility. Keep it
deterministic-first (a planned DAG) before going fully autonomous.

**Impact:** the eight features start to feel like one product; enables cross-feature reasoning.
**Tradeoffs:** complexity, cost, new failure modes. **Effort: 3–5 days (DAG orchestrator) /
3–4 weeks (planning agent with tool routing).** Rated **future** until the platform exists.

---

## 6. Hidden Weaknesses & Silent Failure Points (brutally honest)


2. ⏳ PENDING — **Silent cross-service drift.** `_call_satellite_cleanup` (`main.py:593`) and the Satellite's
   per-chat KG fetch swallow exceptions and `console.warn`. Deletions can leave orphaned cards;
   delta snapshots can be computed against partial KGs with no signal to anyone.
3. ⏳ PENDING — **Edge dedup by possibly-undefined id.** `deltaEngine.computeDiff` keys edges on `edgeId`
   (`edge.id` from the Core). If the Core ever omits edge ids, all edges collapse to a single
   `undefined` key and diffs become wrong — silently. (Flagged earlier; still latent.)
4. ⏳ PENDING — **Heuristic signal classifier gates the whole pipeline.** `classify_signal` is fuzzy
   string/word-count matching; a real BERT classifier sits unused on disk. Misclassifying a
   substantive message as "noise" silently drops it from all downstream knowledge with a canned reply.
5. ⏳ PENDING — **Self-reported confidence.** The `CONFIDENCE` IR field is whatever the LLM says. It is
   surfaced in the UI ("HIGH confidence") as if measured. That is a research-integrity hazard.
6. ⏳ PENDING — **Reproducibility decay.** Hardcoded model ids (`llama-3.3-70b-versatile`, etc.) on Groq/NVIDIA
   are deprecated on the vendors' timelines, not yours. The day Groq retires a model, results
   change with no code change and no alert. There are no pinned snapshots, no seeds, no eval to catch it.
7. ⏳ PENDING — **`temperature=0.0` ≠ deterministic.** The code treats temp-0 extraction as "compiler-grade
   deterministic," but hosted LLMs are not bit-reproducible. Claims of determinism are overstated.
8. ⏳ PENDING — **`Math.random()` ids in the UI.** *(Still live: `CardsPage.tsx:104`.)* `CardsPage` falls back to `Math.random().toString()` for
   card ids when the backend id is missing — collisions and unstable React keys are possible.
9. ⏳ PENDING — **localStorage tokens.** *(Still live: `Login.tsx:69`.)* `Login.tsx:68` stores the JWT in `localStorage` → exfiltratable by any
   XSS. Combined with the global `window.onerror` overlay history, the frontend is XSS-sensitive.
10. ⏳ DEFER — **SSRF surface in ThreatLens.** *(ThreatLens not yet wired into the system; revisit when the service is linked.)* `threat_intel.py` resolves/fetches arbitrary user-supplied
    URLs server-side. Without allow-listing/timeouts/size-caps this is an SSRF + resource-exhaustion vector.
11. ⏳ DEFER — **CORS `*` on ThreatLens** *(still `allow_origins=["*"]` at `app.py:40`; ThreatLens not yet linked — revisit on integration.)* (`app.py`) while others allow-list — inconsistent posture.


---

## 7. MCP (Model Context Protocol) Opportunities · ⏳ ALL PENDING (none started; future work)

**Honest framing first:** ClarityStack is today a REST micro-service *application*, not an
agent runtime. MCP adds the most value in two situations: (a) you build the agent/orchestration
layer (§5.9) and want clean, reusable tool interfaces; and (b) you want **external** MCP-capable
agents (Claude Desktop/Code, IDEs) to *consume ClarityStack's knowledge* — which is a genuinely
novel distribution channel for a knowledge system. Most MCP items below are therefore
"good-to-have/future," with two standouts.

For each: **why · problem solved · impact · difficulty · risks · effort · priority.**

### 7.1 Knowledge-Graph MCP server (expose the project KG/cards as tools) [⭐⭐⭐⭐] — standout
- **Why:** you already build a structured KG + temporal cards. Wrapping them as MCP tools
  (`query_decisions`, `get_conflicts`, `card_history`, `project_timeline`) lets *any* MCP client
  (Claude, Cursor, internal agents) reason over ClarityStack knowledge.
- **Problem solved:** today that knowledge is trapped behind bespoke REST + a React UI. MCP makes
  it a first-class, composable capability and a differentiator.
- **Impact:** high — turns ClarityStack from an app into a knowledge *provider*; also the cleanest
  tool surface for your own future agent (§5.9).
- **Difficulty:** medium. **Risks:** auth/scoping per project must be enforced in the MCP layer
  (don't reintroduce §2.2). **Effort: 3–5 days** on top of a stable KG API. **Priority: good-to-have → must-have once the agent layer lands.**

### 7.2 Vector-DB / Retrieval MCP server [⭐⭐⭐] — standout (pairs with §5.2)
- **Why:** once RAG exists, exposing `search_project(query)` as an MCP tool standardizes retrieval
  for both your orchestrator and external agents.
- **Problem solved:** uniform semantic+graph retrieval interface instead of bespoke endpoints.
- **Impact:** high (it *is* the context layer). **Difficulty:** low-medium if built atop §5.2.
- **Risks:** stale indexes; per-tenant isolation. **Effort: 2–3 days** after §5.2. **Priority: must-have if you adopt RAG + an agent.**

### 7.3 Database / Postgres MCP (read-only analytics) [⭐⭐ (Overdoing)]
- **Why/impact:** lets an agent answer operational/product questions ("how many unresolved
  conflicts across projects?"). **Difficulty:** low (off-the-shelf Postgres MCP). **Risks:**
  must be read-only + row-scoped or it's a data-leak. **Effort: 1 day.** **Priority: good-to-have.**

### 7.4 Filesystem MCP (SRS/UML document corpus) [⭐⭐ (Overdoing)]
- **Why:** SRS/UML already operate on a document corpus on disk. **Impact:** modest (you already
  have ingestion pipelines). **Difficulty:** trivial (reference server). **Risks:** path-traversal
  if unscoped. **Effort: 2–4 hours.** **Priority: future.**

### 7.5 Observability MCP [⭐ (Overdoing)]
- **Why:** let an agent/operator query metrics/logs/traces conversationally. **Impact:** medium for
  ops once §5.7 exists; otherwise nothing to query. **Effort: 1–2 days.** **Priority: future (after §5.7).**

### 7.6 Evaluation MCP [⭐ (Overdoing)]
- **Why:** trigger/inspect eval runs (from §5.6) as tools. **Impact:** medium for the research
  workflow. **Effort: 1–2 days** after §5.6. **Priority: future.**

### 7.7 GitHub MCP [⭐ (Overdoing)]
- **Why:** if ClarityStack ever links project knowledge to code/issues. **Impact:** speculative
  today. **Effort: ~0 (reference server) + integration.** **Priority: future.**

### 7.8 Browser MCP [⭐ (Overdoing)]
- **Why:** ThreatLens already fetches URLs; a sandboxed browser MCP could standardize that and add
  rendered-page analysis. **Risks:** SSRF (see §6.10) — must be sandboxed/allow-listed. **Effort:
  3–5 days.** **Priority: future, and only with strict sandboxing.**

**MCP verdict:** Build **7.1 (KG MCP)** and **7.2 (Retrieval MCP)** *as part of* the agent +
RAG work — they are the high-value, on-strategy ones. Treat the rest as opportunistic. Do **not**
adopt MCP as a goal in itself before the platform layer and authZ (§2.2) exist; an MCP server
over today's unauthenticated endpoints would widen the existing data-exposure hole.

---

## 8. API Dependency Reduction (critical)

### 8.1 Current hard dependencies — risk register

| Dependency | Why it exists | Failure mode | Cost risk | Rate-limit risk | Privacy risk | Lock-in |
|------------|---------------|--------------|-----------|-----------------|--------------|---------|
| **Groq** | Core extraction + synthesis | **Core won't boot** if key missing (`providers.py:29`); model deprecations change output | Per-token; uncapped (no budget) | High (free tier) | Project chat content leaves your infra | Medium (OAI-compatible → portable) |
| **NVIDIA NIM** | Core extraction, UML gen | hard-fail at import; browser key leak (§2.3) | Per-token | Medium | Same | Medium |
| **HuggingFace router** | Satellite card generation | cards silently fail (caught), feature degrades | Per-token | Medium | Card/source content leaves infra | Low-medium |
| **Supabase** | Editor auth + realtime + DB | editor fully down; a *third* identity system | Tiered/egress | Medium | User identities + docs in a 3rd-party DB | **High** (auth + realtime + DB coupled) |
| **Cloud VLM** | SRS/UML PDF parsing | parsing fails → no SRS/UML output | Per-page/token | Medium | Uploaded SRS PDFs leave infra | Medium |
| **External threat feeds** | ThreatLens reputation | degraded threat scores | Low/free | Low | URLs sent out | Low |

**Cross-cutting:** there is **no budget cap, no caching, no fallback** for any of these. A single
vendor outage or quota exhaustion takes down core functionality, and there is no cost telemetry to
even notice runaway spend.

### 8.2 The good news: precedent already exists

**ThreatLens is fully local** — a PyTorch GAT/GNN fusion model (`ThreatLens_Service/model.py`,
`fusion_model.py`) with an MLP fallback when `torch_geometric` is absent. This proves the team can
ship local inference. Generalize that posture.

### 8.3 Alternatives & migration paths

**(a) Local / self-hosted inference for extraction.** The extraction task (structured IR at
`temperature=0`) is well within reach of strong open models served locally via **vLLM**,
**Ollama**, or **llama.cpp** (e.g., Llama-3.1-8B/70B-Instruct, Qwen2.5, Mistral — quantized for a
single GPU). Because all current providers are OpenAI-compatible, the LLM Gateway (§5.1) can route
to a local vLLM endpoint with **zero call-site changes**. An `ollama_provider.py` stub already
exists — wire it in behind the gateway.

**(b) Local embeddings.** For RAG (§5.2), use `sentence-transformers`/`bge`/`e5` locally — embeddings
should never be a paid API dependency.

**(c) Local document parsing.** Replace/augment the cloud VLM with local OCR+layout
(`docling`, `unstructured`, `marker`, PaddleOCR) for the common case; reserve a cloud VLM only for
hard scans. Keeps SRS/UML working offline and private.

**(d) Self-host the collaboration backbone.** Supabase is replaceable by self-hosted Postgres +
a y-websocket/Hocuspocus CRDT server. This is the heaviest lift (it's auth + realtime + DB) and
should be staged.

**(e) Redundancy & graceful degradation (do this regardless of full migration):**
- Multi-provider fallback chains in the gateway (Groq → NVIDIA → local).
- Cache temp-0 extraction results.
- Never hard-fail at import; degrade to "local-only" or "read-only" with a clear status.
- Per-tenant budgets + rate limits so one user can't exhaust quota for all.

### 8.4 Tradeoffs

| Axis | Cloud APIs (today) | Local-first |
|------|--------------------|-------------|
| Accuracy | Highest (frontier models) | High for extraction; slightly lower for hardest reasoning |
| Latency | Network-bound, variable | Predictable; depends on local GPU |
| Cost | Pay-per-token, unbounded | Fixed hardware/electricity; zero marginal |
| Privacy | Data leaves infra | Stays in infra (often the decisive factor for SRS/IP docs) |
| Ops complexity | Low (someone else's problem) | Higher (you run the GPU + server) |
| Reproducibility | Poor (models deprecate) | Strong (you pin the weights) |

### 8.5 Recommended roadmap

- **Short-term (1–2 weeks):** LLM Gateway with multi-provider fallback + caching + budgets;
  remove the import-time hard-fail; **fix the browser key leak (§2.3)**. *Outcome: no single
  vendor can take you down; spend is visible and capped.*
- **Medium-term (3–6 weeks):** stand up a **local vLLM/Ollama** extraction model behind the
  gateway and route the bulk of extraction to it (cloud only as fallback/for synthesis); local
  embeddings for RAG; local OCR for the common SRS/UML path. *Outcome: ~80–90% of LLM/parse calls
  become local, private, and free at the margin.*
- **Long-term (2–3 months):** evaluate self-hosting collaboration (Postgres + CRDT) to drop
  Supabase; pin local model snapshots for reproducible research; optionally fine-tune a small
  local extractor on your golden dataset (§5.6) to match frontier quality at a fraction of the cost.

**Reality check:** moving *everything* off cloud is realistic for extraction, embeddings, and most
document parsing. Synthesis quality and the hardest reasoning may justify keeping a cloud frontier
model as an *option* behind the gateway — local-first, cloud-optional, never cloud-required.

---

## 9. Benchmark: "What separates this from a mature system?"

| Dimension | Mature research/production system | ClarityStack today | Gap |
|-----------|-----------------------------------|--------------------|-----|
| Identity/authZ | Central auth, object-level permissions, rotated secrets | Hardcoded secret, missing authZ on writes/deletes | **Severe** |
| Data layer | Managed Postgres, migrations, backups, one source of truth | SQLite + Mongo + Supabase, no cross-store consistency | **Severe** |
| Model access | Gateway: routing, fallback, cache, budget, telemetry | 3 scattered clients, hardcoded models, browser key | **Severe** |
| Concurrency | Async + queue + workers, horizontal scale | Sync in-request fan-out, single-node SQLite | **Severe** |
| Retrieval | Hybrid RAG over full corpus | 10-message window | **Large** |
| Evaluation | Golden sets, CI metric gates, experiment tracking | One classifier benchmark script | **Large** |
| Reproducibility | Pinned models/seeds/prompts, lockfiles | Hardcoded vendor models, no seeds, UTF-16 reqs | **Large** |
| Reliability | Retries, circuit breakers, graceful degradation | Hard-fail at import, error-as-fact, swallowed errors | **Large** |
| Observability | Logs+metrics+traces+cost, alerting | stdout across 8 terminals | **Large** |
| Delivery | Docker/compose, CI/CD, IaC | Windows `.bat`, manual venvs, no CI | **Large** |
| Confidence/verification | Measured confidence, grounding/citations | Self-reported confidence, no grounding | **Medium-large** |
| Frontend robustness | Typed contracts, error boundaries | Improving (typecheck now clean), tokens in localStorage | **Medium** |

The honest one-line verdict: **ClarityStack has the *features* of a serious system and the
*foundations* of a hackathon project.** The features are the hard part and they exist — which is
exactly why investing in the foundations now has outsized payoff.

---

## 10. Overengineering vs. Underengineering

- **Underengineered (most of the system):** auth, data layer, model access, concurrency,
  evaluation, ops — all listed above.
- **Overengineered / premature:** eight separate services + an iframe-embedded micro-frontend is a
  lot of *distribution* for a pre-product system; it multiplies CORS lists, datastores, and
  port-coupling without the platform layer that makes microservices pay off. A modular monolith (or
  3–4 services behind one gateway) would be cheaper to operate at this stage. The "6-model pipeline"
  in `providers.py` is built but unused — effort spent on a path that doesn't run.

---

## 11. Highest-ROI Prioritization

> Assumes a competent engineering student / research engineer. Estimates are realistic, not optimistic.

### Tier 0 — Non-negotiable before any external exposure (hours–days) · ✅ cleared (§2.1 ✅, §2.2 ✅, §2.3 🟡)

| Improvement | Complexity | Est. time | Dependencies | Risk | Expected impact |
|-------------|-----------|-----------|--------------|------|-----------------|
| 🟡 Stop shipping vendor key to browser (§2.3) | Low | 2–4 h | server `/api/llm` proxy (exists) | Low | Closes key leak + abuse — *NVIDIA done; Groq/Gemini still in `Dashboard.jsx`* |

### Tier 1 — Major impact, low–medium effort · ⏳ pending except badged rows

| Improvement | Complexity | Est. time | Dependencies | Risk | Expected impact |
|-------------|-----------|-----------|--------------|------|-----------------|
| LLM Gateway (routing + cache + retry + fallback + budget) (§5.1) | Medium-High | 1–2 wk | — | Medium | Resilience, cost control, kills dup latency |
| Parallelize + de-poison the ensemble; config-drive models (§5.3) | Medium | 1–2 wk | gateway helps | Low-Med | ~3× latency cut, research credibility |
| 🟡 Postgres migration (retire SQLite) (§2.4) | Medium | 3–5 d | Alembic (exists) | Medium | Concurrency + horizontal scale — *integrity hardened (WAL/FK/single-engine); still SQLite* |
| Docker Compose + CI (typecheck/lint/test) (§5.8) | Medium | 1–2 wk | — | Low | Reproducibility, onboarding, deploy path |
| Structured logging + cost/latency metrics (§5.7) | Medium | 1–2 wk | gateway | Low | Operability, cost visibility |
| Grounding + IR schema validation (§5.5 part 1) | Medium | 1–2 wk | — | Low-Med | Trustworthy KG, fewer hallucinations |

### Tier 2 — Game-changing, high effort · ⏳ all pending

| Improvement | Complexity | Est. time | Dependencies | Risk | Expected impact |
|-------------|-----------|-----------|--------------|------|-----------------|
| Hybrid RAG / persistent memory (§5.2) | High | 2–4 wk | Postgres/pgvector or Qdrant | Medium | Big reasoning-quality jump |
| Job queue / event-driven orchestration (§5.4) | High | 2–4 wk | broker (Redis) | Medium | Responsive API, HA schedulers, durable effects |
| Evaluation harness + experiment tracking (§5.6) | High | 2–4 wk | golden datasets | Medium | Research-grade, regression-proof |
| Local-first inference behind gateway (§8.3a–c) | High | 3–6 wk | gateway, GPU | Medium | Privacy, cost→~0, reproducibility |
| KG MCP + Retrieval MCP servers (§7.1–7.2) | Medium | 1 wk (after RAG/KG API) | RAG + stable KG API + authZ | Medium | New distribution channel + agent-ready tools |

### Tier 3 — Nice-to-have / later · ⏳ all pending

| Improvement | Complexity | Est. time | Dependencies | Risk | Expected impact |
|-------------|-----------|-----------|--------------|------|-----------------|
| Planning/agent orchestration layer (§5.9) | High | 3–4 wk | gateway + queue + MCP tools | High | Cross-feature reasoning, "one product" feel |
| Self-correction loop (§5.5 part 2) | Medium | 1 wk | grounding | Medium | Higher-fidelity synthesis |
| Replace heuristic signal classifier with the on-disk BERT model | Low-Med | 3–5 d | model wiring | Low | Better noise filtering |
| Self-host collaboration (drop Supabase) (§8.3d) | High | 3–6 wk | Postgres + CRDT server | High | Removes the heaviest lock-in |
| Dead-code purge + monolith→routers split + UTF-8 reqs | Low-Med | 3–5 d | — | Low | Maintainability, honesty |

---

## 12. Recommended Sequencing (the narrative)

1. **Week 0 (Tier 0):** secret, browser key, authZ. Now it is safe to show anyone.
2. **Weeks 1–4 (Tier 1):** Gateway → Postgres → parallel/honest ensemble → Docker+CI → observability.
   Now it is *operable, resilient, reproducible, and cost-visible.*
3. **Weeks 5–10 (Tier 2):** RAG/memory → queue → eval harness → local-first inference + the two MCP servers.
   Now it is *scalable, research-grade, private, and composable.*
4. **Weeks 10+ (Tier 3):** agent orchestration, self-correction, Supabase self-host, cleanup.
   Now it is *a platform.*

---

## 13. Self-Critique — what I might have gotten wrong or missed

In the spirit of challenging my own conclusions:

- **VLM provider not fully confirmed.** I could not pin the exact vendor/endpoint for the SRS/UML
  `stage*_vlm.py` pipeline from a quick read (the client config wasn't where I looked). The
  API-reduction analysis treats it as a generic cloud VLM; verify the actual provider and quota
  before planning its local replacement.
- **I did not measure quality, only structure.** Every claim about reasoning/synthesis quality is
  architectural inference, not measured output. The eval harness (§5.6) is precisely what would let
  anyone (including me) make defensible quality claims — its absence is why I can't.
- **Auth coverage is sampled, not exhaustive.** I confirmed missing `get_current_user` on several
  high-impact routes (`create_message`, `ask_multi_model`, `delete_chat`, `delete_project`). A
  full route-by-route authZ matrix should be produced before sign-off; some routes I didn't open
  may be fine, others may be worse.
- **MongoDB/Supabase internals under-inspected.** I focused on the Core's SQLite and the LLM path.
  The Mongo schema/indexes and the Supabase RLS policies deserve their own pass; RLS in particular
  could either mitigate or worsen the authZ story.
- **The microservice critique is a judgment call.** A team optimizing for a viva/portfolio demo
  may rationally prefer eight visible services. My "modular monolith would be cheaper" claim is an
  operational-cost argument, not an absolute; if the goal is *demonstrating breadth*, the current
  split has non-technical value.
- **Effort estimates assume the platform layer lands first.** Many Tier-1/2 estimates are cheaper
  *because* the gateway/observability exist. If those slip, downstream items get more expensive —
  the sequencing in §12 is load-bearing, not cosmetic.
- **Possible false economy in "go local."** Frontier-model synthesis quality may be hard to match
  locally without fine-tuning; I flagged keeping a cloud option, but the local-first ROI depends on
  GPU availability the team may not have. Validate with a small head-to-head before committing.

---

### Final word

The fastest way to make ClarityStack *materially* better is not a new feature — it's the
**platform layer + LLM Gateway + authZ + Postgres** quartet. Those four turn a fragile constellation
of demos into a system you can secure, scale, measure, and reason about. Everything else in this
report is leverage *on top of* that foundation.
