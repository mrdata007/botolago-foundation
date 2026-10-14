# SofaScore: the table, the schedule, clubs and players

Companion to [SOFASCORE_LIVE_EDGE.md](SOFASCORE_LIVE_EDGE.md) and
[SOFASCORE_ID_BRIDGE.md](SOFASCORE_ID_BRIDGE.md). Same Edge Function
(`football-live-refresh`), same RapidAPI client, same data-source switch
(`app_private.football_data_source()`), same SofaScore mappings. Only the server
calls SofaScore; the app reads our database and our storage.

Migrations (new only): `20261013120000_sofascore_standings_apply.sql`,
`20261013120100_sofascore_catalog_weekly.sql`,
`20261013120200_football_catalog_weekly_cron.sql`. Code:
`supabase/functions/_shared/sofascore-standings.ts`,
`sofascore-catalog.ts`, small hooks in `sofascore-live-refresh.ts` and
`football-live-refresh.ts`, and `src/lib/image-fallback.ts`.

## 1. The Botola Pro table

**Where it lives.** `app.standings`, read by `api.football_standings` (the
Classement tab, match pages). The new function
`api.service_apply_sofascore_standings(season_external_id, rows, observed_at)`
writes the same rows, so no reader changed.

**Why a new function.** `api.ingest_football_standings` (Gate 3B) updates row by
row under a non-deferrable unique `(season, group, type, rank)`, so two clubs
swapping places fail half way; one unmapped club or one missing figure (the
columns are `NOT NULL`) fails the whole table. The new function:

- matches clubs by the active `sofascore` team mapping only, never by name; a
  club without one is skipped and listed (`skippedUnmapped`);
- skips a row with **any** figure missing, not a whole number, or negative
  (`skippedIncomplete`). Nothing becomes `0`: the club's stored row stays as it
  was. The Edge parser (`parseStandingsRows`) already turns such values into
  `null`, and `buildStandingsPayload` never sends a row with a `null`;
- parks the rows it rewrites at `rank + 500`, then writes them, so any reordering
  is legal; writes nothing if the table is older than what is stored
  (`STALE_UPDATE`); leaves identical rows untouched.

**When it runs** (`SOFASCORE_STANDINGS_ENABLED=false` switches both off):

- **After a match ends.** The live tick, after its scores are written, makes
  **one** standings request if it wrote at least one fixture as `finished`
  (`finishedWrittenThisTick`): three matches ending in the same tick cost one
  request. A fixture is written as finished once (later ticks see it unchanged),
  so each match triggers at most one request, and several finishing together
  share it. Limit: SofaScore can take a minute or two to update the table after
  the whistle; the daily pass below corrects a table read too early.
- **Daily**, in the season job (hourly tick) during the UTC hour
  `SOFASCORE_DAILY_HOUR_UTC` (default 3). One request.

`shadow` makes the request and logs what it would send; it writes nothing.
Standings never fail the scores: errors are reported in `standings` of the answer.

## 2. Fixtures schedule: does the hourly job cover it?

**No, not the whole season.** The hourly season job reads page 0 of
`get-next-matches` and `get-last-matches` (about 30 events each way, an
assumption about SofaScore's page size: three to four rounds either side of
today). It catches nearby kickoff moves, but a postponement ten rounds away is
not seen until it comes into that window.

So the **daily pass** (same UTC hour as the table) also reads pages 1.. of both
lists until `hasNextPage` is false, at most `SOFASCORE_SEASON_FULL_MAX_PAGES`
pages per direction (default 12, max 20, `0` = no extra pages). Events go
through the same plan as the hourly job (mapped only, changed only, stale and
protected states skipped). **After each match** the live tick already writes the
finished score and status, as before; nothing was added there.

## 3. Weekly clubs and players: `{"job":"catalog_weekly"}`

pg_cron `football-catalog-weekly`, Sundays 04:17 UTC, calls the job through
`app_private.football_catalog_weekly_tick()`. Gates: the live refresh switch
(`football_live_refresh_enabled` in `app_private.notification_email_settings`)
and the data source: `sofascore` writes, `shadow` reads the squads and logs
what it would change (no download, no write), `sportsmonks` is skipped (in the
tick and again in the function).

For every club with an active SofaScore team mapping: `teams/get-squad`. Then,
for squad players that **already have an active SofaScore player mapping**:

| Field          | Rule                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `display_name` | set to SofaScore's name when different. `SOFASCORE_CATALOG_UPDATE_NAMES=false` turns it off. `full_name` is not touched.                                                             |
| shirt number   | the player's current membership at that club only; a number another active player holds is left (counted `shirtConflicts`). `SOFASCORE_CATALOG_UPDATE_SHIRTS=false` turns it off.    |
| `position`     | **off by default** (`SOFASCORE_CATALOG_UPDATE_POSITION=true` turns it on): a position decides Fantasy points per goal, and the owner's rule is that Fantasy scoring does not change. |

