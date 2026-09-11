# BotolaGO — Release-readiness audit (evidence-based, no production changes)

Scope: audit only. No publish, no data changes, no gate flips, no redesign.

## 1. Repository / deployment state

- Branch: `edit/edt-61f70e8b-5a20-4d5e-99bf-0177a02492c1`, HEAD `8dc3a23` ("Work in progress"), clean tree.
- Remote `origin` is the Lovable-managed private repository (URL is credential-bearing; not reproduced here).
- Live published site: `https://botolago.com` responds HTTP 200 (also `https://botolago.lovable.app`).
- Stack: React 19 + TanStack Start + Vite + Supabase JS. **No Flutter/Firebase/native project exists** in this repo (no `pubspec.yaml`, no `ios/`, no `android/`, no Firebase SDK). This app is a web/PWA app only.

## 2. Commands run and outcomes

| Command | Result |
| --- | --- |
| `bun run typecheck` | PASS (exit 0) |
| `bun run backend:migrations:check` | PASS — "Validated 47 migration(s)." |
| `bun run backend:secrets:check` | PASS — no high-confidence secrets in tracked files |
| `bun run build` | PASS — Nitro/Vite output produced |
| `bun test` | **FAIL** — 526 pass / 5 fail / 531 total |
| Playwright sweep, local preview, 390px, FR + AR | 15 routes OK, 4 routes 404 |
| Playwright sweep, live `botolago.com` | All data-driven screens empty / stuck loading |

Failing tests (all in one file): `supabase/functions/_shared/elbotola.test.ts`
- "fetches only robots and the homepage and persists Arabic link metadata" — expected 200, received 503
- "ignores non-allowlisted or credential-bearing image URLs"
- "retries one transient homepage failure without fetching any article page"
- "quarantines malformed homepage metadata and completes the valid links"
- "rejects malformed article metadata while preserving valid items"

Root cause visible in output: `parseElbotolaHomepage` throws `invalid_provider_payload` at `supabase/functions/_shared/elbotola.ts:400` for the test fixtures — the homepage parser no longer matches the markup shape the tests encode.

## 3. CRITICAL findings

### C1 — The published app points at a backend that does not exist
`.env.production:10-12` sets the browser Supabase project to `tkewgajrljbwgwedqsxn`. That hostname **does not resolve** (`net::ERR_NAME_NOT_RESOLVED`), and every data request on `https://botolago.com` fails. The project actually connected to this workspace is a different one.

Browser evidence on the live site:
- `/news` — filters render, **zero articles**
- `/matches` — season selector stuck on "Chargement"
- `/fantasy`, `/fantasy/players` — stuck on "Chargement…"
- Failed request: `tkewgajrljbwgwedqsxn.supabase.co :: net::ERR_NAME_NOT_RESOLVED`

The app is effectively non-functional in production. This alone blocks launch.

### C2 — The connected backend has no current-season football catalog
Read-only counts on the connected project:
`app.fixtures 0`, `app.players 0`, `app.seasons 0`, `app.standings 0`, `app.teams 10`, `app.profiles 1`;
legacy `public.fixtures 4`, `public.players 64`, `public.articles 3`, `public.gameweeks 1`.

Even after C1 is fixed by repointing, there is **no usable current-season fixture or player catalog**. Fantasy cannot be launched on this data: squad selection, transfers, points and standings all require a populated season. Ingestion workflows exist (`.github/workflows/g5-*`, `g7-*`, `gate2*`) but have not produced production data here.

### C3 — Two competing database schemas coexist
The connected project carries both the legacy `public.*` fantasy/news schema and the greenfield `app.*`/`api.*` schema. Frontend repositories read across both. Before launch, one must be declared canonical; otherwise data written in one shape is invisible to screens reading the other.

## 4. HIGH findings

### H1 — News ingestion adapter is broken (5 failing tests)
`supabase/functions/_shared/elbotola.ts:400`. With the adapter failing, the news feed has no automatic content source; `public.articles` holds 3 rows.

### H2 — Canonical/OG URLs point to a domain that is not the live domain
`src/lib/article-meta.ts:7` emits canonicals at `https://www.botolago.app/...`, while `.env.production:9` declares `https://botolago.lovable.app` and the live custom domain is `https://botolago.com`. Three different origins. Shared links and search indexing will point away from the real site.

### H3 — Routes referenced in product history return 404
Local preview, both languages: `/settings`, `/privacy`, `/terms`, `/notifications` all render the 404 page. Privacy and terms are typically required for app-store/PWA listing and for consent flows.

### H4 — Fantasy is gated behind sign-in and unverified end-to-end
Anonymous `/fantasy/team`, `/transfers`, `/points`, `/leagues` show "Compte requis" (account required). This is a gate, not evidence of working functionality. Signed-in Fantasy flows (create squad, transfer, points, leagues) were **not tested** — no test session was available in this environment. Do not treat HTTP 200 or a green build as Fantasy working.

### H5 — The preview environment runs on mock data
Dev has no `VITE_*_DATA_MODE` values, so `src/services/news.ts`, `notifications.ts`, `fantasy-v2.ts` and `fantasy-runtime.ts` default to mock repositories. Everything that looks populated in preview (14 gameweeks, fixtures, players, articles) is **mock**, not live. Preview quality is therefore not evidence of production quality.

## 5. MEDIUM

- `/profile` document title is the untranslated string "Profile" in both FR and AR.
- Live site shows the Lovable badge; hide it before a public launch if not wanted.

## 6. What passed

- FR and AR both render correctly: `html lang`/`dir` switch to `ar`/`rtl`, Arabic copy is complete on home, news, matches, fantasy, rules, login, profile.
- No horizontal overflow at 390px on any tested route.
- No uncaught page errors on the local preview sweep.
- Auth screens (login, register, forgot password) render in both languages.
- Typecheck, migration validation, secret scan and production build all pass.

## 7. Not tested / unknown

- Signed-in journeys: registration confirmation, login, password reset email delivery, profile edit, avatar upload, notifications.
- Fantasy end-to-end with a real account.
- Match detail, lineups, article detail, club pages, standings (not exercised in this sweep).
- Server-side environment variables on the deployment target (only file-level presence was checked; no values read).
- Load/performance and Lighthouse.

## 8. Launch verdict

**Not launch-ready.** C1 and C2 are hard blockers: the published app talks to a nonexistent backend, and the backend it should talk to has no season data. Recommended order: fix production backend configuration (C1) → decide canonical schema (C3) → ingest and verify current-season catalog (C2) → repair news ingestion (H1) → align canonical domain (H2) → ship the missing legal/settings routes (H3) → full signed-in Fantasy verification (H4).
