-- Account-deletion execution contract.
--
-- The browser can only create/cancel an authenticated request. A private,
-- service-role-only worker claims requests after a seven-day cancellation
-- window, removes known Storage objects, and calls Auth admin.deleteUser().
-- This migration makes the application-data cascade explicit and retains a
-- non-cascading, private execution/audit ledger for 365 days.

alter table app.account_deletion_requests
  add column execute_after timestamptz;

update app.account_deletion_requests
set execute_after = requested_at + interval '7 days'
where execute_after is null;

alter table app.account_deletion_requests
  alter column execute_after set default (statement_timestamp() + interval '7 days'),
  alter column execute_after set not null,
  add constraint account_deletion_requests_execute_after_check
    check (execute_after >= requested_at);

create index account_deletion_requests_due_idx
  on app.account_deletion_requests (execute_after, requested_at, id)
  where status in ('requested', 'processing');

create or replace view api.my_account_deletion_requests
with (security_invoker = true)
as
select id, user_id, status, requested_at, updated_at, processed_at, execute_after
from app.account_deletion_requests
where user_id = (select auth.uid());

-- User-owned Fantasy records must not block app.profiles -> auth.users.
-- Shared records owned by the deleting account (private leagues) cascade as
-- owned containers. Append-only operational evidence keeps no hard FK to the
-- deleted profile/team and is retained with SET NULL.
alter table app.fantasy_teams
  drop constraint fantasy_teams_user_id_fkey,
  add constraint fantasy_teams_user_id_fkey
    foreign key (user_id) references app.profiles(id) on delete cascade;

alter table app.fantasy_squad_memberships
  drop constraint fantasy_squad_memberships_fantasy_team_id_fkey,
  add constraint fantasy_squad_memberships_fantasy_team_id_fkey
    foreign key (fantasy_team_id) references app.fantasy_teams(id) on delete cascade;

alter table app.fantasy_lineups
  drop constraint fantasy_lineups_fantasy_team_id_fkey,
  add constraint fantasy_lineups_fantasy_team_id_fkey
    foreign key (fantasy_team_id) references app.fantasy_teams(id) on delete cascade;

alter table app.fantasy_lineup_players
  drop constraint fantasy_lineup_players_lineup_id_fkey,
  add constraint fantasy_lineup_players_lineup_id_fkey
    foreign key (lineup_id) references app.fantasy_lineups(id) on delete cascade;

alter table app.fantasy_auto_substitutions
  drop constraint fantasy_auto_substitutions_lineup_id_fkey,
  add constraint fantasy_auto_substitutions_lineup_id_fkey
    foreign key (lineup_id) references app.fantasy_lineups(id) on delete cascade;

alter table app.fantasy_transfer_batches
  drop constraint fantasy_transfer_batches_fantasy_team_id_fkey,
  add constraint fantasy_transfer_batches_fantasy_team_id_fkey
    foreign key (fantasy_team_id) references app.fantasy_teams(id) on delete cascade;

alter table app.fantasy_transfers
  drop constraint fantasy_transfers_transfer_batch_id_fkey,
  add constraint fantasy_transfers_transfer_batch_id_fkey
    foreign key (transfer_batch_id) references app.fantasy_transfer_batches(id) on delete cascade;

alter table app.fantasy_chip_uses
  drop constraint fantasy_chip_uses_fantasy_team_id_fkey,
  add constraint fantasy_chip_uses_fantasy_team_id_fkey
    foreign key (fantasy_team_id) references app.fantasy_teams(id) on delete cascade;

alter table app.fantasy_free_hit_snapshots
  drop constraint fantasy_free_hit_snapshots_chip_use_id_fkey,
  add constraint fantasy_free_hit_snapshots_chip_use_id_fkey
    foreign key (chip_use_id) references app.fantasy_chip_uses(id) on delete cascade,
  drop constraint fantasy_free_hit_snapshots_fantasy_team_id_fkey,
  add constraint fantasy_free_hit_snapshots_fantasy_team_id_fkey
    foreign key (fantasy_team_id) references app.fantasy_teams(id) on delete cascade;

