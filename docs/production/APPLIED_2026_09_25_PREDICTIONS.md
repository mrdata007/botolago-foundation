# Production: Pronostics installed, switched off (2026-09-25)

On 2026-09-25 a Claude Code session wrote to Production V2
(`tkewgajrljbwgwedqsxn`) once, on the owner's go-ahead ("Go-ahead for the
Pronostics database install"):

- **07:33:21 UTC**: migrations `20260925090000` to `20260925090400`
  (Pronostics, parts 1 to 5, BG-0146, merged in #200), installed with the game
  switched **off**.

Nothing is visible yet. Every Pronostics read answers "not allowed" and
botolago.com/pronostics shows "Bientôt disponible" under `noindex` until the
game is switched on, which is a separate step with its own go-ahead
(`docs/backend/PREDICTIONS_OPERATIONS_RUNBOOK.md`, "The switch").

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

1. **07:00 UTC, rehearsal** (ending in `rollback`): passed. A re-read at 07:05
   found nothing left: no history row, no table, no job, no function.
2. **07:22 UTC, rehearsal again**, because production had changed in between
   (next section): passed. A re-read at 07:28 found nothing left.
3. **07:33 UTC, for real** (ending in `commit`): "Applied. Pronostics is
   installed and switched off."

## Before writing

- **Another session was writing.** Between the first rehearsal and the real
  run, the launch-fix session (#199, #201) applied its own batch,
  `20260924200000` to `20260924200600`, and switched on the Fantasy lifecycle
  tick at 07:18 UTC. Its runbook asks for that batch to go first, since its
  script refuses once Pronostics is recorded. This session waited until that
  session reported its release complete (07:21 UTC) and nothing was running
  (`pg_stat_activity`: no client query), then rehearsed again against the new
  state.
- **Fantasy gameweek 1** had just been locked by the new tick (`open` to
  `live` at 07:20 UTC). No match was being played, and none was due in the
  next 24 hours, so no Fantasy scoring was in progress or due.
- **Scheduled jobs** at the time: `fantasy-lifecycle-tick`, `ops-alert-tick`
  and `notification-email-tick` every 5 minutes (tens of milliseconds each),
  `football-live-refresh` and `news-publish-due-editions` every minute, the
  nightly prunes. Email sending was off. The script's short lock timeout
  (5 seconds) would have made it give up rather than hold up any of them.
- The script creates links from the new tables to fixtures, rounds, seasons,
  competitions, profiles and Fantasy leagues, which holds writes to those six
  tables for the length of the transaction (seconds). No job failed in the
  runs after it.

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

- Stage 3, the owner as the only tester: the owner's go-ahead, then
  `select app_private.predictions_configure('testers', null, array['<owner user id>']::uuid[]);`
  (runbook, "The switch").
- Part 6, after Fantasy gameweek 1 is finalized:
  `scripts/backend/apply-20260925090500-fantasy-league-page-skip-empty.sql`,
  rehearsed first, on its own go-ahead.
