# Owner steps: publish a journée's points all at once

Nothing here has been done. Nothing goes live without your yes. In this order.

1. **Review and merge the pull request** (the Lead opens it). Merging to `main`
   starts GitHub Actions; that is the only deploy it does by itself.
2. **Apply the database change.** Supabase dashboard, project "BotolaGO
   Production V2", SQL Editor, new query. Paste the whole of
   `scripts/backend/apply-20261030100000-publish-journee-at-once.sql`.
   - Run it as it is: it is a rehearsal. The last row must say "Rehearsal
     passed. Nothing was saved."
   - If it stops with a message ("a Fantasy worker pass holds its lease", "an
     HTTP request is still queued"), wait a few minutes and run it again.
     Any other message: stop and tell the Lead; do not edit the script.
   - Change `rollback;` to `commit;` and run it again. The last row must say
     "Applied."
   - While it runs, every scheduled job is held off and starts again by itself
     when it ends. There is nothing to switch off or on by hand.
3. **Deploy the Edge Function** `fantasy-lifecycle-worker` (it carries the new
   shared worker code). This must happen **before Journée 6's matches end**: the
   new database refuses to publish a Journée 6 that the worker has not asked to
   release, so the old worker would only be refused, never publish early.
4. **Publish the website** in Lovable. It shows «Points de la Journée 6 : samedi
   à 14h» and nothing else changes for a journée that is not waiting.
5. **Check, once the first match day of Journée 6 is over:**
   - the Fantasy points screen says when the points will be published;
   - nothing is published before that time, and at 14:00 Moroccan time the
     points, the rankings and the "points ready" notification go out together;
   - if a rating is still missing at that time, the screen moves the time to the
     next day at 14:00.

If something looks wrong, tell the Lead before touching anything. To switch the
rule off for the season without undoing anything:
`insert into app_private.fantasy_publication_settings(season_id, first_gameweek)
values ('<season id>', 1000) on conflict (season_id) do update set first_gameweek = 1000;`
(a database write: ask first).

## Journée 6's opening (the urgent, separate fix)

Journée 6 has not opened yet because of Maghreb Fès v RSB Berkane (booked 20:00,
played 17:00). The one-off script for tonight is separate from this change. This
change contains the permanent fix (item F7): after it is applied, a finished
match whose kickoff moved after the lock no longer blocks the close.
