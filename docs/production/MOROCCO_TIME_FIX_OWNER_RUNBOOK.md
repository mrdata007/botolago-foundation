# Morocco's clock in the database: owner runbook

> **Status, 2026-10-15:** all five scripts were run on Staging V2 and then on
> Production V2 by approved executors (rehearsal first, one script at a time, each
> step read back and checked by an independent reviewer). Do not run them again:
> each would stop at "already recorded". Remaining: deploy the
> `account-deletion-worker` Edge Function, and watch the first daily Pépites
> sweep (after 00:00 UTC) and the Monday 2026-10-19 12:00Z draft gate. The
> in-app notification template `pepites_weekly` still says "Pépites"
> (database text, its own guarded change: migration
> `20261016100000_prospects_weekly_notification_text` and
> `scripts/backend/apply-20261016100000-prospects-weekly-notification-text.sql`,
> written but not yet applied).

Target: BotolaGO Production V2, project `tkewgajrljbwgwedqsxn`, Supabase SQL editor.
Written 2026-10-15. **Nothing in this document has been run against any shared or production
database**; see "What was and was not run" at the end. Staging V2 (`srdrflfrfpwixsllveid`) has the
same problem and the same fix; the scripts are written for production and say so (see "Staging").

## Why

Morocco is UTC+0 all year from 2026-09-20T01:00:00Z (decree n° 2.26.530, IANA tz 2026c). The rule
is **confirmed by the owner (2026-10-15)**; `docs/product/PRODUCT_CONTEXT_2026-10-05.md` (row 149,
a dated snapshot) predates the confirmation and still lists it as unconfirmed. The application
already follows the rule. Both databases carry older time-zone data, so
`timestamptz '2026-10-15 12:00+00' at time zone 'Africa/Casablanca'` answers **13:00** there. Every
database function that turns an instant into Moroccan clock time that way is an hour off. What
drifts, and how badly, is in `docs/engineering/MOROCCO_TIME_IN_THE_DATABASE.md`. The worst case
is the Fantasy deadline printed in a notification, an hour **late**; it has not reached a reader
(e-mail is off, push is testers only) and should be fixed **before** either goes to real readers.

## The five scripts

Same way as `docs/production/PHASE_A_B_MIGRATIONS_OWNER_RUNBOOK.md`: each is a guarded,
rehearsal-first script that records its migration in `supabase_migrations.schema_migrations`
and runs it from that record. Run them in this order, one at a time, finishing each including
its post-checks before opening the next. Never run two of them, or one of them and anything else
that changes the database, at the same time (`AGENTS.md`, "One writer at a time").

| Order | Migration                                               | Script (in `scripts/backend/`)                                    | What it changes                                                                                                                                                         | Why now                                                        |
| ----- | ------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1     | `20261016090000_morocco_time_helpers`                   | `apply-20261016090000-morocco-time-helpers.sql`                   | Adds ten helper functions in `app_private`. Changes nothing that exists. The other four need it.                                                                        | Required first.                                                |
| 2     | `20261016090100_morocco_time_deadline_text`             | `apply-20261016090100-morocco-time-deadline-text.sql`             | Replaces `notification_push_fanout` and `notification_email_fanout`: the deadline in push, in-app and e-mail-inbox text reads right ("12/10 18:30", not "12/10 19:30"). | **Before push or e-mail goes to real readers.**                |
| 3     | `20261016090200_morocco_time_email_planner_quiet_hours` | `apply-20261016090200-morocco-time-email-planner-quiet-hours.sql` | Replaces `notification_email_plan` (send hours, match day) and `defer_for_quiet_hours`.                                                                                 | Before e-mail is switched on; nobody has quiet hours on today. |
| 4     | `20261016090300_morocco_time_pepites`                   | `apply-20261016090300-morocco-time-pepites.sql`                   | Replaces five Pépites functions (publication 20:00, draft 12:00, daily date).                                                                                           | Pépites is live (mode public); see the Pépites note below.     |
| 5     | `20261016090400_morocco_time_read_models`               | `apply-20261016090400-morocco-time-read-models.sql`               | Replaces `api.football_season_catalog`, `api.admin_get_analytics_overview`, `api.football_matches_by_date` (date edges only).                                           | Cosmetic; last.                                                |

