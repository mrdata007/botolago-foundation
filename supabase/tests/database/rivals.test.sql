-- BotolaGO+ Rivaux (20261015130000, 20261015130100, 20261015130200): pinned rivals, the
-- head-to-head read, the candidates, the notification switch, and the lead-change tick.
--
-- Covered: grants, volatility and search_path; the switches ship off; "off is an answer" and the
-- argument check; non-members are locked; the values on a seeded season worked out by hand below;
-- who can be pinned (league mates only, not oneself, not a stranger), the cap of three, the place a
-- removal frees, a league mate who left dropping out of the board and freeing their place; the
-- privacy switch (a rival's captain only when they share their history); that the reads write
-- nothing; the notification (off until turned on, never told of a journée published before it was
-- turned on, a lead taken, told once, a correction that flips it told again in the corrected
-- wording, none while the tick is off); the French text; the two scheduled jobs; and that removing
-- an account removes its pins and its preference.
--
-- THE FIXTURE (season S, journées 1 to 3 published, 4 scheduled; no lineups, the figures are the
-- final results themselves):
--   score    GW1  GW2  GW3   total through GW2   total
--   A (me)    60   50   40   110                  150
--   B         55   52   80   107                  187
--   C         60   50   45   110                  155
--   F, G      no result at all
--   A against B: GW1 A wins (margin 5), GW2 B wins, GW3 B wins: 1 won, 2 lost, 0 tied; leader
--     before GW3 is A (110 against 107), after it B (150 against 187).
--   A against C: GW1 and GW2 tied, GW3 C wins: 0 won, 1 lost, 2 tied; the lead was a tie before GW3
--     and is C's after it (150 against 155).
-- Leagues: L1 private S (A, B, C, F, G)   L2 private S (B, D)   L3 public S (A, D)
-- A is the only member (a paid entitlement); D shares no private league with A.
begin;
select extensions.plan(68);

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('bc1f0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.idx(t text) returns integer language sql immutable as $$
  select array_position(array['A','B','C','D','E','F','G','H','I'], t)
$$;
create function pg_temp.usr(t text) returns uuid language sql immutable as $$
  select pg_temp.id(300 + pg_temp.idx(t))
$$;
create function pg_temp.tm(t text) returns uuid language sql immutable as $$
  select pg_temp.id(400 + pg_temp.idx(t))
$$;
create function pg_temp.gw(n integer) returns uuid language sql immutable as $$
  select pg_temp.id(20 + n)
$$;

-- Runs one expression as a signed-in user (aal as given), as a visitor (p_user null, role
-- authenticated) or as anon, and returns its jsonb, or {"__error": "SQLSTATE message"}. Claims are
-- reset afterwards.
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
end;
$$;
create function pg_temp.rivals(p_user uuid, p_season text default null) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', format('api.get_my_rivals(%L)', p_season))
$$;
create function pg_temp.cands(p_user uuid, p_season text default null) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', format('api.get_rival_candidates(%L)', p_season))
$$;
create function pg_temp.pin(p_user uuid, p_team uuid, p_season text default null) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', format('api.pin_rival(%L, %L)', p_team, p_season))
$$;
create function pg_temp.unpin(p_user uuid, p_team uuid, p_season text default null) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', format('api.unpin_rival(%L, %L)', p_team, p_season))
$$;
create function pg_temp.notify(p_user uuid, p_value boolean) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', format('api.set_rivals_notify(%L)', p_value))
$$;
create function pg_temp.mk_league(p_n integer, p_visibility text, p_owner text, p_members text[])
returns void language plpgsql as $$
begin
  insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility,
    invite_code_digest, invite_code_hint, member_count)
  values (pg_temp.id(700 + p_n), pg_temp.id(5), pg_temp.usr(p_owner), 'Rivals league ' || p_n,
    p_visibility::app.fantasy_league_visibility,
    case when p_visibility = 'private' then encode(extensions.digest('rivals-league-' || p_n, 'sha256'), 'hex') end,
    case when p_visibility = 'private' then 'ABCD' end,
    cardinality(p_members));
  insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id)
  select pg_temp.id(700 + p_n), pg_temp.tm(m), pg_temp.usr(m) from unnest(p_members) m;
