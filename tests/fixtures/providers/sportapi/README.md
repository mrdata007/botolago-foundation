# SportAPI fixtures (sportapi7.p.rapidapi.com)

Real answers captured on 2026-10-27 from SportAPI, the second RapidAPI provider the
Edge Functions can read football data from (`RAPIDAPI_HOST=sportapi7.p.rapidapi.com`,
see `supabase/functions/_shared/sportapi-translate.ts`). SportAPI serves Sofascore's
own raw data with the same ids (Botola Pro: tournament 937, season 102220).

**These are trimmed copies, not provider payloads**, under the same rule as
`../README.md`: the repository is public and the responses are third-party data. The
lineups and incidents use the keep-lists of `scripts/backend/provider-fixtures.ts`,
the statistics keep the same lines, the event lists keep three events with the fields
the parsers read, the standings keep the table figures, the squad keeps six players. No
birth dates, market values or heights.

| File                | Path on SportAPI                                                | Replaces, on the Sofascore host                        |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| `lineups.json`      | `/api/v1/event/{id}/lineups`                                    | `matches/get-lineups?matchId={id}`                     |
| `incidents.json`    | `/api/v1/event/{id}/incidents`                                  | `matches/get-incidents?matchId={id}`                   |
| `statistics.json`   | `/api/v1/event/{id}/statistics`                                 | `matches/get-statistics?matchId={id}`                  |
| `live.json`         | `/api/v1/sport/football/events/live`                            | `tournaments/get-live-events?sport=football`           |
| `next.json`         | `/api/v1/unique-tournament/937/season/102220/events/next/{n}`   | `tournaments/get-next-matches?...&pageIndex={n}`       |
| `last.json`         | `/api/v1/unique-tournament/937/season/102220/events/last/{n}`   | `tournaments/get-last-matches?...&pageIndex={n}`       |
| `standings.json`    | `/api/v1/unique-tournament/937/season/102220/standings/total`   | `tournaments/get-standings?...&type=total`             |
| `squad.json`        | `/api/v1/team/{id}/players`                                     | `teams/get-squad?teamId={id}`                          |
| `seasons.json`      | `/api/v1/unique-tournament/937/seasons`                         | (not used by the app; shows season 102220 = 26/27)     |

`live.json` was captured when no Botola match was in play: its three events are other
competitions. The tests build a Botola event from one of them (tournament 937).
There is no capture of an image answer; `/api/v1/team/{id}/image` and
`/api/v1/player/{id}/image` are expected to be PNG bytes like the Sofascore host's
(unverified, see `docs/backend/SOFASCORE_LIVE_EDGE.md`).

## How SportAPI differs from the Sofascore host

Compared on 2026-10-27/28 against the repository's Sofascore-host fixtures
(`../sofascore/`, which are themselves trimmed; there is no untrimmed Sofascore-host
payload in the repository) by key path and type, and by running every parser the Edge
Functions use on the real, untrimmed SportAPI answers.

| Endpoint     | Difference                                                                                                                                                                                                                                                                                  | Handled by                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| all          | Path parameters, not a query string (`/event/{id}/lineups`, `/events/next/{page}`).                                                                                                                                                                                                         | `translateToSportApi`                                                        |
| all          | A missing resource is HTTP 404 `{"error":{"code":404,"message":"Not Found"}}`. The Sofascore host answered 200 with an `error` body for incidents and statistics of a match without data.                                                                                                   | The client maps 404 to `data_unavailable`, which every caller handles.       |
| all          | Quota headers `x-ratelimit-requests-limit` / `-remaining` are the same names; extra `x-ratelimit-rapid-free-plans-*` headers are ignored. (The capture key was a 50-call free plan; the paid plan reports 15,000.)                                                                           | `readQuota`, unchanged.                                                      |
| live events  | World feed, not limited by the request (103 events from other competitions in the capture). Same on the Sofascore host, where the parser dropped the foreign ones and counted them.                                                                                                         | `onlyBotolaLiveEvents` keeps tournament 937 (and events whose tournament cannot be read, which the parser counts as malformed). Foreign events are no longer counted in `foreignTournamentCount`. |
| next / last  | Same events and `hasNextPage`; events carry more fields (`eventState`, `customId`, `hasXg`, ...). `hasNextPage` is a boolean in the capture.                                                                                                                                                | `withHasNextPage` makes it always a boolean.                                 |
| lineups      | Superset: `confirmed`, `statisticalVersion`, `supportStaff`, colours, per-player `jerseyNumber` (string), `country`, `dateOfBirthTimestamp`, `ratingVersions`, about 60 statistics. `statistics.penaltyMiss` is absent from the capture (the match had none). No type differs.           | Passed through; the parsers read the same fields.                            |
| incidents    | Superset: `isLive`, `timeSeconds`, `reversedPeriodTime*`, `periodTimeSeconds`, player objects with `position`, `slug`, `fieldTranslations`; colours. `assist1` is absent from the capture (no assist). No type differs.                                                                     | Passed through.                                                              |
| statistics   | Superset: each item also has `homeTotal`, `awayTotal`, `compareCode`, `renderType`, `statisticsType`, `valueType`. Period `ALL` only, as before.                                                                                                                                             | Passed through.                                                              |
| standings    | `standings[0]` is the `total` table (16 rows, `updatedAtTimestamp`); rows also carry `descriptions`, `promotion`, `scoreDiffFormatted`.                                                                                                                                                     | Passed through.                                                              |
| squad        | `players[].player` has `id`, `name`, `position` (G/D/M/F), `shirtNumber` (number) and `jerseyNumber` (string); 5 of 35 players have neither. Also `foreignPlayers`, `nationalPlayers`, `supportStaff` (the 3 foreign players are also in `players`).                                      | Passed through; `parseSquad` reads `shirtNumber`.                            |
| images       | Native `/team/{id}/image`, `/player/{id}/image`. Binary; not captured.                                                                                                                                                                                                                      | The catalog's client keeps image bytes for either URL form.                  |