Never done, in the Edge code and again in the database function: creating a
player, a membership or a mapping; matching by name. A SofaScore squad player
with no mapping is returned in `unmappedPlayers` (first 50) and logged in the
`football_catalog_weekly` line (first 300, with total) for review.

The five attribute columns guarded by `player_attributes_provenance` (date of
birth, nationality, foot, height, detailed position) are not touched.

## 4. Club logos and player photos

- **Storage.** The existing public bucket `football-media`, under
  `football/sofascore/teams/<id>/crest-<hash12>.<ext>` and
  `football/sofascore/players/<id>/photo-<hash12>.<ext>`. The hash in the name
  makes a changed image a new path (no stale cache); the old object is removed
  after the new one is recorded.
- **Change detection.** SHA-256 of the bytes against
  `app_private.catalog_image_state.content_sha256`; the same hash is not
  uploaded again (`unchanged`, only the check time moves). The type is read from
  the first bytes (PNG, JPEG, WebP, 100 B to 2 MB), not from the server.
- **Clubs.** An `app.media_assets` row (`team_crest`) and
  `app.teams.crest_asset_id`, so `crestPath` in `api.football_team_json` serves it
  with no change. A crest supplied by BotolaGO (`crest-curated.*`) is never
  replaced and its club is not fetched.
- **Players.** Recorded in the new column `app.players.catalog_photo_path`
  only. It is **not** `photo_asset_id`, which belongs to the signed-release
  pipeline (Pépites: a photo is shown only with a release). No API reads
  `catalog_photo_path`, and player images are fetched only when
  `SOFASCORE_CATALOG_PLAYER_PHOTOS=true`. See "Owner decisions".
- **Budget.** `SOFASCORE_CATALOG_IMAGE_LIMIT` images per run (default 40, max
  120, `0` = none). Order: never fetched first (clubs before players), then the
  longest unchecked, so a run that stops at its limit continues next week where
  it stopped. A stored image is re-checked at most every 28 days; one SofaScore
  does not have (404) after 30 days; a failed one after a day. A run also stops
  at `SOFASCORE_CATALOG_TIME_BUDGET_MS` (default 100 s), on a quota refusal
  (429), or after three failures in a row.
- **Placeholders.** `ClubCrest` always draws the club-colour monogram under the
  image and removes a failed image; `PlayerPhoto` draws the silhouette for no
  photo or a failed one. They now share `src/lib/image-fallback.ts`
  (`usableImageUrl`, `showImagePlaceholder`), so `null`, `undefined`, blank and
  the text `"null"`/`"undefined"` all count as "no image".

**Images through the RapidAPI client.** The client only parses JSON and may not
be modified (another lane adds a counter inside it). `createCatalogRapidClient`
builds the very same client (`createRapidApiClient`: key in headers only, quota
floor, retries, timeout) and wraps only the `fetch` handed to it to keep the
bytes of an image reply; the client's "not JSON" failure is then turned into
those bytes. Every image request therefore goes through, and is counted by, the
client.

## Request cost

Assumptions: 16 clubs; 8 matches a round, 30 rounds, 240 matches; 4.35
weeks a month (52 / 12); about 30 events per SofaScore page (to confirm).

| Item                                                             | Arithmetic                                                           | Per week |             Per month |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | -------: | --------------------: |
| Table after each match (worst case: every match in its own tick) | 8 matches a round x 1                                                |  up to 8 |   up to 35 (8 x 4.35) |
| Table after each match (typical: 3 to 4 kickoff slots a round)   | 4 x 1                                                                |       ~4 |                   ~17 |
| Table, daily pass                                                | 1 x 7 days                                                           |        7 |                    30 |
| Whole schedule, daily pass (pages 1.. of both lists)             | 240 events / 30 = 8 pages, less 2 already read hourly = 6 a day, x 7 |       42 |          180 (6 x 30) |
| Squads                                                           | 16 clubs x 1                                                         |       16 |        70 (16 x 4.35) |
| Images, first week (16 crests)                                   | 16 x 1                                                               |       16 |             16 (once) |
| Images, steady state, clubs only                                 | 16 crests re-checked every 28 days: 16 / 4                           |       ~4 |                   ~16 |
| Images, with player photos on                                    | limit 40                                                             | up to 40 | up to 174 (40 x 4.35) |

