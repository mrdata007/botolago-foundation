-- BotolaGO+ Trophées (20261015150000 .. 20261015150200): the catalogue, the trophies and the
-- frames, the switch and the pass, the three reads.
--
-- Covered: the tables (row security forced, no client privilege, the catalogue and the frames
-- as seeded, every frame rewards a trophy of the same code); the switch (off by default, the
-- owner's function only, the pass answers off, then no_rules without a ruleset); the one
-- writer (trophy_grant: once, unknown or retired code, no publication stamp, a season trophy
-- without a season); NEVER TAKEN BACK (an earned row cannot be changed or deleted by a
-- statement, while erasing the account still removes it); "off is an answer" and the sign-in
-- order of the three api functions; free against member against preview; the frame rules (the
-- standard frame for anyone, another frame needs the membership AND the trophy, a lapsed member
-- shows standard and the choice is remembered, preview shows a frame to its owner only); the
-- list of functions that name the new tables is exactly the expected one, so no ranking, league,
-- Fantasy or Manager Card calculation can depend on a trophy.
--
-- Also covered, on a small season fixture (gameweeks, postwork, teams, final results and private
-- leagues, no lineups): THE LEAGUE TROPHIES ARE AWARDED AT THE END OF THE SEASON ONLY (a manager
-- who leads a league after two journées gets nothing, nor while the season is running with every
-- journée final, nor once it is over with the last journée not yet published; then, with the last
-- journée final, the final standing awards the champion and the podium); a league must rank at
-- least three managers (two do not, exactly three do) and be private (a public league never
-- awards); an earned trophy survives a corrected result; NO PAST SEASON (a completed, final
-- season is never evaluated); VISIBILITY (league mates see the trophies a manager earned, never a
-- stranger, a public league or a past season's league; the switch hides them and brings them
-- back; the answer carries no points, ratings or tiers; off, preview and the step-up behave as
-- for the cabinet).
--
-- NOT covered here: the other version 1 rules over real final results (ratings, tiers, a
-- journée at 80, journées played, a winning transfer). They need the full Manager Card fixture
-- (lineups, a ticked card); they are exercised by the evaluator's own SQL on a rehearsal database
-- before the owner's script is run (see docs/backend/TROPHIES_OPERATIONS_RUNBOOK.md).
--
-- Accounts: 1 M member (monthly), 2 N nobody, 3 V verified MFA factor and a membership,
-- 4 L lapsed member, 5 G grant holder, 6 C closing account, 7 W another reader, 8 E erased.
begin;
select extensions.plan(142);

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('bc5f0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.run(p_user uuid, p_aal text, p_expr text, p_role text default 'authenticated')
returns jsonb language plpgsql as $$
declare result text;
begin
  perform set_config('request.jwt.claims',
    case when p_user is null then jsonb_build_object('role', p_role)::text
      else jsonb_build_object('sub', p_user, 'role', p_role, 'aal', p_aal)::text end, true);
  begin
    execute format('set local role %I', p_role);
    execute format('select (%s)::text', p_expr) into result;
    reset role;
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    return jsonb_build_object('__error', sqlstate || ' ' || sqlerrm);
  end;
  perform set_config('request.jwt.claims', '', true);
  return result::jsonb;
end $$;
-- A statement's outcome: 'ok', or its SQLSTATE and message. Whatever it did is undone either way.
create function pg_temp.outcome(p_sql text) returns text language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception using errcode = 'X0001', message = 'undo';
  exception
    when sqlstate 'X0001' then return 'ok';
    when others then return sqlstate || ' ' || sqlerrm;
  end;
end;
$$;
create function pg_temp.trophies(p_user integer, p_aal text default 'aal1', p_args text default '') returns jsonb language sql as $$
  select pg_temp.run(pg_temp.u(p_user), p_aal, format('api.get_my_trophies(%s)', p_args))
$$;
create function pg_temp.choose(p_user integer, p_code text, p_aal text default 'aal1') returns jsonb language sql as $$
  select pg_temp.run(pg_temp.u(p_user), p_aal, format('api.choose_card_frame(%L)', p_code))
$$;
create function pg_temp.choice(p_user integer) returns text language sql as $$
  select coalesce((select frame_code from app.card_frame_choices where user_id = pg_temp.u(p_user)), 'none')
$$;
create function pg_temp.shown(p_user integer, p_viewer integer default null) returns text language sql as $$
  select app_private.card_frame_effective(pg_temp.u(p_user), case when p_viewer is null then null else pg_temp.u(p_viewer) end)
$$;
create function pg_temp.grant_founder(p_user integer) returns integer language sql as $$
  select app_private.trophy_grant(pg_temp.u(p_user), 'founder_2026', null, null,
    '{"cohort": 1}'::jsonb, timestamptz '2026-09-10 12:00:00+00')
$$;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'trophies-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'trophies_' || n, 'display_name', 'Trophies ' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 8) n;
update app.profiles set deleted_at = statement_timestamp() where id = pg_temp.u(6);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.u(900), pg_temp.u(3), 'V TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp());
insert into app.premium_entitlements (user_id, state, product_code, source, current_period_start,
  current_period_end, last_event_at)
select pg_temp.u(n), 'active', 'plus_monthly', 'web', statement_timestamp() - interval '10 days',
  case when n = 4 then statement_timestamp() - interval '1 day' else statement_timestamp() + interval '20 days' end,
  statement_timestamp() - interval '10 days'
from unnest(array[1, 3, 4]) n;
insert into app_private.staff_principals (id, auth_user_id) values (pg_temp.u(800), pg_temp.u(7));
insert into app_private.premium_grants (user_id, ends_at, reason, granted_by_principal_id)
values (pg_temp.u(5), statement_timestamp() + interval '30 days', 'Preview for the owner and staff', pg_temp.u(800));

-- ---------------------------------------------------------------------------
-- The tables, the catalogue, the frames
-- ---------------------------------------------------------------------------
select extensions.ok(
  (select bool_and(c.relrowsecurity and c.relforcerowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where (n.nspname, c.relname) in (('app', 'trophy_catalog'), ('app', 'trophies_earned'),
     ('app', 'card_frames'), ('app', 'card_frame_choices'), ('app', 'trophy_visibility'),
     ('app_private', 'trophy_settings'))),
  'all six tables have row security enabled and forced');
select extensions.ok(
  not has_any_column_privilege('authenticated', 'app.trophies_earned', 'select,insert,update,references')
  and not has_any_column_privilege('anon', 'app.trophies_earned', 'select,insert,update,references')
  and not has_any_column_privilege('service_role', 'app.trophies_earned', 'select,insert,update,references')
  and not has_any_column_privilege('authenticated', 'app.card_frame_choices', 'select,insert,update,references')
  and not has_any_column_privilege('service_role', 'app.card_frame_choices', 'select,insert,update,references')
  and not has_any_column_privilege('authenticated', 'app.trophy_visibility', 'select,insert,update,references')
  and not has_any_column_privilege('anon', 'app.trophy_visibility', 'select,insert,update,references')
  and not has_any_column_privilege('service_role', 'app.trophy_visibility', 'select,insert,update,references')
  and not has_any_column_privilege('authenticated', 'app.trophy_catalog', 'select,insert,update,references')
  and not has_any_column_privilege('authenticated', 'app.card_frames', 'select,insert,update,references')
  and not has_any_column_privilege('authenticated', 'app_private.trophy_settings', 'select,insert,update,references'),
  'no client role can read or write any of the tables: the only way in is an api function');
select extensions.is(
  (select string_agg(code, ',' order by sort_order) from app.trophy_catalog where status = 'active'),
  'first_rating,first_stade,first_pro,first_champion,first_legend,gw_80,ten_gameweeks,thirty_gameweeks,winning_transfer,league_podium,league_leader,founder_2026',
  'the catalogue has twelve trophies in order');
select extensions.is(
  (select label_fr from app.trophy_catalog where code = 'league_leader'), 'Champion de votre ligue',
  'the league leader trophy is the champion of the league: it is given at the end of the season');
select extensions.is(
  (select string_agg(distinct family, ',' order by family) from app.trophy_catalog),
  'carte,decisions,journees,ligue,paliers', 'in five families');
select extensions.is(
  (select string_agg(code || '=' || need, ',' order by sort_order) from app.trophy_catalog where need is not null),
  'gw_80=80,ten_gameweeks=10,thirty_gameweeks=30,winning_transfer=10,league_podium=3,league_leader=1',
  'the thresholds the evaluator reads live in the catalogue');
select extensions.is(
  (select code from app.trophy_catalog where scope = 'card'), 'founder_2026', 'only the founding cohort is earned once, ever');
select extensions.is(
  (select string_agg(code, ',' order by sort_order) from app.card_frames),
  'standard,founder_2026,first_stade,first_pro,first_champion,first_legend,winning_transfer,ten_gameweeks,thirty_gameweeks',
  'there are nine frames, standard first');
select extensions.ok(
  (select bool_and(trophy_code = code) from app.card_frames where code <> 'standard')
  and (select trophy_code is null from app.card_frames where code = 'standard'),
  'every other frame rewards the trophy with its own code; standard rewards none');
select extensions.is(
  pg_temp.outcome($q$insert into app.card_frames (code, trophy_code, label_fr, label_ar) values ('neon', 'gw_80', 'Neon', 'نيون')$q$),
  '23514 new row for relation "card_frames" violates check constraint "card_frames_trophy_check"',
  'a frame must carry the code of its trophy');
select extensions.is(
  pg_temp.outcome($q$insert into app.trophy_catalog (code, family, label_fr, label_ar) values ('x_one', 'prizes', 'X', 'س')$q$),
  '23514 new row for relation "trophy_catalog" violates check constraint "trophy_catalog_family_check"',
  'the families are the five of the design (and no prize family)');

-- ---------------------------------------------------------------------------
-- The switch and the pass
-- ---------------------------------------------------------------------------
select extensions.is((select enabled from app_private.trophy_settings where id), false, 'the evaluator ships off');
select extensions.ok(
  not has_function_privilege('authenticated', 'app_private.trophy_configure(boolean)', 'execute')
  and not has_function_privilege('anon', 'app_private.trophy_configure(boolean)', 'execute')
  and not has_function_privilege('service_role', 'app_private.trophy_configure(boolean)', 'execute')
  and has_function_privilege('postgres', 'app_private.trophy_configure(boolean)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.trophies_tick()', 'execute')
  and not has_function_privilege('service_role', 'app_private.trophies_tick()', 'execute')
  and has_function_privilege('postgres', 'app_private.trophies_tick()', 'execute'),
  'only postgres can switch the evaluator or run the pass');
select extensions.ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname in ('trophy_grant', 'trophy_league_ranks', 'trophies_evaluate_season',
        'trophies_evaluate_user', 'trophy_access', 'card_frame_effective', 'trophy_pending_podium',
        'trophies_earned_keep', 'trophy_season_end', 'trophy_league_now')
      and (has_function_privilege('authenticated', p.oid, 'execute')
        or has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('service_role', p.oid, 'execute'))),
  'none of the helpers can be called by an API role');
select extensions.is(app_private.trophies_tick(), '{"status": "off"}'::jsonb, 'the pass answers off and writes nothing');
select extensions.is(app_private.trophy_configure(null), '{"enabled": false}'::jsonb, 'null leaves the switch as it is');
select extensions.is(app_private.trophy_configure(true), '{"enabled": true}'::jsonb, 'the owner switches it on');
select extensions.is(app_private.trophies_tick() ->> 'status', 'no_rules', 'without a Manager Card ruleset the pass does nothing');
select extensions.is(
  (select count(*)::integer from app.trophies_earned), 0, 'and nothing was granted');
select extensions.is(
  (select string_agg(jobname || '@' || schedule, ',' order by jobname) from cron.job where jobname like 'trophies-%'),
  'trophies-history-prune@31 3 * * *,trophies-tick@10,40 * * * *', 'the two jobs are scheduled');
select app_private.trophy_configure(false);

-- ---------------------------------------------------------------------------
-- The one writer, and a trophy is never taken back
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.grant_founder(1), 1, 'trophy_grant adds the founding-cohort trophy');
select extensions.is(pg_temp.grant_founder(1), 0, 'and does nothing the second time');
select extensions.is(
  (select count(*)::integer from app.trophies_earned where user_id = pg_temp.u(1)), 1, 'one row');
