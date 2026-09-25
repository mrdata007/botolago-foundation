-- Regression suite for 20260925210500_fantasy_resolve_postponed_after_lock:
-- app_private.fantasy_resolve_frozen_assignment, the owner's tool that takes a
-- counted match out of a gameweek that has locked, when the match was
-- postponed, cancelled or abandoned after the lock or moved past the
-- gameweek's window.
--
-- A six-club league plays GW1. Its middle match (clubs 3 v 4) is postponed
-- after the lock; the other two are played. The gameweek is held. For 48 h
-- after the kickoff it was frozen with, the rules (FANTASY_RULES_V1.md) keep
-- the match in the gameweek and the tool refuses it; after that the owner
-- resolves it, the lifecycle hands the gameweek to scoring, and the players of
-- that match score nothing: a starter of it is replaced from the bench and the
-- vice-captain takes the armband from its captain, as the scoring worker
-- defines. Rescheduled, the match does not come back to GW1 and goes nowhere
-- else unless the provider moves it into a later round, which the
-- next-gameweek opening then refuses (no double gameweeks yet: the rules'
-- "controlled future assignment" is not built). Also: every refusal, the
-- 48 h window for every kind of hold and from the season's ruleset,
-- idempotency, the lock order, and that no client role can call it. Every
-- kickoff sits at hh:17 so none reads as a 00:00 placeholder.
begin;
select extensions.plan(83);

create function pg_temp.player(n integer) returns uuid language sql immutable as $$
  select ('d5' || lpad(n::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid
$$;
create function pg_temp.fp(n integer) returns uuid language sql immutable as $$
  select ('d7' || lpad(n::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid
$$;
create function pg_temp.club(n integer) returns uuid language sql immutable as $$
  select md5('resolve-club-' || n)::uuid
$$;
create function pg_temp.fixture(r integer, f integer) returns uuid language sql immutable as $$
  select ('d9000000-0000-4000-8000-0000000000' || r || f)::uuid
$$;
-- The current (not superseded) assignment of a fixture.
create function pg_temp.assignment(p_fixture uuid) returns uuid language sql stable as $$
  select a.id from app.fantasy_fixture_assignments a
  where a.fixture_id = p_fixture and a.superseded_at is null
$$;
create function pg_temp.resolve(p_assignment uuid,
  p_reason text default 'Postponed by the league after the deadline, no new date inside the window.')
returns jsonb language sql as $$
  select app_private.fantasy_resolve_frozen_assignment(p_assignment, 'operator_deferred', p_reason)
$$;
create function pg_temp.gw(n integer) returns uuid language sql stable as $$
  select g.id from app.fantasy_gameweeks g
  where g.fantasy_season_id = 'd6300000-0000-4000-8000-000000000001' and g.sequence_number = n
$$;
create function pg_temp.advance(p_gameweek uuid) returns jsonb language sql as $$
  select api.service_advance_fantasy_lifecycle(p_gameweek,
    (select g.lock_version from app.fantasy_gameweeks g where g.id = p_gameweek), 500)
$$;
create function pg_temp.scoring_check() returns jsonb language sql as $$
  select c from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
  where c ->> 'name' = 'fantasy_scoring'
$$;

-- ---------------------------------------------------------------------------
-- The league: six clubs of eleven players, three rounds of three matches.
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('d0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('d1000000-0000-4000-8000-000000000001', 'resolve-test', 'Resolve Test', 'RST', 'league',
  'd0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  'Resolve season', current_date - 1, current_date + 120, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
select ('d3000000-0000-4000-8000-00000000000' || r)::uuid,
  'd2000000-0000-4000-8000-000000000001', r, 'Round ' || r
from generate_series(1, 3) r;
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.club(n), 'resolve-club-' || n, 'Resolve Club ' || n, 'RC' || n, 'R' || n,
  'd0000000-0000-4000-8000-000000000001'
from generate_series(1, 6) n;
-- Player i plays for club (i - 1) / 11 + 1 and, by (i - 1) % 11, in goal (0),
-- defence (1-4), midfield (5-8) or attack (9-10).
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.player(i), 'resolve-player-' || i, 'Resolve Player ' || i, 'RP ' || i,
  case when (i - 1) % 11 = 0 then 'goalkeeper'::app.football_position
    when (i - 1) % 11 <= 4 then 'defender'::app.football_position
    when (i - 1) % 11 <= 8 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 66) i;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('d6000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  'resolve-test', 'Resolve Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values ('d6300000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Resolve season', 'active', current_date - 1, current_date + 120);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id,
  position_id, price)
select pg_temp.fp(i), 'd6300000-0000-4000-8000-000000000001', pg_temp.player(i),
  pg_temp.club((i - 1) / 11 + 1),
  (select id from app.fantasy_positions where code = case when (i - 1) % 11 = 0 then 'GK'
    when (i - 1) % 11 <= 4 then 'DEF' when (i - 1) % 11 <= 8 then 'MID' else 'FWD' end),
  6
from generate_series(1, 66) i;
-- Clubs 1 v 2, 3 v 4 and 5 v 6 in every round: round 1 from tomorrow, two
-- hours apart; round 2 a week later; round 3 two weeks later.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, provider_updated_at, source_sequence)
select pg_temp.fixture(r, f), 'd1000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001', ('d3000000-0000-4000-8000-00000000000' || r)::uuid,
  pg_temp.club(f * 2 - 1), pg_temp.club(f * 2),
  date_trunc('hour', now()) + interval '17 minutes' + interval '1 day'
    + (r - 1) * interval '7 days' + (f - 1) * interval '2 hours',
  'not_started', now(), 1
from generate_series(1, 3) r cross join generate_series(1, 3) f;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_sync_fantasy_calendar('d6300000-0000-4000-8000-000000000001');
select extensions.is(
  (select count(*)::integer from app.fantasy_gameweeks
   where fantasy_season_id = 'd6300000-0000-4000-8000-000000000001'), 3,
  'the calendar sync stages the three rounds');
update app.fantasy_gameweeks set status = 'open' where id = pg_temp.gw(1);

-- One manager. 4-4-2: GK 1; DEF 2, 24, 46, 57; MID 29 (captain), 7
-- (vice-captain), 51, 62; FWD 21, 65. Bench in order: GK 45, DEF 13, MID 40,
-- FWD 43. Players 24, 29, 40 and 43 play for clubs 3 and 4.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('d8000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'resolve-manager@example.test', statement_timestamp(), 'hash',
  '{}', '{"username":"resolve_manager"}', statement_timestamp(), statement_timestamp());
insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank,
  team_value, free_transfers)
values ('da000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
  'd6300000-0000-4000-8000-000000000001', pg_temp.gw(1), 'Resolve Eleven', 10, 90, 1);
insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version)
values ('db000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001',
  pg_temp.gw(1), 1);
insert into app.fantasy_lineup_players (lineup_id, fantasy_player_id, slot, slot_order, captain,
  vice_captain, multiplier, snapshot_price)
select 'db000000-0000-4000-8000-000000000001', pg_temp.fp(n),
  case when ord <= 11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
  case when ord <= 11 then ord else ord - 11 end, n = 29, n = 7, case when n = 29 then 2 else 1 end, 6
from unnest(array[1, 2, 24, 46, 57, 29, 7, 51, 62, 21, 65, 45, 13, 40, 43]) with ordinality as picked(n, ord);

-- The tool holds every scheduled job off until the transaction ends, and
-- refuses while one is mid-run. The local database runs its jobs too, each for
-- a few milliseconds: wait for a moment when none is, then hold them for the
-- rest of this test (as the tool itself would), so no refusal below depends
-- on pg_cron's timing.
create function pg_temp.hold_jobs() returns void language plpgsql as $$
begin
  for attempt in 1..200 loop
    begin
      perform app_private.hold_scheduled_jobs();
      return;
    exception when others then
      if sqlerrm <> 'scheduled_job_running' or attempt = 200 then
        raise;
      end if;
      perform pg_sleep(0.05);
    end;
  end loop;
end;
$$;
select pg_temp.hold_jobs();

-- ---------------------------------------------------------------------------
-- No client can call it.
-- ---------------------------------------------------------------------------
select extensions.ok(
  not has_function_privilege('anon', 'app_private.fantasy_resolve_frozen_assignment(uuid,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.fantasy_resolve_frozen_assignment(uuid,text,text)', 'execute')
  and not has_function_privilege('service_role', 'app_private.fantasy_resolve_frozen_assignment(uuid,text,text)', 'execute'),
  'neither anon, authenticated nor the service role may execute the tool');
select extensions.ok(
  (select p.proacl is not null
     and not exists (select 1 from aclexplode(p.proacl) acl where acl.grantee = 0)
     and p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'app_private.fantasy_resolve_frozen_assignment(uuid,text,text)'::regprocedure),
  'PUBLIC holds no grant; SECURITY DEFINER with an empty search_path');
select extensions.ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.prosrc like '%fantasy_resolve_frozen_assignment%'),
  'no api.* function reaches it: an owner''s decision, never a worker''s or a browser''s');
