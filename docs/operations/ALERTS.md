# Production alerts

What pages whom, why, and what to do. Added 2026-09-24 after an audit found
that the only escalation channel was a red GitHub run nobody watched: two
failed season-orchestrator runs, a gameweek left open six hours past its
deadline and live scores switched off on a match day all went unnoticed.
Since 2026-09-25 a finished match without statistics and a gameweek without
final points page too, once they are past their allowance, instead of
waiting behind green runs.

## Channels

| Channel                                                                                                      | Fires on                                                                                                                                                                    | Latency                                                                                                                           | Needs                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GitHub issue labelled `ops-alert` (mentions `@mrdata007`, so GitHub e-mails and notifies the app)            | a red **Fantasy season orchestrator** run ([below](#a-red-season-orchestrator-run)); a failed **News licensed import** run; a row that fails in the **Production watchdog** | immediate for the two jobs (their last step); the watchdog runs every 30 min, after every orchestrator run on `main`, and by hand | nothing: uses the run's own `GITHUB_TOKEN`                                                                             |
| Webhook message (Discord, Slack or any JSON endpoint) from the database                                      | the database's own checks turning to `fail`, a different set of them failing, still failing an hour later, and once on recovery                                             | at most 5 minutes (pg_cron, independent of GitHub)                                                                                | the owner stores a webhook URL in Vault and switches it on ([below](#the-webhook-switch-it-on-test-it-pause-it-owner)) |
| Email to the owner's inbox from the database (Edge Function `ops-alert-email`, the site's own Resend sender) | the same moments as the webhook, through the same tick                                                                                                                      | at most 5 minutes (pg_cron, independent of GitHub)                                                                                | the owner stores the address and switches it on ([below](#switching-email-alerts-on-owner-once))                       |

One issue per job, titled `[ops] <job> is failing`: `Fantasy season
orchestrator`, `News licensed import`, and `Production health` for the
watchdog. A repeated failure comments on the open issue; the next green run
comments "Recovered" and closes it. One incident can therefore hold two issues
open: a red orchestrator run opens its own, and the watchdog that runs after it
fails its `season_orchestrator` row and opens `Production health`. Each closes
on its own job's next green run.

The webhook and the email send one message per incident, repeat hourly while
it lasts, and say `RECOVERED` once. A message counts as sent only once its
channel answers with success (2xx); one that gets any other answer, times out
or gets no answer is sent again at the next tick, 5 minutes later, until the
channel takes it. Each channel is tracked on its own, so a broken webhook
does not hold back the email, nor the reverse (since migration
`20260926113000`; before it, a failed message still counted as sent and the
alerts stayed quiet for an hour). Warnings never send. They see the
database's checks only: the watchdog's own rows (`fantasy_points`,
`season_orchestrator`, the pages, `release_drift`) reach you through GitHub
alone.

Every alert carries the environment, the job or check, the time (UTC), an
error category, the run id and link (GitHub) and a one-line reason. None
carries a credential, a user, an e-mail address or a payload: the categories
come from the jobs' sanitised evidence (verdicts and codes) and from the
database's own check names.

## The database's checks (`api.service_ops_health`)

The watchdog reports each check under the database's own name, and so does
the webhook message. A check a later migration adds is reported with no
watchdog change; a status other than `ok`, `warn` or `fail` fails. The
report itself must hold together, or `database_health` fails on top of the
checks it did state: every check the database always emits present (the
nine in `REQUIRED_DATABASE_CHECKS`; a check a migration adds joins them
once production has it), each entry named and with a detail, and an
overall verdict that agrees with the checks.

| Check                      | Fails when                                                                                                                                                                                                                                                                                                                                           | Warns when                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fantasy_lifecycle_tick`   | the tick is on but has not run for 15 min, or failed 3 times in a row                                                                                                                                                                                                                                                                                | it is switched off, or failed once or twice                                                                                                                                                                                                                                                                                             |
| `fantasy_gameweek_lock`    | an open gameweek is 30+ min past its deadline                                                                                                                                                                                                                                                                                                        |                                                                                                                                                                                                                                                                                                                                         |
| `fantasy_deadline_watch`   | a scheduled/open gameweek is within 24 h of its deadline while a counting fixture still has a placeholder kickoff, or it has no counting fixture left                                                                                                                                                                                                | the watch itself errors                                                                                                                                                                                                                                                                                                                 |
| `fantasy_gameweek_clubs`   | a scheduled or open gameweek within 24 h of its deadline holds a club twice among its counted matches (below)                                                                                                                                                                                                                                        | the same, further from its deadline                                                                                                                                                                                                                                                                                                     |
| `fantasy_fixture_coverage` | a finished match that counts for Fantasy points still has no certified player statistics 12 h after the final whistle                                                                                                                                                                                                                                | the same, 6 h after the final whistle                                                                                                                                                                                                                                                                                                   |
| `fantasy_scoring`          | a counted match of a locked gameweek still not finished 48 h after the kickoff it was frozen with, whatever holds it, when the rules stop keeping it (below); one still not started, live, suspended or delayed 6 h after its due end; or every counted match final and certified, the gameweek still not finalized 8 h after the last certification | one postponed, cancelled or abandoned after the lock, or moved too late to be completed within those 48 h, from the start, saying until when the rules keep it; one not started, live, suspended or delayed 3 h past its due end; every match final for 6 h but one lacks statistics; points not final 1 h after the last certification |
| `cron_jobs`                | any pg_cron job failed in the last hour                                                                                                                                                                                                                                                                                                              |                                                                                                                                                                                                                                                                                                                                         |
| `news_publication`         | the every-minute publication job has not run for 10 min                                                                                                                                                                                                                                                                                              |                                                                                                                                                                                                                                                                                                                                         |
| `news_sitemap`             | the sitemap snapshot is missing or 10+ min old (refresh job paused or failing)                                                                                                                                                                                                                                                                       | snapshot 2+ min old (sitemap computed live), or a refresh took 1.5 s+                                                                                                                                                                                                                                                                   |
| `news_import`              |                                                                                                                                                                                                                                                                                                                                                      | an import run failed in the last 24 h                                                                                                                                                                                                                                                                                                   |
| `live_scores`              | live refresh is on but no fixture refresh for 10 min while a match is in play                                                                                                                                                                                                                                                                        | live refresh is off while a match is in play or kicks off within 6 h                                                                                                                                                                                                                                                                    |
| `provider_refresh`         | 3+ failed fixture refreshes in 6 h; with the live refresh switched on, no successful season-wide fixture refresh (a week or more, reaching today: the hourly season refresh of migration `20260926113100`, or the orchestrator's) for 4 h, counted from when the hourly refresh started or was switched back on                                      | the same after 2 h; with the live refresh switched off, no successful fixture refresh for 12 h                                                                                                                                                                                                                                          |
| `email_delivery`           | email is on but its tick stalled for 15 min                                                                                                                                                                                                                                                                                                          | undelivered emails are waiting                                                                                                                                                                                                                                                                                                          |
| `browser_errors`           | never (see below)                                                                                                                                                                                                                                                                                                                                    | 25+ unhandled errors reported by visitors' browsers this hour and the last                                                                                                                                                                                                                                                              |

`fantasy_gameweek_clubs`, `fantasy_fixture_coverage` and `fantasy_scoring`
(migration 20260926003400) watch the current Fantasy season
(`registration_open` or `active`) and the matches that count for its points. "Final whistle" is `app.fixtures.finalized_at`
(kickoff + 2 h when a finished row has none). Complete statistics means what
the scoring worker requires: a row in
`app_private.historical_performance_fixture_coverage` with
`scoring_statistics_complete` and `reconciled`; "certified at" is when its
current statistics version was stored (the active
`app.player_fixture_performances` rows of that version), not when the coverage
row was created or last touched. No scoring rows means no points yet, never
zero points. A gameweek with a match still to finish is in play, and not late,
as long as that match can still finish on its own: its kickoff is ahead or its
due end (kickoff + 2 h) is under 3 h ago, and its 48 h are not over. The
lifecycle moves a gameweek to scoring only once every counted match is
finished, and nothing automatic moves a match out of a locked gameweek. The
ruleset keeps every counted match in its gameweek for 48 h after the kickoff it
was frozen with: "A fixture completed within 48 hours of its original
assignment remains in that gameweek"
([FANTASY_RULES_V1.md](../backend/FANTASY_RULES_V1.md#exceptional-fixtures-and-corrections);
the season ruleset's `post_lock_completion_window_hours`), and the gameweek
waits for it that long. So a match that cannot finish holds the gameweek:

- one postponed, cancelled or abandoned after the lock, or moved to a kickoff
  too late for it to be completed within those 48 h (its new kickoff + 2 h
  past them; a match moved to a time it can still be completed in is simply
  still to be played): the check warns at once, naming the match, the time
  the rules stop keeping it and
  `scripts/backend/resolve-fantasy-postponed-assignment.sql`;
- one stuck unfinished (not started, live, suspended, delayed) is a row that
  stopped following the match, or a provider fault, and a provider refresh can
  correct the first: the check warns 3 h and fails 6 h past its due end, the
  earlier signal, still naming the time the rules stop keeping it;
- any of them still not finished once the 48 h are over, whatever holds it:
  the check fails, saying it was not completed within the 48 h the rules
  allow, and names that file, which can take the match out from that moment
  (below). Where the file cannot free the gameweek, the check says a developer
  is needed instead: the match is the gameweek's last counted match, or every
  counted match of the gameweek is past its 48 h, and the tool refuses a
  gameweek's last counted match (`fantasy_gameweek_needs_a_fixture`), while
  nothing cancels a gameweek yet.

The gameweek's lateness also reaches GitHub, through the watchdog's
`fantasy_points` and the orchestrator's `fantasy_points_overdue`, once its
window has ended: they do not know the 48 h, so they can page while the rules
still keep the match, and the answer then is to wait.

`fantasy_gameweek_clubs` looks ahead instead: a gameweek not locked yet
(`scheduled` or `open`) whose counted matches hold a club twice. The
next-gameweek opening takes one match per club and refuses such a gameweek
(`fantasy_next_calendar_incomplete`), on the day, and an open one would lock
with that club playing twice, a double gameweek nobody decided. It happens when
SportsMonks moves a match into a round whose gameweek is already staged, for
instance a match taken out of a locked gameweek with the file above and
rescheduled. The check warns at once, naming the gameweek, the club and its
matches, and fails within 24 h of the gameweek's deadline. No tool takes a
match out of a gameweek that has not locked: tell the developers (below).

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
competitions running, the three checks name the gameweek with its season
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
| `season_orchestrator`                                       | no orchestrator run on `main` for 8 h, or none at all; its last completed run concluded `failure`, `timed_out` or `startup_failure`; its run history is not a list of runs, or its latest run's time cannot be read or lies over 10 min ahead                                                                                                                                                                                                             | its last completed run ended any other way but `success` (`cancelled`, `skipped`, ...); GitHub's run history cannot be read                                    |
| `page_home`, `page_matches`, `page_news`, `page_sitemapxml` | the page answers anything but 200, or nothing; the sitemap also when its body has no `<loc>` entry                                                                                                                                                                                                                                                                                                                                                        | the answer took over 8 s                                                                                                                                       |
| `public_api`                                                | `news_feed` answers anything but 200                                                                                                                                                                                                                                                                                                                                                                                                                      | the answer took over 8 s                                                                                                                                       |
| `release_drift`                                             | `main` has had changes unpublished for 72 h                                                                                                                                                                                                                                                                                                                                                                                                               | unpublished for 24 h; the live site runs commits `main` does not have; the site reports no release, or one GitHub does not know; the comparison is unavailable |
| `watchdog_schedule`                                         | never                                                                                                                                                                                                                                                                                                                                                                                                                                                     | GitHub has not started the watchdog's own 30-minute schedule for 2 h, or never has; its run history cannot be read                                             |
| `database_health`                                           | the health RPC answers anything but 200 with JSON, or returns no checks; or its report is broken: a check it always emits is missing (`REQUIRED_DATABASE_CHECKS`), an entry has no valid name or no detail, it gives no overall verdict, or its verdict disagrees with its checks (the checks it did state are still listed)                                                                                                                              | `api.service_ops_health` is not installed                                                                                                                      |
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

## Switching email alerts on (owner, once)

Added 2026-09-25 (`20260926001000_ops_alert_email`). That day both channels
above fired and neither reached the owner: issue #218 mentioned `@mrdata007`
and Slack answered `ok` to a test, but nothing arrived where the owner looks.
Email goes to the one address stored in the database, through the same Resend
key and sender as the site's other emails (`RESEND_API_KEY` in Edge Function
secrets), and the Edge Function never takes a recipient from its caller.

1. Deploy the Edge Function `ops-alert-email` (`verify_jwt = false`, like
   `notification-email-dispatch`; `supabase/config.toml`).
2. Supabase dashboard → BotolaGO Production V2 → SQL Editor → run:

   ```sql
   select app_private.ops_alert_configure_email('<your address>');
   select app_private.ops_alert_configure(true);
   select app_private.ops_alert_test();  -- one TEST email (and webhook message) now
   ```

3. Check the test was accepted: `select status_code, content from net._http_response
where id = <emailRequestId from the test>;` answers `200` with `"sent":true`.
   `503 email_provider_not_configured` means `RESEND_API_KEY` is missing from
   the Edge Function secrets. Then confirm the email is in the inbox.
4. To stop emailing: `select app_private.ops_alert_configure_email(null);`

`app_private.ops_alert_test()` works any time and leaves the alert state
alone, so the next real incident is still announced.

The checks migration 20260926003400 adds (`fantasy_gameweek_clubs`,
`fantasy_fixture_coverage`, `fantasy_scoring`) reach the email as they reach
the webhook: both are sent by the same `app_private.ops_alert_tick()`, which
reads every check of `app_private.ops_health_checks()`.

## The webhook: switch it on, test it, pause it (owner)

Everything below runs in Supabase dashboard → BotolaGO Production V2 → SQL
Editor. Only the database owner can run these functions; nothing else can
switch alerts or send a test.

On 2026-09-25 production read `enabled = true` with a webhook stored in Vault
at 10:02 UTC, and again at 14:53, with `repeat_after` 1 h and nothing sent
yet (`last_sent_at` empty). (When it was switched on is not recorded:
`ops_alert_state.updated_at` is rewritten by every tick.) So on production
there is nothing to switch on: step 3 alone confirms that messages arrive. The
test message it sends is available there: the alert-email change (migration
`20260926001000`, which adds `ops_alert_test()`) is applied on production,
recorded in its migration history and the function present (read on
2026-09-25). Steps 1, 2 and 4 are for a new or replaced destination.

It ships switched off (migration `20260924200200`). It and the email are the
channels that do not depend on GitHub's scheduler.

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

3. Send a test message. `app_private.ops_alert_test()` (migration
   `20260926001000`, applied on production) sends one message marked TEST
   through every configured channel, the webhook and the email alike, whether
   alerts are on or off, and changes nothing else (not the switch, not the
   current incident). It refuses (`ops_alert_channel_missing`) when neither a
   webhook nor an email address is set:

   ```sql
   select app_private.ops_alert_test();
   ```

   Its result holds the pg_net request id of each message it queued,
   `webhookRequestId` and `emailRequestId`; a few seconds later, read the
   webhook's answer:

   ```sql
   select status_code, timed_out, error_msg from net._http_response where id = <webhookRequestId>;
   ```

   Discord answers `204`, Slack `200`. No row yet means pg_net has not sent it
   (wait a few seconds). `error_msg` or a `4xx` means the URL is wrong or was
   revoked: repeat step 2 with a fresh one. The email's answer is read the
   same way with `emailRequestId` ([Switching email alerts on](#switching-email-alerts-on-owner-once),
   step 3).

   A real alert's answer is the `net._http_response` row whose id is
   `last_request_id` in `app_private.ops_alert_state`. The GitHub path is
   proven at any time by a watchdog run with `simulate_failure` (below), which
   never reaches the webhook.

4. Switch alerts on. It refuses when there is nothing to send through: no
   Vault secret and no email address:

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

Each tick first reads the answer to every message still waiting for one
(`net._http_response`). A 2xx answer confirms it. Anything else (an error
code, a timeout, no answer 3 minutes after it left) means it did not arrive:
the tick forgets it and sends again to that channel alone, so a failure or a
recovery is never lost to one bad answer. A channel that keeps failing is
tried every 5 minutes for as long as the incident lasts.

What it last did (`last_sent_at` is when the last message a channel
confirmed was sent):

```sql
select enabled, last_status, last_sent_at from app_private.ops_alert_state;
```

What each channel last confirmed, and why its last message failed if it did
(`http_404`, `http_503`, `timed_out`, `unreachable`, `no_answer`):

```sql
select channel, delivered_status, delivered_at, pending_request_id,
  last_outcome, last_outcome_at, failures_in_a_row
from app_private.ops_alert_channels;
```

`failures_in_a_row` above 0 means the owner has not heard the latest news
on that channel. For the email, `http_503` is usually
`email_provider_not_configured` (the Resend key is missing from the Edge
Function secrets). The failed answer itself is the `net._http_response` row
whose id is `last_email_request_id` (or `last_request_id` for the webhook)
in `app_private.ops_alert_state`, read as in step 3 above.

Testing the GitHub and webhook channels once, making sure the `@mrdata007`
mention reaches you, and the optional settings are the owner's checklist in
[FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md → Paging](../backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md#paging-what-runs-and-what-the-owner-must-set);
the email is tested in [its own section](#switching-email-alerts-on-owner-once).
A watchdog run with `simulate_failure` tests the GitHub path only: it adds a
watchdog row, and the webhook and the email never see those.

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

  - `fantasy_scoring` naming a counted match of a locked gameweek that has
    not finished: the gameweek waits for it. Which ones, and what state they
    are in:

    ```sql
    select s.name as season, g.sequence_number as gameweek, g.status as gameweek_status,
      f.id as fixture_id, home.short_name || ' v ' || away.short_name as match,
      f.status as fixture_status, f.kickoff_at, a.assigned_kickoff_at,
      a.assigned_kickoff_at + interval '48 hours' as rules_keep_it_until,
      f.provider_updated_at, a.assignment_status, a.frozen_at
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

    The ruleset
    ([FANTASY_RULES_V1.md → Exceptional fixtures and corrections](../backend/FANTASY_RULES_V1.md#exceptional-fixtures-and-corrections))
    says "A fixture completed within 48 hours of its original assignment
    remains in that gameweek; later completion moves to a controlled future
    assignment." So for 48 h after the kickoff a match was frozen with, it
    stays in its gameweek and the answer is to wait for it; after that, if it
    has not finished, whatever held it, the owner takes it out. By what the
    detail says:
    - A match `still not_started`, `still live_...` or `still suspended`
      hours after its kickoff, whose points "wait until it finishes" (a
      warning 3 h past its due end, a failure 6 h past it, well before the
      48 h): check the match at the provider (SportsMonks). If it did finish
      there, the stored row is stale: the live refresh stops asking about a
      match it has not seen start 3 h after its kickoff, and the Fantasy
      season orchestrator's fixture refresh (which reads the whole season)
      has not corrected it yet. Read that run's "Provider refresh" line (and
      `provider_refresh` here), then dispatch the orchestrator and watch the
      row change. If SportsMonks itself still shows it unfinished, the fault
      is theirs to fix, and the detail says from when the rules let the owner
      take the match out.
    - A match `postponed`, `cancelled` or `abandoned` after the lock, or
      moved to a kickoff "too late to be completed within 48 h": a warning
      from the start, saying until when the rules keep the match. Wait:
      completed by then, the match counts and the check clears. A match
      moved to a time at which it can still be completed in the 48 h is not
      reported as moved: it is still to be played, and is reported like any
      other match if it has not finished 3 h after its new due end, or when
      the 48 h end.
    - "Not completed within the 48 h the rules allow: take it out with
      `scripts/backend/resolve-fantasy-postponed-assignment.sql`": a
      failure, paging hourly, whatever state the match was left in. Nothing
      automatic takes a frozen assignment out of a gameweek (the calendar
      sync and the lock only defer unfrozen ones), so the owner does, with
      that file. It lists the held matches with their assignment ids and,
      for each, from when it can be taken out, with nothing paused; then,
      with the Fantasy tick paused, it dry-runs
      `app_private.fantasy_resolve_frozen_assignment` on the one you name,
      and saves only once you switch `dry_run` off. The tool refuses every
      match whose 48 h are not over (`fantasy_postponement_window_open`, with
      the time they end). Never edit the rows by hand. Taken out, the match's
      players score nothing from it (the bench and the vice-captain step in),
      and **the match counts for no gameweek**: the ruleset's "controlled
      future assignment" does not exist yet, because a later gameweek would
      then hold a club twice and the game has no double gameweeks. That gap
      needs an owner decision and future work; see
      [FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md → After the lock](../backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md#after-the-lock-since-migration-20260926003500).
      Then switch the tick back on and dispatch the orchestrator, as after a
      manual ingest: the gameweek goes to scoring once its other matches are
      final.
    - "It is the gameweek's last counted match", or "nor was any other
      counted match of the gameweek", and "a developer is needed": the file
      cannot help. The tool refuses a gameweek's last counted match
      (`fantasy_gameweek_needs_a_fixture`: with none left the gameweek could
      never be scored), and nothing cancels a gameweek yet, so taking out all
      but one would change nothing. Tell the developers: there is no tool yet
      for a gameweek whose every match was called off. For a gameweek's last
      counted match the warning before the 48 h already says so.

  - `fantasy_gameweek_clubs`: a gameweek not locked yet holds a club twice
    among its counted matches, so it cannot open (a `scheduled` one: the
    next-gameweek opening refuses it with `fantasy_next_calendar_incomplete`)
    or would lock with that club playing twice (an `open` one). The detail
    names the gameweek, the first club and its matches. Which ones:

    ```sql
    select g.sequence_number as gameweek, g.status, g.deadline_at, club.short_name as club,
      string_agg(home.short_name || ' v ' || away.short_name || ' (' || f.id || ')', ', '
        order by f.kickoff_at) as matches
    from app.fantasy_gameweeks g
    join app.fantasy_seasons s on s.id = g.fantasy_season_id and s.status in ('registration_open', 'active')
    join app.fantasy_fixture_assignments a on a.gameweek_id = g.id
      and a.superseded_at is null and a.counts_points
    join app.fixtures f on f.id = a.fixture_id
    join app.teams home on home.id = f.home_team_id
    join app.teams away on away.id = f.away_team_id
    cross join lateral (values (f.home_team_id), (f.away_team_id)) side(team_id)
    join app.teams club on club.id = side.team_id
    where g.status in ('scheduled', 'open')
    group by g.id, g.sequence_number, g.status, g.deadline_at, club.id, club.short_name
    having count(distinct f.id) > 1
    order by g.deadline_at, club.short_name;
    ```

    It happens when SportsMonks moves a match into a round whose gameweek is
    already staged: the calendar sync assigns it there, beside the club's own
    match of that round. Check the round at SportsMonks first: when the
    provider moves the match again, the next sync puts it right. Otherwise no
    tool takes a match out of a gameweek that has not locked, and the game
    has no double gameweeks: an owner's decision and a developer are needed,
    before the deadline (the check fails within 24 h of it). See
    [FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md → After the lock](../backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md#after-the-lock-since-migration-20260926003500).

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
  - `provider_refresh` "no season-wide fixture refresh for N h": the hourly
    season refresh is not landing, so kickoff changes and postponements are
    not reaching the app or the Fantasy calendar. "last called" in the detail
    says whether the database is calling: `never` or hours ago means the
    `football-season-refresh` job or its switch; a recent call means the Edge
    Function refused or failed it (Supabase dashboard → Edge Functions →
    football-live-refresh → Logs; a 400 is a function deployed before the
    `season_fixtures` job, so deploy it again). Dispatch the Fantasy season
    orchestrator meanwhile: its refresh reads the whole season.
  - `page_*` / `public_api`: Supabase dashboard → Reports → API and Database
    (CPU).
  - `release_drift`: publish `main` from Lovable
    (`docs/operations/DEPLOYMENT.md`).
  - `database_health`, `watchdog_config`: the watchdog could not read the
    database's checks, or its settings on the `production-admin-activation`
    environment are incomplete; the row says which.

- `[ops] News licensed import is failing`: read the run log. An interrupted
  import can be started again; stories already present are skipped.
