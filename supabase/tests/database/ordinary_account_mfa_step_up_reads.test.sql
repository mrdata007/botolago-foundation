-- Ordinary-account MFA step-up: the account's reads, its views, the saved mark
-- on the public News card and its avatar image
-- (20260926003100_ordinary_account_mfa_step_up.sql, audit 2026-09-25 A03 / DB-07).
-- The writes are in ordinary_account_mfa_step_up.test.sql.
--
-- Accounts:
--   E  enrolled: one verified TOTP factor
--   N  never enrolled
--   U  an unverified (abandoned) enrolment only
-- The rule, for reads as for writes: E is refused (PT403 mfa_required) at aal1
-- or with no aal claim, and passes at aal2; N and U pass at aal1; work with
-- no actor passes.
begin;
select extensions.plan(36);

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('a3b30000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Claims as PostgREST sets them from the Supabase Auth JWT.
create function pg_temp.act(p_user uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;
-- A statement's outcome for the role running it: 'ok', or its SQLSTATE and
-- message. Nothing it does is kept: the statement's subtransaction is undone.
create function pg_temp.outcome(p_sql text) returns text language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return sqlstate || ' ' || sqlerrm;
  end;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixture: a six-club league with an open GW1 a day ahead, Pronostics on, one
-- published article.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id(2), 'mfa-step-up-reads-test', 'MFA Step-up Reads Test', 'MFR', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id(3), pg_temp.id(2), 'Step-up reads season', current_date - 1, current_date + 120,
  'active', true);
insert into app.rounds (id, season_id, round_number, name)
values (pg_temp.id(4), pg_temp.id(3), 1, 'Round 1');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id(100 + i), 'mfa-step-up-reads-club-' || i, 'Step-up Reads Club ' || i,
  'SR' || i, 'R' || i, (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 6) i;
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id(200 + i), 'mfa-step-up-reads-player-' || i, 'Step-up Reads Player ' || i,
  'SRP ' || i,
  case when i <= 2 then 'goalkeeper'::app.football_position
    when i <= 7 then 'defender'::app.football_position
    when i <= 12 or i >= 16 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 18) i;

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id(5), pg_temp.id(2), 'mfa-step-up-reads-test', 'MFA Step-up Reads Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id,
  ruleset_id, name, status, starts_at, ends_at)
values (pg_temp.id(6), pg_temp.id(5), pg_temp.id(3), 'f6100000-0000-4000-8000-000000000100',
  'Step-up reads season', 'registration_open', current_date - 1, current_date + 120);
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

-- A legal 15, as in ordinary_account_mfa_step_up.test.sql.
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

insert into app.publishers (id, slug, name, source_type, trust_status)
values (pg_temp.id(7), 'mfa-step-up-reads', 'Step-up Reads', 'internal', 'trusted');
insert into app.stories (id, origin, original_language, publisher_id)
values (pg_temp.id(8), 'manual', 'fr', pg_temp.id(7));
insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_source, body_html,
  status, visibility, published_at, reading_time_minutes, sanitizer_version
) values (
  pg_temp.id(9), pg_temp.id(8), 'fr', 'mfa-step-up-reads', 'Article public pour le test MFA',
  'Cet article public porte la marque « enregistré » du lecteur.',
  repeat('Contenu public du test. ', 3), '<p>Contenu public du test.</p>',
  'published', 'public', '2025-01-01T00:00:00Z', 3, 'test'
);

-- Accounts, created the way Supabase Auth creates them: no JWT on the
-- connection.
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.id(21), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'step-up-reads-e@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"reads_e","display_name":"Enrolled E"}', statement_timestamp(), statement_timestamp()),
  (pg_temp.id(22), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'step-up-reads-n@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"reads_n","display_name":"Never N"}', statement_timestamp(), statement_timestamp()),
  (pg_temp.id(23), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'step-up-reads-u@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"reads_u","display_name":"Unfinished U"}', statement_timestamp(), statement_timestamp());

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values
  (pg_temp.id(31), pg_temp.id(21), 'E TOTP', 'totp', 'verified',
    statement_timestamp(), statement_timestamp()),
  (pg_temp.id(33), pg_temp.id(23), 'U TOTP', 'totp', 'unverified',
    statement_timestamp(), statement_timestamp());

