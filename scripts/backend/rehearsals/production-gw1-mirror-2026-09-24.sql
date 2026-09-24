-- LOCAL REHEARSAL ONLY -- never run against a shared database.
--
-- Rebuilds, in a disposable local Supabase database, the Fantasy calendar state
-- that production (tkewgajrljbwgwedqsxn) was in at 2026-09-24 18:00Z, read
-- read-only from production for the 2026-09-24 remediation:
--
--   * the 2026/27 season, its two rounds and all 16 fixtures with production's
--     ids, kickoffs, statuses and source sequences (FAR Rabat v Raja
--     Casablanca postponed on round 1; one round-2 fixture postponed on a
--     00:00 placeholder);
--   * the one Fantasy gameweek (GW1, open, deadline 13:30Z, lock_version 1)
--     and its nine assignment rows, including the operator deferral of 09-21
--     and the 04:45Z re-assignment that anchored the deadline;
--   * the 16 Fantasy clubs (one catalogue player each: enough for the
--     calendar's club checks) and six active teams with one unlocked GW1
--     lineup each. Managers are synthetic: no production personal data.
--
-- Use: `supabase db reset` WITHOUT migration 20260924190000 present, run this
-- file, then run the production apply script. See
-- docs/production/APPLY_2026_09_24_LAUNCH_FIXES.md.

begin;

do $guard$
begin
  if exists (select 1 from app.fantasy_seasons where id = '5ada3e98-2929-405a-a3f1-a26de8e51933') then
    raise exception 'stop: the production season already exists here -- this is not a disposable local database';
  end if;
  if exists (select 1 from auth.users limit 1) then
    raise exception 'stop: this database has users -- run only on a freshly reset local database';
  end if;
end
$guard$;

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('b41c007a-a307-44dd-a001-e7cdcc9a8c56', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('3e579087-e5ad-4cb1-babf-6490cf2a8ebe', 'botola-pro-3e579087e5ad', 'Botola Pro', 'MAR G1',
  'league', 'b41c007a-a307-44dd-a001-e7cdcc9a8c56');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('d03223b0-8f4a-4309-93e1-2a708d7c3584', '3e579087-e5ad-4cb1-babf-6490cf2a8ebe',
  '2026/2027', '2026-09-24', '2027-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status) values
  ('e85725dc-ec82-4d18-8d53-4cfb652aa02e', 'd03223b0-8f4a-4309-93e1-2a708d7c3584', 1, '1', 'planned'),
  ('e90d9aa1-40aa-4fd2-8a6c-1aa71f9c137a', 'd03223b0-8f4a-4309-93e1-2a708d7c3584', 2, '2', 'planned');

insert into app.teams (id, slug, name, short_name, code, country_id)
select id::uuid, 'mirror-' || lower(code), name, code, code, 'b41c007a-a307-44dd-a001-e7cdcc9a8c56'
from (values
  ('fd6ff8ea-898c-403b-aec3-7d8a41cbc158', 'FAR Rabat', 'FAR'),
  ('3b0f1fc9-5b29-4a77-bdf8-a54fce0b1a0e', 'Raja Casablanca', 'RCA'),
  ('1ebd788b-9f71-4a78-bfa8-68359d7f3a3f', 'Amal Tiznit', 'AMT'),
  ('353e19d7-0a4b-41e6-a491-fc85f6c952d8', 'Ittihad Tanger', 'IRT'),
  ('b78eaee8-93af-4630-8335-b208151cbf37', 'UTS Rabat', 'UTS'),
  ('c499006b-2af3-4013-862c-854ab74b59cf', 'FUS Rabat', 'FUS'),
  ('d5d8c59b-f7ab-4b30-9dfb-1d17a36bd0fc', 'Difaâ El Jadida', 'DHJ'),
  ('8059c0cf-8b7b-4317-be7e-fd646d377cd0', 'CODM Meknès', 'COD'),
  ('80a3fb82-02ae-46bc-aae9-5160ba8f3648', 'Wydad Casablanca', 'WAC'),
  ('7d508334-d7a9-4a74-b057-7030c21a0eda', 'Widad Témara', 'WTE'),
  ('e3beb52d-fbfb-4180-a39d-7e3d8f965b62', 'Moghreb Tétouan', 'MAT'),
  ('7b2e23bc-450f-4eb2-9926-4add1a5386e7', 'RSB Berkane', 'RSB'),
  ('d60d9d72-cb7a-4c94-944f-67081ef0a009', 'Kawkab Marrakech', 'KAC'),
  ('9f8c170d-24ed-41a3-99ca-a06167fd9c8b', 'Hassania Agadir', 'HUS'),
  ('0257feb3-4c16-431d-a58b-5faf060576ad', 'Maghreb Fès', 'MAS'),
  ('dc6fb819-6f3e-4584-ad73-7d567e80d32c', 'CR Khemis Zemamra', 'CKZ')
) club(id, name, code);

-- Production's 16 current-season fixtures, exactly (id, round, home, away,
-- kickoff, status, scores, provider freshness).
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, period, home_score, away_score, provider_updated_at, source_sequence, source_version)
select f.id::uuid, '3e579087-e5ad-4cb1-babf-6490cf2a8ebe', 'd03223b0-8f4a-4309-93e1-2a708d7c3584',
  f.round_id::uuid, f.home::uuid, f.away::uuid, f.kickoff::timestamptz, f.status::app.fixture_status,
  'pre_match', f.home_score, f.away_score, f.provider_updated::timestamptz, f.seq, f.version
from (values
  ('befe1113-be9f-461d-81cf-9dcc262fab45', 'e85725dc-ec82-4d18-8d53-4cfb652aa02e', 'fd6ff8ea-898c-403b-aec3-7d8a41cbc158', '3b0f1fc9-5b29-4a77-bdf8-a54fce0b1a0e', '2026-09-24T15:00:00Z', 'postponed', 0, 0, '2026-09-24T15:03:02.112Z', 1790262182112, 'sportsmonks:19874704:1790262182112'),
  ('b48265b5-5df0-4ae3-815d-a0a01cde80f2', 'e85725dc-ec82-4d18-8d53-4cfb652aa02e', '1ebd788b-9f71-4a78-bfa8-68359d7f3a3f', '353e19d7-0a4b-41e6-a491-fc85f6c952d8', '2026-09-24T20:00:00Z', 'not_started', null, null, '2026-09-24T15:03:03.116Z', 1790262183116, 'sportsmonks:19874708:1790262183116'),
  ('5dddc509-791e-4772-837a-4a2cd97c401c', 'e85725dc-ec82-4d18-8d53-4cfb652aa02e', 'b78eaee8-93af-4630-8335-b208151cbf37', 'c499006b-2af3-4013-862c-854ab74b59cf', '2026-09-26T16:00:00Z', 'not_started', null, null, '2026-09-24T15:03:03.679Z', 1790262183679, 'sportsmonks:19874707:1790262183679'),
  ('35ecf3a7-903a-4630-b6b8-6a5acb32b709', 'e85725dc-ec82-4d18-8d53-4cfb652aa02e', 'd5d8c59b-f7ab-4b30-9dfb-1d17a36bd0fc', '8059c0cf-8b7b-4317-be7e-fd646d377cd0', '2026-09-26T18:00:00Z', 'not_started', null, null, '2026-09-24T15:03:04.248Z', 1790262184248, 'sportsmonks:19874710:1790262184248'),
  ('ec26e426-096a-4e13-a495-0f96d68f4fbc', 'e85725dc-ec82-4d18-8d53-4cfb652aa02e', '80a3fb82-02ae-46bc-aae9-5160ba8f3648', '7d508334-d7a9-4a74-b057-7030c21a0eda', '2026-09-26T20:00:00Z', 'not_started', null, null, '2026-09-24T15:03:05.453Z', 1790262185453, 'sportsmonks:19874709:1790262185453'),
  ('e85aa943-5b31-4a90-8b15-691244450bec', 'e85725dc-ec82-4d18-8d53-4cfb652aa02e', 'e3beb52d-fbfb-4180-a39d-7e3d8f965b62', '7b2e23bc-450f-4eb2-9926-4add1a5386e7', '2026-09-27T16:00:00Z', 'not_started', null, null, '2026-09-24T15:03:06.009Z', 1790262186009, 'sportsmonks:19874705:1790262186009'),
  ('6266b83c-1bc1-4d02-96c5-9bdd44caad59', 'e85725dc-ec82-4d18-8d53-4cfb652aa02e', 'd60d9d72-cb7a-4c94-944f-67081ef0a009', '9f8c170d-24ed-41a3-99ca-a06167fd9c8b', '2026-09-27T18:00:00Z', 'not_started', null, null, '2026-09-24T15:03:06.568Z', 1790262186568, 'sportsmonks:19874706:1790262186568'),
  ('432db163-ee21-4bfa-b2ea-199105ff2758', 'e85725dc-ec82-4d18-8d53-4cfb652aa02e', '0257feb3-4c16-431d-a58b-5faf060576ad', 'dc6fb819-6f3e-4584-ad73-7d567e80d32c', '2026-09-27T18:00:00Z', 'not_started', null, null, '2026-09-24T15:03:07.404Z', 1790262187404, 'sportsmonks:19874711:1790262187404'),
  ('1296b2e5-bb59-4f18-8ef7-dc0b2990bc3a', 'e90d9aa1-40aa-4fd2-8a6c-1aa71f9c137a', '7b2e23bc-450f-4eb2-9926-4add1a5386e7', 'fd6ff8ea-898c-403b-aec3-7d8a41cbc158', '2026-10-02T00:00:00Z', 'postponed', null, null, '2026-09-24T15:03:07.945Z', 1790262187945, 'sportsmonks:19885589:1790262187945'),
  ('dc4c8c92-6024-449e-b3bd-9a94d176101a', 'e90d9aa1-40aa-4fd2-8a6c-1aa71f9c137a', 'c499006b-2af3-4013-862c-854ab74b59cf', '1ebd788b-9f71-4a78-bfa8-68359d7f3a3f', '2026-10-02T16:00:00Z', 'not_started', null, null, '2026-09-24T15:03:08.499Z', 1790262188499, 'sportsmonks:19885590:1790262188499'),
  ('7451c4e7-62c8-458a-a561-74b3266a24f0', 'e90d9aa1-40aa-4fd2-8a6c-1aa71f9c137a', '7d508334-d7a9-4a74-b057-7030c21a0eda', 'b78eaee8-93af-4630-8335-b208151cbf37', '2026-10-02T18:00:00Z', 'not_started', null, null, '2026-09-24T15:03:09.053Z', 1790262189053, 'sportsmonks:19885591:1790262189053'),
  ('a53ba361-ed2d-4a40-af9a-1c4af4635c75', 'e90d9aa1-40aa-4fd2-8a6c-1aa71f9c137a', '353e19d7-0a4b-41e6-a491-fc85f6c952d8', 'e3beb52d-fbfb-4180-a39d-7e3d8f965b62', '2026-10-02T20:00:00Z', 'not_started', null, null, '2026-09-24T15:03:09.941Z', 1790262189941, 'sportsmonks:19885592:1790262189941'),
  ('b5d47154-c396-4ae2-b4d2-f57c3a966483', 'e90d9aa1-40aa-4fd2-8a6c-1aa71f9c137a', '9f8c170d-24ed-41a3-99ca-a06167fd9c8b', '0257feb3-4c16-431d-a58b-5faf060576ad', '2026-10-03T16:00:00Z', 'not_started', null, null, '2026-09-24T15:03:10.5Z', 1790262190500, 'sportsmonks:19885593:1790262190500'),
  ('dc45a852-d542-422a-92d5-99bbd5f420b6', 'e90d9aa1-40aa-4fd2-8a6c-1aa71f9c137a', 'd5d8c59b-f7ab-4b30-9dfb-1d17a36bd0fc', '80a3fb82-02ae-46bc-aae9-5160ba8f3648', '2026-10-03T18:00:00Z', 'not_started', null, null, '2026-09-24T15:03:11.043Z', 1790262191043, 'sportsmonks:19885594:1790262191043'),
  ('56098878-bb03-4c2a-a268-06258743762e', 'e90d9aa1-40aa-4fd2-8a6c-1aa71f9c137a', '8059c0cf-8b7b-4317-be7e-fd646d377cd0', 'd60d9d72-cb7a-4c94-944f-67081ef0a009', '2026-10-03T18:00:00Z', 'not_started', null, null, '2026-09-24T15:03:11.872Z', 1790262191872, 'sportsmonks:19885595:1790262191872'),
  ('14e01965-04be-41f1-a674-bafb6a2722a0', 'e90d9aa1-40aa-4fd2-8a6c-1aa71f9c137a', '3b0f1fc9-5b29-4a77-bdf8-a54fce0b1a0e', 'dc6fb819-6f3e-4584-ad73-7d567e80d32c', '2026-10-03T20:00:00Z', 'not_started', null, null, '2026-09-24T15:03:12.433Z', 1790262192433, 'sportsmonks:19885596:1790262192433')
) f(id, round_id, home, away, kickoff, status, home_score, away_score, provider_updated, seq, version);

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('f133fffa-539e-48d0-a7a3-725d1f52e7ac', '3e579087-e5ad-4cb1-babf-6490cf2a8ebe',
  'botola-pro-3e579087e5ad', 'Botola Pro Fantasy', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at, wildcard_split_gameweek)
values ('5ada3e98-2929-405a-a3f1-a26de8e51933', 'f133fffa-539e-48d0-a7a3-725d1f52e7ac',
  'd03223b0-8f4a-4309-93e1-2a708d7c3584', 'f6100000-0000-4000-8000-000000000101',
  '2026/2027', 'registration_open', '2026-09-24T00:00:00Z', '2027-06-30T23:59:59.999999Z', 1);

-- One catalogue player per club: the calendar only asks which clubs exist.
insert into app.players (id, slug, full_name, display_name, position)
select md5('mirror-player-' || t.id)::uuid, 'mirror-player-' || lower(t.code), 'Mirror ' || t.code,
  'Mirror ' || t.code, 'midfielder'
from app.teams t where t.slug like 'mirror-%';
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id,
  position_id, price)
