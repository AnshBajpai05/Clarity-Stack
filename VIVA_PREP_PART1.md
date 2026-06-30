# ClarityStack — Ultimate Viva Preparation Document
## PART 1 of 4: Project Overview + Architecture + Frontend

---

# 0. WHAT'S NEW — Current State (2026-06-30 currency update)

> **Read this first.** The system has moved well past this guide's first draft. Where older
> detail below conflicts with this section, **this section is correct.** These are the headline
> capabilities an examiner is most likely to probe.

## 0.1 The honest multi-model engine (corrects the old "Mixtral / Gemini" model list)
The live extraction ensemble is **three genuinely different models**, each stored with its
**real** label (no fictional "Gemini" / "HuggingFace"):
- `groq:llama-3.3-70b-versatile`
- `groq:openai/gpt-oss-20b` ← non-Llama member; **decorrelates** the ensemble (§16.1)
- `nvidia:meta/llama-3.1-70b-instruct`

The **synthesis merge** uses `groq:llama-3.3-70b-versatile`. Provider calls fan out
**concurrently** (`asyncio.gather` + `asyncio.to_thread`) so the event loop never blocks.

## 0.2 Measured confidence, not self-report (§10.3 / §11.4)
The confidence shown in the UI is the **measured inter-model agreement** — a deterministic
Jaccard-cluster lexical metric over the per-model IR — **not** the LLM's self-reported
"I'm certain." The model's self-claim is discarded.

## 0.3 Grounding + IR validation (§10.6)
Every synthesized bullet is **cited back** to the source messages that support it (asymmetric
token-coverage). An uncited bullet is flagged (hallucination signal). The IR is also
**structurally validated** before it is persisted.

## 0.4 The Knowledge Graph is real reasoning now (§16.2 / §17.4)
KG edges are **semantically extracted** (SUPPORTS / CONTRADICTS / DEPENDS_ON …), not a blind
cartesian product. The **"Why this decision?"** trace walks those edges to show only the
evidence a decision is genuinely linked to, plus the shared terms that justified each link.

## 0.5 Temporal Cards — "Commit to KG" actually works (§16.4)
"Commit to KG" ingests a card's knowledge into the **Core Knowledge Graph** (the graph the UI
reads) via `POST /chats/{id}/kg/ingest`, attached to the card's **source chat** — so it renders
in the graph and survives re-sync. Card version lineage is scoped per **{chat, category}** (no
more cross-chat conflation); repeat "Generate" no longer spawns duplicate versions. New UI:
per-card **View in Graph**, **KG Pending / In KG** badges, and a bulk **Commit all to KG**.
*(Card expiry is intentionally disabled — cards stay active; the old `expiresAt` countdown is gone.)*

## 0.6 Five flagship "signal" views (§17)
- **Disagreement Spotlight** — the claims the ensemble did *not* unanimously extract.
- **Devil's Advocate** + **Ask-Anyway** override (a real question is never silently dropped).
- **Evolution Timeline** — content-hash deltas track *knowledge* change, not UUID churn.
- **"Why this decision?" trace** — edge-grounded decision explanation.
- **Decision Readiness** — per-decision verdict + cheapest resolve-path.

## 0.7 Platform hardening
- **Persistence (§10.7):** Alembic is the single source of truth; the **Postgres path is
  validated end-to-end** (clean migrate cycle, zero schema drift, ORM round-trip). SQLite stays
  the dev default; prod sets `DATABASE_URL` + `RUN_MIGRATIONS_ON_STARTUP=0`.
- **Observability (§10.5):** structured logs + request-id correlation, Prometheus `/metrics`,
  Sentry traces; `/health` runs a real `SELECT 1`.
- **Tests / CI (§10.4 / §10.10):** backend 110 + Satellite 20 + frontend 20 tests, CI coverage
  gate (~79%), plus an eval harness with experiment tracking.
- **Frontend honesty (§15):** demo-mode mock fixtures + dead controls removed — reads hit the
  real API and surface real errors.

