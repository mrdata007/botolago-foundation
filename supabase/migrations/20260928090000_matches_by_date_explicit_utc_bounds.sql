-- Day filter: the app sends the day's exact start and end, in UTC.
--
-- `api.football_matches_by_date` worked out "which day is this kickoff on" from
-- a date plus a zone name, using the database's own time-zone data. Morocco's
-- clock changed (permanent UTC+0 from 2026-09-20T01:00:00Z) and database
-- time-zone data is only as new as its last update, so the same date could
-- mean a different 24 hours depending on which server answered. A kickoff
-- between 23:00 and 24:00 UTC lands on the wrong day under the old rule.
--
-- The app owns Morocco's rule (src/lib/morocco-time.ts). It now sends the
-- exact start and end of the day it means, as UTC instants, and the database
-- only compares instants. The date and zone arguments stay for callers that
-- have not moved yet; when the bounds are given they win and the zone is not
-- looked up at all.

drop function if exists api.football_matches_by_date(
  date, text, text, text[], uuid, uuid, timestamptz, uuid, integer
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
  p_limit integer default 50,
  p_range_start timestamptz default null,
  p_range_end timestamptz default null
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
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_LIMIT';
  end if;
  if (p_after_kickoff is null) <> (p_after_id is null) then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_CURSOR';
  end if;
  if (p_range_start is null) <> (p_range_end is null) then
    raise exception using errcode = '22023', message = 'INVALID_DAY_BOUNDS';
  end if;
  if p_range_start is not null
     and (p_range_end <= p_range_start or p_range_end - p_range_start > interval '26 hours') then
    raise exception using errcode = '22023', message = 'INVALID_DAY_BOUNDS';
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

  if p_range_start is not null then
    range_start := p_range_start;
    range_end := p_range_end;
  else
    if not app_private.is_valid_timezone(p_timezone) then
      raise exception using errcode = '22023', message = 'INVALID_TIMEZONE';
    end if;
    range_start := p_date::timestamp at time zone p_timezone;
    range_end := (p_date + 1)::timestamp at time zone p_timezone;
  end if;

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
  date, text, text, text[], uuid, uuid, timestamptz, uuid, integer, timestamptz, timestamptz
) from public;
grant execute on function api.football_matches_by_date(
  date, text, text, text[], uuid, uuid, timestamptz, uuid, integer, timestamptz, timestamptz
) to anon, authenticated, service_role;