select md5('mirror-fantasy-player-' || t.id)::uuid, '5ada3e98-2929-405a-a3f1-a26de8e51933',
  md5('mirror-player-' || t.id)::uuid, t.id,
  (select id from app.fantasy_positions where code = 'MID'), 5
from app.teams t where t.slug like 'mirror-%';

-- GW1 as production held it: open, deadline 13:30Z (from the postponed
-- 15:00Z fixture), lock_version 1.
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state, lock_version, created_at)
values ('7fcb28c5-9b69-4591-bcda-437c6c961c5c', '5ada3e98-2929-405a-a3f1-a26de8e51933',
  'e85725dc-ec82-4d18-8d53-4cfb652aa02e', 1, '1', '2026-09-24T13:30:00Z', '2026-09-24T15:00:00Z',
  '2026-09-28T00:00:00Z', 'open', 'provisional', 1, '2026-09-19T14:59:44.839754Z');

insert into app.fantasy_fixture_assignments (id, fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, assignment_status, resolution,
  counts_points, source_version, superseded_at, created_at)
select a.id::uuid, '5ada3e98-2929-405a-a3f1-a26de8e51933', a.fixture::uuid,
  '7fcb28c5-9b69-4591-bcda-437c6c961c5c', '7fcb28c5-9b69-4591-bcda-437c6c961c5c',
  a.original::timestamptz, a.assigned::timestamptz, a.status, a.resolution, a.counts, a.version,
  a.superseded::timestamptz, a.created::timestamptz