## 0.8 Likely VIVA questions on the new material
- **Q: How is "confidence" computed?** Measured inter-model agreement (deterministic Jaccard
  clustering over the per-model IR), not the model's self-report — a research-integrity fix (§10.3).
- **Q: Why replace an 8B Llama with `gpt-oss-20b`?** Near-homogeneous models agree lexically
  regardless of truth, which *inflated* measured agreement. A non-Llama member decorrelates the
  ensemble at the same model count and cost (§16.1).
- **Q: How do you control hallucination?** IR structural validation + grounding — each bullet is
  cited to source messages; uncited ⇒ flagged (§10.6).
- **Q: Where does the KG live and how do cards reach it?** A Core relational KG
  (`knowledge_nodes` / `knowledge_edges`), Postgres-ready; "Commit to KG" ingests card nodes via
  `POST /chats/{id}/kg/ingest`, attached to the source chat (§16.4).
- **Q: Is the system Postgres-ready?** Yes — Alembic-owned schema, validated end-to-end on
  Postgres; SQLite is the dev default (§10.7).

---

# 1. COMPLETE PROJECT OVERVIEW

## 1.1 Project Objective

ClarityStack is a **multi-service AI intelligence platform** that solves the "knowledge decay" problem in software engineering teams. Its objective is to automatically extract structured, versioned knowledge — decisions, risks, requirements, conflicts — from unstructured conversational data (chat exports, Slack threads, GPT conversations), and crystallize that knowledge into:

1. **Temporal Cards** — version-chained knowledge snapshots per category
2. **Knowledge Graph (KG)** — a semantic graph of nodes/edges representing facts, decisions, and conflicts
3. **Collaborative Editor** — a real-time multi-user workspace to refine AI-extracted content
4. **SRS Intelligence** — a PDF-ingestion pipeline to process Software Requirements Specification documents
5. **System Hardening** — a high-availability layer with global error traps and defensive render guards

## 1.1b Production Hardening (Updated 2026-06-28)
*   **Global Error Trap:** `ErrorBoundary` component wraps the whole app in `App.tsx` with reset + "Go home" fallback (§2.4 fixed).
*   **Render Guards:** Defensive `try-catch` boundaries around complex AI components.
*   **API Resilience:** Null-safe mapping, restricted storage (Brave/Incognito) support.
*   **Auth Hardening:** httpOnly cookies + CSRF double-submit + refresh token rotation + RBAC middleware (§5.4 + §1.7).

## 1.2 Real-World Problem Solved

In modern engineering workflows:
- Critical decisions are buried in Slack threads
- Architects have no single source of truth for project history
- Requirements documents are massive PDFs with hidden ambiguities
- No automated way to detect when a new conversation **contradicts** a past decision

ClarityStack acts as a **Semantic Sieve** — it doesn't just store messages, it decomposes them into typed knowledge units.

## 1.3 Why This Project Matters

| Pain Point | ClarityStack Solution |
|---|---|
| Lost architectural decisions | Temporal Cards with full version chain |
| Duplicate reasoning | Knowledge Graph detects semantic conflicts |
| Unreadable SRS PDFs | 6-stage NLP pipeline auto-extracts actors, stories, ambiguities |
| Fragmented team docs | Real-time collaborative editor with file-based persistence |
| Single AI model hallucinations | Honest multi-model ensemble (Groq Llama-3.3 + Groq gpt-oss + NVIDIA Llama-3.1) with **measured** agreement + source grounding |


## 1.4 Existing System vs Proposed System

| Aspect | Existing Tools | ClarityStack |
|---|---|---|
| Decision tracking | Jira, Confluence (manual) | Automated AI extraction |
| Requirements analysis | Manual review | 6-stage NLP pipeline |
| Knowledge storage | Wiki pages (flat) | Graph + version-chained cards |
| Collaboration | Google Docs | Real-time sectioned editor (Socket.io) |
| AI usage | Single chatbot | Multi-model consensus synthesis |

## 1.5 Target Users / Stakeholders

