# RPO/RTO restore rehearsal (P1-04, P1-05)

Owner-run, after PITR is on (`pitr-activation-checklist.md`). **Paid**: a
temporary project is billed for a few hours. It also includes two short
**production configuration writes** (pausing and resuming the scheduler
switches). Nothing here has been run.

## Goal and pass marks (fixed before the run)

| Measure                | How                                                                                                                         | Pass                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **RPO, configured**    | At a chosen "failure moment" F: F − latest restore point offered by Supabase                                                | ≤ 5 min, in each of 3 samples ≥ 10 min apart                                 |
| **RPO, restored data** | The restored copy at restore point T holds exactly production's data at T (fingerprint match)                               | Fingerprint identical; newest every-minute heartbeat in the copy ≥ T − 2 min |
| **RTO, database**      | From clicking _Restore_ (t0) to the copy being `ACTIVE_HEALTHY` with its fingerprint verified (t3)                          | ≤ 45 min                                                                     |
| **RTO, service**       | t3 plus the measured time to point a local production build at the copy and load Home, a match page and a Fantasy team (t4) | ≤ 60 min                                                                     |

The service RTO for a real move to a new project also includes the repoint
steps in §6, which the rehearsal times with a stopwatch but does not perform
on the live site.

## Safety controls

1. **Never restore in place.** Use only Database → Backups → **Restore to a New Project**. Never call the Management API `…/database/backups/restore-pitr` endpoint, and never use the in-place _Restore_ buttons on production: they take production offline and roll it back.
2. **The copy starts its cron jobs at once, and they cannot be paused.** Supabase documents that `pg_cron` and `pg_net` "start running as soon as the restore finishes". A copy of production carries production's functions URL and its Vault scheduler token (the encryption root key is copied), so it would wake **production's** Edge Functions:
   - live-refresh every minute,
   - push,
   - account deletion,
   - ops alerts, including the webhook.

   That would be a second scheduler writing to production, which is what `AGENTS.md` forbids. Control: those switches are **off in production at the restore point T** (step 3), so the copy boots with them off. Step 5 then quarantines the copy anyway.

3. **One writer at a time.** Before step 3, check that nothing else is writing to production (`AGENTS.md` → Before writing). The only production writes in this plan are the pause in step 3 and the resume in step 4.
4. **The copy is production data:** personal data, auth users with password hashes, and Vault secrets readable. Rules for it:
   - only the owner gets access;
   - its API keys are never shared or put in any deployed app;
   - no e-mail or push is sent from it;
   - it is **deleted the same day** (step 8).
5. **Window:** outside match hours, not at :23. Production live-score refresh, push, ops alerts and account deletions pause for about 5 minutes.
6. **Cost:** the copy mirrors the source compute (Small minimum): about $0.02 an hour on Small, $0.15 on Large, plus disk, so a few dollars at most for ≤ 3 hours. The dashboard shows an estimate before the restore starts. Delete the copy when done.

## Evidence file

Make `.readiness-audit/rehearsal-YYYY-MM-DD/` and record:

- `log.md`: every timestamp, as `date -u +%FT%TZ`, next to each step.
- `api-*.json`: the backups-endpoint outputs (A.3 of the PITR checklist; they hold no secret).
- `fingerprint-production.txt` and `fingerprint-copy.txt`.
- Screenshots: the restore dialog with the chosen time, the copy's `ACTIVE_HEALTHY` status, the local app on the copy, and the deletion confirmation.

Do **not** record any secret, connection string or API key.

## Steps

### 1. RPO, configured (read-only, three samples)

At each sample time F (`date -u +%s`):

```sh
F=$(date -u +%s)
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  https://api.supabase.com/v1/projects/tkewgajrljbwgwedqsxn/database/backups \
| tee "api-sample-$F.json" \
| jq --argjson F "$F" '{pitr_enabled, latest: .physical_backup_data.latest_physical_backup_date_unix,
                        rpo_seconds: ($F - .physical_backup_data.latest_physical_backup_date_unix)}'
```

Take the three samples at least 10 minutes apart, while the database is
active. Pass: each `rpo_seconds` ≤ 300.

### 2. Save the switch state (read-only, production)

```sql
select
  (select jsonb_build_object('mode', mode, 'live', football_live_refresh_enabled) from app_private.notification_email_settings where id) as email,
  (select jsonb_build_object('mode', mode, 'testers', test_user_ids) from app_private.notification_push_settings limit 1) as push,
  (select enabled from app_private.account_deletion_settings limit 1) as deletion,
  (select enabled from app_private.ops_alert_state where id) as ops_alert;
```

Paste the result into `log.md`. Step 4 needs it. The tester ids are account
ids, so keep the log private.

