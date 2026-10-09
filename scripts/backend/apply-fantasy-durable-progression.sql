-- Production V2, tkewgajrljbwgwedqsxn. Reviewed exact-file promotion.
-- First check GitHub production writers and pg_stat_activity (AGENTS.md).
-- Run the whole file: it defaults to ROLLBACK. Inspect the rehearsal and reread
-- the baseline before changing only the final ROLLBACK to COMMIT.
-- The cron interlock prevents any scheduled run starting inside this transaction.
-- No business data may change, including the two historical retry probes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select app_private.hold_scheduled_jobs();
lock table app.fantasy_players, app.fantasy_gameweeks, app.fantasy_teams,
  app.fantasy_lineups, app_private.fantasy_gameweek_postwork in share row exclusive mode;
create temporary table fantasy_rollout_settings on commit drop as
  select lifecycle_tick_enabled from app_private.fantasy_automation_settings where id;
select app_private.fantasy_automation_configure(false);

do $preflight$
begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='20261009091728') then
    raise exception 'stop: migration already installed';
  end if;
  if (select max(version) from supabase_migrations.schema_migrations) <> '20261008123400' then
    raise exception 'stop: migration baseline changed';
  end if;
  if exists(select 1 from (values
    ('api.service_run_fantasy_price_batch(uuid,bigint,uuid,integer)', '3694a4f40fcc98708b8f45655a7a4296'),
    ('api.service_complete_fantasy_postwork(uuid,bigint)', 'd9748468551ac6ce6dde3ec88d011f59'),
    ('api.service_prepare_next_fantasy_gameweek(uuid,uuid,bigint,integer)', '7167a59c70438da05343cac3ed4aa06b'),
    ('app_private.fantasy_lifecycle_tick()', '1c950b4228a2414d4e2d88d3c6075cac'),
    ('app_private.ops_health_checks()', '969823f4caa375302ef89f4f1c1700bb')
  ) expected(routine, source_md5) left join pg_proc p on p.oid=to_regprocedure(expected.routine)
    where md5(p.prosrc) is distinct from expected.source_md5) then
    raise exception 'stop: a reviewed routine has changed';
  end if;
end;
$preflight$;

create function pg_temp.fantasy_business_digest() returns text language sql as $digest$
  select md5(jsonb_build_object(
    'work',(select jsonb_agg(to_jsonb(t) order by gameweek_id,calculation_version) from app_private.fantasy_gameweek_postwork t),
    'players',(select jsonb_agg(to_jsonb(t) order by id) from app.fantasy_players t),
    'weeks',(select jsonb_agg(to_jsonb(t) order by id) from app.fantasy_gameweeks t),
    'teams',(select jsonb_agg(to_jsonb(t) order by id) from app.fantasy_teams t),
    'lineups',(select jsonb_agg(to_jsonb(t) order by id) from app.fantasy_lineups t),
    'events',(select count(*) from app_private.notification_events)
  )::text);
$digest$;
create temporary table fantasy_rollout_baseline on commit drop as select pg_temp.fantasy_business_digest() digest;

