-- Account deletion, carried out automatically (20261006143700).
--
-- Accounts:
--   A  Amina: asks, is closed at once, then erased by the worker. Owns a
--      private Fantasy league B joined, and a Pronostics league nobody else is
--      in; holds a paid prize (kept, detached) and a pending one (forfeited).
--   B  Brahim: stays. Inherits A's Fantasy league.
--   C  staff: asking is refused.
--   D  banned by staff: may still ask (a ban does not suspend the right), and
--      is closed like A.
begin;
select extensions.plan(62);

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('ad0e0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.act(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true)
$$;
create function pg_temp.service() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true)
$$;
create function pg_temp.health() returns jsonb language sql as $$
  select c from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
  where c ->> 'name' = 'account_deletion'
$$;

-- ---------------------------------------------------------------------------
-- Fixture: a six-club league with an open GW1 a day ahead, Pronostics on.
-- ---------------------------------------------------------------------------
select pg_temp.service();

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id(2), 'account-deletion-test', 'Account Deletion Test', 'ADT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id(3), pg_temp.id(2), 'Deletion season', current_date - 1, current_date + 120,
  'active', true);
insert into app.rounds (id, season_id, round_number, name)
values (pg_temp.id(4), pg_temp.id(3), 1, 'Round 1');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id(100 + i), 'account-deletion-club-' || i, 'Deletion Club ' || i, 'DC' || i, 'D' || i,
  (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 6) i;
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id(200 + i), 'account-deletion-player-' || i, 'Deletion Player ' || i, 'DP ' || i,
  case when i <= 2 then 'goalkeeper'::app.football_position
    when i <= 7 then 'defender'::app.football_position
    when i <= 12 or i >= 16 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 18) i;

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id(5), pg_temp.id(2), 'account-deletion-test', 'Account Deletion Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id,
  ruleset_id, name, status, starts_at, ends_at)
values (pg_temp.id(6), pg_temp.id(5), pg_temp.id(3), 'f6100000-0000-4000-8000-000000000100',
  'Deletion season', 'registration_open', current_date - 1, current_date + 120);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id,
  football_team_id, position_id, price)
select pg_temp.id(300 + i), pg_temp.id(6), pg_temp.id(200 + i),
  pg_temp.id(100 + ((i - 1) % 6) + 1),
  (select id from app.fantasy_positions where code = case
    when i <= 2 then 'GK' when i <= 7 then 'DEF' when i <= 12 or i >= 16 then 'MID' else 'FWD' end),
  6
from generate_series(1, 18) i;

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

