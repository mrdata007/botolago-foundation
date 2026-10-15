-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261016090400_morocco_time_read_models
-- (Morocco's clock in the database; docs/engineering/MOROCCO_TIME_IN_THE_DATABASE.md):
-- Three reads follow Morocco's clock. It replaces THREE functions, each with only the zone
-- expressions changed: api.football_season_catalog (the season's first and last match DATE),
-- api.admin_get_analytics_overview ("today", the 30-day window and the sign-ups per day) and
-- api.football_matches_by_date (the day's bounds when a caller sends a date and a zone name
-- instead of exact bounds). Before: a 23:00-24:00 UTC kick-off or sign-up fell on the next day.
-- These are cosmetic; none can make anyone miss anything.
--
-- THE RULE. Morocco is UTC+0 all year from 2026-09-20T01:00:00Z (decree n° 2.26.530; IANA tz 2026c),
-- confirmed by the owner on 2026-10-15. The application already follows it
-- (src/lib/morocco-time.ts); this database still carries older time-zone data (UTC+1), so a
-- time the database turns into Moroccan clock time is an hour off from what the person sees.
--
-- WHEN
--   After 20261016090000 (the helpers) is committed. Any time of day; well under a second.
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   Nothing needs pausing: the script only replaces the definition of three functions (pg_proc) and
--   records itself in supabase_migrations.schema_migrations. It writes no table. No cron job
--   calls these reads (they are called by the website and the admin screen). A call already
--   running finishes on the old text. Still make sure no other schema change is running right
--   now. The script compares the cron job list before and after and stops if it moved.
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address contains
--      tkewgajrljbwgwedqsxn; the database holds no project name this script could check, so look
--      at the address) -> SQL Editor -> New query. Read-only pre-checks and post-checks:
--      docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one transaction, checked, and
--      then ROLLED BACK. The result row should say "Rehearsal passed".
--   2. Change the line `rollback;` near the bottom to `commit;` and press Run again. The result
--      row should say "Applied".
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects. Send the message.
--
-- WHAT IT DOES
--   * refuses to run twice, before the helpers are recorded and working, and where any of the
--     three functions is not byte for byte the text the repository's latest migration defines
--     (md5 of its source), changed attributes, or has other privileges than the reviewed ones
--     (season catalog and matches by date: anon, authenticated and service_role; analytics:
--     authenticated only);
--   * records the migration file in supabase_migrations.schema_migrations and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: each source is the new one with no raw zone
--     expression left; attributes, privileges and comments are unchanged; the season catalog and
--     the matches-by-date read answer (jsonb, no error); the cron job list is where it was. It
--     does not call the analytics read (it needs a signed-in administrator).
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  fn record;
  def record;
  held text[];
  absent text;
  present text;
  baseline text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090400') then
    raise exception 'stop: migration 20261016090400 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090000') then
    raise exception 'stop: 20261016090000 (the Morocco clock helpers) is not recorded -- apply scripts/backend/apply-20261016090000-morocco-time-helpers.sql (committed) first';
  end if;
  -- The helpers are the reviewed ones and answer the application's rule.
  for fn in
    select * from (values
      ('app_private.morocco_permanent_utc_from()', '0121c9157d7d1ff8b631505346c93e8d', 'i'),
      ('app_private.morocco_time_zone_label()', '56f77cbfc332de897228af318427ec73', 'i'),
      ('app_private.morocco_zone_name(timestamp with time zone)', '46d83167cae2e309865addebb8149388', 's'),
      ('app_private.morocco_local(timestamp with time zone)', '2a14d329a546ae4d825a47ae59c184db', 's'),
      ('app_private.morocco_local_date(timestamp with time zone)', 'f506550098a22ea140b464a920c4b53f', 's'),
      ('app_private.morocco_instant(timestamp without time zone)', 'd4876d382d725001a00ec4a5764ea259', 's'),
      ('app_private.morocco_day_start(date)', '01999ac07dbfb139ee662e802ff1d128', 's'),
      ('app_private.morocco_day_end(date)', '6dca44b43ff8863b21ee8bf0052b117b', 's'),
      ('app_private.zone_local(timestamp with time zone,text)', 'd05aeb2e6d7ecccdddc80b0d474f7a2b', 's'),
      ('app_private.zone_instant(timestamp without time zone,text)', '5aff74a376f56524ed8576282086bf1e', 's')
    ) v(sig, md5_src, vol)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig into def
    from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      raise exception 'stop: helper % does not exist -- apply the helpers first', fn.sig;
    end if;
    if md5(def.prosrc) <> fn.md5_src or def.prosecdef or def.provolatile <> fn.vol
      or def.proconfig is distinct from array['search_path=""'] then
      raise exception 'stop: helper % is not the reviewed one', fn.sig;
    end if;
  end loop;

  if app_private.morocco_local(timestamptz '2026-10-15 12:00+00') is distinct from timestamp '2026-10-15 12:00:00'
    or app_private.morocco_local(timestamptz '2026-09-20 00:59:59+00') is distinct from timestamp '2026-09-20 01:59:59'
    or app_private.morocco_local(timestamptz '2026-09-20 01:00:00+00') is distinct from timestamp '2026-09-20 01:00:00'
    or app_private.morocco_local(timestamptz '2026-03-10 12:00+00') is distinct from timestamp '2026-03-10 12:00:00'
    or app_private.morocco_local(timestamptz '2026-01-15 12:00+00') is distinct from timestamp '2026-01-15 13:00:00'
    or app_private.morocco_local(timestamptz '2027-02-10 12:00+00') is distinct from timestamp '2027-02-10 12:00:00' then
    raise exception 'stop: the Morocco clock helpers do not give the application''s answers';
  end if;
  if app_private.morocco_instant(timestamp '2026-10-15 12:00') is distinct from timestamptz '2026-10-15 12:00+00'
    or app_private.morocco_instant(timestamp '2026-09-20 00:30') is distinct from timestamptz '2026-09-19 23:30+00'
    or app_private.morocco_day_start(date '2026-09-20') is distinct from timestamptz '2026-09-19 23:00+00'
    or app_private.morocco_day_end(date '2026-09-20') is distinct from timestamptz '2026-09-21 00:00+00'
    or app_private.morocco_local_date(timestamptz '2026-10-15 23:30+00') is distinct from date '2026-10-15' then
    raise exception 'stop: the Morocco day helpers do not give the application''s answers';
  end if;
  if app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca') is distinct from timestamp '2026-10-12 18:30:00'
    or app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Europe/Paris') is distinct from timestamp '2026-10-12 20:30:00'
    or app_private.zone_instant(timestamp '2026-10-12 20:00', 'Europe/Paris') is distinct from timestamptz '2026-10-12 18:00+00' then
    raise exception 'stop: the zone helpers do not give the expected answers';
  end if;
  -- Each function this update replaces is exactly what the repository's latest migration defines.
  for fn in
    select * from (values
      ('api.football_season_catalog(text,integer)', 'fb6e63989ea528c2f2c545504db68aa2', '0952f4f683e9da8f05402f70e33682ae', true, 's', 'plpgsql', true, array['anon', 'authenticated', 'service_role']),
      ('api.admin_get_analytics_overview()', 'c407900da607060a1b268f451c4a3bfb', '83a77d2229b24260ca4e176b44ce1b00', true, 's', 'plpgsql', true, array['authenticated']),
      ('api.football_matches_by_date(date,text,text,text[],uuid,uuid,timestamp with time zone,uuid,integer,timestamp with time zone,timestamp with time zone)', 'cb8a1904e5ee38ded3e9ad2224ef3889', '64b4f711d3ea9978cb41051c22a896b2', true, 's', 'plpgsql', true, array['anon', 'authenticated', 'service_role'])
    ) v(sig, old_md5, new_md5, secdef, vol, lang, search_path_empty, holders)
  loop
    select p.oid, p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.proacl, p.proowner, l.lanname into def
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      raise exception 'stop: % does not exist on this database', fn.sig;
    end if;
    if md5(def.prosrc) = fn.new_md5 then
      raise exception 'stop: % already has the new text -- was this applied by another route?', fn.sig;
    end if;
    if md5(def.prosrc) <> fn.old_md5 then
      raise exception 'stop: % is not the version this update replaces (md5 %, expected %)', fn.sig, md5(def.prosrc), fn.old_md5;
    end if;
    if def.prosecdef <> fn.secdef or def.provolatile <> fn.vol or def.lanname <> fn.lang
      or (def.proconfig is not distinct from array['search_path=""']) <> fn.search_path_empty then
      raise exception 'stop: % has attributes other than the reviewed ones (security, volatility, language, search_path)', fn.sig;
    end if;
    select coalesce(array_agg(distinct r.name order by r.name), '{}') into held
    from (
      select case when a.grantee = 0 then 'public' else (select rolname from pg_catalog.pg_roles where oid = a.grantee) end as name
      from aclexplode(coalesce(def.proacl, acldefault('f', def.proowner))) a
      where a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or a.grantee in (select oid from pg_catalog.pg_roles where rolname in ('anon', 'authenticated', 'service_role')))
    ) r;
    if held is distinct from fn.holders then
      raise exception 'stop: % is executable by % -- expected %', fn.sig, held, fn.holders;
    end if;
  end loop;

  -- What the new text calls must exist (other than the helpers, checked above).
  select string_agg(v.name, ', ' order by v.name) into absent
  from (values
    ('app_private.admin_assert_permission'),
    ('app_private.football_competition_json'),
    ('app_private.football_language'),
    ('app_private.football_match_json'),
    ('app_private.is_valid_timezone')
  ) v(name)
  where not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname || '.' || p.proname = v.name);
  if absent is not null then
    raise exception 'stop: the database is missing functions this update calls: %', absent;
  end if;

  -- Baseline: the cron job list, the privileges and comments of the functions.
  select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), '')) into baseline
  from cron.job j;
  perform set_config('bg.morocco_cron_before', baseline, true);
  select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, '-') || ':' || coalesce(obj_description(p.oid, 'pg_proc'), '-'), ',' order by p.oid::regprocedure::text), '')) into baseline
  from pg_catalog.pg_proc p
  where p.oid in (to_regprocedure('api.football_season_catalog(text,integer)'), to_regprocedure('api.admin_get_analytics_overview()'), to_regprocedure('api.football_matches_by_date(date,text,text,text[],uuid,uuid,timestamp with time zone,uuid,integer,timestamp with time zone,timestamp with time zone)'));
  perform set_config('bg.morocco_acl_comment_before', baseline, true);

