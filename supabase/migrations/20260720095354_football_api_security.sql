-- BotolaGO Production V2
-- Phase 3C: controlled Football API, live projection, and trusted ingestion RPCs.

create or replace function app_private.football_language(requested text)
returns app.language_code
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if requested not in ('fr', 'ar') then
    raise exception using errcode = '22023', message = 'INVALID_LANGUAGE';
  end if;
  return requested::app.language_code;
end;
$$;

create or replace function app_private.football_team_json(
  target_team_id uuid,
  requested_language text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', team.id,
    'slug', team.slug,
    'name', team.name,
    'shortName', team.short_name,
    'code', team.code,
    'city', team.city,
    'countryCode', country.iso_alpha2,
    'crestUrl', case
      when media.validation_status = 'validated' then media.source_url
      else null
    end,
    'crestPath', case
      when media.validation_status = 'validated' then media.storage_path
      else null
    end,
    'primaryColor', team.primary_color,
    'secondaryColor', team.secondary_color,
    'active', team.active
  )
  from app.teams team
  left join app.countries country on country.id = team.country_id
  left join app.media_assets media on media.id = team.crest_asset_id
  where team.id = target_team_id;
$$;

create or replace function app_private.football_competition_json(
  target_competition_id uuid,
  requested_language text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', competition.id,
    'slug', competition.slug,
    'name', coalesce(translation.display_name, competition.name),
    'shortName', coalesce(translation.short_name, competition.short_name),
    'type', competition.competition_type,
    'countryCode', country.iso_alpha2,
    'logoUrl', case when media.validation_status = 'validated' then media.source_url else null end,
    'logoPath', case when media.validation_status = 'validated' then media.storage_path else null end,
    'active', competition.active
  )
  from app.competitions competition
  left join app.competition_translations translation
    on translation.competition_id = competition.id
   and translation.language = app_private.football_language(requested_language)
  left join app.countries country on country.id = competition.country_id
  left join app.media_assets media on media.id = competition.logo_asset_id
  where competition.id = target_competition_id;
$$;