Every script **refuses to run twice**, refuses unless the previous ones are recorded and working,
and refuses unless each function it replaces is **byte for byte** the text the repository's latest
migration defines (md5 of its source), with the reviewed security attribute, volatility, search
path and privileges. A refusal means the database is not in the state that was reviewed: send the
message; do not edit a check.

## Is anything to be paused? No.

`AGENTS.md` asks you to pause the jobs that write the tables a script writes. These scripts write
**no table** (only the function definitions in the system catalog and the migration history row).
The jobs that **call** the replaced functions simply see the new text on their next call, and a
call already running finishes on the old text:

| Script | Jobs that call what it replaces                                                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | none (nothing calls the new helpers yet)                                                                                                                                                                                              |
| 2      | `notification-push-tick` (every minute), `notification-email-tick` (every 5 minutes)                                                                                                                                                  |
| 3      | the same two, plus `manager-card-tick` (every 15 minutes) and `rivals-tick` where applied (quiet hours), and `api.service_create_user_notification` (the service-role call that creates a notification and defers it for quiet hours) |
| 4      | `pepites-tick` (every 15 minutes). Optional: `select app_private.pepites_configure('off', null);` for the minutes the script runs, then restore the previous mode (`public`)                                                          |
| 5      | none (website and admin screen)                                                                                                                                                                                                       |

Each script compares the cron job list before and after and stops if it moved; scripts 2 to 4
also compare the switches that matter (e-mail and push: mode, test users, functions URL; Pépites:
mode, auto-publish, the two hours, the competition), never a timestamp such as `last_tick_at`
that a running job rewrites every minute. Still make sure
nothing else is changing the database right now: no GitHub Actions run, no other apply script, no
deploy. A rehearsal that ends in rollback takes locks for a moment (5 second lock timeout, 60
second statement timeout; it gives up rather than waits).

## Before you start: read-only checks (any time, SQL editor)

