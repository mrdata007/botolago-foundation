# Email notifications

Built 2026-09-24 from the owner's request: emails before the matches, after the
matches, and at four more moments. Everything ships **switched off**; this page
is how it gets switched on, watched and paused.

## What users get

| Email               | When (Morocco time)                                                                                          | Who                                                                    | Switch that stops it |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------- |
| Match-day preview   | 10:00 on each match day (or 2 h before the first kick-off if earlier, not before 07:00)                      | everyone with Match alerts on                                          | Match alerts         |
| Match-day results   | once every match of the day has a result; if that is after midnight, at 08:00; never after noon the next day | everyone with Match alerts on                                          | Match alerts         |
| Round preview       | 10:00, three days before a round's first match                                                               | everyone with Match alerts on                                          | Match alerts         |
| Kick-off alert      | one hour before kick-off                                                                                     | fans of a club playing (favourite club, followed team or subscription) | Match alerts         |
| Fantasy deadline    | 24 h before each gameweek deadline, only if that deadline is confirmed                                       | everyone with Fantasy reminders on                                     | Fantasy reminders    |
| Fantasy round recap | when the gameweek's points are final                                                                         | every Fantasy manager with Fantasy reminders on                        | Fantasy reminders    |

On top of the topic switches, every email needs: email notifications on (the
**E-mails** switch on the Fantasy page, or Profile → Notifications), a
confirmed email address, and a non-deleted account. Email is **on by default**
(owner decision, 2026-09-24); the migration switched existing users on except
anyone who had ever changed their notification preferences. Every email has an
unsubscribe link (`/unsubscribe?token=…`, one confirmed tap, no sign-in) and a
one-click `List-Unsubscribe` header (RFC 8058): Gmail, Yahoo and Apple Mail
show their own "Unsubscribe" button, which POSTs to the Edge Function
`notification-email-unsubscribe`. That button matters on the free plan: Resend
pauses an account whose spam-complaint rate goes above 0.08 % (about one
"Report spam" per 1,250 emails), and a reader who can unsubscribe in one tap
does not report spam.

## Free plan (owner decision, 2026-09-24)

Resend's free plan allows **100 emails per UTC day** (the day resets at 00:00
UTC, 01:00 in Morocco) and **3,000 per month**. The database enforces both
before anything is sent:

- Each day, 10 emails are kept back (`daily_email_reserve`) for account emails
  (sign-up, password reset) in case Auth mail is moved to the same Resend
  account — so notifications use at most 90 a day.
- Everything Resend has accepted counts, plus anything being sent right now.
- When the allowance is short, the most time-critical emails go first:
  kick-off alert, Fantasy deadline, match-day preview, match-day results,
  Fantasy recap, round preview. Within one kind the order is shuffled, so the
  same readers are not always the ones left waiting.
- Mail that is still waiting when its moment passes is cancelled, never sent
  late. Mail that fits when the quota resets goes out then.
- If Resend still answers "daily/monthly quota exceeded" (for example because
  Auth mail used it), sending pauses until the quota resets instead of failing
  every waiting email.

With about 23 people on email today, a match day needs roughly 50 emails (the
preview and the results for each person, plus a few kick-off alerts) and a
month roughly 1,000. The free plan runs out at around **40 people on email
per match day** or **70 over a month**; past that, the least urgent emails
(round preview first) start being skipped. Check where you stand with the
`quota` block of `api.service_notification_email_health()`. After upgrading
the plan, raise the limits:

```sql
select app_private.notification_email_configure('live', null, null, null, null,
  1000000,   -- daily limit (paid plans have none)
  50000,     -- monthly limit of the paid plan
  0);        -- no daily reserve needed
```

French or Arabic follows the account's language. Times are shown in the
account's notification timezone (default `Africa/Casablanca`). A match whose
kick-off is still the provider's 00:00 UTC placeholder is listed as "time to be
confirmed" and never decides when an email goes out. Postponed and cancelled
matches are left out of previews and marked in results.

Nobody gets the same email twice: each moment has a de-duplication key
(`email:<type>:<date|round|fixture|gameweek>`), each user one notification per
moment, each notification one email, and the provider call carries the
delivery id as its idempotency key. A moment that could not be sent in time is
cancelled, never sent late.

## How it works