select set_config('test.call', format(
  $$select app_private.fantasy_resolve_frozen_assignment(%L, 'operator_deferred', 'Called from outside the SQL editor.')$$,
  pg_temp.assignment(pg_temp.fixture(1, 2))), true);
set local role authenticated;
select extensions.throws_ok(current_setting('test.call'), '42501', null,
  'a signed-in browser session is refused by the database');
reset role;
set local role service_role;
select extensions.throws_ok(current_setting('test.call'), '42501', null,
  'and so is the service role the workers use');
reset role;
select extensions.ok(
  pg_get_functiondef('app_private.fantasy_resolve_frozen_assignment(uuid,text,text)'::regprocedure)
    ~ 'lifecycle_tick_enabled.*hold_scheduled_jobs\(\).*''fantasy:calendar:''.*held_gameweek\.id = target\.gameweek_id for update.*assignment\.id = p_assignment_id for update.*held_fixture\.id = target\.fixture_id for share',
  'locks in the other writers'' order: paused tick, scheduled jobs, the calendar lock, gameweek, assignment, fixture');

-- ---------------------------------------------------------------------------
-- Refusals of what the owner typed, before anything is locked.
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  $$select app_private.fantasy_resolve_frozen_assignment(null, 'operator_deferred', 'Postponed after the deadline.')$$,
  '22023', 'fantasy_assignment_required', 'an assignment must be named');
select extensions.throws_ok(
  format($$select app_private.fantasy_resolve_frozen_assignment(%L, 'postponed', 'Postponed after the deadline.')$$,
    pg_temp.assignment(pg_temp.fixture(1, 2))),
  '22023', 'fantasy_resolution_unsupported', 'an unknown resolution is refused');
select extensions.throws_ok(
  format($$select app_private.fantasy_resolve_frozen_assignment(%L, 'moved_to_actual_gameweek', 'Postponed after the deadline.')$$,
    pg_temp.assignment(pg_temp.fixture(1, 2))),
  '22023', 'fantasy_resolution_unsupported',
  'moved_to_actual_gameweek is refused: nothing moves the match to the gameweek it is played in');
select extensions.throws_ok(
  format($$select app_private.fantasy_resolve_frozen_assignment(%L, 'provider_postponed', 'Postponed after the deadline.')$$,
    pg_temp.assignment(pg_temp.fixture(1, 2))),
  '22023', 'fantasy_resolution_unsupported', 'provider_postponed stays the automatic deferral''s mark');
select extensions.throws_ok(
  format($$select app_private.fantasy_resolve_frozen_assignment(%L, null, 'Postponed after the deadline.')$$,
    pg_temp.assignment(pg_temp.fixture(1, 2))),
  '22023', 'fantasy_resolution_unsupported', 'a decision must be stated');
select extensions.throws_ok(
  format($$select app_private.fantasy_resolve_frozen_assignment(%L, 'operator_deferred', null)$$,
    pg_temp.assignment(pg_temp.fixture(1, 2))),
  '22023', 'fantasy_resolution_reason_required', 'a missing reason is refused');
select extensions.throws_ok(
  format($$select app_private.fantasy_resolve_frozen_assignment(%L, 'operator_deferred', '   late   ')$$,
    pg_temp.assignment(pg_temp.fixture(1, 2))),
  '22023', 'fantasy_resolution_reason_required', 'so is a reason of fewer than 8 characters once trimmed');
