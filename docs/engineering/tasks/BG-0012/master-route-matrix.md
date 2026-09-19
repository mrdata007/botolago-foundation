# BG-0012 master screen/route matrix

Snapshot as of integrated checkpoint `agent/news-cms-launch@4c263e3`. Every active user-facing
route in `src/routes/` is listed. No route disappears from this inventory without an
`OBSOLETE / UNREACHABLE` classification and a reason.

Legend for status:
- `ACCEPTED — FANTASY BASELINE`: verified in BG-0051–0054, regression-only, not touched here.
- `REDESIGNED`: rebuilt/restyled in this workstream, validated (typecheck/test/lint/build).
- `IMPLEMENTED`: pre-existing, functional, not in this workstream's scope, left as-is.
- `ADMINISTRATIVE`: Admin-only route, covered under the News/CMS checkpoint.
- `REFERENCE ONLY / UNSUPPORTED`: a Premier League reference concept BotolaGO has no real
  content/data for; not fabricated.
- `BLOCKED BY REAL DATA`: feature partially built, withheld pending a real data source.
- `OBSOLETE / UNREACHABLE`: not a real product route (infra/tooling).

| Route | Product area | Status | Owning workstream | Backend dependency | FR/AR | RTL | Notes |
|---|---|---|---|---|---|---|---|
| `/` | Accueil/home | REDESIGNED | Agent A | matches/fantasy/news services, standings RPC | yes | yes | 6-section dashboard; standings snapshot only renders with real data; no News-page duplication |
| `/news` | News/editorial | REDESIGNED | Builder-Frontend (News/CMS checkpoint) | `NewsRepository` public RPCs | yes | yes | Real lead/top-stories/latest feed, keyset pagination, taxonomy-driven categories, club discovery |
| `/news/$articleId` | News/editorial | REDESIGNED | Builder-Frontend | `NewsRepository` public RPCs | yes | yes | Corrected FR/AR metadata bug, `NewsArticle` JSON-LD, save/share |
| `/matches/` | Matches/results | REDESIGNED | Agent D1 | `FootballRepository`/`footballService` | yes | yes | Added real Lineups tab (previously-unused RPC), full sortable standings table |
| `/matches/$matchId` | Match detail | REDESIGNED | Agent D1 | `FootballRepository`/`footballService` | yes | yes | Lineups tab wired; fake "Momentum" tab removed |
| `/profile` | Account/profile | REDESIGNED | Agent D3 | `authService`/`profiles-repo` | yes | yes | Reorganized IA (Personal info/Preferences/Security/Delete); wired previously-unbuilt delete-account + change-password UI onto unmodified auth logic |
| `/auth` (layout) | Auth | IMPLEMENTED | — | — | yes | yes | Bare `Outlet` wrapper |
| `/auth/login` | Auth | REDESIGNED | Agent D3 | Supabase Auth | yes | yes | Consistent visual treatment |
| `/auth/register` | Auth | REDESIGNED | Agent D3 | Supabase Auth | yes | yes | Fixed missing social-login icons (login had them, register didn't) |
| `/auth/forgot-password` | Auth | IMPLEMENTED | — | Supabase Auth | yes | yes | Not in D3's touched-file list; logic/visuals pre-existing and already on-brand |
| `/auth/update-password` | Auth | REDESIGNED | Agent D3 | Supabase Auth | yes | yes | Now discoverable via a "change password" entry from Profile |
| `/auth/verify` | Auth | IMPLEMENTED | — | Supabase Auth | yes | yes | Uses shared `AuthShell` |
| `/auth/callback` | Auth | IMPLEMENTED | — | Supabase Auth | yes | yes | Uses shared `AuthShell` |
| `/auth/profile-setup` | Auth | IMPLEMENTED | — | Supabase Auth | yes | yes | Not in D3's touched-file list |
| `/fantasy` (layout) | Fantasy | ACCEPTED — FANTASY BASELINE | — | — | yes | yes | Bare `Outlet` wrapper |
| `/fantasy/` | Fantasy | ACCEPTED — FANTASY BASELINE | — | Fantasy RPCs | yes | yes | Fully `--fpl-*`-styled, BG-0051–0054 |
| `/fantasy/create` | Fantasy | ACCEPTED — FANTASY BASELINE | — | Fantasy RPCs | yes | yes | |
| `/fantasy/fixtures` | Fantasy | ACCEPTED — FANTASY BASELINE | — | Fantasy RPCs | yes | yes | |
| `/fantasy/help` | Fantasy | ACCEPTED — FANTASY BASELINE | — | — | yes | yes | Out of scope for D2 per ownership map |
| `/fantasy/leagues` (layout) | Fantasy | ACCEPTED — FANTASY BASELINE | — | Fantasy RPCs | yes | yes | |
| `/fantasy/leagues/$leagueId` | Fantasy | ACCEPTED — FANTASY BASELINE | — | Fantasy RPCs | yes | yes | |
| `/fantasy/leagues/join` | Fantasy | ACCEPTED — FANTASY BASELINE | — | Fantasy RPCs | yes | yes | |
| `/fantasy/players` | Player/Stats | REDESIGNED | Agent D2 | Fantasy/player RPCs | yes | yes | Ported off `LegacyFantasyPage` onto `--fpl-*` design system |
| `/fantasy/players/$playerId` | Player detail | REDESIGNED | Agent D2 | Fantasy/player RPCs | yes | yes | |
| `/fantasy/points` | Fantasy | ACCEPTED — FANTASY BASELINE | — | Fantasy RPCs | yes | yes | |
| `/fantasy/profile` | Fantasy (fantasy-scoped profile) | ACCEPTED — FANTASY BASELINE | — | Fantasy RPCs | yes | yes | Out of scope for D3 per ownership map — kept with Fantasy |
| `/fantasy/rankings` | Player/Stats | REDESIGNED | Agent D2 | Fantasy ranking RPCs | yes | yes | Ported off `LegacyFantasyPage` |
| `/fantasy/rules` | Fantasy | ACCEPTED — FANTASY BASELINE | — | — | yes | yes | Uses `LegacyFantasyPage`, but visually inspected (2026-09-19, FR/desktop) and confirmed to already render the accepted Fantasy design system (`FantasyFrame` + `FplHeader`) end to end — the component *name* is legacy, the rendered shell is current. Not a redesign gap; left alone. |
| `/fantasy/team` | Fantasy | ACCEPTED — FANTASY BASELINE | — | Fantasy RPCs | yes | yes | |
| `/fantasy/top-players` | Player/Stats | REDESIGNED | Agent D2 | Fantasy/player RPCs | yes | yes | Ported off `LegacyFantasyPage` |
| `/fantasy/transfers` | Player/Stats/Transfers | ACCEPTED — FANTASY BASELINE | — | Fantasy RPCs | yes | yes | D2 investigated per instructions: confirmed already fully on the `--fpl-*` design system (composes only already-styled subcomponents) — no change needed |
| `/admin` | Admin | ADMINISTRATIVE | — | Admin RPCs | yes | yes | Pre-existing |
| `/admin/approvals` | Admin | ADMINISTRATIVE | — | Admin RPCs | yes | yes | Pre-existing, untouched |
| `/admin/audit` | Admin | ADMINISTRATIVE | — | Admin RPCs | yes | yes | Pre-existing, untouched |
| `/admin/news` | Admin CMS | IMPLEMENTED (new) | Builder-CMS | Editorial bridge RPCs | yes | yes | Story list/filter, following `admin.staff.tsx` pattern |
| `/admin/news/new` | Admin CMS | IMPLEMENTED (new) | Builder-CMS | Editorial bridge RPCs | yes | yes | Draft creation |
| `/admin/news/$articleEditionId` | Admin CMS | IMPLEMENTED (new) | Builder-CMS | Editorial bridge RPCs | yes | yes | Edit/preview/lifecycle transitions/media |
| `/admin/security` | Admin | ADMINISTRATIVE | — | Admin RPCs | yes | yes | Pre-existing, untouched |
| `/admin/staff` | Admin | ADMINISTRATIVE | — | Admin RPCs | yes | yes | Pre-existing; fixed missing `<Outlet/>` (2026-09-19), see follow-up note below |
| `/admin/staff/$principalId` | Admin | ADMINISTRATIVE | — | Admin RPCs | yes | yes | Pre-existing; was silently unreachable until the `<Outlet/>` fix above |
| `/mcp` | Infra | OBSOLETE / UNREACHABLE | — | — | n/a | n/a | Lovable MCP-JS server route wiring, not a user-facing page |
| `/.lovable/oauth/consent` | Infra | OBSOLETE / UNREACHABLE | — | — | n/a | n/a | Internal OAuth consent screen for the Lovable platform |

## Reference-only / unsupported (Premier League concepts with no BotolaGO data)

Per the owner's own classification rule ("do not invent features/data solely because Premier
League has them"), the following stay `REFERENCE ONLY / UNSUPPORTED` and are **not** routes in
this app:

- Managers, Awards, Man of the Match, Hall of Fame, historical archives — no real data source.
- **Legal/Help content (Terms & Conditions, Privacy Policy, FAQ) — `OWNER/LEGAL CONTENT GATE —
  NOT IMPLEMENTABLE WITHOUT APPROVED CONTENT`.** Agent D3 confirmed no such content exists
  anywhere in the app (only two generic consent strings), and no approved legal copy has been
  supplied. This is deliberately **not** manufactured. It is not a design gap and not closed by
  any engineering fix pass — it is a standing **production-launch gate** that only the
  business/owner can clear by supplying approved copy. Once that copy exists, these pages can be
  implemented on the current BotolaGO design system in a follow-up pass.
- Badge/shirt scanning — hardware-specific Premier League commercial feature, explicitly out of
  scope per the owner's own instructions unless separately approved.
- Player comparison — Agent D2 did not build a dedicated comparison tool; existing player data
  didn't justify a new feature beyond what `/fantasy/players/$playerId` already shows.

## Known follow-up items (not blockers for this checkpoint, tracked for later)

- `src/components/fpl/LegacyFantasyPage.tsx` keeps its name for now, but is **not** a visual gap:
  `/fantasy/rules` was visually inspected and already renders the accepted Fantasy design system
  (`FantasyFrame` + `FplHeader`) end to end. Renaming the component is a zero-risk, purely
  cosmetic cleanup that can happen whenever convenient — not a redesign, not a blocker.
- Full league/competition standings existed as an addressable gap before D1's work; now closed
  via `StandingsTable.tsx` sourced from real `StandingRowDto` fields.
- `admin.staff.tsx` had the same missing-`<Outlet/>` nested-route defect as `admin.news.tsx`
  (fixed 2026-09-19): `/admin/staff/$principalId` was silently unreachable in the UI. Now fixed
  identically; see `AdminStaffRootRoute` in that file.