alter table app.fantasy_free_hit_snapshot_players
  drop constraint fantasy_free_hit_snapshot_players_snapshot_id_fkey,
  add constraint fantasy_free_hit_snapshot_players_snapshot_id_fkey
    foreign key (snapshot_id) references app.fantasy_free_hit_snapshots(id) on delete cascade;

alter table app.fantasy_team_gameweek_results
  drop constraint fantasy_team_gameweek_results_fantasy_team_id_fkey,
  add constraint fantasy_team_gameweek_results_fantasy_team_id_fkey
    foreign key (fantasy_team_id) references app.fantasy_teams(id) on delete cascade;

alter table app.fantasy_leagues
  drop constraint fantasy_leagues_owner_user_id_fkey,
  add constraint fantasy_leagues_owner_user_id_fkey
    foreign key (owner_user_id) references app.profiles(id) on delete cascade;

alter table app.fantasy_league_memberships
  drop constraint fantasy_league_memberships_league_id_fkey,
  add constraint fantasy_league_memberships_league_id_fkey
    foreign key (league_id) references app.fantasy_leagues(id) on delete cascade,
  drop constraint fantasy_league_memberships_fantasy_team_id_fkey,
  add constraint fantasy_league_memberships_fantasy_team_id_fkey
    foreign key (fantasy_team_id) references app.fantasy_teams(id) on delete cascade,
  drop constraint fantasy_league_memberships_user_id_fkey,
  add constraint fantasy_league_memberships_user_id_fkey
    foreign key (user_id) references app.profiles(id) on delete cascade;

alter table app.fantasy_rankings
  drop constraint fantasy_rankings_league_id_fkey,
  add constraint fantasy_rankings_league_id_fkey
    foreign key (league_id) references app.fantasy_leagues(id) on delete cascade,
  drop constraint fantasy_rankings_fantasy_team_id_fkey,
  add constraint fantasy_rankings_fantasy_team_id_fkey
    foreign key (fantasy_team_id) references app.fantasy_teams(id) on delete cascade;

alter table app_private.fantasy_free_transfer_rollovers
  drop constraint fantasy_free_transfer_rollovers_fantasy_team_id_fkey,
  add constraint fantasy_free_transfer_rollovers_fantasy_team_id_fkey
    foreign key (fantasy_team_id) references app.fantasy_teams(id) on delete cascade;

alter table app_private.fantasy_idempotency_keys
  drop constraint fantasy_idempotency_keys_user_id_fkey,
  add constraint fantasy_idempotency_keys_user_id_fkey
    foreign key (user_id) references app.profiles(id) on delete cascade;

alter table app_private.fantasy_mutation_audit
  drop constraint fantasy_mutation_audit_user_id_fkey,
  add constraint fantasy_mutation_audit_user_id_fkey
    foreign key (user_id) references app.profiles(id) on delete set null,
  drop constraint fantasy_mutation_audit_fantasy_team_id_fkey,
  add constraint fantasy_mutation_audit_fantasy_team_id_fkey
    foreign key (fantasy_team_id) references app.fantasy_teams(id) on delete set null;

alter table app_private.fantasy_corrections
  drop constraint fantasy_corrections_requested_by_fkey,
  add constraint fantasy_corrections_requested_by_fkey
    foreign key (requested_by) references app.profiles(id) on delete set null;