select extensions.is(
  (select fantasy_season_id is null and rules_version = 1 and facts = '{"cohort": 1}'::jsonb
   from app.trophies_earned where user_id = pg_temp.u(1)),
  true, 'it has no season, the rules version and the facts it was given');
select extensions.is(
  app_private.trophy_grant(pg_temp.u(2), 'no_such_trophy', null, null, '{}', statement_timestamp()), 0,
  'an unknown trophy is not granted');
select extensions.is(
  app_private.trophy_grant(pg_temp.u(2), 'founder_2026', null, null, '{}', null), 0,
  'nor one without a publication stamp (the next pass tries again)');
select extensions.is(
  app_private.trophy_grant(pg_temp.u(2), 'gw_80', null, 3, '{"score": 81}', statement_timestamp()), 0,
  'nor a season trophy without a season');
update app.trophy_catalog set status = 'retired' where code = 'founder_2026';
select extensions.is(pg_temp.grant_founder(2), 0, 'nor a retired trophy');
update app.trophy_catalog set status = 'active' where code = 'founder_2026';
select extensions.is(
  pg_temp.outcome($q$update app.trophies_earned set facts = '{"cohort": 2}'$q$),
  'P0001 trophy_is_never_changed', 'an earned trophy cannot be changed');
select extensions.is(
  pg_temp.outcome($q$update app.trophies_earned set source_published_at = statement_timestamp()$q$),
  'P0001 trophy_is_never_changed', 'not even its publication stamp');
