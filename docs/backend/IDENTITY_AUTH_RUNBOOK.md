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

## Session policy

- JWT lifetime: 1 hour; refresh-token rotation enabled with a 10-second reuse interval.
- Session timebox: 7 days; inactivity timeout: 24 hours.
- The app refreshes through Supabase Auth and maps an invalid/expired refresh token to `session_expired`.
- Normal logout is device-local. “Logout all sessions” uses global scope; “other sessions” uses others scope.
- Session revocation intent is recorded before Auth revocation. No tokens are written to the audit log.

## MFA step-up for ordinary accounts

Migration `20260926003100_ordinary_account_mfa_step_up` (audit A03 / DB-07).
An account with at least one **verified** factor in `auth.mfa_factors` must hold
an `aal2` session to read or change its own data: every `api.*` function that
reads or writes it, the four `api.my_*` views, the saved mark on the public
News card, its own choices in the public match votes, and its avatar image in
Storage. At `aal1` the database refuses with:

| SQLSTATE | message        | HTTP (PostgREST) | Client action                                    |
| -------- | -------------- | ---------------- | ------------------------------------------------ |
| `PT403`  | `mfa_required` | 403              | send the person to the MFA challenge, then retry |

Storage has no such code: to that session the avatar object is simply not
there (no signed URL), an upload is refused as a policy violation, and a
replacement or removal touches nothing.

A missing `aal` claim counts as `aal1`. These pass: accounts with no factor or
only an unverified (abandoned) enrolment, `aal2` sessions, and work with no
actor (the service role, pg_cron, and Supabase Auth's own signup trigger,
which has no JWT on its connection).

- **The rule.** `app_private.assert_mfa_step_up()` states it once.
  `app_private.require_mfa_step_up()` (true, or the refusal) and
  `app_private.mfa_step_up_satisfied()` (true or false) are its boolean forms
  for a view's WHERE, a policy and the News card; both call it, and only
  `authenticated` may execute them (PostgreSQL checks EXECUTE on a stored
  view's or policy's functions as the reader, not USAGE on their schema).
