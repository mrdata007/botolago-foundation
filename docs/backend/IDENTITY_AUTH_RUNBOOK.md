# Identity and Auth operations

## Authority and boundaries

Supabase Auth is the sole credential and session authority. The `app` schema
owns profile/preferences/relationship data, `app_private` owns security audit
data, and the browser reaches identity data only through the deliberately
exposed `api` schema. Browser table writes are not granted. Every mutation RPC
derives `auth.uid()` server-side.

The application uses publishable keys in browsers. Secret/service-role keys,
database passwords, SMTP credentials, and OAuth secrets are server-only and
must live in the environment's secret manager.

## Environment configuration

| Environment | App URL                       | Mail and OAuth                                                                            |
| ----------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| Local       | `http://127.0.0.1:3000`       | Mailpit captures verification/reset mail; OAuth optional                                  |
| Test        | isolated local stack          | deterministic Auth/pgTAP fixtures; no hosted dependency                                   |
| Staging     | staging application origin    | custom SMTP and separate Google/Apple credentials required before identity QA             |
| Production  | production application origin | custom SMTP, production OAuth credentials, CAPTCHA/abuse settings required before go-live |

Allow only the exact application callback URL (`/auth/callback`) and password
reset return path. Supabase's provider callback is
`https://<project-ref>.supabase.co/auth/v1/callback`; register that URL with
Google/Apple. Never wildcard an untrusted domain.

The UI fails closed independently of the Supabase provider setting. Keep
`VITE_AUTH_GOOGLE_ENABLED=false` and `VITE_AUTH_APPLE_ENABLED=false` until
the corresponding provider credentials and callback are configured and a
staging sign-in/sign-up acceptance journey passes. A flag is browser-visible
presentation configuration, never a provider secret. Mock Auth ignores both
flags even if an operator sets them accidentally.

## Session policy

- JWT lifetime: 1 hour; refresh-token rotation enabled with a 10-second reuse interval.
- Session timebox: 7 days; inactivity timeout: 24 hours.
- The app refreshes through Supabase Auth and maps an invalid/expired refresh token to `session_expired`.
- Normal logout is device-local. “Logout all sessions” uses global scope; “other sessions” uses others scope.
- Session revocation intent is recorded before Auth revocation. No tokens are written to the audit log.

## Email and password lifecycle

Email verification is required. Reset requests are deliberately
non-enumerating. Local mail is visible in Mailpit. Staging and production must
have verified custom SMTP, sender-domain authentication, branded templates,
and tested delivery before Supabase mode is enabled for users.

Passwords have an 8-character server minimum to preserve the frozen client
contract. Secure password change is enabled. A sensitive password change uses
`reauthenticate()`, then passes the emailed nonce to `updateUser`; deployments
that require a current password pass it only to Supabase Auth and never log it.

## Abuse limits

Supabase Auth limits sign-in/sign-up, email sends, token verification, and
refresh requests. Database RPCs additionally limit username changes (3/day),
profile/onboarding updates, preference updates, deletion requests, and session
revocation events. Hosted thresholds must be reviewed alongside SMTP/CAPTCHA
settings before launch; repeated 429s map to the stable `rate_limited` error.

## Account deletion and audit retention

Deletion creates an idempotent request; it does not immediately remove the
Auth user or product data. The planned operations policy is a 30-day hold,
followed by a privileged, separately reviewed deletion worker. Users can cancel
while the request is still `requested`.

`app_private.security_audit_log` is append-only to application roles and stores
only event type, actor, timestamp, request metadata, and non-secret context.
Retain security events for 365 days unless legal policy requires longer. A
future service-role retention job may delete expired rows; browser roles never
receive access.

## Avatar storage

The `avatars` bucket is private, limited to 5 MiB JPEG/PNG/WebP files, and
enforces `<user-id>/avatar.<extension>`. Display uses short-lived signed URLs.
Replacement updates the database before removing a differently named prior
object. A future privileged maintenance job should identify unreferenced
objects older than 24 hours; no public bucket or external avatar URL is stored.

## Operational checks

Before exposing email or social Auth in an environment:

1. Apply migrations only after local replay, pgTAP/RLS, lint, and type-drift checks pass.
2. Configure exact site/redirect URLs and custom SMTP.
3. Configure each intended OAuth provider, pass its staging callback journey, then enable only its matching `VITE_AUTH_*_ENABLED` flag.
4. Verify registration, confirmation, reset, OAuth callback, refresh, local logout, and global logout.
6. Confirm cross-user RLS denial and private avatar access with two real test users.
5. Confirm no service-role key is present in browser bundles, repository history, or client environment variables.