select extensions.is(
  pg_temp.outcome($q$delete from app.trophies_earned$q$),
  'P0001 trophy_is_never_taken_back', 'and cannot be deleted: a corrected result never takes a trophy back');
select extensions.is(
  pg_temp.outcome($q$delete from app.trophies_earned where user_id = 'bc5f0000-0000-4000-8000-000000000001'$q$),
  'P0001 trophy_is_never_taken_back', 'not even one manager''s');
select extensions.is(
  (select count(*)::integer from app.trophies_earned), 1, 'the trophy is still there');
select pg_temp.grant_founder(8);
select extensions.is(
  (select count(*)::integer from app.trophies_earned where user_id = pg_temp.u(8)), 1, 'E has a trophy');
delete from auth.users where id = pg_temp.u(8);
select extensions.is(
  (select count(*)::integer from app.trophies_earned where user_id = pg_temp.u(8)), 0,
  'erasing an account removes its trophies with it (the cascade passes)');

-- ---------------------------------------------------------------------------
-- Off is an answer
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.trophies(1), '{"available": false}'::jsonb,
  'off: the cabinet answers {available:false}');
select extensions.is(pg_temp.trophies(3), '{"available": false}'::jsonb, 'off is answered before the step-up');
select extensions.is(pg_temp.trophies(1, 'aal1', $$'2099/00x'$$) ->> '__error', 'PT400 validation_failed',
  'a malformed season is PT400 even while off');
select extensions.is(pg_temp.choose(1, 'founder_2026'), '{"available": false}'::jsonb, 'off: choosing a frame answers off');
select extensions.is(pg_temp.choice(1), 'none', 'and writes nothing');
select extensions.is(pg_temp.choose(1, 'Founder!') ->> '__error', 'PT400 validation_failed', 'a malformed frame is PT400 even while off');
select extensions.is(pg_temp.run(null, null, 'api.get_my_trophies()', 'anon') ->> '__error',
  '42501 permission denied for function get_my_trophies', 'anon cannot read the cabinet');
select extensions.is(pg_temp.run(null, null, 'api.get_trophy_card_frames(array[]::uuid[])', 'anon') ->> '__error',
  '42501 permission denied for function get_trophy_card_frames', 'anon cannot read the frames');

-- ---------------------------------------------------------------------------
-- On: the Manager Card reads must be ready too (a usable ruleset, reads switched on)
-- ---------------------------------------------------------------------------
select app_private.premium_configure('on');
select extensions.is(pg_temp.trophies(1), '{"available": false}'::jsonb,
  'on, but the Manager Card reads are not ready: still off');
insert into app_private.manager_card_rules (version, config, active) values
  (1, '{"minimum_gameweeks":3,"provisional_below":5,"trf_window_gameweeks":3,"cap_ignore_deadlines_before":"2089-09-05T00:00:00Z","scales":{"cap":[[0,0],[1,100]],"sel":[[0,0],[1,100]],"trf":[[-10,0],[10,100]],"con":[[0,0],[1,100]]},"tiers":{"stade":50,"pro":65,"champion":78,"legend":88},"batch_size":500}',
   true);
select app_private.manager_card_configure(true, true);
select extensions.is(pg_temp.run(null, null, 'api.get_my_trophies()') ->> '__error', 'PT401 authentication_required',
  'a role without a user is PT401');
select extensions.is(pg_temp.trophies(3) ->> '__error', 'PT403 mfa_required', 'a verified factor at aal1 gets mfa_required');
select extensions.is(pg_temp.trophies(3, 'aal2') ->> 'member', 'true', 'and at aal2 a member reads the cabinet');
select extensions.is(pg_temp.trophies(6) ->> '__error', 'PT404 profile_not_found', 'a closing account is PT404');
select extensions.is(pg_temp.trophies(1, 'aal1', $$'1999/00'$$) ->> '__error', 'PT404 card_season_not_found',
  'a season that does not exist is PT404');
