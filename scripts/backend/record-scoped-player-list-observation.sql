-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Record a SCOPED player-list observation: only the lineup players of named
-- fixtures that cannot be placed, and nothing else from the observation.
--
-- WHY. A match's statistics import only if every identified lineup player
-- resolves to a canonical player listed at the club they played for
-- (docs/backend/CURRENT_PLAYER_LIST_UPDATE.md). The full observation
-- ("Observe current Football player list") plans every squad change SportsMonks
-- shows (tens of changes, including new priced Fantasy players built from squad
-- lists that nobody asked for). This records the subset a reviewed repair
-- needs, derived from a stored observation by filtering it and nothing else:
-- no value is typed in or invented. It follows the one precedent, the
-- 2026-09-27 observation "repair seven confirmed player identities only".
--
-- WHAT IT WRITES. One row in app_private.current_player_list_observations
-- (api.service_record_current_player_list, which also holds the scheduled
-- jobs off while it runs). No player, mapping, membership or Fantasy row
-- changes here: that is the separate, existing apply step
-- (scripts/backend/apply-current-player-list.sql), taken only after the
-- plan this prints has been reviewed.
--
-- THE CLOCKS. Recording refuses an observation older than 30 minutes
-- (player_list_observation_not_fresh), and the apply refuses one older than 24
-- hours. So: run "Observe current Football player list" with fixture_ids = the
-- fixtures to repair, then run this REHEARSAL, then (within the 30 minutes)
-- the real run. If the 30 minutes pass, observe again; never edit the check.
--
-- GUARDS. It stops, saving nothing, unless:
--   * the reviewed player list equals, exactly, the lineup players of those
--     fixtures that cannot be placed today (NO_MAPPING or
--     MAPPED_NO_MEMBERSHIP_FOR_TEAM, as scripts/backend/
--     diagnose-fixture-identities.sql lists them). A name is never matched;
--   * the scoped observation passes the same validation as any observation;
--   * the plan changes no player outside the reviewed list and leaves no
--     Fantasy squad over the club limit;
--   * no Fantasy move touches a player a Fantasy team holds, unless the owner
--     accepted that move and its provider id is in scope_ack_held_moves.
-- It also reports which listed players the plan would STILL leave unplaced
-- (for example a player the provider gives no position): those fixtures will
-- go on failing, so read that line first.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor.
--      Check that nothing else is writing, before the rehearsal and again
--      before the real run (AGENTS.md, "Before writing"):
--        * GitHub -> Actions: no run in progress;
--        * pg_cron: nothing mid-run (the script checks and stops if so);
--        * no other query running.
--   2. Fill in the four values just below this header:
--        scope_source_observation  the fresh observation's "observationId"
--        scope_fixtures            provider fixture ids, comma separated
--        scope_players             the reviewed provider player ids, comma
--                                  separated (from the diagnostic and
--                                  diagnose-fixture-identities.sql)
--        scope_ack_held_moves      provider ids of held-player moves the owner
--                                  accepted, or leave empty
--      scope_dry_run stays 'true' for the rehearsal.
--   3. Paste this WHOLE file and press Run. A rehearsal ends with an error
--      that starts "REHEARSAL, nothing saved:" and carries the report. That
--      is the expected result, not a failure.
--   4. Review the report. Change scope_dry_run to 'false' and run again. The
--      result row gives the new observation's id and the plan's digest: use
--      them in apply-current-player-list.sql (Fantasy tick paused first, as
--      its header says), within 24 hours.
--   If a "stop:" message appears, nothing was saved; if the editor then
--   complains about an aborted transaction, run `rollback;` once. Do not edit
--   a check to make it pass: find out why the world differs from the list.
-- ============================================================================

begin;
select set_config('botolago.scope_source_observation', 'PASTE-OBSERVATION-ID', false),
  set_config('botolago.scope_fixtures', 'PASTE-FIXTURE-IDS', false),
  set_config('botolago.scope_players', 'PASTE-PLAYER-IDS', false),
  set_config('botolago.scope_ack_held_moves', '', false),
  set_config('botolago.scope_dry_run', 'true', false);
commit;

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $scope$
declare
  source_id uuid;
  fixtures text[];
  players text[];
  acknowledged text[];
  dry_run boolean;
  source jsonb;
  source_observed timestamptz;
  unresolved text[];
  not_listed text[];
  not_unresolved text[];
  scoped jsonb;
  recorded jsonb;
  new_id uuid;
  plan jsonb;
  outside text[];
  held jsonb;
  still_unplaced text[];
  report jsonb;
