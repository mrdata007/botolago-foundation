# Production: match votes installed (2026-09-25)

On 2026-09-25 a Claude Code session wrote to Production V2
(`tkewgajrljbwgwedqsxn`) on the owner's go-ahead for the fan votes ("Yes, do
it all": add the votes table to the live database and publish, after a test
run):

- **16:18 UTC**: migration `20260925234000_match_votes` (BG-0146, pull
  request #219): the table `app.match_votes` and the functions
  `api.match_votes` and `api.cast_match_vote`.

Nothing else changed. The votes follow the Pronostics switch, which has been
`public` since 14:56:27 UTC, so they can be read as soon as the site shows
them. The site shows them from the publish that follows #219.

## How

The committed script `scripts/backend/apply-20260925234000-match-votes.sql`,
run through Supabase's `execute_sql`. It is one transaction:

1. refuses to run twice, before Pronostics parts 1 to 5 or the account bans,
   while a match is being played, or while the Fantasy tick or the live score
   refresh is on;
2. records the migration file whole in `supabase_migrations.schema_migrations`;
3. runs it from that record only after its sha256 matches the repository file;
4. checks the result: forced row security, no client role on the table, who
   may call each function, the table empty, and one real read of the next
   match as a visitor.

Steps, times UTC: the database clock for the checks and the pause, and the
moment each script was sent for the two runs (each was answered within 2
seconds):

1. **16:14:16, before anything:** no other query running, no match being
   played (next kick-off 26 September 16:00), the latest migration
   `20260925200000`, the votes not installed, no failed job run in the last
   hour. Email mode `off`.
2. **16:14:24, jobs paused**, as `AGENTS.md` asks before a write that touches
   fixture tables (the new table links to fixtures and profiles):
   `select app_private.fantasy_automation_configure(false);` and
   `select app_private.notification_email_configure('off', null, null, false);`.
3. **16:15:12, rehearsal** (the script as committed, ending in `rollback`,
   its opening comment block left out): "Rehearsal passed. Nothing was saved."
4. **16:17:18, re-read:** no history row, no table, no function; latest
   migration still `20260925200000`; both jobs still paused; no other query.
5. **16:18:14, for real** (the whole file, with `rollback;` changed to
   `commit;` and nothing else): "Applied. The match pages can take fan votes."
6. **16:18:18, jobs back on:** `fantasy_automation_configure(true)` and
   `notification_email_configure('off', null, null, true)`. Email mode is
   still `off`, as before.

The two jobs were paused for 3 minutes 54 seconds. Both transactions ran
between job runs: the runs of 16:15:00 and 16:18:00 had all ended by
16:15:00.08 and 16:18:00.03, and the next ones started at 16:16:00 and
16:19:00, after each script had been answered.

## Evidence (read-only, after the run)

- **History:** one row, `20260925234000 match_votes`, one statement, sha256
  `3c235ea8…1f08`, equal to the repository file.
- **Table:** `app.match_votes` exists, empty, row security on and forced;
  `anon`, `authenticated` and `service_role` hold no privilege on it. Its two
  triggers are there: `match_votes_set_updated_at` and
  `match_votes_refuse_banned_actor`.
- **Functions:** `api.match_votes` is callable by visitors and players;
  `api.cast_match_vote` only by signed-in players (not `anon`, not `public`).
- **A visitor's read through the live API** (the site's own public key,
  16:18:46): the next match, `5dddc509-…401c` (26 September 16:00), answers
  covered and open, the three questions in order (winner, both_score,
  first_goal), every count 0, `mine` null. A visitor's vote through the API
  is refused (`permission denied for function cast_match_vote`): visitors
  vote on the phone, and the page sends those votes once they sign in.
- **Jobs:** every scheduled run since the restore has succeeded (read at
  16:20:10): the live score refresh at 16:19:00 and 16:20:00, the Fantasy
  tick at 16:20:00 (39 ms), and the email, Pronostics, alert and news jobs.

## Check it yourself (read-only)

```sql
select version, name,
  encode(sha256(convert_to(statements[1], 'UTF8')), 'hex') as sha256
from supabase_migrations.schema_migrations
where version = '20260925234000';

select relrowsecurity, relforcerowsecurity
from pg_class where oid = 'app.match_votes'::regclass;

select count(*) from app.match_votes;
```

## Rolling back

The votes are hidden with Pronostics: `select
app_private.predictions_configure('off');` (runbook, "The switch", which says
what to check first). The site also hides them if the functions are missing.
Removing the table would be a new migration; nothing depends on it outside
the match page.
