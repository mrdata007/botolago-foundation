begin;

select extensions.no_plan();

-- The Pépites API (20260926120000): access by mode for every public read,
-- the version pointer and its states, versioned reads, the admin functions
-- and their permissions, the data desk and the error report.

create function pg_temp.uid(p_prefix text, p_n integer)
returns uuid language sql immutable as $$
  select (p_prefix || lpad(p_n::text, 12, '0'))::uuid;
$$;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to public;

-- ===========================================================================
-- Catalog: last season with an activated final ranking, this season with a
-- hand-built weekly run of 12 ranked players (8 midfielders, 4 forwards).
-- ===========================================================================
insert into app.competitions (id, slug, name, competition_type)
values ('c0000000-0000-4000-8000-000000000001', 'pepites-api-league', 'Pépites API League', 'league');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, is_current, status) values
  ('c0100000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
    '2026/2027', '2026-07-01', '2027-06-30', true, 'active'),
  ('c0100000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
    '2025/2026', '2025-07-01', '2026-06-30', false, 'completed');
insert into app.teams (id, slug, name, short_name) values
  ('c0200000-0000-4000-8000-000000000001', 'pepites-api-a', 'Club A', 'A'),
  ('c0200000-0000-4000-8000-000000000002', 'pepites-api-b', 'Club B', 'B');
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.uid('c0300000-0000-4000-8000-', n), 'pepites-api-player-' || n, 'API Player ' || n,
  'A. Joueur ' || n, case when n <= 8 then 'midfielder' else 'forward' end::app.football_position
from generate_series(1, 13) n;

create function pg_temp.hand_run(p_id uuid, p_season uuid, p_kind text, p_round integer)
returns void language plpgsql as $$
begin
  insert into app.pepites_runs (id, season_id, kind, as_of_round_number, methodology_version,
    revision, input_cutoff_at)
  values (p_id, p_season, p_kind, p_round, 'v1', 1, now());
  insert into app_private.pepites_run_players (run_id, player_id, date_of_birth, position_group,
    team_id, membership_id, in_pool)
  select p_id, pg_temp.uid('c0300000-0000-4000-8000-', n), date '2005-01-01' + n,
    case when n <= 8 then 'MID' else 'FWD' end,
    pg_temp.uid('c0200000-0000-4000-8000-', 1 + n % 2), null, n <= 12
  from generate_series(1, 13) n;
  insert into app_private.pepites_run_appearances (run_id, player_id, fixture_id, team_id,
    round_number, kickoff_at, minutes, started, goals, assists, saves, rating, team_conceded)
  select p_id, pg_temp.uid('c0300000-0000-4000-8000-', n), pg_temp.uid('c0500000-0000-4000-8000-', 1),
    pg_temp.uid('c0200000-0000-4000-8000-', 1 + n % 2), 1, now() - interval '3 days', 90, true,
    0, 0, null, case when n % 3 = 0 then null else 7.0 end, 0
  from generate_series(1, 12) n;
  insert into app.pepites_player_scores (run_id, player_id, team_id, position_group, age_years, apps,
    starts, minutes, goals, assists, saves, clean_sheets, rating_avg, rating_n, form_avg, eligible,
    per90, percentiles, components, flags, score_exact, score, rank, rank_in_position)
  select p_id, pg_temp.uid('c0300000-0000-4000-8000-', n),
    pg_temp.uid('c0200000-0000-4000-8000-', 1 + n % 2), case when n <= 8 then 'MID' else 'FWD' end,
    18 + n % 5, 5, 5, 300 + n * 20, n % 4, n % 3, null, null, 7.0, 5, 7.0, true,
    jsonb_build_object('goalsAssists', n / 10.0), '{}', '{}', '{}', 90 - n * 2, 90 - n * 2, n,
    case when n <= 8 then n else n - 8 end
  from generate_series(1, 12) n;
  update app.pepites_runs set status = 'succeeded', finished_at = now(), eligible_count = 12,
    ranked_count = 12, input_fingerprint = repeat('0', 64)
  where id = p_id;
