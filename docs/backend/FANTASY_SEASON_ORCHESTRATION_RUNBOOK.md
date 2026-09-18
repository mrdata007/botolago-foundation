# Fantasy season orchestration (2026/27)

Scheduled production operation that runs the Fantasy season without a manual
dispatch per gameweek. It composes existing, individually guarded operations
and adds exactly one database operation (calendar synchronisation). It does not
change the Fantasy UI, the scoring engine, the provider adapters or the manual
workflows, which remain available as fallbacks.

## Components

| Piece                                                          | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260918120000_fantasy_calendar_sync.sql` | `api.service_sync_fantasy_calendar(p_fantasy_season_id uuid default null)` (service role only) plus `app_private.fantasy_kickoff_confirmed()` and a relaxed `fantasy_guard_deadline_change` (a `scheduled` gameweek may be realigned; an `open` one only before its deadline; everything else raises `fantasy_gameweek_locked`; every change stays audited in `app_private.fantasy_deadline_change_audit`).                                                                      |
| `scripts/backend/fantasy-season-orchestrator.ts`               | One idempotent pass: calendar sync → finished-fixture performance ingestion (`runCurrentPerformanceBatch`, bounded) → the trusted lifecycle worker (`runFantasyLifecycle`) for every gameweek with work → calendar sync again. Writes sanitized `fantasy-season-orchestrator.json`; verdict `ok` / `waiting` / `failed`.                                                                                                                                                         |
| `.github/workflows/fantasy-season-orchestrator.yml`            | Hourly (`12 * * * *`) and owner dispatch (`RUN_FANTASY_ORCHESTRATOR`). Job runs only when the repository variable `FANTASY_AUTOMATION_ENABLED` is `true`, on `main`, in the `production-admin-activation` environment, in the shared production mutation concurrency group. Steps: guard → checkout exact SHA → unit tests + secrets check → provider refresh (`current-season-recovery.ts`, canary mode, `continue-on-error`) → orchestrator → evidence scan → artifact upload. |
| `scripts/backend/current-season-recovery.ts`                   | Unchanged provider ingestion. `validateRecoveryMode` additionally accepts `schedule` + `canary` when `FANTASY_AUTOMATION_ENABLED=true` (the same owner-reviewed canary that is dispatched by hand today).                                                                                                                                                                                                                                                                        |

## What the calendar sync does, per provider round

1. **Missing gameweek** → creates a `scheduled` gameweek and its assignments
   only when the round is complete (fixtures = clubs / 2, every club present
   and in the Fantasy catalog), every kickoff is confirmed, the sequence is
   free and the derived deadline (ruleset rule: 90 minutes before the first
   kickoff) is still in the future. Otherwise it reports one stable reason:
   `round_incomplete`, `kickoff_unconfirmed`, `sequence_conflict`,
   `deadline_already_passed`, `no_fixtures_published`, `round_number_missing`.
2. **Existing `scheduled` / `open` gameweek without frozen assignments** →
   voids assignments whose fixture left the round or was cancelled, adds
   assignments for new confirmed fixtures (next `source_version`), realigns
   `assigned_kickoff_at` with the fixture, and recomputes `starts_at`,
   `ends_at`, `deadline_at`. It refuses to move a deadline that has already
   passed (`deadline_locked`) or to a time in the past (`new_deadline_in_past`).
3. **Any other state** (`locked`, `live`, `provisional`, `finalizing`,
   `finalized`, or frozen assignments) → `gameweek_locked`, nothing changes.
4. **Placeholder kickoffs** (`00:00:00 UTC`) are never treated as authoritative:
   they block creation and are reported as `kickoffUnconfirmed` /
   `deadlineUnconfirmed` on existing gameweeks, so a deadline derived from a
   placeholder is always visible in the run evidence.

A per-season advisory lock serialises concurrent calls; all writes go through
the existing unique indexes (`fantasy_gameweeks (season, sequence)`,
`(season, round)`, one active assignment per fixture), so a repeated call on the
same provider state changes nothing.

## What the orchestrator runs

`selectWorkerTargets` picks, in sequence order:

- `open` gameweeks whose deadline has passed (`deadline_passed`);
- `locked` / `live` / `provisional` / `finalizing` gameweeks (`in_progress`);
- `finalized` gameweeks whose successor is staged but not opened
  (`progression_pending`).

Each target runs through `runFantasyLifecycle` with the gameweek's own
`scoring_input_version` (1 before the first freeze). The runner performs
lock → live → provisional → scoring snapshot → persistence → finalization →
free-hit restore → free-transfer roll → rankings → completion → prices →
notifications → postwork → next-gameweek preparation, all through idempotent
service RPCs. A `waiting` outcome (`football_not_started`, `football_not_final`,
coverage incomplete) leaves the pass in `waiting`; a thrown error stops the
pass with a stable code and exit status 1. At most two gameweeks are processed
per pass (`maxWorkerRuns`).

## Rehearsal evidence (production database, rolled back)

- `docs/qa/fantasy-orchestration/rehearsal-calendar-sync.json` — scenarios A–E:
  idempotent on today's data; GW1 realigned when the real kickoff is
  published (8 assignments, deadline 18:30 UTC, 1 audit row, second run
  changes nothing); a round with midnight placeholders is **not** staged; the
  same round is staged once times are confirmed; a kickoff change on a
  scheduled gameweek moves the deadline once with audit; a cancelled fixture
  is voided and a re-added one gets `source_version` 2; an `authenticated`
  caller gets `forbidden`.
- `docs/qa/fantasy-orchestration/rehearsal-lifecycle-gw1-gw3.json` — GW1
  processed (539 players, 3 teams), round 2 staged by the sync, GW2 opened by
  the progression (3 teams, 3 lineups, hub shows gameweek 2), kickoff change on
  the **open** GW2 realigned (deadline 17:30 → 15:30, audited, hub shows the
  new deadline), every automated step repeated with identical row counts,
  GW2 processed, round 3 staged, GW3 opened, counts identical again;
  11.0 s of database time.

## Enabling in production

1. Promote migration `20260918120000_fantasy_calendar_sync.sql` to
   Production V2 (the `Phase 7E-B Production V2 migration promotion` workflow on
   the merged `main` SHA, or an owner-authorised apply). Until it is applied
   the orchestrator fails closed at its first RPC (`fantasy_orchestrator_rpc_failed`).
2. Set the repository variable `FANTASY_AUTOMATION_ENABLED=true`. Both the
   workflow condition and the script guard require it; unsetting it stops the
   schedule immediately.
3. Optionally dispatch **Fantasy season orchestrator** once with
   `RUN_FANTASY_ORCHESTRATOR` and read the uploaded evidence.
4. Leave `FANTASY_MANUAL_WORKER_ENABLED` unset unless a manual run is needed;
   both paths share the production mutation concurrency group.

## Residual manual dependencies

- The provider must publish rounds and real kickoff times; the sync never
  invents fixtures or deadlines. While SportsMonks keeps the season end at
  24 September, `current-season-recovery.ts` fetches fixtures only inside that
  window (limitation N4 of the hardening report).
- The recovery canary still fails at its final squad guard until the provider
  publishes the promoted clubs; its fixture/result phase commits first, and the
  orchestrator evidence records `providerRefresh.fixturesRefreshed`.
- A deadline that has already passed is never moved automatically; a kickoff
  change after the deadline is reported (`deadline_locked`) and needs the
  existing operator procedure.

## First production run (2026-09-18)

Run [35332956079](https://github.com/mrdata007/botolago-foundation/actions/runs/35332956079),
owner dispatch on `main` `8bda6b5`, migration `20260918120000` applied first
(the Phase 7E-B promotion workflow failed with `HTTP 401` from the Supabase
management API, so the promoter's exact transaction was executed directly; the
history row's SHA-256 equals the repository file). Evidence in
`docs/qa/fantasy-orchestration/production-run-35332956079.json`:

- calendar sync succeeded twice; round 1 reported `kickoffUnconfirmed: 8`,
  `deadlineUnconfirmed: true`, nothing created, realigned or moved;
- provider refresh updated the 8 fixtures in place (0 inserted, 8 updated,
  0 rejected) and stopped at the known squad guard
  (`current_squad_empty_or_oversized`);
- no gameweek had work, so the lifecycle worker did not run; every production
  count (gameweeks, fixtures, assignments, points, results, rankings,
  notifications, prices, lineups, audit rows) is identical before and after;
- verdict `ok`, sanitized evidence scan `PASS rule=ALL count=0`.