```sql
-- 1. The problem, and the answer you want afterwards. Today: 13:00 (older data). Wanted: 12:00.
select timestamptz '2026-10-15 12:00+00' at time zone 'Africa/Casablanca' as database_says_today;

-- 2. What is recorded. Expect none of the five rows.
select version, name from supabase_migrations.schema_migrations
where version in ('20261016090000', '20261016090100', '20261016090200', '20261016090300', '20261016090400')
order by version;

-- 3. The functions the scripts replace are the reviewed ones (md5 of their source). Expect:
--    notification_push_fanout        6344301a85a05e3bec9a234378f2f2f2
--    notification_email_fanout       cc529d2660ac94e292e0635e4f0dcceb
--    notification_email_plan         c261d9f075f060540e092803e50a2e2d
--    defer_for_quiet_hours           e98342fc4a2214dcc00ab817effadcd5
--    pepites_local_at                ce0643b1ccdb2057f06a6902a8a5b3ca
--    pepites_create_draft            cde742e7e12d1e96068a8a8bafa02241
--    pepites_tick_draft              b60594c0e911046b90a09e693191f711
--    pepites_tick_daily              2c64fe50db39e0dd7319b92fabb3b55a
--    pepites_tick                    783bb9cd9bf6d9364808f7a43c4667fc
--    football_season_catalog         fb6e63989ea528c2f2c545504db68aa2
--    admin_get_analytics_overview    c407900da607060a1b268f451c4a3bfb
--    football_matches_by_date        cb8a1904e5ee38ded3e9ad2224ef3889
select p.oid::regprocedure::text as function, md5(p.prosrc) from pg_proc p
where p.proname in ('notification_push_fanout', 'notification_email_fanout', 'notification_email_plan',
  'defer_for_quiet_hours', 'pepites_local_at', 'pepites_create_draft', 'pepites_tick_draft',
  'pepites_tick_daily', 'pepites_tick', 'football_season_catalog', 'admin_get_analytics_overview',
  'football_matches_by_date')
  and p.pronamespace in ('app_private'::regnamespace, 'api'::regnamespace)
order by 1;

-- 4. Is anything else writing? Expect no migration, apply script or deploy (create, alter, drop)
--    from another session; short app queries and pg_cron jobs are normal.
select pid, usename, state, left(query, 80) as query from pg_stat_activity
where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle'
  and backend_type = 'client backend';

-- 5. The jobs (nothing to pause, but know what is there).
select jobname, schedule, active from cron.job
where jobname in ('notification-push-tick', 'notification-email-tick', 'pepites-tick',
  'manager-card-tick', 'rivals-tick') order by jobname;

-- 6. Switches. Who would see the new text? (Counts only.)
select (select mode from app_private.notification_email_settings limit 1) as email_mode,
       (select mode from app_private.notification_push_settings limit 1) as push_mode,
       (select mode from app_private.pepites_settings where id) as pepites_mode,
       (select count(*) from app.user_preferences where notification_timezone = 'Africa/Casablanca') as zone_casablanca,
       (select count(*) from app.user_preferences where quiet_hours_enabled) as quiet_hours_on;

-- 7. Script 4 only. Pépites editions that already carry a time. An edition that was scheduled
--    before the fix keeps the scheduled_for it was given: one made for Monday 20:00 reads
--    19:00:00+00, an hour early. Decide below.
select id, week_number, status, scheduled_for from app.pepites_editions
where status in ('draft', 'scheduled') order by week_number;
```

How to read query 7. The scripts do not touch an edition. A draft or scheduled edition whose
`scheduled_for` is `19:00:00+00` on a Monday was set for 20:00 by the old function. After script 4,
**new** drafts get `20:00:00+00`. For one that already exists, either let it go out an hour early,
or have the editor schedule it again for 20:00 Moroccan time from the editorial screen (a normal
editor action, no database edit). Query 7 saying "no rows" means there is nothing to decide.
Choose a moment for script 4 that is not within an hour of a Monday 12:00 draft or 20:00
publication of a week that has an edition, and **avoid 23:00-24:00 UTC**: the daily sweep runs
once more if the script is committed in that hour (harmless but noisy).

If query 2 or 3 shows anything different from what is expected, stop and send the result: the
script will refuse for the same reason, and that refusal is the point.

## For each script

1. Supabase dashboard, project **BotolaGO Production V2**; check the address contains
   `tkewgajrljbwgwedqsxn` (the database holds no project name a script could check, so this check
   is yours). SQL Editor, New query.
2. Paste the whole file and press Run. As shipped it is a **rehearsal**: it applies the migration
   inside one transaction, checks the result, and rolls back. The result row must say
   `Rehearsal passed`, and shows the corrected answer next to the one the database gives today
   (read it, the numbers are the point). Any `stop:` message means nothing was saved; send it. If
   your next query then says `current transaction is aborted`, run `rollback;` on its own first.
3. Change the single line `rollback;` near the bottom to `commit;` and press Run once. The result
   row says `Applied`.
4. Run the post-checks below, then go to the next script.

What the rehearsal result row should read on production today (older data):