create or replace function app_private.football_venue_json(
  target_venue_id uuid,
  requested_language text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when venue.id is null then null else jsonb_build_object(
    'id', venue.id,
    'slug', venue.slug,
    'name', coalesce(translation.display_name, venue.default_name),
    'city', coalesce(translation.city_name, venue.city),
    'capacity', venue.capacity,
    'countryCode', country.iso_alpha2
  ) end
  from app.venues venue
  left join app.venue_translations translation
    on translation.venue_id = venue.id
   and translation.language = app_private.football_language(requested_language)
  left join app.countries country on country.id = venue.country_id
  where venue.id = target_venue_id;
$$;

create or replace function app_private.football_match_json(
  target_fixture_id uuid,
  requested_language text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', fixture.id,
    'competition', app_private.football_competition_json(fixture.competition_id, requested_language),
    'seasonId', fixture.season_id,
    'seasonLabel', season.label,
    'roundId', fixture.round_id,
    'roundName', round_row.name,
    'roundNumber', round_row.round_number,
    'homeTeam', app_private.football_team_json(fixture.home_team_id, requested_language),
    'awayTeam', app_private.football_team_json(fixture.away_team_id, requested_language),
    'venue', app_private.football_venue_json(fixture.venue_id, requested_language),
    'kickoffAt', fixture.kickoff_at,
    'status', fixture.status,
    'period', fixture.period,
    'minute', fixture.minute,
    'addedTime', fixture.added_time,
    'homeScore', fixture.home_score,
    'awayScore', fixture.away_score,
    'halfTimeHomeScore', fixture.half_time_home_score,
    'halfTimeAwayScore', fixture.half_time_away_score,
    'extraTimeHomeScore', fixture.extra_time_home_score,
    'extraTimeAwayScore', fixture.extra_time_away_score,
    'penaltyHomeScore', fixture.penalty_home_score,
    'penaltyAwayScore', fixture.penalty_away_score,
    'winnerTeamId', fixture.winner_team_id,
    'attendance', fixture.attendance,
    'providerUpdatedAt', fixture.provider_updated_at,
    'sourceSequence', fixture.source_sequence,
    'finalizedAt', fixture.finalized_at,
    'updatedAt', fixture.updated_at
  )
  from app.fixtures fixture
  join app.seasons season on season.id = fixture.season_id
  left join app.rounds round_row on round_row.id = fixture.round_id
  where fixture.id = target_fixture_id;
$$;

revoke all on function app_private.football_language(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.football_team_json(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.football_competition_json(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.football_venue_json(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.football_match_json(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.football_language(text) to postgres;
grant execute on function app_private.football_team_json(uuid, text) to postgres;
grant execute on function app_private.football_competition_json(uuid, text) to postgres;
grant execute on function app_private.football_venue_json(uuid, text) to postgres;
grant execute on function app_private.football_match_json(uuid, text) to postgres;

-- A narrow public Realtime projection. Canonical app.fixtures is neither
-- exposed nor published. Realtime messages are freshness hints; clients then
-- re-read the stable DTO RPC.
create table api.live_fixture_updates (
  fixture_id uuid primary key,
  kickoff_at timestamptz not null,
  status text not null,
  minute integer,
  added_time integer,
  home_score integer,
  away_score integer,
  provider_updated_at timestamptz not null,
  source_sequence bigint not null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint live_fixture_updates_minute_check check (minute is null or minute between 0 and 180),
  constraint live_fixture_updates_added_time_check check (added_time is null or added_time between 0 and 60),
  constraint live_fixture_updates_status_check check (status in (
    'live_first_half', 'half_time', 'live_second_half', 'extra_time',
    'penalties', 'suspended', 'delayed'
  )),
  constraint live_fixture_updates_score_check check (
    (home_score is null or home_score >= 0) and (away_score is null or away_score >= 0)
  )
);

alter table api.live_fixture_updates enable row level security;
alter table api.live_fixture_updates force row level security;
alter table api.live_fixture_updates replica identity full;

create policy live_fixture_updates_public_read
on api.live_fixture_updates for select to anon, authenticated
using (true);

create or replace function app_private.sync_live_fixture_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from api.live_fixture_updates where fixture_id = old.id;
    return old;
  end if;

  if new.status in (
    'live_first_half', 'half_time', 'live_second_half', 'extra_time',
    'penalties', 'suspended', 'delayed'
  ) then
    insert into api.live_fixture_updates (
      fixture_id, kickoff_at, status, minute, added_time, home_score,
      away_score, provider_updated_at, source_sequence, updated_at
    )
    values (
      new.id, new.kickoff_at, new.status::text, new.minute, new.added_time,
      new.home_score, new.away_score, new.provider_updated_at,
      new.source_sequence, statement_timestamp()
    )
    on conflict (fixture_id) do update set
      kickoff_at = excluded.kickoff_at,
      status = excluded.status,
      minute = excluded.minute,
      added_time = excluded.added_time,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      provider_updated_at = excluded.provider_updated_at,
      source_sequence = excluded.source_sequence,
      updated_at = excluded.updated_at;
  else
    delete from api.live_fixture_updates where fixture_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function app_private.sync_live_fixture_update()
  from public, anon, authenticated, service_role;
grant execute on function app_private.sync_live_fixture_update() to postgres;
create trigger fixtures_sync_live_projection
after insert or update or delete on app.fixtures
for each row execute function app_private.sync_live_fixture_update();

grant select on table api.live_fixture_updates to anon, authenticated, service_role;
revoke insert, update, delete, truncate, references, trigger
  on table api.live_fixture_updates from anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'api'
        and tablename = 'live_fixture_updates'
    )
  then
    alter publication supabase_realtime add table api.live_fixture_updates;
  end if;
end;
$$;

create or replace function api.football_home_matches(
  p_limit integer default 3,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.football_language(p_language);
  if p_limit not between 1 and 10 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_LIMIT';
  end if;

  select coalesce(jsonb_agg(app_private.football_match_json(ranked.id, p_language) order by ranked.sort_group, ranked.kickoff_at, ranked.id), '[]'::jsonb)
  into result
  from (
    select fixture.id, fixture.kickoff_at,
      case when fixture.status in (
        'live_first_half', 'half_time', 'live_second_half', 'extra_time', 'penalties'
      ) then 0 else 1 end as sort_group
    from app.fixtures fixture
    where fixture.status in (
      'scheduled', 'not_started', 'live_first_half', 'half_time',
      'live_second_half', 'extra_time', 'penalties', 'delayed'
    )
      and fixture.kickoff_at >= statement_timestamp() - interval '6 hours'
    order by sort_group, fixture.kickoff_at, fixture.id
    limit p_limit
  ) ranked;
  return result;
end;
$$;

create or replace function api.football_live_matches(
  p_limit integer default 50,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.football_language(p_language);
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_LIMIT';
  end if;
  select coalesce(jsonb_agg(app_private.football_match_json(item.id, p_language) order by item.kickoff_at, item.id), '[]'::jsonb)
  into result
  from (
    select fixture.id, fixture.kickoff_at
    from app.fixtures fixture
    where fixture.status in (
      'live_first_half', 'half_time', 'live_second_half', 'extra_time',
      'penalties', 'suspended', 'delayed'
    )
    order by fixture.kickoff_at, fixture.id
    limit p_limit
  ) item;
  return result;
end;
$$;

create or replace function api.football_upcoming_matches(
  p_limit integer default 20,
  p_language text default 'fr'
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
  if p_limit not between 1 and 50 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_LIMIT';
  end if;
  select coalesce(jsonb_agg(app_private.football_match_json(item.id, p_language) order by item.kickoff_at, item.id), '[]'::jsonb)
  into result
  from (
    select fixture.id, fixture.kickoff_at
    from app.fixtures fixture
    where fixture.status in ('scheduled', 'not_started', 'delayed', 'postponed')
      and fixture.kickoff_at >= statement_timestamp() - interval '6 hours'
    order by fixture.kickoff_at, fixture.id
    limit p_limit
  ) item;
  return result;
end;
$$;

create or replace function api.football_matches_by_date(
  p_date date,
  p_language text default 'fr',
  p_timezone text default 'Africa/Casablanca',
  p_statuses text[] default null,
  p_competition_id uuid default null,
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
    select coalesce(jsonb_agg(app_private.football_match_json(page.id, p_language) order by page.kickoff_at, page.id), '[]'::jsonb) items
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

create or replace function api.football_match_detail(
  p_fixture_id uuid,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.football_language(p_language);
  result := app_private.football_match_json(p_fixture_id, p_language);
  if result is null then
    raise exception using errcode = 'P0002', message = 'FIXTURE_NOT_FOUND';
  end if;
  return result;
end;
$$;

create or replace function api.football_match_timeline(
  p_fixture_id uuid,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.football_language(p_language);
  if not exists (select 1 from app.fixtures where id = p_fixture_id) then
    raise exception using errcode = 'P0002', message = 'FIXTURE_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id,
    'type', event.event_type,
    'detail', event.detail,
    'teamId', event.team_id,
    'playerId', event.player_id,
    'relatedPlayerId', event.related_player_id,
    'minute', event.minute,
    'addedTime', event.added_time,
    'sequence', event.sequence_number,
    'period', event.period
  ) order by event.period, event.minute, event.added_time, event.sequence_number, event.id), '[]'::jsonb)
  into result
  from app.match_events event
  where event.fixture_id = p_fixture_id;
  return result;
end;
$$;

create or replace function api.football_match_lineups(
  p_fixture_id uuid,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.football_language(p_language);
  if not exists (select 1 from app.fixtures where id = p_fixture_id) then
    raise exception using errcode = 'P0002', message = 'FIXTURE_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', lineup.id,
    'team', app_private.football_team_json(lineup.team_id, p_language),
    'formation', lineup.formation,
    'confirmed', lineup.confirmed,
    'publishedAt', lineup.published_at,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', player.id,
        'slug', player.slug,
        'displayName', player.display_name,
        'slot', selection.slot,
        'position', selection.position,
        'shirtNumber', selection.shirt_number,
        'order', selection.display_order,
        'captain', selection.captain
      ) order by selection.slot, selection.display_order, selection.id)
      from app.lineup_players selection
      join app.players player on player.id = selection.player_id
      where selection.lineup_id = lineup.id
    ), '[]'::jsonb)
  ) order by lineup.team_id), '[]'::jsonb)
  into result
  from app.lineups lineup
  where lineup.fixture_id = p_fixture_id;
  return result;
end;
$$;

create or replace function api.football_match_statistics(
  p_fixture_id uuid,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fixture_home uuid;
  fixture_away uuid;
  result jsonb;
begin
  perform app_private.football_language(p_language);
  select home_team_id, away_team_id into fixture_home, fixture_away
  from app.fixtures where id = p_fixture_id;
  if fixture_home is null then
    raise exception using errcode = 'P0002', message = 'FIXTURE_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', definition.code,
    'label', definition.display_name,
    'valueType', definition.value_type,
    'unit', definition.unit,
    'homeValue', home_stat.numeric_value,
    'homeDisplayValue', home_stat.display_value,
    'awayValue', away_stat.numeric_value,
    'awayDisplayValue', away_stat.display_value
  ) order by definition.display_order, definition.code), '[]'::jsonb)
  into result
  from app.statistic_definitions definition
  left join app.fixture_team_statistics home_stat
    on home_stat.statistic_definition_id = definition.id
   and home_stat.fixture_id = p_fixture_id
   and home_stat.team_id = fixture_home
  left join app.fixture_team_statistics away_stat
    on away_stat.statistic_definition_id = definition.id
   and away_stat.fixture_id = p_fixture_id
   and away_stat.team_id = fixture_away
  where definition.active
    and (home_stat.id is not null or away_stat.id is not null);
  return result;