end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261016090400, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261016090400',
  'morocco_time_read_models',
  array[$bg_20261016090400_file$-- Three reads follow Morocco's clock.
--
-- WHAT WAS WRONG. Three api functions used the database's own `Africa/Casablanca`
-- data, which still say UTC+1 after 2026-09-20 (the app's rule is UTC+0 from
-- 2026-09-20T01:00:00Z, 20261016090000):
--   * api.football_season_catalog: a season's first and last match DATE. A
--     kick-off between 23:00 and 24:00 UTC was dated the next day. The date feeds
--     the default day of the matches screen.
--   * api.admin_get_analytics_overview: "today", the 30-day window and the
--     sign-ups per day were cut at 23:00 Moroccan time.
--   * api.football_matches_by_date: the day's bounds when the caller sends a date
--     and a zone name instead of exact bounds (20260928090000 made the app send
--     bounds; an older client, or any other caller, still sends the date).
-- None of them can make a person miss anything; they are the same drift on a
-- smaller scale, and are fixed so that no database function uses the old data
-- for Morocco.
--
-- WHAT THIS CHANGES. Three functions, each the latest definition with only the
-- zone expressions replaced by the helpers of 20261016090000. The zone label the
-- analytics read returns ('timeZone') is unchanged. api.football_matches_by_date
-- keeps its signature and `p_timezone` default; any zone other than
-- Africa/Casablanca is still PostgreSQL's own answer.
--
-- Depends on 20261016090000 (the helpers).

do $$
begin
  if to_regprocedure('app_private.morocco_local_date(timestamp with time zone)') is null
    or to_regprocedure('app_private.morocco_day_start(date)') is null
    or to_regprocedure('app_private.zone_instant(timestamp without time zone, text)') is null
    or to_regprocedure('app_private.morocco_time_zone_label()') is null then
    raise exception 'morocco_time_helpers_missing: apply 20261016090000 first';
  end if;
end $$;

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
  if p_limit is null or p_limit not between 1 and 20 then
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
        min(app_private.morocco_local_date(fixture.kickoff_at)) as first_match_date,
        max(app_private.morocco_local_date(fixture.kickoff_at)) as last_match_date
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

create or replace function api.admin_get_analytics_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  observed_at timestamptz := statement_timestamp();
  local_today date := app_private.morocco_local_date(statement_timestamp());
  today_start timestamptz;
  tomorrow_start timestamptz;
  window_start timestamptz;
begin
  perform app_private.admin_assert_permission('analytics.read', false);

  -- Midnights in Morocco, computed per day rather than by adding 24 hours: the
  -- Ramadan clock change makes some Moroccan days 23 or 25 hours long.
  today_start := app_private.morocco_day_start(local_today);
  tomorrow_start := app_private.morocco_day_start(local_today + 1);
  window_start := app_private.morocco_day_start(local_today - 29);

  return jsonb_build_object(
    'generatedAt', observed_at,
    'timeZone', app_private.morocco_time_zone_label(),
    'users', (
      select jsonb_build_object(
        'total', count(*),
        'newToday', count(*) filter (
          where account.created_at >= today_start and account.created_at < tomorrow_start
        ),
        'new7Days', count(*) filter (where account.created_at > observed_at - interval '7 days'),
        'new30Days', count(*) filter (where account.created_at > observed_at - interval '30 days'),
        'active7Days', count(*) filter (
          where account.last_sign_in_at > observed_at - interval '7 days'
        ),
        'active30Days', count(*) filter (
          where account.last_sign_in_at > observed_at - interval '30 days'
        ),
        'emailVerified', count(*) filter (where account.email_confirmed_at is not null)
      )
      from auth.users account
    ) || jsonb_build_object(
      'onboarded', (
        select count(*) from app.profiles profile
        where profile.onboarding_completed_at is not null and profile.deleted_at is null
      ),
      'banned', (
        select count(distinct ban.user_id)
        from app_private.user_bans ban
        where ban.lifted_at is null
          and ban.starts_at <= observed_at
          and (ban.ends_at is null or ban.ends_at > observed_at)
      ),
      'deletionRequested', (
        select count(*) from app.account_deletion_requests request
        where request.status in ('requested', 'processing')
      )
    ),
    'signupsByDay', (
      select jsonb_agg(
        jsonb_build_object(
          'date', to_char(calendar.day, 'YYYY-MM-DD'),
          'count', coalesce(daily.signups, 0)
        )
        order by calendar.day
      )
      from generate_series(
        (local_today - 29)::timestamp, local_today::timestamp, interval '1 day'
      ) as calendar(day)
      left join (
        select
          app_private.morocco_local_date(account.created_at) as signup_day,
          count(*) as signups
        from auth.users account
        where account.created_at >= window_start and account.created_at < tomorrow_start
        group by 1
      ) daily on daily.signup_day = calendar.day::date
    ),
    'fantasy', jsonb_build_object(
      'teams', (select count(*) from app.fantasy_teams team where team.status = 'active'),
      'teamsNew7Days', (
        select count(*) from app.fantasy_teams team
        where team.created_at > observed_at - interval '7 days'
      ),
      'leagues', (select count(*) from app.fantasy_leagues league where league.active),
      'transfers7Days', (
        select coalesce(sum(batch.transfers_count), 0)
        from app.fantasy_transfer_batches batch
        where batch.status = 'confirmed' and batch.confirmed_at > observed_at - interval '7 days'
      )
    ),
    'news', (
      select jsonb_build_object(
        'published', count(*) filter (where edition.status = 'published'),
        'published7Days', count(*) filter (
          where edition.status = 'published'
            and edition.published_at > observed_at - interval '7 days'
        ),
        'scheduled', count(*) filter (where edition.status = 'scheduled'),
        'inReview', count(*) filter (where edition.status = 'in_review'),
        'drafts', count(*) filter (where edition.status = 'draft')
      )
      from app.article_editions edition
    ),
    'notifications', jsonb_build_object(
      'devices', (
        select count(*) from app.device_registrations device where device.enabled
      )
    )
  );
end;
$$;

revoke all on function api.admin_get_analytics_overview()
from public, anon, authenticated, service_role;
grant execute on function api.admin_get_analytics_overview()
to authenticated;

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
    range_start := app_private.zone_instant(p_date::timestamp, p_timezone);
    range_end := app_private.zone_instant((p_date + 1)::timestamp, p_timezone);
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
$bg_20261016090400_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261016090400 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261016090400'
  );
