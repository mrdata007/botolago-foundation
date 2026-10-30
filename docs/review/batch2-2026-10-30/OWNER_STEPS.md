# Owner steps: publish a journée's points all at once

Nothing here has been done. Nothing goes live without your yes. In this order,
all in one session, **before Journée 6 locks** (or immediately after if it is
applied later).

1. **Review and merge the pull request** (the Lead opens it). Merging to `main`
   starts GitHub Actions; that is the only deploy it does by itself.
2. **Deploy the Edge Function `fantasy-lifecycle-worker` first** (recommended).
   It carries the new shared worker code. This is safe on its own: against the
   old database the new worker behaves exactly as before, because it asks about
   publication only when the database says a journée is gated.
3. **Apply the database change.** Supabase dashboard, project "BotolaGO
   Production V2", SQL Editor, new query. Paste the whole of
   `scripts/backend/apply-20261030100000-publish-journee-at-once.sql`.
   - Run it as it is: it is a rehearsal. The last row must say "Rehearsal
     passed. Nothing was saved."
   - If it stops with a message, nothing was saved:
     - `scheduled_job_running`: a scheduled job was running. Wait one minute and
       run it again.
     - "a Fantasy worker pass holds its lease" or "an HTTP request is still
       queued": wait a few minutes and run it again.
     - anything else: stop and tell the Lead; do not edit the script.
   - Change `rollback;` to `commit;` and run it again. The last row must say
     "Applied." (it says so only if the gate's objects exist).
   - While it runs, every scheduled job is held off and starts again by itself
     when it ends. There is nothing to switch off or on by hand.
   - If Journée 6 points had already started to appear before you apply it, they
     disappear from fans' screens at once (hidden, not deleted) and come back
     together at the journée's publication time. The script does not stop for
     that; it prints a notice.
   - **If you apply the database first** (not recommended), deploy the worker
     within minutes: the old worker against the new database is refused for a
     gated journée, so it publishes nothing and the journée stays held until the
     new worker runs.
4. **Publish the website** in Lovable. It shows «Points de la Journée 6 : samedi
   31 oct. à 14h» (and «publication en cours» once that hour has passed and the
   points are not out yet). Nothing else changes for a journée that is not
   waiting.
5. **Check, once the first match day of Journée 6 is over:**
   - the Fantasy points and rankings screens say when the points will be
     published;
   - nothing is published before that time, and at 14:00 Moroccan time (within
     about 10 minutes, the worker runs every 10 minutes) the points, the
     rankings and the "points ready" notification go out together;
   - if a rating was still missing at that time, the screen moves the time to
     the next day at 14:00.

If something looks wrong, tell the Lead before touching anything. To switch the
rule off for the season without undoing anything:
`insert into app_private.fantasy_publication_settings(season_id, first_gameweek)
values ('<season id>', 1000) on conflict (season_id) do update set first_gameweek = 1000;`
(a database write: ask first).

## Journée 6's opening

Journée 6 had not opened because of Maghreb Fès v RSB Berkane (booked 20:00,
played 17:00). The one-off script that realigned that match was applied on 30
Oct. This change contains the permanent fix (item F7): a finished match whose
kickoff moved after the lock no longer blocks the close.
