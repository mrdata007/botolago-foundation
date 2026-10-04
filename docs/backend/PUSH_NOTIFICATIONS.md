# Push notifications — the sending side

Status: **the sending side is complete; nothing has reached a phone.**
All six moments (the kick-off reminder, the 1-hour and 24-hour Fantasy
deadlines, the final score, goals, and the "goal cancelled" correction) can be
queued for each phone and sent by the dispatcher, but the switch ships **off**,
the function is not deployed and no phone can register a token yet. Read this
before switching anything on.

The plan this follows is the owner's of 2026-10-04: Android through Google's FCM,
iPhone through Apple's APNs directly, the keys held by the owner and kept only as
Supabase secrets.

## What exists

| Piece                                                   | Where                                                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The switch: `off` (default), `testers`, `live`          | `app_private.notification_push_settings`, changed only by `app_private.notification_push_configure(mode, tester_ids)` (postgres only)  |
| What the dispatcher claims                              | `api.service_claim_push_deliveries(limit, lease)` (service role only)                                                                  |
| Handing claimed pushes back without spending an attempt | `api.service_release_push_deliveries(ids, retry_at)`                                                                                   |
| Recording an outcome, turning off a dead device         | the existing `api.service_record_notification_delivery_attempt` and `api.service_invalidate_notification_device`                       |
| The dispatcher                                          | Edge Function `notification-push-dispatch` (`supabase/functions/_shared/notification-push-*.ts`)                                       |
| Queuing a push per phone for a planned moment           | `app_private.notification_push_fanout(...)` (postgres only)                                                                            |
| Planning the moments only push uses                     | `app_private.notification_push_plan(now)` (postgres only; writes events, sends nothing)                                                |
| The one-minute job: plan, queue, wake the sender        | `app_private.notification_push_tick()`, scheduled as `notification-push-tick` (does nothing while the switch is off)                   |
| Where to wake the function                              | the email settings' address, else `app_private.notification_push_set_functions_url(url)` (postgres only)                               |
| Step 1: the claim (migration and production script)     | `supabase/migrations/20261005100000_push_delivery_claim.sql`, `scripts/backend/apply-20261005100000-push-delivery-claim.sql`           |
| Step 2: the fan-out and tick (migration and script)     | `supabase/migrations/20261005110000_push_fanout_and_tick.sql`, `scripts/backend/apply-20261005110000-push-fanout-and-tick.sql`         |
| Step 3a: the `goal_cancelled` type, alone               | `supabase/migrations/20261005120000_push_goal_cancelled_type.sql`, `scripts/backend/apply-20261005120000-push-goal-cancelled-type.sql` |
| Step 3b: the other moments, their text and rules        | `supabase/migrations/20261005130000_push_remaining_alerts.sql`, `scripts/backend/apply-20261005130000-push-remaining-alerts.sql`       |

## What does not exist yet

Nothing reaches a phone until these are done:

1. **The phone side**: asking permission, registering the token (`api.register_my_notification_device` exists), a Push switch in settings, opening an alert on the right page. This needs the Capacitor app shell.
2. **The privacy policy and store forms**: push is not yet in the policy's purposes, and phone tokens have no row in its retention table (`src/content/legal/documents.ts`).
3. **Deploying the Edge Function** `notification-push-dispatch`, and the secrets below. Neither is done by merging the code.
4. **The owner's read of the new wording.** The French and Arabic text of the 1-hour deadline, the goal (second edition) and the goal correction is new and written by the engineering side; have a native Arabic reader check it before push goes live (the texts are rows in `app.notification_templates`, so a change is a new version, not a deploy).

## Secrets (Supabase → Edge Functions → Secrets)

A provider without its secrets is simply not used: its pushes wait, and the
function's reply names it under `unconfigured`.

