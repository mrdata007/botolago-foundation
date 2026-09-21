-- BG-0074 / BG-0075 -- the Fantasy read surfaces that could only ever render
-- a blank name or a zero.
--
-- Three read-only changes, no table and no api.service_* function is touched:
--
--   1. api.fantasy_league_standings gains `managerName` in its JSON items.
--      Signature, row order and every existing key are unchanged.
--   2. api.fantasy_gameweek_summary is new: the gameweek-wide average and
--      highest team score behind the points page's Average / Highest strip.
--   3. api.get_my_fantasy_points gains per-player `events` and a top-level
--      `autoSubstitutions` array. Signature and every existing key unchanged.
--
--
-- 1. BG-0074 -- MANAGER NAMES RENDERED BLANK
--
-- src/services/fantasy-runtime.ts had to set `managerName: ""` for every league
-- standing because api.fantasy_league_standings never returned one, so
-- LeagueTable.tsx and RankingsPodium.tsx showed a team name with an empty
-- manager line on every row of every league.
--
-- MANAGER NAMES ARE NOT PUBLIC. This is settled, not re-derived here: see the
-- long note in 20260921180000_fantasy_overall_standings.sql. app.profiles
-- carries exactly two policies, both `id = auth.uid()`; anon holds no select
-- privilege on it and not even USAGE on schema `app`; and the filtered public
-- profile view that GREENFIELD_MASTER_PLAN section 5 describes does not exist.
--
-- So this migration applies that lane's rule verbatim rather than inventing a
-- second one: `display_name` is resolved only when auth.uid() is present, and
-- the fantasy team name is the answer for anonymous callers and for any team
-- whose profile row is missing, soft-deleted or blank. An anonymous caller can
-- never read a profile field through this RPC. api.fantasy_overall_standings
-- is not touched -- it already returns `managerName` under the same rule.
--
-- WHY THE FOUR BRANCHES ARE KEPT VERBATIM. api.fantasy_league_standings is
-- load-bearing: the squad builder's keyset pagination and 22 Playwright
-- journeys are pinned to it. Collapsing its four cursor/gameweek branches into
-- one parameterised query would change the plan shape and the order in which
-- ties are broken. Each branch is therefore reproduced exactly as
-- 20260720191839 wrote it, with one extra left join and one extra JSON key.
--
--
-- 2. BG-0075 -- THE POINTS PAGE COULD ONLY EVER SHOW ZEROS
--
-- `averagePoints: 0, highestPoints: 0` were hard-coded in fantasy-runtime.ts
-- because no reader existed. app.fantasy_team_gameweek_results has held the
-- data since 20260720163222; nothing in `api` aggregated it.
--
-- NULL, NEVER ZERO. A gameweek that nobody has scored has no average and no
-- highest. Returning 0 would be indistinguishable from "every manager scored
-- nothing", which is the defect this migration exists to remove.
-- api.fantasy_gameweek_summary returns JSON null for both whenever
-- `teamCount` is 0, and src/routes/fantasy.points.tsx already renders an em
-- dash for a null. `teamCount` is always a number so a caller can tell "no
-- results yet" from "an average that happens to be zero".
--
-- This is production today: app.fantasy_team_gameweek_results holds 0 rows and
-- no gameweek has finalized, so `{averagePoints: null, highestPoints: null,
-- teamCount: 0}` is the normal answer for every caller, not an edge case.
--
-- ANONYMOUS CALLABILITY (BG-0063 REGRESSION GUARD). The gameweek summary is
-- read on /fantasy/points, which a signed-out visitor can reach, so anon must
-- be able to call it. Its one argument is a uuid: every type in the signature
-- lives in pg_catalog, so no caller needs USAGE on schema `app` to coerce an
-- argument before the security definer body is entered -- which is exactly the
-- trap BG-0063 fell into with an app-schema enum -- and this migration does
-- not grant anon USAGE on `app`. api.get_my_fantasy_points stays
-- authenticated-only and owner-asserted; it is not widened here.
--
-- SUPERSEDED EVENTS ARE EXCLUDED. app.fantasy_player_point_events is an
-- append-only ledger: a correction writes a new row and stamps `superseded_at`
-- on the one it replaces. The breakdown reads `superseded_at is null` only, so
-- a corrected gameweek shows the corrected lines and never both.

