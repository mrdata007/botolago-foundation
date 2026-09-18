# Fantasy catalog activation runbook

## Scope

This runbook controls the transition from canonical Football data to the first
authoritative Fantasy catalog. The migration publishes guarded operations but
creates no production rows, enables no worker, and creates no schedule.

Catalog staging and registration opening are deliberately separate changes:

1. preview and approve immutable Football/rules/pricing inputs;
2. stage a private, non-playable Fantasy season and verify it;
3. open registration in a second transaction only after a final review.

Only the trusted service context can execute these operations. Browser roles
have no execute grants and cannot write canonical Fantasy tables directly.

## Required source state

The preview is authoritative and must return `ready: true`. It blocks when:

- the Football competition is inactive or the selected season is not current;
- the season has ended or is not `planned`/`active`;
- team, player, round, or fixture totals differ from the reviewed values;
- any squad lacks `2 GK`, `5 DEF`, `5 MID`, or `3 FWD` across the expected
  club pool;
- one Football player resolves to more than one current catalog membership;
- a round does not contain exactly one appearance by every expected team;
- a fixture lacks a round;
- the first kickoff is within 24 hours;
- an initial price falls outside its approved position band.

The reviewed launch profile is 16 clubs, 30 rounds, 240 fixtures, and 240–800
eligible players. These numbers are explicit operation inputs rather than
hidden assumptions, so a future competition format needs a separate reviewed
activation profile.

## Initial-price algorithm

`botolago-initial-price-v1.0` uses the latest active rating from a completed
prior season in the same Football competition. Internal Football and Fantasy
UUIDs remain canonical; provider identifiers never enter the calculation.

| Position | Minimum | Maximum |
| -------- | ------: | ------: |
| GK       |     4.0 |     6.5 |
| DEF      |     4.0 |     7.0 |
| MID      |     4.5 |    12.5 |
| FWD      |     4.5 |    12.5 |

Ratings are bounded from 4.0 to 10.0. Confidence is bounded from 0 to 1 and
shrinks incomplete evidence toward the neutral 6.0 rating before the
position-relative price is calculated. A player without approved historical
evidence is recorded explicitly as rating 6.0 with confidence 0; no provider
or client invents a rating. Prices are rounded to the ruleset's 0.1 step.

The preseason ratings ingestion fails closed on missing provider evidence. If
the SportMonks season-statistics fetch returns no usable record
(`records_fetched = 0`), the run ends `failed` with error code
`player_statistics_unavailable`; if the fetched statistics cover fewer than
`MIN_STATISTICS_COVERAGE` (0.5, exported from
`supabase/functions/_shared/sportsmonks-player-ratings.ts`) of the rating
candidates, it ends `failed` with `player_statistics_coverage_insufficient`.
A provider record flagged `has_values: false` maps to its candidate but does
not count as coverage, so a season whose records all carry no values fails the
same way. In both cases no rating row is written, so a thin or empty provider
response can no longer be staged as a full set of neutral 6.0 / confidence 0
ratings. Before staging the catalog, confirm the latest `player_ratings`
ingestion run succeeded and carries no such error code.

The database enforces a second, independent guard at stage time.
`app_private.fantasy_rating_inputs_degenerate(season)` inspects exactly the
rating inputs `app_private.fantasy_catalog_candidates` consumes and reports
`{candidates, distinctRatings, maxConfidence, degenerate}`; the inputs are
degenerate when every candidate carries one identical rating with zero
confidence. `api.preview_fantasy_catalog_activation` returns this object as
`ratingDegeneracy`, and `api.service_stage_fantasy_catalog` raises `PT409`
`fantasy_rating_inputs_degenerate` before it inserts anything when
`degenerate` is true. There is no override: ingest real ratings (or accept an
explicit product decision recorded in a later migration) before staging.

Every created player has one private immutable evidence row containing the
algorithm, source season/algorithm when available, rating, confidence, and
opening price. The public catalog never exposes internal ingestion metadata.

## Controlled operation sequence

1. Call `api.preview_fantasy_catalog_activation` with the reviewed Football
   season, ruleset code, and expected bounds.
2. Retain its 64-character `sourceDigest` in protected runtime memory and
   independently review counts, positions, price range, earliest kickoff, and
   blockers. Do not stage when `ready` is false.
3. Generate a new UUID idempotency key and call
   `api.service_stage_fantasy_catalog` with the exact digest and bounds.
4. Verify the returned Fantasy season is `planned`, all gameweeks are
   `scheduled`, all fixtures are assigned once, player/evidence/price-history
   counts match, and the competition is not offered for team creation.
5. Repeat the preview immediately before opening. The source digest must be
   unchanged and the first deadline must still be more than 24 hours away.
6. Generate a different UUID idempotency key and call
   `api.service_open_fantasy_registration`. Verify the season is
   `registration_open`, only gameweek 1 is `open`, and the public Fantasy
   read contracts expose the reviewed catalog.

Retries with the same idempotency key and identical inputs return the original
result. Reusing a key with changed inputs fails with `idempotency_conflict`.
Changed Football, ruleset, fixture, membership, or rating inputs change the
digest and fail closed as `stale_update`/`fantasy_catalog_stale`.

## Rollback

Before any user Fantasy team exists, call
`api.service_rollback_fantasy_catalog` with the catalog activation ID and its
exact source digest. The transaction removes fixture assignments, price
history, price evidence, players, gameweeks, and the Fantasy season; it
deactivates or removes the now-unused Fantasy competition and preserves the
private activation journals with `rolled_back_at`.

Rollback is idempotent. It refuses to run once a user team references the
season (`fantasy_catalog_in_use`). After a complete rollback, a fresh
idempotency key may safely stage the same Football season again; the previous
journal remains immutable.

## Deterministic acceptance evidence

`fantasy_catalog_activation.test.sql` builds a complete mock double round
robin with 16 clubs, 240 players, 30 rounds, and 240 future fixtures. It proves:

- deterministic position quotas and rating-derived prices;
- atomic stage, separate open, identical retry, and clean rollback;
- safe restaging after rollback;
- stale-digest and changed-idempotency rejection;
- duplicate-player and invalid-round blockers;
- forced RLS, absent browser grants, and trusted-service access only.

This is catalog correctness evidence, not permission to activate Production
V2. Production still requires current canonical Football data, capacity
certification on the selected compute tier, and separate reviewed activation
of deadline, scoring, finalization, ranking, price-change, and notification
workers. No worker schedule is introduced here.