### 3. Pause, fingerprint, mark T — **WRITE (production configuration)**

```sql
select app_private.notification_email_configure('off', null, null, false);  -- email off, live refresh off
select app_private.notification_push_configure('off');                      -- clears test_user_ids; step 4 restores them
select app_private.account_deletion_configure(false);
select app_private.ops_alert_configure(false);
```

Wait 60 seconds so any request already in flight finishes. Then run the
fingerprint, read-only, and save it as `fingerprint-production.txt`:

```sql
select 'fixtures' t, count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from app.fixtures
union all select 'fantasy_teams', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from app.fantasy_teams
union all select 'fantasy_transfers', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from app.fantasy_transfers
union all select 'profiles', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from app.profiles
union all select 'predictions', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from app.predictions
union all select 'article_editions', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from app.article_editions
union all select 'fantasy_squad_memberships', count(*), null from app.fantasy_squad_memberships
union all select 'heartbeat_last_cron_run', null, max(start_time)::text from cron.job_run_details
order by 1;
```

Record **T = now (UTC, to the second)** in `log.md` immediately after the
fingerprint.

### 4. Resume production — **WRITE (production configuration)**

Do this as soon as the backups endpoint's `latest_physical_backup_date_unix`
is ≥ T (re-run step 1's command; usually within 2–3 minutes). Use the values
saved in step 2:

```sql
select app_private.notification_email_configure('<email.mode>', null, null, <email.live>);
select app_private.notification_push_configure('<push.mode>', '<push.testers>'::uuid[]);
select app_private.account_deletion_configure(<deletion>);
select app_private.ops_alert_configure(<ops_alert>);
```

Re-run step 2. It must match what was saved. The next minute's
`net._http_response` rows should be `200`s.

### 5. Restore to a new project (t0 → t3) — **paid**

1. t0: Dashboard → Production V2 → Database → Backups → **Restore to a New Project** → Point in time → **T** → confirm the cost estimate → start. Record t0.
2. t1: the new project is created (record it). t2: it reports `ACTIVE_HEALTHY` (record it).
3. Quarantine the copy as the **first** thing, in its SQL editor, before any reading:

   ```sql
   select cron.unschedule(jobid) from cron.job;
   update app_private.notification_email_settings set mode = 'off', functions_base_url = null, football_live_refresh_enabled = false;
   update app_private.notification_push_settings set mode = 'off', functions_base_url = null;
   update app_private.account_deletion_settings set enabled = false, functions_base_url = null;
   update app_private.ops_alert_state set enabled = false;
   select count(*) as outbound_requests_from_copy from net._http_response;  -- record it
   ```

   With step 3 done, `outbound_requests_from_copy` should be 0. Any other number means something left the copy: note it and check production's ops logs.

4. Run the fingerprint query on the copy and save it as `fingerprint-copy.txt`. Then t3. Compare the two files: every row must be identical, and the heartbeat must be ≤ T and ≥ T − 2 min.

### 6. Service check and repoint timing (t3 → t4, nothing live changes)

1. Locally, point a production build at the copy, as in `tests/e2e/built-output-env.ts`, but with the copy's URL and publishable key in a local `.env` that is deleted afterwards. Load Home, a match page, a Fantasy team (signed in with the owner's account) and `/news`. Record t4.
2. With a stopwatch, and **without doing it**, walk through what a real move to a new project would need. Write each estimated time in `log.md`:
   - the 12 Edge Function deploys;
   - all Edge Function secrets, including `BOTOLAGO_SCHEDULER_TOKEN`;
   - auth settings (URLs, providers, SMTP);
   - Storage buckets and objects (not in database backups);
   - Lovable's Supabase URL and key, then a publish;
   - the `functions_base_url` settings.

   This is the honest RTO for "production project lost". An in-place restore avoids most of it but takes production offline for about the restore time measured in step 5.

### 7. Results

Fill in this table in `log.md`:

| Measure                     | Value | Pass mark  | Pass? |
| --------------------------- | ----- | ---------- | ----- |
| RPO samples (s)             |       | ≤ 300 each |       |
| Fingerprint match           |       | identical  |       |
| Heartbeat gap at T (s)      |       | ≤ 120      |       |
| RTO database t3 − t0        |       | ≤ 45 min   |       |
| RTO service t4 − t0         |       | ≤ 60 min   |       |
| Outbound requests from copy |       | 0          |       |

P1-04 becomes **PASS** only if all RPO rows pass. P1-05 becomes **PASS** only
if both RTO rows pass. Otherwise each is **FAIL**, with the measured number.

### 8. Clean up — **paid resource removed**

Delete the copy: its Settings → General → Delete project. Screenshot the
confirmation and delete the local `.env`. Re-run the step 2 query on
production one last time to confirm the switches are as saved.
