# Phase 2 — Production Authentication and User Backend

## Outcome

Phase 2 establishes Supabase Auth as credential/session authority and the new
greenfield `app` identity model as profile/user-data authority. The frozen UI
continues to use its existing `AuthService` boundary. Production was not
modified. The two Phase 2 migrations were validated locally and applied only
to `BotolaGO Staging V2` (`srdrflfrfpwixsllveid`).

## 1. Architecture decisions

- `auth.users` remains the identity root; `app.profiles` is a one-to-one product extension.
- Preferences that are one-to-one and independently mutable live in `app.user_preferences`; profile identity fields remain in `app.profiles`.
- Followed teams and competitions use relation tables with composite ownership keys and keyset-pagination indexes.
- Frozen mock club keys are temporarily stored in `favorite_team_provisional_ref`; Phase 3 maps them to canonical team UUIDs and clears the provisional value.
- Saved articles are intentionally deferred until Phase 4 supplies canonical article UUIDs. Phase 2 defines the repository contract and retains the explicitly transitional local adapter.
- Browser reads use `security_invoker` owner views. Browser mutations use narrow RPCs that derive `auth.uid()`; no product-table write privileges are granted.
- Security audit records live in non-exposed `app_private`, are append-only to application roles, and never contain credentials or tokens.
- Avatars use a private bucket and deterministic user-owned paths; only signed URLs are displayable.
- Normal logout is local. Global and other-session revocation are explicit scopes.

## 2. Tables reused

- `auth.users`: credentials, verification state, provider identity, sessions.
- `storage.buckets` and `storage.objects`: private avatar metadata and objects.

## 3. Tables modified

No pre-existing product table was modified. Phase 2 adds two triggers to
`auth.users` for idempotent profile creation and password-change auditing, and
adds the `avatars` bucket configuration plus scoped Storage policies.

## 4. Tables created

- `app.profiles`
- `app.user_preferences`
- `app.followed_teams`
- `app.followed_competitions`
- `app.account_deletion_requests`
- `app_private.reserved_usernames`
- `app_private.security_audit_log`

All use explicit constraints; all product/private tables have RLS enabled and
forced. Growing owner collections have cursor-compatible indexes.

## 5. Migrations

- `20260720075453_identity_domain.sql`: canonical identity model, RLS, Auth/audit triggers, API views/RPCs, indexes, grants, and avatar bucket policies.
- `20260720081817_identity_null_validation.sql`: forward-only RPC hardening so explicit SQL `NULL` values fail closed with stable validation errors.

Both are additive, replay cleanly from an empty database, and preserve existing
Auth users through an idempotent blank-profile backfill. Rollback is operational
rather than destructive; see below.

## 6. RLS changes

Owner-only policies cover profiles, preferences, followed teams, followed
competitions, deletion requests, and avatar objects. Anonymous reads/writes and
cross-user access are denied. Private reserved-name/audit tables deliberately
have no client policies or privileges. Product tables expose authenticated
reads only; mutations are RPC-only despite ownership policies providing a
second enforcement layer.

Hosted security advisors report only informational `RLS enabled, no policy`
notices for the two intentionally deny-all `app_private` tables. There are no
security errors.

## 7. Triggers and RPCs

Triggers:

- idempotent identity/profile creation on `auth.users` insert
- password-change audit on Auth password hash change
- updated-at maintenance
- profile, username, onboarding, preference, and deletion-request audit events

RPCs:

- username availability
- atomic onboarding/profile/preferences update
- preference update
- idempotent follow/unfollow team and competition
- idempotent account-deletion request/cancellation
- bounded session-revocation audit

All definer functions use an empty `search_path`, validate identity/input,
have explicit execution grants, and return stable application-safe failures.

## 8. Repository and service contracts

Phase 2 adds provider-independent contracts and Supabase implementations for:

- profiles/onboarding/preferences
- followed teams and competitions
- saved articles (contract only; implementation deferred safely)
- account deletion and session-revocation auditing

