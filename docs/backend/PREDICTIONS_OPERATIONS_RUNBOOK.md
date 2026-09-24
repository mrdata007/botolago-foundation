# Pronostics — operations runbook

How to run Pronostics (score predictions, BG-0146) in a database: switch it on
and off, watch the scoring job, and fix a match by hand. The design is in
[PREDICTIONS_DOMAIN_PLAN.md](PREDICTIONS_DOMAIN_PLAN.md).

Everything below is run in the SQL editor as `postgres`. The operator functions
are callable by no app role. Each change is logged in
`app_private.prediction_job_runs` with its reason.

Production writes follow `CLAUDE.md`: the owner authorises each one, dry-run
first, and `AGENTS.md`'s one-writer-at-a-time check comes before every write.

## The pieces

| Piece                                    | What it is                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_private.prediction_settings`        | One row. `mode` (`off` / `testers` / `public`), `scoring_enabled`, `tester_user_ids`, `competition_id` (null = the most recent current season). |
| `predictions-score-tick`                 | pg_cron job, every 5 minutes: `select app_private.predictions_score_tick();`. Writes nothing while `mode = off` or scoring is paused.           |
| `predictions-history-prune`              | pg_cron job, 03:53 UTC daily: drops tick history older than 7 days and job-run rows older than 90 days.                                         |
| `app_private.prediction_fixture_scoring` | What was last scored per match. The job re-scores a match whenever its facts differ from this row.                                              |
| `app_private.prediction_job_runs`        | One row per pass that did something, per failed pass, and per operator action.                                                                  |

The job writes `app.predictions` (the points columns only),
`app.prediction_standings`, `app_private.prediction_fixture_scoring` and
`app_private.prediction_job_runs`. It never writes `app.fixtures`. Before any
other write to those tables, pause scoring (below) and restore it afterwards.

## One read for everything

```sql
select jsonb_pretty(app_private.predictions_status());
```

It returns the switch, whether the job is active, each journée of the current
season (matches, scored, void, players, predictions), matches stuck at full time
without the final flag for more than 6 hours (`waitingForFinal`), and the last
10 runs.

## The switch

```sql
-- Off: every function refuses or answers "off", the job idles, data is kept.
select app_private.predictions_configure('off');

-- Testers only (Stage 3: the owner's account alone).
select app_private.predictions_configure('testers', true,
  array[(select id from auth.users where email = '<owner email>')]);

-- Everyone.
select app_private.predictions_configure('public');
```

Arguments left null keep their current value, except the mode, which is always
required.

## Pause and resume scoring only

The game stays open; nothing is scored until scoring resumes. Matches that
became final in the meantime are scored on the first run after.

```sql
select app_private.predictions_configure((select mode from app_private.prediction_settings), false);
select app_private.predictions_configure((select mode from app_private.prediction_settings), true);
```

## Fixing a match

```sql
-- Void a match for Pronostics (walkover, awarded result, never played).
-- Every prediction on it scores 0 and counts as void. Applied on the next run.
select app_private.predictions_void_fixture('<fixture id>', '<reason, 8 to 500 characters>');

-- Reverse it. The match is scored again from its own result.
select app_private.predictions_unvoid_fixture('<fixture id>', '<reason>');

-- Score a match again on the next run, with the current rule.
select app_private.predictions_rescore_fixture('<fixture id>', '<reason>');
```

A provider correction needs nothing: when a final score changes, the next run
re-scores the match, rebuilds the standings of everyone who predicted it, and
the journée page shows "Résultat corrigé".

A cancelled or abandoned match is void automatically. A postponed match is never
scored while postponed, whatever score the provider stores (FAR Rabat – Raja
carried 0–0 on 24 Sept 2026). When it is played, it is scored like any other.

## After a ban or an account deletion

The public rankings leave banned and deleted players out at once. Their saved
rank numbers close up at the next run that touches that journée or season. To
close them up now, re-score any final match of the journée concerned:

```sql
select app_private.predictions_rescore_fixture('<fixture id>', 'Re-rank after moderation.');
```

## Watching the job

```sql
-- Recent passes and operator actions.
select id, kind, started_at, outcome, fixtures_processed, predictions_updated,
  standings_updated, error, reason, detail
from app_private.prediction_job_runs
order by id desc
limit 20;

-- What pg_cron recorded.
select start_time, status, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'predictions-score-tick')
order by start_time desc
limit 10;
```

A pass that fails is rolled back as a whole and logged with `outcome = failed`
and its error; the next run retries from the same state. If failures repeat,
pause scoring, read the error, and fix the cause before resuming.

A match appears in `waitingForFinal` when the provider reported full time but
`finalized_at` was never set. It is not scored until it is. With the live
refresh on (`docs/production/APPLIED_2026_09_24_LIVE_REFRESH_ON.md`), matches
are finalized shortly after the whistle.

## Rollout

| Stage                                                | Switch                          | Build flags                                 |
| ---------------------------------------------------- | ------------------------------- | ------------------------------------------- |
| 1. Local                                             | –                               | –                                           |
| 2. Staging rehearsal on a synthetic "2089/90" season | `testers`                       | `PRONOSTICS_ENABLED`                        |
| 3. Production, owner only                            | `testers` = the owner's account | `PRONOSTICS_ENABLED`                        |
| 4. Small public launch                               | `public`                        | `PRONOSTICS_ENABLED`                        |
| 5. Everyone                                          | `public`                        | `PRONOSTICS_ENABLED`, `PRONOSTICS_PROMOTED` |

Before Stage 4: the Arabic reviewed by the owner, and Plausible, the
`ANALYTICS_ENABLED` build and the privacy-policy update live together.

## Switching on audience measurement

`ANALYTICS_ENABLED` (`src/lib/feature-flags.ts`) loads Plausible's script and
switches the privacy policy's lines about it, in French and Arabic, in the
same build. It is off. Before a pull request turns it on:

1. In Plausible: add the site `botolago.com`, reporting time zone
   Africa/Casablanca.
2. Site settings → Shields → Hostnames: allow `botolago.com` and
   `www.botolago.com` only, so preview deployments are not counted.
3. Add the five events as goals: `pronostics_guest_start`,
   `pronostics_guest_start_returning`, `pronostics_guest_complete`,
   `pronostics_signup_click`, `pronostics_share`.
4. Compare the install snippet Plausible shows with `src/lib/analytics.ts`: the
   code uses the "manual" script (`script.manual.js`, `data-domain`) and sends
   page views itself, so that an address is cleaned before it leaves the phone
   (no `#…`, no query but `utm_*`, no league id, no staff page). If Plausible
   now offers only a different snippet, the code changes to match it, keeping
   that cleaning.