select extensions.throws_ok(
  format($$select app_private.fantasy_resolve_frozen_assignment(%L, 'operator_deferred', %L)$$,
    pg_temp.assignment(pg_temp.fixture(1, 2)), repeat('x', 501)),
  '22023', 'fantasy_resolution_reason_required', 'and one over 500, the audit trail''s limit');
select extensions.throws_ok(
  $$select pg_temp.resolve('dfffffff-0000-4000-8000-000000000001')$$,
  'PT404', 'fantasy_assignment_not_found', 'an unknown assignment is refused');

-- ---------------------------------------------------------------------------
-- One writer at a time.
-- ---------------------------------------------------------------------------
select app_private.fantasy_automation_configure(true);
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.fixture(1, 2))),
  'PT409', 'fantasy_tick_must_be_paused', 'refused while the Fantasy lifecycle tick is on (AGENTS.md)');
select app_private.fantasy_automation_configure(false);
insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status, start_time)
select jobid, 987654329, 0, current_database(), 'postgres', 'select 1', 'running', statement_timestamp()
from cron.job order by jobid limit 1;
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.fixture(1, 2))),
  'PT409', 'scheduled_job_running', 'refused while a scheduled job is mid-run');
delete from cron.job_run_details where runid = 987654329;

-- ---------------------------------------------------------------------------
-- Before the lock: the calendar sync and the lock handle a postponement.
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.fixture(1, 2))),
  'PT409', 'fantasy_gameweek_not_locked', 'an open gameweek is refused');
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.fixture(2, 2))),
  'PT409', 'fantasy_gameweek_not_locked', 'so is a scheduled one');

-- Round 1 is played today: its schedule moves into the past before the lock,
-- as in the trusted lifecycle suite (1 v 2 at about -7 h, 3 v 4 at -5 h,
-- 5 v 6 at -3 h; the window ends 6 h after the last kickoff). Then the
-- deadline has passed and GW1 locks: every assignment frozen, the lineup
-- locked.
update app.fixtures set kickoff_at = date_trunc('hour', now()) + interval '17 minutes'
  - interval '7 hours' + (right(id::text, 1)::integer - 1) * interval '2 hours'
where round_id = 'd3000000-0000-4000-8000-000000000001';
update app.fantasy_fixture_assignments a set original_kickoff_at = f.kickoff_at, assigned_kickoff_at = f.kickoff_at
from app.fixtures f where f.id = a.fixture_id and a.gameweek_id = pg_temp.gw(1);
update app.fantasy_gameweeks set
  deadline_at = date_trunc('hour', now()) + interval '17 minutes' - interval '8 hours 30 minutes',
  starts_at = date_trunc('hour', now()) + interval '17 minutes' - interval '7 hours',
  ends_at = date_trunc('hour', now()) + interval '17 minutes' + interval '3 hours'
where id = pg_temp.gw(1);
select extensions.is(pg_temp.advance(pg_temp.gw(1)) ->> 'status', 'locked', 'GW1 locks at its deadline');
select extensions.is(
  (select count(*)::integer from app.fantasy_fixture_assignments
   where gameweek_id = pg_temp.gw(1) and superseded_at is null and counts_points and frozen_at is not null), 3,
  'its three matches are frozen into it');

-- ---------------------------------------------------------------------------
-- After the lock: 3 v 4 is postponed. The other two are played.
-- ---------------------------------------------------------------------------
update app.fixtures set status = 'postponed' where id = pg_temp.fixture(1, 2);
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.fixture(1, 1))),
  'PT409', 'fantasy_fixture_can_still_finish', 'a match not started, its kickoff inside the window, is refused: it can still finish here');
update app.fixtures set status = 'live_first_half', period = 'first_half', home_score = 0, away_score = 0
where id = pg_temp.fixture(1, 1);
select extensions.is(pg_temp.advance(pg_temp.gw(1)) ->> 'status', 'live', 'the first kickoff takes GW1 live');
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.fixture(1, 1))),
  'PT409', 'fantasy_fixture_can_still_finish', 'so is a match being played');
update app.fixtures set status = 'finished', period = 'post_match', home_score = 1, away_score = 0
where id in (pg_temp.fixture(1, 1), pg_temp.fixture(1, 3));
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.fixture(1, 1))),
  'PT409', 'fantasy_fixture_finished', 'a finished match counts: there is nothing to resolve');
update app.fixtures set finalized_at = statement_timestamp() - interval '1 minute'
where id in (pg_temp.fixture(1, 1), pg_temp.fixture(1, 3));

-- Without a decision the gameweek is held. The rules (FANTASY_RULES_V1.md)
-- keep the postponed match in it for 48 h after the kickoff it was frozen
-- with: the ops check warns until then, and the tool refuses.
select extensions.is(pg_temp.advance(pg_temp.gw(1)) ->> 'waitingReason', 'football_not_final',
  'both played matches are final, and GW1 still waits for the postponed one');
select extensions.ok(
  pg_temp.scoring_check() ->> 'status' = 'warn'
  and pg_temp.scoring_check() ->> 'detail' like 'GW1: counted match RC3 v RC4 postponed after the lock (due % UTC); the rules keep it in the gameweek if it is completed within 48 h, by % UTC; after that, this fails and scripts/backend/resolve-fantasy-postponed-assignment.sql takes it out',
  'fantasy_scoring warns at once, naming the match, until when the rules keep it, and what to run after: '
    || (pg_temp.scoring_check() ->> 'detail'));
select set_config('test.assignment', pg_temp.assignment(pg_temp.fixture(1, 2))::text, true);
-- The refusal names when the match becomes resolvable: its frozen kickoff + 48 h.
create function pg_temp.window_open(p_assignment uuid) returns text language sql stable as $$
  select 'fantasy_postponement_window_open: resolvable from '
    || to_char((assigned_kickoff_at + interval '48 hours') at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC'
  from app.fantasy_fixture_assignments where id = p_assignment
$$;
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, current_setting('test.assignment')),
  'PT409', pg_temp.window_open(current_setting('test.assignment')::uuid),
  'five hours after its frozen kickoff the tool refuses: the rules still keep the match, and it says from when it can be resolved');