end;
$$;

create or replace function api.football_head_to_head(
  p_fixture_id uuid,
  p_limit integer default 5,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fixture_home uuid;
  fixture_away uuid;
  result jsonb;
begin
  perform app_private.football_language(p_language);
  if p_limit not between 1 and 20 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_LIMIT';
  end if;
  select home_team_id, away_team_id into fixture_home, fixture_away
  from app.fixtures where id = p_fixture_id;
  if fixture_home is null then
    raise exception using errcode = 'P0002', message = 'FIXTURE_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(app_private.football_match_json(item.id, p_language) order by item.kickoff_at desc, item.id desc), '[]'::jsonb)
  into result
  from (
    select fixture.id, fixture.kickoff_at
    from app.fixtures fixture
    where fixture.id <> p_fixture_id
      and fixture.status = 'finished'
      and (
        (fixture.home_team_id = fixture_home and fixture.away_team_id = fixture_away)
        or (fixture.home_team_id = fixture_away and fixture.away_team_id = fixture_home)
      )
    order by fixture.kickoff_at desc, fixture.id desc
    limit p_limit
  ) item;
  return result;
end;
$$;

create or replace function api.football_standings(
  p_season_id uuid,
  p_group_key text default '',
  p_table_type text default 'overall',
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.football_language(p_language);
  if p_table_type not in ('overall', 'home', 'away', 'group') then
    raise exception using errcode = '22023', message = 'INVALID_STANDING_TYPE';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', standing.id,
    'rank', standing.rank,
    'team', app_private.football_team_json(standing.team_id, p_language),
    'played', standing.played,
    'won', standing.won,
    'drawn', standing.drawn,
    'lost', standing.lost,
    'goalsFor', standing.goals_for,
    'goalsAgainst', standing.goals_against,
    'goalDifference', standing.goal_difference,
    'points', standing.points,
    'form', standing.form,
    'qualificationCode', standing.qualification_code,
    'providerUpdatedAt', standing.provider_updated_at
  ) order by standing.rank, standing.team_id), '[]'::jsonb)
  into result
  from app.standings standing
  where standing.season_id = p_season_id
    and standing.group_key = p_group_key
    and standing.table_type = p_table_type;
  return result;
