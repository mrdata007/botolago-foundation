# Production alerts

What pages whom, why, and what to do. Added 2026-09-24 after an audit found
that the only escalation channel was a red GitHub run nobody watched: two
failed season-orchestrator runs, a gameweek left open six hours past its
deadline and live scores switched off on a match day all went unnoticed.
Since 2026-09-25 a finished match without statistics and a gameweek without
final points page too, once they are past their allowance, instead of
waiting behind green runs.

## Channels

| Channel                                                                                           | Fires on                                                                                                                                                                    | Latency                                                                                                                           | Needs                                                                                                      |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GitHub issue labelled `ops-alert` (mentions `@mrdata007`, so GitHub e-mails and notifies the app) | a red **Fantasy season orchestrator** run ([below](#a-red-season-orchestrator-run)); a failed **News licensed import** run; a row that fails in the **Production watchdog** | immediate for the two jobs (their last step); the watchdog runs every 30 min, after every orchestrator run on `main`, and by hand | nothing: uses the run's own `GITHUB_TOKEN`                                                                 |
| Webhook message (Discord, Slack or any JSON endpoint) from the database                           | the database's own checks turning to `fail`, a different set of them failing, still failing an hour later, and once on recovery                                             | at most 5 minutes (pg_cron, independent of GitHub)                                                                                | the owner stores a webhook URL in Vault and switches it on ([below](#switching-the-webhook-on-owner-once)) |

One issue per job, titled `[ops] <job> is failing`: `Fantasy season
orchestrator`, `News licensed import`, and `Production health` for the
watchdog. A repeated failure comments on the open issue; the next green run
comments "Recovered" and closes it. One incident can therefore hold two issues
open: a red orchestrator run opens its own, and the watchdog that runs after it
fails its `season_orchestrator` row and opens `Production health`. Each closes
on its own job's next green run.

The webhook sends one message per incident, repeats hourly while it lasts,
and says `RECOVERED` once. Warnings never send. It sees the database's checks
only: the watchdog's own rows (`fantasy_points`, `season_orchestrator`, the
pages, `release_drift`) reach you through GitHub alone.

Every alert carries the environment, the job or check, the time (UTC), an
error category, the run id and link (GitHub) and a one-line reason. None
carries a credential, a user, an e-mail address or a payload: the categories
come from the jobs' sanitised evidence (verdicts and codes) and from the
database's own check names.

## The database's checks (`api.service_ops_health`)

The watchdog reports each check under the database's own name, and so does
the webhook message. A check a later migration adds is reported with no
watchdog change; a status other than `ok`, `warn` or `fail` fails.

| Check                      | Fails when                                                                                                                                                                                                                      | Warns when                                                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fantasy_lifecycle_tick`   | the tick is on but has not run for 15 min, or failed 3 times in a row                                                                                                                                                           | it is switched off, or failed once or twice                                                                                                                                                                                                                                     |
| `fantasy_gameweek_lock`    | an open gameweek is 30+ min past its deadline                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                 |
| `fantasy_deadline_watch`   | a scheduled/open gameweek is within 24 h of its deadline while a counting fixture still has a placeholder kickoff, or it has no counting fixture left                                                                           | the watch itself errors                                                                                                                                                                                                                                                         |
| `fantasy_fixture_coverage` | a finished match that counts for Fantasy points still has no certified player statistics 12 h after the final whistle                                                                                                           | the same, 6 h after the final whistle                                                                                                                                                                                                                                           |
| `fantasy_scoring`          | a counted match of a locked gameweek still not started, live, suspended or delayed 6 h after its due end (below); or every counted match final and certified, the gameweek still not finalized 8 h after the last certification | such a match 3 h past its due end; one postponed, cancelled, abandoned or moved past the window after the lock, from the start and for as long as it lasts (never fails); every match final for 6 h but one lacks statistics; points not final 1 h after the last certification |
| `cron_jobs`                | any pg_cron job failed in the last hour                                                                                                                                                                                         |                                                                                                                                                                                                                                                                                 |
| `news_publication`         | the every-minute publication job has not run for 10 min                                                                                                                                                                         |                                                                                                                                                                                                                                                                                 |
| `news_sitemap`             | the sitemap snapshot is missing or 10+ min old (refresh job paused or failing)                                                                                                                                                  | snapshot 2+ min old (sitemap computed live), or a refresh took 1.5 s+                                                                                                                                                                                                           |
| `news_import`              |                                                                                                                                                                                                                                 | an import run failed in the last 24 h                                                                                                                                                                                                                                           |
| `live_scores`              | live refresh is on but no fixture refresh for 10 min while a match is in play                                                                                                                                                   | live refresh is off while a match is in play or kicks off within 6 h                                                                                                                                                                                                            |
| `provider_refresh`         | 3+ failed fixture refreshes in 6 h                                                                                                                                                                                              | no successful fixture refresh for 12 h                                                                                                                                                                                                                                          |
| `email_delivery`           | email is on but its tick stalled for 15 min                                                                                                                                                                                     | undelivered emails are waiting                                                                                                                                                                                                                                                  |
| `browser_errors`           | never (see below)                                                                                                                                                                                                               | 25+ unhandled errors reported by visitors' browsers this hour and the last                                                                                                                                                                                                      |

`fantasy_fixture_coverage` and `fantasy_scoring` (migration 20260925180400)
watch the current Fantasy season (`registration_open` or `active`) and the
matches that count for its points. "Final whistle" is `app.fixtures.finalized_at`
(kickoff + 2 h when a finished row has none). Complete statistics means what
the scoring worker requires: a row in
`app_private.historical_performance_fixture_coverage` with
`scoring_statistics_complete` and `reconciled`; "certified at" is when its
current statistics version was stored (the active
`app.player_fixture_performances` rows of that version), not when the coverage
row was created or last touched. No scoring rows means no points yet, never
zero points. A gameweek with a match still to finish is in play, and not late,
as long as that match can still finish on its own: its kickoff is ahead or its
due end (kickoff + 2 h) is under 3 h ago. The lifecycle moves a gameweek to
scoring only once every counted match is finished, and nothing moves a match
out of a locked gameweek, so a match that cannot finish holds the gameweek:

- one stuck unfinished (not started, live, suspended, delayed) is a row that
  stopped following the match, or a provider fault, and a provider refresh can
  correct the first: the check warns 3 h and fails 6 h past its due end;
- one postponed, cancelled or abandoned after the lock, or moved to a kickoff
  past the gameweek's window, waits for an owner's decision that no tool
  applies yet: the check warns at once, names the match, and keeps warning; it
  never fails, since a failure would page every hour, for days, with nothing
  to run. The gameweek's lateness still reaches GitHub, through the watchdog's
  `fantasy_points` and the orchestrator's `fantasy_points_overdue`, once its
  window has ended.

Once every counted match is final, the points come from the Fantasy season
orchestrator alone: the run that certifies the last statistics scores in the
same pass. Statistics certified by hand (the one-fixture canary of
[CURRENT_FINISHED_FIXTURE_PERFORMANCES.md](../backend/CURRENT_FINISHED_FIXTURE_PERFORMANCES.md#recovery-procedure-owner))
wait for the next run, so the check warns an hour after the last
certification and fails only 8 h after it; dispatch the orchestrator after a
manual ingest instead of waiting. When statistics are missing, only the
coverage check fails; the scoring check warns, so one cause pages once.

Both exist because GitHub's side can stay green while statistics are
missing. Until 25 September the season orchestrator reported them as `waiting`
and exited 0 (audit 2026-09-25 A02/A08: the 1-3 match of 24 September had no
statistics for 12 hours and nothing said so; these checks would have warned
after 6 h and paged after 12). It still waits, green, on a provider outage
(its listing does not say which fixtures are certified, so the ones it could
not read prove nothing) and on a failed read of that listing; the database
reads coverage itself. Their thresholds
allow for GitHub's schedule: it started the hourly orchestrator
3.1–6.3 h apart in the 48 h to 13:43 UTC on 25 September, and a failing check
pages again every hour, so an ordinary night must not fail. They are fixed in
the migration; `FANTASY_COVERAGE_ESCALATE_HOURS` does not change them. A
season has one gameweek past its lock at a time; with several Fantasy
competitions running, both checks name the gameweek with its season
(`Cup GW1`) and the scoring check reports the most severe, then the earliest
deadline, and counts the others.

`browser_errors` only ever warns: the reports come from a public endpoint,
and a public endpoint must not be able to page anyone. Read them in the SQL
editor:

```sql
select bucket_hour, kind, code, route, release, reports, sample
from app_private.client_error_counts
order by bucket_hour desc, reports desc
limit 50;
```

What a report holds: when (to the hour), handled or not, where in the code
(`area`), the error's name or code, the page path with identifiers replaced
by `:id`, the release (git commit) and the first report's redacted message.
Never a user, an IP address, a query string, an e-mail address or a token;
kept 30 days. The browser side is `src/lib/client-error-sink.ts`: at most 20
reports per page visit, each kind of error once, sent without the visitor's
sign-in token.

## The watchdog's own rows

The **Production watchdog** (`.github/workflows/ops-watchdog.yml`,
`scripts/ops/watchdog.ts`) is read-only. It runs at 7 and 37 minutes past the
hour, after every **Fantasy season orchestrator** run on `main`, and by hand.
GitHub starts schedules on a best-effort basis: on 2026-09-25 it had not
started this one once in its first hours on `main`, and started the hourly
orchestrator only every three to six hours. Hence the run after each
orchestrator run, and the `watchdog_schedule` row. The run page lists every
row; only `fail` opens the issue.

| Row                                                         | Fails when                                                                                                                                                                                                                                                                                                                                                                                                                                                | Warns when                                                                                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fantasy_points`                                            | a gameweek of the open Fantasy season is still `open`, `locked`, `live`, `provisional` or `finalizing` `FANTASY_COVERAGE_ESCALATE_HOURS` (default 6 h) or more after its window ended (`endsAt`, the window's end as stored: the calendar sync sets it to the last counting kickoff + 6 h until the gameweek locks, and a window set otherwise keeps its own end), or its window end cannot be read; or the season or its gameweek windows cannot be read | such a gameweek is still inside that allowance                                                                                                                 |
| `season_orchestrator`                                       | no orchestrator run on `main` for 8 h, or none at all; its last completed run concluded `failure`, `timed_out` or `startup_failure`                                                                                                                                                                                                                                                                                                                       | its last completed run ended any other way but `success` (`cancelled`, `skipped`, ...); GitHub's run history cannot be read                                    |
| `page_home`, `page_matches`, `page_news`, `page_sitemapxml` | the page answers anything but 200, or nothing; the sitemap also when its body has no `<loc>` entry                                                                                                                                                                                                                                                                                                                                                        | the answer took over 8 s                                                                                                                                       |
| `public_api`                                                | `news_feed` answers anything but 200                                                                                                                                                                                                                                                                                                                                                                                                                      | the answer took over 8 s                                                                                                                                       |
| `release_drift`                                             | `main` has had changes unpublished for 72 h                                                                                                                                                                                                                                                                                                                                                                                                               | unpublished for 24 h; the live site runs commits `main` does not have; the site reports no release, or one GitHub does not know; the comparison is unavailable |
| `watchdog_schedule`                                         | never                                                                                                                                                                                                                                                                                                                                                                                                                                                     | GitHub has not started the watchdog's own 30-minute schedule for 2 h, or never has; its run history cannot be read                                             |
| `database_health`                                           | the health RPC answers anything but 200 with JSON, returns no checks, or says `fail` while no check it names fails                                                                                                                                                                                                                                                                                                                                        | `api.service_ops_health` is not installed                                                                                                                      |
| `watchdog_config`                                           | the production URL or secret key is missing                                                                                                                                                                                                                                                                                                                                                                                                               | `FANTASY_COVERAGE_ESCALATE_HOURS` is not a whole number from 1 to 168 (6 h is used)                                                                            |
| `simulated_failure`                                         | the run was dispatched with `simulate_failure` ticked                                                                                                                                                                                                                                                                                                                                                                                                     |                                                                                                                                                                |

`fantasy_points` reads the database through the same read-only contracts the
Fantasy pages use (`api.fantasy_hub`, `api.fantasy_gameweeks`), so it pages
even when GitHub does not start the orchestrator. `public_api` is checked
only when the environment secret `SUPABASE_PRODUCTION_PUBLISHABLE_KEY` is
set. `FANTASY_COVERAGE_ESCALATE_HOURS` is one repository variable, read by the
orchestrator and the watchdog alike, and only by them: the database's checks
above keep their own thresholds. A value that is not a whole number from 1 to
168 is not used, and 6 h is: the orchestrator names it in `invalidSettings`
(its run waits) and the watchdog warns (`watchdog_config`).

## A red season orchestrator run

The orchestrator's verdict is `ok`, `waiting`, `escalate` or `failed`. Only
the last two exit 1, turn the run red and open or update its issue. `waiting`
stays green: statistics or points less than `FANTASY_COVERAGE_ESCALATE_HOURS`
late, a provider outage (the fixtures it kept the pass from reading are
listed apart, with `performances.providerOutage`), a failed read of the
fixture listing or of the gameweek windows (`performances.error`,
`scoring.error`), a `FANTASY_COVERAGE_ESCALATE_HOURS` it could not use
(`invalidSettings`; 6 h is used), a round waiting for a real kickoff, the
worker waiting on a match. The database's `fantasy_fixture_coverage` and
`fantasy_scoring` keep ageing the same matches meanwhile, whatever GitHub
does. The full list of conditions is in
[FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md](../backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md#finished-fixtures-without-statistics-since-2026-09-25).

The issue's error category names the first of these that applies; its detail
lists every one:

| Error category                                                                                                    | Verdict         | Means                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the code that stopped the pass, e.g. `fantasy_orchestrator_rpc_failed` or `fantasy_deadline_watch_window_invalid` | `failed`        | a guard, a credential, a setting or the calendar sync refused the pass                                                                                                                                                                                                                                                      |
| `fantasy_lifecycle_refused`                                                                                       | `failed`        | the lifecycle worker stopped on a gameweek (`GW<n>: <code>`)                                                                                                                                                                                                                                                                |
| the listing's code, e.g. `performance_ingestion_failed`                                                           | `waiting` alone | the finished fixtures could not be listed. That alone leaves the run green; the code is the category only when something else turned the run red                                                                                                                                                                            |
| `performance_coverage_overdue`                                                                                    | `escalate`      | a finished fixture the pass read has had no certified statistics for `FANTASY_COVERAGE_ESCALATE_HOURS` after kickoff + 2 h, or its age is unknown; the fixture ids and codes follow (`invalid_provider_id` and the like, with the field on the run page). Fixtures a provider outage kept the pass from reading never count |
| `fantasy_points_overdue`                                                                                          | `escalate`      | a gameweek has gone that long past the end of its window without final points, or its window end cannot be read                                                                                                                                                                                                             |
| the windows' read error, e.g. `fantasy_gameweek_windows_unreadable`                                               | `waiting` alone | the gameweek windows could not be read at all. That alone leaves the run green; the code is the category only when something else turned the run red                                                                                                                                                                        |
| `escalate`                                                                                                        | `escalate`      | a deadline watch escalation (a gameweek within `FANTASY_DEADLINE_WATCH_ESCALATE_HOURS`, 24 h by default, of a deadline that is not authoritative), or the fixture listing was cut off at its page limit                                                                                                                     |
| `failed`                                                                                                          | `failed`        | the provider refresh failed (the red _Provider refresh failed_ step)                                                                                                                                                                                                                                                        |
| `workflow_failed`                                                                                                 |                 | a step before the pass failed, so there is no evidence file: see the run log                                                                                                                                                                                                                                                |

## The webhook: switch it on, test it, pause it (owner)

Everything below runs in Supabase dashboard → BotolaGO Production V2 → SQL
Editor. Only the database owner can run these functions; nothing else can
switch alerts or send a test.

On 2026-09-25 production read `enabled = true` with a webhook stored in Vault
at 10:02 UTC, and again at 14:53, with `repeat_after` 1 h and nothing sent
yet (`last_sent_at` empty). (When it was switched on is not recorded:
`ops_alert_state.updated_at` is rewritten by every tick.) So on production
there is nothing to switch on: step 3 alone confirms that messages arrive,
once migration `20260925180400` (which adds `ops_alert_test()`) is applied.
Steps 1, 2 and 4 are for a new or replaced destination.

It ships switched off (migration `20260924200200`), and it is the only
channel that does not depend on GitHub's scheduler.

1. Create a webhook: Discord → channel → Edit Channel → Integrations →
   Webhooks → New Webhook → Copy Webhook URL (or a Slack incoming webhook).
   It must be an `https://` URL; the tick sends nothing to any other.
2. Store it in Vault under the name the database reads:

   ```sql
   select vault.create_secret('<paste the webhook URL>', 'botolago_ops_alert_webhook');
   ```

   To replace a stored URL instead (the name is unique, so a second
   `create_secret` with it fails):

   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'botolago_ops_alert_webhook'),
     '<paste the new webhook URL>');
   ```

3. Send a test message. This works whether alerts are on or off and changes
   nothing else (not the switch, not the current incident):

   ```sql
   select app_private.ops_alert_test();
   ```

   The channel receives a message that starts `TEST sent by hand with
app_private.ops_alert_test(), not an incident. Alerts are ON` (or `OFF`),
   followed by the current health exactly as a real alert would word it. The
   result is `{requestId, alertsEnabled, healthStatus, delivery}`; a few
   seconds later, run the query in `delivery` to see the webhook's answer:

   ```sql
   select status_code, timed_out, error_msg from net._http_response where id = <requestId>;
   ```

   Discord answers `204`, Slack `200`. No row yet means pg_net has not sent it
   (wait a few seconds). `error_msg` or a `4xx` means the URL is wrong or was
   revoked: repeat step 2 with a fresh one. The error `ops_alert_webhook_missing`
   means step 2 has not been done.

4. Switch alerts on (it refuses without the Vault secret):

   ```sql
   select app_private.ops_alert_configure(true);
   ```

5. To pause: `select app_private.ops_alert_configure(false);`. To see where it
   stands:

   ```sql
   select enabled, last_status, last_signature, last_sent_at, repeat_after
   from app_private.ops_alert_state;
   ```

Once on, `app_private.ops_alert_tick()` runs every 5 minutes (pg_cron job
`ops-alert-tick`). It sends when health turns to `fail`, when the set of
failing checks changes, every `repeat_after` (1 h) while it keeps failing,
and once on recovery. Warnings never page. A new check needs no setting: every
check in `api.service_ops_health` takes part.

What it last did:

```sql
select enabled, last_status, last_sent_at from app_private.ops_alert_state;
```

Testing both channels once, making sure the `@mrdata007` mention reaches you,
and the optional settings are the owner's checklist in
[FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md → Paging](../backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md#paging-what-runs-and-what-the-owner-must-set).
A watchdog run with `simulate_failure` tests the GitHub path only: it adds a
watchdog row, and the webhook never sees those.

## When an alert fires

- `[ops] Fantasy season orchestrator is failing`: open the run, read the
  table on the run page and the uploaded evidence
  (`fantasy-season-orchestrator.json`), then by error category:
  - `performance_coverage_overdue`: the fixture, stage, code and field are on
    the run page; the recovery is in
    [CURRENT_FINISHED_FIXTURE_PERFORMANCES.md](../backend/CURRENT_FINISHED_FIXTURE_PERFORMANCES.md#recovery-procedure-owner).
  - `fantasy_points_overdue`:
    [Points not final after the gameweek's window](../backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md#points-not-final-after-the-gameweeks-window).
  - `escalate` with deadline escalations: the operator procedure in
    [Deadline watch](../backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md#deadline-watch).
  - `failed` after a failed provider refresh:
    [A failed provider refresh is red](../backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md#a-failed-provider-refresh-is-red).
  - a listing or windows code (`performance_ingestion_failed`,
    `fantasy_gameweek_windows_unreadable`): that read failed in a run that
    something else turned red; the detail lists what did.
- `[ops] Production health is failing` (or a webhook message): the failing
  rows are listed with their reasons.
  - `fantasy_points`: as `fantasy_points_overdue` above.
  - `season_orchestrator`: a red last run has its own issue, which says what
    escalated. "No run for N h" means GitHub has not started the hourly
    schedule at all. A run the schedule starts but skips still counts as a
    run and only warns (`skipped`): `FANTASY_AUTOMATION_ENABLED` is not `true`
    at repository level
    ([Enabling in production](../backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md#enabling-in-production)).
  - `fantasy_gameweek_lock`, `fantasy_lifecycle_tick`: read
    `app_private.fantasy_lifecycle_heartbeat.last_error`; the procedure is in
    `docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md`.
  - `fantasy_deadline_watch`: as a deadline escalation above.
  - `fantasy_fixture_coverage`: which counted matches lack certified
    statistics:

    ```sql
    select g.sequence_number as gameweek, f.id as fixture_id, f.kickoff_at, f.finalized_at,
      c.fixture_id is not null as has_coverage_row, c.scoring_statistics_complete,
      c.reconciled, c.coverage_outcome, c.quarantine_reason
    from app.fantasy_fixture_assignments a
    join app.fantasy_seasons s on s.id = a.fantasy_season_id
      and s.status in ('registration_open', 'active')
    join app.fantasy_gameweeks g on g.id = a.gameweek_id
      and g.status not in ('finalized', 'corrected', 'cancelled')
    join app.fixtures f on f.id = a.fixture_id and f.status = 'finished'
    left join app_private.historical_performance_fixture_coverage c on c.fixture_id = f.id
    where a.superseded_at is null and a.counts_points
      and not coalesce(c.scoring_statistics_complete and c.reconciled, false)
    order by coalesce(f.finalized_at, f.kickoff_at + interval '2 hours');
    ```

    Then read the latest Fantasy season orchestrator run's evidence
    (`fantasy-season-orchestrator.json`): `performances.incomplete[]` gives
    each fixture's stage and code, `performances.providerOutage` an outage
    that kept fixtures from being read, `performances.error` a failed read of
    the listing. Statistics come only from that performance step, or from the
    manual workflow that runs the same code: never type them in, and never
    read their absence as zero. The recovery is in
    [CURRENT_FINISHED_FIXTURE_PERFORMANCES.md](../backend/CURRENT_FINISHED_FIXTURE_PERFORMANCES.md#recovery-procedure-owner).
    Once its manual ingest (the one-fixture canary) is green, dispatch the
    Fantasy season orchestrator: Actions → _Fantasy season orchestrator_ →
    Run workflow on `main`, typing `RUN_FANTASY_ORCHESTRATOR`. Only its worker
    scores and finalizes the gameweek, GitHub has started the hourly schedule
    up to 6.3 h late, and `fantasy_scoring` fails 8 h after the certification.
    The dispatch waits for the manual run if it is still going (they share a
    concurrency group).

  - `fantasy_scoring` saying a counted match's points wait until it finishes
    or its Fantasy assignment is resolved: a counted match of the locked
    gameweek will not finish on its own. Which ones, and what state they are
    in:

    ```sql
    select s.name as season, g.sequence_number as gameweek, g.status as gameweek_status,
      g.ends_at as window_ends, f.id as fixture_id, home.short_name || ' v ' || away.short_name as match,
      f.status as fixture_status, f.kickoff_at, a.assigned_kickoff_at, f.provider_updated_at,
      a.assignment_status, a.frozen_at
    from app.fantasy_gameweeks g
    join app.fantasy_seasons s on s.id = g.fantasy_season_id and s.status in ('registration_open', 'active')
    join app.fantasy_fixture_assignments a on a.gameweek_id = g.id
      and a.superseded_at is null and a.counts_points
    join app.fixtures f on f.id = a.fixture_id and f.status <> 'finished'
    join app.teams home on home.id = f.home_team_id
    join app.teams away on away.id = f.away_team_id
    where g.status in ('locked', 'live', 'provisional', 'finalizing')
    order by f.kickoff_at;
    ```

    `still not_started` / `still live_...` hours after kickoff (a warning
    3 h past its due end, a failure 6 h past it): check the match at the
    provider (SportsMonks). If it did finish there, the stored row is stale:
    the live refresh stops asking about a match it has not seen start 3 h
    after its kickoff, and the Fantasy season orchestrator's fixture refresh
    (which reads the whole season) has not corrected it yet. Read that run's
    "Provider refresh" line (and `provider_refresh` here), then dispatch the
    orchestrator and watch the row change. If SportsMonks itself still shows
    it unfinished, the fault is theirs to fix.
    `postponed` / `cancelled` / `abandoned` after the lock, or moved past the
    gameweek's window: this only ever warns. Nothing automatic takes a frozen
    assignment out of a gameweek (the calendar sync and the lock only defer
    unfrozen ones; `docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md`,
    "Postponed fixtures"), and there is no tool for it yet, so a failure would
    page every hour with nothing to run. What the gameweek does with that
    match (wait for it, or take it out with a recorded resolution such as
    `operator_deferred`) is the owner's decision, applied through a reviewed,
    guarded script, never by editing rows in the SQL editor. The gameweek
    still reaches GitHub once its window has ended (`fantasy_points`).

  - `fantasy_scoring`, every match final with its statistics: the detail
    names the stage. It warns an hour after the last statistics were
    certified (`statistics complete for N h, no final points yet ... fails at
HH:MM UTC`): only a Fantasy season orchestrator run scores, so dispatch
    one, as after any manual ingest. It fails 8 h after the certification.
    `still live` or `still locked`: the lifecycle has not moved the gameweek
    to scoring (read `app_private.fantasy_lifecycle_heartbeat.last_error`, and
    look for a counted match without `finalized_at`). `no scoring run has
stored anything`, `scoring started, not finished` or `finalization not
finished` after an orchestrator run: its worker stopped; the run's evidence
    has the code (`workers[].code`). What is stored:
    `select calculation_version, players_persisted, sealed_at, created_at from app_private.fantasy_scoring_snapshots where gameweek_id = '<id>';`
  - `news_sitemap`: the snapshot's state, the refresh job's recent runs and
    how to refresh or pause it are in
    [NEWS_OPERATIONS_RUNBOOK.md → Sitemap](../backend/NEWS_OPERATIONS_RUNBOOK.md#sitemap).
  - `cron_jobs`: `select jobname, status, return_message, start_time from
cron.job_run_details join cron.job using (jobid) where status = 'failed'
order by start_time desc limit 20;`
  - `live_scores`: `docs/backend/EMAIL_NOTIFICATIONS.md` (live refresh).
  - `page_*` / `public_api`: Supabase dashboard → Reports → API and Database
    (CPU).
  - `release_drift`: publish `main` from Lovable
    (`docs/operations/DEPLOYMENT.md`).
  - `database_health`, `watchdog_config`: the watchdog could not read the
    database's checks, or its settings on the `production-admin-activation`
    environment are incomplete; the row says which.

- `[ops] News licensed import is failing`: read the run log. An interrupted
  import can be started again; stories already present are skipped.
