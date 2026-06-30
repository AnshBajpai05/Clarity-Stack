# ClarityStack

> **Turn unstructured team conversations into a versioned, traceable source of truth.**
> A multi-service AI platform that extracts decisions, risks, and requirements from chats — then structures them as version-chained **Temporal Cards** and a semantic **Knowledge Graph**, with an *honest* multi-model engine that measures where the models actually agree.

<p align="center">
  <em>Semester-6 engineering project · multi-service · Python + Node + React · audited &amp; hardened</em>
</p>

---

## Table of Contents
- [The problem](#the-problem)
- [What ClarityStack does](#what-claritystack-does)
- [Flagship features](#flagship-features)
- [Architecture](#architecture)
- [The AI pipeline](#the-ai-pipeline-one-ask-call)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Running with Docker](#running-with-docker)
- [Testing](#testing)
- [Security posture](#security-posture)
- [Project status & roadmap](#project-status--roadmap)
- [Documentation map](#documentation-map)

---

## The problem

Engineering knowledge **decays**. Critical decisions are buried in chat threads, architects have no single source of truth for *why* a choice was made, and a new conversation can silently contradict a past decision with nothing to flag it. Requirements live in massive PDFs full of hidden ambiguity.

ClarityStack is a **semantic sieve**: it doesn't just store messages — it decomposes them into typed knowledge units, measures model agreement honestly, grounds every claim back to its source, and tracks how the project's knowledge evolves over time.

## What ClarityStack does

1. **Temporal Cards** — version-chained knowledge snapshots per category (decision / risk / architecture / …), scoped per chat, with a full revision history.
2. **Knowledge Graph** — a semantic graph of typed nodes (FACT, DECISION, CONFLICT, OPTION, …) and *reasoning* edges (SUPPORTS, CONTRADICTS, DEPENDS_ON, …), built from synthesized chat conversations.
3. **Honest multi-model engine** — an ensemble of genuinely different models whose **measured lexical agreement** is surfaced as confidence (never the model's own self-report), plus a Disagreement Spotlight and a Devil's-Advocate view.
4. **Collaborative editor** — a real-time, section-based multi-user workspace with atomic file persistence.
5. **SRS Intelligence** — a PDF-ingestion NLP pipeline that extracts actors, user stories, and ambiguities from Software Requirements Specs.
6. **UML service** — diagram generation and semantic chunking.

## Flagship features

| Feature | What it gives you |
|---|---|
| **Measured confidence (§10.3)** | Confidence = inter-model agreement computed by a deterministic lexical metric — not the LLM's self-reported "I'm certain." |
| **Disagreement Spotlight (§17.1)** | Surfaces the claims the ensemble did *not* unanimously extract — turning hidden model divergence into a first-class brainstorming signal. |
| **Devil's Advocate + Ask-Anyway (§17.2)** | A counter-argument view, and an override that bypasses the noise gate so a real question is never silently swallowed. |
| **Evolution Timeline (§17.3)** | Content-hash deltas track *knowledge* change over time (not churned UUIDs). |
| **"Why this decision?" trace (§17.4)** | Each decision lists only the evidence/conflicts it is genuinely linked to, with the shared terms that justified each edge. |
| **Decision Readiness (§17.5)** | Per-decision "is this ready to act on, and if not, what's the cheapest path to resolve it?" |
| **Grounding (§10.6)** | Every synthesized bullet is cited back to the source messages that support it; uncited bullets are flagged as a hallucination signal. |
| **Commit to KG (§16.4)** | Card-derived knowledge is ingested into the Core Knowledge Graph and rendered in the live graph view. |

## Architecture

ClarityStack is a **microservices + polyglot-persistence** system. Each service owns its runtime and datastore; the React SPA routes to all of them.

| # | Service | Runtime | Port | Datastore | Responsibility |
|---|---|---|---|---|---|
| 1 | **Core API** (`Backend/`) | Python · FastAPI | 8000 | SQLite (dev) / **Postgres** (prod) | Auth, projects, chats, messages, synthesis, Knowledge Graph, reasoning |
| 2 | **SRS Service** | Python · FastAPI | 8001 | Filesystem (JSON) | PDF ingestion + multi-stage NLP pipeline |
| 3 | **ThreatLens** | Python · FastAPI | 8002 | ML model | Phishing detection *(out of current scope)* |
| 4 | **Satellite** | Node · Express | 8003 | MongoDB | Temporal Cards, KG snapshots, deltas, mailer |
| 5 | **Editor Service** | Node · Socket.IO | 8004 | File-based (atomic JSON) | Real-time collaborative editor |
| 6 | **UML API** | Python · FastAPI | 8005 | — | UML generation + semantic chunking |
| 7 | **Frontend** (`Web/Frontend/`) | React · Vite | 8006 | — | Full UI; routes to every service |
| 8 | **UML UI** | React · Vite | 8007 | — | UML visualizer |

**Persistence is the single source of truth via Alembic** — the Core schema is owned by Alembic migrations (no `create_all` shadowing), and the **Postgres path is validated end-to-end** (clean migrate cycle + zero schema drift + ORM round-trip). SQLite stays the zero-config dev default; production opts in with `DATABASE_URL` + `RUN_MIGRATIONS_ON_STARTUP=0`.

```
                         ┌──────────────────────────┐
   Browser  ───────────► │  Frontend (React/Vite)   │  :8006
                         └─────────────┬────────────┘
            ┌──────────────┬───────────┼───────────┬──────────────┐
            ▼              ▼           ▼            ▼              ▼
      Core API:8000   Satellite   Editor:8004   SRS:8001     UML:8005/8007
      FastAPI         :8003       Socket.IO     FastAPI      FastAPI+Vite
      SQLite/PG       MongoDB     files         files
        │   ▲
        │   │ honest ensemble (Groq + NVIDIA)
        ▼   │
   knowledge_nodes / knowledge_edges / synthesis  (Postgres-ready KG)
```

## The AI pipeline (one `/ask` call)

1. **Signal gate** — a DistilBERT classifier scores the message; noise is filtered (with an *Ask-Anyway* override).
2. **Context assembly** — recent relevant history is injected as a context block.
3. **Honest ensemble (concurrent)** — the prompt fans out to a genuinely heterogeneous set of models:
   - `groq:llama-3.3-70b-versatile`
   - `groq:openai/gpt-oss-20b`  ← non-Llama member, decorrelates the ensemble (§16.1)
   - `nvidia:meta/llama-3.1-70b-instruct`

   Each returns an IR block, stored with its **real model label** (no fictional providers).
4. **Measured agreement (§10.3)** — a deterministic Jaccard-cluster metric computes where the models actually agree; that becomes the surfaced confidence.
5. **Synthesis** — `groq:llama-3.3-70b-versatile` merges the blocks into a canonical IR, structurally validated.
6. **Grounding (§10.6)** — each synthesized bullet is cited back to the source messages.
7. **Knowledge Graph** — typed nodes + *semantic* edges are written to the Core KG (`knowledge_nodes` / `knowledge_edges`).
8. **Temporal Card** — Satellite versions a card per category (scoped per chat); "Commit to KG" lands card knowledge back in the Core graph.

> The pipeline runs the provider calls **concurrently** (`asyncio.gather` + `to_thread`) so the event loop is never blocked on a model.

## Tech stack

**Backend / AI** — Python, FastAPI, SQLAlchemy + Alembic, Pydantic, psycopg2 (Postgres), Groq & NVIDIA NIM LLM APIs, DistilBERT (signal classifier), Prometheus metrics, Sentry tracing.
**Satellite / Editor** — Node.js, Express, Socket.IO, Mongoose (MongoDB), node-cron.
**Frontend** — React 18, TypeScript, Vite, TanStack Query, Zustand, React Router v6, Tailwind CSS, Radix UI, Framer Motion, `react-force-graph-2d`, Zod, native `fetch` wrapper (httpOnly-cookie + CSRF + silent refresh).
**Infra** — per-service Dockerfiles + whole-stack `docker-compose`, GitHub Actions CI (lint + tests + coverage gate), Prometheus/Grafana observability stack.

## Repository layout

```
Backend/                Core FastAPI service (auth, KG, synthesis, reasoning)
Satellite/              Node/Express — Temporal Cards, KG snapshots, deltas
Editor_Service/         Node/Socket.IO — real-time collaborative editor
SRS_Service/            FastAPI — SRS PDF → NLP pipeline
UML_Clarity_Service/    FastAPI backend + React UML UI
ThreatLens_Service/     FastAPI — phishing detection (out of scope)
Web/Frontend/           React + Vite SPA (the main UI)
observability/          Prometheus / Grafana config
docker-compose.yml      Whole-stack compose (+ .postgres / .observability variants)
start_project.bat       Launches all services in Windows Terminal tabs
SETUP_GUIDE.md          Detailed per-service setup
```

## Getting started

### Prerequisites
- **Python 3.11+**, **Node.js 20+**, and (optional) **Docker**
- API keys: **`GROQ_API_KEY`**, **`NVIDIA_API_KEY`**, and **`MONGO_URI`** (for Satellite)
- A `JWT_SECRET` (the services **refuse to boot** without it)

### 1. Configure environment
Each service reads its own `.env` (all gitignored). At minimum set, in the relevant service:

```env
# Backend/.env
JWT_SECRET=<a fresh 256-bit secret>
GROQ_API_KEY=<...>
NVIDIA_API_KEY=<...>
# DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/claritystack   # prod (optional)

# Satellite/.env
JWT_SECRET=<same secret as Backend>
MONGO_URI=<your MongoDB connection string>
```

> The same `JWT_SECRET` must be set identically in **Backend**, **Satellite**, and **Editor** `.env` files.

### 2. Install dependencies (per service)
```bash
# Python services (Backend, SRS_Service, UML_Clarity_Service/backend, ThreatLens_Service)
python -m venv venv && venv/Scripts/pip install -r requirements.txt   # Windows
# python3 -m venv venv && venv/bin/pip install -r requirements.txt     # macOS/Linux

# Node services (Satellite, Editor_Service)
npm install

# Frontends (Web/Frontend, UML_Clarity_Service)
npm install
```

### 3. Run everything (Windows)
```bat
start_project.bat
```
Opens one Windows Terminal window with a tab per service (8000–8007) plus a KILL tab.
Open the app at **http://localhost:8006**.

To launch a single service manually, e.g. the Core API:
```bash
cd Backend && venv/Scripts/python -m uvicorn main:app --reload --port 8000
```

See **[SETUP_GUIDE.md](SETUP_GUIDE.md)** for full per-service details and the Postgres migration steps.

## Running with Docker

```bash
cp .env.docker.example .env.docker        # fill in keys
docker compose up --build                 # whole stack
docker compose -f docker-compose.postgres.yml up -d        # Postgres only (port 5433)
docker compose -f docker-compose.observability.yml up -d   # Prometheus + Grafana
```

> The Backend/SRS images pull large ML wheels (torch) — the first build is heavy.

## Testing

| Suite | How | Count |
|---|---|---|
| Backend (pytest) | `cd Backend && PYTHONPATH=. venv/Scripts/python -m pytest` | 110 |
| Satellite (node:test) | `cd Satellite && node --test` | 20 |
| Frontend (vitest) | `cd Web/Frontend && npm test -- --run` | 20 |
| Frontend types | `cd Web/Frontend && npm run typecheck` | — |

CI (GitHub Actions) runs lint + backend tests + a coverage gate (~79%) + frontend typecheck/test + a compose-validate job.

## Security posture

This project was independently audited and hardened (see [existing_issues.md](existing_issues.md) / [issue_fixed.md](issue_fixed.md)):

- **AuthN** — `JWT_SECRET` enforced at boot across all services; **httpOnly** access/refresh cookies + **double-submit CSRF** + refresh-token rotation; no JWTs in `localStorage`.
- **AuthZ / tenancy** — object-level authorization on every project/chat/card route (`get_chat_or_403`, Satellite `requireProjectAccess`/`requireCardAccess`); no cross-tenant IDOR.
- **No browser-bundled secrets**, env-driven service URLs, per-endpoint rate limiting, and a global React error boundary.
- *Out of scope this cycle:* the ThreatLens service (§1.4 SSRF, §4.1) is intentionally deferred.

## Project status & roadmap

**Done:** honest parallel ensemble, measured confidence, semantic KG + reasoning trace, grounding, Temporal Cards (Core KG ingestion, per-chat lineage), observability (logs/metrics/traces), containerization + CI, eval harness, **Postgres path validated**, and the full §15 UI-honesty cleanup (no mocks, no dead controls).

**Next (roadmap):**
- **§10.8** Hybrid RAG / persistent memory (pgvector) — now unblocked by the Postgres work
- **§10.9** Job queue / event-driven orchestration
- **§6.1** Core `main.py` module split
- Intra-chat semantic card lineage; ThreatLens un-deferral

## Documentation map

| Doc | What's in it |
|---|---|
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Full per-service setup + Postgres migration |
| [Architecture_Report.md](Architecture_Report.md) | Architecture deep-dive |
| [existing_issues.md](existing_issues.md) | Audit findings + current status |
| [issue_fixed.md](issue_fixed.md) | Running remediation log (sections A–J) |
| [VIVA_PREP_PART1–4.md](VIVA_PREP_PART1.md) | Exam/viva preparation (overview → backend → engine → ops) |
| [auth_hardening_walkthrough.md](auth_hardening_walkthrough.md) | Cookie/CSRF/refresh auth walkthrough |

---

<p align="center"><em>ClarityStack — a living, traceable source of truth for engineering decisions.</em></p>
