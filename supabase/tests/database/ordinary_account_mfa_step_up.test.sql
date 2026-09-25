-- Ordinary-account MFA step-up
-- (20260925210100_ordinary_account_mfa_step_up.sql, audit 2026-09-25 A03 / DB-07).
--
-- Accounts:
--   E  enrolled: one verified TOTP factor
--   N  never enrolled
--   U  an unverified (abandoned) enrolment only
--   W  signs up during the test
-- The rule: E is refused (PT403 mfa_required) at aal1 and passes at aal2; N
-- and U pass at aal1; work with no actor always passes.
begin;
select extensions.plan(50);

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('a3a30000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Claims as PostgREST sets them from the Supabase Auth JWT.
create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;

-- ---------------------------------------------------------------------------
-- Fixture: a six-club league with an open GW1 a day ahead, Pronostics on.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id(2), 'mfa-step-up-test', 'MFA Step-up Test', 'MFA', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id(3), pg_temp.id(2), 'Step-up season', current_date - 1, current_date + 120,
  'active', true);
insert into app.rounds (id, season_id, round_number, name)
values (pg_temp.id(4), pg_temp.id(3), 1, 'Round 1');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id(100 + i), 'mfa-step-up-club-' || i, 'Step-up Club ' || i, 'SC' || i, 'S' || i,
  (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 6) i;
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id(200 + i), 'mfa-step-up-player-' || i, 'Step-up Player ' || i, 'SP ' || i,
  case when i <= 2 then 'goalkeeper'::app.football_position
    when i <= 7 then 'defender'::app.football_position
    when i <= 12 or i >= 16 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 18) i;

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id(5), pg_temp.id(2), 'mfa-step-up-test', 'MFA Step-up Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id,
  ruleset_id, name, status, starts_at, ends_at)
values (pg_temp.id(6), pg_temp.id(5), pg_temp.id(3), 'f6100000-0000-4000-8000-000000000100',
  'Step-up season', 'registration_open', current_date - 1, current_date + 120);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id,
  football_team_id, position_id, price)
select pg_temp.id(300 + i), pg_temp.id(6), pg_temp.id(200 + i),
  pg_temp.id(100 + ((i - 1) % 6) + 1),
  (select id from app.fantasy_positions where code = case
    when i <= 2 then 'GK' when i <= 7 then 'DEF' when i <= 12 or i >= 16 then 'MID' else 'FWD' end),
  6
from generate_series(1, 18) i;

-- Three fixtures tomorrow at hh:17, pairings 1v2, 3v4, 5v6.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id,
  away_team_id, kickoff_at, status, provider_updated_at, source_sequence)
select pg_temp.id(400 + f), pg_temp.id(2), pg_temp.id(3), pg_temp.id(4),
  pg_temp.id(100 + f * 2 - 1), pg_temp.id(100 + f * 2),
  date_trunc('hour', now()) + interval '17 minutes' + interval '1 day' + (f - 1) * interval '2 hours',
  'not_started', now(), 1
from generate_series(1, 3) f;

select api.service_sync_fantasy_calendar(pg_temp.id(6));
update app.fantasy_gameweeks set status = 'open'
where fantasy_season_id = pg_temp.id(6) and sequence_number = 1;
select set_config('test.gw1', (select id::text from app.fantasy_gameweeks
  where fantasy_season_id = pg_temp.id(6) and sequence_number = 1), true);

-- A legal 15: players 1..15 (2 GK, 5 DEF, 5 MID, 3 FWD, at most three per
-- club), 4-4-2, captain player 8, vice player 13.
select set_config('test.selection', (
  select jsonb_agg(jsonb_build_object(
    'fantasy_player_id', player.id,
    'slot', case when n in (1,3,4,5,6,8,9,10,11,13,14) then 'starter' else 'bench' end,
    'slot_order', case n
      when 1 then 1 when 3 then 2 when 4 then 3 when 5 then 4 when 6 then 5
      when 8 then 6 when 9 then 7 when 10 then 8 when 11 then 9 when 13 then 10 when 14 then 11
      when 2 then 1 when 7 then 2 when 12 then 3 when 15 then 4 end,
    'captain', n = 8, 'vice_captain', n = 13
  ) order by n)::text
  from (select id, row_number() over (order by id) as n from app.fantasy_players
    where fantasy_season_id = pg_temp.id(6) order by id limit 15) player
), true);

