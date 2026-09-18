# Manual Fantasy worker

The worker runs one existing, activated gameweek. It does not create a season,
open registration, change the calendar, or install a schedule. It can prepare
and open the existing next gameweek after all previous postwork is complete. `FANTASY_MANUAL_WORKER_ENABLED` is absent/false by default. Leave it
disabled until production data, activation and capacity checks pass.

## Current launch prerequisites

The September 14, 2026 source audit found only eight opening fixtures for
Sportsmonks league 860 / season 28647. Tiznit had zero players and Témara one
across the checked squad endpoints. The provider's season end was September
24, identical to its start. A sampled kickoff was midnight UTC and was not
independently confirmed. These inputs do not authorize Fantasy activation.

Before activation, independently verify the complete current player pool,
official fixture dates/deadlines, season duration and the reviewed 16-club,
30-round activation profile. Apply and test the lifecycle, scoring snapshot,
finalization, notification, postwork and progression migrations as one release. Confirm the selected
compute tier can run the new pipeline at expected team counts. Existing
capacity exercises with seeded scores do not certify full production scoring.

## Scheduled alternative

`fantasy-season-orchestrator.yml` (see
`FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md`) runs the same worker code
(`runFantasyLifecycle`) hourly for every gameweek that has work, after the
provider refresh and performance ingestion, once `FANTASY_AUTOMATION_ENABLED`
is `true` and migration `20260918120000_fantasy_calendar_sync.sql` is applied.
The manual worker stays the fallback for a single reviewed run; both share the
production mutation concurrency group and the same idempotent RPCs.

## Operations

After activation and explicit enablement, run **Run one reviewed Fantasy
gameweek worker** on the reviewed main SHA, providing the existing gameweek
UUID, a positive calculation version, and `RUN_FANTASY_MANUAL_WORKER`.
Production credentials stay inside the protected `production-admin-activation`
environment. The workflow shares the production mutation concurrency group.

The trusted runner executes these guarded phases:

1. Freeze assigned fixtures and lineups in bounded batches after the database
   deadline. All user mutations already enforce that same deadline.
2. Mark live only when canonical Football reports a started match. Mark
   provisional only when every assigned fixture has an official final result.
3. Read a coherent source snapshot and calculate player category points,
   including explicit zeros for provider corrections. Calculate every frozen
   lineup's substitutions, captain/vice-captain, chip and transfer-hit result.
4. Persist bounded team pages against the exact source digest. Seal only after
   complete player and lineup coverage is verified in the database.
5. Finalize results, restore Free Hit squads, roll free transfers once, and
   calculate both gameweek and overall rankings globally and for each league.
6. Complete the gameweek through the sealed-input and result-coverage guards.
7. Apply the gameweek's price movement and enqueue deterministic in-app
   finalized notifications. This does not send external email or push. The
   database journals price pagination and verifies all notification events
   before recording postwork completion.
8. Prepare the existing next gameweek in bounded team batches. Require its
   verified full round of assigned fixtures and future database deadline.
   Carry each restored squad's valid selection, preserving any existing next
   lineup. Open the next gameweek only after every active team is prepared.

The present runner intentionally waits for complete final Football statistics;
it does not advertise continuous live Fantasy scoring. If no next gameweek is
staged, it returns `nextGameweekStatus: not_staged` without creating one.

Free Hit activation now captures the original lineup before any temporary
transfer. Progression restores that captain, vice-captain and bench order
against the actual restored squad. A historical Free Hit without that capture,
or a malformed selection, blocks progression for explicit repair; the worker
never invents a selection or overwrites an existing next-gameweek lineup.

## Failure and retry

An early invocation returns `waiting` without inventing live states or results.
Incomplete source statistics, a changed snapshot digest, unresolved fixtures,
an invalid cursor, or a bounded run limit fail closed. Output contains only
counts, internal operation IDs and stable codes; never source payloads or keys.

For a failed/partial run, dispatch a fresh run with the same gameweek and
calculation version. Do not use GitHub's re-run button: the immutable dispatch
guard accepts first attempts only. Committed batches resume safely: locked
lineups, final results, Free Hit restoration and rollover journals are durable.
An already finalized gameweek still resumes price and in-app enqueue work,
then any unfinished next-lineup batches. Partial preparation leaves the next
gameweek scheduled and read-only until all teams are ready. Once its opening
journal exists, a retry returns `already_advanced` without replaying old prices.

Do not increment the published scoring version for an ordinary provider
correction: source sequences replace stable `fixture-stats` category keys.
The price source version is gameweek sequence + 1, reserving 1 for the initial
catalog and preventing a second movement for retries of the same gameweek.
Changed input after sealing requires a reviewed correction path; the worker
must never silently accept a new source digest into a sealed result.

No schedule is enabled by this release.