The existing `AuthService` now supports refresh, reauthentication, secure
password-update parameters, deletion requests, scoped logout, and stable error
codes. The Supabase adapter no longer writes legacy tables directly. OAuth
accounts without a username complete the same onboarding form with one
backend-required username field; there is no visual redesign.

## 9. Generated types

`src/backend/generated/database.types.ts` was regenerated from the local
greenfield schema. The CI drift check confirms it is current. A separately
typed V2 client exposes only the `api` schema while legacy-typed fantasy code
remains untouched until its scheduled phase.

## 10. Tests

- deterministic username normalization, validation, reserved-name, and safe error mapping tests
- auth mock tests for refresh/session expiry, deletion idempotency, and reserved usernames
- repository UUID/cursor contract helpers
- pgTAP profile trigger and idempotency tests
- atomic onboarding/preferences/follow/deletion/session/password audit tests
- explicit-NULL API boundary tests
- two-user and anonymous RLS denial tests
- avatar bucket and cross-owner Storage-policy tests

Results: 243 application tests pass; 98 pgTAP/RLS tests pass across four files.

## 11. Quality gates

| Gate | Result |
| --- | --- |
| Migration validation | PASS — 3 total greenfield migrations |
| Generated-type drift | PASS |
| Secret scan | PASS |
| Typecheck | PASS |
| Application tests | PASS — 243 |
| Database/pgTAP/RLS tests | PASS — 98 |
| Database lint | PASS — no schema errors |
| Build | PASS — client, SSR, Nitro |
| ESLint | PASS — 0 errors, 11 pre-existing Fast Refresh warnings |

Supabase performance advisors show only expected informational unused-index
notices on a zero-row staging database. The indexes correspond to documented
pagination/audit access paths and should be reassessed after representative
staging traffic rather than removed now.

## 12. Remaining risks

- Hosted Auth redirect URLs, custom SMTP, email templates, secure-password settings, CAPTCHA thresholds, and Google/Apple credentials require dashboard configuration and real-email QA before Supabase auth mode is enabled.
- Staging contains the schema but no real two-browser OAuth/email end-to-end test users yet.
- Follow target foreign keys arrive with canonical football catalog tables in Phase 3; client repositories already reject non-UUID follow IDs.
- Saved articles remain transitional/local until canonical articles arrive in Phase 4.
- Account hard deletion and 365-day audit retention need privileged scheduled jobs in later operational phases.
- The deterministic avatar filename means replacing an object with the same extension cannot restore prior bytes if the subsequent profile RPC fails; the profile still points to a valid object, and orphan cleanup is documented.
- Production V2 remains empty and untouched by design.

## 13. Rollback instructions

1. Keep `VITE_AUTH_MODE=mock` or restore it immediately; revoke distribution of staging frontend variables.
2. Revert the Phase 2 application commit/PR to restore the Phase 1 adapter behavior.
3. Do not run destructive down SQL against staging. If a clean staging rollback is required before any user data exists, recreate the disposable staging project from reviewed Phase 1 migrations.
4. If test users exist, export `auth.users` identifiers and Phase 2 user tables before recreating staging; do not copy credentials or tokens into source control.
5. Production needs no rollback because it received no Phase 2 migrations or configuration.

## 14. Exact Phase 3 recommendation

Proceed only after this PR is reviewed and staging Auth configuration/email QA
is complete. Phase 3 should build the football catalog and match-provider
foundation: canonical UUID countries, competitions, seasons, teams, players,
memberships, fixtures, standings and events; provider mappings/normalization;
idempotent correction-aware ingestion; freshness/health observability; public
read APIs; and controlled match Realtime. During that phase, map provisional
favorite-club keys to canonical team UUIDs and add the deferred team and
competition foreign keys. Do not begin news ingestion, Fantasy expansion,
notifications, admin CMS, or production deployment.
