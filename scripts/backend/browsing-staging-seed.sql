-- BotolaGO browsing capacity seed: synthetic football and news content.
-- STAGING ONLY. This file is not a migration and is never executed by CI.
--
-- Required session guard (the same one the Fantasy capacity seed uses):
--   select set_config('botolago.capacity_environment', 'staging-v2', false);
-- e.g.
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" \
--     -c "select set_config('botolago.capacity_environment','staging-v2',false)" \
--     -f scripts/backend/browsing-staging-seed.sql
-- It uses no psql meta-commands, so the Management API query endpoint can run
-- it the way staging-database-update.py runs fantasy-staging-seed.sql (the
-- set_config line prepended).
--
-- What it creates, so the public read API (api.football_* and api.news_*)
-- returns realistic volumes to a browsing load test instead of empty lists:
--   * one competition "Capacity Browsing League" and one active season,
--     16 clubs, 16 venues, 320 players (20 per club) and 30 rounds;
--   * a full double round-robin, 240 fixtures: rounds 1-22 finished (one
--     fixture postponed), round 23 in play (8 fixtures, from 12 to 108
--     minutes after kick-off), rounds 24-30 scheduled;
--   * for every finished and in-play fixture: timeline events, team
--     statistics, both lineups and the per-minute pressure; absences for every
--     fixture; overall, home and away standings computed from the results;
--   * 2,000 published stories, each with a French and an Arabic edition
--     (4,000 editions) spread over the 60 days before the first run, tagged
--     to the clubs, the competition, synthetic categories, topics and tags,
--     some to a player; and global home placements in both languages.
-- Everything is named "Capacity ..." (slugs capacity-browsing-*), so it can
-- never be mistaken for real content. No auth user, profile or Fantasy row is
-- created or changed, and no URL or e-mail address is written.
--
-- Deterministic and idempotent. Every id is derived from a fixed key
-- (pg_temp.cap_uuid below, shaped as a v4 uuid because news_article_detail
-- only treats a v4-looking identifier as an id) and every insert is
-- "on conflict do nothing". Times are relative to an anchor: the minute of
-- the first run, kept afterwards as the season's created_at, so a re-run
-- computes exactly the same rows and inserts nothing. In-play fixtures stay
-- in play by status (api.football_live_matches filters on status only), but
-- their kick-off times, like the news publication times, belong to the first
-- run: seed shortly before the load test, and expect api.football_home_matches
-- to stop listing them six hours after that run.
--
-- The whole seed is one transaction: on any error nothing is left behind.
--
-- Side effects, and why none fires:
--   * No trigger on a table this seed writes enqueues a notification or an
--     e-mail, calls pg_net or supabase_functions.http_request, or notifies:
--     they validate the row (fixture catalogue, fixture team, match event,
--     standing, taxonomy, placement), keep updated_at, or maintain derived
--     rows that must stay consistent with the content (api.live_fixture_
--     updates for in-play fixtures; app.article_search_documents; the
--     headline club tagging, which leaves a story an editor tagged alone).
--     So the triggers stay on, and session_replication_role is deliberately
--     NOT set to replica: that would also skip the foreign-key checks and
--     leave the search documents and the live projection out of step. The
--     guard below re-checks this every run and refuses if a trigger on one of
--     these tables starts to look like it sends anything.
--   * The scheduled jobs that e-mail or call the provider (notification-email-
--     tick's matchday preview/results and match_starting plans, football-
--     live-refresh, the ops live_scores health check, predictions scoring)
--     all select fixtures through app.seasons.is_current. The synthetic
--     season is therefore active but NOT current (is_current = false), and
--     the guard refuses if it has been made current. api.football_season_
--     catalog lists it anyway, because it has fixtures.
--   * Nobody follows the synthetic clubs or competition, and no placement is
--     of type 'breaking'. The stories do reach /sitemap.xml on staging within
--     a minute (news-sitemap-refresh), which is intended.
--   * Placements have priority 900+, so real editorial placements sort first;
--     the home_lead is only added in a language that has no current one.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '15min';

do $$
begin
  if current_setting('botolago.capacity_environment', true) is distinct from 'staging-v2' then
    raise exception 'browsing_capacity_seed_requires_staging_guard';
  end if;
end;
$$;

-- Deterministic ids and pseudo-random numbers.
create or replace function pg_temp.cap_uuid(key text) returns uuid
language sql immutable as $f$
  select (substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3)
    || '-8' || substr(h, 18, 3) || '-' || substr(h, 21, 12))::uuid
  from (select md5('capacity-browsing:' || key) as h) digest
$f$;

create or replace function pg_temp.cap_hash(key text) returns integer
language sql immutable as $f$
  select (('x' || substr(md5('capacity-browsing-hash:' || key), 1, 8))::bit(32)::integer
    & 2147483647)
$f$;

do $$
declare
  offending text;
