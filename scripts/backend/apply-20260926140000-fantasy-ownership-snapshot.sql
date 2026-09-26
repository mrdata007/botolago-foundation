-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260926140000_fantasy_ownership_snapshot: Fantasy "selected by" is served
-- from a snapshot refreshed every 5 minutes (owner decision, 2026-09-26)
-- instead of counting every squad slot on every call. Measured locally with
-- 50,000 teams: about 235 ms a call becomes 2-5 ms, same answer
-- (docs/backend/SCALE_AND_COST_REPORT.md, section 3).
--
-- WHEN
--   Any time after the pull request that adds this file is merged, but NOT
--   within an hour of a Fantasy deadline: it holds squad and team writes
--   (transfers, lineup saves, chips) for its second or two so the before and
--   after answers can be compared. If such a write is already under way, it
--   stops within 5 seconds and saves nothing: run it again a minute later.
--   It adds one table, one refresh function and two pg_cron jobs
--   (`fantasy-ownership-refresh` every 5 minutes,
--   `fantasy-ownership-refresh-history-prune` daily at 03:37 UTC), and
--   replaces api.fantasy_player_season_stats. Nothing needs pausing.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL:
--      everything is applied inside one transaction, checked, and then
--      ROLLED BACK. The result row should say "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, where the snapshot or its jobs already exist, or
--     where api.fantasy_player_season_stats is not the version production held
--     on 2026-09-26 (read there: md5 of its definition; it is the repository's
--     20260921160000 version without its comments);
--   * holds squad and team writes until it ends and keeps the current answer
--     for every Fantasy season open for registration or active;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result: each such season has a snapshot, the read uses it,
--     every answer is byte for byte the old one, both jobs are scheduled and
--     active, visitors can still call the read, and nothing it added is
--     reachable from the API.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260926140000') then
    raise exception 'stop: migration 20260926140000 is already recorded as applied';
  end if;
  if to_regclass('app_private.fantasy_ownership_snapshot') is not null
    or to_regprocedure('app_private.fantasy_ownership_refresh(boolean)') is not null
    or exists (select 1 from cron.job
      where jobname in ('fantasy-ownership-refresh', 'fantasy-ownership-refresh-history-prune')) then
    raise exception 'stop: the ownership snapshot, its refresh or its jobs already exist';
  end if;
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception 'stop: pg_cron is not installed';
  end if;
  if md5(pg_get_functiondef('api.fantasy_player_season_stats(uuid,uuid)'::regprocedure))
    <> '9f9a4ac0d3e8760c7781ac315fb1b903' then
    raise exception 'stop: api.fantasy_player_season_stats is not the version this update replaces (production, 2026-09-26)';
  end if;
end
$preflight$;

-- No squad or team write until this transaction ends, so the answers cannot
-- change between the two readings (AGENTS.md, one writer at a time).
lock table app.fantasy_squad_memberships, app.fantasy_teams in share mode;

create temporary table ownership_before on commit drop as
select fantasy_season.id as fantasy_season_id,
  md5(api.fantasy_player_season_stats(fantasy_season.id)::text) as before_md5
from app.fantasy_seasons fantasy_season
where fantasy_season.status in ('registration_open', 'active');

-- ---------------------------------------------------------------------------
-- Migration 20260926140000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260926140000',
  'fantasy_ownership_snapshot',
  array[$bg_20260926140000_file$-- BotolaGO Production V2
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
$bg_20260926140000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260926140000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260926140000'
  );
begin
  if encode(sha256(convert_to(part_20260926140000, 'UTF8')), 'hex')
    is distinct from '30c3c1c01843c2e0b63426fb80ee35dc88b207708f1854981888ccf36b1dc6b8' then
    raise exception 'stop: 20260926140000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260926140000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  signature constant regprocedure := 'api.fantasy_player_season_stats(uuid,uuid)'::regprocedure;
  season record;
  started timestamptz;
  took_ms numeric;
  answer text;
begin
  if pg_get_functiondef(signature) not like '%app_private.fantasy_ownership_snapshot%' then
    problems := problems || 'the season stats do not read the ownership snapshot'::text;
  end if;
  if not has_function_privilege('anon', signature, 'execute')
    or not has_function_privilege('authenticated', signature, 'execute') then
    problems := problems || 'visitors can no longer call the season stats'::text;
  end if;
  if has_function_privilege('anon', 'app_private.fantasy_ownership_refresh(boolean)', 'execute')
    or has_function_privilege('authenticated', 'app_private.fantasy_ownership_refresh(boolean)', 'execute')
    or has_function_privilege('service_role', 'app_private.fantasy_ownership_refresh(boolean)', 'execute')
    or has_table_privilege('anon', 'app_private.fantasy_ownership_snapshot', 'select')
    or has_table_privilege('authenticated', 'app_private.fantasy_ownership_snapshot', 'select')
    or has_table_privilege('service_role', 'app_private.fantasy_ownership_snapshot', 'select') then
    problems := problems || 'the snapshot or its refresh is reachable from the API'::text;
  end if;
  if not exists (select 1 from cron.job where jobname = 'fantasy-ownership-refresh' and active
      and schedule = '*/5 * * * *' and command like '%app_private.fantasy_ownership_refresh()%')
    or not exists (select 1 from cron.job where jobname = 'fantasy-ownership-refresh-history-prune'
      and active and schedule = '37 3 * * *') then
    problems := problems || 'the refresh jobs are not scheduled as expected'::text;
  end if;

  for season in select fantasy_season_id, before_md5 from ownership_before loop
    if not exists (select 1 from app_private.fantasy_ownership_snapshot snapshot
        where snapshot.fantasy_season_id = season.fantasy_season_id) then
      problems := problems || ('no snapshot for season ' || season.fantasy_season_id);
    end if;
    started := clock_timestamp();
    answer := api.fantasy_player_season_stats(season.fantasy_season_id)::text;
    took_ms := round(extract(epoch from clock_timestamp() - started) * 1000);
    if md5(answer) is distinct from season.before_md5 then
      problems := problems || ('the answer for season ' || season.fantasy_season_id || ' differs from the old one');
    end if;
    raise notice 'season %: same answer as before, % ms from the snapshot', season.fantasy_season_id, took_ms;
  end loop;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260926140000') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260926140000')
    then 'Applied. "Selected by" is served from a snapshot pg_cron refreshes every 5 minutes.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