- **System Architects** — track design decision evolution
- **Product Managers** — monitor risk cards and requirement stability
- **Engineering Leads** — ensure team alignment via AI-verified source of truth
- **QA Teams** — use SRS ambiguity reports before writing test cases

## 1.6 End-to-End Execution Flow

```
User uploads chat/PDF
        ↓
[Frontend] React SPA sends request via Axios
        ↓
[Core API] FastAPI (Python) — validates, classifies signal
        ↓
[Honest Ensemble — concurrent] groq:llama-3.3-70b + groq:gpt-oss-20b + nvidia:llama-3.1-70b
        ↓
[Measured Agreement] deterministic Jaccard-cluster confidence (NOT self-reported)
        ↓
[Synthesis Engine] IR-structured merge via groq:llama-3.3-70b + grounding (cite to source)
        ↓
[Knowledge Graph] relational nodes/edges (SQLite dev / Postgres prod) — semantic edges
        ↓
[Satellite] Node.js — Temporal Card versioned + stored in MongoDB
        ↓
[Frontend] React re-fetches via TanStack Query → UI updates
```

## 1.7 Request Lifecycle (Single `/chats/{id}/ask` Call)

1. POST body arrives: `{ sender: "alice", text: "We decided to use PostgreSQL for ACID compliance" }`
2. `classify_signal()` scores the text → returns `"high"` (score ≥ 6)
3. User message saved to SQLite with `signal_level="high"`
4. `build_chat_context()` fetches last 10 relevant messages → injects as history block
5. Prompt fans out **concurrently** to the 3-model ensemble: `groq:llama-3.3-70b-versatile`, `groq:openai/gpt-oss-20b`, `nvidia:meta/llama-3.1-70b-instruct`
6. Each IR block is stored as a `role="assistant"` message tagged with its **real** model label (`groq:` / `nvidia:`) — same `reply_group_id`
7. **Measured agreement** is computed across the per-model IR (Jaccard clustering) → this becomes the surfaced confidence (self-reported confidence discarded)
8. `synthesize_content()` calls `groq:llama-3.3-70b-versatile` to merge the blocks; the IR is structurally validated
9. **Grounding** cites each synthesized bullet back to source messages; the synthesis is stored as a `role="synthesis"` message
10. Semantic KnowledgeNodes + KnowledgeEdges are written to the Core KG (`knowledge_nodes` / `knowledge_edges`)
11. Response returns `{ status: "ok", reply_group_id, synthesis_id }`

## 1.8 Data Lifecycle

```
Raw Text → Signal Classification → Context Assembly
         → Multi-model Extraction → IR Blocks
         → Synthesis Merge → Canonical IR
         → SQLite (KnowledgeNode/KnowledgeEdge)
         → Temporal Card (MongoDB via Satellite)
         → Frontend (TanStack Query cache)
```

---

# 2. COMPLETE ARCHITECTURE BREAKDOWN

## 2.1 Architecture Style: Microservices + Polyglot Persistence

| Service | Runtime | Port | Database | Responsibility |
|---|---|---|---|---|
| Core API (Backend) | Python / FastAPI | 8000 | SQLite (dev) / **Postgres** (prod, validated) | Auth, Projects, Chats, Messages, KG, Synthesis |
| SRS Service | Python / FastAPI | 8001 | Filesystem (JSON) | PDF ingestion + 6-stage NLP pipeline |
| ThreatLens Service | Python / FastAPI | 8002 | ML Model (BERT) | AI Phishing Detection (BERT + Heuristics) — *out of scope this cycle* |
| Satellite | Node.js / Express | 8003 | MongoDB Atlas | Temporal Cards, KG Snapshots, Delta, Mailer |
| Editor Service | Node.js / Socket.io | 8004 | File-based (atomic JSON) | Real-time collaborative editor |
| UML API | Python / FastAPI | 8005 | — | UML diagram generation + Semantic chunking |
| Frontend (Main) | React / Vite | 8006 | — | Complete UI, routes to all services |
| UML UI | React / Vite | 8007 | — | UML visualizer interface |


