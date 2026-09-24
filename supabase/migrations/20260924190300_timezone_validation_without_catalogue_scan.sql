-- Timezone validation without scanning the timezone catalogue.
--
-- `api.football_matches_by_date` (the /matches page, the most expensive
-- statement in the database per the 2026-09-24 audit) checked its timezone
-- with `exists (select 1 from pg_catalog.pg_timezone_names where name = ...)`.
-- pg_timezone_names is a set-returning function that opens and parses every
-- zone file on every call; nothing is pushed down into it. Measured on
-- production, 2026-09-24 ~19:00Z, idle:
--
--   exists(... pg_timezone_names where name = 'Africa/Casablanca')  1,244 ms
--   now() at time zone 'Africa/Casablanca'                              7 ms (first call; cached after)
--   api.football_matches_by_date(today, 'fr', 'Africa/Casablanca', 20) 1,025 ms, almost all of it the scan
--
-- Under the anon role's 3 s statement timeout that one line turned modest
-- traffic into HTTP 500s. The same scan guards notification quiet hours in
-- app_private.assert_valid_timezone. Those are the only two functions in
-- api/app/app_private whose body mentions pg_timezone_names (checked on
-- production), and both bodies were verified identical to production (md5
-- of pg_get_functiondef) before this migration was written.
--
-- The replacement reads the same names from a snapshot taken when this
-- migration runs (an indexed lookup), so every name accepted before is
-- accepted now and every name refused before is refused now. A zone that a
-- later tzdata update adds is not in the snapshot; it is accepted when it is
-- an Area/Location name Postgres can resolve. That fallback deliberately
-- excludes bare abbreviations (`PST`) and POSIX offsets (`UTC+3`), which
-- Postgres would also resolve but the catalogue never listed.

create table app_private.timezone_names (
  name text primary key
);
comment on table app_private.timezone_names is
  'Snapshot of pg_timezone_names taken by migration 20260924190300; read by app_private.is_valid_timezone instead of scanning the catalogue per request.';
alter table app_private.timezone_names enable row level security;
alter table app_private.timezone_names force row level security;
revoke all on app_private.timezone_names from public, anon, authenticated, service_role;

insert into app_private.timezone_names (name)
select name from pg_catalog.pg_timezone_names
on conflict (name) do nothing;

create or replace function app_private.is_valid_timezone(p_timezone text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_timezone is null or length(p_timezone) > 64 then
    return false;
  end if;
  if exists (select 1 from app_private.timezone_names where name = p_timezone) then
    return true;
  end if;
  -- Not in the snapshot: only a zone added by a later tzdata update can
  -- qualify, and those are always Area/Location names.
  if p_timezone !~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){1,3}$' then
    return false;
  end if;
  begin
    perform pg_catalog.now() at time zone p_timezone;
  exception when invalid_parameter_value then
    return false;
  end;
  return true;
end;
$$;
revoke all on function app_private.is_valid_timezone(text) from public, anon, authenticated, service_role;
comment on function app_private.is_valid_timezone(text) is
  'True for a time-zone name in pg_timezone_names (snapshot), or an Area/Location zone Postgres resolves. Replaces a per-call pg_timezone_names scan.';

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
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_LIMIT';
  end if;
  if (p_after_kickoff is null) <> (p_after_id is null) then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_CURSOR';
  end if;
  if not app_private.is_valid_timezone(p_timezone) then
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

create or replace function app_private.assert_valid_timezone(target_timezone text)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not app_private.is_valid_timezone(target_timezone) then
    raise exception using errcode = '22023', message = 'quiet_hours_invalid';
  end if;
end;
$$;
