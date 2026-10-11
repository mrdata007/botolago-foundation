-- SofaScore player performances for Pépites (docs/backend/SOFASCORE_LIVE_EDGE.md,
-- "Pépites").
--
-- WHY. Pépites reads appearances from app.player_fixture_performances (active
-- rows with minutes > 0). Until now only the SportsMonks importer wrote that
-- table, and for a fixture in a gameweek with adaptive scoring it wrote an
-- observation instead of rows. Football data now comes from SofaScore, so
-- Pépites, its weekly editions and the player stats stopped moving.
--
-- WHAT. One service-role function, api.service_sync_sofascore_player_performances,
-- derives the rows of a finished fixture FROM THE OBSERVATION the automatic
-- Fantasy path already recorded (api.service_record_sofascore_fantasy_observation,
-- 20261011120000). Nothing is fetched again and nothing is re-parsed: the facts
-- are the ones Fantasy scores, built from the same SofaScore replies, the same
-- reviewed player mappings and the same checks (final score, goals, minutes,
-- cards). It is called by the football-live-refresh Edge Function on every
-- tick, so the matches finished since SportsMonks stopped are filled by that
-- same sweep. It is idempotent: the source version is the observation digest,
-- the same observation again writes nothing, a newer one replaces the rows of
-- the older one (they are set inactive, never deleted).
--
-- WHICH FIXTURES. Finished and finalized, whose newest observation is a
-- SofaScore one (source provider-reconciled with a SofaScore event id that the
-- fixture's reviewed mapping and link confirm), whose every player is still a
-- reviewed SofaScore identity, and that carries no active row from another
-- provider: a fixture SportsMonks already covered keeps its SportsMonks rows
-- (SportsMonks wins there; this function refuses with
-- sofascore_performances_other_provider_rows).
--
-- UNKNOWN IS NULL, NEVER ZERO. SofaScore establishes minutes, goals, own goals,
-- cards, goals conceded and the clean sheet for every match. Assists, penalties
-- missed, saves and penalties saved are facts only on a full-coverage match (an
-- assist is also one when an incident names the assister). Where the
-- observation marks a field unknown, or carries no evidence for it, the column
-- is NULL. assists and penalties_missed were NOT NULL; this migration drops
-- that (saves and penalties_saved already allow NULL, 20260914200726). Pépites
-- reads these columns null-safely: it sums assists ignoring NULL (a lower
-- bound, as the engine already does), shows penalties missed and saved as
-- unknown when any appearance is NULL, and treats a goalkeeper's NULL saves as
-- "saves unknown" (20260926090000, 20260926212632). provider_rating stays NULL
-- unless the caller passes the rating SofaScore gave in the same lineup reply.
--
-- FANTASY IS UNTOUCHED, AND KEPT UNTOUCHED ON PURPOSE. The Fantasy scoring
-- input document embeds activePerformanceCount and a digest of every active
-- row of each fixture, and app_private.fantasy_assert_scoring_snapshot
-- recomputes the whole document against the stored snapshot digest
-- (fantasy_scoring_input_changed). A row written here would change that digest
-- for a gameweek being scored. So the two functions that read those rows for
-- the document, fantasy_scoring_input_document_v1 and
-- fantasy_validate_scoring_document_v1, are patched in place to ignore
-- source_provider = 'sofascore' rows. Until the first such row exists the
-- patched documents are byte for byte the ones they were (this migration stops
-- if one already exists). No column is added to the table, because the digest
-- hashes to_jsonb(row). The coverage table the legacy path reads
-- (app_private.historical_performance_fixture_coverage) is not written.
--
-- Nothing here scores, finalizes or changes a published point.

do $$
begin
  if to_regprocedure('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)') is null
    or to_regclass('app_private.fantasy_fixture_observations') is null
    or to_regclass('app_private.football_provider_fixture_links') is null
    or to_regclass('app_private.football_provider_mappings') is null
    or to_regclass('app.player_fixture_performances') is null
    or to_regprocedure('app_private.football_mapping_supporting_state(uuid)') is null
    or to_regprocedure('app_private.is_service_request()') is null
    or to_regprocedure('app_private.fantasy_scoring_input_document_v1(uuid)') is null
    or to_regprocedure('app_private.fantasy_validate_scoring_document_v1(jsonb)') is null then
    raise exception 'sofascore_player_performances_prerequisite_missing: apply migrations 20261011120000 and the Fantasy scoring ones first';
  end if;
  if exists (select 1 from app.player_fixture_performances where source_provider = 'sofascore') then
    raise exception 'sofascore_player_performances_rows_exist: a SofaScore row exists already, so the Fantasy documents may already differ';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Unknown assists and penalties missed are NULL, as saves already can be.
-- ---------------------------------------------------------------------------
alter table app.player_fixture_performances alter column assists drop not null;
alter table app.player_fixture_performances alter column penalties_missed drop not null;
comment on column app.player_fixture_performances.assists is
  'NULL when the source does not establish assists for the match (SofaScore limited coverage with no named assister). Never a stand-in zero.';
comment on column app.player_fixture_performances.penalties_missed is
  'NULL when the source does not establish penalties missed for the match (SofaScore limited coverage). Never a stand-in zero.';
comment on column app.player_fixture_performances.saves is
  'NULL when unknown (SofaScore limited coverage) or not collected (outfield player). Never a stand-in zero.';
comment on column app.player_fixture_performances.penalties_saved is
  'NULL when unknown (SofaScore limited coverage, or a penalty missed against his team that may not have been a save) or not collected (outfield player).';

-- ---------------------------------------------------------------------------
-- 2. The Fantasy scoring documents ignore SofaScore performance rows.
--    The text of each function is patched where it reads the table, every
--    replacement is counted, and the migration stops if the text is not the
--    one this was written against.
-- ---------------------------------------------------------------------------
do $patch$
declare
  definition text;
  old_text text;
  new_text text;
begin
  -- The base scoring document (20260926101555, renamed _v1 by 20260927094823):
  -- the fixture's row count and digest, and the per-player join.
  definition := pg_get_functiondef('app_private.fantasy_scoring_input_document_v1(uuid)'::regprocedure);
  old_text := 'from app.player_fixture_performances p where p.fixture_id=f.id and p.active)';
  new_text := 'from app.player_fixture_performances p where p.fixture_id=f.id and p.active and p.source_provider is distinct from ''sofascore'')';
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 2 then
    raise exception 'sofascore performances: the base scoring document is not the 20260926101555 version (row count and digest)';
  end if;
  definition := replace(definition, old_text, new_text);
  old_text := 'left join app.player_fixture_performances p on p.fixture_id=f.id and p.player_id=fp.football_player_id and p.active';
  new_text := 'left join app.player_fixture_performances p on p.fixture_id=f.id and p.player_id=fp.football_player_id and p.active and p.source_provider is distinct from ''sofascore''';
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'sofascore performances: the base scoring document is not the 20260926101555 version (player join)';
  end if;
  execute replace(definition, old_text, new_text);

  -- The legacy fixture check (20261004120000): an active row from another
  -- source version made a fixture incomplete.
  definition := pg_get_functiondef('app_private.fantasy_validate_scoring_document_v1(jsonb)'::regprocedure);
  old_text := 'exists (select 1 from app.player_fixture_performances p where p.fixture_id=(f->>''fixtureId'')::uuid and p.active';
  new_text := 'exists (select 1 from app.player_fixture_performances p where p.fixture_id=(f->>''fixtureId'')::uuid and p.active and p.source_provider is distinct from ''sofascore''';
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'sofascore performances: the legacy fixture check is not the 20261004120000 version';
  end if;
  execute replace(definition, old_text, new_text);
end
$patch$;

-- ---------------------------------------------------------------------------
-- 3. One fixture: derive the rows from its newest SofaScore observation.
--    Raises a labelled refusal (sofascore_performances_*) and writes nothing
--    when the fixture, the observation, an identity or a statistic is not as
--    it must be. Called only by the service function below.
-- ---------------------------------------------------------------------------
create function app_private.sofascore_sync_fixture_performances(p_fixture_id uuid, p_ratings jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f app.fixtures%rowtype;
  o app_private.fantasy_fixture_observations%rowtype;
  v_event text;
  v_version text;
  v_rows jsonb;
  r jsonb;
  v_external text;
  v_mapping uuid;
  v_state jsonb;
  v_field text;
  v_count integer;
  v_current integer;
  v_changed integer := 0;
  v_deactivated integer := 0;
  v_outcome text;
begin
  -- One writer per fixture: two concurrent syncs would race for the active key.
  perform pg_advisory_xact_lock(hashtextextended('sofascore_player_performances:' || p_fixture_id::text, 0));

  select * into f from app.fixtures where id = p_fixture_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'sofascore_performances_fixture_not_found'; end if;
  if f.status <> 'finished' or f.finalized_at is null then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_fixture_not_finished'; end if;

  select * into o from app_private.fantasy_fixture_observations
   where fixture_id = f.id order by observed_at desc, id desc limit 1;
  if not found then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_no_observation'; end if;
  v_event := o.payload #>> '{sourceRefs,sofascoreEventId}';
  -- A reviewed correction, or another provider's observation, is the newest
  -- word on this fixture: it is not ours to turn into rows.
  if o.source <> 'provider-reconciled' or coalesce(v_event, '') !~ '^[0-9]{1,20}$' then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_observation_not_sofascore'; end if;
  -- The core facts (minutes, goals, own goals, cards, goals conceded, clean sheet)
  -- of every row are established and add up to the final score.
  if not o.simple_ready then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_observation_incomplete'; end if;
  if (o.payload ->> 'homeScore')::integer is distinct from f.home_score
    or (o.payload ->> 'awayScore')::integer is distinct from f.away_score then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_score_mismatch'; end if;

  -- The fixture is the one a reviewed mapping and the link say this match is.
  if not exists (select 1 from app_private.football_provider_mappings m
        where m.provider_name = 'sofascore' and m.entity_type = 'fixture'
          and m.external_id = v_event and m.internal_entity_id = f.id and m.active)
    or not exists (select 1 from app_private.football_provider_fixture_links l
        where l.provider_name = 'sofascore' and l.external_fixture_id = v_event and l.fixture_id = f.id) then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_fixture_mapping_missing'; end if;

  -- A fixture another provider already covers keeps that provider's rows.
  if exists (select 1 from app.player_fixture_performances p
      where p.fixture_id = f.id and p.active and p.source_provider is distinct from 'sofascore') then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_other_provider_rows'; end if;

  v_rows := o.payload -> 'players';
  if jsonb_typeof(v_rows) is distinct from 'array' or jsonb_array_length(v_rows) not between 18 and 100 then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_observation_incomplete'; end if;

  -- Every player is, today, a reviewed SofaScore identity pointing at the
  -- player the row names, and every row is a club of this fixture with the
  -- core facts established.
  for r in select value from jsonb_array_elements(v_rows) loop
    v_external := r #>> '{identity,sofascoreId}';
    if v_external is null or char_length(v_external) not between 1 and 200 then
      raise exception using errcode = 'PT409', message = 'sofascore_performances_identity_not_reviewed'; end if;
    select m.id into v_mapping from app_private.football_provider_mappings m
     where m.provider_name = 'sofascore' and m.entity_type = 'player' and m.external_id = v_external;
    v_state := case when v_mapping is null then null
                    else app_private.football_mapping_supporting_state(v_mapping) end;
    if v_state is null or (v_state ->> 'active')::boolean is not true
      or (v_state ->> 'reviewed')::boolean is not true
      or lower(v_state ->> 'appPlayerId') is distinct from lower(r ->> 'playerId') then
      raise exception using errcode = 'PT409', message = 'sofascore_performances_identity_not_reviewed',
        detail = 'sofascore:' || v_external; end if;
    if (r ->> 'teamId')::uuid not in (f.home_team_id, f.away_team_id)
      or not exists (select 1 from app.players pl where pl.id = (r ->> 'playerId')::uuid) then
      raise exception using errcode = 'PT409', message = 'sofascore_performances_row_invalid'; end if;
    foreach v_field in array array['minutes', 'goals', 'goalsConceded', 'cleanSheet', 'yellowCards',
        'redCards', 'secondYellowDismissals', 'ownGoals'] loop
      if r #>> array['evidence', v_field, 'state'] is distinct from 'verified'
        or r #> array['stats', v_field] is null then
        raise exception using errcode = 'PT409', message = 'sofascore_performances_core_unverified'; end if;
    end loop;
  end loop;
  v_count := jsonb_array_length(v_rows);
  v_version := 'sofascore-observation:' || o.digest;

  select count(*) into v_current from app.player_fixture_performances p
   where p.fixture_id = f.id and p.active and p.source_version = v_version;
  if v_current = v_count and not exists (select 1 from app.player_fixture_performances p
      where p.fixture_id = f.id and p.active and p.source_version <> v_version) then
    v_outcome := 'unchanged';
  else
    -- A newer observation replaces the rows of the older one: set inactive,
    -- not deleted, only ours.
    update app.player_fixture_performances set active = false
     where fixture_id = f.id and active and source_provider = 'sofascore' and source_version <> v_version;
    get diagnostics v_deactivated = row_count;
    insert into app.player_fixture_performances (
      football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
      started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves,
      penalties_saved, penalties_missed, yellow_cards, red_cards, second_yellow_dismissals,
      own_goals, provider_rating, active, provider_observed_at)
    select f.season_id, f.id, (e.value ->> 'playerId')::uuid, (e.value ->> 'teamId')::uuid, pl.position,
      'sofascore', v_version, (e.value ->> 'started')::boolean, true,
      (e.value #>> '{stats,minutes}')::integer, (e.value #>> '{stats,goals}')::integer,
      case when e.value #>> '{evidence,assists,state}' = 'verified'
        then (e.value #>> '{stats,assists}')::integer end,
      case when (e.value #>> '{stats,cleanSheet}')::boolean then 1 else 0 end,
      (e.value #>> '{stats,goalsConceded}')::integer,
      case when e.value #>> '{evidence,saves,state}' = 'verified'
        then (e.value #>> '{stats,saves}')::integer end,
      case when e.value #>> '{evidence,penaltiesSaved,state}' = 'verified'
        then (e.value #>> '{stats,penaltiesSaved}')::integer end,
      case when e.value #>> '{evidence,penaltiesMissed,state}' = 'verified'
        then (e.value #>> '{stats,penaltiesMissed}')::integer end,
      (e.value #>> '{stats,yellowCards}')::integer, (e.value #>> '{stats,redCards}')::integer,
      (e.value #>> '{stats,secondYellowDismissals}')::integer, (e.value #>> '{stats,ownGoals}')::integer,
      null, true, o.observed_at
    from jsonb_array_elements(v_rows) e(value)
    join app.players pl on pl.id = (e.value ->> 'playerId')::uuid
    on conflict on constraint player_fixture_performances_source_key do update set
      team_id = excluded.team_id, position = excluded.position, started = excluded.started,
      appeared = excluded.appeared, minutes = excluded.minutes, goals = excluded.goals,
      assists = excluded.assists, clean_sheets = excluded.clean_sheets,
      goals_conceded = excluded.goals_conceded, saves = excluded.saves,
      penalties_saved = excluded.penalties_saved, penalties_missed = excluded.penalties_missed,
      yellow_cards = excluded.yellow_cards, red_cards = excluded.red_cards,
      second_yellow_dismissals = excluded.second_yellow_dismissals, own_goals = excluded.own_goals,
      active = true, provider_observed_at = excluded.provider_observed_at;
    v_outcome := 'written';
  end if;

  -- The rating SofaScore gave in the same lineup reply, when the caller has it
  -- (display only; the rows never depend on it). Set or corrected, never cleared.
  if p_ratings is not null then
    update app.player_fixture_performances p set provider_rating = round((p_ratings ->> x.external_id)::numeric, 2)
      from (select (e.value ->> 'playerId')::uuid as player_id, e.value #>> '{identity,sofascoreId}' as external_id
              from jsonb_array_elements(v_rows) e(value)) x
     where p.fixture_id = f.id and p.active and p.source_version = v_version
       and p.player_id = x.player_id and p_ratings ? x.external_id
       and p.provider_rating is distinct from round((p_ratings ->> x.external_id)::numeric, 2);
    get diagnostics v_changed = row_count;
    if v_outcome = 'unchanged' and v_changed > 0 then v_outcome := 'rated'; end if;
  end if;

  return jsonb_build_object(
    'fixtureId', f.id, 'outcome', v_outcome, 'sourceVersion', v_version, 'rows', v_count,
    'replaced', v_deactivated, 'rated', v_changed, 'sofascoreEventId', v_event,
    'unknownFields', jsonb_build_object(
      'assists', (select count(*) from app.player_fixture_performances p
        where p.fixture_id = f.id and p.active and p.source_version = v_version and p.assists is null),
      'penaltiesMissed', (select count(*) from app.player_fixture_performances p
        where p.fixture_id = f.id and p.active and p.source_version = v_version and p.penalties_missed is null),
      'goalkeeperSaves', (select count(*) from app.player_fixture_performances p
        where p.fixture_id = f.id and p.active and p.source_version = v_version
          and p.position = 'goalkeeper' and p.saves is null)));
end $$;
revoke all on function app_private.sofascore_sync_fixture_performances(uuid, jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The service function. With a fixture: that fixture, refusing loudly. With
--    none: up to p_limit fixtures that need it (newest first), each in its own
--    subtransaction, so one refusal never blocks another; a refusal is reported,
--    not raised. p_ratings (SofaScore ids to ratings) is for one fixture only.
-- ---------------------------------------------------------------------------
create function api.service_sync_sofascore_player_performances(
  p_fixture_id uuid default null, p_limit integer default 20, p_ratings jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_one jsonb;
  v_results jsonb := '[]'::jsonb;
  v_label text;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode = 'PT400', message = 'sofascore_performances_invalid'; end if;
  if p_ratings is not null then
    if p_fixture_id is null or jsonb_typeof(p_ratings) is distinct from 'object' then
      raise exception using errcode = 'PT400', message = 'sofascore_performances_invalid'; end if;
    if (select count(*) from jsonb_each(p_ratings)) > 120
      or exists (select 1 from jsonb_each(p_ratings) e
        where char_length(e.key) not between 1 and 200 or jsonb_typeof(e.value) <> 'number'
          or case when jsonb_typeof(e.value) = 'number' then (e.value #>> '{}')::numeric not between 0 and 10
                  else true end) then
      raise exception using errcode = 'PT400', message = 'sofascore_performances_invalid'; end if;
  end if;

  if p_fixture_id is not null then
    return jsonb_build_object('results',
      jsonb_build_array(app_private.sofascore_sync_fixture_performances(p_fixture_id, p_ratings)));
  end if;

  for v_id in
    select f.id
      from app.fixtures f
      join lateral (select x.* from app_private.fantasy_fixture_observations x
                     where x.fixture_id = f.id order by x.observed_at desc, x.id desc limit 1) o on true
     where f.status = 'finished' and f.finalized_at is not null
       and o.source = 'provider-reconciled' and o.payload #>> '{sourceRefs,sofascoreEventId}' is not null
       and not exists (select 1 from app.player_fixture_performances p
            where p.fixture_id = f.id and p.active and p.source_provider is distinct from 'sofascore')
       and not exists (select 1 from app.player_fixture_performances p
            where p.fixture_id = f.id and p.active and p.source_version = 'sofascore-observation:' || o.digest)
     order by o.observed_at desc, f.id
     limit p_limit
  loop
    begin
      v_one := app_private.sofascore_sync_fixture_performances(v_id, null);
    exception when others then
      get stacked diagnostics v_label = message_text;
      v_one := jsonb_build_object('fixtureId', v_id, 'outcome', 'refused',
        'reason', case when v_label ~ '^sofascore_performances_[a-z_]{1,60}$' then v_label else 'database_error' end);
    end;
    v_results := v_results || jsonb_build_array(v_one);
  end loop;
  return jsonb_build_object('results', v_results);
end $$;
revoke all on function api.service_sync_sofascore_player_performances(uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function api.service_sync_sofascore_player_performances(uuid, integer, jsonb) to service_role;
