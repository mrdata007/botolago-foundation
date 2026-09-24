-- Pronostics leagues (20260925090300_predictions_leagues.sql) and the Fantasy
-- worker's league page (20260925090500_fantasy_league_page_skip_empty.sql).
--
-- One league, two games: a league is one app.fantasy_leagues row and one
-- invite code. Fantasy managers join it through Fantasy, anyone else joins it
-- for Pronostics only, and each person counts once in its Pronostics ranking.
begin;
select extensions.no_plan();

create function pg_temp.pid(n integer) returns uuid language sql immutable as $$
  select ('a7600000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated","aal":"aal1"}', p_id), true)
$$;
create function pg_temp.digest(p_code text) returns text language sql immutable as $$
  select encode(extensions.digest(convert_to(p_code, 'UTF8'), 'sha256'), 'hex')
$$;

create temporary table clock on commit drop as
select date_trunc('second', statement_timestamp()) as t0;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.pid(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values
  (pg_temp.pid(2), 'pronostics-league-test', 'Pronostics League Test', 'PLT', 'league',
    (select id from app.countries where iso_alpha2 = 'MA')),
  (pg_temp.pid(5), 'pronostics-cup-test', 'Pronostics Cup Test', 'PCU', 'cup',
    (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values
  (pg_temp.pid(3), pg_temp.pid(2), 'Current', current_date - 60, current_date + 300, 'active', true),
  (pg_temp.pid(4), pg_temp.pid(2), 'Previous', current_date - 420, current_date - 61, 'completed', false),
  (pg_temp.pid(6), pg_temp.pid(5), 'Cup', current_date - 10, current_date + 100, 'active', true);
insert into app.rounds (id, season_id, round_number, name) values
  (pg_temp.pid(11), pg_temp.pid(3), 1, 'Journée 1'),
  (pg_temp.pid(12), pg_temp.pid(3), 2, 'Journée 2');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.pid(100 + n), 'pronos-league-club-' || n, 'League Club ' || n, 'LC' || n, 'L' || n,
  (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 2) n;
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, provider_updated_at)
select pg_temp.pid(1001), pg_temp.pid(2), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(101),
  pg_temp.pid(102), t0 + interval '1 day', 'not_started', t0 - interval '1 day'
from clock;

-- Fantasy: this season (active) and last season (completed).
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.pid(40), pg_temp.pid(2), 'pronostics-league-test', 'Pronostics League Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name,
  status, starts_at, ends_at)
values
  (pg_temp.pid(41), pg_temp.pid(40), pg_temp.pid(3), 'f6100000-0000-4000-8000-000000000100',
    'Current Fantasy', 'active', current_date - 60, current_date + 300),
  (pg_temp.pid(46), pg_temp.pid(40), pg_temp.pid(4), 'f6100000-0000-4000-8000-000000000100',
    'Previous Fantasy', 'completed', current_date - 420, current_date - 61);
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status)
select pg_temp.pid(42), pg_temp.pid(41), pg_temp.pid(11), 1, 'GW1',
  t0 + interval '22 hours', t0 + interval '1 day', t0 + interval '3 days', 'open'
from clock;

-- Players: 1 creates, 2 joins, 3 stays outside, 4 owns a Fantasy league,
-- 5 plays Fantasy, 6 joins later, 7 is banned.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.pid(20 + n), '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'pronos-league-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'pronos_league_' || n, 'display_name', 'League Player ' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 7) n;
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.pid(29), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'pronos-league-staff@example.test', statement_timestamp(), 'hash', '{}',
  '{"username":"league_staff"}', statement_timestamp(), statement_timestamp());
insert into app_private.staff_principals (id, auth_user_id) values (pg_temp.pid(30), pg_temp.pid(29));
insert into app_private.user_bans (user_id, banned_by_principal_id, reason)
values (pg_temp.pid(27), pg_temp.pid(30), 'Pronostics league fixture ban.');

insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank,
  team_value, free_transfers)
values
  (pg_temp.pid(44), pg_temp.pid(24), pg_temp.pid(41), pg_temp.pid(42), 'Team Four', 0, 100, 1),
  (pg_temp.pid(45), pg_temp.pid(25), pg_temp.pid(41), pg_temp.pid(42), 'Team Five', 0, 100, 1);

-- L1: a Fantasy league owned by player 4. L2: last season's. L3: archived.
insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility,
  invite_code_digest, invite_code_hint, active, member_count)