end;
$$;

create or replace function api.football_competition_summary(
  p_competition_id uuid,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.football_language(p_language);
  select app_private.football_competition_json(competition.id, p_language)
    || jsonb_build_object(
      'currentSeason', case when season.id is null then null else jsonb_build_object(
        'id', season.id,
        'label', season.label,
        'startsOn', season.starts_on,
        'endsOn', season.ends_on,
        'status', season.status
      ) end
    )
  into result
  from app.competitions competition
  left join app.seasons season
    on season.competition_id = competition.id and season.is_current
  where competition.id = p_competition_id;
  if result is null then
    raise exception using errcode = 'P0002', message = 'COMPETITION_NOT_FOUND';
  end if;
  return result;
end;
$$;

create or replace function api.football_competition_fixtures(
  p_competition_id uuid,
  p_season_id uuid default null,
  p_after_kickoff timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 50,
  p_language text default 'fr'
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
  if p_limit not between 1 and 100 then raise exception using errcode = '22023', message = 'INVALID_PAGE_LIMIT'; end if;
  if (p_after_kickoff is null) <> (p_after_id is null) then raise exception using errcode = '22023', message = 'INVALID_PAGE_CURSOR'; end if;
  with candidates as (
    select fixture.id, fixture.kickoff_at
    from app.fixtures fixture
    where fixture.competition_id = p_competition_id
      and (p_season_id is null or fixture.season_id = p_season_id)
      and (p_after_kickoff is null or (fixture.kickoff_at, fixture.id) > (p_after_kickoff, p_after_id))
    order by fixture.kickoff_at, fixture.id
    limit p_limit + 1
  ), page as (
    select * from candidates order by kickoff_at, id limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(app_private.football_match_json(page.id, p_language) order by page.kickoff_at, page.id) from page), '[]'::jsonb),
    'nextCursor', case when (select count(*) from candidates) > p_limit then
      (select jsonb_build_object('kickoffAt', page.kickoff_at, 'id', page.id) from page order by kickoff_at desc, id desc limit 1)
      else null end
  ) into result;
  return result;
end;
$$;

