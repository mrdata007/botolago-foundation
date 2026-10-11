-- The observation writer accepts only mappings whose current identity has a
-- matching review proof. Read that same proof for the automatic builder;
-- manually_corrected alone excludes valid automatic matches.
do $$
begin
  if to_regprocedure('app_private.football_mapping_supporting_state(uuid)') is null
    or to_regprocedure('api.service_sofascore_fantasy_context(uuid,text[])') is null then
    raise exception 'sofascore_fantasy_context_review_prerequisite_missing';
  end if;
end $$;

create or replace function api.service_sofascore_fantasy_context(
  p_fixture_id uuid, p_player_ids text[] default '{}'::text[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  f app.fixtures%rowtype;
  gw app.fantasy_gameweeks%rowtype;
  a app_private.sofascore_fantasy_attempts%rowtype;
  v_event text;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_fixture_id is null or p_player_ids is null or cardinality(p_player_ids) > 120 then
    raise exception using errcode = 'PT400', message = 'sofascore_fantasy_context_invalid'; end if;
  select * into f from app.fixtures where id = p_fixture_id;
  if not found then return jsonb_build_object('found', false); end if;
  select m.external_id into v_event from app_private.football_provider_mappings m
   where m.provider_name = 'sofascore' and m.entity_type = 'fixture'
     and m.internal_entity_id = f.id and m.active limit 1;
  select g.* into gw from app.fantasy_fixture_assignments x
    join app.fantasy_gameweeks g on g.id = x.gameweek_id
   where x.fixture_id = f.id and x.superseded_at is null limit 1;
  select * into a from app_private.sofascore_fantasy_attempts where fixture_id = f.id;
  return jsonb_build_object(
    'found', true,
    'sofascoreEventId', v_event,
    'status', f.status::text,
    'finalized', f.finalized_at is not null,
    'homeScore', f.home_score, 'awayScore', f.away_score,
    'homeTeamId', f.home_team_id, 'awayTeamId', f.away_team_id,
    'gameweekStatus', gw.status::text,
    'adaptiveEnabled', gw.id is not null and app_private.fantasy_adaptive_enabled(gw.id),
    'observations', (select count(*) from app_private.fantasy_fixture_observations o where o.fixture_id = f.id),
    'attempt', case when a.fixture_id is null then null else jsonb_build_object(
      'status', a.status, 'attempts', a.attempts, 'nextRetryAt', a.next_retry_at,
      'lastOutcome', a.last_outcome, 'dataDigest', a.data_digest,
      'matchData', a.match_data) end,
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'externalId', m.external_id, 'appPlayerId', m.internal_entity_id,
        'active', m.active, 'reviewed', coalesce((app_private.football_mapping_supporting_state(m.id) ->> 'reviewed')::boolean, false), 'version', m.source_version,
        'updatedAt', m.updated_at) order by m.external_id), '[]'::jsonb)
      from app_private.football_provider_mappings m
      where m.provider_name = 'sofascore' and m.entity_type = 'player'
        and m.external_id = any(p_player_ids)));
end $$;
revoke all on function api.service_sofascore_fantasy_context(uuid, text[]) from public, anon, authenticated;
grant execute on function api.service_sofascore_fantasy_context(uuid, text[]) to service_role;

