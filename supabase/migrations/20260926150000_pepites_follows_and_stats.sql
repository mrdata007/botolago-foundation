-- BotolaGO Production V2
-- Pépites: following a player, the player's season figures and the minutes
-- split, and the ranking's desktop filters.
-- docs/engineering/PEPITES_ARCHITECTURE.md §6; Figma 03, 05, S4, D1 and D2.
--
-- Following. A signed-in account (not a guest) follows a player the rankings
-- assessed; the page shows how many accounts follow him and whether the
-- reader does. Rows are private: only these functions read or write them,
-- and an account's rows go with its profile.
--
-- Season figures. What the Stats tab, the compare page and the Percée card
-- show, read under a version like the rest: the run's own appearances (its
-- cutoff, its matches) with the provider's per-match counts beside them.
--
-- The minutes split ("Percée", "2de moitié"). The run's rounds cut in two
-- halves: 1 to floor(n/2), then the rest, where n is the run's last round (the
-- as-of round of a weekly run, the season's last for a season_final run). The
-- season_final halves are the engine's progression spans; a weekly run's are
-- the halves of the rounds played so far. Each half also counts the club's
-- matches, so a page can compare minutes per match. Under 2 rounds, none.
--
-- The ranking takes two more filters, a minutes floor and "players I follow"
-- (an account's own follows, once its second factor is satisfied),
-- carries each row's second-half minutes, and lists the run's clubs on its
-- first page for the club filter. Nothing here changes the mode.

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------
create table app.pepites_follows (
  user_id uuid not null references app.profiles(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  constraint pepites_follows_pkey primary key (user_id, player_id)
);

create index pepites_follows_player_idx on app.pepites_follows (player_id);

alter table app.pepites_follows enable row level security;
alter table app.pepites_follows force row level security;
revoke all on table app.pepites_follows from public, anon, authenticated, service_role;

create trigger pepites_follows_refuse_unverified_mfa_actor
before insert or update or delete on app.pepites_follows
for each statement execute function app_private.refuse_unverified_mfa_actor();

-- An account follows at most this many players.
create function app_private.pepites_follow_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 100;
$$;

-- A player the rankings assessed, in any run: the only players one follows.
create function app_private.pepites_followable(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app_private.pepites_run_players pool
    where pool.player_id = p_player_id and pool.in_pool
  );
$$;

-- The follow state a page shows: the count, and the reader's own state
-- (null for a signed-out reader, a guest, or an account still owing its
-- second factor, which cannot follow until it gives it).
create function app_private.pepites_follow_json(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'followers', (select count(*)::integer from app.pepites_follows follow
      where follow.player_id = p_player_id),
    'following', case
      when auth.uid() is null
        or exists (select 1 from auth.users auth_user
          where auth_user.id = auth.uid() and coalesce(auth_user.is_anonymous, false))
        or not app_private.mfa_step_up_satisfied()
      then null
      else exists (select 1 from app.pepites_follows follow
        where follow.user_id = auth.uid() and follow.player_id = p_player_id)
    end
  );
$$;

create function api.pepites_follow_state(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access text := app_private.pepites_access();
begin
  if v_access = 'none' then
    return pg_catalog.jsonb_build_object('available', false);
  end if;
  if p_player_id is null or not app_private.pepites_followable(p_player_id) then
    return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
      'found', false);
  end if;
  return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
    'found', true) || app_private.pepites_follow_json(p_player_id);
end;
$$;

-- Follow (true) or stop following (false). Idempotent: the same value again
-- changes nothing.
create function api.pepites_set_follow(p_player_id uuid, p_follow boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  v_count integer;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'PEPITES_SIGN_IN_REQUIRED';
  end if;
  if exists (select 1 from auth.users auth_user
    where auth_user.id = current_user_id and coalesce(auth_user.is_anonymous, false))
  then
    raise exception using errcode = 'PT403', message = 'PEPITES_ACCOUNT_REQUIRED';
  end if;
  if app_private.pepites_access() = 'none' then
    raise exception using errcode = 'PT403', message = 'PEPITES_UNAVAILABLE';
  end if;
  if p_player_id is null or p_follow is null then
    raise exception using errcode = 'PT400', message = 'PEPITES_FOLLOW_INVALID';
  end if;
  if not app_private.pepites_followable(p_player_id) then
    raise exception using errcode = 'PT404', message = 'PEPITES_PLAYER_NOT_FOUND';
  end if;
  if p_follow then
    -- One account at a time: the count and the insert stay together.
    perform pg_advisory_xact_lock(
      pg_catalog.hashtextextended(current_user_id::text || ':pepites_follows', 0));
    if not exists (select 1 from app.pepites_follows follow
      where follow.user_id = current_user_id and follow.player_id = p_player_id)
    then
      select count(*)::integer into v_count
      from app.pepites_follows follow where follow.user_id = current_user_id;
      if v_count >= app_private.pepites_follow_limit() then
        raise exception using errcode = 'PT409', message = 'PEPITES_FOLLOW_LIMIT';
      end if;
      insert into app.pepites_follows (user_id, player_id)
      values (current_user_id, p_player_id)
      on conflict (user_id, player_id) do nothing;
    end if;
  else
    delete from app.pepites_follows follow
    where follow.user_id = current_user_id and follow.player_id = p_player_id;
  end if;
  return pg_catalog.jsonb_build_object('available', true,
    'preview', app_private.pepites_access() = 'staff_preview', 'found', true)
    || app_private.pepites_follow_json(p_player_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- The minutes split
-- ---------------------------------------------------------------------------
create function app_private.pepites_run_halves(p_run_id uuid)
returns table (first_to integer, last_round integer)
language sql
stable
security definer
set search_path = ''
as $$
  select (last.value / 2)::integer, last.value
  from (
    select max(tf.round_number) as value
    from app_private.pepites_run_team_fixtures tf
    where tf.run_id = p_run_id
  ) last
  where last.value >= 2;
$$;

create function app_private.pepites_minutes_split(p_run_id uuid)
returns table (
  player_id uuid, first_to integer, last_round integer,
  first_minutes integer, second_minutes integer,
  first_matches integer, second_matches integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with halves as (
    select * from app_private.pepites_run_halves(p_run_id)
  ),
  team_halves as (
    select tf.team_id,
      (count(*) filter (where tf.round_number <= halves.first_to))::integer as first_matches,
      (count(*) filter (where tf.round_number > halves.first_to))::integer as second_matches
    from app_private.pepites_run_team_fixtures tf
    cross join halves
    where tf.run_id = p_run_id
    group by tf.team_id
  ),
  player_halves as (
    select a.player_id,
      coalesce(sum(a.minutes) filter (where a.round_number <= halves.first_to), 0)::integer as first_minutes,
      coalesce(sum(a.minutes) filter (where a.round_number > halves.first_to), 0)::integer as second_minutes
    from app_private.pepites_run_appearances a
    cross join halves
    where a.run_id = p_run_id
    group by a.player_id
  )
  select pool.player_id, halves.first_to, halves.last_round,
    coalesce(player_halves.first_minutes, 0), coalesce(player_halves.second_minutes, 0),
    coalesce(team_halves.first_matches, 0), coalesce(team_halves.second_matches, 0)
  from app_private.pepites_run_players pool
  cross join halves
  left join player_halves on player_halves.player_id = pool.player_id
  left join team_halves on team_halves.team_id = pool.team_id
  where pool.run_id = p_run_id and pool.in_pool;
$$;

-- ---------------------------------------------------------------------------
-- A player's season figures
-- ---------------------------------------------------------------------------
create function api.pepites_player_stats(p_version text, p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access text := app_private.pepites_access();
  v_version jsonb;
  v_run_id uuid;
begin
  if v_access = 'none' then
    return pg_catalog.jsonb_build_object('available', false);
  end if;
  v_version := app_private.pepites_resolve_version(p_version);
  v_run_id := (v_version ->> 'runId')::uuid;
  if v_version is null or v_version ->> 'status' = 'withdrawn' or not exists (
    select 1 from app_private.pepites_run_players pool
    where pool.run_id = v_run_id and pool.player_id = p_player_id and pool.in_pool
  ) then
    return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
      'found', false);
  end if;
  return pg_catalog.jsonb_build_object(
    'available', true, 'preview', v_access = 'staff_preview', 'found', true,
    'version', v_version ->> 'version', 'source', v_version ->> 'source',
    'stats', (
      select pg_catalog.jsonb_build_object(
        'apps', count(*)::integer,
        'starts', (count(*) filter (where a.started))::integer,
        'minutes', coalesce(sum(a.minutes), 0)::integer,
        'goals', coalesce(sum(a.goals), 0)::integer,
        'assists', coalesce(sum(a.assists), 0)::integer,
        'saves', sum(a.saves)::integer,
        'cleanSheets', sum(performance.clean_sheets)::integer,
        'goalsConceded', sum(performance.goals_conceded)::integer,
        'penaltiesSaved', sum(performance.penalties_saved)::integer,
        'penaltiesMissed', coalesce(sum(performance.penalties_missed), 0)::integer,
        'yellowCards', coalesce(sum(performance.yellow_cards), 0)::integer,
        'redCards', coalesce(sum(performance.red_cards), 0)::integer,
        'ownGoals', coalesce(sum(performance.own_goals), 0)::integer)
      from app_private.pepites_run_appearances a
      left join app.player_fixture_performances performance
        on performance.fixture_id = a.fixture_id and performance.player_id = a.player_id
        and performance.active
      where a.run_id = v_run_id and a.player_id = p_player_id),
    'split', (
      select pg_catalog.jsonb_build_object(
        'firstTo', split.first_to, 'lastRound', split.last_round,
        'firstMinutes', split.first_minutes, 'secondMinutes', split.second_minutes,
        'firstMatches', split.first_matches, 'secondMatches', split.second_matches)
      from app_private.pepites_minutes_split(v_run_id) split
      where split.player_id = p_player_id),
    -- The same player in the open Fantasy game, for "＋ Fantasy".
    'fantasyPlayerId', (
      select fantasy_player.id
      from app.fantasy_players fantasy_player
      join app.fantasy_seasons fantasy_season on fantasy_season.id = fantasy_player.fantasy_season_id
      where fantasy_player.football_player_id = p_player_id
        and fantasy_season.status in ('registration_open', 'active')
        and fantasy_player.active and fantasy_player.eligible
        and fantasy_player.status <> 'ineligible'
      order by fantasy_season.starts_at desc nulls last
      limit 1)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The ranking, with the desktop filters
-- ---------------------------------------------------------------------------
drop function api.pepites_ranking(text, text, integer, uuid, text, integer, integer);

create function api.pepites_ranking(
  p_version text default null,
  p_position text default null,
  p_max_age integer default null,
  p_team_id uuid default null,
  p_sort text default 'score',
  p_limit integer default 20,
  p_offset integer default 0,
  p_min_minutes integer default null,
  p_followed boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access text := app_private.pepites_access();
  v_version jsonb;
  v_run_id uuid;
  v_previous_run_id uuid;
  v_followed boolean := coalesce(p_followed, false);
  -- Whose follows: an account that owes its second factor has none here, as
  -- in the follow state (it is answered like a visitor).
  v_viewer uuid := case when coalesce(p_followed, false) and app_private.mfa_step_up_satisfied()
    then auth.uid() end;
  v_total integer;
  v_rows jsonb;
  v_teams jsonb;
begin
  if v_access = 'none' then
    return pg_catalog.jsonb_build_object('available', false);
  end if;
  if (p_position is not null and p_position not in ('GK', 'DEF', 'MID', 'FWD'))
    or (p_max_age is not null and p_max_age not between 14 and 23)
    or coalesce(p_sort, 'score') not in ('score', 'minutes', 'goals', 'assists', 'rating', 'form', 'ga90')
    or coalesce(p_limit, 20) not between 1 and 50
    or coalesce(p_offset, 0) not between 0 and 10000
    or (p_min_minutes is not null and p_min_minutes not between 0 and 10000)
  then
    raise exception using errcode = '22023', message = 'PEPITES_RANKING_INVALID';
  end if;
  v_version := app_private.pepites_resolve_version(p_version);
  if v_version is null or v_version ->> 'status' = 'withdrawn' then
    return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
      'found', false);
  end if;
  v_run_id := (v_version ->> 'runId')::uuid;
  -- Movement: against the run of the edition's previous edition.
  select previous.run_id into v_previous_run_id
  from app.pepites_editions edition
  join app.pepites_editions previous on previous.id = edition.previous_edition_id
  where edition.id = (v_version ->> 'editionId')::uuid;

  select count(*) into v_total
  from app.pepites_player_scores score
  where score.run_id = v_run_id and score.rank is not null
    and (p_position is null or score.position_group = p_position)
    and (p_max_age is null or score.age_years <= p_max_age)
    and (p_team_id is null or score.team_id = p_team_id)
    and (p_min_minutes is null or score.minutes >= p_min_minutes)
    and (not v_followed or exists (select 1 from app.pepites_follows follow
      where follow.user_id = v_viewer and follow.player_id = score.player_id));

  select coalesce(pg_catalog.jsonb_agg(row_json order by ordinal), '[]'::jsonb) into v_rows
  from (
    select ranked.ordinal,
      app_private.pepites_player_card(ranked.player_id, v_run_id) || pg_catalog.jsonb_build_object(
        'minutes', ranked.minutes, 'apps', ranked.apps, 'starts', ranked.starts,
        'goals', ranked.goals, 'assists', ranked.assists,
        'ratingAvg', ranked.rating_avg, 'formAvg', ranked.form_avg,
        'ga90', round((ranked.per90 ->> 'goalsAssists')::numeric, 2),
        'secondHalfMinutes', split.second_minutes,
        'flags', to_jsonb(ranked.flags),
        'movement', case
          when v_previous_run_id is null then null
          when previous.rank is null then pg_catalog.jsonb_build_object('kind', 'new')
          when previous.rank > ranked.rank then pg_catalog.jsonb_build_object('kind', 'up', 'by', previous.rank - ranked.rank)
          when previous.rank < ranked.rank then pg_catalog.jsonb_build_object('kind', 'down', 'by', ranked.rank - previous.rank)
          else pg_catalog.jsonb_build_object('kind', 'same')
        end
      ) as row_json
    from (
      -- The page, numbered in its own order: the joins below may reorder rows.
      select sorted.*, row_number() over (order by sorted.sort_key, sorted.rank) as ordinal
      from (
        select score.*,
          case coalesce(p_sort, 'score')
            when 'minutes' then -score.minutes
            when 'goals' then -score.goals
            when 'assists' then -score.assists
            when 'rating' then -coalesce(score.rating_avg, -1)
            when 'form' then -coalesce(score.form_avg, -1)
            when 'ga90' then -coalesce((score.per90 ->> 'goalsAssists')::numeric, -1)
            else score.rank
          end as sort_key
        from app.pepites_player_scores score
        where score.run_id = v_run_id and score.rank is not null
          and (p_position is null or score.position_group = p_position)
          and (p_max_age is null or score.age_years <= p_max_age)
          and (p_team_id is null or score.team_id = p_team_id)
          and (p_min_minutes is null or score.minutes >= p_min_minutes)
          and (not v_followed or exists (select 1 from app.pepites_follows follow
            where follow.user_id = v_viewer and follow.player_id = score.player_id))
        order by sort_key, score.rank
        limit coalesce(p_limit, 20) offset coalesce(p_offset, 0)
      ) sorted
    ) ranked
    left join app.pepites_player_scores previous
      on previous.run_id = v_previous_run_id and previous.player_id = ranked.player_id
    left join app_private.pepites_minutes_split(v_run_id) split
      on split.player_id = ranked.player_id
  ) rows_out;

  -- The clubs of the ranked players, for the club filter (first page only).
  if coalesce(p_offset, 0) = 0 then
    select coalesce(pg_catalog.jsonb_agg(app_private.pepites_team_json(clubs.team_id)
        order by clubs.name), '[]'::jsonb)
    into v_teams
    from (
      select distinct score.team_id, team.name
      from app.pepites_player_scores score
      join app.teams team on team.id = score.team_id
      where score.run_id = v_run_id and score.rank is not null
    ) clubs;
  end if;

  return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
    'found', true, 'version', v_version ->> 'version', 'source', v_version ->> 'source',
    'total', v_total, 'rows', v_rows)
    || case when v_teams is not null then pg_catalog.jsonb_build_object('teams', v_teams)
      else '{}'::jsonb end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function app_private.pepites_follow_limit() from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_followable(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_follow_json(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_run_halves(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_minutes_split(uuid) from public, anon, authenticated, service_role;

revoke all on function api.pepites_follow_state(uuid) from public, anon, authenticated, service_role;
revoke all on function api.pepites_set_follow(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function api.pepites_player_stats(text, uuid) from public, anon, authenticated, service_role;
revoke all on function api.pepites_ranking(text, text, integer, uuid, text, integer, integer, integer, boolean)
  from public, anon, authenticated, service_role;

grant execute on function api.pepites_follow_state(uuid) to anon, authenticated;
grant execute on function api.pepites_set_follow(uuid, boolean) to authenticated;
grant execute on function api.pepites_player_stats(text, uuid) to anon, authenticated;
grant execute on function api.pepites_ranking(text, text, integer, uuid, text, integer, integer, integer, boolean)
  to anon, authenticated;
