-- BotolaGO Production V2
-- Phase 2: Identity and user-data domain.
--
-- Supabase Auth remains the identity/session authority. Canonical application
-- records live in app, the browser sees only explicit api views/RPCs, and
-- security audit data remains non-exposed in app_private.

create type app.language_code as enum ('fr', 'ar');
create type app.account_deletion_status as enum (
  'requested',
  'cancelled',
  'processing',
  'completed',
  'rejected'
);
create type app_private.security_audit_event as enum (
  'profile_updated',
  'username_changed',
  'onboarding_completed',
  'preferences_updated',
  'password_changed',
  'session_revocation_requested',
  'account_deletion_requested',
  'account_deletion_cancelled'
);

create or replace function app_private.normalize_username(candidate text)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select lower(btrim(candidate));
$$;

revoke all on function app_private.normalize_username(text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.normalize_username(text) to postgres;

create table app_private.reserved_usernames (
  username text primary key,
  created_at timestamptz not null default statement_timestamp(),
  constraint reserved_usernames_username_check check (
    username = lower(btrim(username))
    and username ~ '^[a-z0-9][a-z0-9_-]{2,19}$'
  )
);

alter table app_private.reserved_usernames enable row level security;
alter table app_private.reserved_usernames force row level security;

insert into app_private.reserved_usernames (username)
values
  ('admin'),
  ('administrator'),
  ('api'),
  ('auth'),
  ('botolago'),
  ('help'),
  ('moderator'),
  ('official'),
  ('root'),
  ('security'),
  ('staff'),
  ('support'),
  ('system')
on conflict (username) do nothing;

create table app.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  normalized_username text generated always as (lower(btrim(username))) stored,
  display_name text not null default '',
  avatar_path text,
  preferred_language app.language_code not null default 'fr',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz,
  constraint profiles_normalized_username_key unique (normalized_username),
  constraint profiles_username_check check (
    (
      username is null
      and normalized_username is null
    )
    or (
      username = normalized_username
      and username ~ '^[a-z0-9][a-z0-9_-]{2,19}$'
    )
  ),
  constraint profiles_display_name_check check (
    display_name = ''
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 2 and 80
    )
  ),
  constraint profiles_avatar_path_check check (
    avatar_path is null
    or avatar_path ~ ('^' || id::text || '/avatar[.](jpg|jpeg|png|webp)$')
  ),
  constraint profiles_onboarding_timestamp_check check (
    onboarding_completed_at is null or onboarding_completed_at >= created_at
  ),
  constraint profiles_deleted_timestamp_check check (
    deleted_at is null or deleted_at >= created_at
  )
);

comment on column app.profiles.normalized_username is
  'Database-generated canonical username used for case-insensitive uniqueness.';
comment on column app.profiles.avatar_path is
  'Object path in the private avatars bucket. External URLs are not stored.';

create table app.user_preferences (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  match_alerts boolean not null default true,
  breaking_news boolean not null default true,
  fantasy_deadline_reminders boolean not null default true,
  favorite_team_id uuid,
  favorite_team_provisional_ref text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint user_preferences_favorite_team_reference_check check (
    favorite_team_provisional_ref is null
    or favorite_team_provisional_ref ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  constraint user_preferences_single_favorite_reference_check check (
    favorite_team_id is null or favorite_team_provisional_ref is null
  )
);

comment on column app.user_preferences.favorite_team_id is
  'Canonical team UUID. Phase 3 adds the foreign key after the football catalog exists.';
comment on column app.user_preferences.favorite_team_provisional_ref is
  'Temporary frozen-frontend catalog key. Phase 3 maps it to favorite_team_id and clears it.';

create table app.followed_teams (
  user_id uuid not null references app.profiles(id) on delete cascade,
  team_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint followed_teams_pkey primary key (user_id, team_id)
);

comment on column app.followed_teams.team_id is
  'Canonical future app.teams UUID; Phase 3 adds the foreign key without changing this contract.';

create table app.followed_competitions (
  user_id uuid not null references app.profiles(id) on delete cascade,
  competition_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint followed_competitions_pkey primary key (user_id, competition_id)
);

comment on column app.followed_competitions.competition_id is
  'Canonical future app.competitions UUID; Phase 3 adds the foreign key without changing this contract.';

create table app.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  status app.account_deletion_status not null default 'requested',
  requested_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  processed_at timestamptz,
  constraint account_deletion_requests_processed_at_check check (
    processed_at is null or processed_at >= requested_at
  )
);

