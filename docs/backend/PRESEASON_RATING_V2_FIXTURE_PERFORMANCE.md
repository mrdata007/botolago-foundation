# BotolaGO Preseason Player Rating v2 — completed-fixture performance

## Status and launch boundary

`botolago-preseason-rating-v2-fixture-performance` is designed to replace the
neutral v1 fallback with normalized SportsMonks `lineups.details` facts from the completed
2025/26 (`26027`) and 2024/25 (`24319`) Botola Pro seasons.

Production run `30764205550` applied the forward schema and runtime but stopped
on the first 2025/26 batch with `mapping_not_found`. It published no v2 ratings,
restored the pinned function configuration, removed the one-time trigger, and
uploaded credential-scanned evidence. The repair is a new dispatch from a new
reviewed main commit; the failed GitHub run itself must not be rerun.

Repair run `30767229746` proved the mapping quarantine on its first five
fixtures, then stopped in the second batch because one provider fixture failed
the hard lineup-coverage contract. It published no v2 ratings, restored the
pinned configuration, disabled the one-time trigger, and uploaded scanned
evidence. Because that response omitted the fixture and failed dimensions, the
next reviewed runtime adds only bounded coverage diagnostics; it does not
include the provider payload or relax any coverage invariant.

This data is historical preseason/offseason input only. It does not:

- mark a completed fixture current or live;
- create or activate a Fantasy season, gameweek, player pool, or registration;
- prove that the 2026/27 SportsMonks season or squads exist;
- start scoring, price movement, or any Fantasy worker.

Current/live Fantasy remains disabled until the provider exposes a populated
2026/27 season and its competition, rounds, clubs, squads, and fixtures pass
their own reconciliation gate.

## Provider source

The season-statistics endpoint is not authoritative for these two Botola
seasons because it returned no usable player statistics and previously caused
every candidate to receive a 6.0 rating with zero confidence. V2 uses the
provider's completed-fixture endpoint with the bounded include and filter:

```text
GET /v3/football/fixtures/{fixture_id}
include=lineups.details
filters=lineupDetailTypes:52,57,79,83,84,85,88,112,113,118,119,194,324
```

The implementation derives starts from lineup participation type `11`, derives
appearances from a start or positive official minutes, and uses canonical
player positions rather than nullable provider lineup position IDs.

## Persistence and exact reconciliation

Each normalized player/fixture row is versioned by a SHA-256 digest. A provider
correction creates a new active source version while retaining the old version
as inactive evidence. Browser roles have no table or RPC access to raw player
performance facts.

Provider lineup rows without a canonical player mapping are explicitly
quarantined and counted. They are never synthesized into players or assigned a
guessed position. A fixture still fails unless it has exactly 22 mapped
starters, exactly two mapped participant teams, at least 22 mapped performance
rows, and exact accounting of mapped rows plus all exclusions. Season, fixture,
and team mapping failures remain fatal.

A season rating cannot be derived until all 240 canonical finished fixtures
have one reconciled coverage record and each coverage count exactly matches its
active normalized performance rows. The production runner processes at most
five fixtures per invocation and requires exactly 240 fixtures for each pinned
season.

Only after that gate passes does one transaction replace active neutral v1 rows
with the exact v2 rating set. A partial fixture backfill cannot publish partial
ratings. An all-6.0 result is rejected by the production evidence validator.

## Rating calculation

V2 retains the reviewed position-relative v1 calculation and changes the
source of truth:

1. Aggregate normalized completed-fixture appearances, starts, minutes, goals,
   assists, clean sheets, goals conceded, saves, penalties, cards, own goals,
   and minute-weighted provider ratings.
2. Calculate Fantasy-equivalent points using the immutable v1.0 position
   weights.
3. Rank provider rating, total points, and points per 90 within each canonical
   position at 50%, 30%, and 20%.
4. Map the combined rank to 4.0–10.0 and shrink samples under 900 minutes toward
   6.0.
5. Persist the result under the immutable v2 algorithm identifier.

These ratings become inputs to a future preseason price proposal. They are not
enough to create `fantasy_players`: current-season player/team membership and
eligibility must first be supplied by the populated 2026/27 provider season.

## Evidence and rollback

The manual production workflow preserves sanitized provider responses, command
logs, exact counts, rating ranges, source digests, and errors on success or
failure before cleanup. It forbids rerunning the same GitHub run.

Migrations are forward-only. On failure, the workflow restores the pinned
function configuration and removes the one-time trigger. Partial normalized
facts remain private and inert; v2 ratings remain unchanged unless the complete
season derivation transaction commits.