select app_private.predictions_configure('public', true, '{}', pg_temp.id(2));

-- Accounts, created the way Supabase Auth creates them: no JWT on the
-- connection.
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.id(21), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'step-up-e@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"step_up_e","display_name":"Enrolled E"}', statement_timestamp(), statement_timestamp()),
  (pg_temp.id(22), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'step-up-n@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"step_up_n","display_name":"Never N"}', statement_timestamp(), statement_timestamp()),
  (pg_temp.id(23), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'step-up-u@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"step_up_u","display_name":"Unfinished U"}', statement_timestamp(), statement_timestamp());

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values
  (pg_temp.id(31), pg_temp.id(21), 'E TOTP', 'totp', 'verified',
    statement_timestamp(), statement_timestamp()),
  (pg_temp.id(33), pg_temp.id(23), 'U TOTP', 'totp', 'unverified',
    statement_timestamp(), statement_timestamp());

-- E's one-click unsubscribe link (32 characters of base64url).
insert into app_private.notification_email_unsubscribe_tokens (token_hash, user_id, expires_at)
values (extensions.digest('mfaStepUpUnsubscribeToken0000001', 'sha256'), pg_temp.id(21),
  statement_timestamp() + interval '30 days');

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select extensions.ok(not exists (
  select 1
  from unnest(array['app_private.assert_mfa_step_up()',
    'app_private.refuse_unverified_mfa_actor()']) as f(signature)
  cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
  where has_function_privilege(r.role, f.signature, 'execute')
), 'no API role can call the step-up helper or its trigger function');

-- tgtype 30 = BEFORE (2) | INSERT (4) | DELETE (8) | UPDATE (16), statement level.
select extensions.is(
  (select array_agg(tgrelid::regclass::text order by tgrelid::regclass::text collate "C")
   from pg_trigger
   where tgfoid = 'app_private.refuse_unverified_mfa_actor()'::regprocedure
     and tgtype = 30 and tgenabled = 'O'),
  array[
    'app.account_deletion_requests', 'app.device_registrations', 'app.fantasy_chip_uses',
    'app.fantasy_free_hit_snapshot_players', 'app.fantasy_free_hit_snapshots',
    'app.fantasy_league_memberships', 'app.fantasy_leagues', 'app.fantasy_lineup_players',
    'app.fantasy_lineups', 'app.fantasy_squad_memberships', 'app.fantasy_teams',
    'app.fantasy_transfer_batches', 'app.fantasy_transfers', 'app.followed_competitions',
    'app.followed_teams', 'app.notification_subscriptions', 'app.notifications',
    'app.prediction_league_members', 'app.predictions', 'app.profiles', 'app.saved_articles',
    'app.user_preferences', 'app_private.prediction_guest_claims', 'app_private.push_destinations'
  ],
  'every table ordinary RPCs write for the caller carries the statement-level step-up trigger'
);
select extensions.is(
  (select count(*)::integer from pg_trigger
   where tgfoid = 'app_private.refuse_unverified_mfa_actor()'::regprocedure),
  24, 'and no other trigger uses it (none per row, none on auth or storage)'
);

-- ---------------------------------------------------------------------------
-- Signup: Supabase Auth's trigger runs with no aal2 claim and still works.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select extensions.lives_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
      encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('a3a30000-0000-4000-8000-000000000024', '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'step-up-w@example.test', statement_timestamp(), 'hash',
      '{}', '{"username":"step_up_w"}', statement_timestamp(), statement_timestamp())$$,
  'signup with no JWT on the connection (as Supabase Auth does) passes'
);
select extensions.is(
  (select count(*)::integer from app.profiles profile
   join app.user_preferences preference on preference.user_id = profile.id
   where profile.id = pg_temp.id(24)),
  1, 'and handle_new_auth_user still creates the profile and its preferences'
);
select pg_temp.act(pg_temp.id(25), 'aal1');
select extensions.lives_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
      encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('a3a30000-0000-4000-8000-000000000025', '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'step-up-w2@example.test', statement_timestamp(), 'hash',
      '{}', '{"username":"step_up_w2"}', statement_timestamp(), statement_timestamp())$$,
  'even under an aal1 claim for the new account: it cannot have a factor yet'
);