New requests: **clubs only, steady state** = 8 + 7 + 42 + 16 + 4 = **77 a week**
(worst case), about **330 a month** (35 + 30 + 180 + 70 + 16). **Player photos on**
(bounded by the limit) = 8 + 7 + 42 + 16 + 40 = **113 a week**, about **490 a
month** (35 + 30 + 180 + 70 + 174). With about 450 mapped players at 40 a week a
full pass of player photos takes about 11 weeks (450 / 40).

For scale, what already runs: the hourly season job makes 2 x 24 = 48 requests a
day, about 1,440 a month, before any live tick. The daily schedule pull is the
largest new item; `SOFASCORE_SEASON_FULL_MAX_PAGES=0` removes it (180 a month).
The client's quota floor (`SOFASCORE_MIN_REMAINING`, default 100) applies to
all of it.

## Settings (Edge secrets, all optional)

`SOFASCORE_STANDINGS_ENABLED` (`false` = off), `SOFASCORE_DAILY_HOUR_UTC` (3),
`SOFASCORE_SEASON_FULL_MAX_PAGES` (12), `SOFASCORE_CATALOG_UPDATE_NAMES` (true),
`SOFASCORE_CATALOG_UPDATE_SHIRTS` (true), `SOFASCORE_CATALOG_UPDATE_POSITION`
(false), `SOFASCORE_CATALOG_PLAYER_PHOTOS` (false),
`SOFASCORE_CATALOG_IMAGE_LIMIT` (40), `SOFASCORE_CATALOG_TIME_BUDGET_MS`
(100000).

## Deploy (the owner's step)

1. Migrations `20261013120000`, `20261013120100`, `20261013120200`, in order,
   then deploy `football-live-refresh`. Without the migrations the standings step
   logs an error and the catalog job answers `database_unavailable`; scores and
   details are unaffected. Pause the football refresh jobs first if you write
   meanwhile (AGENTS.md).
2. Before the first `sofascore`-mode run, check the three endpoints below on the
   RapidAPI host with one request each.
3. Run `shadow` first: `{"job":"catalog_weekly"}` logs `planned` updates and
   `unmappedPlayers` with no write.

## Endpoints assumed

Used already in this repository: `tournaments/get-standings?tournamentId=937&seasonId=102220&type=total`
(parsed in `src/backend/football/provider/sofascore-schedule.ts`, read on
2026-10-10 per the ID bridge doc), `teams/get-squad?teamId=` (200, 31 players,
per the player-mapping design doc), `tournaments/get-next-matches` and
`get-last-matches` with `pageIndex`.

**Not yet called from this repository, confirm before use:**
`teams/get-logo?teamId=<id>` and `players/get-image?playerId=<id>`, assumed from
the host's naming style and answering with the image bytes. The paths are the
constants `teamLogoPath` and `playerImagePath` in `sofascore-catalog.ts`. If the
host names them differently or answers with JSON, the job records those items as
`failed`, stops after three in a row, and nothing else is affected. The page
size of `get-next-matches` / `get-last-matches` (30 assumed) and whether
`hasNextPage` is present are likewise unconfirmed.

## Owner decisions

1. **Player photos.** `PlayerPhoto`'s own comment, and the Pépites architecture,
   say provider images are for internal use and a photo is shown only with a
   signed release. The job therefore stores SofaScore player images only when
   switched on, and only in `catalog_photo_path`, which nothing serves. Whether
   to serve them, and under what licence, is the owner's call; serving needs a
   read path (a separate change).
2. **Club crests** from SofaScore replace the SportsMonks crest of a club (not a
   BotolaGO-supplied one). The provider's crests were noted as tiny; check the
   SofaScore ones look right at 56 px before the first run, or leave
   `SOFASCORE_CATALOG_IMAGE_LIMIT=0`.
3. **Names.** `display_name` follows SofaScore's spelling on mapped players.
   Turn it off with `SOFASCORE_CATALOG_UPDATE_NAMES=false` if reviewed spellings
   must stay.
4. **Positions** stay off until the owner confirms that a position change may
   reach Fantasy.
5. **The daily schedule pull** adds about 180 requests a month; say if it should
   be dropped or made weekly.

## Tests

`supabase/functions/_shared/sofascore-standings.test.ts` (unknown versus zero,
the debounce, the daily pass), `sofascore-catalog.test.ts` and
`sofascore-catalog-handler.test.ts` (no creation, no name matching, image
change, budget, shadow), `src/lib/image-fallback.test.ts` (placeholder rule).
pgTAP: `supabase/tests/database/sofascore_standings_apply.test.sql`,
`sofascore_catalog_weekly.test.sql`. Those two were written without Docker and
**not run**; CI's `database-quality` job is the authority.
