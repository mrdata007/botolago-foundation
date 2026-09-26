begin;

select extensions.no_plan();

-- The Pépites admin lists (20260926140000): photo releases with the problems
-- an approval would find, and the player search. Staff only, after the
-- step-up; a fan gets nothing.

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('d1000000-0000-4000-8000-000000000001', 'MA', 'MAR')
on conflict do nothing;
insert into app.teams (id, slug, name, short_name)
values ('d2000000-0000-4000-8000-000000000001', 'admin-lists-club', 'Club Listes', 'CL');
insert into app.players (id, slug, full_name, display_name, position) values
  ('d3000000-0000-4000-8000-000000000001', 'lists-adult', 'Youssef Listes', 'Y. Listes', 'forward'),
  ('d3000000-0000-4000-8000-000000000002', 'lists-other', 'Karim Autre', 'K. Autre', 'defender'),
  ('d3000000-0000-4000-8000-000000000003', 'lists-percent', 'Percent_Name', 'P%Name', 'midfielder');
insert into app.team_memberships (player_id, team_id, valid_from)
values ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '2026-07-01');

do $$
begin
  perform app_private.record_player_attribute_observation('d3000000-0000-4000-8000-000000000001',
    'date_of_birth', '2004-02-03', null, 'provider', 'sportsmonks', 'lists-test', '2026-09-01T00:00:00Z');
  perform app_private.resolve_player_attributes(array['d3000000-0000-4000-8000-000000000001'::uuid]);
end;
$$;

-- People: a fan (aal1) and a staff member (platform admin, aal2).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d6000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'lists-fan@example.test', now(), 'hash', '{}', '{"username":"lists_fan"}', now(), now()),
  ('d6000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'lists-staff@example.test', now(), 'hash', '{}', '{"username":"lists_staff"}', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('d7000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002',
  'Lists TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('d8000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002', now(), now(), 'aal2');
select api.admin_bootstrap_first_platform_admin('d6000000-0000-4000-8000-000000000002',
  'Bootstrap deterministic Pépites admin lists test administrator.', true);

create function pg_temp.act(p_who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case p_who
    when 'fan' then '{"sub":"d6000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}'
    when 'staff' then '{"sub":"d6000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"d8000000-0000-4000-8000-000000000001"}'
  end, true);
end;
$$;

-- Two releases for the adult: one with both files stored, one whose files
-- never arrived.
insert into storage.objects (bucket_id, name) values
  ('player-photo-intake', 'players/d3000000-0000-4000-8000-000000000001/d0000001-0000-4000-8000-000000000001.jpg'),
  ('player-photo-releases', 'players/d3000000-0000-4000-8000-000000000001/release-1.pdf');
select app_private.submit_player_photo_release('d3000000-0000-4000-8000-000000000001',
  'players/d3000000-0000-4000-8000-000000000001/d0000001-0000-4000-8000-000000000001.jpg',
  'players/d3000000-0000-4000-8000-000000000001/release-1.pdf',
  date '2026-09-01', date '2026-09-02', 'player', 'in_app_and_social', 'botolago_release',
  'BotolaGO', 'BotolaGO', null,
  (select id from app_private.staff_principals where auth_user_id = 'd6000000-0000-4000-8000-000000000002'));
select app_private.submit_player_photo_release('d3000000-0000-4000-8000-000000000001',
  'players/d3000000-0000-4000-8000-000000000001/d0000002-0000-4000-8000-000000000001.jpg',
  'players/d3000000-0000-4000-8000-000000000001/release-2.pdf',
  date '2026-09-01', date '2026-09-02', 'player', 'in_app', 'club_licence',
  'Club', 'Club Listes', null, 'd9000000-0000-4000-8000-000000000001');

-- ===========================================================================
-- Photo releases
-- ===========================================================================
select pg_temp.act('fan');
set local role authenticated;
select extensions.throws_ok($$select api.admin_player_photo_releases()$$, 'PT403', null,
  'a fan cannot list photo releases');
select extensions.throws_ok($$select api.admin_pepites_player_search('Listes')$$, 'PT403', null,
  'nor search players');
reset role;

select pg_temp.act('staff');
set local role authenticated;
select extensions.is(
  jsonb_array_length(api.admin_player_photo_releases()), 2, 'staff see the two pending releases');
select extensions.is(
  (select jsonb_agg(release ->> 'playerName') from jsonb_array_elements(api.admin_player_photo_releases()) release),
  '["Y. Listes", "Y. Listes"]'::jsonb, 'with the player''s name');
select extensions.ok(
  (select bool_and((release ->> 'submittedByMe')::boolean = (release ->> 'scope' = 'in_app_and_social'))
   from jsonb_array_elements(api.admin_player_photo_releases()) release),
  'each says whether the reader submitted it');
select extensions.ok(
  (select release -> 'problems' ? 'intake_missing'
   from jsonb_array_elements(api.admin_player_photo_releases()) release
   where release ->> 'scope' = 'in_app'),
  'a release whose original never arrived shows the problem before anyone approves it');
select extensions.ok(
  (select not (release -> 'problems' ? 'intake_missing')
   from jsonb_array_elements(api.admin_player_photo_releases()) release
   where release ->> 'scope' = 'in_app_and_social'),
  'the complete one does not');
select extensions.is(jsonb_array_length(api.admin_player_photo_releases('published')), 0,
  'a status filter narrows the list');
select extensions.throws_ok($$select api.admin_player_photo_releases('everything')$$, '22023',
  'PHOTO_RELEASE_FILTER_INVALID', 'an unknown status is refused');

-- ===========================================================================
-- Player search
-- ===========================================================================
select extensions.is(
  (select jsonb_agg(player ->> 'name') from jsonb_array_elements(api.admin_pepites_player_search('listes')) player),
  '["Y. Listes"]'::jsonb, 'a part of the name finds the player, whatever the case');
select extensions.is(
  (select player - 'id' from jsonb_array_elements(api.admin_pepites_player_search('Youssef')) player),
  '{"name": "Y. Listes", "fullName": "Youssef Listes", "dateOfBirth": "2004-02-03", "nationality": null,
    "preferredFoot": null, "heightCm": null, "detailedPosition": null, "hasPhoto": false, "team": "CL"}'::jsonb,
  'with the attributes the desk corrects, the unknown foot as null, and the current club');
select extensions.is(
  (select jsonb_agg(player ->> 'name') from jsonb_array_elements(api.admin_pepites_player_search('%%')) player),
  null, 'a % in the query is text, not a wildcard (no player name holds two)');
select extensions.is(
  (select jsonb_agg(player ->> 'name') from jsonb_array_elements(api.admin_pepites_player_search('P%N')) player),
  '["P%Name"]'::jsonb, 'and matches a name that holds it');
select extensions.throws_ok($$select api.admin_pepites_player_search('x')$$, '22023',
  'PLAYER_SEARCH_QUERY_INVALID', 'a one-letter query is refused');
reset role;

-- The step-up comes first: the same staff account on an aal1 session.
select set_config('request.jwt.claims',
  '{"sub":"d6000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1","session_id":"d8000000-0000-4000-8000-000000000001"}',
  true);
set local role authenticated;
select extensions.throws_ok($$select api.admin_player_photo_releases()$$, 'PT403', null,
  'staff without the second factor on this session are refused');
reset role;

select * from extensions.finish();
rollback;