-- ---------------------------------------------------------------------------
-- Enrolled, aal1: refused before any write.
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.id(21), 'aal1');
set local role authenticated;
select extensions.throws_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Enrolled Eleven', %L::jsonb,
    'a3a30000-0000-4000-8000-000000000501')$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection')),
  'PT403', 'mfa_required', 'enrolled at aal1: creating a Fantasy team is refused'
);
select extensions.throws_ok(
  $$select api.follow_team('a3a30000-0000-4000-8000-000000000101')$$,
  'PT403', 'mfa_required', 'enrolled at aal1: following a club is refused'
);
select extensions.throws_ok(
  $$select api.update_my_preferences(false, true, true, 'ar')$$,
  'PT403', 'mfa_required', 'enrolled at aal1: changing the profile is refused'
);
select extensions.throws_ok(
  $$select api.request_account_deletion()$$,
  'PT403', 'mfa_required', 'enrolled at aal1: asking for deletion is refused'
);
select extensions.throws_ok(
  $$select api.cancel_account_deletion()$$,
  'PT403', 'mfa_required', 'enrolled at aal1: cancelling a deletion is refused, even with nothing to cancel'
);
select extensions.throws_ok(
  $$select api.save_predictions('[{"fixtureId":"a3a30000-0000-4000-8000-000000000401","home":2,"away":1}]')$$,
  'PT403', 'mfa_required', 'enrolled at aal1: saving a prediction is refused'
);
select extensions.throws_ok(
  $$select api.claim_guest_predictions('[{"fixtureId":"a3a30000-0000-4000-8000-000000000402","home":0,"away":0}]')$$,
  'PT403', 'mfa_required', 'enrolled at aal1: importing the phone''s guest predictions waits for the challenge'
);
select extensions.throws_ok(
  $$select api.mark_all_my_notifications_read(null)$$,
  'PT403', 'mfa_required', 'enrolled at aal1: a write that touches no row is refused too'
);
select extensions.throws_ok(
  $$select api.unfollow_team('a3a30000-0000-4000-8000-000000000101')$$,
  'PT403', 'mfa_required', 'enrolled at aal1: deletes are refused as well as inserts and updates'
);
reset role;

-- Claims without an aal (older tokens, hand-written claims) count as aal1.
select set_config('request.jwt.claims',
  '{"sub":"a3a30000-0000-4000-8000-000000000021","role":"authenticated"}', true);
set local role authenticated;
select extensions.throws_ok(
  $$select api.follow_team('a3a30000-0000-4000-8000-000000000101')$$,
  'PT403', 'mfa_required', 'enrolled with no aal claim at all: refused as aal1'
);
reset role;

-- The data layer refuses whatever route the write takes.
select pg_temp.act(pg_temp.id(21), 'aal1');
select extensions.throws_ok(
  $$update app.profiles set display_name = 'Taken Over' where id = 'a3a30000-0000-4000-8000-000000000021'$$,
  'PT403', 'mfa_required', 'enrolled at aal1: a direct profile write is refused at the table'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  (select concat_ws('/',
    (select count(*) from app.fantasy_teams where user_id = pg_temp.id(21)),
    (select count(*) from app.followed_teams where user_id = pg_temp.id(21)),
    (select count(*) from app.account_deletion_requests where user_id = pg_temp.id(21)),
    (select count(*) from app.predictions where user_id = pg_temp.id(21)),
    (select display_name || ':' || preferred_language from app.profiles where id = pg_temp.id(21)))),
  '0/0/0/0/Enrolled E:fr',
  'nothing an aal1 session tried was written'
);

