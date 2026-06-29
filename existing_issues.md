# Existing Issues — ClarityStack Forensic Audit

> **Mode:** Forensic Project Audit (no code was changed; this is a findings document).
> **Scope:** Full monorepo — `Backend/` (FastAPI core), `Satellite/` (Express + MongoDB), `Editor_Service/` (Node + Python, collab editor), `ThreatLens_Service/` (FastAPI phishing ML), `SRS_Service/` & `UML_Clarity_Service/` (FastAPI pipelines), `Web/Frontend/` (React/Vite/TS).
> **Auditors' lens:** Architecture, Security, Reliability, Performance, Data Integrity, UX, Product Logic.
> **Status legend:** OPEN / FIXED / ACCEPTED / DOCUMENTED / DEFERRED. All items below are **OPEN** unless noted.

This document is the intended single source of truth for technical risk. Findings are evidence-backed and cross-referenced. Severity reflects production (public-launch) impact, not classroom/demo impact.

> ### ⛔ Scope exclusion — ThreatLens service is OUT of the current remediation pass (2026-06-28)
> `ThreatLens_Service/` is **not yet linked into the running system** and is being held out of this work cycle by decision. All ThreatLens findings are **DEFERRED** until the service is integrated; do **not** spend effort on them now. Affected items:
> - **§1.4** SSRF on `/predict`, `/predict/batch` → **DEFERRED**.
> - **§4.1** Blocking SSL/socket on the async loop → **DEFERRED**.
> - **§5.5** Over-permissive CORS — *only the `ThreatLens_Service/app.py` `allow_origins=["*"]` portion is deferred*; the Satellite + Editor CORS portions stay in scope.
> - **§5.6** No rate limiting — *only the ThreatLens `/predict/batch` portion is deferred*; the Backend + Satellite LLM endpoints stay in scope.
> - **§9.3** Over-broad exceptions — *only the `ThreatLens_Service/app.py` bare-`except` portion is deferred*; Backend `providers.py`/`main.py` stay in scope.
> - **§9.4** Deprecated framework usage — *only the ThreatLens `@app.on_event("startup")` portion is deferred*; the Backend presence-manager portion stays in scope.
>
> This matches `take_step_forward.md` §6.10/§6.11, already deferred there for the same reason (service not yet wired in).

---

## §1 Critical Issues

### §1.1 — Hardcoded JWT fallback secret shared across services
- **Severity:** Critical · **Status:** ✅ FIXED (2026-06-28) — Satellite (`middleware/auth.js`, `routes/internal.js`) and Editor (`server.js`) now read `process.env.JWT_SECRET` and **throw at boot** if unset; the `"HalaMadrid12345"` literal is gone from all three. Secret rotated to a fresh 256-bit value, set identically in `Backend/.env`, `Satellite/.env`, `Editor_Service/.env` (all gitignored). Env name unified on `JWT_SECRET`.
- **Evidence:**
  - `Satellite/middleware/auth.js:4` → `const JWT_SECRET = process.env.JWT_SECRET || "HalaMadrid12345";`
  - `Satellite/routes/internal.js:9` → same fallback.
  - `Editor_Service/server.js:11` → `const SECRET_KEY = process.env.SECRET_KEY || "HalaMadrid12345";`
- **Why it matters:** If `JWT_SECRET` is not set in a given service's environment (easy to miss across 7 services with 3 different env conventions), the service silently signs/verifies tokens with a public, source-controlled secret. Anyone who reads this repo can forge a valid token for **any** user or role — including `role: "internal"`, which authorizes the data-destruction endpoint (§1.2). This is a full authentication bypass, not a theoretical one.
- **Reproduction:** Start Satellite without `JWT_SECRET`. Forge `jwt.sign({sub:"x",role:"internal"}, "HalaMadrid12345")`. Call any protected route — accepted.
- **Recommended direction:** Fail-closed exactly like `Backend/auth.py:11-17` does (`raise` if missing). Remove every literal fallback. Centralize one secret name and inject via secret manager. Rotate the leaked value before any deployment.

### §1.2 — Unauthenticated/forgeable mass-deletion endpoint (Satellite internal cleanup)
- **Severity:** Critical · **Status:** 🟡 PARTIAL (2026-06-28) — the **forgeability vector is closed**: `requireInternalAuth` no longer falls back to the public `"HalaMadrid12345"` secret (Step 1, fail-closed), so a `role:"internal"` token can now only be minted by a holder of the rotated `JWT_SECRET` — i.e. the Core service itself (`_call_satellite_cleanup`). **Still OPEN (deferred hardening):** the channel is still user-JWT-shaped rather than a dedicated service credential / mTLS, and deletes are hard (no soft-delete + retention). Lower priority now that forgery is impossible without the secret.
- **Evidence:** `Satellite/routes/internal.js:31` `POST /api/satellite/internal/cleanup` is guarded only by `requireInternalAuth`, which trusts a JWT signed with the §1.1 fallback secret. On `scope:"project"` it runs `TemporalCard.deleteMany`, `GraphDelta.deleteMany`, `KGSnapshot.deleteMany` filtered solely by an attacker-supplied `id`.
- **Why it matters:** A forged internal token (trivial per §1.1) lets an attacker wipe all temporal cards / deltas / KG snapshots for **any** project. Irreversible, cross-tenant data destruction.
- **Recommended direction:** Mutual-auth between core and satellite (mTLS or a dedicated, rotated service secret distinct from user JWT), bind cleanup to a verified server-to-server channel, and soft-delete with retention before hard delete.

### §1.3 — Cross-tenant IDOR across the entire Satellite service
- **Severity:** Critical · **Status:** ✅ FIXED (2026-06-28) — added object-level authZ middleware `requireProjectAccess` / `requireCardAccess` (`Satellite/middleware/auth.js`) that delegate to Core's own access control (`GET /projects/:id`, which honors membership + public-read). Wired as Express param triggers (`router.param("projectId"|"cardId", …)`) on **kg.js, delta.js, cards.js, export.js** — covering every current and future scoped route, including the previously-public `GET /cards/:projectId` + `/label/:label` and the `DELETE /cards/:cardId` route. The card trigger also blocks passing another tenant's `cardId` under a project you can access. `generate.js /uml` now requires auth (§5.6). Fail-closed (Core unreachable ⇒ deny). `discovery.js` (follow/feed) and `join.js` (join-request) are intentionally not gated — the caller there is not yet a member by design.
- **Evidence:** Every Satellite route keys off the URL `:projectId` but **never verifies the caller is a member of that project**. `requireAuth` (`Satellite/middleware/auth.js:10`) only checks the token is *valid*. Examples:
  - `Satellite/routes/kg.js:13` `GET /kg/:projectId`, `:86` snapshot, `:110` focus — any logged-in user reads/snapshots any project's knowledge graph.
  - `Satellite/routes/cards.js:25` `GET /cards/:projectId` and `:40` `/label/:label` have **no `requireAuth` at all** — fully public.
  - `Satellite/routes/cards.js:300` `DELETE /cards/:cardId` — any logged-in user deletes any card by id.
- **Why it matters:** The synthesized project knowledge (decisions, risks, architecture) is the product's crown-jewel data. Cross-tenant read/delete is a confidentiality + integrity breach for every customer at once.
- **Recommended direction:** Add a shared authorization layer that, for each `:projectId`, calls core (`get_project_or_403` semantics) or validates a project-scoped claim. Default-deny; remove the public card GETs or gate them behind explicit `visibility=public` verification.

### §1.4 — Server-Side Request Forgery in ThreatLens (`/predict`, `/predict/batch`)
- **Severity:** Critical · **Status:** ⛔ DEFERRED (ThreatLens out of current scope — see banner)
- **Evidence:** `ThreatLens_Service/app.py:674` `/predict` and `:683` `/predict/batch` are unauthenticated and feed a user-supplied URL into `scrape_url` (`:266`, `httpx ... follow_redirects=True`), `get_ssl_cert_info` (`:130`, raw `socket.create_connection((hostname,443))`), and `resolve_redirect` (`:328`). The `is_ip`/private-IP logic only adjusts a *risk score* — it never blocks the outbound fetch.
- **Why it matters:** An attacker submits `http://169.254.169.254/latest/meta-data/`, `http://127.0.0.1:8000/...`, or any internal host. The server fetches it and returns title/headers/text in the response. Classic cloud-metadata / internal-service SSRF. `/predict/batch` accepts an unbounded `urls` list → SSRF amplification and DoS. CORS is `*` with credentials, so any site can drive it.
- **Reproduction:** `POST /predict {"url":"http://127.0.0.1:8000/projects/public"}` → response leaks the internal service's body.
- **Recommended direction:** Resolve DNS then block RFC1918 / loopback / link-local / metadata ranges *before* any connect; disable redirects to private targets; cap batch size; require auth + rate limit; run egress through an allow-listed proxy.

### §1.5 — Editor service: env-name mismatch silently disables auth, then exposes all workspaces
- **Severity:** Critical · **Status:** ✅ FIXED (2026-06-28) — three parts, all closed: (1) **env-name mismatch** — Editor reads `JWT_SECRET` now (Step 1), so real tokens verify. (2) **`GET /workspace/:id`** — private workspaces return 403 to non-owners. (3) **Sockets** — the handshake is authenticated (`io.use` verifies the JWT and attaches `socket.user`), and `join` + every mutator (`section_change`, `section_title_change`, `add_section`, `delete_section`, `reorder_sections`) is gated by `canAccessRoom`: private rooms are owner-only; public/not-yet-created rooms stay open for collaboration. The frontend now sends the token on the socket handshake (`socket.js` auth callback). Anonymous public collaboration is intentionally preserved.
- **Evidence:** `Editor_Service/server.js:11` reads `process.env.SECRET_KEY`, but the rest of the stack issues tokens signed with `JWT_SECRET` (`Backend/auth.py`). So even a correctly-configured deployment verifies Editor tokens with the **wrong** secret → every real token fails `jwt.verify` → `optionalAuth` sets `req.user = null` → all requests are anonymous. Compounding: `GET /workspace/:id` (`:205`) returns `sections` with **no `is_public`/owner check**, and Socket.IO `join`/`section_change` (`:331`, `:351`) perform **no auth at all**.
- **Why it matters:** Any user can read and live-edit any workspace — including ones marked private — by guessing/enumerating the 8-char room id. Document confidentiality is absent.
- **Recommended direction:** Standardize on one secret env name; enforce ownership/visibility on `GET /workspace/:id` and on socket `join`; authenticate the socket handshake (token in `io` auth) before joining rooms.