-- Each account builds what the reads below return: a Fantasy team (its
-- idempotency key is 500 + n), a followed club and competition, a deletion
-- request, the saved article and a prediction. E does it at aal2.
create function pg_temp.populate(p_user uuid, p_aal text, p_n integer) returns void
language plpgsql as $$
begin
  perform pg_temp.act(p_user, p_aal);
  perform api.create_fantasy_team(pg_temp.id(6), current_setting('test.gw1')::uuid,
    'Reads Eleven ' || p_n, current_setting('test.selection')::jsonb, pg_temp.id(500 + p_n));
  perform api.follow_team(pg_temp.id(101));
  perform api.follow_competition(pg_temp.id(2));
  perform api.request_account_deletion();
  perform api.save_article(pg_temp.id(9));
  perform api.save_predictions(jsonb_build_array(jsonb_build_object(
    'fixtureId', pg_temp.id(401), 'home', 1, 'away', 0)));
  perform set_config('request.jwt.claims', '', true);
end;
$$;
select pg_temp.populate(pg_temp.id(21), 'aal2', 21);
select pg_temp.populate(pg_temp.id(22), 'aal1', 22);
select pg_temp.populate(pg_temp.id(23), 'aal1', 23);

-- The avatar each account uploaded, as the Storage API stores it.
insert into storage.objects (bucket_id, name, owner, owner_id)
select 'avatars', account::text || '/avatar.jpg', account, account::text
from unnest(array[pg_temp.id(21), pg_temp.id(22), pg_temp.id(23)]) as account;

-- The guarded reads, one or more per domain, and the account views. The last
-- one is a write that answers without writing: replaying a creation's
-- idempotency key hands back the stored team.
create function pg_temp.read_calls(p_n integer)
returns table (name text, statement text) language sql stable as $$
  values
    ('api.get_my_account_standing', 'select api.get_my_account_standing()'),
    ('api.get_my_notification_preferences', 'select api.get_my_notification_preferences()'),
    ('api.list_my_notifications', 'select api.list_my_notifications()'),
    ('api.my_notification_unread_count', 'select api.my_notification_unread_count()'),
    ('api.list_my_notification_devices', 'select api.list_my_notification_devices()'),
    ('api.news_saved_articles', 'select api.news_saved_articles()'),
    ('api.fantasy_hub', 'select api.fantasy_hub(''fr'')'),
    ('api.get_my_fantasy_team', format('select api.get_my_fantasy_team(%L)', pg_temp.id(6))),
    ('api.get_my_fantasy_history', format(
      'select api.get_my_fantasy_history(%L)', current_setting('test.team_' || p_n, true))),
    ('api.fantasy_leagues', format('select api.fantasy_leagues(%L)', pg_temp.id(6))),
    ('api.fantasy_overall_standings', format('select api.fantasy_overall_standings(%L)', pg_temp.id(6))),
    ('api.my_predictions', 'select api.my_predictions()'),
    ('api.my_prediction_leagues', 'select api.my_prediction_leagues()'),
    ('api.predictions_leaderboard', 'select api.predictions_leaderboard()'),
    ('api.my_profile', 'select count(*) from api.my_profile'),
    ('api.my_followed_teams', 'select count(*) from api.my_followed_teams'),
    ('api.my_followed_competitions', 'select count(*) from api.my_followed_competitions'),
    ('api.my_account_deletion_requests', 'select count(*) from api.my_account_deletion_requests'),
    ('api.create_fantasy_team (replayed key)', format(
      'select api.create_fantasy_team(%L, %L, %L, %L, %L)',
      pg_temp.id(6), current_setting('test.gw1'), 'Reads Eleven ' || p_n,
      current_setting('test.selection'), pg_temp.id(500 + p_n)))
