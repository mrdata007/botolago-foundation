-- BotolaGO Production V2
-- Fantasy "selected by": served from a snapshot refreshed every 5 minutes.
--
-- api.fantasy_player_season_stats(season) answers every player's points,
-- form and ownership ("selected by": count and percent of active squads).
-- The web app reads it on the player list, the player page, the team and
-- transfer screens and the home page's trending card, for every visitor.
-- The ownership part counted every active squad slot of the season on every
-- call: 50,000 teams are 750,000 slots. Measured locally on 2026-09-26 with
-- the Fantasy capacity seed, 253-286 ms a call and 40% of the database time
-- of the match-day browsing workload once the News club filters were fixed
-- (docs/backend/SCALE_AND_COST_REPORT.md, section 3).
--
-- The owner accepted "selected by" being up to 5 minutes old (2026-09-26).
-- So:
--
--   1. app_private.fantasy_ownership_snapshot: one row per Fantasy season
--      that is open for registration or active, with its active team count
--      and each player's count of active squads holding them, as of
--      computed_at.
--   2. app_private.fantasy_ownership_refresh(): recomputes every such
--      season in one transaction with the same query the function used.
--      An advisory lock makes an overlapping call skip ('busy'); a failure
--      raises and leaves the previous snapshot as it was.
--   3. pg_cron job `fantasy-ownership-refresh` every 5 minutes (60 s
--      statement timeout), and `fantasy-ownership-refresh-history-prune`
--      keeping a week of its run history.
--   4. api.fantasy_player_season_stats: same signature, grants and JSON.
--      While its season's snapshot is at most 10 minutes old it takes the
--      team count and the ownership counts from the snapshot; otherwise (no
--      snapshot, the job paused, failing or gone) it counts live exactly as
--      before. So "selected by" is normally at most 5 minutes old, never more
--      than 10, and never wrong because a job stopped: only slower. Points,
--      form, minutes and the gameweek cutoff are computed as before.
--
-- Pause (every call then counts live once the snapshot is 10 minutes old):
--   select cron.alter_job((select jobid from cron.job where jobname = 'fantasy-ownership-refresh'), active := false);
--   select cron.alter_job((select jobid from cron.job where jobname = 'fantasy-ownership-refresh-history-prune'), active := false);
-- Resume: the same two statements with active := true.
-- Refresh by hand (waits for a running refresh instead of skipping):
--   select app_private.fantasy_ownership_refresh(true);

-- 1. The snapshot.
create table app_private.fantasy_ownership_snapshot (
  fantasy_season_id uuid primary key references app.fantasy_seasons (id) on delete cascade,
  active_team_count bigint not null,
  ownership jsonb not null,
  computed_at timestamptz not null,
  compute_ms integer not null,
  constraint fantasy_ownership_snapshot_ownership_check check (jsonb_typeof(ownership) = 'object'),
  constraint fantasy_ownership_snapshot_count_check check (active_team_count >= 0),
  constraint fantasy_ownership_snapshot_duration_check check (compute_ms >= 0)
);
alter table app_private.fantasy_ownership_snapshot enable row level security;
alter table app_private.fantasy_ownership_snapshot force row level security;
revoke all on app_private.fantasy_ownership_snapshot from public, anon, authenticated, service_role;

comment on table app_private.fantasy_ownership_snapshot is
  'Per Fantasy season (registration_open or active): the active team count and {fantasyPlayerId: active squads holding the player} as of computed_at. api.fantasy_player_season_stats uses it while computed_at is at most 10 minutes old. Written only by app_private.fantasy_ownership_refresh() (pg_cron job fantasy-ownership-refresh, every 5 minutes).';