insert into supabase_migrations.schema_migrations(version,name,statements)
values ('20261009091728','fantasy_durable_progression',array[$migration$-- Completed price cohorts remain immutable; unfinished cohorts are protected.
-- No historical data, schedules, switches or deadline rules are changed here.

create or replace function api.service_run_fantasy_price_batch(
  p_gameweek_id uuid, p_calculation_version bigint,
  p_after_player_id uuid default null, p_batch_size integer default 100
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gameweek app.fantasy_gameweeks%rowtype;
declare journal app_private.fantasy_gameweek_postwork%rowtype;
declare player_ids uuid[];
declare expected_after uuid;
declare expected_more boolean;
declare response jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_batch_size is null or p_batch_size not between 1 and 1000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- Serializes catalog DML with both creation and continuation of the price journal.
  -- Catalog DML takes ROW EXCLUSIVE before its trigger checks unfinished work.
  lock table app.fantasy_players in share row exclusive mode;
  gameweek := app_private.fantasy_require_finalized_postwork(p_gameweek_id, p_calculation_version);
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into player_ids
    from app.fantasy_players where fantasy_season_id = gameweek.fantasy_season_id;
  insert into app_private.fantasy_gameweek_postwork (
    gameweek_id, calculation_version, price_source_version, price_player_ids
  ) values (gameweek.id, p_calculation_version, gameweek.sequence_number::bigint + 1, player_ids)
  on conflict (gameweek_id, calculation_version) do nothing;
  select * into journal from app_private.fantasy_gameweek_postwork
    where gameweek_id = gameweek.id and calculation_version = p_calculation_version for update;
  if journal.prices_completed_at is null
    and journal.price_player_ids is distinct from player_ids then
    raise exception using errcode = 'PT409', message = 'fantasy_price_catalog_changed';
  end if;

  -- A restarted worker may begin at null and receive the durable current cursor.
  if p_after_player_id is null and journal.price_last_response is not null then
    return jsonb_build_object('updatedMemberships', 0, 'afterPlayerId', journal.price_after_player_id,
      'hasMore', journal.prices_completed_at is null, 'stableResult', true);
  end if;
  if journal.price_last_response is not null
    and p_after_player_id is not distinct from journal.price_last_request_after then
    return journal.price_last_response || jsonb_build_object('stableResult', true);
  end if;
  if p_after_player_id is distinct from journal.price_after_player_id then
    raise exception using errcode = 'PT409', message = 'fantasy_price_cursor_invalid';
  end if;
  if journal.prices_completed_at is not null then
    return jsonb_build_object('updatedMemberships', 0, 'afterPlayerId', journal.price_after_player_id,
      'hasMore', false, 'stableResult', true);
  end if;

  select (array_agg(id order by id desc))[1] into expected_after from (
    select id from unnest(player_ids) as pool(id)
    where p_after_player_id is null or id > p_after_player_id order by id limit p_batch_size
  ) page;
  expected_more := exists (select 1 from unnest(player_ids) as pool(id) where id > expected_after);
  response := api.service_apply_fantasy_price_changes(
    gameweek.id, journal.price_source_version, p_after_player_id, p_batch_size
  );
  if (response->>'afterPlayerId')::uuid is distinct from expected_after
    or (response->>'hasMore')::boolean is distinct from expected_more then
    raise exception using errcode = 'PT409', message = 'fantasy_price_cursor_invalid';
  end if;
  update app_private.fantasy_gameweek_postwork set
    price_after_player_id = expected_after, price_last_request_after = p_after_player_id,
    price_last_response = response,
    prices_completed_at = case when not expected_more then statement_timestamp() else null end
  where gameweek_id = gameweek.id and calculation_version = p_calculation_version;
  return response || jsonb_build_object('stableResult', false);
end;
$$;
revoke all on function api.service_run_fantasy_price_batch(uuid,bigint,uuid,integer)
  from public, anon, authenticated;
grant execute on function api.service_run_fantasy_price_batch(uuid,bigint,uuid,integer) to service_role;

create or replace function api.service_complete_fantasy_postwork(p_gameweek_id uuid, p_calculation_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gameweek app.fantasy_gameweeks%rowtype;
declare journal app_private.fantasy_gameweek_postwork%rowtype;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  gameweek := app_private.fantasy_require_finalized_postwork(p_gameweek_id, p_calculation_version);
  select * into journal from app_private.fantasy_gameweek_postwork
    where gameweek_id = gameweek.id and calculation_version = p_calculation_version for update;
  if not found or journal.prices_completed_at is null then
    raise exception using errcode = 'PT409', message = 'fantasy_prices_incomplete';
  end if;
  if journal.completed_at is not null then
    return jsonb_build_object('completed', true, 'stableResult', true, 'completedAt', journal.completed_at);
  end if;
  -- Completed pricing certifies its frozen cohort, including while notifications
  -- are still pending. Later catalog additions belong to a later price pass.
  if exists (
    select 1 from app.fantasy_lineups lineup
    left join app.fantasy_team_gameweek_results result on result.gameweek_id = lineup.gameweek_id
      and result.fantasy_team_id = lineup.fantasy_team_id
    where lineup.gameweek_id = gameweek.id
      and (lineup.finalized_at is null or result.state is distinct from 'final'::app.fantasy_points_state
        or result.calculation_version is distinct from p_calculation_version)
  ) then
    raise exception using errcode = 'PT409', message = 'fantasy_notifications_incomplete';
  end if;
  if exists (
    select 1 from app.fantasy_team_gameweek_results result
    join app.fantasy_teams team on team.id = result.fantasy_team_id
    left join app_private.notification_events event on event.deduplication_key =
      'fantasy:gameweek_finalized:' || gameweek.id::text || ':' || team.id::text || ':v' || p_calculation_version::text
    where result.gameweek_id = gameweek.id and (
      result.state <> 'final' or result.calculation_version <> p_calculation_version
      or event.event_type is distinct from 'gameweek_finalized'::app.notification_type
      or event.source_domain is distinct from 'fantasy'::app.notification_source_domain
      or event.source_entity_id is distinct from gameweek.id
      or event.target_user_id is distinct from team.user_id
      or event.schema_version is distinct from 1
      or event.occurred_at is distinct from gameweek.finalized_at
      or event.correlation_id is distinct from gameweek.id
      or event.safe_payload is distinct from jsonb_build_object('gameweek', gameweek.sequence_number, 'points', result.final_score)
    )
  ) then
    raise exception using errcode = 'PT409', message = 'fantasy_notifications_incomplete';
  end if;
  update app_private.fantasy_gameweek_postwork set completed_at = statement_timestamp()
    where gameweek_id = gameweek.id and calculation_version = p_calculation_version
    returning * into journal;
  return jsonb_build_object('completed', true, 'stableResult', false, 'completedAt', journal.completed_at);
end;
$$;
revoke all on function api.service_complete_fantasy_postwork(uuid,bigint)
  from public, anon, authenticated;
grant execute on function api.service_complete_fantasy_postwork(uuid,bigint) to service_role;

-- Refuse catalog changes between price pages, across transactions. The table
-- lock in the price RPC closes the race with journal creation/completion.
create function app_private.fantasy_guard_unfinished_price_catalog()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and row(old.id, old.fantasy_season_id, old.football_player_id,
      old.football_team_id, old.position_id) is not distinct from
    row(new.id, new.fantasy_season_id, new.football_player_id, new.football_team_id, new.position_id) then
    return new;
  end if;
  if exists (
    select 1 from app_private.fantasy_gameweek_postwork work
    join app.fantasy_gameweeks gw on gw.id = work.gameweek_id
    where work.prices_completed_at is null
      and gw.status = 'finalized' and gw.scoring_input_version = work.calculation_version
      and (gw.fantasy_season_id = case when TG_OP <> 'INSERT' then old.fantasy_season_id end
        or gw.fantasy_season_id = case when TG_OP <> 'DELETE' then new.fantasy_season_id end)
  ) then
    raise exception using errcode = 'PT409', message = 'fantasy_price_processing_in_progress';
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.fantasy_guard_unfinished_price_catalog()
  from public, anon, authenticated, service_role;
create trigger fantasy_guard_unfinished_price_catalog
before insert or delete or update of id, fantasy_season_id, football_player_id, football_team_id, position_id
on app.fantasy_players for each row execute function app_private.fantasy_guard_unfinished_price_catalog();

create or replace function api.service_prepare_next_fantasy_gameweek(
  p_previous_gameweek_id uuid,p_next_gameweek_id uuid,p_calculation_version bigint,p_batch_size integer default 100
) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous app.fantasy_gameweeks%rowtype; next_week app.fantasy_gameweeks%rowtype;
  season app.fantasy_seasons%rowtype; progress app_private.fantasy_gameweek_progressions%rowtype;
  team app.fantasy_teams%rowtype; source_id uuid; next_lineup_id uuid;
  free_hit_id uuid; selection jsonb; prepared integer:=0; remaining boolean;
  expected_clubs integer; fixture_count integer; first_kickoff timestamptz;
  round_fixture_count integer; round_participant_count integer; playable_unassigned integer;
begin
  if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
  if p_previous_gameweek_id is null or p_next_gameweek_id is null or p_calculation_version is null
    or p_calculation_version<1 or p_batch_size is null or p_batch_size not between 1 and 1000 then
    raise exception using errcode='PT400',message='validation_failed'; end if;
  -- Match the calendar tick's lock order before taking gameweek row locks.
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('fantasy:calendar:' ||
    (select fantasy_season_id::text from app.fantasy_gameweeks where id=p_previous_gameweek_id), 0));
  select * into previous from app.fantasy_gameweeks where id=p_previous_gameweek_id for update;
  select * into next_week from app.fantasy_gameweeks where id=p_next_gameweek_id for update;
  if previous.id is null or next_week.id is null then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
  if next_week.fantasy_season_id<>previous.fantasy_season_id or next_week.sequence_number<>previous.sequence_number+1 then
    raise exception using errcode='PT409',message='fantasy_next_gameweek_scope_invalid'; end if;
  select * into progress from app_private.fantasy_gameweek_progressions where previous_gameweek_id=previous.id;
  if found and (progress.next_gameweek_id<>next_week.id or progress.calculation_version<>p_calculation_version) then
    raise exception using errcode='PT409',message='idempotency_conflict'; end if;
  if progress.opened_at is not null then
    return jsonb_build_object('prepared',0,'hasMore',false,'nextGameweekId',next_week.id,'status',next_week.status,'alreadyAdvanced',true);
  end if;
  if previous.status<>'finalized' or previous.scoring_input_version<>p_calculation_version
    or not exists(select 1 from app_private.fantasy_gameweek_postwork work
      where work.gameweek_id=previous.id and work.calculation_version=p_calculation_version and work.completed_at is not null) then
    raise exception using errcode='PT409',message='fantasy_previous_postwork_incomplete'; end if;
  select * into season from app.fantasy_seasons where id=previous.fantasy_season_id;
  if season.status not in ('registration_open','active') or next_week.status<>'scheduled'
    or next_week.deadline_at<=statement_timestamp() then
    raise exception using errcode='PT409',message='fantasy_next_gameweek_not_openable'; end if;
  -- A fixture postponed after the next week was staged stops counting before
  -- the calendar is checked, exactly as the calendar sync would defer it.
  perform app_private.fantasy_defer_postponed_assignments(next_week.id);
  perform a.id from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
  where a.gameweek_id=next_week.id and a.superseded_at is null order by a.id for share of a,f;
  if exists(select 1 from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
    where a.gameweek_id=next_week.id and a.superseded_at is null and (
      a.fantasy_season_id<>season.id or f.season_id<>season.football_season_id
      or f.round_id is distinct from next_week.football_round_id or not a.counts_points or a.frozen_at is not null
      or a.assignment_status not in ('assigned','confirmed','reassigned')
      or f.status not in ('scheduled','not_started') or f.kickoff_at is distinct from a.assigned_kickoff_at
      or not exists(select 1 from app.fantasy_players fp where fp.fantasy_season_id=season.id and fp.football_team_id=f.home_team_id)
      or not exists(select 1 from app.fantasy_players fp where fp.fantasy_season_id=season.id and fp.football_team_id=f.away_team_id))) then
    raise exception using errcode='PT409',message='fantasy_next_fixture_unverified'; end if;
  select count(distinct fp.football_team_id) into expected_clubs from app.fantasy_players fp where fp.fantasy_season_id=season.id;
  select count(distinct f.id),min(f.kickoff_at)
  into fixture_count,first_kickoff
  from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
  where a.gameweek_id=next_week.id and a.superseded_at is null and a.counts_points;
  -- The round must be fully published (postponed fixtures included), and every
  -- fixture of it that is still playable must count for the next week. A
  -- postponed fixture is the only one allowed to be missing.
  select count(distinct f.id),count(distinct t.team_id)
  into round_fixture_count,round_participant_count
  from app.fixtures f
  cross join lateral(values(f.home_team_id),(f.away_team_id)) t(team_id)
  where f.round_id=next_week.football_round_id and f.season_id=season.football_season_id
    and f.status not in ('cancelled','abandoned');
  select count(*) into playable_unassigned
  from app.fixtures f
  where f.round_id=next_week.football_round_id and f.season_id=season.football_season_id
    and f.status not in ('cancelled','abandoned','postponed')
    and not exists(select 1 from app.fantasy_fixture_assignments a
      where a.gameweek_id=next_week.id and a.fixture_id=f.id and a.superseded_at is null and a.counts_points);
  if expected_clubs<2 or mod(expected_clubs,2)<>0
    or round_fixture_count<>expected_clubs/2 or round_participant_count<>expected_clubs
    or fixture_count<1 or playable_unassigned>0
    or next_week.deadline_at is distinct from app_private.fantasy_calculate_deadline(season.ruleset_id,first_kickoff)
    or next_week.starts_at is distinct from first_kickoff then
    raise exception using errcode='PT409',message='fantasy_next_calendar_incomplete'; end if;
  if exists(select 1 from app.fantasy_teams t where t.fantasy_season_id=season.id and t.status='active'
    and (t.current_gameweek_id is null or t.current_gameweek_id not in (previous.id,next_week.id))) then
    raise exception using errcode='PT409',message='fantasy_team_progression_conflict'; end if;
  insert into app_private.fantasy_gameweek_progressions(previous_gameweek_id,next_gameweek_id,calculation_version)
  values(previous.id,next_week.id,p_calculation_version) on conflict(previous_gameweek_id) do nothing;
  for team in select * from app.fantasy_teams where fantasy_season_id=season.id and status='active'
    and current_gameweek_id=previous.id order by id for update limit p_batch_size loop
    select id into next_lineup_id from app.fantasy_lineups where fantasy_team_id=team.id and gameweek_id=next_week.id
      and locked_at is null and finalized_at is null;
    if next_lineup_id is not null then
      selection:=app_private.fantasy_lineup_selection(next_lineup_id);
    else
      select id into free_hit_id from app.fantasy_free_hit_snapshots
      where fantasy_team_id=team.id and gameweek_id=previous.id and restored_at is not null;
      if free_hit_id is not null then
        select captured.selection into selection from app_private.fantasy_free_hit_lineup_snapshots captured where captured.snapshot_id=free_hit_id;
        if selection is null then raise exception using errcode='PT409',message='fantasy_free_hit_selection_unavailable'; end if;
      else
        select id into source_id from app.fantasy_lineups where fantasy_team_id=team.id and gameweek_id=previous.id and locked_at is not null;
        selection:=app_private.fantasy_lineup_selection(source_id);
      end if;
    end if;
    perform app_private.fantasy_validate_carried_selection(team.id,selection);
    if next_lineup_id is null then
      insert into app.fantasy_lineups(fantasy_team_id,gameweek_id,team_version)
      values(team.id,next_week.id,team.version+1) returning id into next_lineup_id;
      insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,multiplier,snapshot_price)
      select next_lineup_id,(v->>'fantasy_player_id')::uuid,(v->>'slot')::app.fantasy_lineup_slot,(v->>'slot_order')::integer,
        (v->>'captain')::boolean,(v->>'vice_captain')::boolean,
        case when (v->>'captain')::boolean then r.captain_multiplier else 1 end,fp.price
      from jsonb_array_elements(selection) v join app.fantasy_players fp on fp.id::text=v->>'fantasy_player_id'
      join app.fantasy_rulesets r on r.id=season.ruleset_id;
    end if;
    update app.fantasy_teams set current_gameweek_id=next_week.id,version=version+1,
      team_value=(select sum(fp.price) from app.fantasy_squad_memberships m join app.fantasy_players fp on fp.id=m.fantasy_player_id
        where m.fantasy_team_id=team.id and m.sold_at is null)
    where id=team.id;
    prepared:=prepared+1;
  end loop;
  remaining:=exists(select 1 from app.fantasy_teams where fantasy_season_id=season.id and status='active' and current_gameweek_id=previous.id);
  if not remaining then
    if exists(select 1 from app.fantasy_teams t where t.fantasy_season_id=season.id and t.status='active'
      and not exists(select 1 from app.fantasy_lineups l where l.fantasy_team_id=t.id and l.gameweek_id=next_week.id and l.locked_at is null)) then
      raise exception using errcode='PT409',message='fantasy_next_lineup_missing'; end if;
    update app.fantasy_gameweeks set status='open',lock_version=lock_version+1 where id=next_week.id;
    update app_private.fantasy_gameweek_progressions set opened_at=statement_timestamp() where previous_gameweek_id=previous.id;
  end if;
  return jsonb_build_object('prepared',prepared,'hasMore',remaining,'nextGameweekId',next_week.id,
    'status',case when remaining then 'scheduled' else 'open' end,'alreadyAdvanced',false);
end;
$$;

create or replace function app_private.fantasy_lifecycle_tick()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  enabled boolean;
  outcome text := 'ok';
  first_error text;
  details jsonb := '{}'::jsonb;
  sync jsonb;
  gameweek record;
  state jsonb;
  attempts integer;
  lifecycle jsonb := '[]'::jsonb;
begin
  -- One tick at a time; a slow tick is simply skipped by the next.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('fantasy:lifecycle-tick', 0)) then
    return 'busy';
  end if;
  select lifecycle_tick_enabled into enabled from app_private.fantasy_automation_settings where id;
  if not coalesce(enabled, false) then
    update app_private.fantasy_lifecycle_heartbeat
    set last_run_at = statement_timestamp(), last_outcome = 'disabled'
    where id;
    return 'disabled';
  end if;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  if exists (select 1 from app.fantasy_seasons
    where status in ('planned', 'registration_open', 'active')) then
    begin
      sync := api.service_sync_fantasy_calendar(null);
      details := details || jsonb_build_object('calendar', jsonb_build_object(
        'gameweeksCreated', sync -> 'gameweeksCreated',
        'assignmentsDeferred', sync -> 'assignmentsDeferred',
        'assignmentsAdded', sync -> 'assignmentsAdded',
        'deadlineChanges', sync -> 'deadlineChanges'));
    exception when others then
      outcome := 'error';
      first_error := coalesce(first_error, 'calendar: ' || left(sqlerrm, 160));
      details := details || jsonb_build_object('calendar', jsonb_build_object('refused', left(sqlerrm, 160)));
    end;
  end if;

  -- Reuse the exact guarded, resumable opening path used by the worker.
  -- One bounded page per successor/tick commits progress for the next tick.
  for gameweek in
    select previous.id, next_week.id as next_id, next_week.sequence_number,
      previous.scoring_input_version
    from app.fantasy_gameweeks previous
    join app.fantasy_seasons season on season.id = previous.fantasy_season_id
    join app.fantasy_gameweeks next_week on next_week.fantasy_season_id = previous.fantasy_season_id
      and next_week.sequence_number = previous.sequence_number + 1
    join app_private.fantasy_gameweek_postwork work on work.gameweek_id = previous.id
      and work.calculation_version = previous.scoring_input_version and work.completed_at is not null
    where season.status in ('registration_open', 'active') and previous.status = 'finalized'
      and next_week.status = 'scheduled'
    order by previous.fantasy_season_id, previous.sequence_number
  loop
    begin
      state := api.service_prepare_next_fantasy_gameweek(gameweek.id, gameweek.next_id,
        gameweek.scoring_input_version, 500);
      lifecycle := lifecycle || jsonb_build_object('gameweek', gameweek.sequence_number,
        'from', 'scheduled', 'to', state ->> 'status', 'prepared', state -> 'prepared',
        'hasMore', state -> 'hasMore');
    exception when others then
      outcome := 'error';
      first_error := coalesce(first_error,
        'opening gameweek ' || gameweek.sequence_number || ': ' || left(sqlerrm, 160));
      lifecycle := lifecycle || jsonb_build_object('gameweek', gameweek.sequence_number,
        'from', 'scheduled', 'refused', left(sqlerrm, 160));
    end;
  end loop;

  for gameweek in
    select g.id, g.sequence_number, g.status from app.fantasy_gameweeks g
    join app.fantasy_seasons s on s.id = g.fantasy_season_id
    where s.status in ('registration_open', 'active')
      and ((g.status = 'open' and g.deadline_at <= statement_timestamp())
        or g.status in ('locked', 'live'))
    order by g.sequence_number
  loop
    begin
      attempts := 0;
      loop
        state := api.service_advance_fantasy_lifecycle(gameweek.id,
          (select lock_version from app.fantasy_gameweeks where id = gameweek.id), 500);
        attempts := attempts + 1;
        exit when not coalesce((state ->> 'hasMore')::boolean, false) or attempts >= 20;
      end loop;
      lifecycle := lifecycle || jsonb_build_object('gameweek', gameweek.sequence_number,
        'from', gameweek.status, 'to', state ->> 'status',
        'waitingReason', state ->> 'waitingReason');
    exception when others then
      outcome := 'error';
      first_error := coalesce(first_error,
        'gameweek ' || gameweek.sequence_number || ': ' || left(sqlerrm, 160));
      lifecycle := lifecycle || jsonb_build_object('gameweek', gameweek.sequence_number,
        'from', gameweek.status, 'refused', left(sqlerrm, 160));
    end;
  end loop;

  perform set_config('request.jwt.claims', '', true);
  details := details || jsonb_build_object('lifecycle', lifecycle);

  update app_private.fantasy_lifecycle_heartbeat
  set last_run_at = statement_timestamp(),
      last_outcome = outcome,
      last_details = details,
      last_error = case when outcome = 'error' then first_error else last_error end,
      last_error_at = case when outcome = 'error' then statement_timestamp() else last_error_at end,
      consecutive_failures = case when outcome = 'error' then consecutive_failures + 1 else 0 end
  where id;
  return outcome;
end;
$$;

-- A healthy scheduler heartbeat is not proof of a progressing season.
alter function app_private.ops_health_checks() rename to ops_health_checks_before_durable_progression;
create function app_private.ops_health_checks()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  result jsonb := app_private.ops_health_checks_before_durable_progression();
  checks jsonb := coalesce(result -> 'checks', '[]'::jsonb);
  blocked jsonb;
  failed boolean;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'gameweekId', next_week.id, 'sequence', next_week.sequence_number,
    'deadlineAt', next_week.deadline_at,
    'reason', case when next_week.deadline_at <= statement_timestamp() then 'deadline_passed'
      when work.completed_at is not null then 'progression_pending' else 'previous_postwork_incomplete' end
  ) order by next_week.deadline_at), '[]'::jsonb),
  coalesce(bool_or(next_week.deadline_at <= statement_timestamp() + interval '6 hours'
    or (work.completed_at is not null
      and greatest(work.completed_at, next_week.created_at) < statement_timestamp() - interval '15 minutes')), false)
  into blocked, failed
  from app.fantasy_gameweeks next_week
  join app.fantasy_seasons season on season.id = next_week.fantasy_season_id
  left join app.fantasy_gameweeks previous on previous.fantasy_season_id = next_week.fantasy_season_id
    and previous.sequence_number = next_week.sequence_number - 1
  left join app_private.fantasy_gameweek_postwork work on work.gameweek_id = previous.id
    and previous.status = 'finalized' and work.calculation_version = previous.scoring_input_version
  where season.status in ('registration_open', 'active') and next_week.status = 'scheduled'
    and (next_week.deadline_at <= statement_timestamp() + interval '24 hours'
      or (work.completed_at is not null
        and greatest(work.completed_at, next_week.created_at) < statement_timestamp() - interval '15 minutes'));
  checks := checks || jsonb_build_object('name', 'fantasy_progression',
    'status', case when failed then 'fail' when jsonb_array_length(blocked) > 0 then 'warn' else 'ok' end,
    'detail', case when jsonb_array_length(blocked) = 0 then 'no stalled or deadline-risk scheduled gameweek'
      else jsonb_array_length(blocked) || ' scheduled gameweek(s) need attention; see FANTASY_DURABLE_PROGRESSION_RUNBOOK.md' end,
    'gameweeks', blocked);
  return result || jsonb_build_object('checks', checks, 'status', case
    when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'fail') then 'fail'
    when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'warn') then 'warn'
    else 'ok' end);
