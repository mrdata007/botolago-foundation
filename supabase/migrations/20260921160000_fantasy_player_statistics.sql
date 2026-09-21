-- BG-0071: player statistics (total points, form, ownership) for the picking screens.
--
-- The scoring engine has persisted per-player per-gameweek points in
-- app.fantasy_player_gameweek_points since 20260720141850. Exactly one read RPC
-- touches that table -- api.fantasy_top_players -- and it answers a different
-- question (top N for ONE gameweek). Nothing exposes a per-player season
-- aggregate, so every list, picker and detail screen renders 0 points, 0.0 form
-- and 0.0% ownership for all 539 players, for the whole season.
--
-- This migration adds the two missing read contracts. It changes no existing
-- function, no existing table and no existing grant.
--
--   api.fantasy_player_season_stats(p_season_id, p_through_gameweek_id)
--   api.fantasy_player_gameweek_history(p_fantasy_player_id)
--
-- Both are STABLE SECURITY DEFINER with search_path = '' and are granted to
-- anon: /fantasy/players is a public route. They expose only aggregate,
-- already-public catalogue data -- points totals and how many squads hold a
-- player -- never a squad, a team name or a user id.
--
-- ---------------------------------------------------------------------------
-- Why every parameter is a built-in type (BG-0063 precedent)
-- ---------------------------------------------------------------------------
-- A function argument is coerced to its parameter type in the CALLER's context,
-- BEFORE the SECURITY DEFINER body is entered. Naming a type that lives in
-- schema `app` therefore requires the caller to hold USAGE on `app`, which
-- `anon` deliberately does not have -- that is exactly how api.fantasy_leagues
-- came to answer 401/42501 for signed-out visitors (20260921120000). Both
-- signatures below take uuid only, and every app-schema type is resolved inside
-- the body. Nothing here grants anon USAGE on `app`.
--
-- ---------------------------------------------------------------------------
-- What "form" means (see docs/backend/FANTASY_RULES_V1.md)
-- ---------------------------------------------------------------------------
-- No definition of player form existed anywhere in this codebase; the i18n keys
-- were there, the number behind them was never specified. We adopt the FPL
-- convention, which is what every screen is modelled on: the MEAN points per
-- gameweek over the last 5 SCORED gameweeks of the season, to one decimal.
--
-- Three decisions that the frontend depends on:
--   * The window is over the last 5 scored gameweeks OF THE SEASON, not the
--     last 5 in which this player happened to appear. A player who was not
--     selected scores 0 for that gameweek, exactly as in FPL.
--   * With fewer than 5 scored gameweeks, the mean is taken over however many
--     exist (denominator = that count, never 5).
--   * With ZERO scored gameweeks the answer is NULL, never 0.0. The frontend
--     renders a dash for NULL. "No gameweek has scored yet" and "this player
--     genuinely scored 0.0" are different facts and must look different to a
--     manager. This is the whole reason the column is nullable.
-- The window size is a constant in the function body, not a ruleset column, so
-- moving to last-3 is a forward migration and not a ruleset version bump.
--
-- ---------------------------------------------------------------------------
-- A "scored" gameweek
-- ---------------------------------------------------------------------------
-- status in ('provisional', 'finalizing', 'finalized', 'corrected') -- the four
-- states in which the scoring worker has written points rows. 'corrected' and
-- 'finalizing' are included deliberately: the catalog constraint treats
-- finalized and corrected as one terminal pair, and dropping 'corrected' would
-- silently erase a gameweek's points from every total the moment a correction
-- landed. 'live' is excluded: points are still moving inside a match.
--
-- ---------------------------------------------------------------------------
-- app.fantasy_players.selected_by_count
-- ---------------------------------------------------------------------------
-- Declared with a default of 0 and a >= 0 check, read back by
-- api.fantasy_player_pool as selectedByCount -- and written by nothing. No RPC,
-- no trigger, no worker. In production today all 539 rows are 0 while 105 live
-- squad memberships exist. It is a placeholder that reads as a fact.
--
-- This migration deprecates it and does NOT drop it. Ownership is derived at
-- read time below from app.fantasy_squad_memberships, which cannot drift. The
-- column keeps its value and its place in the fantasy_player_pool payload so
-- that a rollback of this release cannot lose a column and cannot break the 22
-- Playwright journeys pinned to that function's shape. The DROP belongs to a
-- clearly-marked follow-up migration, after the frontend has stopped parsing
-- selectedByCount as required.

comment on column app.fantasy_players.selected_by_count is
  'DEPRECATED (BG-0071) -- placeholder with no writer; always 0. Do not read it. '
  'Ownership is derived at read time by api.fantasy_player_season_stats from '
  'app.fantasy_squad_memberships. Scheduled for DROP in a follow-up migration '
  'once api.fantasy_player_pool consumers no longer require selectedByCount.';

