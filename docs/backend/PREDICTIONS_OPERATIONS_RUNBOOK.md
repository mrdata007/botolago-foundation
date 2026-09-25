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

Before Stage 4: the Arabic review, done on 2026-09-25 (the owner handed it
over; 19 texts fixed). Audience measurement is already on (next section).

## Audience measurement (Seline)

On since 2026-09-25. The owner chose Seline in place of Plausible, created the
Seline project for `botolago.com` and asked for its script on every page.
`ANALYTICS_ENABLED` (`src/lib/feature-flags.ts`) loads the script and switches
the privacy policy's lines about it, in French and Arabic, in the same build;
the policy went to version 1.2 (25 September 2026) with it. Section 12 of the
policy promises 7 days' notice of a substantial change. This update was
treated as a small one: version 1.1 already listed audience measurement as a
purpose and usage data as collected, and its processor row said "no tool used
to date"; version 1.2 names the tool, which sets no cookie and keeps no IP.

How it is installed (`src/lib/analytics.ts`, `src/routes/__root.tsx`):

- the snippet Seline gives (`cdn.seline.com/seline.js`, `async`, token
  `041a77dce92a51b`), in the head of every page, production builds only;
- plus `data-auto-page-view="false"`: left on its own, the script sends each
  address whole, query string included, where sign-in codes and unsubscribe
  tokens live. The page sends page views itself instead, each address cleaned
  before it leaves the phone (no `#…`, no query but `utm_*`, a league's id
  replaced by `*`, no staff page);
- plus `data-mask-patterns`, so an event sent from a league's page reports
  `/pronostics/ligues/*` or `/fantasy/leagues/*` rather than the league's id;
- a small stub keeps what the page sends before the script arrives, and the
  script replays it (whichever of the two loads first);
- only `botolago.com` sends anything: a preview deployment or a local
  production build loads the script and stays silent.

The five events, if Seline asks for them by name: `pronostics_guest_start`,
`pronostics_guest_start_returning`, `pronostics_guest_complete`,
`pronostics_signup_click`, `pronostics_share`. Signed-in players are measured
from the database (plan §11), so these are the only events the page sends.

To check after a deploy: open botolago.com, visit a few pages, and see them in
the Seline dashboard; the browser holds no cookie from the tool, and its only
storage entry is `seline:referrer` in the tab's session storage (the script
notes there that the referring site was counted, so a reload does not count
it twice).

To switch it off: `ANALYTICS_ENABLED = false`. The policy then says again that
no tool is used, which is a change of its own: give it a new version and date.

## Applying to production

Parts 1 to 5 applied on 2026-09-25 at 07:33 UTC, switched off
(`docs/production/APPLIED_2026_09_25_PREDICTIONS.md`). They went in without
first pausing the Fantasy tick and the live score refresh, which `AGENTS.md`
asks for; the record says so, and what was measured instead. Part 6 is not
applied yet. The rules, which part 6 still follows:

- Not while Fantasy gameweek 1 is being locked and scored: it is that
  pipeline's first real run and it needs a quiet database.
- `20260925090500_fantasy_league_page_skip_empty.sql` (the only change to an
  existing Fantasy function) goes only after Fantasy gameweek 1 has been scored.
- With the Fantasy lifecycle tick paused for the rehearsal and the run
  (`select app_private.fantasy_automation_configure(false);`), and switched
  back on after (`select app_private.fantasy_automation_configure(true);`).
  Its script refuses while the tick is on. While paused, the operations health
  check shows the tick as a warning; that is expected.
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
    gameweek 1 is finalized, while the Fantasy tick is on, or on a league
    page other than the one production held on 2026-09-24.
  - `scripts/backend/apply-predictions-scripts.test.ts` fails if a migration
    changes after its script was built. Both were rehearsed on a local
    database built like production (every migration up to `20260924190100`):
    rehearsal saved nothing, the real run passed its checks, a second run was
    refused. Part 6's tick check, added on 2026-09-25, was tried on a local
    database set to production's state before part 6 (same migrations, the
    old league page byte for byte, a finalized gameweek 1): it refused with
    the tick on and passed every check with it off.
- The migrations leave `mode = off`: nothing is visible and the job idles
  until the switch is set.
- Avoid the Fantasy orchestrator's hourly slot (minute 12).

## Rolling back

`select app_private.predictions_configure('off');` stops everything at once and
keeps the data. The build flags can then be turned off in the next deploy.
Removing the feature is a forward migration dropping the new objects; nothing
existing depends on them.