-- The events lookup is per (player, gameweek) for the 15 players of one
-- lineup, and always filtered to live rows. Without this the breakdown scans
-- the whole ledger fifteen times per page view.
create index if not exists fantasy_player_point_events_live_lookup_idx
  on app.fantasy_player_point_events (fantasy_player_id, gameweek_id)
  include (category, points, fixture_id)
  where superseded_at is null;

-- The Average / Highest strip aggregates one gameweek's results; the covering
-- columns keep it index-only for a 50k-team gameweek.
create index if not exists fantasy_team_gameweek_results_gameweek_score_idx
  on app.fantasy_team_gameweek_results (gameweek_id)
  include (final_score, provisional_score, state);

create or replace function api.fantasy_league_standings(
  p_league_id uuid,
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
declare target app.fantasy_leagues%rowtype;
declare items jsonb;
declare caller uuid := (select auth.uid());
begin
  if p_limit not between 1 and 100 or ((p_after_rank is null) <> (p_after_team_id is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into target
  from app.fantasy_leagues
  where id = p_league_id and active;

  if not found then
    raise exception using errcode = 'PT404', message = 'league_not_found';
  end if;

  if target.visibility = 'private' and not exists (
    select 1
    from app.fantasy_league_memberships membership
    where membership.league_id = target.id
      and membership.user_id = caller
      and membership.status = 'active'
  ) then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;

  if p_gameweek_id is null and p_after_rank is null then
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id is null
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.rank, 'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
    left join app.profiles profile
      on profile.id = team.user_id and profile.deleted_at is null;
  elsif p_gameweek_id is null then
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id is null
        and (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id)
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.rank, 'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
    left join app.profiles profile
      on profile.id = team.user_id and profile.deleted_at is null;
  elsif p_after_rank is null then
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id = p_gameweek_id
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.rank, 'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
    left join app.profiles profile
      on profile.id = team.user_id and profile.deleted_at is null;
  else
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id = p_gameweek_id
        and (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id)
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.rank, 'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
    left join app.profiles profile
      on profile.id = team.user_id and profile.deleted_at is null;
  end if;

  return jsonb_build_object(
    'league', jsonb_build_object(
      'id', target.id,
      'name', target.name,
      'visibility', target.visibility,
      'memberCount', target.member_count
    ),
    'items', items
  );
end;
$$;

comment on function api.fantasy_league_standings(uuid, uuid, bigint, uuid, integer) is
  'League leaderboard page. managerName is the profile display name for signed-in callers only and falls back to the fantasy team name otherwise; display_name is not a public profile field.';

create or replace function api.fantasy_gameweek_summary(p_gameweek_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare gameweek app.fantasy_gameweeks%rowtype;
declare team_count bigint;
declare average_points numeric;
declare highest_points integer;
begin
  if p_gameweek_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into gameweek from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;

  -- coalesce(final_score, provisional_score) is the same score expression
  -- api.get_my_fantasy_history uses, so the strip and the history agree while a
  -- gameweek is still provisional.
  select count(*),
    round(avg(coalesce(result_row.final_score, result_row.provisional_score))::numeric, 1),
    max(coalesce(result_row.final_score, result_row.provisional_score))
  into team_count, average_points, highest_points
  from app.fantasy_team_gameweek_results result_row
  where result_row.gameweek_id = gameweek.id;

  -- No results means no average and no highest. Zero would read as "everybody
  -- scored nothing", which is the defect BG-0075 exists to remove.
  return jsonb_build_object(
    'gameweekId', gameweek.id,
    'averagePoints', case when team_count = 0 then null else average_points end,
    'highestPoints', case when team_count = 0 then null else highest_points end,
    'teamCount', team_count,
    'pointsState', gameweek.points_state
  );
end;
$$;

comment on function api.fantasy_gameweek_summary(uuid) is
  'Gameweek-wide average and highest team score. Both are null -- never zero -- while no team has been scored. Callable by anon: the points page is reachable signed out.';

revoke all on function api.fantasy_gameweek_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function api.fantasy_gameweek_summary(uuid)
  to anon, authenticated, service_role;

create or replace function api.get_my_fantasy_points(p_team_id uuid, p_gameweek_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare team app.fantasy_teams%rowtype;
declare result jsonb;
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  select jsonb_build_object(
    'teamId', team.id, 'gameweekId', gameweek.id, 'gameweekStatus', gameweek.status,
    'pointsState', gameweek.points_state,
    'result', case when result_row.id is null then null else jsonb_build_object(
      'startingPoints', result_row.starting_points, 'benchPoints', result_row.bench_points,
      'captainPoints', result_row.captain_points, 'transferHit', result_row.transfer_hit,
      'chipType', result_row.chip_type, 'provisionalScore', result_row.provisional_score,
      'finalScore', result_row.final_score, 'state', result_row.state,
      'rank', result_row.rank, 'overallRank', result_row.overall_rank,
      'calculationVersion', result_row.calculation_version,
      'finalizedAt', result_row.finalized_at
    ) end,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'fantasyPlayerId', lineup_player.fantasy_player_id, 'slot', lineup_player.slot,
      'slotOrder', lineup_player.slot_order, 'captain', lineup_player.captain,
      'viceCaptain', lineup_player.vice_captain, 'multiplier', lineup_player.multiplier,
      'provisionalPoints', points.provisional_points, 'finalPoints', points.final_points,
      'didPlay', points.did_play, 'minutesPlayed', points.minutes_played,
      -- BG-0075: the per-category lines behind a player's total. Only live
      -- ledger rows; a correction supersedes its predecessor rather than
      -- deleting it, and showing both would double the visible total.
      'events', coalesce((select jsonb_agg(jsonb_build_object(
        'category', point_event.category,
        'points', point_event.points,
        'fixtureId', point_event.fixture_id
      ) order by point_event.fixture_id, point_event.category)
      from app.fantasy_player_point_events point_event
      where point_event.fantasy_player_id = lineup_player.fantasy_player_id
        and point_event.gameweek_id = gameweek.id
        and point_event.superseded_at is null), '[]'::jsonb)
    ) order by lineup_player.slot, lineup_player.slot_order)
    from app.fantasy_lineups lineup
    join app.fantasy_lineup_players lineup_player on lineup_player.lineup_id = lineup.id
    left join app.fantasy_player_gameweek_points points
      on points.fantasy_player_id = lineup_player.fantasy_player_id and points.gameweek_id = gameweek.id
    where lineup.fantasy_team_id = team.id and lineup.gameweek_id = gameweek.id), '[]'::jsonb),
    -- BG-0075: the substitutions finalization made for this team in this
    -- gameweek, in the order it made them. Empty until the gameweek finalizes.
    'autoSubstitutions', coalesce((select jsonb_agg(jsonb_build_object(
      'playerOutId', substitution.player_out_id,
      'playerInId', substitution.player_in_id,
      'sequence', substitution.sequence_number,
      'reason', substitution.reason
    ) order by substitution.sequence_number)
    from app.fantasy_lineups lineup
    join app.fantasy_auto_substitutions substitution on substitution.lineup_id = lineup.id
    where lineup.fantasy_team_id = team.id and lineup.gameweek_id = gameweek.id), '[]'::jsonb)
  ) into result
  from app.fantasy_gameweeks gameweek
  left join app.fantasy_team_gameweek_results result_row
    on result_row.fantasy_team_id = team.id and result_row.gameweek_id = gameweek.id
  where gameweek.id = p_gameweek_id and gameweek.fantasy_season_id = team.fantasy_season_id;
  if result is null then raise exception using errcode = 'PT404', message = 'data_unavailable'; end if;
  return result;
end;
$$;

comment on function api.get_my_fantasy_points(uuid, uuid) is
  'Owner-scoped gameweek points for one fantasy team, including the per-player scoring events behind each total and the auto-substitutions applied at finalization.';