create or replace function api.football_team_summary(
  p_team_id uuid,
  p_language text default 'fr'
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
  result := app_private.football_team_json(p_team_id, p_language);
  if result is null then raise exception using errcode = 'P0002', message = 'TEAM_NOT_FOUND'; end if;
  return result;
end;
$$;

create or replace function api.football_team_squad(
  p_team_id uuid,
  p_season_id uuid default null,
  p_language text default 'fr'
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
  if not exists (select 1 from app.teams where id = p_team_id) then
    raise exception using errcode = 'P0002', message = 'TEAM_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'membershipId', membership.id,
    'playerId', player.id,
    'slug', player.slug,
    'displayName', player.display_name,
    'fullName', player.full_name,
    'position', player.position,
    'shirtNumber', membership.shirt_number,
    'squadRole', membership.squad_role,
    'validFrom', membership.valid_from,
    'validTo', membership.valid_to,
    'active', membership.active
  ) order by player.position, membership.shirt_number nulls last, player.display_name, player.id), '[]'::jsonb)
  into result
  from app.team_memberships membership
  join app.players player on player.id = membership.player_id
  where membership.team_id = p_team_id
    and membership.active
    and (p_season_id is null or membership.season_id = p_season_id);
  return result;
end;
$$;

create or replace function api.football_team_fixtures(
  p_team_id uuid,
  p_before_kickoff timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20,
  p_language text default 'fr'
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
  if p_limit not between 1 and 100 then raise exception using errcode = '22023', message = 'INVALID_PAGE_LIMIT'; end if;
  if (p_before_kickoff is null) <> (p_before_id is null) then raise exception using errcode = '22023', message = 'INVALID_PAGE_CURSOR'; end if;
  select coalesce(jsonb_agg(app_private.football_match_json(item.id, p_language) order by item.kickoff_at desc, item.id desc), '[]'::jsonb)
  into result
  from (
    select fixture.id, fixture.kickoff_at
    from app.fixtures fixture
    where p_team_id in (fixture.home_team_id, fixture.away_team_id)
      and (p_before_kickoff is null or (fixture.kickoff_at, fixture.id) < (p_before_kickoff, p_before_id))
    order by fixture.kickoff_at desc, fixture.id desc
    limit p_limit
  ) item;
  return result;
end;
$$;

create or replace function api.football_player_summary(
  p_player_id uuid,
  p_language text default 'fr'
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
  select jsonb_build_object(
    'id', player.id,
    'slug', player.slug,
    'fullName', player.full_name,
    'displayName', player.display_name,
    'firstName', player.first_name,
    'lastName', player.last_name,
    'dateOfBirth', player.date_of_birth,
    'position', player.position,
    'preferredFoot', player.preferred_foot,
    'nationality', case when country.id is null then null else jsonb_build_object(
      'id', country.id,
      'code', country.iso_alpha2,
      'name', coalesce(country_translation.display_name, country.iso_alpha2)
    ) end,
    'currentTeam', app_private.football_team_json(membership.team_id, p_language),
    'shirtNumber', membership.shirt_number,
    'active', player.active
  ) into result
  from app.players player
  left join app.countries country on country.id = player.nationality_country_id
  left join app.country_translations country_translation
    on country_translation.country_id = country.id
   and country_translation.language = app_private.football_language(p_language)
  left join lateral (
    select team_membership.*
    from app.team_memberships team_membership
    where team_membership.player_id = player.id and team_membership.active
      and team_membership.valid_from <= current_date
      and (team_membership.valid_to is null or team_membership.valid_to >= current_date)
    order by team_membership.valid_from desc, team_membership.id desc
    limit 1
  ) membership on true
  where player.id = p_player_id;
  if result is null then raise exception using errcode = 'P0002', message = 'PLAYER_NOT_FOUND'; end if;
  return result;
end;
$$;

create or replace function api.football_player_availability(
  p_player_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if p_limit not between 1 and 100 then raise exception using errcode = '22023', message = 'INVALID_PAGE_LIMIT'; end if;
  if not exists (select 1 from app.players where id = p_player_id) then
    raise exception using errcode = 'P0002', message = 'PLAYER_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', availability.id,
    'status', availability.status,
    'reason', availability.reason,
    'startsOn', availability.starts_on,
    'expectedReturnOn', availability.expected_return_on,
    'endsOn', availability.ends_on,
    'active', availability.active,
    'providerUpdatedAt', availability.provider_updated_at
  ) order by availability.starts_on desc, availability.id desc), '[]'::jsonb)
  into result
  from (
    select * from app.player_availability
    where player_id = p_player_id
    order by starts_on desc, id desc
    limit p_limit
  ) availability;
  return result;
end;
$$;

