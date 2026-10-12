-- SofaScore Fantasy needs a person less often (docs/backend/SOFASCORE_PLAYER_MATCHING.md).
--
-- WHY. Round 3 (October 2026) showed three ways one unknown name or one odd number held a
-- whole match's points back for days:
--   * an unmapped STARTER always held the match, even one with nothing the score depends on
--     (no goal, own goal or penalty). He is in nobody's Fantasy team: the auto-mapping found
--     no squad member of his club with his name, and the exclusion check below confirms no
--     unmapped squad member could be him;
--   * after staff matched a player, the held match waited for its back-off (up to six hours)
--     or had already been given up;
--   * a first half with long stoppage time made a correct `minutesPlayed` look wrong (the
--     builder now allows for it; no database change).
--
-- WHAT.
--   1. api.service_record_sofascore_fantasy_observation: an entry of excludedUnmappedPlayers
--      may say `started: true`. Those starters are the request's anonymous starters: the
--      request's anonymousStarters and anonymousByTeam must equal their count, overall and by
--      club, at most two a club, and the recorder (api.service_record_fantasy_observation,
--      unchanged) checks eleven starters a side with them, as it always has. Every exclusion
--      check of 20261011190000 still applies to each one (no mapping, queued open as
--      'no_candidate' for that club, no unmapped squad member who could be him). New: when
--      anyone is left out, each club's goals in the rows must still add up to the score, or
--      the request is refused (sofascore_unmapped_exclusion_refused, retried like any hold).
--      A request with no starter left out is checked exactly as before; one without
--      exclusions too.
--   2. app_private.sofascore_fantasy_reopen(team, fixture): finished, unrecorded matches whose
--      last attempt waits on a player identity (or, for a named fixture, any hold) are set to
--      be tried on the next tick, with their attempt count reset. A match whose replies were
--      dropped (given up) is fetched again by the catch-up (3 requests) while it is inside the
--      catch-up window (SOFASCORE_FANTASY_CATCHUP_HOURS, 72 by default).
--   3. api.admin_resolve_sofascore_player_match: after mapping the player, reopens his club's
--      matches with (2) and reports how many ('reopened'). Signature, grants and every other
--      behaviour as in 20261011130000.
--   4. Once, now: reopens the matches held or given up for an unknown player or a minutes
--      disagreement, so they are tried with the new rules.
--
-- ORDER. Deploy the football-live-refresh Edge Function from the same commit FIRST, then apply
-- this migration: step 4 is only useful to a function that knows the new rules (an older one
-- would give a minutes disagreement up again). The new function against a database without
-- this migration is safe: it leaves starters out only with `started: true` and nonzero
-- anonymous counts, which the previous version refuses (sofascore_request_invalid), and that
-- match stays held; substitutes are sent exactly as before.
do $$
begin
  if to_regprocedure('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)') is null
    or to_regprocedure('api.admin_resolve_sofascore_player_match(text,uuid)') is null
    or to_regclass('app_private.sofascore_fantasy_attempts') is null
    or to_regclass('app_private.sofascore_player_match_queue') is null then
    raise exception 'sofascore_hands_off_prerequisite_missing: apply migrations 20261011130000, 20261011140000 and 20261011190000 first';
  end if;
end $$;

