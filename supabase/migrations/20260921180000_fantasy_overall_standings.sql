-- BG-0073: /fantasy/rankings rendered an empty board for every user.
--
-- `getGlobalRankings` in src/services/fantasy-runtime.ts resolved the
-- "season-wide" leaderboard by taking the largest PUBLIC league and showing its
-- standings. Production has three fantasy leagues, all private, one member
-- each -- so the largest public league does not exist, the lookup returned
-- undefined, and a highlighted hub tile showed an empty table to every visitor
-- for the whole season regardless of how many teams were registered.
--
-- The season-wide ranking already exists as DATA. api.service_recalculate_
-- fantasy_rankings (20260720163222_fantasy_ruleset_v1.sql) writes into
-- app.fantasy_rankings twice for the overall scope on every finalization:
--
--   league_id is null, gameweek_id is null   -> season cumulative board
--   league_id is null, gameweek_id = <gw>    -> that gameweek's board
--
-- and the lifecycle runner calls `rank(null)` before ranking any league
-- (scripts/backend/fantasy-lifecycle-runner.ts). Nothing in `api` read those
-- rows: api.fantasy_league_standings (20260720191839) deliberately filters
-- `league_id = <id>`. This migration adds the missing reader.
--
-- WHAT THIS DOES NOT DO
--
-- It does not touch api.fantasy_league_standings, api.fantasy_player_pool or
-- any api.service_* function. It adds one new function and one index. The
-- league reader's signature, row order and payload are unchanged, so the squad
-- builder's keyset pagination and the Playwright journeys are unaffected.
--
-- EMPTY STATE IS THE PRIMARY CASE, NOT AN EDGE CASE
--
-- app.fantasy_rankings is completely empty in production today (0 overall rows,
-- 0 league rows) because gameweek 1 has not finalized. Until it does, EVERY
-- caller -- signed in or anonymous -- gets this function's empty page. So the
-- contract is explicit about it: an existing season with no ranking rows
-- returns HTTP 200 with `items: []`, `total: 0`, `nextCursor: null` and
-- `myRank: null`. It never raises. PT404 is reserved for an id that does not
-- exist at all. The frontend then shows its "rankings available after the
-- first gameweek" empty state rather than a spinner or an error.
--
-- ANONYMOUS CALLABILITY (BG-0063 REGRESSION GUARD)
--
-- BG-0063 was a launch blocker: api.fantasy_leagues named an app-schema enum
-- (app.fantasy_league_visibility) in its signature, and because an argument is
-- coerced to its parameter type in the CALLER's context before a security
-- definer body is entered, anonymous callers needed USAGE on schema `app` --
-- which anon deliberately does not have -- and the call 401'd with 42501. This
-- signature is uuid/uuid/bigint/uuid/integer only: every type lives in
-- pg_catalog, so no caller needs USAGE on `app`, and this migration does not
-- grant it.
--
-- MANAGER NAMES ARE NOT PUBLIC
--
-- `managerName` is intended to come from app.profiles.display_name via
-- app.fantasy_teams.user_id. Verified against production before writing this:
-- app.profiles carries exactly two policies --
--
--   profiles_select_own_authenticated  SELECT  {authenticated}  id = auth.uid()
--   profiles_update_own_authenticated  UPDATE  {authenticated}  id = auth.uid()
--
-- There is no anon-readable policy and no public-profile view in `api`
-- (api holds only my_profile, my_followed_teams, my_followed_competitions and
-- my_account_deletion_requests, all owner-scoped). GREENFIELD_MASTER_PLAN.md
-- section 5 lists "Public profile fields" as "explicit filtered view only" for
-- anon, and no such view exists yet. api.fantasy_leagues' `leaderName` is the
-- fantasy TEAM name (`leader.name`), never a profile field -- so no leaderboard
-- in this codebase has ever exposed display_name.
--
-- Therefore display_name is NOT a public profile field today. This function
-- resolves `managerName` to display_name only when auth.uid() is present, and
-- falls back to the fantasy team name for anonymous callers and for any team
-- whose profile row is missing, soft-deleted or has a blank display_name. An
-- anonymous caller can never read a profile field through this RPC.
create index if not exists fantasy_rankings_overall_page_idx
  on app.fantasy_rankings (fantasy_season_id, gameweek_id, rank, fantasy_team_id)
  include (previous_rank, total_points, gameweek_points, calculated_at)
  where league_id is null;

