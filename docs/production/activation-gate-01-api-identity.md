# Production activation gate 01: controlled API exposure and Identity/Profile

Status: **NOT EXECUTED — protected activation requires review and an explicit
workflow dispatch from `main`.**

This gate changes only the hosted PostgREST exposed-schema configuration for
BotolaGO Production V2. It does not apply migrations, create Auth users,
bootstrap an administrator, or activate any worker, schedule, ingestion path,
or Fantasy processing.

## Immutable target

| Guard                        | Required value                |
| ---------------------------- | ----------------------------- |
| Project                      | BotolaGO Production V2        |
| Project ref                  | `tkewgajrljbwgwedqsxn`        |
| Region                       | `eu-west-3`                   |
| Environment                  | `production-v2`               |
| Forbidden staging ref        | `srdrflfrfpwixsllveid`        |
| Forbidden legacy ref         | `kxpaudvntwxpahyjtxbk`        |
| Protected GitHub environment | `production-admin-activation` |

Every Management API, Auth, and Data API request is constructed from the fixed
Production V2 ref. The workflow stops before any mutation if a protected
environment value differs from this table.

## Minimum exposed schemas

Repository inspection found no runtime use of `/graphql/v1`,
`schema("public")`, or a default `public` Data API client. Every greenfield V2
repository selects `schema("api")` explicitly through
`src/integrations/supabase/v2-client.ts`.

The approved effective configuration is:

```text
db_schema=api
db_extra_search_path=extensions
```

`public` is removed because the application has no runtime dependency on it.
`graphql_public` is removed because the application does not use GraphQL.
`app` and `app_private` remain unexposed. Supabase Auth and Storage are
separate services and are not added to the PostgREST schema list.

Supabase documents dedicated API schemas as an additional boundary around the
Data API and distinguishes grants from RLS. Both controls remain required:

- <https://supabase.com/docs/guides/api/securing-your-api>
- <https://supabase.com/docs/guides/api/using-custom-schemas>
- <https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically>

## Protected activation

Workflow:

```text
.github/workflows/phase7f-production-api-identity-activation.yml
```

Required manual inputs:

```text
expected_commit=<exact current main SHA>
confirmation=RUN_PHASE7F_PRODUCTION_API_IDENTITY
```

The workflow:

1. requires owner approval through `production-admin-activation`;
2. checks that the dispatch ref is `main` and `expected_commit` equals the
   checked-out commit;
3. proves project identity, ownership, health, region, backup readiness, and
   absence of Edge Functions;
4. proves exact 35-migration checksum parity;
5. proves 113/113 canonical tables use forced RLS;
6. proves `app` and `app_private` are not available to `anon` or
   `authenticated`;
7. proves cron is empty, no staff principal exists, and no active
   `platform_admin` assignment exists;
8. captures the complete previous PostgREST setting in owner-only evidence;
9. patches only `db_schema` and `db_extra_search_path`;
10. waits for the exact effective setting;
11. runs the bounded smoke matrix below;
12. revokes the temporary local session created for the existing user;
13. reruns all critical invariants and inspects unified production logs;
14. automatically restores the exact prior PostgREST setting on any
    post-mutation failure.

The script has a hard cap of 80 sequential HTTP requests and contains no load
or concurrency tooling.

## Identity/Profile smoke matrix

| Actor                  | Contract                       | Expected result                     |
| ---------------------- | ------------------------------ | ----------------------------------- |
| Anonymous              | `api.username_availability`    | Allowed; explicit public RPC        |
| Anonymous              | `api.my_profile`               | Empty result                        |
| Anonymous              | `app.profiles`                 | Schema not exposed                  |
| Anonymous              | `app_private.staff_principals` | Schema not exposed                  |
| Anonymous              | `public` Data API              | Schema not exposed                  |
| Anonymous              | GraphQL endpoint               | Not exposed                         |
| Invalid bearer         | `api.my_profile`               | Unauthorized; no anonymous fallback |
| Existing ordinary user | `api.my_profile`               | Exactly the caller's profile        |
| Existing ordinary user | unrelated profile filter       | Empty result                        |
| Existing ordinary user | `api.get_my_staff_context`     | Denied                              |
| Existing ordinary user | direct canonical profile write | Schema not exposed                  |