select extensions.is(
  (select string_agg(k, ',' order by k) from jsonb_object_keys(pg_temp.trophies(1)) k where k <> 'season'),
  'available,catalog,chosenFrame,earned,frame,frames,journeesPlayed,member,pending,progress,showToLeagues',
  'the answer has exactly these keys (plus season while one exists)');
select extensions.is(
  (pg_temp.trophies(1) ->> 'member') || '/' || (pg_temp.trophies(2) ->> 'member') || '/' || (pg_temp.trophies(4) ->> 'member'),
  'true/false/false', 'a member is told so; a person who is not, and a lapsed member, are not');
select extensions.is(
  jsonb_path_query_array(pg_temp.trophies(1) -> 'earned', '$[*].code'), '["founder_2026"]'::jsonb,
  'M sees the trophy they earned');
select extensions.is(
  (pg_temp.trophies(1) -> 'earned' -> 0 ->> 'publishedAt')::timestamptz, timestamptz '2026-09-10 12:00:00+00',
  'with the time its result was published');
select extensions.is(pg_temp.trophies(2) -> 'earned', '[]'::jsonb, 'N earned nothing, and does not see M''s trophy');
select extensions.is(jsonb_array_length(pg_temp.trophies(2) -> 'catalog'), 12, 'but sees what can be earned: a free reader gets the whole list');
select extensions.is(jsonb_array_length(pg_temp.trophies(2) -> 'frames'), 9, 'and the frames, none of which they can wear');
select extensions.is(
  jsonb_path_query_array(pg_temp.trophies(2) -> 'frames', '$[*] ? (@.earned == true).code'), '["standard"]'::jsonb,
  'only the standard one is theirs');

-- ---------------------------------------------------------------------------
-- Frames
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.choose(1, 'neon') ->> '__error', 'PT404 card_frame_not_found', 'a frame that does not exist is PT404');
select extensions.is(pg_temp.choose(6, 'standard') ->> '__error', 'PT404 profile_not_found', 'a closing account cannot choose');
select extensions.is(pg_temp.choose(2, 'founder_2026') ->> '__error', 'PT403 premium_required',
  'N, who is not a member, cannot choose a frame');
select extensions.is(pg_temp.choose(2, 'standard'),
  '{"available": true, "chosenFrame": "standard", "frame": "standard"}'::jsonb, 'but anybody may choose the standard one');
select extensions.is(pg_temp.choose(1, 'first_pro') ->> '__error', 'PT403 trophy_not_earned',
  'a member cannot wear a frame whose trophy they have not earned');
select extensions.is(pg_temp.choose(1, 'founder_2026'),
  '{"available": true, "chosenFrame": "founder_2026", "frame": "founder_2026"}'::jsonb, 'a member wears the frame of a trophy they earned');
select extensions.is((select count(*)::integer from app.card_frame_choices where user_id = pg_temp.u(1)), 1, 'one row per manager');
select extensions.is(pg_temp.trophies(1) ->> 'frame', 'founder_2026', 'the cabinet reports the frame');
select extensions.is(pg_temp.shown(1, 7), 'founder_2026', 'on: every signed-in reader sees a member''s frame (it is public)');

-- A lapsed member.
select pg_temp.grant_founder(4);
insert into app.card_frame_choices (user_id, frame_code) values (pg_temp.u(4), 'founder_2026');
select extensions.is(pg_temp.shown(4) || '/' || pg_temp.choice(4), 'standard/founder_2026',
  'a lapsed member''s card shows standard while the choice is remembered');
select extensions.is(pg_temp.choose(4, 'founder_2026') ->> '__error', 'PT403 premium_required', 'a lapsed member cannot pick a frame');
select extensions.is(pg_temp.choose(4, 'standard') ->> 'chosenFrame', 'standard', 'but can go back to standard');
update app.card_frame_choices set frame_code = 'founder_2026' where user_id = pg_temp.u(4);
update app.premium_entitlements set current_period_end = statement_timestamp() + interval '30 days' where user_id = pg_temp.u(4);
select extensions.is(pg_temp.shown(4), 'founder_2026', 'when the membership is renewed the remembered frame comes back');

-- A retired frame shows standard, with no error.
update app.card_frames set status = 'retired' where code = 'founder_2026';
select extensions.is(pg_temp.shown(1), 'standard', 'a frame retired after it was chosen shows standard');
update app.card_frames set status = 'active' where code = 'founder_2026';

-- ---------------------------------------------------------------------------
-- Preview
-- ---------------------------------------------------------------------------
select app_private.premium_configure('preview');
select extensions.is(pg_temp.trophies(2), '{"available": false}'::jsonb, 'preview: a person who is not a member sees nothing');
select extensions.is(pg_temp.trophies(1) ->> 'member', 'true', 'preview: a member reads the cabinet');
select extensions.is(pg_temp.shown(1, 1) || '/' || pg_temp.shown(1, 7), 'founder_2026/standard',
  'preview: only the owner of the card sees the frame; other readers see standard');
select extensions.is(
  pg_temp.run(pg_temp.u(1), 'aal1', 'api.get_trophy_card_frames(array[]::uuid[])'),
  '{"available": true, "frames": []}'::jsonb, 'preview: and with no team asked the list is empty');
select app_private.premium_configure('off');
select extensions.is(pg_temp.shown(1, 7) || '/' || pg_temp.choice(1), 'standard/founder_2026',
  'off: every card is standard while the choice is kept');
select app_private.premium_configure('on');
select extensions.is(
  pg_temp.run(pg_temp.u(1), 'aal1', 'api.get_trophy_card_frames(array[]::uuid[])'),
  '{"available": true, "frames": []}'::jsonb, 'on: with no team asked the list is empty');