**Why Microservices?**
- Each service has different scaling needs (AI inference is slow; editor must be real-time)
- Polyglot persistence: SQLite for ACID relational data, MongoDB for schema-evolving AI JSON, PostgreSQL for collaborative state
- Failure isolation: if Satellite goes down, Core API and Editor still work

## 2.2 Communication Patterns

| Pattern | Used For | Protocol |
|---|---|---|
| REST / HTTP | All CRUD operations, AI pipeline | HTTP/JSON via Axios |
| WebSocket | Real-time collaborative editor | Socket.io |
| Background Tasks | SRS PDF pipeline | FastAPI BackgroundTasks |
| Polling | AI pipeline status check | Frontend polling `/status` |
| Event-driven (cron) | Stale card detection | node-cron in Satellite |

## 2.3 Startup Orchestration (`start_project.bat`)

Opens 8 parallel terminal windows via Windows Terminal:
```batch
uvicorn main:app --reload --port 8000   (Backend)
uvicorn api:app --reload --port 8001    (SRS Service)
uvicorn app:app --reload --port 8002    (ThreatLens)
npm run dev -- --port 8003              (Satellite)
npm start -- --port 8004                (Editor)
uvicorn main:app --reload --port 8005   (UML API)
npm run dev -- --port 8006              (UI)
npm run dev -- --port 8007              (UML UI)
```

## 2.4 CORS Configuration

Each backend service explicitly allows the frontend origin with credentials support:
- **Backend** (`main.py`): per-origin allowlist (localhost:8006, 8007 in dev), `allow_credentials=True`
- **SRS Service** (`api.py`): allows `localhost:5173`, `8000`, `8006`
- **Editor Service** (`server.js`): configured origins with `credentials: true`
- **Satellite** (`server.js`): configured origins with `credentials: true`

**CSRF:** All mutating cookie-auth requests must include `X-CSRF-Token` header matching the JS-readable `csrf_token` cookie (double-submit pattern).

**Security Note**: Production deployments use `COOKIE_SECURE=True` with `__Host-` prefixed cookie names.

---

# 3. COMPLETE FRONTEND BREAKDOWN

## 3.1 Technology Stack

| Tool | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI library, component model |
| TypeScript | 5.8.3 | Static typing across entire frontend |
| Vite | 5.4.19 | Build tool + dev server (replaces CRA) |
| TanStack Query | 5.83.0 | Server state management, caching, polling |
| React Router DOM | 6.30.1 | Client-side SPA routing |
| Zustand | 5.0.12 | Lightweight client state store |
| `fetch` API (native) | — | HTTP client (`http.ts` wrapper with CSRF + silent refresh) |
| Socket.io-client | 4.8.3 | WebSocket to Editor Service |
| Tailwind CSS | 3.4.17 | Utility-first CSS framework |
| Radix UI | Various | Headless, accessible UI primitives |
| Framer Motion | 12.24.0 | Animations and page transitions |
| Zod | 3.25.76 | TypeScript-first schema validation |
| React Hook Form | 7.61.1 | Performant form state management |
| Recharts | 2.15.4 | Charting / data visualization |
| react-force-graph-2d | 1.29.1 | Knowledge Graph canvas visualization |
| Sonner | 1.7.4 | Toast notifications (programmatic) |
| next-themes | 0.3.0 | Dark / light mode toggle |
| lucide-react | 0.462.0 | Icon library (SVG-based) |
| date-fns | 3.6.0 | Date formatting utilities |
| cmdk | 1.1.1 | Command palette component |
| vaul | 0.9.9 | Drawer / bottom sheet component |


## 3.2 Application Entry Point

### `main.tsx`
Minimal — just mounts `<App />` into `#root` DOM node.

### `App.tsx` — Root Component

```tsx
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* all routes */}
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);
```

- `QueryClientProvider`: makes TanStack Query cache available globally
- `TooltipProvider`: Radix context for tooltip positioning
- `Toaster` (shadcn): component-level toast messages
- `Sonner`: programmatic `toast()` calls from anywhere

