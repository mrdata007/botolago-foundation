# Gate 2 — SportsMonks football provider activation

Status: **Gate 2D historical catalog and fixture activation complete; Gate 2E current-season writes remain blocked on provider publication; Gate 2F manual catalog canary is prepared but not authorized**

Target project: BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`)

## Current production state

- Production V2 API and identity activation is complete.
- The protected SportsMonks catalog canary persisted one competition, one season, 30 rounds, and 16 teams for historical season `26027`.
- [Gate 2D run 30657793279](https://github.com/mrdata007/botolago-foundation/actions/runs/30657793279) persisted 130 historical fixtures with 130 unique provider mappings, zero rejections, and verified anonymous pagination.
- The `football-ingest` Edge Function is active with JWT verification; ingestion RPCs remain service-role-only and `app.fixtures` has forced RLS.
- No Supabase Cron or `pg_net` extension is enabled. Historical ingestion is not scheduled.

## Purpose

Gate 2 replaces the deterministic football fixture adapter with a reviewed SportsMonks data path. It is deliberately split so provider mapping can be proven without placing a token in a browser, repository, workflow log, or test artifact.

- Gate 2A adds the server-only client, strict configuration, normalization, retry handling, and tests.
- Gate 2B adds database catalog persistence, a protected ingestion runtime, a bounded initial import, and only then a schedule.

Merging Gate 2A performs no database write, deploys no Edge Function, creates no cron job, and does not make a live SportsMonks request.

The Gate 2B access probe is also no-write. It discovers the provider's current season for Botola Pro league `860`, verifies the season-scoped rounds and teams endpoints, and samples a fixture window of at most 100 inclusive days. It does not receive any Supabase credential and cannot create production rows.

## Gate 2B production access evidence

The protected probe passed on 2026-07-31 in [GitHub Actions run 30646676316](https://github.com/mrdata007/botolago-foundation/actions/runs/30646676316) against exact `main` commit `f4d92ea18e3fad50ed97d3b02bfa844a5c0e3f7d`.

- League: Botola Pro, SportsMonks ID `860`, active.
- Provider-designated current season: `2026/2027`, SportsMonks ID `28647`, 2026-09-12 through 2027-07-05.
- Verified maximum fixture probe window: 2026-09-12 through 2026-12-20, 100 inclusive days.
- Provider response at the evidence timestamp: zero rounds, zero teams, and no fixture sample.
- Sanitized evidence artifact digest: `sha256:83a89c803ecf9881eb6a87a33d0b5e290cb6da13ec277131aa43d7ee4f759b2b`.

The zero-row catalog is a provider-data readiness boundary, not authorization to fabricate or import placeholders. A production catalog canary must wait until SportsMonks publishes season `28647` teams/rounds, or until a separate reviewed decision explicitly selects a populated historical season.

## Gate 2E current-season evidence and cadence

The protected current-season probe passed on 2026-07-31 in [GitHub Actions run 30659337465](https://github.com/mrdata007/botolago-foundation/actions/runs/30659337465) against exact `main` commit `7d3f16a2b771c1f90a1bb5727012c7b75553b4a3`.

- SportsMonks still designates season `28647` (`2026/2027`) as current.
- The provider still returns zero rounds, zero teams, and no fixture sample.
- Sanitized evidence artifact digest: `sha256:fc08e9bfc36bf9cfdfff2856c4a295638a0633d41ca4a363c3a07d3f95d5a0e9`.
- Current-season catalog and fixture writes remain disabled.

Gate 2E runs one read-only readiness check daily at `06:17 UTC` from the latest reviewed default-branch commit. The off-hour minute follows GitHub's guidance to reduce scheduled-run delay. Each run makes exactly four bounded GET requests, receives no Supabase credential, writes no database row, uploads only credential-scanned evidence, and publishes whether rounds, teams, and a fixture sample are all present. Publication readiness triggers a separate reviewed activation; it never enables ingestion automatically.

Gate 2F is the prepared, manual-only current-season catalog canary. It cannot run from a push or schedule. A first-attempt owner dispatch must name the exact reviewed `main` commit and supply `RUN_GATE2F_CURRENT_SEASON_CATALOG_CANARY`. Before its first production mutation, it repeats the four-request read-only probe and requires the exact reviewed league and season plus non-zero rounds, teams, and an in-scope fixture sample. A failed readiness check stops before deployment, secret changes, or ingestion. A post-configuration failure removes the one-time trigger and restores the last verified historical provider configuration; success retains the current-season configuration with the trigger removed. Gate 2F remains undispatched until the readiness evidence is green and the owner explicitly authorizes that exact run.

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

## Gate 2B implementation boundary

Production V2 now contains the service-role-only catalog and fixture ingestion RPCs plus the authenticated `football-ingest` Edge Function. The runtime requires Supabase JWT verification and a separate high-entropy one-time trigger secret, pins the SportsMonks origin, bounds request/response sizes, pages, retries, and timeouts, and records every run through the private ingestion ledger.

Historical season `26027` completed both catalog and fixture canaries. The one-time trigger secret was removed after each invocation, and no historical write cadence exists. Current-season `28647` ingestion remains fail-closed until the readiness evidence proves its prerequisite rounds, teams, and fixtures are published.

## Gate 2B sequence

Gate 2A through the bounded Gate 2D historical import are complete. The remaining Gate 2 sequence is:

1. Run the daily read-only Gate 2E readiness check for current season `28647`.
2. When rounds, teams, and a fixture sample are all present, explicitly authorize and run the prepared manual Gate 2F current-season catalog canary.
3. Run a bounded current-season fixture canary and independently verify API rows, mappings, freshness, and rejection journals.
4. Enable a low-frequency write cadence only after the canaries pass.
5. Expand toward live cadence only after rate-limit headroom, duration, and error rate are observed.

Any failure stops before the next step. Re-running the whole activation without identifying the failed invariant is prohibited.