-- Accounts, created the way Supabase Auth creates them.
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.id(20 + n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'deletion-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'deletion_' || n, 'display_name', 'Deletion ' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 4) n;
-- A (21), B (22), C (23), D (24).
update app.profiles set preferred_language = 'ar' where id = pg_temp.id(21);

-- C is staff; D is banned by C.
insert into app_private.staff_principals (id, auth_user_id) values (pg_temp.id(31), pg_temp.id(23));
insert into app_private.user_bans (user_id, banned_by_principal_id, reason)
values (pg_temp.id(24), pg_temp.id(31), 'Spam in league names during the fixture.');

-- A's sessions on two phones, a registered phone and an avatar.
insert into auth.sessions (id, user_id, created_at, updated_at)
values (pg_temp.id(41), pg_temp.id(21), now(), now()), (pg_temp.id(42), pg_temp.id(21), now(), now());
insert into app.device_registrations (user_id, device_id, platform, push_provider, locale)
values (pg_temp.id(21), 'deletion-phone-a', 'android', 'fcm', 'ar');
insert into storage.objects (bucket_id, name, owner, owner_id)
values ('avatars', pg_temp.id(21)::text || '/avatar.jpg', pg_temp.id(21), pg_temp.id(21)::text);
-- A is one of the e-mail testers.
update app_private.notification_email_settings set test_user_ids = array[pg_temp.id(21), pg_temp.id(22)];

-- A and B build what A will leave behind.
select pg_temp.act(pg_temp.id(21));
select api.create_fantasy_team(pg_temp.id(6), current_setting('test.gw1')::uuid,
  'Amina Eleven', current_setting('test.selection')::jsonb, pg_temp.id(501)) is not null;
select set_config('test.team_a',
  (select id::text from app.fantasy_teams where user_id = pg_temp.id(21)), true);
select set_config('test.league_a', (api.create_fantasy_league(pg_temp.id(6),
  current_setting('test.team_a')::uuid, 'Ligue des amis', 'private', pg_temp.id(502))::text), true);
select set_config('test.pleague_a', (api.create_prediction_league('Pronos solo')::text), true);
select api.follow_team(pg_temp.id(101));
select api.save_predictions(jsonb_build_array(jsonb_build_object(
  'fixtureId', pg_temp.id(401), 'home', 2, 'away', 0)));
select api.cast_match_vote(pg_temp.id(401), 'winner', 'home');

select pg_temp.act(pg_temp.id(22));
select api.create_fantasy_team(pg_temp.id(6), current_setting('test.gw1')::uuid,
  'Brahim Eleven', current_setting('test.selection')::jsonb, pg_temp.id(511)) is not null;
select set_config('test.team_b',
  (select id::text from app.fantasy_teams where user_id = pg_temp.id(22)), true);
select api.join_fantasy_league(current_setting('test.team_b')::uuid,
  current_setting('test.league_a')::jsonb ->> 'inviteCode', pg_temp.id(512));

-- A won two prizes: one paid (kept for accounting), one still pending.
select pg_temp.service();
insert into app.fantasy_prizes (id, tier, name_fr, description_fr, estimated_value_mad, active)
values (pg_temp.id(61), 'gameweek', 'Maillot', 'Un maillot officiel.', 500, true),
  (pg_temp.id(62), 'monthly', 'Ballon', 'Un ballon officiel.', 300, true);
insert into app.fantasy_prize_winners (fantasy_season_id, tier, period_key, gameweek_id,
  block_number, first_gameweek_number, last_gameweek_number, prize_id, prize_name_fr,
  prize_value_mad, fantasy_team_id, user_id, team_name, points, transfers_in_period,
  team_created_at, tie_break, runner_up_team_id, status, verification_notes, verified_at, paid_at)
values
  (pg_temp.id(6), 'gameweek', 'gw:1', current_setting('test.gw1')::uuid, null, 1, 1,
    pg_temp.id(61), 'Maillot', 500, current_setting('test.team_a')::uuid, pg_temp.id(21),
    'Amina Eleven', 90, 0, now(), 'outright', current_setting('test.team_b')::uuid,
    'paid', 'CIN AB123456 checked; shipped to Agadir', now(), now()),
  (pg_temp.id(6), 'monthly', 'block:1', null, 1, 1, 4,
    pg_temp.id(62), 'Ballon', 300, current_setting('test.team_a')::uuid, pg_temp.id(21),
    'Amina Eleven', 300, 1, now(), 'outright', null,
    'pending', 'awaiting ID', null, null);
-- The season board, as the lifecycle runner writes it, and B's league table.
insert into app.fantasy_rankings (fantasy_season_id, gameweek_id, league_id, fantasy_team_id,
  rank, total_points, calculation_version, calculated_at)
values
  (pg_temp.id(6), null, null, current_setting('test.team_a')::uuid, 1, 90, 1, now()),
  (pg_temp.id(6), null, null, current_setting('test.team_b')::uuid, 2, 40, 1, now()),
  (pg_temp.id(6), null, (current_setting('test.league_a')::jsonb ->> 'leagueId')::uuid,
    current_setting('test.team_a')::uuid, 1, 90, 1, now()),
  (pg_temp.id(6), null, (current_setting('test.league_a')::jsonb ->> 'leagueId')::uuid,
    current_setting('test.team_b')::uuid, 2, 40, 1, now());
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer || ':' || bool_and(not enabled)::text from app_private.account_deletion_settings),
  '1:true', 'the switch is one row, off');