$$;

-- Every call's outcome for account p_n under the claims set, one line each, run as
-- the role PostgREST uses.
create function pg_temp.read_outcomes(p_n integer) returns text
language sql as $$
  select string_agg(call.name || ': ' || pg_temp.outcome(call.statement), E'\n' order by call.name)
  from pg_temp.read_calls(p_n) call
$$;
create function pg_temp.every_read(p_outcome text) returns text language sql as $$
  select string_agg(call.name || ': ' || p_outcome, E'\n' order by call.name)
  from pg_temp.read_calls(0) call
$$;
-- Each account's team, for the calls that name it.
select set_config('test.team_' || n, (select id::text from app.fantasy_teams
  where user_id = pg_temp.id(n)), true)
from unnest(array[21, 22, 23]) as n;

-- What the Storage API's calls do to p_user's avatar for the role and claims
-- in force: read (a signed URL needs it), upload a new file, replace the
-- stored one, remove it. Each write is undone.
create function pg_temp.avatar_access(p_user uuid) returns text language plpgsql as $$
declare
  object_name text := p_user::text || '/avatar.jpg';
  seen bigint;
  uploaded text;
  replaced bigint;
  removed bigint;
begin
  select count(*) into seen from storage.objects
  where bucket_id = 'avatars' and name = object_name;
  begin
    insert into storage.objects (bucket_id, name, owner, owner_id)
    values ('avatars', p_user::text || '/avatar.png', p_user, p_user::text);
    uploaded := 'uploaded';
    raise exception using errcode = 'P0001', message = 'undo';
  exception
    when insufficient_privilege then uploaded := 'refused ' || sqlerrm;
    when raise_exception then null;
  end;
  begin
    update storage.objects set user_metadata = '{"replaced":true}'
    where bucket_id = 'avatars' and name = object_name;
    get diagnostics replaced = row_count;
    raise exception using errcode = 'P0001', message = 'undo';
  exception when raise_exception then null;
  end;
  begin
    -- As the Storage API does before its own deletes (storage.protect_delete).
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects where bucket_id = 'avatars' and name = object_name;
    get diagnostics removed = row_count;
    raise exception using errcode = 'P0001', message = 'undo';
  exception when raise_exception then null;
  end;
  return format('read %s, upload %s, replace %s, remove %s', seen, uploaded, replaced, removed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select extensions.is(
  (select array_agg(r.role || ' ' || f.signature order by f.signature, r.role)
   from unnest(array['app_private.require_mfa_step_up()',
     'app_private.mfa_step_up_satisfied()']) as f(signature)
   cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
   where has_function_privilege(r.role, f.signature, 'execute')),
  array['authenticated app_private.mfa_step_up_satisfied()',
    'authenticated app_private.require_mfa_step_up()'],
  'the boolean helpers are executable by authenticated only (views and policies run them as the reader)'
);
select extensions.ok(
  not has_schema_privilege('authenticated', 'app_private', 'usage')
  and not has_schema_privilege('anon', 'app_private', 'usage'),
  'and no API role has USAGE on app_private: a stored view or policy reaches them by OID alone'
);

-- Every api function a browser can call that reads the caller -- auth.uid()
-- or auth.jwt() in its own body, or in an app_private helper it calls, at any
-- depth -- runs the step-up, or is a staff RPC behind its own stricter check,
-- or is on the list below. A helper that applies the step-up itself (the News
-- card) does not count as reading the caller. A new owner read that skips the
-- step-up fails here.
select extensions.is(
  (with recursive fn as (
     select p.oid, n.nspname, p.proname, p.prosrc
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('api', 'app_private')
   ),
   applies_step_up as (
     select oid from fn
     where prosrc ~ 'app_private\.(assert_mfa_step_up|require_mfa_step_up|mfa_step_up_satisfied)\('
   ),
   calls as (
     select distinct f.oid as caller, g.oid as callee
     from fn f
     cross join lateral regexp_matches(f.prosrc, 'app_private\.([a-z_0-9]+)\s*\(', 'g') as m(name)
     join fn g on g.nspname = 'app_private' and g.proname = m.name[1]
   ),
   reads_caller(oid) as (
     select f.oid from fn f
     where f.prosrc ~ 'auth\.(uid|jwt)\(\)' and f.oid not in (select oid from applies_step_up)
     union
     select c.caller from calls c join reads_caller r on r.oid = c.callee
     where c.caller not in (select oid from applies_step_up)
   )
   select array_agg(f.proname::text order by f.proname)
   from reads_caller r join fn f on f.oid = r.oid
   where f.nspname = 'api'
     and has_function_privilege('authenticated', f.oid, 'execute')
     and f.prosrc !~ 'app_private\.(admin_assert_permission|admin_assert_principal|has_editorial_role)\('),
  array[
    -- The staff console reads it at aal1 to show its own step-up; an ordinary
    -- account gets staff_access_denied (20260926003100, "Not guarded").
    'get_my_staff_context',
    -- The round and its matches, the same for everyone: auth.uid() only
    -- decides whether a tester may see Pronostics while it is testers-only.
    'predictions_round',
    -- Sign-out: someone who abandons the challenge must still be able to leave.
    'record_session_revocation'
  ]::text[],
  'every api function that reads the caller runs the step-up, is a staff RPC, or is one of the three named exceptions'
);
select extensions.is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api'
     and p.prosrc ~ 'perform app_private\.assert_mfa_step_up\(\);'
     and has_function_privilege('authenticated', p.oid, 'execute')),
  51,
  'the 49 functions of point 5 and the two account-deletion functions run it'
);
select extensions.is(
  (select array_agg(c.oid::regclass::text order by c.oid::regclass::text)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'api' and c.relkind in ('v', 'm')
     and has_table_privilege('authenticated', c.oid, 'select')
     and pg_get_viewdef(c.oid) ~ 'auth\.(uid|jwt)\(\)'
     and pg_get_viewdef(c.oid) !~ 'app_private\.require_mfa_step_up\(\)'),
  null,
  'every api view that reads the caller refuses without the step-up'
);
select extensions.is(
  (select array_agg(policyname::text || ' ' || cmd order by policyname)
   from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'avatars'
     and coalesce(qual, 'app_private.mfa_step_up_satisfied()') ~ 'app_private\.mfa_step_up_satisfied\(\)'
     and coalesce(with_check, 'app_private.mfa_step_up_satisfied()') ~ 'app_private\.mfa_step_up_satisfied\(\)'),
  array['avatars_delete_own_authenticated DELETE', 'avatars_insert_own_authenticated INSERT',
    'avatars_select_own_authenticated SELECT', 'avatars_update_own_authenticated UPDATE'],
  'all four avatar policies carry the step-up'
);
select extensions.is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'avatars'),
  4, 'and there is no other avatar policy'
);

