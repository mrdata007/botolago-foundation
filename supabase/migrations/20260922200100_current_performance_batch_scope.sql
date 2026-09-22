-- Current-season statistics: only fetch fixtures that can still score.
--
-- `api.football_current_performance_fixture_batch` paged through EVERY finished
-- fixture of the season in provider-id order, including fixtures already
-- ingested and scored. The hourly orchestrator reads at most 10 pages of 5 and
-- restarts at a null cursor on every pass, so it only ever reached the first
-- 50 finished fixtures. With 8 fixtures a gameweek that is about six
-- gameweeks; from then on a newly finished fixture would never get
-- statistics, and once fixtures are finalized (20260922200000) its gameweek
-- would move to provisional and fail with fantasy_scoring_coverage_incomplete.
--
-- The page now leaves out fixtures whose current Fantasy gameweek is
-- finalized (or corrected): their statistics can no longer change a score,
-- because a sealed gameweek refuses new results. Everything else is
-- unchanged -- provider-id order, the cursor, the page size, the validation
-- and the grants -- so the callers need no change. Fixtures in a gameweek
-- that is still open, live or provisional are re-read every pass as before,
-- which is how a provider correction before the seal is picked up.
--
-- Read-only function; no table, row or data change.

create or replace function api.football_current_performance_fixture_batch(
  p_provider_name text,
  p_season_external_id text,
  p_after_fixture_external_id text default null,
  p_limit integer default 5
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  target_season_id uuid;
  result jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = '42501', message = 'football_service_role_required';
  end if;
  if p_provider_name is distinct from 'sportsmonks' or p_season_external_id is distinct from '28647'
    or p_limit is null or p_limit not between 1 and 10
    or (p_after_fixture_external_id is not null and p_after_fixture_external_id !~ '^[1-9][0-9]{0,14}$')
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  select season.id into target_season_id
  from app_private.football_provider_mappings mapping
  join app.seasons season on season.id = mapping.internal_entity_id
  join app_private.football_provider_mappings competition
    on competition.provider_name = p_provider_name and competition.entity_type = 'competition'
    and competition.external_id = '860' and competition.internal_entity_id = season.competition_id and competition.active
  where mapping.provider_name = p_provider_name and mapping.entity_type = 'season'
    and mapping.external_id = p_season_external_id and mapping.active
    and season.is_current and season.label = '2026/2027' and season.status in ('planned', 'active');
  if not found then
    raise exception using errcode = '22023', message = 'CURRENT_SEASON_REQUIRED';
  end if;
  with scope as (
    select mapping.external_id, fixture.kickoff_at
    from app.fixtures fixture
    join app_private.football_provider_mappings mapping
      on mapping.provider_name = p_provider_name and mapping.entity_type = 'fixture'
      and mapping.internal_entity_id = fixture.id and mapping.active
    where fixture.season_id = target_season_id and fixture.status = 'finished'
      and fixture.kickoff_at <= statement_timestamp()
      and mapping.external_id ~ '^[1-9][0-9]{0,14}$'
      and (p_after_fixture_external_id is null or mapping.external_id::bigint > p_after_fixture_external_id::bigint)
      -- A fixture whose Fantasy gameweek is already final can no longer move
      -- a score, so it is not re-fetched. Without this every hourly pass
      -- (at most 10 pages of 5, cursor restarting at null) re-read the same
      -- first 50 finished fixtures of the season, and from roughly the
      -- seventh gameweek a newly finished fixture was never reached.
      and not exists (
        select 1
        from app.fantasy_fixture_assignments assignment
        join app.fantasy_gameweeks gameweek on gameweek.id = assignment.gameweek_id
        where assignment.fixture_id = fixture.id
          and assignment.superseded_at is null
          and gameweek.status in ('finalized', 'corrected')
      )
  ), selected as (
    select * from scope order by external_id::bigint limit p_limit + 1
  ), page as (
    select * from selected order by external_id::bigint limit p_limit
  )
  select jsonb_build_object(
    'seasonExternalId', p_season_external_id,
    'items', coalesce(jsonb_agg(jsonb_build_object('externalFixtureId', external_id, 'kickoffAt', kickoff_at)
      order by external_id::bigint), '[]'::jsonb),
    'hasMore', (select count(*) from selected) > p_limit,
    'nextCursor', case when (select count(*) from selected) > p_limit
      then (select external_id from page order by external_id::bigint desc limit 1) else null end
  ) into result from page;
  return result;
end;
$$;

revoke all on function api.football_current_performance_fixture_batch(text, text, text, integer) from public, anon, authenticated;
grant execute on function api.football_current_performance_fixture_batch(text, text, text, integer) to service_role;
