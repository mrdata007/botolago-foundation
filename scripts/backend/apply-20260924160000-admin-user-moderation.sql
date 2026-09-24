-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260924160000_admin_user_moderation_and_analytics
-- (the users page, bans and the admin dashboard -- PR #188).
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or on a database missing what the update builds on;
--   * applies the migration file exactly as it is in the repository;
--   * records it in supabase_migrations.schema_migrations (the whole file as
--     statements[1], as the migration promoter records a migration);
--   * checks the result: functions, grants, the new table's row security, the
--     seven ban triggers, the analytics.read permission, and one read.
--   Lock and statement timeouts are bounded, so it gives up rather than queue
--   behind a long-running transaction on the live site.
--
-- It does not depend on 20260924120000 (prizes) or 20260924140000/140100
-- (email notifications), and does not apply them.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Preflight: refuse to run twice or on the wrong database
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  object_name text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260924160000') then
    raise exception 'stop: migration 20260924160000 is already recorded as applied';
  end if;
  if to_regclass('app_private.user_bans') is not null then
    raise exception 'stop: app_private.user_bans already exists, but the migration is not recorded -- find out why before going on';
  end if;

  foreach object_name in array array[
    'app.profiles', 'app.account_deletion_requests', 'app.fantasy_teams', 'app.fantasy_lineups',
    'app.fantasy_transfer_batches', 'app.fantasy_chip_uses', 'app.fantasy_leagues',
    'app.fantasy_league_memberships', 'app.article_editions', 'app.device_registrations',
    'app_private.staff_principals', 'app_private.admin_roles', 'app_private.admin_permissions',
    'app_private.admin_role_permissions', 'app_private.admin_audit_events',
    'app_private.admin_idempotency_keys'
  ] loop
    if to_regclass(object_name) is null then
      missing := missing || object_name;
    end if;
  end loop;

  foreach object_name in array array[
    'admin_mask_email', 'admin_assert_permission', 'write_admin_audit',
    'admin_begin_idempotent_operation', 'admin_complete_idempotent_operation', 'set_updated_at'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private' and p.proname = object_name
    ) then
      missing := missing || ('app_private.' || object_name || '()');
    end if;
  end loop;

  if not exists (select 1 from app_private.admin_roles where name = 'platform_admin') then
    missing := missing || 'admin role platform_admin'::text;
  end if;
  if not exists (select 1 from app_private.admin_permissions where name = 'users.read_support')
    or not exists (select 1 from app_private.admin_permissions where name = 'users.moderate') then
    missing := missing || 'permissions users.read_support / users.moderate'::text;
  end if;

  if cardinality(missing) > 0 then
    raise exception 'stop: the database is missing what this update builds on: %', missing;
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migration, exactly as in the repository
-- ---------------------------------------------------------------------------
-- BotolaGO admin: the user directory, account bans, and the analytics overview.
--
-- WHAT THIS ADDS (and what it leaves alone)
--
-- One new table, app_private.user_bans, the append-preserving ban ledger. No
-- existing table is altered and no existing function is replaced: enforcement
-- is added with new triggers, so the Fantasy and identity RPCs keep their
-- reviewed bodies byte for byte.
--
-- READS AND WRITES
--
--   api.admin_list_users / api.admin_get_user   `users.read_support` (MFA)
--   api.admin_ban_user / api.admin_unban_user    `users.moderate` (MFA, recent auth)
--   api.admin_get_analytics_overview             `analytics.read` (MFA), new here
--   api.get_my_account_standing                  any signed-in account, about itself
--
-- `users.read_support` and `users.moderate` already exist (Phase 7A) and are
-- held by support_agent / moderator / platform_admin as seeded then. The new
-- `analytics.read` is granted to platform_admin only; widening it is a later,
-- reviewed migration.
--
-- Staff DTOs follow the console's rule: a masked email, never the address.
-- An exact email can be SEARCHED (the support case: "x@y.ma wrote to us"),
-- which answers only whether that account exists -- the same disclosure the
-- staff eligibility lookup already makes.
--
-- WHAT A BAN DOES
--
-- A ban is a ledger row with a reason, an optional end, and who placed it; it
-- is lifted early by a second, audited action, or it simply ends. Only one ban
-- is active per account at a time. While a ban is active:
--
--   1. api.get_my_account_standing() reports it, and the app signs the account
--      out and says why, on every load;
--   2. the account cannot change anything other people see or that takes part
--      in the game: its profile, Fantasy team, lineup, transfers, chips,
--      leagues and league memberships refuse the write (`account_banned`),
--      whatever route the call takes. Enforcement keys on the ACTOR
--      (auth.uid()), never on the row owner, so scoring (no actor), staff
--      corrections and other managers acting on shared rows are untouched.
--
-- Deliberately NOT blocked: requesting account deletion (a privacy right that
-- a ban does not suspend) and private opt-outs (follows, preferences,
-- notification devices), which harm nobody.
--
-- Supabase Auth itself is not written to. Auth stays the identity authority
-- and this repository only ever mutates it through a trusted server; the ban
-- is enforced at the data layer, as staff suspension is. Current staff cannot
-- be banned here (staff access is suspended or revoked through /admin/staff),
-- and nobody can ban themselves.

-- ---------------------------------------------------------------------------
-- Ban ledger
-- ---------------------------------------------------------------------------

create table app_private.user_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  banned_by_principal_id uuid not null
    references app_private.staff_principals(id) on delete restrict,
  reason text not null,
  starts_at timestamptz not null default statement_timestamp(),
  ends_at timestamptz,
  lifted_at timestamptz,
  lifted_by_principal_id uuid references app_private.staff_principals(id) on delete restrict,
  lift_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint user_bans_reason_check check (
    reason = btrim(reason) and char_length(reason) between 8 and 500
  ),
  constraint user_bans_window_check check (ends_at is null or ends_at > starts_at),
  constraint user_bans_lift_check check (
    (lifted_at is null and lifted_by_principal_id is null and lift_reason is null)
    or (
      lifted_at is not null
      and lifted_at >= starts_at
      and lifted_by_principal_id is not null
      and lift_reason is not null
      and lift_reason = btrim(lift_reason)
      and char_length(lift_reason) between 8 and 500
    )
  )
);
comment on table app_private.user_bans is
  'Account bans. A ban is active while lifted_at is null, starts_at has passed and ends_at (null = until lifted) has not.';
