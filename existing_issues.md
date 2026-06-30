# Existing Issues — ClarityStack Forensic Audit

> **Mode:** Forensic Project Audit (no code was changed; this is a findings document).
> **Scope:** Full monorepo — `Backend/` (FastAPI core), `Satellite/` (Express + MongoDB), `Editor_Service/` (Node + Python, collab editor), `ThreatLens_Service/` (FastAPI phishing ML), `SRS_Service/` & `UML_Clarity_Service/` (FastAPI pipelines), `Web/Frontend/` (React/Vite/TS).
> **Auditors' lens:** Architecture, Security, Reliability, Performance, Data Integrity, UX, Product Logic.
> **Status legend:** OPEN / FIXED / ACCEPTED / DOCUMENTED / DEFERRED. All items below are **OPEN** unless noted.
>
> **Housekeeping (2026-07-01):** to keep this a live "what's still open" register, fully-resolved
> items have been **collapsed to a one-line pointer** (`✅ — see issue_fixed.md`); their full
> remediation write-ups live in [`issue_fixed.md`](./issue_fixed.md) (sections A–J). Items that are
> still **OPEN / 🟡 PARTIAL / ⛔ DEFERRED** keep their full detail here. (§15 fixes point to the §15
> remediation table; §16/§17 to `issue_fixed.md §E/§J`.)

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
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §1.2 — Unauthenticated/forgeable mass-deletion endpoint (Satellite internal cleanup)
- **Severity:** Critical · **Status:** 🟡 PARTIAL (2026-06-28) — the **forgeability vector is closed**: `requireInternalAuth` no longer falls back to the public `"HalaMadrid12345"` secret (Step 1, fail-closed), so a `role:"internal"` token can now only be minted by a holder of the rotated `JWT_SECRET` — i.e. the Core service itself (`_call_satellite_cleanup`). **Still OPEN (deferred hardening):** the channel is still user-JWT-shaped rather than a dedicated service credential / mTLS, and deletes are hard (no soft-delete + retention). Lower priority now that forgery is impossible without the secret.
- **Evidence:** `Satellite/routes/internal.js:31` `POST /api/satellite/internal/cleanup` is guarded only by `requireInternalAuth`, which trusts a JWT signed with the §1.1 fallback secret. On `scope:"project"` it runs `TemporalCard.deleteMany`, `GraphDelta.deleteMany`, `KGSnapshot.deleteMany` filtered solely by an attacker-supplied `id`.
- **Why it matters:** A forged internal token (trivial per §1.1) lets an attacker wipe all temporal cards / deltas / KG snapshots for **any** project. Irreversible, cross-tenant data destruction.
- **Recommended direction:** Mutual-auth between core and satellite (mTLS or a dedicated, rotated service secret distinct from user JWT), bind cleanup to a verified server-to-server channel, and soft-delete with retention before hard delete.

### §1.3 — Cross-tenant IDOR across the entire Satellite service
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §1.4 — Server-Side Request Forgery in ThreatLens (`/predict`, `/predict/batch`)
- **Severity:** Critical · **Status:** ⛔ DEFERRED (ThreatLens out of current scope — see banner)
- **Evidence:** `ThreatLens_Service/app.py:674` `/predict` and `:683` `/predict/batch` are unauthenticated and feed a user-supplied URL into `scrape_url` (`:266`, `httpx ... follow_redirects=True`), `get_ssl_cert_info` (`:130`, raw `socket.create_connection((hostname,443))`), and `resolve_redirect` (`:328`). The `is_ip`/private-IP logic only adjusts a *risk score* — it never blocks the outbound fetch.
- **Why it matters:** An attacker submits `http://169.254.169.254/latest/meta-data/`, `http://127.0.0.1:8000/...`, or any internal host. The server fetches it and returns title/headers/text in the response. Classic cloud-metadata / internal-service SSRF. `/predict/batch` accepts an unbounded `urls` list → SSRF amplification and DoS. CORS is `*` with credentials, so any site can drive it.
- **Reproduction:** `POST /predict {"url":"http://127.0.0.1:8000/projects/public"}` → response leaks the internal service's body.
- **Recommended direction:** Resolve DNS then block RFC1918 / loopback / link-local / metadata ranges *before* any connect; disable redirects to private targets; cap batch size; require auth + rate limit; run egress through an allow-listed proxy.

