# ClarityStack
## Architectural & Engineering Audit

**Version:** 1.0
**Date:** May 10, 2026

---

## 2. Executive Summary

ClarityStack is an advanced, multi-service intelligence platform designed to transform fragmented conversational knowledge into structured, graph-based organizational intelligence. By leveraging a multi-model AI synthesis pipeline, it ingests raw chat and documentation data, decomposes it into semantic components, and constructs an evolving Knowledge Graph alongside a versioned Temporal Card system.

**Core Architecture Style:** Microservices-oriented, hybrid request/event-driven architecture.
**Main Technologies:** React (Frontend), FastAPI & Express.js (Backends), SQLite & MongoDB (Storage), Llama 3.1 70B via NVIDIA/Groq (AI Inference).
**Key Engineering Strengths:** Modular AI pipelines, robust conflict detection algorithms, strict schema enforcement, and a resilient, versioned state management system that preserves the complete history of architectural decisions and project risks.

---

## 3. System Vision & Purpose

**Problem:** Modern engineering teams generate massive amounts of unstructured data across chats, documents, and meetings. Critical decisions, risks, and assumptions are easily lost in the noise, leading to misaligned architecture and repeated discussions.
**Purpose:** ClarityStack exists to autonomously curate this unstructured noise into a definitive, queryable source of truth.
**Core Engineering Idea:** Use high-parameter LLMs (Llama 3.1 70B) not just as chatbots, but as *semantic decomposition engines*—breaking down human conversation into discrete nodes and edges, and chaining them together into temporal, evolving documents.

---

## 4. High-Level Architecture

ClarityStack is built on a distributed microservices model separating the core state management from heavy AI inference tasks.

### 4.1 Architecture Style
- **Microservices:** Separates Core CRUD operations (FastAPI) from AI orchestration (Node.js/Express Satellite).
- **Hybrid Flow:** Request-driven for UI interactions, async/scheduled for auto-generation pipelines (e.g., 6-hour Temporal Card generation cron jobs).

### 4.2 Core Components

| Component | Technology | Responsibility |
| --------- | ---------- | -------------- |
| **Web Frontend** | React, TypeScript, Vite | Client UI, real-time workspace, data visualization. |
| **Core API** | FastAPI, Python | Primary state management, user auth, chat persistence. |
| **Satellite Service** | Express.js, Node.js | AI orchestration, Knowledge Graph sync, Temporal Card generation. |
| **Editor / UML Services** | Node.js, JointJS | Real-time collaborative editing and diagram generation. |
| **SRS Service** | Python | Document ingestion, chunking, and VLM-based analysis. |

---

## 5. Technology Stack

### 5.1 Frontend Stack

| Technology | Purpose |
| ---------- | ----------- |
| React 19 | UI component architecture and reactivity. |
| TypeScript | Strict type safety across client-server boundaries. |
| Tailwind CSS | Utility-first styling for complex, responsive glass-morphic UI. |
| Vite | High-performance bundling and HMR. |

### 5.2 Backend Stack

| Technology | Purpose |
| ---------- | -------- |
| FastAPI | High-concurrency REST API, async route handling (Core). |
| Express.js | Flexible routing for AI pipeline orchestration (Satellite). |
| SQLAlchemy | Relational ORM mapping for core entities. |
| SQLite | Lightweight, portable relational storage (Core). |
| MongoDB | Document storage for evolving Knowledge Graphs and Cards. |

### 5.3 AI / ML Stack

| Tool | Role |
| ----------- | --------------- |
| NVIDIA API / Groq | Primary LLM inference (Llama 3.1 70B) for high-speed synthesis. |
| HuggingFace | Fallback provider for semantic extraction and inference failover. |

---

## 6. Directory & Module Structure

| Directory | Purpose | Important Files |
| --------- | ------- | --------------- |
| `/Web/Frontend` | Client application | `TemporalCardsPage.tsx`, `api.ts`, `http.ts` |
| `/Backend` | Core FastAPI application | `main.py`, `models.py`, `schemas.py` |
| `/Satellite` | AI Orchestration Service | `server.js`, `cardChainer.js`, `modelRouter.js` |
| `/Satellite/services` | AI Pipeline logic | `cardDecomposer.js`, `cardSynthesizer.js`, `cardWriter.js` |
| `/SRS_Service` | Document ingestion pipeline | `api.py`, `run_corpus_processor.py` |

---

## 7. Backend Architecture

### 7.1 Request Lifecycle (Temporal Card Generation)
1. **Trigger:** User clicks "Generate" or 6-hour cron scheduler fires.
2. **Context Assembly:** Satellite fetches recent chat history from Core API.
3. **Decomposition:** `cardDecomposer.js` uses Llama 3.1 70B to split the message block into discrete semantic fragments.
4. **Synthesis:** `cardSynthesizer.js` pulls the *previous* card version, merges it with the new fragment, and detects conflicts.
5. **Persistence:** `cardWriter.js` commits the new version to MongoDB, archiving the old version as `superseded`.
6. **KG Sync:** If confidence > 0.88, `applyKGDiff` automatically flushes changes to the Knowledge Graph.

### 7.2 Core Services (Satellite)

| Service | Responsibility |
| ------- | -------------- |
| `ModelRouter` | Manages LLM API failover (NVIDIA -> HF -> Offline Regex). |
| `CardDecomposer` | Enforces strict taxonomy categorization (Action, Decision, Risk, etc.). |
| `CardSynthesizer` | Merges fragmented data with historical context to produce temporal updates. |
| `CardWriter` | Manages the version chain lifecycle (Active, Superseded, Stale). |