end $$;
-- The pins and preferences as one fingerprint: a read must leave it as it was.
create function pg_temp.rival_rows() returns text language sql as $$
  select md5(concat_ws('#',
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.pinned_rivals t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.rival_preferences t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app_private.rival_lead_notices t)))
$$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id(2), 'rivals-test', 'Rivals Test', 'RVT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id(3), pg_temp.id(2), '2089/90', '2089-08-01', '2090-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
select pg_temp.id(30 + n), pg_temp.id(3), n, 'Round ' || n, 'completed' from generate_series(1, 4) n;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id(4), pg_temp.id(2), 'rivals-test', 'Rivals Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values (pg_temp.id(5), pg_temp.id(4), pg_temp.id(3), 'f6100000-0000-4000-8000-000000000100',
  '2089/90', 'active', '2089-08-01', '2090-06-30');
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, finalized_at, points_state, scoring_input_version)
select pg_temp.gw(n), pg_temp.id(5), pg_temp.id(30 + n), n, 'Gameweek ' || n,
  d, d + interval '2 hours', d + interval '2 days 2 hours',
  case when n <= 3 then 'finalized' else 'scheduled' end::app.fantasy_gameweek_status,
  case when n <= 3 then d + interval '3 days 2 hours' end,
  case when n <= 3 then 'final' else 'provisional' end::app.fantasy_points_state,
  1
from generate_series(1, 4) n
cross join lateral (select timestamptz '2089-09-01 10:00:00+00' + (n - 1) * interval '7 days' as d) dl;
insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version,
  price_source_version, price_player_ids, prices_completed_at, completed_at)
select pg_temp.gw(n), 1, 1, '{}', statement_timestamp(), statement_timestamp()
from generate_series(1, 3) n;

select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.usr(u.t), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, statement_timestamp(), 'hash', '{}', u.meta::jsonb, statement_timestamp(), statement_timestamp()
from (values
  ('A', 'rv-a@example.test', '{"username":"amina_rv","display_name":"Amina Test"}'),
  ('B', 'rv-b@example.test', '{"username":"brahim_rv","display_name":"Brahim Test"}'),
  ('C', 'rv-c@example.test', '{"username":"chaimae_rv","display_name":"Chaimae Test"}'),
  ('D', 'rv-d@example.test', '{"username":"dina_rv","display_name":"Dina Test"}'),
  ('E', 'rv-e@example.test', '{"username":"elias_rv","display_name":"Elias Test"}'),
  ('F', 'rv-f@example.test', '{"username":"fatima_rv","display_name":"Fatima Test"}'),
  ('G', 'rv-g@example.test', '{"username":"gamal_rv","display_name":"Gamal Test"}'),
  ('H', 'rv-h@example.test', '{"username":"hamza_rv","display_name":"Hamza Test"}'),
  ('I', 'rv-i@example.test', '{"username":"imane_rv","display_name":"Imane Test"}')
) as u(t, email, meta);
-- A reader with notifications on, in French, no quiet hours (the defaults), set out plainly.
insert into app.user_preferences (user_id) select pg_temp.usr(t) from unnest(array['A','B','C','D','E','F','G','H','I']) t
on conflict (user_id) do nothing;
update app.user_preferences set notifications_enabled = true, in_app_notifications_enabled = true,
  quiet_hours_enabled = false
where user_id = pg_temp.usr('A');

insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value,
  free_transfers, status, created_at)
select pg_temp.tm(t), pg_temp.usr(t), pg_temp.id(5), 'Team ' || t, 0, 100, 1, 'active',
  timestamptz '2089-08-01 00:00:00+00'