begin
  -- Settings -----------------------------------------------------------------
  if current_setting('botolago.scope_source_observation') !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'stop: fill in scope_source_observation with the observation''s id';
  end if;
  source_id := current_setting('botolago.scope_source_observation')::uuid;
  fixtures := string_to_array(replace(current_setting('botolago.scope_fixtures'), ' ', ''), ',');
  players := string_to_array(replace(current_setting('botolago.scope_players'), ' ', ''), ',');
  acknowledged := coalesce(
    nullif(string_to_array(replace(current_setting('botolago.scope_ack_held_moves'), ' ', ''), ','), '{""}'),
    '{}'::text[]);
  if exists (select 1 from unnest(fixtures) f where f !~ '^[1-9][0-9]{0,14}$')
    or exists (select 1 from unnest(players) p where p !~ '^[1-9][0-9]{0,14}$')
    or exists (select 1 from unnest(acknowledged) a where a !~ '^[1-9][0-9]{0,14}$')
    or cardinality(fixtures) not between 1 and 20
    or cardinality(players) not between 1 and 200
    or cardinality(players) <> (select count(distinct p) from unnest(players) p) then
    raise exception 'stop: scope_fixtures and scope_players must be comma separated provider ids (no repeats), filled in';
  end if;
  if current_setting('botolago.scope_dry_run') not in ('true', 'false') then
    raise exception 'stop: scope_dry_run must be ''true'' or ''false''';
  end if;
  dry_run := current_setting('botolago.scope_dry_run') = 'true';

  -- Preflight ------------------------------------------------------------------
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260925200000') then
    raise exception 'stop: migration 20260925200000 is not applied';
  end if;
  select observation.observations, observation.observed_at into source, source_observed
  from app_private.current_player_list_observations observation where observation.id = source_id;
  if source is null then
    raise exception 'stop: no observation %', source_id;
  end if;
  if source_observed < statement_timestamp() - interval '29 minutes' then
    raise exception 'stop: that observation is % old; recording needs one under 30 minutes. Observe again.',
      statement_timestamp() - source_observed;
  end if;
  if exists (select 1 from unnest(fixtures) f where not exists (
    select 1 from jsonb_array_elements(source -> 'lineups') lineup where lineup ->> 'fixtureExternalId' = f)) then
    raise exception 'stop: a listed fixture is not in the observation''s lineups (it was observed with other fixture_ids)';
  end if;
  -- AGENTS.md: serialise with the scheduled jobs (the record holds them off, too).
  if exists (select 1 from cron.job_run_details run where run.status not in ('succeeded', 'failed')) then
    raise exception 'stop: a scheduled (pg_cron) job is running right now -- nothing was saved; run this again in a minute';
  end if;

  -- The reviewed list must be exactly what cannot be placed today.
  select coalesce(array_agg(distinct unplaced.player_ext order by unplaced.player_ext), '{}'::text[])
  into unresolved
  from (
    select member ->> 'externalPlayerId' as player_ext
    from jsonb_array_elements(source -> 'lineups') lineup
    cross join lateral jsonb_array_elements(lineup -> 'players') member
    join app_private.football_provider_mappings fixture_map
      on fixture_map.provider_name = 'sportsmonks' and fixture_map.entity_type = 'fixture'
      and fixture_map.external_id = lineup ->> 'fixtureExternalId' and fixture_map.active
    join app.fixtures fixture on fixture.id = fixture_map.internal_entity_id
    left join app_private.football_provider_mappings team_map
      on team_map.provider_name = 'sportsmonks' and team_map.entity_type = 'team'
      and team_map.external_id = member ->> 'teamExternalId' and team_map.active
    left join app_private.football_provider_mappings player_map
      on player_map.provider_name = 'sportsmonks' and player_map.entity_type = 'player'
      and player_map.external_id = member ->> 'externalPlayerId' and player_map.active
    where lineup ->> 'fixtureExternalId' = any (fixtures)
      and (team_map.internal_entity_id is null
        or team_map.internal_entity_id not in (fixture.home_team_id, fixture.away_team_id)
        or player_map.internal_entity_id is null
        or not exists (
          select 1 from app.team_memberships membership
          join app.seasons season on season.id = membership.season_id and season.is_current
          where membership.player_id = player_map.internal_entity_id
            and membership.team_id = team_map.internal_entity_id
            and membership.valid_from <= fixture.kickoff_at::date
            and (membership.valid_to is null or membership.valid_to >= fixture.kickoff_at::date)))
  ) unplaced;
  not_listed := array(select unnest(unresolved) except select unnest(players));
  not_unresolved := array(select unnest(players) except select unnest(unresolved));
  if cardinality(not_listed) > 0 or cardinality(not_unresolved) > 0 then
    raise exception 'stop: the reviewed list differs from what cannot be placed now. Unplaced but not listed: %. Listed but placed already, or not in those lineups: %',
      not_listed, not_unresolved;
  end if;

  -- The scoped observation: a pure filter of the stored one ------------------
  scoped := jsonb_build_object(
    'clubs', (select coalesce(jsonb_agg(jsonb_build_object(
        'source', club ->> 'source',
        'teamExternalId', club ->> 'teamExternalId',
        'players', (select coalesce(jsonb_agg(member), '[]'::jsonb)
          from jsonb_array_elements(club -> 'players') member
          where member ->> 'externalPlayerId' = any (players)))), '[]'::jsonb)
      from jsonb_array_elements(source -> 'clubs') club),
    'lineups', (select coalesce(jsonb_agg(jsonb_build_object(
        'fixtureExternalId', lineup ->> 'fixtureExternalId',
        'players', (select coalesce(jsonb_agg(member), '[]'::jsonb)
          from jsonb_array_elements(lineup -> 'players') member
          where member ->> 'externalPlayerId' = any (players)))), '[]'::jsonb)
      from jsonb_array_elements(source -> 'lineups') lineup
      where lineup ->> 'fixtureExternalId' = any (fixtures)),
    'observedAt', source ->> 'observedAt',
    'providerName', source ->> 'providerName',
    'seasonExternalId', source ->> 'seasonExternalId',
    'reviewScope', jsonb_build_object(
      'purpose', 'repair listed player identities only',
      'sourceObservationId', source_id,
      'fixtures', to_jsonb(fixtures),
      'players', cardinality(players)));
  perform app_private.current_player_list_season(scoped);

  -- Record it, as the service role the function is written for, and plan it ---
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  recorded := api.service_record_current_player_list(scoped);
  new_id := (recorded ->> 'observationId')::uuid;
  plan := app_private.current_player_list_plan(new_id);

  -- Postflight on the plan ---------------------------------------------------
  if jsonb_array_length(plan -> 'changes') = 0 then
    raise exception 'stop: the scoped observation plans no change; the listed players are not placed by the existing rules (see skipped): %', plan -> 'skipped';
  end if;
  outside := array(select change ->> 'externalPlayerId'
    from jsonb_array_elements(plan -> 'changes') change
    where change ->> 'externalPlayerId' <> all (players));
  if cardinality(outside) > 0 then
    raise exception 'stop: the plan changes players outside the reviewed list: %', outside;
  end if;
  if (plan #>> '{summary,clubLimitViolations}')::integer <> 0 then
    raise exception 'stop: the plan would leave a Fantasy squad over the club limit';
  end if;
  held := (select coalesce(jsonb_agg(jsonb_build_object(
      'externalPlayerId', change ->> 'externalPlayerId', 'name', change ->> 'name',
      'from', change -> 'fromClubs', 'to', change ->> 'club',
      'squads', (select count(*) from app.fantasy_squad_memberships squad
        where squad.fantasy_player_id = (change ->> 'fantasyPlayerId')::uuid and squad.sold_at is null),
      'lineups', (select count(*) from app.fantasy_lineup_players lineup_player
        where lineup_player.fantasy_player_id = (change ->> 'fantasyPlayerId')::uuid))), '[]'::jsonb)
    from jsonb_array_elements(plan -> 'changes') change
    where change ->> 'fantasy' = 'move'
      and ((exists (select 1 from app.fantasy_squad_memberships squad
          where squad.fantasy_player_id = (change ->> 'fantasyPlayerId')::uuid and squad.sold_at is null))
        or (exists (select 1 from app.fantasy_lineup_players lineup_player
          where lineup_player.fantasy_player_id = (change ->> 'fantasyPlayerId')::uuid))));
  if exists (select 1 from jsonb_array_elements(held) h where h ->> 'externalPlayerId' <> all (acknowledged)) then
    raise exception 'stop: the plan moves players that Fantasy teams hold: %. Put their provider ids in scope_ack_held_moves only once the owner has accepted each move', held;
  end if;
  still_unplaced := array(select unnest(players)
    except select change ->> 'externalPlayerId' from jsonb_array_elements(plan -> 'changes') change);

  report := jsonb_build_object(
    'sourceObservationId', source_id,
    'scopedObservationId', new_id,
    'planDigest', plan ->> 'digest',
    'listedPlayers', cardinality(players),
    'summary', plan -> 'summary',
    'stillUnplacedAfterApply', to_jsonb(still_unplaced),
    'skipped', plan -> 'skipped',
    'heldFantasyMoves', held,
    'changes', (select jsonb_agg(jsonb_build_object(
        'ext', change ->> 'externalPlayerId', 'name', change ->> 'name', 'club', change ->> 'club',
        'player', change ->> 'player', 'membership', change ->> 'membership',
        'fantasy', change ->> 'fantasy', 'price', change ->> 'fantasyPrice',
        'from', change -> 'fromClubs') order by change ->> 'club', change ->> 'name')
      from jsonb_array_elements(plan -> 'changes') change));

  if dry_run then
    -- The deliberate raise rolls the whole transaction back, the recorded
    -- observation with it, and carries the computed state out in its message.
    raise exception 'REHEARSAL, nothing saved: %', report::text;
  end if;
end
$scope$;

commit;

-- Real run only (scope_dry_run = 'false'): the observation just recorded and
-- the digest of its plan, for apply-current-player-list.sql.
select observation.id as observation_id, observation.observation_digest,
  app_private.current_player_list_plan(observation.id) ->> 'digest' as plan_digest,
  app_private.current_player_list_plan(observation.id) -> 'summary' as plan_summary,
  'Review the plan, pause the Fantasy tick, then run apply-current-player-list.sql within 24 hours.' as next_step
from app_private.current_player_list_observations observation
where observation.observations -> 'reviewScope' ->> 'sourceObservationId' = current_setting('botolago.scope_source_observation')
order by observation.created_at desc
limit 1;