-- ===========================================================================
-- 1. Recording: unmapped starters with nothing the score depends on
-- ===========================================================================
create or replace function api.service_record_sofascore_fantasy_observation(
  p_fixture_id uuid, p_request jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  payload jsonb := p_request->'payload';
  f app.fixtures%rowtype;
  player jsonb; v_external text; v_mapping uuid; v_state jsonb; v_event text;
  link_fixture uuid; before_count bigint; result jsonb; latest bigint;
  v_rows jsonb; v_absent jsonb; v_coverage text := p_request->>'coverage';
  e record; x jsonb; v_except boolean; v_excl_team uuid; v_excl_pos text; v_excl_shirt integer; v_excluded integer := 0;
  v_anon_home integer := 0; v_anon_away integer := 0; v_anon_expected jsonb; v_home_goals integer; v_away_goals integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode='PT403', message='forbidden'; end if;
  if p_fixture_id is null or p_dry_run is null or jsonb_typeof(p_request) is distinct from 'object'
    or jsonb_typeof(payload) is distinct from 'object'
    or jsonb_typeof(payload->'players') is distinct from 'array'
    or coalesce(p_request->>'sofascoreEventId', '') !~ '^[0-9]{1,20}$'
    or coalesce(p_request->>'mappingSnapshotDigest', '') !~ '^[0-9a-f]{64}$'
    or v_coverage is null or v_coverage not in ('full', 'limited')
    or not coalesce(
      -- Either every appearing player has a row (squadComplete) ...
      (coalesce((payload->>'squadComplete')::boolean, false) is true
        and not (payload ? 'squadCompleteExceptExcluded') and not (payload ? 'excludedUnmappedPlayers'))
      -- ... or every one has a row except the unmapped substitutes listed, which are checked below.
      or (coalesce((payload->>'squadCompleteExceptExcluded')::boolean, false) is true
        and not (payload ? 'squadComplete')
        and case when jsonb_typeof(payload->'excludedUnmappedPlayers') = 'array'
                 then jsonb_array_length(payload->'excludedUnmappedPlayers') between 1 and 6
                 else false end), false) then
    raise exception using errcode='PT400', message='sofascore_request_invalid'; end if;
  v_except := payload ? 'excludedUnmappedPlayers';
  -- A provider match carries facts, never an opinion: estimates, corrections and
  -- caller-supplied non-participants stay out. The non-participants are computed below.
  if app_private.fantasy_observation_estimated(payload) or payload ? 'expectedDigest'
    or payload ? 'reviewer' or payload ? 'estimateAcceptance' or payload ? 'verifiedNonParticipants'
    or payload ? 'estimatedNonParticipants'
    -- Anonymous starters only as the counts of the starters left out below, checked there.
    or (payload ? 'anonymousStarters' and (jsonb_typeof(payload->'anonymousStarters') is distinct from 'number'
          or (payload->>'anonymousStarters') !~ '^[0-4]$'))
    or (payload ? 'anonymousByTeam' and jsonb_typeof(payload->'anonymousByTeam') is distinct from 'object') then
    raise exception using errcode='PT400', message='sofascore_request_invalid'; end if;
  v_event := p_request->>'sofascoreEventId';

  -- Evidence is SofaScore's, as a fact or as unknown, and nothing else. On a
  -- limited-coverage match the player-statistics fields cannot be known: saves,
  -- penalties saved and penalties missed are never facts there, and an assist is
  -- one only when an incident names the assister.
  for e in select value as player_row from jsonb_array_elements(payload->'players') loop
    if jsonb_typeof(e.player_row->'evidence') is distinct from 'object'
      or exists(select 1 from jsonb_each(e.player_row->'evidence') ev
                where ev.value->>'source' is distinct from 'sofascore'
                   or ev.value->>'state' not in ('verified', 'unknown')) then
      raise exception using errcode='PT400', message='sofascore_evidence_invalid'; end if;
    if v_coverage = 'limited' and exists(
        select 1 from jsonb_each(e.player_row->'evidence') ev
         where ev.key in ('saves', 'penaltiesSaved', 'penaltiesMissed') and ev.value->>'state' = 'verified') then
      raise exception using errcode='PT400', message='sofascore_limited_coverage_fields'; end if;
    if v_coverage = 'limited' and (e.player_row->'stats' ?| array['saves', 'penaltiesSaved', 'penaltiesMissed']) then
      raise exception using errcode='PT400', message='sofascore_limited_coverage_fields'; end if;
  end loop;

  select * into f from app.fixtures where id = p_fixture_id;
  if not found then raise exception using errcode='PT404', message='sofascore_fixture_not_found'; end if;

  -- The fixture is the one a reviewed mapping says this SofaScore match is.
  if not exists(select 1 from app_private.football_provider_mappings m
                 where m.provider_name = 'sofascore' and m.entity_type = 'fixture'
                   and m.external_id = v_event and m.internal_entity_id = f.id and m.active) then
    raise exception using errcode='PT409', message='sofascore_fixture_mapping_missing'; end if;

  -- Every player is a reviewed SofaScore identity pointing at the player the row names.
  for player in select value from jsonb_array_elements(payload->'players') loop
    v_external := player#>>'{identity,sofascoreId}';
    if v_external is null or char_length(v_external) not between 1 and 200 then
      raise exception using errcode='PT400', message='sofascore_identity_missing'; end if;
    select m.id into v_mapping from app_private.football_provider_mappings m
     where m.provider_name = 'sofascore' and m.entity_type = 'player' and m.external_id = v_external;
    v_state := case when v_mapping is null then null
                  else app_private.football_mapping_supporting_state(v_mapping) end;
    if v_state is null or (v_state->>'active')::boolean is not true or (v_state->>'reviewed')::boolean is not true
      or lower(v_state->>'appPlayerId') is distinct from lower(player->>'playerId') then
      raise exception using errcode='PT409', message='sofascore_identity_not_reviewed',
        detail = 'sofascore:' || v_external; end if;
  end loop;

  -- Unmapped substitutes left out of the rows. The builder lists a substitute only when no
  -- incident or statistic gives him a goal, own goal, penalty, assist or card and he did not
  -- start. Here the database confirms the rest, on its own data, for each one: no mapping of
  -- any kind exists for that SofaScore id; the auto-mapping queue holds him open with reason
  -- 'no_candidate' for the club he played for (no squad member matched his name); and no
  -- squad member of that club who is still unmapped could be him (same shirt number, or no
  -- shirt number on file and a compatible position), because the squad members missing from
  -- the rows are recorded below as NOT having played. Anything else refuses the whole request.
  if v_except then
    for x in select value from jsonb_array_elements(payload->'excludedUnmappedPlayers') loop
      if jsonb_typeof(x) is distinct from 'object'
        or exists(select 1 from jsonb_object_keys(x) k
                   where k not in ('sofascoreId', 'side', 'shirtNumber', 'position', 'reason', 'started'))
        or (x ? 'started' and jsonb_typeof(x->'started') is distinct from 'boolean')
        or coalesce(x->>'sofascoreId', '') !~ '^[^[:space:]]{1,200}$'
        or coalesce(x->>'side', '') not in ('home', 'away')
        or x->>'reason' is distinct from 'no_candidate'
        or (x ? 'shirtNumber' and not (jsonb_typeof(x->'shirtNumber') = 'null'
              or (jsonb_typeof(x->'shirtNumber') = 'number' and (x->>'shirtNumber') ~ '^[0-9]{1,3}$')))
        or (x ? 'position' and not (jsonb_typeof(x->'position') = 'null'
              or (jsonb_typeof(x->'position') = 'string' and (x->>'position') in ('G', 'D', 'M', 'F'))))
        or exists(select 1 from jsonb_array_elements(payload->'players') r
                   where r#>>'{identity,sofascoreId}' = x->>'sofascoreId')
        or (select count(*) from jsonb_array_elements(payload->'excludedUnmappedPlayers') y
             where y->>'sofascoreId' = x->>'sofascoreId') <> 1 then
        raise exception using errcode='PT400', message='sofascore_request_invalid'; end if;
      v_excl_team := case x->>'side' when 'home' then f.home_team_id else f.away_team_id end;
      v_excl_pos := case x->>'position' when 'G' then 'goalkeeper' when 'D' then 'defender'
                                        when 'M' then 'midfielder' when 'F' then 'forward' end;
      v_excl_shirt := case when jsonb_typeof(x->'shirtNumber') = 'number' then (x->>'shirtNumber')::integer end;
      if exists(select 1 from app_private.football_provider_mappings m
                 where m.provider_name = 'sofascore' and m.entity_type = 'player' and m.external_id = x->>'sofascoreId')
        or not exists(select 1 from app_private.sofascore_player_match_queue q
                       where q.sofascore_player_id = x->>'sofascoreId' and q.reason = 'no_candidate'
                         and q.resolved_at is null and q.team_id = v_excl_team)
        or exists(select 1 from app.team_memberships mem join app.players pl on pl.id = mem.player_id
                   where mem.team_id = v_excl_team and mem.season_id = f.season_id
                     and mem.valid_from <= f.kickoff_at::date
                     and (mem.valid_to is null or mem.valid_to >= f.kickoff_at::date)
                     and not exists(select 1 from app_private.football_provider_mappings pm
                                     where pm.provider_name = 'sofascore' and pm.entity_type = 'player'
                                       and pm.internal_entity_id = mem.player_id and pm.active)
                     and ((v_excl_shirt is not null and mem.shirt_number = v_excl_shirt)
                       or (mem.shirt_number is null and (v_excl_pos is null or pl.position::text = v_excl_pos)))) then
        raise exception using errcode='PT409', message='sofascore_unmapped_exclusion_refused',
          detail = 'sofascore:' || (x->>'sofascoreId'); end if;
      v_excluded := v_excluded + 1;
      if coalesce((x->>'started')::boolean, false) then
        if x->>'side' = 'home' then v_anon_home := v_anon_home + 1; else v_anon_away := v_anon_away + 1; end if;
      end if;
    end loop;
  end if;

  -- Starters left out are the only anonymous starters, at most two a club, and the request
  -- must say exactly that (the recorder then checks eleven a side with them).
  v_anon_expected := '{}'::jsonb;
  if v_anon_home > 0 then v_anon_expected := v_anon_expected || jsonb_build_object(f.home_team_id::text, v_anon_home); end if;
  if v_anon_away > 0 then v_anon_expected := v_anon_expected || jsonb_build_object(f.away_team_id::text, v_anon_away); end if;
  if v_anon_home > 2 or v_anon_away > 2
    or coalesce((payload->>'anonymousStarters')::integer, 0) <> v_anon_home + v_anon_away
    or coalesce(payload->'anonymousByTeam', '{}'::jsonb) <> v_anon_expected then
    raise exception using errcode='PT400', message='sofascore_request_invalid'; end if;

  -- A player left out must not be one the score depends on: each club's goals in the rows
  -- still add up to the final score (otherwise the observation could not be scored at all).
  if v_except then
    select coalesce(sum(case when (r->>'teamId')::uuid = f.home_team_id then coalesce((r#>>'{stats,goals}')::integer, 0)
                             else coalesce((r#>>'{stats,ownGoals}')::integer, 0) end), 0),
           coalesce(sum(case when (r->>'teamId')::uuid = f.away_team_id then coalesce((r#>>'{stats,goals}')::integer, 0)
                             else coalesce((r#>>'{stats,ownGoals}')::integer, 0) end), 0)
      into v_home_goals, v_away_goals
      from jsonb_array_elements(payload->'players') r;
    if v_home_goals is distinct from f.home_score or v_away_goals is distinct from f.away_score then
      raise exception using errcode='PT409', message='sofascore_unmapped_exclusion_refused',
        detail = 'goals'; end if;
  end if;

  -- Squad members of either team who are not in the rows did not take part: the
  -- builder sent a row for everyone SofaScore says appeared, and refuses the match
  -- when an appearing player has no reviewed mapping, except the confirmed exclusions above.
  v_rows := payload->'players';
  select coalesce(jsonb_agg(distinct m.player_id::text), '[]'::jsonb) into v_absent
    from app.team_memberships m
   where m.season_id = f.season_id and m.team_id in (f.home_team_id, f.away_team_id)
     and m.valid_from <= f.kickoff_at::date and (m.valid_to is null or m.valid_to >= f.kickoff_at::date)
     and not exists(select 1 from jsonb_array_elements(v_rows) r where r->>'playerId' = m.player_id::text);
  payload := (payload - 'squadComplete' - 'squadCompleteExceptExcluded') || jsonb_build_object('verifiedNonParticipants', v_absent);

  begin
    select fixture_id into link_fixture from app_private.football_provider_fixture_links
     where provider_name = 'sofascore' and external_fixture_id = v_event;
    if link_fixture is not null and link_fixture <> f.id then
      raise exception using errcode='PT409', message='sofascore_fixture_link_conflict'; end if;
    if exists(select 1 from app_private.football_provider_fixture_links
               where provider_name = 'sofascore' and fixture_id = f.id and external_fixture_id <> v_event) then
      raise exception using errcode='PT409', message='sofascore_fixture_link_conflict'; end if;
    insert into app_private.football_provider_fixture_links(provider_name, external_fixture_id, fixture_id)
    values ('sofascore', v_event, f.id) on conflict do nothing;
    if not exists(select 1 from app_private.football_provider_fixture_links
                   where provider_name = 'sofascore' and external_fixture_id = v_event and fixture_id = f.id) then
      raise exception using errcode='PT409', message='sofascore_fixture_link_conflict'; end if;

    select count(*) into before_count from app_private.fantasy_fixture_observations where fixture_id = f.id;
    perform set_config('botolago.reconciled_ingestion', 'on', true);
    result := api.service_record_fantasy_observation(f.id,
      payload || jsonb_build_object('sourceRefs', jsonb_build_object(
        'sofascoreEventId', v_event,
        'mappingSnapshotDigest', p_request->>'mappingSnapshotDigest',
        'coverage', v_coverage)),
      'provider-reconciled');
    perform set_config('botolago.reconciled_ingestion', '', true);
    select id into latest from app_private.fantasy_fixture_observations
     where fixture_id = f.id order by observed_at desc, id desc limit 1;
    result := result || jsonb_build_object(
      'created', (select count(*) from app_private.fantasy_fixture_observations where fixture_id = f.id) > before_count,
      'latest', latest = (result->>'observationId')::bigint,
      'dryRun', p_dry_run,
      'coverage', v_coverage,
      'nonParticipants', jsonb_array_length(v_absent),
      'excludedUnmapped', v_excluded);
    if p_dry_run or not (result->>'created')::boolean then
      raise exception using errcode='P0001', message='sofascore_dry_run_rollback';
    end if;
  exception when raise_exception then
    perform set_config('botolago.reconciled_ingestion', '', true);
    if sqlerrm = 'sofascore_dry_run_rollback' then return result; end if;
    raise;
  end;
  return result;
end $$;
revoke all on function api.service_record_sofascore_fantasy_observation(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function api.service_record_sofascore_fantasy_observation(uuid, jsonb, boolean) to service_role;

-- ===========================================================================
-- 2. Reopening matches that wait on a player identity
-- ===========================================================================
-- p_team_id: the matches of that club that wait on a player identity.
-- p_fixture_id: that one match, whatever held it (staff asking for a retry).
-- Only a finished, finalized match with no observation, whose gameweek still takes one.
create function app_private.sofascore_fantasy_reopen(p_team_id uuid, p_fixture_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_team_id is null and p_fixture_id is null then return 0; end if;
  update app_private.sofascore_fantasy_attempts a
     set status = 'held', attempts = 0, next_retry_at = statement_timestamp()
    from app.fixtures fx
   where a.fixture_id = fx.id
     and a.status in ('held', 'gave_up')
     and fx.status = 'finished' and fx.finalized_at is not null
     and (p_fixture_id is null or fx.id = p_fixture_id)
     and (p_team_id is null or p_team_id in (fx.home_team_id, fx.away_team_id))
     and (p_fixture_id is not null
          or a.last_outcome in ('unmapped_players', 'sofascore_unmapped_exclusion_refused',
                                'sofascore_identity_not_reviewed')
          or exists(select 1 from jsonb_array_elements(a.last_blockers) b
                     where b->>'code' in ('unmapped_players', 'sofascore_unmapped_exclusion_refused',
                                          'sofascore_identity_not_reviewed')))
     and not exists(select 1 from app_private.fantasy_fixture_observations o where o.fixture_id = fx.id)
     and not exists(select 1 from app.fantasy_fixture_assignments x
                      join app.fantasy_gameweeks g on g.id = x.gameweek_id
                     where x.fixture_id = fx.id and x.superseded_at is null
                       and g.status in ('finalizing', 'finalized', 'corrected'));
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function app_private.sofascore_fantasy_reopen(uuid, uuid) from public, anon, authenticated, service_role;
comment on function app_private.sofascore_fantasy_reopen(uuid, uuid) is
  'Internal: sets finished, unrecorded SofaScore Fantasy matches to be tried on the next tick (attempts reset). By club: those waiting on a player identity. By fixture: that one.';

-- ===========================================================================
-- 3. Staff resolution reopens the club's held matches
-- ===========================================================================
create or replace function api.admin_resolve_sofascore_player_match(p_sofascore_player_id text, p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_principal uuid := app_private.admin_assert_permission('football.manage_mappings');
  v_user uuid;
  q app_private.sofascore_player_match_queue%rowtype;
  v_log uuid := gen_random_uuid();
  v_mapping uuid;
  v_reopened integer := 0;
begin
  if p_sofascore_player_id is null or p_player_id is null
    or p_sofascore_player_id <> btrim(p_sofascore_player_id)
    or char_length(p_sofascore_player_id) not between 1 and 200 then
    raise exception using errcode = 'PT400', message = 'invalid_resolution'; end if;
  select auth_user_id into v_user from app_private.staff_principals where id = v_principal;
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));

  select * into q from app_private.sofascore_player_match_queue
   where sofascore_player_id = p_sofascore_player_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'queue_entry_not_found'; end if;
  if q.resolved_at is not null then
    if q.resolved_player_id = p_player_id then
      return jsonb_build_object('sofascorePlayerId', q.sofascore_player_id, 'playerId', p_player_id,
        'alreadyResolved', true);
    end if;
    raise exception using errcode = 'PT409', message = 'queue_entry_already_resolved'; end if;
  if not exists (select 1 from app.players where id = p_player_id) then
    raise exception using errcode = 'PT404', message = 'player_not_found'; end if;
  -- Conflicts are refused, never resolved by overwriting.
  if exists (select 1 from app_private.football_provider_mappings m
              where m.provider_name = 'sofascore' and m.entity_type = 'player'
                and (m.external_id = p_sofascore_player_id or m.internal_entity_id = p_player_id)) then
    raise exception using errcode = 'PT409', message = 'sofascore_mapping_conflict'; end if;

  insert into app_private.football_provider_mappings (
    provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active,
    manually_corrected, correction_reason, corrected_by, corrected_at)
  values ('sofascore', 'player', p_sofascore_player_id, p_player_id,
    'sofascore-admin-resolve:' || v_log::text, statement_timestamp(), true,
    true, 'Chosen by staff from the SofaScore player review list.', v_user, statement_timestamp())
  on conflict do nothing
  returning id into v_mapping;
  if v_mapping is null then
    raise exception using errcode = 'PT409', message = 'sofascore_mapping_conflict'; end if;
  insert into app_private.sofascore_player_match_log (id, method, mapping_id, sofascore_player_id, player_id,
    fixture_id, evidence, decided_by)
  values (v_log, 'staff-resolution', v_mapping, p_sofascore_player_id, p_player_id, q.fixture_id,
    jsonb_build_object('sofascoreName', q.name, 'queueReason', q.reason), v_user);
  update app_private.sofascore_player_match_queue
     set resolved_at = statement_timestamp(), resolved_by = v_user, resolved_player_id = p_player_id
   where sofascore_player_id = p_sofascore_player_id;
  -- His club's finished matches that wait on a player identity are tried again on the next
  -- tick instead of after their back-off (app_private.sofascore_fantasy_reopen).
  v_reopened := app_private.sofascore_fantasy_reopen(q.team_id, null);
  return jsonb_build_object('sofascorePlayerId', p_sofascore_player_id, 'playerId', p_player_id,
    'mappingId', v_mapping, 'alreadyResolved', false, 'reopened', v_reopened);
end $$;

revoke all on function api.admin_resolve_sofascore_player_match(text, uuid) from public, anon, service_role;
grant execute on function api.admin_resolve_sofascore_player_match(text, uuid) to authenticated;
comment on function api.admin_resolve_sofascore_player_match(text, uuid) is
  'Staff (football.manage_mappings, AAL2): maps one queued SofaScore player to the chosen player as a reviewed mapping, refusing any conflict, then sets his club''s held matches to be tried again on the next tick.';

-- ===========================================================================
-- 4. Once: the matches held now are tried again with these rules
-- ===========================================================================
update app_private.sofascore_fantasy_attempts a
   set status = 'held', attempts = 0, next_retry_at = statement_timestamp()
  from app.fixtures fx
 where a.fixture_id = fx.id
   and a.status in ('held', 'gave_up')
   and fx.status = 'finished' and fx.finalized_at is not null
   and (a.last_outcome in ('unmapped_players', 'sofascore_unmapped_exclusion_refused',
                           'sofascore_identity_not_reviewed', 'minutes_mismatch')
        or exists(select 1 from jsonb_array_elements(a.last_blockers) b
                   where b->>'code' in ('unmapped_players', 'sofascore_unmapped_exclusion_refused',
                                        'sofascore_identity_not_reviewed', 'minutes_mismatch')))
   and not exists(select 1 from app_private.fantasy_fixture_observations o where o.fixture_id = fx.id)
   and not exists(select 1 from app.fantasy_fixture_assignments x
                    join app.fantasy_gameweeks g on g.id = x.gameweek_id
                   where x.fixture_id = fx.id and x.superseded_at is null
                     and g.status in ('finalizing', 'finalized', 'corrected'));