The harness reuses an existing verified ordinary Auth user. It calls the
reviewed Auth Admin link generator from the protected server runner, exchanges
the one-time hash for a normal user session using the project's publishable
key, keeps all session material in process memory, and performs local-scope
logout in a `finally` block. It creates no user and never writes credentials or
personal data to logs or artifacts.

An AAL2 non-admin browser session is not manufactured. The migration and local
database tests remain the proof that MFA/AAL2 alone never creates a staff
principal or grants Admin authority: `get_my_staff_context` resolves a staff
principal before evaluating MFA/AAL2 and fails closed when none exists.

## Existing user backfill verification

The read-only preflight requires:

- at least one existing `auth.users` row;
- zero Auth users missing `app.profiles`;
- zero Auth users missing `app.user_preferences`;
- zero orphaned profiles;
- exactly one `botolago_v2_auth_user_created` trigger;
- zero `app_private.staff_principals`;
- zero active `platform_admin` assignments.

The reviewed migration uses `app_private.ensure_identity(uuid, jsonb)` with
`ON CONFLICT DO NOTHING` for profile and preference creation, attaches it to
the Auth insert trigger, and backfills existing Auth users with the same
idempotent conflict behavior.

If any backfill invariant fails, activation stops before changing PostgREST.
No manual production `INSERT` is authorized by this gate.

## Rollback

The activation harness captures the exact previous `db_schema` and
`db_extra_search_path` values before mutation.

Automatic rollback is triggered when:

- PostgREST does not converge to the approved setting;
- any smoke case fails;
- profile isolation fails;
- direct canonical access becomes possible;
- Auth session setup or local revocation fails;
- migration, RLS, grant, worker, or schedule postflight changes;
- unified log inspection fails or finds unexpected production errors.

Automatic rollback sends one project-ref-pinned Management API `PATCH` to:

```text
https://api.supabase.com/v1/projects/tkewgajrljbwgwedqsxn/postgrest
```

with only the captured values:

```json
{
  "db_schema": "<captured previous db_schema>",
  "db_extra_search_path": "<captured previous db_extra_search_path>"
}
```

It then polls the read-only `GET` endpoint until the exact prior values are
effective. Rollback changes no database data and requires no migration
rollback. The sanitized `rollback.json` evidence records `ROLLED_BACK`.

For a later owner-directed manual rollback, download the owner-only activation
artifact, copy the two non-secret values from `activation-report.json.before`,
and use the same reviewed script logic from an approved protected workflow.
Do not guess or normalize the prior values.

## Evidence report

After execution, the protected workflow artifact is the authoritative run
record. It contains:

- UTC timestamps and repository commit;
- target and backup checks;
- exact migration parity;
- before/after PostgREST configuration;
- 113/113 forced-RLS result;
- each smoke case with status, stable error code, and row count only;
- profile-backfill counts;
- post-change log inspection;
- postflight invariants;
- prohibited-action counters;
- `PASS` or `ROLLED_BACK`.

No email address, Auth token, refresh token, API key, or raw sensitive response
is written to evidence.

## Current pre-execution record

| Item                   | State                                    |
| ---------------------- | ---------------------------------------- |
| UTC timestamp          | Pending protected run                    |
| Repository commit      | Pending reviewed `main` commit           |
| Production project ref | Guarded as `tkewgajrljbwgwedqsxn`        |
| Backup                 | Must be reverified during dispatch       |
| Migration parity       | Must be reverified as 35 exact checksums |
| Forced RLS             | Must be reverified as 113/113            |
| Before exposed schemas | Must be captured during dispatch         |
| After exposed schemas  | Target is `api` only                     |
| Identity/Profile smoke | Not executed                             |
| Profile backfill       | Not executed                             |
| Staging/Legacy touched | No                                       |
| Load testing           | No                                       |
| Verdict                | **NOT EXECUTED**                         |

Successful completion must be described as:

> Controlled api exposure and Identity/Profile validation passed. Production
> remains fail-closed for Admin ownership, provider ingestion, workers,
> schedules, and Fantasy processing.

It must not be described as full Production V2 activation.
