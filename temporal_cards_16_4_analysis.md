# §16.4 — Temporal Cards: deep analysis + fix plan (2026-06-30, branch `Clarity_Stack_V3`)

Investigation of `existing_issues.md §16.4` ("temporal is disabled, Commit to KG is a dead-end").
Read every involved file before any code. Findings below correct the audit where the audit was wrong.

## Files in scope
- `Satellite/services/cardChainer.js` — orchestrator (pipeline, KG sync, expiry, query helpers)
- `Satellite/services/deltaEngine.js` — `fetchKGFromCore`, `takeSnapshot`
- `Satellite/models/TemporalCard.js` — card schema
- `Satellite/models/KGSnapshot.js` — KG mirror schema
- `Satellite/routes/cards.js`, `Satellite/routes/kg.js` — routes
- `Backend/main.py` — `GET /api/reasoning/chat/{chat_id}` (the real KG source)
- `Web/Frontend/src/pages/KnowledgeGraphPage.tsx` — KG visualization (reads Core)
- `Web/Frontend/src/pages/TemporalCardsPage.tsx` — card UI + "Commit to KG" button
- `Web/Frontend/src/lib/api.ts` — frontend API surface

## Data-flow truth (verified, not assumed)
- **Core Postgres = source of truth KG.** `knowledge_nodes` / `knowledge_edges` built during `/ask`
  synthesis, scoped per `chat_id`. Read by `KnowledgeGraphPage` via `GET /api/reasoning/chat/{chatId}`
  (`KnowledgeGraphPage.tsx:131`) and `MessagesPage.tsx:828`.