**Why two toast providers?** `Toaster` is for Radix component integration; `Sonner` is for fire-and-forget toasts from event handlers and mutations.

## 3.3 Routing Structure (React Router v6)

```
/                          → Index (redirects)
/login                     → Login.tsx
/register                  → Register.tsx
/projects                  → ProjectsPage.tsx
/projects/search           → ProjectSearch.tsx
/discovery                 → DiscoveryPage.tsx
/projects/:projectId/chats           → ChatsPage.tsx
/projects/:projectId/chats/:chatId   → MessagesPage.tsx
/projects/:projectId/kg              → KnowledgeGraphPage.tsx
/projects/:projectId/delta           → DeltaTimelinePage.tsx
/projects/:projectId/cards           → TemporalCardsPage.tsx
/srs/dashboard             → SRS Dashboard
/srs/issues                → SRS Workspace (issues viewer)
/editor/dashboard          → Editor Dashboard
/editor/workspace/:id      → EditorWorkspace (real-time)
/editor/snapshot/:id       → EditorSnapshot (read-only)
/cards                     → CardsPage (legacy)
/settings                  → SettingsPage
*                          → NotFound.tsx
```

**React Router v6 Key Concepts:**
- `<Routes>` replaces `<Switch>` from v5
- `<Route element={<Component />}>` — no `component={}` prop
- `useParams()` extracts `:projectId`, `:chatId`, `:id` from URL
- `useNavigate()` replaces `useHistory()`

## 3.4 State Management Architecture

### Server State: TanStack Query

**Why TanStack Query instead of Redux?**
- Eliminates boilerplate (no reducers, no actions, no thunks)
- Built-in caching, background refetch, stale-while-revalidate
- Automatic retry on failure
- Perfect for API-heavy apps where server is the source of truth

```tsx
const { data, isLoading, error } = useQuery({
  queryKey: ['messages', chatId],
  queryFn: () => axios.get(`/chats/${chatId}/messages`),
  staleTime: 30000,
});
```

- `queryKey`: cache identifier; changing `chatId` triggers a new fetch
- `staleTime`: how long cached data is considered fresh (no refetch during this period)
- `refetchInterval`: used for polling-based updates (SRS pipeline status check)

**Mutations:**
```tsx
const mutation = useMutation({
  mutationFn: (payload) => axios.post(`/chats/${chatId}/ask`, payload),
  onSuccess: () => queryClient.invalidateQueries(['messages', chatId])
});
```
`invalidateQueries` marks the cache stale → triggers refetch → UI updates.

### Client State: Zustand (`documentStore.ts`)

Used for the SRS workspace — stores locally processed document state:
```ts
const useDocumentStore = create((set) => ({
  documents: [],
  selectedDocId: null,
  setSelectedDocId: (id) => set({ selectedDocId: id }),
}));
```

**Why Zustand over Context API?**
- No Provider wrapping needed
- No re-render storms (only subscribing components re-render)
- Much simpler API than Redux

## 3.5 Key Pages — Deep Breakdown

### `MessagesPage.tsx` (Most Complex — 28KB)
**Purpose**: Core AI interaction screen for a chat session.

**State variables:**
- `inputText` — controlled input state for the message box
- `isLoading` — controls skeleton/spinner
- `selectedGroup` — currently expanded reply group

**Key Flow:**
1. User types → `inputText` state updates on each keystroke (controlled component)
2. Submit → `useMutation` fires POST to `/chats/{chatId}/ask`
3. Backend returns `{ status: "ok", reply_group_id }`
4. `queryClient.invalidateQueries` triggers message list refetch
5. New messages appear: user message + 3 AI responses + 1 synthesis block
6. Each AI response shows its **honest** provider badge (`groq:` / `nvidia:`) — never a fictional vendor
7. User can "accept" one AI response → PATCH `/messages/{id}/accept`
8. Noise-filtered messages show with a grey badge, no AI processing

