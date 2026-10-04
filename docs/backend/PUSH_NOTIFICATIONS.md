# Push notifications — the sending side

Status: **step 1 of the sending side is in; nothing is sent yet.** The dispatcher
can claim and send push notifications, but nothing creates push deliveries and
the switch ships **off**. Read this before switching anything on.

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
| The migration and its production script                 | `supabase/migrations/20261005100000_push_delivery_claim.sql`, `scripts/backend/apply-20261005100000-push-delivery-claim.sql`          |

## What does not exist yet

Nothing is sent until these are built, in this order:

1. **Fan-out**: creating one `push` delivery per enabled device (provider `fcm` or `apns`) when a notification is created, with quiet hours applied through `available_at`.
2. **The wake-up**: a pg_cron tick that calls the function (as `notification-email-tick` does for email). The function claims nothing while the switch is off.
3. **The producers**: kick-off reminder and 24-hour Fantasy deadline first (they already exist for email), then the 1-hour deadline, full time for followed clubs, and goals (with a "goal cancelled" correction).
4. **The phone side**: asking permission, registering the token (`api.register_my_notification_device` exists), a Push switch in settings, opening an alert on the right page. This needs the Capacitor app shell.
5. **The privacy policy and store forms**: push is not yet in the policy's purposes, and phone tokens have no row in its retention table (`src/content/legal/documents.ts`).

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

## Switching it on (owner only, after steps 1–3 above exist)

```sql
-- A few accounts first:
select app_private.notification_push_configure('testers', array['<user id>'::uuid]);
-- Everyone, once the testers have seen it work:
select app_private.notification_push_configure('live');
-- Off again, at any time:
select app_private.notification_push_configure('off');
```

Go through the activation checklist in `NOTIFICATIONS_OPERATIONS_RUNBOOK.md`
first, on staging, and rehearse the production script (it ships as a rehearsal).

## What the claim guarantees

- **Off means off.** With the switch off a claim returns nothing and changes nothing.
- **Only real providers.** Only `push` deliveries of `fcm` and `apns` are touched, never the dormant `fixture` provider, email or in-app rows. The generic worker's claim (`service_claim_notification_deliveries`) still must not run in production.
- **Only what may be pushed.** A type is pushed only if `app_private.notification_push_topic` names it: today `match_starting`, `goal`, `full_time`, `followed_team_result` (match alerts) and `deadline_24h`, `deadline_1h` (Fantasy reminders). Account, security, news and system messages are never pushed, whatever creates a delivery for them. Adding a type is a later migration, on purpose.
- **Cancelled, never sent late.** A waiting push is cancelled (`push_no_longer_eligible`) if the reader switched push, notifications or the topic off, the account is deleted, or the device was turned off or lost its token; and cancelled (`push_expired`) once its moment passes: a goal after 10 minutes, a kick-off alert after kick-off (20 minutes at most), a full-time result after 30, a 1-hour deadline after 30, a 24-hour deadline after 2 hours. The same life is told to Google and Apple, so a phone that was offline drops the alert instead of showing it late.
- **Quiet hours** are applied when the delivery is made, by setting the notification's `available_at` later; the claim never hands out a push before it.
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

- The database functions were run on a throwaway Postgres 16 holding all of this repository's migrations, with stand-ins for the Supabase platform pieces (roles, `auth`, `cron`, `net`, `vault`, `storage`) and a minimal stand-in for pgTAP: `supabase/tests/database/push_delivery_claim.test.sql` (38 checks) passed there, and fails when the claim is deliberately broken. **CI's `database-quality` job (the real pgTAP on the real stack) has not run it** and is the authority.
- The production script was rehearsed and applied on a second throwaway database: the rehearsal saves nothing, the real run applies, a second run refuses.
- `scripts/backend/push-dispatch-e2e.test.ts` runs the real dispatcher against the real database functions with fake providers (opt-in: `PUSH_DISPATCH_E2E_DB_URL`). It is not in CI yet; add it to `database-quality` once it has been shown to pass on that stack.
- **No push has been sent to a real phone**, and neither provider has been called: the senders are tested against fake replies, with real keys generated in the test to check every signature.
