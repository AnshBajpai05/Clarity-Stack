# Issues Fixed — ClarityStack

> **What this file is:** the log of *completed* work, moved here out of `take_step_forward.md` so that
> roadmap doc only carries what is still pending. `existing_issues.md` remains the live risk register
> (it still cross-references these as FIXED). `take_step_forward.md` now holds only 🟡 partial / ⏳ pending items.
>
> **Branch:** `Clarity_Stack_V3` (current) · **Last updated:** 2026-06-30
>
> Status legend: ✅ **DONE** (shipped & verified in code).

---

## A. First-pass — Core Backend Tier-0 (commits `6247596`, `ab14653`)

| Item | What was fixed | Evidence |
|------|----------------|----------|
| **§2.1** JWT signing secret [⭐⭐⭐⭐⭐] | Hardcoded `SECRET_KEY = "HalaMadrid12345"` moved to env, **fail-closed** at boot if unset. | `Backend/auth.py:11` |
| **§2.2** IDOR (Core) [⭐⭐⭐⭐⭐] | Object-level authZ (`get_chat_or_403` / `get_project_or_403` with role checks) on every mutating Core route — not just authentication. | `Backend/main.py` |
| **§6.1** Error-as-fact poisoning [⭐⭐⭐⭐] | `_error_block()` now returns `None`; failed providers are skipped, never fed to synthesis. | `Backend/providers.py` |
| **§6.12** Dual `create_engine` [⭐⭐⭐⭐] | Single engine + WAL + `foreign_keys=ON` + `synchronous=NORMAL`; the second stray engine removed. | `Backend/database.py` |
| **§1.3 / §8.3e** Import hard-fail | Core no longer raises at import on missing keys — degrades gracefully. | `Backend/providers.py:34-42` |

---

## B. Second-pass — system-wide Tier-0 authZ (2026-06-28)

Closed the same Tier-0 classes across **Satellite, Editor, UML, and Web** — the gap the first pass left
("Tier-0 closed for Core only"). Cross-referenced to `existing_issues.md` §-numbers.

### B1. Secret unification [⭐⭐⭐⭐⭐] (existing_issues §1.1, §1.5, §6.3)
- One secret name **`JWT_SECRET`** across Backend / Satellite / Editor.
- Satellite (`middleware/auth.js`, `routes/internal.js`) and Editor (`server.js`) now **throw at boot** if it is
  unset — the `"HalaMadrid12345"` fallback literal is deleted.
- Editor's old `SECRET_KEY` env-name mismatch (which silently dropped every real token to anonymous) is fixed.
- Secret **rotated** to a fresh 256-bit value, identical across the three (gitignored) `.env` files.
- `SETUP_GUIDE.md` updated to the unified name.

### B2. Satellite cross-tenant IDOR [⭐⭐⭐⭐⭐] (existing_issues §1.3)
- New `requireProjectAccess` / `requireCardAccess` middleware (`Satellite/middleware/auth.js`) delegates to Core's
  own object-level authZ (`GET /projects/:id`, which honors membership + public-read).
- Wired as Express param triggers (`router.param("projectId"|"cardId", …)`) on **kg.js, delta.js, cards.js, export.js** —
  covering every current and future scoped route.
- Closes the previously-public `GET /cards/:projectId` + `/label/:label` and the `DELETE /cards/:cardId` cross-tenant hole;
  the card trigger also blocks passing another tenant's `cardId` under a project you *can* access.
- Fail-closed (Core unreachable ⇒ deny). `discovery.js` (follow/feed) and `join.js` (join-request) are intentionally
  **not** gated — the caller there is not a member by design.

### B3. Backend synthesis routes authed [⭐⭐⭐⭐⭐] (existing_issues §5.7)
- All four routes now require `get_current_user` + `get_chat_or_403`:
  `POST /chats/{id}/synthesis`, `GET .../synthesis`, `GET .../synthesis/{reply_group_id}`, `POST .../synthesis/generate`.
- The two write/generate routes are members-only (no `allow_public`), so anonymous callers can't trigger paid generation.

### B4. Anonymous token minting removed [⭐⭐⭐⭐⭐] (existing_issues §5.1)
- `POST /api/auth/client-login` endpoint **+ its `ClientLogin` model removed** (`Backend/main.py`); the "Client Access"
  toggle removed from `Web/Frontend/src/pages/Login.tsx` (now user/password only).
- The card scheduler no longer depends on the hole: `cardScheduler.getServiceToken` mints a short-lived **service JWT
  locally** (`sub=service@claritystack.internal`, `role=service`, 10-min exp) signed with the shared `JWT_SECRET`;
  Core's `get_project_or_403` grants that reserved identity **read-only** project access.
- A proper owner-initiated client-share/invite flow is left as future product work.

### B5. Ownership-reassignment escalation closed [⭐⭐⭐⭐⭐] (existing_issues §5.2)
- `owner` removed from the `update_project` editable set (now `{purpose, success_criteria, constraints}`); a PM can no
  longer self-assign ownership.

### B6. Satellite mass-delete forgeability [⭐⭐⭐⭐⭐] (existing_issues §1.2)
- The forgeability vector is closed as a side-effect of B1: `requireInternalAuth` no longer falls back to the public
  secret, so a `role:"internal"` token can only be minted by a holder of the rotated `JWT_SECRET` (i.e. Core itself).
- Residual hardening (dedicated service credential / mTLS, soft-delete + retention) is deferred — see `take_step_forward.md`.

