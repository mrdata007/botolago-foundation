# Account deletion runbook

Migration `20261006143700_account_deletion_automatic` (owner decision
2026-10-06). Replaces the "30-day hold, then a separately reviewed worker"
plan in `IDENTITY_AUTH_RUNBOOK.md`: deleting an account from the app now
closes it at once and erases it automatically 7 days later. App Store
guideline 5.1.1(v) and Google Play's account-deletion policy require both
halves.

## What happens

**When the person confirms** (Profile > Supprimer le compte > Supprimer mon
compte; `api.request_account_deletion()`, same step-up as before), in one
transaction:

- a row in `app.account_deletion_requests` with `erase_after` = now + 7 days
  (`app_private.account_deletion_hold()`);
- Supabase Auth refuses the account from now on: `auth.users.banned_until`
  is set a century ahead (the column the Auth admin API's ban writes) and every
  row of `auth.sessions` (and with it every refresh token) is deleted. The
  device that asked signs out locally; other devices fail their next token
  refresh, or are signed out sooner by the app's standing check
  (`api.get_my_account_standing().deletionPending`);
- the profile is marked deleted (`app.profiles.deleted_at`), which every public
  board, league table and prize list already treats as "hide the name"; each
  Fantasy team, and the prize records that name it, take a pseudonym
  (`Manager 3F9A1C`); published gameweek recaps are withdrawn;
- registered phones (`app.device_registrations`, and their push destinations)
  are deleted. E-mail already skips a deleted profile.

There is no cancelling: `api.cancel_account_deletion()` now always answers
`account_deletion_not_cancellable`. Staff accounts are refused
(`account_deletion_staff_account`); close one by hand after revoking its staff
access (its `app_private.staff_principals` row is kept for the staff audit
trail and blocks deleting the Auth user).

**Seven days later**, the hourly pg_cron job `account-deletion-tick` (minute 23) wakes the Edge Function `account-deletion-worker` when a request is due.
The worker, per request:

1. claims it (`api.service_claim_account_deletions`, status `processing`, a
   15-minute lease) and receives the account's address and language;
2. removes the files under `avatars/<user id>/` through the Storage API (a SQL
   delete of `storage.objects` is refused by Storage and would orphan the
   file; the database refuses to erase while one is still listed);
3. calls `api.service_erase_account`, one transaction
   (`app_private.account_deletion_erase`):
   - prize records of the account: **paid** ones are kept (Terms and privacy
     policy: prize evidence 5 years, accounting), with `user_id` and
     `fantasy_team_id` cleared, the pseudonym, and `account_erased_at` set;
     pending or verified ones are **forfeited** (Terms: deleting the account
     loses unclaimed prizes) and their verification notes cleared; the account
     is removed as a runner-up elsewhere;
   - leagues the account owns: handed to the longest-standing other active
     member (a Fantasy `admin` first), else deleted, else (when a prize record
     names it) archived ownerless as `Ligue archivée`;
   - every Fantasy row of the account: memberships (league counts go down),
     rankings, results, lineups, chips and Free Hit snapshots, transfers,
     squad, rollovers, request journal and idempotency keys, recaps, prize
     skips; the account is cleared from `fantasy_corrections.requested_by`;
   - the account is removed from the e-mail, push and Pronostics testers lists;
   - `delete from auth.users`, which cascades to the profile and every other
     per-account table (preferences, follows, notifications and deliveries,
     predictions and standings, match votes, saved articles, Pépites follows,
     the request itself, bans, MFA factors, identities, sessions);
   - one row in `app_private.account_deletion_log`: request id, dates,
     attempts, counts. No user id, address or name;
4. sends the confirmation e-mail (Resend, FR or AR, idempotency key per
   request) to the address it was handed, and records only the outcome
   (`sent`, `no_address`, `not_configured`, `failed`) in the log.

A failure at 2 or 3 hands the request back
(`api.service_release_account_deletion`, `last_error` = a short code) for the
next hourly pass. Nothing is half-erased: step 3 is one transaction.

**Kept after erasure:** paid prize records (detached, 5 years — no automatic
purge yet, see follow-ups), `app_private.security_audit_log` rows (account id,
event, time; no content; deleted after 365 days by the daily
`account-deletion-history-prune` job, which also prunes the tick's
`cron.job_run_details` after 7 days), the deletion log (no personal data), and
Supabase's database backups until they roll over.

## Switching it on (production)

The migration ships **off**. Order matters: the web app's new deletion text
promises "sous 7 jours", so the erasure must be on before that text is
published.

1. Apply the migration through the reviewed path. First, if production does
   not have 20261005130000 (public recaps) yet, run
   `scripts/backend/apply-20261005130000-fantasy-public-recaps.sql` the same
   way (rehearsal, then `commit;`): the deletion erases recaps, so its script
   refuses without that table. Then run
   `scripts/backend/apply-20261006143700-account-deletion-automatic.sql` in
   the SQL editor, as a rehearsal first, then with `commit;` (instructions in
   its header). It refuses if a deletion request is already pending.
2. Deploy the worker:
   `supabase functions deploy account-deletion-worker --project-ref tkewgajrljbwgwedqsxn --no-verify-jwt`.
   It uses the existing secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` (without the Resend key it
   still erases, and records `not_configured` for the e-mail).
3. Switch it on. The address defaults to the e-mail dispatcher's
   (`app_private.notification_email_settings.functions_base_url`); pass it
   explicitly if that one was never set:

   ```sql
   select app_private.account_deletion_configure(true);
   -- or
   select app_private.account_deletion_configure(true, 'https://tkewgajrljbwgwedqsxn.supabase.co/functions/v1');
   ```

4. Publish the web app in Lovable (the new Profile text and `/suppression-compte`).
5. Give `https://botolago.com/suppression-compte` as the account-deletion URL
   in Google Play Console (Data safety > Data deletion) and, if asked, in App
   Store Connect review notes.

## Checking it

```sql
-- The switch and the last tick.
select enabled, functions_base_url, last_tick_at, last_outcome, last_due
from app_private.account_deletion_settings;

-- Waiting and failing requests (no personal data needed to read this).
select id, status, requested_at, erase_after, attempts, last_error
from app.account_deletion_requests
where status in ('requested', 'processing')
order by erase_after;

-- What was erased.
select request_id, requested_at, erased_at, attempts, avatar_objects_removed,
  confirmation_email, summary
from app_private.account_deletion_log
order by erased_at desc
limit 20;

-- The worker's answers (pg_net keeps response bodies for a few hours).
select id, status_code, content::text, created
from net._http_response order by id desc limit 5;
```

The ops health check `account_deletion` (in `api.service_ops_health()`, so
the watchdog and the ops alert e-mail see it) is:

- `ok` when nothing waits or nothing is overdue;
- `warn` when requests wait while the switch is off, when one failed its last
  attempt, or when the switch is on but the tick has not run for 3 hours;
- `fail` (pages the owner) when a request is more than a day past its
  `erase_after`. That is the promise to the person being broken: fix it the
  same day.

## Pausing it

```sql
select app_private.account_deletion_configure(false);
```

Asking to delete still closes the account at once; only the erasure waits, and
the health check warns, then fails a day after the first request falls due.
To also stop the daily prune (it deletes `cron.job_run_details` rows of the
tick and security-audit rows older than 365 days), pause it by name and set it
back to `true` afterwards:

```sql
select cron.alter_job((select jobid from cron.job where jobname = 'account-deletion-history-prune'), active := false);
```

**Other writers.** The erasure takes, without waiting, the advisory locks the
Fantasy lifecycle tick, Pronostics scoring, the Pépites tick and prize
evaluation hold while they write. If one of them is running, the erasure
refuses with `account_deletion_writer_busy`, the worker releases the request,
and the next hourly run erases it. A run of these refusals shows in the health
check as a failed last attempt.

**Before a write** (AGENTS.md, "Before writing"): `account-deletion-tick`
writes only while switched on; while on, it can delete Fantasy, Pronostics,
notification and identity rows of due accounts. Pause it before a write that
touches those tables, and restore it afterwards.

## Requests that arrive by e-mail

The public page offers support@botolago.com for people who cannot sign in.
Once the owner has checked the request comes from the account's address, close
the account with the same function the app uses, as that account, in the SQL
editor (one transaction; it audits, disables and dates the request exactly as
the app does):

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '<user id>', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select api.request_account_deletion();
commit;
```

The worker erases it 7 days later like any other.

## Follow-ups (not in this change)

- **Sign-in page message.** Done: Supabase's `user_banned` maps to
  `account_closed`, and the sign-in page says the account is closed and will
  be erased within 7 days (`auth.error.account_closed`).
- **Apple token revocation.** When Sign in with Apple is enabled, Apple
  expects the app's tokens to be revoked at deletion. Supabase's OAuth flow
  does not keep Apple's refresh token server-side, so the worker cannot revoke
  it. On 2026-10-06 production had no Apple identity; before enabling Apple,
  capture the provider refresh token at sign-in and revoke it in the worker.
- **Paid prize records after 5 years.** They are detached at erasure but not
  yet purged when the 5 years end; add that to a reviewed retention job.
- **AGENTS.md job list.** Done: `account-deletion-tick` and
  `account-deletion-history-prune` are in "Check the scheduled jobs too".
