# Reminder delivery evidence (staging protocol)

Written 2026-10-15 for audit roadmap item D3 (finding PRO-04). Nothing in this
document has been run: no query, no switch, no message. Every check below is
marked NOT RUN until the owner runs it and pastes the result.

## Purpose

Show, with an owner-controlled test account on **staging** (`BotolaGO Staging V2`,
`srdrflfrfpwixsllveid`, see `docs/backend/ENVIRONMENTS.md`), that an opt-in
reminder is:

1. delivered **once** per channel, at the **right Morocco time**;
2. only sent through channels the account allows (email off means no email, and
   the screen's wording matches what happens);
3. followed by a round recap whose points can be traced to the Fantasy points page.

Production is never used. Until this evidence exists, reminders are described as a
saved setting, never a promise (`docs/backend/EMAIL_NOTIFICATIONS.md`, "Known gap").

## What the code does (read from the files named)

- **Match reminder** (bell "Me rappeler ce match"): the kick-off email is planned when the
  kick-off is confirmed and 10 to 65 minutes away (`notification_email_plan`, migration
  `20260924140100`), for readers with notifications, email, Match alerts and a confirmed
  address.
- **Fantasy deadline email** (`deadline_24h`): planned once the deadline is 24 hours away
  or less, only if the first kick-off is confirmed; dropped within 30 minutes of it.
- **Round recap** (`gameweek_finalized`): one event per Fantasy team, written by the
  Fantasy lifecycle when the gameweek is final (`FANTASY_FINALIZED_NOTIFICATIONS.md`);
  one email per person per gameweek; ignored after 72 hours.
- **In-app inbox** (`/notifications`): rows are created only by the email fan-out (email
  eligible) or the push fan-out (push on, email off); there is no separate inbox pipeline.
  Push never carries the recap. Push itself is off, undeployed and has no registered phone
  (`PUSH_NOTIFICATIONS.md`, "What does not exist yet"), so push evidence is blocked.
- **Once**: one notification per event and person, one delivery per channel; a late
  moment is cancelled, never sent late.
- **Morocco time**: the repository treats Morocco as UTC+0 all year from 2026-09-20
  (`src/lib/morocco-time.ts`). Its legal source appears only in code comments and
  `docs/product/PRODUCT_CONTEXT_2026-10-05.md` lists it as unconfirmed. The email
  renderer follows the app's rule; the in-app deadline text and the 10:00 planning use the
  database's own time-zone data, which may be older. Step 1 checks this.

## Steps

### 1. Read-only checks before anything (all NOT RUN)

```sql
-- Switches, clock and whether the tick job exists
select mode, test_user_ids, functions_base_url is not null as url_set,
       football_live_refresh_enabled, activated_at, provider_paused_until
from app_private.notification_email_settings;
select jobname, schedule, active from cron.job
where jobname in ('notification-email-tick', 'notification-push-tick');
-- Does the database follow the app's Morocco rule? 12:00 = yes (UTC+0), 13:00 = older data
select timestamptz '2026-10-15 12:00+00' at time zone 'Africa/Casablanca';
-- The test accounts' settings: notifications, email, push, match_alerts,
-- fantasy_deadline_reminders, notification_timezone (ids to replace)
select pr.* from app.user_preferences pr where pr.user_id = any(array['<id>']::uuid[]);
select id, email_confirmed_at is not null as confirmed from auth.users
where id = any(array['<id>']::uuid[]);
```

Also read in the dashboards: `notification-email-dispatch` deployed, secrets
`RESEND_API_KEY` and `BOTOLAGO_SCHEDULER_TOKEN` set, Resend domain verified. If any is
missing, stop: the result is "not deliverable on staging today".

### 2. One writer first (`AGENTS.md`, "One writer at a time")

Switching test mode on is a write to a shared database. Before it:

- List other agents, workflows and Actions runs (the Fantasy orchestrator and football
  recovery run on schedules). Wait for any to finish.
- Record the current values read in step 1 and these, to restore afterwards:
  `select lifecycle_tick_enabled from app_private.fantasy_automation_settings;`
  `select compute_enabled, notify_ovr_changes from app_private.manager_card_settings;`
- Pause what also writes notifications or moves kick-offs (commands from `AGENTS.md`):
  `select app_private.manager_card_notify_configure(false);`
  and, for tests A and B only (not C), `select app_private.fantasy_automation_configure(false);`
- Take a baseline row count of `app.notifications` and `app.notification_deliveries`
  now, and again after the test.
- The owner authorises and runs each write (`CLAUDE.md`). Restore every value afterwards.

Then use test mode, listing every test account, **including the email-off account**
(otherwise test mode, not the preference, would explain its silence):

```sql
select app_private.notification_email_configure('test',
  'https://srdrflfrfpwixsllveid.supabase.co/functions/v1',
  array['<on-account>', '<email-off-account>']::uuid[], false);
```

The last argument `false` keeps fixtures still (live refresh paused). Afterwards put back
exactly what step 1 recorded (mode, test ids, live refresh):
`select app_private.notification_email_configure('<mode>', null, array['<ids>']::uuid[], <true|false>);`

### 3. Tests

**A. Match reminder.** Pick a staging match with a confirmed kick-off at least 2 hours
away. With the on-account, tap the bell. Expect the toast to state the setting only.
Wait for the window. Expect: one `match_starting` event, one notification, one `in_app`
delivery `delivered`, one `email` delivery `sent`, one email received 65 to 10 minutes
before kick-off, showing the kick-off time the match page shows (compare with the
kick-off in UTC and the Morocco rule).

**B. Fantasy deadline.** Needs a gameweek whose deadline is more than 24 hours away when
test mode is switched on (otherwise the event is planned late and says nothing about the
24-hour timing). Do not edit the deadline. Expect one `deadline_24h` event, one email
about 24 hours before, and the deadline shown in the email and the inbox text equal to the
deadline on the Fantasy page. Read both against UTC and the Morocco rule.

**C. Recap.** Only possible when a staging gameweek genuinely finalizes after test mode
was switched on; events from before `activated_at` are never mailed. The Fantasy lifecycle
is then the one writer: do not pause it, and run nothing else. Expect one email and one
inbox row per team owner. Trace the points with:

```sql
select gw.sequence_number, r.final_score, r.overall_rank, r.state, r.calculation_version
from app.fantasy_team_gameweek_results r
join app.fantasy_gameweeks gw on gw.id = r.gameweek_id
join app.fantasy_teams t on t.id = r.fantasy_team_id
where t.user_id = '<id>' order by gw.sequence_number desc limit 3;
```

The points in the email and inbox must equal `final_score`, and the same figure must be
on `/fantasy/points` for that round.

**D. Truthfulness.** With email off, then Match alerts off, then notifications off, then
an unconfirmed address: the bell toast must say what `src/lib/delivery-promise.ts` returns
(saved, or email off with an enable action) in French and Arabic, and no email and no
inbox row may appear. Repeat with Fantasy reminders off for test B. Then use the
unsubscribe link in a received email: email goes off for the account, no later email.

**E. Push.** Blocked until a phone build exists and the function is deployed; record "not
testable". Then: `notification_push_configure('testers', ...)`, expect one push per phone
and one shared inbox row, and set it back to `off`.

### 4. Evidence to collect for every test

Keep this output with screenshots (inbox, email, Fantasy page) in French and Arabic:

```sql
select event_type, deduplication_key, occurred_at, received_at, status, sanitized_error_code
from app_private.notification_events
where event_type in ('match_starting', 'deadline_24h', 'gameweek_finalized')
  and received_at > now() - interval '2 days' order by received_at desc;
select n.user_id, n.notification_type, n.created_at, d.channel, d.status, d.sent_at, d.stable_error_code
from app.notifications n left join app.notification_deliveries d on d.notification_id = n.id
where n.user_id = any(array['<id>']::uuid[]) and n.created_at > now() - interval '2 days'
order by n.created_at desc, d.channel;
select event_id, user_id, count(*) from app.notifications
where user_id = any(array['<id>']::uuid[]) group by 1, 2 having count(*) > 1; -- expect no rows
```

## What counts as evidence

- The rows above, the received email with its header time, the screenshots and the
  step 1 clock check, from the same staging run. A failed delivery with its stable error
  code counts too.
- A result taken while another writer was active is re-measured after it stops.

## What we will NOT claim

- That production delivers anything; staging proof says nothing about the production
  switch, secrets or quota.
- That push works, until a real phone receives one.
- That reminders arrive for every reader; the free plan sends at most 90 notification
  emails a day and skips the least urgent first (`EMAIL_NOTIFICATIONS.md`, "Free plan").
- That the Morocco hour is right everywhere, unless the step 1 clock check and the
  email, inbox and Fantasy page times all agree.
- That an email the provider accepted reached other readers' inboxes; there is no bounce
  feedback into the database yet (`EMAIL_NOTIFICATIONS.md`, "Limits").
- That the app can show whether sending is on; it cannot (`EMAIL_NOTIFICATIONS.md`).