-- ---------------------------------------------------------------------------
-- api.fantasy_player_season_stats
-- ---------------------------------------------------------------------------
-- One bounded read that serves every picking screen. Deliberately NOT folded
-- into api.fantasy_player_pool: that function's keyset pagination, column order
-- and payload shape are load-bearing for the squad builder and 22 Playwright
-- journeys, and must not move.
--
-- p_through_gameweek_id, when supplied, caps the aggregate at that gameweek's
-- sequence number (inclusive) so a detail page can show "as of GW n".
--
-- Cost: the aggregate is one pass over the season's points rows, driven by the
-- primary key (fantasy_player_id, gameweek_id) and the existing
-- fantasy_player_gameweek_points_gameweek_idx. No new index is added -- the PK
-- already orders the aggregate the way it is consumed. The function is STABLE
-- so PostgREST may cache it, and clients are expected to hold it for >= 60 s.
create function api.fantasy_player_season_stats(
  p_season_id uuid,
  p_through_gameweek_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  form_window constant integer := 5;
  season_exists boolean;
  cutoff_sequence integer;
  active_team_count bigint;
  scored_count integer;
  result jsonb;
begin
  select true into season_exists
  from app.fantasy_seasons season
  where season.id = p_season_id;

  if season_exists is not true then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'PT404',
        'message', 'fantasy_season_not_found',
        'details', null,
        'hint', null
      )::text,
      detail = json_build_object('status', 404, 'headers', json_build_object())::text;
  end if;

  -- The cutoff gameweek must belong to the season asked about. Accepting a
  -- gameweek from another season would silently return a whole-season total
  -- under an "as of" label.
  if p_through_gameweek_id is not null then
    select gameweek.sequence_number into cutoff_sequence
    from app.fantasy_gameweeks gameweek
    where gameweek.id = p_through_gameweek_id
      and gameweek.fantasy_season_id = p_season_id;

    if cutoff_sequence is null then
      raise sqlstate 'PGRST' using
        message = json_build_object(
          'code', 'PT404',
          'message', 'fantasy_gameweek_not_found',
          'details', null,
          'hint', null
        )::text,
        detail = json_build_object('status', 404, 'headers', json_build_object())::text;
    end if;
  end if;

  -- Ownership denominator: every active squad in the season, which is the same
  -- population the price-movement worker counts. Teams that are suspended or
  -- archived are out of both numerator and denominator.
  select count(*) into active_team_count
  from app.fantasy_teams team
  where team.fantasy_season_id = p_season_id
    and team.status = 'active';

  with scored_gameweek as (
    select gameweek.id, gameweek.sequence_number
    from app.fantasy_gameweeks gameweek
    where gameweek.fantasy_season_id = p_season_id
      and gameweek.status in ('provisional', 'finalizing', 'finalized', 'corrected')
      and (cutoff_sequence is null or gameweek.sequence_number <= cutoff_sequence)
  ),
  -- The form window is a property of the SEASON, not of the player: the same
  -- five gameweeks are averaged for everyone, and a player with no row in one
  -- of them contributes 0 for that gameweek.
  form_gameweek as (
    select id from scored_gameweek
    order by sequence_number desc
    limit form_window
  ),
  form_gameweek_count as (
    select count(*)::integer as n from form_gameweek
  ),
  pool as (
    select fantasy_player.id
    from app.fantasy_players fantasy_player
    where fantasy_player.fantasy_season_id = p_season_id
      and fantasy_player.active
      and fantasy_player.eligible
  ),
  scored as (
    select
      points.fantasy_player_id,
      sum(coalesce(points.final_points, points.provisional_points))::bigint as total_points,
      sum(points.minutes_played)::bigint as minutes,
      count(*) filter (where points.did_play)::integer as gameweeks_played,
      sum(coalesce(points.final_points, points.provisional_points))
        filter (where points.gameweek_id in (select id from form_gameweek))::bigint
        as form_points
    from app.fantasy_player_gameweek_points points
    join scored_gameweek on scored_gameweek.id = points.gameweek_id
    group by points.fantasy_player_id
  ),
  owned as (
    select membership.fantasy_player_id, count(*)::bigint as ownership_count
    from app.fantasy_squad_memberships membership
    join app.fantasy_teams team on team.id = membership.fantasy_team_id
    where membership.sold_at is null
      and team.fantasy_season_id = p_season_id
      and team.status = 'active'
    group by membership.fantasy_player_id
  )
  select
    (select n from form_gameweek_count),
    coalesce(jsonb_agg(jsonb_build_object(
      'fantasyPlayerId', pool.id,
      'totalPoints', coalesce(scored.total_points, 0),
      'form', case
        when (select n from form_gameweek_count) = 0 then null
        else round(
          coalesce(scored.form_points, 0)::numeric
            / (select n from form_gameweek_count),
          1
        )
      end,
      'gameweeksPlayed', coalesce(scored.gameweeks_played, 0),
      'minutes', coalesce(scored.minutes, 0),
      'ownershipCount', coalesce(owned.ownership_count, 0),
      'ownershipPercent', case
        when active_team_count = 0 then 0
        else round(coalesce(owned.ownership_count, 0)::numeric * 100 / active_team_count, 1)
      end
    ) order by pool.id), '[]'::jsonb)
  into scored_count, result
  from pool
  left join scored on scored.fantasy_player_id = pool.id
  left join owned on owned.fantasy_player_id = pool.id;

  return jsonb_build_object(
    'activeTeamCount', active_team_count,
    'formWindow', form_window,
    'scoredGameweeksInWindow', coalesce(scored_count, 0),
    'throughGameweekSequence', cutoff_sequence,
    'items', result
  );