-- Two days pass: the kickoff it was frozen with moves back, the clock does not.
update app.fantasy_fixture_assignments set assigned_kickoff_at = statement_timestamp() - interval '47 hours 59 minutes'
where id = current_setting('test.assignment')::uuid;
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, current_setting('test.assignment')),
  'PT409', pg_temp.window_open(current_setting('test.assignment')::uuid),
  '47 h 59 min after it, still refused');
select extensions.is(pg_temp.scoring_check() ->> 'status', 'warn', 'and the check still only warns');
update app.fantasy_fixture_assignments set assigned_kickoff_at = statement_timestamp() - interval '48 hours'
where id = current_setting('test.assignment')::uuid;
select extensions.ok(
  pg_temp.scoring_check() ->> 'status' = 'fail'
  and pg_temp.scoring_check() ->> 'detail' like 'GW1: counted match RC3 v RC4 postponed after the lock (due % UTC); not completed within the 48 h the rules allow: take it out with scripts/backend/resolve-fantasy-postponed-assignment.sql',
  '48 h after it the check fails, naming the procedure: ' || (pg_temp.scoring_check() ->> 'detail'));

-- ---------------------------------------------------------------------------
-- The owner resolves it, now that the rules let it go.
-- ---------------------------------------------------------------------------
select set_config('test.before', (select to_jsonb(g) from app.fantasy_gameweeks g where g.id = pg_temp.gw(1))::text, true);
select set_config('test.frozen_at', (select frozen_at::text from app.fantasy_fixture_assignments
  where id = current_setting('test.assignment')::uuid), true);
select set_config('test.result', pg_temp.resolve(current_setting('test.assignment')::uuid,
  '  Postponed by the league after the deadline, not replayed within 48 hours.  ')::text, true);
select extensions.is(
  current_setting('test.result')::jsonb - 'resolvedAt' - 'auditEventId' - 'kickoffAt' - 'assignedKickoffAt'
    - 'windowEndsAt' - 'resolvableFrom',
  jsonb_build_object('schemaVersion', 1, 'assignmentId', current_setting('test.assignment'),
    'fixtureId', pg_temp.fixture(1, 2), 'gameweekId', pg_temp.gw(1), 'gameweekSequence', 1,
    'gameweekStatus', 'live', 'fixtureStatus', 'postponed', 'hold', 'called_off',
    'completionWindowHours', 48,
    'resolution', 'operator_deferred', 'assignmentStatus', 'deferred', 'countsPoints', false,
    'countedFixturesLeft', 2, 'unfinishedFixturesLeft', 0, 'alreadyResolved', false),
  'at 48 h the tool resolves it, and answers what it did and what is left: two counted matches, none unfinished');
select extensions.is((current_setting('test.result')::jsonb ->> 'resolvableFrom')::timestamptz,
  (select assigned_kickoff_at + interval '48 hours' from app.fantasy_fixture_assignments
   where id = current_setting('test.assignment')::uuid),
  'resolvable from its frozen kickoff + the ruleset''s 48 h');
select extensions.is(
  (select jsonb_build_object('superseded', superseded_at is not null, 'status', assignment_status,
     'resolution', resolution, 'counts', counts_points, 'frozenAt', frozen_at::text)
   from app.fantasy_fixture_assignments where id = current_setting('test.assignment')::uuid),
  jsonb_build_object('superseded', true, 'status', 'deferred', 'resolution', 'operator_deferred',
    'counts', false, 'frozenAt', current_setting('test.frozen_at')),
  'the assignment is superseded as an unfrozen deferral is, marked as the operator''s decision, its freeze kept');
select extensions.is(
  (select jsonb_build_object('actor', actor_principal_id, 'domain', target_domain, 'reason', reason,
     'outcome', outcome, 'hold', safe_before ->> 'hold', 'fixtureStatus', safe_before ->> 'fixtureStatus',
     'countedBefore', safe_before -> 'countsPoints', 'countedAfter', safe_after -> 'countsPoints')
   from app_private.admin_audit_events
   where action = 'fantasy_fixture.resolve_frozen_assignment'
     and target_entity_id = current_setting('test.assignment')::uuid),
  jsonb_build_object('actor', null, 'domain', 'fantasy',
    'reason', 'Postponed by the league after the deadline, not replayed within 48 hours.',
    'outcome', 'succeeded', 'hold', 'called_off', 'fixtureStatus', 'postponed',
    'countedBefore', true, 'countedAfter', false),
  'one audit event: the reason (trimmed), the state before and after, no staff actor (the owner)');
select extensions.is(
  (current_setting('test.result')::jsonb ->> 'auditEventId')::bigint,
  (select id from app_private.admin_audit_events where action = 'fantasy_fixture.resolve_frozen_assignment'
     and target_entity_id = current_setting('test.assignment')::uuid),
  'and names it');
select extensions.is(
  (select to_jsonb(g) - 'updated_at' from app.fantasy_gameweeks g where g.id = pg_temp.gw(1)),
  current_setting('test.before')::jsonb - 'updated_at',
  'the gameweek is untouched: status, deadline, window and lock_version');
select extensions.is(
  (select count(*)::integer from app.fantasy_lineups where gameweek_id = pg_temp.gw(1) and locked_at is not null), 1,
  'the lineup frozen at the deadline stays frozen');
select extensions.ok(
  (select count(*) from app.fantasy_player_gameweek_points where gameweek_id = pg_temp.gw(1)) = 0
  and (select count(*) from app.fantasy_player_point_events where gameweek_id = pg_temp.gw(1)) = 0
  and (select count(*) from app.fantasy_team_gameweek_results where gameweek_id = pg_temp.gw(1)) = 0,
  'no points are written: the scoring worker computes them');

-- Idempotent: a repeat answers the recorded outcome and writes nothing.
select set_config('test.updated_at', (select updated_at::text from app.fantasy_fixture_assignments
  where id = current_setting('test.assignment')::uuid), true);
select set_config('test.repeat', pg_temp.resolve(current_setting('test.assignment')::uuid,
  'Run a second time, with another reason.')::text, true);
