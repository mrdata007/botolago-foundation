# Production: Pronostics installed, switched off (2026-09-25)

On 2026-09-25 a Claude Code session wrote to Production V2
(`tkewgajrljbwgwedqsxn`) once, on the owner's go-ahead ("Go-ahead for the
Pronostics database install"):

- **07:33:21 UTC**: migrations `20260925090000` to `20260925090400`
  (Pronostics, parts 1 to 5, BG-0146, merged in #200), installed with the game
  switched **off**.

At install nothing was visible: every Pronostics read answered "not allowed"
and botolago.com/pronostics showed "Bientôt disponible" under `noindex`.

**Update:** at 14:56:27 UTC the same day, on the owner's go-ahead ("switch it
on and publish it"), the game was switched on for everyone (last section).

Part 6, `20260925090500_fantasy_league_page_skip_empty.sql`, is **not**
applied. It changes a Fantasy function and waits until Fantasy gameweek 1 is
scored and finalized; its script checks that and refuses before then.

## How

The committed script `scripts/backend/apply-20260925090000-predictions.sql`,
run through Supabase's `execute_sql` (its opening comment block left out, the
rest byte for byte). It is one transaction:

1. refuses to run twice, or on a database missing what Pronostics builds on;
2. records each of the five migration files whole in
   `supabase_migrations.schema_migrations`;
3. runs each one from that record only after its sha256 matches the
   repository file;
4. checks the result: the seven tables, their forced row security, that no
   client reads them directly, every function and who may call it, the two
   scheduled jobs, the game left off, and one real read as a visitor.

It ran three times:

1. **07:05 UTC, rehearsal** (ending in `rollback`): passed. A re-read seconds
   later found nothing left: no history row, no table, no job, no function.
2. **07:28 UTC, rehearsal again**, because production had changed in between
   (next section): passed. A re-read seconds later found nothing left.
3. **07:33 UTC, for real** (ending in `commit`): "Applied. Pronostics is
   installed and switched off."

The first version of this record gave 07:00 and 07:22 for the rehearsals:
those were the checks made before each one.

## Before writing