values
  (pg_temp.pid(50), pg_temp.pid(41), pg_temp.pid(24), 'Fantasy Four', 'private',
    pg_temp.digest('C0FFEE00C0FFEE00C0FFEE00C0FFEE00'), 'EE00', true, 1),
  (pg_temp.pid(52), pg_temp.pid(46), pg_temp.pid(24), 'Old Season', 'private',
    pg_temp.digest('DEAD0000DEAD0000DEAD0000DEAD0000'), '0000', true, 0),
  (pg_temp.pid(53), pg_temp.pid(41), pg_temp.pid(24), 'Archived', 'private',
    pg_temp.digest('BEEF0000BEEF0000BEEF0000BEEF0000'), '0000', false, 0);
insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role, status)
values (pg_temp.pid(50), pg_temp.pid(44), pg_temp.pid(24), 'owner', 'active');

select app_private.predictions_configure('public', true, '{}', pg_temp.pid(2));

-- ---------------------------------------------------------------------------
-- Creating a league
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select set_config('test.created', api.create_prediction_league('Les Lions')::text, true);
select extensions.ok((current_setting('test.created')::jsonb ->> 'inviteCode') ~ '^[0-9A-F]{32}$',
  'the invite code is returned once, 32 hex characters');
select extensions.is((current_setting('test.created')::jsonb ->> 'created')::boolean, true, 'created');
select set_config('test.league', current_setting('test.created')::jsonb ->> 'leagueId', true);
select set_config('test.code', current_setting('test.created')::jsonb ->> 'inviteCode', true);
select extensions.is(api.create_prediction_league('Les Lions') - 'leagueId',
  '{"name": "Les Lions", "inviteCode": null, "created": false}'::jsonb,
  'a double tap returns the league just created, without repeating the code');
select extensions.is(api.create_prediction_league('Les Lions') ->> 'leagueId',
  current_setting('test.league'), 'the same league');
select extensions.throws_ok($$select api.create_prediction_league(' Les Lions')$$, 'PT400',
  'validation_failed', 'a name with surrounding spaces is refused');
select extensions.throws_ok($$select api.create_prediction_league('ab')$$, 'PT400',
  'validation_failed', 'a two-letter name is refused');
select extensions.throws_ok(format($$select api.create_prediction_league('%s')$$, repeat('x', 81)),
  'PT400', 'validation_failed', 'an 81-letter name is refused');
select extensions.throws_ok($$select api.create_prediction_league(null)$$, 'PT400',
  'validation_failed', 'no name is refused');
reset role;

select extensions.is(
  (select jsonb_build_object('owner', owner_user_id, 'members', member_count, 'visibility', visibility,
     'digest', invite_code_digest = pg_temp.digest(current_setting('test.code')),
     'hint', invite_code_hint = right(current_setting('test.code'), 4), 'season', fantasy_season_id)
   from app.fantasy_leagues where id = current_setting('test.league')::uuid),
  jsonb_build_object('owner', pg_temp.pid(21), 'members', 0, 'visibility', 'private', 'digest', true,
    'hint', true, 'season', pg_temp.pid(41)),
  'an ordinary private league of this Fantasy season: Fantasy member count 0, code stored as a digest');
select extensions.is(
  (select jsonb_agg(jsonb_build_object('user', user_id, 'role', role, 'status', status))
   from app.prediction_league_members where league_id = current_setting('test.league')::uuid),
  jsonb_build_array(jsonb_build_object('user', pg_temp.pid(21), 'role', 'owner', 'status', 'active')),
  'the creator is its owner, as a Pronostics member');

-- ---------------------------------------------------------------------------
-- Joining
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(22));
select extensions.is(
  api.join_prediction_league(lower(substr(current_setting('test.code'), 1, 16)) || ' - '
    || lower(substr(current_setting('test.code'), 17))) - 'leagueId',
  '{"name": "Les Lions", "joined": true, "via": "predictions"}'::jsonb,
  'a typed code with spaces, dashes and lower case joins the league');
select extensions.is(api.join_prediction_league(current_setting('test.code')) ->> 'joined', 'false',
  'joining twice changes nothing');
select extensions.throws_ok($$select api.join_prediction_league('00000000000000000000000000000000')$$,
  'PT404', 'invite_code_invalid', 'an unknown code');
select extensions.throws_ok($$select api.join_prediction_league('hello')$$,
  'PT404', 'invite_code_invalid', 'a malformed code gets the same answer');
select extensions.throws_ok($$select api.join_prediction_league('DEAD0000DEAD0000DEAD0000DEAD0000')$$,
  'PT404', 'invite_code_invalid', 'last season''s league gets the same answer');