create index user_bans_user_idx on app_private.user_bans (user_id, starts_at desc, id desc);
create index user_bans_open_idx on app_private.user_bans (user_id) where lifted_at is null;
create index user_bans_banned_by_idx on app_private.user_bans (banned_by_principal_id);
create index user_bans_lifted_by_idx
  on app_private.user_bans (lifted_by_principal_id)
  where lifted_by_principal_id is not null;
alter table app_private.user_bans enable row level security;
alter table app_private.user_bans force row level security;
revoke all on app_private.user_bans from public, anon, authenticated, service_role;

create trigger user_bans_set_updated_at
before update on app_private.user_bans
for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Admin permission
-- ---------------------------------------------------------------------------

insert into app_private.admin_permissions (name, domain, description, requires_recent_auth)
values (
  'analytics.read', 'analytics',
  'Reads aggregate product analytics: account, Fantasy, editorial and moderation counts.',
  false
)
on conflict (name) do nothing;

insert into app_private.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from app_private.admin_roles role
join app_private.admin_permissions permission on permission.name = 'analytics.read'
where role.name = 'platform_admin'
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function app_private.user_is_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from app_private.user_bans ban
    where ban.user_id = p_user_id
      and ban.lifted_at is null
      and ban.starts_at <= statement_timestamp()
      and (ban.ends_at is null or ban.ends_at > statement_timestamp())
  );
$$;
revoke all on function app_private.user_is_banned(uuid)
  from public, anon, authenticated, service_role;

-- The staff-facing summary of one account. Null when the account does not
-- exist. The email is masked; the active ban carries its internal reason,
-- which only staff holding users.read_support can reach.
create function app_private.admin_user_json(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'userId', account.id,
    'username', profile.username,
    'displayName', nullif(profile.display_name, ''),
    'maskedEmail', app_private.admin_mask_email(account.email),
    'emailVerified', account.email_confirmed_at is not null,
    'createdAt', account.created_at,
    'lastSignInAt', account.last_sign_in_at,
    'onboardingCompleted', profile.onboarding_completed_at is not null,
    'deleted', profile.deleted_at is not null,
    'deletionRequested', exists (
      select 1
      from app.account_deletion_requests request
      where request.user_id = account.id and request.status in ('requested', 'processing')
    ),
    'isStaff', exists (
      select 1 from app_private.staff_principals principal
      where principal.auth_user_id = account.id and principal.status <> 'revoked'
    ),
    'activeBan', (
      select jsonb_build_object(
        'banId', ban.id,
        'startsAt', ban.starts_at,
        'endsAt', ban.ends_at,
        'reason', ban.reason
      )
      from app_private.user_bans ban
      where ban.user_id = account.id
        and ban.lifted_at is null
        and ban.starts_at <= statement_timestamp()
        and (ban.ends_at is null or ban.ends_at > statement_timestamp())
      order by ban.starts_at desc, ban.id desc
      limit 1
    )
  )
  from auth.users account
  left join app.profiles profile on profile.id = account.id
  where account.id = p_user_id;
$$;
revoke all on function app_private.admin_user_json(uuid)
  from public, anon, authenticated, service_role;

create function app_private.admin_assert_moderation_reason(p_reason text)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'moderation_reason_invalid';
  end if;