create table app_private.account_deletion_jobs (
  request_id uuid primary key,
  user_id uuid not null,
  status text not null,
  requested_at timestamptz not null,
  execute_after timestamptz not null,
  attempt_count integer not null default 0,
  worker_id uuid,
  claim_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  constraint account_deletion_jobs_status_check
    check (status in ('processing', 'completed', 'failed', 'blocked')),
  constraint account_deletion_jobs_attempt_check check (attempt_count >= 0),
  constraint account_deletion_jobs_time_check check (execute_after >= requested_at),
  constraint account_deletion_jobs_error_check check (
    last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint account_deletion_jobs_state_check check (
    (status = 'processing' and worker_id is not null and claim_token is not null
      and lease_expires_at is not null and completed_at is null)
    or (status = 'completed' and claim_token is not null and completed_at is not null)
    or (status in ('failed', 'blocked') and lease_expires_at is null and completed_at is null)
  )
);

comment on table app_private.account_deletion_jobs is
  'Private durable account-deletion ledger outside the profile cascade. Retain 365 days after completion, then purge through a reviewed manual operation.';

create index account_deletion_jobs_reconcile_idx
  on app_private.account_deletion_jobs (lease_expires_at, request_id)
  where status = 'processing';
create index account_deletion_jobs_retention_idx
  on app_private.account_deletion_jobs (completed_at, request_id)
  where status = 'completed';

create table app_private.account_deletion_job_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references app_private.account_deletion_jobs(request_id) on delete cascade,
  user_id uuid not null,
  event_type text not null,
  attempt_count integer not null,
  error_code text,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint account_deletion_job_events_type_check check (
    event_type in ('claimed', 'reclaimed', 'blocked', 'failed', 'completed', 'reconciled', 'requeued')
  ),
  constraint account_deletion_job_events_attempt_check check (attempt_count >= 0),
  constraint account_deletion_job_events_error_check check (
    error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  )
);

comment on table app_private.account_deletion_job_events is
  'Append-only sanitized account-deletion execution evidence; no email, token, provider payload, or raw error text.';

create index account_deletion_job_events_request_idx
  on app_private.account_deletion_job_events (request_id, occurred_at, id);
create index account_deletion_job_events_retention_idx
  on app_private.account_deletion_job_events (occurred_at, id);

alter table app_private.account_deletion_jobs enable row level security;
alter table app_private.account_deletion_jobs force row level security;
alter table app_private.account_deletion_job_events enable row level security;
alter table app_private.account_deletion_job_events force row level security;

revoke all on table app_private.account_deletion_jobs,
  app_private.account_deletion_job_events
from public, anon, authenticated, service_role;
revoke all on sequence app_private.account_deletion_job_events_id_seq
from public, anon, authenticated, service_role;