5. The owner approves the policy wording (processor row and the cookies
   section, which also says a visitor's predictions stay on the phone; both
   languages), and the policy gets a new version and date: its section 12
   promises 7 days' notice of a substantial change, and naming a new processor
   is one. The same switch changes all of it, so version 1.1 never changes
   silently.

After the deploy: open the site, check in Plausible that the visit and a test
event arrive, and that the browser holds no cookie and no storage entry from
the tool. Signed-in players are measured from the database (plan §11), so the
five events are the only ones the page sends.

## Applying to production

Not yet applied. Rules for when it is:

- Not while Fantasy gameweek 1 is being locked and scored: it is that
  pipeline's first real run and it needs a quiet database.
- `20260925090500_fantasy_league_page_skip_empty.sql` (the only change to an
  existing Fantasy function) goes only after Fantasy gameweek 1 has been scored.
- Through a guarded apply script the owner runs, rehearsed ending in
  `rollback`, then run with `commit` on the owner's go-ahead, and recorded in
  `docs/production/APPLIED_<date>_PREDICTIONS.md`, as
  `RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md` describes. The scripts:
  - `scripts/backend/apply-20260925090000-predictions.sql`: parts 1 to 5,
    installed switched off. It checks what it builds on (football, profiles,
    Fantasy leagues, the account bans of `20260924160000`, pg_cron), records
    each file and runs it only once its sha256 matches the repository, then
    checks tables, row security, grants, both jobs and a visitor's read.
  - `scripts/backend/apply-20260925090500-fantasy-league-page-skip-empty.sql`:
    part 6, later. It refuses to run before parts 1 to 5, before Fantasy
    gameweek 1 is finalized, or on a league page other than the one production
    held on 2026-09-24.
  - `scripts/backend/apply-predictions-scripts.test.ts` fails if a migration
    changes after its script was built. Both were rehearsed on a local
    database built like production (every migration up to `20260924190100`):
    rehearsal saved nothing, the real run passed its checks, a second run was
    refused.
- The migrations leave `mode = off`: nothing is visible and the job idles
  until the switch is set.
- Avoid the Fantasy orchestrator's hourly slot (minute 12).

## Rolling back

`select app_private.predictions_configure('off');` stops everything at once and
keeps the data. The build flags can then be turned off in the next deploy.
Removing the feature is a forward migration dropping the new objects; nothing
existing depends on them.
