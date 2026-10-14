-- SofaScore staged statistics (docs/backend/SOFASCORE_STAGED_STATS.md), part 3:
-- scoring modes that follow the coverage, closing a gameweek on provisional
-- points, opening the next one, and locking only when every match is final.
--
-- Everything is gated by app_private.fantasy_staged_stats_policy (default off).
-- For a season without it every function below behaves exactly as before. No
-- scoring rule or ruleset changes. Finalization, prizes, notifications and
-- Manager Card still gate on status finalized/corrected + points_state final,
-- so they wait for the lock without being touched.

do $$
begin
  if to_regclass('app_private.sofascore_staged_stats') is null
    or to_regclass('app_private.fantasy_gameweek_close') is null then
    raise exception 'staged_stats_progression_prerequisite_missing: apply 20261013160000 and 20261013160100 first';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Lock readiness
-- ---------------------------------------------------------------------------

-- Null when the gameweek may lock; otherwise the reason (also the error label).
create function app_private.fantasy_staged_lock_blocker(p_gameweek_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare g app.fantasy_gameweeks%rowtype;
begin
  select * into g from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found or not app_private.fantasy_staged_enabled(g.id) then return null; end if;
  if exists(select 1 from app.fantasy_gameweeks p
      where p.fantasy_season_id = g.fantasy_season_id and p.sequence_number < g.sequence_number
        and p.status not in ('finalized', 'corrected', 'cancelled')) then
    return 'fantasy_previous_gameweek_not_locked'; end if;
  if exists(select 1 from app.fantasy_fixture_assignments a
      where a.gameweek_id = g.id and a.superseded_at is null and a.counts_points
        and not (
          exists(select 1 from app_private.sofascore_staged_stats s
                  where s.fixture_id = a.fixture_id and s.status in ('FINAL', 'FINAL_LIMITED'))
          -- A match whose data never came from SofaScore is not staged.
          or (not exists(select 1 from app_private.sofascore_staged_stats s where s.fixture_id = a.fixture_id)
              and exists(select 1 from app_private.fantasy_fixture_observations o where o.fixture_id = a.fixture_id)
              and not exists(select 1 from app_private.fantasy_fixture_observations o
                              where o.fixture_id = a.fixture_id and o.payload #>> '{sourceRefs,sofascoreEventId}' is not null)))) then
    return 'fantasy_staged_stats_not_final'; end if;
  if g.closed_at is not null and exists(select 1 from app.fantasy_gameweeks n
      where n.fantasy_season_id = g.fantasy_season_id and n.sequence_number = g.sequence_number + 1
        and n.status <> 'cancelled')
    and not exists(select 1 from app_private.fantasy_gameweek_progressions pr
      where pr.previous_gameweek_id = g.id and pr.opened_at is not null) then
    return 'fantasy_staged_successor_not_open'; end if;
  return null;
end $$;
revoke all on function app_private.fantasy_staged_lock_blocker(uuid) from public, anon, authenticated, service_role;

-- The lock itself: the existing begin-finalization chain, behind the staged gate.
alter function api.service_begin_fantasy_finalization(uuid, bigint, text)
  rename to service_begin_fantasy_finalization_before_staged;
revoke all on function api.service_begin_fantasy_finalization_before_staged(uuid, bigint, text)
  from public, anon, authenticated, service_role;
create function api.service_begin_fantasy_finalization(p_gameweek_id uuid, p_calculation_version bigint, p_input_digest text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare blocker text;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  -- Already sealed: a resumed lock is not blocked again.
  if p_gameweek_id is not null and not exists(select 1 from app.fantasy_gameweeks g
      where g.id = p_gameweek_id and g.status in ('finalizing', 'finalized')) then
    blocker := app_private.fantasy_staged_lock_blocker(p_gameweek_id);
    if blocker is not null then raise exception using errcode = 'PT409', message = blocker; end if;
  end if;
  return api.service_begin_fantasy_finalization_before_staged(p_gameweek_id, p_calculation_version, p_input_digest);
end $$;
revoke all on function api.service_begin_fantasy_finalization(uuid, bigint, text) from public, anon, authenticated;
grant execute on function api.service_begin_fantasy_finalization(uuid, bigint, text) to service_role;

-- ---------------------------------------------------------------------------
-- Scoring modes follow the coverage
-- ---------------------------------------------------------------------------

alter function api.service_select_fantasy_scoring_modes(uuid)
  rename to service_select_fantasy_scoring_modes_before_staged;
revoke all on function api.service_select_fantasy_scoring_modes_before_staged(uuid)
  from public, anon, authenticated, service_role;
create function api.service_select_fantasy_scoring_modes(p_gameweek_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g app.fantasy_gameweeks%rowtype; f record; s app_private.fantasy_fixture_observations%rowtype;
  m app_private.fantasy_fixture_scoring_modes%rowtype; policy app_private.fantasy_adaptive_policy%rowtype;
  v_selected integer := 0; v_upgraded integer := 0;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  select * into g from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  if not app_private.fantasy_staged_enabled(g.id) then
    return api.service_select_fantasy_scoring_modes_before_staged(p_gameweek_id); end if;
  if not app_private.fantasy_adaptive_enabled(g.id) then return jsonb_build_object('enabled', false); end if;
  select * into policy from app_private.fantasy_adaptive_policy where season_id = g.fantasy_season_id;
  if policy.paused then raise exception using errcode = 'PT409', message = 'adaptive_scoring_paused'; end if;
  if g.status in ('finalizing', 'finalized', 'corrected', 'cancelled') then
    return jsonb_build_object('enabled', true); end if;
  for f in select fi.* from app.fantasy_fixture_assignments a join app.fixtures fi on fi.id = a.fixture_id
      where a.gameweek_id = g.id and a.superseded_at is null and a.counts_points and fi.status = 'finished'
      order by fi.id for update of fi loop
    if f.finalized_at is null then continue; end if;
    select * into s from app_private.fantasy_fixture_observations where fixture_id = f.id
      order by observed_at desc, id desc limit 1;
    if not found then continue; end if;
    insert into app_private.fantasy_fixture_scoring_modes(gameweek_id, fixture_id, cutoff_at)
    values (g.id, f.id, f.finalized_at + interval '12 hours') on conflict do nothing;
    select * into m from app_private.fantasy_fixture_scoring_modes where gameweek_id = g.id and fixture_id = f.id;
    if m.mode is null and (s.full_ready or s.simple_ready) then
      update app_private.fantasy_fixture_scoring_modes set mode = case when s.full_ready then 'full' else 'simple' end,
        selected_at = statement_timestamp(), selection_observation_id = s.id,
        reason = case when s.full_ready then 'staged_full_at_first_pull' else 'staged_core_at_first_pull' end
       where gameweek_id = g.id and fixture_id = f.id and mode is null;
      v_selected := v_selected + 1;
    elsif m.mode = 'simple' and s.full_ready then
      insert into app_private.fantasy_fixture_mode_changes(gameweek_id, fixture_id, from_mode, to_mode, observation_id)
      values (g.id, f.id, 'simple', 'full', s.id);
      update app_private.fantasy_fixture_scoring_modes set mode = 'full', selected_at = statement_timestamp(),
        selection_observation_id = s.id, reason = 'staged_upgrade_full_coverage'
       where gameweek_id = g.id and fixture_id = f.id and mode = 'simple';
      v_upgraded := v_upgraded + 1;
    end if;
  end loop;
  return jsonb_build_object('enabled', true, 'staged', true, 'selected', v_selected, 'upgraded', v_upgraded);
end $$;
revoke all on function api.service_select_fantasy_scoring_modes(uuid) from public, anon, authenticated;
grant execute on function api.service_select_fantasy_scoring_modes(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Close on provisional points
-- ---------------------------------------------------------------------------

create function api.service_begin_fantasy_close(p_gameweek_id uuid, p_calculation_version bigint, p_input_digest text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gw app.fantasy_gameweeks%rowtype; snapshot app_private.fantasy_scoring_snapshots%rowtype; d jsonb;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_gameweek_id is null or p_calculation_version is null or p_calculation_version < 1
    or p_input_digest is null or p_input_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  select * into gw from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  if gw.closed_at is not null then
    if gw.closed_calculation_version is distinct from p_calculation_version then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict'; end if;
    return jsonb_build_object('closed', true, 'stableResult', true, 'calculationVersion', gw.closed_calculation_version);
  end if;
  if gw.status <> 'provisional' or not app_private.fantasy_staged_enabled(gw.id) then
    raise exception using errcode = 'PT409', message = 'fantasy_close_not_allowed'; end if;
  -- Core data for every counted match, no unknown participation of a selected player.
  d := app_private.fantasy_scoring_input_document(gw.id);
  if coalesce((d->>'policyPaused')::boolean, true) or jsonb_array_length(d->'fixtures') = 0
    or exists(select 1 from jsonb_array_elements(d->'fixtures') f
              where (f->>'adaptiveReady')::boolean is distinct from true or f->>'scoringMode' is null)
    or jsonb_array_length(coalesce(d->'pendingFixtures', '[]'::jsonb)) > 0
    or jsonb_array_length(coalesce(d->'pendingPlayerIds', '[]'::jsonb)) > 0 then
    raise exception using errcode = 'PT409', message = 'fantasy_close_core_data_pending'; end if;
  snapshot := app_private.fantasy_assert_scoring_snapshot(gw.id, p_calculation_version, p_input_digest);
  if snapshot.sealed_at is not null then raise exception using errcode = 'PT409', message = 'fantasy_scoring_sealed'; end if;
  if not snapshot.players_persisted
    or exists(select 1 from app.fantasy_lineups l left join app.fantasy_team_gameweek_results r
        on r.gameweek_id = l.gameweek_id and r.fantasy_team_id = l.fantasy_team_id
       where l.gameweek_id = gw.id and (l.locked_at is null or r.calculation_version is distinct from p_calculation_version)) then
    raise exception using errcode = 'PT409', message = 'fantasy_scoring_results_incomplete'; end if;
  update app.fantasy_gameweeks set closed_at = statement_timestamp(), closed_calculation_version = p_calculation_version,
    lock_version = lock_version + 1 where id = gw.id;
  insert into app_private.fantasy_gameweek_close(gameweek_id, calculation_version, input_digest,
    price_source_version, price_player_ids)
  values (gw.id, p_calculation_version, p_input_digest, gw.sequence_number::bigint + 1,
    (select coalesce(array_agg(fp.id order by fp.id), '{}'::uuid[]) from app.fantasy_players fp
      where fp.fantasy_season_id = gw.fantasy_season_id));
  return jsonb_build_object('closed', true, 'stableResult', false, 'calculationVersion', p_calculation_version);
end $$;
revoke all on function api.service_begin_fantasy_close(uuid, bigint, text) from public, anon, authenticated;
grant execute on function api.service_begin_fantasy_close(uuid, bigint, text) to service_role;

-- Price changes depend on transfer demand, not on points. They must run before
-- the next gameweek opens, so a closed gameweek runs them.
do $patch$
declare original text; changed text;
begin
  original := pg_get_functiondef('api.service_apply_fantasy_price_changes(uuid,bigint,uuid,integer)'::regprocedure);
  changed := replace(original, 'if not found or gameweek.status not in (''finalized'', ''corrected'') then',
    'if not found or not (gameweek.status in (''finalized'', ''corrected'') or (gameweek.status = ''provisional'' and gameweek.closed_at is not null)) then');
  if changed = original then raise exception 'STAGED_PRICE_PATCH_MISMATCH'; end if;
  execute changed;
end $patch$;

-- Catalog changes are refused between price pages of an unfinished close pass,
-- exactly as for the finalized pass.
create function app_private.fantasy_guard_unfinished_close_price_catalog()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and row(old.id, old.fantasy_season_id, old.football_player_id,
      old.football_team_id, old.position_id) is not distinct from
    row(new.id, new.fantasy_season_id, new.football_player_id, new.football_team_id, new.position_id) then
    return new;
  end if;
  if exists (
    select 1 from app_private.fantasy_gameweek_close c
    join app.fantasy_gameweeks gw on gw.id = c.gameweek_id
    where c.prices_completed_at is null and gw.closed_at is not null
      and (gw.fantasy_season_id = case when TG_OP <> 'INSERT' then old.fantasy_season_id end
        or gw.fantasy_season_id = case when TG_OP <> 'DELETE' then new.fantasy_season_id end)
  ) then
    raise exception using errcode = 'PT409', message = 'fantasy_price_processing_in_progress';
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function app_private.fantasy_guard_unfinished_close_price_catalog()
  from public, anon, authenticated, service_role;
create trigger fantasy_guard_unfinished_close_price_catalog
before insert or delete or update of id, fantasy_season_id, football_player_id, football_team_id, position_id
on app.fantasy_players for each row execute function app_private.fantasy_guard_unfinished_close_price_catalog();

create function api.service_run_fantasy_close_price_batch(
  p_gameweek_id uuid, p_calculation_version bigint,
  p_after_player_id uuid default null, p_batch_size integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gameweek app.fantasy_gameweeks%rowtype; journal app_private.fantasy_gameweek_close%rowtype;
  player_ids uuid[]; expected_after uuid; expected_more boolean; response jsonb;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_batch_size is null or p_batch_size not between 1 and 1000 then
    raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  lock table app.fantasy_players in share row exclusive mode;
  select * into gameweek from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  select * into journal from app_private.fantasy_gameweek_close where gameweek_id = gameweek.id for update;
  if not found or gameweek.closed_at is null or journal.calculation_version <> p_calculation_version then
    raise exception using errcode = 'PT409', message = 'fantasy_close_not_started'; end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into player_ids
    from app.fantasy_players where fantasy_season_id = gameweek.fantasy_season_id;
  if journal.prices_completed_at is null and journal.price_player_ids is distinct from player_ids then
    raise exception using errcode = 'PT409', message = 'fantasy_price_catalog_changed'; end if;
  if p_after_player_id is null and journal.price_last_response is not null then
    return jsonb_build_object('updatedMemberships', 0, 'afterPlayerId', journal.price_after_player_id,
      'hasMore', journal.prices_completed_at is null, 'stableResult', true);
  end if;
  if journal.price_last_response is not null and p_after_player_id is not distinct from journal.price_last_request_after then
    return journal.price_last_response || jsonb_build_object('stableResult', true);
  end if;
  if p_after_player_id is distinct from journal.price_after_player_id then
    raise exception using errcode = 'PT409', message = 'fantasy_price_cursor_invalid'; end if;
  if journal.prices_completed_at is not null then
    return jsonb_build_object('updatedMemberships', 0, 'afterPlayerId', journal.price_after_player_id,
      'hasMore', false, 'stableResult', true);
  end if;
  select (array_agg(id order by id desc))[1] into expected_after from (
    select id from unnest(player_ids) as pool(id)
    where p_after_player_id is null or id > p_after_player_id order by id limit p_batch_size) page;
  expected_more := exists (select 1 from unnest(player_ids) as pool(id) where id > expected_after);
  response := api.service_apply_fantasy_price_changes(gameweek.id, journal.price_source_version, p_after_player_id, p_batch_size);
  if (response->>'afterPlayerId')::uuid is distinct from expected_after
    or (response->>'hasMore')::boolean is distinct from expected_more then
    raise exception using errcode = 'PT409', message = 'fantasy_price_cursor_invalid'; end if;
  update app_private.fantasy_gameweek_close set price_after_player_id = expected_after,
    price_last_request_after = p_after_player_id, price_last_response = response,
    prices_completed_at = case when not expected_more then statement_timestamp() else null end
   where gameweek_id = gameweek.id;
  return response || jsonb_build_object('stableResult', false);
end $$;
revoke all on function api.service_run_fantasy_close_price_batch(uuid, bigint, uuid, integer)
  from public, anon, authenticated;
grant execute on function api.service_run_fantasy_close_price_batch(uuid, bigint, uuid, integer) to service_role;

-- The carry-over the next gameweek needs is complete: Free Hit squads restored,
-- free transfers rolled for every locked lineup, prices applied.
create function api.service_complete_fantasy_close(p_gameweek_id uuid, p_calculation_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gameweek app.fantasy_gameweeks%rowtype; journal app_private.fantasy_gameweek_close%rowtype;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  select * into gameweek from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  select * into journal from app_private.fantasy_gameweek_close where gameweek_id = gameweek.id for update;
  if not found or gameweek.closed_at is null or journal.calculation_version <> p_calculation_version then
    raise exception using errcode = 'PT409', message = 'fantasy_close_not_started'; end if;
  if journal.completed_at is not null then
    return jsonb_build_object('completed', true, 'stableResult', true, 'completedAt', journal.completed_at); end if;
  if exists(select 1 from app.fantasy_free_hit_snapshots fh where fh.gameweek_id = gameweek.id and fh.restored_at is null) then
    raise exception using errcode = 'PT409', message = 'fantasy_close_free_hit_pending'; end if;
  if exists(select 1 from app.fantasy_lineups lineup
      join app.fantasy_teams team on team.id = lineup.fantasy_team_id and team.status = 'active'
     where lineup.gameweek_id = gameweek.id and not exists(select 1 from app_private.fantasy_free_transfer_rollovers ro
        where ro.gameweek_id = gameweek.id and ro.fantasy_team_id = team.id)) then
    raise exception using errcode = 'PT409', message = 'fantasy_rollover_incomplete'; end if;
  if journal.prices_completed_at is null then
    raise exception using errcode = 'PT409', message = 'fantasy_prices_incomplete'; end if;
  update app_private.fantasy_gameweek_close set completed_at = statement_timestamp()
   where gameweek_id = gameweek.id returning * into journal;
  return jsonb_build_object('completed', true, 'stableResult', false, 'completedAt', journal.completed_at);
end $$;
revoke all on function api.service_complete_fantasy_close(uuid, bigint) from public, anon, authenticated;
grant execute on function api.service_complete_fantasy_close(uuid, bigint) to service_role;

-- At the lock, the price pass the close already did is adopted into the
-- postwork journal (it must not run twice: the cursor guard would refuse it).
create function api.service_adopt_fantasy_close_prices(p_gameweek_id uuid, p_calculation_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gameweek app.fantasy_gameweeks%rowtype; c app_private.fantasy_gameweek_close%rowtype;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  gameweek := app_private.fantasy_require_finalized_postwork(p_gameweek_id, p_calculation_version);
  select * into c from app_private.fantasy_gameweek_close where gameweek_id = gameweek.id;
  if not found or c.completed_at is null then
    raise exception using errcode = 'PT409', message = 'fantasy_close_not_started'; end if;
  insert into app_private.fantasy_gameweek_postwork(gameweek_id, calculation_version, price_source_version,
    price_player_ids, price_after_player_id, price_last_response, prices_completed_at)
  values (gameweek.id, p_calculation_version, c.price_source_version, c.price_player_ids, c.price_after_player_id,
    jsonb_build_object('adoptedFromClose', true), c.prices_completed_at)
  on conflict (gameweek_id, calculation_version) do nothing;
  return jsonb_build_object('adopted', true);
end $$;
revoke all on function api.service_adopt_fantasy_close_prices(uuid, bigint) from public, anon, authenticated;
grant execute on function api.service_adopt_fantasy_close_prices(uuid, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- Opening the next gameweek from a closed predecessor
-- ---------------------------------------------------------------------------

do $patch$
declare original text; changed text;
begin
  original := pg_get_functiondef('api.service_prepare_next_fantasy_gameweek(uuid,uuid,bigint,integer)'::regprocedure);
  changed := replace(original,
    E'if previous.status<>''finalized'' or previous.scoring_input_version<>p_calculation_version\n    or not exists(select 1 from app_private.fantasy_gameweek_postwork work\n      where work.gameweek_id=previous.id and work.calculation_version=p_calculation_version and work.completed_at is not null) then',
    E'if not ((previous.status=''finalized'' and previous.scoring_input_version=p_calculation_version\n    and exists(select 1 from app_private.fantasy_gameweek_postwork work\n      where work.gameweek_id=previous.id and work.calculation_version=p_calculation_version and work.completed_at is not null))\n    or (previous.status=''provisional'' and previous.closed_at is not null and previous.closed_calculation_version=p_calculation_version\n    and exists(select 1 from app_private.fantasy_gameweek_close cl\n      where cl.gameweek_id=previous.id and cl.calculation_version=p_calculation_version and cl.completed_at is not null))) then');
  if changed = original then raise exception 'STAGED_PREPARE_NEXT_PATCH_MISMATCH'; end if;
  -- The opening journal keeps the close version; a later call with the lock's
  -- version (the finalization postwork) finds the gameweek already advanced.
  original := changed;
  changed := replace(original,
    'if found and (progress.next_gameweek_id<>next_week.id or progress.calculation_version<>p_calculation_version) then',
    'if found and (progress.next_gameweek_id<>next_week.id or (progress.calculation_version<>p_calculation_version and not (previous.closed_at is not null and progress.opened_at is not null))) then');
  if changed = original then raise exception 'STAGED_PREPARE_NEXT_IDEMPOTENCY_PATCH_MISMATCH'; end if;
  execute changed;
end $patch$;

-- The five-minute tick also resumes the opening after a closed predecessor.
do $patch$
declare original text; changed text;
begin
  original := pg_get_functiondef('app_private.fantasy_lifecycle_tick()'::regprocedure);
  changed := replace(original,
    E'  for gameweek in\n    select g.id, g.sequence_number, g.status from app.fantasy_gameweeks g',
    E'  for gameweek in\n    select previous.id, next_week.id as next_id, next_week.sequence_number,\n      cl.calculation_version as scoring_input_version\n    from app.fantasy_gameweeks previous\n    join app.fantasy_seasons season on season.id = previous.fantasy_season_id\n    join app.fantasy_gameweeks next_week on next_week.fantasy_season_id = previous.fantasy_season_id\n      and next_week.sequence_number = previous.sequence_number + 1\n    join app_private.fantasy_gameweek_close cl on cl.gameweek_id = previous.id and cl.completed_at is not null\n    where season.status in (''registration_open'', ''active'') and previous.status = ''provisional''\n      and previous.closed_at is not null and next_week.status = ''scheduled''\n    order by previous.fantasy_season_id, previous.sequence_number\n  loop\n    begin\n      state := api.service_prepare_next_fantasy_gameweek(gameweek.id, gameweek.next_id,\n        gameweek.scoring_input_version, 500);\n      lifecycle := lifecycle || jsonb_build_object(''gameweek'', gameweek.sequence_number,\n        ''from'', ''scheduled'', ''to'', state ->> ''status'', ''prepared'', state -> ''prepared'',\n        ''hasMore'', state -> ''hasMore'', ''afterClose'', true);\n    exception when others then\n      outcome := ''error'';\n      first_error := coalesce(first_error,\n        ''opening gameweek '' || gameweek.sequence_number || '': '' || left(sqlerrm, 160));\n      lifecycle := lifecycle || jsonb_build_object(''gameweek'', gameweek.sequence_number,\n        ''from'', ''scheduled'', ''refused'', left(sqlerrm, 160));\n    end;\n  end loop;\n\n  for gameweek in\n    select g.id, g.sequence_number, g.status from app.fantasy_gameweeks g');
  if changed = original then raise exception 'STAGED_TICK_PATCH_MISMATCH'; end if;
  execute changed;
end $patch$;

-- ---------------------------------------------------------------------------
-- What the worker and the pages read
-- ---------------------------------------------------------------------------

alter function api.service_fantasy_lifecycle_state(uuid) rename to service_fantasy_lifecycle_state_before_staged;
revoke all on function api.service_fantasy_lifecycle_state_before_staged(uuid) from public, anon, authenticated, service_role;
create function api.service_fantasy_lifecycle_state(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g app.fantasy_gameweeks%rowtype; base jsonb; staged boolean; rescore boolean := false;
  latest app_private.fantasy_scoring_snapshots%rowtype;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  base := api.service_fantasy_lifecycle_state_before_staged(p_gameweek_id);
  select * into g from app.fantasy_gameweeks where id = p_gameweek_id;
  staged := app_private.fantasy_staged_enabled(p_gameweek_id);
  if staged and g.status = 'provisional' then
    select * into latest from app_private.fantasy_scoring_snapshots where gameweek_id = g.id
      order by calculation_version desc limit 1;
    rescore := not found or not latest.players_persisted
      or latest.input_digest is distinct from encode(extensions.digest(app_private.fantasy_scoring_input_document(g.id)::text, 'sha256'), 'hex');
  end if;
  return base || jsonb_build_object(
    'stagedStatsEnabled', staged,
    'closedAt', g.closed_at,
    'closedCalculationVersion', g.closed_calculation_version,
    'closeCompleted', exists(select 1 from app_private.fantasy_gameweek_close c
        where c.gameweek_id = g.id and c.completed_at is not null),
    'stagedLockBlocker', case when staged then app_private.fantasy_staged_lock_blocker(g.id) end,
    'stagedRescoreNeeded', rescore,
    'postworkCompleted', exists(select 1 from app_private.fantasy_gameweek_postwork w
        where w.gameweek_id = g.id and w.calculation_version = g.scoring_input_version and w.completed_at is not null));
end $$;
revoke all on function api.service_fantasy_lifecycle_state(uuid) from public, anon, authenticated;
grant execute on function api.service_fantasy_lifecycle_state(uuid) to service_role;

-- The gameweek list the Fantasy pages read now also says when a gameweek closed
-- on provisional points.
create or replace function api.fantasy_gameweeks(p_season_id uuid, p_before_sequence integer default null, p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  with page as (
    select gameweek.id, gameweek.sequence_number, gameweek.name,
      gameweek.deadline_at, gameweek.starts_at, gameweek.ends_at,
      gameweek.status, gameweek.points_state, gameweek.closed_at
    from app.fantasy_gameweeks gameweek
    where gameweek.fantasy_season_id = p_season_id
      and (p_before_sequence is null or gameweek.sequence_number < p_before_sequence)
    order by gameweek.sequence_number desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'sequence', sequence_number, 'name', name,
      'deadlineAt', deadline_at, 'startsAt', starts_at, 'endsAt', ends_at,
      'status', status, 'pointsState', points_state,
      'closedAt', closed_at
    ) order by sequence_number desc), '[]'::jsonb),
    'nextCursor', case when count(*) = p_limit then min(sequence_number) else null end
  ) into result from page;
  return result;
end $$;

-- A team's points payload says whether its gameweek closed on provisional points.
alter function api.get_my_fantasy_points(uuid, uuid) rename to get_my_fantasy_points_before_staged;
revoke all on function api.get_my_fantasy_points_before_staged(uuid, uuid) from public, anon, authenticated, service_role;
create function api.get_my_fantasy_points(p_team_id uuid, p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d jsonb;
begin
  perform app_private.assert_mfa_step_up();
  -- Ownership, authentication and the same step-up also remain in the wrapped RPC.
  d := api.get_my_fantasy_points_before_staged(p_team_id, p_gameweek_id);
  return d || jsonb_build_object('closedAt', (select g.closed_at from app.fantasy_gameweeks g where g.id = p_gameweek_id));
end $$;
revoke all on function api.get_my_fantasy_points(uuid, uuid) from public, anon;
grant execute on function api.get_my_fantasy_points(uuid, uuid) to authenticated, service_role;

-- The calendar sync (the orchestrator's work list) also says which locked
-- gameweeks that closed earlier still owe their postwork (notifications), since
-- their successor is already open and nothing else would bring the worker back.
do $patch$
declare original text; changed text;
begin
  original := pg_get_functiondef('api.service_sync_fantasy_calendar(uuid)'::regprocedure);
  changed := replace(original,
    E'where pr.previous_gameweek_id = g.id and pr.opened_at is not null)\n      ) order by g.sequence_number)',
    E'where pr.previous_gameweek_id = g.id and pr.opened_at is not null),\n        ''postworkPending'', (g.status = ''finalized'' and g.closed_at is not null and not exists(\n          select 1 from app_private.fantasy_gameweek_postwork w\n          where w.gameweek_id = g.id and w.calculation_version = g.scoring_input_version and w.completed_at is not null))\n      ) order by g.sequence_number)');
  if changed = original then raise exception 'STAGED_CALENDAR_PATCH_MISMATCH'; end if;
  execute changed;
end $patch$;