### §1.5 — Editor service: env-name mismatch silently disables auth, then exposes all workspaces
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §1.6 — Vendor LLM API keys shipped into the browser bundle (UML-Clarity)
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §1.7 — Authentication Operational Hardening (Refresh Rotation, Session Management, RBAC)
- **Status:** ✅ Fixed — see [`issue_fixed.md §D`](./issue_fixed.md).

## §2 Reliability

### §2.1 — Synthesis runs up to 4 sequential LLM calls synchronously inside the request
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §2.2 — Collaborative editor (Python variant) keeps state only in memory
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §2.3 — Dual schema management: `create_all` + Alembic
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §2.4 — No global React error boundary
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §2.5 — `Promise.race` DB timeout leaks the losing query
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §2.6 — `/health` checks nothing but pulls a DB session
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

## §3 Data Integrity

### §3.1 — Frontend "demo mode" silently swallows user data
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §3.2 — "Ask" pipeline is not atomic
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §3.3 — Editor file persistence is non-atomic and shares one debounce timer
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §3.4 — Divergent synthesis-message creation paths
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §3.5 — Unbounded message list endpoint
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

## §4 Performance

### §4.1 — Blocking SSL/socket work on the async event loop (ThreatLens)
- **Severity:** Medium · **Status:** ⛔ DEFERRED (ThreatLens out of current scope — see banner)
- **Evidence:** `ThreatLens_Service/app.py:130` `get_ssl_cert_info` uses synchronous `socket.create_connection` and is awaited from within `scrape_url`/`run_prediction` (async). The Levenshtein loop (`:492`) and heuristics run inline per request.
- **Why it matters:** Synchronous network I/O inside an async handler stalls the whole event loop, throttling all concurrent predictions.
- **Recommended direction:** Run blocking calls in a thread pool (`asyncio.to_thread`) or use async TLS; bound concurrency (a `batch_semaphore` exists but the blocking call escapes its benefit).

### §4.2 — SQLite as the primary multi-user store
- **Status:** ✅ Fixed — see [`issue_fixed.md §I`](./issue_fixed.md).

### §4.3 — Fuzzy signal classifier on every message
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

## §5 Security (additional to §1)

### §5.1 — `client-login` mints a signed token for any project with no secret
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §5.2 — Ownership reassignment via `update_project`
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §5.3 — `requirePM` is a no-op; role is trusted from the JWT
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §5.4 — Tokens in `localStorage`; no revocation/refresh
- **Status:** ✅ Fixed — see [`issue_fixed.md §D`](./issue_fixed.md).

### §5.5 — Over-permissive CORS in three services
- **Severity:** Medium · **Status:** ✅ FIXED (Clarity_Stack_V3) — bind hardening done: **Satellite** and **Editor** now `listen` on a configurable `BIND_HOST` that **defaults to `127.0.0.1`** (localhost-only); set `BIND_HOST=0.0.0.0` deliberately only when a reverse proxy/container fronts the service. Combined with the earlier (2026-06-28) explicit `ALLOWED_ORIGINS` allow-list (env-overridable via `CORS_ORIGINS`), both services no longer reflect arbitrary origins nor expose themselves on the LAN by default. The ThreatLens `allow_origins=["*"]` portion remains ⛔ DEFERRED (out of scope).
- **Evidence:** `Satellite/server.js:23` `app.use(cors())` (reflect any origin) + `app.listen(PORT,"0.0.0.0")`; `ThreatLens_Service/app.py:38` `allow_origins=["*"]` with `allow_credentials=True` (an invalid/unsafe combination); `Editor_Service/server.js:72` `cors:{origin:"*"}`.
- **Why it matters:** Any website can call these APIs from a victim's browser; binding to `0.0.0.0` exposes them on the LAN/host network.
- **Recommended direction:** Explicit origin allow-list per environment; never combine `*` with credentials; bind to localhost unless a reverse proxy fronts it.