- **Another session was writing.** Between the first rehearsal and the
  second, the launch-fix session (#199, #201) applied its own batch,
  `20260924200000` to `20260924200600`, and switched on the Fantasy lifecycle
  tick at 07:18 UTC. Its runbook asks for that batch to go first, since its
  script refuses once Pronostics is recorded. This session waited until that
  session reported its release complete (07:21 UTC) and no other query was
  running (`pg_stat_activity`, read at 07:21, 07:22 and 07:28), then rehearsed
  again against the new state.
- **Fantasy gameweek 1** had just been locked by the new tick (`open` to
  `live` at 07:20 UTC). No match was being played, and none was due in the
  next 24 hours, so no Fantasy scoring was in progress or due.

## The scheduled jobs were not paused

They should have been. Before a write that touches Fantasy or fixture tables,
`AGENTS.md` asks to pause the Fantasy lifecycle tick
(`select app_private.fantasy_automation_configure(false);`) and, for fixtures,
the email job and the live score refresh
(`select app_private.notification_email_configure('off', null, null, false);`),
and to put them back afterwards. This install touches those tables: it links
the new tables to fixtures, rounds, seasons, competitions, profiles and Fantasy
leagues, and while it runs, writes to those six tables wait. Neither the
Fantasy tick nor the live score refresh was paused, for the rehearsals or for
the real run. The other jobs ran on too: `ops-alert-tick` and
`notification-email-tick` every 5 minutes, `news-publish-due-editions` every
minute, the nightly prunes. Email sending was off.

What this session relied on instead does not make that safe: that no other
query was running when it looked, and the script's 5-second lock timeout.
Neither stops a job from starting in the middle of the transaction. The
timeout only makes the script give up when the script is the one waiting; a
job arriving second would simply have waited for the install to finish.
**Not to be repeated.** Part 6 goes in with the Fantasy tick paused, and its
script now refuses while the tick is on (Next).

Why the result stands, measured afterwards (`cron.job_run_details`, and a
re-read of everything at 07:57 UTC):

- **No job ran during any of the three transactions.** The real run began at
  07:33:21.14 by the database clock, and its answer was back at 07:33:21.32.
  The nearest job runs ended at 07:33:00.03 and started at 07:34:00.02. The
  rehearsals were answered at 07:05:33 and 07:28:05, between runs at 07:05:00
  and 07:06:00, and at 07:28:00 and 07:29:00.
- **No job was held up, and none has failed since.** The runs just before
  and after each transaction took their usual 4 to 8 ms. By 07:57, every run
  since the install had succeeded: the Fantasy tick 5 times (last at 07:55,
  no failure), the live score refresh 24 times, the Pronostics tick 5 times.
  The only failed runs of the day are from 05:15 to 06:11 UTC ("job startup
  timeout"), before the first rehearsal.
- **Outside Pronostics, the install writes only the five history rows and its
  two scheduled jobs**: no football, Fantasy or profile row, and no existing
  function. Fantasy gameweek 1 is still `live`, as the tick left it at 07:20.
- **The evidence below was measured again at 07:57 UTC**, with no other query
  running on the database at that moment, and is unchanged.

## Evidence (read-only, after the run)

- **History:** five rows, `20260925090000` to `20260925090400`. The sha256 of
  each recorded file equals the repository file:
  - `f2305e52…bac6` predictions_schema
  - `27d8b9ae…8a1a` predictions_rules
  - `104a1a1d…cfdb` predictions_api
  - `9428249f…629a` predictions_leagues
  - `ed83856e…bda8` predictions_scoring
- **Tables:** the seven Pronostics tables exist, each with row security on and
  forced; neither `anon` nor `authenticated` can read any of them. All empty.
- **Functions:** the eleven `api` functions exist. Only
  `api.predictions_round` and `api.predictions_leaderboard` are callable by a
  visitor; the other nine need a signed-in player; no `app_private` function is
  callable from outside the database.
- **Jobs:** `predictions-score-tick` (`*/5 * * * *`, job 19) and
  `predictions-history-prune` (`53 3 * * *`, job 20), both active. The first
  tick ran at 07:35:00, succeeded in 9 ms and wrote nothing.
- **Switch:** `mode = off`, scoring enabled, no testers.
- **A visitor's read:** `api.predictions_round(null, 'fr')` answers
  `{"mode": "off", "allowed": false}`.
- **Everything else:** every scheduled job that ran between 07:33 and 07:36
  succeeded (Fantasy tick, ops alerts, email tick, live refresh, news).
- **Security advisor:** the Pronostics objects appear only where designed: row
  security without policies on the seven tables (no direct access at all), and
  security-definer functions callable by visitors (the two public reads) and by
  signed-in players (the eleven `api` functions). These are the same kinds of
  notice the advisor gives for the rest of the `api` schema.
- **The live site:** botolago.com/pronostics, in a real browser, shows
  "Bientôt disponible" with `robots: noindex`.

## Check it yourself (read-only)

```sql
select version, name,
  encode(sha256(convert_to(statements[1], 'UTF8')), 'hex') as sha256
from supabase_migrations.schema_migrations
where version like '20260925090%'
order by version;

select app_private.predictions_status() - 'rounds';

select jobname, schedule, active from cron.job where jobname like 'predictions-%';
```

## Next

- Part 6, after Fantasy gameweek 1 is finalized, on its own go-ahead, which
  covers pausing the Fantasy tick for it:
  `select app_private.fantasy_automation_configure(false);`, then
  `scripts/backend/apply-20260925090500-fantasy-league-page-skip-empty.sql`
  rehearsed and run, then
  `select app_private.fantasy_automation_configure(true);`. The script refuses
  while the tick is on (checked on a local copy of production's state: it
  refused with the tick on and passed every check with it off).

## Switched on for everyone (14:56 UTC)

The owner's go-ahead, 2026-09-25: "switch it on and publish it", straight to
Stage 5 without a testers stage (runbook, "Rollout").

- **Before:** no other query running (`pg_stat_activity` at 14:56:06), the
  switch `off`. This write touches `app_private.prediction_settings` and
  `prediction_job_runs`. Two scheduled jobs write that run log too:
  `predictions-score-tick` adds a row when it has work or fails, and
  `predictions-history-prune` (03:53 UTC) deletes old rows. Neither could
  overlap: the tick writes nothing while the game is off and ran at 14:55:00
  (next at 15:00:00), and the prune runs at night. Any later switch, back to
  `off` included, needs the same check first (runbook, "The switch").
- **Dry run:** one `DO` block ran `predictions_configure('public')` and a
  visitor's read, then raised: mode `public`, scoring on; the visitor allowed,
  journée 1, 8 matches. A re-read found the switch still `off` and no
  job-run row.
- **14:56:27 UTC:** `select app_private.predictions_configure('public');`,
  logged in `app_private.prediction_job_runs` (operator, applied).
- **After:** a visitor's read is allowed and lands on journée 1 (in
  progress): 6 matches open to predict on 26 and 27 September, the first
  locking at 16:00 UTC on the 26th; Amal Tiznit – Ittihad Tanger (played) and
  FAR Rabat – Raja (postponed) closed. The score job ran at 15:00 and 15:05
  with the game on, succeeded in 11–12 ms and had nothing to write yet. No
  scheduled job failed since the switch.
- **The ways in** (Home card, Matches tab, match page card, league tab,
  sitemap entry, search indexing) come with `PRONOSTICS_PROMOTED` in the pull
  request that carries this section, and the publish after it.

To switch it off again: `select app_private.predictions_configure('off');`
(runbook, "Rolling back").