create unique index account_deletion_requests_user_active_key
  on app.account_deletion_requests (user_id)
  where status in ('requested', 'processing');
create index account_deletion_requests_user_requested_idx
  on app.account_deletion_requests (user_id, requested_at desc, id);
create index followed_teams_user_created_idx
  on app.followed_teams (user_id, created_at desc, team_id);
create index followed_competitions_user_created_idx
  on app.followed_competitions (user_id, created_at desc, competition_id);

create table app_private.security_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_type app_private.security_audit_event not null,
  occurred_at timestamptz not null default statement_timestamp(),
  actor_session_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  constraint security_audit_log_metadata_check check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 4096
  )
);

comment on table app_private.security_audit_log is
  'Append-only security events. No secrets or raw request payloads. Retain 365 days, then purge through a reviewed trusted job.';

create index security_audit_log_user_occurred_idx
  on app_private.security_audit_log (user_id, occurred_at desc, id);
create index security_audit_log_event_occurred_idx
  on app_private.security_audit_log (event_type, occurred_at desc, id);

alter table app.profiles enable row level security;
alter table app.profiles force row level security;
alter table app.user_preferences enable row level security;
alter table app.user_preferences force row level security;
alter table app.followed_teams enable row level security;
alter table app.followed_teams force row level security;
alter table app.followed_competitions enable row level security;
alter table app.followed_competitions force row level security;
alter table app.account_deletion_requests enable row level security;
alter table app.account_deletion_requests force row level security;
alter table app_private.security_audit_log enable row level security;
alter table app_private.security_audit_log force row level security;

create policy profiles_select_own_authenticated
on app.profiles for select to authenticated
using (id = (select auth.uid()));

create policy profiles_update_own_authenticated
on app.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy user_preferences_select_own_authenticated
on app.user_preferences for select to authenticated
using (user_id = (select auth.uid()));

create policy user_preferences_insert_own_authenticated
on app.user_preferences for insert to authenticated
with check (user_id = (select auth.uid()));

create policy user_preferences_update_own_authenticated
on app.user_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy followed_teams_select_own_authenticated
on app.followed_teams for select to authenticated
using (user_id = (select auth.uid()));

create policy followed_teams_insert_own_authenticated
on app.followed_teams for insert to authenticated
with check (user_id = (select auth.uid()));

create policy followed_teams_delete_own_authenticated
on app.followed_teams for delete to authenticated
using (user_id = (select auth.uid()));

create policy followed_competitions_select_own_authenticated
on app.followed_competitions for select to authenticated
using (user_id = (select auth.uid()));

create policy followed_competitions_insert_own_authenticated
on app.followed_competitions for insert to authenticated
with check (user_id = (select auth.uid()));

create policy followed_competitions_delete_own_authenticated
on app.followed_competitions for delete to authenticated
using (user_id = (select auth.uid()));

create policy account_deletion_requests_select_own_authenticated
on app.account_deletion_requests for select to authenticated
using (user_id = (select auth.uid()));

create policy account_deletion_requests_insert_own_authenticated
on app.account_deletion_requests for insert to authenticated
with check (user_id = (select auth.uid()));

create policy account_deletion_requests_update_own_authenticated
on app.account_deletion_requests for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create trigger profiles_set_updated_at
before update on app.profiles
for each row execute function app_private.set_updated_at();
create trigger user_preferences_set_updated_at
before update on app.user_preferences
for each row execute function app_private.set_updated_at();
create trigger account_deletion_requests_set_updated_at
before update on app.account_deletion_requests
for each row execute function app_private.set_updated_at();

