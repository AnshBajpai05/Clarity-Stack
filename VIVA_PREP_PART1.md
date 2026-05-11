# ClarityStack — Ultimate Viva Preparation Document
## PART 1 of 4: Project Overview + Architecture + Frontend

---

# 1. COMPLETE PROJECT OVERVIEW

## 1.1 Project Objective

ClarityStack is a **multi-service AI intelligence platform** that solves the "knowledge decay" problem in software engineering teams. Its objective is to automatically extract structured, versioned knowledge — decisions, risks, requirements, conflicts — from unstructured conversational data (chat exports, Slack threads, GPT conversations), and crystallize that knowledge into:

1. **Temporal Cards** — version-chained knowledge snapshots per category
2. **Knowledge Graph (KG)** — a semantic graph of nodes/edges representing facts, decisions, and conflicts
3. **Collaborative Editor** — a real-time multi-user workspace to refine AI-extracted content
4. **SRS Intelligence** — a PDF-ingestion pipeline to process Software Requirements Specification documents and detect ambiguities, gaps, and conflicts

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
| Fragmented team docs | Real-time collaborative editor with Supabase persistence |
| Single AI model hallucinations | Multi-model consensus (Groq + HuggingFace) |

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
[Multi-model Pipeline] Groq (Llama) + HuggingFace (Qwen)
        ↓
[Synthesis Engine] IR-structured merge via Qwen 2.5-7B
        ↓
[Knowledge Graph] SQLite nodes/edges built from IR sections
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
5. Full prompt sent to Groq (Llama-3.1-8B) and HuggingFace (Llama-3.2-3B)
6. Gemini call is **mocked** (returns a valid empty IR block — noted as technical debt)
7. Three IR blocks collected, tagged with provider name, stored as `role="assistant"` messages
8. `generate_and_store_synthesis()` calls HuggingFace Qwen-2.5-7B to merge three blocks
9. Synthesis output is pruned/validated → stored as `role="synthesis"` message
10. `build_graph_from_ir()` extracts nodes per section, creates edges to DECISION nodes
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
| Core API (Backend) | Python / FastAPI | 8000 | SQLite | Auth, Projects, Chats, Messages, KG, Synthesis |
| Satellite | Node.js / Express | 4000 | MongoDB Atlas | Temporal Cards, KG Snapshots, Delta, Mailer |
| Editor Service | Node.js / Socket.io | 8003 | Supabase (PostgreSQL) | Real-time collaborative editor |
| SRS Service | Python / FastAPI | 8002 | Filesystem (JSON) | PDF ingestion + 6-stage NLP pipeline |
| Frontend | React / Vite | 8080 | — | Complete UI, routes to all services |

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

Opens 5 parallel terminal windows:
```batch
uvicorn main:app --reload --port 8000   (Backend)
npm run dev                              (Frontend on 8080)
npm run dev                              (Satellite on 4000)
uvicorn api:app --reload --port 8002    (SRS Service)
npm start                               (Editor on 8003)
```

## 2.4 CORS Configuration

Each backend service explicitly allows the frontend origin:
- Backend (`main.py`): allows `localhost:8080`, `8081`, `8082`
- SRS Service (`api.py`): allows `localhost:5173`, `8080`, `8081`, `3000`
- Editor Service (`server.js`): `cors({ origin: "*" })` — open for dev

**Security Note**: Production deployments must replace wildcard CORS with explicit origins.

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
| Axios | 1.14.0 | HTTP client with interceptor support |
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
6. Each AI response shows a provider badge (Groq / HF / Gemini)
7. User can "accept" one AI response → PATCH `/messages/{id}/accept`
8. Noise-filtered messages show with a grey badge, no AI processing

### `KnowledgeGraphPage.tsx` (14KB)
**Purpose**: Visualize the project's semantic knowledge graph.

**Library**: `react-force-graph-2d` — canvas-based force-directed simulation.

**Data flow:**
1. GET `/projects/{projectId}/kg` → returns nodes + edges from SQLite
2. Nodes colored by section type (FACT=blue, DECISION=green, CONFLICT=red)
3. Edges labeled with relation (SUPPORTS, CONTRADICTS, REFINES)
4. Click node → shows provenance (which chat message created it)

**Technical details:**
- `useRef` holds the graph instance for imperative controls (zoom, center)
- `useMemo` memoizes node/edge arrays to prevent expensive re-computation

### `TemporalCardsPage.tsx` (18KB)
**Purpose**: Display version-chained AI-generated cards from Satellite service.

- Fetches from `http://localhost:4000/api/satellite/cards/:projectId`
- Groups cards by `category` (risk, decision, architecture, action, insight)
- Shows `version` number and `previousCardId` chain linkage
- `status` badge: active (green), superseded (grey), stale (yellow)
- `expiresAt` countdown shown for active cards

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

**JWT Storage:** On successful login, token stored in `localStorage`. Axios interceptor injects it into every request header automatically.

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

### `axios`
- Creates HTTP requests, returns Promises
- Interceptors inject JWT into every request automatically
- Error handling: `err.response.data` extracts backend error message

### `socket.io-client`
- Establishes WebSocket connection, falls back to HTTP long-polling
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

**Q6: How does JWT authentication work in the frontend?**
A: After login, the JWT is stored in `localStorage`. An Axios request interceptor runs before every HTTP call and injects `Authorization: Bearer <token>` into the header. The FastAPI backend verifies this token using `python-jose`.

**Q7: What is reconciliation?**
A: When React state changes, it creates a new Virtual DOM tree and diffs it against the previous tree (using the diffing algorithm). Only actual DOM nodes that changed are updated. This makes UI updates faster than direct DOM manipulation.

**Q8: What is `staleTime` in TanStack Query?**
A: The duration for which cached data is considered fresh. During this window, the same query will not trigger a network request — it returns cached data immediately. After `staleTime` expires, the next render of the component triggers a background refetch.

---
*→ Continue reading VIVA_PREP_PART2.md: Backend + Database + Authentication + Security*