| Script | Result row, in substance                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | "... for 12:00 UTC on 2026-10-15, Africa/Casablanca = 2026-10-15 13:00:00 (the application says 12:00; the helpers will say 12:00 ...)"                                         |
| 2      | "a deadline of 18:30Z on 2026-10-12 reads 12/10 18:30 by the helper, and 12/10 19:30 by the raw zone the functions use until this is committed."                                |
| 3      | "A 22:00-07:00 quiet window ..., asked at 22:30Z ..., ends at 2026-10-16 06:00:00+00 by the function as it stands now; the right answer is 2026-10-16 07:00:00+00."             |
| 4      | "... scheduled for 2026-10-19 19:00:00+00 by the function as it stands now; the right answer is 2026-10-19 20:00:00+00."                                                        |
| 5      | "The Moroccan day 2026-10-15 runs from 2026-10-15 00:00:00+00 to 2026-10-16 00:00:00+00 (the raw zone on this database says 2026-10-14 23:00:00+00 to 2026-10-15 23:00:00+00)." |

The NOTICE lines (`accounts with notification zone ...`, `pepites editions in draft or scheduled`,
`readers with quiet hours on`, `after: ... check out`) may not show in your editor; nothing depends
on them.

### Post-checks

After script 1:

```sql
select version, name from supabase_migrations.schema_migrations where version = '20261016090000';
-- The helper's answer for 12:00Z on 2026-10-15 must be 12:00, while the old expression still says 13:00
-- until Supabase updates its time-zone data:
select app_private.morocco_local(timestamptz '2026-10-15 12:00+00')            as helper_says,   -- 12:00
       timestamptz '2026-10-15 12:00+00' at time zone 'Africa/Casablanca'      as raw_zone_says; -- 13:00 today
select app_private.morocco_local(timestamptz '2026-09-20 00:59:59+00') as last_second_of_utc_plus_1, -- 01:59:59
       app_private.morocco_local(timestamptz '2026-09-20 01:00:00+00') as first_second_of_utc_plus_0, -- 01:00:00
       app_private.morocco_local(timestamptz '2026-03-10 12:00+00')    as ramadan_2026,              -- 12:00
       app_private.morocco_local(timestamptz '2026-01-15 12:00+00')    as january_2026,              -- 13:00
       app_private.morocco_local(timestamptz '2027-02-10 12:00+00')    as ramadan_2027;              -- 12:00 (no longer special)
select has_function_privilege('anon', 'app_private.morocco_local(timestamptz)', 'execute') as anon,
       has_function_privilege('authenticated', 'app_private.morocco_local(timestamptz)', 'execute') as authenticated;
-- expect false, false (owner only)
```

After script 2:

```sql
select version from supabase_migrations.schema_migrations where version = '20261016090100';
select p.oid::regprocedure::text, md5(p.prosrc), position('at time zone audience.timezone' in p.prosrc) = 0 as no_raw_zone_left
from pg_proc p where p.proname in ('notification_push_fanout', 'notification_email_fanout')
  and p.pronamespace = 'app_private'::regnamespace
order by 1;
-- expect, in this order: notification_email_fanout 93eafdf20ad7fde193a4f4745a201342 and
-- notification_push_fanout 550d18a328ac8d1234df396cf5dd9b05, both true
-- The text a Casablanca reader gets for the 2026-10-12 deadline (18:30Z). Wanted: 12/10 18:30.
select to_char(app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca'), 'DD/MM HH24:MI') as printed_now;
```

After script 3:

```sql
select version from supabase_migrations.schema_migrations where version = '20261016090200';
select p.oid::regprocedure::text, md5(p.prosrc) from pg_proc p
where p.proname in ('notification_email_plan', 'defer_for_quiet_hours') and p.pronamespace = 'app_private'::regnamespace
order by 1;
-- expect, in this order: defer_for_quiet_hours 691fac43285139e7a650a92bb60adcb5 and
-- notification_email_plan b686fb3d2000279349c4d1afbb9f7edf
select app_private.defer_for_quiet_hours(timestamptz '2026-10-15 22:30+00', 'Africa/Casablanca', true, time '22:00', time '07:00', false);
-- expect 2026-10-16 07:00:00+00 (06:00 before)
```

After script 4:

```sql
select version from supabase_migrations.schema_migrations where version = '20261016090300';
select app_private.pepites_local_at(date '2026-10-19', time '20:00');   -- expect 2026-10-19 20:00:00+00 (19:00 before)
select p.proname, md5(p.prosrc) from pg_proc p where p.pronamespace = 'app_private'::regnamespace
  and p.proname in ('pepites_local_at', 'pepites_create_draft', 'pepites_tick_draft', 'pepites_tick_daily', 'pepites_tick')
order by 1;
-- expect, in this order: pepites_create_draft db86e49066825cf790acc52548c38756,
--   pepites_local_at 3f87e5890d6daf41cc8f67e73a409b2a, pepites_tick c8647ef7e6d49e034023e535da7c9cf1,
--   pepites_tick_daily 7f7bdedbc64c7a54a1171aeada278746, pepites_tick_draft 8f1b6c44e6dd323b8b037f4195f408f9
-- Next Monday after 12:00 Moroccan time (12:00 UTC): the draft appears (the first tick of that window).
select * from app_private.pepites_job_log order by 1 desc limit 5;
```

After script 5:

```sql
select version from supabase_migrations.schema_migrations where version = '20261016090400';
select p.oid::regprocedure::text, md5(p.prosrc) from pg_proc p
where p.proname in ('football_season_catalog', 'admin_get_analytics_overview', 'football_matches_by_date')
  and p.pronamespace in ('api'::regnamespace) order by 1;
-- expect 83a77d2229b24260ca4e176b44ce1b00, 64b4f711d3ea9978cb41051c22a896b2, 0952f4f683e9da8f05402f70e33682ae
-- (admin_get_analytics_overview, football_matches_by_date, football_season_catalog)
select has_function_privilege('anon', 'api.football_season_catalog(text,integer)', 'execute') as catalog_anon,           -- true
       has_function_privilege('anon', 'api.admin_get_analytics_overview()', 'execute') as analytics_anon,                -- false
       has_function_privilege('authenticated', 'api.admin_get_analytics_overview()', 'execute') as analytics_authenticated; -- true
```

(The scripts themselves check every function's source, attributes, privileges and comment; these
queries are for your own eyes.)

Last, the one-line summary for all five: every replaced function text still passes through the
helpers, and `select timestamptz '2026-10-15 12:00+00' at time zone 'Africa/Casablanca'` still says
13:00 until Supabase updates its data. That is expected and harmless: nothing the database prints
or schedules uses it any more.

## Rolling back

The repository is forward-only: never edit a migration that has been applied anywhere, and do not
delete a history row by hand. The rehearsal is the rollback you have; it saves nothing. After a
commit, a problem is fixed with a new migration, reviewed and applied the same way. Restoring the
previous text of a replaced function is a `create or replace function` with the old body (in the
migration named in the "Fixed by" column of `docs/engineering/MOROCCO_TIME_IN_THE_DATABASE.md`);
the helpers can stay, unused, and are harmless.

## The platform alternative, and why this does not wait for it

A Supabase Postgres version that carries tz 2026c would make the raw `Africa/Casablanca` answer
12:00 as well. It is outside our control and has no date. **This fix keeps working either way**:
the helpers ask the database's own data only for instants before 2026-09-20T01:00Z, where every
release agrees, and say UTC from then on without asking. After an upgrade the helpers give the same
answers as before; nothing has to be undone. After any upgrade, re-run query 1 above: 12:00 means
updated. Until a new migration is written with the helpers, **do not** write `at time zone
'Africa/Casablanca'` in a new migration: `src/lib/morocco-time-sql.test.ts` fails if one does.

## Staging

Staging V2 (`srdrflfrfpwixsllveid`) has the same older data (the raw zone answers 13:00). A
read-only check on 2026-10-15 found there: every function the five scripts replace has the same
md5 as the pin in the script (the same as production); every function the new bodies call exists;
and no `202610160900xx` row is in the migration history. So all five scripts should run there, in
the same order, with the same checks. (It lacks the rating release and the three Phase A/B
migrations, but none of the pinned functions depends on them; this is what was measured, not a
promise: a script still refuses if the database is not as reviewed.) The headers name production;
for staging, look at the address for `srdrflfrfpwixsllveid` instead and say so in your report.

