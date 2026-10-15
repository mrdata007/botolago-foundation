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
-- NOT covered here: the version 1 rules over real final results. They need the full Manager
-- Card fixture (a season, gameweeks, lineups, results, a ticked card); they are exercised by
-- the evaluator's own SQL on a rehearsal database before the owner's script is run (see
-- docs/backend/TROPHIES_OPERATIONS_RUNBOOK.md).
--
-- Accounts: 1 M member (monthly), 2 N nobody, 3 V verified MFA factor and a membership,
-- 4 L lapsed member, 5 G grant holder, 6 C closing account, 7 W another reader, 8 E erased.
begin;
select extensions.plan(78);

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
     ('app', 'card_frames'), ('app', 'card_frame_choices'), ('app_private', 'trophy_settings'))),
  'all five tables have row security enabled and forced');
select extensions.ok(
  not has_any_column_privilege('authenticated', 'app.trophies_earned', 'select,insert,update,references')
  and not has_any_column_privilege('anon', 'app.trophies_earned', 'select,insert,update,references')
  and not has_any_column_privilege('service_role', 'app.trophies_earned', 'select,insert,update,references')
  and not has_any_column_privilege('authenticated', 'app.card_frame_choices', 'select,insert,update,references')
  and not has_any_column_privilege('service_role', 'app.card_frame_choices', 'select,insert,update,references')
  and not has_any_column_privilege('authenticated', 'app.trophy_catalog', 'select,insert,update,references')
  and not has_any_column_privilege('authenticated', 'app.card_frames', 'select,insert,update,references')
  and not has_any_column_privilege('authenticated', 'app_private.trophy_settings', 'select,insert,update,references'),
  'no client role can read or write any of the tables: the only way in is an api function');
select extensions.is(
  (select string_agg(code, ',' order by sort_order) from app.trophy_catalog where status = 'active'),
  'first_rating,first_stade,first_pro,first_champion,first_legend,gw_80,ten_gameweeks,thirty_gameweeks,winning_transfer,league_podium,league_leader,founder_2026',
  'the catalogue has twelve trophies in order');
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
        'trophies_earned_keep')
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
  'available,catalog,chosenFrame,earned,frame,frames,journeesPlayed,member,pending,progress',
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
-- No calculation depends on a trophy or a frame
-- ---------------------------------------------------------------------------
select extensions.is(
  (select string_agg(n.nspname || '.' || p.proname, ',' order by n.nspname || '.' || p.proname collate "C")
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('api', 'app', 'app_private')
     and p.prosrc ~* 'trophies_earned|trophy_catalog|card_frames|card_frame_choices|trophy_settings|card_frame_effective|trophy_access'),
  'api.choose_card_frame,api.get_my_trophies,api.get_trophy_card_frames,'
  || 'app_private.card_frame_effective,app_private.trophies_evaluate_season,app_private.trophies_tick,'
  || 'app_private.trophy_configure,app_private.trophy_grant,app_private.trophy_pending_podium',
  'the only functions that name the trophy or frame tables: the three reads, the evaluator and its helpers; no ranking, league, Fantasy, Pronostics or Manager Card calculation does');

select * from extensions.finish();
rollback;