from unnest(array['A', 'B', 'C', 'D', 'E', 'F', 'G']) t;
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points,
  bench_points, captain_points, transfer_hit, provisional_score, final_score, state,
  calculation_version, finalized_at)
select pg_temp.tm(v.t), pg_temp.gw(v.g), 0, 0, 0, 0, v.s, v.s, 'final', 1, statement_timestamp()
from (values
  ('A', 1, 60), ('A', 2, 50), ('A', 3, 40),
  ('B', 1, 55), ('B', 2, 52), ('B', 3, 80),
  ('C', 1, 60), ('C', 2, 50), ('C', 3, 45)
) as v(t, g, s);

-- The Manager Card reads need their rules and switch before BotolaGO+ can answer.
insert into app_private.manager_card_rules (version, config, active) values
  (1, '{"minimum_gameweeks":3,"provisional_below":5,"trf_window_gameweeks":3,"cap_ignore_deadlines_before":"2089-09-05T00:00:00Z","scales":{"cap":[[0,0],[1,100]],"sel":[[0,0],[1,100]],"trf":[[-10,0],[10,100]],"con":[[0,0],[1,100]]},"tiers":{"stade":50,"pro":65,"champion":78,"legend":88},"batch_size":500}',
   true);
select app_private.manager_card_configure(true, false);

insert into app.premium_entitlements (user_id, state, product_code, source, current_period_start,
  current_period_end, last_event_at)
values (pg_temp.usr('A'), 'active', 'plus_monthly', 'web', statement_timestamp() - interval '10 days',
  statement_timestamp() + interval '20 days', statement_timestamp() - interval '10 days');
select pg_temp.mk_league(1, 'private', 'A', array['A', 'B', 'C', 'F', 'G']);
select pg_temp.mk_league(2, 'private', 'B', array['B', 'D']);
select pg_temp.mk_league(3, 'public', 'A', array['A', 'D']);

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select extensions.ok(
  (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
      and not has_function_privilege('service_role', p.oid, 'execute'))
   from pg_proc p where p.pronamespace = 'api'::regnamespace
     and p.proname in ('get_my_rivals', 'get_rival_candidates', 'pin_rival', 'unpin_rival', 'set_rivals_notify')),
  'the five Rivaux functions are for authenticated, not anon, PUBLIC or service_role');
select extensions.is(
  (select count(*)::integer from pg_proc p where p.pronamespace = 'api'::regnamespace
     and p.proname in ('get_my_rivals', 'get_rival_candidates', 'pin_rival', 'unpin_rival', 'set_rivals_notify')
     and p.prosecdef and p.proconfig @> array['search_path=""']),
  5, 'all five are security definer with an empty search_path');
select extensions.is(
  (select string_agg(p.proname || ':' || p.provolatile, ',' order by p.proname) from pg_proc p
   where p.pronamespace = 'api'::regnamespace
     and p.proname in ('get_my_rivals', 'get_rival_candidates', 'pin_rival', 'unpin_rival', 'set_rivals_notify')),
  'get_my_rivals:s,get_rival_candidates:s,pin_rival:v,set_rivals_notify:v,unpin_rival:v',
  'the two reads are STABLE (they cannot write) and the three writes VOLATILE');
select extensions.is(
  (select count(*)::integer from pg_proc p where p.pronamespace = 'api'::regnamespace
     and p.proname in ('get_my_rivals', 'get_rival_candidates', 'pin_rival', 'unpin_rival', 'set_rivals_notify')),
  5, 'there is one signature of each (no overload for a client to hit by mistake)');
select extensions.is(
  (select count(*)::integer from pg_proc p
   cross join unnest(array['anon', 'authenticated', 'service_role', 'public']) r
   where p.pronamespace = 'app_private'::regnamespace
     and p.proname in ('rivals_leader', 'rivals_shared_league', 'rivals_pair', 'rivals_card', 'rivals_gate',
       'rivals_season', 'rivals_configure', 'rivals_tick')
     and has_function_privilege(r, p.oid, 'execute')),
  0, 'no API role can run a Rivaux helper, the switch or the tick');