begin
  -- Slugs the seed would take from rows it does not own.
  if exists (select 1 from app.competitions
             where slug = 'capacity-browsing-league' and id <> pg_temp.cap_uuid('competition'))
    or exists (select 1 from app.teams where slug like 'capacity-browsing-club-%'
               and id not in (select pg_temp.cap_uuid('team-' || n) from generate_series(1, 16) n))
    or exists (select 1 from app.authors
               where slug = 'capacity-browsing-desk' and id <> pg_temp.cap_uuid('author')) then
    raise exception 'browsing_capacity_seed_slug_taken_by_another_row';
  end if;

  -- A current season is what the e-mail plans and the live refresh read.
  if exists (select 1 from app.seasons
             where id = pg_temp.cap_uuid('season') and is_current) then
    raise exception 'browsing_capacity_seed_refuses_current_synthetic_season';
  end if;

  select string_agg(format('%s.%s -> %s', c.oid::regclass, t.tgname, p.oid::regprocedure), ', ')
  into offending
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal
    and t.tgenabled <> 'D'
    and c.oid = any (array[
      'app.competitions', 'app.competition_translations', 'app.seasons', 'app.rounds',
      'app.venues', 'app.teams', 'app.team_translations', 'app.players', 'app.fixtures',
      'app.match_events', 'app.fixture_team_statistics', 'app.lineups', 'app.lineup_players',
      'app.fixture_pressure', 'app.fixture_absences', 'app.standings', 'app.authors',
      'app.taxonomies', 'app.taxonomy_translations', 'app.stories', 'app.story_teams',
      'app.story_competitions', 'app.story_taxonomies', 'app.story_players',
      'app.article_editions', 'app.editorial_placements', 'app.article_search_documents',
      'api.live_fixture_updates'
    ]::regclass[])
    and p.prosrc ~* '(notification|notify|net\.http_|http_request|enqueue|invoke_scheduled_function|e-?mail|push_)';
  if offending is not null then
    raise exception 'browsing_capacity_seed_refuses_side_effect_triggers: %', offending;
  end if;
end;
$$;

-- The anchor: the first run's minute, kept as the season's created_at.
create temp table cap_anchor on commit drop as
select at, (at at time zone 'UTC')::date as day0
from (
  select date_trunc('minute', coalesce(
    (select created_at from app.seasons where id = pg_temp.cap_uuid('season')),
    now()
  )) as at
) anchor;

-- ---------------------------------------------------------------------------
-- Football catalogue
-- ---------------------------------------------------------------------------

insert into app.competitions (
  id, slug, name, short_name, competition_type, country_id, active, display_order
)
select pg_temp.cap_uuid('competition'), 'capacity-browsing-league',
  'Capacity Browsing League', 'Capacity BL', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'), true, 998
on conflict do nothing;

insert into app.competition_translations (competition_id, language, display_name, short_name)
values
  (pg_temp.cap_uuid('competition'), 'fr', 'Capacity Ligue de navigation', 'Capacity LN'),
  (pg_temp.cap_uuid('competition'), 'ar', 'Capacity الدوري التجريبي', 'Capacity')
on conflict do nothing;

insert into app.seasons (
  id, competition_id, label, starts_on, ends_on, status, is_current, created_at, updated_at
)
select pg_temp.cap_uuid('season'), pg_temp.cap_uuid('competition'),
  'Capacity Browsing Season', anchor.day0 - 161, anchor.day0 + 63,
  'active', false, anchor.at, anchor.at
from cap_anchor anchor
on conflict do nothing;

insert into app.venues (id, slug, default_name, city, country_id, capacity)
select pg_temp.cap_uuid('venue-' || n),
  'capacity-browsing-stadium-' || lpad(n::text, 2, '0'),
  'Capacity Stadium ' || lpad(n::text, 2, '0'),
  'Capacity City ' || lpad(n::text, 2, '0'),
  (select id from app.countries where iso_alpha2 = 'MA'),
  8000 + n * 2500
from generate_series(1, 16) n
on conflict do nothing;

insert into app.teams (
  id, slug, name, short_name, code, country_id, city, venue_id,
  primary_color, secondary_color, active
)
select pg_temp.cap_uuid('team-' || n),
  'capacity-browsing-club-' || lpad(n::text, 2, '0'),
  'Capacity Browsing Club ' || lpad(n::text, 2, '0'),
  'Capacity ' || lpad(n::text, 2, '0'),
  'CB' || lpad(n::text, 2, '0'),
  (select id from app.countries where iso_alpha2 = 'MA'),
  'Capacity City ' || lpad(n::text, 2, '0'),
  pg_temp.cap_uuid('venue-' || n),
  '#' || substr(md5('capacity-browsing-primary-' || n), 1, 6),
  '#' || substr(md5('capacity-browsing-secondary-' || n), 1, 6),
  true
from generate_series(1, 16) n
on conflict do nothing;

insert into app.team_translations (team_id, language, name, short_name)
select pg_temp.cap_uuid('team-' || n), 'ar',
  'Capacity نادي ' || lpad(n::text, 2, '0'),
  'Capacity ' || lpad(n::text, 2, '0')
from generate_series(1, 16) n
on conflict do nothing;

-- 20 players a club: 1-11 start in a 4-3-3, 12-18 are the bench, 19 and 20
-- are the ones listed absent.
insert into app.players (id, slug, full_name, display_name, position, active)
select pg_temp.cap_uuid('player-' || team_no || '-' || n),
  'capacity-browsing-player-' || lpad(team_no::text, 2, '0') || '-' || lpad(n::text, 2, '0'),
  'Capacity Player ' || lpad(team_no::text, 2, '0') || '-' || lpad(n::text, 2, '0'),
  'Capacity P' || team_no || '-' || n,
  (case
    when n in (1, 12) then 'goalkeeper'
    when n between 2 and 5 or n in (13, 14, 19) then 'defender'
    when n between 6 and 8 or n in (15, 16, 20) then 'midfielder'
    else 'forward' end)::app.football_position,
  true
from generate_series(1, 16) team_no
cross join generate_series(1, 20) n
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The fixture plan (circle-method double round-robin)
-- ---------------------------------------------------------------------------