select extensions.is(
  pg_temp.run(pg_temp.u(1), 'aal1',
    'api.get_trophy_card_frames((select array_agg(gen_random_uuid()) from generate_series(1, 101)))') ->> '__error',
  'PT400 validation_failed', 'asking for more than 100 teams is PT400');

-- ---------------------------------------------------------------------------
-- The season fixture: ten managers, four journées, private and public leagues
-- ---------------------------------------------------------------------------
-- Season S (current): journées 1 to 3 are final, journée 4 is scheduled, then final.
--   L  private (A, B, C, D)    final totals A 120, B 130, C 135, D 50; B led after journée 2
--   N  private (E, F)          two managers: E leads and gets nothing
--   P  PUBLIC  (G, H, I)       G leads and gets nothing
--   Q  private (H, I, J)       exactly three managers: H 100, I 90, J 40
-- Season S0 (2088/89, completed and final, a past season): O private (A, B, C).
-- Accounts 11 to 20 are A to J. Account 2 (nobody) and account 3 (second factor) are strangers.
create function pg_temp.k(g integer, n integer) returns uuid language sql immutable as $$
  select ('bc5f0000-0000-4000-80' || lpad(g::text, 2, '0') || '-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.tm(n integer) returns uuid language sql immutable as $$ select pg_temp.k(1, n) $$;
create function pg_temp.sid() returns uuid language sql immutable as $$ select pg_temp.k(2, 5) $$;
create function pg_temp.s0() returns uuid language sql immutable as $$ select pg_temp.k(2, 9) $$;
create function pg_temp.gwid(n integer) returns uuid language sql immutable as $$ select pg_temp.k(3, n) $$;
create function pg_temp.lg(n integer) returns uuid language sql immutable as $$ select pg_temp.k(4, n) $$;
create function pg_temp.earned_of(p_user integer) returns text language sql as $$
  select coalesce((select string_agg(trophy_code, ',' order by trophy_code)
    from app.trophies_earned where user_id = pg_temp.u(p_user)), '-')
$$;
create function pg_temp.evaluate_all(p_season uuid) returns bigint language sql as $$
  select sum(app_private.trophies_evaluate_user(pg_temp.u(n), p_season)) from generate_series(11, 20) n
$$;
create function pg_temp.mates(p_user integer, p_league uuid, p_aal text default 'aal1') returns jsonb language sql as $$
  select pg_temp.run(pg_temp.u(p_user), p_aal, format('api.get_league_member_trophies(%L)', p_league))
$$;
create function pg_temp.show(p_user integer, p_value text, p_aal text default 'aal1') returns jsonb language sql as $$
  select pg_temp.run(pg_temp.u(p_user), p_aal, format('api.set_trophies_visibility(%s)', p_value))
$$;
create function pg_temp.mk_league(p_n integer, p_season uuid, p_visibility text, p_owner integer, p_members integer[])
returns void language plpgsql as $$
begin
  insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility,
    invite_code_digest, invite_code_hint)
  values (pg_temp.lg(p_n), p_season, pg_temp.u(p_owner), 'Trophies league ' || p_n,
    p_visibility::app.fantasy_league_visibility,
    case when p_visibility = 'private' then encode(extensions.digest('trophies-league-' || p_n, 'sha256'), 'hex') end,
    case when p_visibility = 'private' then 'ABCD' end);
  insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id)
  select pg_temp.lg(p_n),
    case when p_season = pg_temp.s0() then pg_temp.k(6, m) else pg_temp.tm(m) end,
    pg_temp.u(m)
  from unnest(p_members) m;
end $$;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'trophies-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'trophies_' || n, 'display_name', 'Trophies ' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(11, 20) n;

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.k(2, 1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.k(2, 2), 'trophies-test', 'Trophies Test', 'TRT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.k(2, 3), pg_temp.k(2, 2), '2089/90', '2089-08-01', '2090-06-30', 'active', true),
  (pg_temp.k(2, 8), pg_temp.k(2, 2), '2088/89', '2088-08-01', '2089-06-30', 'completed', false);
insert into app.rounds (id, season_id, round_number, name, status)
select pg_temp.k(5, n), pg_temp.k(2, 3), n, 'Round ' || n, 'completed' from generate_series(1, 4) n;
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.k(5, 11), pg_temp.k(2, 8), 1, 'Round 1', 'completed');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.k(2, 4), pg_temp.k(2, 2), 'trophies-test', 'Trophies Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values (pg_temp.sid(), pg_temp.k(2, 4), pg_temp.k(2, 3), 'f6100000-0000-4000-8000-000000000100',
    '2089/90', 'active', '2089-08-01', '2090-06-30'),
  (pg_temp.s0(), pg_temp.k(2, 4), pg_temp.k(2, 8), 'f6100000-0000-4000-8000-000000000100',
    '2088/89', 'completed', '2088-08-01', '2089-06-30');
-- Journées 1 to 3 final; journée 4 scheduled.
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, finalized_at, points_state, scoring_input_version)
select pg_temp.gwid(n), pg_temp.sid(), pg_temp.k(5, n), n, 'Gameweek ' || n,
  d, d + interval '2 hours', d + interval '2 days 2 hours',
  case when n <= 3 then 'finalized' else 'scheduled' end::app.fantasy_gameweek_status,
  case when n <= 3 then d + interval '3 days 2 hours' end,
  case when n <= 3 then 'final' else 'provisional' end::app.fantasy_points_state,
  1
from generate_series(1, 4) n
cross join lateral (select timestamptz '2089-09-01 10:00:00+00' + (n - 1) * interval '7 days' as d) dl;
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, finalized_at, points_state, scoring_input_version)
values (pg_temp.gwid(10), pg_temp.s0(), pg_temp.k(5, 11), 1, 'Old gameweek 1',
  '2088-09-01 10:00+00', '2088-09-01 12:00+00', '2088-09-03 12:00+00', 'finalized',
  '2088-09-04 12:00+00', 'final', 1);
insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version,
  price_source_version, price_player_ids, prices_completed_at, completed_at)
select pg_temp.gwid(n), 1, 1, '{}', statement_timestamp(), statement_timestamp()
from unnest(array[1, 2, 3, 10]) n;
insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value,
  free_transfers, status, created_at)
select pg_temp.tm(n), pg_temp.u(n), pg_temp.sid(), 'Team ' || n, 0, 100, 1, 'active',
  timestamptz '2089-08-01 00:00:00+00'
from generate_series(11, 20) n;
insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value,
  free_transfers, status, created_at)
select pg_temp.k(6, n), pg_temp.u(n), pg_temp.s0(), 'Old team ' || n, 0, 100, 1, 'active',
  timestamptz '2088-08-01 00:00:00+00'
from generate_series(11, 13) n;

-- Final scores: manager, journée, points.
create temp table trophy_scores (n integer, gw integer, pts integer);
insert into trophy_scores values
  (11,1,60),(11,2,20),(11,3,10),(11,4,30),
  (12,1,50),(12,2,55),(12,3,20),(12,4,5),
  (13,1,40),(13,2,50),(13,3,45),(13,4,0),
  (14,1,30),(14,2,10),(14,3,5),(14,4,5),
  (15,1,50),(15,2,25),(15,3,15),(15,4,10),
  (16,1,20),(16,2,10),(16,3,10),(16,4,10),
  (17,1,70),(17,2,40),(17,3,30),(17,4,10),
  (18,1,40),(18,2,30),(18,3,20),(18,4,10),
  (19,1,30),(19,2,30),(19,3,20),(19,4,10),
  (20,1,10),(20,2,10),(20,3,10),(20,4,10);
create function pg_temp.mk_results(p_gw integer) returns void language sql as $$
  insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points,
    bench_points, captain_points, transfer_hit, provisional_score, final_score, state,
    calculation_version, finalized_at)
  select pg_temp.tm(s.n), pg_temp.gwid(p_gw), s.pts, 0, 0, 0, s.pts, s.pts, 'final', 1, statement_timestamp()
  from trophy_scores s where s.gw = p_gw
$$;
select pg_temp.mk_results(1);
select pg_temp.mk_results(2);
select pg_temp.mk_results(3);
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points,
  bench_points, captain_points, transfer_hit, provisional_score, final_score, state,
  calculation_version, finalized_at)
select pg_temp.k(6, n), pg_temp.gwid(10), 60 - n, 0, 0, 0, 60 - n, 60 - n, 'final', 1, statement_timestamp()
from generate_series(11, 13) n;
select pg_temp.mk_league(1, pg_temp.sid(), 'private', 11, array[11, 12, 13, 14]);
select pg_temp.mk_league(2, pg_temp.sid(), 'private', 15, array[15, 16]);
select pg_temp.mk_league(3, pg_temp.sid(), 'public', 17, array[17, 18, 19]);
select pg_temp.mk_league(4, pg_temp.sid(), 'private', 18, array[18, 19, 20]);
select pg_temp.mk_league(5, pg_temp.s0(), 'private', 11, array[11, 12, 13]);

-- ---------------------------------------------------------------------------
-- League trophies: the end of the season only
-- ---------------------------------------------------------------------------
-- Journées 1 to 3 are final and the season runs until 2090-06-30.
select extensions.is(
  (select rk from app_private.trophy_league_ranks(pg_temp.u(12), pg_temp.sid()) where league_id = pg_temp.lg(1) and seq = 2),
  1, 'B led league L after journée 2 (the old rule would have given B the podium and the lead)');
select extensions.is(pg_temp.evaluate_all(pg_temp.sid()), 0::bigint,
  'mid-season, with every played journée final, nobody earns a league trophy, whatever their rank');
select extensions.is(
  (select count(*)::integer from app_private.trophy_season_end(pg_temp.sid())), 0,
  'the season is not over: no end-of-season row');
select extensions.is(
  jsonb_path_query_array(pg_temp.trophies(12) -> 'progress', '$[*] ? (@.code == "league_leader")'),
  '[{"code": "league_leader", "have": 2, "need": 1, "unit": "rank"}]'::jsonb,
  'the cabinet shows the league champion as in progress: B stands second today');
select extensions.is(
  jsonb_path_query_array(pg_temp.trophies(14) -> 'progress', '$[*] ? (@.code == "league_podium")'),
  '[{"code": "league_podium", "have": 4, "need": 3, "unit": "rank"}]'::jsonb,
  'and the podium: D stands fourth today');
select extensions.is(pg_temp.trophies(12) -> 'earned', '[]'::jsonb, 'nothing is earned');
select extensions.is(pg_temp.trophies(12) -> 'pending', '[]'::jsonb, 'nor waiting (the podium waits only at the end of the season)');
select extensions.is(
  jsonb_path_query_array(pg_temp.trophies(20) -> 'progress', '$[*] ? (@.code == "league_leader")'),
  '[{"code": "league_leader", "have": 3, "need": 1, "unit": "rank"}]'::jsonb,
  'in a league of exactly three the rank counts');
select extensions.is(
  jsonb_path_query_array(pg_temp.trophies(16) -> 'progress', '$[*] ? (@.code == "league_leader")'),
  '[{"code": "league_leader", "have": null, "need": 1, "unit": "rank"}]'::jsonb,
  'a league of two managers gives no rank to work towards');

-- The season is over (completed) but journée 4 is not final: still nothing.
update app.fantasy_seasons set status = 'completed' where status in ('registration_open', 'active');
select extensions.is(app_private.manager_card_fantasy_season(), pg_temp.sid(),
  'the fixture season is still the current one (the latest start)');
select extensions.is(pg_temp.evaluate_all(pg_temp.sid()), 0::bigint,
  'the season is over but its last journée is not published: no league trophy');