- **Satellite Mongo `KGSnapshot` = derived mirror.** `deltaEngine.takeSnapshot` (`:144`) calls
  `fetchKGFromCore` (pulls every chat's `/api/reasoning`) and `KGSnapshot.create(...)` — a full clone of
  Core KG into Mongo. Card→KG (`applyKGDiff`) ALSO appends card nodes (`chatId:"auto"`) into a new
  `KGSnapshot` version.
- **Satellite KG readers are dead.** `getKnowledgeGraph` / `snapshotKnowledgeGraph` /
  `getKnowledgeGraphFocus` (`api.ts:557-567`) hit `/api/satellite/kg/...` but have **zero callers** in the
  frontend. So nothing in the UI ever displays `KGSnapshot`.

---

## ISSUE 1 — `expireOldCards` is a no-op  →  **NOT A BUG. Intentional. Do NOT "fix".**
- `cardChainer.js:350-353`: `expireOldCards` hard-returns `0`. Comment: *"Expiry removed per user
  request: cards will remain active indefinitely."*
- Audit claimed "no-op despite `expiresAt` + the UI's expiry framing." **Both premises false:**
  - `TemporalCard` schema has **no `expiresAt` field** (only legacy `expired:Boolean` + `status` enum
    incl. `"stale"`). `generateCardFromDelta:491` writes a phantom `expiresAt` that mongoose silently
    drops (not in schema).
  - Frontend has **no card-expiry/stale UI** (grep `expiresAt|expiry|stale|expired` over `Web/Frontend/src`
    → only unrelated session-expiry + document-store hits).
- **Verdict:** re-enabling expiry would REVERSE a documented user decision. Leave the no-op.
- **Vestigial cleanup (cosmetic, optional, low-risk):**
  - `cardChainer.js:405` `autoGenerateCards` message reports `${expiredCount} stale` — always 0, misleading.
  - `generateCardFromDelta:491` phantom `expiresAt` write — dead.
  - `getExpiredCards` + `GET /cards/:projectId/expired` + `api.getExpiredCards` — always `[]`; honest but pointless surface.
  - **Decision needed:** keep vestige (no harm) vs. remove for honesty. Default: leave; not worth churn unless asked.

## ISSUE 2 — "Commit to KG" is a dead-end  →  **REAL. Architectural. Highest value.**
- Flow: TemporalCardsPage "Commit to KG" → `applyKGUpdates` (`api.ts:621`) →
  `POST /cards/:projectId/:cardId/update-kg` → `updateKGFromCard` (`cardChainer.js:499`) →
  `applyKGDiff` (`:156`) → writes nodes into Satellite `KGSnapshot` with `chatId:"auto"`.
- **Two independent reasons it never appears in the graph:**
  1. `KnowledgeGraphPage` reads **Core** `/api/reasoning`; card nodes live in **Satellite** `KGSnapshot`.
     The only readers of `KGSnapshot` (`getKnowledgeGraph` et al.) have **no callers**. → invisible.
  2. Even the Satellite mirror is volatile: next `takeSnapshot` (`deltaEngine:144`) rebuilds `KGSnapshot`
     purely from Core and **drops the card nodes**. → churn (the §16.3 link).
- **Root cause:** card knowledge has no path INTO Core Postgres KG, which is the single source the
  visualization trusts. Core has **no ingestion endpoint** for external (non-synthesis) KG nodes, and its
  KG is chat-scoped while card nodes are `chatId:"auto"` (belong to no chat).
- **This is a design decision, not a patch** (see PLAN options A/B/C).

## ISSUE 3 — "always works" fallback spawns near-duplicate versions  →  **REAL. Self-contained. Safe to fix now.**
- `generateCardFromChat` (`cardChainer.js:259-303`): when no messages newer than the last card
  (`messages.length === 0`) but the chat is non-empty, it falls back to `allMessages.slice(-5)` (`:275-278`)
  "so the button always works." Repeat clicks with nothing new → re-synthesize same 5 → new card VERSION
  each time → near-duplicate lineage.
- Compare `generateCardByLabel` (`:320`): on no-new-messages it **throws** a clear message — the
  codebase's own established pattern. `generateCardFromChat` is the inconsistent one.
- Route `cards.js:114-128` returns `{ cards, count }`; frontend `generateCardFromChat` (`api.ts:591`)
  surfaces that. Returning existing cards is shape-compatible.

## ISSUE 4 — chaining keys on coarse `category`  →  **CROSS-CHAT HALF FIXED (per-chat lineage); intra-chat split deferred.**
**Update (2026-06-30):** version-parent lookup now scoped to `{projectId, sourceChatIds:chatId, category,
status:"active"}` via exported pure `chainParentFilter` — honors the writer's `chainIndex = ${chatId}_${category}`,
so cards in different chats no longer share a lineage. Deterministic, no tuning. Tested in
`Satellite/test/cardChainer.test.js` (4). Still deferred: two unrelated threads in the SAME chat (needs
data-tuned semantic similarity — see option B in the §16.4 lineage decision). Original analysis below.


- `runCardPipeline:94` looks up `lastCard` by `{projectId, category, status:"active"}`. So every fragment of
  category e.g. `"risk"` chains into ONE lineage project-wide, regardless of topic — unrelated risks get
  versioned over each other.
- `chainIndex` field (model comment: `chatId_category`) is meant to be the lineage key but pipeline ignores
  it for the lookup; `generateCardFromDelta:479` sets `${projectId}_general`. Inconsistent.
- Proper fix needs a finer chain key (semantic topic / title similarity / explicit subject) — a real
  design change with model-quality implications. **Not a quick safe patch. Defer to its own pass.**

---

## PLAN

### ✅ DONE — ISSUE 3 — kill duplicate-version spawning (2026-06-30)
- `cardChainer.generateCardFromChat`: no-new-messages branch now splits first-run vs already-have-card.
  If a prior active card exists → return existing active card(s) + `{ upToDate:true }`, **no regeneration**.
  Only seeds last-5 when there is NO prior card. Returns `{ cards, upToDate }`.
- `routes/cards.js` generate/chat → passes `upToDate` through in the JSON.
- `ChatCard.tsx` → reads real `{ cards, count, upToDate }` shape (also fixed a pre-existing toast bug that
  read `card.title`/`card.label` off an object that never had them → "undefined"); shows "Already up to date".
- Syntax-checked (`node --check`) both Satellite files. Only caller of `generateCardFromChat` is the route.

### (original plan retained below)
### Now (safe, unambiguous): ISSUE 3 — kill duplicate-version spawning
1. In `generateCardFromChat`, split the no-new-messages branch:
   - If a prior active card for this chat exists → **do not regenerate**. Return existing active card(s)
     with an `upToDate:true` signal instead of spawning a dup version.
   - If NO prior card (true first run on a populated chat) → keep the last-5 seed so the button works.
2. Route `cards.js` generate/chat → pass through `upToDate` so UI can say "already current" vs "generated".
3. (Optional, tiny) `TemporalCardsPage` toast: show "Already up to date" when `upToDate`.
4. Verify: Satellite node test or manual — second click with no new messages creates 0 new versions.

### ✅ DONE — ISSUE 2 — "Commit to KG" now lands in Core KG (option A, 2026-06-30)
- **Decision:** user chose **A (Core ingestion)** — single source of truth, unblocks §10.8.
- **Core (`Backend/main.py`):** new `POST /chats/{chat_id}/kg/ingest` (authz'd via `get_chat_or_403`,
  write access). Inserts `KnowledgeNode`/`KnowledgeEdge` into Postgres, attached to the chat. Idempotent
  per `(chat, section, content)`; duplicate `(from,to,relation)` edges skipped; edges referencing nodes
  outside the payload skipped (no orphan FK). Maps card-local node ids → real row ids for edge wiring.
- **Satellite (`cardChainer.js`):** removed the dead-end `applyKGDiff` Mongo write; added `pushKGToCore`
  (POSTs the card's `kgDiff` to the Core endpoint, attached to `card.sourceChatIds[0]`). Threaded the user
  `token` through `runCardPipeline` options → `handleKGSync(card, token)` and through
  `updateKGFromCard(projectId, card, token)`. Auto-flush with no token/source-chat is **deferred to pending**
  (never silently lost). Dropped the now-orphan `KGSnapshot` import.
- **Satellite route (`routes/cards.js`):** `update-kg` now extracts + passes the token (401 if missing).
- **Frontend:** `TemporalCardsPage` "Commit to KG" toast → `+N nodes / +M edges` (new shape). Card nodes now
  render in `KnowledgeGraphPage` (reads Core) and survive `takeSnapshot` re-sync.
- **Tests:** `Backend/tests/test_kg_ingest.py` (2) — lands+renders+idempotent, and tenancy-gated (404 for
  non-member). Full backend suite **110 green**; Satellite **16 green**; frontend typecheck clean.

### (original plan retained below)
### Needs decision before code: ISSUE 2 — make "Commit to KG" real
Pick one:
- **A. Write card KG into Core Postgres (correct, bigger).** Add a Core ingestion endpoint
  (`POST /api/reasoning/nodes` or similar, authz'd) that inserts `KnowledgeNode`/`KnowledgeEdge`; point
  `applyKGDiff`/`updateKGFromCard` at it. Card nodes then show in the real graph and survive. Must decide
  chat scoping (attach to a synthetic/source chat, or extend reasoning to project-scope).
- **B. Make the Satellite KG view live + non-volatile (smaller, keeps split-brain).** Wire
  `getKnowledgeGraph` into a UI surface and stop `takeSnapshot` from clobbering card nodes (merge, not
  replace). Cheaper but leaves two KG sources of truth — tech debt.
- **C. Remove the dead-end honestly (smallest).** Drop the "Commit to KG" button + `update-kg` route until
  a real KG-ingestion path exists, so the UI stops promising a no-op.
- **Recommendation: A** long-term (single source of truth, unblocks §10.8 RAG over a real KG), **C** if a
  fast honest cut is preferred this cycle.

### Defer: ISSUE 4 (coarse chaining) + ISSUE 1 vestige cleanup
- Own pass; not safe/quick. Note in `existing_issues.md` so they aren't lost.

## Open decision for user
- ISSUE 2 direction: **A (real Core ingestion)** vs **C (remove dead button)** vs **B (revive Satellite view)**.
- ISSUE 3 fix can proceed regardless.