### B7. Editor ownership / visibility + socket auth [⭐⭐⭐⭐⭐] (existing_issues §1.5)
- `GET /workspace/:id` returns 403 to non-owners of **private** workspaces.
- Socket handshake is authenticated (`io.use` verifies the JWT, attaches `socket.user`); `join` and every mutator
  (`section_change`, `section_title_change`, `add_section`, `delete_section`, `reorder_sections`) is gated by
  `canAccessRoom` — private rooms are owner-only; public / not-yet-created rooms stay open for collaboration.
- Frontend sends the token on the socket handshake (`Web/Frontend/src/pages/editor/socket.js` auth callback).

### B8. UML browser vendor-key leak [⭐⭐⭐⭐⭐] (existing_issues §1.6 / take_step_forward §2.3)
- Both browser callers now route through the server-side proxy `${VITE_API_URL}/api/llm`:
  `Dashboard.jsx` `callAI` rewritten (Groq/Gemini direct fetches + `VITE_GROQ_API_KEY`/`VITE_GEMINI_API_KEY` deleted)
  and `pureFrontendEngine.js` `callGroq` now hits the proxy (`getKey()` / `VITE_GROQ_API_KEY` gone).
- `VITE_NVIDIA_API_KEY` (browser leak) removed from `UML_Clarity_Service/.env`.
- Grep-verified: zero `VITE_*_API_KEY` / direct `api.groq.com` / `generativelanguage` references remain in
  `UML_Clarity_Service/src`.
- The proxy (`UML_Clarity_Service/backend/main.py`) now **load-balances two server-side NVIDIA keys**
  (`NVIDIA_API_KEY` + `NVIDIA_API_KEY_2`, random per request + 429 fail-over) to spread quota — load management, not local inference.

### B9. `generate.js /uml` authenticated [⭐⭐⭐⭐] (existing_issues §5.6, partial)
- The Satellite UML-generation route now requires auth (no anonymous LLM cost-amplification). A full rate limiter is
  still pending (tracked in `take_step_forward.md`).

---

## C. Third-pass — Clarity_Stack_V3 (branch `Clarity_Stack_V3`)

### C1. Git hygiene [⭐⭐] (existing_issues §9.1, §9.2)
- Untracked (kept on disk) runtime collab data (`Editor_Service/data/*.json`), Vite build artifacts
  (`vite.config.ts.timestamp-*.mjs`), generated corpora (`SRS_Service/data/checkpoints/**`, `pdf_raw_text.txt`),
  and dead scratch/debug scripts (`scratch_extract.py`, ad-hoc `test_*.py`, `test_nvidia.py`, `test_socket.py`) —
  38 files removed from the index. Added matching `.gitignore` rules.
- Deduped the Web/Frontend lockfile: dropped `bun.lockb`, kept npm `package-lock.json` (matches the other services);
  `*.lockb` now ignored.
- ThreatLens `top-1m.csv` left tracked (service is out of scope this cycle).

### C3. Ask-pipeline cluster: async + atomic + factory [⭐⭐⭐] (existing_issues §2.1, §3.2, §3.4)
Designed and shipped as one coordinated change to the `/ask` flow (shared blast radius):
- **§3.4 factory** — one `build_synthesis_message()` in `synthesis_service.py` builds the chat-visible synthesis
  row for **both** `/ask` and `/synthesis/generate`; the previously divergent shapes are unified
  (`role/type/synthesis_id/accepted/signal_level`). Also fixed a latent crash: `save_or_update_synthesis` was
  calling `link_previous_decisions` with a wrong/missing `chat_id`.
- **§3.2 atomic** — provider messages + `Synthesis` row + synthesis `Message` now commit in a **single
  transaction** (staged uncommitted, one `db.commit()`, `db.rollback()` on any failure). No more orphan
  reply-groups. The user message commits first as its own unit; the KG build is a best-effort follow-on after
  the commit. Verified: forced-failure leaves 0 orphan rows; success persists exactly 3 provider + 1 synthesis row + 1 synthesis msg.
- **§2.5 async** — `ask_multi_model` is `async`; provider extraction fans out via `asyncio.gather` + `to_thread`
  (verified ≈3× faster: 0.33s vs 0.9s serial), synthesis merge + fallback also off-loop. Failures/empty outputs
  are dropped as missing votes.
- `save_or_update_synthesis` gained `commit=`/`build_kg=` flags so the atomic path controls its own transaction
  boundary; `generate_and_store_synthesis` kept as a sync wrapper for the `/synthesis/generate` endpoint.

### C2. Alembic = single source of truth [⭐⭐⭐] (existing_issues §2.3, §4.2)
- Removed `Base.metadata.create_all` from `Backend/main.py`. Found (and empirically proved) the 5 existing
  migrations had drifted to building only **7 of 13 tables** (+16 missing columns) — `create_all` was masking it.
- Replaced the drifted chain with one regenerated baseline (`8026647f94d5`), autogenerated from the models and
  verified to exactly match the `create_all` schema (zero gaps).
- Startup `_ensure_schema_at_head()` brings the DB to head: **upgrade** for fresh DBs, **stamp** for pre-existing
  create_all DBs (safe adoption, no DDL re-run). Guarded by `RUN_MIGRATIONS_ON_STARTUP` (=`0` for multi-worker prod).
- `SETUP_GUIDE.md` updated with the migration/flag note.

---

### C4. Editor backend consolidation [⭐⭐] (existing_issues §6.2, §2.2, §3.3)
- **One backend.** Deleted the two dead competing editor backends and their helpers — `Editor_Service/main.py`
  (Socket.IO/Supabase, in-memory `rooms_data` that lost all state on restart — the §2.2 defect), `socket_server.py`
  (standalone aiohttp Socket.IO on a conflicting port), `database.py` (supabase client only those used), and the
  `test_db.js`/`test_socket.py` scratch tests. The sole remaining backend is the file-based, Tier-0-hardened
  `Editor_Service/server.js` that `start_project.bat` / `npm start` actually launches.