begin
  if encode(sha256(convert_to(part_20261016090400, 'UTF8')), 'hex')
    is distinct from '13da1e94f4dc3e562768d82209c25d7f24043f064fbf12db921c18256fa52164' then
    raise exception 'stop: 20261016090400 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261016090400;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn record;
  def record;
  needle text;
  leaked boolean;
  baseline text;
begin

  -- Each function is the migration's, with the attributes, privileges and comment it had.
  for fn in
    select * from (values
      ('api.football_season_catalog(text,integer)', 'fb6e63989ea528c2f2c545504db68aa2', '0952f4f683e9da8f05402f70e33682ae', true, 's', 'plpgsql', true, array['anon', 'authenticated', 'service_role']),
      ('api.admin_get_analytics_overview()', 'c407900da607060a1b268f451c4a3bfb', '83a77d2229b24260ca4e176b44ce1b00', true, 's', 'plpgsql', true, array['authenticated']),
      ('api.football_matches_by_date(date,text,text,text[],uuid,uuid,timestamp with time zone,uuid,integer,timestamp with time zone,timestamp with time zone)', 'cb8a1904e5ee38ded3e9ad2224ef3889', '64b4f711d3ea9978cb41051c22a896b2', true, 's', 'plpgsql', true, array['anon', 'authenticated', 'service_role'])
    ) v(sig, old_md5, new_md5, secdef, vol, lang, search_path_empty, holders)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, l.lanname into def
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(fn.sig);
    if md5(def.prosrc) is distinct from fn.new_md5 then
      problems := problems || (fn.sig || ' is not the new source')::text;
    end if;
    if def.prosecdef <> fn.secdef or def.provolatile <> fn.vol or def.lanname <> fn.lang
      or (def.proconfig is not distinct from array['search_path=""']) <> fn.search_path_empty then
      problems := problems || (fn.sig || ' changed its attributes')::text;
    end if;
  end loop;
  for fn in
    select v.sig, v.required, v.forbidden from (values
      ('api.football_season_catalog(text,integer)', '["app_private.morocco_local_date("]'::jsonb, '["at time zone"]'::jsonb),
      ('api.admin_get_analytics_overview()', '["app_private.morocco_local_date(","app_private.morocco_day_start(","app_private.morocco_time_zone_label("]'::jsonb, '["Africa/Casablanca","at time zone"]'::jsonb),
      ('api.football_matches_by_date(date,text,text,text[],uuid,uuid,timestamp with time zone,uuid,integer,timestamp with time zone,timestamp with time zone)', '["app_private.zone_instant("]'::jsonb, '["at time zone"]'::jsonb)
    ) v(sig, required, forbidden)
  loop
    select p.prosrc into def from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    for needle in select jsonb_array_elements_text(fn.required) loop
      if position(needle in def.prosrc) = 0 then
        problems := problems || (fn.sig || ' no longer contains ' || needle)::text;
      end if;
    end loop;
    for needle in select jsonb_array_elements_text(fn.forbidden) loop
      if position(needle in def.prosrc) > 0 then
        problems := problems || (fn.sig || ' still contains ' || needle)::text;
      end if;
    end loop;
  end loop;
  select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, '-') || ':' || coalesce(obj_description(p.oid, 'pg_proc'), '-'), ',' order by p.oid::regprocedure::text), '')) into baseline
  from pg_catalog.pg_proc p
  where p.oid in (to_regprocedure('api.football_season_catalog(text,integer)'), to_regprocedure('api.admin_get_analytics_overview()'), to_regprocedure('api.football_matches_by_date(date,text,text,text[],uuid,uuid,timestamp with time zone,uuid,integer,timestamp with time zone,timestamp with time zone)'));
  if baseline is distinct from current_setting('bg.morocco_acl_comment_before', true) then
    problems := problems || 'the privileges or the comments of a replaced function moved'::text;
  end if;

  if app_private.morocco_local(timestamptz '2026-10-15 12:00+00') is distinct from timestamp '2026-10-15 12:00:00'
    or app_private.morocco_local(timestamptz '2026-09-20 00:59:59+00') is distinct from timestamp '2026-09-20 01:59:59'
    or app_private.morocco_local(timestamptz '2026-09-20 01:00:00+00') is distinct from timestamp '2026-09-20 01:00:00'
    or app_private.morocco_local(timestamptz '2026-03-10 12:00+00') is distinct from timestamp '2026-03-10 12:00:00'
    or app_private.morocco_local(timestamptz '2026-01-15 12:00+00') is distinct from timestamp '2026-01-15 13:00:00'
    or app_private.morocco_local(timestamptz '2027-02-10 12:00+00') is distinct from timestamp '2027-02-10 12:00:00' then
    raise exception 'stop: the Morocco clock helpers do not give the application''s answers';
  end if;
  if app_private.morocco_instant(timestamp '2026-10-15 12:00') is distinct from timestamptz '2026-10-15 12:00+00'
    or app_private.morocco_instant(timestamp '2026-09-20 00:30') is distinct from timestamptz '2026-09-19 23:30+00'
    or app_private.morocco_day_start(date '2026-09-20') is distinct from timestamptz '2026-09-19 23:00+00'
    or app_private.morocco_day_end(date '2026-09-20') is distinct from timestamptz '2026-09-21 00:00+00'
    or app_private.morocco_local_date(timestamptz '2026-10-15 23:30+00') is distinct from date '2026-10-15' then
    raise exception 'stop: the Morocco day helpers do not give the application''s answers';
  end if;
  if app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca') is distinct from timestamp '2026-10-12 18:30:00'
    or app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Europe/Paris') is distinct from timestamp '2026-10-12 20:30:00'
    or app_private.zone_instant(timestamp '2026-10-12 20:00', 'Europe/Paris') is distinct from timestamptz '2026-10-12 18:00+00' then
    raise exception 'stop: the zone helpers do not give the expected answers';
  end if;
  if jsonb_typeof(api.football_season_catalog('fr', 20)) is distinct from 'array' then
    raise exception 'stop: api.football_season_catalog does not answer an array';
  end if;
  if api.football_matches_by_date(current_date, 'fr', 'Africa/Casablanca', null, null, null, null, null, 1) -> 'items' is null then
    raise exception 'stop: api.football_matches_by_date does not answer';
  end if;


  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j) is distinct from current_setting('bg.morocco_cron_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090400') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'after: the read models check out';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090400')
    then 'Applied. Migration 20261016090400 is recorded; morocco time read models is in place. Run the post-checks in docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md.'
  else 'Rehearsal passed. Nothing was saved.'
      || ' The Moroccan day 2026-10-15 runs from '
      || app_private.morocco_day_start(date '2026-10-15')::text || ' to ' || app_private.morocco_day_end(date '2026-10-15')::text
      || ' (the raw zone on this database says '
      || (date '2026-10-15')::timestamp at time zone 'Africa/Casablanca' || ' to ' || ((date '2026-10-16')::timestamp at time zone 'Africa/Casablanca') || ').'
      || ' Change rollback; to commit; and run again.'
end as result;
