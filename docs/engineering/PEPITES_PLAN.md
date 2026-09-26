# Pépites: build plan

Status: **plan, not built.** Written 2026-09-25. Owner-facing version:
<https://claude.ai/artifact/6kYyZhcUmdtMkSfsCLmCrE>. Premium screen designs (v3):
<https://claude.ai/artifact/LSKuLdfCfnxocnZU1FsCJc>.

Pépites is a Botola Pro under-23 ranking: a weekly Top 10 (Monday 20:00),
player pages with per-90 figures, percentiles and match logs, a compare view,
share images, and its own bottom-bar tab (Profile moves to a header avatar).
It is the first "BotolaGO Data" product and the base for a later scout and
academy layer.

## 0. Data audit (production, read-only, 2026-09-25)

| Data                                                                | Status  | Measured                                                                                                                                  |
| ------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Name, club, position group                                          | have    | 977 players                                                                                                                               |
| Date of birth                                                       | partial | 493 of 603 active squad players                                                                                                           |
| Nationality                                                         | missing | 0 of 977 (`nationality_country_id` never set)                                                                                             |
| Preferred foot                                                      | missing | 0 of 977 (`preferred_foot` always `unknown`)                                                                                              |
| Height                                                              | missing | no column                                                                                                                                 |
| Shirt number                                                        | partial | 432 of 603 active memberships                                                                                                             |
| Headshots                                                           | missing | `players.photo_asset_id` never written; 10 of 81 U23 have an image at SportsMonks, 150 px, and SportsMonks' terms give no display licence |
| Per-match minutes/goals/assists/cards/saves                         | have    | 9 258 rows for 2025-26 (`app.player_fixture_performances`)                                                                                |
| Match rating                                                        | partial | 6 287 of 9 258 rows                                                                                                                       |
| Clean sheets                                                        | broken  | 0 in every row; type 194 never arrives in `lineups.details` for the Botola                                                                |
| 2025-26 lineups / events / team stats                               | missing | 0 / 0 / 0 (history is performance rows only)                                                                                              |
| Current-season lineup players linked                                | partial | 19 of 35 linked (16 `player_name` only)                                                                                                   |
| Detailed per-player stats (passes, duels, tackles, dribbles, shots) | missing | SportsMonks' coverage sheet lists Botola Pro for basic player stats only                                                                  |
| Player xG / xA                                                      | missing | Botola not in SportsMonks' xG coverage                                                                                                    |
| Fantasy points                                                      | have    | current season                                                                                                                            |
| Player follows, views                                               | missing | only team follows (`src/services/follows.ts`)                                                                                             |

Rising score v1 therefore uses only rating, form, goals+assists (or saves),
progression and minutes. Detailed-stat modules wait for a second provider.

## 1. Provider decision

- Keep SportsMonks for fixtures, lineups, events and basic player stats.
- Probe (read-only, current key): `/players/{id}?include=metadata;nationality`
  for 20 U23 players; one Botola fixture with unfiltered `lineups.details`
  to list the type ids actually returned. Nothing calls `/players/{id}` today.
- Trial API-Football (free key): Botola coverage flags, five finished
  matches' player statistics, cross-check minutes/goals with SportsMonks.
- Ask Hudl Wyscout for a quote (event data, xG/xA, public display rights).
- Skip Sportradar (no Botola lineups or player stats), Football-Data.org (no
  Morocco); do not scrape SofaScore or Transfermarkt.
- Photos: our own programme (club media officers, match-day photographer,
  signed releases, guardian consent under 18). Provider images are internal
  placeholders only.

## 2. Architecture

Sources (SportsMonks, second provider, photo programme, data desk) → Supabase
edge importers (`supabase/functions/football-ingest`, `_shared/sportsmonks-*`,
new player-details sync and second-provider adapter) → `app.*` tables with
provenance → Pépites engine (SQL in `app_private`, versioned) → `api.pepites_*`
read RPCs → TanStack routes with SSR prefetch, cached public pages, share-image
route, admin console.

Before a second provider writes anything, remove the hardcoded `'sportsmonks'`
from: `20260914184657_current_season_squad_recovery.sql`,
`20260925110000_current_performance_unnamed_starters.sql` (also season
`'28647'`), `20260925200000_current_player_list_update.sql`, and
`attach_football_team_crest`. `app_private.football_provider_mappings` already
supports several providers.

Principles: every attribute value carries its source and date, and manual
corrections win and are audited. The method is versioned. Published editions
are immutable. Public reads are precomputed and cached (Medium compute
ceiling about 65 RPS). One writer at a time (AGENTS.md). Production only
through the reviewed migration path. No public photo without a licence row in
`app.media_assets` (`kind = player_photo`).

## 3. UI

- Tokens: night navy, BotolaGO ink, brand gradient as accent only, rating
  scale (<6, 6–6.5, 6.5–7, 7–7.5, ≥7.5).
- Fonts: Changa slanted for numbers, Manrope, IBM Plex Mono self-hosted.
- Components: night band, ghost rank number, player cut-out, shirt fallback,
  10-segment bar, score ring, rating chip, percentile row, pizza chart, trend
  line, sortable table, facts strip, compare row, "N.R." value, share
  templates, skeletons.
