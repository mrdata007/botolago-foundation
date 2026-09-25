# Fantasy season orchestration (2026/27)

Scheduled production operation that runs the Fantasy season without a manual
dispatch per gameweek. It composes existing, individually guarded operations
and adds exactly one database operation (calendar synchronisation). It does not
change the Fantasy UI, the scoring engine, the provider adapters or the manual
workflows, which remain available as fallbacks.

## Components

| Piece                                                                            | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/20260918120000_fantasy_calendar_sync.sql`                   | `api.service_sync_fantasy_calendar(p_fantasy_season_id uuid default null)` (service role only) plus `app_private.fantasy_kickoff_confirmed()` and a relaxed `fantasy_guard_deadline_change` (a `scheduled` gameweek may be realigned; an `open` one only before its deadline; everything else raises `fantasy_gameweek_locked`; every change stays audited in `app_private.fantasy_deadline_change_audit`).                                                                                                                                                                    |
| `supabase/migrations/20260918130000_fantasy_deadline_watch.sql`                  | `api.service_fantasy_deadline_watch(p_fantasy_season_id uuid default null, p_warn_hours integer default 72, p_escalate_hours integer default 24)` (service role only, `stable`, read-only). Lists scheduled/open gameweeks whose deadline is inside the warning window while an active counting fixture still carries an unconfirmed kickoff, with the affected fixture detail. Never writes, never derives a replacement deadline.                                                                                                                                            |
| `supabase/migrations/20260918140000_fantasy_calendar_sync_unconfirmed_guard.sql` | Replaces `api.service_sync_fantasy_calendar` so the window/deadline derivation ignores unconfirmed kickoffs and is skipped entirely (note `deadline_unconfirmed`) while any active counting assignment of that gameweek is still a placeholder. Everything else is unchanged.                                                                                                                                                                                                                                                                                                  |
| `scripts/backend/fantasy-season-orchestrator.ts`                                 | One idempotent pass: calendar sync → finished-fixture performance ingestion (`runCurrentPerformanceBatch`, bounded) → the trusted lifecycle worker (`runFantasyLifecycle`) for every gameweek with work → calendar sync again → points check (read-only `api.fantasy_gameweeks`) → deadline watch. Writes sanitized `fantasy-season-orchestrator.json`; verdict `ok` / `waiting` / `escalate` / `failed`.                                                                                                                                                                      |
| `.github/workflows/fantasy-season-orchestrator.yml`                              | Hourly (`12 * * * *`) and owner dispatch (`RUN_FANTASY_ORCHESTRATOR`). Job runs only when the repository variable `FANTASY_AUTOMATION_ENABLED` is `true`, on `main`, in the `production-admin-activation` environment, in the shared production mutation concurrency group. Steps: guard → checkout exact SHA → unit tests + secrets check → provider refresh (`current-season-recovery.ts`, canary mode, `continue-on-error`) → orchestrator → _Provider refresh failed_ (only when the refresh failed; fails the job) → evidence scan → artifact upload → `ops-alert` issue. |
| `scripts/backend/current-season-recovery.ts`                                     | Unchanged provider ingestion. `validateRecoveryMode` additionally accepts `schedule` + `canary` when `FANTASY_AUTOMATION_ENABLED=true` (the same owner-reviewed canary that is dispatched by hand today).                                                                                                                                                                                                                                                                                                                                                                      |

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
   placeholder is always visible in the run evidence. Since
   `20260918140000_fantasy_calendar_sync_unconfirmed_guard.sql` they also stop
   the derivation itself: while any active counting assignment of a gameweek is
   unconfirmed the sync leaves `starts_at` / `ends_at` / `deadline_at` exactly
   as they are and reports `deadline_unconfirmed`. A partially published round
   (say 7 confirmed kickoffs and 1 placeholder) therefore never writes a
   placeholder-derived deadline.

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
service RPCs. A `waiting` outcome (`football_not_started`, `football_not_final`)
leaves the pass in `waiting`; a thrown error stops the pass with a stable code
and exit status 1. Missing statistics for a finished fixture, and a gameweek
past the end of its window without final points, wait only for a limited
time (next section). At most two gameweeks are processed per pass
(`maxWorkerRuns`).

An `open` gameweek whose round note carries `deadlineUnconfirmed: true` (or
`deadline_unconfirmed`) is **never** taken as a `deadline_passed` target, even
once its stored deadline has elapsed: locking it would freeze lineups on a
deadline the provider never published, and nothing can undo that afterwards.
The refusal is reported as `summary.skipped[] = {gameweekId, sequence, reason:
"deadline_unconfirmed"}` and degrades the verdict to at least `waiting`.

## Finished fixtures without statistics (since 2026-09-25)

What went wrong: from the evening of 24 September the season's only finished
fixture (SportsMonks 19874708) had no statistics, so GW1 could never score.
Every pass recorded `performances.error: "invalid_provider_id"` and ended
`waiting`, which exits 0. The runs were green, and the 07:44 UTC run closed
the open `ops-alert` issue. Waiting was the right answer for the first hour
and the wrong one for the tenth.

Each finished fixture is now certified on its own
(`CURRENT_FINISHED_FIXTURE_PERFORMANCES.md` has why that is safe). Every one
the pass could not certify is listed in `performances.incomplete[]` with its
stage, code, field path or database code, and its age:

| Condition                                                                                                                          | Verdict                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| a fixture read and not certified, less than `FANTASY_COVERAGE_ESCALATE_HOURS` after its final whistle                              | `waiting` (exit 0)          |
| a fixture read and not certified for longer, or of unknown age                                                                     | `escalate` (exit 1, alert)  |
| a fixture a provider outage kept the pass from reading (`waitingOn: "provider_outage"`, the code in `performances.providerOutage`) | `waiting`, whatever its age |
| a gameweek not finalized, less than `FANTASY_COVERAGE_ESCALATE_HOURS` after its window ended                                       | `waiting` (exit 0)          |
| a gameweek not finalized for longer, or its window end unreadable                                                                  | `escalate` (exit 1, alert)  |
| the gameweek windows could not be read at all (`scoring.error`)                                                                    | `waiting`                   |
| the fixture listing cut off at `maxPerformanceBatches` (fixtures beyond it are never reached)                                      | `escalate`                  |
| the fixture listing could not be read (`performances.error`, with `performances.diagnostic` when it names a field)                 | `waiting`                   |
| `FANTASY_COVERAGE_ESCALATE_HOURS` set to anything but a whole number from 1 to 168 (`invalidSettings`, a _Settings_ row)           | `waiting`, on 6 h           |

A provider outage, a failed read and an unusable setting are named on the run
page but do not escalate. The listing does not say which fixtures are already
certified, so a fixture an outage kept the pass from reading proves nothing,
and one failed read is not an incident. Per-fixture problems no longer reach
the listing's error, so this does not bring back the green hours of 24–25
September. When statistics or points really go missing, the database's own
checks (below) and the watchdog's `fantasy_points` page, whatever GitHub's
runs say.

The pass ages a fixture from kickoff + 2 h (its `finalWhistleSource` is
`kickoff_plus_estimate`, or `unknown` without a kickoff): the listing gives no
final whistle. The default threshold is 6 h; the repository variable
`FANTASY_COVERAGE_ESCALATE_HOURS` (a whole number from 1 to 168) overrides it.
Any other value is reported in `invalidSettings` and 6 h is used; it used to
stop the pass with `fantasy_coverage_escalation_window_invalid`. The run page
gains a _Finished without statistics_ row, and the alert issue's category
becomes `performance_coverage_overdue` with the fixture ids and codes. An
escalated fixture keeps its gameweek from finalizing, so it stays in the
listing and escalates every pass that reads it; the issue closes on the next
green run. A run that waited on a provider outage is green without having read
the fixture, so a closed issue does not prove the statistics arrived: the
database's `fantasy_fixture_coverage` keeps failing until they do. The
recovery procedure is in `CURRENT_FINISHED_FIXTURE_PERFORMANCES.md`.

**After a manual ingest, dispatch the orchestrator.** The recovery procedure
certifies statistics with the manual workflow (its one-fixture canary), but
only this orchestrator's worker scores and finalizes a gameweek, and GitHub
has started the hourly schedule up to 6.3 h late. So once the manual run is
green: Actions → _Fantasy season orchestrator_ → Run workflow on `main`, with
`RUN_FANTASY_ORCHESTRATOR` typed as the confirmation. It shares the manual
run's concurrency group, so it waits for it to finish. Otherwise the
database's `fantasy_scoring` check warns an hour after the certification and
fails, paging, 8 h after it.

The database watches the same two things without GitHub (migration
`20260925210400`, `docs/operations/ALERTS.md`), from real coverage and the
recorded final whistle (`app.fixtures.finalized_at`, kickoff + 2 h without
one): `fantasy_fixture_coverage` warns 6 h and fails 12 h after a counted
match's final whistle without certified statistics, whatever the cause, a
provider outage included, and `fantasy_scoring` ages the gameweek. Their
thresholds are fixed in that migration; `FANTASY_COVERAGE_ESCALATE_HOURS` does
not change them.

### Points not final after the gameweek's window

Certified statistics are not enough for points. A gameweek leaves `live` only
when every counting fixture is `finished` **and** has `finalized_at`, and
every counting assignment is frozen (`service_advance_fantasy_lifecycle`).
Until then the worker answers `waiting` with `football_not_final`, pass after
pass, and a fixture that never gets `finalized_at` (migration
`20260922200000` found 480 such fixtures) or a match moved after the lock
keeps it there with every statistic certified. Coverage aging cannot see
that, so the pass also ages the gameweek:

- after the second calendar sync, when any gameweek is `locked`, `live`,
  `provisional` or `finalizing` (or `open` past its deadline), the pass reads
  `api.fantasy_gameweeks` (read-only, the contract the Fantasy pages use) for
  each gameweek's `endsAt`, the end of its window as stored
  (`app.fantasy_gameweeks.ends_at`). The calendar sync sets it to the last
  counting kickoff + 6 h, but only while the gameweek is `scheduled` or `open`
  with no frozen assignment; after that it no longer moves. So it is not
  always last kickoff + 6 h: production's GW1 ends at 00:00 UTC on 28 Sep, 4 h
  after its last kickoff (read 2026-09-25);
- a gameweek still in one of those states after its window ended is listed in
  `scoring.gameweeks[]` with `hoursSinceWindowEnd`, `overdue`, and the
  worker's `workerCode` when it ran for it; the run page gains an _Ended
  without final points_ row;
- past `FANTASY_COVERAGE_ESCALATE_HOURS` (the same allowance, counted from the
  window end, 6 h by default) the pass escalates, and so does a gameweek whose
  window end is unreadable. Windows that could not be read at all
  (`scoring.error`) leave the pass `waiting`, named: the next pass reads them
  again, and the watchdog's `fantasy_points` reads them on its own schedule.

`endsAt` does not follow a counting match moved after the deadline, so such a
gameweek escalates early. That is intended: a match moved after the lock needs
an owner decision (`fantasy_fixture_resolution_required` path) either way. The
database's `fantasy_scoring` check only warns for it, and for a match
postponed, cancelled or abandoned after the lock: no tool applies that
decision yet, and a failure there would page every hour until one does.

What to do: read `scoring.gameweeks[].workerCode`. `football_not_final` with
every fixture certified means a fixture lacks `finalized_at` or an assignment
is not frozen: check the provider refresh (it sets `finalized_at`) and the
fixture's status, never set it by hand. With a fixture still in
`performances.incomplete[]`, follow the statistics recovery first.

### A failed provider refresh is red

The refresh step runs with `continue-on-error` so that the pass can still work
from the database, but GitHub then lists that step as a success in the run's
job summary. Two changes keep a failure visible:

- the orchestrator counts a refresh as done only when the evidence says
  `pass` **and** the step did not fail. Evidence reading `pass` from a step
  that failed is `current_season_recovery_step_failed`, and the run fails;
- a step named **Provider refresh failed** runs whenever the refresh step's
  real outcome is `failure`, prints an error annotation and fails the job.

## Paging: what runs, and what the owner must set

| Channel                                                  | Depends on                                         | State on 2026-09-25                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Red orchestrator run → `ops-alert` issue                 | GitHub starting the hourly schedule                | works; GitHub started its scheduled runs 3.1–6.3 h apart in the 48 h to 13:43 UTC                                              |
| Production watchdog (`ops-watchdog.yml`) → `ops-alert`   | GitHub schedule, **and now** each orchestrator run | on `main` since 05:24 UTC; GitHub had not started it once by 07:47                                                             |
| Database webhook (`app_private.ops_alert_tick`, pg_cron) | nothing on GitHub                                  | on: `enabled = true` with a webhook in Vault at 10:02 and 14:53 UTC, repeating hourly; nothing sent yet (`last_sent_at` empty) |

Why the watchdog had not run: nothing in its workflow gates it. There is no
repository variable in its `if:` and its ref condition is `main`, which is
where schedules run. Its secrets and variables are the ones the orchestrator
reads successfully in the same environment. A skipped job still creates a
run, and there were none at all, so GitHub never fired the schedule. That is
the same best-effort scheduler that starts the hourly orchestrator every 3–6
hours. The workflow now also runs on `workflow_run` after every orchestrator
run, so it runs whenever the season job does. Its `watchdog_schedule` row
warns when GitHub has not started its own 30-minute schedule for 2 h.

The watchdog reports every check `api.service_ops_health` names by its own
name, so a check a later migration adds needs no watchdog change. Only a
check with status `fail` pages; `warn` shows on the run page and exits 0. A
status other than `ok`/`warn`/`fail`, an overall `fail` that no named check
explains, an empty check list or an unreadable answer all fail.
`page_sitemapxml` fails unless the sitemap answers 200 **and** contains at
least one `<loc>`.

Statistics and points are watched from both sides. Migration `20260925210400`
adds `fantasy_fixture_coverage` and `fantasy_scoring` to `service_ops_health`:
the watchdog reports them under those names, and they page through the
database webhook without GitHub. Their thresholds are fixed in the migration
and allow for GitHub's late schedule: statistics warn 6 h and fail 12 h after
the final whistle; points fail 6 h past the due end of a match stuck
unfinished, or 8 h after the last statistics were certified; a match
postponed, cancelled, abandoned or moved after the lock only ever warns
(`docs/operations/ALERTS.md` has every threshold). The watchdog also keeps
two rows of its own, which were the only check before that migration:

- `fantasy_points` reads `api.fantasy_hub` and `api.fantasy_gameweeks` (both
  read-only) and fails when a gameweek is still not finalized more than
  `FANTASY_COVERAGE_ESCALATE_HOURS` after its window ended; inside that
  allowance it warns. It does not depend on the orchestrator running.
- `season_orchestrator` fails when the last completed orchestrator run
  concluded `failure` (or `timed_out`), which is how an overdue fixture
  reaches it: that run's summary names the fixture. It used to warn. A
  cancelled or skipped run warns; no run for 8 h fails, as before.

Owner actions, none of which this repository can do for you:

1. **The database webhook is already on.** Production read
   `ops_alert_state.enabled = true`, with a webhook in Vault, at 10:02 and
   again at 14:53 UTC on 2026-09-25, and no message sent yet. It is the only
   channel that does not depend on GitHub's scheduler, so prove that its
   messages arrive: step 2. Switching it on (a Vault secret
   `botolago_ops_alert_webhook`, then `select app_private.ops_alert_configure(true);`)
   is only for a new or replaced destination (`docs/operations/ALERTS.md`).
2. **Test both paths once.** Actions → _Production watchdog_ → Run workflow
   with `simulate_failure` ticked: an `ops-alert` issue must open and e-mail
   you. Run it again unticked and it must close. For the webhook, once
   migration `20260925210400` is applied, run
   `select app_private.ops_alert_test();` in the SQL editor: a message marked
   TEST must reach the channel, and the webhook's answer can be read back
   (`docs/operations/ALERTS.md`, step 3 of switching it on). It changes no
   alert state.
3. **Make sure the mention reaches you.** GitHub → Settings → Notifications →
   _Participating, @mentions and custom_: e-mail on. The issues mention
   `@mrdata007`.
4. **Optional.** Repository variable `FANTASY_COVERAGE_ESCALATE_HOURS`
   (default 6); set it at repository level, like `FANTASY_AUTOMATION_ENABLED`.
   It moves the GitHub side only: the orchestrator's statistics and points
   escalation and the watchdog's `fantasy_points` row. The database checks
   keep the fixed thresholds given above. A value that is not a whole number
   from 1 to 168 is not used, and 6 h is: the orchestrator names it in
   `invalidSettings` (a _Settings_ row; the run waits) and the watchdog in its
   `watchdog_config` row (a warning). Environment secret
   `SUPABASE_PRODUCTION_PUBLISHABLE_KEY` on `production-admin-activation`:
   without it the watchdog's `public_api` row is skipped silently.

## Deadline watch

`api.service_fantasy_deadline_watch` runs last, is read-only and never
short-circuits the pass. It reports a `scheduled` / `open` gameweek when both
hold:

- at least one active, counting fixture still has an unconfirmed kickoff
  (`app_private.fantasy_kickoff_confirmed` — a `00:00:00 UTC` placeholder), and
- the gameweek's deadline is at most `warnHours` away (negative hours, i.e. a
  deadline already elapsed, always qualify).

Two tiers, decided by the database clock only:

| Tier       | Condition                                  | Effect                                      |
| ---------- | ------------------------------------------ | ------------------------------------------- |
| `info`     | deadline farther away than `escalateHours` | verdict unchanged, entry in `informational` |
| `escalate` | deadline within `escalateHours` (or past)  | verdict `escalate`, run exits 1 (red)       |

Defaults are 72 h / 24 h, defined in the RPC defaults and in
`DEADLINE_WATCH_WARN_HOURS` / `DEADLINE_WATCH_ESCALATE_HOURS`; the repository
variables `FANTASY_DEADLINE_WATCH_WARN_HOURS` /
`FANTASY_DEADLINE_WATCH_ESCALATE_HOURS` override them (integers 0…720, warn ≥
escalate, otherwise the run fails closed with
`fantasy_deadline_watch_window_invalid`).

Reading the `deadlineWatch` block of `fantasy-season-orchestrator.json`:

- `warnHours` / `escalateHours` — the window actually used;
- `affected` — how many gameweeks matched;
- `escalations[]` / `informational[]` — the gameweek entries, sorted by
  `sequence`, each with `gameweekId`, `status`, `deadlineAt`, `startsAt`,
  `hoursToDeadline`, `deadlinePassed`, `unconfirmedFixtures`,
  `totalCountingFixtures`, `deadlineDerivedFromPlaceholder` and `fixtures[]`
  (`fixtureId`, `homeTeam`, `awayTeam`, `providerKickoffAt`,
  `assignedKickoffAt`, `originalKickoffAt`, `fixtureStatus`,
  `assignmentStatus`, `frozen`, `providerUpdatedAt`, `sourceSequence`);
- `noPlayableFixtures` — true when no fixture of the gameweek counts any more
  (every one postponed or voided): no lock can proceed from it;
- `remediation` — this runbook (since migration 20260924200000; it named the
  now-retired `fantasy-realign-gameweek-calendar.sql` before);
- `error` instead of the above — the RPC failed; the verdict degrades to
  `waiting` and the pass is otherwise unaffected.

Operator procedure on an `escalate` run:

1. Open the uploaded evidence and read `deadlineWatch.escalations[]`: the
   gameweek, its current deadline and the fixtures still at `00:00 UTC`.
2. Check the provider (SportsMonks) for the real kickoff times. The guard never
   invents a kickoff and never moves a deadline; only a published kickoff fixes
   the condition.
3. Once real times exist, let the next pass realign the gameweek (dispatch the
   workflow by hand if it is urgent). The hand-run realign scripts are retired.
4. If the times cannot be published before the deadline, decide **before** the
   deadline elapses. Afterwards the deadline cannot move: the sync reports
   `deadline_locked` / `new_deadline_in_past` and the guard trigger raises
   `fantasy_gameweek_locked`. Lineups frozen at a deadline are never re-opened.

### Postponed fixtures (since migration 20260924200000)

What went wrong on 2026-09-24 (GW1): a postponed fixture's kickoff anchored the
deadline, its placeholder kickoff then froze every deadline update, and the
lock refused to run while it still counted. The rule now:

- A fixture the provider reports `postponed` does not count for its gameweek
  while it is postponed. The calendar sync (every pass) and the lock (at the
  deadline) defer it: `superseded_at` set, `assignment_status = 'deferred'`,
  `resolution = 'provider_postponed'`, `counts_points = false`. The sync
  reports `assignmentsDeferred`.
- The deadline is re-derived from the fixtures still playable, 90 minutes
  before the first of them, as long as the current deadline is still ahead.
  A postponed fixture's `00:00 UTC` placeholder no longer freezes it.
- If the provider publishes the fixture again (not postponed, confirmed
  kickoff) while its gameweek is still `scheduled`/`open` and unfrozen, the
  sync assigns it again. Once the gameweek has locked it stays out (no double
  gameweeks yet: the next-gameweek progression requires one round per week).
- A round is staged when it is fully published; postponed fixtures are left
  out of the new gameweek instead of blocking it (`postponedFixtures` in the
  round's report). A round where every fixture is postponed is not staged
  (`all_fixtures_postponed`); an existing gameweek left with none reports
  `no_playable_fixtures`, keeps its deadline, is flagged by the deadline watch
  and cannot lock (`fantasy_fixture_assignments_missing`).
- A brand-new manager joins the open gameweek before its deadline, otherwise
  the staged next gameweek (`enrolmentGameweek` in `api.fantasy_hub`). There
  is no longer a window in which Fantasy refuses every new team.

The watch stays red for every hourly pass until the provider publishes; there
is no auto-suppression by design.

## Rehearsal evidence (production database, rolled back)

- `docs/qa/fantasy-orchestration/rehearsal-calendar-sync.json` — scenarios A–E:
  idempotent on today's data; GW1 realigned when the real kickoff is
  published (8 assignments, deadline 18:30 UTC, 1 audit row, second run
  changes nothing); a round with midnight placeholders is **not** staged; the
  same round is staged once times are confirmed; a kickoff change on a
  scheduled gameweek moves the deadline once with audit; a cancelled fixture
  is voided and a re-added one gets `source_version` 2; an `authenticated`
  caller gets `forbidden`.
- `docs/engineering/tasks/BG-0003/rehearsal-deadline-guard.json` — scenarios
  R1–R8 for the deadline watch and the unconfirmed-kickoff guard: the watch on
  live data (GW1, 8 unconfirmed fixtures, `deadlineDerivedFromPlaceholder`
  true), idempotence, `forbidden` for an authenticated caller, the info /
  escalate thresholds, a mixed round (7 confirmed + 1 placeholder) whose
  deadline is **not** written from the placeholder (`deadline_unconfirmed`,
  0 audit rows) and is written normally once the last kickoff is published, and
  the three refusals `deadline_locked`, `new_deadline_in_past` and
  `fantasy_gameweek_locked`.
- `docs/qa/fantasy-orchestration/rehearsal-lifecycle-gw1-gw3.json` — GW1
  processed (539 players, 3 teams), round 2 staged by the sync, GW2 opened by
  the progression (3 teams, 3 lineups, hub shows gameweek 2), kickoff change on
  the **open** GW2 realigned (deadline 17:30 → 15:30, audited, hub shows the
  new deadline), every automated step repeated with identical row counts,
  GW2 processed, round 3 staged, GW3 opened, counts identical again;
  11.0 s of database time.

## Enabling in production

1. Promote migrations `20260918120000_fantasy_calendar_sync.sql`,
   `20260918130000_fantasy_deadline_watch.sql` and
   `20260918140000_fantasy_calendar_sync_unconfirmed_guard.sql` to
   Production V2 (the `Phase 7E-B Production V2 migration promotion` workflow on
   the merged `main` SHA, or an owner-authorised apply). Until they are applied
   the orchestrator fails closed at its first RPC (`fantasy_orchestrator_rpc_failed`),
   and without `20260918130000` the deadline watch degrades the pass to `waiting`
   with `fantasy_deadline_watch_failed`.
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
