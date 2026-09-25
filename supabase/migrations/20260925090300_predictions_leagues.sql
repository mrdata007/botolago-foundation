-- BotolaGO Production V2
-- Pronostics (score predictions), part 4 of 6: leagues.
--
-- One league, two games. A league stays one app.fantasy_leagues row (one name,
-- one owner, one invite code). Fantasy players are in it through
-- app.fantasy_league_memberships as today; anyone with an account can now also
-- join it for Pronostics only, without a Fantasy team, through
-- app.prediction_league_members. A league's Pronostics ranking is both sets of
-- active members, each person once.
--
--   api.join_prediction_league              join with the league's invite code
--   api.leave_prediction_league             leave a Pronostics-only membership
--   api.my_prediction_leagues               the caller's leagues, both kinds
--   api.predictions_league_standings        a league's Pronostics ranking
--   api.create_prediction_league            create a league without a Fantasy team
--   api.reset_prediction_league_invite_code the owner mints a new code
--
-- Fantasy is not changed: nothing here writes app.fantasy_league_memberships
-- or member_count (which stay Fantasy-only, and feed Fantasy prizes). A league
-- created here is an ordinary private league with member_count = 0, so a
-- Fantasy player can also join it through api.join_fantasy_league with the same
-- code. Invite codes are minted and fingerprinted exactly like
-- api.create_fantasy_league / api.join_fantasy_league: only a sha256 digest and
-- the last 4 characters are stored, the full code is returned once.
--
-- Limits: 50 active leagues per player, 500 Pronostics-only members per
-- league, 5 active leagues owned per player per season.
--
-- Plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md (BG-0146).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.predictions_current_fantasy_season()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select fantasy_season.id
  from app.fantasy_seasons fantasy_season
  where fantasy_season.football_season_id = app_private.predictions_current_season()
    and fantasy_season.status in ('registration_open', 'active')
  order by fantasy_season.starts_at desc, fantasy_season.id desc
  limit 1;
$$;