### §5.6 — No rate limiting on expensive/unauthenticated endpoints
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §5.7 — Backend synthesis read/write routes are unauthenticated
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

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
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §6.4 — Hardcoded service URLs prevent non-localhost deployment
- **Severity:** Medium · **Status:** 🟡 PARTIAL (2026-06-28) — the two functional blockers are fixed: Core's `_call_satellite_cleanup` now reads `SATELLITE_API_URL` (was hardcoded `127.0.0.1:8003`), and the mailer join CTA reads `FRONTEND_URL` (was the broken `localhost:8080`, §7.3). Satellite's `CORE_API_URL` was already env-driven. **Still OPEN:** the dev CORS allow-lists in `main.py`/`SRS api.py` are still literal localhost lists (acceptable for dev), and the ThreatLens port-advert mismatch is DEFERRED (out of scope).
- **Evidence:** `Backend/main.py:717` `http://127.0.0.1:8003/.../cleanup`; `Satellite/services/cardScheduler.js:6` default `http://127.0.0.1:8000`; `Satellite/services/mailer.js:87` email CTA `http://localhost:8080/projects` (frontend actually runs on 8006); `ThreatLens_Service/app.py:698` root advertises port 8004 but the service runs on 8002 (`start_project.bat:20`).
- **Why it matters:** The system only works on one developer's machine; the join-request email link is broken for real users.
- **Recommended direction:** All inter-service URLs and the public frontend URL from env/config; one place to set the deployment base.

---

## §7 UX

### §7.1 — No client-side route protection
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §7.2 — Silent/invisible demo mode confuses users
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

### §7.3 — Broken email CTA
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

## §8 Product Logic