- **Reads and writes through the api.** Every `api.*` function that reads or
  writes the caller's own account runs the helper as the first statement of
  its body: 52 of them, among them the profile and ban standing
  (`get_my_account_standing`), notification preferences, notifications and
  devices, the saved-article list, the Fantasy hub (it carries the caller's
  team), the owned team, its points, history and transfer preview, the
  caller's Fantasy leagues, league standings (private leagues are read through
  the caller's membership) and overall standings (`myRank`), Pronostics picks,
  leagues, league standings and leaderboard (the caller's own line), and every
  ordinary write RPC, a fan vote on a match (`cast_match_vote`) included.
  Writes are listed too because some answer without a write a trigger would
  see: an idempotent replay returns the stored Fantasy team, a double tap
  returns the Pronostics league just made with its invite code, and a vote
  answers with the caller's own choices. The migration header lists all 52.
- **The account views.** `api.my_profile`, `my_followed_teams`,
  `my_followed_competitions` and `my_account_deletion_requests` end their
  WHERE with `app_private.require_mfa_step_up()`. It names no column, so it
  runs once before any row is read, and a view with no row for the account
  refuses too.
- **The News card and the match votes.** Every feed, search and article card
  says whether the reader saved it (`isSaved`, `app_private.news_article_card`),
  and `api.match_votes` gives every fan's totals with the caller's own choices
  (`mine`). Those two private parts are shown only when
  `app_private.mfa_step_up_satisfied()`: at `aal1` an enrolled account reads
  the news and the vote totals as a visitor does. The news and the totals stay
  public; refusing them would only hide what the same person can read signed
  out.
- **The avatar image.** The `avatars` bucket's four policies on
  `storage.objects` (select, insert, update, delete; `20260720075453`) end
  with `and (select app_private.mfa_step_up_satisfied())`, their owner-folder
  rules unchanged.
- **Writes, whatever the route.** `app_private.refuse_unverified_mfa_actor()`
  runs the helper from BEFORE INSERT/UPDATE/DELETE statement triggers on every
  table an ordinary `api.*` function writes for the caller: profile,
  preferences, follows, deletion requests, saved articles, notifications and
  devices, all Fantasy team and league tables, and Pronostics (picks, league
  memberships, guest claims and match votes). A statement that matches no row
  is refused too. They stay as the backstop for a write RPC added later.
- **Deliberately not refused**, at `aal1` (each is named in
  `supabase/tests/database/ordinary_account_mfa_step_up_reads.test.sql`, which
  fails when a new `api` function reads the caller without the step-up and is
  not on this list):
  - Sign-out (`api.record_session_revocation` writes only the security audit
    log), so someone who abandons the challenge can still leave.
  - The e-mail unsubscribe link (`api.unsubscribe_notification_email`). The
    emailed token authorises it rather than the session, and it only turns
    e-mail off.
  - `api.get_my_staff_context()`. The staff console is outside the web app's
    challenge gate and reads it at `aal1` to show its own step-up; an ordinary
    account gets `staff_access_denied` from it.
  - `api.predictions_round()`: the round and its matches, the same for
    everyone. `auth.uid()` there only decides whether a tester may see
    Pronostics while it is open to testers alone.
  - The public reads (football, the news, the match votes' totals, the
    Fantasy catalogue, rules, fixtures, players and prizes,
    `username_availability`) and anonymous client error reports: nothing else
    in them is the caller's.
  - Staff and editorial RPCs, which keep their own stricter check (below).
- **Nothing is needed before the second factor.** While the code is owed the
  web app reads nothing of the account: it takes the factor list and the
  challenge from Supabase Auth itself, resolves the session without reading
  the profile or signing the avatar (`resolveSignedIn` in
  `src/services/auth-supabase.ts`), and asks for the ban standing only of a
  complete sign-in. A read refused all the same -- a factor enrolled on another
  device is only listed in a new token -- goes to the challenge: the profile
  read in session resolution treats the refusal as "code owed", any React
  Query read reports it through the query cache
  (`src/services/query-client.ts`) to the same responder the write mappers
  use, and a refused avatar upload re-reads the session first.
- **Guest predictions and match votes.** Both are sent from the phone once the
  sign-in is complete. A claim or vote refused all the same stays on the
  phone, and the web app retries on the next sign-in or page load.
- **MCP tools.** `get_profile` and `get_fantasy_team` (`src/lib/mcp`) read
  through `api.my_profile` and `api.fantasy_hub` with the connected app's
  OAuth access token. Supabase Auth issues those tokens at `aal1`: the
  authorization-code exchange starts a new session whose only method is
  `oauth_provider/authorization_code`, which is not a second factor, even when
  the person approved the connection after entering the code (only a client
  that ran the MFA challenge itself with the token would reach `aal2`). So for
  an account with a verified factor both tools answer with an error that says
  the account uses two-step sign-in and does not share its data with connected
  apps (`src/lib/mcp/account-read.ts`); `list_fixtures` is public and
  unaffected, and so is an account without a second factor.
- **Staff.** Admin and editorial RPCs keep their own stricter check
  (`admin_assert_principal`, `has_editorial_role`). There, `mfa_required`
  means "no factor enrolled", and an enrolled staff member at `aal1` gets
  `mfa_assurance_insufficient`.
- **Operators impersonating an account.** An operator script that sets
  `request.jwt.claims` to act as an account (for example
  `fantasy-cleanup-qa-artifacts.sql`) is refused for an enrolled account
  unless the claims carry `"aal":"aal2"`.

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
enforces `<user-id>/avatar.<extension>`. An account with a verified factor
needs an `aal2` session to read, upload, replace or remove its avatar (MFA
step-up, above). Display uses short-lived signed URLs; one Storage will not
sign shows no picture, and is not asked for again until the session is next
resolved.
Replacement updates the database before removing a differently named prior
object. A future privileged maintenance job should identify unreferenced
objects older than 24 hours; no public bucket or external avatar URL is stored.

## Operational checks

Before enabling `VITE_AUTH_MODE=supabase` in an environment:

1. Apply migrations only after local replay, pgTAP/RLS, lint, and type-drift checks pass.
2. Configure exact site/redirect URLs, custom SMTP, and intended OAuth providers.
3. Verify registration, confirmation, reset, OAuth callback, refresh, local logout, and global logout.
4. Confirm cross-user RLS denial and private avatar access with two real test users.
5. Confirm no service-role key is present in browser bundles, repository history, or client environment variables.