end;
$$;
revoke all on function app_private.ops_health_checks(),
  app_private.ops_health_checks_before_durable_progression() from public, anon, authenticated, service_role;
$migration$]);
do $apply$
declare body text := (select statements[1] from supabase_migrations.schema_migrations where version='20261009091728');
begin
  if encode(sha256(convert_to(body,'UTF8')),'hex') <> '50bd08e8de7ccc28a8bcefaa938f4ccb412a9f7a45827e9b85210b608f3e9e1d' then
    raise exception 'stop: migration checksum mismatch';
  end if;
  execute body;
end;
$apply$;

do $verify$
declare response jsonb; attempt integer;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  for attempt in 1..2 loop
    response := api.service_run_fantasy_price_batch('d4324127-ce55-4943-973f-4cf2f9a12780',2);
    if response->>'hasMore' is distinct from 'false' or response->>'stableResult' is distinct from 'true' then
      raise exception 'stop: completed price retry did not remain complete';
    end if;
    response := api.service_complete_fantasy_postwork('d4324127-ce55-4943-973f-4cf2f9a12780',2);
    if response->>'stableResult' is distinct from 'true' then raise exception 'stop: postwork replay changed'; end if;
  end loop;
  perform set_config('request.jwt.claims','',true);
  if pg_temp.fantasy_business_digest() is distinct from (select digest from fantasy_rollout_baseline) then
    raise exception 'stop: historical business data changed';
  end if;
  if has_function_privilege('anon','api.service_run_fantasy_price_batch(uuid,bigint,uuid,integer)','execute')
    or has_function_privilege('authenticated','api.service_complete_fantasy_postwork(uuid,bigint)','execute')
    or has_function_privilege('service_role','app_private.fantasy_guard_unfinished_price_catalog()','execute')
    or has_function_privilege('service_role','app_private.ops_health_checks()','execute') then
    raise exception 'stop: unexpected API grants';
  end if;
end;
$verify$;
select app_private.fantasy_automation_configure((select lifecycle_tick_enabled from fantasy_rollout_settings));
select 'verified: completed GW2 retries are stable; historical business digest unchanged' as result;
rollback;