create temp table cap_fixture on commit drop as
with pairs as (
  select r0, i,
    case when i = 0 then 15 else (r0 + i) % 15 end as a,
    case when i = 0 then r0 else (r0 - i + 15) % 15 end as b,
    case when i = 0 then r0 % 2 = 0 else (i + r0) % 2 = 0 end as a_at_home
  from generate_series(0, 14) r0
  cross join generate_series(0, 7) i
), first_leg as (
  select r0 + 1 as round_no, i,
    (case when a_at_home then a else b end) + 1 as home_no,
    (case when a_at_home then b else a end) + 1 as away_no
  from pairs
), legs as (
  select round_no, i, home_no, away_no from first_leg
  union all
  select round_no + 15, i, away_no, home_no from first_leg
), timed as (
  select legs.*,
    (legs.round_no - 1) * 8 + legs.i + 1 as fixture_no,
    case
      when legs.round_no = 23 then
        (array[12, 28, 41, 55, 66, 79, 95, 108])[legs.i + 1]
    end as elapsed,
    case
      when legs.round_no = 23 then
        anchor.at - make_interval(mins => (array[12, 28, 41, 55, 66, 79, 95, 108])[legs.i + 1])
      else
        ((anchor.day0 + (legs.round_no - 23) * 7 + legs.i / 4)
          + time '15:00' + make_interval(hours => (legs.i % 4) * 2)) at time zone 'UTC'
    end as kickoff_at,
    anchor.at as anchor_at
  from legs cross join cap_anchor anchor
)
select timed.fixture_no, timed.round_no, timed.i, timed.home_no, timed.away_no,
  pg_temp.cap_uuid('fixture-' || timed.fixture_no) as id,
  pg_temp.cap_uuid('team-' || timed.home_no) as home_team_id,
  pg_temp.cap_uuid('team-' || timed.away_no) as away_team_id,
  pg_temp.cap_uuid('venue-' || timed.home_no) as venue_id,
  timed.kickoff_at,
  timed.anchor_at,
  (case
    when timed.fixture_no = 171 then 'postponed'
    when timed.round_no <= 22 then 'finished'
    when timed.round_no = 23 and timed.elapsed <= 47 then 'live_first_half'
    when timed.round_no = 23 and timed.elapsed <= 62 then 'half_time'
    when timed.round_no = 23 then 'live_second_half'
    else 'scheduled' end)::app.fixture_status as status,
  (case
    when timed.fixture_no = 171 then 'pre_match'
    when timed.round_no <= 22 then 'post_match'
    when timed.round_no = 23 and timed.elapsed <= 47 then 'first_half'
    when timed.round_no = 23 and timed.elapsed <= 62 then 'half_time'
    when timed.round_no = 23 then 'second_half'
    else 'pre_match' end)::app.fixture_period as period,
  case
    when timed.round_no = 23 and timed.elapsed <= 47 then least(timed.elapsed, 45)
    when timed.round_no = 23 and timed.elapsed <= 62 then 45
    when timed.round_no = 23 then least(timed.elapsed - 17, 90)
    when timed.round_no <= 22 and timed.fixture_no <> 171 then 90
  end as minute,
  case
    when timed.round_no = 23 and timed.elapsed <= 47 then nullif(greatest(timed.elapsed - 45, 0), 0)
    when timed.round_no = 23 and timed.elapsed > 62 then nullif(greatest(timed.elapsed - 17 - 90, 0), 0)
  end as added_time,
  -- The last minute whose events have happened (null: nothing played).
  case
    when timed.fixture_no = 171 then null
    when timed.round_no <= 22 then 90
    when timed.round_no = 23 and timed.elapsed <= 47 then least(timed.elapsed, 45)
    when timed.round_no = 23 and timed.elapsed <= 62 then 45
    when timed.round_no = 23 then least(timed.elapsed - 17, 90)
  end as played_to
from timed;

-- Goals planned for the whole match; those after played_to have not happened.
create temp table cap_goal on commit drop as
select fixture.fixture_no, fixture.id as fixture_id, side.side, side.team_no, k,
  1 + pg_temp.cap_hash('goal-minute-' || fixture.fixture_no || '-' || side.side || '-' || k) % 90 as minute,
  pg_temp.cap_hash('goal-kind-' || fixture.fixture_no || '-' || side.side || '-' || k) % 12 = 0 as penalty,
  6 + pg_temp.cap_hash('goal-scorer-' || fixture.fixture_no || '-' || side.side || '-' || k) % 6 as scorer_no,
  pg_temp.cap_hash('goal-assist-' || fixture.fixture_no || '-' || side.side || '-' || k) % 5 as assist_shift
from cap_fixture fixture
cross join lateral (values ('home', fixture.home_no), ('away', fixture.away_no)) side(side, team_no)
cross join lateral generate_series(1, case
  when pg_temp.cap_hash('goals-' || fixture.fixture_no || '-' || side.side) % 100 < 28 then 0
  when pg_temp.cap_hash('goals-' || fixture.fixture_no || '-' || side.side) % 100 < 60 then 1
  when pg_temp.cap_hash('goals-' || fixture.fixture_no || '-' || side.side) % 100 < 82 then 2
  when pg_temp.cap_hash('goals-' || fixture.fixture_no || '-' || side.side) % 100 < 94 then 3
  else 4 end) k
where fixture.played_to is not null;

delete from cap_goal goal
using cap_fixture fixture
where fixture.fixture_no = goal.fixture_no and goal.minute > fixture.played_to;

-- One row per played fixture and side, with the numbers the statistics use.
create temp table cap_side on commit drop as
select fixture.fixture_no, fixture.id as fixture_id, fixture.status, fixture.kickoff_at,
  fixture.anchor_at, side.side, side.team_no, pg_temp.cap_uuid('team-' || side.team_no) as team_id,
  fixture.played_to,
  fixture.played_to / 90.0 as share,
  (select count(*) from cap_goal goal
   where goal.fixture_no = fixture.fixture_no and goal.side = side.side)::integer as goals,
  (select count(*) from cap_goal goal
   where goal.fixture_no = fixture.fixture_no and goal.side = side.side and goal.minute <= 45)::integer as half_time_goals,
  (select count(*) from cap_goal goal
   where goal.fixture_no = fixture.fixture_no and goal.side <> side.side)::integer as goals_against