select extensions.is(
  (select count(*)::integer from pg_class c
   where c.oid in ('app.pinned_rivals'::regclass, 'app.rival_preferences'::regclass,
       'app_private.rivals_settings'::regclass, 'app_private.rival_lead_notices'::regclass)
     and c.relrowsecurity and c.relforcerowsecurity),
  4, 'the four new tables have row security enabled and forced');
select extensions.is(
  (select count(*)::integer from information_schema.role_table_grants g
   where g.table_name in ('pinned_rivals', 'rival_preferences', 'rivals_settings', 'rival_lead_notices')
     and g.table_schema in ('app', 'app_private')
     and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')),
  0, 'and no API role has any grant on them');
select extensions.is(
  (select jsonb_build_object('enabled', s.enabled) from app_private.rivals_settings s),
  '{"enabled": false}'::jsonb, 'the tick ships off');
select extensions.is(
  (select count(*)::integer from app.rival_preferences where notify_lead_change), 0,
  'and no one has the notification on');
select extensions.is(
  (select count(*)::integer from app.notification_templates
   where notification_type = 'rival_lead_change' and active and channel = 'in_app' and language in ('fr', 'ar')),
  8, 'the text is in: four wordings in French and in Arabic');

-- ---------------------------------------------------------------------------
-- Off is an answer; the argument check; locked
-- ---------------------------------------------------------------------------
select extensions.is(
  jsonb_build_array(pg_temp.rivals(pg_temp.usr('A')), pg_temp.cands(pg_temp.usr('A')),
    pg_temp.pin(pg_temp.usr('A'), pg_temp.tm('B')), pg_temp.unpin(pg_temp.usr('A'), pg_temp.tm('B')),
    pg_temp.notify(pg_temp.usr('A'), true)),
  '[{"available": false}, {"available": false}, {"available": false}, {"available": false}, {"available": false}]'::jsonb,
  'BotolaGO+ off: {"available": false} from all five, and nothing is written');
select extensions.is(
  (select string_agg(coalesce(pg_temp.rivals(pg_temp.usr('A'), p) ->> '__error', 'none'), ',' order by n)
   from (values (1, 'nonsense'), (2, '2089'), (3, '2089-90')) v(n, p)),
  'PT400 validation_failed,PT400 validation_failed,PT400 validation_failed',
  'a malformed season is PT400, even while off');
select app_private.premium_configure('on', false, null);
select extensions.is(pg_temp.rivals(pg_temp.usr('A')), '{"available": false}'::jsonb,
  'BotolaGO+ on but the Manager Card reads off: {"available": false}');
select app_private.manager_card_configure(null, true);
select extensions.is(
  pg_temp.run(null, null, 'api.get_my_rivals(null)', 'anon') ->> '__error' like '42501%',
  true, 'anon is refused (42501)');
select extensions.is(pg_temp.run(null, null, 'api.get_my_rivals(null)') ->> '__error',
  'PT401 authentication_required', 'a signed-in role without a user is PT401');
select extensions.is(
  jsonb_build_array(pg_temp.rivals(pg_temp.usr('E')), pg_temp.cands(pg_temp.usr('E')),
    pg_temp.pin(pg_temp.usr('E'), pg_temp.tm('B')), pg_temp.unpin(pg_temp.usr('E'), pg_temp.tm('B')),
    pg_temp.notify(pg_temp.usr('E'), true)),
  '[{"available": true, "locked": true}, {"available": true, "locked": true}, {"available": true, "locked": true}, {"available": true, "locked": true}, {"available": true, "locked": true}]'::jsonb,
  'a non-member is locked on all five, with nothing else');
select extensions.is(
  (select count(*)::integer from app.pinned_rivals) + (select count(*)::integer from app.rival_preferences),
  0, 'and a non-member wrote nothing');

-- ---------------------------------------------------------------------------
-- A member with no pins; the candidates
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.rivals(pg_temp.usr('A')) - 'season',
  '{"available": true, "locked": false, "max": 3, "notify": false, "me": {"name": "Amina Test", "total": 150}, "rivals": []}'::jsonb,
  'a member with no pins: three places, the notification off, their own name and total (60 + 50 + 40)');