select extensions.is(
  (current_setting('test.repeat')::jsonb - 'alreadyResolved' - 'unfinishedFixturesLeft' - 'countedFixturesLeft'),
  (current_setting('test.result')::jsonb - 'alreadyResolved' - 'unfinishedFixturesLeft' - 'countedFixturesLeft'),
  'a second call returns the same outcome');
select extensions.is((current_setting('test.repeat')::jsonb ->> 'alreadyResolved')::boolean, true,
  'marked alreadyResolved');
select extensions.ok(
  (select count(*) from app_private.admin_audit_events where action = 'fantasy_fixture.resolve_frozen_assignment') = 1
  and (select updated_at::text from app.fantasy_fixture_assignments
       where id = current_setting('test.assignment')::uuid) = current_setting('test.updated_at'),
  'and writes nothing: no second audit event, the first reason kept, the row not touched');

-- ---------------------------------------------------------------------------
-- The lifecycle moves on, and the ops check stops naming the match.
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.advance(pg_temp.gw(1)) ->> 'status', 'provisional',
  'GW1 leaves live for scoring once the postponed match no longer counts');
select extensions.ok(
  pg_temp.scoring_check() ->> 'status' = 'ok'
  and pg_temp.scoring_check() ->> 'detail' like 'GW1: every counted match final, points due by % UTC',
  'fantasy_scoring now waits for the points of the two matches played: ' || (pg_temp.scoring_check() ->> 'detail'));

-- ---------------------------------------------------------------------------
-- Scoring: the players of the postponed match score nothing, and are
-- substituted and replaced as captain the way the scoring worker defines.
-- ---------------------------------------------------------------------------
-- Certified statistics for the two matches played: 22 players each, 90
-- minutes, nothing else.
insert into app.player_fixture_performances (football_season_id, fixture_id, player_id, team_id, position,
  source_provider, source_version, started, appeared, minutes, goals, assists, clean_sheets,
  goals_conceded, saves, penalties_saved, penalties_missed, yellow_cards, red_cards,
  second_yellow_dismissals, own_goals, provider_observed_at)
select 'd2000000-0000-4000-8000-000000000001',
  case when i <= 22 then pg_temp.fixture(1, 1) else pg_temp.fixture(1, 3) end,
  pg_temp.player(i), pg_temp.club((i - 1) / 11 + 1), p.position, 'sportsmonks',
  'sportsmonks-current-fixture:' || repeat('a', 64), true, true, 90, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, now()
from generate_series(1, 66) i join app.players p on p.id = pg_temp.player(i)
where i <= 22 or i >= 45;
insert into app_private.historical_performance_fixture_coverage (fixture_id, football_season_id,
  source_provider, source_version, lineup_rows_seen, valid_player_rows, excluded_incomplete_rows,
  starter_rows, team_count, detail_rows, invalid_detail_rows, performance_rows, reconciled,
  provider_observed_at, scoring_statistics_complete)
select played, 'd2000000-0000-4000-8000-000000000001', 'sportsmonks',
  'sportsmonks-current-fixture:' || repeat('a', 64), 22, 22, 0, 22, 2, 264, 0, 22, true, now(), true
from unnest(array[pg_temp.fixture(1, 1), pg_temp.fixture(1, 3)]) played;

select set_config('test.snapshot', api.service_get_fantasy_scoring_snapshot(pg_temp.gw(1), 1, null, 100)::text, true);
select extensions.is(
  (select array_agg((f ->> 'fixtureId')::uuid order by f ->> 'fixtureId')
   from jsonb_array_elements(current_setting('test.snapshot')::jsonb -> 'fixtures') f),
  array[pg_temp.fixture(1, 1), pg_temp.fixture(1, 3)],
  'the scoring input holds the two matches played; the postponed one is out');
select extensions.ok(
  jsonb_array_length(current_setting('test.snapshot')::jsonb -> 'playerFixtures') = 44
  and not exists (select 1 from jsonb_array_elements(current_setting('test.snapshot')::jsonb -> 'playerFixtures') pf
    where (pf ->> 'fixtureId')::uuid = pg_temp.fixture(1, 2)
      or (pf ->> 'fantasyPlayerId')::uuid in (select pg_temp.fp(i) from generate_series(23, 44) i)),
  'no statistics row for a player of clubs 3 or 4: for the worker they did not play');

-- Player results as the worker computes them (2 points each for 90 minutes).
select set_config('test.players', (
  select jsonb_agg(jsonb_build_object('fantasyPlayerId', pf ->> 'fantasyPlayerId', 'fixtureId', pf ->> 'fixtureId',
    'events', (select jsonb_agg(jsonb_build_object('category', category,
        'points', case when category = 'appearance' then 2 else 0 end,
        'sourceKey', 'fixture-stats:' || (pf ->> 'fixtureId') || ':' || (pf ->> 'playerId') || ':' || category)
      order by category)
      from unnest(array['appearance', 'goal', 'assist', 'clean_sheet', 'goals_conceded', 'saves', 'penalty_save',
        'penalty_miss', 'yellow_card', 'red_card', 'second_yellow_dismissal', 'own_goal']) category)))::text
  from jsonb_array_elements(current_setting('test.snapshot')::jsonb -> 'playerFixtures') pf), true);
-- The team as scripts/backend/fantasy-lifecycle-runner.ts scores it: starters
-- 24 (DEF) and 29 (MID, captain) did not play. 24 is replaced by the first
-- bench player who played and keeps the formation legal (45 is a goalkeeper;
-- 13, a defender, is next). No one who played is left for 29 (40 and 43 did
-- not play), so 29 stays in with 0 points and the vice-captain, 7, takes the
-- armband. Starting 20, bench 2 (45), captain bonus 2: 22.
create function pg_temp.team_result(p_captain integer, p_substitutions jsonb) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'teamId', 'da000000-0000-4000-8000-000000000001', 'lineupId', 'db000000-0000-4000-8000-000000000001',
    'startingPoints', 20, 'benchPoints', 2, 'captainPoints', 2, 'transferHit', 0, 'provisionalScore', 22,
    'effectiveCaptainId', pg_temp.fp(p_captain), 'substitutions', p_substitutions,
    'players', (select jsonb_agg(jsonb_build_object('fantasyPlayerId', pg_temp.fp(n), 'multiplier', m))
      from (values (1, 1), (2, 1), (24, 0), (46, 1), (57, 1), (29, 1), (7, 2), (51, 1), (62, 1),
        (21, 1), (65, 1), (45, 0), (13, 1), (40, 0), (43, 0)) player(n, m))))
