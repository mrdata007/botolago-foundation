# Owner runbook: match details on the match page

Status when written (2026-09-25): **not applied.**

## The problem

On every match page, the Résumé, Stats and Compos tabs are empty, even for a
finished match such as Amal Tiznit 1–3 Ittihad Tanger (24 Sept). The page is
not broken. It shows what the database holds, and the database holds nothing
for those tabs: checked read-only on production on 2026-09-25, `app.match_events`,
`app.fixture_team_statistics` and `app.lineups` had **0 rows**, for all 481
finished matches.

The reason: the live refresh asks SportsMonks for the score, the teams and the
match state, and nothing else. No job ever asked for goals, cards,
substitutions, team statistics or lineups, and the database had no function to
store them.

The Face à face tab is different and is correct: the database holds no earlier
meeting between these two clubs.

## What this change does

- **Database** (`20260925141500_football_match_details_ingestion`):
  - a function that stores one match's events, team statistics, lineups,
    expected goals (xG), pressure index and absent players;
  - a function that says which matches need their details fetched;
  - two new tables (the pressure curve; the injured and suspended players)
    and two new statistics (xG and xG on target);
  - two new public reads for the match page (pressure, absent players);
  - the live refresh keeps calling every 15 minutes for 2 hours after a match
    ends, because statistics settle and events get corrected after the whistle.
- **Edge Function `football-live-refresh`**: after the scores, it fetches the
  details of each match that is on, about to start, or finished within the
  last 2 hours, one SportsMonks request per match, including the xG and
  Pressure Index add-ons. If the add-ons are refused, it asks again without
  them, so goals, stats, lineups and absences still arrive. If that fails too,
  the scores are still saved as before. It also has a one-off **backfill** job
  for finished matches that have no details yet.
- **Website** (the match page):
  - Stats tab: a **pressure chart** (who was pushing, five minutes a bar, home
    above the line, away below; tap a bar for its minutes) and **xG** rows
    under possession;
  - Compos tab: an **Absents** list per club (injured or suspended, with the
    expected return date), shown even before the lineups are out.

Cost: one extra SportsMonks request per match every 2 minutes while it is on
(about 60 for a match), plus 8 after the whistle. The backfill is one request
per finished match. A plan that refuses the add-ons costs one more request
each time.

## Step 1 — Nothing else running

No match being played right now. GitHub → Actions: no workflow running (the
Fantasy season orchestrator runs at minute 12 of each hour; avoid it). No other
database work in progress.

## Step 2 — Database

Supabase dashboard → **BotolaGO Production V2** → SQL Editor → New query.

1. Paste the whole of
   [`scripts/backend/apply-20260925141500-football-match-details.sql`](../../scripts/backend/apply-20260925141500-football-match-details.sql)
   and press Run. The result must say **Rehearsal passed**. Nothing is saved.
2. Change the line `rollback;` near the bottom to `commit;` and press Run
   again. The result must say **Applied**.

If it stops with a message, nothing was saved. **Do not edit a check to make it
pass**: it means production is not in the state the script was written for.
(The script's checks were measured against production read-only on
2026-09-25.)

## Step 3 — Website and Edge Function

Merge the pull request: the website deploys from `main` as usual, and the new
match-page parts stay hidden until there is data for them.

Then the Edge Function,

from the repository, on the merged `main`:

```sh
supabase functions deploy football-live-refresh --project-ref tkewgajrljbwgwedqsxn
```

No new secret is needed: it uses the same `SPORTSMONKS_API_TOKEN` as today.

## Step 4 — Backfill the matches already played

In the SQL Editor:

```sql
select app_private.invoke_scheduled_function(
  (select functions_base_url from app_private.notification_email_settings where id),
  'football-live-refresh',
  '{"job":"match_details_backfill"}'::jsonb
) as request_id;
```

Wait 30 seconds, then read the answer (use the `request_id` from above):

```sql
select status_code, content::jsonb -> 'jobs' -> 'matchDetails' as details
from net._http_response where id = <request_id>;
```

Expect `status_code` 200 and `"stored"` equal to the number of finished matches
listed in `"due"`. It fetches up to 10 matches per call; run it again until
`"due"` is 0.

## Step 5 — Check

Open the Amal Tiznit – Ittihad Tanger page. Résumé should list the goals,
Stats the pressure chart, possession, xG and shots, Compos the lineups and
anyone who was out. Or in SQL:

```sql
select jsonb_array_length(api.football_match_timeline('b48265b5-5df0-4ae3-815d-a0a01cde80f2', 'fr')) as events,
       jsonb_array_length(api.football_match_statistics('b48265b5-5df0-4ae3-815d-a0a01cde80f2', 'fr')) as statistics,
       jsonb_array_length(api.football_match_lineups('b48265b5-5df0-4ae3-815d-a0a01cde80f2', 'fr')) as lineups,
       jsonb_array_length(api.football_match_pressure('b48265b5-5df0-4ae3-815d-a0a01cde80f2', 'fr')) as pressure_minutes,
       jsonb_array_length(api.football_match_absences('b48265b5-5df0-4ae3-815d-a0a01cde80f2', 'fr')) as absent;
```

Each run is recorded:

```sql
select created_at, status, records_updated, records_rejected, error_code, checkpoint
from app_private.football_ingestion_runs
where job_type = 'match_events'
order by created_at desc limit 10;
```

## What to watch in the answer

- **`addOnsUnavailable` above 0**: SportsMonks refused the request with the
  xG and Pressure Index add-ons, and the rest was fetched without them. Check
  the add-ons are active on the plan for Botola Pro.
- **`errors: ["provider_unavailable"]` while scores keep working**: SportsMonks
  refused the details request even without the add-ons. The most likely cause
  is the plan not covering one of `events`, `statistics`, `lineups`,
  `formations` or `sidelined` for Botola Pro. Lineups are known to work (the
  Fantasy player statistics use them); the others were not tested against the
  live API before this change (no SportsMonks key was available to test with).
- **`pressure` at 0 with the add-on active**: SportsMonks has no pressure data
  for that match; the chart simply does not show.
- **`skipped`** above 0: rows SportsMonks sent that could not be read (an event
  type this code does not know, for example). They are left out, never shown
  wrongly.
- **`unmappedPlayers`** above 0: lineup players who are not in BotolaGO's player
  list. They are left out of Compos. Their goals and cards still show, with
  the name SportsMonks gives.

## Undo

The details step never blocks the scores. To stop it, deploy the previous
`football-live-refresh` (from the commit before this change). The stored
details can then be removed, if wanted:

```sql
delete from app.match_events where idempotency_key like 'sportsmonks:event:%';
delete from app.fixture_team_statistics;
delete from app.lineups;
delete from app.fixture_pressure;
delete from app.fixture_absences;
```

The new database functions and tables do nothing unless used, and can stay.