select extensions.is(
  pg_temp.rivals(pg_temp.usr('A')) #>> '{season,label}', '2089/90', 'the season is the current one');
select extensions.is(
  (select jsonb_agg(c ->> 'name') from jsonb_array_elements(pg_temp.cands(pg_temp.usr('A')) -> 'candidates') c),
  '["Brahim Test", "Chaimae Test", "Fatima Test", "Gamal Test"]'::jsonb,
  'the candidates are the four league mates of the private league, by name; Dina (in no shared private league) is not one');
select extensions.is(
  pg_temp.cands(pg_temp.usr('A')) #> '{candidates,0}',
  jsonb_build_object('teamId', pg_temp.tm('B'), 'name', 'Brahim Test',
    'league', jsonb_build_object('id', pg_temp.id(701), 'name', 'Rivals league 1')),
  'a candidate: the team id, the full name, the shared league');

-- ---------------------------------------------------------------------------
-- Pinning
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.pin(pg_temp.usr('A'), pg_temp.tm('B')),
  '{"available": true, "locked": false, "pinned": true, "count": 1}'::jsonb, 'A pins B');
select extensions.is(pg_temp.pin(pg_temp.usr('A'), pg_temp.tm('B')),
  '{"available": true, "locked": false, "pinned": true, "count": 1}'::jsonb, 'pinning B again changes nothing');
select extensions.is(
  jsonb_build_array(pg_temp.pin(pg_temp.usr('A'), pg_temp.tm('D')) ->> '__error',
    pg_temp.pin(pg_temp.usr('A'), pg_temp.tm('A')) ->> '__error',
    pg_temp.pin(pg_temp.usr('A'), pg_temp.id(999)) ->> '__error',
    pg_temp.pin(pg_temp.usr('A'), pg_temp.tm('E')) ->> '__error'),
  '["PT404 rival_not_found", "PT404 rival_not_found", "PT404 rival_not_found", "PT404 rival_not_found"]'::jsonb,
  'a manager with no shared private league (D, in a public league only), oneself, an unknown team and a stranger are all PT404 with no hint why');
select extensions.is(pg_temp.pin(pg_temp.usr('A'), null) ->> '__error', 'PT400 validation_failed',
  'no team is PT400');
select extensions.is(pg_temp.pin(pg_temp.usr('A'), pg_temp.tm('C')) ->> 'count', '2', 'A pins C');
select extensions.is(pg_temp.pin(pg_temp.usr('A'), pg_temp.tm('F')) ->> 'count', '3', 'A pins F');
select extensions.is(pg_temp.pin(pg_temp.usr('A'), pg_temp.tm('G')) ->> '__error', 'PT409 rivals_full',
  'a fourth rival is refused: PT409 rivals_full');
select extensions.is(
  (select jsonb_agg(slot order by slot) from app.pinned_rivals where user_id = pg_temp.usr('A')),
  '[1, 2, 3]'::jsonb, 'the three places are 1, 2 and 3');

-- ---------------------------------------------------------------------------
-- The head-to-head
-- ---------------------------------------------------------------------------
select set_config('test.board', pg_temp.rivals(pg_temp.usr('A'))::text, true);
select extensions.is(
  (select jsonb_agg(r ->> 'name' order by (r ->> 'position')::integer)
   from jsonb_array_elements(current_setting('test.board')::jsonb -> 'rivals') r),
  '["Brahim Test", "Chaimae Test", "Fatima Test"]'::jsonb,
  'the board lists the three pinned rivals by their place, each by full name');
