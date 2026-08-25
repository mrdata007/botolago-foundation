# Account deletion worker runbook

## Safety model

The browser never receives an Auth admin key and never calls this worker. An
authenticated user creates a request through `api.request_account_deletion()`.
The request becomes due after a seven-day cancellation window. A manually
invoked Edge Function then:

1. atomically claims one due request through a service-role-only RPC;
2. refuses staff principals and records a manual-review block;
3. removes the bounded, known `avatars/<user-id>/avatar.<ext>` objects;
4. hard-deletes the user through `auth.admin.deleteUser(userId, false)`;
5. asks PostgreSQL to verify Auth absence and the application-data cascade;
6. records completion in a private ledger that does not cascade with profile.

The worker is idempotent. A stale claim can be reclaimed. If the Auth API
commits but its response is lost, the failure/finalize RPC marks completion only
after verifying that Auth and the user-owned application rows are absent.

There is intentionally no production schedule in this change.

## Integration

1. Create a migration in the target branch with:

   ```sh
   supabase migration new account_deletion_worker
   ```

   Copy the proposal SQL into that generated migration. Keep its generated
   timestamp if other migrations have landed since the proposal was created.

2. Add the function/shared files and merge `supabase-config.fragment.toml` into
   `supabase/config.toml`. Do not replace the full config, because the MFA and
   ingestion branches also modify it.

3. Regenerate and check database types after the migration:

   ```sh
   bun run backend:types:generate
   bun run backend:types:check
   ```

4. Validate locally:

   ```sh
   bun run backend:db:reset
   bun run backend:db:test
   bun test supabase/functions/_shared/account-deletion-worker.test.ts
   bun run backend:db:lint
   bun run backend:migrations:check
   ```

5. Set a dedicated random secret of at least 32 characters (48+ recommended):

   ```sh
   supabase secrets set ACCOUNT_DELETION_WORKER_KEY='<random-high-entropy-value>'
   ```

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to deployed Edge
   Functions by Supabase. Never expose either worker secret or service-role key
   to Vite/browser environment variables.

6. Deploy the migration first and the function second. Do not enable a cron.

## Dry run

Dry-run is read-only: it does not claim requests or create ledger rows. It
returns bounded counts only; it never returns email addresses, access tokens,
raw provider errors, or user IDs.

```sh
curl --fail-with-body --silent --show-error \
  --request POST \
  --header "content-type: application/json" \
  --header "x-botolago-account-deletion-key: ${ACCOUNT_DELETION_WORKER_KEY}" \
  --data '{"mode":"dry-run","limit":25}' \
  "${SUPABASE_URL}/functions/v1/account-deletion-worker"
```

Expected response shape:

```json
{"ok":true,"mode":"dry-run","due":2,"ready":2,"blocked":0,"reconcile":0}
```

Before the first production execution, run dry-run, inspect Auth/Postgres/Edge
logs, and confirm the production project URL and expected due count with a
second operator.

## Execute one bounded batch

Mutation requires the exact confirmation string. Start with `limit: 1`.

```sh
curl --fail-with-body --silent --show-error \
  --request POST \
  --header "content-type: application/json" \
  --header "x-botolago-account-deletion-key: ${ACCOUNT_DELETION_WORKER_KEY}" \
  --data '{"mode":"execute","limit":1,"confirmation":"DELETE_DUE_ACCOUNTS"}' \
  "${SUPABASE_URL}/functions/v1/account-deletion-worker"
```

Only increase the limit after checking the first ledger event and Auth result.
`remainingMayExist: true` means the batch hit its limit; it is not proof that
another due request exists. Re-run dry-run to decide whether to execute again.

## Verification

Use the Supabase SQL editor with the reviewed `postgres` operator role. The
service role deliberately has no direct access to either private ledger table.

```sql
select status, attempt_count, last_error_code, created_at, updated_at, completed_at
from app_private.account_deletion_jobs
order by updated_at desc
limit 25;

select request_id, event_type, attempt_count, error_code, occurred_at
from app_private.account_deletion_job_events
order by id desc
limit 100;
```

For a completed job, verify:

- `auth.users` has no matching ID;
- `app.profiles`, owned Fantasy teams/leagues, memberships, rankings, notification
  data, saved articles, and the transient request have cascaded;
- retained Fantasy mutation/correction audit references are `NULL`;
- the private deletion ledger and existing security audit remain.

Hard Auth deletion invalidates refresh tokens and removes sessions, but an
already-issued JWT can remain valid until its expiry. Current BotolaGO config is
one hour, so do not describe deletion as an instantaneous JWT revocation.

## Failure handling

The database stores only stable codes:

- `avatar_list_failed`
- `avatar_limit_exceeded`
- `avatar_shape_unexpected`
- `avatar_delete_failed`
- `auth_delete_failed`
- `unexpected_worker_failure`

If Auth still exists, the failure RPC returns the request to `requested`, so a
later manual run can retry. If Auth is already absent, the RPC verifies the
cascade and records a reconciled completion. If the worker returns
`failure_record_unavailable`, stop: do not retry immediately, preserve logs, and
inspect database/function health first.

Supabase refuses Auth deletion while the user owns Storage objects. This worker
removes the only user-upload bucket present at commit `1711bee` (`avatars`).
Before launch and whenever a new user-upload bucket is added, inventory owners:

```sql
select bucket_id, count(*)
from storage.objects
where owner_id is not null
group by bucket_id
order by bucket_id;
```

Update and test the worker before allowing users to own objects in another
bucket. Never delete rows directly from `storage.objects`, because that can
orphan the underlying files.

## Staff/admin requests

Any row in `app_private.staff_principals` blocks automatic deletion, including a
revoked principal. Complete the existing reviewed staff-offboarding and session
revocation workflow first. After all staff assignments/evidence requirements
are handled and the principal row is safely removed, requeue exactly one blocked
request through the service-role RPC:

```sql
select api.account_deletion_worker_requeue_after_staff_review(
  '<reviewed-request-uuid>'::uuid
);
```

Then dry-run again. Never remove the principal merely to make the worker pass.

## Data-retention maintenance

The private job/event ledger and `app_private.security_audit_log` are documented
for 365-day retention. No purge schedule is included here. After legal approval,
perform a reviewed manual purge of completed jobs older than 365 days; deleting
a job cascades only its private job events. Maintain the existing separate
security-audit retention procedure.

Owned private leagues are deleted with their owner and their league-specific
memberships/rankings. Other users' Fantasy teams remain. This ownership behavior
must be reflected in Terms/Privacy copy before replacing the current legal
placeholders.