### §1.6 — Vendor LLM API keys shipped into the browser bundle (UML-Clarity)
- **Severity:** Critical · **Status:** ✅ FIXED (2026-06-28) — both browser callers now route through the server-side proxy `${VITE_API_URL}/api/llm` (NVIDIA NIM, holding `NVIDIA_API_KEY` on the server): `Dashboard.jsx` `callAI` rewritten (Groq/Gemini direct fetches + `VITE_GROQ_API_KEY`/`VITE_GEMINI_API_KEY` deleted) and `pureFrontendEngine.js` `callGroq` now hits the proxy (`getKey()`/`VITE_GROQ_API_KEY` gone). The leftover `VITE_NVIDIA_API_KEY` (browser leak) was removed from `UML_Clarity_Service/.env`. The proxy now **load-balances across two server-side keys** (`NVIDIA_API_KEY` + `NVIDIA_API_KEY_2`) — a random key per request with fail-over on 429 — to spread quota across both. Grep confirms zero `VITE_*_API_KEY` / direct `api.groq.com` / `generativelanguage` references remain in `UML_Clarity_Service/src`. **Note 1:** the system intentionally **remains cloud-dependent** (NVIDIA) — local-model replacement is explicitly deferred (see `take_step_forward.md` §8/§10.11). **Note 2:** the original key was referenced via `VITE_NVIDIA_API_KEY` in older builds, so it should be rotated when convenient even though it now lives server-side only.
- **Evidence:** `UML_Clarity_Service/src/components/Dashboard.jsx:227-228` reads `import.meta.env.VITE_GROQ_API_KEY` / `VITE_GEMINI_API_KEY` and calls Groq/Gemini **directly from the browser** (`:342` even errors "Add VITE_GROQ_API_KEY … to your .env"). Same pattern in `UML_Clarity_Service/src/joint-logic/pureFrontendEngine.js:24,186`. (Confirmed via grep; this corresponds to `take_step_forward.md` §2.3, which it still lists as 🟡 partial — NVIDIA was removed from `promptEngine.js` but Groq/Gemini remain.)
- **Why it matters:** Vite inlines every `VITE_`-prefixed variable into the shipped JS. The live provider keys are therefore extractable from the bundle / network tab by any visitor → credential theft and uncapped billing abuse on the team's Groq/Gemini accounts.
- **Reproduction:** Build the UML UI; open the bundle or devtools network tab on a model call → the `Authorization: Bearer <key>` is present client-side.
- **Recommended direction:** Never expose provider keys to the client. Route all model calls through a server-side proxy (the UML backend already exposes `/api/llm`); delete the `VITE_*_API_KEY` usages and rotate the leaked keys. Effort ~2–4h.

### §1.7 — Authentication Operational Hardening (Refresh Rotation, Session Management, RBAC)
- **Severity:** High · **Status:** ✅ FIXED (2026-06-28) — all seven sub-items implemented:
  1. **Refresh Token Rotation** — `auth.py:create_refresh_token` now embeds a `jti` (UUID). On `/refresh`, the old token is revoked in the DB and a brand-new `(token, jti)` pair is issued. If a *revoked* `jti` is presented, all sessions for that user are immediately wiped (anomaly detection / token reuse guard).
  2. **Server-side Session Storage** — new `RefreshToken` model (`Backend/models.py`) with `id/jti`, `user_id`, `issued_at`, `expires_at`, `revoked`, `device_info`. Alembic migration `0029088d6806` applied. Logout marks the session revoked in DB.
  3. **Richer `/me`** — endpoint now returns `id, email, role, nickname, permissions[], avatar, createdAt`.
  4. **RBAC Middleware** — `auth.py:require_permissions(*permissions)` is a reusable FastAPI Depends factory; role→permission map baked in; admin gets `[admin, project.read, project.write, project.delete, users.manage]`.
  5. **`__Host-` Cookie Prefixes** — `auth.py:get_cookie_name()` prepends `__Host-` in production (`COOKIE_SECURE=True`); all cookie reads/writes/deletes use it consistently.
  6. **Rate Limiting on Auth Endpoints** — `/refresh` now has `RateLimiter(20, 60)` in addition to existing `/login` (10/min) and `/register` (5/min).
  7. **Silent Refresh UX** — `http.ts` implements a full silent-refresh state machine: on 401, in-flight requests are queued, `/refresh` is called once, all queued requests retry on success, `/login` redirect only fires if refresh itself fails. `fetchSatellite` in `api.ts` integrates the same pattern.
- **Files touched:** `Backend/models.py`, `Backend/auth.py`, `Backend/main.py`, `Backend/migrations/versions/0029088d6806_add_refresh_tokens.py`, `Web/Frontend/src/lib/http.ts`, `Web/Frontend/src/lib/api.ts`.
- 📄 **Full walkthrough:** [`auth_hardening_walkthrough.md`](./auth_hardening_walkthrough.md) — implementation details, verification steps, file-by-file summary. Also logged in [`issue_fixed.md §D`](./issue_fixed.md).



---

## §2 Reliability

### §2.1 — Synthesis runs up to 4 sequential LLM calls synchronously inside the request
- **Severity:** High · **Status:** ✅ FIXED (Clarity_Stack_V3) — `ask_multi_model` is now `async`; the three provider extraction calls fan out concurrently via `asyncio.gather` + `asyncio.to_thread` (≈3× latency cut, verified 0.33s vs 0.9s serial), and the synthesis merge + direct-answer fallback also run via `to_thread` so the event loop is never blocked on a provider. (Durable queue/streaming is still the §10.9 follow-up; this is the §2.5 mitigation the audit called for.)
- **Evidence:** `Backend/main.py:919` `ask_multi_model` calls three providers in a loop (`:987`) then `generate_and_store_synthesis` (`:1058` → `providers.ask_synthesis`, 120s timeout). Frontend aborts at 120s (`Web/Frontend/src/lib/http.ts:14`).
- **Why it matters:** A single "ask" can occupy a worker for minutes. Under `uvicorn` with few workers this serializes users and exhausts capacity; the client may abort mid-flight (§3.2). No background task / queue.
- **Recommended direction:** Move extraction+synthesis to a background job (task queue / `BackgroundTasks` + polling or WebSocket push); make providers concurrent (`asyncio.gather`) with per-provider timeouts.

### §2.2 — Collaborative editor (Python variant) keeps state only in memory
- **Severity:** High · **Status:** ✅ FIXED (Clarity_Stack_V3) — the in-memory Python backend (`Editor_Service/main.py`, `rooms_data = {}`) and the other competing backends (`socket_server.py`, their `database.py`, `test_db.js`) are **deleted**. The single remaining backend is the file-based, Tier-0-hardened `Editor_Service/server.js` (the one `start_project.bat` / `npm start` actually launches), which persists every change to disk with atomic writes. Behavior no longer depends on which file is run.
- **Evidence:** `Editor_Service/main.py:20` `rooms_data = {}`; `send_changes` (`:34`) overwrites the in-memory dict; nothing is persisted (the Supabase insert on `create_workspace` writes empty content once). There are **three** competing editor backends: `Editor_Service/main.py` (Socket.IO/Supabase), `Editor_Service/socket_server.py`, and `Editor_Service/server.js` (file-based, the one `start_project.bat` launches).
- **Why it matters:** On the Python path, all collaborative content is lost on restart and `rooms_data` grows unbounded (memory leak). The triple implementation means behavior depends on which file is run; reviewers and operators cannot reason about it.
- **Recommended direction:** Pick one backend, delete the others, and persist on every change (debounced) with a durable store.

### §2.3 — Dual schema management: `create_all` + Alembic
- **Severity:** Medium · **Status:** ✅ FIXED (Clarity_Stack_V3) — `create_all` removed from `Backend/main.py`. Discovered the 5 migrations had drifted badly (empirically: they built only **7 of 13 tables**, missing `users/project_members/project_activity_logs/join_requests/quarantined_messages/synthesis` entirely + 16 columns — `create_all` had been silently masking this). Replaced the drifted chain with one **regenerated baseline** (`8026647f94d5`) autogenerated from the models, verified to match `create_all` output exactly (zero gaps). Startup now runs `_ensure_schema_at_head()`: **upgrade** for fresh DBs, **stamp** for pre-existing create_all DBs (adoption without re-running DDL), guarded by `RUN_MIGRATIONS_ON_STARTUP` (set `0` for multi-worker prod). Alembic is now the single source of truth.
- **Evidence:** `Backend/main.py:27` `Base.metadata.create_all(bind=engine)` ran on every boot, while `Backend/migrations/versions/*` existed (5 migrations).
- **Why it matters:** `create_all` only creates *missing* tables; it ignores column/type/default changes that migrations encode. Fresh DBs get the model shape, upgraded DBs get the migration shape → schema drift and "works on my machine" bugs (e.g. `server_default`/timezone migrations).
- **Recommended direction:** Remove `create_all`; make Alembic the single source of truth; run `alembic upgrade head` on deploy.

### §2.4 — No global React error boundary
- **Severity:** Medium · **Status:** ✅ FIXED (2026-06-28) — added `Web/Frontend/src/components/ErrorBoundary.tsx` (class boundary with `getDerivedStateFromError` + `componentDidCatch` that logs the real error) wrapping the whole app in `App.tsx`, with a "Try again" reset + "Go home" fallback. Directly addresses the "Boot Error masks real error" symptom — a secondary crash can no longer white-screen the SPA and hide the root cause.
- **Evidence:** `Web/Frontend/src/App.tsx` wraps routes in providers but no `ErrorBoundary`. (Auto-memory note "Boot Error masks real error" is the symptom of exactly this class.)
- **Why it matters:** Any uncaught render error white-screens the whole SPA with no recovery and an unhelpful stack, masking the real cause.
- **Recommended direction:** Add a top-level error boundary with a reset path and a route-level fallback.