-- ---------------------------------------------------------------------------
-- Enrolled, aal2: the same calls pass.
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.id(21), 'aal2');
set local role authenticated;
select extensions.lives_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Enrolled Eleven', %L::jsonb,
    'a3a30000-0000-4000-8000-000000000502')$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection')),
  'enrolled at aal2: creating a Fantasy team passes'
);
select extensions.lives_ok(
  $$select api.follow_team('a3a30000-0000-4000-8000-000000000101')$$,
  'enrolled at aal2: following a club passes'
);
select extensions.lives_ok(
  $$select api.update_my_preferences(false, true, true, 'ar')$$,
  'enrolled at aal2: changing the profile passes'
);
select extensions.lives_ok(
  $$select api.save_predictions('[{"fixtureId":"a3a30000-0000-4000-8000-000000000401","home":2,"away":1}]')$$,
  'enrolled at aal2: saving a prediction passes'
);
select extensions.lives_ok(
  $$select api.request_account_deletion()$$,
  'enrolled at aal2: asking for deletion passes'
);
reset role;

-- A pending request exists now. At aal1 it is neither handed back nor cancelled.
select pg_temp.act(pg_temp.id(21), 'aal1');
set local role authenticated;
select extensions.throws_ok(
  $$select api.request_account_deletion()$$,
  'PT403', 'mfa_required', 'enrolled at aal1: an existing request is not handed back either'
);
select extensions.throws_ok(
  $$select api.cancel_account_deletion()$$,
  'PT403', 'mfa_required', 'enrolled at aal1: a pending request cannot be cancelled'
);
reset role;
select pg_temp.act(pg_temp.id(21), 'aal2');
set local role authenticated;
select extensions.lives_ok(
  $$select api.cancel_account_deletion()$$,
  'enrolled at aal2: cancelling passes'
);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  (select concat_ws('/',
    (select count(*) from app.fantasy_teams where user_id = pg_temp.id(21)),
    (select count(*) from app.followed_teams where user_id = pg_temp.id(21)),
    (select string_agg(status::text, ',') from app.account_deletion_requests where user_id = pg_temp.id(21)),
    (select count(*) from app.predictions where user_id = pg_temp.id(21)),
    (select display_name || ':' || preferred_language from app.profiles where id = pg_temp.id(21)))),
  '1/1/cancelled/1/Enrolled E:ar',
  'the aal2 session''s writes all landed'
);

-- ---------------------------------------------------------------------------
-- Never enrolled, or an unfinished enrolment: aal1 passes, as before.
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.id(22), 'aal1');
set local role authenticated;
select extensions.lives_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Never Eleven', %L::jsonb,
    'a3a30000-0000-4000-8000-000000000503')$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection')),
  'not enrolled at aal1: creating a Fantasy team passes'
);
select extensions.lives_ok(
  $$select api.follow_team('a3a30000-0000-4000-8000-000000000101')$$,
  'not enrolled at aal1: following a club passes'
);
select extensions.lives_ok(
  $$select api.update_my_preferences(false, true, true, 'ar')$$,
  'not enrolled at aal1: changing the profile passes'
);
select extensions.lives_ok(
  $$select api.save_predictions('[{"fixtureId":"a3a30000-0000-4000-8000-000000000401","home":0,"away":3}]')$$,
  'not enrolled at aal1: saving a prediction passes'
);
select extensions.lives_ok(
  $$select api.request_account_deletion()$$,
  'not enrolled at aal1: asking for deletion passes'
);
reset role;
select set_config('request.jwt.claims',
  '{"sub":"a3a30000-0000-4000-8000-000000000022","role":"authenticated"}', true);
set local role authenticated;
select extensions.lives_ok(
  $$select api.cancel_account_deletion()$$,
  'not enrolled with no aal claim: cancelling passes'
);
reset role;

select pg_temp.act(pg_temp.id(23), 'aal1');
set local role authenticated;
select extensions.lives_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Unfinished Eleven', %L::jsonb,
    'a3a30000-0000-4000-8000-000000000504')$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection')),
  'unverified factor only, aal1: creating a Fantasy team passes'
);
select extensions.lives_ok(
  $$select api.follow_team('a3a30000-0000-4000-8000-000000000101')$$,
  'unverified factor only, aal1: following a club passes'
);
select extensions.lives_ok(
  $$select api.update_my_preferences(false, true, true, 'ar')$$,
  'unverified factor only, aal1: changing the profile passes'
);
select extensions.lives_ok(
  $$select api.save_predictions('[{"fixtureId":"a3a30000-0000-4000-8000-000000000401","home":1,"away":1}]')$$,
  'unverified factor only, aal1: saving a prediction passes'
);
select extensions.lives_ok(
  $$select api.request_account_deletion()$$,
  'unverified factor only, aal1: asking for deletion passes'
);
reset role;