## Also needed outside the database

- **Deploy the `account-deletion-worker` Edge Function** (owner's deploy, `docs/operations/DEPLOYMENT.md`):
  its confirmation e-mail dated a request between 23:00 and 24:00 UTC to the next day on a
  runtime with older data. The fix is in the repository (`_shared/account-deletion-worker.ts`);
  the database scripts do not need it and it does not need them.
- **`scripts/backend/manager-card-founder-grant.sql`** now writes its cut-off as the UTC instant
  `2026-11-01 00:00:00+00`: midnight starting 1 November in Morocco. The old text
  (`... Africa/Casablanca`) read as 2026-10-31 23:00 UTC on this database.

## What was and was not run

**Run (throwaway local PostgreSQL 16, unix socket, never a shared database):**

- The helpers' pgTAP file (`morocco_time_helpers.test.sql`, 45 assertions) and the callers' file
  (`morocco_time_callers.test.sql`, 16 assertions), through a 40-line stand-in for the `extensions`
  functions they use (`is`, `ok`, `throws_ok`, `diag`, `finish`; **not pgTAP**), on **two**
  servers: one with the system's tz 2026c data (12:00) and one whose `Africa/Casablanca` is the
  old tzdata 2026a file (13:00, the production answer). Both: all pass.
- The **real replaced functions** (planner, quiet hours, season catalog, analytics, matches by date,
  `pepites_local_at`, `pepites_tick_draft`, `pepites_tick_daily`) before and after the migrations,
  against stub tables (only the columns they read; the fan-outs, `pepites_create_draft` and
  `pepites_tick` were installed but only the changed expressions were exercised), on both
  servers. Before, on the old-data server: the preview is planned at 09:30Z (an hour early) and
  leaves out a 23:30Z kick-off; a 22:30Z quiet-hours push waits until 06:00Z; the season starts a
  day late; the Pépites edition is scheduled for 19:00Z. After, on both servers: identical,
  correct answers.
- **Each of the five owner scripts**, on both servers: clean rehearsal passes and saves nothing;
  commit applies and records the history row; a second run refuses (rehearsal and commit); and the
  chain 1 to 5 end to end. Broken starting states, each of which the script refuses without saving
  anything: script 1: the history table missing, already recorded, one helper already present, all
  helpers present, the `app_private` schema missing, the embedded file changed; scripts 2 to 5, each:
  already recorded, helpers not recorded, a helper edited, a helper missing, a replaced function
  renamed, its text edited, an extra privilege or a missing one, its security attribute or
  volatility changed, the migration already run by hand, a function the new text calls missing (2, 3,
  4), the embedded file changed. 81 checks in all on each server, 0 failures.
- `bun run typecheck`, the repository's tests and the timezone-parity test (see the commit message).

**Not run:**

- **pgTAP itself, and the whole `supabase/tests/database` suite.** No Docker, no Supabase stack.
  CI's `database-quality` job is the authority. The existing suites whose clock assumptions were
  changed to follow the rule (`notification_email_delivery`, `push_fanout`, `push_remaining_alerts`,
  `admin_user_moderation`, `pepites_editions`, `matches_by_date_utc_bounds`, and the Pépites
  concurrency test) were edited by reading, not run. `pepites_editions` and its concurrency test
  had every tick moved one hour later and every 19:00 Monday publication moved to 20:00, because
  they were written for UTC+1.
- **Real Supabase.** Nothing was applied to, or read from, Production V2 or Staging V2 by this
  lane. The md5 pins come from the repository's latest definitions; the scripts check them against
  the live database, which has not been compared.
- The fan-outs, `pepites_create_draft` and `pepites_tick` as whole functions (they need most of
  the schema). Their diffs are one expression each; the expression was exercised on its own.