- **§3.3 persistence.** Atomic temp-file+`rename` write was already in place; added a `MAX_SAVE_WAIT` cap to the
  debounce so a continuously-edited room can't starve persistence (the old debounce reset every keystroke and never
  flushed under sustained typing). Verified the cap fires under continuous edits. Whole-file persistence kept by
  design at this scale.

## Net result

The **entire Tier-0 security gate is closed system-wide** (Core + Satellite + Editor + UML), with the sole exception of
**ThreatLens**, which is held entirely out of scope this cycle (service not yet linked — see the banner in
`existing_issues.md`).

**Out of scope / intentionally deferred (still in `take_step_forward.md`):** Tier-1 platform work (LLM Gateway,
Postgres migration, Docker/CI, observability, honest/parallel ensemble), local-first inference (the system stays
cloud-dependent by decision), and the remaining non-Tier-0 defects.

---

## D. Auth hardening — httpOnly cookies + operational security (2026-06-28)

> 📄 **Full walkthrough:** [`auth_hardening_walkthrough.md`](./auth_hardening_walkthrough.md)
> Cross-referenced in `existing_issues.md §1.7`.

### D1. §5.4 — localStorage tokens → httpOnly cookies (Hybrid Auth + CSRF) [⭐⭐⭐⭐⭐]
- Cookie-first (browser) / Bearer-header-fallback (service-to-service) auth pipeline.
- `httpOnly` access (15 min) + refresh (30 days) cookies; JS-readable `csrf_token` cookie.
- Double-submit CSRF check on all mutating cookie-auth requests.
- All 15 frontend files migrated off `localStorage`; `http.ts` / `api.ts` rebuilt; `fetchSatellite` uses `credentials: "include"`.
- Socket.IO handshakes read `handshake.headers.cookie` — no query-param token leakage.

### D2. §1.7 — Auth Operational Hardening (Rotation, Sessions, RBAC, Silent Refresh) [⭐⭐⭐⭐⭐]
- **Refresh token rotation** — every `/refresh` call revokes the old JTI and issues a new `(token, jti)` pair.
- **Anomaly detection** — presenting a revoked JTI triggers immediate revocation of *all* user sessions.
- **Server-side sessions** — new `RefreshToken` table (`jti`, `user_id`, `revoked`, `device_info`); Alembic migration `0029088d6806` applied.
- **Richer `/me`** — returns `id, email, role, nickname, permissions[], avatar, createdAt`.
- **RBAC middleware** — `require_permissions(*perms)` FastAPI Depends factory; admin gets full permission set.
- **`__Host-` cookie prefixes** — `get_cookie_name()` prepends `__Host-` in production; `getCookie()` in frontend checks both variants.
- **Rate limiting** — `/refresh` now capped at 20/min alongside existing `/login` (10/min) and `/register` (5/min).
- **Silent refresh UX** — `http.ts` state machine: queues inflight requests on 401, refreshes once, retries all; `/login` redirect only on refresh failure. `fetchSatellite` in `api.ts` integrated identically.
- Build verified: ✅ `npm run build` — 3586 modules, zero errors.

### D3. §5.4 follow-up — post-session correctness pass (2026-06-29) [⭐⭐⭐⭐⭐]

Audit of the D1/D2 work (which was interrupted mid-edit by a session limit) found the cookie pipeline was one line short of working, plus a cosmetic authZ mismatch. Both fixed:

- **Login 500 (blocker)** — `POST /api/auth/login` (`Backend/main.py`) read `request.headers` for `device_info` but the handler signature no longer declared `request: Request` (it was dropped when `device_info`/session-storage was added; `logout` and `refresh` kept theirs). Result: **every login raised `NameError` → 500**, locking all browser auth out. Re-added `request: Request` to the signature. Verified `python -m py_compile`.
- **`/me` admin permissions mismatch** — `GET /api/auth/me` returned admin `["project.read", "project.write"]`, but the RBAC source of truth (`auth.py:require_permissions` role map) grants admin `["admin", "project.read", "project.write", "project.delete", "users.manage"]`. Aligned `/me` to the full set so the display payload matches enforced authZ. (Display only — `require_permissions` was always the real gate.)

Re-verified the rest of the §5.4/§1.7 surface end-to-end (auth.py cookie/CSRF/rotation, models + migration `0029088d6806`, Satellite cookie→Bearer forwarding, Editor socket handshake + `canAccessRoom`, frontend silent-refresh + `withCredentials`). Grep confirms **zero** access tokens in `localStorage` across `Web/Frontend/src` — the XSS-exposure crux of §5.4 holds. No other partials found.

---

## E. Deep-core engine fixes + creative flagships (2026-06-29, branch `Clarity_Stack_V3`)

> Addresses defects from the §16 Deep Core / Engine Audit and ships the §17 creative
> features. Full per-feature write-ups live in `existing_issues.md §17.1–§17.5`.
> Each fix verified by: isolated engine test + `tsc -p tsconfig.app.json` exit 0 + route
> live on the running `:8000` server (401 unauth) + a real end-to-end live drive.