-- ---------------------------------------------------------------------------
-- The boolean helpers state the rule of assert_mfa_step_up() and nothing else.
-- ---------------------------------------------------------------------------
create function pg_temp.helpers_agree() returns text language plpgsql as $$
declare
  asserted text;
  required text;
begin
  asserted := pg_temp.outcome('select app_private.assert_mfa_step_up()');
  required := pg_temp.outcome('select app_private.require_mfa_step_up()');
  return format('assert %s | require %s | satisfied %s',
    asserted, required, app_private.mfa_step_up_satisfied()::text);
end;
$$;
select pg_temp.act(pg_temp.id(21), 'aal1');
select extensions.is(pg_temp.helpers_agree(),
  'assert PT403 mfa_required | require PT403 mfa_required | satisfied false',
  'enrolled at aal1: refused, and not satisfied');
select set_config('request.jwt.claims',
  '{"sub":"a3b30000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select extensions.is(pg_temp.helpers_agree(),
  'assert PT403 mfa_required | require PT403 mfa_required | satisfied false',
  'enrolled with no aal claim: the same as aal1');
select pg_temp.act(pg_temp.id(21), 'aal2');
select extensions.is(pg_temp.helpers_agree(), 'assert ok | require ok | satisfied true',
  'enrolled at aal2: passes');