end;
$$;
revoke all on function app_private.admin_assert_moderation_reason(text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enforcement
-- ---------------------------------------------------------------------------

-- Refuses the write when the account MAKING it is banned. Service work has no
-- actor (auth.uid() is null) and staff cannot be banned, so neither is ever
-- refused here.
create function app_private.refuse_banned_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is not null and app_private.user_is_banned(actor) then
    raise exception using errcode = 'PT403', message = 'account_banned';
  end if;
  return new;
end;
$$;
revoke all on function app_private.refuse_banned_actor()
  from public, anon, authenticated, service_role;

create trigger profiles_refuse_banned_actor
before update on app.profiles
for each row execute function app_private.refuse_banned_actor();

create trigger fantasy_teams_refuse_banned_actor
before insert or update on app.fantasy_teams
for each row execute function app_private.refuse_banned_actor();

create trigger fantasy_lineups_refuse_banned_actor
before insert or update on app.fantasy_lineups
for each row execute function app_private.refuse_banned_actor();

create trigger fantasy_transfer_batches_refuse_banned_actor
before insert on app.fantasy_transfer_batches
for each row execute function app_private.refuse_banned_actor();

create trigger fantasy_chip_uses_refuse_banned_actor
before insert or update on app.fantasy_chip_uses
for each row execute function app_private.refuse_banned_actor();

create trigger fantasy_leagues_refuse_banned_actor
before insert or update on app.fantasy_leagues
for each row execute function app_private.refuse_banned_actor();

create trigger fantasy_league_memberships_refuse_banned_actor
before insert or update on app.fantasy_league_memberships
for each row execute function app_private.refuse_banned_actor();

-- ---------------------------------------------------------------------------
-- The account's own standing
-- ---------------------------------------------------------------------------

-- What the app asks on load. Says only whether the caller is banned and until
-- when; the staff reason stays internal.
create function api.get_my_account_standing()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  is_banned boolean;
  banned_until timestamptz;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'unauthenticated';
  end if;

  select true, ban.ends_at
  into is_banned, banned_until
  from app_private.user_bans ban
  where ban.user_id = current_user_id
    and ban.lifted_at is null
    and ban.starts_at <= statement_timestamp()
    and (ban.ends_at is null or ban.ends_at > statement_timestamp())
  order by ban.starts_at desc, ban.id desc
  limit 1;

  return jsonb_build_object(
    'banned', coalesce(is_banned, false),
    'bannedUntil', banned_until
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: the user directory
-- ---------------------------------------------------------------------------

-- Newest accounts first, keyset-paginated on (created_at, id). The query is a
-- user id (exact), an email (exact, case-insensitive) or part of a username or
-- display name.
create function api.admin_list_users(
  p_query text default null,
  p_status text default null,
  p_limit integer default 50,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  search_text text := nullif(btrim(p_query), '');
  search_id uuid;
  search_email text;
  search_pattern text;
  page_size integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  page_ids uuid[];
  page_created timestamptz[];
  found_count integer;
begin
  perform app_private.admin_assert_permission('users.read_support', false);

  if p_status is not null and p_status not in ('active', 'banned', 'deletion_requested') then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if (p_after_created_at is null) <> (p_after_id is null) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if search_text is not null then
    if char_length(search_text) > 254 then
      raise exception using errcode = 'PT400', message = 'validation_failed';
    end if;
    if search_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      search_id := search_text::uuid;
    elsif position('@' in search_text) > 0 then
      search_email := lower(search_text);
    else
      -- LIKE wildcards typed by the operator are matched literally.
      search_pattern := '%'
        || replace(replace(replace(lower(search_text), '\', '\\'), '%', '\%'), '_', '\_')
        || '%';
    end if;
  end if;

  select
    array_agg(candidate.id order by candidate.created_at desc, candidate.id desc),
    array_agg(candidate.created_at order by candidate.created_at desc, candidate.id desc)
  into page_ids, page_created
  from (
    select account.id, account.created_at
    from auth.users account
    left join app.profiles profile on profile.id = account.id
    where account.created_at is not null
      and (search_id is null or account.id = search_id)
      and (search_email is null or lower(account.email) = search_email)
      and (
        search_pattern is null
        or profile.normalized_username like search_pattern
        or lower(profile.display_name) like search_pattern
      )
      and (
        p_status is null
        or (p_status = 'banned' and app_private.user_is_banned(account.id))
        or (p_status = 'active' and not app_private.user_is_banned(account.id))
        or (
          p_status = 'deletion_requested'
          and exists (
            select 1 from app.account_deletion_requests request
            where request.user_id = account.id and request.status in ('requested', 'processing')
          )
        )
      )
      and (
        p_after_created_at is null
        or (account.created_at, account.id) < (p_after_created_at, p_after_id)
      )
    order by account.created_at desc, account.id desc
    limit page_size + 1
  ) candidate;

  found_count := coalesce(array_length(page_ids, 1), 0);

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(app_private.admin_user_json(page.id) order by page.position)
      from unnest(page_ids[1:page_size]) with ordinality as page(id, position)
    ), '[]'::jsonb),
    'nextCursor', case
      when found_count > page_size then jsonb_build_object(
        'createdAt', page_created[page_size],
        'id', page_ids[page_size]
      )
    end
  );
end;
$$;

create function api.admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  summary jsonb;
begin
  perform app_private.admin_assert_permission('users.read_support', false);
  if p_user_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  summary := app_private.admin_user_json(p_user_id);
  if summary is null then
    raise exception using errcode = 'PT404', message = 'user_not_found';
  end if;

  return summary || jsonb_build_object(
    'fantasy', (
      select jsonb_build_object(
        'teamName', team.name,
        'status', team.status,
        'createdAt', team.created_at,
        'activeLeagues', (
          select count(*)
          from app.fantasy_league_memberships membership
          where membership.fantasy_team_id = team.id and membership.status = 'active'
        )
      )
      from app.fantasy_teams team
      where team.user_id = p_user_id
      order by team.created_at desc, team.id desc
      limit 1
    ),
    'bans', coalesce((
      select jsonb_agg(history.entry order by history.starts_at desc, history.id desc)
      from (
        select
          ban.id,
          ban.starts_at,
          jsonb_build_object(
            'banId', ban.id,
            'startsAt', ban.starts_at,
            'endsAt', ban.ends_at,
            'reason', ban.reason,
            'bannedByMaskedEmail', app_private.admin_mask_email(banner.email),
            'liftedAt', ban.lifted_at,
            'liftReason', ban.lift_reason,
            'liftedByMaskedEmail', app_private.admin_mask_email(lifter.email)
          ) as entry
        from app_private.user_bans ban
        join app_private.staff_principals banned_by on banned_by.id = ban.banned_by_principal_id
        left join auth.users banner on banner.id = banned_by.auth_user_id
        left join app_private.staff_principals lifted_by on lifted_by.id = ban.lifted_by_principal_id
        left join auth.users lifter on lifter.id = lifted_by.auth_user_id
        where ban.user_id = p_user_id
        order by ban.starts_at desc, ban.id desc
        limit 20
      ) history
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: ban and lift
-- ---------------------------------------------------------------------------

-- p_duration_hours null bans until lifted; otherwise 1 hour to 10 years.
create function api.admin_ban_user(
  p_user_id uuid,
  p_reason text,
  p_duration_hours integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  actor_user_id uuid;
  prior jsonb;
  placed app_private.user_bans%rowtype;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('users.moderate', true);
  if p_user_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  perform app_private.admin_assert_moderation_reason(p_reason);
  if p_duration_hours is not null and p_duration_hours not between 1 and 87600 then
    raise exception using errcode = 'PT400', message = 'ban_duration_invalid';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'users.ban_user', p_idempotency_key,
    jsonb_build_object('userId', p_user_id, 'reason', p_reason, 'durationHours', p_duration_hours)
  );
  if prior is not null then
    return prior;
  end if;

  -- One moderation decision per account at a time.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('users.moderation:' || p_user_id::text, 0)
  );

  if not exists (select 1 from auth.users account where account.id = p_user_id) then
    raise exception using errcode = 'PT404', message = 'user_not_found';
  end if;
  select principal.auth_user_id into actor_user_id
  from app_private.staff_principals principal
  where principal.id = actor;
  if actor_user_id = p_user_id then
    raise exception using errcode = 'PT409', message = 'self_moderation_forbidden';
  end if;
  -- Current staff (active or suspended) are handled through /admin/staff. A
  -- revoked principal is a former employee whose consumer account remains an
  -- ordinary account, and can be banned like any other.
  if exists (
    select 1 from app_private.staff_principals principal
    where principal.auth_user_id = p_user_id and principal.status <> 'revoked'
  ) then
    raise exception using errcode = 'PT409', message = 'staff_account_protected';
  end if;
  if app_private.user_is_banned(p_user_id) then
    raise exception using errcode = 'PT409', message = 'user_already_banned';
  end if;

  insert into app_private.user_bans (user_id, banned_by_principal_id, reason, ends_at)
  values (
    p_user_id, actor, p_reason,
    case
      when p_duration_hours is null then null
      else statement_timestamp() + make_interval(hours => p_duration_hours)
    end
  )
  returning * into placed;

  perform app_private.write_admin_audit(
    actor, 'users.ban_user', 'users', p_user_id, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    jsonb_build_object('status', 'active'),
    jsonb_build_object('status', 'banned', 'banId', placed.id, 'endsAt', placed.ends_at)
  );

  result := app_private.admin_user_json(p_user_id);
  return app_private.admin_complete_idempotent_operation(
    actor, 'users.ban_user', p_idempotency_key, result
  );
end;
$$;

create function api.admin_unban_user(
  p_user_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  lifted app_private.user_bans%rowtype;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('users.moderate', true);
  if p_user_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  perform app_private.admin_assert_moderation_reason(p_reason);

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'users.unban_user', p_idempotency_key,
    jsonb_build_object('userId', p_user_id, 'reason', p_reason)
  );
  if prior is not null then
    return prior;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('users.moderation:' || p_user_id::text, 0)
  );

  if not exists (select 1 from auth.users account where account.id = p_user_id) then
    raise exception using errcode = 'PT404', message = 'user_not_found';
  end if;

  select ban.* into lifted
  from app_private.user_bans ban
  where ban.user_id = p_user_id
    and ban.lifted_at is null
    and ban.starts_at <= statement_timestamp()
    and (ban.ends_at is null or ban.ends_at > statement_timestamp())
  order by ban.starts_at desc, ban.id desc
  limit 1
  for update;
  if not found then
    raise exception using errcode = 'PT409', message = 'user_not_banned';
  end if;

  update app_private.user_bans
  set lifted_at = statement_timestamp(),
    lifted_by_principal_id = actor,
    lift_reason = p_reason
  where id = lifted.id;

  perform app_private.write_admin_audit(
    actor, 'users.unban_user', 'users', p_user_id, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    jsonb_build_object('status', 'banned', 'banId', lifted.id, 'endsAt', lifted.ends_at),
    jsonb_build_object('status', 'active')
  );

  result := app_private.admin_user_json(p_user_id);
  return app_private.admin_complete_idempotent_operation(
    actor, 'users.unban_user', p_idempotency_key, result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: analytics overview
-- ---------------------------------------------------------------------------

-- Aggregate counts only: no row, name or email leaves this function. Calendar
-- days are Moroccan days (Africa/Casablanca), which is what "today" means to
-- the people reading the dashboard.
create function api.admin_get_analytics_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  observed_at timestamptz := statement_timestamp();
  local_today date := (statement_timestamp() at time zone 'Africa/Casablanca')::date;
  today_start timestamptz;
  tomorrow_start timestamptz;
  window_start timestamptz;
begin
  perform app_private.admin_assert_permission('analytics.read', false);

  -- Midnights in Morocco, computed per day rather than by adding 24 hours: the
  -- Ramadan clock change makes some Moroccan days 23 or 25 hours long.
  today_start := local_today::timestamp at time zone 'Africa/Casablanca';
  tomorrow_start := (local_today + 1)::timestamp at time zone 'Africa/Casablanca';
  window_start := (local_today - 29)::timestamp at time zone 'Africa/Casablanca';

  return jsonb_build_object(
    'generatedAt', observed_at,
    'timeZone', 'Africa/Casablanca',
    'users', (
      select jsonb_build_object(
        'total', count(*),
        'newToday', count(*) filter (
          where account.created_at >= today_start and account.created_at < tomorrow_start
        ),
        'new7Days', count(*) filter (where account.created_at > observed_at - interval '7 days'),
        'new30Days', count(*) filter (where account.created_at > observed_at - interval '30 days'),
        'active7Days', count(*) filter (
          where account.last_sign_in_at > observed_at - interval '7 days'
        ),
        'active30Days', count(*) filter (
          where account.last_sign_in_at > observed_at - interval '30 days'
        ),
        'emailVerified', count(*) filter (where account.email_confirmed_at is not null)
      )
      from auth.users account
    ) || jsonb_build_object(
      'onboarded', (
        select count(*) from app.profiles profile
        where profile.onboarding_completed_at is not null and profile.deleted_at is null
      ),
      'banned', (
        select count(distinct ban.user_id)
        from app_private.user_bans ban
        where ban.lifted_at is null
          and ban.starts_at <= observed_at
          and (ban.ends_at is null or ban.ends_at > observed_at)
      ),
      'deletionRequested', (
        select count(*) from app.account_deletion_requests request
        where request.status in ('requested', 'processing')
      )
    ),
    'signupsByDay', (
      select jsonb_agg(
        jsonb_build_object(
          'date', to_char(calendar.day, 'YYYY-MM-DD'),
          'count', coalesce(daily.signups, 0)
        )
        order by calendar.day
      )
      from generate_series(
        (local_today - 29)::timestamp, local_today::timestamp, interval '1 day'
      ) as calendar(day)
      left join (
        select
          (account.created_at at time zone 'Africa/Casablanca')::date as signup_day,
          count(*) as signups
        from auth.users account
        where account.created_at >= window_start and account.created_at < tomorrow_start
        group by 1
      ) daily on daily.signup_day = calendar.day::date
    ),
    'fantasy', jsonb_build_object(
      'teams', (select count(*) from app.fantasy_teams team where team.status = 'active'),
      'teamsNew7Days', (
        select count(*) from app.fantasy_teams team
        where team.created_at > observed_at - interval '7 days'
      ),
      'leagues', (select count(*) from app.fantasy_leagues league where league.active),
      'transfers7Days', (
        select coalesce(sum(batch.transfers_count), 0)
        from app.fantasy_transfer_batches batch
        where batch.status = 'confirmed' and batch.confirmed_at > observed_at - interval '7 days'
      )
    ),
    'news', (
      select jsonb_build_object(
        'published', count(*) filter (where edition.status = 'published'),
        'published7Days', count(*) filter (
          where edition.status = 'published'
            and edition.published_at > observed_at - interval '7 days'
        ),
        'scheduled', count(*) filter (where edition.status = 'scheduled'),
        'inReview', count(*) filter (where edition.status = 'in_review'),
        'drafts', count(*) filter (where edition.status = 'draft')
      )
      from app.article_editions edition
    ),
    'notifications', jsonb_build_object(
      'devices', (
        select count(*) from app.device_registrations device where device.enabled
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function
  api.get_my_account_standing(),
  api.admin_list_users(text, text, integer, timestamptz, uuid),
  api.admin_get_user(uuid),
  api.admin_ban_user(uuid, text, integer, uuid),
  api.admin_unban_user(uuid, text, uuid),
  api.admin_get_analytics_overview()
from public, anon, authenticated, service_role;

grant execute on function
  api.get_my_account_standing(),
  api.admin_list_users(text, text, integer, timestamptz, uuid),
  api.admin_get_user(uuid),
  api.admin_ban_user(uuid, text, integer, uuid),
  api.admin_unban_user(uuid, text, uuid),
  api.admin_get_analytics_overview()
to authenticated;

-- ---------------------------------------------------------------------------
-- Record it in the migration history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260924160000',
  'admin_user_moderation_and_analytics',
  array[$bg_20260924160000_file$-- BotolaGO admin: the user directory, account bans, and the analytics overview.
--
-- WHAT THIS ADDS (and what it leaves alone)
--
-- One new table, app_private.user_bans, the append-preserving ban ledger. No
-- existing table is altered and no existing function is replaced: enforcement
-- is added with new triggers, so the Fantasy and identity RPCs keep their
-- reviewed bodies byte for byte.
--
-- READS AND WRITES
--
--   api.admin_list_users / api.admin_get_user   `users.read_support` (MFA)
--   api.admin_ban_user / api.admin_unban_user    `users.moderate` (MFA, recent auth)
--   api.admin_get_analytics_overview             `analytics.read` (MFA), new here
--   api.get_my_account_standing                  any signed-in account, about itself
--
-- `users.read_support` and `users.moderate` already exist (Phase 7A) and are
-- held by support_agent / moderator / platform_admin as seeded then. The new
-- `analytics.read` is granted to platform_admin only; widening it is a later,
-- reviewed migration.
--
-- Staff DTOs follow the console's rule: a masked email, never the address.
-- An exact email can be SEARCHED (the support case: "x@y.ma wrote to us"),
-- which answers only whether that account exists -- the same disclosure the
-- staff eligibility lookup already makes.
--
-- WHAT A BAN DOES
--
-- A ban is a ledger row with a reason, an optional end, and who placed it; it
-- is lifted early by a second, audited action, or it simply ends. Only one ban
-- is active per account at a time. While a ban is active:
--
--   1. api.get_my_account_standing() reports it, and the app signs the account
--      out and says why, on every load;
--   2. the account cannot change anything other people see or that takes part
--      in the game: its profile, Fantasy team, lineup, transfers, chips,
--      leagues and league memberships refuse the write (`account_banned`),
--      whatever route the call takes. Enforcement keys on the ACTOR
--      (auth.uid()), never on the row owner, so scoring (no actor), staff
--      corrections and other managers acting on shared rows are untouched.
--
-- Deliberately NOT blocked: requesting account deletion (a privacy right that
-- a ban does not suspend) and private opt-outs (follows, preferences,
-- notification devices), which harm nobody.
--
-- Supabase Auth itself is not written to. Auth stays the identity authority
-- and this repository only ever mutates it through a trusted server; the ban
-- is enforced at the data layer, as staff suspension is. Current staff cannot
-- be banned here (staff access is suspended or revoked through /admin/staff),
-- and nobody can ban themselves.

-- ---------------------------------------------------------------------------
-- Ban ledger
-- ---------------------------------------------------------------------------

create table app_private.user_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  banned_by_principal_id uuid not null
    references app_private.staff_principals(id) on delete restrict,
  reason text not null,
  starts_at timestamptz not null default statement_timestamp(),
  ends_at timestamptz,
  lifted_at timestamptz,
  lifted_by_principal_id uuid references app_private.staff_principals(id) on delete restrict,
  lift_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint user_bans_reason_check check (
    reason = btrim(reason) and char_length(reason) between 8 and 500
  ),
  constraint user_bans_window_check check (ends_at is null or ends_at > starts_at),
  constraint user_bans_lift_check check (
    (lifted_at is null and lifted_by_principal_id is null and lift_reason is null)
    or (
      lifted_at is not null
      and lifted_at >= starts_at
      and lifted_by_principal_id is not null
      and lift_reason is not null
      and lift_reason = btrim(lift_reason)
      and char_length(lift_reason) between 8 and 500
    )
  )
);
comment on table app_private.user_bans is
  'Account bans. A ban is active while lifted_at is null, starts_at has passed and ends_at (null = until lifted) has not.';
create index user_bans_user_idx on app_private.user_bans (user_id, starts_at desc, id desc);
create index user_bans_open_idx on app_private.user_bans (user_id) where lifted_at is null;
create index user_bans_banned_by_idx on app_private.user_bans (banned_by_principal_id);
create index user_bans_lifted_by_idx
  on app_private.user_bans (lifted_by_principal_id)
  where lifted_by_principal_id is not null;
alter table app_private.user_bans enable row level security;
alter table app_private.user_bans force row level security;
revoke all on app_private.user_bans from public, anon, authenticated, service_role;

create trigger user_bans_set_updated_at
before update on app_private.user_bans
for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Admin permission
-- ---------------------------------------------------------------------------

insert into app_private.admin_permissions (name, domain, description, requires_recent_auth)
values (
  'analytics.read', 'analytics',
  'Reads aggregate product analytics: account, Fantasy, editorial and moderation counts.',
  false
)
on conflict (name) do nothing;

insert into app_private.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from app_private.admin_roles role
join app_private.admin_permissions permission on permission.name = 'analytics.read'
where role.name = 'platform_admin'
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function app_private.user_is_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from app_private.user_bans ban
    where ban.user_id = p_user_id
      and ban.lifted_at is null
      and ban.starts_at <= statement_timestamp()
      and (ban.ends_at is null or ban.ends_at > statement_timestamp())
  );
$$;
revoke all on function app_private.user_is_banned(uuid)
  from public, anon, authenticated, service_role;

-- The staff-facing summary of one account. Null when the account does not
-- exist. The email is masked; the active ban carries its internal reason,
-- which only staff holding users.read_support can reach.
create function app_private.admin_user_json(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'userId', account.id,
    'username', profile.username,
    'displayName', nullif(profile.display_name, ''),
    'maskedEmail', app_private.admin_mask_email(account.email),
    'emailVerified', account.email_confirmed_at is not null,
    'createdAt', account.created_at,
    'lastSignInAt', account.last_sign_in_at,
    'onboardingCompleted', profile.onboarding_completed_at is not null,
    'deleted', profile.deleted_at is not null,
    'deletionRequested', exists (
      select 1
      from app.account_deletion_requests request
      where request.user_id = account.id and request.status in ('requested', 'processing')
    ),
    'isStaff', exists (
      select 1 from app_private.staff_principals principal
      where principal.auth_user_id = account.id and principal.status <> 'revoked'
    ),
    'activeBan', (
      select jsonb_build_object(
        'banId', ban.id,
        'startsAt', ban.starts_at,
        'endsAt', ban.ends_at,
        'reason', ban.reason
      )
      from app_private.user_bans ban
      where ban.user_id = account.id
        and ban.lifted_at is null
        and ban.starts_at <= statement_timestamp()
        and (ban.ends_at is null or ban.ends_at > statement_timestamp())
      order by ban.starts_at desc, ban.id desc
      limit 1
    )
  )
  from auth.users account
  left join app.profiles profile on profile.id = account.id
  where account.id = p_user_id;
$$;
revoke all on function app_private.admin_user_json(uuid)
  from public, anon, authenticated, service_role;

create function app_private.admin_assert_moderation_reason(p_reason text)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'moderation_reason_invalid';
  end if;
end;
$$;
revoke all on function app_private.admin_assert_moderation_reason(text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enforcement
-- ---------------------------------------------------------------------------

-- Refuses the write when the account MAKING it is banned. Service work has no
-- actor (auth.uid() is null) and staff cannot be banned, so neither is ever
-- refused here.
create function app_private.refuse_banned_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is not null and app_private.user_is_banned(actor) then
    raise exception using errcode = 'PT403', message = 'account_banned';
  end if;
  return new;
end;
$$;
revoke all on function app_private.refuse_banned_actor()
  from public, anon, authenticated, service_role;

create trigger profiles_refuse_banned_actor
before update on app.profiles
for each row execute function app_private.refuse_banned_actor();

create trigger fantasy_teams_refuse_banned_actor
before insert or update on app.fantasy_teams
for each row execute function app_private.refuse_banned_actor();

create trigger fantasy_lineups_refuse_banned_actor
before insert or update on app.fantasy_lineups
for each row execute function app_private.refuse_banned_actor();

create trigger fantasy_transfer_batches_refuse_banned_actor
before insert on app.fantasy_transfer_batches
for each row execute function app_private.refuse_banned_actor();

create trigger fantasy_chip_uses_refuse_banned_actor
before insert or update on app.fantasy_chip_uses
for each row execute function app_private.refuse_banned_actor();

create trigger fantasy_leagues_refuse_banned_actor
before insert or update on app.fantasy_leagues
for each row execute function app_private.refuse_banned_actor();

create trigger fantasy_league_memberships_refuse_banned_actor
before insert or update on app.fantasy_league_memberships
for each row execute function app_private.refuse_banned_actor();

-- ---------------------------------------------------------------------------
-- The account's own standing
-- ---------------------------------------------------------------------------

-- What the app asks on load. Says only whether the caller is banned and until
-- when; the staff reason stays internal.
create function api.get_my_account_standing()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  is_banned boolean;
  banned_until timestamptz;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'unauthenticated';
  end if;

  select true, ban.ends_at
  into is_banned, banned_until
  from app_private.user_bans ban
  where ban.user_id = current_user_id
    and ban.lifted_at is null
    and ban.starts_at <= statement_timestamp()
    and (ban.ends_at is null or ban.ends_at > statement_timestamp())
  order by ban.starts_at desc, ban.id desc
  limit 1;

  return jsonb_build_object(
    'banned', coalesce(is_banned, false),
    'bannedUntil', banned_until
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: the user directory
-- ---------------------------------------------------------------------------

-- Newest accounts first, keyset-paginated on (created_at, id). The query is a
-- user id (exact), an email (exact, case-insensitive) or part of a username or
-- display name.
create function api.admin_list_users(
  p_query text default null,
  p_status text default null,
  p_limit integer default 50,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  search_text text := nullif(btrim(p_query), '');
  search_id uuid;
  search_email text;
  search_pattern text;
  page_size integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  page_ids uuid[];
  page_created timestamptz[];
  found_count integer;
begin
  perform app_private.admin_assert_permission('users.read_support', false);

  if p_status is not null and p_status not in ('active', 'banned', 'deletion_requested') then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if (p_after_created_at is null) <> (p_after_id is null) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if search_text is not null then
    if char_length(search_text) > 254 then
      raise exception using errcode = 'PT400', message = 'validation_failed';
    end if;
    if search_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      search_id := search_text::uuid;
    elsif position('@' in search_text) > 0 then
      search_email := lower(search_text);
    else
      -- LIKE wildcards typed by the operator are matched literally.
      search_pattern := '%'
        || replace(replace(replace(lower(search_text), '\', '\\'), '%', '\%'), '_', '\_')
        || '%';
    end if;
  end if;

  select
    array_agg(candidate.id order by candidate.created_at desc, candidate.id desc),
    array_agg(candidate.created_at order by candidate.created_at desc, candidate.id desc)
  into page_ids, page_created
  from (
    select account.id, account.created_at
    from auth.users account
    left join app.profiles profile on profile.id = account.id
    where account.created_at is not null
      and (search_id is null or account.id = search_id)
      and (search_email is null or lower(account.email) = search_email)
      and (
        search_pattern is null
        or profile.normalized_username like search_pattern
        or lower(profile.display_name) like search_pattern
      )
      and (
        p_status is null
        or (p_status = 'banned' and app_private.user_is_banned(account.id))
        or (p_status = 'active' and not app_private.user_is_banned(account.id))
        or (
          p_status = 'deletion_requested'
          and exists (
            select 1 from app.account_deletion_requests request
            where request.user_id = account.id and request.status in ('requested', 'processing')
          )
        )
      )
      and (
        p_after_created_at is null
        or (account.created_at, account.id) < (p_after_created_at, p_after_id)
      )
    order by account.created_at desc, account.id desc
    limit page_size + 1
  ) candidate;

  found_count := coalesce(array_length(page_ids, 1), 0);

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(app_private.admin_user_json(page.id) order by page.position)
      from unnest(page_ids[1:page_size]) with ordinality as page(id, position)
    ), '[]'::jsonb),
    'nextCursor', case
      when found_count > page_size then jsonb_build_object(
        'createdAt', page_created[page_size],
        'id', page_ids[page_size]
      )
    end
  );
end;
$$;

create function api.admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  summary jsonb;
begin
  perform app_private.admin_assert_permission('users.read_support', false);
  if p_user_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  summary := app_private.admin_user_json(p_user_id);
  if summary is null then
    raise exception using errcode = 'PT404', message = 'user_not_found';
  end if;

  return summary || jsonb_build_object(
    'fantasy', (
      select jsonb_build_object(
        'teamName', team.name,
        'status', team.status,
        'createdAt', team.created_at,
        'activeLeagues', (
          select count(*)
          from app.fantasy_league_memberships membership
          where membership.fantasy_team_id = team.id and membership.status = 'active'
        )
      )
      from app.fantasy_teams team
      where team.user_id = p_user_id
      order by team.created_at desc, team.id desc
      limit 1
    ),
    'bans', coalesce((
      select jsonb_agg(history.entry order by history.starts_at desc, history.id desc)
      from (
        select
          ban.id,
          ban.starts_at,
          jsonb_build_object(
            'banId', ban.id,
            'startsAt', ban.starts_at,
            'endsAt', ban.ends_at,
            'reason', ban.reason,
            'bannedByMaskedEmail', app_private.admin_mask_email(banner.email),
            'liftedAt', ban.lifted_at,
            'liftReason', ban.lift_reason,
            'liftedByMaskedEmail', app_private.admin_mask_email(lifter.email)
          ) as entry
        from app_private.user_bans ban
        join app_private.staff_principals banned_by on banned_by.id = ban.banned_by_principal_id
        left join auth.users banner on banner.id = banned_by.auth_user_id
        left join app_private.staff_principals lifted_by on lifted_by.id = ban.lifted_by_principal_id
        left join auth.users lifter on lifter.id = lifted_by.auth_user_id
        where ban.user_id = p_user_id
        order by ban.starts_at desc, ban.id desc
        limit 20
      ) history
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: ban and lift
-- ---------------------------------------------------------------------------

-- p_duration_hours null bans until lifted; otherwise 1 hour to 10 years.
create function api.admin_ban_user(
  p_user_id uuid,
  p_reason text,
  p_duration_hours integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  actor_user_id uuid;
  prior jsonb;
  placed app_private.user_bans%rowtype;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('users.moderate', true);
  if p_user_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  perform app_private.admin_assert_moderation_reason(p_reason);
  if p_duration_hours is not null and p_duration_hours not between 1 and 87600 then
    raise exception using errcode = 'PT400', message = 'ban_duration_invalid';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'users.ban_user', p_idempotency_key,
    jsonb_build_object('userId', p_user_id, 'reason', p_reason, 'durationHours', p_duration_hours)
  );
  if prior is not null then
    return prior;
  end if;

  -- One moderation decision per account at a time.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('users.moderation:' || p_user_id::text, 0)
  );

  if not exists (select 1 from auth.users account where account.id = p_user_id) then
    raise exception using errcode = 'PT404', message = 'user_not_found';
  end if;
  select principal.auth_user_id into actor_user_id
  from app_private.staff_principals principal
  where principal.id = actor;
  if actor_user_id = p_user_id then
    raise exception using errcode = 'PT409', message = 'self_moderation_forbidden';
  end if;
  -- Current staff (active or suspended) are handled through /admin/staff. A
  -- revoked principal is a former employee whose consumer account remains an
  -- ordinary account, and can be banned like any other.
  if exists (
    select 1 from app_private.staff_principals principal
    where principal.auth_user_id = p_user_id and principal.status <> 'revoked'
  ) then
    raise exception using errcode = 'PT409', message = 'staff_account_protected';
  end if;
  if app_private.user_is_banned(p_user_id) then
    raise exception using errcode = 'PT409', message = 'user_already_banned';
  end if;

  insert into app_private.user_bans (user_id, banned_by_principal_id, reason, ends_at)
  values (
    p_user_id, actor, p_reason,
    case
      when p_duration_hours is null then null
      else statement_timestamp() + make_interval(hours => p_duration_hours)
    end
  )
  returning * into placed;

  perform app_private.write_admin_audit(
    actor, 'users.ban_user', 'users', p_user_id, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    jsonb_build_object('status', 'active'),
    jsonb_build_object('status', 'banned', 'banId', placed.id, 'endsAt', placed.ends_at)
  );

  result := app_private.admin_user_json(p_user_id);
  return app_private.admin_complete_idempotent_operation(
    actor, 'users.ban_user', p_idempotency_key, result
  );
end;
$$;

create function api.admin_unban_user(
  p_user_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  lifted app_private.user_bans%rowtype;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('users.moderate', true);
  if p_user_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  perform app_private.admin_assert_moderation_reason(p_reason);

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'users.unban_user', p_idempotency_key,
    jsonb_build_object('userId', p_user_id, 'reason', p_reason)
  );
  if prior is not null then
    return prior;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('users.moderation:' || p_user_id::text, 0)
  );

  if not exists (select 1 from auth.users account where account.id = p_user_id) then
    raise exception using errcode = 'PT404', message = 'user_not_found';
  end if;

  select ban.* into lifted
  from app_private.user_bans ban
  where ban.user_id = p_user_id
    and ban.lifted_at is null
    and ban.starts_at <= statement_timestamp()
    and (ban.ends_at is null or ban.ends_at > statement_timestamp())
  order by ban.starts_at desc, ban.id desc
  limit 1
  for update;
  if not found then
    raise exception using errcode = 'PT409', message = 'user_not_banned';
  end if;

  update app_private.user_bans
  set lifted_at = statement_timestamp(),
    lifted_by_principal_id = actor,
    lift_reason = p_reason
  where id = lifted.id;

  perform app_private.write_admin_audit(
    actor, 'users.unban_user', 'users', p_user_id, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    jsonb_build_object('status', 'banned', 'banId', lifted.id, 'endsAt', lifted.ends_at),
    jsonb_build_object('status', 'active')
  );

  result := app_private.admin_user_json(p_user_id);
  return app_private.admin_complete_idempotent_operation(
    actor, 'users.unban_user', p_idempotency_key, result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: analytics overview
-- ---------------------------------------------------------------------------

-- Aggregate counts only: no row, name or email leaves this function. Calendar
-- days are Moroccan days (Africa/Casablanca), which is what "today" means to
-- the people reading the dashboard.
create function api.admin_get_analytics_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  observed_at timestamptz := statement_timestamp();
  local_today date := (statement_timestamp() at time zone 'Africa/Casablanca')::date;
  today_start timestamptz;
  tomorrow_start timestamptz;
  window_start timestamptz;
begin
  perform app_private.admin_assert_permission('analytics.read', false);

  -- Midnights in Morocco, computed per day rather than by adding 24 hours: the
  -- Ramadan clock change makes some Moroccan days 23 or 25 hours long.
  today_start := local_today::timestamp at time zone 'Africa/Casablanca';
  tomorrow_start := (local_today + 1)::timestamp at time zone 'Africa/Casablanca';
  window_start := (local_today - 29)::timestamp at time zone 'Africa/Casablanca';

  return jsonb_build_object(
    'generatedAt', observed_at,
    'timeZone', 'Africa/Casablanca',
    'users', (
      select jsonb_build_object(
        'total', count(*),
        'newToday', count(*) filter (
          where account.created_at >= today_start and account.created_at < tomorrow_start
        ),
        'new7Days', count(*) filter (where account.created_at > observed_at - interval '7 days'),
        'new30Days', count(*) filter (where account.created_at > observed_at - interval '30 days'),
        'active7Days', count(*) filter (
          where account.last_sign_in_at > observed_at - interval '7 days'
        ),
        'active30Days', count(*) filter (
          where account.last_sign_in_at > observed_at - interval '30 days'
        ),
        'emailVerified', count(*) filter (where account.email_confirmed_at is not null)
      )
      from auth.users account
    ) || jsonb_build_object(
      'onboarded', (
        select count(*) from app.profiles profile
        where profile.onboarding_completed_at is not null and profile.deleted_at is null
      ),
      'banned', (
        select count(distinct ban.user_id)
        from app_private.user_bans ban
        where ban.lifted_at is null
          and ban.starts_at <= observed_at
          and (ban.ends_at is null or ban.ends_at > observed_at)
      ),
      'deletionRequested', (
        select count(*) from app.account_deletion_requests request
        where request.status in ('requested', 'processing')
      )
    ),
    'signupsByDay', (
      select jsonb_agg(
        jsonb_build_object(
          'date', to_char(calendar.day, 'YYYY-MM-DD'),
          'count', coalesce(daily.signups, 0)
        )
        order by calendar.day
      )
      from generate_series(
        (local_today - 29)::timestamp, local_today::timestamp, interval '1 day'
      ) as calendar(day)
      left join (
        select
          (account.created_at at time zone 'Africa/Casablanca')::date as signup_day,
          count(*) as signups
        from auth.users account
        where account.created_at >= window_start and account.created_at < tomorrow_start
        group by 1
      ) daily on daily.signup_day = calendar.day::date
    ),
    'fantasy', jsonb_build_object(
      'teams', (select count(*) from app.fantasy_teams team where team.status = 'active'),
      'teamsNew7Days', (
        select count(*) from app.fantasy_teams team
        where team.created_at > observed_at - interval '7 days'
      ),
      'leagues', (select count(*) from app.fantasy_leagues league where league.active),
      'transfers7Days', (
        select coalesce(sum(batch.transfers_count), 0)
        from app.fantasy_transfer_batches batch
        where batch.status = 'confirmed' and batch.confirmed_at > observed_at - interval '7 days'
      )
    ),
    'news', (
      select jsonb_build_object(
        'published', count(*) filter (where edition.status = 'published'),
        'published7Days', count(*) filter (
          where edition.status = 'published'
            and edition.published_at > observed_at - interval '7 days'
        ),
        'scheduled', count(*) filter (where edition.status = 'scheduled'),
        'inReview', count(*) filter (where edition.status = 'in_review'),
        'drafts', count(*) filter (where edition.status = 'draft')
      )
      from app.article_editions edition
    ),
    'notifications', jsonb_build_object(
      'devices', (
        select count(*) from app.device_registrations device where device.enabled
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function
  api.get_my_account_standing(),
  api.admin_list_users(text, text, integer, timestamptz, uuid),
  api.admin_get_user(uuid),
  api.admin_ban_user(uuid, text, integer, uuid),
  api.admin_unban_user(uuid, text, uuid),
  api.admin_get_analytics_overview()
from public, anon, authenticated, service_role;

grant execute on function
  api.get_my_account_standing(),
  api.admin_list_users(text, text, integer, timestamptz, uuid),
  api.admin_get_user(uuid),
  api.admin_ban_user(uuid, text, integer, uuid),
  api.admin_unban_user(uuid, text, uuid),
  api.admin_get_analytics_overview()
to authenticated;
$bg_20260924160000_file$]
);

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  signature text;
  problems text[] := '{}';
  standing jsonb;
begin
  foreach signature in array array[
    'api.get_my_account_standing()',
    'api.admin_list_users(text, text, integer, timestamp with time zone, uuid)',
    'api.admin_get_user(uuid)',
    'api.admin_ban_user(uuid, text, integer, uuid)',
    'api.admin_unban_user(uuid, text, uuid)',
    'api.admin_get_analytics_overview()'
  ] loop
    if to_regprocedure(signature) is null then
      problems := problems || ('missing ' || signature);
    else
      if not has_function_privilege('authenticated', signature, 'execute') then
        problems := problems || ('authenticated cannot run ' || signature);
      end if;
      if has_function_privilege('anon', signature, 'execute') then
        problems := problems || ('anon can run ' || signature);
      end if;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = to_regclass('app_private.user_bans') and c.relrowsecurity and c.relforcerowsecurity
  ) then
    problems := problems || 'app_private.user_bans is missing or not row-security forced'::text;
  end if;
  if has_table_privilege('authenticated', 'app_private.user_bans', 'select') then
    problems := problems || 'authenticated can read app_private.user_bans'::text;
  end if;

  if (
    select count(*) from pg_catalog.pg_trigger t
    where t.tgname like '%\_refuse\_banned\_actor' and not t.tgisinternal
  ) <> 7 then
    problems := problems || 'expected 7 ban triggers'::text;
  end if;

  if (
    select count(*) from app_private.admin_role_permissions mapping
    join app_private.admin_permissions permission on permission.id = mapping.permission_id
    where permission.name = 'analytics.read'
  ) <> 1 or not exists (
    select 1 from app_private.admin_role_permissions mapping
    join app_private.admin_roles role on role.id = mapping.role_id
    join app_private.admin_permissions permission on permission.id = mapping.permission_id
    where role.name = 'platform_admin' and permission.name = 'analytics.read'
  ) then
    problems := problems || 'analytics.read is not held by platform_admin alone'::text;
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260924160000') then
    problems := problems || 'history row missing'::text;
  end if;

  -- One real read, as an account with no ban.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  standing := api.get_my_account_standing();
  if standing is distinct from '{"banned": false, "bannedUntil": null}'::jsonb then
    problems := problems || ('unexpected standing: ' || standing::text);
  end if;
  perform set_config('request.jwt.claims', '', true);

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- Tell the API about the new functions (delivered only on commit).
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260924160000')
    then 'Applied. The users page and the admin dashboard now work.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