select extensions.ok(not exists (
  select 1
  from unnest(array['app_private.account_deletion_erase(uuid,integer)',
    'app_private.account_deletion_disable(uuid)', 'app_private.account_deletion_tick()',
    'app_private.account_deletion_configure(boolean,text,integer)']) as f(signature)
  cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
  where has_function_privilege(r.role, f.signature, 'execute')
), 'no API role can run the erasure, the switch or the tick');
-- One writer at a time: the erasure takes, without waiting, the advisory
-- locks of every tick that writes the rows it erases (a lock held in this
-- same session would not block it, so the keys are checked in its code).
select extensions.ok(
  (select bool_and(strpos(pg_catalog.pg_get_functiondef(
      'app_private.account_deletion_erase(uuid,integer)'::regprocedure),
      format('pg_try_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0))', k)) > 0)
   from unnest(array['fantasy:lifecycle-tick', 'botolago:predictions-score', 'pepites_tick',
     'botolago.fantasy_prize_evaluation', 'botolago:manager-card']) as k),
  'the erasure takes the locks of the Fantasy, Pronostics, Pépites, prize and Manager Card writers');
select extensions.ok(
  (select bool_and(has_function_privilege('service_role', f, 'execute')
      and not has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute'))
   from unnest(array['api.service_claim_account_deletions(integer,integer)',
     'api.service_erase_account(uuid,integer)', 'api.service_release_account_deletion(uuid,text)',
     'api.service_record_account_deletion_email(uuid,text)']) f),
  'the worker''s four calls are the service role''s alone');
select extensions.is(
  (select string_agg(jobname || '@' || schedule, ',' order by jobname) from cron.job
   where jobname like 'account-deletion-%'),
  'account-deletion-history-prune@37 3 * * *,account-deletion-tick@23 * * * *',
  'an hourly tick and a daily prune are scheduled');
select extensions.ok(
  not exists (select 1 from information_schema.columns
    where table_schema = 'app_private' and table_name = 'account_deletion_log'
      and column_name ~ '^(user_id|email|username|display_name|name|team_name|address)$'),
  'the erasure log has no column for a user, an address or a name');
select extensions.is(app_private.account_deletion_tick(), '{"outcome": "off"}'::jsonb,
  'the tick while off answers off');
select extensions.ok((select last_tick_at is null from app_private.account_deletion_settings),
  'and writes nothing');
select extensions.is(pg_temp.health() ->> 'status', 'ok', 'health: nothing waiting is ok');

-- The winners wall marks the reader's own prize (only A's paid one is public).
-- Each reader's page is read under that reader's role and checked afterwards.
create function pg_temp.wall_is_me(p_page text) returns text language sql as $$
  select string_agg(item ->> 'isMe', ',' order by item ->> 'id')
  from jsonb_array_elements(p_page::jsonb -> 'items') item
  where (item ->> 'id')::uuid in (
    select id from app.fantasy_prize_winners where fantasy_season_id = pg_temp.id(6))
$$;
select pg_temp.act(pg_temp.id(21));
set local role authenticated;
select set_config('test.wall_a', api.fantasy_prize_winners(50)::text, true);
reset role;
select pg_temp.act(pg_temp.id(22));
set local role authenticated;
select set_config('test.wall_b', api.fantasy_prize_winners(50)::text, true);
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select set_config('test.wall_anon', api.fantasy_prize_winners(50)::text, true);
reset role;
select extensions.is(pg_temp.wall_is_me(current_setting('test.wall_a')), 'true',
  'the winners wall marks the reader''s own prize');
select extensions.is(pg_temp.wall_is_me(current_setting('test.wall_b')), 'false',
  'and not someone else''s');
select extensions.is(pg_temp.wall_is_me(current_setting('test.wall_anon')), 'false',
  'nor for a visitor');

-- ---------------------------------------------------------------------------
-- Asking
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.id(21));
set local role authenticated;
select set_config('test.request_a', api.request_account_deletion()::text, true);
select extensions.is((select auth.uid()), pg_temp.id(21),
  'the caller''s claims are put back after the request');
select extensions.is(api.request_account_deletion()::text, current_setting('test.request_a'),
  'asking again hands back the same request');
select extensions.is(api.get_my_account_standing() ->> 'deletionPending', 'true',
  'a device still holding a valid token learns it must sign out');
select extensions.throws_ok($$select api.cancel_account_deletion()$$,
  'PT409', 'account_deletion_not_cancellable', 'there is no cancelling');
reset role;