create or replace function api.fantasy_overall_standings(
  p_season_id uuid,
  p_gameweek_id uuid default null,
  p_after_rank bigint default null,
  p_after_team_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
declare target_gameweek uuid;
declare items jsonb;
declare total bigint;
declare next_cursor jsonb;
declare my_rank jsonb;
declare last_rank bigint;
declare last_team uuid;
begin
  -- Same validation contract as api.fantasy_league_standings: a page size
  -- outside 1..100, or half a cursor, is a client bug and not a 500.
  if p_season_id is null
    or p_limit is null
    or p_limit not between 1 and 100
    or ((p_after_rank is null) <> (p_after_team_id is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  if not exists (select 1 from app.fantasy_seasons season where season.id = p_season_id) then
    raise exception using errcode = 'PT404', message = 'fantasy_season_not_found';
  end if;

  if p_gameweek_id is not null then
    -- A gameweek from another season is a foreign id, not an empty page.
    if not exists (
      select 1 from app.fantasy_gameweeks gameweek
      where gameweek.id = p_gameweek_id and gameweek.fantasy_season_id = p_season_id
    ) then
      raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
    end if;
    target_gameweek := p_gameweek_id;
  else
    -- Default scope resolution. The season cumulative board (gameweek_id is
    -- null) is preferred: it is what "overall standings" means, it carries both
    -- total_points and the latest gameweek_points, and it is exactly what
    -- api.fantasy_league_standings returns for a null p_gameweek_id, so the two
    -- readers speak one dialect. If the lifecycle runner has written the
    -- per-gameweek overall rows but not yet the cumulative ones, fall back to
    -- the latest gameweek that actually has overall rows. If neither exists --
    -- which is production today -- target_gameweek stays null and the scope
    -- predicate below matches nothing, yielding an empty page, not an error.
    if exists (
      select 1 from app.fantasy_rankings ranking
      where ranking.fantasy_season_id = p_season_id
        and ranking.league_id is null
        and ranking.gameweek_id is null
    ) then
      target_gameweek := null;
    else
      select ranking.gameweek_id into target_gameweek
      from app.fantasy_rankings ranking
      join app.fantasy_gameweeks gameweek on gameweek.id = ranking.gameweek_id
      where ranking.fantasy_season_id = p_season_id
        and ranking.league_id is null
        and ranking.gameweek_id is not null
      order by gameweek.sequence_number desc, gameweek.id desc
      limit 1;
    end if;
  end if;

  select count(*) into total
  from app.fantasy_rankings ranking
  where ranking.fantasy_season_id = p_season_id
    and ranking.league_id is null
    and (case
      when target_gameweek is null then ranking.gameweek_id is null
      else ranking.gameweek_id = target_gameweek
    end);

  -- Bound the ranking rows on the covering keyset index before joining team
  -- and profile data, so a 50k-team board never sorts the whole season.
  with ranked_page as materialized (
    select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
      ranking.total_points, ranking.gameweek_points, ranking.calculated_at
    from app.fantasy_rankings ranking
    where ranking.fantasy_season_id = p_season_id
      and ranking.league_id is null
      and (case
        when target_gameweek is null then ranking.gameweek_id is null
        else ranking.gameweek_id = target_gameweek
      end)
      and (
        p_after_rank is null
        or (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id)
      )
    order by ranking.rank, ranking.fantasy_team_id
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id,
      'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.rank,
      'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb),
    max(ranked_page.rank),
    (array_agg(ranked_page.fantasy_team_id
      order by ranked_page.rank desc, ranked_page.fantasy_team_id desc))[1]
  into items, last_rank, last_team
  from ranked_page
  join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
  left join app.profiles profile
    on profile.id = team.user_id and profile.deleted_at is null;

  -- Only advertise a cursor when a row genuinely follows this page, so a client
  -- that follows nextCursor never burns a round trip on an empty tail.
  if last_team is not null and exists (
    select 1
    from app.fantasy_rankings ranking
    where ranking.fantasy_season_id = p_season_id
      and ranking.league_id is null
      and (case
        when target_gameweek is null then ranking.gameweek_id is null
        else ranking.gameweek_id = target_gameweek
      end)
      and (ranking.rank, ranking.fantasy_team_id) > (last_rank, last_team)
  ) then
    next_cursor := jsonb_build_object('rank', last_rank, 'teamId', last_team);
  end if;

  -- myRank is page-independent: the signed-in manager's own standing, whether
  -- or not it falls on the page being read. auth.uid() is null for anonymous
  -- callers, so no row matches and myRank is JSON null -- never an error.
  select jsonb_build_object(
    'teamId', ranking.fantasy_team_id,
    'teamName', team.name,
    'managerName', coalesce(nullif(btrim(profile.display_name), ''), team.name),
    'rank', ranking.rank,
    'previousRank', ranking.previous_rank,
    'totalPoints', ranking.total_points,
    'gameweekPoints', ranking.gameweek_points,
    'calculatedAt', ranking.calculated_at
  ) into my_rank
  from app.fantasy_rankings ranking
  join app.fantasy_teams team on team.id = ranking.fantasy_team_id
  left join app.profiles profile
    on profile.id = team.user_id and profile.deleted_at is null
  where ranking.fantasy_season_id = p_season_id
    and ranking.league_id is null
    and (case
      when target_gameweek is null then ranking.gameweek_id is null
      else ranking.gameweek_id = target_gameweek
    end)
    and team.user_id = caller
    and team.status = 'active'
  order by ranking.rank, ranking.fantasy_team_id
  limit 1;

  return jsonb_build_object(
    'seasonId', p_season_id,
    'gameweekId', target_gameweek,
    'items', items,
    'nextCursor', next_cursor,
    'total', total,
    'myRank', my_rank
  );
end;
$$;

revoke all on function api.fantasy_overall_standings(uuid, uuid, bigint, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.fantasy_overall_standings(uuid, uuid, bigint, uuid, integer)
  to anon, authenticated, service_role;