select pg_temp.act(pg_temp.id(22), 'aal1');
select extensions.is(pg_temp.helpers_agree(), 'assert ok | require ok | satisfied true',
  'never enrolled, aal1: passes');
select pg_temp.act(pg_temp.id(23), 'aal1');
select extensions.is(pg_temp.helpers_agree(), 'assert ok | require ok | satisfied true',
  'unverified factor only, aal1: passes');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(pg_temp.helpers_agree(), 'assert ok | require ok | satisfied true',
  'no actor: passes');

-- ---------------------------------------------------------------------------
-- The reads
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.id(21), 'aal1');
set local role authenticated;
select extensions.is(pg_temp.read_outcomes(21),
  pg_temp.every_read('PT403 mfa_required'),
  'enrolled at aal1: every read of the account is refused, the views and the replayed key included');
reset role;

select set_config('request.jwt.claims',
  '{"sub":"a3b30000-0000-4000-8000-000000000021","role":"authenticated"}', true);
set local role authenticated;
select extensions.is(pg_temp.read_outcomes(21),
  pg_temp.every_read('PT403 mfa_required'),
  'enrolled with no aal claim: refused as aal1');
reset role;

select pg_temp.act(pg_temp.id(21), 'aal2');
set local role authenticated;
select extensions.is(pg_temp.read_outcomes(21), pg_temp.every_read('ok'),
  'enrolled at aal2: every read passes');
select extensions.is(
  (select concat_ws('/', (select count(*) from api.my_profile),
    (select count(*) from api.my_followed_teams),
    (select count(*) from api.my_followed_competitions),
    (select count(*) from api.my_account_deletion_requests),
    jsonb_array_length(api.news_saved_articles() -> 'items'),
    api.get_my_fantasy_team(pg_temp.id(6)) ->> 'name')),
  '1/1/1/1/1/Reads Eleven 21',
  'and returns the account''s own rows'
);
reset role;

select pg_temp.act(pg_temp.id(22), 'aal1');
set local role authenticated;
select extensions.is(pg_temp.read_outcomes(22), pg_temp.every_read('ok'),
  'never enrolled, aal1: every read passes, as before');
reset role;

select pg_temp.act(pg_temp.id(23), 'aal1');
set local role authenticated;
select extensions.is(pg_temp.read_outcomes(23), pg_temp.every_read('ok'),
  'unverified factor only, aal1: every read passes');
reset role;

-- No actor (pg_cron, migrations, operator SQL): the step-up never answers.
-- The owner reads give their own "sign in first" answer; the public hub works.
select set_config('request.jwt.claims', '', true);
select extensions.is(
  (select count(*)::integer from pg_temp.read_calls(21) call
   where pg_temp.outcome(call.statement) like '%mfa_required%'),
  0, 'no actor: no read is refused by the step-up'
);
select extensions.is(
  concat_ws('/',
    pg_temp.outcome('select api.fantasy_hub(''fr'')'),
    (select count(*) from api.my_profile),
    pg_temp.outcome('select api.get_my_notification_preferences()')),
  'ok/0/PT401 notification_access_denied',
  'the hub answers, a view has no row, an owner read asks for a sign-in'
);

-- ---------------------------------------------------------------------------
-- A refused session reaches none of the account's rows by any other way:
-- the replayed key did not create a team, and nothing was read into a write.
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer from app.fantasy_teams where user_id = pg_temp.id(21)),
  1, 'the replays created nothing'
);

