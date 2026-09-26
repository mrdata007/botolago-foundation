# Pépites: build plan

Status: **plan, not built.** Written 2026-09-25. Owner-facing version:
<https://claude.ai/artifact/6kYyZhcUmdtMkSfsCLmCrE>. Premium screen designs (v3):
<https://claude.ai/artifact/LSKuLdfCfnxocnZU1FsCJc>.

Pépites is a Botola Pro under-23 ranking: a weekly Top 10 (Monday 20:00),
player pages with per-90 figures, percentiles and match logs, a compare view,
share images, and its own bottom-bar tab (Profile moves to a header avatar).
It is the first "BotolaGO Data" product and the base for a later scout and
academy layer.

**Where the architecture differs.** Revision 2 of
[`PEPITES_ARCHITECTURE.md`](PEPITES_ARCHITECTURE.md) (2026-09-26, after
review) wins over this plan where they disagree. In short: compare, player
follows and detailed-stat modules move to v1.1; public view counts are
dropped; the provider-neutral refactor is no longer a first step; clean
sheets use one whole-match rule; unapproved photos stay in private storage.

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
- BSD (sports.bzzoiro.com) measured 2026-09-26: see §10.
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
- Components: night band, ghost rank number, player cut-out, silhouette,
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

| Gate       | What it requires                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D          | Provider decision; first club photo licences.                                                                                                                                                                                                                                                                                                                                 |
| A          | Schema and engine reviewed.                                                                                                                                                                                                                                                                                                                                                   |
| U          | Frames signed off.                                                                                                                                                                                                                                                                                                                                                            |
| X          | Prototype test passed.                                                                                                                                                                                                                                                                                                                                                        |
| F          | Journeys pass FR/AR.                                                                                                                                                                                                                                                                                                                                                          |
| B (launch) | DOB known for every player above the minutes floor and for ≥98% of squad players and anyone with league minutes; the rest counted on the method page. All finished-match lineup players linked. Clean sheets computed. Nationality ≥95%. Licensed photos for the top 30 (silhouette otherwise). Foot and height ≥80% or hidden. Monday peak served from cache in a load test. |

Soft launch behind the flag, then public from the first edition after round 3.

## 8. Owner decisions

Recorded 2026-09-26.

1. Provider: the owner asked Claude to search for a suitable second provider.
   First candidate, BSD, measured on the owner's key: §10.
2. Photo programme: explained to the owner; who contacts the clubs and the
   photographer budget are still open.
3. Nav change: **approved.** Pépites takes the Profil slot and Profile moves
   to the header avatar.
4. Monday editor: **the owner.**
5. Build: Claude designs and builds; the owner approves each gate and every
   production change.

Next: Gate A. Revision 1 was reviewed and sent back with changes; revision 2
of [`PEPITES_ARCHITECTURE.md`](PEPITES_ARCHITECTURE.md) answers every
finding and is ready for the owner's review.

## 9. UI status (Gate U)

Figma file: <https://www.figma.com/design/DEQTspI8A04pjmLcAYTYw4>. Ready for
owner sign-off. 26 frames:

- Mobile FR: 7 screens and 4 states (loading, before first edition, error,
  guest follow).
- Mobile AR: the same 7 screens, mirrored right-to-left.
- Desktop FR: ranking and player page (1440 px).
- Share images: story 1080×1920 and feed post 1080×1350, FR and AR.
- Admin: Monday selection and data desk.

Every figure comes from real 2025-26 Botola Pro data. The player photos are
SportsMonks images for internal use only.

Not drawn yet:

- Desktop AR.
- Desktop home, compare, edition and method pages. They reuse the mobile and
  player-page blocks.

Arabic rule found while drawing: a space inside a number ("1 159") can flip
the digit order in an Arabic layout. Use a narrow no-break space (U+202F) or
no separator.

No photo: a head-and-shoulders silhouette in the club's shirt colour replaces
the shirt fallback (owner decision, 2026-09-26). Built as
`src/components/common/PlayerPhoto.tsx` with tests; it shows when the read RPC
returns no photo or the photo fails to load. Not yet drawn in the Figma file.

## 10. Second provider check: BSD (2026-09-26)

BSD is Bzzoiro's sports data API (sports.bzzoiro.com). Measured read-only with
the owner's key, stored as an environment API credential sent as
`Authorization: Token <key>`. Botola Pro is league 53; 2025-26 is season 1085
(244 finished matches), 2026-27 is season 1962. About 1 000 requests used.

Player attributes, from the 16 current squads (510 players; 89 under 23, born
after 1 July 2003):

| Data                    | BSD                                                          | Today     |
| ----------------------- | ------------------------------------------------------------ | --------- |
| Date of birth           | 470 of 510 (92%)                                             | partial   |
| Nationality             | 492 of 510 (96%); U23 88 of 89                               | 0         |
| Shirt number            | 390 of 510 (76%)                                             | partial   |
| Height (U23)            | 62 of 89 (69%)                                               | no column |
| Preferred foot (U23)    | 69 of 89 (77%)                                               | 0         |
| Detailed position (U23) | 89 of 89                                                     | none      |
| Market value (U23)      | 48 of 89                                                     | none      |
| Photo (U23)             | 61 of 89, 150 px at most; the rest are 1×1 blanks (HTTP 200) | 10 of 81  |

Match data:

- Lineups with formation and substitutes: 244 of 244 (2025-26), 1 of 1
  (2026-27).
- Team match stats: 237 of 245.
- Detailed player stats (touches, passes, duels, shots, rating, xG): 141 of
  the 144 matches in rounds 1–18 of 2025-26, then 4 of the last 100. The
  one finished 2026-27 match (24 Sep) has none yet.
- Goals, assists, cards and goals conceded are present in every match.

Against SportsMonks (production, 2025-26, read-only): 347 of 481 players
matched by exact name. Goals equal for 327 (94%), assists for 292 (84%),
appearances within one for 319 (92%), season minutes within 45 for 270
(78%), yellow cards for 200 (58%). The display bar in
`PEPITES_ARCHITECTURE.md` §8 (98% on minutes and goals over 3 rounds) is not
met on this comparison; it needs the fixture-level report once identities are
mapped.

Licence (v4.0, effective 1 October 2026): showing the data in our app is
allowed, and the Pépites score and ranking are ours to publish. Raw data may
not be redistributed. Photos and logos belong to third parties, are for
identifying players inside the app only, and may not be used for promotion,
so not on share images. Data may not be presented as official.

Cost: free for 7 500 requests a day; $5 a month removes the limit.

Risks: a small operator; Botola coverage is listed as funded by an anonymous
sponsor; the detailed feed stopped mid-season without notice; the terms are
versioned and change on 1 October.

Recommendation:

1. Use BSD now for player attributes (date of birth, nationality, height,
   foot, detailed position) through the attribute observations, with
   provenance.
2. Keep SportsMonks for fixtures, lineups, events and basic stats.
3. Build no detailed-stat module on BSD until 2026-27 matches carry detailed
   stats. Re-check after rounds 2 and 3.
4. Photos: our own programme, unchanged. An importer must treat a 1×1 image
   as no photo.