create or replace function app_private.account_deletion_cascade_contract_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with expected(schema_name, table_name, constraint_name, delete_action) as (
    values
      ('app', 'profiles', 'profiles_id_fkey', 'c'::"char"),
      ('app', 'account_deletion_requests', 'account_deletion_requests_user_id_fkey', 'c'::"char"),
      ('app', 'fantasy_teams', 'fantasy_teams_user_id_fkey', 'c'::"char"),
      ('app', 'fantasy_squad_memberships', 'fantasy_squad_memberships_fantasy_team_id_fkey', 'c'::"char"),
      ('app', 'fantasy_lineups', 'fantasy_lineups_fantasy_team_id_fkey', 'c'::"char"),
      ('app', 'fantasy_lineup_players', 'fantasy_lineup_players_lineup_id_fkey', 'c'::"char"),
      ('app', 'fantasy_auto_substitutions', 'fantasy_auto_substitutions_lineup_id_fkey', 'c'::"char"),
      ('app', 'fantasy_transfer_batches', 'fantasy_transfer_batches_fantasy_team_id_fkey', 'c'::"char"),
      ('app', 'fantasy_transfers', 'fantasy_transfers_transfer_batch_id_fkey', 'c'::"char"),
      ('app', 'fantasy_chip_uses', 'fantasy_chip_uses_fantasy_team_id_fkey', 'c'::"char"),
      ('app', 'fantasy_free_hit_snapshots', 'fantasy_free_hit_snapshots_chip_use_id_fkey', 'c'::"char"),
      ('app', 'fantasy_free_hit_snapshots', 'fantasy_free_hit_snapshots_fantasy_team_id_fkey', 'c'::"char"),
      ('app', 'fantasy_free_hit_snapshot_players', 'fantasy_free_hit_snapshot_players_snapshot_id_fkey', 'c'::"char"),
      ('app', 'fantasy_team_gameweek_results', 'fantasy_team_gameweek_results_fantasy_team_id_fkey', 'c'::"char"),
      ('app', 'fantasy_leagues', 'fantasy_leagues_owner_user_id_fkey', 'c'::"char"),
      ('app', 'fantasy_league_memberships', 'fantasy_league_memberships_league_id_fkey', 'c'::"char"),
      ('app', 'fantasy_league_memberships', 'fantasy_league_memberships_fantasy_team_id_fkey', 'c'::"char"),
      ('app', 'fantasy_league_memberships', 'fantasy_league_memberships_user_id_fkey', 'c'::"char"),
      ('app', 'fantasy_rankings', 'fantasy_rankings_league_id_fkey', 'c'::"char"),
      ('app', 'fantasy_rankings', 'fantasy_rankings_fantasy_team_id_fkey', 'c'::"char"),
      ('app_private', 'fantasy_free_transfer_rollovers', 'fantasy_free_transfer_rollovers_fantasy_team_id_fkey', 'c'::"char"),
      ('app_private', 'fantasy_idempotency_keys', 'fantasy_idempotency_keys_user_id_fkey', 'c'::"char"),
      ('app_private', 'fantasy_mutation_audit', 'fantasy_mutation_audit_user_id_fkey', 'n'::"char"),
      ('app_private', 'fantasy_mutation_audit', 'fantasy_mutation_audit_fantasy_team_id_fkey', 'n'::"char"),
      ('app_private', 'fantasy_corrections', 'fantasy_corrections_requested_by_fkey', 'n'::"char")
  )
  select count(constraint_row.oid) = count(*)
    and coalesce(bool_and(constraint_row.confdeltype = expected.delete_action), false)
  from expected
  left join pg_catalog.pg_namespace namespace_row
    on namespace_row.nspname = expected.schema_name
  left join pg_catalog.pg_class table_row
    on table_row.relnamespace = namespace_row.oid
    and table_row.relname = expected.table_name
  left join pg_catalog.pg_constraint constraint_row
    on constraint_row.conrelid = table_row.oid
    and constraint_row.conname = expected.constraint_name
    and constraint_row.contype = 'f';
$$;

revoke all on function app_private.account_deletion_cascade_contract_ready()
from public, anon, authenticated, service_role;
grant execute on function app_private.account_deletion_cascade_contract_ready() to postgres;