### 7.3 Database Models

| Model | Purpose | Relationships |
| ----- | ------- | ------------- |
| `Project` | Core workspace container. | 1:N with Chats, 1:N with KGSnapshots. |
| `TemporalCard` | Versioned intelligence reports. | Linked via `chainIndex` (chatId_category). Self-referential `previousCardId`. |
| `KGSnapshot` | Immutable point-in-time graph state. | Contains embedded arrays of Nodes and Edges. |

---

## 8. Frontend Architecture

### 8.1 Routing Structure
| Route | Component |
| ----- | --------- |
| `/projects` | `ProjectsPage` - Project creation and listing. |
| `/projects/:projectId/cards` | `TemporalCardsPage` - Visualizes active and superseded cards. |

### 8.2 State Management
- **Local State:** `useState` for UI toggles (expanded cards, active filters).
- **API Polling/Fetching:** Custom `api()` wrapper using native `fetch` with `AbortController` for timeouts and strict error unpacking (e.g., handling FastAPI 422 validation arrays).

---

## 9. AI Pipeline / Core Intelligence Engine

### 9.1 Multi-model Flow
```text
Raw Chat Messages
       ↓
CardDecomposer (Llama 70B) -> [Fragments: Risk, Decision, Action]
       ↓
CardSynthesizer (Llama 70B) -> Merges fragment with previous card state
       ↓
Conflict Detection -> Identifies semantic contradictions
       ↓
CardWriter -> Version chain update in MongoDB
       ↓
Knowledge Graph Sync -> Flushes new Nodes/Edges if Confidence > 0.88
```

### 9.2 Semantic Decomposition
Instead of summarizing an entire chat into one generic block, the engine splits a single message into multiple independent semantic units.
**Example:** "We chose MongoDB (Decision), so implement the schema tomorrow (Action)." -> Generates two distinct fragments sent down parallel synthesis tracks.

### 9.3 Knowledge Graph Construction
- **Nodes:** Strictly typed (`FACT`, `DECISION`, `CONSTRAINT`, `RISK`).
- **Edges:** Semantic relations (`SUPPORTS`, `CONTRADICTS`, `REFINES`).
- **Confidence Thresholds:** Edges/Nodes are only committed automatically if the AI confidence score exceeds 0.88; otherwise, they are queued for human review.

---

## 10. Database Design

ClarityStack utilizes a polyglot persistence strategy:
- **SQLite (Core API):** Strongly normalized, ACID-compliant schema for Projects, Users, and Chats.
- **MongoDB (Satellite):** Document-oriented storage for `TemporalCard` and `KGSnapshot`. This allows the schemas (like embedded `kgDiff` arrays) to evolve rapidly without complex migration scripts. `KGSnapshot` acts as an append-only ledger for the graph state.

---

## 11. Feature-Level Engineering Analysis

### 11.1 Temporal Version Chaining
**Purpose:** Ensure context is never lost when requirements change.
**Implementation:** Cards are never deleted. When an update occurs, the old card is marked `status: superseded`, and the new card stores a `previousCardId` pointer. The UI allows users to trace the entire historical lineage of a decision.

### 11.2 Model Routing & Fallback
**Purpose:** Guarantee pipeline resilience against API rate limits or outages.
**Implementation:** The `ModelRouter` class attempts the primary NVIDIA Llama 70B endpoint. On failure, it gracefully degrades to HuggingFace. If all networks fail, it relies on an offline Regex parser to ensure the application doesn't crash.

---

## 12. Engineering Decisions & Tradeoffs

| Decision | Reason |
| -------------- | ------------------------ |
| Polyglot Persistence (SQL + NoSQL) | Relational logic is best for Auth/Users; Document stores are best for nested AI JSON schemas and Graph snapshots. |
| Strict Enum Enforcement | Mongoose enums (`FACT`, `SUPPORTS`) prevent LLM hallucinations from corrupting the Knowledge Graph data integrity. |
| Appended Versioning vs Mutating | Mutating data destroys history. Append-only versioning allows for temporal querying (time-travel) of project state. |

---

## 13. Security & Reliability

- **Authentication:** JWT-based stateless authentication verified across both the FastAPI Core and Express Satellite via shared secrets.
- **Validation:** Pydantic (Backend) and Mongoose schemas (Satellite) provide dual-layer validation, preventing malformed LLM outputs from penetrating the database layer.
- **Error Handling:** Frontend API wrapper automatically intercepts 422 Unprocessable Entity errors, formats the nested constraint violations, and presents human-readable UI toasts.

---

## 14. System Strengths

- **Modularity:** The AI orchestration (Satellite) is completely decoupled from the main CRUD application, allowing models to be swapped without touching core logic.
- **Explainability:** Because every AI action results in a specific Node/Edge addition with a confidence score, the system's "reasoning" is fully transparent.
- **Data Integrity:** The pipeline forces LLM outputs into strict JSON schemas, successfully domesticating generative AI into a deterministic software engineering tool.

---

## 15. Conclusion

ClarityStack demonstrates a highly mature integration of generative AI into traditional software architecture. By treating Large Language Models not as raw text generators, but as specialized micro-functions (Decomposers, Synthesizers), the system achieves deterministic, structured outputs. The robust approach to versioning, polyglot data storage, and fallback model routing proves this to be a resilient, production-ready intelligence platform.