```
pg_cron  notification-email-tick   every 5 min ─┐
         app_private.notification_email_tick()  │
           1. plan    → app_private.notification_events   (one row per due moment)
           2. fan out → app.notifications + app.notification_deliveries
                        (channel email, provider_key resend, status pending)
           3. wake    → pg_net POST …/functions/v1/notification-email-dispatch
                        header x-botolago-scheduler-token
Edge Function notification-email-dispatch
           verify token → api.service_verify_scheduler_token
           claim        → api.service_claim_email_deliveries  (re-checks eligibility,
                          cancels stale mail, adds an unsubscribe token)
           render       → supabase/functions/_shared/notification-email-render.ts
           send         → Resend  POST https://api.resend.com/emails
           record       → api.service_record_notification_delivery_attempt
                          (retries 5× with backoff, then the dead-letter queue)

pg_cron  football-live-refresh      every minute
         app_private.football_live_refresh_tick() — calls every 2 min while a
         match is in play (or past kick-off), every 5 min in the 10 min before a
         kick-off, never otherwise → Edge Function football-live-refresh → the
         same SportsMonks fixture handler the orchestrator uses, for
         yesterday–tomorrow.
```

The live refresh exists because the GitHub orchestrator, scheduled hourly, ran
only every 2–5 hours in the week of 2026-09-21; without it the results email
could arrive hours after the final whistle. The cadence (2 min in play, 5 min before
kick-off, nothing otherwise) is migration
`20260924200500_football_live_refresh_cadence.sql`; a two-hour match costs
about 60 SportsMonks requests. `app_private.football_live_refresh_heartbeat`
holds the last call, and the ops health check `live_scores` fails when a
match is in play and no fixture refresh ran for 10 minutes.

Code: migrations `20260924140000_notification_email_types.sql` and
`20260924140100_notification_email_delivery.sql`; Edge Functions
`notification-email-dispatch` and `football-live-refresh` with their logic in
`supabase/functions/_shared/`; the contract between them in
`notification-email-types.ts`.

## Switches

One row, `app_private.notification_email_settings`, changed only through
`app_private.notification_email_configure(mode, functions_base_url,
test_user_ids, football_live_refresh_enabled, max_emails_per_run,
daily_email_limit, monthly_email_limit, daily_email_reserve)` (postgres role; a
`null` argument keeps the current value; every call is audited).

| Setting                         | Values                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `mode`                          | `off` (default: nothing planned or sent), `test` (only `test_user_ids` are emailed), `live` (everyone eligible) |
| `functions_base_url`            | `https://<project-ref>.supabase.co/functions/v1`; nothing is called until it is set                             |
| `football_live_refresh_enabled` | `false` by default; independent of `mode`                                                                       |
| `max_emails_per_run`            | emails created per 5-minute tick, default 250                                                                   |
| `daily_email_limit`             | provider emails per UTC day, default 100 (Resend free plan)                                                     |
| `monthly_email_limit`           | provider emails per UTC month, default 3000 (Resend free plan)                                                  |
| `daily_email_reserve`           | kept back each day for account emails, default 10                                                               |
| `provider_paused_until`         | set by the dispatcher when Resend refuses (quota, key); nothing is sent until then                              |

The first switch away from `off` records `activated_at`; notification events
older than that are never emailed, so the existing backlog stays unmailed.

## Switching it on (production)

Owner steps are marked **(you)**. Every database step is a production write:
it follows `CLAUDE.md` (owner authorisation for that operation, dry run first)
and `AGENTS.md` (nothing else writing at the same time).

1. **(you) Resend account and domain.** Create an account at resend.com.
   Domains → Add domain → `botolago.com`, **region EU (Ireland, eu-west-1)** —
   the privacy policy names that region. Copy the DNS records Resend shows
   (SPF, DKIM, MX for the bounce subdomain) into the DNS settings where
   botolago.com is registered, then wait for "Verified".
2. **(you) API key.** Resend → API Keys → Create, permission "Sending access",
   domain botolago.com. Paste it in Supabase → Edge Functions → Secrets as
   `RESEND_API_KEY` (never in the chat, a file or a `VITE_` variable).
   Optional secrets: `EMAIL_FROM` (default `BotolaGO <notifications@botolago.com>`),
   `EMAIL_REPLY_TO` (default `support@botolago.com`), `APP_URL` (default
   `https://botolago.com`). `football-live-refresh` needs `SPORTSMONKS_API_TOKEN`,
   which `football-ingest` already uses; check it is set.
3. **Migrations.** Apply the two migrations in order. The second one turns
   email on for existing accounts (see above) and creates the two pg_cron jobs,
   which do nothing while `mode` is `off`. It also enables `pg_net`.
4. **Edge Functions.** Deploy `notification-email-dispatch`,
   `notification-email-unsubscribe` and `football-live-refresh`
   (`supabase functions deploy <name> --project-ref tkewgajrljbwgwedqsxn`).
   `supabase/config.toml` deploys all three with `verify_jwt = false`: pg_cron
   authenticates with the scheduler token the migration generated inside
   Vault, and mail providers call the unsubscribe endpoint with nothing but
   the email's own token.