### §8.1 — "Deterministic / compiler-grade merge" is actually a non-deterministic LLM call
- **Status:** ✅ Fixed — see [`issue_fixed.md`](./issue_fixed.md).

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
- **Priority:** P2 · **Effort:** 1–2 wk · **take §5.8** · **Status:** 🟡 PARTIAL (2026-06-30, extended again) — **both halves now exist**. *CI:* `.github/workflows/ci.yml` runs **four** fast, network-free jobs — backend `pytest`, satellite `node --test`, a **frontend job (`tsc` typecheck + `vitest` unit tests + `vite build` as hard gates; `eslint` non-blocking)**, and a **`compose-validate` job (`docker compose config -q`)** — on every push to `main`/`Clarity_Stack_**` and PRs to `main`. Backend installs a **minimal `Backend/requirements_ci.txt`** (no torch/transformers — lazy in app code, unreached by the tests), **verified green in a clean venv**. The two **UTF-16 `requirements_*.txt`** (`Backend/requirements_backend.txt`, `UML_Clarity_Service/backend/requirements_uml_backend.txt`) are now **re-saved as UTF-8/LF** (the rest were already ASCII). *Containerization:* a **Dockerfile + `.dockerignore` per service** (Backend, Satellite, Editor, SRS, UML backend+UI, Frontend) plus a **whole-stack `docker-compose.yml`** (7 wired services + Postgres + Mongo + Redis, healthchecks, `.env.docker.example`) now replace `start_project.bat`'s 8 terminal tabs. Compose **validates clean** and **all 7 service images now build green** (`docker compose build`, 2026-06-30) — including the torch-heavy backend (~12 GB) and srs (~9 GB) images once the ML wheels were pulled. The build surfaced one real defect: `UML_Clarity_Service/package-lock.json` was out of sync with package.json (`Missing: @emnapi/*`), so strict `npm ci` failed; the lockfile was regenerated inside `node:20-slim` (matching the container's npm) and is now in sync. **Python lint + coverage also added:** the backend job now runs **ruff** (hard gate on the real-bug rules E9/F63/F7/F82 — clean today; full pyflakes non-blocking, surfacing ~44 cleanliness hits) and a **pytest coverage gate** (`--cov-fail-under=70`, scoped via `.coveragerc` to the engine modules; currently ≈79%). The **full pyflakes pass is now a hard gate** (2026-06-30): the ~44 cleanliness hits (unused imports/vars/re-imports, unused exception bindings, two authz-gate calls whose return was assigned but never used) were cleaned across the Backend app code and the CI step dropped `continue-on-error`, so the `F` set can't regress. **Still OPEN:** slim the torch images (CPU-only wheel + multi-stage prune — backend ~12 GB / srs ~9 GB are functional but fat), image scanning/Dependabot, ESLint's 188 pre-existing errors (mostly `no-explicit-any`; stays non-blocking — separate larger cleanup), and `mypy` typing. (Note: a committed CI step must not outrun its deps — CI #4/#5 went red because the ruff/coverage steps were committed before `ruff`/`pytest-cov` landed in `requirements_ci.txt` + `.coveragerc`.) See [`issue_fixed.md §F2`](./issue_fixed.md).
- **Evidence:** launch was `start_project.bat` opening 8 Windows terminal tabs assuming pre-built venvs + local Mongo/Supabase; ~~no Dockerfile/compose~~ (added 2026-06-30 — per-service Dockerfiles + whole-stack `docker-compose.yml`), ~~no `.github/`~~ (CI added 2026-06-30), ~~`requirements_*.txt` saved in **UTF-16**~~ (re-saved UTF-8/LF 2026-06-30).
- **Why it matters:** the system is not reproducibly buildable by a new contributor, reviewer, or deploy target. Blocks every deployment story and ties into §6.4 (localhost-only URLs). Dockerfile/compose (services + Postgres + Mongo + Redis) + Actions (lint → typecheck → test → build).

### §10.5 — Observability (structured logs, metrics, traces, cost)
- **Status:** ✅ Fixed — see [`issue_fixed.md §G`](./issue_fixed.md).

### §10.6 — Grounding + IR schema validation (hallucination control)
- **Priority:** P2 · **Effort:** 1–2 wk · **take §5.5 (part 1)** · **Status:** 🟡 PARTIAL (2026-06-30) — **both halves now exist**. *Schema validation:* `validate_ir_structure` is the real fail-closed gate behind `synthesis_validation_failed` (§8.1, enforced). *Grounding:* a new `Backend/grounding.py` cites each synthesis IR bullet back to the provider messages that support it — reusing the KG token model (§10.3 parity) with an **asymmetric coverage** measure (fraction of the bullet's tokens present in a source) — and flags any bullet with no covering source as `grounded=false` (the hallucination signal). Exposed read-only at **GET `/chats/{chat_id}/synthesis/{reply_group_id}/grounding`** (recomputed from the stored synthesis + its provider messages; nothing persisted), returning per-bullet citations + a grounding ratio. **Still OPEN:** persisting citations alongside the synthesis (schema change) and surfacing them in the UI; grounding against the original user transcript, not just provider extractions.
- **Why it matters:** nothing checked synthesis against source; the KG ingests whatever the LLM emits. The validators already drafted (§8.1 here / `synthesis_service.validate_ir_structure`) are now wired in as the real gate, and grounding adds the source-citation half. Upgrades §8.1 from "dead code" to "enforced" and adds a measurable hallucination signal.

### §10.7 — Postgres migration (retire SQLite)
- **Status:** ✅ Fixed — see [`issue_fixed.md §I`](./issue_fixed.md).

### §10.8 — Hybrid RAG / persistent memory
- **Priority:** P3 · **Effort:** 2–4 wk · **take §5.2**
- **Why it matters:** the assistant sees only the last 10 messages (`context_builder.build_chat_context(limit=10)`); it cannot recall earlier decisions or the KG it builds. Vector store (pgvector/Qdrant) + hybrid semantic+graph retrieval is the jump from "chat summarizer" to "project memory." Depends on §10.7.

### §10.9 — Job queue / event-driven orchestration
- **Priority:** P3 · **Effort:** 2–4 wk · **take §5.4**
- **Why it matters:** the durable fix for §2.1 (sync in-request LLM) and §3.2 (non-atomic, fire-and-forget cross-service calls like `_call_satellite_cleanup`). `/ask` enqueues a job and returns an id; schedulers (§9.4 single-process cron) become HA; cross-service effects become retryable events.

### §10.10 — Evaluation harness + experiment tracking
- **Priority:** P3 · **Effort:** 2–4 wk · **take §5.6** · **Status:** 🟡 PARTIAL (2026-06-30) — the **harness + golden gate are shipped**. `Backend/eval/` provides content-overlap precision/recall/F1 scoring (reusing the KG token model, §10.3 parity), a **10-case golden set** (raw model output → expected canonical IR), and an OFFLINE runner that scores the **real `prune→parse` extraction pipeline** with no network — wired into pytest as a **CI quality gate** (micro-F1 ≥ 0.95; currently 1.00, 27 bullets, 0 FP/FN, with explicit tests that the scorer *discriminates*). An ONLINE runner now (a) scores **live-ensemble extraction accuracy** against a **labeled `transcript → IR` golden set** (`Backend/eval/transcripts.py` — 4 realistic discussions → hand-labeled canonical IR, graded with the *same* P/R/F1 scorer over the substantive sections, metadata excluded) by running the **real production path** (transcript → ensemble → `tag_with_provider` → `synthesize_content` → `parse_ir_from_synthesis`), and (b) profiles the live ensemble for latency (real) + cost (only when priced, never fabricated). The online run also **reports `MODEL_SEED`** (default 42; temperature 0 + pinned seed = best-effort determinism, honestly flagged as not bit-reproducible on hosted LLMs — §8.1/§11.6). Seven new **offline-deterministic guards** protect the transcript infra (label well-formedness, the `tag_with_provider` mirror staying in lockstep with `main`, the empty-IR contract) without needing keys. **Experiment tracking also shipped:** `Backend/eval/tracking.py` persists each scored run as JSON (timestamp + git commit + active model set/seed + scores) under `eval/runs/`, and `harness --track --compare` prints the **F1/precision/recall delta vs the previous run** (per-section, with a `REGRESSED` flag) — so a prompt/model change is judged by its measured effect. This is the CI gate the §11.5 note asked for. **Still OPEN:** golden sets for the legacy 6-model harness, and human-eval. See [`issue_fixed.md §F3`](./issue_fixed.md).
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
- **§11.5 — Reproducibility decay.** Hardcoded vendor model ids (`llama-3.3-70b-versatile`, etc.) are deprecated on the vendors' timeline, not yours; the day a model is retired, results change with no code change and no alert. No pinned snapshots, seeds, or eval. **Severity: Medium.** (Caught by §10.10.) · **Status:** ✅ FIXED (Clarity_Stack_V3) — all 6 vendor ids were scattered across `providers.py` (one repeated 3×); now pinned in a single `MODELS` registry + role constants (`SYNTHESIS_MODEL`/`EXTRACTION_PRIMARY`/`DIRECT_ANSWER_MODEL`), each **env-overridable** (`MODEL_GROQ_LLAMA`, `MODEL_NVIDIA_LLAMA`, …) so changing a pin is a deliberate, logged config act. `get_model_manifest()` is **logged at import**, so a vendor retirement surfaces as a config/log diff, not silent drift (the "no alert" gap). Added best-effort `MODEL_SEED` (default 42, `MODEL_SEED=""` disables) sent to Groq/NVIDIA — included **conditionally** so a strict provider can't 400 the call (NOT bit-determinism — §11.6). Also fixed the synthesis `model_used` label, which falsely recorded `"hf-qwen2.5-7b-synthesis"` while synthesis actually runs on Groq Llama — it now single-sources the real pinned id, so each row's provenance is truthful (the precondition for reproducing a run). Verified: manifest/seed parsing (none/int/bad) + truthful label. ~~Remaining for §10.10: golden sets + a CI regression gate on top of these pins.~~ **(2026-06-30: golden sets + a CI quality gate now shipped — see §10.10 / [`issue_fixed.md §F3`](./issue_fixed.md). Still remaining: seeds-in-eval + accuracy on labeled transcripts.)**
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
| §2.4 SQLite → ✅ DONE | Integrity hardened + dual-engine fixed + `DATABASE_URL` read + **Postgres path validated end-to-end** (`alembic check` zero-drift on PG, app-engine ORM roundtrip — see §4.2 / `issue_fixed.md §I`). SQLite kept as dev default by choice. |
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

### 1. Automated Testing ⭐⭐⭐⭐⭐ (Biggest) · 🟡 PARTIAL (2026-06-30)
* **Current:** A **committed, CI-gated** test suite now spans three tiers — Backend `pytest` (83 tests: synthesis/IR validators, `/ask` integration, LLM gateway, logging, plus the §16/§17 engine + AI-eval suites incl. the new transcript guards), Satellite `node --test` (7, content-hash delta), and **Frontend `vitest` (20: pure-fn `colors`/`utils` + a `Badge` render test under jsdom)** — all run on every push/PR by `.github/workflows/ci.yml` (the frontend job hard-gates typecheck + vitest + build). A **Playwright E2E smoke suite** (`e2e/smoke.spec.ts`: login render, client-side validation, register nav — backend-free) is scaffolded with `playwright.config.ts` and an `npm run e2e` script. See [`issue_fixed.md §F1/§F2`](./issue_fixed.md).
* **Still Missing:** Wiring Playwright into CI (needs `npx playwright install` browsers — deferred, network-heavy), API tests (`Postman/Newman`), and **coverage measurement/thresholds**. Backend integration is in-memory-SQLite only (no live-Postgres CI service yet).
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

### 5. AI Evaluation ⭐⭐⭐⭐⭐ (The single biggest gap overall) · 🟡 PARTIAL (2026-06-30)
* **Current:** An evaluation harness now exists (`Backend/eval/`): a 10-case **golden set** (raw model output → expected IR), **precision/recall/F1** scoring (KG token-model parity), an **offline CI quality gate** on the real extraction pipeline (micro-F1 1.00, with tests proving the scorer discriminates), an **online latency/cost profiler**, and now a **labeled `transcript → IR` accuracy set** (`transcripts.py`) that scores the **live ensemble's end-to-end extraction** through the real production path, with `MODEL_SEED` reported for reproducibility. So "how do you know synthesis is good?" now has a measured, regression-gated answer for the *extraction/validation* layer **and** a keyed accuracy score for the *live ensemble*. See [`issue_fixed.md §F3`](./issue_fixed.md) and §10.10.
* **Still Missing:** **Human evaluation** and calibration. (Experiment tracking — run logging + delta-vs-previous comparison — shipped 2026-06-30: `eval/tracking.py` + `harness --track --compare`.)
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

> **Re-rated 2026-06-30.** The original review predated the §15 UI-honesty cleanup, the
> validated end-to-end Postgres path, the observability stack (Prometheus + Grafana + Tempo
> tracing + structured logging with cross-service `X-Request-ID` correlation), CI with a
> coverage gate ([.github/workflows/ci.yml](.github/workflows/ci.yml)), the reproducible
> [`Backend/eval`](Backend/eval/) harness, and the frontend test infra (vitest + typecheck +
> Playwright). Almost all movement is the previously-weak **operational** areas catching up.
> Overall: **8.6 → 9.2 / 10**.

| Area                 | Rating     | Δ        | Biggest Gap (remaining)                                       |
| -------------------- | ---------- | -------- | ------------------------------------------------------------- |
| **Documentation**    | **9.9/10** | —        | Very little to improve                                        |
| **Architecture**     | **9.5/10** | —        | Event-driven comms / job queue (§10.9)                        |
| **Backend**          | **9.5/10** | ▲ 0.1    | `main.py` module split (§6.1); testing gap now closed (110 tests + coverage gate) |
| **Database**         | **9.5/10** | ▲ 0.1    | Hybrid RAG / pgvector search (§10.8); Postgres path validated |
| **Security**         | **9.4/10** | —        | MFA, audit logs                                               |
| **Frontend**         | **9.2/10** | —        | UI/UX visual polish & token consistency (see [FRONTEND_REMARK](Web/Frontend/FRONTEND_REMARK.md)) — functional honesty + tests up, visual debt newly surfaced |
| **AI Pipeline**      | **9.4/10** | ▲ 0.4    | Prompt versioning, cost analysis, fallback policies (eval harness now exists) |
| **Production Readiness** | **8.7/10** | ▲ 0.7 | Deploy/CD & scaling (queue, Redis)                            |
| **DevOps**           | **8.3/10** | ▲ 1.5    | CD/deploys, image scanning, Dependabot (CI + compose + coverage gate landed) |
| **Observability**    | **8.7/10** | ▲ 1.9    | Alerting + dashboard breadth (metrics/traces/correlated logs landed) |
| **Overall**          | **9.2/10** | ▲ 0.6    | Operations maturity, not architecture                         |

### The Encouraging Part
The original low scores were all **operational** — DevOps, Observability, AI evaluation, production maturity — never foundational architecture. Since that review those gaps have largely closed: a real observability stack (metrics + traces + correlated structured logs), CI with a coverage gate, the validated Postgres path, and a reproducible eval harness. What's left — CD/deploys, MFA + audit logs, pgvector search, an event/queue layer, and (newly surfaced) frontend UI/UX polish — is **additive, not a redesign**. There were never fundamental issues like "wrong database," "poor separation of concerns," or "unmaintainable architecture." The core architecture was never in question; the system has simply moved from a solid MVP toward a production service.

---

## §15 Frontend Page-by-Page Functional Audit (2026-06-29)

> **Mode:** UI walkthrough — every protected page from `/projects` outward, every button/feature traced to its handler. Lens: real-vs-mock data, dead controls, misleading copy, broken wiring. All items **OPEN** unless noted. Scope: `Web/Frontend/src` only (the `UML_Clarity_Service` embedded app is separate — see §1.6).
> Routes covered: `/projects`, `/projects/search`, `/discovery`, `/projects/:id/chats`, `/projects/:id/chats/:chatId`, `/projects/:id/{kg,delta,cards}`, `/srs/*`, `/editor/*`, `/uml/dashboard`, `/cards`, `/settings`.

### §15.1 — Read-path "demo mode" still ships mock fixtures (violates the "no mocks" goal)
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.2 — Mock fixtures are themselves corrupt (would crash/duplicate if ever shown)
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.3 — SettingsPage is mostly dead / misleading controls
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.4 — KnowledgeInspector "Decision Cockpit" has hardcoded + dead UI (MessagesPage)
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.5 — ProjectSearch "Retry" button is a no-op
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.6 — PMs are wrongly excluded from the inline Join-Requests panel
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.7 — Project "Owner" is editable in the UI but the backend ignores it (silent no-op)
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.8 — UML dashboard hardcodes the embedded service URL
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.9 — Personalized greeting never populates at login
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.10 — Remaining `127.0.0.1` host-mismatch references
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.11 — Orphaned / dead components and patterns
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.12 — Over-eager polling on MessagesPage
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.13 — CardsPage (`/cards`): non-persistent pin + decorative fakes
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.14 — Delta "Generate AI Card" ignores the selected delta
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.15 — KnowledgeGraph empty-state points at a missing action
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15.16 — Minor correctness nits
- **Status:** ✅ FIXED — see the §15 remediation table below.

### §15 — What's actually solid (no findings)
Real data, correct wiring, good error/empty/loading states: **ProjectCard**, **CreateProjectModal**, **ProjectSettingsPanel** (members/requests/activity/danger all hit real APIs), **DiscoveryPage** (graceful Satellite degradation), **KnowledgeGraphPage** (live force-graph off real reasoning), **DeltaTimelinePage**, **TemporalCardsPage**, **SRS Dashboard** (real upload → SRS svc via env base), **Editor Dashboard** (real Editor svc, cookie+CSRF), **MessageInput/MessageBubble** (accept/summary toggles real). The defects above are concentrated in (a) the demo-mode read fallback, (b) SettingsPage, (c) decorative/placeholder UI in the synthesis & cards surfaces, and (d) a handful of dead handlers/buttons.

### §15 — Remediation log (2026-06-29, this session)
> All items below applied to the working tree. Frontend `tsc --noEmit` passes clean; UI compiles/serves on :8006. Fixes are behavioral where a real path exists, and removals only where the control had no backing service.
> **Committed 2026-06-30** as `8884e375` (the §15 cluster had been sitting uncommitted in the working tree). The per-item `### §15.x` headers above still read "OPEN" — they predate this log; this table is the source of truth.

| Item | Status | What changed |
|------|--------|--------------|
| §15.1 | ✅ FIXED | Deleted `mockProjects/mockChats/mockMessages` + the `useDemoMode` swap from `lib/api.ts`. `getProjects/getChats/getMessages/searchProjects` now hit the real API and throw on failure (surfaced by each page's `ErrorState`). |
| §15.2 | ✅ FIXED | Corrupt fixtures gone with §15.1. |
| §15.3 | ✅ FIXED | SettingsPage: removed the no-op "Backend API URL" field + dead "Auto-sync"; Notifications/Sound/Analytics now persist in `handleSave` + load on mount; Database panel copy now reflects real connection; "secure account metadata" → "saved on this device"; logout uses the env API base. Also dropped the `cs_api_url` fallback from the SRS base in `api.ts` (it silently mis-pointed SRS). |
| §15.4 | ✅ FIXED | KnowledgeInspector: removed hardcoded "↳ Depends on Synthesis #3", the dead **Validate**/**+Task** buttons, and the inert **current/history/drift** toggle (+ its state). Metric gauges kept (derived from real nodes). |
| §15.5 | ✅ FIXED | ProjectSearch `onRetry` now actually re-runs the search. |
| §15.6 | ✅ FIXED | `isOwnerOrPm` now derives from `currentUserRole` (owner **or** pm) → PMs see the inline Join-Requests panel. |
| §15.7 | ✅ FIXED | Removed dead Owner field from the **project** edit modal; chat owner left intact (it persists — see corrected note above). |
| §15.8 | ✅ FIXED | UML iframe URL now `VITE_UML_URL || http://${hostname}:8007`; (2026-06-30) `postMessage` now targets the UML app's own origin instead of `'*'` — no longer broadcasts SRS context to any frame. |
| §15.9 | ✅ FIXED | Login now fetches `/api/auth/me` and stores `cs_nickname` (best-effort) → greetings populate without a Settings visit. |
| §15.10 | ✅ FIXED | Remaining `127.0.0.1` references removed (SettingsPage logout + demo banners deleted with §15.1). |
| §15.11 | ✅ FIXED | Deleted orphans `CardFilterBar.tsx`, `editor/App.jsx`, `editor/Login.jsx`; removed dead `ChatCard` handlers + imports and `TemporalCardsPage.handleRefresh`; `ProjectsPage` Discover button now uses SPA `navigate()`. (KnowledgeCard/CardEditModal kept — types are in use.) |
| §15.12 | ✅ FIXED | MessagesPage: role derivation moved out of the 4s meta-poll into a once-per-chat effect; both poll intervals now skip while `document.hidden`. |
| §15.13 | ✅ FIXED | CardsPage: pins persist to `localStorage` (`cs_pinned_cards`); fake "AI" avatar circles removed; "Generate Now" routes to the real per-project generator. |
| §15.14 | ✅ FIXED (2026-06-30) | Added Satellite `POST /cards/:projectId/generate/delta/:deltaId` (fetches the delta by id, project-scoped, 404/409 guards) + a `generateCardFromDeltaId` api fn; the per-delta "Generate AI Card" button now synthesizes from the **selected** delta, not the latest. |
| §15.15 | ✅ FIXED | KG empty-state copy now matches reality ("ask questions… then Reload"); no phantom snapshot action referenced. |
| §15.16 | ✅ FIXED | MessageBubble guards against double-`Z` timestamps; ProjectSettingsPanel fetches join-requests on mount so the badge pre-warns. |

---

## §16 Deep Core / Engine Audit (2026-06-29)

> **Mode:** Not wiring — the *engine* of each feature traced through Core (FastAPI) → Satellite (Express/Mongo): algorithms, data integrity, race conditions, and whether each feature actually does what it claims. Deeper than §15 (UI). All **OPEN**.

### §16.1 — Ensemble is "diverse" in name only → measured-confidence is inflated
- **Status:** ✅ Resolved — see [`issue_fixed.md`](./issue_fixed.md).

### §16.2 — KG relationships are a blind cartesian product, not extracted reasoning
- **Status:** ✅ Resolved — see [`issue_fixed.md`](./issue_fixed.md).

### §16.3 — Delta Engine tracks UUID churn, not knowledge change
- **Status:** ✅ Resolved — see [`issue_fixed.md`](./issue_fixed.md).

### §16.4 — Temporal Cards: "temporal" is disabled, "Commit to KG" is a dead-end
- **Status:** ✅ Resolved — see [`issue_fixed.md §J`](./issue_fixed.md).

### §16.5 — Synthesis IR gate can 503 a valid answer on an English-phrasing technicality
- **Status:** ✅ Resolved — see [`issue_fixed.md`](./issue_fixed.md).

### §16.6 — Join-request approval is non-idempotent → duplicate members
- **Status:** ✅ Resolved — see [`issue_fixed.md`](./issue_fixed.md).

### §16.7 — `ask_direct_answer` stores its error string as the answer
- **Status:** ✅ Resolved — see [`issue_fixed.md`](./issue_fixed.md).

### §16.8 — Signal classifier can silently swallow a real question (no override)
- **Status:** ✅ Resolved — see [`issue_fixed.md`](./issue_fixed.md).

### §16 — What's genuinely strong
`/ask` orchestration (concurrent extraction, atomic provider+synthesis commit §3.2, measured confidence §11.4), `agreement.py` metric design (honest, deterministic, self-documenting lexical floor), the IR structural validators, WebSocket presence auth (cookie→JWT→`get_chat_or_403`, fail-closed), and rate-limited/RBAC-gated endpoints are careful engineering. The defects above are about **semantic fidelity** (KG edges, delta, card→KG) and **reliability/idempotency cliffs**, not broken plumbing.

---

## §17 New Features (creative direction)

### §17.1 — Disagreement Spotlight ✅ BUILT (2026-06-29)
- **Status:** ✅ Built — see [`issue_fixed.md`](./issue_fixed.md).

### §17.2 — Ask-Anyway override + Devil's Advocate ✅ BUILT (2026-06-29)
- **Status:** ✅ Built — see [`issue_fixed.md`](./issue_fixed.md).

### §17.3 — Real Evolution Timeline (content-hash delta) ✅ BUILT (2026-06-29)
- **Status:** ✅ Built — see [`issue_fixed.md`](./issue_fixed.md).

### §17.4 — Semantic KG edges + "Why this decision?" trace ✅ BUILT (2026-06-29)
- **Status:** ✅ Built — see [`issue_fixed.md`](./issue_fixed.md).

### §17.5 — Decision Readiness + Resolve-Path ✅ BUILT (2026-06-29) · capstone flagship
- **Status:** ✅ Built — see [`issue_fixed.md`](./issue_fixed.md).