### E1. §16.5 — conflict gate no longer 503s a valid answer → Ask-Anyway [⭐⭐⭐⭐] (existing_issues §16.5 → §17.2)
- New `ConflictGateError` (≠ plain `RuntimeError`); `synthesize_content(strict_conflict=)` keeps **structural** validation fail-closed in every mode while the **conflict-semantics** check becomes recoverable. `/ask` returns `200 {status:"conflict_gate", can_retry_ask_anyway:true}` and deletes the just-committed user turn (no dup); `ask_anyway:true` retry relaxes the gate. Threaded through `/synthesis/generate` too.
- UI: amber "Answer held back → Ask Anyway / Dismiss" banner in `MessagesPage.tsx`.
- **Verified live:** a real `/ask` *tripped the gate*; the `ask_anyway` retry returned `ok`.
- ⚠ Note: the audit's suggested direction was "soft-drop the offending bullet"; we chose an explicit user-controlled override instead (keeps the gate honest, no silent edits).

### E2. §17.2 — Devil's Advocate (red-team a decision) [⭐⭐⭐⭐] (new feature; partial §16.7)
- `providers.ask_devils_advocate` *raises* on failure (never stores an error string as a critique); `devils_advocate.py` parses `RISK/ASSUMPTION/FAILURE_MODE/COUNTERPOINT`; no DECISION ⇒ no model call. `GET /chats/{id}/synthesis/{rg}/devils-advocate` (members-only, rate-limited). Cockpit panel.
- **Verified live:** 9 real challenges on a real synthesis (`groq:llama-3.3-70b-versatile`).
- ⚠ This applies the §16.7 *pattern* (errors must not masquerade as content) in the new code path **only**. The original §16.7 site — `ask_direct_answer`'s fallback persisting its error string at `main.py:~1271` with `accepted=True` — is **still open**.

### E3. §16.3 — Delta Engine diffs content, not UUID churn [⭐⭐⭐⭐] (existing_issues §16.3 → §17.3)
- `Satellite/services/deltaEngine.js` `computeDiff` rewritten: nodes keyed on `SECTION::normContent`, edges on endpoint *content* keys (not churned UUIDs), `dedupeByKey`. Re-asking an unchanged question adds ~0; identical edges stop re-appearing. API/UI shape unchanged.
- **Verified:** 7 Node unit tests + **live** (baseline `+53` → identical re-ask `+6`, the 6 being only genuinely-changed SUMMARY/CONFIDENCE text; stable FACT/DECISION/OPTION nodes did not re-add).
- ⚠ Still open from §16.3: the `fetchKGFromCore` N+1 serial fan-out and unbounded Mongo snapshot growth.

### E4. §16.2 — KG edges are semantic, not a cartesian product [⭐⭐⭐⭐⭐] (existing_issues §16.2 → §17.4)
- `knowledge_graph_builder.relate_node_to_decisions` (lexical Jaccard) replaces the `for src: for dst:` cross-product — attribute each node to its most-related decision(s); **zero overlap ⇒ no edge**. `reasoning_queries.get_decision_trace` walks the now-real edges into each decision with the shared terms that justify each link. `GET /chats/{id}/decision-trace` + "Why this decision?" cockpit panel.
- **Verified:** 5 unit + DB integration (2-decision IR ⇒ **3 real edges, not 6**, no cross-decision fabrication) + **live** (Postgres decision rests on Postgres facts; frontend decision linked its own — no cross-wiring).
- ⚠ Still open from §16.2: `parse_ir_from_synthesis` still emits SUMMARY/CONFIDENCE bullets as KnowledgeNodes (metadata-as-knowledge; also the source of the residual delta churn in E3).

### E5. §17.5 — Decision Readiness + Resolve-Path [⭐⭐⭐⭐⭐] (new capstone flagship)
- `decision_readiness.py` fuses measured agreement (§10.3) + the §17.4 semantic edges into a per-decision verdict (Exploratory/Forming/Ready) + a prioritized resolve-path (open question → conflict → assumption, each tagged with the readiness it unlocks). Neutral-prior, bounded-term scoring so one noisy agreement number can't flatten everything (§16.1). Zero extra model calls. `GET /chats/{id}/decision-readiness` + top-of-cockpit panel.
- **Verified:** unit + DB integration (clean ⇒ 0.89 Ready; contested ⇒ ordered BLOCKS→CONTRADICTS path) + **live**.

### E6. Dev convenience — Atlas IP auto-allow [⭐⭐] (infra)
- `Satellite/scripts/atlas_allow_current_ip.py` adds the machine's current public IP to the MongoDB Atlas allowlist (stdlib digest auth, idempotent, optional TTL); wired into `start_project.bat` as a best-effort pre-step that skips silently without `ATLAS_*` keys. Fixes the recurring `buffering timed out` when a dev's IP rotates.

### E7. §16-tail cleanup pass (2026-06-29, same session) — consolidate before next flagship
Knocked out the cheap remaining §16 correctness/quality tails in one pass (grouped by file, each touched once) so the flagships sit on clean foundations and we don't revisit:
- **§16.1 — ensemble diversity [⭐⭐⭐⭐].** Replaced the 8B Llama (most correlated with the 70B) with a genuinely non-Llama architecture — OpenAI open-weight **`openai/gpt-oss-20b`** on Groq — at the *same* model count (no extra cost). `providers.py` MODELS + `ask_groq_oss` + `EXTRACTION_ENSEMBLE`. **Verified live:** ensemble is now `llama-3.3-70b + gpt-oss-20b + nvidia-llama-70b`, gpt-oss emits clean IR, and measured agreement honestly *drops* (the models genuinely disagree more) — the §10.3 signal is no longer inflated by homogeneity.
  - 🔎 While fixing this, found **3 dead pinned models** (§11.5 drift): `gemma2-9b-it` (Groq 400), `google/gemma-2-9b-it` (NVIDIA 404), `mistralai/mixtral-8x22b-instruct-v0.1` (NVIDIA **410 — EOL 2026-05-21**). Only the live ensemble was repointed; the stale ids remain in `MODELS`/`run_multi_model_extraction` (legacy harness) — logged below.
