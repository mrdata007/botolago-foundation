-- BotolaGO — season-aware match browsing.
--
-- Exposes a narrow season catalog DTO and adds an optional season constraint
-- to the date-based match read model. Canonical football tables remain hidden.

create or replace function api.football_season_catalog(
  p_language text default 'fr',
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform app_private.football_language(p_language);
  if p_limit not between 1 and 20 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_LIMIT';
  end if;

  with season_rows as (
    select
      season.id,
      season.competition_id,
      season.label,
      season.starts_on,
      season.ends_on,
      season.status,
      season.is_current,
      fixture_range.first_match_date,
      fixture_range.last_match_date
    from app.seasons season
    join app.competitions competition on competition.id = season.competition_id
    left join lateral (
      select
        min((fixture.kickoff_at at time zone 'Africa/Casablanca')::date) as first_match_date,
        max((fixture.kickoff_at at time zone 'Africa/Casablanca')::date) as last_match_date
      from app.fixtures fixture
      where fixture.season_id = season.id
    ) fixture_range on true
    where competition.active
      and (season.is_current or fixture_range.first_match_date is not null)
    order by season.is_current desc, season.starts_on desc, season.id
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', season_rows.id,
    'competition', app_private.football_competition_json(season_rows.competition_id, p_language),
    'label', season_rows.label,
    'startsOn', season_rows.starts_on,
    'endsOn', season_rows.ends_on,
    'status', season_rows.status,
    'isCurrent', season_rows.is_current,
    'firstMatchDate', season_rows.first_match_date,
    'lastMatchDate', season_rows.last_match_date
  ) order by season_rows.is_current desc, season_rows.starts_on desc, season_rows.id), '[]'::jsonb)
  into result
  from season_rows;

  return result;
end;
$$;

revoke all on function api.football_season_catalog(text, integer) from public;
grant execute on function api.football_season_catalog(text, integer)
  to anon, authenticated, service_role;

drop function if exists api.football_matches_by_date(
  date, text, text, text[], uuid, timestamptz, uuid, integer
);

create or replace function api.football_matches_by_date(
  p_date date,
  p_language text default 'fr',
  p_timezone text default 'Africa/Casablanca',
  p_statuses text[] default null,
  p_competition_id uuid default null,
  p_season_id uuid default null,
  p_after_kickoff timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  range_start timestamptz;
  range_end timestamptz;
  result jsonb;
begin
  perform app_private.football_language(p_language);
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_LIMIT';
  end if;
  if (p_after_kickoff is null) <> (p_after_id is null) then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_CURSOR';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception using errcode = '22023', message = 'INVALID_TIMEZONE';
  end if;
  if p_statuses is not null and exists (
    select 1 from unnest(p_statuses) requested
    where requested not in (
      'scheduled', 'not_started', 'live_first_half', 'half_time',
      'live_second_half', 'extra_time', 'penalties', 'finished',
      'postponed', 'cancelled', 'suspended', 'delayed', 'abandoned'
    )
  ) then
    raise exception using errcode = '22023', message = 'INVALID_FIXTURE_STATUS';
  end if;

  range_start := p_date::timestamp at time zone p_timezone;
  range_end := (p_date + 1)::timestamp at time zone p_timezone;

  with candidates as (
    select fixture.id, fixture.kickoff_at
    from app.fixtures fixture
    where fixture.kickoff_at >= range_start
      and fixture.kickoff_at < range_end
      and (p_competition_id is null or fixture.competition_id = p_competition_id)
      and (p_season_id is null or fixture.season_id = p_season_id)
      and (p_statuses is null or fixture.status::text = any(p_statuses))
      and (
        p_after_kickoff is null
        or (fixture.kickoff_at, fixture.id) > (p_after_kickoff, p_after_id)
      )
    order by fixture.kickoff_at, fixture.id
    limit p_limit + 1
  ), page as (
    select * from candidates order by kickoff_at, id limit p_limit
  ), page_json as (
    select coalesce(
      jsonb_agg(app_private.football_match_json(page.id, p_language) order by page.kickoff_at, page.id),
      '[]'::jsonb
    ) items
    from page
  ), cursor_json as (
    select case when (select count(*) from candidates) > p_limit then
      (select jsonb_build_object('kickoffAt', page.kickoff_at, 'id', page.id)
       from page order by page.kickoff_at desc, page.id desc limit 1)
    else null end next_cursor
  )
  select jsonb_build_object('items', page_json.items, 'nextCursor', cursor_json.next_cursor)
  into result from page_json cross join cursor_json;

  return result;
end;
$$;

revoke all on function api.football_matches_by_date(
  date, text, text, text[], uuid, uuid, timestamptz, uuid, integer
) from public;
grant execute on function api.football_matches_by_date(
  date, text, text, text[], uuid, uuid, timestamptz, uuid, integer
) to anon, authenticated, service_role;
