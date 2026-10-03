-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260928090000_matches_by_date_explicit_utc_bounds: the matches-by-day function
-- accepts the day's exact start and end in UTC, so the day a kickoff belongs to
-- no longer depends on the database's own time-zone data (pull request #279).
--
-- WHEN
--   BEFORE the website that sends the new arguments is published (database
--   first, docs/operations/DEPLOYMENT.md). Any quiet moment; not at minute 12 of
--   an hour (the Fantasy season orchestrator). It replaces one read function and
--   touches no table, so no scheduled job needs pausing and nothing is locked
--   for writers. A match page loaded during the few milliseconds of the swap
--   simply gets the old or the new answer, never an error.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
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
--   * refuses to run twice, or where api.football_matches_by_date is not the
--     version this replaces (the nine-argument version of 20260924200300, byte
--     for byte as production held it, measured read-only on 2026-10-01), or
--     where the time-zone validator of 20260924200300 is missing;
--   * reads one old finished day with the old function and keeps its
--     fingerprint;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result: one function remains (eleven arguments), visitors may
--     still call it, the old way (a date and a zone) gives the same answer as
--     before, the new way (exact bounds) gives that same answer for the same
--     day, a time-zone name is not even looked up when bounds are given, and
--     bad bounds are refused.
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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260928090000') then
    raise exception 'stop: migration 20260928090000 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260924200300') then
    raise exception 'stop: migration 20260924200300 (timezone validation) is not applied yet -- this update follows it';
  end if;
  if to_regprocedure('app_private.is_valid_timezone(text)') is null then
    raise exception 'stop: app_private.is_valid_timezone is missing';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'api' and p.proname = 'football_matches_by_date') <> 1
    or to_regprocedure('api.football_matches_by_date(date,text,text,text[],uuid,uuid,timestamptz,uuid,integer)') is null then
    raise exception 'stop: api.football_matches_by_date is not the single nine-argument version this update replaces';
  end if;
  if md5(pg_get_functiondef(
      'api.football_matches_by_date(date,text,text,text[],uuid,uuid,timestamptz,uuid,integer)'::regprocedure))
    <> '233ccaaa12555046280d3fa468c87c08' then
    raise exception 'stop: api.football_matches_by_date is not the version this update replaces (20260924200300)';
  end if;
end
$preflight$;

-- An old finished day (before the clock change of 2026-09-20, so both ways of
-- working out the day agree), read with the old function and fingerprinted.
select set_config(
  'botolago.probe_day',
  coalesce((
    select to_char((max(kickoff_at) at time zone 'Africa/Casablanca')::date, 'YYYY-MM-DD')
    from app.fixtures
    where status = 'finished' and kickoff_at < timestamptz '2026-09-15 00:00:00+00'
  ), ''),
  true
);
select set_config(
  'botolago.before',
  md5(api.football_matches_by_date(
    nullif(current_setting('botolago.probe_day', true), '')::date, 'fr', 'Africa/Casablanca',
    null, null, null, null, null, 100)::text),
  true
)
where nullif(current_setting('botolago.probe_day', true), '') is not null;

-- ---------------------------------------------------------------------------
-- Migration 20260928090000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260928090000',
  'matches_by_date_explicit_utc_bounds',
  array[$bg_20260928090000_file$-- Day filter: the app sends the day's exact start and end, in UTC.
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
$bg_20260928090000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260928090000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260928090000'
  );
begin
  if encode(sha256(convert_to(part_20260928090000, 'UTF8')), 'hex')
    is distinct from '261150343a690c597f8b38724bdf8bd76e12871b6be5388949fb516709cae19b' then
    raise exception 'stop: 20260928090000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260928090000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  new_signature constant regprocedure :=
    'api.football_matches_by_date(date,text,text,text[],uuid,uuid,timestamptz,uuid,integer,timestamptz,timestamptz)'::regprocedure;
  probe date := nullif(current_setting('botolago.probe_day', true), '')::date;
  before_fingerprint text := current_setting('botolago.before', true);
  by_date jsonb;
  by_bounds jsonb;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'api' and p.proname = 'football_matches_by_date') <> 1 then
    problems := problems || 'there is not exactly one football_matches_by_date left'::text;
  end if;
  if not has_function_privilege('anon', new_signature, 'execute')
    or not has_function_privilege('authenticated', new_signature, 'execute')
    or not has_function_privilege('service_role', new_signature, 'execute') then
    problems := problems || 'visitors can no longer call the matches-by-day function'::text;
  end if;
  if has_function_privilege('public', new_signature, 'execute') then
    problems := problems || 'PUBLIC can execute the function directly'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260928090000') then
    problems := problems || 'history row missing'::text;
  end if;

  if probe is not null then
    -- The old way, a date and a zone: same answer as before.
    by_date := api.football_matches_by_date(probe, 'fr', 'Africa/Casablanca', null, null, null, null, null, 100);
    if md5(by_date::text) is distinct from before_fingerprint then
      problems := problems || 'the date-and-zone way no longer gives the answer it gave before'::text;
    end if;
    -- The new way, the same day's exact bounds: same answer again.
    by_bounds := api.football_matches_by_date(
      probe, 'fr', 'Africa/Casablanca', null, null, null, null, null, 100,
      probe::timestamp at time zone 'Africa/Casablanca',
      (probe + 1)::timestamp at time zone 'Africa/Casablanca');
    if md5(by_bounds::text) is distinct from before_fingerprint then
      problems := problems || 'exact bounds do not give the same answer as the date and zone'::text;
    end if;
  end if;

  -- With bounds, the zone name is not looked up at all.
  begin
    perform api.football_matches_by_date(
      current_date, 'fr', 'Mars/Olympus_Mons', null, null, null, null, null, 1,
      timestamptz '2030-01-02 00:00:00+00', timestamptz '2030-01-03 00:00:00+00');
  exception when others then
    problems := problems || ('bounds with an unknown zone name were refused: ' || sqlerrm);
  end;
  -- Without bounds, an unknown zone is still refused.
  begin
    perform api.football_matches_by_date(current_date, 'fr', 'Mars/Olympus_Mons');
    problems := problems || 'an unknown zone name was accepted without bounds'::text;
  exception when sqlstate '22023' then null;
  end;
  -- Bad bounds are refused: a start alone, an end before the start, a window over a day.
  begin
    perform api.football_matches_by_date(current_date, p_range_start => timestamptz '2030-01-02 00:00:00+00');
    problems := problems || 'a start without an end was accepted'::text;
  exception when sqlstate '22023' then null;
  end;
  begin
    perform api.football_matches_by_date(current_date,
      p_range_start => timestamptz '2030-01-03 00:00:00+00', p_range_end => timestamptz '2030-01-02 00:00:00+00');
    problems := problems || 'an end before the start was accepted'::text;
  exception when sqlstate '22023' then null;
  end;
  begin
    perform api.football_matches_by_date(current_date,
      p_range_start => timestamptz '2030-01-01 00:00:00+00', p_range_end => timestamptz '2030-01-05 00:00:00+00');
    problems := problems || 'a window longer than a day was accepted'::text;
  exception when sqlstate '22023' then null;
  end;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'matches-by-day: one function, same answer both ways for % (% matches)',
    coalesce(probe::text, 'no old finished day found'), coalesce(jsonb_array_length(by_date -> 'items'), 0);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260928090000')
    then 'Applied. Publish the website next (database first).'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
