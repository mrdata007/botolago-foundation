-- Scoring proof: the synthetic world (docs/backend/SCORING_PROOF_STAGING.md).
--
-- STAGING OR LOCAL ONLY. Refuses to run unless the caller sets
--   select set_config('botolago.scoring_proof_environment', 'staging', true);  -- or 'local'
-- in the same transaction, and refuses a database that holds it already.
-- Every id starts with fb5c0000-; every name says "Scoring Proof".
--
-- 6 clubs of 11 (club 3 has a 12th player who does not play), 3 finished
-- matches in one gameweek, adaptive scoring active, 4 managers in one league:
--   A plain captain   B captain did not play (vice-captain, one automatic substitution)
--   C triple captain  D bench boost
-- Match 1 is recorded later through the reconciled ingestion (its 22 players are
-- reviewed identities on both providers, made here through the real review
-- workflow); matches 2 and 3 are recorded later as reviewed corrections.

do $$
begin
  if coalesce(current_setting('botolago.scoring_proof_environment', true), '') not in ('staging', 'local') then
    raise exception 'scoring_proof_requires_staging_or_local';
  end if;
  if exists (select 1 from app.competitions where id = 'fb5c0000-0000-4000-8000-c00000000002') then
    raise exception 'scoring_proof_world_already_present';
  end if;
end $$;

create function pg_temp.pid(p_kind text, n integer) returns uuid language sql immutable as $$
  select ('fb5c0000-0000-4000-8000-' || p_kind || lpad(n::text, 12 - length(p_kind), '0'))::uuid
$$;
-- club of player n (1..66 = 6 clubs x 11, 67 = club 3's 12th) and position by place in the club
create function pg_temp.club(n integer) returns integer language sql immutable as
  $$ select case when n = 67 then 3 else (n - 1) / 11 + 1 end $$;
create function pg_temp.pos(n integer) returns text language sql immutable as $$
  select case when n = 67 then 'midfielder' else case (n - 1) % 11
    when 0 then 'goalkeeper' when 1 then 'defender' when 2 then 'defender' when 3 then 'defender' when 4 then 'defender'
    when 5 then 'midfielder' when 6 then 'midfielder' when 7 then 'midfielder' when 8 then 'midfielder'
    else 'forward' end end
$$;

-- Football
insert into app.countries (id, iso_alpha2, iso_alpha3)
select pg_temp.pid('c', 1), 'MA', 'MAR' where not exists (select 1 from app.countries where iso_alpha2 = 'MA');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.pid('c', 2), 'scoring-proof', 'Scoring Proof', 'SPF', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.pid('c', 3), pg_temp.pid('c', 2), 'Scoring Proof', '2026-08-01', '2027-06-30', 'active', false);
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.pid('c', 4), pg_temp.pid('c', 3), 1, 'Scoring Proof R1', 'completed');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.pid('d', c), 'scoring-proof-club-' || c, 'Scoring Proof Club ' || c, 'SP' || c, 'SP' || c,
  (select id from app.countries where iso_alpha2 = 'MA') from generate_series(1, 6) c;
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.pid('e', n), 'scoring-proof-player-' || n, 'Scoring Proof Player ' || n, 'SPP ' || n,
  pg_temp.pos(n)::app.football_position from generate_series(1, 67) n;
insert into app.team_memberships (player_id, team_id, season_id, valid_from, shirt_number)
select pg_temp.pid('e', n), pg_temp.pid('d', pg_temp.club(n)), pg_temp.pid('c', 3), '2026-08-01',
  case when n = 67 then 12 else (n - 1) % 11 + 1 end from generate_series(1, 67) n;
-- 1: club 1 2-1 club 2   2: club 3 0-0 club 4   3: club 5 1-0 club 6
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  home_score, away_score, provider_updated_at, source_sequence, finalized_at)
select pg_temp.pid('f', m), pg_temp.pid('c', 2), pg_temp.pid('c', 3), pg_temp.pid('c', 4),
  pg_temp.pid('d', 2 * m - 1), pg_temp.pid('d', 2 * m), '2026-08-20 18:00Z', 'finished',
  (array[2, 0, 1])[m], (array[1, 0, 0])[m], '2026-08-20 20:00Z', 10, '2026-08-20 20:00Z'
from generate_series(1, 3) m;

