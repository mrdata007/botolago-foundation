-- Phase 2 forward fix: explicit NULL values must fail closed. SQL predicates
-- evaluate NULL as unknown, so regex and NOT IN checks alone are insufficient
-- at a public RPC boundary.

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
  if normalized is null or normalized !~ '^[a-z0-9][a-z0-9_-]{2,19}$' then
    return query select false, coalesce(normalized, ''), 'invalid'::text;
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
  if display_name is null
    or btrim(display_name) <> display_name
    or char_length(display_name) not between 2 and 80
  then
    raise exception using errcode = 'PT400', message = 'INVALID_DISPLAY_NAME';
  end if;
  if normalized is null or normalized !~ '^[a-z0-9][a-z0-9_-]{2,19}$' then
    raise exception using errcode = 'PT400', message = 'INVALID_USERNAME';
  end if;
  if preferred_language is null
    or match_alerts is null
    or breaking_news is null
    or fantasy_deadline_reminders is null
  then
    raise exception using errcode = 'PT400', message = 'INVALID_PREFERENCES';
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
  if preferred_language is null
    or match_alerts is null
    or breaking_news is null
    or fantasy_deadline_reminders is null
  then
    raise exception using errcode = 'PT400', message = 'INVALID_PREFERENCES';
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
  if p_team_id is null then
    raise exception using errcode = 'PT400', message = 'INVALID_TEAM_ID';
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
  if p_team_id is null then
    raise exception using errcode = 'PT400', message = 'INVALID_TEAM_ID';
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
  if p_competition_id is null then
    raise exception using errcode = 'PT400', message = 'INVALID_COMPETITION_ID';
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
  if p_competition_id is null then
    raise exception using errcode = 'PT400', message = 'INVALID_COMPETITION_ID';
  end if;
  delete from app.followed_competitions
  where user_id = current_user_id
    and followed_competitions.competition_id = p_competition_id;
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
  if normalized_scope is null or normalized_scope not in ('local', 'global', 'others') then
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