create or replace function app_private.record_account_deletion_job_event(
  p_request_id uuid,
  p_user_id uuid,
  p_event_type text,
  p_attempt_count integer,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_type not in ('claimed', 'reclaimed', 'blocked', 'failed', 'completed', 'reconciled', 'requeued')
    or p_attempt_count < 0
    or (p_error_code is not null and p_error_code !~ '^[a-z][a-z0-9_]{2,79}$')
  then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_DELETION_AUDIT_EVENT';
  end if;

  insert into app_private.account_deletion_job_events (
    request_id, user_id, event_type, attempt_count, error_code
  ) values (
    p_request_id, p_user_id, p_event_type, p_attempt_count, p_error_code
  );
end;
$$;

revoke all on function app_private.record_account_deletion_job_event(uuid, uuid, text, integer, text)
from public, anon, authenticated, service_role;
grant execute on function app_private.record_account_deletion_job_event(uuid, uuid, text, integer, text)
to postgres;

create or replace function api.account_deletion_worker_preview(p_limit integer default 25)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_DELETION_BATCH_SIZE';
  end if;
  if not app_private.account_deletion_cascade_contract_ready() then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_CASCADE_CONTRACT_INVALID';
  end if;

  with due as (
    select request_row.id, request_row.user_id
    from app.account_deletion_requests request_row
    left join app_private.account_deletion_jobs job on job.request_id = request_row.id
    where request_row.execute_after <= statement_timestamp()
      and (
        request_row.status = 'requested'
        or (
          request_row.status = 'processing'
          and (job.request_id is null or job.lease_expires_at <= statement_timestamp())
        )
      )
    order by request_row.execute_after, request_row.requested_at, request_row.id
    limit p_limit
  ), reconciliation as (
    select job.request_id
    from app_private.account_deletion_jobs job
    where job.status = 'processing'
      and job.lease_expires_at <= statement_timestamp()
      and not exists (select 1 from auth.users auth_user where auth_user.id = job.user_id)
    order by job.lease_expires_at, job.request_id
    limit p_limit
  )
  select jsonb_build_object(
    'due', count(*)::integer,
    'ready', count(*) filter (
      where not exists (
        select 1 from app_private.staff_principals principal
        where principal.auth_user_id = due.user_id
      )
    )::integer,
    'blocked', count(*) filter (
      where exists (
        select 1 from app_private.staff_principals principal
        where principal.auth_user_id = due.user_id
      )
    )::integer,
    'reconcile', (select count(*)::integer from reconciliation)
  ) into result
  from due;

  return result;
end;
$$;

revoke all on function api.account_deletion_worker_preview(integer)
from public, anon, authenticated;
grant execute on function api.account_deletion_worker_preview(integer) to service_role;

create or replace function api.account_deletion_worker_claim(
  p_worker_id uuid,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  orphan_job app_private.account_deletion_jobs%rowtype;
  request_row app.account_deletion_requests%rowtype;
  new_claim_token uuid := gen_random_uuid();
  current_attempt integer;
begin
  if p_worker_id is null or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_DELETION_CLAIM';
  end if;
  if not app_private.account_deletion_cascade_contract_ready() then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_CASCADE_CONTRACT_INVALID';
  end if;

  select job.* into orphan_job
  from app_private.account_deletion_jobs job
  where job.status = 'processing'
    and job.lease_expires_at <= statement_timestamp()
    and not exists (select 1 from auth.users auth_user where auth_user.id = job.user_id)
  order by job.lease_expires_at, job.request_id
  for update skip locked
  limit 1;

  if orphan_job.request_id is not null then
    update app_private.account_deletion_jobs
    set worker_id = p_worker_id,
      claim_token = new_claim_token,
      lease_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      updated_at = statement_timestamp()
    where request_id = orphan_job.request_id
    returning attempt_count into current_attempt;

    perform app_private.record_account_deletion_job_event(
      orphan_job.request_id, orphan_job.user_id, 'reclaimed', current_attempt, null
    );
    return jsonb_build_object(
      'action', 'finalize',
      'requestId', orphan_job.request_id,
      'userId', orphan_job.user_id,
      'claimToken', new_claim_token
    );
  end if;

  select request_candidate.* into request_row
  from app.account_deletion_requests request_candidate
  left join app_private.account_deletion_jobs job
    on job.request_id = request_candidate.id
  where request_candidate.execute_after <= statement_timestamp()
    and (
      request_candidate.status = 'requested'
      or (
        request_candidate.status = 'processing'
        and (job.request_id is null or job.lease_expires_at <= statement_timestamp())
      )
    )
  order by request_candidate.execute_after, request_candidate.requested_at, request_candidate.id
  for update of request_candidate skip locked
  limit 1;

  if request_row.id is null then
    return jsonb_build_object('action', 'none');
  end if;

  if not exists (select 1 from auth.users auth_user where auth_user.id = request_row.user_id) then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_ORPHAN_REQUEST';
  end if;

  if exists (
    select 1 from app_private.staff_principals principal
    where principal.auth_user_id = request_row.user_id
  ) then
    insert into app_private.account_deletion_jobs (
      request_id, user_id, status, requested_at, execute_after,
      attempt_count, last_error_code, updated_at
    ) values (
      request_row.id, request_row.user_id, 'blocked', request_row.requested_at,
      request_row.execute_after, 1, 'staff_account_requires_manual_review', statement_timestamp()
    )
    on conflict (request_id) do update
    set status = 'blocked',
      attempt_count = app_private.account_deletion_jobs.attempt_count + 1,
      worker_id = null,
      claim_token = null,
      lease_expires_at = null,
      last_error_code = 'staff_account_requires_manual_review',
      updated_at = statement_timestamp(),
      completed_at = null
    returning attempt_count into current_attempt;

    update app.account_deletion_requests
    set status = 'rejected', processed_at = statement_timestamp()
    where id = request_row.id;
    perform app_private.record_account_deletion_job_event(
      request_row.id, request_row.user_id, 'blocked', current_attempt,
      'staff_account_requires_manual_review'
    );
    return jsonb_build_object('action', 'blocked');
  end if;

  insert into app_private.account_deletion_jobs (
    request_id, user_id, status, requested_at, execute_after, attempt_count,
    worker_id, claim_token, lease_expires_at, updated_at
  ) values (
    request_row.id, request_row.user_id, 'processing', request_row.requested_at,
    request_row.execute_after, 1, p_worker_id, new_claim_token,
    statement_timestamp() + make_interval(secs => p_lease_seconds), statement_timestamp()
  )
  on conflict (request_id) do update
  set status = 'processing',
    attempt_count = app_private.account_deletion_jobs.attempt_count + 1,
    worker_id = excluded.worker_id,
    claim_token = excluded.claim_token,
    lease_expires_at = excluded.lease_expires_at,
    last_error_code = null,
    updated_at = statement_timestamp(),
    completed_at = null
  returning attempt_count into current_attempt;

  update app.account_deletion_requests
  set status = 'processing', processed_at = null
  where id = request_row.id;
  perform app_private.record_account_deletion_job_event(
    request_row.id, request_row.user_id, 'claimed', current_attempt, null
  );

  return jsonb_build_object(
    'action', 'delete',
    'requestId', request_row.id,
    'userId', request_row.user_id,
    'claimToken', new_claim_token
  );
end;
$$;

revoke all on function api.account_deletion_worker_claim(uuid, integer)
from public, anon, authenticated;
grant execute on function api.account_deletion_worker_claim(uuid, integer) to service_role;

create or replace function api.account_deletion_worker_finalize(
  p_request_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  job app_private.account_deletion_jobs%rowtype;
begin
  if p_request_id is null or p_claim_token is null then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_DELETION_FINALIZE';
  end if;

  select job_row.* into job
  from app_private.account_deletion_jobs job_row
  where job_row.request_id = p_request_id
  for update;

  if job.request_id is null or job.claim_token is distinct from p_claim_token then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_CLAIM_MISMATCH';
  end if;
  if job.status = 'completed' then
    return true;
  end if;
  if job.status <> 'processing' then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_NOT_PROCESSING';
  end if;
  if exists (select 1 from auth.users auth_user where auth_user.id = job.user_id) then
    raise exception using errcode = '55000', message = 'AUTH_USER_STILL_EXISTS';
  end if;
  if exists (select 1 from app.profiles profile where profile.id = job.user_id)
    or exists (select 1 from app.fantasy_teams team where team.user_id = job.user_id)
    or exists (select 1 from app.fantasy_leagues league where league.owner_user_id = job.user_id)
    or exists (select 1 from app.fantasy_league_memberships membership where membership.user_id = job.user_id)
    or exists (select 1 from app_private.fantasy_idempotency_keys key_row where key_row.user_id = job.user_id)
  then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_CASCADE_INCOMPLETE';
  end if;

  update app_private.account_deletion_jobs
  set status = 'completed', lease_expires_at = null, last_error_code = null,
    completed_at = statement_timestamp(), updated_at = statement_timestamp()
  where request_id = job.request_id;
  perform app_private.record_account_deletion_job_event(
    job.request_id, job.user_id, 'completed', job.attempt_count, null
  );
  return true;
end;
$$;

revoke all on function api.account_deletion_worker_finalize(uuid, uuid)
from public, anon, authenticated;
grant execute on function api.account_deletion_worker_finalize(uuid, uuid) to service_role;

create or replace function api.account_deletion_worker_fail(
  p_request_id uuid,
  p_claim_token uuid,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job app_private.account_deletion_jobs%rowtype;
begin
  if p_request_id is null or p_claim_token is null or p_error_code is null or p_error_code not in (
    'avatar_list_failed',
    'avatar_limit_exceeded',
    'avatar_shape_unexpected',
    'avatar_delete_failed',
    'auth_delete_failed',
    'unexpected_worker_failure'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_DELETION_FAILURE';
  end if;

  select job_row.* into job
  from app_private.account_deletion_jobs job_row
  where job_row.request_id = p_request_id
  for update;

  if job.request_id is null or job.claim_token is distinct from p_claim_token then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_CLAIM_MISMATCH';
  end if;
  if job.status = 'completed' then
    return jsonb_build_object('completed', true);
  end if;
  if job.status <> 'processing' then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_NOT_PROCESSING';
  end if;

  -- The Auth API may commit and then lose its response. Reconcile only after
  -- verifying both Auth absence and the complete application-data cascade.
  if not exists (select 1 from auth.users auth_user where auth_user.id = job.user_id) then
    if exists (select 1 from app.profiles profile where profile.id = job.user_id)
      or exists (select 1 from app.fantasy_teams team where team.user_id = job.user_id)
      or exists (select 1 from app.fantasy_leagues league where league.owner_user_id = job.user_id)
      or exists (select 1 from app.fantasy_league_memberships membership where membership.user_id = job.user_id)
      or exists (select 1 from app_private.fantasy_idempotency_keys key_row where key_row.user_id = job.user_id)
    then
      raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_CASCADE_INCOMPLETE';
    end if;

    update app_private.account_deletion_jobs
    set status = 'completed', lease_expires_at = null, last_error_code = null,
      completed_at = statement_timestamp(), updated_at = statement_timestamp()
    where request_id = job.request_id;
    perform app_private.record_account_deletion_job_event(
      job.request_id, job.user_id, 'reconciled', job.attempt_count, null
    );
    return jsonb_build_object('completed', true);
  end if;

  update app_private.account_deletion_jobs
  set status = 'failed', worker_id = null, lease_expires_at = null,
    last_error_code = p_error_code, updated_at = statement_timestamp(), completed_at = null
  where request_id = job.request_id;
  update app.account_deletion_requests
  set status = 'requested', processed_at = null
  where id = job.request_id and status = 'processing';
  perform app_private.record_account_deletion_job_event(
    job.request_id, job.user_id, 'failed', job.attempt_count, p_error_code
  );
  return jsonb_build_object('completed', false);
end;
$$;

revoke all on function api.account_deletion_worker_fail(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function api.account_deletion_worker_fail(uuid, uuid, text) to service_role;

create or replace function api.account_deletion_worker_requeue_after_staff_review(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  job app_private.account_deletion_jobs%rowtype;
begin
  select job_row.* into job
  from app_private.account_deletion_jobs job_row
  where job_row.request_id = p_request_id
  for update;

  if job.request_id is null or job.status <> 'blocked'
    or job.last_error_code <> 'staff_account_requires_manual_review'
  then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_NOT_STAFF_BLOCKED';
  end if;
  if exists (
    select 1 from app_private.staff_principals principal
    where principal.auth_user_id = job.user_id
  ) then
    raise exception using errcode = '55000', message = 'STAFF_OFFBOARDING_INCOMPLETE';
  end if;
  if not exists (select 1 from auth.users auth_user where auth_user.id = job.user_id) then
    raise exception using errcode = '55000', message = 'AUTH_USER_MISSING';
  end if;

  update app.account_deletion_requests
  set status = 'requested', processed_at = null
  where id = job.request_id and user_id = job.user_id and status = 'rejected';
  if not found then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_REQUEST_MISSING';
  end if;

  update app_private.account_deletion_jobs
  set status = 'failed', worker_id = null, claim_token = null, lease_expires_at = null,
    last_error_code = 'manual_review_cleared', updated_at = statement_timestamp(), completed_at = null
  where request_id = job.request_id;
  perform app_private.record_account_deletion_job_event(
    job.request_id, job.user_id, 'requeued', job.attempt_count, null
  );
  return true;
end;
$$;

revoke all on function api.account_deletion_worker_requeue_after_staff_review(uuid)
from public, anon, authenticated;
grant execute on function api.account_deletion_worker_requeue_after_staff_review(uuid) to service_role;