-- Trusted operational RPCs. These are intentionally absent from anon and
-- authenticated grants. Provider payloads have already been normalized by the
-- server adapter; JSON is an input boundary and is never persisted as the
-- canonical model.
create or replace function api.begin_football_ingestion(
  p_provider_name text,
  p_job_type text,
  p_target_scope jsonb default '{}'::jsonb,
  p_checkpoint jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare run_id uuid;
begin
  if not exists (
    select 1 from app_private.football_providers provider
    where provider.name = p_provider_name and provider.active
  ) then
    raise exception using errcode = 'P0002', message = 'PROVIDER_NOT_FOUND';
  end if;
  if p_job_type not in (
    'competitions', 'seasons', 'rounds', 'teams', 'players', 'squads',
    'fixtures', 'standings', 'lineups', 'live_fixtures', 'match_events',
    'match_statistics', 'player_availability', 'finalize_fixtures'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_INGESTION_JOB';
  end if;
  insert into app_private.football_ingestion_runs (
    provider_name, job_type, target_scope, checkpoint, status, started_at
  ) values (
    p_provider_name,
    p_job_type::app_private.ingestion_job_type,
    coalesce(p_target_scope, '{}'::jsonb),
    coalesce(p_checkpoint, '{}'::jsonb),
    'running',
    statement_timestamp()
  ) returning id into run_id;
  return run_id;
end;
$$;

create or replace function api.complete_football_ingestion(
  p_run_id uuid,
  p_status text,
  p_checkpoint jsonb default '{}'::jsonb,
  p_records_fetched integer default 0,
  p_records_validated integer default 0,
  p_records_inserted integer default 0,
  p_records_updated integer default 0,
  p_records_skipped integer default 0,
  p_records_rejected integer default 0,
  p_retry_count integer default 0,
  p_error_code text default null,
  p_error_summary text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('succeeded', 'partial', 'failed', 'cancelled') then
    raise exception using errcode = '22023', message = 'INVALID_INGESTION_STATUS';
  end if;
  update app_private.football_ingestion_runs
  set status = p_status::app_private.ingestion_run_status,
      checkpoint = coalesce(p_checkpoint, '{}'::jsonb),
      completed_at = statement_timestamp(),
      records_fetched = p_records_fetched,
      records_validated = p_records_validated,
      records_inserted = p_records_inserted,
      records_updated = p_records_updated,
      records_skipped = p_records_skipped,
      records_rejected = p_records_rejected,
      retry_count = p_retry_count,
      error_code = p_error_code,
      error_summary = p_error_summary
  where id = p_run_id and status in ('pending', 'running');
  if not found then
    raise exception using errcode = 'P0002', message = 'INGESTION_RUN_NOT_FOUND';
  end if;
end;
$$;

create or replace function api.record_football_ingestion_rejection(
  p_run_id uuid,
  p_entity_type text,
  p_external_id text,
  p_payload_fingerprint text,
  p_error_code text,
  p_validation_issues jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare rejection_id uuid;
begin
  if p_entity_type is not null and p_entity_type not in (
    'country', 'competition', 'season', 'round', 'venue', 'team',
    'player', 'fixture', 'event'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ENTITY_TYPE';
  end if;
  insert into app_private.football_ingestion_rejections (
    run_id, entity_type, external_id, payload_fingerprint, error_code, validation_issues
  ) values (
    p_run_id,
    p_entity_type::app_private.football_entity_type,
    p_external_id,
    p_payload_fingerprint,
    p_error_code,
    coalesce(p_validation_issues, '[]'::jsonb)
  )
  on conflict (run_id, payload_fingerprint, error_code) do update
    set validation_issues = excluded.validation_issues
  returning id into rejection_id;
  return rejection_id;
end;
$$;

create or replace function api.resolve_football_mapping(
  p_provider_name text,
  p_entity_type text,
  p_external_id text,
  p_internal_entity_id uuid default null,
  p_source_version text default null,
  p_last_seen_at timestamptz default statement_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  mapped_id uuid;
  normalized_entity_type app_private.football_entity_type;
begin
  if p_entity_type not in (
    'country', 'competition', 'season', 'round', 'venue', 'team',
    'player', 'fixture', 'event'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ENTITY_TYPE';
  end if;
  normalized_entity_type := p_entity_type::app_private.football_entity_type;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider_name || ':' || p_entity_type || ':' || p_external_id, 0)
  );

  select mapping.internal_entity_id into mapped_id
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = normalized_entity_type
    and mapping.external_id = p_external_id
    and mapping.active;

  if mapped_id is not null then
    if p_internal_entity_id is not null and mapped_id <> p_internal_entity_id then
      raise exception using errcode = 'P0001', message = 'MAPPING_COLLISION';
    end if;
    update app_private.football_provider_mappings
    set last_seen_at = greatest(last_seen_at, p_last_seen_at),
        source_version = coalesce(p_source_version, source_version)
    where provider_name = p_provider_name
      and entity_type = normalized_entity_type
      and external_id = p_external_id;
    return mapped_id;
  end if;

  if p_internal_entity_id is null then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;

  begin
    insert into app_private.football_provider_mappings (
      provider_name, entity_type, external_id, internal_entity_id,
      source_version, last_seen_at
    ) values (
      p_provider_name, normalized_entity_type, p_external_id,
      p_internal_entity_id, p_source_version, p_last_seen_at
    );
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'MAPPING_COLLISION';
  end;
  return p_internal_entity_id;
end;
$$;

create or replace function api.ingest_football_fixture(
  p_provider_name text,
  p_external_id text,
  p_fixture jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  v_competition_id uuid;
  v_season_id uuid;
  v_round_id uuid;
  v_home_team_id uuid;
  v_away_team_id uuid;
  v_venue_id uuid;
  v_winner_team_id uuid;
  v_kickoff_at timestamptz;
  normalized_status app.fixture_status;
  normalized_period app.fixture_period;
  v_provider_updated_at timestamptz;
  v_source_sequence bigint;
begin
  if jsonb_typeof(p_fixture) <> 'object' or octet_length(p_fixture::text) > 16384 then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if not exists (
    select 1 from app_private.football_providers
    where name = p_provider_name and active
  ) then
    raise exception using errcode = 'P0002', message = 'PROVIDER_NOT_FOUND';
  end if;

  begin
    v_competition_id := (p_fixture ->> 'competitionId')::uuid;
    v_season_id := (p_fixture ->> 'seasonId')::uuid;
    v_round_id := nullif(p_fixture ->> 'roundId', '')::uuid;
    v_home_team_id := (p_fixture ->> 'homeTeamId')::uuid;
    v_away_team_id := (p_fixture ->> 'awayTeamId')::uuid;
    v_venue_id := nullif(p_fixture ->> 'venueId', '')::uuid;
    v_winner_team_id := nullif(p_fixture ->> 'winnerTeamId', '')::uuid;
    v_kickoff_at := (p_fixture ->> 'kickoffAt')::timestamptz;
    normalized_status := (p_fixture ->> 'status')::app.fixture_status;
    normalized_period := coalesce(p_fixture ->> 'period', 'pre_match')::app.fixture_period;
    v_provider_updated_at := (p_fixture ->> 'providerUpdatedAt')::timestamptz;
    v_source_sequence := coalesce((p_fixture ->> 'sourceSequence')::bigint, 0);
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end;

  if v_competition_id is null or v_season_id is null or v_home_team_id is null
    or v_away_team_id is null or v_kickoff_at is null or v_provider_updated_at is null
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider_name || ':fixture:' || p_external_id, 0)
  );
  select internal_entity_id into target_id
  from app_private.football_provider_mappings
  where provider_name = p_provider_name
    and entity_type = 'fixture'
    and external_id = p_external_id
    and active;

  if target_id is null then
    insert into app.fixtures (
      competition_id, season_id, round_id, home_team_id, away_team_id,
      venue_id, kickoff_at, status, period, minute, added_time,
      home_score, away_score, half_time_home_score, half_time_away_score,
      extra_time_home_score, extra_time_away_score, penalty_home_score,
      penalty_away_score, winner_team_id, attendance, provider_updated_at,
      source_sequence, source_version, finalized_at
    ) values (
      v_competition_id, v_season_id, v_round_id, v_home_team_id, v_away_team_id,
      v_venue_id, v_kickoff_at, normalized_status, normalized_period,
      nullif(p_fixture ->> 'minute', '')::integer,
      nullif(p_fixture ->> 'addedTime', '')::integer,
      nullif(p_fixture ->> 'homeScore', '')::integer,
      nullif(p_fixture ->> 'awayScore', '')::integer,
      nullif(p_fixture ->> 'halfTimeHomeScore', '')::integer,
      nullif(p_fixture ->> 'halfTimeAwayScore', '')::integer,
      nullif(p_fixture ->> 'extraTimeHomeScore', '')::integer,
      nullif(p_fixture ->> 'extraTimeAwayScore', '')::integer,
      nullif(p_fixture ->> 'penaltyHomeScore', '')::integer,
      nullif(p_fixture ->> 'penaltyAwayScore', '')::integer,
      v_winner_team_id,
      nullif(p_fixture ->> 'attendance', '')::integer,
      v_provider_updated_at, v_source_sequence, p_fixture ->> 'sourceVersion',
      nullif(p_fixture ->> 'finalizedAt', '')::timestamptz
    ) returning id into target_id;
    perform api.resolve_football_mapping(
      p_provider_name, 'fixture', p_external_id, target_id,
      p_fixture ->> 'sourceVersion', v_provider_updated_at
    );
  else
    update app.fixtures set
      competition_id = v_competition_id,
      season_id = v_season_id,
      round_id = v_round_id,
      home_team_id = v_home_team_id,
      away_team_id = v_away_team_id,
      venue_id = v_venue_id,
      kickoff_at = v_kickoff_at,
      status = normalized_status,
      period = normalized_period,
      minute = nullif(p_fixture ->> 'minute', '')::integer,
      added_time = nullif(p_fixture ->> 'addedTime', '')::integer,
      home_score = nullif(p_fixture ->> 'homeScore', '')::integer,
      away_score = nullif(p_fixture ->> 'awayScore', '')::integer,
      half_time_home_score = nullif(p_fixture ->> 'halfTimeHomeScore', '')::integer,
      half_time_away_score = nullif(p_fixture ->> 'halfTimeAwayScore', '')::integer,
      extra_time_home_score = nullif(p_fixture ->> 'extraTimeHomeScore', '')::integer,
      extra_time_away_score = nullif(p_fixture ->> 'extraTimeAwayScore', '')::integer,
      penalty_home_score = nullif(p_fixture ->> 'penaltyHomeScore', '')::integer,
      penalty_away_score = nullif(p_fixture ->> 'penaltyAwayScore', '')::integer,
      winner_team_id = v_winner_team_id,
      attendance = nullif(p_fixture ->> 'attendance', '')::integer,
      provider_updated_at = v_provider_updated_at,
      source_sequence = v_source_sequence,
      source_version = p_fixture ->> 'sourceVersion',
      finalized_at = nullif(p_fixture ->> 'finalizedAt', '')::timestamptz
    where id = target_id;
    perform api.resolve_football_mapping(
      p_provider_name, 'fixture', p_external_id, target_id,
      p_fixture ->> 'sourceVersion', v_provider_updated_at
    );
  end if;
  return target_id;
exception
  when foreign_key_violation then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  when check_violation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

-- Explicit function grants are the complete Football Data API surface.
revoke all on function api.football_home_matches(integer, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_live_matches(integer, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_upcoming_matches(integer, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_matches_by_date(date, text, text, text[], uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function api.football_match_detail(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_match_timeline(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_match_lineups(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_match_statistics(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_head_to_head(uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_standings(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_competition_summary(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_competition_fixtures(uuid, uuid, timestamptz, uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_team_summary(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_team_squad(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_team_fixtures(uuid, timestamptz, uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_player_summary(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function api.football_player_availability(uuid, integer)
  from public, anon, authenticated, service_role;

grant execute on function api.football_home_matches(integer, text) to anon, authenticated, service_role;
grant execute on function api.football_live_matches(integer, text) to anon, authenticated, service_role;
grant execute on function api.football_upcoming_matches(integer, text) to anon, authenticated, service_role;
grant execute on function api.football_matches_by_date(date, text, text, text[], uuid, timestamptz, uuid, integer) to anon, authenticated, service_role;
grant execute on function api.football_match_detail(uuid, text) to anon, authenticated, service_role;
grant execute on function api.football_match_timeline(uuid, text) to anon, authenticated, service_role;
grant execute on function api.football_match_lineups(uuid, text) to anon, authenticated, service_role;
grant execute on function api.football_match_statistics(uuid, text) to anon, authenticated, service_role;
grant execute on function api.football_head_to_head(uuid, integer, text) to anon, authenticated, service_role;
grant execute on function api.football_standings(uuid, text, text, text) to anon, authenticated, service_role;
grant execute on function api.football_competition_summary(uuid, text) to anon, authenticated, service_role;
grant execute on function api.football_competition_fixtures(uuid, uuid, timestamptz, uuid, integer, text) to anon, authenticated, service_role;
grant execute on function api.football_team_summary(uuid, text) to anon, authenticated, service_role;
grant execute on function api.football_team_squad(uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function api.football_team_fixtures(uuid, timestamptz, uuid, integer, text) to anon, authenticated, service_role;
grant execute on function api.football_player_summary(uuid, text) to anon, authenticated, service_role;
grant execute on function api.football_player_availability(uuid, integer) to anon, authenticated, service_role;

revoke all on function api.begin_football_ingestion(text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function api.complete_football_ingestion(uuid, text, jsonb, integer, integer, integer, integer, integer, integer, integer, text, text)
  from public, anon, authenticated, service_role;
revoke all on function api.record_football_ingestion_rejection(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function api.resolve_football_mapping(text, text, text, uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function api.ingest_football_fixture(text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function api.begin_football_ingestion(text, text, jsonb, jsonb) to service_role;
grant execute on function api.complete_football_ingestion(uuid, text, jsonb, integer, integer, integer, integer, integer, integer, integer, text, text) to service_role;
grant execute on function api.record_football_ingestion_rejection(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function api.resolve_football_mapping(text, text, text, uuid, text, timestamptz) to service_role;
grant execute on function api.ingest_football_fixture(text, text, jsonb) to service_role;
