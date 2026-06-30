# Frontend Remark — a walk through every page, as a user

> I opened the app the way a new user (and a skeptical developer) would, and walked
> every route. For each page below: **what I arrived wanting**, **what I actually saw**
> (grounded in the code), **the gap**, and **the premium move**. Then the bugs I tripped
> over on the walk, the vision, and a priority order.

---

## Verdict (one line)

**The backend is a precision instrument; the frontend is a brochure with a dark theme.**
It works and it's honest — but it reads like a dozen *separately* AI-generated pages
stitched under one stylesheet, and it hides the one thing that makes ClarityStack rare:
**provable, measured honesty.** We can do much better, and the backend has earned it.

## Why it reads as "AI-generated" — and it's measurable, not a vibe

Three root causes, each visible in the code:

1. **One recipe, repeated 113 times.** Across 19 page files, the same six decorative
   tokens (`glow-orb`, `gradient-text`, `glass-panel`, `Sparkles`, `animate-fade`,
   `stagger-`) appear **113 times**. Every screen = orbs in the back, a gradient `<h1>`
   with a `Sparkles` chip, glass cards fading up. That sameness *is* the template smell.
2. **No single hand enforced the system.** 138 hits of *off-system* choices across 15
   files — raw Tailwind colors (`slate-*`, `emerald-*`, `amber-*`, `cyan-400`, even
   **undefined** `neon-purple`/`neon-pink`), native `window.confirm`/`prompt` next to
   proper shadcn `AlertDialog`, lucide icons next to emoji (`⎈ ∆ 🃏 ⭐ 🗑`). The design
   tokens exist; they just aren't *obeyed*.
3. **The crown jewel is a dot.** Measured inter-model agreement — the entire honesty
   thesis (§10.3) — surfaces as a tiny `animate-pulse` colored dot + uppercase label.
   The most defensible idea in the system is the least visible thing on screen.

---

## Page by page

### `/` — Landing ([Landing.tsx](src/pages/Landing.tsx))
- **Arrived wanting:** in 5 seconds, *what is this and why is it different?*
- **Saw:** a generic three-card hero — "Multi-Model AI / Knowledge Graph / Decision
  Intelligence" — with marketing filler ("generate a unified truth") and **factually
  wrong** copy: it credits *"Groq, HuggingFace, and Gemini"* and *"Paste from ChatGPT,
  Slack"*. The real engine is **Groq + NVIDIA**, and §16.1 was *proud* of using no
  fictional providers.
- **The gap:** it could be any of 10,000 AI landing pages. It says nothing *true* about
  this product, and quietly lies about the engine.
- **Premium move:** lead with the actual thesis — *"AI you can audit."* Show the live
  consensus instrument right in the hero (models converging on an answer, the disagreement
  spotlight). One real, moving proof beats three generic cards.

### `/login` · `/register` ([Login.tsx](src/pages/Login.tsx), [Register.tsx](src/pages/Register.tsx))
- **Arrived wanting:** get in fast, feel I'm entering something serious.
- **Saw:** a centered glass card, orbs, "Welcome back." Solid touch: a 404 turns into a
  "Create an account for {email} →" CTA. But the fields are **raw `<input>`s**, not the
  shadcn `Input` used elsewhere (so focus/validation styling drifts), there's **no loading
  state** on the submit button, and the only "logo" is the word *ClarityStack*.
- **The gap:** functional, forgettable, and inconsistent with the rest of the app's inputs.
- **Premium move:** one branded mark, the project's `Input`, an in-button spinner, and a
  single line of personality that states the promise (not "Welcome back").

### `/projects` — Projects ([ProjectsPage.tsx](src/pages/ProjectsPage.tsx))
- **Arrived wanting (this is the home base):** see my work, jump to it instantly.
- **Saw:** a vertical list of cards, centered in `max-w-6xl`, a gradient "Hello, {name}",
  and a floating `+`. No search, no filter, no sort, no keyboard nav, no density.
- **The gap:** it's built for a *viewer who browses*, not a *developer who lives here*.
  At 20 projects it's already slow to scan.
- **Premium move:** `⌘K` to jump to any project, `j/k` to move, a density toggle, last-active
  sort, and a per-project pulse (cards added this week, open conflicts). Make returning feel
  fast and rewarding.

### `/projects/search` — "Join Project" ([ProjectSearch.tsx](src/pages/ProjectSearch.tsx))
- **Arrived wanting:** find a team's project and ask to join.
- **Saw:** a form that demands I **paste an exact project UUID** ("e.g. d241f66a…"), an
  icon tile painted with **`from-neon-purple to-neon-pink`** — colors that *don't exist*
  in the theme, so the gradient renders **broken/transparent** — and raw `bg-white/5`
  inputs off the token system.
