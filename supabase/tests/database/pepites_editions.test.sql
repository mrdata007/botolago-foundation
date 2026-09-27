begin;

select extensions.no_plan();

-- Pépites weekly editions and the tick (20260926100000).
-- A generated league plays week by week; the tick is driven with explicit
-- times (Africa/Casablanca is UTC+1 in autumn 2026). Concurrency with two
-- connections is in scripts/backend/pepites-editions-concurrency.test.ts.

create function pg_temp.uid(p_prefix text, p_n integer)
returns uuid language sql immutable as $$
  select (p_prefix || lpad(p_n::text, 12, '0'))::uuid;
$$;

-- ===========================================================================
-- League: 8 teams of 14 (shirt 1 GK, 2-5 DEF, 6-9 MID, 10-14 FWD); even
-- shirts and the goalkeepers of odd teams are under 23. Round r is played on
-- the Sunday 30 Aug + 7r days, 17:00-20:00 UTC, final two hours later.
-- ===========================================================================
insert into app.competitions (id, slug, name, competition_type)
values ('f0000000-0000-4000-8000-000000000001', 'editions-league', 'Editions League', 'league');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, is_current, status)
values ('f0100000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
  '2026/2027', '2026-07-01', '2027-06-30', true, 'active');

insert into app.teams (id, slug, name, short_name)
select pg_temp.uid('f1000000-0000-4000-8000-', t), 'editions-team-' || t, 'Editions Team ' || t, 'ET' || t
from generate_series(1, 8) t;

insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.uid('f2000000-0000-4000-8000-', (t - 1) * 14 + k),
  'editions-player-' || ((t - 1) * 14 + k), 'Editions Player ' || ((t - 1) * 14 + k),
  'E. ' || ((t - 1) * 14 + k),
  case when k = 1 then 'goalkeeper' when k <= 5 then 'defender' when k <= 9 then 'midfielder'
    else 'forward' end::app.football_position
from generate_series(1, 8) t cross join generate_series(1, 14) k;

do $$
declare
  v_p integer;
begin
  for v_p in 1..112 loop
    perform app_private.record_player_attribute_observation(
      pg_temp.uid('f2000000-0000-4000-8000-', v_p), 'date_of_birth',
      case when v_p % 2 = 0 or (v_p % 14 = 1 and ((v_p - 1) / 14) % 2 = 0)
        then (date '2004-01-01' + v_p)::text else (date '1995-01-01' + v_p)::text end,
      null, 'provider', 'sportsmonks', 'editions-test', '2026-08-01T00:00:00Z');
  end loop;
  perform app_private.resolve_player_attributes(array(
    select pg_temp.uid('f2000000-0000-4000-8000-', n) from generate_series(1, 112) n));
end;
$$;

insert into app.team_memberships (player_id, team_id, season_id, valid_from, active)
select pg_temp.uid('f2000000-0000-4000-8000-', (t - 1) * 14 + k), pg_temp.uid('f1000000-0000-4000-8000-', t),
  'f0100000-0000-4000-8000-000000000001', '2026-07-01', true
from generate_series(1, 8) t cross join generate_series(1, 14) k;

insert into app.rounds (id, season_id, round_number, name)
select pg_temp.uid('f3000000-0000-4000-8000-', r), 'f0100000-0000-4000-8000-000000000001', r, 'Journée ' || r
from generate_series(1, 6) r;

-- Every player of both teams plays a finished fixture: shirts 1-11 start
-- (90'), 12-14 come on for 15'.
create function pg_temp.play(p_fixture_id uuid)
returns void language sql as $$
  insert into app.player_fixture_performances (
    football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
    started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves, penalties_saved,
    penalties_missed, yellow_cards, red_cards, second_yellow_dismissals, own_goals, provider_rating,
    provider_observed_at
  )
  select fixture.season_id, fixture.id, player.id, side.team_id, player.position, 'sportsmonks',
    'sportsmonks:' || encode(extensions.digest(fixture.id::text || player.id::text, 'sha256'), 'hex'),
    k <= 11, true, case when k <= 11 then 90 else 15 end,
    case when k >= 7 and (p + round.round_number) % 5 = 0 then 1 else 0 end,
    case when k >= 5 and (p * 3 + round.round_number) % 7 = 0 then 1 else 0 end,
    0, 0, case when k = 1 then (p + round.round_number) % 5 else 0 end, 0, 0, 0, 0, 0, 0,
    6.0 + ((p * 7 + round.round_number * 3) % 25) / 10.0, fixture.finalized_at
  from app.fixtures fixture
  join app.rounds round on round.id = fixture.round_id
  cross join lateral (values (fixture.home_team_id), (fixture.away_team_id)) side(team_id)
  cross join generate_series(1, 14) k
  cross join lateral (
    select ((substring(side.team_id::text from 25))::integer - 1) * 14 + k as p
  ) numbering
  join app.players player on player.id = pg_temp.uid('f2000000-0000-4000-8000-', numbering.p)
  where fixture.id = p_fixture_id;
$$;

-- A round's four fixtures; p_postpone names one left postponed.
create function pg_temp.add_round(p_round integer, p_postpone integer default 0)
returns void language plpgsql as $$
declare
  v_order integer[];
  v_i integer;
  v_fixture_id uuid;
  v_kickoff timestamptz;
begin
  v_order := array[1] || (
    select array_agg(((x - 2 + p_round - 1) % 7) + 2 order by x) from generate_series(2, 8) x);
  for v_i in 1..4 loop
    v_fixture_id := pg_temp.uid('f4000000-0000-4000-8000-', p_round * 10 + v_i);
    v_kickoff := timestamptz '2026-08-30 16:00:00+00' + (p_round * 7 || ' days')::interval
      + (v_i || ' hours')::interval;
    insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
      kickoff_at, provider_updated_at, status, home_score, away_score, finalized_at)
    values (v_fixture_id, 'f0000000-0000-4000-8000-000000000001', 'f0100000-0000-4000-8000-000000000001',
      pg_temp.uid('f3000000-0000-4000-8000-', p_round),
      pg_temp.uid('f1000000-0000-4000-8000-', v_order[v_i]),
      pg_temp.uid('f1000000-0000-4000-8000-', v_order[9 - v_i]),
      v_kickoff, v_kickoff + interval '2 hours',
      case when v_i = p_postpone then 'postponed' else 'finished' end::app.fixture_status,
      case when v_i = p_postpone then null else (p_round * 3 + v_i) % 3 end,
      case when v_i = p_postpone then null else (p_round + v_i * 2) % 2 end,
      case when v_i = p_postpone then null else v_kickoff + interval '2 hours' end);
    if v_i <> p_postpone then
      perform pg_temp.play(v_fixture_id);
    end if;
  end loop;