- 24 frames (6 pages × FR/AR × phone/desktop), plus share images, 2 admin
  screens, and loading, empty, missing, error and guest states.
- Arabic: never skew Arabic script; numbers stay LTR.
- Contrast measured on rasterised pixels.

## 4. UX

- Journeys to cover:
  - Monday email → reveal → player → follow, Fantasy or share.
  - Tab → filter → player → compare → share.
  - Guest shared link → follow → sign-in → back to the player, followed.
  - Fantasy list Pépite badge → player → add to team.
- Timing: before round 3, show the labelled 2025-26 final ranking.
- Trust: "Mis à jour" time, minimum-minutes note, method page, report-error
  link to the data desk.
- Editor: shortlist of 20 at 12:00, pick and order 10, lines in FR/AR,
  publish at 20:00. If nobody acts, the computed list publishes without lines.
- Prototype test with 6–8 users (FR/AR) before building.

## 5. Frontend

- Flags: `PEPITES_ENABLED` and `PEPITES_PROMOTED`. The nav change sits behind
  the second.
- Routes:
  - `/pepites`
  - `/pepites/classement`
  - `/pepites/joueur/$playerId` (tabs as a search param)
  - `/pepites/comparer`
  - `/pepites/semaine/$n`
  - `/pepites/methode`
  - `/admin/pepites`
  - `/admin/pepites/donnees`
- `src/services/pepites.ts` over `api.pepites_*`, typed from
  `src/backend/generated/database.types.ts`. `meta.ssr` on public queries.
  Per-player `head()` og tags.
- Components in `src/components/pepites/`. Charts are hand-drawn SVG (recharts
  is installed but unused).
- Share images from a server route; confirm the image library works on the
  Vercel/nitro build.
- Extend follows from teams to players; guests go through `requireAuth`.
- Bottom nav: Pépites replaces Profil in `primary-nav.ts`; the avatar menu
  holds Profile. Update the nav tests.
- i18n: FR/AR keys and gate baselines.
- `AnalyticsEvent` additions: view, follow, share, compare, fantasy add,
  reveal complete.
- Tests: unit, e2e for the four journeys in both languages, 390 px visual
  checks on real data.

## 6. Backend

1. Migrations:
   - players: `height_cm`, detailed position
   - an attribute-observation table with a resolver
   - a detailed-stat table (player × fixture × stat code × provider)
   - player follows
   - daily view counts, written in batches
   - `pepites_methodologies`, `pepites_scores`, `pepites_editions` and entries
   - data-desk issues and corrections, audited
2. Data fixes:
   - SportsMonks player-details sync
   - compute clean sheets from score and minutes
   - link unlinked lineup players
   - provider-neutral RPCs
3. Second-provider importer after the go decision: own mapping rows, player
   matching with manual review, a comparison report before display.
4. Engine: eligibility (U23 on 1 July, minimum minutes), per-90, percentiles
   by position group, Rising score v1. It runs on round finalisation; a
   pg_cron draft at Monday 12:00 and publish at 20:00, like news editions.
5. Read RPCs: home, ranking (filters/sort/page), player, player matches,
   compare, edition, method. Stable, definer, granted to anon.
6. Write RPCs: follow/unfollow player; batched, rate-limited view counts.
7. Admin: selection and data desk.
   - New permissions `pepites.edit` and `pepites.publish`.
   - Data fixes reuse `football.correct`.
   - Every action goes through `app_private.admin_assert_permission`.
8. pgTAP tests in `supabase/tests/database/`. Run
   `backend:migrations:check` and `types:check`; CI `database-quality` is the
   authority. Add a runbook and alerts on compute or edition failure.

## 7. Timeline and gates (about 10 weeks, two lanes)

The data work is the critical path and starts first.

| Gate       | What it requires                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D          | Provider decision; first club photo licences.                                                                                                                                                                                                                |
| A          | Schema and engine reviewed.                                                                                                                                                                                                                                  |
| U          | Frames signed off.                                                                                                                                                                                                                                           |
| X          | Prototype test passed.                                                                                                                                                                                                                                       |
| F          | Journeys pass FR/AR.                                                                                                                                                                                                                                         |
| B (launch) | Every eligible player has a DOB. All finished-match lineup players linked. Clean sheets computed. Nationality ≥95%. Licensed photos for the top 30 (shirt fallback otherwise). Foot and height ≥80% or hidden. Monday peak served from cache in a load test. |

Soft launch behind the flag, then public from the first edition after round 3.

## 8. Owner decisions

Recorded 2026-09-26.

1. Provider: the owner asked Claude to search for a suitable second provider
   (in progress). A trial key is created by the owner when chosen.
2. Photo programme: explained to the owner; who contacts the clubs and the
   photographer budget are still open.
3. Nav change: **approved.** Pépites takes the Profil slot and Profile moves
   to the header avatar.
4. Monday editor: **the owner.**
5. Build: Claude designs and builds; the owner approves each gate and every
   production change.

Next: Gate A, owner review of [`PEPITES_ARCHITECTURE.md`](PEPITES_ARCHITECTURE.md).
