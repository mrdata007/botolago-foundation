# Fantasy pre-activation audit

Date: 2026-08-03

## Decision

The Fantasy application and backend contracts are ready for catalog activation
review. Catalog data, workers, schedules, and production Fantasy processing
remain disabled. Activation is not authorized by this audit.

The product decisions implemented in this pass are:

- unauthenticated visitors may explore Fantasy and build a local team draft;
  authentication is required only when the user saves authoritative state;
- the signed-in user's own Fantasy surfaces show the exact canonical profile
  display name; public league surfaces continue to identify other entries by
  Fantasy team name and do not expose profile identity;
- fixture difficulty is a versioned, server-computed value from 1 to 5 rather
  than a client-maintained or hard-coded rating.

## Section status

| Surface          | Result                    | Evidence                                                                                                                                                 |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fantasy hub      | Pass                      | Own-team summary uses the canonical profile display name and reports query failures explicitly.                                                          |
| Create Team      | Pass                      | Guest player browsing and refresh-safe local drafts work; save remains authenticated and server-authoritative.                                           |
| Team             | Pass                      | Manager identity, lineup, captaincy, bench order, and authoritative chip state render. Local browser activation and cancellation were verified.          |
| Transfers        | Pass                      | Server preview supplies bank, free transfers, and hits. Confirm is transactional and updates the current squad, lineup, ledger, audit, and team version. |
| Chips            | Pass                      | Activate/cancel operations use authoritative RPCs. Used, active, and cancellable states survive reload; no cloud-side local emulation remains.           |
| Points           | Pass                      | Points and automatic-substitution sections render; production does not expose client finalization or gameweek-advance controls.                          |
| History/rankings | Pass with data dependency | Read contracts and error states work. Real ranking values remain unavailable until catalog, scoring, and ranking workers are reviewed and activated.     |
| Leagues          | Pass                      | List/detail errors are explicit. Public rows use team names and do not disclose other users' profile names.                                              |
| Player pool      | Pass with data dependency | Filtering and selection work with deterministic mock data. Production remains fail-closed until an active Fantasy catalog exists.                        |
| Fixtures         | Pass with data dependency | Multiple fixtures per gameweek and home/away difficulty labels are supported. Production needs current canonical Football fixtures.                      |
| Rules            | Pass                      | Versioned backend rules are displayed through a stable read contract.                                                                                    |

## Authoritative transfer verification

The transfer preview and confirm paths now validate ownership, expected team
version, gameweek/deadline, active chips, incoming eligibility, positions,
duplicates, squad quotas, club limits, and budget on the server. Client totals
are never trusted.

Confirmation updates the immutable transfer ledger and the current temporal
squad membership, replaces the current lineup player, derives bank/team value/
free transfers, increments the team version, and records idempotency/audit data
in one transaction. pgTAP covers invalid input, valid preview, atomic confirm,
lineup replacement, and audit creation.

## Fixture difficulty design

`table-strength-v1.0` produces a 1-to-5 rating with explicit confidence and
algorithm version. Team strength is calculated from:

- table rank: 45%;
- points per match: 25%;
- goal difference per match: 15%;
- recent six-match form: 15%.

The opponent-strength result receives a 0.07 away adjustment and maps through
the normalized thresholds 0.20, 0.40, 0.60, and 0.80. Current-season standings
are used after three matches; otherwise the latest completed prior season is
used. Missing evidence returns a nullable rating rather than inventing data.
The rule rows are immutable, RLS is forced, direct browser table access is
denied, and only the safe `api.fantasy_fixture_difficulty` RPC is public.

## Compatibility and authority

- Guest state is draft-only and migrates to the authenticated draft key after
  sign-in. It never becomes production truth without successful server save.
- Cloud mode has no silent fallback to local/mock authority.
- The Fantasy DTO adds chip lifecycle fields using backward-compatible
  defaults, so older persisted/mock snapshots remain readable.
- Route components continue to use repository contracts rather than scattered
  Supabase calls.
- Generated V2 database types were regenerated from a clean local schema.

## Verification completed

- clean migration replay from zero: pass;
- migration validation: pass;
- generated-type drift check: pass;
- pgTAP/RLS: 516 tests pass;
- application/unit tests: 507 tests pass;
- TypeScript typecheck: pass;
- production build: pass;
- lint: pass with no errors (12 pre-existing warnings);
- database lint: pass;
- secret scan: pass;
- local browser route audit: pass for hub, create, team, transfers, points,
  top players, rankings, leagues, players, fixtures, and rules;
- local authenticated browser smoke: exact manager name, chip activate/cancel,
  transfer preview/confirm, and resulting squad/bank state pass.

## Remaining activation blockers

1. Production has no active/current Fantasy competition, season, gameweek, or
   player catalog. The current fail-closed response is expected.
2. Canonical Football does not yet contain the approved current-season squads
   and fixtures needed by Fantasy. Historical seasons must not be treated as
   the live Fantasy season.
3. The initial player-pricing method and resulting catalog require an explicit
   product/data review before loading production rows.
4. Provider/media licensing and current-season data completeness must be
   accepted before catalog promotion.
5. Capacity certification remains an activation prerequisite on the selected
   production compute tier, as documented in `FANTASY_CAPACITY_REPORT.md`.
6. Scoring, finalization, ranking, price-change, and notification schedules must
   remain disabled until their separate activation review.

## Exact recommended activation order

1. Select and approve the authoritative current Football season/provider data,
   including teams, squads, players, fixtures, and stable UUID mappings.
2. Review player eligibility, Fantasy positions, availability, initial pricing
   inputs, and media rights in staging.
3. Create the versioned Fantasy competition/season/gameweeks and catalog in
   staging only; keep workers and schedules disabled.
4. Run catalog integrity, DTO, RLS, clean-replay, team-creation, transfer, chip,
   scoring-fixture, fixture-difficulty, and rollback tests.
5. Run the protected capacity certification on the approved production-size
   tier and retain sanitized evidence.
6. Promote the reviewed catalog to Production V2 through the controlled
   migration/data-promotion process; smoke read-only public/player/rules paths.
7. Open team creation under observation, then activate deadline, scoring,
   finalization, ranking, price, and notification workers one group at a time,
   with an explicit stop and rollback check after each group.