create or replace function app_private.write_security_audit(
  target_user_id uuid,
  target_event app_private.security_audit_event,
  event_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_id_text text := auth.jwt() ->> 'session_id';
  safe_metadata jsonb := coalesce(event_metadata, '{}'::jsonb);
begin
  if jsonb_typeof(safe_metadata) <> 'object' or octet_length(safe_metadata::text) > 4096 then
    raise exception using errcode = '22023', message = 'INVALID_AUDIT_METADATA';
  end if;

  insert into app_private.security_audit_log (
    user_id,
    event_type,
    actor_session_id,
    metadata
  )
  values (
    target_user_id,
    target_event,
    case
      when session_id_text ~ '^[0-9a-fA-F-]{36}$' then session_id_text::uuid
      else null
    end,
    safe_metadata
  );
end;
$$;

revoke all on function app_private.write_security_audit(
  uuid,
  app_private.security_audit_event,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function app_private.write_security_audit(
  uuid,
  app_private.security_audit_event,
  jsonb
) to postgres;

create or replace function app_private.assert_security_rate_limit(
  target_user_id uuid,
  target_event app_private.security_audit_event,
  maximum_events integer,
  period interval
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  if maximum_events < 1 or period <= interval '0 seconds' then
    raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_user_id::text || ':' || target_event::text, 0)
  );

  select count(*)::integer
  into recent_count
  from app_private.security_audit_log
  where user_id = target_user_id
    and event_type = target_event
    and occurred_at >= statement_timestamp() - period;

  if recent_count >= maximum_events then
    raise exception using errcode = 'PT429', message = 'RATE_LIMITED';
  end if;
end;
$$;

revoke all on function app_private.assert_security_rate_limit(
  uuid,
  app_private.security_audit_event,
  integer,
  interval
) from public, anon, authenticated, service_role;
grant execute on function app_private.assert_security_rate_limit(
  uuid,
  app_private.security_audit_event,
  integer,
  interval
) to postgres;

create or replace function app_private.ensure_identity(
  target_user_id uuid,
  user_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_username text;
  candidate_display_name text;
  candidate_language app.language_code := 'fr'::app.language_code;
begin
  if target_user_id is null then
    raise exception using errcode = '22023', message = 'INVALID_USER_ID';
  end if;

  candidate_username := app_private.normalize_username(user_metadata ->> 'username');
  if candidate_username is not null then
    if candidate_username !~ '^[a-z0-9][a-z0-9_-]{2,19}$' then
      raise exception using errcode = 'P0001', message = 'USERNAME_INVALID';
    end if;
    if exists (
      select 1
      from app_private.reserved_usernames
      where username = candidate_username
    ) then
      raise exception using errcode = 'P0001', message = 'USERNAME_RESERVED';
    end if;
  end if;

  candidate_display_name := btrim(coalesce(user_metadata ->> 'display_name', ''));
  if char_length(candidate_display_name) not between 2 and 80 then
    candidate_display_name := '';
  end if;

  if user_metadata ->> 'preferred_language' = 'ar' then
    candidate_language := 'ar'::app.language_code;
  end if;

  begin
    insert into app.profiles (
      id,
      username,
      display_name,
      preferred_language
    )
    values (
      target_user_id,
      candidate_username,
      candidate_display_name,
      candidate_language
    )
    on conflict (id) do nothing;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'USERNAME_TAKEN';
  end;

  insert into app.user_preferences (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function app_private.ensure_identity(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function app_private.ensure_identity(uuid, jsonb) to postgres;

create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.ensure_identity(new.id, coalesce(new.raw_user_meta_data, '{}'::jsonb));
  return new;
end;
$$;

revoke all on function app_private.handle_new_auth_user()
  from public, anon, authenticated, service_role;
grant execute on function app_private.handle_new_auth_user() to postgres;

create trigger botolago_v2_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_auth_user();

-- Backfill is intentionally metadata-agnostic: existing users receive blank,
-- safe identity rows and finish onboarding through the validated API contract.
insert into app.profiles (id)
select id from auth.users
on conflict (id) do nothing;
insert into app.user_preferences (user_id)
select id from app.profiles
on conflict (user_id) do nothing;

create or replace function app_private.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.username is distinct from new.username then
    perform app_private.write_security_audit(new.id, 'username_changed', '{}'::jsonb);
  end if;

  if old.onboarding_completed_at is null and new.onboarding_completed_at is not null then
    perform app_private.write_security_audit(new.id, 'onboarding_completed', '{}'::jsonb);
  end if;

  if old.display_name is distinct from new.display_name
    or old.avatar_path is distinct from new.avatar_path
    or old.preferred_language is distinct from new.preferred_language
  then
    perform app_private.write_security_audit(new.id, 'profile_updated', '{}'::jsonb);
  end if;

  return new;
end;
$$;

create trigger profiles_audit_change
after update on app.profiles
for each row execute function app_private.audit_profile_change();

create or replace function app_private.audit_preferences_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old is distinct from new then
    perform app_private.write_security_audit(new.user_id, 'preferences_updated', '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger user_preferences_audit_change
after update on app.user_preferences
for each row execute function app_private.audit_preferences_change();

create or replace function app_private.audit_account_deletion_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app_private.write_security_audit(new.user_id, 'account_deletion_requested', '{}'::jsonb);
  elsif old.status is distinct from new.status and new.status = 'cancelled' then
    perform app_private.write_security_audit(new.user_id, 'account_deletion_cancelled', '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger account_deletion_requests_audit_change
after insert or update on app.account_deletion_requests
for each row execute function app_private.audit_account_deletion_change();

create or replace function app_private.audit_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.encrypted_password is distinct from new.encrypted_password
    and new.encrypted_password is not null
  then
    perform app_private.write_security_audit(new.id, 'password_changed', '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger botolago_v2_auth_password_changed
after update of encrypted_password on auth.users
for each row execute function app_private.audit_password_change();

revoke all on function app_private.audit_profile_change()
  from public, anon, authenticated, service_role;
revoke all on function app_private.audit_preferences_change()
  from public, anon, authenticated, service_role;
revoke all on function app_private.audit_account_deletion_change()
  from public, anon, authenticated, service_role;
revoke all on function app_private.audit_password_change()
  from public, anon, authenticated, service_role;
grant execute on function app_private.audit_profile_change() to postgres;
grant execute on function app_private.audit_preferences_change() to postgres;
grant execute on function app_private.audit_account_deletion_change() to postgres;
grant execute on function app_private.audit_password_change() to postgres;

create view api.my_profile
with (security_invoker = true)
as
select
  profile.id,
  profile.username,
  profile.normalized_username,
  profile.display_name,
  profile.avatar_path as avatar_url,
  profile.preferred_language,
  profile.onboarding_completed_at,
  profile.created_at,
  profile.updated_at,
  preference.favorite_team_id,
  preference.favorite_team_provisional_ref,
  coalesce(
    preference.favorite_team_id::text,
    preference.favorite_team_provisional_ref
  ) as favorite_club_id,
  preference.match_alerts,
  preference.breaking_news,
  preference.fantasy_deadline_reminders
from app.profiles as profile
join app.user_preferences as preference on preference.user_id = profile.id
where profile.id = (select auth.uid())
  and profile.deleted_at is null;

create view api.my_followed_teams
with (security_invoker = true)
as
select user_id, team_id, created_at
from app.followed_teams
where user_id = (select auth.uid());

create view api.my_followed_competitions
with (security_invoker = true)
as
select user_id, competition_id, created_at
from app.followed_competitions
where user_id = (select auth.uid());

create view api.my_account_deletion_requests
with (security_invoker = true)
as
select id, user_id, status, requested_at, updated_at, processed_at
from app.account_deletion_requests
where user_id = (select auth.uid());

create or replace function api.username_availability(candidate text)
returns table (
  available boolean,
  normalized_username text,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized text := app_private.normalize_username(candidate);
begin
  if normalized !~ '^[a-z0-9][a-z0-9_-]{2,19}$' then
    return query select false, normalized, 'invalid'::text;
    return;
  end if;

  if exists (
    select 1 from app_private.reserved_usernames where username = normalized
  ) then
    return query select false, normalized, 'reserved'::text;
    return;
  end if;

  if exists (
    select 1 from app.profiles where profiles.normalized_username = normalized
  ) then
    return query select false, normalized, 'taken'::text;
    return;
  end if;

  return query select true, normalized, null::text;
end;
$$;

create or replace function api.complete_onboarding(
  display_name text,
  username text,
  avatar_path text,
  preferred_language app.language_code,
  favorite_team_id uuid default null,
  favorite_team_provisional_ref text default null,
  match_alerts boolean default true,
  breaking_news boolean default true,
  fantasy_deadline_reminders boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized text := app_private.normalize_username(username);
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;
  if btrim(display_name) <> display_name or char_length(display_name) not between 2 and 80 then
    raise exception using errcode = 'PT400', message = 'INVALID_DISPLAY_NAME';
  end if;
  if normalized !~ '^[a-z0-9][a-z0-9_-]{2,19}$' then
    raise exception using errcode = 'PT400', message = 'INVALID_USERNAME';
  end if;
  if exists (
    select 1 from app_private.reserved_usernames where reserved_usernames.username = normalized
  ) then
    raise exception using errcode = 'PT400', message = 'RESERVED_USERNAME';
  end if;
  if favorite_team_id is not null and favorite_team_provisional_ref is not null then
    raise exception using errcode = 'PT400', message = 'INVALID_FAVORITE_TEAM_REFERENCE';
  end if;
  if favorite_team_provisional_ref is not null
    and favorite_team_provisional_ref !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  then
    raise exception using errcode = 'PT400', message = 'INVALID_FAVORITE_TEAM_REFERENCE';
  end if;
  if avatar_path is not null
    and avatar_path !~ ('^' || current_user_id::text || '/avatar[.](jpg|jpeg|png|webp)$')
  then
    raise exception using errcode = 'PT400', message = 'INVALID_AVATAR_PATH';
  end if;

  perform app_private.assert_security_rate_limit(
    current_user_id,
    'profile_updated',
    30,
    interval '5 minutes'
  );

  insert into app.profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

  if exists (
    select 1
    from app.profiles
    where id = current_user_id
      and profiles.username is distinct from normalized
  ) then
    perform app_private.assert_security_rate_limit(
      current_user_id,
      'username_changed',
      3,
      interval '24 hours'
    );
  end if;

  begin
    update app.profiles
    set
      username = normalized,
      display_name = complete_onboarding.display_name,
      avatar_path = complete_onboarding.avatar_path,
      preferred_language = complete_onboarding.preferred_language,
      onboarding_completed_at = coalesce(onboarding_completed_at, statement_timestamp())
    where id = current_user_id
      and deleted_at is null;
  exception
    when unique_violation then
      raise exception using errcode = 'PT409', message = 'USERNAME_TAKEN';
  end;

  if not found then
    raise exception using errcode = 'PT404', message = 'PROFILE_NOT_FOUND';
  end if;

  insert into app.user_preferences (
    user_id,
    favorite_team_id,
    favorite_team_provisional_ref,
    match_alerts,
    breaking_news,
    fantasy_deadline_reminders
  )
  values (
    current_user_id,
    complete_onboarding.favorite_team_id,
    complete_onboarding.favorite_team_provisional_ref,
    complete_onboarding.match_alerts,
    complete_onboarding.breaking_news,
    complete_onboarding.fantasy_deadline_reminders
  )
  on conflict (user_id) do update
  set
    favorite_team_id = excluded.favorite_team_id,
    favorite_team_provisional_ref = excluded.favorite_team_provisional_ref,
    match_alerts = excluded.match_alerts,
    breaking_news = excluded.breaking_news,
    fantasy_deadline_reminders = excluded.fantasy_deadline_reminders;
end;
$$;

create or replace function api.update_my_preferences(
  match_alerts boolean,
  breaking_news boolean,
  fantasy_deadline_reminders boolean,
  preferred_language app.language_code
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;

  perform app_private.assert_security_rate_limit(
    current_user_id,
    'preferences_updated',
    30,
    interval '5 minutes'
  );

  update app.profiles
  set preferred_language = update_my_preferences.preferred_language
  where id = current_user_id and deleted_at is null;

  if not found then
    raise exception using errcode = 'PT404', message = 'PROFILE_NOT_FOUND';
  end if;

  insert into app.user_preferences (
    user_id,
    match_alerts,
    breaking_news,
    fantasy_deadline_reminders
  )
  values (
    current_user_id,
    update_my_preferences.match_alerts,
    update_my_preferences.breaking_news,
    update_my_preferences.fantasy_deadline_reminders
  )
  on conflict (user_id) do update
  set
    match_alerts = excluded.match_alerts,
    breaking_news = excluded.breaking_news,
    fantasy_deadline_reminders = excluded.fantasy_deadline_reminders;
end;
$$;

create or replace function api.follow_team(p_team_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;
  insert into app.followed_teams (user_id, team_id)
  values (current_user_id, p_team_id)
  on conflict (user_id, team_id) do nothing;
  return true;
end;
$$;

create or replace function api.unfollow_team(p_team_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;
  delete from app.followed_teams
  where user_id = current_user_id and followed_teams.team_id = p_team_id;
  return true;
end;
$$;

create or replace function api.follow_competition(p_competition_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;
  insert into app.followed_competitions (user_id, competition_id)
  values (current_user_id, p_competition_id)
  on conflict (user_id, competition_id) do nothing;
  return true;
end;
$$;

create or replace function api.unfollow_competition(p_competition_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;
  delete from app.followed_competitions
  where user_id = current_user_id
    and followed_competitions.competition_id = p_competition_id;
  return true;
end;
$$;

create or replace function api.request_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;

  perform app_private.assert_security_rate_limit(
    current_user_id,
    'account_deletion_requested',
    3,
    interval '24 hours'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text || ':account-deletion', 0)
  );

  select id into request_id
  from app.account_deletion_requests
  where user_id = current_user_id and status in ('requested', 'processing')
  order by requested_at desc
  limit 1;

  if request_id is not null then
    return request_id;
  end if;

  insert into app.account_deletion_requests (user_id)
  values (current_user_id)
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function api.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;

  update app.account_deletion_requests
  set status = 'cancelled'
  where user_id = current_user_id and status = 'requested';

  return true;
end;
$$;

create or replace function api.record_session_revocation(scope text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_scope text := lower(btrim(scope));
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;
  if normalized_scope not in ('local', 'global', 'others') then
    raise exception using errcode = 'PT400', message = 'INVALID_SESSION_SCOPE';
  end if;

  perform app_private.assert_security_rate_limit(
    current_user_id,
    'session_revocation_requested',
    10,
    interval '1 hour'
  );
  perform app_private.write_security_audit(
    current_user_id,
    'session_revocation_requested',
    jsonb_build_object('scope', normalized_scope)
  );
end;
$$;

revoke all on function api.username_availability(text)
  from public, anon, authenticated, service_role;
revoke all on function api.complete_onboarding(
  text, text, text, app.language_code, uuid, text, boolean, boolean, boolean
) from public, anon, authenticated, service_role;
revoke all on function api.update_my_preferences(
  boolean, boolean, boolean, app.language_code
) from public, anon, authenticated, service_role;
revoke all on function api.follow_team(uuid)
  from public, anon, authenticated, service_role;
revoke all on function api.unfollow_team(uuid)
  from public, anon, authenticated, service_role;
revoke all on function api.follow_competition(uuid)
  from public, anon, authenticated, service_role;
revoke all on function api.unfollow_competition(uuid)
  from public, anon, authenticated, service_role;
revoke all on function api.request_account_deletion()
  from public, anon, authenticated, service_role;
revoke all on function api.cancel_account_deletion()
  from public, anon, authenticated, service_role;
revoke all on function api.record_session_revocation(text)
  from public, anon, authenticated, service_role;

grant usage on schema app to authenticated;
grant usage on type app.language_code to anon, authenticated;
grant select on app.profiles,
  app.user_preferences,
  app.followed_teams,
  app.followed_competitions,
  app.account_deletion_requests
to authenticated;

grant select on api.my_profile,
  api.my_followed_teams,
  api.my_followed_competitions,
  api.my_account_deletion_requests
to authenticated;
grant execute on function api.username_availability(text) to anon, authenticated;
grant execute on function api.complete_onboarding(
  text, text, text, app.language_code, uuid, text, boolean, boolean, boolean
) to authenticated;
grant execute on function api.update_my_preferences(
  boolean, boolean, boolean, app.language_code
) to authenticated;
grant execute on function api.follow_team(uuid), api.unfollow_team(uuid),
  api.follow_competition(uuid), api.unfollow_competition(uuid),
  api.request_account_deletion(), api.cancel_account_deletion(),
  api.record_session_revocation(text)
to authenticated;

-- Private avatars: object paths are exactly <auth.uid()>/avatar.<safe-ext>.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_select_own_authenticated
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar[.](jpg|jpeg|png|webp)$')
);

create policy avatars_insert_own_authenticated
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar[.](jpg|jpeg|png|webp)$')
);

create policy avatars_update_own_authenticated
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar[.](jpg|jpeg|png|webp)$')
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar[.](jpg|jpeg|png|webp)$')
);

create policy avatars_delete_own_authenticated
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar[.](jpg|jpeg|png|webp)$')
);