### §2.5 — `Promise.race` DB timeout leaks the losing query
- **Severity:** Low · **Status:** ✅ FIXED (Clarity_Stack_V3) — `Satellite/routes/kg.js` now uses driver-level `.maxTimeMS(2000)` on the `KGSnapshot.findOne(...)` query instead of racing it against an uncancelled `setTimeout`. Mongo cancels the query server-side on overrun, so orphaned queries no longer pile up under the DB slowness that triggers the timeout. The catch detects the deadline via `err.code === 50 / codeName "MaxTimeMSExpired"` and still pivots to Live-Fetch.
- **Evidence:** `Satellite/routes/kg.js:41` races `KGSnapshot.findOne(...)` against a 2s timer; the Mongo query is not cancelled when the timer wins.
- **Why it matters:** Under DB slowness, orphaned queries accumulate, worsening the very contention that triggered the timeout.
- **Recommended direction:** Use driver-level `maxTimeMS`, and treat the timeout as the query's own deadline rather than racing an uncancelled promise.

### §2.6 — `/health` checks nothing but pulls a DB session
- **Severity:** Low · **Status:** ✅ FIXED (2026-06-28) — `/health` now runs `SELECT 1` against the injected session and returns **503** if it fails (so an orchestrator restarts a pod whose DB is unreachable), `{"status":"ok","db":"connected"}` otherwise.
- **Evidence:** `Backend/main.py:30` injects `db` but returns `{"status":"ok"}` without touching it.
- **Why it matters:** Health checks report healthy even when the DB is unreachable; orchestrators won't restart a broken pod.
- **Recommended direction:** Execute `SELECT 1` (and dependency pings) or drop the unused dependency.

---

## §3 Data Integrity

### §3.1 — Frontend "demo mode" silently swallows user data
- **Severity:** High · **Status:** ✅ FIXED (2026-06-28) — all write-path demo fakery removed from `Web/Frontend/src/lib/api.ts`: `createProject`, `createChat`, `createMessage`, `deleteChat` now always call the real API and throw on failure (never return synthetic success). Demo mode is now read-only and already visibly badged (the `isDemoMode()` banner on ProjectsPage/ChatsPage), satisfying §7.2. Reads still degrade gracefully to sample data behind that banner.
- **Evidence:** `Web/Frontend/src/lib/api.ts:276` `getProjects` catch → `useDemoMode = true`. Once set, `createProject` (`:328`), `createChat` (`:406`), `createMessage` (`:462`) write only to in-memory mock arrays and return a fake success object. The flag is module-global for the session.
- **Why it matters:** A single transient network blip flips the app into a fake-data mode for the rest of the session. The user creates projects/chats/messages, sees success, and loses everything on refresh — with no error. This is the most dangerous kind of data loss: silent and confidence-inspiring. (There is no default visible "demo mode" banner.)
- **Recommended direction:** Remove demo-mode writes entirely, or make it explicit, opt-in, visibly badged, and read-only. Never return synthetic success for a write that did not persist.

### §3.2 — "Ask" pipeline is not atomic
- **Severity:** Medium · **Status:** ✅ FIXED (Clarity_Stack_V3) — the AI response is now one atomic unit: provider messages + the `Synthesis` row + the synthesis `Message` are staged uncommitted and committed in a **single `db.commit()`**; any failure does `db.rollback()`, so a reply-group can never be left with provider rows but no synthesis (verified: forced-failure path leaves 0 orphan rows). The user message is intentionally committed first as its own valid unit (a later AI failure must not discard what the user typed). The derived KG build runs as a best-effort follow-on *after* the commit (rebuildable, so kept out of the atomic boundary).
- **Evidence:** `Backend/main.py:919` commits the user message (`:946`), then provider messages (`:1016`), then synthesis (`:1088`) in separate transactions; the quarantine path (`:633`) also commits independently.
- **Why it matters:** A provider/synthesis failure or client abort (§2.1) leaves orphaned user/assistant rows and reply-groups with no synthesis — corrupting the conversation graph that later feeds `build_chat_context` and the KG.
- **Recommended direction:** Wrap the unit of work in one transaction (or saga with compensation); only surface success after the synthesis row commits.

### §3.3 — Editor file persistence is non-atomic and shares one debounce timer
- **Severity:** Medium · **Status:** ✅ FIXED (Clarity_Stack_V3) — `writeJSON` writes to a temp file and `rename()`s into place (atomic on the same filesystem), so a crash mid-write can't truncate/corrupt `workspaces.json`. The debounce now has a **`MAX_SAVE_WAIT` cap**: the old version reset the timer on every keystroke, so a continuously-edited room never flushed (unbounded crash-loss window) — it now force-flushes at least every 10s under sustained edits (verified). Whole-file (vs per-workspace) persistence is kept **by design** at this scale; revisit per-workspace files only if it grows.
- **Evidence:** `Editor_Service/server.js:43` `writeJSON` uses `fs.writeFileSync` (non-atomic, no temp+rename); `scheduleSave` (`:89`) keys every workspace's save under a single `saveTimers["_main"]`.
- **Why it matters:** A crash during write can truncate `workspaces.json` (all workspaces in one file). A crash within the 1.5s debounce window loses recent edits. The committed `Editor_Service/data/*.json` files are also rewritten at runtime, so a clean checkout immediately has a dirty working tree.
- **Recommended direction:** Atomic write (temp file + `rename`), per-record persistence, and stop committing runtime data (see §9.1).

### §3.4 — Divergent synthesis-message creation paths
- **Severity:** Low · **Status:** ✅ FIXED (Clarity_Stack_V3) — both paths now build the synthesis `Message` via one `build_synthesis_message()` factory in `synthesis_service.py`, so the row shape is identical (`role="synthesis"`, `type="synthesis"`, `synthesis_id` wired, `accepted=True`, `signal_level="high"`). Also fixed a latent crash on the re-generation path: `save_or_update_synthesis` called `link_previous_decisions` with the wrong/missing `chat_id` arg.
- **Evidence:** `Backend/main.py:1072` (in `ask_multi_model`) sets `role="synthesis"`, `synthesis_id=synth.id`, `accepted=True`. The separate `:1443` (`/synthesis/generate`) sets `role="assistant"`, `sender="synthesis"`, no `synthesis_id`, `accepted=False`.
- **Why it matters:** Two code paths produce structurally different "synthesis" rows, so UI rendering, the `synthesis_id` wire, and `build_chat_context` treat them inconsistently.
- **Recommended direction:** One factory function for synthesis messages used by both paths.