from cap_fixture fixture
cross join lateral (values ('home', fixture.home_no), ('away', fixture.away_no)) side(side, team_no)
where fixture.played_to is not null;

alter table cap_side add column shots integer, add column on_target integer;
update cap_side set
  shots = greatest(goals, round((6 + pg_temp.cap_hash('shots-' || fixture_no || '-' || side) % 14) * share)::integer),
  on_target = 0;
update cap_side set
  on_target = least(shots, greatest(goals, round(shots * (0.30 + (pg_temp.cap_hash('accuracy-' || fixture_no || '-' || side) % 20) / 100.0))::integer));

-- ---------------------------------------------------------------------------
-- Rounds and fixtures
-- ---------------------------------------------------------------------------

insert into app.rounds (id, season_id, round_number, name, starts_at, ends_at, status)
select pg_temp.cap_uuid('round-' || round_no), pg_temp.cap_uuid('season'), round_no,
  'Capacity Round ' || round_no, min(kickoff_at), max(kickoff_at) + interval '2 hours',
  (case when round_no <= 22 then 'completed' when round_no = 23 then 'active'
    else 'planned' end)::app.round_status
from cap_fixture
group by round_no
on conflict do nothing;

insert into app.fixtures (
  id, competition_id, season_id, round_id, home_team_id, away_team_id, venue_id,
  kickoff_at, status, period, minute, added_time, home_score, away_score,
  half_time_home_score, half_time_away_score, winner_team_id, attendance,
  provider_updated_at, source_sequence, source_version, finalized_at,
  created_at, updated_at
)
select fixture.id, pg_temp.cap_uuid('competition'), pg_temp.cap_uuid('season'),
  pg_temp.cap_uuid('round-' || fixture.round_no), fixture.home_team_id,
  fixture.away_team_id, fixture.venue_id, fixture.kickoff_at, fixture.status,
  fixture.period, fixture.minute, fixture.added_time,
  home.goals, away.goals,
  case when fixture.played_to >= 45 then home.half_time_goals end,
  case when fixture.played_to >= 45 then away.half_time_goals end,
  case when fixture.status = 'finished' and home.goals > away.goals then fixture.home_team_id
    when fixture.status = 'finished' and away.goals > home.goals then fixture.away_team_id end,
  case when fixture.played_to is not null
    then 3000 + pg_temp.cap_hash('attendance-' || fixture.fixture_no) % 40000 end,
  case when fixture.status = 'finished' then fixture.kickoff_at + interval '115 minutes'
    else fixture.anchor_at end,
  1, 'capacity-seed-v1',
  case when fixture.status = 'finished' then fixture.kickoff_at + interval '115 minutes' end,
  fixture.anchor_at, fixture.anchor_at
from cap_fixture fixture
left join cap_side home on home.fixture_no = fixture.fixture_no and home.side = 'home'
left join cap_side away on away.fixture_no = fixture.fixture_no and away.side = 'away'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Match details: timeline, statistics, lineups, pressure, absences
-- ---------------------------------------------------------------------------

create temp table cap_event on commit drop as
-- Period markers.
select fixture.fixture_no, fixture.id as fixture_id, marker.event_key,
  marker.event_type::app.match_event_type, null::uuid as team_id, null::uuid as player_id,
  null::uuid as related_player_id, null::text as detail, marker.minute,
  marker.period::app.fixture_period, marker.sort_key
from cap_fixture fixture
cross join lateral (values
  ('period:first_half:start', 'period_start', 0, 'first_half', 0, true),
  ('period:first_half:end', 'period_end', 45, 'first_half', 9, fixture.played_to >= 45 and fixture.status <> 'live_first_half'),
  ('period:second_half:start', 'period_start', 46, 'second_half', 0, fixture.status in ('finished', 'live_second_half')),
  ('period:second_half:end', 'period_end', 90, 'second_half', 9, fixture.status = 'finished')
) marker(event_key, event_type, minute, period, sort_key, happened)
where fixture.played_to is not null and marker.happened
union all
-- Goals, with the assist on open-play goals.
select goal.fixture_no, goal.fixture_id, 'goal:' || goal.side || ':' || goal.k,
  (case when goal.penalty then 'penalty_goal' else 'goal' end)::app.match_event_type,
  pg_temp.cap_uuid('team-' || goal.team_no),
  pg_temp.cap_uuid('player-' || goal.team_no || '-' || goal.scorer_no),
  case when not goal.penalty then
    pg_temp.cap_uuid('player-' || goal.team_no || '-' || (6 + (goal.scorer_no - 6 + 1 + goal.assist_shift) % 6))
  end,
  case when goal.penalty then 'Penalty' else 'Normal Goal' end,
  goal.minute,
  (case when goal.minute <= 45 then 'first_half' else 'second_half' end)::app.fixture_period,
  5
from cap_goal goal
union all
-- Yellow cards.
select side.fixture_no, side.fixture_id, 'card:' || side.side || ':' || k, 'yellow_card',
  side.team_id,
  pg_temp.cap_uuid('player-' || side.team_no || '-' || (2 + pg_temp.cap_hash('card-player-' || side.fixture_no || '-' || side.side || '-' || k) % 10)),
  null, 'Foul', card.minute,
  (case when card.minute <= 45 then 'first_half' else 'second_half' end)::app.fixture_period,
  6
