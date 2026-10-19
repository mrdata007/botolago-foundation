# Fresh authenticated SofaScore collection — 2026-10-18 UTC

**Authenticated live retrieval succeeded. Upstream ratings remain incomplete.**
The final capture ended at `2026-10-18T20:17:51.699Z` (19 October, 00:17:51 Dubai).
It used Api Dojo at `sofascore.p.rapidapi.com` through the existing database-free
`provider-probe.yml` workflow and its `staging-load-test` bound secret. The key
was never extracted. This measures the read-only collector, not the deployed
production Edge Function or any scoring/identity/database operation.

- [Final workflow run](https://github.com/mrdata007/botolago-foundation/actions/runs/39162589473) at code commit `a794db8e0285743d969fea26baf710bab5045596`.
- [Normalized JSON/CSV artifact](https://github.com/mrdata007/botolago-foundation/actions/runs/39162589473/artifacts/12149661139) (three-day retention). Raw cache was not uploaded.
- [Durable sanitized summary](2026-10-18-sofascore-live-collection.summary.json): exact field names, missing IDs, match-side team IDs, observation times, counts and quota snapshots. No raw player payloads.
- [Exact local/workflow run instructions](../backend/SOFASCORE_READONLY_COLLECTION.md).

## Fresh access and discovery

`tournaments/get-seasons?tournamentId=937` returned HTTP 200 and identifies
`102220` as **Botola Pro D1 26/27** (`78750` is 25/26). The current plan header
reports **10,000**, not the 500-request BASIC plan in the October 1 audit.
`tournaments/get-last-matches?tournamentId=937&seasonId=102220&pageIndex=0`
was fetched live. It includes all eight finished round-3 fixtures (8–11 October)
and only an incomplete round 4. Round 3 was discovered, not assumed from stored IDs.
It has 16 distinct match-side teams and meets the 30-day window.

The collector separately re-read every match detail and validated requested ID,
competition 937, season, round, match-side team IDs and finished status. For each
match, `matches/detail`, `matches/get-lineups`, one bounded
`matches/get-player-statistics?matchId=...&playerId=...` sample, and
`matches/get-incidents` succeeded and parsed. Diagnostic player samples do not
replace missing lineup ratings.

## Per-match final capture

Every row below is a **fresh authenticated pull**, with no cache hits and no
section errors. Times are the lineup observation time, in UTC on October 18.
“Missing” includes uncertain appearance rows, identified below. Statistic count
is the union of available numeric field names, not a promise that every player
has every field. Each match also carries a separate final `capturedAt` in the summary.

| Event    | Match                                                | Round | Appeared | Rated | Missing | Stat keys | Requests | Quota remaining | Observed UTC |
| -------- | ---------------------------------------------------- | ----: | -------: | ----: | ------: | --------: | -------: | --------------: | ------------ |
| 17132481 | Maghreb Fes – Renaissance Zemamra                    |     1 |       31 |    29 |       2 |        59 |        4 |           7,993 | 20:17:23.079 |
| 16958239 | Union Touarga Sport – Fath Union Sport               |     1 |       30 |    30 |       0 |        59 |        4 |           7,989 | 20:17:25.278 |
| 17256977 | Union Touarga Sport – RS Berkane                     |     3 |       32 |    32 |       0 |        56 |        4 |           7,985 | 20:17:27.541 |
| 17256968 | Renaissance Zemamra – Hassania d'Agadir              |     3 |       32 |    32 |       0 |        58 |        4 |           7,981 | 20:17:30.475 |
| 17256980 | AS FAR Rabat – Wydad Sportive Témara                 |     3 |       32 |    31 |       1 |        59 |        4 |           7,977 | 20:17:34.012 |
| 17256969 | Maghreb Fes – Raja Club Athletic                     |     3 |       31 |    31 |       0 |        56 |        4 |           7,973 | 20:17:36.820 |
| 17256974 | Moghreb Atlético Tetuán – Fath Union Sport           |     3 |       30 |    30 |       0 |        58 |        4 |           7,969 | 20:17:41.532 |
| 17256979 | Kawkab Athletic Club Marrakech – Ittihad Tanger      |     3 |       31 |    30 |       1 |        59 |        4 |           7,965 | 20:17:44.197 |
| 17256971 | Union Sportive Amal Tiznit – Difaâ Hassani El-Jadidi |     3 |       32 |    32 |       0 |        60 |        4 |           7,961 | 20:17:47.532 |
| 17256972 | Wydad Casablanca – CODM Meknès                       |     3 |       31 |    30 |       2 |        55 |        4 |           7,957 | 20:17:50.486 |

All matches satisfy the existing shared `fullCoverage` definition: players with
at least eight minutes have rating and passes. That does **not** certify ratings
for short cameos or uncertain substitutes. Across round 3: **248 rated / 251
known participants**, plus one uncertain appearance. Across both controls and
round 3: **307 rated / 312 known participants**, plus one uncertain appearance.
The CSV contains **399 player rows**, including unused bench entries; row count
was checked against normalized JSON.

Available fields include minutes, goals, assists, own goals, shots/on-target
attempts, passing, tackles, interceptions, duels, fouls, saves, expected goals/
assists, ratings and signed normalized performance metrics. Exact per-match
field sets (55–60 keys) are retained in the summary. These are availability
checks, not a new reconciliation or scoring certification.

## Ratings still unavailable

| Event    | SofaScore player ID | Match-side team ID | Appearance evidence | Minutes | Rating      |
| -------- | ------------------- | ------------------ | ------------------- | ------: | ----------- |
| 17132481 | 2161842             | 55035              | appeared            |       7 | unavailable |
| 17132481 | 1182110             | 55035              | appeared            |       2 | unavailable |
| 17256980 | 1008347             | 24394              | appeared            |       5 | unavailable |
| 17256979 | 833301              | 87180              | appeared            |       4 | unavailable |
| 17256972 | 919712              | 36268              | uncertain           | unknown | unavailable |
| 17256972 | 1526456             | 55025              | appeared            |       6 | unavailable |

Five known participants have 2–7 minutes and no rating. Player `919712` has
statistics but no minutes/rating, so appearance remains uncertain rather than
being classified as DNP. These six rows remain pending under the existing rules.
No rating is estimated and no missing statistic is converted to zero.

Previously limited control **16958239**, Touarga–FUS, now has **30/30 actual
ratings**, assists, shots and full statistics. This confirms backfill for that
one match since the October 1 capture; it does not establish a general backfill
deadline. Previously rated control **17132481** still has two unrated late cameos.
More requests cannot manufacture those ratings.

## Request accounting and failure diagnosis

The final run consumed **42 requests**: two discovery requests and four requests
for each of ten matches. Its last header snapshot is **7,957 / 10,000** remaining.
`freshAuthenticatedPull: true`, zero fetch/validation/section errors, and
**exit code 4**. GitHub marks the job failed because exit 4 deliberately signals
missing ratings; it is not an authentication or endpoint failure. The artifact
uploads even on that conclusion. Quota headers are last-response observations;
they can move independently of this collector, so do not infer this run’s cost
by subtracting headers. `requestsConsumed` counts actual HTTP attempts.

Four one-request probes (seasons, fixtures, lineup shape and normalized metrics),
plus two unsuccessful 22-request collector attempts and the final 42 requests,
used **90 requests in this investigation**. The unsuccessful attempts are not
rating-coverage evidence. They retrieved replies successfully but exposed new
collector validation mistakes: first assuming unfamiliar metrics were integer
counts, then rejecting signed normalized values. The field-shape and enum probes
confirmed fractional/signed `passValueNormalized`, `defensiveValueNormalized`,
`goalkeeperValueNormalized`, `dribbleValueNormalized` and `shotValueNormalized`.
These were repaired with bounded signed numeric validation and regression tests.
Final live evidence is from the corrected code only.

- [Season probe](https://github.com/mrdata007/botolago-foundation/actions/runs/39159341970).
- [Fixture discovery probe](https://github.com/mrdata007/botolago-foundation/actions/runs/39160331950).
- [First unsuccessful parser attempt](https://github.com/mrdata007/botolago-foundation/actions/runs/39160789747).
- [Second unsuccessful parser attempt](https://github.com/mrdata007/botolago-foundation/actions/runs/39161024066).
- [Lineup shape probe](https://github.com/mrdata007/botolago-foundation/actions/runs/39161860339).
- [Signed metric probe](https://github.com/mrdata007/botolago-foundation/actions/runs/39162227122).

The other environment’s direct SofaScore `403 reason: challenge` was not
retested or bypassed. It did not diagnose this authenticated RapidAPI route.
Locally `RAPIDAPI_KEY` was absent; the local command produced a structured
`missing_rapidapi_key` report with exit 2 and zero requests. GitHub secret binding
provided the working live route. Neither credentials, quota, endpoint access nor
fixture/player mapping caused the missing ratings in the final capture. This
collector uses provider identities only and cannot establish BotolaGO mappings.

## Tests and remaining limits

**191 focused Bun tests passed** across provider clients/parsers, collection,
audit, Fantasy observations, coverage, rating scoring and staged statistics.
The tests include synthetic HTTP failures and two explicitly labeled October 1
historical fixture replays; neither category is counted as live verification.
Repository typecheck, separate strict script/test typecheck, changed-code ESLint,
format checks and the tracked-secret check also passed. JSON/CSV artifact shape
and row-count checks were run against the actual downloaded live artifact.

Production SQL/pgTAP, deployment, database writes, player linking, scoring-rule
changes and merges were not performed. The deployed Edge client’s independent
retry implementation was not changed or redeployed. Current access is measured
for this bound subscription and these endpoints; future provider changes and
upstream omissions remain possible. A changed league format or season-list order
requires reviewing the explicit discovery assumptions.