### `KnowledgeGraphPage.tsx` (14KB)
**Purpose**: Visualize the project's semantic knowledge graph.

**Library**: `react-force-graph-2d` — canvas-based force-directed simulation.

**Data flow:**
1. GET `/api/reasoning/chat/{chatId}` (Core) → bucketed nodes (decision/supports/conflicts/…) + edges; the page expands per chat
2. Nodes colored by section type (FACT=green, DECISION=violet, CONFLICT=red, OPTION=blue …)
3. Edges labeled with the **semantic** relation (SUPPORTS, CONTRADICTS, DEPENDS_ON, REFINES)
4. Card knowledge committed via "Commit to KG" appears here too (ingested into the same Core KG, §16.4)

**Technical details:**
- `useRef` holds the graph instance for imperative controls (zoom, center)
- `useMemo` memoizes node/edge arrays to prevent expensive re-computation

### `TemporalCardsPage.tsx` (18KB)
**Purpose**: Display version-chained AI-generated cards from Satellite service.

- Fetches from the Satellite service at `:8003` (`/api/satellite/cards/:projectId`)
- Groups cards by `category` (risk, decision, architecture, action, insight)
- Shows `version` number and `previousCardId` chain linkage; **lineage is scoped per {chat, category}** (§16.4)
- `status` badge: active (green), superseded (grey)
- **Commit to KG** (per-card + bulk "Commit all"), **View in Graph** deep-link, and **KG Pending / In KG** badges (§16.4)
- *Card expiry is intentionally disabled — cards remain active; there is no `expiresAt` countdown.*

### `Login.tsx` / `Register.tsx`
**Purpose**: Auth forms with Zod validation.

```tsx
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});
const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema)
});
```

**Auth Model (§5.4):** On successful login, the server sets three httpOnly cookies: `access_token` (15 min), `refresh_token` (30 days), and a JS-readable `csrf_token`. The frontend never touches JWTs directly. User state is loaded via `GET /api/auth/me`.

### `DiscoveryPage.tsx` (9KB)
**Purpose**: Feed of public projects.

- Fetches `/projects` with visibility filter
- Debounced search bar (avoids API call on every keystroke)
- "Join" button POSTs to `/projects/{id}/join` (public projects only)

## 3.6 React Hooks Deep Dive

### `useState`
- Triggers a re-render when called with a new value
- React 18 **automatic batching**: multiple `setState` calls in event handlers are batched into one re-render
- Never mutate state directly — always use the setter function

### `useEffect`
```tsx
useEffect(() => {
  const socket = connect();
  return () => socket.disconnect(); // cleanup
}, [chatId]); // runs when chatId changes
```
- Empty `[]` → runs once on mount
- With deps → runs when any dep changes
- Cleanup function prevents memory leaks (socket disconnect, timer clear)

### `useRef`
- Does NOT trigger re-render when `.current` changes
- Used for: graph instance, scroll container, debounce timer IDs

### `useMemo` / `useCallback`
- `useMemo`: memoizes expensive computed values (graph node array)
- `useCallback`: memoizes function references (prevents unnecessary child re-renders)
- Only use when profiling shows a measurable performance problem

## 3.7 Key npm Packages — Internal Working

### `http.ts` (custom fetch wrapper — replaces Axios)
- Centralized `api()` function with `credentials: "include"` (auto-sends httpOnly cookies)
- Reads `csrf_token` cookie, injects `X-CSRF-Token` header on every mutating request
- **Silent refresh state machine**: on 401, queues inflight requests, hits `/api/auth/refresh`, retries all queued calls; falls back to `/login` only if refresh itself fails
- `getCookie()` checks `__Host-` prefixed variants first (production) then plain (dev)
- 120s timeout with AbortController; slow-request warnings in dev mode

### `socket.io-client`
- Establishes WebSocket connection, falls back to HTTP long-polling
- Auth: token sent via `socket.handshake.headers.cookie` (no query-param token leakage)
- Events used: `join`, `section_change`, `load-sections`, `user-count`, `section_added`, `section_deleted`