from cap_side side
cross join lateral generate_series(1, pg_temp.cap_hash('cards-' || side.fixture_no || '-' || side.side) % 4) k
cross join lateral (select 5 + pg_temp.cap_hash('card-minute-' || side.fixture_no || '-' || side.side || '-' || k) % 85 as minute) card
where card.minute <= side.played_to
union all
-- Three substitutions a side: the player coming on, and the one going off.
select side.fixture_no, side.fixture_id, 'substitution:' || side.side || ':' || k, 'substitution',
  side.team_id,
  pg_temp.cap_uuid('player-' || side.team_no || '-' || (array[15, 17, 18])[k]),
  pg_temp.cap_uuid('player-' || side.team_no || '-' || (array[7, 9, 10])[k]),
  'Tactical', swap.minute, 'second_half', 7
from cap_side side
cross join generate_series(1, 3) k
cross join lateral (select 58 + pg_temp.cap_hash('sub-minute-' || side.fixture_no || '-' || side.side || '-' || k) % 27 as minute) swap
where swap.minute <= side.played_to;

insert into app.match_events (
  id, fixture_id, team_id, player_id, related_player_id, event_type, detail,
  minute, added_time, sequence_number, period, idempotency_key,
  provider_updated_at, source_sequence
)
select pg_temp.cap_uuid('event-' || event.fixture_no || '-' || event.event_key),
  event.fixture_id, event.team_id, event.player_id, event.related_player_id,
  event.event_type, event.detail, event.minute, 0,
  row_number() over (partition by event.fixture_id
    order by event.period, event.minute, event.sort_key, event.event_key)::integer,
  event.period, 'capacity:' || event.event_key,
  fixture.anchor_at, 1
from cap_event event
join cap_fixture fixture on fixture.fixture_no = event.fixture_no
on conflict do nothing;

insert into app.fixture_team_statistics (
  id, fixture_id, team_id, statistic_definition_id, numeric_value, display_value,
  provider_updated_at, source_sequence
)
select pg_temp.cap_uuid('statistic-' || side.fixture_no || '-' || side.side || '-' || definition.code),
  side.fixture_id, side.team_id, definition.id, value.numeric_value,
  case when definition.value_type = 'percentage' then round(value.numeric_value)::text || '%'
    else value.numeric_value::text end,
  side.anchor_at, 1
from cap_side side
join cap_side opponent on opponent.fixture_no = side.fixture_no and opponent.side <> side.side
cross join lateral (
  select
    case when side.side = 'home'
      then 38 + pg_temp.cap_hash('possession-' || side.fixture_no) % 25
      else 100 - (38 + pg_temp.cap_hash('possession-' || side.fixture_no) % 25) end as possession
) split
cross join lateral (values
  ('possession', split.possession::numeric),
  ('expected_goals', round(side.shots * 0.11 + side.goals * 0.2, 2)),
  ('expected_goals_on_target', round(side.on_target * 0.32, 2)),
  ('shots', side.shots::numeric),
  ('shots_on_target', side.on_target::numeric),
  ('corners', round((1 + pg_temp.cap_hash('corners-' || side.fixture_no || '-' || side.side) % 9) * side.share)),
  ('fouls', round((7 + pg_temp.cap_hash('fouls-' || side.fixture_no || '-' || side.side) % 12) * side.share)),
  ('offsides', round((pg_temp.cap_hash('offsides-' || side.fixture_no || '-' || side.side) % 5) * side.share)),
  ('saves', greatest(opponent.on_target - opponent.goals, 0)::numeric),
  ('passes', round((200 + split.possession * 6 + pg_temp.cap_hash('passes-' || side.fixture_no || '-' || side.side) % 80) * side.share)),
  ('pass_accuracy', (68 + pg_temp.cap_hash('pass-accuracy-' || side.fixture_no || '-' || side.side) % 22)::numeric)
) value(code, numeric_value)
join app.statistic_definitions definition on definition.code = value.code and definition.active
on conflict do nothing;

insert into app.lineups (
  id, fixture_id, team_id, formation, confirmed, published_at, provider_updated_at, source_sequence
)
select pg_temp.cap_uuid('lineup-' || side.fixture_no || '-' || side.side),
  side.fixture_id, side.team_id, '4-3-3', true,
  side.kickoff_at - interval '1 hour', side.kickoff_at - interval '1 hour', 1
from cap_side side
on conflict do nothing;

insert into app.lineup_players (
  id, lineup_id, player_id, slot, position, shirt_number, display_order, captain
)
select pg_temp.cap_uuid('lineup-player-' || side.fixture_no || '-' || side.side || '-' || n),
  pg_temp.cap_uuid('lineup-' || side.fixture_no || '-' || side.side),
  pg_temp.cap_uuid('player-' || side.team_no || '-' || n),
  (case when n <= 11 then 'starting' else 'bench' end)::app.lineup_slot,
  (case
    when n in (1, 12) then 'goalkeeper'
    when n between 2 and 5 or n in (13, 14) then 'defender'
    when n between 6 and 8 or n in (15, 16) then 'midfielder'
    else 'forward' end)::app.football_position,
  n, case when n <= 11 then n else n - 11 end, n = 4
from cap_side side
cross join generate_series(1, 18) n
on conflict do nothing;

insert into app.fixture_pressure (
  fixture_id, team_id, minute, pressure, provider_updated_at, source_sequence
)
select side.fixture_id, side.team_id, minute,
  round((20 + pg_temp.cap_hash('pressure-base-' || side.fixture_no || '-' || side.side) % 30
    + pg_temp.cap_hash('pressure-' || side.fixture_no || '-' || side.side || '-' || minute) % 45)::numeric, 3),
  side.anchor_at, 1
from cap_side side
cross join lateral generate_series(1, side.played_to) minute
on conflict do nothing;

