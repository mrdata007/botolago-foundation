# Production: live score refresh switched on (2026-09-24)

The 15-minute live score refresh (`football-live-refresh`) was switched on in
Production V2 (`tkewgajrljbwgwedqsxn`) on 2026-09-24 at 19:15:55 UTC, on the
owner's explicit go-ahead for this one operation. Email notifications stay off.

## Why

Results reached the database hours late. The hourly football job ran every 2 to
8 hours in practice, and the live refresh, which follows a match from ten
minutes before kick-off to the final whistle, had never been switched on.
Pronostics (BG-0146) scores a prediction only once its match is final, so "check
your results" needs the live refresh during match windows. It is useful on its
own too: live scores on the match pages.

Everything else was already in place: the Edge Function `football-live-refresh`
was deployed on 24 Sept, the Vault secret `botolago_scheduler_token` existed, and
the pg_cron job `football-live-refresh` ran every 15 minutes and answered
"disabled". The settings row lacked the functions address and the switch.

## What was run

One settings call, through the function that owns the row
([EMAIL_NOTIFICATIONS.md](../backend/EMAIL_NOTIFICATIONS.md)):

```sql
select app_private.notification_email_configure(
  'off',                                                   -- email stays off
  'https://tkewgajrljbwgwedqsxn.supabase.co/functions/v1', -- functions address
  null,                                                    -- other settings unchanged
  true                                                     -- live refresh on
);
```

The mode is passed as `'off'` explicitly: the function refuses an empty mode
(`notification_email_mode_invalid`).

## Checks

- **Before (19:15:27 UTC):** no pg_cron job was running and no GitHub workflow
  run was in progress or queued (`AGENTS.md`: one writer at a time).
- **Dry run (19:15:4x UTC):** the same call inside a `DO` block ending in a
  deliberate `raise` reported `mode = off`, the functions address set,
  `football_live_refresh_enabled = true` and `activated_at` null. A re-read
  confirmed the rollback held.
- **Applied at 19:15:55 UTC.**
- **After:** email `mode` still `off` and `activated_at` still null (email was
  never activated); the live refresh on; the change logged as audit row #3
  (`notification_email_configured`).
- **19:44 UTC:** the 19:30 run was idle, as expected with no match inside its
  window. Tonight's match, Amal Tiznit – Ittihad Tanger (20:00 UTC), read
  `not_started` 0–0.

The first live calls come with that match. Its result is checked read-only at
20:20 and 22:25 UTC; see "Verification" below.

## Verification

Read-only checks of production, 24 Sept 2026:

- **20:43 UTC, during the match:**
  - `cron.job_run_details`: every `football-live-refresh` run since the switch
    succeeded (19:15, 19:30, 19:45, 20:00, 20:15, 20:30).
  - `net._http_response`: the runs at 20:00, 20:15 and 20:30 called the Edge
    Function and got HTTP 200; each fetched 2 fixtures in its window and
    updated both.
  - Amal Tiznit – Ittihad Tanger read `live_first_half`, 0–1, with
    `provider_updated_at` 20:30:02 UTC: the score is now refreshed during
    play, where it used to wait hours for the hourly job.
- **After the final whistle:** _pending, the 22:25 UTC check-in: the match
  reaches `finished` with `finalized_at` set._

## Undo

```sql
select app_private.notification_email_configure('off', null, null, false);
```

This is the documented "pause everything" call. It keeps the functions address.

## Cost

The refresh calls SportsMonks only while a match is about to start or is being
played: about 4 calls an hour, around 50 on a busy match day.