select extensions.is(
  (select count(*)::integer from app_private.trophy_season_end(pg_temp.sid())), 0,
  'and there is no end-of-season row');

-- Journée 4 is final and published: the final standing decides.
update app.fantasy_gameweeks set status = 'finalized', points_state = 'final',
  finalized_at = timestamptz '2089-09-22 12:00:00+00' where id = pg_temp.gwid(4);
insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version,
  price_source_version, price_player_ids, prices_completed_at, completed_at)
values (pg_temp.gwid(4), 1, 1, '{}', statement_timestamp(), statement_timestamp());
select pg_temp.mk_results(4);
select extensions.ok(
  (select count(*) = 1 and bool_and(seq = 4 and published = timestamptz '2089-09-22 12:00:00+00')
   from app_private.trophy_season_end(pg_temp.sid())),
  'now the season is over and final: one row, journée 4, published at its time');
select extensions.is(pg_temp.evaluate_all(pg_temp.sid()), 8::bigint,
  'the pass grants eight league trophies: C two, H two, A, B, I and J one each');
select extensions.is(
  pg_temp.earned_of(13) || '/' || pg_temp.earned_of(12) || '/' || pg_temp.earned_of(11) || '/' || pg_temp.earned_of(14),
  'league_leader,league_podium/league_podium/league_podium/-',
  'L: C is champion and on the podium, B and A are on the podium, D (fourth) has nothing');
select extensions.is(
  pg_temp.earned_of(18) || '/' || pg_temp.earned_of(19) || '/' || pg_temp.earned_of(20),
  'league_leader,league_podium/league_podium/league_podium',
  'Q has exactly three managers: that is enough, and third place is on the podium');
select extensions.is(pg_temp.earned_of(15) || '/' || pg_temp.earned_of(16), '-/-',
  'N has two managers: the leader earns nothing');
select extensions.is(pg_temp.earned_of(17), '-', 'P is public: its leader earns nothing');
select extensions.ok(
  (select facts = '{"rank": 1, "of": 4}'::jsonb and gameweek_seq = 4
     and source_published_at = timestamptz '2089-09-22 12:00:00+00'
   from app.trophies_earned where user_id = pg_temp.u(13) and trophy_code = 'league_leader'),
  'the final rank and the size of the league are kept, with the journée and the time it was published');
select extensions.is(pg_temp.evaluate_all(pg_temp.sid()), 0::bigint, 'a granted trophy is never asked again');
select extensions.is(
  pg_temp.trophies(13) -> 'earned' -> 0 ->> 'code', 'league_podium', 'the cabinet lists them as earned');
select extensions.is(
  jsonb_path_query_array(pg_temp.trophies(13) -> 'progress', '$[*].code') @> '["league_leader"]'::jsonb,
  false, 'and no longer as progress');

-- ---------------------------------------------------------------------------
-- No past season
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer from app_private.trophy_season_end(pg_temp.s0())), 1,
  'the past season is over and final: it would qualify if it were evaluated');
select extensions.is(app_private.trophies_evaluate_season(pg_temp.u(11), pg_temp.s0()), 0,
  'but the evaluator refuses a season that is not the current one');
select extensions.is(pg_temp.evaluate_all(pg_temp.s0()), 0::bigint, 'for every manager');
select extensions.is(
  (select count(*)::integer from app.trophies_earned where fantasy_season_id = pg_temp.s0()), 0,
  'and nothing was written for the past season');
select extensions.is(app_private.trophies_evaluate_season(pg_temp.u(11), null), 0, 'nor without a season');

-- A corrected result never takes a trophy back.
update app.fantasy_team_gameweek_results set final_score = 0
where fantasy_team_id = pg_temp.tm(13) and gameweek_id = pg_temp.gwid(2);
select extensions.is(pg_temp.evaluate_all(pg_temp.sid()), 1::bigint,
  'after C''s journée 2 is corrected to 0, B is first and earns the champion trophy');
select extensions.is(pg_temp.earned_of(13), 'league_leader,league_podium',
  'and C keeps both trophies they earned');
update app.fantasy_team_gameweek_results set final_score = 50
where fantasy_team_id = pg_temp.tm(13) and gameweek_id = pg_temp.gwid(2);

-- ---------------------------------------------------------------------------
-- Who sees a manager's trophies
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.trophies(11) ->> 'showToLeagues', 'true', 'the switch is on by default');
select extensions.is(
  jsonb_path_query_array(pg_temp.mates(11, pg_temp.lg(1)) -> 'members', '$[*].teamId'),
  jsonb_build_array(pg_temp.tm(12), pg_temp.tm(13)),
  'A sees the trophies of the mates who have some: B and C (not A themself, not D who has none)');
select extensions.is(
  jsonb_path_query_array(pg_temp.mates(11, pg_temp.lg(1)) -> 'members', '$[*].count'), '[2, 2]'::jsonb,
  'B and C each hold two (the corrected result gave B the champion trophy as well)');
select extensions.is(
  (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(pg_temp.mates(11, pg_temp.lg(1)) -> 'members' -> 0) k),
  'count,teamId,trophies', 'a mate entry carries the trophies and their count, nothing else');
select extensions.is(
  (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(pg_temp.mates(11, pg_temp.lg(1)) -> 'members' -> 0 -> 'trophies' -> 0) k),
  'code,family,gameweekSeq,labelAr,labelFr,publishedAt',
  'and each trophy only its code, family, labels, journée and publication time: no points, rating or tier');
select extensions.is(
  jsonb_path_query_array(pg_temp.mates(11, pg_temp.lg(1)) -> 'members' -> 1 -> 'trophies', '$[*].code'),
  '["league_podium", "league_leader"]'::jsonb, 'in the catalogue order');