insert into app.fixture_absences (
  id, fixture_id, team_id, player_id, category, expected_return_on, games_missed,
  provider_key, provider_updated_at, source_sequence
)
select pg_temp.cap_uuid('absence-' || fixture.fixture_no || '-' || side.side || '-' || absent.n),
  fixture.id, pg_temp.cap_uuid('team-' || side.team_no),
  pg_temp.cap_uuid('player-' || side.team_no || '-' || absent.n),
  absent.category,
  case when absent.category = 'injury' then
    (fixture.kickoff_at at time zone 'UTC')::date + 7
      + pg_temp.cap_hash('absence-return-' || fixture.fixture_no || '-' || side.side) % 21
  end,
  1 + pg_temp.cap_hash('absence-games-' || fixture.fixture_no || '-' || side.side || '-' || absent.n) % 4,
  'capacity-absence-' || side.side || '-' || absent.n, fixture.anchor_at, 1
from cap_fixture fixture
cross join lateral (values ('home', fixture.home_no), ('away', fixture.away_no)) side(side, team_no)
cross join lateral (values (19, 'injury', 3), (20, 'suspension', 5)) absent(n, category, every)
where pg_temp.cap_hash('absence-' || fixture.fixture_no || '-' || side.side || '-' || absent.n) % absent.every = 0
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Standings, computed from the finished fixtures
-- ---------------------------------------------------------------------------

insert into app.standings (
  id, competition_id, season_id, group_key, table_type, team_id, rank,
  played, won, drawn, lost, goals_for, goals_against, points, form,
  qualification_code, provider_updated_at, source_sequence
)
with results as (
  select side.team_no, side.side, side.kickoff_at, side.goals, side.goals_against,
    case when side.goals > side.goals_against then 'W'
      when side.goals = side.goals_against then 'D' else 'L' end as result
  from cap_side side
  where side.status = 'finished'
), per_table as (
  select table_type, results.*
  from results
  cross join (values ('overall'), ('home'), ('away')) tables(table_type)
  where table_type = 'overall' or table_type = results.side
), totals as (
  select table_type, team_no,
    count(*)::integer as played,
    count(*) filter (where result = 'W')::integer as won,
    count(*) filter (where result = 'D')::integer as drawn,
    count(*) filter (where result = 'L')::integer as lost,
    sum(goals)::integer as goals_for,
    sum(goals_against)::integer as goals_against,
    (3 * count(*) filter (where result = 'W') + count(*) filter (where result = 'D'))::integer as points,
    (select string_agg(recent.result, '' order by recent.kickoff_at)
     from (
       select inner_rows.result, inner_rows.kickoff_at from per_table inner_rows
       where inner_rows.table_type = per_table.table_type and inner_rows.team_no = per_table.team_no
       order by inner_rows.kickoff_at desc limit 5
     ) recent) as form
  from per_table
  group by table_type, team_no
), ranked as (
  select totals.*,
    row_number() over (partition by table_type
      order by points desc, goals_for - goals_against desc, goals_for desc, team_no)::integer as rank
  from totals
)
select pg_temp.cap_uuid('standing-' || ranked.table_type || '-' || ranked.team_no),
  pg_temp.cap_uuid('competition'), pg_temp.cap_uuid('season'), '', ranked.table_type,
  pg_temp.cap_uuid('team-' || ranked.team_no), ranked.rank, ranked.played, ranked.won,
  ranked.drawn, ranked.lost, ranked.goals_for, ranked.goals_against, ranked.points,
  ranked.form,
  case when ranked.table_type <> 'overall' then null
    when ranked.rank <= 2 then 'caf_champions_league'
    when ranked.rank = 3 then 'caf_confederation_cup'
    when ranked.rank >= 15 then 'relegation' end,
  anchor.at, 1
from ranked cross join cap_anchor anchor
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- News
-- ---------------------------------------------------------------------------

insert into app.authors (id, slug, display_name, author_type, biography, active)
values (pg_temp.cap_uuid('author'), 'capacity-browsing-desk', 'Capacity Desk', 'staff',
  'Synthetic author of the Staging V2 browsing capacity seed.', true)
on conflict do nothing;

insert into app.taxonomies (id, taxonomy_type, slug, active, display_order)
select pg_temp.cap_uuid('taxonomy-' || kind || '-' || slug), kind::app.taxonomy_type, slug,
  true, 9000 + position
from (values
  ('category', 'capacity-matchday', 1, 'Capacity Journée', 'Capacity يوم المباريات'),
  ('category', 'capacity-transfers', 2, 'Capacity Mercato', 'Capacity الانتقالات'),
  ('category', 'capacity-analysis', 3, 'Capacity Analyse', 'Capacity تحليل'),
  ('topic', 'capacity-title-race', 1, 'Capacity Course au titre', 'Capacity سباق اللقب'),
  ('topic', 'capacity-youth', 2, 'Capacity Jeunes', 'Capacity الشباب'),
  ('topic', 'capacity-injuries', 3, 'Capacity Blessures', 'Capacity الإصابات'),
  ('topic', 'capacity-tactics', 4, 'Capacity Tactique', 'Capacity التكتيك'),
  ('tag', 'capacity-derby', 1, 'Capacity Derby', 'Capacity ديربي'),
  ('tag', 'capacity-interview', 2, 'Capacity Entretien', 'Capacity حوار'),
  ('tag', 'capacity-preview', 3, 'Capacity Avant-match', 'Capacity ما قبل المباراة'),
  ('tag', 'capacity-report', 4, 'Capacity Compte rendu', 'Capacity تقرير'),
  ('tag', 'capacity-stats', 5, 'Capacity Statistiques', 'Capacity إحصائيات'),
  ('tag', 'capacity-fans', 6, 'Capacity Supporters', 'Capacity الجماهير')
) taxonomy(kind, slug, position, name_fr, name_ar)
on conflict do nothing;