-- 2. The refresh.
create or replace function app_private.fantasy_ownership_refresh(p_wait boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  started timestamptz := clock_timestamp();
  as_of timestamptz := statement_timestamp();
  refreshed integer := 0;
  elapsed_ms integer;
begin
  if coalesce(p_wait, false) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fantasy:ownership-refresh', 0));
  elsif not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('fantasy:ownership-refresh', 0)) then
    return jsonb_build_object('outcome', 'busy');
  end if;

  with season as (
    select fantasy_season.id
    from app.fantasy_seasons fantasy_season
    where fantasy_season.status in ('registration_open', 'active')
  ),
  teams as (
    select season.id as fantasy_season_id, count(team.id)::bigint as active_team_count
    from season
    left join app.fantasy_teams team
      on team.fantasy_season_id = season.id and team.status = 'active'
    group by season.id
  ),
  owned as (
    select team.fantasy_season_id, membership.fantasy_player_id, count(*)::bigint as ownership_count
    from app.fantasy_squad_memberships membership
    join app.fantasy_teams team on team.id = membership.fantasy_team_id
    where membership.sold_at is null
      and team.status = 'active'
      and team.fantasy_season_id in (select id from season)
    group by team.fantasy_season_id, membership.fantasy_player_id
  ),
  computed as (
    select teams.fantasy_season_id, teams.active_team_count,
      coalesce((
        select jsonb_object_agg(owned.fantasy_player_id::text, owned.ownership_count)
        from owned where owned.fantasy_season_id = teams.fantasy_season_id
      ), '{}'::jsonb) as ownership
    from teams
  ),
  written as (
    insert into app_private.fantasy_ownership_snapshot as snapshot (
      fantasy_season_id, active_team_count, ownership, computed_at, compute_ms
    )
    select computed.fantasy_season_id, computed.active_team_count, computed.ownership, as_of,
      greatest(0, floor(extract(epoch from clock_timestamp() - started) * 1000))::integer
    from computed
    on conflict (fantasy_season_id) do update
    set active_team_count = excluded.active_team_count,
        ownership = excluded.ownership,
        -- A refresh that waited for the lock may have started before the one
        -- it waited for; never move back.
        computed_at = greatest(snapshot.computed_at, excluded.computed_at),
        compute_ms = excluded.compute_ms
    returning 1
  )
  select count(*)::integer into refreshed from written;

  elapsed_ms := greatest(0, floor(extract(epoch from clock_timestamp() - started) * 1000))::integer;
  return jsonb_build_object('outcome', 'refreshed', 'seasons', refreshed, 'computeMs', elapsed_ms);
end;
$$;

revoke all on function app_private.fantasy_ownership_refresh(boolean)
  from public, anon, authenticated, service_role;
grant execute on function app_private.fantasy_ownership_refresh(boolean) to postgres;
comment on function app_private.fantasy_ownership_refresh(boolean) is
  'Recounts Fantasy ownership for every registration_open or active season into app_private.fantasy_ownership_snapshot in one transaction; a failure raises and leaves the previous snapshot. Returns {outcome: refreshed | busy, seasons, computeMs}. Run every 5 minutes by the pg_cron job fantasy-ownership-refresh; p_wait = true waits for a running refresh instead of skipping.';

-- 3. The jobs. cron.schedule with a name replaces a job of that name.
select cron.schedule(
  'fantasy-ownership-refresh',
  '*/5 * * * *',
  $job$set local statement_timeout = '60s'; select app_private.fantasy_ownership_refresh();$job$
);

-- One history row per run (288 a day). Keep a week of this job's history.
select cron.schedule(
  'fantasy-ownership-refresh-history-prune',
  '37 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'fantasy-ownership-refresh')
      and end_time < now() - interval '7 days'
  $prune$
);

-- 4. The public read: same signature, grants and JSON.
create or replace function api.fantasy_player_season_stats(
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
  -- The ownership snapshot, when it is fresh enough (see the header).
  snapshot_team_count bigint;
  snapshot_ownership jsonb;
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
  select snapshot.active_team_count, snapshot.ownership
  into snapshot_team_count, snapshot_ownership
  from app_private.fantasy_ownership_snapshot snapshot
  where snapshot.fantasy_season_id = p_season_id
    and snapshot.computed_at >= statement_timestamp() - interval '10 minutes';

  if snapshot_ownership is not null then
    active_team_count := snapshot_team_count;
  else
    select count(*) into active_team_count
    from app.fantasy_teams team
    where team.fantasy_season_id = p_season_id
      and team.status = 'active';
  end if;

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
    select entry.key::uuid as fantasy_player_id, entry.value::bigint as ownership_count
    from jsonb_each_text(snapshot_ownership) entry
    where snapshot_ownership is not null
    union all
    select membership.fantasy_player_id, count(*)::bigint as ownership_count
    from app.fantasy_squad_memberships membership
    join app.fantasy_teams team on team.id = membership.fantasy_team_id
    where snapshot_ownership is null
      and membership.sold_at is null
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
  'none have scored -- never 0), gameweeksPlayed, minutes, and ownership over '
  'active squads, from app_private.fantasy_ownership_snapshot while it is at '
  'most 10 minutes old and counted live otherwise. '
  'Anon-callable: uuid-only signature, aggregate public data only.';

-- The first snapshot, so the read uses it from now on.
select app_private.fantasy_ownership_refresh(true);
