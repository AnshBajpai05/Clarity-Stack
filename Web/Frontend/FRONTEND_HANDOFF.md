# Frontend Handoff — UI Polish

Onboarding kit for the team restyling the ClarityStack SPA (`Web/Frontend/`).
React 18 + TypeScript + Vite + Tailwind + shadcn/ui (Radix). Dev port **8006**.

For product context / architecture, see the repo [README.md](../../README.md).

---

## ⚠️ Read this first — the day-one gotcha

**The frontend no longer runs standalone.** Demo/mock mode was removed in the §15
UI-honesty cleanup, so `npm run dev` shows empty/error states without a live backend.
You can restyle markup blind, but to see real data you need a backend. Two options:

1. **Run the full stack** — from repo root: `start_project.bat` (Windows Terminal tabs,
   ports 8000–8007) or `docker compose up --build`. App at http://localhost:8006.
2. **Point at a shared dev backend** — set the `VITE_*` URLs in `.env` to a running
   backend instead of localhost. See [.env.example](.env.example).

Either way: **copy [.env.example](.env.example) → `.env` first.** The real `.env` is
gitignored, so a fresh clone has none.

---

## Run it

```bash
cd Web/Frontend
cp .env.example .env      # then edit URLs if not using the full local stack
npm install
npm run dev               # http://localhost:8006
```

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server (HMR) |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` — run before pushing |
| `npm run lint` | ESLint |
| `npm test` | Vitest (run once) |
| `npm run e2e` | Playwright |

**Before every push:** `npm run typecheck && npm test`. Test infra exists so polish
doesn't silently break wiring — keep it green.

---

## Design conventions

Stay inside the existing neon/glass dark theme. Don't hardcode colors.

- **Tokens, not literals.** Colors/shadows/spacing are CSS variables in
  [src/index.css](src/index.css), surfaced as Tailwind classes in
  [tailwind.config.ts](tailwind.config.ts). Use `bg-card`, `text-muted-foreground`,
  `border-border`, `shadow-glow`, etc. — never `#hex` or raw `hsl()` in components.
- **Accent palette** (`hsl(var(--neon-*))`): `neon-cyan` · `neon-violet` · `neon-peach`
  · `neon-mint`. Role colors for chat: `role-user/assistant/system/moderator`.
- **Glass surfaces:** use the `.glass-panel` / `.glass-panel-hover` utilities
  (defined in index.css) for panels — don't reinvent the blur/border.
- **Theme is runtime-switchable.** Dark mode = `.dark` on `<html>`; accent is applied by
  `applyAccentColor()` in [src/lib/utils.ts](src/lib/utils.ts) from `localStorage`
  (`cs_dark_mode`, `cs_accent_color`). Drive new accents through tokens so the switcher
  keeps working.
- **Class merging:** compose classNames with `cn()` ([src/lib/utils.ts](src/lib/utils.ts))
  — `clsx` + `tailwind-merge`. Use it for any conditional/overridable class.
- **Components:** shadcn/ui lives in [src/components/ui/](src/components/ui/) (51 of them).
  Prefer extending these over new primitives. Add more with the shadcn CLI; config in
  [components.json](components.json). Path alias `@/` → `src/`.
- **Fonts:** `font-sans` Inter · `font-display` Plus Jakarta Sans · `font-mono` JetBrains Mono.
- **Motion:** Framer Motion + the named keyframes/durations in the Tailwind config
  (`animate-fade-in-up`, `duration-normal`, `ease-spring`, …). Reuse them.

---

## Page → route map

Routes defined in [src/App.tsx](src/App.tsx). Pages in [src/pages/](src/pages/).

| Route | Page | Auth |
|---|---|---|
| `/` | Index | public |
| `/login` · `/register` | Login · Register | public |
| `/projects` | ProjectsPage | ✓ |
| `/projects/search` · `/project-search` | ProjectSearch | ✓ |
| `/discovery` | DiscoveryPage | ✓ |
| `/projects/:projectId/chats` | ChatsPage | ✓ |
| `/projects/:projectId/chats/:chatId` | MessagesPage | ✓ |
| `/projects/:projectId/kg` | KnowledgeGraphPage | ✓ |
| `/projects/:projectId/delta` | DeltaTimelinePage | ✓ |
| `/projects/:projectId/cards` | TemporalCardsPage | ✓ |
| `/srs/dashboard` · `/srs/issues` | SRS Dashboard · Workspace | ✓ |
| `/editor/dashboard` · `/editor/workspace/:id` · `/editor/snapshot/:id` | Editor | ✓ |
| `/uml/dashboard` | UML Dashboard | ✓ |
| `/cards` | CardsPage (legacy global) | ✓ |
| `/settings` | SettingsPage | ✓ |
| `*` | NotFound | — |

Protected routes sit behind `<RequireAuth>` ([src/components/RequireAuth.tsx](src/components/RequireAuth.tsx)).
App is wrapped in an `<ErrorBoundary>`.

---

## Where to start

The §15 UI-honesty cleanup is **fully closed** — every item §15.1–§15.16 is FIXED
(see the §15 status table in [existing_issues.md](../../existing_issues.md)). So there's
**no known mock data, dead control, or decorative fake left** — the screens you inherit
are real and wired. There's no backlog of broken UI; this is pure visual polish.

Suggested high-traffic screens to polish first (the app's core loop):

- [src/pages/MessagesPage.tsx](src/pages/MessagesPage.tsx) — chat thread (most-used view).
- [src/pages/ProjectsPage.tsx](src/pages/ProjectsPage.tsx) — landing after login.
- [src/pages/KnowledgeGraphPage.tsx](src/pages/KnowledgeGraphPage.tsx) — the flagship graph.
- [src/pages/CardsPage.tsx](src/pages/CardsPage.tsx) / [src/pages/TemporalCardsPage.tsx](src/pages/TemporalCardsPage.tsx) — card surfaces.

For each, also polish the **empty / loading / error** states (e.g. each page's
`ErrorState`) — with demo mode gone, those are what users hit without a backend.

---

## Env var gotchas

- **UML var name mismatch:** code reads `VITE_UML_URL`
  ([src/pages/uml/Dashboard.tsx](src/pages/uml/Dashboard.tsx#L8)); the old private `.env`
  used `VITE_UML_API_URL` (ignored). Use `VITE_UML_URL` — `.env.example` already does.
- **Supabase is optional, not removed.** [src/pages/editor/supabaseClient.js](src/pages/editor/supabaseClient.js)
  is still imported (editor presence + a SettingsPage path). Unset `VITE_SUPABASE_*` →
  client resolves to `null`, app does **not** crash. Don't rip out the client.
- **ThreatLens** (`VITE_THREATLENS_URL`) is out of scope — no code reads it.

---

## Guardrails

- **Don't reintroduce mock data or fake fixtures.** The §15 cleanup removed them so the
  UI is honest — polish the real screens and their real empty/loading/error states.
- **Don't add dead controls** (buttons/toggles that do nothing). Same cleanup removed those.
- **Tokens over literals** — keep the theme switcher and dark mode working.
- **Keep typecheck + tests green** before pushing.