### `react-force-graph-2d`
- Canvas-based force-directed graph (uses d3-force internally)
- Nodes repel (charge force); edges attract connected nodes (link force)
- Imperative API via ref: `graphRef.current.zoomToFit()`

### `zod`
- TypeScript-first schema validation
- `.parse()` throws on invalid; `.safeParse()` returns `{ success, data, error }`
- Preferred over Yup due to superior TypeScript type inference

### `framer-motion`
- Declarative animation library
- `<motion.div animate={{ opacity: 1 }} initial={{ opacity: 0 }}>` → fade in
- Used for: page transitions, card animations, sidebar slide-in

### `tailwindcss`
- Utility-first CSS — no custom CSS files needed for most components
- `tailwind-merge` (via `cn()` helper): resolves conflicting classes correctly
- `class-variance-authority` (CVA): creates variant-based component APIs (e.g., Button size/color variants)

## 3.8 Vite vs CRA

| Aspect | Vite | Create React App |
|---|---|---|
| Dev server | Native ES modules (no bundling) | Webpack bundle |
| Build | Rollup + SWC (Rust compiler) | Webpack + Babel |
| HMR speed | < 50ms | 500ms+ |
| Config | `vite.config.ts` (simple) | `eject` or react-scripts |
| TypeScript | Via SWC (no type checking in build) | tsc |

---

# VIVA QUESTIONS — PART 1

**Q1: What problem does ClarityStack solve?**
A: Knowledge decay in engineering teams. Critical architectural decisions buried in chat threads are automatically extracted by a multi-model AI pipeline, structured into typed IR blocks, versioned as Temporal Cards, and visualized as a Knowledge Graph — giving teams a traceable, living source of truth.

**Q2: Why microservices instead of a monolith?**
A: Each service has fundamentally different requirements. The AI inference backend needs Python ML libraries; the editor needs Node.js event loop for WebSocket throughput; the SRS pipeline runs long CPU-bound background tasks. Coupling them would force compromises in runtime, database choice, and scaling strategy.

**Q3: Why TanStack Query over Redux?**
A: Redux requires boilerplate for every API operation. TanStack Query gives caching, background refetch, retry, and pagination out of the box. Our app is API-driven with server as source of truth — TanStack Query is the correct abstraction.

**Q4: What is a controlled component?**
A: A form element whose value is driven by React state. Every keystroke triggers a state update, which re-renders the input. Uncontrolled components read values from the DOM via refs. `react-hook-form` uses uncontrolled by default for better performance (fewer re-renders).

**Q5: Why is Vite faster than CRA?**
A: CRA bundles everything with Webpack before serving. Vite serves native ES modules directly to the browser in dev mode — no bundling step. Production builds use Rollup + SWC (Rust-based compiler), which is 10-20x faster than Babel.

**Q6: How does authentication work in the frontend?**
A: After login, the server sets three cookies: an `httpOnly` `access_token` (15 min), an `httpOnly` `refresh_token` (30 days), and a JS-readable `csrf_token`. The browser auto-sends the access cookie with every request (via `credentials: "include"`). The frontend reads the `csrf_token` cookie and injects it as `X-CSRF-Token` on all mutating requests (double-submit CSRF pattern). On 401, the `http.ts` silent refresh state machine transparently calls `/api/auth/refresh` and retries — the user never sees a redirect unless the refresh itself fails. JWTs never touch `localStorage`.

**Q7: What is reconciliation?**
A: When React state changes, it creates a new Virtual DOM tree and diffs it against the previous tree (using the diffing algorithm). Only actual DOM nodes that changed are updated. This makes UI updates faster than direct DOM manipulation.

**Q8: What is `staleTime` in TanStack Query?**
A: The duration for which cached data is considered fresh. During this window, the same query will not trigger a network request — it returns cached data immediately. After `staleTime` expires, the next render of the component triggers a background refetch.

---
*→ Continue reading VIVA_PREP_PART2.md: Backend + Database + Authentication + Security*
