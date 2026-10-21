-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- READ-ONLY: which of a fixture's provider lineup players cannot be placed?
--
-- A match's statistics import only if every identified lineup player resolves
-- to a canonical player listed at the club they played for. The importer's
-- two refusals name no player (PLAYER_MAPPING_NOT_FOUND,
-- PLAYER_MEMBERSHIP_NOT_FOUND, and it stops at the first one), so this lists
-- all of them, with the class that decides the repair:
--
--   NO_MAPPING                    no active SportsMonks mapping for the id: a
--                                 player the canonical list does not know, or
--                                 knows without the id.
--   MAPPED_NO_MEMBERSHIP_FOR_TEAM mapped, but no club record for this season
--                                 at that club covering the kickoff date.
--                                 member_of shows the club(s) the player is
--                                 listed at instead ('none' = no club).
--   TEAM_MAPPING_BAD              the provider club is not one of the two
--                                 clubs of the fixture (a lookup problem).
--   INPUT_PROBLEM                 the fixture or its lineup was not found: the
--                                 result is NOT "everyone resolved".
--
-- It never writes: the transaction is declared read only, so PostgreSQL
-- refuses any write, and it ends in a rollback.
--
-- HOW TO RUN
--   1. Get the provider ids. Either:
--      a. from the evidence of the read-only workflow "Ingest current
--         finished Football performances" run with the confirmation
--         DIAGNOSE_CURRENT_FINISHED_PERFORMANCES (and only_fixture_external_id
--         set): paste the fixture's `lineup` array as it is (it has no single
--         quotes) in place of PASTE-LINEUP-JSON below, and its fixture id in
--         place of PASTE-FIXTURE-ID; or
--      b. from a stored player-list observation: put its id in place of
--         PASTE-OBSERVATION-ID (leave PASTE-LINEUP-JSON as it is) and the
--         provider fixture id in place of PASTE-FIXTURE-ID.
--   2. Paste the whole file into the Supabase SQL editor and press Run.
--   A fixture the diagnostic could not validate has no `lineup` in its
--   evidence (it stopped earlier, with its own code): use (b) for it.
--
-- WHAT IT DOES NOT DECIDE. A resolved row is "listed at the club on the
-- date", nothing more: no name is ever matched here. A repair names players by
-- their provider id and is reviewed against the plan, never against a name.
-- ============================================================================

begin read only;

select set_config('botolago.identity_fixture', 'PASTE-FIXTURE-ID', true),
  set_config('botolago.identity_observation', 'PASTE-OBSERVATION-ID', true),
  set_config('botolago.identity_lineup', 'PASTE-LINEUP-JSON', true);

do $input$
begin
  if current_setting('botolago.identity_fixture') !~ '^[1-9][0-9]{0,14}$' then
    raise exception 'stop: put the provider fixture id in place of PASTE-FIXTURE-ID';
  end if;
  if current_setting('botolago.identity_observation') = 'PASTE-OBSERVATION-ID'
    and current_setting('botolago.identity_lineup') = 'PASTE-LINEUP-JSON' then
    raise exception 'stop: paste the diagnostic''s lineup array or a stored observation id';
  end if;
end
$input$;

with request as (
  select current_setting('botolago.identity_fixture') as fixture_id,
    nullif(current_setting('botolago.identity_observation'), 'PASTE-OBSERVATION-ID') as observation_id,
    nullif(current_setting('botolago.identity_lineup'), 'PASTE-LINEUP-JSON') as lineup_json
), lineup as (
  -- (b) a stored observation's lineup for the fixture; otherwise (a) the pasted array.
  select member ->> 'externalPlayerId' as player_ext, member ->> 'teamExternalId' as team_ext
  from request
  join app_private.current_player_list_observations observation
    on observation.id::text = request.observation_id
  cross join lateral jsonb_array_elements(observation.observations -> 'lineups') entry
  cross join lateral jsonb_array_elements(entry -> 'players') member
  where entry ->> 'fixtureExternalId' = request.fixture_id
  union all
  select member ->> 'externalPlayerId', member ->> 'externalTeamId'
  from request
  cross join lateral jsonb_array_elements(request.lineup_json::jsonb) member
  where request.observation_id is null and request.lineup_json is not null
), season as (
  select id from app.seasons where is_current and label = '2026/2027'
), target as (
  select fixture.*
  from request
  join app_private.football_provider_mappings mapping
    on mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'fixture'
    and mapping.external_id = request.fixture_id and mapping.active
  join app.fixtures fixture on fixture.id = mapping.internal_entity_id
), resolved as (
  select lineup.player_ext, lineup.team_ext, target.kickoff_at,
    player_map.internal_entity_id as player_id, team_map.internal_entity_id as team_id,
    target.home_team_id, target.away_team_id
  from lineup
  cross join target
  left join app_private.football_provider_mappings player_map
    on player_map.provider_name = 'sportsmonks' and player_map.entity_type = 'player'
    and player_map.external_id = lineup.player_ext and player_map.active
  left join app_private.football_provider_mappings team_map
    on team_map.provider_name = 'sportsmonks' and team_map.entity_type = 'team'
    and team_map.external_id = lineup.team_ext and team_map.active
), classified as (
  select resolved.*,
    case
      when team_id is null or team_id not in (home_team_id, away_team_id) then 'TEAM_MAPPING_BAD'
      when player_id is null then 'NO_MAPPING'
      when not exists (select 1 from app.team_memberships membership, season
        where membership.season_id = season.id and membership.player_id = resolved.player_id
          and membership.team_id = resolved.team_id
          and membership.valid_from <= resolved.kickoff_at::date
          and (membership.valid_to is null or membership.valid_to >= resolved.kickoff_at::date))
        then 'MAPPED_NO_MEMBERSHIP_FOR_TEAM'
      else 'OK'
    end as class
  from resolved
), unresolved as (
  select classified.player_ext as provider_player_id, classified.team_ext as provider_club_id,
    classified.class,
    (select player.full_name || ' | born ' || coalesce(player.date_of_birth::text, '?')
        || ' | ' || player.position::text
      from app.players player where player.id = classified.player_id) as canonical_player,
    (select coalesce(string_agg(distinct club_map.external_id, ' / '), 'none')
      from app.team_memberships membership
      join season on season.id = membership.season_id
      left join app_private.football_provider_mappings club_map
        on club_map.internal_entity_id = membership.team_id and club_map.entity_type = 'team'
        and club_map.provider_name = 'sportsmonks' and club_map.active
      where membership.player_id = classified.player_id) as member_of
  from classified
  where classified.class <> 'OK'
)
select unresolved.*, (select count(*) from classified) as lineup_players,
  (select count(*) from unresolved) as unresolved_players
from unresolved
union all
select null, null, 'INPUT_PROBLEM', 'the fixture is not mapped to this season', null,
  (select count(*) from classified), 0
where not exists (select 1 from target)
union all
select null, null, 'INPUT_PROBLEM', 'no lineup players were found for the fixture', null, 0, 0
where exists (select 1 from target) and not exists (select 1 from lineup)
order by class, provider_club_id, provider_player_id;

rollback;