from (values
  ('58d3befc-eb35-4333-962c-f5a5db05d3bb', 'befe1113-be9f-461d-81cf-9dcc262fab45', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z', 'deferred', 'operator_deferred', false, 1789725998800, '2026-09-21T16:51:50.312198Z', '2026-09-19T14:59:44.839754Z'),
  ('3cb41e6c-9920-4c21-8f19-e5d4d63c363d', 'befe1113-be9f-461d-81cf-9dcc262fab45', '2026-09-24T15:00:00Z', '2026-09-24T15:00:00Z', 'assigned', null, true, 1790225084858, null, '2026-09-24T04:45:00.587469Z'),
  ('5891065a-1b12-45e3-aa54-8008e160677a', 'b48265b5-5df0-4ae3-815d-a0a01cde80f2', '2026-09-24T00:00:00Z', '2026-09-24T20:00:00Z', 'assigned', null, true, 1789726001259, null, '2026-09-19T14:59:44.839754Z'),
  ('50dcf5f3-b29a-4d08-add1-96652ca2ee8a', '5dddc509-791e-4772-837a-4a2cd97c401c', '2026-09-24T00:00:00Z', '2026-09-26T16:00:00Z', 'assigned', null, true, 1789726000808, null, '2026-09-19T14:59:44.839754Z'),
  ('1bf067a8-cacb-41ef-8572-a9456db286c3', '35ecf3a7-903a-4630-b6b8-6a5acb32b709', '2026-09-24T00:00:00Z', '2026-09-26T18:00:00Z', 'assigned', null, true, 1789726002108, null, '2026-09-19T14:59:44.839754Z'),
  ('40b4e4a1-7d1b-4a81-8e01-0a7a44728cc3', 'ec26e426-096a-4e13-a495-0f96d68f4fbc', '2026-09-24T00:00:00Z', '2026-09-26T20:00:00Z', 'assigned', null, true, 1789726001680, null, '2026-09-19T14:59:44.839754Z'),
  ('973ed8d2-226e-40ae-89a6-42c398498c18', 'e85aa943-5b31-4a90-8b15-691244450bec', '2026-09-24T00:00:00Z', '2026-09-27T16:00:00Z', 'assigned', null, true, 1789725999592, null, '2026-09-19T14:59:44.839754Z'),
  ('60a0ade7-21c4-475d-b443-2c883c1c9144', '6266b83c-1bc1-4d02-96c5-9bdd44caad59', '2026-09-24T00:00:00Z', '2026-09-27T18:00:00Z', 'assigned', null, true, 1789726000185, null, '2026-09-19T14:59:44.839754Z'),
  ('b02d1fe5-d2f6-4577-b012-06d49803855c', '432db163-ee21-4bfa-b2ea-199105ff2758', '2026-09-24T00:00:00Z', '2026-09-27T18:00:00Z', 'assigned', null, true, 1789726002892, null, '2026-09-19T14:59:44.839754Z')
) a(id, fixture, original, assigned, status, resolution, counts, version, superseded, created);

-- Six synthetic managers, each with an unlocked GW1 lineup (production: 6/6).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select md5('mirror-user-' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'mirror-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'mirror_manager_' || n), statement_timestamp(), statement_timestamp()
from generate_series(1, 6) n;
insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank,
  team_value, free_transfers)
select md5('mirror-team-' || n)::uuid, md5('mirror-user-' || n)::uuid,
  '5ada3e98-2929-405a-a3f1-a26de8e51933', '7fcb28c5-9b69-4591-bcda-437c6c961c5c',
  'Mirror Team ' || n, 10, 90, 1
from generate_series(1, 6) n;
insert into app.fantasy_lineups (fantasy_team_id, gameweek_id, team_version)
select id, current_gameweek_id, 1 from app.fantasy_teams
where fantasy_season_id = '5ada3e98-2929-405a-a3f1-a26de8e51933';

commit;

select 'mirror loaded: ' || (select count(*) from app.fixtures) || ' fixtures, '
  || (select count(*) from app.fantasy_fixture_assignments) || ' assignments, '
  || (select count(*) from app.fantasy_lineups where locked_at is null) || ' unlocked lineups' as result;