- **§16.2 tail — metadata is not knowledge [⭐⭐⭐].** `knowledge_graph_builder.KG_EXCLUDED_SECTIONS = {SUMMARY, CONFIDENCE}`; those sections no longer become KnowledgeNodes (they polluted the trace and caused the residual Delta churn, since CONFIDENCE text changes every ask). Synthesis CONTENT still keeps both. **Verified** (test + clean live delta).
- **§16.6 — idempotent join approval [⭐⭐⭐].** `update_join_request` now validates the `status` enum and only acts on a still-`pending` request, guarding on existing membership ⇒ no duplicate `ProjectMember` rows from double-approve / re-PATCH / already-auto-enrolled users.
- **§16.7 — error string never stored as answer [⭐⭐⭐].** `ask_direct_answer` now RAISES; the `/ask` fallback's existing try/except turns a provider outage into a clean 503 instead of persisting `"I encountered an error…"` as an `accepted=True` message.
- **§16.8 — noise gate is overridable [⭐⭐⭐].** `/ask` honors `ask_anyway` to bypass the `noise` classification (a false-negative no longer silently eats a real question); the client reuses the same "Ask Anyway" banner as the §16.5 conflict gate.
- **Verified:** 3 engine unit tests (metadata exclusion / raising answer / non-Llama ensemble) + §17.4/§17.5 integration re-run green + `tsc` 0 + `import main` OK + live `/ask` on the new ensemble.

### E — Still OPEN from the §16 audit (deliberately deferred — not "minor")
- **§16.4** — Temporal Cards: `expireOldCards` no-op, "Commit to KG" dead-end, "always works" dup spawning. (Multi-part Satellite work — a real feature pass, not a tail.)
- **§16.3 tail** — `fetchKGFromCore` N+1 serial fan-out + unbounded Mongo snapshot growth (perf/ops, not correctness).
- **§11.5 drift** — stale pinned model ids in `MODELS`/legacy harness (gemma2-9b-it, NVIDIA gemma/mixtral); only the live ensemble was repointed.

---

## F. Test suite committed + CI gate + AI-eval harness (2026-06-30, branch `Clarity_Stack_V3`)

> Turns the §16/§17 engine work from "verified once by hand" into a **committed,
> CI-gated regression suite**, and stands up the **evaluation substrate** the audit
> flagged as the single biggest gap (Addendum Tier-1 #1 Automated Testing, #5 AI
> Evaluation; cross-refs `existing_issues.md §10.4`, §10.10, §11.5).
> Commits: `11350d6` (suites), `c6d1e41` (CI), `4098b37` (eval).

### F1. Scratchpad tests → committed regression suite [⭐⭐⭐⭐] (Addendum Tier-1 #1)
- **Backend pytest** (`Backend/tests/`, in-memory SQLite, no network): new `test_kg_semantic_edges`
  (§16.2/§17.4 — edges semantic not cross-product, metadata≠node, edge-grounded trace),
  `test_decision_readiness` (§17.5 bands + biggest-lever-first resolve path),
  `test_devils_advocate` (§17.2 parse + prompt build, no model call),
  `test_providers_ensemble` (§16.1 non-Llama member, §16.7 ask raises not error-string).
  Updated `test_ask_endpoint` / `test_synthesis_validators` to the new strict-conflict-gate
  behavior (the §17.2 change made a bad conflict raise `ConflictGateError`, not the old
  `synthesis_validation_failed`).
- **Satellite node --test** (`Satellite/test/deltaEngine.test.js`, pure-fn, no Mongo): 7 tests
  for the §16.3 content-hash diff (re-minted UUIDs for identical content don't inflate `+N`;
  edges follow endpoint meaning; dupes collapse). Added the missing `npm test` script.
- **Result:** 57 backend + 7 satellite green at commit time. The §17 flagships are now
  regression-guarded, so they don't silently rot.

### F2. CI regression gate [⭐⭐⭐⭐] (existing_issues §10.4 → 🟡 PARTIAL)
- `.github/workflows/ci.yml` — two fast, network-free jobs: **backend** (pytest) +
  **satellite** (`node --test`), on every push to `main`/`Clarity_Stack_**` and PRs to `main`.
- **Minimal `Backend/requirements_ci.txt`** (fastapi/pydantic/sqlalchemy/jose/bcrypt/dotenv/
  requests + pytest/httpx/email-validator) instead of `requirements_backend.txt`: the audit's
  torch/transformers/google-* are **lazy in app code and never reached by the tests**, so CI
  skips the multi-GB install. **Verified in a clean venv: 57 passed with only
  `requirements_ci.txt`** (and `import main` loads zero heavy modules). Also sidesteps the
  §10.4 UTF-16 `requirements_*.txt` tooling-hostility for the CI path.

### F3. AI-evaluation harness [⭐⭐⭐⭐⭐] (existing_issues §10.10 → 🟡 PARTIAL; Addendum Tier-1 #5)
- `Backend/eval/` — the eval substrate the honest §17 engine was missing:
  - **scoring.py** — content-overlap precision/recall/F1, reusing the **same token model as
    the KG edge builder** (`_tokens`/`_jaccard`, §10.3 parity) so "related" means one thing
    system-wide. Greedy one-to-one bullet matching; micro-average pools bullets, not sections.
  - **golden.py** — 10 hand-labeled cases (raw model output → expected canonical IR): preamble
    noise, unknown headers, `None` placeholders, casing drift, lossless duplicates, metadata
    sections, empty-IR. Labels encode the *contract*, not a snapshot.
  - **harness.py** — OFFLINE runner scores the **real `prune_to_synthesis_ir` → `parse_ir_from_synthesis`
    pipeline** (deterministic, no network) and prints a P/R/F1 table; ONLINE runner profiles the
    live ensemble for latency (real) + cost (**only when priced — never fabricated**), opt-in,
    needs API keys.