select extensions.is(
  (current_setting('test.board')::jsonb #> '{rivals,0}') - 'last' - 'weeks' - 'biggestWin',
  jsonb_build_object('teamId', pg_temp.tm('B'), 'name', 'Brahim Test', 'position', 1,
    'league', jsonb_build_object('id', pg_temp.id(701), 'name', 'Rivals league 1'),
    'historyVisible', false, 'captain', null, 'transfer', null,
    'tally', '{"played": 3, "won": 1, "lost": 2, "tied": 0}'::jsonb),
  'B: shared league, history hidden (no captain, no transfer), 1 won, 2 lost, 0 tied');
select extensions.is(
  (current_setting('test.board')::jsonb #> '{rivals,0,last}') - 'publishedAt',
  '{"seq": 3, "name": "Gameweek 3", "correctedAt": null, "me": 40, "rival": 80, "meTotal": 150, "rivalTotal": 187,
    "leader": "rival", "leaderBefore": "me"}'::jsonb,
  'A against B after GW3: 40 to 80, 150 to 187, B leads, A led before (110 against 107)');
select extensions.is(
  (current_setting('test.board')::jsonb #>> '{rivals,0,last,publishedAt}')::timestamptz,
  timestamptz '2089-09-18 12:00:00+00', 'published at the journée''s finalized_at');
select extensions.is(
  current_setting('test.board')::jsonb #> '{rivals,0,biggestWin}',
  '{"seq": 1, "me": 60, "rival": 55, "margin": 5}'::jsonb, 'the biggest win is GW1, 60 to 55');
select extensions.is(
  current_setting('test.board')::jsonb #> '{rivals,0,weeks}',
  '[{"seq": 1, "me": 60, "rival": 55}, {"seq": 2, "me": 50, "rival": 52}, {"seq": 3, "me": 40, "rival": 80}]'::jsonb,
  'and the journée by journée scores, in order');
select extensions.is(
  (current_setting('test.board')::jsonb #> '{rivals,1,last}') - 'publishedAt' - 'name',
  '{"seq": 3, "correctedAt": null, "me": 40, "rival": 45, "meTotal": 150, "rivalTotal": 155, "leader": "rival", "leaderBefore": "tie"}'::jsonb,
  'A against C: 150 to 155, C leads, the totals were level before (110 and 110)');
select extensions.is(
  current_setting('test.board')::jsonb #> '{rivals,1,tally}',
  '{"played": 3, "won": 0, "lost": 1, "tied": 2}'::jsonb, 'A against C: 0 won, 1 lost, 2 tied');
select extensions.is(
  current_setting('test.board')::jsonb #> '{rivals,1,biggestWin}', 'null'::jsonb,
  'with no win there is no biggest win');
select extensions.is(
  (current_setting('test.board')::jsonb #> '{rivals,2,last}') ->> 'leader', null,
  'a rival with no result has no leader, and a tally of nothing played');
select extensions.is(
  current_setting('test.board')::jsonb #> '{rivals,2,tally}',
  '{"played": 0, "won": 0, "lost": 0, "tied": 0}'::jsonb, 'F: nothing played');

-- ---------------------------------------------------------------------------
-- Privacy: a friend's captain only when they share their history
-- ---------------------------------------------------------------------------
select extensions.is(
  pg_temp.run(pg_temp.usr('C'), 'aal1', 'api.set_card_history_visibility(true)') ->> 'visible', 'true',
  'C switches their history on (the existing switch)');
select extensions.is(
  jsonb_build_array(
    jsonb_typeof(pg_temp.rivals(pg_temp.usr('A')) #> '{rivals,1,captain}'),
    pg_temp.rivals(pg_temp.usr('A')) #>> '{rivals,1,historyVisible}',
    jsonb_typeof(pg_temp.rivals(pg_temp.usr('A')) #> '{rivals,0,captain}')),
  '["object", "true", "null"]'::jsonb,
  'then A sees C''s captain block and historyVisible, and still none for B who shares nothing');

-- ---------------------------------------------------------------------------
-- Reads write nothing; removing and leaving
-- ---------------------------------------------------------------------------
select set_config('test.rows', pg_temp.rival_rows(), true);
select pg_temp.rivals(pg_temp.usr('A')), pg_temp.cands(pg_temp.usr('A'));
select extensions.is(pg_temp.rival_rows(), current_setting('test.rows'),
  'the two reads leave the pins, the preferences and the notice records as they were');
select extensions.is(pg_temp.unpin(pg_temp.usr('A'), pg_temp.tm('F')),
  '{"available": true, "locked": false, "removed": 1}'::jsonb, 'A removes F');
select extensions.is(pg_temp.unpin(pg_temp.usr('A'), pg_temp.tm('F')) ->> 'removed', '0',
  'removing F again removes nothing');
select extensions.is(pg_temp.pin(pg_temp.usr('A'), pg_temp.tm('G')) ->> 'count', '3',
  'the place F left is free: A pins G');
select extensions.is(
  (select slot from app.pinned_rivals where user_id = pg_temp.usr('A') and rival_user_id = pg_temp.usr('G')),
  3::smallint, 'into place 3, the smallest free one');
update app.fantasy_league_memberships set status = 'left', left_at = statement_timestamp()
where league_id = pg_temp.id(701) and user_id = pg_temp.usr('G');
select extensions.is(
  (select jsonb_agg(r ->> 'name') from jsonb_array_elements(pg_temp.rivals(pg_temp.usr('A')) -> 'rivals') r),
  '["Brahim Test", "Chaimae Test"]'::jsonb, 'G left the league: G is no longer on the board');
select extensions.is(pg_temp.pin(pg_temp.usr('A'), pg_temp.tm('F')) ->> 'count', '3',
  'and the dead pin does not hold a place: F is pinned again, three in all');
select extensions.is(
  (select count(*)::integer from app.pinned_rivals where user_id = pg_temp.usr('A') and rival_user_id = pg_temp.usr('G')),
  0, 'the pin of G was dropped by that pin');

-- ---------------------------------------------------------------------------
-- The notification switch
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.notify(pg_temp.usr('A'), null) ->> '__error', 'PT400 validation_failed',
  'null is PT400');
select extensions.is(pg_temp.notify(pg_temp.usr('A'), true),
  '{"available": true, "locked": false, "notify": true}'::jsonb, 'A turns the notification on');
select extensions.is(pg_temp.rivals(pg_temp.usr('A')) ->> 'notify', 'true', 'and the board says so');
select set_config('test.changed', (select notify_changed_at::text from app.rival_preferences
  where user_id = pg_temp.usr('A')), true);
select pg_temp.notify(pg_temp.usr('A'), true);
select extensions.is(
  (select notify_changed_at::text from app.rival_preferences where user_id = pg_temp.usr('A')),
  current_setting('test.changed'), 'turning it on again does not move the time it was turned on');

-- ---------------------------------------------------------------------------
-- The tick
-- ---------------------------------------------------------------------------
select extensions.is(app_private.rivals_tick(), '{"outcome": "off"}'::jsonb, 'the tick answers off while switched off');
select extensions.is(
  (select count(*)::integer from app.notifications where notification_type = 'rival_lead_change'),
  0, 'and wrote nothing');
select app_private.rivals_configure(true);
-- Turned on after the journée was published: never told of it.
update app.rival_preferences set notify_changed_at = timestamptz '2090-01-01 00:00:00+00'
where user_id = pg_temp.usr('A');
select extensions.is(app_private.rivals_tick() ->> 'created', '0',
  'a member who turned it on after the journée was published is not told of it');
update app.rival_preferences set notify_changed_at = timestamptz '2026-01-01 00:00:00+00'
where user_id = pg_temp.usr('A');
-- Pins now: B, C, F. B: A led before GW3 and C was level, B leads after; C: level before, C leads after.
select set_config('test.tick', app_private.rivals_tick()::text, true);
select extensions.is(current_setting('test.tick')::jsonb, '{"outcome": "ok", "gameweek": 3, "created": 2}'::jsonb,
  'switched on: two notifications for GW3 (B takes the lead, C takes it from a level start; F has no result)');
select extensions.is(
  (select jsonb_agg(n.title || ' | ' || n.body order by n.title)
   from app.notifications n where n.user_id = pg_temp.usr('A') and n.notification_type = 'rival_lead_change'),
  '["Brahim Test vous passe devant | 187 contre 150 après la journée 3.", "Chaimae Test vous passe devant | 155 contre 150 après la journée 3."]'::jsonb,
  'in French, with the rival''s full name and both totals');
select extensions.is(
  (select count(*)::integer from app.notification_deliveries d
   join app.notifications n on n.id = d.notification_id
   where n.notification_type = 'rival_lead_change' and d.channel = 'in_app' and d.status = 'delivered'),
  2, 'each has its in-app delivery, and there is no push or email');
select extensions.is(
  (select count(*)::integer from app.notification_deliveries d
   join app.notifications n on n.id = d.notification_id
   where n.notification_type = 'rival_lead_change' and d.channel <> 'in_app'),
  0, 'no other channel');
select extensions.is(app_private.rivals_tick() ->> 'created', '0', 'a second pass tells nothing again');
-- A correction hands the lead back to A against B (B 80 becomes 30: 137 against 150).
update app.fantasy_team_gameweek_results set final_score = 30, provisional_score = 30
where fantasy_team_id = pg_temp.tm('B') and gameweek_id = pg_temp.gw(3);
select extensions.is(app_private.rivals_tick() ->> 'created', '1',
  'a correction that flips the lead is told again, once');
select extensions.is(
  (select n.title || ' | ' || n.body from app.notifications n
   where n.user_id = pg_temp.usr('A') and n.notification_type = 'rival_lead_change'
   order by n.created_at desc, n.id desc limit 1),
  'Vous reprenez la tête sur Brahim Test | Résultat corrigé, journée 3 : 150 contre 137.',
  'in the corrected wording');
select extensions.is(app_private.rivals_tick() ->> 'created', '0', 'and then no more');
select app_private.rivals_configure(false);

-- ---------------------------------------------------------------------------
-- The jobs, and the account
-- ---------------------------------------------------------------------------
select extensions.is(
  (select jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active)
     order by j.jobname) from cron.job j where j.jobname like 'rivals-%'),
  '[{"name": "rivals-history-prune", "schedule": "59 3 * * *", "active": true},
    {"name": "rivals-tick", "schedule": "7,22,37,52 * * * *", "active": true}]'::jsonb,
  'the tick and its prune are scheduled (the tick does nothing while switched off)');
insert into app.pinned_rivals (user_id, rival_user_id, fantasy_season_id, slot)
values (pg_temp.usr('I'), pg_temp.usr('H'), pg_temp.id(5), 1);
insert into app.rival_preferences (user_id, notify_lead_change) values (pg_temp.usr('I'), true);
delete from auth.users where id = pg_temp.usr('H');
select extensions.is((select count(*)::integer from app.pinned_rivals where user_id = pg_temp.usr('I')), 0,
  'erasing a rival''s account removes the pin that pointed at them');
delete from auth.users where id = pg_temp.usr('I');
select extensions.is((select count(*)::integer from app.rival_preferences where user_id = pg_temp.usr('I')), 0,
  'erasing a member''s account removes their preference');

select * from extensions.finish();
rollback;