-- Enforcement keys on who acts, not whose row it is.
select pg_temp.act(pg_temp.id(22), 'aal1');
select extensions.lives_ok(
  $$update app.profiles set display_name = 'Renamed By N' where id = 'a3a30000-0000-4000-8000-000000000021'$$,
  'an actor without a factor may write a row that belongs to an enrolled account'
);

-- ---------------------------------------------------------------------------
-- No actor: the service role and pg_cron are never refused.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.lives_ok(
  $$update app.profiles set display_name = 'Service Rename' where id = 'a3a30000-0000-4000-8000-000000000021'$$,
  'the service role updates an enrolled account''s profile'
);
select extensions.lives_ok(
  $$delete from app.followed_teams where user_id = 'a3a30000-0000-4000-8000-000000000021'$$,
  'the service role deletes an enrolled account''s rows'
);
select set_config('request.jwt.claims', '', true);
select extensions.lives_ok(
  $$insert into app.followed_teams (user_id, team_id)
    values ('a3a30000-0000-4000-8000-000000000021', 'a3a30000-0000-4000-8000-000000000102')$$,
  'a connection with no JWT at all (pg_cron, migrations) inserts'
);
select extensions.lives_ok(
  $$update app.fantasy_teams set name = 'Lifecycle Eleven' where user_id = 'a3a30000-0000-4000-8000-000000000021'$$,
  'and the Fantasy lifecycle updates an enrolled manager''s team'
);

-- ---------------------------------------------------------------------------
-- The unsubscribe link: the token authorises it, not the session.
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.id(21), 'aal1');
set local role authenticated;
select extensions.is(
  api.unsubscribe_notification_email('mfaStepUpUnsubscribeToken0000001') ->> 'status',
  'unsubscribed',
  'enrolled at aal1: the e-mail unsubscribe link still works'
);
reset role;
select extensions.is(
  (select email_notifications_enabled from app.user_preferences where user_id = pg_temp.id(21)),
  false, 'and e-mail is off'
);
select extensions.is(
  coalesce(current_setting('app.mfa_step_up_waiver', true), ''), '',
  'the waiver is cleared as soon as its one write is done'
);
select extensions.throws_ok(
  $$update app.user_preferences set match_alerts = false where user_id = 'a3a30000-0000-4000-8000-000000000021'$$,
  'PT403', 'mfa_required', 'so the next preferences write at aal1 is refused again'
);
select set_config('app.mfa_step_up_waiver', 'email_unsubscribe_token', true);
select extensions.throws_ok(
  $$insert into app.followed_teams (user_id, team_id)
    values ('a3a30000-0000-4000-8000-000000000021', 'a3a30000-0000-4000-8000-000000000103')$$,
  'PT403', 'mfa_required', 'the waiver covers user_preferences only, never another table'
);
select set_config('app.mfa_step_up_waiver', '', true);

-- ---------------------------------------------------------------------------
-- Reads are not refused here.
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.id(21), 'aal1');
set local role authenticated;
select extensions.is(
  (select count(*)::integer from api.my_profile), 1,
  'enrolled at aal1: reading the own profile is not refused by this migration'
);
reset role;

-- ---------------------------------------------------------------------------
-- Staff enforcement is untouched.
-- ---------------------------------------------------------------------------
select extensions.ok(
  pg_get_functiondef('app_private.admin_assert_principal(boolean,boolean)'::regprocedure)
    !~ 'assert_mfa_step_up'
  and pg_get_functiondef('app_private.has_editorial_role(app_private.editorial_role)'::regprocedure)
    !~ 'assert_mfa_step_up',
  'admin and editorial MFA checks are not routed through the ordinary step-up'
);

select * from extensions.finish();
rollback;