- `Backend/tests/test_eval_harness.py` — the CI quality gate: golden micro-F1 ≥ 0.95
  (**currently 1.00 — 27 bullets, 0 FP/0 FN**) + per-case checks + proof the scorer
  **discriminates** (penalizes hallucinated *and* dropped bullets, paraphrase matching,
  micro-average pooling) so the gate isn't theater.
- **Result:** 77 backend + 7 satellite green; verified the whole suite + `python -m eval.harness`
  run in the clean CI venv with no new deps.
- ⚠ **Honest ceiling (mostly closed in §H1, 2026-06-30):** this pass shipped the offline
  **quality** gate + a latency/cost profiler. The **labeled `transcript → IR` pairs**, the
  **seed reporting**, and **experiment tracking** named here as remaining are now done — see
  **§H1**. Still open: golden sets for the legacy 6-model harness, and the §11.5 stale legacy pins.

---

## G. Observability completion + lint gate (2026-06-30, branch `Clarity_Stack_V3`)

> Closes the §10.5 / §5.7 observability leg (traces + errors + a dashboard) on top of
> the existing structured logs + Prometheus metrics, and flips the Backend pyflakes
> lint gate to blocking (§10.4). Commits: `4659859` (observability), `2be50ff` (lint).

### G1. OpenTelemetry traces + Sentry + Grafana board [⭐⭐⭐] (existing_issues §10.5 → ✅ DONE)
- **Traces** — `Backend/tracing.py` + `Satellite/tracing.js`: OTel auto-instruments
  FastAPI/Express + outbound HTTP (`requests`/`httpx`), so one request becomes a single
  distributed trace (UI→Core→Gateway→provider, Core→Satellite via W3C `traceparent`).
  Backend server spans are stamped with the request's `request_id`, so a span and its
  JSON log lines join on one id.
- **Errors** — Sentry init (gated on `SENTRY_DSN`) captures the `request_error` the request
  middleware already logs, tagged with `request_id`.
- **Optional + no-op** — both are off unless enabled by env (`OTEL_TRACES_ENABLED` /
  `OTEL_EXPORTER_OTLP_ENDPOINT`, `SENTRY_DSN`); the SDKs live in
  `Backend/requirements_observability.txt` / `Satellite/observability.packages.txt`, so a
  plain install + CI never pull them — same dependency-free discipline as `metrics.py`.