select extensions.throws_ok($$select api.join_prediction_league('BEEF0000BEEF0000BEEF0000BEEF0000')$$,
  'PT404', 'invite_code_invalid', 'an archived league gets the same answer');
select extensions.throws_ok($$select api.join_prediction_league(null)$$,
  'PT400', 'invite_code_invalid', 'no code at all');
select extensions.is(api.join_prediction_league('C0FFEE00C0FFEE00C0FFEE00C0FFEE00') ->> 'joined', 'true',
  'a Fantasy league''s code lets a player without a Fantasy team join it for Pronostics');

select pg_temp.as_user(pg_temp.pid(24));
select extensions.is(api.join_prediction_league('C0FFEE00C0FFEE00C0FFEE00C0FFEE00') - 'leagueId',
  '{"name": "Fantasy Four", "joined": false, "via": "fantasy"}'::jsonb,
  'a Fantasy member is already in: no second membership');

-- Player 5 joins Les Lions through Fantasy, with the same code.
select pg_temp.as_user(pg_temp.pid(25));
select extensions.is(api.join_fantasy_league(pg_temp.pid(45), current_setting('test.code'), gen_random_uuid()) ->> 'joined',
  'true', 'the same code works in Fantasy');
select extensions.is(api.join_prediction_league(current_setting('test.code')) ->> 'via', 'fantasy',
  'and then counts as a Fantasy member in Pronostics');

select pg_temp.as_user(pg_temp.pid(27));
select extensions.throws_ok(format($$select api.join_prediction_league('%s')$$, current_setting('test.code')),
  'PT403', 'account_banned', 'a banned account cannot join');
select extensions.throws_ok($$select api.create_prediction_league('Banned League')$$,
  'PT403', 'account_banned', 'a banned account cannot create');
reset role;
select extensions.is(
  (select member_count from app.fantasy_leagues where id = current_setting('test.league')::uuid), 1,
  'the Fantasy member count counts Fantasy members only');

-- ---------------------------------------------------------------------------
-- Leaving
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(22));
select extensions.is(api.leave_prediction_league(current_setting('test.league')::uuid) ->> 'left', 'true',
  'a member leaves');
select extensions.throws_ok(format($$select api.leave_prediction_league('%s')$$, current_setting('test.league')),
  'PT404', 'league_membership_not_found', 'leaving twice');
select pg_temp.as_user(pg_temp.pid(21));
select extensions.throws_ok(format($$select api.leave_prediction_league('%s')$$, current_setting('test.league')),
  'PT409', 'league_owner_cannot_leave', 'the owner cannot leave');
select pg_temp.as_user(pg_temp.pid(25));
select extensions.throws_ok(format($$select api.leave_prediction_league('%s')$$, current_setting('test.league')),
  'PT404', 'league_membership_not_found', 'a Fantasy membership is left in Fantasy, not here');
select pg_temp.as_user(pg_temp.pid(22));
select extensions.is(api.join_prediction_league(current_setting('test.code')) ->> 'joined', 'true',
  'a player who left can come back');
reset role;
select extensions.is(
  (select jsonb_build_object('status', status, 'left', left_at) from app.prediction_league_members
   where league_id = current_setting('test.league')::uuid and user_id = pg_temp.pid(22)),
  '{"status": "active", "left": null}'::jsonb, 'the same membership is reactivated');

-- ---------------------------------------------------------------------------
-- My leagues
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select extensions.is(
  (api.my_prediction_leagues() -> 'items' -> 0) - 'leagueId',
  jsonb_build_object('name', 'Les Lions', 'via', 'predictions', 'role', 'owner', 'members', 3,
    'inviteCodeHint', right(current_setting('test.code'), 4), 'seasonPoints', 0),
  'the owner''s league: three people (two Pronostics members and one Fantasy manager), the code hint');
select pg_temp.as_user(pg_temp.pid(22));
select extensions.is(
  (select jsonb_agg(jsonb_build_array(item ->> 'name', item ->> 'role', item -> 'inviteCodeHint'))
   from jsonb_array_elements(api.my_prediction_leagues() -> 'items') item),
  '[["Fantasy Four", "member", null], ["Les Lions", "member", null]]'::jsonb,
  'a member sees both leagues and no code hint');
select pg_temp.as_user(pg_temp.pid(25));
select extensions.is(api.my_prediction_leagues() -> 'items' -> 0 ->> 'via', 'fantasy',
  'a Fantasy manager''s league comes through Fantasy');
