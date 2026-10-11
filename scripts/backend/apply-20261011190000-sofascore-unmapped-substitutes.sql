-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261011190000_sofascore_unmapped_substitutes: the SofaScore Fantasy
-- recorder (api.service_record_sofascore_fantasy_observation) learns to accept
-- a match in which a SUBSTITUTE the app has no player record for (the
-- auto-mapping queued him as no_candidate) is left out of the rows. Today such
-- a player holds the whole match back (held:unmapped_players), for everyone.
--
-- WHEN
--   After the pull request that adds this file is merged and its database-quality
--   run is green, and BEFORE the Edge Function football-live-refresh is deployed
--   with the matching code (a function that sends the new request to the old
--   recorder is refused, harmlessly, with sofascore_request_invalid and the match
--   stays held). Not at minute 12 of an hour (the Fantasy season orchestrator).
--   Replaces one function; writes no row of fixtures, Fantasy, Pepites or users.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now
--      (AGENTS.md, "Before writing": no GitHub Actions run in progress, no
--      pg_cron job mid-run, no other query running).
--   2. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where the SofaScore Fantasy recorder and the
--     auto-mapping queue (migrations 20261011120000 and 20261011130000) are
--     not installed, or where the recorder is not the reviewed text it replaces
--     (md5 of its definition below);
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the recorder is the new text,
--     only service_role may call it, and the history row is there.
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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261011190000') then
    raise exception 'stop: migration 20261011190000 is already recorded as applied';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
       where version in ('20261011120000', '20261011130000')) <> 2 then
    raise exception 'stop: migrations 20261011120000 and 20261011130000 are not both recorded -- run the SofaScore automatic release first';
  end if;
  if to_regprocedure('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)') is null
    or to_regclass('app_private.sofascore_player_match_queue') is null then
    raise exception 'stop: the SofaScore Fantasy recorder or the auto-mapping queue is missing';
  end if;
  if md5(pg_get_functiondef('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)'::regprocedure))
    is distinct from 'e97f34f2bf5acfc7447b3e9dd35386ac' then
    raise exception 'stop: api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean) is not the reviewed version this script replaces (md5 of its definition) -- someone changed it; do not continue';
  end if;
  if exists (select 1 from pg_stat_activity
              where state = 'active' and pid <> pg_backend_pid()
                and query ilike '%service_record_sofascore_fantasy_observation%') then
    raise exception 'stop: the recorder is running right now -- try again in a minute';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261011190000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261011190000',
  'sofascore_unmapped_substitutes',
  array[$bg_20261011190000_file$-- Unknown substitutes no longer hold a SofaScore Fantasy match back.
--
-- WHY. A finished match was held ('held:unmapped_players') because two players SofaScore
-- says appeared (Saad Kouk #40, UTS Rabat; Souleymane Sy #37, RSB Berkane in event 17256977)
-- have no BotolaGO player record at all: the auto-mapping queued them as 'no_candidate'. A
-- player the app does not know cannot be in anyone's Fantasy team and cannot earn points, yet
-- it blocked the match for everyone.
--
-- WHAT. The recording function accepts, besides the plain request (squadComplete), a request
-- that lists unmapped substitutes it leaves out (squadCompleteExceptExcluded plus
-- excludedUnmappedPlayers). The builder lists a substitute only when he has no goal, own goal,
-- penalty, assist or card and did not start (supabase/functions/_shared/sofascore-fantasy.ts).
-- This function confirms, for each one, on its own data: no player mapping exists for the id;
-- the auto-mapping queue holds him open as 'no_candidate' for that club; and no still-unmapped
-- squad member of that club could be him (same shirt number, or no shirt number on file and a
-- compatible position). Otherwise it refuses the whole request with
-- sofascore_unmapped_exclusion_refused. The list stays in the stored observation payload
-- (and its digest), so the exclusion is auditable. Nothing else changes: the same recorder
-- (api.service_record_fantasy_observation) and all its guards (22 starters, eleven a side,
-- goals add up to the score, minutes, membership) run unchanged; the squad members missing
-- from the rows are still derived as non-participants.
--
-- A different key (squadCompleteExceptExcluded) is used on purpose: a database that still has
-- the previous function refuses such a request instead of recording it unchecked.
--
-- Replaces one function; signature, owner, grants and everything else are as in 20261011120000.
-- A request without exclusions behaves exactly as before.
do $$
begin
  if to_regprocedure('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)') is null
    or to_regclass('app_private.sofascore_player_match_queue') is null then
    raise exception 'sofascore_unknown_players_prerequisite_missing: apply migrations 20261011120000 and 20261011130000 first';
  end if;
end $$;

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
    or payload ? 'estimatedNonParticipants' or coalesce((payload->>'anonymousStarters')::integer, 0) <> 0 then
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
                   where k not in ('sofascoreId', 'side', 'shirtNumber', 'position', 'reason'))
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
    end loop;
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
$bg_20261011190000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261011190000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261011190000'
  );
begin
  if encode(sha256(convert_to(part_20261011190000, 'UTF8')), 'hex')
    is distinct from '39c57cb8177de09921662ece8bf9f106095e0b4d9439da2e16dffeb0c9193feb' then
    raise exception 'stop: 20261011190000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261011190000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  v_def text;
begin
  v_def := pg_get_functiondef('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)'::regprocedure);
  if position('sofascore_unmapped_exclusion_refused' in v_def) = 0
    or position('squadCompleteExceptExcluded' in v_def) = 0 then
    problems := problems || 'the recorder is not the new text'::text;
  end if;
  if has_function_privilege('anon', 'api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)'::regprocedure, 'execute')
    or has_function_privilege('authenticated', 'api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)'::regprocedure, 'execute') then
    problems := problems || 'visitors or signed-in users can call the recorder'::text;
  end if;
  if not has_function_privilege('service_role', 'api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)'::regprocedure, 'execute') then
    problems := problems || 'the service role cannot call the recorder'::text;
  end if;
  if not exists (select 1 from pg_proc p where p.oid = 'api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)'::regprocedure
                  and p.prosecdef and p.proconfig @> array['search_path=""']) then
    problems := problems || 'the recorder is not security definer with an empty search_path'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261011190000') then
    problems := problems || 'history row missing'::text;
  end if;
  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'the SofaScore Fantasy recorder now accepts confirmed unknown substitutes';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261011190000')
    then 'Applied. The recorder accepts confirmed unknown substitutes. Deploy football-live-refresh next.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