insert into app.taxonomy_translations (taxonomy_id, language, display_name)
select pg_temp.cap_uuid('taxonomy-' || kind || '-' || slug), language::app.language_code, name
from (values
  ('category', 'capacity-matchday', 'Capacity Journée', 'Capacity يوم المباريات'),
  ('category', 'capacity-transfers', 'Capacity Mercato', 'Capacity الانتقالات'),
  ('category', 'capacity-analysis', 'Capacity Analyse', 'Capacity تحليل'),
  ('topic', 'capacity-title-race', 'Capacity Course au titre', 'Capacity سباق اللقب'),
  ('topic', 'capacity-youth', 'Capacity Jeunes', 'Capacity الشباب'),
  ('topic', 'capacity-injuries', 'Capacity Blessures', 'Capacity الإصابات'),
  ('topic', 'capacity-tactics', 'Capacity Tactique', 'Capacity التكتيك'),
  ('tag', 'capacity-derby', 'Capacity Derby', 'Capacity ديربي'),
  ('tag', 'capacity-interview', 'Capacity Entretien', 'Capacity حوار'),
  ('tag', 'capacity-preview', 'Capacity Avant-match', 'Capacity ما قبل المباراة'),
  ('tag', 'capacity-report', 'Capacity Compte rendu', 'Capacity تقرير'),
  ('tag', 'capacity-stats', 'Capacity Statistiques', 'Capacity إحصائيات'),
  ('tag', 'capacity-fans', 'Capacity Supporters', 'Capacity الجماهير')
) taxonomy(kind, slug, name_fr, name_ar)
cross join lateral (values ('fr', name_fr), ('ar', name_ar)) translated(language, name)
on conflict do nothing;

-- The story plan: 2,000 stories, one every 43 minutes back from the anchor.
create temp table cap_story on commit drop as
select n, pg_temp.cap_uuid('story-' || n) as id,
  (case when n % 5 = 0 then 'ar' else 'fr' end)::app.language_code as original_language,
  ((n - 1) % 16) + 1 as team_a,
  case when n % 3 = 0 and ((n * 7 + 3) % 16) + 1 <> ((n - 1) % 16) + 1
    then ((n * 7 + 3) % 16) + 1 end as team_b,
  ((n * 5 + 8) % 16) + 1 as opponent,
  anchor.at - make_interval(mins => 7 + (n - 1) * 43) as published_at
from generate_series(1, 2000) n
cross join cap_anchor anchor;

insert into app.stories (id, origin, original_language, author_id, created_at, updated_at)
select story.id, 'manual', story.original_language, pg_temp.cap_uuid('author'),
  story.published_at - interval '30 minutes', story.published_at
from cap_story story
on conflict do nothing;

-- Every story is tagged by an "editor" before its editions exist, so the
-- headline re-tagging trigger leaves it alone and the search documents are
-- built once, when the editions are inserted.
insert into app.story_teams (story_id, team_id, tagged_by, created_at)
select story.id, pg_temp.cap_uuid('team-' || team.team_no), 'editor', story.published_at
from cap_story story
cross join lateral (values (story.team_a), (story.team_b)) team(team_no)
where team.team_no is not null
on conflict do nothing;

insert into app.story_competitions (story_id, competition_id, created_at)
select story.id, pg_temp.cap_uuid('competition'), story.published_at
from cap_story story
on conflict do nothing;

insert into app.story_taxonomies (story_id, taxonomy_id, is_primary, created_at)
select story.id, pg_temp.cap_uuid('taxonomy-' || link.kind || '-' || link.slug), link.is_primary,
  story.published_at
from cap_story story
cross join lateral (values
  ('category', (array['capacity-matchday', 'capacity-transfers', 'capacity-analysis'])[story.n % 3 + 1], true),
  ('topic', (array['capacity-title-race', 'capacity-youth', 'capacity-injuries', 'capacity-tactics'])[story.n % 4 + 1], false),
  ('tag', (array['capacity-derby', 'capacity-interview', 'capacity-preview', 'capacity-report', 'capacity-stats', 'capacity-fans'])[story.n % 6 + 1], false),
  ('tag', case when story.n % 2 = 0 then
    (array['capacity-derby', 'capacity-interview', 'capacity-preview', 'capacity-report', 'capacity-stats', 'capacity-fans'])[(story.n + 2) % 6 + 1] end, false)
) link(kind, slug, is_primary)
where link.slug is not null
on conflict do nothing;

insert into app.story_players (story_id, player_id, created_at)
select story.id, pg_temp.cap_uuid('player-' || story.team_a || '-' || (9 + story.n % 3)), story.published_at
from cap_story story
where story.n % 4 = 0
on conflict do nothing;

insert into app.article_editions (
  id, story_id, language, slug, title, subtitle, summary, body_format, body_source,
  body_html, status, visibility, published_at, reading_time_minutes, seo_title,
  seo_description, sanitizer_version, source_updated_at, created_at, updated_at
)
select pg_temp.cap_uuid('edition-' || story.n || '-' || edition.language),
  story.id, edition.language::app.language_code,
  'capacity-browsing-article-' || lpad(story.n::text, 4, '0'),
  edition.title, edition.subtitle, edition.summary, 'rich_text', null, edition.body_html,
  'published', 'public', edition.published_at, 2 + story.n % 7,
  left(edition.title, 70), left(edition.summary, 170), 'capacity-seed-v1', null,
  edition.published_at, edition.published_at