select extensions.is(
  (select erase_after - requested_at from app.account_deletion_requests
   where id = current_setting('test.request_a')::uuid),
  interval '7 days', 'the erasure is due 7 days after the request');
select extensions.ok(
  (select banned_until > now() + interval '50 years' from auth.users where id = pg_temp.id(21)),
  'Supabase Auth will refuse the account''s next sign-in and token refresh');
select extensions.is((select count(*)::integer from auth.sessions where user_id = pg_temp.id(21)), 0,
  'every session of the account is gone, so other devices are signed out');
select extensions.ok((select deleted_at is not null from app.profiles where id = pg_temp.id(21)),
  'the profile is marked deleted, which hides its name on every public board');
select extensions.ok(
  (select name ~ '^Manager [0-9A-F]{6}$' from app.fantasy_teams
   where id = current_setting('test.team_a')::uuid),
  'the Fantasy team carries a pseudonym in place of its name');
select extensions.is(
  (select count(distinct team_name)::integer || ':' || bool_and(team_name ~ '^Manager [0-9A-F]{6}$')::text
   from app.fantasy_prize_winners where user_id = pg_temp.id(21)),
  '1:true', 'and so do its prize records, the same pseudonym');
select extensions.is(
  (select count(*)::integer from app.device_registrations where user_id = pg_temp.id(21)), 0,
  'its phones are forgotten');
select extensions.ok(exists (
  select 1 from app_private.security_audit_log
  where user_id = pg_temp.id(21) and event_type = 'account_deletion_requested'
), 'the request is in the security audit log');
select extensions.is(
  (select string_agg(item ->> 'teamName', ',') from jsonb_array_elements(
    api.fantasy_overall_standings(pg_temp.id(6)) -> 'items') item
   where item ->> 'teamId' = current_setting('test.team_a')),
  (select name from app.fantasy_teams where id = current_setting('test.team_a')::uuid),
  'the public board shows the pseudonym');

select pg_temp.act(pg_temp.id(23));
set local role authenticated;
select extensions.throws_ok($$select api.request_account_deletion()$$,
  'PT403', 'account_deletion_staff_account', 'a staff account is refused');
reset role;

select pg_temp.act(pg_temp.id(24));
set local role authenticated;
select extensions.lives_ok($$select api.request_account_deletion()$$,
  'a banned account may still ask');
reset role;
select extensions.ok(
  (select p.deleted_at is not null and u.banned_until > now() + interval '50 years'
   from app.profiles p join auth.users u on u.id = p.id where p.id = pg_temp.id(24)),
  'and is closed the same way');

-- ---------------------------------------------------------------------------
-- The worker: nothing while off, nothing before the date
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select extensions.throws_ok($$select api.service_claim_account_deletions(5, 900)$$,
  'PT403', 'account_deletion_access_denied', 'only the service role may claim');
select pg_temp.service();
select extensions.is(api.service_claim_account_deletions(5, 900), '[]'::jsonb,
  'switched off, nothing is claimed');
select extensions.is(pg_temp.health() ->> 'status', 'warn',
  'health warns: requests are waiting and the job is off');
select set_config('request.jwt.claims', '', true);
select app_private.account_deletion_configure(true);
select pg_temp.service();
select extensions.is(api.service_claim_account_deletions(5, 900), '[]'::jsonb,
  'switched on, nothing is claimed before its date');
select set_config('request.jwt.claims', '', true);
select extensions.is(app_private.account_deletion_tick(), '{"due": 0, "outcome": "idle"}'::jsonb,
  'the tick has nothing to wake the worker for');

-- Seven days on (A first, then D).
update app.account_deletion_requests
set requested_at = requested_at - interval '8 days', erase_after = erase_after - interval '8 days'
where user_id = pg_temp.id(21);
update app.account_deletion_requests
set requested_at = requested_at - interval '7 days 1 hour',
  erase_after = erase_after - interval '7 days 1 hour'
where user_id = pg_temp.id(24);

select extensions.is(app_private.account_deletion_tick(), '{"due": 2, "outcome": "not_configured"}'::jsonb,
  'two are due, but the worker''s address is not set');