-- ---------------------------------------------------------------------------
-- The saved mark on the public News card
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.id(21), 'aal1');
set local role authenticated;
select extensions.is(
  api.news_article_detail('fr', 'mfa-step-up-reads') ->> 'isSaved', 'false',
  'enrolled at aal1: the article reads as a visitor sees it, without the saved mark'
);
select extensions.is(
  (select item ->> 'isSaved' from jsonb_array_elements(api.news_feed('fr', 50) -> 'items') item
   where item ->> 'id' = pg_temp.id(9)::text),
  'false', 'and so does the feed''s card'
);
reset role;
select pg_temp.act(pg_temp.id(21), 'aal2');
set local role authenticated;
select extensions.is(
  api.news_article_detail('fr', 'mfa-step-up-reads') ->> 'isSaved', 'true',
  'enrolled at aal2: the saved mark is back'
);
reset role;
select pg_temp.act(pg_temp.id(22), 'aal1');
set local role authenticated;
select extensions.is(
  api.news_article_detail('fr', 'mfa-step-up-reads') ->> 'isSaved', 'true',
  'never enrolled, aal1: the saved mark, as before'
);
reset role;
select pg_temp.act(pg_temp.id(23), 'aal1');
set local role authenticated;
select extensions.is(
  api.news_article_detail('fr', 'mfa-step-up-reads') ->> 'isSaved', 'true',
  'unverified factor only, aal1: the saved mark'
);
reset role;
select set_config('request.jwt.claims', '', true);
select extensions.is(
  api.news_article_detail('fr', 'mfa-step-up-reads') ->> 'isSaved', 'false',
  'no actor: no saved mark (nobody is reading)'
);

-- ---------------------------------------------------------------------------
-- The avatar image
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.id(21), 'aal1');
set local role authenticated;
select extensions.is(pg_temp.avatar_access(pg_temp.id(21)),
  'read 0, upload refused new row violates row-level security policy for table "objects", replace 0, remove 0',
  'enrolled at aal1: Storage finds no avatar to sign, refuses an upload, and replaces or removes nothing'
);
reset role;
select set_config('request.jwt.claims',
  '{"sub":"a3b30000-0000-4000-8000-000000000021","role":"authenticated"}', true);
set local role authenticated;
select extensions.is(pg_temp.avatar_access(pg_temp.id(21)),
  'read 0, upload refused new row violates row-level security policy for table "objects", replace 0, remove 0',
  'enrolled with no aal claim: the same'
);
reset role;
select pg_temp.act(pg_temp.id(21), 'aal2');
set local role authenticated;
select extensions.is(pg_temp.avatar_access(pg_temp.id(21)),
  'read 1, upload uploaded, replace 1, remove 1', 'enrolled at aal2: all four work');
reset role;
select pg_temp.act(pg_temp.id(22), 'aal1');
set local role authenticated;
select extensions.is(pg_temp.avatar_access(pg_temp.id(22)),
  'read 1, upload uploaded, replace 1, remove 1', 'never enrolled, aal1: all four work, as before');
select extensions.is(pg_temp.avatar_access(pg_temp.id(21)),
  'read 0, upload refused new row violates row-level security policy for table "objects", replace 0, remove 0',
  'and the owner-folder rule is unchanged: another account''s avatar is out of reach');
reset role;
select pg_temp.act(pg_temp.id(23), 'aal1');
set local role authenticated;
select extensions.is(pg_temp.avatar_access(pg_temp.id(23)),
  'read 1, upload uploaded, replace 1, remove 1', 'unverified factor only, aal1: all four work');
reset role;
-- No actor through the API is the service role, which bypasses RLS.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select extensions.is(pg_temp.avatar_access(pg_temp.id(21)),
  'read 1, upload uploaded, replace 1, remove 1', 'the service role: all four work');
reset role;
select extensions.is(
  (select count(*)::integer from storage.objects
   where bucket_id = 'avatars' and owner_id = any(array[pg_temp.id(21), pg_temp.id(22), pg_temp.id(23)]::text[])),
  3, 'and every write above was undone: the three stored avatars are as uploaded'
);

select * from extensions.finish();
rollback;