-- Fantasy
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.pid('c', 5), pg_temp.pid('c', 2), 'scoring-proof', 'Scoring Proof', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
values (pg_temp.pid('c', 6), pg_temp.pid('c', 5), pg_temp.pid('c', 3), 'f6100000-0000-4000-8000-000000000100',
  'Scoring Proof', 'active', '2026-08-01', '2027-06-30');
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at, ends_at, status)
values (pg_temp.pid('c', 7), pg_temp.pid('c', 6), pg_temp.pid('c', 4), 1, 'Scoring Proof GW1',
  '2026-08-20 16:30Z', '2026-08-20 18:00Z', '2026-08-21 12:00Z', 'provisional');
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, frozen_at, source_version)
select pg_temp.pid('c', 6), pg_temp.pid('f', m), pg_temp.pid('c', 7), pg_temp.pid('c', 7),
  '2026-08-20 18:00Z', '2026-08-20 18:00Z', '2026-08-20 16:30Z', 1 from generate_series(1, 3) m;
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
select pg_temp.pid('ae', n), pg_temp.pid('c', 6), pg_temp.pid('e', n), pg_temp.pid('d', pg_temp.club(n)), pos.id, 5
from generate_series(1, 67) n join app.fantasy_positions pos on pos.code = case pg_temp.pos(n)
  when 'goalkeeper' then 'GK' when 'defender' then 'DEF' when 'midfielder' then 'MID' else 'FWD' end;

-- Managers (no password: they cannot sign in) and their teams.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.pid('a', t), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'scoring-proof-' || t || '@staging.botolago.invalid', '', now(), '{}',
  jsonb_build_object('username', 'scoring_proof_' || t), now(), now() from generate_series(1, 5) t;
insert into app.profiles (id, display_name, created_at)
select pg_temp.pid('a', t), 'Scoring Proof ' || chr(64 + t), now() from generate_series(1, 4) t
on conflict (id) do update set display_name = excluded.display_name;
insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers)
select pg_temp.pid('b', t), pg_temp.pid('a', t), pg_temp.pid('c', 6), pg_temp.pid('c', 7),
  'Scoring Proof ' || chr(64 + t), 25, 75, 1 from generate_series(1, 4) t;

-- Squads: (team, player, slot order: 1-11 starters, 12-15 bench in order, captain, vice).
create temporary table proof_squad (team integer, player integer, ord integer, captain boolean, vice boolean) on commit drop;
insert into proof_squad
select t, player, ord, player = cap, player = vice
from (values (1, 6, 50), (3, 54, 6), (4, 6, 50)) teams(t, cap, vice),
  unnest(array[23, 2, 24, 46, 35, 6, 50, 28, 61, 10, 54, 12, 39, 22, 57]) with ordinality as s(player, ord)
union all
select 2, player, ord, player = 67, player = 51
from unnest(array[34, 25, 36, 47, 13, 67, 51, 7, 62, 11, 65, 1, 17, 33, 58]) with ordinality as s(player, ord);
insert into app.fantasy_squad_memberships (fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id)
select pg_temp.pid('b', team), pg_temp.pid('ae', player), 5, 5, pg_temp.pid('c', 7) from proof_squad;
insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version, locked_at)
select pg_temp.pid('af', t), pg_temp.pid('b', t), pg_temp.pid('c', 7), 1, '2026-08-20 16:30Z' from generate_series(1, 4) t;
insert into app.fantasy_lineup_players (lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, snapshot_price)
select pg_temp.pid('af', team), pg_temp.pid('ae', player),
  case when ord <= 11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
  case when ord <= 11 then ord else ord - 11 end, captain, vice, 5 from proof_squad;
insert into app.fantasy_chip_uses (fantasy_team_id, gameweek_id, chip_type, activation_idempotency_key, activated_at)
values (pg_temp.pid('b', 3), pg_temp.pid('c', 7), 'triple_captain', pg_temp.pid('bd', 3), '2026-08-20 12:00Z'),
       (pg_temp.pid('b', 4), pg_temp.pid('c', 7), 'bench_boost', pg_temp.pid('bd', 4), '2026-08-20 12:00Z');
insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility, invite_code_digest, invite_code_hint)
values (pg_temp.pid('be', 1), pg_temp.pid('c', 6), pg_temp.pid('a', 1), 'Scoring Proof League', 'private',
  encode(extensions.digest('scoring-proof-league-not-joinable', 'sha256'), 'hex'), 'SPRF');
insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role, status)
select pg_temp.pid('be', 1), pg_temp.pid('b', t), pg_temp.pid('a', t),
  (case when t = 1 then 'owner' else 'member' end)::app.fantasy_league_role, 'active' from generate_series(1, 4) t;

-- Adaptive scoring for this season only.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_activate_adaptive_scoring(pg_temp.pid('c', 6), 1,
  api.service_adaptive_scoring_audit(pg_temp.pid('c', 7)) ->> 'activationDigest');

-- Reviewed identities for match 1 (players 1-22), through the real review workflow:
-- provider candidates recorded by the collector, one combined proposal per player,
-- approved and executed by a staff operator (user 5) at aal2.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.pid('bf', 1), pg_temp.pid('a', 5), 'TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at) values (pg_temp.pid('bf', 2), pg_temp.pid('a', 5), now());
insert into app_private.staff_principals (auth_user_id) values (pg_temp.pid('a', 5));
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select sp.id, r.id, 'Scoring proof operator (synthetic, staging only).'
from app_private.staff_principals sp, app_private.admin_roles r
where sp.auth_user_id = pg_temp.pid('a', 5) and r.name = 'football_operator';

select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
  'provider', p.provider, 'externalPlayerId', p.prefix || case when n <= 11 then 'h' || n else 'a' || (n - 11) end,
  'providerTeamId', 'proof-' || p.provider || '-' || pg_temp.club(n), 'clubKey', 'scoring-proof-club-' || pg_temp.club(n),
  'appTeamId', pg_temp.pid('d', pg_temp.club(n)), 'squadCompleteness', 'COMPLETE', 'registeredTeamDisagreement', false,
  'shirtNumber', (n - 1) % 11 + 1, 'positionSignal', upper(left(pg_temp.pos(n), 1)), 'dobState', 'missing',
  'displayName', 'Scoring Proof Provider ' || n)))
from generate_series(1, 22) n cross join (values ('sofascore', 'proof-s-'), ('flashscore', 'proof-f-')) p(provider, prefix);

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.pid('a', 5), 'role', 'authenticated',
  'aal', 'aal2', 'session_id', pg_temp.pid('bf', 2))::text, true);
select api.admin_football_mapping_propose((select jsonb_agg(jsonb_build_object('kind', 'map',
    'sofascoreCandidateId', (select id from app_private.football_player_mapping_candidates
      where provider_name = 'sofascore' and external_id = 'proof-s-' || case when n <= 11 then 'h' || n else 'a' || (n - 11) end),
    'flashscoreCandidateId', (select id from app_private.football_player_mapping_candidates
      where provider_name = 'flashscore' and external_id = 'proof-f-' || case when n <= 11 then 'h' || n else 'a' || (n - 11) end),
    'appPlayerId', pg_temp.pid('e', n), 'basis', 'manual') order by n) from generate_series(1, 22) n),
  'Scoring proof: synthetic identities for the staging scoring test.', gen_random_uuid());
do $$ declare p record; begin
  for p in select pr.id, pr.fingerprint from app_private.football_player_mapping_proposals pr
           join app_private.football_player_mapping_candidates c on c.id = pr.sofascore_candidate_id
           where pr.status = 'pending' and c.external_id like 'proof-s-%' order by pr.id loop
    perform api.admin_football_mapping_decide(p.id, 'approve', 'Scoring proof: synthetic identity approved.', p.fingerprint, false, gen_random_uuid());
    perform api.admin_football_mapping_execute(p.id, gen_random_uuid());
  end loop;
end $$;

select jsonb_build_object(
  'players', (select count(*) from app.players where id::text like 'fb5c0000-%'),
  'fixtures', (select count(*) from app.fixtures where id::text like 'fb5c0000-%'),
  'teams', (select count(*) from app.fantasy_teams where id::text like 'fb5c0000-%'),
  'reviewedMappings', (select count(*) from app_private.football_provider_mappings m
    where m.external_id like 'proof-%' and m.active and (app_private.football_mapping_supporting_state(m.id) ->> 'reviewed')::boolean),
  'adaptive', app_private.fantasy_adaptive_enabled(pg_temp.pid('c', 7))) as scoring_proof_world;