- **Grafana** — `observability/` provisions Tempo (traces) + Prometheus (scrapes `/metrics`)
  + a dashboard JSON (request rate, p95 latency, exceptions, LLM tokens/cost/calls), brought
  up by the opt-in `docker-compose.observability.yml` overlay (doesn't bloat the default `up`).
- **Verified:** Backend 108 + Satellite 16 green (no regressions); new `test_tracing.py` (5) +
  `tracing.test.js` (2) assert the gating + no-op contract; `import main` clean on the no-op
  path; compose overlay merges + parses (OTEL env + Tempo dep land on backend + satellite).
- ⚠ **Still open (minor):** trace/`request_id` propagation into Editor/SRS/UML — browser-driven,
  needs frontend OTel/header instrumentation (separate, low value).

### G2. Backend pyflakes lint gate → blocking [⭐⭐] (existing_issues §10.4)
- The ~44 pre-existing pyflakes hits (unused imports/vars/re-imports, unused `except … as e`
  bindings, two authz-gate calls whose return was assigned but never used) are fixed across the
  Backend app code; `ruff check . --select F --exclude venv,tests` is clean.
- The CI "full pyflakes" step dropped `continue-on-error` — it's now a hard gate, so the
  cleanliness can't regress. Bug-rule gate (E9,F63,F7,F82) unchanged. `ruff.toml` comment updated.
- Frontend ESLint (188 errors, mostly `no-explicit-any`) stays non-blocking — a separate, larger
  cleanup, not bundled here.

---

## H. Eval accuracy + grounding + metrics landed + CI made green (2026-06-30, branch `Clarity_Stack_V3`)

> Closes the F3 "honest ceiling" (labeled transcript→IR accuracy + experiment tracking + seeds),
> adds §10.6 grounding, **actually commits** the Prometheus `/metrics` module that §G1 referenced,
> and fixes a red CI (runs #4/#5) whose root cause was *the committed workflow running ahead of its
> committed dependencies*. Commits: `36e6c074` (modules+deps), `112e45b9` (docker), `5a72af6f` (docs),
> `ed8efa36` (frontend test infra).

### H1. §10.10 — labeled transcript→IR accuracy + experiment tracking + seeds [⭐⭐⭐⭐] (closes F3 ceiling)
- **`Backend/eval/transcripts.py`** — labeled (`transcript → expected IR`) golden set, the pairs F3 said
  were missing. Scored ONLINE through the **real** path (`ensemble fn → tag_with_provider → synthesize_content
  → parse_ir_from_synthesis`), restricted to substantive sections (SUMMARY/CONFIDENCE excluded as
  model-/measurement-generated metadata). So the *live ensemble's extraction accuracy* is now scored, not just latency/cost.
- **`harness.py`** — `extract_online`/`run_online_accuracy` + an accuracy table; `--track`/`--compare`;
  `MODEL_SEED` reported on every online run (§11.6 reproducibility note: temp 0 + seed is best-effort, hosted LLMs aren't bit-exact).
- **`Backend/eval/tracking.py`** — persists each run (ts + git commit + active model set/seed + scores) to
  `eval/runs/` (gitignored), and `--compare` prints the **F1/P/R delta vs the previous run** (per-section, with a `REGRESSED` flag).
- **Tests:** `test_eval_tracking.py` (5) + transcript-infra guards in the eval suite.

### H2. §10.6 — grounding: cite synthesis bullets to source [⭐⭐⭐⭐] (existing_issues §10.6 → 🟡 PARTIAL)
- **`Backend/grounding.py`** — cites each IR bullet back to the provider messages that support it, reusing the
  KG token model (§10.3 parity) with an **asymmetric coverage** measure (fraction of the bullet's tokens present
  in a source — not Jaccard, which would dilute a short bullet inside a long source). Uncited bullet → `grounded=false` (hallucination signal).
- **`GET /chats/{chat_id}/synthesis/{reply_group_id}/grounding`** — read-only, recomputed from the stored
  synthesis + its provider messages (nothing persisted); returns per-bullet citations + a grounding ratio.
- **Tests:** `test_grounding.py` (8: 7 pure + 1 live endpoint). Pairs with the already-enforced
  `validate_ir_structure` to give §10.6 both halves (schema validation + source grounding).

### H3. §10.5 — Prometheus `/metrics` actually committed [⭐⭐⭐] (completes the §G1 reference)
- **`Backend/metrics.py`** (dependency-free) + **`GET /metrics`** — request counter (`method/route/status`, route =
  template so no label explosion), latency histogram, exceptions, and **per-provider LLM token counters read from
  the gateway's own accounting** (`llm_gateway._stats`, never re-counted); **cost only when priced** (`LLM_PRICE_PER_1K_TOKENS`).
- §G1 described this as existing; it was untracked until `36e6c074` — landing it also fixed the backend CI import (see §H6). **Tests:** `test_metrics.py` (7).

### H4. §10.4 — coverage gate + frontend test infra committed [⭐⭐⭐] (existing_issues §10.4)
- **Coverage:** `requirements_ci.txt += ruff, pytest-cov`; `.coveragerc` scopes coverage to the engine modules
  (synthesis/IR/KG/agreement/grounding/metrics/logging/eval), gate `--cov-fail-under=70` (currently ≈79%); `ruff.toml` documents lint scope.
- **Frontend job:** committed the **vitest test infra the workflow already hard-gated** — `typecheck`/`test`/`e2e`
  scripts + vitest/testing-library/jsdom/playwright devDeps, `vitest.config.ts`, `src/test/setup.ts`, 3 unit-test
  files (**20 tests**), `playwright.config.ts` + an `e2e/` smoke (e2e is local-only, not in the CI gate). package.json change is purely additive.
- **Result:** backend 103 green @ 79% coverage; frontend `npm ci` + typecheck + vitest(20) + build all green.

### H5. §10.4 / §5.8 — all 7 Docker images build green + uml-ui lockfile fix [⭐⭐⭐] (existing_issues §10.4)
- `docker compose build` → **all 7 service images build** (backend ~12 GB / srs ~9 GB torch, + editor/satellite/uml-backend/frontend/uml-ui).
- **Real defect found by building:** `UML_Clarity_Service/package-lock.json` was out of sync with package.json
  (`Missing: @emnapi/*`) so strict `npm ci` failed the uml-ui image — `docker compose config` validation alone never caught it.
  Lockfile regenerated **inside `node:20-slim`** (matching the container's npm) → in sync.
- `requirements_backend.txt` + `requirements_uml_backend.txt` re-saved **UTF-16 → UTF-8** so pip in the slim images reads them.

### H6. CI runs #4/#5 red → green — workflow committed ahead of its deps [⭐⭐⭐] (meta-fix, existing_issues §10.4)
- **Root cause:** the committed `ci.yml` (and `main.py`) referenced things that were never committed — `import metrics`/`grounding`
  (untracked modules → `import main` failed at collection), `ruff`/`pytest-cov` (not in `requirements_ci.txt` → "command not found"),
  `.coveragerc`, `docker-compose.yml` (compose-validate job), and the frontend `typecheck`/`test` scripts ("Missing script").
- **Fix:** landed each missing piece (`36e6c074`, `112e45b9`, `ed8efa36`). Run **#6** (`5a72af6`) confirmed
  **backend + satellite + compose-validate green**; the frontend fix (`ed8efa36`) was verified by running the exact
  CI steps against a **clean checkout** of the pushed commit (npm ci + typecheck + vitest 20 + build) → green.
- **Lesson (also noted in existing_issues §10.4):** a CI step must not be committed before the deps/files it invokes.

---

## I. §10.7 — Postgres path validated end-to-end (2026-06-30, branch `Clarity_Stack_V3`)

> Closes existing_issues §4.2's open clause ("validate the Postgres path before launch") and lifts §10.7 from
> 🟡 (groundwork only) to ✅. The code was already DB-agnostic after §C2 (`DATABASE_URL` read, SQLite-only
> flags/PRAGMAs guarded on dialect, Alembic = single source of truth); what was missing was **proof on a real
> Postgres**, not SQLite. Ran `docker-compose.postgres.yml` (`postgres:16-alpine`, host port 5433) and exercised
> the full path with `Backend/venv` + `psycopg2-binary` already installed.

### I1. Migrations run clean on Postgres [⭐⭐⭐] (existing_issues §4.2, §10.7)
- **SQLite-ism audit first:** swept `Backend/**.py` for `json_extract`/`GROUP_CONCAT`/`strftime`/`PRAGMA`/
  `ON CONFLICT`/`AUTOINCREMENT`/`rowid`/`||` in **SQL**. None — the only raw SQL is `db.execute(text("SELECT 1"))`
  (portable health probe); the `strftime` hits are Python `time.strftime`, not SQL. Both migrations use only
  dialect-agnostic types (`sa.String/Text/Boolean/DateTime(timezone=True)`, `sa.func.now()`, `sa.false()`).
- **Full reversibility cycle on PG:** `alembic downgrade base` → only `alembic_version` remains → `alembic upgrade
  head` rebuilds all 14 tables from empty. Both directions clean, transactional DDL.
- **Zero drift:** `alembic check` against the Postgres-built schema → **"No new upgrade operations detected"** — the
  migrations match the ORM models *exactly* on PostgreSQL (the strongest validation: schema == models, not just "runs").

### I2. App engine (not just Alembic) talks to Postgres [⭐⭐⭐]
- Smoke-tested `database.py`'s own engine with `DATABASE_URL=postgresql+psycopg2://…@localhost:5433/claritystack`:
  dialect resolves to `postgresql`, `_IS_SQLITE=False` (SQLite `check_same_thread` + WAL/FK PRAGMA listener correctly
  skipped), `SELECT 1` returns, and a full **ORM write→read→delete roundtrip** on a real `projects` row succeeds.
- **Net:** the Postgres path is now exercised, not theoretical. SQLite stays the zero-config dev default; production
  sets `DATABASE_URL` + `RUN_MIGRATIONS_ON_STARTUP=0` and runs `alembic upgrade head`. Unblocks §10.8 (pgvector RAG).

---

## J. §16.4 — Temporal Cards: real "Commit to KG" + no more duplicate versions (2026-06-30, branch `Clarity_Stack_V3`)

> Full read-before-code analysis: [`temporal_cards_16_4_analysis.md`](./temporal_cards_16_4_analysis.md).
> The audit's §16.4 had 4 sub-items; investigation corrected two of them: `expireOldCards` is **intentional**
> (not a bug), and coarse-category chaining is a real-but-architectural pass deferred to its own cycle. The two
> shipped here are the genuine, scoped wins.

### J1. §16.4 — "Commit to KG" lands in the real KG (option A: Core ingestion) [⭐⭐⭐⭐]
- **The dead-end:** `applyKGDiff` wrote card nodes into a Satellite Mongo `KGSnapshot` (`chatId:"auto"`) that
  **no frontend surface reads** (`getKnowledgeGraph` et al. have zero callers) and that the next
  `deltaEngine.takeSnapshot` **overwrites** from Core. `KnowledgeGraphPage` reads **Core** `/api/reasoning`.
  So clicking "Commit to KG" changed nothing visible and churned the mirror (the §16.3 link).
- **Fix (single source of truth):** new authz'd **`POST /chats/{chat_id}/kg/ingest`** (`Backend/main.py`)
  inserts `KnowledgeNode`/`KnowledgeEdge` into Postgres, attached to the card's source chat — so card knowledge
  shows in the graph the UI already reads and **survives re-sync**. Idempotent per `(chat, section, content)`;
  duplicate edges + edges to nodes outside the payload are skipped (no orphan FK). `get_chat_or_403` enforces
  write access (no tenancy leak).
- **Satellite:** `applyKGDiff` (Mongo) → `pushKGToCore` (HTTP to Core, attached to `sourceChatIds[0]`); user
  `token` threaded through `runCardPipeline` → `handleKGSync` and `updateKGFromCard`; auto-flush without a
  token/source-chat is **deferred to pending** (never silently dropped); orphan `KGSnapshot` import removed.
  `update-kg` route now passes the token (401 if absent).
- **Frontend:** "Commit to KG" toast → `+N nodes / +M edges`.
- **Tests:** `test_kg_ingest.py` (2: lands+renders+idempotent, tenancy-gated 404). Backend **110 green**,
  Satellite **16 green**, frontend typecheck clean.

### J2. §16.4 — "Generate Card" no longer spawns near-duplicate versions [⭐⭐⭐]
- **The churn:** `generateCardFromChat` fell back to "last 5 messages" whenever nothing was newer than the last
  card, so repeat clicks re-synthesized the same input into fresh **versions**.
- **Fix:** when there are no new messages, split first-run from already-have-card. If a prior active card exists →
  return it with `{ upToDate:true }`, **no regeneration**; only seed last-5 on the true first run. Route passes
  `upToDate` through; `ChatCard.tsx` shows "Already up to date" (and a pre-existing toast bug — reading
  `card.title`/`card.label` off a `{cards,count}` object → "undefined" — was fixed in the same edit).

### J3. §16.4 — corrections to the audit (no code, by design)
- **`expireOldCards` no-op is INTENTIONAL** (`"Expiry removed per user request"`). The audit's premises were
  false: `TemporalCard` has **no `expiresAt` field** (the `generateCardFromDelta` write is a phantom mongoose
  drops) and the frontend has **no card-expiry UI**. Re-enabling expiry would reverse a documented user decision —
  left as-is. Vestigial "stale" messaging noted for optional later cleanup.
- **Coarse-category chaining** (lineage keyed on `category`, conflating unrelated risks/decisions) is real but a
  design change with model-quality implications — **deferred** to its own pass, recorded in `existing_issues.md §16.4`.

---