reset role;

-- ---------------------------------------------------------------------------
-- A league's Pronostics ranking
-- ---------------------------------------------------------------------------
insert into app.prediction_standings (season_id, round_id, user_id, points, exact_count,
  outcome_count, miss_count, void_count, scored_count, predicted_count, rounds_played, rank)
values
  (pg_temp.pid(3), null, pg_temp.pid(21), 6, 1, 3, 0, 0, 4, 4, 2, 2),
  (pg_temp.pid(3), null, pg_temp.pid(22), 6, 2, 0, 1, 0, 3, 3, 2, 1),
  (pg_temp.pid(3), null, pg_temp.pid(23), 20, 6, 2, 0, 0, 8, 8, 2, 1),
  (pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(21), 3, 1, 0, 0, 0, 1, 1, null, 1),
  (pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(22), 3, 1, 0, 0, 0, 1, 1, null, 1),
  (pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(25), 0, 0, 0, 0, 1, 0, 1, null, null);

set local role authenticated;
select pg_temp.as_user(pg_temp.pid(22));
select set_config('test.standings', api.predictions_league_standings(current_setting('test.league')::uuid)::text, true);
select extensions.is(
  (select jsonb_agg(jsonb_build_array(item -> 'rank', item ->> 'name', item -> 'tied', item -> 'isMe'))
   from jsonb_array_elements(current_setting('test.standings')::jsonb -> 'items') item),
  '[[1, "League Player 2", false, true], [2, "League Player 1", false, false]]'::jsonb,
  'the season ranking of the league: equal points, more exact scores first');
select extensions.is(current_setting('test.standings')::jsonb - array['items', 'league'],
  '{"scope": "season", "round": null, "members": 3, "notPlayed": 1}'::jsonb,
  'the Fantasy manager who has not played yet is counted, not ranked; outsiders never appear');
select extensions.is(
  (select jsonb_agg(jsonb_build_array(item -> 'rank', item -> 'tied'))
   from jsonb_array_elements(api.predictions_league_standings(current_setting('test.league')::uuid, 1) -> 'items') item),
  '[[1, true], [1, true]]'::jsonb, 'journée 1: a shared first place');
select extensions.is(api.predictions_league_standings(current_setting('test.league')::uuid) -> 'league' -> 'isOwner',
  'false'::jsonb, 'a member is not the owner');
select extensions.throws_ok(format($$select api.predictions_league_standings('%s', 9)$$, current_setting('test.league')),
  'PT404', 'predictions_round_not_found', 'an unknown journée');
select pg_temp.as_user(pg_temp.pid(23));
select extensions.throws_ok(format($$select api.predictions_league_standings('%s')$$, current_setting('test.league')),
  'PT403', 'league_access_denied', 'an outsider cannot read the league');
select pg_temp.as_user(pg_temp.pid(21));
select extensions.is(api.predictions_league_standings(current_setting('test.league')::uuid) -> 'league',
  jsonb_build_object('id', current_setting('test.league'), 'name', 'Les Lions', 'isOwner', true,
    'inviteCodeHint', right(current_setting('test.code'), 4)),
  'the owner sees the code hint');
reset role;

-- ---------------------------------------------------------------------------
-- A new code
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(22));
select extensions.throws_ok(format($$select api.reset_prediction_league_invite_code('%s')$$, current_setting('test.league')),
  'PT403', 'league_access_denied', 'only the owner can change the code');
select pg_temp.as_user(pg_temp.pid(21));
select set_config('test.newcode',
  api.reset_prediction_league_invite_code(current_setting('test.league')::uuid) ->> 'inviteCode', true);
select extensions.ok(current_setting('test.newcode') ~ '^[0-9A-F]{32}$'
  and current_setting('test.newcode') <> current_setting('test.code'), 'a fresh code');
select pg_temp.as_user(pg_temp.pid(26));
select extensions.throws_ok(format($$select api.join_prediction_league('%s')$$, current_setting('test.code')),
  'PT404', 'invite_code_invalid', 'the old code stops working');
select extensions.is(api.join_prediction_league(current_setting('test.newcode')) ->> 'joined', 'true',
  'the new code works');
select pg_temp.as_user(pg_temp.pid(24));
select extensions.is(api.join_fantasy_league(pg_temp.pid(44), current_setting('test.newcode'), gen_random_uuid()) ->> 'joined',
  'true', 'and works in Fantasy too');