- **The gap:** nobody knows a UUID. This is a dead-end for the actual job (find by name),
  and it's visibly broken.
- **Premium move:** fold this into Discovery as name search; delete the UUID path. Fix or
  remove the broken gradient.

### `/discovery` — Discovery Hub ([DiscoveryPage.tsx](src/pages/DiscoveryPage.tsx))
- **Arrived wanting:** find interesting projects, follow them, watch them grow.
- **Saw:** a genuinely decent two-column layout — an activity feed showing real graph
  deltas ("+N additions, −M removals", new intelligence preview) and a debounced public
  search with Follow / Join. This is one of the better screens.
- **The gap:** the feed items are flat; "Join Req" is truncated/cramped; `any[]` types and
  `glass-card` (a different class) creep in.
- **Premium move:** make the feed feel *alive* — sparkline of a project's knowledge growth,
  "3 new decisions, 1 new conflict," one-click follow with optimistic UI.

### `/projects/:id/chats` — Chats ([ChatsPage.tsx](src/pages/ChatsPage.tsx))
- **Arrived wanting:** see this project's context and its conversations, start a new one.
- **Saw:** a "PROJECT CONTEXT" card, three satellite shortcuts whose icons are **emoji /
  unicode glyphs** (`⎈ ∆ 🃏`), a chat list, and a `⋮` menu whose **Rename uses a native
  `window.prompt()`** and Delete a `window.confirm()`. There's also a **bug**: a chunk of
  raw CSS `@keyframes` is pasted *inside* a `className` string ([lines 411–416](src/pages/ChatsPage.tsx#L411-L416))
  with a `63s` animation — dead, invalid markup.
- **The gap:** native browser dialogs and emoji icons shatter the premium feel; the dead
  CSS is the literal fingerprint of paste-without-reading.
- **Premium move:** replace emoji with lucide, `prompt/confirm` with the shadcn
  `Dialog`/`AlertDialog` already used in SRS, and delete the broken keyframe string.

### `/projects/:id/chats/:chatId` — Messages ([MessagesPage.tsx](src/pages/MessagesPage.tsx))
- **Arrived wanting (the daily driver):** ask, and *watch the honest engine work.*
- **Saw:** the deepest screen by far — live WebSocket presence, typing indicators,
  synthesis, Devil's Advocate, decision trace, decision readiness, Ask-Anyway. But it's a
  **1,413-line monolith** and those superpowers are hidden behind unlabeled icon buttons
  (`Split`, `Swords`, `Target`). It also carries the most off-system styling (51 hits) and
  mixes `AlertDialog` *and* native dialogs.
- **The gap:** the richness exists; the **staging** doesn't. The product's best moments are
  buried.
- **Premium move:** make this the *stage*. When an answer lands, reveal the consensus
  instrument inline, let the Disagreement Spotlight literally spotlight the contested claim,
  and make every synthesized line hover-to-trace its sources. Split the monolith into
  composed pieces.

### `/projects/:id/kg` — Knowledge Graph ([KnowledgeGraphPage.tsx](src/pages/KnowledgeGraphPage.tsx))
- **Arrived wanting:** *explore* my project's knowledge like a map.
- **Saw:** a real `ForceGraph2D` with directional particles, a legend, a node-detail
  sidebar, stats, and drill-down (chat → type group → node). The strongest "real" screen.
  But it's squeezed into `flex-1` beside a 288px panel, confidence shows as off-theme
  `text-cyan-400`, and the controls are plain.
- **The gap:** the natural hero of the whole product is rendered as a *tab*, not a stage.
- **Premium move:** promote it to a full-bleed, fast, beautiful canvas — time-scrub the
  graph's evolution, click a node to ripple its reasoning edges, search-to-focus. This is
  the "just one more node" addictive loop.

### `/projects/:id/delta` — Delta Engine ([DeltaTimelinePage.tsx](src/pages/DeltaTimelinePage.tsx))
- **Arrived wanting:** what changed in this project's knowledge, and when?
- **Saw:** a clean vertical timeline with added/removed columns, `line-through` on removals,
  a "Latest" badge, and a "Generate AI Card" action. Honest, useful data viz.
- **The gap:** hardcoded `rgba()` shadows and gradient-header sameness; diffs are textual
  only.
- **Premium move:** add a tiny growth sparkline up top and let a delta link straight into
  the graph at that moment in time.

### `/projects/:id/cards` — Temporal Cards ([TemporalCardsPage.tsx](src/pages/TemporalCardsPage.tsx))
- **Arrived wanting:** the versioned knowledge this project has captured.
- **Saw:** **the best page in the app.** Real status badges ("KG Pending" / "In KG"),
  "Commit to KG", "View in Graph" cross-links, expandable **version history**, key impacts,
  source counts. This is what *respecting the backend* looks like.
- **The gap:** still leaks off-theme colors (`amber-500`, `green-500`, `slate-300`,
  `bg-white/5`).
- **Premium move:** keep this as the template for the others; clean it onto tokens and let
  the version chain animate as a true lineage.

### `/cards` — Global Cards ([CardsPage.tsx](src/pages/CardsPage.tsx))
- **Arrived wanting:** skim insights across all my chats quickly.
- **Saw:** a sci-fi "Knowledge Deck" — a **"Neural Synthesis Active"** badge (status
  theater: nothing is actually happening), copy like "Synthesizing Deck…", "Scanning
  Hubs…", "Fragments", "Re-initialize", and a **one-card-at-a-time vertical carousel**
  (chevron up/down) wrapped in heavy blur and radial glows. Confidence is, again, a pulsing
  dot + "high Confidence Level".
- **The gap:** this is *what an AI thinks "premium" looks like* — maximal chrome, minimal
  substance. Paging one card at a time is the slowest way to scan many.
- **Premium move:** kill the theater and the carousel; show a fast, dense, filterable grid;
  make confidence a real instrument, not a dot.

### `/srs/*` — SRS Intelligence ([srs/Dashboard.tsx](src/pages/srs/Dashboard.tsx), [srs/IssuesPage.tsx](src/pages/srs/IssuesPage.tsx))
- **Arrived wanting:** upload an SRS PDF, see actors/stories/ambiguities.
- **Saw:** a competent sub-app — issue summary (ambiguities/conflicts/gaps), a doc list,
  and proper shadcn `AlertDialog` for destructive deletes (the *right* pattern). **But it
  doesn't use the main shell** — its own floating "Back to Projects", no sidebar, its own
  `glass-card`, `emerald-*`/`slate-*` colors.
- **The gap:** it feels like a *different product* bolted on.
- **Premium move:** bring it under the shared shell + tokens; it already has the best
  dialog hygiene, so lead the consistency pass from here.

### `/editor/*` — Collaborative Editor ([editor/Workspace.jsx](src/pages/editor/Workspace.jsx))
- **Arrived wanting:** a real-time multi-user editor that feels first-class.
- **Saw:** a separate `.jsx` sub-app (its own Supabase client, sockets) with its own look.
- **The gap:** another distinct visual world; least integrated with the design system.
- **Premium move:** decide if it's a peer feature (then unify it) or a power tool (then give
  it an intentional, still-on-brand "pro" skin).

### `/uml/dashboard` — UML-Clarity ([uml/Dashboard.tsx](src/pages/uml/Dashboard.tsx))
- **Arrived wanting:** generate/inspect UML.
- **Saw:** an **`<iframe>` of an entirely separate app** (port 8007), wrapped in a status
  pill ("Online/Offline") and an offline state. Honest and pragmatic — but it's a window
  into a *different* design language.
- **The gap:** the ultimate "stitched together" — a frame around another app.
- **Premium move:** at minimum, harmonize the embedded app's theme tokens so crossing the
  boundary doesn't feel like leaving the product.

### `/settings` — Settings ([SettingsPage.tsx](src/pages/SettingsPage.tsx))
- **Arrived wanting:** change my profile, theme accent, preferences — and trust they stick.
- **Saw:** post-§15.3 it's honest (dead fields removed, prefs persist). Functional, plain,
  some off-theme colors.
- **Premium move:** make the accent picker a *live* preview of the consensus instrument and
  cards, so theming feels like tuning an instrument.

### `*` — NotFound ([NotFound.tsx](src/pages/NotFound.tsx))
- 24 lines, generic. Fine for now; a small chance to show personality later.

---

## Bugs / inconsistencies I tripped over on the walk

1. **Landing lies about the engine** — "HuggingFace and Gemini" / "ChatGPT, Slack import"
   ([Landing.tsx:70](src/pages/Landing.tsx#L70), [:116](src/pages/Landing.tsx#L116)). Real: Groq + NVIDIA.
2. **Broken gradient** — `from-neon-purple to-neon-pink` + `purple-500/600` are not in the
   theme → renders transparent ([ProjectSearch.tsx:58](src/pages/ProjectSearch.tsx#L58)).
3. **Dead CSS in a className** — a raw `@keyframes` block pasted into a class string, `63s`
   duration ([ChatsPage.tsx:411-416](src/pages/ChatsPage.tsx#L411-L416)).
4. **Native `prompt()` / `confirm()`** for rename & delete (ChatsPage, CardsPage) while SRS
   uses proper `AlertDialog` — inconsistent and jarring.
5. **Emoji / unicode as UI** (`⎈ ∆ 🃏 ✕ ⋮ ⭐ 📂 🗑`) mixed with lucide icons.
6. **Off-theme colors everywhere** (`slate-*`, `emerald-*`, `amber-*`, `green-*`,
   `cyan-400`) — these bypass the tokens, so the dark-mode/accent switcher can't touch them.
7. **Raw `<input>`** on Login/Register instead of the shadcn `Input`; no submit loading state.
8. **Status theater** — "Neural Synthesis Active" badge and the Sidebar's three pulsing dots
   signal nothing.
9. **No unified shell** — SRS/Editor are sub-apps, UML is an iframe; three visual languages.
10. **UX dead-ends** — joining a project needs a pasted UUID; global Cards pages one at a time.

---

## The vision — premium, addictive, developer-loved

The product's soul is **"AI you can audit."** That should *be* the aesthetic. Engineers
don't fall for gradients; they fall for **speed, density, and receipts.**

1. **Pick one identity and commit: the engineering instrument.** Retire the orbs, ambient
   gradients, and `Sparkles`. Go Linear/Warp/Vercel: near-black, one disciplined accent,
   **monospace for all data** (`JetBrains Mono` is already loaded), hairline grids, surgical
   motion. Calm canvas, loud data. Premium = restraint.
2. **Make measured agreement the signature moment** — the thing people screenshot. Replace
   the confidence *dot* with a **consensus instrument**: watch the models converge or split,
   the agreement % as a real gauge, an oscilloscope/EKG feel. When they disagree, the
   **Disagreement Spotlight literally spotlights** the contested claim. No competitor has
   this, because none *measures* honesty.
3. **Receipts everywhere.** Hover any synthesized line → the source messages that grounded
   it, the shared terms that justified each KG edge, the version it came from. "AI that shows
   its work" *is* the stickiness — it's the trust loop that pulls people off the raw chatbot.
4. **Keyboard-first, command-palette-driven.** `⌘K` to jump anywhere, `j/k` to move, `g p` /
   `g c` motions, every action mouse-free. Single biggest "developers will love it" lever.
5. **Promote the Knowledge Graph to the hero.** Spatial, fast, time-scrubbable. Make wandering
   your project's knowledge feel like a map you *want* to explore.
6. **Craft the in-between states.** Optimistic sends, layout-matched skeletons, empty states
   with a real next action and a little voice ("No conflicts yet — the models agree. Ask
   something harder."). Motion only when state *changes*.
7. **Make progress visible (the hook).** A per-project pulse — knowledge captured this week,
   decisions resolved, conflicts open, graph growth. Give people a reason to come back and
   watch their source-of-truth grow.

---

## Priority (highest leverage → lowest)

1. **Fix the Landing lie + rewrite around the real thesis** (fast; stops misrepresenting the
   engine).
2. **One reusable consensus/agreement instrument** — instant identity; drop into Messages,
   Cards, KG.
3. **Consistency pass** — kill native dialogs, emoji icons, off-theme colors, and the broken
   gradient/keyframe bugs. Lead from SRS + Temporal Cards (the cleanest screens).
4. **`⌘K` + keyboard nav** — the daily-driver loyalty unlock.
5. **De-template the shell** — retire orbs/Sparkles/decorative dots; commit to the instrument.
6. **Promote the KG** to a true explorable hero.

---

*The bones are good and the backend is genuinely special. The frontend just needs one
opinionated hand to stop it looking auto-generated and start making the honesty visible.
That's the whole game.*

---
---

# Part II — Implementation Playbook

> Exact, buildable instructions per page, derived against the **ui-ux-pro-max** rule
> taxonomy (rule IDs in `code` map to that database) and the components/deps **already
> installed** in this repo. Every primitive named below exists today — no new dependency
> required. Backticked rule IDs (e.g. `color-semantic`, `motion-meaning`) are the
> acceptance criteria; treat each page's checklist as Definition of Done.

## 0. What you already have (use it, don't reinvent)

- **shadcn/ui** (51 components in [src/components/ui/](src/components/ui/)) incl. `command`
  (cmdk), `dialog`, `drawer` (vaul), `sheet`, `popover`, `hover-card`, `tabs`, `table`,
  `skeleton`, `progress`, `badge`, `scroll-area`, `tooltip`, `alert-dialog`, `chart`.
- **Deps:** `cmdk` (⌘K palette), `framer-motion`, `recharts` + `chart.tsx` (data viz),
  `react-force-graph-2d` (KG), `sonner` (toasts), `zustand`, `@tanstack/react-query`.
- **Tokens** (use these names verbatim — see [src/index.css](src/index.css) / [tailwind.config.ts](tailwind.config.ts)).

### Token cheat-sheet
| Use | Class |
|---|---|
| Accents | `text-neon-cyan` `-violet` `-peach` `-mint` (+ `/10` bg, `/30` border) |
| Roles (chat) | `text-role-user` `-assistant` `-system` `-moderator` |
| Surfaces | `bg-background` `bg-card` `bg-muted` · `glass-panel` `glass-panel-hover` |
| Text | `text-foreground` `text-muted-foreground` |
| Lines | `border-border` |
| Status | `text-primary` `text-destructive` · `hsl(var(--success))` `hsl(var(--warning))` |
| Shadow | `shadow-glow` `shadow-glow-sm` `shadow-elevated` `shadow-floating` |
| Motion | `duration-fast/normal/slow` · `ease-spring/smooth/snap` · `animate-fade-in-up` |
| Type | `font-sans` (Inter) · `font-display` (Plus Jakarta) · `font-mono` (JetBrains) |

### Off-theme → token replacement map (do this globally first — `color-semantic`)
```
slate-200/300        → text-foreground / text-muted-foreground
cyan-400             → text-neon-cyan
emerald-400/500      → text-neon-mint  (or hsl(var(--success)))
green-400/500        → hsl(var(--success))
amber-400/500        → text-neon-peach (or hsl(var(--warning)))
purple-500/600       → primary / neon-violet
neon-purple/neon-pink→ neon-violet / neon-peach   ← these DO NOT EXIST = broken
bg-white/5           → bg-muted/40
border-white/10      → border-border/40
text-red-500         → text-destructive
emoji icons (⎈∆🃏🗑) → lucide (Anchor, Sigma, Layers, Trash2 …)  `no-emoji-icons`
```

---

## A. Global foundations (build once → every page inherits)

### A1. Motion system — `motion-meaning` `duration-timing` `exit-faster-than-enter` `reduced-motion`
- Enter ≤ **300ms**, exit ≈ **0.16s** (60–70% of enter). List/grid stagger **0.04s/item**
  (`stagger-sequence`). Press scale **0.97** (`scale-feedback`). Animate **transform/opacity
  only** (`transform-performance`).
- Framer presets — put in `src/lib/motion.ts`:
  ```ts
  export const enter = { initial:{opacity:0,y:8}, animate:{opacity:1,y:0},
    transition:{duration:.22, ease:[.2,.7,.2,1]} };
  export const list = (i:number)=>({ ...enter, transition:{...enter.transition, delay:i*0.04} });
  ```
- Global `prefers-reduced-motion` — add to [src/index.css](src/index.css):
  ```css
  @media (prefers-reduced-motion: reduce){ *,*::before,*::after{
    animation-duration:.01ms!important; transition-duration:.01ms!important; } }
  ```
  and gate Framer with `const reduce = useReducedMotion()`.
- **Retire decoration** (`excessive-motion`): the 3 pulsing dots in [Sidebar.tsx](src/components/layout/Sidebar.tsx),
  the "Neural Synthesis Active" pulse in [CardsPage.tsx](src/pages/CardsPage.tsx), and demote the
  `glow-orb`s in [MainLayout.tsx](src/components/layout/MainLayout.tsx) to a single static, very subtle one.

### A2. Command palette (⌘K) — `keyboard-shortcuts` `search-accessible` `deep-linking`
- New `src/components/command/CommandPalette.tsx` over [ui/command.tsx](src/components/ui/command.tsx);
  mount once in [App.tsx](src/App.tsx). Global `keydown` for `⌘/Ctrl+K`.
- Groups: **Projects · Chats · Cards · Graph nodes · Navigate · Actions** (New project, New chat,
  Toggle theme, Compute delta). Each item routes via `navigate()` (every result deep-links).
- Show ⌘K hint in the sidebar header so it's discoverable.

### A3. Keyboard & focus — `focus-states` `keyboard-nav`
- Never remove focus rings; standardize `focus-visible:ring-2 ring-primary/60 ring-offset-2
  ring-offset-background`. Lists support `j/k` + `Enter`; `g p` → Projects, `g d` → Discovery.

### A4. `<ConsensusMeter>` — THE signature component (`color-not-only` `number-tabular` `motion-meaning`)
- File `src/components/intelligence/ConsensusMeter.tsx`. **Replaces every confidence dot**
  ([CardsPage.tsx:299](src/pages/CardsPage.tsx#L299), [KnowledgeGraphPage.tsx:738](src/pages/KnowledgeGraphPage.tsx#L738),
  [KnowledgeCard.tsx](src/components/cards/KnowledgeCard.tsx)).
  ```ts
  interface ConsensusMeterProps {
    agreement: number;                       // 0..1, the MEASURED value (§10.3)
    models?: { label: string; value: number }[]; // per-model positions
    variant?: 'inline' | 'full';
  }
  ```
- **Inline:** a 100%-wide track (`h-1.5 rounded-full bg-muted`) with a fill whose color is
  thresholded — `<0.5` `bg-destructive`, `0.5–0.75` `bg-neon-peach`, `>0.75` `bg-neon-mint` —
  plus a big `font-mono` tabular `82%` and a one-line label *"3 models agree"* (never color
  alone). `role="meter" aria-valuenow`.
- **Full:** small-multiples / oscilloscope feel — render each model's value as a converging
  point with `recharts` (use [ui/chart.tsx](src/components/ui/chart.tsx)); the spread *is* the
  story. Bar fills with a spring on mount; snaps instantly under reduced-motion.

### A5. `<DisagreementSpotlight>` — `visual-hierarchy`
- File `src/components/intelligence/DisagreementSpotlight.tsx`, data from `getDisagreement`
  ([lib/api.ts:424](src/lib/api.ts#L424)). Dim consensus claims to `opacity-50`; lift contested
  ones with `ring-1 ring-neon-peach/60 scale-[1.02]` + a `Badge` "N models split". Literally
  spotlights divergence.

### A6. `<CitationPopover>` (receipts) — `tooltip-keyboard` `escape-routes`
- File `src/components/intelligence/CitationPopover.tsx` over [ui/hover-card.tsx](src/components/ui/hover-card.tsx)
  (+ `popover` for tap/keyboard). Wrap each synthesized bullet; inline marker is a `font-mono
  text-neon-cyan` superscript `[1]`. Panel lists source messages + the shared terms that
  justified the link (from `getDecisionTrace`). Focusable, `Esc` closes.

### A7. Empty / Loading / Error system — `empty-states` `progressive-loading` `error-recovery`
- **Loading:** on data-heavy pages replace `LoadingSpinner` with [ui/skeleton.tsx](src/components/ui/skeleton.tsx)
  shaped like the final layout (`content-jumping`). Drop the sci-fi copy ("Scanning Hubs…",
  "Synthesizing Deck…").
- **Empty:** every empty state = icon + one-line voice + **one** primary CTA (`primary-action`),
  e.g. *"No conflicts yet — the models agree. Ask something harder."*
- **Error:** keep `ErrorState` retry; ensure message states cause + fix (`error-clarity`).

### A8. Density & `<StatPulse>` — `data-density` `number-tabular`
- File `src/components/shared/StatPulse.tsx`: label + big `font-mono` figure + optional tiny
  `recharts` sparkline. Used by Projects + Discovery to show momentum.

---

## B. Per-page build instructions

> Each block: **Goal · Layout · Components · Motion · Signature · Fixes · ✅ DoD**.

### `/` Landing — [Landing.tsx](src/pages/Landing.tsx) *(copy already fixed)*
- **Layout:** hero (one `<ConsensusMeter variant="full">` live demo, looping) → 3 honest
  feature cards → "How it works" → footer. One static subtle orb max.
- **Components:** `Button` (one primary CTA — `primary-action`), `ConsensusMeter`, `card`.
- **Motion:** hero fades up once; meter animates its converge on view (`IntersectionObserver`).
- **Signature:** the hero *is* the product proof — show models converging on an answer.
- **✅ DoD:** `style-match` `primary-action` `reduced-motion` · no provider that isn't Groq/NVIDIA.

### `/login` · `/register` — [Login.tsx](src/pages/Login.tsx) · [Register.tsx](src/pages/Register.tsx)
- **Layout:** centered card, branded mark, one-line promise (not "Welcome back").
- **Components:** swap raw `<input>` → [ui/input.tsx](src/components/ui/input.tsx) + `label`
  (`input-labels`); `Button` with in-button spinner + `disabled` on submit (`loading-buttons`,
  `submit-feedback`); password show/hide (`password-toggle`); `autocomplete`/`type=email`
  (`autofill-support`, `input-type-keyboard`).
- **Fixes:** keep the nice 404→register CTA; validate on blur (`inline-validation`); focus first
  invalid field (`focus-management`).
- **✅ DoD:** `form-labels` `error-clarity` `loading-buttons` `password-toggle`.

### `/projects` Projects (home base) — [ProjectsPage.tsx](src/pages/ProjectsPage.tsx)
- **Layout:** sticky toolbar (search input + sort + density toggle), then a **dense list/grid**
  (not centered cards). Keep FAB as secondary.
- **Components:** `command` (⌘K jump), `input` (filter), `table` or compact card grid,
  `StatPulse` per project (cards this week / open conflicts), `skeleton` loading.
- **Interaction:** `j/k` move, `Enter` open, `/` focus search; last-active default sort.
- **Fixes:** drop gradient `Sparkles` header to a calm title; persist sort/scroll (`state-preservation`).
- **✅ DoD:** `search-accessible` `keyboard-nav` `virtualize-lists` (if 50+) `state-preservation`.

### `/projects/search` Join — [ProjectSearch.tsx](src/pages/ProjectSearch.tsx)
- **Decision:** **merge into Discovery** as name-search; remove the paste-a-UUID flow (dead-end).
- **Fixes (now):** delete `from-neon-purple to-neon-pink` + `purple-500/600` (broken/transparent);
  use `Input`; if kept, allow search-by-name with results list + Request-to-Join.
- **✅ DoD:** no undefined color classes · `empty-nav-state` · `primary-action`.

### `/discovery` Discovery — [DiscoveryPage.tsx](src/pages/DiscoveryPage.tsx)
- **Layout:** keep 2-col (feed / explore). Feed items become activity rows with a `StatPulse`
  sparkline of graph growth and typed counts ("3 decisions · 1 conflict").
- **Components:** `hover-card` on a project name → quick stats; optimistic `Follow`
  (`success-feedback`); `Badge` for "public".
- **Fixes:** type the `any[]`; replace `glass-card` with `glass-panel`; un-truncate "Join Req".
- **✅ DoD:** `color-semantic` `success-feedback` `whitespace-balance`.

### `/projects/:id/chats` Chats — [ChatsPage.tsx](src/pages/ChatsPage.tsx)
- **Fixes (bugs first):** delete the raw `@keyframes` pasted in a className
  ([L411–416](src/pages/ChatsPage.tsx#L411-L416)); replace **all** emoji/unicode icons (`⎈ ∆ 🃏 ⋮ ⭐ 📂 ♻ ✏ 🗑`)
  with lucide; replace `window.prompt` (rename) with a `Dialog`, `window.confirm`/`prompt`
  (delete) with `alert-dialog` (already used in SRS — copy that pattern); `text-red-500` → `text-destructive`.
- **Components:** `dropdown-menu` (overflow), `dialog` (rename), `alert-dialog` (delete + `undo-support` toast).
- **✅ DoD:** `no-emoji-icons` `confirmation-dialogs` `undo-support` · zero native `prompt/confirm`.

### `/projects/:id/chats/:chatId` Messages (daily driver) — [MessagesPage.tsx](src/pages/MessagesPage.tsx)
- **Refactor:** split the 1,413-line file into `MessageThread`, `AnswerCard`, `IntelligenceRail`,
  `PresenceBar`, `Composer`.
- **Stage the engine:** when an answer lands, show `<ConsensusMeter>` inline on the answer;
  put **Devil's Advocate / Decision Trace / Readiness** in a labeled right `IntelligenceRail`
  (Tabs), not unlabeled icon buttons; wrap synthesized bullets in `<CitationPopover>`; mount
  `<DisagreementSpotlight>` on the answer group.
- **Components:** `tabs`, `hover-card`, `tooltip` (label every icon — `aria-labels`), `skeleton`
  for the "thinking" state, `sheet` on mobile for the rail.
- **Motion:** new messages `enter` from below; typing indicator subtle; answer reveal crossfades.
- **✅ DoD:** `aria-labels` `progressive-loading` `state-transition` `color-semantic` (51 off-theme hits → tokens).

### `/projects/:id/kg` Knowledge Graph (promote to hero) — [KnowledgeGraphPage.tsx](src/pages/KnowledgeGraphPage.tsx)
- **Layout:** full-bleed canvas; controls float (glass) top-right; node detail in a `sheet`/right
  rail, not a cramped 288px column. Add a search-to-focus input (`/`).
- **Data viz:** legend supplements color with shape/label (`color-not-only`, `pattern-texture`);
  node detail uses `<ConsensusMeter>` for confidence (kill `text-cyan-400`); add a time-scrub
  `slider` to replay graph evolution (`time-scale-clarity`); click ripples reasoning edges.
- **Perf:** keep ForceGraph cooldown; `debounce-throttle` zoom; aggregate at high node counts (`large-dataset`).
- **✅ DoD:** `responsive-chart` `touch-target-chart` (≥44px hit) `screen-reader-summary` (text fallback) `empty-data-state`.

### `/projects/:id/delta` Delta — [DeltaTimelinePage.tsx](src/pages/DeltaTimelinePage.tsx)
- **Keep** the timeline (it's good). Add a top `StatPulse` (net knowledge growth) and link each
  delta into the graph at that timestamp (shared-element feel).
- **Fixes:** hardcoded `rgba()` shadow → `shadow-glow-sm`; tokenize colors.
- **✅ DoD:** `color-semantic` `time-scale-clarity` `motion-consistency`.

### `/projects/:id/cards` Temporal Cards (reference page) — [TemporalCardsPage.tsx](src/pages/TemporalCardsPage.tsx)
- **This is the template** — keep KG Pending/In KG badges, version history, "Commit to KG",
  "View in Graph". Just tokenize (`amber-500/green-500/slate-300/bg-white/5` → tokens) and let
  the version chain animate as a true lineage (`shared-element-transition`).
- **✅ DoD:** `color-semantic` `state-transition` `truncation-strategy` (full title via tooltip).

### `/cards` Global Cards — [CardsPage.tsx](src/pages/CardsPage.tsx)
- **Replace** the one-card vertical carousel with a **dense, filterable grid** (`card` + `tabs`
  by type + `input` filter) — scanning many is the job. Delete "Neural Synthesis Active" theater
  and "Re-initialize/Render Exception/Fragments" copy. Confidence → `<ConsensusMeter>`.
- **Components:** `tabs`, `badge`, `drawer` for detail (already wired: `CardDetailDrawer`),
  `skeleton`.
- **✅ DoD:** `data-density` `empty-states` `excessive-motion` (no decorative pulse) `color-semantic`.

### `/srs/*` SRS — [srs/Dashboard.tsx](src/pages/srs/Dashboard.tsx) · [srs/IssuesPage.tsx](src/pages/srs/IssuesPage.tsx)
- **Unify:** bring under the shared shell + tokens (it has its own back button / `glass-card` /
  `emerald-*` / `slate-*`). It already uses `alert-dialog` correctly — **lead the consistency
  pass from here.**
- **✅ DoD:** `navigation-consistency` `color-semantic` `consistency`.

### `/editor/*` Editor — [editor/Workspace.jsx](src/pages/editor/Workspace.jsx)
- **Decide role:** peer feature → adopt shell+tokens; power tool → an intentional, still-on-token
  "pro" skin. Either way, harmonize colors and icon set.
- **✅ DoD:** `consistency` `state-clarity` `icon-style-consistent`.

### `/uml/dashboard` UML — [uml/Dashboard.tsx](src/pages/uml/Dashboard.tsx)
- It's an `<iframe>` of the separate :8007 app. Keep the Online/Offline pill (good — `offline-support`),
  but theme the embedded app with the same tokens so crossing the boundary isn't jarring.
- **✅ DoD:** `offline-support` `dark-mode-pairing` (embedded app matches).

### `/settings` Settings — [SettingsPage.tsx](src/pages/SettingsPage.tsx)
- Group fields (`field-grouping`); make the accent picker a **live preview** of `ConsensusMeter`
  + a card; `switch` for toggles; `success-feedback` on save.
- **✅ DoD:** `field-grouping` `success-feedback` `color-semantic`.

### `*` NotFound — [NotFound.tsx](src/pages/NotFound.tsx)
- One ⌘K hint + a "Back to Projects" primary action; small personality line. Low priority.

---

## C. New reusable components (single source of truth)

| Component | File | Purpose |
|---|---|---|
| `ConsensusMeter` | `src/components/intelligence/ConsensusMeter.tsx` | Measured agreement — replaces every confidence dot |
| `DisagreementSpotlight` | `src/components/intelligence/DisagreementSpotlight.tsx` | Highlights contested claims |
| `CitationPopover` | `src/components/intelligence/CitationPopover.tsx` | Hover/focus "receipts" for any bullet |
| `CommandPalette` | `src/components/command/CommandPalette.tsx` | ⌘K global jump/actions |
| `StatPulse` | `src/components/shared/StatPulse.tsx` | Stat + sparkline momentum |
| `motion` presets | `src/lib/motion.ts` | Shared enter/exit/stagger curves |

## D. Definition of Done (web-translated from ui-ux-pro-max checklist)

- **Visual:** no emoji icons; one lucide family; semantic tokens only (no raw hex / off-theme
  Tailwind); press states don't shift layout. (`no-emoji-icons` `color-semantic` `state-clarity`)
- **Interaction:** every interactive el has hover+focus-visible+pressed; targets ≥44px; one
  primary CTA/screen; native `prompt/confirm` eliminated. (`focus-states` `touch-target-size` `primary-action`)
- **Motion:** 150–300ms, transform/opacity only, exit faster than enter, `prefers-reduced-motion`
  honored. (`duration-timing` `transform-performance` `reduced-motion`)
- **Dark mode/contrast:** body text ≥4.5:1, secondary ≥3:1, borders visible. (`color-accessible-pairs`)
- **Data:** charts have legend+tooltip+empty+loading+text fallback; tabular figures for numbers.
  (`legend-visible` `empty-data-state` `number-tabular` `screen-reader-summary`)
- **Perf:** skeletons >300ms, lazy-load below fold, virtualize 50+ lists, reserve space (CLS<0.1).
  (`progressive-loading` `virtualize-lists` `content-jumping`)

*Build order stays the Part I priority list: Landing ✓ → ConsensusMeter → consistency/bug pass
(lead from SRS + Temporal Cards) → ⌘K + keyboard → de-template shell → KG hero.*
