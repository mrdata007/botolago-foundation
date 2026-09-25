# Production alerts

What pages whom, why, and what to do. Added 2026-09-24 after an audit found
that the only escalation channel was a red GitHub run nobody watched: two
failed season-orchestrator runs, a gameweek left open six hours past its
deadline and live scores switched off on a match day all went unnoticed.

## Channels

| Channel                                                                                           | Fires on                                                                                                          | Latency                                                                                       | Needs                                                              |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| GitHub issue labelled `ops-alert` (mentions `@mrdata007`, so GitHub e-mails and notifies the app) | a failed **Fantasy season orchestrator** or **News licensed import** run; a failing **Production watchdog** check | immediate for the two jobs; the watchdog is scheduled every 30 min (GitHub may start it late) | nothing: uses the run's own `GITHUB_TOKEN`                         |
| Webhook message (Discord, Slack or any JSON endpoint) from the database                           | production health turning to `fail`, still failing an hour later, and once on recovery                            | at most 5 minutes (pg_cron, independent of GitHub)                                            | the owner stores a webhook URL in Vault and switches it on (below) |

One issue per job: a repeated failure comments on the open issue, the next
green run comments "Recovered" and closes it. The webhook sends one message
per incident, repeats hourly while it lasts, and says `RECOVERED` once.

Every alert carries the environment, the job or check, the time (UTC), an
error category, the run id and link (GitHub) and a one-line reason. None
carries a credential, a user, an e-mail address or a payload: the categories
come from the jobs' sanitised evidence (verdicts and codes) and from the
database's own check names.

## The checks (`api.service_ops_health`)

| Check                      | Fails when                                                                                                                                                                            | Warns when                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fantasy_lifecycle_tick`   | the tick is on but has not run for 15 min, or failed 3 times in a row                                                                                                                 | it is switched off, or failed once or twice                                                                                                            |
| `fantasy_gameweek_lock`    | an open gameweek is 30+ min past its deadline                                                                                                                                         |                                                                                                                                                        |
| `fantasy_deadline_watch`   | a scheduled/open gameweek is within 24 h of a deadline derived from a placeholder kickoff, or has no playable fixture                                                                 | the watch itself errors                                                                                                                                |
| `fantasy_fixture_coverage` | a finished match that counts for Fantasy points still has no certified player statistics 6 h after the final whistle                                                                  | the same, 3 h after the final whistle                                                                                                                  |
| `fantasy_scoring`          | a counted match of a locked gameweek still unfinished 6 h after its due end (below); or every counted match final for 6 h, statistics certified for 1 h, gameweek still not finalized | such a match 3 h past its due end, or at once when postponed, cancelled, abandoned or moved past the window; or 6 h final but a match lacks statistics |
| `cron_jobs`                | any pg_cron job failed in the last hour                                                                                                                                               |                                                                                                                                                        |
| `news_publication`         | the every-minute publication job has not run for 10 min                                                                                                                               |                                                                                                                                                        |
| `news_sitemap`             | the sitemap snapshot is missing or 10+ min old (refresh job paused or failing)                                                                                                        | snapshot 2+ min old (sitemap computed live), or a refresh took 1.5 s+                                                                                  |
| `news_import`              |                                                                                                                                                                                       | an import run failed in the last 24 h                                                                                                                  |
| `live_scores`              | live refresh is on but no fixture refresh for 10 min while a match is in play                                                                                                         | live refresh is off while a match is in play or kicks off within 6 h                                                                                   |
| `provider_refresh`         | 3+ failed fixture refreshes in 6 h                                                                                                                                                    | no successful fixture refresh for 12 h                                                                                                                 |
| `email_delivery`           | email is on but its tick stalled for 15 min                                                                                                                                           | undelivered emails are waiting                                                                                                                         |
| `browser_errors`           | never (see below)                                                                                                                                                                     | 25+ unhandled errors reported by visitors' browsers this hour and the last                                                                             |

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
out of a locked gameweek, so a counted match postponed, cancelled or abandoned
after the lock, moved to a kickoff past the gameweek's window, or stuck
unfinished (not started, live, suspended) holds the gameweek for good; the
check warns, then fails, and names the match. When statistics are missing,
only the coverage check fails; the scoring check warns, so one cause pages
once. Both exist because the season orchestrator reports missing statistics as
`waiting` and exits 0, so its own GitHub alert stays quiet (audit 2026-09-25
A02/A08: the 1-3 match of 24 September had no statistics for 12 hours and
nothing said so). A season has one gameweek past its lock at a time; with
several Fantasy competitions running, both checks name the gameweek with its
season (`Cup GW1`) and the scoring check reports the most severe, then the
earliest deadline, and counts the others.

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

The watchdog adds `page_home`, `page_matches`, `page_news`, `page_sitemapxml`
and `public_api` (fail on a non-200, warn above 8 s), `season_orchestrator`
(fail when GitHub has not started it for 8 h; warn when its last run failed)
and `release_drift` (the live site's `x-botolago-release` against `main`: warn
after 24 h of unpublished changes, fail after 72 h; `docs/operations/DEPLOYMENT.md`).

## The webhook: switch it on, test it, pause it (owner)

Everything below runs in Supabase dashboard → BotolaGO Production V2 → SQL
Editor. Only the database owner can run these functions; nothing else can
switch alerts or send a test.

On 2026-09-25 at 10:02 UTC production read `enabled = true` with a webhook
stored in Vault. (When it was switched on is not recorded:
`ops_alert_state.updated_at` is rewritten by every tick.) So on production
today, step 3 alone confirms that messages arrive; steps 1, 2 and 4 are for a
new or replaced destination.

1. Create a webhook: Discord → channel → Edit Channel → Integrations →
   Webhooks → New Webhook → Copy Webhook URL (or a Slack incoming webhook).
   The URL must start with `https://`.
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