from cap_story story
cross join lateral (
  select
    'Capacity Browsing Club ' || lpad(story.team_a::text, 2, '0') as club_fr,
    'Capacity Browsing Club ' || lpad(story.opponent::text, 2, '0') as other_fr,
    'Capacity نادي ' || lpad(story.team_a::text, 2, '0') as club_ar,
    'Capacity نادي ' || lpad(story.opponent::text, 2, '0') as other_ar
) names
cross join lateral (values
  ('fr',
    'Capacity : ' || (array[
      names.club_fr || ' s''impose face à ' || names.other_fr,
      'les enseignements de ' || names.club_fr || ' – ' || names.other_fr,
      names.club_fr || ' prépare la réception de ' || names.other_fr,
      'mercato, ' || names.club_fr || ' surveille un milieu de terrain',
      'blessure à ' || names.club_fr || ', le point avant ' || names.other_fr,
      'entretien avec l''entraîneur de ' || names.club_fr
    ])[story.n % 6 + 1] || ' (n° ' || story.n || ')',
    case when story.n % 3 = 0 then 'Capacity : contenu synthétique pour le test de charge de navigation' end,
    'Capacity : article synthétique n° ' || story.n || ' consacré à ' || names.club_fr
      || ', publié pour le test de charge de navigation de Staging V2.',
    '<h2>Capacity</h2>' || repeat('<p>' || repeat('Texte synthétique Capacity pour le test de charge de navigation de BotolaGO sur Staging V2. ', 6) || '</p>', 4),
    story.published_at + case when story.original_language = 'fr' then interval '0' else interval '2 minutes' end),
  ('ar',
    'Capacity: ' || (array[
      names.club_ar || ' يتفوق على ' || names.other_ar,
      'دروس مباراة ' || names.club_ar || ' و' || names.other_ar,
      names.club_ar || ' يستعد لاستقبال ' || names.other_ar,
      names.club_ar || ' يراقب لاعب وسط في سوق الانتقالات',
      'إصابة في صفوف ' || names.club_ar || ' قبل مواجهة ' || names.other_ar,
      'حوار مع مدرب ' || names.club_ar
    ])[story.n % 6 + 1] || ' (رقم ' || story.n || ')',
    case when story.n % 3 = 0 then 'Capacity: محتوى تجريبي لاختبار التحميل' end,
    'Capacity: مقال تجريبي رقم ' || story.n || ' حول ' || names.club_ar
      || '، منشور لاختبار التحميل على بيئة Staging V2.',
    '<h2>Capacity</h2>' || repeat('<p>' || repeat('نص تجريبي Capacity لاختبار التحميل على منصة BotolaGO في بيئة Staging V2. ', 6) || '</p>', 4),
    story.published_at + case when story.original_language = 'ar' then interval '0' else interval '2 minutes' end)
) edition(language, title, subtitle, summary, body_html, published_at)
on conflict do nothing;

-- Home modules: featured, editors' picks and trending in both languages, and
-- the lead where the language has none running.
insert into app.editorial_placements (
  id, article_edition_id, placement_type, language, scope_type, priority, starts_at
)
select pg_temp.cap_uuid('placement-' || placement.kind || '-' || language.code || '-' || placement.n),
  pg_temp.cap_uuid('edition-' || placement.n || '-' || language.code),
  placement.kind::app.placement_type, language.code::app.language_code, 'global',
  900 + placement.n, anchor.at - interval '1 day'
from (
  select 'featured' as kind, n from generate_series(2, 7) n
  union all select 'editors_pick', n from generate_series(8, 11) n
  union all select 'trending', n from generate_series(12, 17) n
) placement
cross join (values ('fr'), ('ar')) language(code)
cross join cap_anchor anchor
on conflict do nothing;

insert into app.editorial_placements (
  id, article_edition_id, placement_type, language, scope_type, priority, starts_at
)
select pg_temp.cap_uuid('placement-home_lead-' || language.code || '-1'),
  pg_temp.cap_uuid('edition-1-' || language.code), 'home_lead',
  language.code::app.language_code, 'global', 900, anchor.at - interval '1 day'
from (values ('fr'), ('ar')) language(code)
cross join cap_anchor anchor
where not exists (
  select 1 from app.editorial_placements existing
  where existing.placement_type = 'home_lead'
    and existing.language = language.code::app.language_code
    and existing.scope_type = 'global'
    and (existing.ends_at is null or existing.ends_at > anchor.at - interval '1 day')
)
on conflict do nothing;

commit;

analyze app.fixtures;
analyze app.match_events;
analyze app.fixture_team_statistics;
analyze app.lineup_players;
analyze app.fixture_pressure;
analyze app.standings;
analyze app.stories;
analyze app.article_editions;
analyze app.story_teams;
analyze app.story_taxonomies;
analyze app.article_search_documents;

-- The ids a load runner starts from (every other id is discoverable through
-- the public API: see the fixture and news listings).
select jsonb_build_object(
  'competitionId', season.competition_id,
  'seasonId', season.id,
  'isCurrent', season.is_current,
  'anchor', season.created_at,
  'fixtures', (select count(*) from app.fixtures where season_id = season.id),
  'finished', (select count(*) from app.fixtures where season_id = season.id and status = 'finished'),
  'live', (select count(*) from app.fixtures where season_id = season.id
    and status in ('live_first_half', 'half_time', 'live_second_half')),
  'scheduled', (select count(*) from app.fixtures where season_id = season.id and status = 'scheduled'),
  'postponed', (select count(*) from app.fixtures where season_id = season.id and status = 'postponed'),
  'matchEvents', (select count(*) from app.match_events event
    join app.fixtures fixture on fixture.id = event.fixture_id where fixture.season_id = season.id),
  'standings', (select count(*) from app.standings where season_id = season.id),
  'stories', (select count(*) from app.stories where author_id = pg_temp.cap_uuid('author')),
  'editions', (select count(*) from app.article_editions edition
    join app.stories story on story.id = edition.story_id
    where story.author_id = pg_temp.cap_uuid('author'))
) as browsing_seed_profile
from app.seasons season
where season.id = pg_temp.cap_uuid('season');