end;
$$;

select pg_temp.add_round(1);
select pg_temp.add_round(2);
select pg_temp.add_round(3);
select pg_temp.add_round(4, 4);

create temporary table ticks (name text primary key, result jsonb) on commit drop;
create temporary table ids (name text primary key, id uuid) on commit drop;

-- ===========================================================================
-- Settings and the tick when off
-- ===========================================================================
select extensions.is(
  (select mode || '/' || auto_publish || '/' || publish_local_time || '/' || draft_local_time
   from app_private.pepites_settings),
  'off/false/20:00:00/12:00:00',
  'settings start off, without auto-publish, drafts at 12:00 and publication at 20:00'
);
select extensions.throws_ok(
  $$select app_private.pepites_configure('on')$$,
  '22023', 'PEPITES_MODE_INVALID', 'an unknown mode is refused'
);
insert into ticks values ('off', app_private.pepites_tick('2026-09-28 11:30:00+00'));
select extensions.is((select result ->> 'outcome' from ticks where name = 'off'), 'off',
  'mode off: the tick does nothing');
select extensions.is(
  (select count(*) from app.pepites_runs where season_id = 'f0100000-0000-4000-8000-000000000001'),
  0::bigint, 'and no run was made'
);
select extensions.ok(
  (select count(*) = 2 from cron.job where jobname in ('pepites-tick', 'pepites-history-prune')),
  'the tick and its history prune are scheduled'
);

select app_private.pepites_configure('staff', false, 'f0000000-0000-4000-8000-000000000001');
select extensions.is(app_private.pepites_current_season(), 'f0100000-0000-4000-8000-000000000001'::uuid,
  'the current season follows the configured competition');

-- ===========================================================================
-- Rounds, weeks
-- ===========================================================================
select extensions.is(app_private.pepites_latest_complete_round('f0100000-0000-4000-8000-000000000001'), 4,
  'a round with one match postponed and the rest final is complete');
select extensions.is(
  array[app_private.pepites_week_number('f0100000-0000-4000-8000-000000000001', '2026-07-01'),
    app_private.pepites_week_number('f0100000-0000-4000-8000-000000000001', '2026-07-05'),
    app_private.pepites_week_number('f0100000-0000-4000-8000-000000000001', '2026-07-06'),
    app_private.pepites_week_number('f0100000-0000-4000-8000-000000000001', '2026-09-28')],
  array[1, 1, 2, 14],
  'weeks run Monday to Sunday from the week of the season''s first day; 28 Sept 2026 is week 14'
);

-- ===========================================================================
-- Week 14: run, draft, re-point, edit, schedule, re-point again, publish
-- ===========================================================================
insert into ticks values ('mon-10:00', app_private.pepites_tick('2026-09-28 10:00:00+00'));
select extensions.is(
  (select result #>> '{runs,run}' || '/' || (result ->> 'draft') || '/' || (result ->> 'daily')
   from ticks where name = 'mon-10:00'),
  'scored/not_now/ran',
  'Monday 11:00 local: round 4 is scored; too early for the draft; the daily checks run'
);
insert into ids select 'r4a', id from app.pepites_runs
where season_id = 'f0100000-0000-4000-8000-000000000001' and kind = 'weekly' and as_of_round_number = 4;
select extensions.ok(
  (select status = 'succeeded' and revision = 1 and ranked_count >= 10 from app.pepites_runs
   where id = (select id from ids where name = 'r4a')),
  'the round 4 run succeeded, revision 1, with at least 10 ranked'
);

