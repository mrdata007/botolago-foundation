# Gate 2 — SportsMonks football provider activation

Status: **Gate 2A merged; protected Gate 2B read-only access probe ready**

Target project: BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`)

## Purpose

Gate 2 replaces the deterministic football fixture adapter with a reviewed SportsMonks data path. It is deliberately split so provider mapping can be proven without placing a token in a browser, repository, workflow log, or test artifact.

- Gate 2A adds the server-only client, strict configuration, normalization, retry handling, and tests.
- Gate 2B adds database catalog persistence, a protected ingestion runtime, a bounded initial import, and only then a schedule.

Merging Gate 2A performs no database write, deploys no Edge Function, creates no cron job, and does not make a live SportsMonks request.

The Gate 2B access probe is also no-write. It discovers the provider's current season for Botola Pro league `860`, verifies the season-scoped rounds and teams endpoints, and samples a fixture window of at most 100 inclusive days. It does not receive any Supabase credential and cannot create production rows.

## Gate 2A contract

The first slice supports the minimum dependency chain required for canonical fixtures:

1. Competition by the reviewed SportsMonks league ID.
2. Season by the reviewed SportsMonks season ID.
3. Rounds for that season.
4. Teams for that season.
5. Fixtures in a bounded date window, filtered to that league.

Players, squads, standings, lineups, match events, match statistics, and player availability return `data_unavailable` until their Gate 2B persistence paths are implemented. They must never return empty success or fabricated rows.

## Security invariants

- `SPORTSMONKS_API_TOKEN` is server-only and must never use a `VITE_` prefix.
- The client sends the token only in the `Authorization` header.
- The API origin is pinned to `https://api.sportmonks.com/v3/football`; configuration cannot redirect credentials to another host.
- URLs, errors, cursors, and rate-limit metadata contain no token.
- Unknown SportsMonks states and malformed home/away or score pairs fail closed as `invalid_provider_payload`.
- Retry is bounded and honors `Retry-After`; a circuit breaker prevents sustained failure loops.

These rules follow the SportsMonks [authentication](https://docs.sportmonks.com/v3/welcome/authentication), [rate-limit](https://docs.sportmonks.com/v3/api/rate-limit), [pagination](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/introduction/pagination), [state](https://docs.sportmonks.com/v3/definitions/states), and [best-practices](https://docs.sportmonks.com/v3/welcome/best-practices) documentation.

## Server-only configuration

```dotenv
FOOTBALL_PROVIDER=sportsmonks
FOOTBALL_PROVIDER_BASE_URL=https://api.sportmonks.com/v3/football
SPORTSMONKS_API_TOKEN=<runtime-secret-only>
FOOTBALL_SPORTSMONKS_LEAGUE_ID=<verified-positive-integer>
FOOTBALL_SPORTSMONKS_SEASON_ID=<verified-positive-integer>
FOOTBALL_SPORTSMONKS_COUNTRY_CODE=MA
FOOTBALL_SPORTSMONKS_COMPETITION_TYPE=league
FOOTBALL_SPORTSMONKS_SEASON_START=<YYYY-MM-DD>
FOOTBALL_SPORTSMONKS_SEASON_END=<YYYY-MM-DD>
FOOTBALL_SPORTSMONKS_FIXTURE_FROM=<YYYY-MM-DD>
FOOTBALL_SPORTSMONKS_FIXTURE_TO=<YYYY-MM-DD>
```

The league and season IDs must be confirmed against the purchased subscription. Do not infer them from search results or examples in documentation.

## Gate 2A acceptance evidence

The focused test suite must prove all of the following:

- authentication is header-only and the token is absent from the request URL;
- Botola competition metadata is normalized to the provider contract;
- fixture timestamps are forced to UTC;
- exactly one home and one away participant are required;
- `CURRENT` score pairs and provider states map to canonical fixture fields;
- remote cursors are versioned and bound to one resource;
- HTTP 429 honors `Retry-After` and retries are bounded;
- unknown states and Gate 2B-only capabilities fail closed;
- only the official SportsMonks API origin and complete bounded settings are accepted.

## Gate 2B sequence

Gate 2B is allowed only after Gate 2A CI is green.

1. Confirm the SportsMonks plan includes the reviewed Botola league, season, and required includes.
2. Create or select the API token in SportsMonks without pasting it into chat, source code, terminal history, or a workflow input.
3. Store it as the protected GitHub Environment secret `SPORTSMONKS_API_TOKEN` for the no-write probe. Add a Supabase server secret only when the reviewed ingestion function is ready to deploy.
4. Run `.github/workflows/gate2b-sportsmonks-production-probe.yml` from the exact reviewed `main` commit and retain only its sanitized evidence artifact.
5. Add reviewed persistence for competition, season, round, and team identities before fixture writes are enabled.
6. Deploy an authenticated ingestion function with a fixed project ref and a bounded fixture window.
7. Run a one-page catalog canary, then the bounded fixture import.
8. Verify API rows, freshness ordering, rejection journal, and application reads before enabling a schedule.
9. Start with a low-frequency schedule; expand to live cadence only after rate-limit headroom and error rate are observed.

Any failure stops before the next step. Re-running the whole activation without identifying the failed invariant is prohibited.