$$;
select extensions.throws_ok(
  format($$select api.service_persist_fantasy_scoring_results(%L, 1, %L, %L, pg_temp.team_result(29,
    jsonb_build_array(jsonb_build_object('playerOutId', pg_temp.fp(24), 'playerInId', pg_temp.fp(13), 'reason', 'outfield_did_not_play'))))$$,
    pg_temp.gw(1), current_setting('test.snapshot')::jsonb ->> 'inputDigest', current_setting('test.players')),
  'PT400', 'fantasy_captain_result_invalid',
  'the captain whose match was taken out cannot keep the armband');
select extensions.throws_ok(
  format($$select api.service_persist_fantasy_scoring_results(%L, 1, %L, %L, pg_temp.team_result(7,
    jsonb_build_array(jsonb_build_object('playerOutId', pg_temp.fp(24), 'playerInId', pg_temp.fp(13), 'reason', 'outfield_did_not_play'),
      jsonb_build_object('playerOutId', pg_temp.fp(29), 'playerInId', pg_temp.fp(40), 'reason', 'outfield_did_not_play'))))$$,
    pg_temp.gw(1), current_setting('test.snapshot')::jsonb ->> 'inputDigest', current_setting('test.players')),
  'PT400', 'fantasy_substitution_invalid',
  'nor does a bench player of that match come on: he did not play either');
select extensions.is(
  api.service_persist_fantasy_scoring_results(pg_temp.gw(1), 1,
    current_setting('test.snapshot')::jsonb ->> 'inputDigest', current_setting('test.players')::jsonb,
    pg_temp.team_result(7, jsonb_build_array(jsonb_build_object('playerOutId', pg_temp.fp(24),
      'playerInId', pg_temp.fp(13), 'reason', 'outfield_did_not_play')))) ->> 'teamsPersisted',
  '1', 'the worker''s result is accepted: 24 replaced by 13, the vice-captain promoted');
select extensions.is(
  (select count(*)::integer from app.fantasy_player_gameweek_points
   where gameweek_id = pg_temp.gw(1) and fantasy_player_id in (select pg_temp.fp(i) from generate_series(23, 44) i)
     and provisional_points = 0 and not did_play and minutes_played = 0), 22,
  'every player of clubs 3 and 4 scores 0 in GW1, 0 minutes, did not play');
select extensions.is(
  (select jsonb_agg(jsonb_build_object('out', player_out_id, 'in', player_in_id, 'reason', reason))
   from app.fantasy_auto_substitutions where lineup_id = 'db000000-0000-4000-8000-000000000001'),
  jsonb_build_array(jsonb_build_object('out', pg_temp.fp(24), 'in', pg_temp.fp(13), 'reason', 'outfield_did_not_play')),
  'one automatic substitution is recorded');
select extensions.is(
  (select jsonb_build_object('starting', starting_points, 'bench', bench_points, 'captain', captain_points,
     'score', provisional_score)
   from app.fantasy_team_gameweek_results where gameweek_id = pg_temp.gw(1)),
  jsonb_build_object('starting', 20, 'bench', 2, 'captain', 2, 'score', 22),
  'the team scores 22, the captain bonus on the vice-captain');

-- In scoring now: the tool refuses to touch it.
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.fixture(1, 1))),
  'PT409', 'fantasy_gameweek_scoring_started', 'a provisional gameweek is refused');
update app.fantasy_gameweeks set status = 'finalizing' where id = pg_temp.gw(1);
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.fixture(1, 1))),
  'PT409', 'fantasy_gameweek_scoring_started', 'so is a finalizing one');
update app.fantasy_gameweeks set status = 'provisional' where id = pg_temp.gw(1);

-- ---------------------------------------------------------------------------
-- Superseded by anything else: not the tool's to repeat.
-- ---------------------------------------------------------------------------
update app.fixtures set status = 'postponed' where id = pg_temp.fixture(2, 2);
select api.service_sync_fantasy_calendar('d6300000-0000-4000-8000-000000000001');
select extensions.is(
  (select resolution from app.fantasy_fixture_assignments
   where fixture_id = pg_temp.fixture(2, 2) and superseded_at is not null),
  'provider_postponed', 'the sync defers a match of the scheduled GW2 by itself');
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, (select id from app.fantasy_fixture_assignments
    where fixture_id = pg_temp.fixture(2, 2) and superseded_at is not null)),
  'PT409', 'fantasy_assignment_not_current', 'an assignment the sync superseded is refused');