create or replace function app_private.prediction_league_is_member(p_league_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_user_id is not null and (
    exists (
      select 1 from app.fantasy_league_memberships membership
      where membership.league_id = p_league_id and membership.user_id = p_user_id
        and membership.status = 'active'
    )
    or exists (
      select 1 from app.prediction_league_members member
      where member.league_id = p_league_id and member.user_id = p_user_id
        and member.status = 'active'
    )
  );
$$;

create or replace function app_private.prediction_league_count_for(p_user_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer from (
    select membership.league_id
    from app.fantasy_league_memberships membership
    join app.fantasy_leagues league on league.id = membership.league_id and league.active
    where membership.user_id = p_user_id and membership.status = 'active'
    union
    select member.league_id
    from app.prediction_league_members member
    join app.fantasy_leagues league on league.id = member.league_id and league.active
    where member.user_id = p_user_id and member.status = 'active'
  ) leagues;
$$;

-- The same code format api.create_fantasy_league mints: 16 random bytes, hex,
-- upper case. Spaces and dashes a reader typed are removed first.
create or replace function app_private.prediction_invite_code_digest(p_invite_code text)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare normalized text;
begin
  normalized := upper(regexp_replace(coalesce(p_invite_code, ''), '[[:space:]-]', '', 'g'));
  if normalized !~ '^[0-9A-F]{32}$' then
    return null;
  end if;
  return encode(extensions.digest(convert_to(normalized, 'UTF8'), 'sha256'), 'hex');
end;
$$;

revoke all on function app_private.predictions_current_fantasy_season()
  from public, anon, authenticated, service_role;
revoke all on function app_private.prediction_league_is_member(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.prediction_league_count_for(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.prediction_invite_code_digest(text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- api.join_prediction_league
-- ---------------------------------------------------------------------------
create or replace function api.join_prediction_league(p_invite_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  code_digest text;
  target app.fantasy_leagues%rowtype;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  if p_invite_code is null then
    raise exception using errcode = 'PT400', message = 'invite_code_invalid';
  end if;

  code_digest := app_private.prediction_invite_code_digest(p_invite_code);
  if code_digest is not null then
    select * into target from app.fantasy_leagues league
    where league.invite_code_digest = code_digest
      and league.visibility = 'private'
      and league.active
      and league.fantasy_season_id = app_private.predictions_current_fantasy_season();
  end if;
  -- The same answer for a malformed code, an unknown one, an archived league
  -- and another season's league.
  if target.id is null then
    raise exception using errcode = 'PT404', message = 'invite_code_invalid';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('predictions:league:' || target.id::text, 0));

  if exists (
    select 1 from app.fantasy_league_memberships membership
    where membership.league_id = target.id and membership.user_id = caller
      and membership.status = 'active'
  ) then
    return jsonb_build_object('leagueId', target.id, 'name', target.name,
      'joined', false, 'via', 'fantasy');
  end if;
  if exists (
    select 1 from app.prediction_league_members member
    where member.league_id = target.id and member.user_id = caller and member.status = 'active'
  ) then
    return jsonb_build_object('leagueId', target.id, 'name', target.name,
      'joined', false, 'via', 'predictions');
  end if;

  if app_private.prediction_league_count_for(caller) >= 50 then
    raise exception using errcode = 'PT409', message = 'league_limit_reached';
  end if;
  if (
    select count(*) from app.prediction_league_members member
    where member.league_id = target.id and member.status = 'active'
  ) >= 500 then
    raise exception using errcode = 'PT409', message = 'league_full';
  end if;

  insert into app.prediction_league_members as member (league_id, user_id)
  values (target.id, caller)
  on conflict (league_id, user_id) do update set
    status = 'active', left_at = null, joined_at = statement_timestamp()
  where member.status = 'left';

  return jsonb_build_object('leagueId', target.id, 'name', target.name,
    'joined', true, 'via', 'predictions');
end;
$$;

comment on function api.join_prediction_league(text) is
  'Signed-in: join a private league of the current season for Pronostics only, with its invite code (the same code Fantasy players use). A wrong code, an archived league and another season''s league all answer PT404 invite_code_invalid.';

-- ---------------------------------------------------------------------------
-- api.leave_prediction_league
-- ---------------------------------------------------------------------------
create or replace function api.leave_prediction_league(p_league_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  membership app.prediction_league_members%rowtype;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  select * into membership from app.prediction_league_members member
  where member.league_id = p_league_id and member.user_id = caller and member.status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'league_membership_not_found';
  end if;
  if membership.role = 'owner' then
    raise exception using errcode = 'PT409', message = 'league_owner_cannot_leave';
  end if;
  update app.prediction_league_members
  set status = 'left', left_at = statement_timestamp()
  where id = membership.id;
  return jsonb_build_object('leagueId', p_league_id, 'left', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- api.my_prediction_leagues
-- ---------------------------------------------------------------------------
create or replace function api.my_prediction_leagues()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_fantasy_season_id uuid;
  v_season_id uuid;
  items jsonb := '[]'::jsonb;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  v_fantasy_season_id := app_private.predictions_current_fantasy_season();
  v_season_id := app_private.predictions_current_season();
  if v_fantasy_season_id is null then
    return jsonb_build_object('items', items);
  end if;

  with mine as (
    select membership.league_id, 'fantasy'::text as via
    from app.fantasy_league_memberships membership
    where membership.user_id = caller and membership.status = 'active'
    union all
    select member.league_id, 'predictions'::text
    from app.prediction_league_members member
    where member.user_id = caller and member.status = 'active'
  ),
  leagues as (
    select distinct on (mine.league_id) mine.league_id, mine.via
    from mine
    order by mine.league_id, (mine.via = 'fantasy') desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'leagueId', league.id,
      'name', league.name,
      'via', leagues.via,
      'role', case when league.owner_user_id = caller then 'owner' else 'member' end,
      'members', (
        select count(*) from (
          select membership.user_id from app.fantasy_league_memberships membership
          where membership.league_id = league.id and membership.status = 'active'
          union
          select member.user_id from app.prediction_league_members member
          where member.league_id = league.id and member.status = 'active'
        ) everyone
      ),
      'inviteCodeHint', case when league.owner_user_id = caller then league.invite_code_hint end,
      'seasonPoints', coalesce((
        select standing.points from app.prediction_standings standing
        where standing.user_id = caller and standing.season_id = v_season_id
          and standing.round_id is null
      ), 0)
    ) order by league.name, league.id), '[]'::jsonb)
  into items
  from leagues
  join app.fantasy_leagues league on league.id = leagues.league_id
  where league.active and league.fantasy_season_id = v_fantasy_season_id;

  return jsonb_build_object('items', items);
end;
$$;

-- ---------------------------------------------------------------------------
-- api.predictions_league_standings
-- ---------------------------------------------------------------------------
-- p_round_number null = the season ranking; otherwise that journée's. Ranked
-- when read (a league is small): points, then exact scores, then a shared rank.
-- Members who have no scored prediction yet are counted in notPlayed.
create or replace function api.predictions_league_standings(
  p_league_id uuid,
  p_round_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  target app.fantasy_leagues%rowtype;
  v_season_id uuid;
  v_round_id uuid;
  items jsonb := '[]'::jsonb;
  member_total integer := 0;
  ranked_total integer := 0;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  select * into target from app.fantasy_leagues league
  where league.id = p_league_id and league.active;
  if target.id is null or not app_private.prediction_league_is_member(target.id, caller) then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;
  v_season_id := app_private.predictions_current_season();
  if p_round_number is not null then
    v_round_id := app_private.predictions_resolve_round(v_season_id, p_round_number, now_ts);
  end if;

  with members as (
    select membership.user_id from app.fantasy_league_memberships membership
    where membership.league_id = target.id and membership.status = 'active'
    union
    select member.user_id from app.prediction_league_members member
    where member.league_id = target.id and member.status = 'active'
  ),
  scored as (
    select standing.user_id, standing.points, standing.exact_count, standing.rounds_played
    from members
    join app.prediction_standings standing on standing.user_id = members.user_id
    join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
    where standing.scored_count > 0
      and (
        (v_round_id is not null and standing.round_id = v_round_id)
        or (v_round_id is null and standing.season_id = v_season_id and standing.round_id is null)
      )
      and not exists (
        select 1 from app_private.user_bans ban
        where ban.user_id = standing.user_id and ban.lifted_at is null
          and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
      )
  ),
  ranked as (
    select scored.*,
      rank() over (order by scored.points desc, scored.exact_count desc) as position,
      count(*) over (partition by scored.points, scored.exact_count) > 1 as tied
    from scored
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'rank', ranked.position,
      'tied', ranked.tied,
      'name', coalesce(nullif(btrim(profile.display_name), ''),
        app_private.fantasy_mask_username(profile.username)),
      'points', ranked.points,
      'exact', ranked.exact_count,
      'roundsPlayed', ranked.rounds_played,
      'isMe', ranked.user_id = caller
    ) order by ranked.position, ranked.user_id), '[]'::jsonb),
    count(*)
  into items, ranked_total
  from ranked
  join app.profiles profile on profile.id = ranked.user_id;

  select count(*) into member_total from (
    select membership.user_id from app.fantasy_league_memberships membership
    where membership.league_id = target.id and membership.status = 'active'
    union
    select member.user_id from app.prediction_league_members member
    where member.league_id = target.id and member.status = 'active'
  ) everyone;

  return jsonb_build_object(
    'league', jsonb_build_object('id', target.id, 'name', target.name,
      'isOwner', target.owner_user_id = caller,
      'inviteCodeHint', case when target.owner_user_id = caller then target.invite_code_hint end),
    'scope', case when v_round_id is null then 'season' else 'round' end,
    'round', p_round_number,
    'items', items,
    'members', member_total,
    'notPlayed', greatest(member_total - ranked_total, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- api.create_prediction_league
-- ---------------------------------------------------------------------------
create or replace function api.create_prediction_league(p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_fantasy_season_id uuid;
  existing_id uuid;
  new_id uuid;
  invite_code text;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  if p_name is null or p_name <> btrim(p_name) or char_length(p_name) not between 3 and 80 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  v_fantasy_season_id := app_private.predictions_current_fantasy_season();
  if v_fantasy_season_id is null then
    raise exception using errcode = 'PT409', message = 'predictions_leagues_unavailable';
  end if;

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller::text || ':predictions:create_league', 0)
  );
  -- A double tap within a minute returns the league already created. Its code
  -- is not repeated (only the digest is stored); the owner can reset it.
  select league.id into existing_id
  from app.fantasy_leagues league
  where league.owner_user_id = caller and league.fantasy_season_id = v_fantasy_season_id
    and league.name = p_name and league.active
    and league.created_at > statement_timestamp() - interval '60 seconds'
  order by league.created_at desc
  limit 1;
  if existing_id is not null then
    return jsonb_build_object('leagueId', existing_id, 'name', p_name,
      'inviteCode', null, 'created', false);
  end if;

  if (
    select count(*) from app.fantasy_leagues league
    where league.owner_user_id = caller and league.fantasy_season_id = v_fantasy_season_id
      and league.active
  ) >= 5 then
    raise exception using errcode = 'PT409', message = 'league_create_limit_reached';
  end if;
  if app_private.prediction_league_count_for(caller) >= 50 then
    raise exception using errcode = 'PT409', message = 'league_limit_reached';
  end if;

  invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  insert into app.fantasy_leagues (
    fantasy_season_id, owner_user_id, name, visibility, invite_code_digest, invite_code_hint,
    member_count
  ) values (
    v_fantasy_season_id, caller, p_name, 'private',
    encode(extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), 'hex'),
    right(invite_code, 4), 0
  )
  returning id into new_id;

  insert into app.prediction_league_members (league_id, user_id, role)
  values (new_id, caller, 'owner');

  return jsonb_build_object('leagueId', new_id, 'name', p_name,
    'inviteCode', invite_code, 'created', true);
end;
$$;

comment on function api.create_prediction_league(text) is
  'Signed-in: create a private league of the current season without a Fantasy team. The caller is its owner (a Pronostics member); member_count stays 0 because it counts Fantasy members only. The invite code is returned once.';

-- ---------------------------------------------------------------------------
-- api.reset_prediction_league_invite_code
-- ---------------------------------------------------------------------------
create or replace function api.reset_prediction_league_invite_code(p_league_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target app.fantasy_leagues%rowtype;
  invite_code text;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  select * into target from app.fantasy_leagues league
  where league.id = p_league_id and league.owner_user_id = caller
    and league.visibility = 'private' and league.active
  for update;
  if target.id is null then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;
  invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  update app.fantasy_leagues set
    invite_code_digest = encode(extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), 'hex'),
    invite_code_hint = right(invite_code, 4)
  where id = target.id;
  return jsonb_build_object('leagueId', target.id, 'inviteCode', invite_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: signed-in players only
-- ---------------------------------------------------------------------------
revoke all on function api.join_prediction_league(text) from public;
revoke all on function api.leave_prediction_league(uuid) from public;
revoke all on function api.my_prediction_leagues() from public;
revoke all on function api.predictions_league_standings(uuid, integer) from public;
revoke all on function api.create_prediction_league(text) from public;
revoke all on function api.reset_prediction_league_invite_code(uuid) from public;

grant execute on function api.join_prediction_league(text) to authenticated, service_role;
grant execute on function api.leave_prediction_league(uuid) to authenticated, service_role;
grant execute on function api.my_prediction_leagues() to authenticated, service_role;
grant execute on function api.predictions_league_standings(uuid, integer) to authenticated, service_role;
grant execute on function api.create_prediction_league(text) to authenticated, service_role;
grant execute on function api.reset_prediction_league_invite_code(uuid) to authenticated, service_role;