5. **Test mode** with the owner's own account:
   ```sql
   select app_private.notification_email_configure(
     'test',
     'https://tkewgajrljbwgwedqsxn.supabase.co/functions/v1',
     array['<owner user id>']::uuid[],
     true  -- faster results
   );
   ```
   Watch one match day: the owner should receive the preview, the results and
   (if their favourite club plays) the kick-off alert.
6. **Live:** `select app_private.notification_email_configure('live');`

**(you) Recommended, same Resend account:** Supabase → Authentication → Emails
→ SMTP settings → host `smtp.resend.com`, port `465`, user `resend`, password =
a Resend API key, sender `noreply@botolago.com`. This ends the built-in
sender's few-emails-an-hour limit on sign-ups and password resets (BG-0108).
Then update the "Supabase Auth" row of the privacy policy (see
`src/content/legal/legal-content.test.ts`, item 8).

## Watching it

```sql
-- one line of status
select api.service_notification_email_health();   -- service role; or read the tables:
select * from app_private.notification_email_heartbeat;
select * from app_private.notification_email_runs order by started_at desc limit 20;
-- what went out today
select notification.notification_type, delivery.status, count(*)
from app.notification_deliveries delivery
join app.notifications notification on notification.id = delivery.notification_id
where delivery.channel = 'email' and delivery.created_at > now() - interval '1 day'
group by 1, 2 order by 1, 2;
-- Edge Function calls made by pg_net (kept ~6 h)
select id, status_code, created from net._http_response order by created desc limit 20;
```

Failures keep only stable codes (`delivery_rate_limited`,
`delivery_provider_error`, `delivery_rejected_invalid`,
`email_no_longer_eligible`, …) — never an address or a provider message. A
wrong or revoked API key, or an unverified domain, stops the pass and pauses
sending for 30 minutes (`delivery_provider_unavailable`); "quota exceeded"
pauses until the quota resets (`delivery_quota_exceeded`). To lift a pause by
hand once the cause is fixed:
`update app_private.notification_email_settings set provider_paused_until = null, provider_pause_reason = null;` Dead letters are in
`app_private.notification_dead_letters` and replay with
`api.service_request_notification_dead_letter_replay`.

**Live scores only (email stays off).** Check first that Supabase → Edge
Functions → Secrets lists `SPORTSMONKS_API_TOKEN`, then:

```sql
select app_private.notification_email_configure(
  'off',                                                   -- email stays off
  'https://tkewgajrljbwgwedqsxn.supabase.co/functions/v1',
  null,
  true                                                     -- live scores on
);
```

`mode` is required (`'off'`, `'test'` or `'live'`); the other `null`
arguments keep their current value. Watch the next match:
`select * from app_private.football_live_refresh_heartbeat;` shows the last
call, `select status_code, created from net._http_response order by created
desc limit 5;` the Edge Function's answers (200 expected), and
`select job_type, status, error_code, started_at from
app_private.football_ingestion_runs order by started_at desc limit 5;` the
fixture runs it made. Switch off with the same call and `false`.

**Pause everything:** `select app_private.notification_email_configure('off',
null, null, false);` Queued mail waits; anything whose moment passes while
paused is cancelled when sending resumes.

## Limits

- The free-plan limits above: past about 40 people on email, some of the
  least urgent emails are skipped on busy days (see "Free plan").
- Resend pauses sending for any account with a bounce rate above 4 % or a
  spam-complaint rate above 0.08 %.
- No live-event emails (goals, half-time): that is a job for push.
- Bounces and spam complaints show in Resend's dashboard; there is no webhook
  back into the database yet, so an address that bounces is not switched off
  automatically.
- The live refresh uses Botola Pro 2026/27 at SportsMonks (league 860, season
  28647). Set `FOOTBALL_LIVE_SEASON_ID` when the season changes.
- The generic Phase 5 worker (`src/backend/notifications/worker/`) must not be
  run against production: its claim RPC would also pick up these `resend`
  deliveries, which it cannot send.

## Tests

- `supabase/tests/database/notification_email_delivery.test.sql` — planning at
  the right local time, eligibility, test mode, no duplicates, stale mail
  cancelled, claiming, unsubscribe, grants.
- `supabase/functions/_shared/notification-email-dispatch.test.ts`,
  `football-live-refresh.test.ts`, `notification-email-render.test.ts`.
- Previews of all 12 emails (6 types × French/Arabic):
  `bun scripts/backend/notification-email-previews.ts <output-dir>`.