Test the GitHub path any time: Actions → Production watchdog → Run workflow →
tick "simulate_failure" → Run. An `ops-alert` issue opens; run it again
without the tick and it closes.

## When an alert fires

- `fantasy_gameweek_lock`, `fantasy_lifecycle_tick`: read
  `app_private.fantasy_lifecycle_heartbeat.last_error`; the procedure is in
  `docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md`.
- `Fantasy season orchestrator is failing`: open the run, read the table on
  the run page and the uploaded evidence (`fantasy-season-orchestrator.json`).
- `fantasy_fixture_coverage`: which counted matches lack certified statistics:

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
  (`fantasy-season-orchestrator.json`, `performances.error`): the statistics
  come only from its performance step. Never type statistics in by hand, and
  never read their absence as zero; the procedure is in
  `docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md`.

- `fantasy_scoring`, `counted match ... ; points wait until it finishes or its
Fantasy assignment is resolved`: a counted match of the locked gameweek will
  not finish on its own. Which ones, and what state they are in:

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

  `still not_started` / `still live_...` hours after kickoff: check the match
  at the provider (SportsMonks). If it did finish there, the stored row is
  stale: the live refresh only looks 3 h back, and the Fantasy season
  orchestrator's hourly fixture refresh (which reads the whole season) has not
  corrected it. Read that run's "Provider refresh" line (and
  `provider_refresh` here), then dispatch the orchestrator and watch the row
  change. `postponed` / `cancelled` / `abandoned` after the lock, or `moved to
  ... past the gameweek's window`: nothing automatic takes a frozen
  assignment out of a gameweek (the calendar sync and the lock only defer
  unfrozen ones; `docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md`,
  "Postponed fixtures"), and there is no tool for it yet. What the gameweek
  does with that match (wait for it, or take it out with a recorded
  resolution such as `operator_deferred`) is the owner's decision, applied
  through a reviewed, guarded script, never by editing rows in the SQL editor.

- `fantasy_scoring`, every match final: the detail names the stage. `still
live` or `still locked`: the lifecycle has not moved the gameweek to scoring
  (read `app_private.fantasy_lifecycle_heartbeat.last_error`, and look for a
  counted match without `finalized_at`). `no scoring run has stored anything`,
  `scoring started, not finished` or `finalization not finished`: the
  orchestrator's worker stopped; its run's evidence has the code
  (`workers[].code`). What is stored:
  `select calculation_version, players_persisted, sealed_at, created_at from
app_private.fantasy_scoring_snapshots where gameweek_id = '<id>';`
- `cron_jobs`: `select jobname, status, return_message, start_time from
cron.job_run_details join cron.job using (jobid) where status = 'failed'
order by start_time desc limit 20;`
- `live_scores`: `docs/backend/EMAIL_NOTIFICATIONS.md` (live refresh).
- `page_*` / `public_api`: Supabase dashboard → Reports → API and Database
  (CPU); `docs/audits/2026-09-24-FULL_STACK_PRODUCT_AND_SEARCH_AUDIT.md` P0-2.
