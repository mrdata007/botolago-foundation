# Pépites: build plan

Status: **plan, not built.** Written 2026-09-25. Owner-facing version:
<https://claude.ai/artifact/6kYyZhcUmdtMkSfsCLmCrE>. Premium screen designs (v3):
<https://claude.ai/artifact/LSKuLdfCfnxocnZU1FsCJc>.

Pépites is a Botola Pro under-23 ranking: a weekly Top 10 (Monday 20:00),
player pages with per-90 figures, percentiles and match logs, share images,
and its own bottom-bar tab (Profile moves to a header avatar). Compare and
player follows come in v1.1.
It is the first "BotolaGO Data" product and the base for a later scout and
academy layer.

**The architecture wins.** [`PEPITES_ARCHITECTURE.md`](PEPITES_ARCHITECTURE.md)
(revision 3, 2026-09-26) is the specification; where this plan disagrees,
the architecture is right. §§2–6 below were brought in line with it on
2026-09-26 (owner decisions: the smaller v1, and an explicit, off-by-default
weekly email). In v1.1, not v1: compare, player follows, detailed-stat
modules. Dropped: public view counts. Not done: the provider-neutral
refactor.

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

Sources (SportsMonks, BSD attributes, photo programme, data desk) → Supabase
edge importers → `app.*` tables with provenance → Pépites engine (SQL in
`app_private`, versioned, scoring from a sealed per-run snapshot) →
`api.pepites_*` read functions behind the mode check → TanStack routes with
SSR prefetch, versioned cached data, share-image route, admin console.

Do not generalise the existing SportsMonks functions. The second provider is
additive (architecture §8); the only changes to existing functions are the
attribute assignments in the squad import and player-list update
(architecture §3.1) and the email additions (architecture §5.4).

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
  line, sortable table, facts strip, "N.R." value, share templates,
  countdown and "coming soon" reveal states, weekly-email switch, skeletons.
  The compare row is v1.1.
- 24 frames (6 pages × FR/AR × phone/desktop), plus share images, 2 admin
  screens, and loading, empty, missing, error and guest states.
- Arabic: never skew Arabic script; numbers stay LTR.
- Contrast measured on rasterised pixels.

## 4. UX

- Journeys to cover:
  - Monday email → reveal → player → Fantasy or share.
  - Tab → filter → player → share.
  - Guest shared link → player → sign-in to switch on the weekly email →
    back to the player.
  - Fantasy list Pépite badge → player → add to team.
  - Weekly email: switch on from the Pépites home; leave with one click from
    the email, which turns off Pépites only.
- Timing: before round 3, show the labelled 2025-26 final ranking.
- Trust: "Mis à jour" time, minimum-minutes note, method page, report-error
  link to the data desk.
- Editor: shortlist of 20 at 12:00, pick and order 10, lines in FR/AR,
  schedule for 20:00. If nobody acts and auto-publish is on, the computed
  list publishes without lines; if it is off, the page shows the ranking is
  coming (architecture §7).
- Prototype test with 6–8 users (FR/AR) before building.

## 5. Frontend

- Flags: `PEPITES_ENABLED` and `PEPITES_PROMOTED`. The nav change sits behind
  the second.
- Routes:
  - `/pepites`
  - `/pepites/classement`
  - `/pepites/joueur/$playerId` (tabs as a search param)
  - `/pepites/semaine/$n`
  - `/pepites/methode`
  - `/admin/pepites`
  - `/admin/pepites/donnees`
- `src/services/pepites.ts` over `api.pepites_*`, typed from
  `src/backend/generated/database.types.ts`. `meta.ssr` on public queries.
  Per-player `head()` og tags.
- Data is fetched under the version from `api.pepites_version()`; cache
  headers per architecture §7; `private, no-store` whenever the response is
  not public.
- Components in `src/components/pepites/`. Charts are hand-drawn SVG (recharts
  is installed but unused).
- Share images from a server route; confirm the image library works on the
  Vercel/nitro build.
- The weekly-email switch calls `api.set_my_pepites_weekly_email`; off by
  default; guests go through `requireAuth`. Player follows are v1.1.
- Bottom nav: Pépites replaces Profil in `primary-nav.ts`; the avatar menu
  holds Profile. Update the nav tests.
- i18n: FR/AR keys and gate baselines.
- `AnalyticsEvent` additions: share, fantasy add, weekly email on and off,
  reveal complete.
- Tests: unit, e2e for the journeys in both languages, 390 px visual checks
  on real data, and the reveal and header tests in architecture §11.

## 6. Backend

The migrations, in order, are architecture §10. In short:

1. Migrations:
   - players: `height_cm`, detailed position
   - attribute observations, the resolver, seeding of existing values, the
     guard trigger, and the narrow attribute change to the squad import and
     player-list update (architecture §3.1)
   - photo releases and private buckets
   - data-desk issues and corrections, audited
   - methodologies, runs, sealed snapshots, scores, editions and entries
   - the weekly-email preference, type and unsubscribe topic
2. Data fixes:
   - SportsMonks player-details sync, through attribute observations
   - link unlinked lineup players
   - clean sheets are computed by the engine (architecture §4.1), never
     written into provider rows
3. BSD attribute importer after the go decision: its own mapping rows,
   player matching with manual review. Detailed match stats are v1.1.
4. Engine: architecture §4. It runs on round completion; a pg_cron draft at
   Monday 12:00 and a scheduled publication at 20:00.
5. Read functions: version pointer, home, ranking (filters/sort/page),
   player, player matches, edition, method. Mode-checked, definer, granted
   to anon.
6. Write functions: the weekly-email opt-in and opt-out. No follows, no view
   counts.
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
6. v1 scope (2026-09-26): **approved.** Compare, player follows and
   detailed stats move to v1.1; public view counts are dropped; share images
   stay.
7. Weekly email (2026-09-26): **approved** as a separate, explicit opt-in,
   off by default, with a one-click unsubscribe; no existing user is
   subscribed automatically.

Next: Gate A was approved for local implementation on 2026-09-26
(architecture revision 3, `fd9de3f`), with five conditions listed at the top
of [`PEPITES_ARCHITECTURE.md`](PEPITES_ARCHITECTURE.md). It authorises no
production change, deployment, public activation or paid-plan change.
Building follows architecture §10; the first migration (player attributes
with provenance) is built and tested locally. Pépites mode stays `off`.

## 9. UI status (Gate U)

Figma file: <https://www.figma.com/design/DEQTspI8A04pjmLcAYTYw4>. Ready for
owner sign-off. 26 frames:

- Mobile FR: 7 screens and 4 states (loading, before first edition, error,
  guest follow). The compare screen and the guest-follow state are v1.1; the
  guest state becomes "sign in to get the weekly email".
- Mobile AR: the same 7 screens, mirrored right-to-left.
- Desktop FR: ranking and player page (1440 px).
- Share images: story 1080×1920 and feed post 1080×1350, FR and AR.
- Admin: Monday selection and data desk.

Every figure comes from real 2025-26 Botola Pro data. The player photos are
SportsMonks images for internal use only.

Not drawn yet:

- Desktop AR.
- Desktop home, edition and method pages. They reuse the mobile and
  player-page blocks. (Compare is v1.1.)
- The reveal states (countdown, "coming soon") and the weekly-email switch.

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
