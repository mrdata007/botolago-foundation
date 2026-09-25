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

| Check                    | Fails when                                                                                                            | Warns when                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `fantasy_lifecycle_tick` | the tick is on but has not run for 15 min, or failed 3 times in a row                                                 | it is switched off, or failed once or twice                                |
| `fantasy_gameweek_lock`  | an open gameweek is 30+ min past its deadline                                                                         |                                                                            |
| `fantasy_deadline_watch` | a scheduled/open gameweek is within 24 h of a deadline derived from a placeholder kickoff, or has no playable fixture | the watch itself errors                                                    |
| `cron_jobs`              | any pg_cron job failed in the last hour                                                                               |                                                                            |
| `news_publication`       | the every-minute publication job has not run for 10 min                                                               |                                                                            |
| `news_import`            |                                                                                                                       | an import run failed in the last 24 h                                      |
| `live_scores`            | live refresh is on but no fixture refresh for 10 min while a match is in play                                         | live refresh is off while a match is in play or kicks off within 6 h       |
| `provider_refresh`       | 3+ failed fixture refreshes in 6 h                                                                                    | no successful fixture refresh for 12 h                                     |
| `email_delivery`         | email is on but its tick stalled for 15 min                                                                           | undelivered emails are waiting                                             |
| `browser_errors`         | never (see below)                                                                                                     | 25+ unhandled errors reported by visitors' browsers this hour and the last |

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

## Switching the webhook on (owner, once)

1. Create a webhook: Discord → channel → Edit Channel → Integrations →
   Webhooks → New Webhook → Copy Webhook URL (or a Slack incoming webhook).
2. Supabase dashboard → BotolaGO Production V2 → SQL Editor → run:

   ```sql
   select vault.create_secret('<paste the webhook URL>', 'botolago_ops_alert_webhook');
   select app_private.ops_alert_configure(true);
   ```

3. To pause: `select app_private.ops_alert_configure(false);`

Test the GitHub path any time: Actions → Production watchdog → Run workflow →
tick "simulate_failure" → Run. An `ops-alert` issue opens; run it again
without the tick and it closes.

## When an alert fires

- `fantasy_gameweek_lock`, `fantasy_lifecycle_tick`: read
  `app_private.fantasy_lifecycle_heartbeat.last_error`; the procedure is in
  `docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md`.
- `Fantasy season orchestrator is failing`: open the run, read the table on
  the run page and the uploaded evidence (`fantasy-season-orchestrator.json`).
- `cron_jobs`: `select jobname, status, return_message, start_time from
cron.job_run_details join cron.job using (jobid) where status = 'failed'
order by start_time desc limit 20;`
- `live_scores`: `docs/backend/EMAIL_NOTIFICATIONS.md` (live refresh).
- `page_*` / `public_api`: Supabase dashboard → Reports → API and Database
  (CPU); `docs/audits/2026-09-24-FULL_STACK_PRODUCT_AND_SEARCH_AUDIT.md` P0-2.
