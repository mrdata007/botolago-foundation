# Push notifications — the sending side

Status: **steps 1 and 2 of the sending side are in; nothing has reached a phone.**
The kick-off reminder and the 24-hour Fantasy deadline can now be queued for each
phone and sent by the dispatcher, but the switch ships **off**, the function is
not deployed and no phone can register a token yet. Read this before switching
anything on.

The plan this follows is the owner's of 2026-10-04: Android through Google's FCM,
iPhone through Apple's APNs directly, the keys held by the owner and kept only as
Supabase secrets.

## What exists

| Piece                                                   | Where                                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| The switch: `off` (default), `testers`, `live`          | `app_private.notification_push_settings`, changed only by `app_private.notification_push_configure(mode, tester_ids)` (postgres only) |
| What the dispatcher claims                              | `api.service_claim_push_deliveries(limit, lease)` (service role only)                                                                 |
| Handing claimed pushes back without spending an attempt | `api.service_release_push_deliveries(ids, retry_at)`                                                                                  |
| Recording an outcome, turning off a dead device         | the existing `api.service_record_notification_delivery_attempt` and `api.service_invalidate_notification_device`                      |
| The dispatcher                                          | Edge Function `notification-push-dispatch` (`supabase/functions/_shared/notification-push-*.ts`)                                      |
| Queuing a push per phone for a planned moment           | `app_private.notification_push_fanout(...)` (postgres only)                                                                           |
| The one-minute job: plan, queue, wake the sender        | `app_private.notification_push_tick()`, scheduled as `notification-push-tick` (does nothing while the switch is off)                  |
| Where to wake the function                              | the email settings' address, else `app_private.notification_push_set_functions_url(url)` (postgres only)                              |
| Step 1: the claim (migration and production script)     | `supabase/migrations/20261005100000_push_delivery_claim.sql`, `scripts/backend/apply-20261005100000-push-delivery-claim.sql`          |
| Step 2: the fan-out and tick (migration and script)     | `supabase/migrations/20261005110000_push_fanout_and_tick.sql`, `scripts/backend/apply-20261005110000-push-fanout-and-tick.sql`        |

## What does not exist yet

Nothing reaches a phone until these are done:

1. **The other moments**: the 1-hour Fantasy deadline (it has no text yet, in French or Arabic), full time for followed clubs, and goals with a "goal cancelled" correction (a new notification type, with text in both languages). Each needs its own producer.
2. **The phone side**: asking permission, registering the token (`api.register_my_notification_device` exists), a Push switch in settings, opening an alert on the right page. This needs the Capacitor app shell.
3. **The privacy policy and store forms**: push is not yet in the policy's purposes, and phone tokens have no row in its retention table (`src/content/legal/documents.ts`).
4. **Deploying the Edge Function** `notification-push-dispatch`, and the secrets below. Neither is done by merging the code.

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

1. Merge the branch. Rehearse, then apply, `apply-20261005100000-push-delivery-claim.sql` and then `apply-20261005110000-push-fanout-and-tick.sql` (each ships as a rehearsal; the second refuses to run while push is on).
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
2. **Queues** one push per working phone of every reader who wants it. A reader wants a kick-off reminder with push, notifications and match alerts on and a favourite, followed or subscribed club in the match; a deadline reminder with push, notifications and Fantasy reminders on. Not deleted, banned or anonymous; at least one working device.
3. **Wakes** the sender only when something can be sent now.

Push and email share one notification per reader per moment, so the in-app inbox
shows it once and no email is lost:

- While the email fan-out is running for a moment, push **waits until it has finished** with it, then attaches its pushes to the notification email made.
- It makes the notification itself only for readers email did not reach (push on, email off), and when email is off altogether it does not wait.
- Quiet hours move a push's `next_retry_at` to the end of the reader's quiet hours; the claim hands it out then, unless its moment has passed first, in which case it is cancelled as expired.
- Running again queues nothing new, and a phone registered later gets its push on the same notification.

## What the claim guarantees

- **Off means off.** With the switch off a claim returns nothing and changes nothing.
- **Only real providers.** Only `push` deliveries of `fcm` and `apns` are touched, never the dormant `fixture` provider, email or in-app rows. The generic worker's claim (`service_claim_notification_deliveries`) still must not run in production.
- **Only what may be pushed.** A type is pushed only if `app_private.notification_push_topic` names it: today `match_starting`, `goal`, `full_time`, `followed_team_result` (match alerts) and `deadline_24h`, `deadline_1h` (Fantasy reminders). Account, security, news and system messages are never pushed, whatever creates a delivery for them. Adding a type is a later migration, on purpose.
- **Cancelled, never sent late.** A waiting push is cancelled (`push_no_longer_eligible`) if the reader switched push, notifications or the topic off, the account is deleted, or the device was turned off or lost its token; and cancelled (`push_expired`) once its moment passes: a goal after 10 minutes, a kick-off alert after kick-off (20 minutes at most), a full-time result after 30, a 1-hour deadline after 30, a 24-hour deadline after 2 hours. The same life is told to Google and Apple, so a phone that was offline drops the alert instead of showing it late.
- **Quiet hours** are applied when the push is queued, by setting its `next_retry_at` to the end of the reader's quiet hours; the claim never hands out a push before `next_retry_at` (or before the notification's `available_at`).
- **Testers mode** claims only the listed accounts' pushes; everyone else's wait (and expire).
- **Order**: retries first, then goals, kick-off alerts, 1-hour deadlines, full-time results, 24-hour deadlines.

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

- The database functions were run on a throwaway Postgres 16 holding all of this repository's migrations, with stand-ins for the Supabase platform pieces (roles, `auth`, `cron`, `net`, `vault`, `storage`) and a minimal stand-in for pgTAP. `supabase/tests/database/push_delivery_claim.test.sql` (38 checks) and `supabase/tests/database/push_fanout.test.sql` (40 checks) passed there, and each fails when the code under test is deliberately broken (for instance, with the email-ordering rule removed, a reader's email is silently lost and the test says so). **CI's `database-quality` job (the real pgTAP on the real stack) has not run them** and is the authority.
- Both production scripts were rehearsed and applied, in order, on a second throwaway database: the rehearsal saves nothing, the real run applies, a second run refuses, the second refuses if push is on or the first has not been applied.
- `scripts/backend/push-dispatch-e2e.test.ts` runs the real planner, tick, database functions and dispatcher together with fake providers, including the whole chain from a planned match to a recorded send (opt-in: `PUSH_DISPATCH_E2E_DB_URL`). It is not in CI yet; add it to `database-quality` once it has been shown to pass on that stack.
- **No push has been sent to a real phone**, neither provider has been called, and the function has not been deployed: the senders are tested against fake replies, with real keys generated in the test to check every signature.