update app.fixtures set status = 'not_started' where id = pg_temp.fixture(2, 2);
select api.service_sync_fantasy_calendar('d6300000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- The rescheduled match: assigned by its provider round, never to a
-- gameweek that has locked.
-- ---------------------------------------------------------------------------
-- The provider gives it a date in round 2's week, still in round 1.
update app.fixtures set status = 'not_started',
  kickoff_at = date_trunc('hour', now()) + interval '17 minutes' + interval '9 days'
where id = pg_temp.fixture(1, 2);
select set_config('test.sync', api.service_sync_fantasy_calendar('d6300000-0000-4000-8000-000000000001')::text, true);
select extensions.ok(
  (select round -> 'notes' @> '["gameweek_locked"]'::jsonb
   from jsonb_array_elements(current_setting('test.sync')::jsonb -> 'rounds') round
   where (round ->> 'round')::integer = 1),
  'the sync leaves GW1 alone');
select extensions.is(pg_temp.assignment(pg_temp.fixture(1, 2)), null::uuid,
  'rescheduled, the match counts for no gameweek: not GW1 again, and not GW2, whose round it is not');
select extensions.is(
  (select count(*)::integer from app.fantasy_fixture_assignments
   where gameweek_id = pg_temp.gw(2) and superseded_at is null and counts_points), 3,
  'GW2 keeps its own three matches');
select extensions.is(
  api.service_sync_fantasy_calendar('d6300000-0000-4000-8000-000000000001') -> 'assignmentsAdded', '0'::jsonb,
  'and a second sync changes nothing');

-- If the provider moves it into round 3, whose gameweek is still scheduled, the
-- sync assigns it there like any match of that round.
update app.fixtures set round_id = 'd3000000-0000-4000-8000-000000000003',
  kickoff_at = date_trunc('hour', now()) + interval '17 minutes' + interval '15 days 7 hours'
where id = pg_temp.fixture(1, 2);
select api.service_sync_fantasy_calendar('d6300000-0000-4000-8000-000000000001');
select extensions.is(
  (select jsonb_build_object('gameweek', gameweek_id, 'original', original_gameweek_id,
     'status', assignment_status, 'counts', counts_points, 'frozen', frozen_at is not null)
   from app.fantasy_fixture_assignments where id = pg_temp.assignment(pg_temp.fixture(1, 2))),
  jsonb_build_object('gameweek', pg_temp.gw(3), 'original', pg_temp.gw(3), 'status', 'assigned',
    'counts', true, 'frozen', false),
  'moved into round 3 by the provider, the match lands in GW3, the gameweek of its new round');
select extensions.is(
  (select array_agg(resolution order by created_at) from app.fantasy_fixture_assignments
   where fixture_id = pg_temp.fixture(1, 2)),
  array['operator_deferred', null],
  'its history keeps the GW1 decision beside the new assignment');
-- But GW3 now holds clubs 3 and 4 twice, and the next-gameweek opening takes
-- one match per club per round: no double gameweeks yet. (GW1 and GW2 are
-- marked final by hand: only the opening's calendar check is under test.)
update app.fantasy_gameweeks set status = 'finalized', points_state = 'final', finalized_at = statement_timestamp(),
  scoring_input_version = 1
where id in (pg_temp.gw(1), pg_temp.gw(2));
insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version, price_source_version,
  price_player_ids, prices_completed_at, completed_at)
values (pg_temp.gw(2), 1, 2, array[pg_temp.fp(1)], statement_timestamp(), statement_timestamp());
select extensions.throws_ok(
  format($$select api.service_prepare_next_fantasy_gameweek(%L, %L, 1, 100)$$, pg_temp.gw(2), pg_temp.gw(3)),
  'PT409', 'fantasy_next_calendar_incomplete',
  'GW3 cannot open with a club playing twice: that is an owner''s decision, not the tool''s');

-- ---------------------------------------------------------------------------
-- Settled gameweeks and closed seasons.
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.fixture(1, 1))),
  'PT409', 'fantasy_gameweek_settled', 'a finalized gameweek is refused');
update app.fantasy_gameweeks set status = 'corrected', corrected_at = statement_timestamp() where id = pg_temp.gw(1);
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.fixture(1, 1))),
  'PT409', 'fantasy_gameweek_settled', 'so is a corrected one');
select extensions.is(
  (pg_temp.resolve(current_setting('test.assignment')::uuid) ->> 'alreadyResolved')::boolean, true,
  'the resolved match still answers its recorded outcome once its gameweek is settled');
update app.fantasy_seasons set status = 'completed' where id = 'd6300000-0000-4000-8000-000000000001';
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.fixture(1, 1))),
  'PT409', 'fantasy_season_closed', 'a closed season is refused');
update app.fantasy_seasons set status = 'active' where id = 'd6300000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- A cup whose GW1 is live, locked three days ago: matches cancelled,
-- abandoned, postponed and moved past the window, and the states the lock
-- never leaves behind.
-- ---------------------------------------------------------------------------
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('d1000000-0000-4000-8000-000000000002', 'resolve-cup', 'Resolve Cup', 'RCU', 'cup',
  'd0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002',
  'Cup season', current_date - 10, current_date + 100, 'active', false);
insert into app.rounds (id, season_id, round_number, name)
values ('d3000000-0000-4000-8000-000000000011', 'd2000000-0000-4000-8000-000000000002', 1, 'Cup round 1');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('d6000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002',
  'resolve-cup', 'Resolve Cup', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values ('d6300000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002',
  'd2000000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000100',
  'Cup', 'active', current_date - 10, current_date + 100);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
select 'dd000000-0000-4000-8000-000000000001', 'd6300000-0000-4000-8000-000000000002', pg_temp.player(1),
  pg_temp.club(1), id, 6 from app.fantasy_positions where code = 'GK';
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state)
values ('dc000000-0000-4000-8000-000000000001', 'd6300000-0000-4000-8000-000000000002',
  'd3000000-0000-4000-8000-000000000011', 1, 'Cup round 1', statement_timestamp() - interval '3 days',
  statement_timestamp() - interval '3 days', statement_timestamp() + interval '1 day', 'live', 'provisional');
-- C1 cancelled, frozen 50 h ago; C2 finished; C3 frozen 47 h 59 min ago and
-- now at +3 days, past the window; C4 counted but never frozen; C5 frozen
-- but not counted; C6 suspended inside the window; C7 abandoned 10 h ago; C8
-- postponed, frozen 60 h ago.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, finalized_at, provider_updated_at, source_sequence)
select ('de000000-0000-4000-8000-00000000000' || c.n)::uuid, 'd1000000-0000-4000-8000-000000000002',
  'd2000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000011',
  pg_temp.club(c.home), pg_temp.club(c.away), date_trunc('hour', now()) + interval '17 minutes' + c.kickoff,
  c.status::app.fixture_status, c.score, c.score,
  case when c.status = 'finished' then now() - interval '47 hours' end, now(), 1
from (values
  (1, 1, 2, interval '-50 hours', 'cancelled', null::integer),
  (2, 3, 4, interval '-49 hours', 'finished', 1),
  (3, 5, 6, interval '3 days', 'not_started', null),
  (4, 1, 3, interval '2 hours', 'not_started', null),
  (5, 2, 4, interval '4 hours', 'not_started', null),
  (6, 5, 1, interval '-1 hour', 'suspended', 0),
  (7, 2, 6, interval '-10 hours', 'abandoned', null),
  (8, 3, 5, interval '-60 hours', 'postponed', null)
) as c(n, home, away, kickoff, status, score);
create function pg_temp.cup(n integer) returns uuid language sql immutable as $$
  select ('de000000-0000-4000-8000-00000000000' || n)::uuid
