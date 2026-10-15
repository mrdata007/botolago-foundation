-- Three reads follow Morocco's clock.
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