select app_private.account_deletion_configure(true, 'https://deletion.example.invalid/functions/v1');
select extensions.is(app_private.account_deletion_tick(), '{"due": 2, "outcome": "invoked"}'::jsonb,
  'with the address set, the tick wakes the worker');
select extensions.ok(exists (
  select 1 from net.http_request_queue
  where url = 'https://deletion.example.invalid/functions/v1/account-deletion-worker'
), 'through pg_net, at account-deletion-worker');

select pg_temp.service();
select set_config('test.claim', api.service_claim_account_deletions(5, 900)::text, true);
select extensions.is(
  (select string_agg((c ->> 'email') || '/' || (c ->> 'language'), ',' order by c ->> 'requestedAt')
   from jsonb_array_elements(current_setting('test.claim')::jsonb) c),
  'deletion-1@example.test/ar,deletion-4@example.test/fr',
  'the claim hands both over, oldest first, with the address and language to confirm to');
select extensions.is(
  (select string_agg(status::text || attempts, ',') from app.account_deletion_requests
   where user_id in (pg_temp.id(21), pg_temp.id(24))),
  'processing1,processing1', 'and leases them');
select extensions.is(api.service_claim_account_deletions(5, 900), '[]'::jsonb,
  'a leased request is not handed out twice');

-- ---------------------------------------------------------------------------
-- Erasing A
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  format($$select api.service_erase_account(%L, 0)$$, current_setting('test.request_a')),
  'PT409', 'account_deletion_avatar_remaining',
  'the account does not go while its avatar file is still stored');

-- The worker removes the file through the Storage API, which does this.
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'avatars' and name like pg_temp.id(21)::text || '/%';
select set_config('storage.allow_delete_query', 'false', true);

select set_config('test.erased', api.service_erase_account(current_setting('test.request_a')::uuid, 1)::text, true);
select extensions.is(
  current_setting('test.erased')::jsonb - 'requestId',
  '{"erased": true, "fantasyTeams": 1, "leaguesArchived": 0, "leaguesDeleted": 1, "leaguesTransferred": 1, "paidPrizeRecordsKept": 1, "prizeRecordsDetached": 2}'::jsonb,
  'the erasure reports what it did, in counts');

select extensions.ok(not exists (select 1 from auth.users where id = pg_temp.id(21)),
  'the Auth user is gone');
select extensions.ok(not exists (select 1 from app.profiles where id = pg_temp.id(21)),
  'and the profile');
select extensions.is(
  (select concat_ws('/',
    (select count(*) from app.fantasy_teams where user_id = pg_temp.id(21)),
    (select count(*) from app.fantasy_squad_memberships where fantasy_team_id = current_setting('test.team_a')::uuid),
    (select count(*) from app.fantasy_lineups where fantasy_team_id = current_setting('test.team_a')::uuid),
    (select count(*) from app.fantasy_league_memberships where user_id = pg_temp.id(21)),
    (select count(*) from app_private.fantasy_idempotency_keys where user_id = pg_temp.id(21)),
    (select count(*) from app_private.fantasy_mutation_audit where user_id = pg_temp.id(21)),
    (select count(*) from app.followed_teams where user_id = pg_temp.id(21)),
    (select count(*) from app.predictions where user_id = pg_temp.id(21)),
    (select count(*) from app.match_votes where user_id = pg_temp.id(21)),
    (select count(*) from app.user_preferences where user_id = pg_temp.id(21)),
    (select count(*) from app.account_deletion_requests where user_id = pg_temp.id(21)),
    (select count(*) from auth.identities where user_id = pg_temp.id(21)))),
  '0/0/0/0/0/0/0/0/0/0/0/0',
  'no Fantasy, Pronostics, follow, vote, preference, request or identity row of A is left');

select extensions.is(
  (select concat_ws('/', league.owner_user_id = pg_temp.id(22), league.member_count, membership.role)
   from app.fantasy_leagues league
   join app.fantasy_league_memberships membership
     on membership.league_id = league.id and membership.user_id = pg_temp.id(22)
   where league.id = (current_setting('test.league_a')::jsonb ->> 'leagueId')::uuid),
  't/1/owner', 'B now owns the league A made, which counts one member');