end;
$function$;

comment on function api.fantasy_player_season_stats(uuid, uuid) is
  'BG-0071. Season aggregate per active+eligible fantasy player: totalPoints, '
  'form (mean points over the last 5 scored gameweeks of the season, NULL when '
  'none have scored -- never 0), gameweeksPlayed, minutes, and ownership '
  'derived live from app.fantasy_squad_memberships over active squads. '
  'Anon-callable: uuid-only signature, aggregate public data only.';

revoke all on function api.fantasy_player_season_stats(uuid, uuid) from public;
grant execute on function api.fantasy_player_season_stats(uuid, uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- api.fantasy_player_gameweek_history
-- ---------------------------------------------------------------------------
-- Feeds the player-detail History tab, which renders zeros today. One row per
-- gameweek this player has a points row for, oldest first.
--
-- `state` is provisional until final_points is written, matching
-- api.fantasy_top_players exactly. Provisional points are shown, not hidden:
-- managers expect live-ish numbers, and the state field is what tells them the
-- number can still move.
--
-- `opponents` is an array because a gameweek can legitimately carry more than
-- one fixture for a club (a double gameweek after a reassignment). Only
-- assignments that are current (superseded_at is null) and that count for
-- points are considered.
create function api.fantasy_player_gameweek_history(
  p_fantasy_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  player_season_id uuid;
  player_team_id uuid;
  result jsonb;
begin
  select fantasy_player.fantasy_season_id, fantasy_player.football_team_id
  into player_season_id, player_team_id
  from app.fantasy_players fantasy_player
  where fantasy_player.id = p_fantasy_player_id;

  if player_season_id is null then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'PT404',
        'message', 'fantasy_player_not_found',
        'details', null,
        'hint', null
      )::text,
      detail = json_build_object('status', 404, 'headers', json_build_object())::text;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'gameweekId', entry.gameweek_id,
    'gameweekSequence', entry.sequence_number,
    'gameweekName', entry.name,
    'points', entry.points,
    'minutesPlayed', entry.minutes_played,
    'didPlay', entry.did_play,
    'state', entry.state,
    'opponents', entry.opponents
  ) order by entry.sequence_number), '[]'::jsonb)
  into result
  from (
    select
      points.gameweek_id,
      gameweek.sequence_number,
      gameweek.name,
      coalesce(points.final_points, points.provisional_points) as points,
      points.minutes_played,
      points.did_play,
      case when points.final_points is null then 'provisional' else 'final' end as state,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'teamId', opponent.id,
          'shortName', opponent.short_name,
          'name', opponent.name,
          'home', fixture.home_team_id = player_team_id
        ) order by assignment.assigned_kickoff_at, fixture.id)
        from app.fantasy_fixture_assignments assignment
        join app.fixtures fixture on fixture.id = assignment.fixture_id
        join app.teams opponent on opponent.id = case
          when fixture.home_team_id = player_team_id then fixture.away_team_id
          else fixture.home_team_id
        end
        where assignment.gameweek_id = points.gameweek_id
          and assignment.fantasy_season_id = player_season_id
          and assignment.superseded_at is null
          and assignment.counts_points
          and player_team_id in (fixture.home_team_id, fixture.away_team_id)
      ), '[]'::jsonb) as opponents
    from app.fantasy_player_gameweek_points points
    join app.fantasy_gameweeks gameweek on gameweek.id = points.gameweek_id
    where points.fantasy_player_id = p_fantasy_player_id
  ) entry;

  return result;
end;
$function$;

comment on function api.fantasy_player_gameweek_history(uuid) is
  'BG-0071. One row per gameweek in which this fantasy player has a points row, '
  'oldest first: points (final when finalized, else provisional), minutesPlayed, '
  'didPlay, state, and the opponent club(s) for that gameweek. Anon-callable.';

revoke all on function api.fantasy_player_gameweek_history(uuid) from public;
grant execute on function api.fantasy_player_gameweek_history(uuid)
  to anon, authenticated, service_role;