end;
$$;
select pg_temp.hand_run('c0400000-0000-4000-8000-000000000001', 'c0100000-0000-4000-8000-000000000001', 'weekly', 5);
select pg_temp.hand_run('c0400000-0000-4000-8000-000000000002', 'c0100000-0000-4000-8000-000000000002', 'season_final', 30);
select app_private.pepites_configure('off', false, 'c0000000-0000-4000-8000-000000000001');

-- ===========================================================================
-- People: a fan (aal1) and a staff member (platform admin, verified factor,
-- aal2 session)
-- ===========================================================================
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('c0600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'pepites-api-fan@example.test', now(), 'hash', '{}',
    '{"username":"pepites_api_fan"}', now(), now()),
  ('c0600000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'pepites-api-staff@example.test', now(), 'hash', '{}',
    '{"username":"pepites_api_staff"}', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('c0700000-0000-4000-8000-000000000001', 'c0600000-0000-4000-8000-000000000002',
  'Pépites TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('c0800000-0000-4000-8000-000000000001', 'c0600000-0000-4000-8000-000000000002',
  now(), now(), 'aal2');
select api.admin_bootstrap_first_platform_admin('c0600000-0000-4000-8000-000000000002',
  'Bootstrap deterministic Pépites API test administrator.', true);

create function pg_temp.act(p_who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case p_who
    when 'anon' then '{"role":"anon"}'
    when 'fan' then '{"sub":"c0600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}'
    when 'staff' then '{"sub":"c0600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"c0800000-0000-4000-8000-000000000001"}'
  end, true);
end;
$$;

-- Every public read, as one line per caller: available/preview for each.
create function pg_temp.reads(p_who text) returns text language plpgsql as $$
declare
  v_results jsonb[];
begin
  perform pg_temp.act(p_who);
  v_results := array[
    api.pepites_version(),
    api.pepites_home(null),
    api.pepites_ranking(null, null, null, null, 'score', 20, 0),
    api.pepites_player(null, 'c0300000-0000-4000-8000-000000000001'),
    api.pepites_player_matches('c0300000-0000-4000-8000-000000000001', 5),
    api.pepites_edition(null, 16),
    api.pepites_methodology()
  ];
  return (select string_agg(
    case when (result ->> 'available')::boolean
      then case when (result ->> 'preview')::boolean then 'P' else 'Y' end
      else '-' end, '' order by ordinality)
    from unnest(v_results) with ordinality as t(result, ordinality));
end;
$$;

-- ===========================================================================
-- Access by mode (§6.1): version, home, ranking, player, matches, edition,
-- method, for a visitor, a fan and staff
-- ===========================================================================
select extensions.is(
  pg_temp.reads('anon') || ' ' || pg_temp.reads('fan') || ' ' || pg_temp.reads('staff'),
  '------- ------- -------',
  'off: nobody, staff included, gets any Pépites data from any read'
);
select app_private.pepites_configure('staff', null);
select extensions.is(
  pg_temp.reads('anon') || ' ' || pg_temp.reads('fan') || ' ' || pg_temp.reads('staff'),
  '------- ------- PPPPPPP',
  'staff: visitors and fans get nothing; staff get every read, marked preview'
);
select app_private.pepites_configure('public', null);
select extensions.is(
  pg_temp.reads('anon') || ' ' || pg_temp.reads('fan') || ' ' || pg_temp.reads('staff'),
  'YYYYYYY YYYYYYY YYYYYYY',
  'public: everyone, staff included, gets the published data, not marked preview'
);

-- ===========================================================================
-- Before any edition: the previous season's final ranking
-- ===========================================================================
select pg_temp.act('anon');
select extensions.is(
  api.pepites_version() ->> 'source', null::text,
  'a final ranking nobody activated is never public'
);
select app_private.pepites_activate_season_final('c0400000-0000-4000-8000-000000000002');
select extensions.is(
  api.pepites_version() - 'available' - 'preview',
  jsonb_build_object('version', 'season_final:c0400000-0000-4000-8000-000000000002',
    'source', 'previous_season', 'editionId', null, 'runId', 'c0400000-0000-4000-8000-000000000002',
    'seasonId', 'c0100000-0000-4000-8000-000000000002', 'week', null,
    'state', 'current', 'nextRevealAt', null),
  'once activated, the pointer shows the 2025-26 final ranking'
);
select extensions.ok(
  (select home ->> 'source' = 'previous_season'
     and jsonb_array_length(home #> '{previousSeason,entries}') = 10
     and home #>> '{previousSeason,seasonLabel}' = '2025/2026'
     and home #>> '{previousSeason,entries,0,player,name}' = 'A. Joueur 1'
     and home #> '{previousSeason,entries,0,player,photo}' = 'null'::jsonb
   from api.pepites_home(null) home),
  'the home page shows its top 10, with no photo (the page draws the silhouette)'
);

-- ===========================================================================
-- Editions and the version pointer
-- ===========================================================================
create function pg_temp.draft(p_on date) returns uuid language sql as $$
  select app_private.pepites_create_draft('c0400000-0000-4000-8000-000000000001', p_on, null);
$$;
insert into ids select 'w16', pg_temp.draft('2026-10-12');
select extensions.is(
  api.pepites_version() ->> 'source', 'previous_season',
  'a draft changes nothing public'
);
select extensions.is(
  api.pepites_home((select id::text from ids where name = 'w16')) ->> 'found', 'false',
  'and a draft cannot be read by its id'
);
select app_private.pepites_schedule((select id from ids where name = 'w16'), now() + interval '1 hour',
  'c0900000-0000-4000-8000-000000000001');
select extensions.ok(
  (select pointer ->> 'state' = 'countdown'
     and (pointer ->> 'nextRevealAt')::timestamptz = (select scheduled_for from app.pepites_editions
       where id = (select id from ids where name = 'w16'))
     and pointer ->> 'source' = 'previous_season'
   from api.pepites_version() pointer),
  'a scheduled edition: countdown to its time, the version still the old one'
);
select app_private.pepites_unschedule((select id from ids where name = 'w16'), 'c0900000-0000-4000-8000-000000000001');
select app_private.pepites_schedule((select id from ids where name = 'w16'), now() - interval '3 minutes',
  'c0900000-0000-4000-8000-000000000001');
select extensions.is(
  api.pepites_version() ->> 'state', 'delayed',
  'more than 2 minutes past its time and not published: delayed'
);
select app_private.pepites_publish_edition((select id from ids where name = 'w16'), 'c0900000-0000-4000-8000-000000000001');
select extensions.ok(
  (select pointer ->> 'state' = 'current' and pointer ->> 'version' = (select id::text from ids where name = 'w16')
     and pointer ->> 'source' = 'edition' and pointer ->> 'week' = '16'
   from api.pepites_version() pointer),
  'published: current again, and the version is the edition'
);
select extensions.ok(
  (select home ->> 'found' = 'true' and jsonb_array_length(home #> '{edition,entries}') = 10
     and home #> '{edition,entries,0,movement}' = 'null'::jsonb
     and home #>> '{edition,entries,0,player,team,name,fr}' = 'Club B'
     and home #>> '{edition,status}' = 'published'
   from api.pepites_home(null) home),
  'the home page shows the edition: ten entries, club names, no movement for a first edition'
);
select extensions.is(
  api.pepites_home('season_final:c0400000-0000-4000-8000-000000000002') ->> 'source', 'previous_season',
  'an older version stays readable by its name'
);
select extensions.is(
  api.pepites_home('not-a-version') ->> 'found', 'false',
  'a made-up version is not found'
);

-- Next week, one player swapped in: movement against the previous edition.
insert into ids select 'w17', pg_temp.draft('2026-10-19');
select app_private.pepites_set_entries((select id from ids where name = 'w17'),
  (select jsonb_agg(jsonb_build_object('rank', rank, 'playerId', player_id) order by rank)
   from (values
     (1, 'c0300000-0000-4000-8000-000000000002'::uuid), (2, 'c0300000-0000-4000-8000-000000000001'),
     (3, 'c0300000-0000-4000-8000-000000000003'), (4, 'c0300000-0000-4000-8000-000000000004'),
     (5, 'c0300000-0000-4000-8000-000000000005'), (6, 'c0300000-0000-4000-8000-000000000006'),
     (7, 'c0300000-0000-4000-8000-000000000007'), (8, 'c0300000-0000-4000-8000-000000000008'),
     (9, 'c0300000-0000-4000-8000-000000000009'), (10, 'c0300000-0000-4000-8000-000000000011')
   ) entries(rank, player_id)),
  'c0900000-0000-4000-8000-000000000001');
select app_private.pepites_schedule((select id from ids where name = 'w17'), now(), 'c0900000-0000-4000-8000-000000000001');
select app_private.pepites_publish_edition((select id from ids where name = 'w17'), 'c0900000-0000-4000-8000-000000000001');
select extensions.is(
  (select array_agg(entry -> 'movement' order by (entry ->> 'rank')::integer)
   from jsonb_array_elements(api.pepites_home(null) #> '{edition,entries}') entry
   where (entry ->> 'rank')::integer in (1, 2, 3, 10)),
  array['{"by": 1, "kind": "up"}', '{"by": 1, "kind": "down"}', '{"kind": "same"}', '{"kind": "new"}']::jsonb[],
  'movement compares the editorial rank with what readers saw the week before: up, down, same, new'
);

-- ===========================================================================
-- Ranking
-- ===========================================================================
select extensions.ok(
  (select ranking ->> 'total' = '12' and jsonb_array_length(ranking -> 'rows') = 5
     and ranking #>> '{rows,0,name}' = 'A. Joueur 1' and ranking #>> '{rows,4,rank}' = '5'
     and ranking #> '{rows,0,movement}' = '{"kind": "same"}'::jsonb
   from api.pepites_ranking(null, null, null, null, 'score', 5, 0) ranking),
  'the ranking: total, a page of rows in rank order, movement against the previous edition''s run'
);
select extensions.is(
  (select array_agg(row_value ->> 'name' order by ordinality)
   from jsonb_array_elements(api.pepites_ranking(null, 'FWD', null, null, 'minutes', 10, 0) -> 'rows')
     with ordinality as t(row_value, ordinality)),
  array['A. Joueur 12', 'A. Joueur 11', 'A. Joueur 10', 'A. Joueur 9'],
  'filtered to forwards and sorted by minutes'
);
select extensions.is(
  (api.pepites_ranking(null, null, 19, 'c0200000-0000-4000-8000-000000000002', 'score', 50, 0) ->> 'total')::integer,
  (select count(*)::integer from app.pepites_player_scores where run_id = 'c0400000-0000-4000-8000-000000000001'
     and age_years <= 19 and team_id = 'c0200000-0000-4000-8000-000000000002'),
  'filtered by age and club'
);
select extensions.throws_ok(
  $$select api.pepites_ranking(null, null, null, null, 'salary', 20, 0)$$,
  '22023', 'PEPITES_RANKING_INVALID', 'an unknown sort is refused'
);
select extensions.throws_ok(
  $$select api.pepites_ranking(null, null, null, null, 'score', 51, 0)$$,
  '22023', 'PEPITES_RANKING_INVALID', 'pages are at most 50 rows'
);

-- ===========================================================================
-- Player, matches, edition, method
-- ===========================================================================
select extensions.ok(
  (select player ->> 'found' = 'true' and player #>> '{player,name}' = 'A. Joueur 3'
     and player #> '{player,missing}' @> '["preferred_foot", "height_cm"]'::jsonb
     and player #>> '{score,rank}' = '3' and player #> '{player,photo}' = 'null'::jsonb
     and jsonb_array_length(player -> 'editions') = 2
   from api.pepites_player(null, 'c0300000-0000-4000-8000-000000000003') player),
  'a player page: identity with what is missing, the score and rank, and the editions entered'
);
select extensions.is(
  api.pepites_player(null, 'c0300000-0000-4000-8000-000000000013') ->> 'found', 'false',
  'a player outside the pool has no page'
);
select extensions.is(
  api.pepites_player_matches('c0300000-0000-4000-8000-000000000003', 5) -> 'matches', '[]'::jsonb,
  'matches come from finished fixtures (none in this hand-built league)'
);
select extensions.ok(
  (select methodology #>> '{methodology,version}' = 'v1'
     and methodology #>> '{coverage,poolSize}' = '12' and methodology #>> '{coverage,ranked}' = '12'
     and methodology #>> '{coverage,noDateOfBirth}' = '0'
     and (methodology #>> '{coverage,ratingCoverage}')::numeric = 0.667
   from api.pepites_methodology() methodology),
  'the method page: parameters and coverage of the current run'
);

-- Correction and withdrawal, as the edition page shows them.
insert into ids select 'w17c', app_private.pepites_create_correction((select id from ids where name = 'w17'),
  'c0900000-0000-4000-8000-000000000001');
select app_private.pepites_schedule((select id from ids where name = 'w17c'), now(), 'c0900000-0000-4000-8000-000000000001');
select app_private.pepites_publish_edition((select id from ids where name = 'w17c'), 'c0900000-0000-4000-8000-000000000001');
select extensions.ok(
  (select home #>> '{edition,id}' = (select id::text from ids where name = 'w17c')
     and old #>> '{edition,status}' = 'superseded'
     and old #>> '{edition,correctedBy}' = (select id::text from ids where name = 'w17c')
     and jsonb_array_length(old #> '{edition,entries}') = 10
   from api.pepites_home(null) home,
     api.pepites_home((select id::text from ids where name = 'w17')) old),
  'after a correction the pointer moves to it; the old edition says it was corrected, and by which'
);
select app_private.pepites_withdraw((select id from ids where name = 'w17c'), 'Erreur de données confirmée',
  'c0900000-0000-4000-8000-000000000001');
select extensions.ok(
  (select pointer ->> 'version' = (select id::text from ids where name = 'w16')
     and edition #>> '{edition,status}' = 'withdrawn'
     and edition #> '{edition,entries}' = '[]'::jsonb
     and edition #>> '{edition,withdrawnReason}' = 'Erreur de données confirmée'
     and ranking ->> 'found' = 'false'
   from api.pepites_version() pointer,
     api.pepites_edition(null, 17) edition,
     api.pepites_ranking((select id::text from ids where name = 'w17c'), null, null, null, 'score', 5, 0) ranking),
  'withdrawn: the pointer falls back to the week before; the page says withdrawn and shows no entries'
);

-- ===========================================================================
-- Admin
-- ===========================================================================
select pg_temp.act('fan');
select extensions.throws_ok(
  $$select api.admin_pepites_overview()$$,
  'PT403', null, 'a fan cannot open the Pépites admin'
);
select pg_temp.act('staff');
select extensions.ok(
  (select overview #>> '{settings,mode}' = 'public' and overview ->> 'jobActive' = 'true'
     and jsonb_array_length(overview -> 'editions') >= 3
   from api.admin_pepites_overview() overview),
  'staff see the mode, the job, the runs and the editions'
);
insert into ids select 'w18', pg_temp.draft('2026-10-26');
select extensions.ok(
  (select jsonb_array_length(edition -> 'shortlist') = 12 and jsonb_array_length(edition -> 'entries') = 10
     and edition -> 'problems' = '[]'::jsonb
   from api.admin_pepites_edition_get((select id from ids where name = 'w18')) edition),
  'the editor sees the draft, its problems and the computed shortlist'
);
select extensions.throws_ok(
  format($$select api.admin_pepites_edition_schedule(%L, now() + interval '30 days')$$,
    (select id from ids where name = 'w18')),
  '22023', 'PEPITES_SCHEDULE_TIME_INVALID', 'a publication time more than 14 days ahead is refused'
);
select extensions.lives_ok(
  format($$select api.admin_pepites_edition_schedule(%L, now() + interval '1 hour')$$,
    (select id from ids where name = 'w18')),
  'staff schedule it'
);
select extensions.is(
  (api.admin_pepites_edition_publish_now((select id from ids where name = 'w18')) ->> 'status'),
  'published',
  'and publish it now'
);
select extensions.ok(
  (select published_by = (select id from app_private.staff_principals
     where auth_user_id = 'c0600000-0000-4000-8000-000000000002')
   from app.pepites_editions where id = (select id from ids where name = 'w18')),
  'recorded with the staff member as publisher'
);
select extensions.is(
  (select array_agg(action order by occurred_at, id) from app_private.admin_audit_events
   where target_entity_id = (select id from ids where name = 'w18')),
  array['pepites.edition_schedule', 'pepites.edition_publish'],
  'both actions are in the admin audit trail'
);
select extensions.is(
  api.admin_pepites_email_report((select id from ids where name = 'w18')) ->> 'total', '0',
  'the email report is there for staff (nobody has opted in here)'
);
reset role;

-- Data desk and the fans' error report.
select pg_temp.act('fan');
set local role authenticated;
select extensions.ok(
  (api.report_pepites_data_issue('player', 'c0300000-0000-4000-8000-000000000003', 'height_cm',
    'La taille indiquée est fausse.') ->> 'issueId') is not null,
  'a signed-in fan reports an error on a player page'
);
reset role;
select app_private.pepites_configure('off', null);
select pg_temp.act('fan');
set local role authenticated;
select extensions.throws_ok(
  $$select api.report_pepites_data_issue('player', 'c0300000-0000-4000-8000-000000000004', 'height_cm', 'La taille est fausse.')$$,
  'PT403', 'PEPITES_UNAVAILABLE', 'not while Pépites is off'
);
reset role;
select pg_temp.act('staff');
select extensions.ok(
  (select (list ->> 'total')::integer >= 1
     and exists (select 1 from jsonb_array_elements(list -> 'issues') issue
       where issue ->> 'kind' = 'reported' and issue ->> 'playerName' = 'A. Joueur 3')
   from api.admin_data_desk_list('{"kind": "reported"}') list),
  'the report reaches the data desk, with the player''s name'
);
select extensions.lives_ok(
  $$select api.admin_player_attribute_correct('c0300000-0000-4000-8000-000000000003', 'height_cm', '181',
    'Fiche officielle du club, saison 2026-27.')$$,
  'staff correct the height with a source note'
);
select extensions.is(
  (select height_cm::integer from app.players where id = 'c0300000-0000-4000-8000-000000000003'),
  181,
  'the correction goes through the resolver to the player'
);
select extensions.ok(
  exists (select 1 from app_private.admin_audit_events
    where action = 'football.player_attribute_correct'
      and target_entity_id = 'c0300000-0000-4000-8000-000000000003'),
  'and is audited'
);
select extensions.is(
  pg_temp.reads('staff'), '-------',
  'with Pépites off again, even staff get no public data (the admin screens still work)'
);
select extensions.ok(
  (api.admin_pepites_overview() #>> '{settings,mode}') = 'off',
  'the admin overview still answers'
);

-- ===========================================================================
-- Grants
-- ===========================================================================
select extensions.ok(
  has_function_privilege('anon', 'api.pepites_home(text)', 'execute')
  and has_function_privilege('anon', 'api.pepites_ranking(text, text, integer, uuid, text, integer, integer)', 'execute')
  and not has_function_privilege('anon', 'api.report_pepites_data_issue(text, uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'api.admin_pepites_edition_publish_now(uuid)', 'execute')
  and has_function_privilege('authenticated', 'api.admin_pepites_edition_publish_now(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.pepites_access()', 'execute')
  and not has_function_privilege('anon', 'app_private.pepites_activate_season_final(uuid)', 'execute'),
  'reads for everyone, the report for signed-in fans, admin functions checked inside, helpers for nobody'
);
select extensions.ok(
  (select count(*) = 2 from app_private.admin_role_permissions mapping
   join app_private.admin_permissions permission on permission.id = mapping.permission_id
   join app_private.admin_roles role on role.id = mapping.role_id
   where role.name = 'publisher' and permission.name in ('pepites.edit', 'pepites.publish'))
  and (select requires_recent_auth from app_private.admin_permissions where name = 'pepites.publish'),
  'publishers hold both permissions; publishing needs a recent sign-in'
);

select * from extensions.finish();
rollback;
