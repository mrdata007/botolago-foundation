# Owner runbook: matches-by-day uses exact UTC day bounds

Status when written (2026-10-01): **not applied.** Pull request #279 is merged;
the website change it carries is on `main` but not necessarily published.

## The problem

The /matches day filter asked the database "which day does this kickoff
belong to?" using the database's own Casablanca time-zone data. Morocco's
clock changed on 2026-09-20 (UTC+0 all year); database time-zone data is only
as new as its last update, and staging still says UTC+1. A kickoff between
23:00 and 24:00 UTC can land on the wrong day.

## What this change does

- **Database** (`20260928090000_matches_by_date_explicit_utc_bounds`): replaces
  one read function, `api.football_matches_by_date`, with a version that also
  accepts the day's exact start and end as UTC instants. With them it only
  compares instants and never looks up a time zone. Without them it behaves
  exactly as today. No table, no scheduled job, no data is touched.
- **Website** (already merged in #279): sends those bounds, worked out with the
  app's own Morocco rule, for every Moroccan day.

## Order: database first, then the website

A website that sends the new arguments to a database that does not have them
fails on every day the /matches page loads. A database that has the new
function and an old website is fine: the old website sends the old arguments,
which still work. So:

1. **Database**: apply the script below.
2. **Website**: press Publish in Lovable
   ([DEPLOYMENT.md](../operations/DEPLOYMENT.md)).

Publishing sends everything merged on `main` since the last publish, not only
this change. Check what that is first (`git log` on `main` against the live
`x-botolago-release`).

## Step 1: nothing else running

No Fantasy gameweek being locked or scored. Not at minute 12 of an hour (the
Fantasy season orchestrator). No other database work in progress. **No
scheduled job needs pausing:** the script replaces one read function and
locks no table.

## Step 2: database

Supabase dashboard → **BotolaGO Production V2** → SQL Editor → New query.

1. Paste the whole of
   [`scripts/backend/apply-20260928090000-matches-by-date-utc-bounds.sql`](../../scripts/backend/apply-20260928090000-matches-by-date-utc-bounds.sql)
   and press Run. The result must say **Rehearsal passed**. Nothing is saved.
2. Change the line `rollback;` near the bottom to `commit;` and press Run
   again. The result must say **Applied**.

If it stops with a message, nothing was saved. **Do not edit a check to make
it pass:** it means production is not in the state the script was written for.

The script refuses to run twice, refuses unless production still holds the
exact function it was written against (fingerprint `233ccaaa…`, measured
read-only on production on 2026-10-01), and refuses unless migration
`20260924200300` is recorded. It checks afterwards that exactly one function
remains, visitors can still call it, the old way (a date and a zone) and the
new way (exact bounds) give the same answer for an old finished day, a bad
zone name is not looked up when bounds are given, and bad bounds are refused.

Migration order note: production already holds `20261001071120`, which is
later than this migration's number, and does not hold `20260927153000`. The
script records its own history row and does not depend on order.

## Step 3: website

Press **Publish** in Lovable, then check
`curl -sI https://botolago.com/ | grep -i x-botolago-release`.

## Step 4: check

Open /matches for a day with a late kickoff (23:00 to 24:00 UTC on a day after
20 September): the match is on its own day. Or in SQL:

```sql
select jsonb_array_length(api.football_matches_by_date(
  current_date, 'fr', 'Africa/Casablanca', null, null, null, null, null, 100,
  date_trunc('day', now() at time zone 'UTC') at time zone 'UTC',
  date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' + interval '1 day'
) -> 'items') as matches_today_utc;
```

## Rollback

There is none to run: the old arguments keep working, so an old website is
unaffected. If the new function misbehaves, fix forward with a new reviewed
migration.

## What I ran (no production write)

- The script, rehearsal then commit, against a throwaway local PostgreSQL 16
  with a minimal stand-in schema (fixtures, history table, the old function
  built from `20260924200300`): rehearsal rolled back, commit applied, a second
  run stopped, a changed function stopped it, and a UTC day returned the 23:30Z
  kickoff. **Not run:** the script on a copy of the real schema, and the pgTAP
  file (no Docker); CI's `database-quality` runs the pgTAP file.
- One read-only query on production for the function's fingerprint, argument
  list, the validator and the history rows. Nothing was written.