reset role;

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select api.create_prediction_league('Ligue ' || n) from generate_series(2, 5) n;
select extensions.throws_ok($$select api.create_prediction_league('Ligue 6')$$,
  'PT409', 'league_create_limit_reached', 'five leagues owned per season at most');
reset role;

-- Player 6 is in two leagues (Les Lions, and below 48 more): 50 is the cap.
insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility,
  invite_code_digest, invite_code_hint, member_count)
select pg_temp.pid(5000 + n), pg_temp.pid(41), pg_temp.pid(23), 'Filler ' || n, 'private',
  pg_temp.digest(upper(lpad(to_hex(n), 32, 'A'))), right(upper(lpad(to_hex(n), 32, 'A')), 4), 0
from generate_series(1, 49) n;
insert into app.prediction_league_members (league_id, user_id)
select pg_temp.pid(5000 + n), pg_temp.pid(26) from generate_series(1, 49) n;
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(26));
select extensions.throws_ok($$select api.join_prediction_league('C0FFEE00C0FFEE00C0FFEE00C0FFEE00')$$,
  'PT409', 'league_limit_reached', 'fifty leagues at most');
reset role;

-- A league with 500 Pronostics members is full.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.pid(100000 + n), '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'pronos-crowd-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  '{}', statement_timestamp(), statement_timestamp()
from generate_series(1, 499) n;
insert into app.prediction_league_members (league_id, user_id, role)
select pg_temp.pid(5001), pg_temp.pid(23), 'owner';
insert into app.prediction_league_members (league_id, user_id)
select pg_temp.pid(5001), pg_temp.pid(100000 + n) from generate_series(1, 499) n;
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(22));
select extensions.throws_ok(format($$select api.join_prediction_league('%s')$$, lpad(to_hex(1), 32, 'A')),
  'PT409', 'league_full', 'five hundred Pronostics members at most');
reset role;

-- No Fantasy season behind the season played: leagues are unavailable.
select app_private.predictions_configure('public', null, null, pg_temp.pid(5));
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(22));
select extensions.throws_ok($$select api.create_prediction_league('Cup League')$$,
  'PT409', 'predictions_leagues_unavailable', 'no league without a Fantasy season to attach it to');
select extensions.is(api.my_prediction_leagues(), '{"items": []}'::jsonb, 'and none to list');
reset role;
select app_private.predictions_configure('public', null, null, pg_temp.pid(2));

-- ---------------------------------------------------------------------------
-- The Fantasy worker only walks leagues that have Fantasy members
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_fantasy_scoring_league_page(pg_temp.pid(42), null, 100) -> 'leagueIds',
  (select jsonb_agg(id order by id) from app.fantasy_leagues
   where id in (pg_temp.pid(50), current_setting('test.league')::uuid)),
  'Fantasy scoring walks Fantasy Four and Les Lions, not the Pronostics-only leagues');
select set_config('test.page', api.service_fantasy_scoring_league_page(pg_temp.pid(42), null, 1)::text, true);
select extensions.is((current_setting('test.page')::jsonb ->> 'hasMore')::boolean, true,
  'a one-league page says another follows');
select extensions.is(
  (api.service_fantasy_scoring_league_page(pg_temp.pid(42),
    (current_setting('test.page')::jsonb ->> 'afterLeagueId')::uuid, 1) ->> 'hasMore')::boolean,
  false, 'and the second page is the last: no Pronostics-only league after it counts');
-- Skipping loses nothing: ranking a league with no Fantasy member writes no
-- Fantasy ranking row, so Fantasy's rankings are the same with or without it.
select extensions.is(
  api.service_recalculate_fantasy_rankings(pg_temp.pid(41), pg_temp.pid(42), pg_temp.pid(5001), 1),
  0, 'a Pronostics-only league has no Fantasy ranking to compute');
select extensions.is(
  (select count(*)::integer from app.fantasy_rankings where league_id in (
    select id from app.fantasy_leagues league where league.fantasy_season_id = pg_temp.pid(41)
      and not exists (select 1 from app.fantasy_league_memberships membership
        where membership.league_id = league.id and membership.status = 'active'))),
  0, 'no Fantasy ranking row exists for any league the page now skips');
select set_config('request.jwt.claims', '', true);

-- Fantasy's season clean-up deletes leagues; their Pronostics members go with them.
delete from app.fantasy_leagues where id = pg_temp.pid(5002);
select extensions.is(
  (select count(*)::integer from app.prediction_league_members where league_id = pg_temp.pid(5002)), 0,
  'deleting a league deletes its Pronostics memberships');

select * from extensions.finish();
rollback;