select extensions.ok(not exists (
  select 1 from app.fantasy_leagues
  where id = (current_setting('test.pleague_a')::jsonb ->> 'leagueId')::uuid
), 'A''s Pronostics league with nobody else in it is gone');
select extensions.is(
  (select string_agg(coalesce(league_id::text, 'season') || ':' || rank, ',' order by league_id nulls first)
   from app.fantasy_rankings where fantasy_season_id = pg_temp.id(6)),
  'season:2,' || (current_setting('test.league_a')::jsonb ->> 'leagueId') || ':2',
  'A''s ranking rows are gone; B''s stay as they were until the next ranking pass');

select extensions.is(
  (select concat_ws('/', status, user_id is null, fantasy_team_id is null,
      verification_notes is not null, account_erased_at is not null, runner_up_team_id is not null)
   from app.fantasy_prize_winners where period_key = 'gw:1' and fantasy_season_id = pg_temp.id(6)),
  'paid/t/t/t/t/t',
  'the paid prize stays for accounting, its evidence kept, detached from any account');
select extensions.is(
  (select concat_ws('/', status, user_id is null, verification_notes is null, forfeited_at is not null)
   from app.fantasy_prize_winners where period_key = 'block:1' and fantasy_season_id = pg_temp.id(6)),
  'forfeited/t/t/t',
  'the unpaid prize is forfeited and its notes are cleared');
select extensions.ok(
  (select bool_and(team_name ~ '^Manager [0-9A-F]{6}$') from app.fantasy_prize_winners
   where fantasy_season_id = pg_temp.id(6)),
  'both prize records show only the pseudonym');
select extensions.is(
  (select test_user_ids from app_private.notification_email_settings where id),
  array[pg_temp.id(22)], 'A is off the e-mail testers list');
select extensions.ok(exists (
  select 1 from app_private.security_audit_log
  where user_id = pg_temp.id(21) and event_type = 'account_deletion_requested'
), 'the security audit log keeps its rows (365 days, pruned daily)');
select extensions.is(
  (select concat_ws('/', avatar_objects_removed, attempts, erase_after - requested_at, confirmation_email is null)
   from app_private.account_deletion_log where request_id = current_setting('test.request_a')::uuid),
  '1/1/7 days/t', 'the log keeps dates and counts');

select extensions.ok(api.service_record_account_deletion_email(current_setting('test.request_a')::uuid, 'sent'),
  'the worker records that the confirmation went');
select extensions.is(
  (select confirmation_email from app_private.account_deletion_log
   where request_id = current_setting('test.request_a')::uuid),
  'sent', 'and only that');
select extensions.throws_ok(
  format($$select api.service_record_account_deletion_email(%L, 'opened')$$, current_setting('test.request_a')),
  'PT400', 'account_deletion_invalid_outcome', 'an outcome outside the four is refused');

-- B's own account is untouched.
select extensions.is(
  (select concat_ws('/', p.deleted_at is null, u.banned_until is null, t.name)
   from app.profiles p join auth.users u on u.id = p.id
   join app.fantasy_teams t on t.user_id = p.id where p.id = pg_temp.id(22)),
  't/t/Brahim Eleven', 'B is untouched');

-- ---------------------------------------------------------------------------
-- A failing pass is retried; an overdue one pages
-- ---------------------------------------------------------------------------
select extensions.ok(
  api.service_release_account_deletion(
    (select id from app.account_deletion_requests where user_id = pg_temp.id(24)),
    'Storage said: <html>'),
  'the worker hands a failed request back');
select extensions.is(
  (select status::text || '/' || last_error from app.account_deletion_requests where user_id = pg_temp.id(24)),
  'requested/worker_failed', 'to wait for the next pass, with a short code and never the message');
select set_config('request.jwt.claims', '', true);
select extensions.is(pg_temp.health() ->> 'status', 'warn',
  'health warns while a request is failing but not yet overdue');
update app.account_deletion_requests set erase_after = now() - interval '25 hours'
where user_id = pg_temp.id(24);
select extensions.is(pg_temp.health() ->> 'status', 'fail',
  'a request a day past its date fails the health check, which pages the owner');
select extensions.is(app_private.ops_health_checks() ->> 'status', 'fail',
  'and the overall status with it');

select * from extensions.finish();
rollback;