### §3.5 — Unbounded message list endpoint
- **Severity:** Medium · **Status:** ✅ FIXED (2026-06-28) — `GET /chats/{id}/messages` now takes `limit` (default 500, max 1000) + `offset` query params and applies `.offset().limit()` on the existing `idx_messages_chatid_createdat` index, returning the latest page instead of the full unbounded history. Backward-compatible for any chat under 500 messages; longer histories can be paged.
- **Evidence:** `Backend/main.py:645` `GET /chats/{chat_id}/messages` returns `.all()` with no pagination/limit.
- **Why it matters:** Long-lived chats return ever-growing payloads → slow responses, large memory, slow render. (Also `ask` re-stores every provider's full output per message.)
- **Recommended direction:** Cursor/limit pagination; default page size; index already exists (`idx_messages_chatid_createdat`).

---

## §4 Performance

### §4.1 — Blocking SSL/socket work on the async event loop (ThreatLens)
- **Severity:** Medium · **Status:** ⛔ DEFERRED (ThreatLens out of current scope — see banner)
- **Evidence:** `ThreatLens_Service/app.py:130` `get_ssl_cert_info` uses synchronous `socket.create_connection` and is awaited from within `scrape_url`/`run_prediction` (async). The Levenshtein loop (`:492`) and heuristics run inline per request.
- **Why it matters:** Synchronous network I/O inside an async handler stalls the whole event loop, throttling all concurrent predictions.
- **Recommended direction:** Run blocking calls in a thread pool (`asyncio.to_thread`) or use async TLS; bound concurrency (a `batch_semaphore` exists but the blocking call escapes its benefit).

### §4.2 — SQLite as the primary multi-user store
- **Severity:** Medium / High (production) · **Status:** 🟡 PARTIAL (2026-06-28) — `Backend/database.py` now **reads `DATABASE_URL` from env** (default SQLite for dev) and makes the `check_same_thread` flag + WAL/FK/synchronous PRAGMAs **conditional on the SQLite dialect**, so the documented Postgres path is no longer dead code. **Still OPEN:** an actual Postgres deployment hasn't been validated. (`create_all` no longer shadows Alembic — §2.3 closed in Clarity_Stack_V3.) Default remains SQLite.
- **Evidence:** `Backend/database.py:8` hardcodes `sqlite:///./claritystack.db`; WAL is enabled (`:24`) but `DATABASE_URL` env is **never read** despite the migration comment (`:48-54`).
- **Why it matters:** SQLite permits one writer at a time. The write-heavy "ask" flow plus presence/membership writes will serialize and lock under real concurrency. The documented Postgres path is non-functional because the code ignores the env var.
- **Recommended direction:** Read `DATABASE_URL` from env (default SQLite for dev), make pragmas conditional on the SQLite dialect, and validate the Postgres path before launch.

### §4.3 — Fuzzy signal classifier on every message
- **Severity:** Low · **Status:** ✅ FIXED (Clarity_Stack_V3) — the duplicated hot-path heuristic is gone. `count_signal_words` (+ its `normalize`/`fuzzy_ratio`/`is_similar`/`TECH_KEYWORDS`/`STOPWORDS` and the local `import re`/`SequenceMatcher`) was already dead after the §6.2 shadow removal — it has now been **deleted** from `main.py`. The single live classifier is `signal_classify` (DistilBERT + heuristic fallback); no per-token `SequenceMatcher` runs on the `ask` path anymore.
- **Evidence:** `Backend/main.py:1168` `count_signal_words` runs `SequenceMatcher` for each token × ~30 keywords on every `ask`.
- **Why it matters:** Cheap individually, but it is duplicated logic (see §6.2) and runs on the hot path; worth consolidating.
- **Recommended direction:** Precompute keyword sets / use token hashing; single implementation.

---

## §5 Security (additional to §1)

### §5.1 — `client-login` mints a signed token for any project with no secret
- **Severity:** High · **Status:** ✅ FIXED (2026-06-28) — endpoint `POST /api/auth/client-login` **removed** from `Backend/main.py` (+ its `ClientLogin` model) and the "Client Access" toggle removed from `Web/Frontend/src/pages/Login.tsx` (now user/password only). The scheduler no longer depends on it: `cardScheduler.getServiceToken` mints a short-lived **service JWT locally** (`sub=service@claritystack.internal`, `role=service`, 10-min exp) signed with the shared `JWT_SECRET`; Core's `get_project_or_403` grants that reserved identity **read-only** project access. A proper owner-initiated client-share/invite flow is documented as future work.
- **Evidence:** `Backend/main.py:79` `POST /api/auth/client-login` accepts a `project_id`, and if the project exists, returns a signed JWT (`role:"client"`). No password, no authorization.
- **Why it matters:** Anyone who knows or enumerates a project id obtains a valid token. `Satellite/services/cardScheduler.js:14` `getServiceToken` even relies on this hole to mint "service" tokens — so the design depends on the vulnerability.
- **Recommended direction:** Remove anonymous token minting; issue project/client tokens only to authenticated owners via an explicit "share" action; use a real service credential for the scheduler.

### §5.2 — Ownership reassignment via `update_project`
- **Severity:** High · **Status:** ✅ FIXED (2026-06-28) — `owner` removed from the `update_project` editable set (now `{purpose, success_criteria, constraints}`). A PM can no longer self-assign ownership. A dedicated owner-only transfer endpoint remains future work.
- **Evidence:** `Backend/main.py:1203` `update_project` allows the field set `{"purpose","success_criteria","constraints","owner"}` (`:1221`). A PM passes `to-this-route` and the loop `setattr(project, "owner", attacker_email)`.
- **Why it matters:** A `pm` can set themselves as `owner`, gaining delete rights and full control — privilege escalation within the project.
- **Recommended direction:** Drop `owner` from the editable set; ownership transfer should be an explicit, owner-only, audited endpoint.

### §5.3 — `requirePM` is a no-op; role is trusted from the JWT
- **Severity:** Medium · **Status:** ✅ FIXED (Clarity_Stack_V3) — `requirePM` (`Satellite/middleware/auth.js`) is now an async guard that no longer trusts the JWT `role`. It reads `:projectId`, calls Core `GET /projects/:id/members` with the caller's Bearer token, and grants only if the **caller's own email** maps to `owner`/`pm` in Core's authoritative membership list (Core remains the single source of truth, same pattern as `requireProjectAccess`). Verified role is stashed on `req.user.projectRole`. Fail-closed: missing `:projectId` → 500, no token → 401, Core 401/403/404 → 401/403, Core unreachable → 502.
- **Evidence:** `Satellite/middleware/auth.js:59` "For now, trust the role from JWT. Phase 2 will add core API verification." It only checks `req.user` is set.
- **Why it matters:** Authorization decisions rely on a self-asserted role claim; combined with §1.1/§5.1, role gates are meaningless.
- **Recommended direction:** Verify role/membership against core per request, or sign short-lived scoped claims server-side.

### §5.4 — Tokens in `localStorage`; no revocation/refresh
- **Severity:** Medium · **Status:** ✅ FIXED (2026-06-28, hardened 2026-06-29) — migrated to hybrid auth: `httpOnly` access (15 min) + refresh (30 day) cookies with a JS-readable `csrf_token` and double-submit CSRF on cookie-authed mutations; service-to-service keeps the `Authorization: Bearer` path (cookie-first, header-fallback in `auth.py`). Stateful refresh-token rotation + DB session store (`RefreshToken`, migration `0029088d6806`) gives real revocation; a replayed (revoked) JTI wipes all of that user's sessions. Frontend reads **zero** tokens from `localStorage` (grep-verified). Full detail in [`issue_fixed.md §D`](./issue_fixed.md) and [`auth_hardening_walkthrough.md`](./auth_hardening_walkthrough.md). **2026-06-29 follow-up (`issue_fixed.md §D3`):** fixed a login `NameError`→500 (missing `request: Request` param) that the interrupted session left, and aligned the `/me` admin permission list with the `require_permissions` map.
- **Evidence:** `Web/Frontend/src/lib/http.ts:19` reads `localStorage.getItem("token")`; `Backend/auth.py:20` 60-min expiry, no refresh, no server-side revocation list.
- **Why it matters:** Any XSS exfiltrates a long-lived bearer token; logout cannot invalidate an issued token.
- **Recommended direction:** Prefer httpOnly cookies with CSRF protection or short access + rotating refresh tokens; add a revocation/jti mechanism.

### §5.5 — Over-permissive CORS in three services
- **Severity:** Medium · **Status:** ✅ FIXED (Clarity_Stack_V3) — bind hardening done: **Satellite** and **Editor** now `listen` on a configurable `BIND_HOST` that **defaults to `127.0.0.1`** (localhost-only); set `BIND_HOST=0.0.0.0` deliberately only when a reverse proxy/container fronts the service. Combined with the earlier (2026-06-28) explicit `ALLOWED_ORIGINS` allow-list (env-overridable via `CORS_ORIGINS`), both services no longer reflect arbitrary origins nor expose themselves on the LAN by default. The ThreatLens `allow_origins=["*"]` portion remains ⛔ DEFERRED (out of scope).
- **Evidence:** `Satellite/server.js:23` `app.use(cors())` (reflect any origin) + `app.listen(PORT,"0.0.0.0")`; `ThreatLens_Service/app.py:38` `allow_origins=["*"]` with `allow_credentials=True` (an invalid/unsafe combination); `Editor_Service/server.js:72` `cors:{origin:"*"}`.
- **Why it matters:** Any website can call these APIs from a victim's browser; binding to `0.0.0.0` exposes them on the LAN/host network.
- **Recommended direction:** Explicit origin allow-list per environment; never combine `*` with credentials; bind to localhost unless a reverse proxy fronts it.

### §5.6 — No rate limiting on expensive/unauthenticated endpoints
- **Severity:** Medium / High · **Status:** ✅ FIXED (2026-06-28, in-scope parts) — a real per-IP sliding-window rate limiter is now in place. **Core** (`Backend/rate_limit.py`, FastAPI dependency): `login` 10/min, `register` 5/min (brute-force), `ask` 30/min + `synthesis/generate` 20/min (paid-LLM/financial-DoS), returning 429 + `Retry-After`. **Satellite** (`middleware/rateLimit.js`): `generate/uml` 20/min and the four card-generation routes 10–15/min. **Caveat (documented):** the store is in-memory/per-process — under multiple workers the effective limit scales with worker count; move to Redis when scaling out (§10.9). ThreatLens `/predict/batch` portion remains DEFERRED (out of scope).
- **Evidence:** No limiter anywhere. Unauthenticated, LLM-triggering routes: `Backend/main.py:1420` `/synthesis/generate`, `Satellite/routes/generate.js:8` `/generate/uml`, `ThreatLens_Service/app.py:683` `/predict/batch`.
- **Why it matters:** Trivial cost-amplification / financial DoS (paid Groq/NVIDIA calls) and resource exhaustion.
- **Recommended direction:** Per-IP and per-user rate limits + auth on all LLM/scrape endpoints; quota accounting.

### §5.7 — Backend synthesis read/write routes are unauthenticated
- **Severity:** High · **Status:** ✅ FIXED (2026-06-28) — all four routes now require `get_current_user` + `get_chat_or_403`: `POST /chats/{id}/synthesis` and `POST .../synthesis/generate` are members-only (no `allow_public`, so anonymous callers can't trigger paid generation); the two GETs use `allow_public=True` to match sibling read routes. Consistent with the rest of the chat surface.
- **Evidence:** `Backend/main.py:1355` `POST /chats/{chat_id}/synthesis`, `:1377` `GET .../synthesis`, `:1385` `GET .../synthesis/{reply_group_id}`, `:1420` `POST .../synthesis/generate` — none depend on `get_current_user`/`get_chat_or_403` (unlike their siblings).
- **Why it matters:** IDOR: anyone can read or overwrite synthesis content for any chat id and trigger paid generation. Direct confidentiality/integrity/cost impact.
- **Recommended direction:** Apply `get_chat_or_403` to all four, consistent with the rest of the chat routes.

---

## §6 Architecture

### §6.1 — `Backend/main.py` is a 1,650-line god-file
- **Severity:** High (maintainability)
- **Evidence:** `Backend/main.py` mixes auth, projects, chats, messages, synthesis, websocket, middleware, the signal classifier, and CORS; imports are repeated inline throughout (e.g. `from pydantic import BaseModel` appears ~6 times; `from models import ...` scattered); commented-out dead routes (`:820-843`).
- **Why it matters:** High change-risk, hidden ordering dependencies (CORS registered last by design comment `:1489`), and difficult review — exactly where the §1/§5 auth gaps hide.
- **Recommended direction:** Split into routers (`auth`, `projects`, `chats`, `synthesis`, `ws`) with a shared deps module; one import block per file.

### §6.2 — Duplicate / shadowed logic
- **Severity:** High (tech debt) · **Status:** 🟡 PARTIAL (2026-06-28) — two of three closed: (1) the inline `classify_signal` in `main.py` that **shadowed** the `signal_classify` import is removed, so the intended ML/heuristic classifier is now the live one (also advances §11.3); (2) the dead `Web/Frontend/src/lib/backup.ts` (no-Authorization-header API copy) is **deleted**. **Still OPEN:** the three competing editor backends (§2.2) still need consolidation. (`count_signal_words` is now unused — slated for the dead-code purge.)
- **Evidence:**
  - `classify_signal` is imported from `signal_classify` (`Backend/main.py:12`) **and** redefined inline (`:1191`), shadowing the import.
  - `Web/Frontend/src/lib/api.ts` vs dead `Web/Frontend/src/lib/backup.ts` — the latter is an older copy whose `fetchApi` sends **no Authorization header** and hardcodes `127.0.0.1:8000` (`backup.ts:1`, `:262`). Confirmed unused (no imports), but a trap waiting to be re-wired.
  - Three editor backends (§2.2). ✅ **NOW CLOSED (Clarity_Stack_V3)** — the two dead Python backends + helpers deleted; `server.js` is the sole editor backend.
- **Why it matters:** Divergent copies drift; a future import of the wrong one silently disables auth or signal logic.
- **Recommended direction:** Delete dead modules; one canonical implementation each; lint for unused files.
- **Status:** ✅ FIXED (Clarity_Stack_V3) — all three sub-items now closed (inline shadow removed, dead `backup.ts` deleted, editor backends consolidated).

### §6.3 — Environment/secret naming is inconsistent across services
- **Severity:** Medium · **Status:** ✅ FIXED (Clarity_Stack_V3) — the secret name is unified on `JWT_SECRET` across Backend/Satellite/Editor (2026-06-28), and both Node services now ship a **validated, fail-fast env loader** (`Satellite/config/env.js`, `Editor_Service/config/env.js`). Each declares a required/optional schema, **aggregates every missing required var into one actionable boot error** (Satellite: `JWT_SECRET` + `MONGO_URI`; Editor: `JWT_SECRET`), and loads BEFORE routes/middleware so a misconfig fails loudly at boot instead of silently failing DB ops later. Optional vars (`PORT`/`BIND_HOST`/`CORE_API_URL`/`CORS_ORIGINS`/`SUPABASE_*`) carry safe local-dev defaults. Core Backend already fail-closes on `JWT_SECRET` (`Backend/auth.py`). Remaining tail (not loader-shaped): frontend `VITE_*` are **build-time** Vite vars (documented, not runtime-validatable) and a Backend aggregated loader is a nice-to-have on top of its existing fail-close.
- **Evidence:** Core uses `JWT_SECRET`; Editor uses `SECRET_KEY` (§1.5); frontend uses `VITE_API_BASE_URL`/`VITE_SRS_API_URL`/`VITE_SATELLITE_URL`/`VITE_EDITOR_BACKEND_URL`/`VITE_SUPABASE_*` with localhost fallbacks; Satellite uses `MONGO_URI`/`CORE_API_URL`/`SMTP_*`.
- **Why it matters:** A correct deployment is nearly impossible without tribal knowledge; mismatches fail silently (Editor) rather than loudly.
- **Recommended direction:** One documented env schema with a validated loader per service that fails fast on missing required vars.

### §6.4 — Hardcoded service URLs prevent non-localhost deployment
- **Severity:** Medium · **Status:** 🟡 PARTIAL (2026-06-28) — the two functional blockers are fixed: Core's `_call_satellite_cleanup` now reads `SATELLITE_API_URL` (was hardcoded `127.0.0.1:8003`), and the mailer join CTA reads `FRONTEND_URL` (was the broken `localhost:8080`, §7.3). Satellite's `CORE_API_URL` was already env-driven. **Still OPEN:** the dev CORS allow-lists in `main.py`/`SRS api.py` are still literal localhost lists (acceptable for dev), and the ThreatLens port-advert mismatch is DEFERRED (out of scope).
- **Evidence:** `Backend/main.py:717` `http://127.0.0.1:8003/.../cleanup`; `Satellite/services/cardScheduler.js:6` default `http://127.0.0.1:8000`; `Satellite/services/mailer.js:87` email CTA `http://localhost:8080/projects` (frontend actually runs on 8006); `ThreatLens_Service/app.py:698` root advertises port 8004 but the service runs on 8002 (`start_project.bat:20`).
- **Why it matters:** The system only works on one developer's machine; the join-request email link is broken for real users.
- **Recommended direction:** All inter-service URLs and the public frontend URL from env/config; one place to set the deployment base.

---

## §7 UX

### §7.1 — No client-side route protection
- **Severity:** Medium · **Status:** ✅ FIXED (2026-06-28) — added a `RequireAuth` outlet guard (`Web/Frontend/src/components/RequireAuth.tsx`); all protected routes in `App.tsx` are grouped under it, so a missing token redirects to `/login` immediately instead of flashing a protected shell. Public routes (`/`, `/login`, `/register`, `*`) stay open. 401 handling is now consistent across both clients: `fetchSatellite` clears the token + redirects to `/login` on 401, matching `http.ts`.
- **Evidence:** `Web/Frontend/src/App.tsx:62-105` registers all routes (projects, settings, chats, KG, cards) with no auth guard. Protection is implicit via API 401 → `window.location.href="/login"` (`http.ts:41`).
- **Why it matters:** Unauthenticated users load protected shells, see flashes of empty UI, then a hard redirect — janky and leaks app structure. Some pages (Satellite via `fetchSatellite`) don't even share the 401-redirect behavior (`api.ts:677`), so failures just toast/throw.
- **Recommended direction:** A `RequireAuth` wrapper; consistent 401 handling across `http.ts` and `fetchSatellite`.

### §7.2 — Silent/invisible demo mode confuses users
- **Severity:** Medium (UX facet of §3.1) · **Status:** ✅ FIXED (2026-06-28) — a visible "Demo Mode — backend unavailable, using sample data" banner is shown whenever `isDemoMode()` is true (ProjectsPage/ChatsPage), and writes no longer fake success (§3.1), so demo mode is now explicit and read-only.
- **Evidence:** `api.ts:282` logs to console only; no default UI indication that data is fake.
- **Why it matters:** Users cannot tell real from mock state.
- **Recommended direction:** Visible, persistent banner whenever `isDemoMode()` is true; block writes.

### §7.3 — Broken email CTA
- **Severity:** Low · **Status:** ✅ FIXED (2026-06-28) — the join-request email button now points at `${FRONTEND_URL}/projects` (env, default `http://localhost:8006`) instead of the dead `http://localhost:8080/projects`.
- **Evidence:** `Satellite/services/mailer.js:87` links to `localhost:8080`.
- **Why it matters:** Join-request emails are dead-ends.
- **Recommended direction:** Use the configured public frontend URL (§6.4).

---

## §8 Product Logic

### §8.1 — "Deterministic / compiler-grade merge" is actually a non-deterministic LLM call
- **Severity:** Low · **Status:** ✅ FIXED (Clarity_Stack_V3) — the drafted IR validators are now the **live gate**. `synthesize_content` (`Backend/synthesis_service.py`) — the single chokepoint for both LLM synthesis paths (`/ask` and `/chats/{id}/synthesis/generate`) — runs `validate_ir_structure(..., require_all_sections=False)` + `validate_conflict_semantics` on the cleaned output and raises `RuntimeError("synthesis_validation_failed: …")` on any violation. Fail-closed: both callers already catch → roll the AI unit back → return 503 instead of persisting/KG-ingesting malformed IR. Added a **subset mode** to `validate_ir_structure` (dropping an *empty* section is legal — the pipeline prunes them — but hallucinating one, emitting free-text, wrong order, or dup headers is not). Also fixed a pre-existing tuple-literal return annotation on both validators (`-> Tuple[bool, List[str]]`). Behavior verified: valid pruned output passes, free-text / wrong-order / bad-conflict / empty all rejected. (The earlier 2026-06-28 pass fixed the misleading "compiler-grade" wording → §11.6.) This is the enforcement half of §10.6; grounding synthesis *against source* is the remaining §10.6 work.
- **Evidence:** `Backend/main.py:1056` comment "Deterministic synthesis (compiler-grade merge)" → `generate_and_store_synthesis` → `providers.ask_synthesis` (`providers.py:318`, Groq Llama, temperature 0 but still a model). Meanwhile `synthesis_service.validate_ir_structure` and `validate_conflict_semantics` (`:149`, `:187`) are defined but **never called** in the pipeline (`generate_and_store_synthesis:210` skips them).
- **Why it matters:** The code/marketing claims a guarantee the implementation does not provide; the structural validators that *would* enforce it are dead code. The `RuntimeError`→"synthesis_validation_failed" branch (`main.py:1064`) is therefore effectively unreachable for validation reasons.
- **Recommended direction:** Either wire the validators in (enforce IR structure before commit) or correct the language to "LLM-assisted synthesis."

### §8.2 — Silent permanent auto-enrollment on public projects
- **Severity:** Low
- **Evidence:** `Backend/main.py:176-187` — first write to a public project auto-inserts the caller as a `member` permanently.
- **Why it matters:** Membership lists bloat with anyone who ever posted once; no way to "just browse and write." Surprising and hard to undo.
- **Recommended direction:** Make joining explicit, or use an ephemeral "contributor" status that doesn't persist as membership.

---

## §9 Technical Debt / Housekeeping

### §9.1 — Runtime data, build artifacts, and junk are committed to git
- **Severity:** Medium
- **Evidence:**
  - Runtime collab data tracked: `Editor_Service/data/workspaces.json`, `snapshots.json`, `activity.json` (rewritten at runtime → perpetually dirty tree, and real content leaks into history).
  - Build artifacts tracked: `Web/Frontend/vite.config.ts.timestamp-*.mjs` (two files).
  - A junk file named `k_` (contains a U+F022 private-use glyph) is tracked at repo root.
  - Large generated corpora tracked under `SRS_Service/data/checkpoints/**`, `ThreatLens_Service/data/*.csv` (incl. `top-1m.csv`), `pdf_raw_text.txt`, scratch scripts (`scratch_extract.py`, `test_*.py`).
- **Why it matters:** Noisy diffs, bloated clones, accidental content/data leakage, and confusion about what is source vs artifact.
- **Recommended direction:** Add these to `.gitignore`, `git rm --cached` them, and store large datasets/models out-of-band (LFS or a bucket).

### §9.2 — Dual lockfiles / dependency hygiene
- **Severity:** Low · **Status:** 🟡 PARTIAL (Clarity_Stack_V3) — the lockfile half is resolved: `bun.lockb` was already gitignored (`.gitignore:81 *.lockb`) so only `package-lock.json` is committed; the stale on-disk `Web/Frontend/bun.lockb` leftover has now been **deleted**, so npm is unambiguous locally too. **Still OPEN (flagged, not changed):** the `requirements_relaxed.txt` vs pinned split — left alone deliberately, removing a requirements file risks breaking `start_project.bat` / setup docs that may reference it; needs a deliberate consolidation pass.
- **Evidence:** `Web/Frontend/` ships both `bun.lockb` and `package-lock.json`; multiple `requirements_*` split into "relaxed" vs pinned (e.g. `Backend/requirements_relaxed.txt`).
- **Why it matters:** Ambiguous, non-reproducible installs; two package managers disagree.
- **Recommended direction:** One package manager + one lockfile per service; pin and audit (`npm audit` / `pip-audit`).

### §9.3 — Inconsistent/over-broad exception handling
- **Severity:** Low · **Status:** 🟡 PARTIAL (Clarity_Stack_V3) — two of three closed. (1) `Backend/providers.py` no longer echoes the upstream provider body into caller-facing errors (the HTTP layer is now the gateway's `_requests_transport`, which logs `resp.text[:500]` server-side and raises typed `_Retryable`/`_Fatal` errors — no upstream body leaks). (2) The catch-all quarantine in `create_message` (`main.py`) is **split**: `IntegrityError` → quarantine + 400 (genuine bad data), any other `SQLAlchemyError` (locked/unreachable DB) → `db.rollback()` + **503** (not the message's fault, no spurious quarantine), and the failed-commit session is rolled back before reuse; full detail logged server-side. **Still OPEN:** only the ThreatLens bare-`except` (⛔ DEFERRED) remains.
- **Evidence:** `Backend/providers.py:87` re-wraps everything as bare `Exception(str(e))` and can surface upstream API `response.text` (`:69`) into errors; `ThreatLens_Service/app.py:340` bare `except:`; `Backend/main.py:631` catches all exceptions to quarantine (masking real validation vs DB errors).
- **Why it matters:** Loss of error fidelity, potential provider-detail leakage, and harder debugging.
- **Recommended direction:** Catch specific exceptions; never echo upstream bodies to clients; log with context server-side.

### §9.4 — Deprecated/335 fragile framework usage
- **Severity:** Low
- **Evidence:** `ThreatLens_Service/app.py:50` `@app.on_event("startup")` (deprecated in modern FastAPI; prefer lifespan). Presence manager (`Backend/main.py:1533`) is single-process in-memory and won't work across multiple workers.
- **Why it matters:** Future framework upgrades break; horizontal scaling breaks presence/websocket state.
- **Recommended direction:** Migrate to lifespan handlers; back shared websocket state with Redis pub/sub if scaling beyond one process.

---

## §10 Strategic "Step Forward" Initiatives (from `take_step_forward.md`, re-prioritized)

> These are not defects in shipped behavior; they are the **leverage moves** that turn the prototype into a production/research-grade platform. Folded in here from `take_step_forward.md` so risk and roadmap live in one document. Priority below = remediation order relative to the §1–§9 defects, **not** the original report's effort rank. Rule: close the Critical/High defects (§1, §5) **before** investing in these.

### §10.1 — Platform layer first (the load-bearing decision)
- **Priority:** P1 (do before any other §10 item) · **Effort:** foundational
- **What:** extract cross-cutting concerns into a shared platform — (a) LLM Gateway, (b) shared auth/identity, (c) unified config/secret source, (d) shared observability, (e) typed service↔frontend contracts. (`take_step_forward.md` §4.)
- **Why it matters:** every other initiative becomes 3–5× cheaper and the §6.3/§6.4 fragmentation (per-service CORS, secrets, datastores, ports) stops multiplying with each new feature. Directly addresses the "wide but thin" architecture.

### §10.2 — Unified LLM Gateway (routing + cache + retry + fallback + budget)
- **Priority:** P1 · **Effort:** 1–2 wk · **take §5.1 (highest single ROI)** · **Status:** 🟡 PARTIAL — **v1 library shipped (Clarity_Stack_V3).** `Backend/llm_gateway.py` is the single server-side chokepoint and `providers._generic_chat` now routes every Core model call through it, providing: temp-0 response cache (TTL+LRU, sha256 key over provider/model/messages/temp/seed), retry + exponential backoff on 429/5xx/timeout, per-provider circuit breaker (open after N consecutive transient fails, cooldown), ordered fallback chains (synthesis now Groq→NVIDIA instead of 503-on-Groq-outage), process-wide token accounting + per-call structured logging, and an optional `LLM_BUDGET_TOKENS` cap. Config is all env-overridable; admin-only `GET /llm/stats` surfaces the counters. Behavior verified by an offline fake-transport test (14/14: cache hit/miss, retry-recovery, fallback, breaker open/skip, all-fail `GatewayError`, budget gate). **Still OPEN:** in-process only (cache/breaker/budget reset per worker — move to Redis with §10.9); the **Node Satellite `hfClient.js`** and the **UML `/api/llm` proxy** are not yet routed through a shared gateway; per-*tenant* (vs per-process) budgets + model routing-by-cost/latency are not implemented.
- **Why it matters:** model calls are scattered across Python (`providers.py`), Node (`hfClient.js`) and the browser (§1.6); no caching, retry, fallback, or cost telemetry. A single vendor outage or quota exhaustion takes down core reasoning. A gateway also *structurally* fixes §1.6 (keys never leave the server), §5.6 (rate limiting), and the import-time hard-fail risk. `temperature=0` extraction is perfectly cacheable.

### §10.3 — Make the ensemble honest + parallel + config-driven
- **Priority:** P2 · **Effort:** 1–2 wk · **take §5.3**
- **Evidence:** `Backend/main.py:978` labels providers `("groq","gemini","huggingface")`, but `providers.py:367,359` map `ask_gemini→Groq mixtral` and `ask_hf→NVIDIA llama`. The "three-provider ensemble" is really Groq-70b + Groq-8b + NVIDIA-70b, **mislabeled**. The richer 6-model `run_multi_model_extraction` is dead code (reachable only via `__main__`). Models run in a sequential for-loop; "confidence" is LLM self-reported.
- **Why it matters:** research-integrity hazard (the headline claim is not what runs) + ~3× latency from serial calls. Run the diverse set in parallel (`asyncio.gather`), compute *measured* inter-model agreement, version the ensemble composition. Pairs with §2.1 (async pipeline).

### §10.4 — Containerization + CI/CD + reproducible envs
- **Priority:** P2 · **Effort:** 1–2 wk · **take §5.8**
- **Evidence:** launch is `start_project.bat` opening 8 Windows terminal tabs assuming pre-built venvs + local Mongo/Supabase; no Dockerfile/compose, no `.github/`, `requirements_*.txt` saved in **UTF-16** (tooling-hostile).
- **Why it matters:** the system is not reproducibly buildable by a new contributor, reviewer, or deploy target. Blocks every deployment story and ties into §6.4 (localhost-only URLs). Dockerfile/compose (services + Postgres + Mongo + Redis) + Actions (lint → typecheck → test → build).

### §10.5 — Observability (structured logs, metrics, traces, cost)
- **Priority:** P2 · **Effort:** 1–2 wk · **take §5.7**
- **Evidence:** only instrumentation is the stdout `log_requests` middleware (`Backend/main.py:797`) across 8 separate terminals.
- **Why it matters:** you cannot answer "what failed, where, how often, at what cost." Required to operate the system and to notice the runaway LLM spend that §5.6 enables. Cheap once §10.1 exists.

### §10.6 — Grounding + IR schema validation (hallucination control)
- **Priority:** P2 · **Effort:** 1–2 wk · **take §5.5 (part 1)**
- **Why it matters:** nothing checks synthesis against source; the KG ingests whatever the LLM emits. The validators already drafted (§8.1 here / `synthesis_service.validate_ir_structure`) should be wired in and made the real gate behind the `synthesis_validation_failed` branch. Directly upgrades §8.1 from "dead code" to "enforced."

### §10.7 — Postgres migration (retire SQLite)
- **Priority:** P2 (follows §4.2) · **Effort:** 3–5 d · **take §2.4**
- **Status note:** `take_step_forward.md` marks this 🟡 — integrity was hardened (WAL/FK/single-engine, the old dual-`create_engine` bug is fixed) **but it is still SQLite**, and §4.2 here shows `DATABASE_URL` is never even read. Real migration is unstarted.

### §10.8 — Hybrid RAG / persistent memory
- **Priority:** P3 · **Effort:** 2–4 wk · **take §5.2**
- **Why it matters:** the assistant sees only the last 10 messages (`context_builder.build_chat_context(limit=10)`); it cannot recall earlier decisions or the KG it builds. Vector store (pgvector/Qdrant) + hybrid semantic+graph retrieval is the jump from "chat summarizer" to "project memory." Depends on §10.7.

### §10.9 — Job queue / event-driven orchestration
- **Priority:** P3 · **Effort:** 2–4 wk · **take §5.4**
- **Why it matters:** the durable fix for §2.1 (sync in-request LLM) and §3.2 (non-atomic, fire-and-forget cross-service calls like `_call_satellite_cleanup`). `/ask` enqueues a job and returns an id; schedulers (§9.4 single-process cron) become HA; cross-service effects become retryable events.

### §10.10 — Evaluation harness + experiment tracking
- **Priority:** P3 · **Effort:** 2–4 wk · **take §5.6**
- **Why it matters:** no way to answer "is extraction good?" or "did this prompt help?" No golden sets, seeds, or metrics. This is the line between a demo and a defensible research claim, and the CI gate that catches the silent model/prompt regressions in §11.5.

### §10.11 — Local-first inference behind the gateway
- **Priority:** P3 · **Effort:** 3–6 wk · **take §8.3**
- **Why it matters:** removes hard vendor dependency, cost, and the privacy problem of SRS/IP docs leaving infra. ThreatLens already proves local inference is in reach. Only sane after §10.2 (gateway) exists. See §12.

### §10.12 — Agent/orchestration + MCP servers
- **Priority:** P4 (future) · **Effort:** 3–4 wk · **take §5.9, §7**
- **Why it matters:** cross-feature reasoning ("one product" feel) and a novel distribution channel (KG/Retrieval MCP, §13). Explicitly gated behind the platform layer + queue + authZ — building MCP over today's unauthenticated endpoints (§1.3, §5.7) would *widen* the data-exposure hole.

---

## §11 Additional Hidden Weaknesses (from `take_step_forward.md` §6, not already covered above)

- **§11.1 — Silent cross-service drift.** `Backend/main.py:710` `_call_satellite_cleanup` and the Satellite per-chat KG fetch swallow exceptions (`console.warn`). Deletes can leave orphaned cards; deltas can be computed against partial KGs with no signal. **Severity: Medium.** (Overlaps §3.2; durably fixed by §10.9.)
- **§11.2 — Edge dedup by possibly-undefined id.** `Satellite/services/deltaEngine.js` `computeDiff` keys edges on `edgeId`; if the Core ever omits an edge id, all edges collapse to one `undefined` key and diffs become silently wrong. **Severity: Medium.** · **Status:** ✅ FIXED (2026-06-28) — added an `edgeKey()` helper that uses `edgeId` when present and otherwise a stable `from->to:relation` composite, so id-less edges no longer collapse into one bucket.
- **§11.3 — Heuristic classifier gates the whole pipeline.** `classify_signal` (fuzzy word-count) decides what is "noise" and silently drops substantive messages from all downstream knowledge with a canned reply; a trained BERT classifier sits unused on disk (`Backend/Signal_Classifier/`). **Severity: Medium.** (See also §4.3, §6.2.) · **Status:** 🟡 PARTIAL (2026-06-28) — the inline shadow that kept the trained classifier dead is removed (§6.2), so `signal_classify` (DistilBERT when weights are present, richer heuristic otherwise) is now the live path. **Still OPEN:** add the model weights to enable the ML path, and reconsider hard-dropping "noise" messages.
- **§11.4 — Self-reported confidence surfaced as measured.** The `CONFIDENCE` IR field is whatever the LLM claims, but the UI shows "HIGH confidence" as if computed. Research-integrity hazard. **Severity: Low/Medium.** (Fixed by §10.3's measured agreement.)
- **§11.5 — Reproducibility decay.** Hardcoded vendor model ids (`llama-3.3-70b-versatile`, etc.) are deprecated on the vendors' timeline, not yours; the day a model is retired, results change with no code change and no alert. No pinned snapshots, seeds, or eval. **Severity: Medium.** (Caught by §10.10.) · **Status:** ✅ FIXED (Clarity_Stack_V3) — all 6 vendor ids were scattered across `providers.py` (one repeated 3×); now pinned in a single `MODELS` registry + role constants (`SYNTHESIS_MODEL`/`EXTRACTION_PRIMARY`/`DIRECT_ANSWER_MODEL`), each **env-overridable** (`MODEL_GROQ_LLAMA`, `MODEL_NVIDIA_LLAMA`, …) so changing a pin is a deliberate, logged config act. `get_model_manifest()` is **logged at import**, so a vendor retirement surfaces as a config/log diff, not silent drift (the "no alert" gap). Added best-effort `MODEL_SEED` (default 42, `MODEL_SEED=""` disables) sent to Groq/NVIDIA — included **conditionally** so a strict provider can't 400 the call (NOT bit-determinism — §11.6). Also fixed the synthesis `model_used` label, which falsely recorded `"hf-qwen2.5-7b-synthesis"` while synthesis actually runs on Groq Llama — it now single-sources the real pinned id, so each row's provenance is truthful (the precondition for reproducing a run). Verified: manifest/seed parsing (none/int/bad) + truthful label. Remaining for §10.10: golden sets + a CI regression gate on top of these pins.
- **§11.6 — "`temperature=0` = deterministic" is false.** Hosted LLMs are not bit-reproducible; the "compiler-grade deterministic" framing (also §8.1) is overstated. **Severity: Low.** · **Status:** ✅ FIXED (2026-06-28) — the misleading `main.py` comment is corrected to "LLM-assisted synthesis … NOT bit-deterministic."
- **§11.7 — `Math.random()` React keys.** `Web/Frontend/src/pages/CardsPage.tsx:104` falls back to `Math.random().toString()` for a card id when the backend id is missing → key collisions and unstable reconciliation. **Severity: Low.** (Confirmed via grep.) · **Status:** ✅ FIXED (2026-06-28) — fallback is now a stable `card-${idx}-${title}` composite (render-stable) instead of `Math.random()`. (Other `Math.random()` uses in the frontend are animation/visual jitter, not keys.)

---

## §12 External Dependency & Vendor Lock-in Risk (from `take_step_forward.md` §8)

- **Severity:** High (operational) · **Priority:** addressed by §10.2 + §10.11
- **Risk register:** Core reasoning hard-depends on **Groq** + **NVIDIA NIM** (extraction+synthesis); Satellite cards on **HuggingFace**; Editor on **Supabase** (auth + realtime + DB — a *third* identity system and the heaviest lock-in); SRS/UML on a **cloud VLM**; ThreatLens on external feeds.
- **Cross-cutting gaps:** **no budget cap, no caching, no fallback, no cost telemetry** for any vendor. One outage or quota exhaustion takes down core functionality; runaway spend is invisible.
- **Recommended direction:** multi-provider fallback chains + temp-0 caching + per-tenant budgets in the gateway (§10.2); never hard-fail at import (degrade to read-only/local); stage local-first inference, embeddings, and OCR (§10.11). Local-first, cloud-optional, never cloud-required.

---

## §13 MCP / Future Opportunities (from `take_step_forward.md` §7)

- **Priority:** P4 (future; only after platform + authZ). **Standouts:** §13.1 **KG MCP server** (expose the project KG/cards as `query_decisions`/`get_conflicts`/`card_history` tools) and §13.2 **Retrieval MCP** (pairs with §10.8 RAG) — these turn ClarityStack from an app into a composable *knowledge provider*. The rest (Postgres/Filesystem/Observability/Eval/GitHub/Browser MCP) are opportunistic.
- **Hard precondition:** authZ (§1.3, §5.7) and per-project scoping must be enforced in the MCP layer first; an MCP surface over today's endpoints would expand the existing IDOR exposure.

---

## §14 Reconciliation: `take_step_forward.md` "DONE" claims vs. this audit

The roadmap's status overlay (branch `UI_enhanced`) is **accurate for the Core Backend but over-broad for the system as a whole.** Specifically:

| `take_step_forward.md` claim | Reality per this audit |
|------------------------------|------------------------|
| §2.1 JWT secret → ✅ DONE | True **only** for `Backend/auth.py` (fail-closed). Satellite (§1.1) and Editor (§1.5) still ship the `"HalaMadrid12345"` fallback / wrong env name. **Still Critical-open system-wide.** |
| §2.2 IDOR → ✅ DONE | True for Core chat/project mutating routes. **But** the whole Satellite service (§1.3), the Backend synthesis routes (§5.7), and the Editor (§1.5) have no tenancy checks. **Still Critical-open outside the Core.** |
| §2.3 Browser key leak → 🟡 PARTIAL | Confirmed: NVIDIA removed from `promptEngine.js`, but Groq/Gemini keys still inlined in `Dashboard.jsx` + `pureFrontendEngine.js` (§1.6). **Still Critical-open.** |
| §2.4 SQLite → 🟡 PARTIAL | Confirmed: integrity hardened, dual-engine fixed; still SQLite and `DATABASE_URL` not read (§4.2). |
| §6.1 Error-as-fact poisoning → ✅ DONE | Confirmed fixed: `providers.py:110` `_error_block` returns `None`; failed providers skipped. |
| §6.12 Dual `create_engine` → ✅ DONE | Confirmed: single engine + WAL + FK + `synchronous=NORMAL` (`database.py`). |

**Net:** the Tier-0 gate was closed **for the Core Backend only**. The same Tier-0 classes (forgeable secret, missing tenancy authZ, browser key leak) remain **wide open in the satellite/editor/UML services**, which is exactly why §1.1–§1.6 are filed as Critical here.

---

## Summary

### Issue counts
- **Defect findings (§1–§9, §11):** 41 — 6 Critical, 9 High, 14 Medium, 12 Low.
  - Critical: 6 (§1.1–§1.6)
  - High: 9 (§2.1, §2.2, §3.1, §5.1, §5.2, §5.7, §6.1, §6.2, plus §4.2 in production context)
  - Medium: 14 (§2.3, §2.4, §3.2, §3.3, §3.5, §4.1, §5.3, §5.4, §5.5, §5.6, §6.3, §6.4, §7.1, §9.1) + §11.1–§11.3, §11.5
  - Low: 12 (§2.5, §2.6, §3.4, §4.3, §7.2, §7.3, §8.1, §8.2, §9.2, §9.3, §9.4) + §11.4, §11.6, §11.7
  - (Counts overlap where an item spans categories; severities reflect the worst-case lens.)
- **Strategic initiatives (§10) folded in from `take_step_forward.md`:** 12 (§10.1–§10.12), plus dependency-risk (§12) and MCP/future (§13). These are roadmap leverage, not shipped defects.
- **Reconciliation (§14):** the roadmap's Tier-0 "DONE" markers hold for the Core Backend only; the same classes remain Critical-open in Satellite/Editor/UML (§1.1, §1.3, §1.5, §1.6, §5.7).

### Production-readiness assessment
**Not production-ready.** The system would fail a launch security review on day one. The authentication model is effectively broken end-to-end: a source-controlled fallback secret (§1.1), an env-name mismatch that disables Editor auth (§1.5), an endpoint that mints tokens with no credential (§5.1), and authorization that never checks tenancy (§1.3) together mean **any anonymous or low-privileged actor can read, modify, and destroy other tenants' data**. SSRF (§1.4) exposes internal infrastructure. Separately, the data layer cannot be trusted: the frontend silently fabricates success and loses writes (§3.1), the "ask" pipeline is non-atomic (§3.2), and the primary store is single-writer SQLite with the documented Postgres path disconnected from the code (§4.2).

This is a feature-rich, ambitious **prototype/academic** system. The product surface is large and the ideas are sound, but the cross-cutting concerns (authn/authz, tenancy, persistence durability, deployability) were not built for multi-tenant production.

### Highest-risk areas (in priority order)
1. **Identity & authorization** — §1.1, §1.5, §5.1, §5.2, §5.3, §5.7 (forged/forgeable tokens, no tenancy checks).
2. **Cross-tenant data access & destruction** — §1.2, §1.3, Editor (§1.5).
3. **Credential exposure & abuse** — §1.6 (browser-bundled vendor keys), §5.6/§12 (no budget/rate cap).
4. **SSRF / outbound fetch** — §1.4.
5. **Silent data loss** — §3.1, §3.2, §3.3.
6. **Persistence & scaling foundation** — §4.2, §2.2, §2.3.

### Recommended remediation order (defects first, then the §10 roadmap)

**Phase 0 — Tier-0 security gate, system-wide (hours–days). Do before any external exposure.**
1. Freeze + rotate every leaked secret; make every service fail-closed on missing secret; unify the secret env name. (§1.1, §1.5, §6.3)
2. Add tenancy/authorization to every Satellite and Backend-synthesis route; lock down `internal/cleanup`. (§1.2, §1.3, §5.7)
3. Move the UML browser vendor keys behind the server proxy; rotate them. (§1.6)
4. Block private-range/metadata SSRF and authenticate ThreatLens. (§1.4)
5. Remove anonymous token minting and ownership-reassignment escalation. (§5.1, §5.2)

**Phase 1 — Data trust & foundations (days–weeks).**
6. Kill silent demo-mode writes; make the "ask" flow atomic. (§3.1, §3.2)
7. One editor backend with durable atomic writes; read `DATABASE_URL`; retire `create_all` for Alembic. (§2.2, §3.3, §4.2, §2.3)
8. Add rate limiting + CORS allow-lists; route guards + consistent 401 handling. (§5.5, §5.6, §7.1)
9. Refactor the god-file, delete dead/duplicate modules, purge committed artifacts. (§6.1, §6.2, §9.1)

**Phase 2 — Strategic platform (the §10 roadmap, in priority order).**
10. Platform layer + LLM Gateway (P1: §10.1, §10.2) → honest/parallel ensemble, Docker+CI, observability, grounding, Postgres (P2: §10.3–§10.7) → RAG, queue, eval, local-first (P3: §10.8–§10.11) → agent/MCP (P4: §10.12, §13).

> **Sequencing note:** Phase 0 is non-negotiable and cheap. Phase 2's effort estimates assume §10.1/§10.2 land first — they make every later item 3–5× cheaper. Do not start §10.12/§13 (agent/MCP) until authZ (Phase 0 #2) is closed, or it widens the exposure.

> **Note on method:** Findings were derived by reading source across all services and tracing execution/auth paths; they were not validated against a running deployment. Before remediation, each Critical/High should be reproduced in a controlled environment to confirm exploitability and scope. `take_step_forward.md` ✅/🟡 status markers were re-verified against current code (see §14).

---

# Addendum: Senior Architectural Review & V3 Production Roadmap

*The following review assesses ClarityStack as an open-source, production-grade system rather than an MVP/Academic project. It identifies the operational maturity gaps separating a "working prototype" from a scalable, production-ready product.*

## 🔴 Tier 1 (Biggest Missing Pieces)
*These are the things that make a project feel "production-grade."*

### 1. Automated Testing ⭐⭐⭐⭐⭐ (Biggest)
* **Current:** Almost no mention of tests.
* **Missing:** Unit tests, Integration tests, API tests, End-to-end tests, Coverage.
* **Example:** `pytest` (Backend), `Vitest` (Frontend), `Playwright` (E2E), `Postman/Newman` (API).
* **Impact:** VERY HIGH. A senior engineer immediately looks for tests.

### 2. Observability ⭐⭐⭐⭐⭐
* **Current:** You have logs. But logging ≠ observability.
* **Missing:** Metrics, traces, dashboards, request IDs, correlation IDs.
* **Example:** Passing a `request_id=abc` from Frontend → Backend → Satellite → Mongo → Logs so every service can trace a single request.
* **Impact:** Right now, debugging across services is harder than it needs to be.

### 3. Event-Driven Architecture ⭐⭐⭐⭐☆
* **Current:** Everything talks over REST (Backend → Satellite → Editor).
* **Missing:** Backend → **Event Bus** → Satellite → Notification → Analytics.
* **Example:** Kafka, RabbitMQ, Redis Streams, NATS.
* **Impact:** This is a major production improvement for decoupling services.

### 4. Search ⭐⭐⭐⭐⭐
* **Current:** You have a Knowledge Graph. But searching? Huge gap.
* **Missing:** Embeddings → Vector DB → Hybrid Search → Reranking.
* **Impact:** Without search, knowledge systems don't scale.

### 5. AI Evaluation ⭐⭐⭐⭐⭐ (The single biggest gap overall)
* **Current:** You explain the AI architecture, but you don't evaluate it. If someone asks, "How do you know your synthesis is good?", the current answer is weak.
* **Missing:** Accuracy, Latency, Cost, Precision, Recall, Ground Truth, Human Evaluation.
* **Impact:** Modern AI systems are judged by evaluation, not just architecture. You need an evaluation framework to prove the pipeline works.

---

## 🟠 Tier 2

### 6. Caching
* **Current:** Everything appears live.
* **Missing:** Redis → Frequently used cards → Chat history → Project metadata.

### 7. Background Queue
* **Current:** HTTP → Generate Card → Wait.
* **Missing:** HTTP → Queue → Worker → Notify.

### 8. Secrets Management
* **Current:** Environment variables only.
* **Missing:** Vault, Secrets Manager, Docker Secrets.

### 9. Rate Limiting (Expanded)
* **Current:** Only Auth and basic LLM limits.
* **Missing:** Broader limits on AI endpoints, Card generation, SRS, Graph, Search.

### 10. Multi-tenancy
* **Current:** You have RBAC and Project Guards.
* **Missing:** True tenant isolation, Resource quotas, Organization/Billing structures.

---

## 🟡 Tier 3

### 11. Configuration Management
* **Missing:** Clean separation for `dev`, `test`, `staging`, `prod`.

### 12. API Versioning
* **Missing:** `/v1/`, `/v2/` URL structures to allow non-breaking evolution.

### 13. Feature Flags
* **Missing:** Enable/Disable toggles, phased rollouts, A/B experiments.

### 14. Retry Policies
* **Missing:** Circuit Breakers, Timeouts, Exponential Backoff instead of direct retries.

### 15. Deep Health Checks
* **Missing:** `DB`, `Mongo`, `LLMs`, `Filesystem`, `Redis`.
* **Current:** The `/health` endpoint is basic (DB ping only).

---

## 🟢 Architecture Improvements (Maturity vs. Bugs)

* **Knowledge Graph:** Move from "Store Everything" to Semantic deduplication, Entity resolution, Ontology, Confidence propagation.
* **Temporal Cards:** Auto merge, Conflict detection, Merge suggestions.
* **SRS:** Evaluation dataset, Confidence calibration, False positive analysis.
* **Editor:** Upgrade from Last-Write-Wins to Operational Transform (OT) or CRDT.

## 🛠 Operational / Non-Functional Requirements

* **DevOps:** Docker Compose, GitHub Actions, CI/CD, Image scanning, Dependabot, Automatic releases.
* **Monitoring:** Prometheus, Grafana, OpenTelemetry, Jaeger, Sentry.
* **Security:** Content Security Policy (CSP), XSS headers, Security.txt, Secret scanning, Audit logging, Account lockout, Password reset, MFA.
* **AI Ops:** Prompt versioning, Benchmarking, Cost analysis, Fallback policies, Model registry.
* **Scalability:** Redis, Postgres, Queue, Load Balancer, Object Storage, CDN.

---

## 📋 Final Senior Review Scorecard

| Area                 | Rating     | Biggest Gap                         |
| -------------------- | ---------- | ----------------------------------- |
| **Documentation**    | **9.9/10** | Very little to improve              |
| **Architecture**     | **9.5/10** | Event-driven communication          |
| **Backend**          | **9.4/10** | Automated testing                   |
| **Database**         | **9.4/10** | Search & indexing                   |
| **Security**         | **9.4/10** | MFA, audit logs                     |
| **Frontend**         | **9.2/10** | E2E tests                           |
| **AI Pipeline**      | **9.0/10** | Evaluation framework                |
| **Production Readiness** | **8.0/10** | Operations rather than architecture |
| **DevOps**           | **6.8/10** | CI/CD, containers, deployments      |
| **Observability**    | **6.8/10** | Metrics, tracing, dashboards        |

### The Encouraging Part
Notice where almost all of the low scores are: DevOps, Observability, AI evaluation, and Operational maturity. 

Those are **not** foundational architecture flaws. They are the kinds of capabilities teams typically add as a system moves from a solid MVP to a production service. There are no fundamental issues like "wrong database," "poor separation of concerns," or "unmaintainable architecture." The remaining work is largely about making the system easier to operate, measure, and evolve at scale. That is a much better position to be in than having to redesign the core architecture.
