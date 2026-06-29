# Issues Fixed — ClarityStack

> **What this file is:** the log of *completed* work, moved here out of `take_step_forward.md` so that
> roadmap doc only carries what is still pending. `existing_issues.md` remains the live risk register
> (it still cross-references these as FIXED). `take_step_forward.md` now holds only 🟡 partial / ⏳ pending items.
>
> **Branch:** `UI_enhanced` · **Last updated:** 2026-06-28
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