insert into ticks values ('mon-10:15', app_private.pepites_tick('2026-09-28 10:15:00+00'));
select extensions.is(
  (select result #>> '{runs,run}' || '/' || (result ->> 'daily') from ticks where name = 'mon-10:15'),
  'unchanged/done_today',
  'the next tick finds the same inputs: no new run, and the daily checks already ran'
);

insert into ticks values ('mon-11:15', app_private.pepites_tick('2026-09-28 11:15:00+00'));
select extensions.is((select result ->> 'draft' from ticks where name = 'mon-11:15'), 'created',
  'Monday 12:15 local: the week''s draft is made');
insert into ids select 'e14', (result ->> 'editionId')::uuid from ticks where name = 'mon-11:15';
select extensions.ok(
  (select status = 'draft' and week_number = 14 and round_number = 4
     and run_id = (select id from ids where name = 'r4a')
     and scheduled_for = '2026-09-28 19:00:00+00' and published_at is null
   from app.pepites_editions where id = (select id from ids where name = 'e14')),
  'a draft of week 14, round 4, from that run, due at 20:00 local'
);
select extensions.is(
  (select array_agg(entry.player_id order by entry.editorial_rank) from app.pepites_edition_entries entry
   where entry.edition_id = (select id from ids where name = 'e14')),
  (select array_agg(score.player_id order by score.rank) from app.pepites_player_scores score
   where score.run_id = (select id from ids where name = 'r4a') and score.rank <= 10),
  'prefilled with the computed top 10, in order'
);
select extensions.is(
  (select coalesce(from_status, '-') || '>' || to_status || '/' || actor_kind from app_private.pepites_edition_moves
   where edition_id = (select id from ids where name = 'e14')),
  '->draft/system',
  'its creation is recorded: a draft made by the system'
);
select extensions.ok(
  exists (select 1 from app_private.pepites_notices where key = 'draft:' || (select id from ids where name = 'e14')),
  'and the editor is told'
);
insert into ticks values ('mon-11:30', app_private.pepites_tick('2026-09-28 11:30:00+00'));
select extensions.is((select result ->> 'draft' from ticks where name = 'mon-11:30'), 'exists',
  'a second Monday tick makes no second draft');

-- The postponed match is played on Monday afternoon: a new revision, and the
-- draft follows it.
update app.fixtures set status = 'finished', home_score = 2, away_score = 0,
  finalized_at = '2026-09-28 13:00:00+00', provider_updated_at = '2026-09-28 13:00:00+00'
where id = pg_temp.uid('f4000000-0000-4000-8000-', 44);
select pg_temp.play(pg_temp.uid('f4000000-0000-4000-8000-', 44));
insert into ticks values ('mon-13:30', app_private.pepites_tick('2026-09-28 13:30:00+00'));
insert into ids select 'r4b', (result #>> '{runs,runId}')::uuid from ticks where name = 'mon-13:30';
select extensions.ok(
  (select result #>> '{runs,run}' = 'scored' and revision = 2
   from ticks, app.pepites_runs run
   where name = 'mon-13:30' and run.id = (select id from ids where name = 'r4b')),
  'postponed match played after its round: revision 2 of round 4'
);
select extensions.is(
  (select run_id from app.pepites_editions where id = (select id from ids where name = 'e14')),
  (select id from ids where name = 'r4b'),
  'the draft is re-pointed to it'
);
select extensions.is(
  app_private.pepites_edition_problems((select id from ids where name = 'e14')),
  '{}'::text[],
  'with every entry''s computed rank and score taken from the new revision'
);
select extensions.ok(
  exists (select 1 from app_private.pepites_edition_moves
    where edition_id = (select id from ids where name = 'e14')
      and from_status = 'draft' and to_status = 'draft'
      and (detail ->> 'previousRunId')::uuid = (select id from ids where name = 'r4a')),
  'the re-pointing is recorded with the previous run'
);

-- The editor: swaps 1 and 2 and writes reasons.
insert into ids values ('staff', 'f9000000-0000-4000-8000-000000000001');
create temporary table top on commit drop as
select entry.editorial_rank, entry.player_id from app.pepites_edition_entries entry
where entry.edition_id = (select id from ids where name = 'e14');
select extensions.lives_ok(
  format($$select app_private.pepites_set_entries(%L, %L::jsonb, %L)$$,
    (select id from ids where name = 'e14'),
    (select jsonb_agg(jsonb_build_object(
       'rank', case editorial_rank when 1 then 2 when 2 then 1 else editorial_rank end,
       'playerId', player_id,
       'reasonFr', case when editorial_rank <= 2 then '  Buteur décisif  ' end,
       'reasonAr', case when editorial_rank <= 2 then 'هداف حاسم' end))
     from top),
    (select id from ids where name = 'staff')),
  'the editor reorders the Top 10 and adds reasons'
);
select extensions.ok(
  (select entry.player_id = (select player_id from top where editorial_rank = 2)
     and entry.computed_rank = score.rank and entry.computed_score = score.score_exact
     and entry.reason_fr = 'Buteur décisif'
   from app.pepites_edition_entries entry
   join app.pepites_player_scores score
     on score.run_id = (select id from ids where name = 'r4b') and score.player_id = entry.player_id
   where entry.edition_id = (select id from ids where name = 'e14') and entry.editorial_rank = 1),
  'the editorial rank is the editor''s, the computed rank is the run''s, reasons are trimmed'
);
select extensions.throws_ok(
  format($$select app_private.pepites_set_entries(%L, '[{"rank": 1, "playerId": "%s"}, {"rank": 3, "playerId": "%s"}]', %L)$$,
    (select id from ids where name = 'e14'), (select player_id from top where editorial_rank = 1),
    (select player_id from top where editorial_rank = 2), (select id from ids where name = 'staff')),
  '22023', 'PEPITES_ENTRIES_INVALID', 'ranks must run 1..n without a gap'
);
select extensions.throws_ok(
  format($$select app_private.pepites_set_entries(%L, '[{"rank": 1, "playerId": "%s"}]', %L)$$,
    (select id from ids where name = 'e14'), pg_temp.uid('f2000000-0000-4000-8000-', 3),
    (select id from ids where name = 'staff')),
  '22023', 'PEPITES_ENTRY_PLAYER_NOT_RANKED', 'a player who is not ranked in the run cannot be entered'
);
select extensions.throws_ok(
  format($$select app_private.pepites_set_entries(%L, '[]', null)$$, (select id from ids where name = 'e14')),
  '22023', 'PEPITES_ACTOR_REQUIRED', 'entries are the editor''s: an actor is required'
);
select extensions.is(
  (select count(*) from app.pepites_edition_entries where edition_id = (select id from ids where name = 'e14')),
  10::bigint, 'the refused writes changed nothing'
);

-- Schedule for 20:00 local.
select extensions.lives_ok(
  format($$select app_private.pepites_schedule(%L, '2026-09-28 19:00:00+00', %L)$$,
    (select id from ids where name = 'e14'), (select id from ids where name = 'staff')),
  'the editor schedules it'
);
select extensions.is(
  (select to_status || '/' || actor_kind || '/' || actor from app_private.pepites_edition_moves
   where edition_id = (select id from ids where name = 'e14') order by id desc limit 1),
  'scheduled/staff/f9000000-0000-4000-8000-000000000001',
  'draft -> scheduled, by that staff member'
);

-- Direct writes and moves outside the table are refused.
select extensions.throws_ok(
  format($$update app.pepites_editions set status = 'draft' where id = %L$$, (select id from ids where name = 'e14')),
  '42501', 'PEPITES_EDITION_WRITER_REQUIRED', 'a direct update, outside the edition functions, is refused'
);
select extensions.throws_ok(
  format($$insert into app.pepites_edition_entries (edition_id, editorial_rank, player_id, computed_rank, computed_score)
    values (%L, 1, %L, 1, 1)$$, (select id from ids where name = 'e14'), pg_temp.uid('f2000000-0000-4000-8000-', 2)),
  '42501', 'PEPITES_EDITION_WRITER_REQUIRED', 'so is a direct entry write'
);
select set_config('botolago.pepites_actor', 'system', true);
select extensions.throws_ok(
  format($$update app.pepites_editions set run_id = %L where id = %L$$,
    (select id from ids where name = 'r4a'), (select id from ids where name = 'e14')),
  '55000', 'PEPITES_EDITION_MOVE_REJECTED', 'run_id cannot change on a scheduled edition'
);
select extensions.throws_ok(
  format($$update app.pepites_editions set status = 'published', published_at = now() where id = %L$$,
    (select id from ids where name = 'e14')),
  '55000', 'PEPITES_EDITION_MOVE_REJECTED', 'scheduled -> published outside pepites_publish_edition is refused'
);
select extensions.throws_ok(
  format($$update app.pepites_editions set status = 'withdrawn', withdrawn_at = now(), withdrawn_reason = 'Raison assez longue' where id = %L$$,
    (select id from ids where name = 'e14')),
  '55000', 'PEPITES_EDITION_MOVE_REJECTED', 'scheduled -> withdrawn is not a move'
);
select extensions.throws_ok(
  format($$update app.pepites_editions set scheduled_for = scheduled_for + interval '1 hour' where id = %L$$,
    (select id from ids where name = 'e14')),
  '55000', 'PEPITES_EDITION_MOVE_REJECTED', 'a scheduled edition''s time changes only by unscheduling'
);
select extensions.throws_ok(
  format($$update app.pepites_edition_entries set reason_fr = 'Autre' where edition_id = %L and editorial_rank = 1$$,
    (select id from ids where name = 'e14')),
  '55000', 'PEPITES_EDITION_NOT_DRAFT', 'entries of a scheduled edition cannot be updated'
);
select extensions.throws_ok(
  format($$delete from app.pepites_edition_entries where edition_id = %L$$, (select id from ids where name = 'e14')),
  '55000', 'PEPITES_EDITION_NOT_DRAFT', '... nor deleted'
);
select extensions.throws_ok(
  format($$insert into app.pepites_editions (season_id, week_number, round_number, run_id, status, scheduled_for)
    values ('f0100000-0000-4000-8000-000000000001', 20, 4, %L, 'scheduled', now())$$,
    (select id from ids where name = 'r4b')),
  '55000', 'PEPITES_EDITION_MOVE_REJECTED', 'an edition cannot start anywhere but draft'
);
select extensions.throws_ok(
  format($$delete from app.pepites_editions where id = %L$$, (select id from ids where name = 'e14')),
  '55000', 'PEPITES_EDITION_IMMUTABLE', 'editions are never deleted'
);
select extensions.throws_ok(
  $$truncate app.pepites_edition_entries$$,
  '55000', 'PEPITES_EDITION_NOT_DRAFT', 'entries cannot be truncated'
);
select extensions.throws_ok(
  $$truncate app.pepites_editions cascade$$,
  '55000', null, 'nor can editions (with their entries and moves)'
);
select extensions.throws_ok(
  $$truncate app.pepites_editions$$,
  '0A000', null, 'and a plain truncate is refused by the entries'' foreign key before it starts'
);
select set_config('botolago.pepites_actor', '', true);

-- More data for round 4 while scheduled: steps back to draft, re-pointed,
-- rescheduled for the same time.
update app.player_fixture_performances set goals = goals + 1
where fixture_id = pg_temp.uid('f4000000-0000-4000-8000-', 41)
  and player_id = (select player_id from top where editorial_rank = 3);
insert into ticks values ('mon-14:00', app_private.pepites_tick('2026-09-28 14:00:00+00'));
insert into ids select 'r4c', (result #>> '{runs,runId}')::uuid from ticks where name = 'mon-14:00';
select extensions.is(
  (select result #>> '{runs,repointed,0,status}' from ticks where name = 'mon-14:00'),
  'scheduled',
  'a corrected appearance: revision 3, and the scheduled edition is scheduled again'
);
select extensions.ok(
  (select status = 'scheduled' and scheduled_for = '2026-09-28 19:00:00+00'
     and run_id = (select id from ids where name = 'r4c')
   from app.pepites_editions where id = (select id from ids where name = 'e14')),
  'on the new run, for the same time'
);
select extensions.is(
  (select array_agg(coalesce(from_status, '-') || '>' || to_status || '/' || actor_kind order by id)
   from app_private.pepites_edition_moves
   where edition_id = (select id from ids where name = 'e14') and id > (
     select max(id) from app_private.pepites_edition_moves
     where edition_id = (select id from ids where name = 'e14') and actor_kind = 'staff')),
  array['scheduled>draft/system', 'draft>draft/system', 'draft>scheduled/system'],
  'by the path scheduled -> draft -> re-pointed -> scheduled, all by the system'
);
select extensions.is(
  (select player_id from app.pepites_edition_entries
   where edition_id = (select id from ids where name = 'e14') and editorial_rank = 1),
  (select player_id from top where editorial_rank = 2),
  'the editor''s order is kept'
);

-- Before its time nothing is published.
insert into ticks values ('mon-18:45', app_private.pepites_tick('2026-09-28 18:45:00+00'));
select extensions.is(
  (select status from app.pepites_editions where id = (select id from ids where name = 'e14')),
  'scheduled', '19:45 local: not yet'
);

-- At its time: published by the tick. Entries are not rewritten.
create temporary table entries_before on commit drop as
select editorial_rank, xmin::text as row_version, player_id, computed_rank, computed_score, reason_fr
from app.pepites_edition_entries where edition_id = (select id from ids where name = 'e14');
insert into ticks values ('mon-19:05', app_private.pepites_tick('2026-09-28 19:05:00+00'));
select extensions.ok(
  (select status = 'published' and published_at is not null and published_by is null
     and previous_edition_id is null
   from app.pepites_editions where id = (select id from ids where name = 'e14')),
  '20:05 local: published by the system; the first edition has no previous one'
);
select extensions.is(
  (select to_status || '/' || actor_kind from app_private.pepites_edition_moves
   where edition_id = (select id from ids where name = 'e14') order by id desc limit 1),
  'published/system', 'the move is recorded'
);
select extensions.is(
  (select count(*) from (
    select editorial_rank, xmin::text, player_id, computed_rank, computed_score, reason_fr
    from app.pepites_edition_entries where edition_id = (select id from ids where name = 'e14')
    except select * from entries_before) changed)
  + (select count(*) from entries_before) - 10,
  0::bigint,
  'publication wrote no entry row: same 10 rows, same row versions'
);
select extensions.ok(
  (select activated_at is not null from app.pepites_runs where id = (select id from ids where name = 'r4c'))
  and (select activated_at is null from app.pepites_runs where id = (select id from ids where name = 'r4a')),
  'the published run is activated; the revisions nobody published are not'
);
select extensions.is(
  (select app_private.pepites_publish_edition((select id from ids where name = 'e14'), null) ->> 'alreadyPublished'),
  'true', 'publishing again returns the edition unchanged'
);
select extensions.is(
  (select count(*) from app_private.pepites_edition_moves
   where edition_id = (select id from ids where name = 'e14') and to_status = 'published'),
  1::bigint, 'and records no second publication'
);
select extensions.throws_ok(
  format($$select app_private.pepites_create_draft(%L, '2026-09-30')$$, (select id from ids where name = 'r4c')),
  '23505', 'PEPITES_WEEK_TAKEN', 'a published week gets no second edition, except as a correction'
);

-- ===========================================================================
-- Correction: supersede and publish in one transaction
-- ===========================================================================
insert into ids select 'e14c', app_private.pepites_create_correction(
  (select id from ids where name = 'e14'), (select id from ids where name = 'staff'));
select extensions.ok(
  (select status = 'draft' and corrects_edition_id = (select id from ids where name = 'e14')
     and week_number = 14 and run_id = (select id from ids where name = 'r4c')
   from app.pepites_editions where id = (select id from ids where name = 'e14c')),
  'a correction is a draft of the same week, from the newest run of its round'
);
select extensions.is(
  (select array_agg(player_id::text || coalesce(reason_fr, '') order by editorial_rank)
   from app.pepites_edition_entries where edition_id = (select id from ids where name = 'e14c')),
  (select array_agg(player_id::text || coalesce(reason_fr, '') order by editorial_rank)
   from app.pepites_edition_entries where edition_id = (select id from ids where name = 'e14')),
  'with the corrected edition''s entries and reasons'
);
select extensions.throws_ok(
  format($$select app_private.pepites_create_correction(%L, %L)$$,
    (select id from ids where name = 'e14'), (select id from ids where name = 'staff')),
  '23505', 'PEPITES_WEEK_TAKEN', 'one open edition per week: no second correction'
);
select extensions.throws_ok(
  format($$select app_private.pepites_publish_edition(%L, %L)$$,
    (select id from ids where name = 'e14c'), (select id from ids where name = 'staff')),
  '55000', 'PEPITES_EDITION_NOT_SCHEDULED', 'there is no draft -> published move'
);
select app_private.pepites_set_entries((select id from ids where name = 'e14c'),
  (select jsonb_agg(jsonb_build_object('rank', editorial_rank, 'playerId', player_id,
     'reasonFr', coalesce(reason_fr, 'Régulier'), 'reasonAr', reason_ar) order by editorial_rank)
   from app.pepites_edition_entries where edition_id = (select id from ids where name = 'e14c')),
  (select id from ids where name = 'staff'));
select app_private.pepites_schedule((select id from ids where name = 'e14c'), '2026-09-29 09:00:00+00',
  (select id from ids where name = 'staff'));

-- A failure after the supersession (the email step) undoes it too.
create function pg_temp.hook_source() returns text language sql as $$
  select pg_get_functiondef('app_private.pepites_edition_email_hook(uuid, text)'::regprocedure);
$$;
create temporary table saved_hook on commit drop as select pg_temp.hook_source() as source;
create or replace function app_private.pepites_edition_email_hook(p_edition_id uuid, p_event text)
returns void language plpgsql as $$
begin
  raise exception using errcode = 'XX000', message = 'TEST_EMAIL_FAILURE';
end;
$$;
select extensions.throws_ok(
  format($$select app_private.pepites_publish_edition(%L, %L)$$,
    (select id from ids where name = 'e14c'), (select id from ids where name = 'staff')),
  'XX000', 'TEST_EMAIL_FAILURE', 'the correction''s publication fails at its last step'
);
select extensions.is(
  (select array_agg(status order by created_at) from app.pepites_editions
   where id in ((select id from ids where name = 'e14'), (select id from ids where name = 'e14c'))),
  array['published', 'scheduled'],
  'and both editions are as they were: the supersession rolled back with it'
);
do $$ begin execute (select source from saved_hook); end $$;

select extensions.lives_ok(
  format($$select app_private.pepites_publish_edition(%L, %L)$$,
    (select id from ids where name = 'e14c'), (select id from ids where name = 'staff')),
  'the correction is published'
);
select extensions.ok(
  (select old.status = 'superseded' and old.superseded_by = new.id
     and new.status = 'published' and new.published_by = (select id from ids where name = 'staff')
     and new.previous_edition_id is not distinct from old.previous_edition_id
   from app.pepites_editions old, app.pepites_editions new
   where old.id = (select id from ids where name = 'e14') and new.id = (select id from ids where name = 'e14c')),
  'the corrected edition is superseded by it; the correction keeps its previous edition'
);
select extensions.is(
  (select count(*) from app.pepites_editions
   where season_id = 'f0100000-0000-4000-8000-000000000001' and week_number = 14 and status = 'published'),
  1::bigint, 'one published edition for the week'
);
select extensions.ok(
  exists (select 1 from pg_indexes where indexname = 'pepites_editions_one_published_key'
    and indexdef like '%WHERE (status = ''published''::text)%'),
  'and the partial unique index guarantees it'
);
select set_config('botolago.pepites_actor', 'system', true);
select extensions.throws_ok(
  format($$update app.pepites_editions set status = 'published', superseded_by = null where id = %L$$,
    (select id from ids where name = 'e14')),
  '55000', 'PEPITES_EDITION_MOVE_REJECTED', 'a superseded edition never comes back'
);
select set_config('botolago.pepites_actor', '', true);

-- ===========================================================================
-- Week 15: auto-publish
-- ===========================================================================
select pg_temp.add_round(5);
select app_private.pepites_configure('staff', true);
insert into ticks values ('w15-draft', app_private.pepites_tick('2026-10-05 11:15:00+00'));
insert into ids select 'e15', (result ->> 'editionId')::uuid from ticks where name = 'w15-draft';
select extensions.ok(
  (select round_number = 5 and week_number = 15 and status = 'draft'
   from app.pepites_editions where id = (select id from ids where name = 'e15')),
  'round 5 is scored and week 15''s draft made'
);
insert into ticks values ('w15-publish', app_private.pepites_tick('2026-10-05 19:05:00+00'));
select extensions.is(
  (select array_agg(coalesce(from_status, '-') || '>' || to_status || '/' || actor_kind order by id)
   from app_private.pepites_edition_moves where edition_id = (select id from ids where name = 'e15')),
  array['->draft/system', 'draft>scheduled/system', 'scheduled>published/system'],
  'auto-publish: draft -> scheduled -> published, both moves by the system'
);
select extensions.is(
  (select previous_edition_id from app.pepites_editions where id = (select id from ids where name = 'e15')),
  (select id from ids where name = 'e14c'),
  'its previous edition is week 14''s published one, the correction'
);
select extensions.is(
  (select count(*) from app.pepites_edition_entries
   where edition_id = (select id from ids where name = 'e15') and reason_fr is null),
  10::bigint, 'it went out without editor lines'
);

-- Withdrawal.
select extensions.throws_ok(
  format($$select app_private.pepites_withdraw(%L, 'court', %L)$$,
    (select id from ids where name = 'e15'), (select id from ids where name = 'staff')),
  '22023', 'PEPITES_REASON_INVALID', 'a withdrawal needs a real reason'
);
select extensions.throws_ok(
  format($$select app_private.pepites_withdraw(%L, 'Erreur de données sur un joueur', %L)$$,
    (select id from ids where name = 'e14'), (select id from ids where name = 'staff')),
  '55000', 'PEPITES_EDITION_NOT_PUBLISHED', 'only a published edition can be withdrawn'
);
select extensions.lives_ok(
  format($$select app_private.pepites_withdraw(%L, 'Erreur de données sur un joueur', %L)$$,
    (select id from ids where name = 'e15'), (select id from ids where name = 'staff')),
  'the editor withdraws week 15'
);
select extensions.ok(
  (select status = 'withdrawn' and withdrawn_reason = 'Erreur de données sur un joueur' and withdrawn_at is not null
   from app.pepites_editions where id = (select id from ids where name = 'e15')),
  'withdrawn, with its reason'
);
select extensions.is(
  (select count(*) from app.pepites_edition_entries where edition_id = (select id from ids where name = 'e15')),
  10::bigint, 'its entries stay (the pages show none; they are the record)'
);

-- ===========================================================================
-- Week 16: late, then abandoned
-- ===========================================================================
select pg_temp.add_round(6);
select app_private.pepites_configure('staff', false);
insert into ticks values ('w16-draft', app_private.pepites_tick('2026-10-12 11:15:00+00'));
insert into ids select 'e16', (result ->> 'editionId')::uuid from ticks where name = 'w16-draft';
select extensions.ok(
  (select round_number = 6 and status = 'draft' from app.pepites_editions
   where id = (select id from ids where name = 'e16')),
  'week 16: a draft for round 6 (a withdrawn edition''s round counts as used)'
);
insert into ticks values ('w16-late', app_private.pepites_tick('2026-10-12 19:05:00+00'));
select extensions.ok(
  (select status = 'draft' from app.pepites_editions where id = (select id from ids where name = 'e16'))
  and exists (select 1 from app_private.pepites_notices where key = 'delayed:' || (select id from ids where name = 'e16')),
  'without auto-publish, past its time the draft stays a draft and ops is told it is late'
);
insert into ticks values ('w16-late-2', app_private.pepites_tick('2026-10-12 19:20:00+00'));
select extensions.is(
  (select count(*) from app_private.pepites_notices where key like '%' || (select id from ids where name = 'e16')::text),
  2::bigint, 'once (the draft notice and one delay notice)'
);
insert into ticks values ('w16-abandoned', app_private.pepites_tick('2026-10-13 19:10:00+00'));
select extensions.ok(
  (select status = 'draft' from app.pepites_editions where id = (select id from ids where name = 'e16'))
  and exists (select 1 from app_private.pepites_notices where key = 'abandoned:' || (select id from ids where name = 'e16')),
  'after 24 hours nothing more is tried; it stays a draft and ops is told again'
);

-- ===========================================================================
-- Draft conditions
-- ===========================================================================
create function pg_temp.hand_run(p_round integer, p_ranked integer)
returns uuid language plpgsql as $$
declare
  v_run_id uuid;
begin
  insert into app.pepites_runs (season_id, kind, as_of_round_number, methodology_version, revision, input_cutoff_at)
  values ('f0100000-0000-4000-8000-000000000001', 'weekly', p_round, 'v1', 90 + p_round, '2026-10-01T00:00:00Z')
  returning id into v_run_id;
  update app.pepites_runs set status = 'succeeded', finished_at = now(), eligible_count = p_ranked,
    ranked_count = p_ranked, input_fingerprint = repeat('0', 64)
  where id = v_run_id;
  return v_run_id;
end;
$$;
select extensions.throws_ok(
  format($$select app_private.pepites_create_draft(%L, '2026-10-19')$$, pg_temp.hand_run(2, 40)),
  '22023', 'PEPITES_EDITION_TOO_EARLY', 'no edition before round 3'
);
select extensions.throws_ok(
  format($$select app_private.pepites_create_draft(%L, '2026-10-19')$$, pg_temp.hand_run(7, 9)),
  '22023', 'PEPITES_EDITION_TOO_FEW_RANKED', 'no edition with fewer than 10 ranked players'
);

-- ===========================================================================
-- Failed runs: three tries per input, then one alert
-- ===========================================================================
create temporary table saved_gather on commit drop as
select pg_get_functiondef('app_private.pepites_gather(uuid)'::regprocedure) as source;
create or replace function app_private.pepites_gather(p_run_id uuid)
returns text language plpgsql as $$
begin
  raise exception using errcode = 'XX000', message = 'TEST_GATHER_FAILURE';
end;
$$;
update app.player_fixture_performances set assists = assists + 1
where fixture_id = pg_temp.uid('f4000000-0000-4000-8000-', 61)
  and player_id = pg_temp.uid('f2000000-0000-4000-8000-', 2);
insert into ticks values ('fail-1', app_private.pepites_tick('2026-10-13 20:00:00+00'));
insert into ticks values ('fail-2', app_private.pepites_tick('2026-10-13 20:15:00+00'));
insert into ticks values ('fail-3', app_private.pepites_tick('2026-10-13 20:30:00+00'));
insert into ticks values ('fail-4', app_private.pepites_tick('2026-10-13 20:45:00+00'));
select extensions.is(
  (select array_agg(result #>> '{runs,run}' order by name) from ticks where name like 'fail-%'),
  array['failed', 'failed', 'failed', 'gave_up'],
  'a failing run is retried on the next ticks, three times in all, then left'
);
select extensions.ok(
  (select count(*) = 3 and bool_and(error = 'TEST_GATHER_FAILURE') from app.pepites_runs
   where season_id = 'f0100000-0000-4000-8000-000000000001' and as_of_round_number = 6 and status = 'failed'),
  'each failed run is kept with its error'
);
select extensions.is(
  (select count(*) from app_private.pepites_notices where key like 'run_failed:f0100000-0000-4000-8000-000000000001:6:%'),
  1::bigint, 'and ops is alerted once'
);
do $$ begin execute (select source from saved_gather); end $$;
update app.player_fixture_performances set assists = assists + 1
where fixture_id = pg_temp.uid('f4000000-0000-4000-8000-', 61)
  and player_id = pg_temp.uid('f2000000-0000-4000-8000-', 4);
insert into ticks values ('fail-fixed', app_private.pepites_tick('2026-10-13 21:00:00+00'));
select extensions.is((select result #>> '{runs,run}' from ticks where name = 'fail-fixed'), 'scored',
  'new inputs are tried again');

-- ===========================================================================
-- Published runs stay as they were
-- ===========================================================================
select extensions.ok(
  (select bool_and((app_private.pepites_replay(run.id) ->> 'matches')::boolean)
   from app.pepites_runs run where run.activated_at is not null
     and run.season_id = 'f0100000-0000-4000-8000-000000000001'),
  'every published run still replays exactly after the later revisions'
);
select extensions.is(
  (select run_id from app.pepites_editions where id = (select id from ids where name = 'e14c')),
  (select id from ids where name = 'r4c'),
  'and the published edition keeps its run'
);

-- ===========================================================================
-- Grants
-- ===========================================================================
select extensions.ok(
  not has_function_privilege('anon', 'app_private.pepites_tick(timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.pepites_publish_edition(uuid, uuid)', 'execute')
  and not has_function_privilege('service_role', 'app_private.pepites_set_entries(uuid, jsonb, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.pepites_configure(text, boolean, uuid, time, time)', 'execute'),
  'no client role can run the tick or the edition functions'
);
select extensions.ok(
  not has_table_privilege('anon', 'app.pepites_editions', 'select')
  and not has_table_privilege('authenticated', 'app.pepites_edition_entries', 'select')
  and not has_table_privilege('service_role', 'app_private.pepites_settings', 'update')
  and not has_table_privilege('authenticated', 'app_private.pepites_edition_moves', 'select'),
  'nor read or write the tables directly'
);

select * from extensions.finish();
rollback;