| Secret                     | What it is                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FCM_SERVICE_ACCOUNT_JSON` | The whole JSON of a Google service-account key with permission to send FCM messages (Firebase console → Project settings → Service accounts → Generate new private key) |
| `APNS_KEY_P8`              | The contents of the Apple push key (.p8) (Apple Developer → Keys, with Apple Push Notifications service ticked; downloadable once)                                      |
| `APNS_KEY_ID`              | That key's 10-character id                                                                                                                                              |
| `APNS_TEAM_ID`             | The Apple developer team id (10 characters)                                                                                                                             |
| `APNS_BUNDLE_ID`           | The app's bundle id: Apple's `apns-topic`                                                                                                                               |
| `APNS_ENVIRONMENT`         | Optional: `production` (default) or `sandbox`. A development build's token only works against `sandbox`                                                                 |

Never commit these, paste them in chat, or log them. The code never logs a key,
a device token, a title or a body; its reply carries counts only.

## Switching it on (owner only)

In this order. Each step is safe on its own; nothing is sent until the last.

1. Merge the branch. Rehearse, then apply, in this order, `apply-20261005100000-push-delivery-claim.sql`, `apply-20261005110000-push-fanout-and-tick.sql`, `apply-20261005120000-push-goal-cancelled-type.sql` and `apply-20261005130000-push-remaining-alerts.sql`. Each ships as a rehearsal. Each refuses to run before the ones it builds on are **saved** (the last one needs the type script committed, because a new enum value cannot be used in the transaction that adds it), and the fan-out and remaining-alerts scripts refuse to run while push is on.
2. Deploy the Edge Function `notification-push-dispatch` and set its secrets (below).
3. Check the tick knows where to wake the function. If email was configured it already does. If not:
   `select app_private.notification_push_set_functions_url('https://<project>.supabase.co/functions/v1');`
4. A few accounts first, then everyone:

```sql
select app_private.notification_push_configure('testers', array['<user id>'::uuid]);
select app_private.notification_push_configure('live');
-- Off again, at any time:
select app_private.notification_push_configure('off');
```

A moment from before the switch was turned on is never pushed late, so there is
no burst when it is switched on. Go through the activation checklist in
`NOTIFICATIONS_OPERATIONS_RUNBOOK.md` first, on staging.

Real phones need the app shell and its token registration as well: until then
the switch has nobody to send to.

## How an alert is created

Every minute, while the switch is not off, `notification_push_tick`:

1. **Plans** the moments when email will not (email switched off): the kick-off reminder an hour before a match someone follows, and the 24-hour Fantasy deadline. The planner only writes events; it sends nothing. While email is on, the email tick plans them.
2. **Plans** the moments only push uses (whether or not email is on), described below.
3. **Queues** one push per working phone of every reader who wants it. A reader wants a kick-off reminder, goal, correction or result with push, notifications and match alerts on and a favourite, followed or subscribed club in the match; a deadline reminder with push, notifications and Fantasy reminders on. Not deleted, banned or anonymous; at least one working device.
4. **Wakes** the sender only when something can be sent now.

Push and email share one notification per reader per moment, so the in-app inbox
shows it once and no email is lost:

- While the email fan-out is running for a moment, push **waits until it has finished** with it, then attaches its pushes to the notification email made.
- It makes the notification itself only for readers email did not reach (push on, email off), and when email is off altogether it does not wait.
- Quiet hours move a push's `next_retry_at` to the end of the reader's quiet hours; the claim hands it out then, unless its moment has passed first, in which case it is cancelled as expired.
- Running again queues nothing new, and a phone registered later gets its push on the same notification.

## The moments only push uses

Planned by `notification_push_plan` each tick, once per moment (each has its own deduplication key, so planning again changes nothing):

| Moment              | When it is planned                                                                                                                                                                                                                                                                                                                                                                                  | Lives for                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **1-hour deadline** | An open or scheduled gameweek whose deadline is 50 to 65 minutes away, and whose first match has a confirmed kick-off time                                                                                                                                                                                                                                                                          | 30 minutes, and never within 5 minutes of the deadline |
| **Final score**     | A current-season match that is `finished`, kicked off in the last 6 hours, whose row last changed in the last 20 minutes, in a match someone follows                                                                                                                                                                                                                                                | 30 minutes                                             |
| **Goal**            | A goal, own goal or penalty on the match sheet stored in the last 8 minutes, in a live or just-finished match that kicked off in the last 4 hours, in a match someone follows. The scoreboard must count it (at least as many goals as the sheet lists up to and including it). Shoot-out kicks are not goals. A goal far behind the match clock (10 minutes or more) is a backfill and is not told | 10 minutes                                             |
| **Goal cancelled**  | A goal that was planned in the last 20 minutes, is no longer on the sheet, and the scoreboard no longer counts more goals than the sheet lists. One correction per match per tick, once per goal                                                                                                                                                                                                    | 10 minutes                                             |

How goals are told and corrected (the owner's "option A"):

- The alert shows the scoreboard, so it never disagrees with the match page header. A goal is told by the provider's own key for it (hashed), not by the row's id, so a provider that drops and re-adds an event does not cause a second alert.
- The ingestion deletes a goal the provider stops reporting. If a goal that was told is gone from the sheet **but the scoreboard still counts it**, that is a gap in the sheet, not a ruling: nothing is said until the scoreboard agrees.
- Only phones that were actually told the goal (`sent` or `delivered`) get the correction, and it reaches the same phones, not one registered since. A goal alert still waiting to be sent (for instance held for quiet hours) is withdrawn (`push_goal_cancelled`), so that reader never hears of the goal or its cancellation.
- A goal that comes back after being cancelled is on the match page again but is **not told a second time**. If two goals are ruled out together, the corrections go one per tick.
- Quiet hours apply: a goal alert held until quiet hours end has expired by then and is cancelled, never sent late.
- While only testers are on, these moments stay open so they still reach everyone if push goes live before their time is up; once live, a moment that has been through every reader is marked completed, and one whose time passes first is cancelled (`push_window_passed`).

Known limits, kept on purpose: a goal the sheet lists more than 8 minutes after it was stored, or while the scoreboard is behind for longer than that, is not told; a final score is not told for a match the app only learns finished long after the whistle; and a provider that deletes a goal and adds a replacement with a new key in the same refresh can produce a goal alert and a correction together.

## What the claim guarantees

- **Off means off.** With the switch off a claim returns nothing and changes nothing.
- **Only real providers.** Only `push` deliveries of `fcm` and `apns` are touched, never the dormant `fixture` provider, email or in-app rows. The generic worker's claim (`service_claim_notification_deliveries`) still must not run in production.
- **Only what may be pushed.** A type is pushed only if `app_private.notification_push_topic` names it: today `match_starting`, `goal`, `goal_cancelled`, `full_time`, `followed_team_result` (match alerts) and `deadline_24h`, `deadline_1h` (Fantasy reminders). (`followed_team_result` is named but nothing creates it: the final score uses `full_time`.) Account, security, news and system messages are never pushed, whatever creates a delivery for them. Adding a type is a later migration, on purpose.
- **Cancelled, never sent late.** A waiting push is cancelled (`push_no_longer_eligible`) if the reader switched push, notifications or the topic off, the account is deleted, or the device was turned off or lost its token; and cancelled (`push_expired`) once its moment passes: a goal or its correction after 10 minutes, a kick-off alert after kick-off (20 minutes at most), a full-time result after 30, a 1-hour deadline after 30, a 24-hour deadline after 2 hours. The same life is told to Google and Apple, so a phone that was offline drops the alert instead of showing it late.
- **Quiet hours** are applied when the push is queued, by setting its `next_retry_at` to the end of the reader's quiet hours; the claim never hands out a push before `next_retry_at` (or before the notification's `available_at`).
- **Testers mode** claims only the listed accounts' pushes; everyone else's wait (and expire).
- **Order**: retries first, then goals and their corrections, kick-off alerts, 1-hour deadlines, full-time results, 24-hour deadlines.

## What the dispatcher does with a reply

| The provider says                                                      | It records                              | And                                                                                                        |
| ---------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| accepted                                                               | `sent`                                  |                                                                                                            |
| the token is dead (FCM `UNREGISTERED`, APNs `410`/`BadDeviceToken`)    | permanent failure                       | turns the device off                                                                                       |
| slow down, or an outage                                                | retryable, honouring `Retry-After`      | up to 4 attempts, then a dead letter                                                                       |
| our key or setup is wrong (rejected login, `BadTopic`, a disabled API) | nothing: the pushes are **handed back** | stops using that provider for the pass and holds its pushes for 15–30 minutes, without spending an attempt |
| no credentials for that provider                                       | nothing: handed back                    | holds them for 10 minutes                                                                                  |

Stable error codes: `fcm_unregistered`, `fcm_token_invalid`, `fcm_sender_mismatch`,
`fcm_invalid_argument`, `fcm_rate_limited`, `fcm_unavailable`, `fcm_network_error`,
`fcm_credentials_rejected`, `fcm_configuration_rejected`, `fcm_key_unreadable`,
`apns_unregistered`, `apns_bad_device_token`, `apns_device_token_not_for_topic`,
`apns_token_malformed`, `apns_rate_limited`, `apns_unavailable`,
`apns_network_error`, `apns_credentials_rejected`, `apns_configuration_rejected`,
`apns_key_unreadable`, `push_payload_invalid`, `push_send_failed`.

## How it was checked

- The database functions were run on a throwaway Postgres 16 holding all of this repository's migrations, with stand-ins for the Supabase platform pieces (roles, `auth`, `cron`, `net`, `vault`, `storage`) and a minimal stand-in for pgTAP. `supabase/tests/database/push_delivery_claim.test.sql` (38 checks), `supabase/tests/database/push_fanout.test.sql` (40 checks) and `supabase/tests/database/push_remaining_alerts.test.sql` (57 checks) passed there, and each fails when the code under test is deliberately broken (for instance, with the email-ordering rule removed, a reader's email is silently lost and the test says so; with the "scoreboard must agree" rule removed, a goal missing from the sheet is announced as cancelled; with the withdrawal of unsent goal alerts removed, a reader is told of a goal and never of its cancellation). 27 such breakages of the remaining-alerts migration were tried; 26 are caught by the new test and the last (skipping the staleness check for a kick-off alert) by the earlier fan-out test. **CI's `database-quality` job (the real pgTAP on the real stack) has not run them** and is the authority.
- All four production scripts were rehearsed and applied, in order, on a second throwaway database: each rehearsal saves nothing, each real run applies, a second run refuses, each refuses if a step it builds on has not been saved, and the fan-out and remaining-alerts scripts refuse if push is on. The last script also runs the planner and the fan-out once against the database in a step that is rolled back.
- `scripts/backend/push-dispatch-e2e.test.ts` runs the real planner, tick, database functions and dispatcher together with fake providers, including the whole chain from a planned match to a recorded send, and from a goal on the match sheet, to each phone, to its cancellation and the correction to the same phones (opt-in: `PUSH_DISPATCH_E2E_DB_URL`). It is not in CI yet; add it to `database-quality` once it has been shown to pass on that stack.
- **No push has been sent to a real phone**, neither provider has been called, and the function has not been deployed: the senders are tested against fake replies, with real keys generated in the test to check every signature.