$$;
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, source_version, frozen_at)
select 'd6300000-0000-4000-8000-000000000002', f.id, 'dc000000-0000-4000-8000-000000000001',
  'dc000000-0000-4000-8000-000000000001', f.kickoff_at, f.kickoff_at, 1, statement_timestamp() - interval '3 days'
from app.fixtures f where f.id = pg_temp.cup(1);
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.cup(1))),
  'PT409', 'fantasy_gameweek_needs_a_fixture',
  'the last counted match of a gameweek is refused: with none left it could never be scored');
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, source_version, frozen_at, counts_points)
select 'd6300000-0000-4000-8000-000000000002', f.id, 'dc000000-0000-4000-8000-000000000001',
  'dc000000-0000-4000-8000-000000000001',
  case when f.id = pg_temp.cup(3) then now() - interval '47 hours 59 minutes' else f.kickoff_at end,
  case when f.id = pg_temp.cup(3) then now() - interval '47 hours 59 minutes' else f.kickoff_at end,
  1, case when f.id = pg_temp.cup(4) then null else statement_timestamp() - interval '3 days' end,
  f.id <> pg_temp.cup(5)
from app.fixtures f
where f.id in (pg_temp.cup(2), pg_temp.cup(3), pg_temp.cup(4), pg_temp.cup(5), pg_temp.cup(6),
  pg_temp.cup(7), pg_temp.cup(8));
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.cup(4))),
  'PT409', 'fantasy_assignment_not_frozen', 'an assignment the lock never froze is refused');
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.cup(5))),
  'PT409', 'fantasy_assignment_not_counted', 'so is one that does not count');
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.cup(6))),
  'PT409', 'fantasy_fixture_can_still_finish', 'and a match suspended inside the window, which can resume');

-- The rules keep every kind of hold for 48 h: abandoned, moved and cancelled
-- as well as postponed.
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.cup(7))),
  'PT409', pg_temp.window_open(pg_temp.assignment(pg_temp.cup(7))),
  'a match abandoned 10 h after its frozen kickoff is refused until 48 h have passed');
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.cup(3))),
  'PT409', pg_temp.window_open(pg_temp.assignment(pg_temp.cup(3))),
  'so is a match moved past the window, 47 h 59 min after the kickoff it was frozen with');
update app.fantasy_fixture_assignments set assigned_kickoff_at = statement_timestamp() - interval '47 hours 59 minutes'
where id = pg_temp.assignment(pg_temp.cup(1));
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.cup(1))),
  'PT409', pg_temp.window_open(pg_temp.assignment(pg_temp.cup(1))),
  'and a cancelled one 47 h 59 min after it');
update app.fantasy_fixture_assignments a set assigned_kickoff_at = f.kickoff_at
from app.fixtures f where f.id = a.fixture_id and a.id = pg_temp.assignment(pg_temp.cup(1));

insert into app.fantasy_player_point_events (fantasy_player_id, gameweek_id, fixture_id, category, points,
  scoring_version, source_sequence, source_key)
values ('dd000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000001',
  pg_temp.cup(1), 'appearance', 1, 1, 1, 'resolve-test:cancelled-match');
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.cup(1))),
  'PT409', 'fantasy_fixture_points_recorded',
  'a match with points already recorded is refused: the tool never deletes points');
delete from app.fantasy_player_point_events where source_key = 'resolve-test:cancelled-match';
select extensions.is(
  pg_temp.resolve(pg_temp.assignment(pg_temp.cup(1)), 'Cancelled by the federation after the deadline.') ->> 'hold',
  'called_off', 'a match cancelled 50 h after its frozen kickoff is resolved');
update app.fantasy_fixture_assignments set assigned_kickoff_at = statement_timestamp() - interval '48 hours'
where id = pg_temp.assignment(pg_temp.cup(3));
select extensions.is(
  pg_temp.resolve(pg_temp.assignment(pg_temp.cup(3)), 'Moved by the league to after the gameweek''s window.') ->> 'hold',
  'moved', 'so is one moved past the window, once 48 h have passed');

-- The window is the ruleset's own (app.fantasy_fixture_rules), read where the
-- ops check reads it.
update app.fantasy_fixture_rules set post_lock_completion_window_hours = 12
where ruleset_id = 'f6100000-0000-4000-8000-000000000100';
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.cup(7))),
  'PT409', (select 'fantasy_postponement_window_open: resolvable from '
    || to_char((assigned_kickoff_at + interval '12 hours') at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC'
    from app.fantasy_fixture_assignments where id = pg_temp.assignment(pg_temp.cup(7))),
  'a ruleset with a 12 h window keeps the abandoned match 12 h');
update app.fantasy_fixture_rules set post_lock_completion_window_hours = 9
where ruleset_id = 'f6100000-0000-4000-8000-000000000100';
select extensions.is(
  pg_temp.resolve(pg_temp.assignment(pg_temp.cup(7)), 'Abandoned, and the ruleset''s window has passed.')
    ->> 'completionWindowHours',
  '9', 'and one with a 9 h window lets it go after 10 h');
delete from app.fantasy_fixture_rules where ruleset_id = 'f6100000-0000-4000-8000-000000000100';
select extensions.throws_ok(
  format($$select pg_temp.resolve(%L)$$, pg_temp.assignment(pg_temp.cup(8))),
  'PT409', 'fantasy_fixture_rules_missing',
  'a ruleset without a post-lock completion window is refused rather than guessed');

select extensions.is(
  (select count(*)::integer from app.fantasy_fixture_assignments
   where gameweek_id = 'dc000000-0000-4000-8000-000000000001' and superseded_at is not null
     and resolution = 'operator_deferred' and assignment_status = 'deferred' and not counts_points), 3,
  'the three resolved are superseded the same way');
select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events where action = 'fantasy_fixture.resolve_frozen_assignment'),
  4, 'one audit event per resolution, and none for any refusal');

select * from extensions.finish();
rollback;