select extensions.is(pg_temp.mates(11, pg_temp.lg(1)) ->> 'available', 'true', 'a free reader (not a member) may look: it is basic social sharing');
select extensions.is(pg_temp.show(13, 'false'), '{"available": true, "showToLeagues": false}'::jsonb, 'C switches their trophies off');
select extensions.is(pg_temp.trophies(13) ->> 'showToLeagues', 'false', 'the cabinet reports it');
select extensions.is(
  jsonb_path_query_array(pg_temp.mates(11, pg_temp.lg(1)) -> 'members', '$[*].teamId'),
  jsonb_build_array(pg_temp.tm(12)), 'and A no longer sees them, nor any hint that C has some');
select extensions.is(pg_temp.show(13, 'true'), '{"available": true, "showToLeagues": true}'::jsonb, 'C switches them on again');
select extensions.is(
  jsonb_array_length(pg_temp.mates(11, pg_temp.lg(1)) -> 'members'), 2, 'and A sees them again');
select extensions.is((select count(*)::integer from app.trophy_visibility), 1, 'one row, for the manager who touched the switch');
select extensions.is(pg_temp.show(13, 'null') ->> '__error', 'PT400 validation_failed', 'a missing value is PT400');
select extensions.is(pg_temp.mates(11, null::uuid) ->> '__error', 'PT400 validation_failed', 'a missing league is PT400');
-- strangers
select extensions.is(pg_temp.mates(2, pg_temp.lg(1)) ->> '__error', 'PT404 league_not_found',
  'a stranger who plays in no league sees nothing');
select extensions.is(pg_temp.mates(15, pg_temp.lg(1)) ->> '__error', 'PT404 league_not_found',
  'nor does a manager of another league');
select extensions.is(pg_temp.mates(17, pg_temp.lg(3)) ->> '__error', 'PT404 league_not_found',
  'a public league never shows trophies, even to its own members');
select extensions.is(pg_temp.mates(11, pg_temp.lg(5)) ->> '__error', 'PT404 league_not_found',
  'a league of a past season shows nothing');
select extensions.is(pg_temp.mates(11, pg_temp.k(4, 99)) ->> '__error', 'PT404 league_not_found',
  'nor does a league that does not exist');
update app.fantasy_league_memberships set status = 'left', left_at = statement_timestamp()
where league_id = pg_temp.lg(1) and user_id = pg_temp.u(11);
select extensions.is(pg_temp.mates(11, pg_temp.lg(1)) ->> '__error', 'PT404 league_not_found',
  'a manager who left the league sees nothing');
update app.fantasy_league_memberships set status = 'active', left_at = null
where league_id = pg_temp.lg(1) and user_id = pg_temp.u(11);
select extensions.is(jsonb_array_length(pg_temp.mates(18, pg_temp.lg(4)) -> 'members'), 2,
  'in Q, H sees I and J, who each hold a podium');
select extensions.is(pg_temp.mates(15, pg_temp.lg(2)) -> 'members', '[]'::jsonb, 'in N nobody has anything to show');
select extensions.is(pg_temp.run(null, null, format('api.get_league_member_trophies(%L)', pg_temp.lg(1)), 'anon') ->> '__error',
  '42501 permission denied for function get_league_member_trophies', 'anon cannot read it');
select extensions.is(pg_temp.run(null, null, 'api.set_trophies_visibility(true)', 'anon') ->> '__error',
  '42501 permission denied for function set_trophies_visibility', 'nor flip the switch');
select extensions.is(pg_temp.mates(3, pg_temp.lg(1)) ->> '__error', 'PT403 mfa_required',
  'a verified factor at aal1 needs the step-up to look');
select extensions.is(pg_temp.show(3, 'true') ->> '__error', 'PT403 mfa_required', 'and to flip the switch');

-- Off, preview
select app_private.premium_configure('preview');
select extensions.is(pg_temp.mates(11, pg_temp.lg(1)), '{"available": false}'::jsonb,
  'preview: a person who is not a member sees nothing');
select extensions.is(pg_temp.show(11, 'false'), '{"available": false}'::jsonb, 'and cannot flip the switch');
select app_private.premium_configure('off');
select extensions.is(pg_temp.mates(11, pg_temp.lg(1)), '{"available": false}'::jsonb, 'off: the mates read answers off');
select extensions.is(pg_temp.show(11, 'false'), '{"available": false}'::jsonb, 'off: the switch answers off');
select extensions.is(pg_temp.show(11, 'null') ->> '__error', 'PT400 validation_failed', 'a missing value is PT400 even while off');
select extensions.is((select count(*)::integer from app.trophy_visibility where user_id = pg_temp.u(11)), 0,
  'and nothing was written');
select app_private.premium_configure('on');
select extensions.is(
  pg_temp.outcome($q$delete from app.trophies_earned where user_id = 'bc5f0000-0000-4000-8000-000000000013'$q$),
  'P0001 trophy_is_never_taken_back', 'still: an earned league trophy cannot be deleted');

-- ---------------------------------------------------------------------------
-- No calculation depends on a trophy or a frame
-- ---------------------------------------------------------------------------
select extensions.is(
  (select string_agg(n.nspname || '.' || p.proname, ',' order by n.nspname || '.' || p.proname collate "C")
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('api', 'app', 'app_private')
     and p.prosrc ~* 'trophies_earned|trophy_catalog|card_frames|card_frame_choices|trophy_settings|trophy_visibility|card_frame_effective|trophy_access'),
  'api.choose_card_frame,api.get_league_member_trophies,api.get_my_trophies,api.get_trophy_card_frames,'
  || 'api.set_trophies_visibility,'
  || 'app_private.card_frame_effective,app_private.trophies_evaluate_season,app_private.trophies_tick,'
  || 'app_private.trophy_configure,app_private.trophy_grant,app_private.trophy_pending_podium',
  'the only functions that name the trophy, frame or visibility tables: the five reads and writes, the evaluator and its helpers; no ranking, league, Fantasy, Pronostics or Manager Card calculation does');

select * from extensions.finish();
rollback;
