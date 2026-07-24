-- BotolaGO Fantasy Phase 6 capacity seed.
-- STAGING ONLY. This file is not a migration and is never executed by CI.
--
-- Required session guard:
--   select set_config('botolago.capacity_environment', 'staging-v2', false);
--
-- The seed is deterministic and idempotent. It intentionally leaves passwords
-- unset; the load runner's temporary authentication setup is performed out of
-- band and must never be committed.

do $$
begin
  if current_setting('botolago.capacity_environment', true) <> 'staging-v2' then
    raise exception 'fantasy_capacity_seed_requires_staging_guard';
  end if;
  if exists (
    select 1 from app.fantasy_teams team
    join auth.users account on account.id = team.user_id
    where account.email not like 'fantasy-load-%@staging.botolago.invalid'
  ) then
    raise exception 'fantasy_capacity_seed_refuses_non_load_teams';
  end if;
  if not exists (
    select 1 from app.fantasy_rulesets
    where id = 'f6100000-0000-4000-8000-000000000100'
      and ruleset_code = 'botolago-fantasy-v1.0'
  ) then
    raise exception 'fantasy_ruleset_v1_not_installed';
  end if;
end;
$$;

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('fa000000-0000-4000-8000-000000000001', 'MA', 'MAR')
on conflict (id) do nothing;

insert into app.competitions (
  id, slug, name, short_name, competition_type, country_id, active, display_order
) values (
  'fa100000-0000-4000-8000-000000000001', 'capacity-botola',
  'Capacity Botola', 'CB', 'league',
  'fa000000-0000-4000-8000-000000000001', true, 999
) on conflict (id) do nothing;

insert into app.seasons (
  id, competition_id, label, starts_on, ends_on, status, is_current
) values (
  'fa200000-0000-4000-8000-000000000001',
  'fa100000-0000-4000-8000-000000000001',
  '2089/90 Capacity', '2089-08-01', '2090-06-30', 'active', false
) on conflict (id) do nothing;

insert into app.rounds (id, season_id, round_number, name, status)
values
  ('fa300000-0000-4000-8000-000000000001',
    'fa200000-0000-4000-8000-000000000001', 1, 'Capacity GW1', 'completed'),
  ('fa300000-0000-4000-8000-000000000002',
    'fa200000-0000-4000-8000-000000000001', 2, 'Capacity GW2', 'active')
on conflict (id) do nothing;

insert into app.teams (id, slug, name, short_name, code, country_id, active)
select md5('fantasy-load-club-' || number)::uuid,
  'fantasy-load-club-' || number,
  'Fantasy Load Club ' || number,
  'LC' || lpad(number::text, 2, '0'),
  'L' || lpad(number::text, 2, '0'),
  'fa000000-0000-4000-8000-000000000001', true
from generate_series(1, 20) number
on conflict (id) do nothing;

insert into app.players (
  id, slug, full_name, display_name, position, active
)
select md5('fantasy-load-football-player-' || number)::uuid,
  'fantasy-load-player-' || number,
  'Fantasy Load Player ' || number,
  'Load Player ' || number,
  case
    when number in (1, 2) or number between 16 and 21
      then 'goalkeeper'::app.football_position
    when number between 3 and 7 or number between 22 and 40
      then 'defender'::app.football_position
    when number between 8 and 12 or number between 41 and 59
      then 'midfielder'::app.football_position
    else 'forward'::app.football_position
  end,
  true
from generate_series(1, 72) number
on conflict (id) do nothing;

insert into app.fantasy_competitions (
  id, football_competition_id, slug, name, active
) values (
  'fa600000-0000-4000-8000-000000000001',
  'fa100000-0000-4000-8000-000000000001',
  'capacity-fantasy', 'Capacity Fantasy', true
) on conflict (id) do nothing;

insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at
) values (
  'fa630000-0000-4000-8000-000000000001',
  'fa600000-0000-4000-8000-000000000001',
  'fa200000-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000100',
  '2089/90 Capacity', 'active', '2089-08-01', '2090-06-30'
) on conflict (id) do nothing;

insert into app.fantasy_players (
  id, fantasy_season_id, football_player_id, football_team_id,
  position_id, price, status, eligible, active
)
select md5('fantasy-load-player-' || number)::uuid,
  'fa630000-0000-4000-8000-000000000001',
  md5('fantasy-load-football-player-' || number)::uuid,
  md5('fantasy-load-club-' || (((number - 1) % 20) + 1))::uuid,
  (select id from app.fantasy_positions where code = case
    when number in (1, 2) or number between 16 and 21 then 'GK'
    when number between 3 and 7 or number between 22 and 40 then 'DEF'
    when number between 8 and 12 or number between 41 and 59 then 'MID'
    else 'FWD' end),
  6.0, 'available', true, true
from generate_series(1, 72) number
on conflict (id) do nothing;

insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state, finalized_at
) values
  ('fa640000-0000-4000-8000-000000000001',
    'fa630000-0000-4000-8000-000000000001',
    'fa300000-0000-4000-8000-000000000001', 1, 'Capacity GW1',
    '2089-08-01T10:30:00Z', '2089-08-01T12:00:00Z', '2089-08-08T12:00:00Z',
    'finalized', 'final', '2089-08-09T00:00:00Z'),
  ('fa640000-0000-4000-8000-000000000002',
    'fa630000-0000-4000-8000-000000000001',
    'fa300000-0000-4000-8000-000000000002', 2, 'Capacity GW2',
    '2090-01-01T10:30:00Z', '2090-01-01T12:00:00Z', '2090-01-08T12:00:00Z',
    'open', 'provisional', null)
on conflict (id) do nothing;

-- Capacity data is not a signup workflow. Suppress row triggers for this one
-- trusted set-based insert, then create the exact canonical Identity rows
-- explicitly. The session setting automatically disappears if this script's
-- connection fails before the reset.
set session_replication_role = replica;
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select md5('fantasy-load-user-' || number)::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'fantasy-load-' || number || '@staging.botolago.invalid',
  statement_timestamp(), '', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, statement_timestamp(), statement_timestamp()
from generate_series(1, 50000) number
on conflict (id) do nothing;
set session_replication_role = origin;

insert into app.profiles (id, display_name, preferred_language)
select md5('fantasy-load-user-' || number)::uuid,
  'Load User ' || number, 'fr'
from generate_series(1, 50000) number
on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, created_at, updated_at, id
)
select 'fantasy-load-' || number || '@staging.botolago.invalid',
  md5('fantasy-load-user-' || number)::uuid,
  jsonb_build_object(
    'sub', md5('fantasy-load-user-' || number)::uuid,
    'email', 'fantasy-load-' || number || '@staging.botolago.invalid',
    'email_verified', true
  ),
  'email', statement_timestamp(), statement_timestamp(),
  md5('fantasy-load-identity-' || number)::uuid
from generate_series(1, 50000) number
on conflict (provider_id, provider) do nothing;

insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name,
  bank, team_value, free_transfers, version, status
)
select md5('fantasy-load-team-' || number)::uuid,
  md5('fantasy-load-user-' || number)::uuid,
  'fa630000-0000-4000-8000-000000000001',
  'fa640000-0000-4000-8000-000000000002',
  'Load Team ' || number, 10.0, 90.0, 1, 1, 'active'
from generate_series(1, 50000) number
on conflict (id) do nothing;

insert into app.fantasy_squad_memberships (
  id, fantasy_team_id, fantasy_player_id, purchase_price,
  current_sale_price, acquired_gameweek_id
)
select md5('fantasy-load-membership-' || team_number || '-' || player_number)::uuid,
  md5('fantasy-load-team-' || team_number)::uuid,
  md5('fantasy-load-player-' || player_number)::uuid,
  6.0, 6.0, 'fa640000-0000-4000-8000-000000000001'
from generate_series(1, 50000) team_number
cross join generate_series(1, 15) player_number
on conflict (id) do nothing;

insert into app.fantasy_lineups (
  id, fantasy_team_id, gameweek_id, team_version
)
select md5('fantasy-load-lineup-' || number)::uuid,
  md5('fantasy-load-team-' || number)::uuid,
  'fa640000-0000-4000-8000-000000000002', 1
from generate_series(1, 50000) number
on conflict (id) do nothing;

insert into app.fantasy_lineup_players (
  lineup_id, fantasy_player_id, slot, slot_order,
  captain, vice_captain, multiplier, snapshot_price
)
select md5('fantasy-load-lineup-' || team_number)::uuid,
  md5('fantasy-load-player-' || player_number)::uuid,
  case when player_number in (1,3,4,5,6,9,10,11,12,13,14)
    then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
  case player_number
    when 1 then 1 when 3 then 2 when 4 then 3 when 5 then 4 when 6 then 5
    when 9 then 6 when 10 then 7 when 11 then 8 when 12 then 9 when 13 then 10 when 14 then 11
    when 2 then 1 when 7 then 2 when 8 then 3 when 15 then 4 end,
  player_number = 9, player_number = 13,
  case when player_number = 9 then 2 else 1 end, 6.0
from generate_series(1, 50000) team_number
cross join generate_series(1, 15) player_number
on conflict (lineup_id, fantasy_player_id) do nothing;

insert into app.fantasy_team_gameweek_results (
  id, fantasy_team_id, gameweek_id, starting_points, bench_points,
  captain_points, transfer_hit, provisional_score, final_score,
  state, calculation_version, finalized_at
)
select md5('fantasy-load-result-final-' || number)::uuid,
  md5('fantasy-load-team-' || number)::uuid,
  'fa640000-0000-4000-8000-000000000001',
  35 + (number % 30), 3 + (number % 8), 4 + (number % 10),
  case when number % 7 = 0 then 4 else 0 end,
  45 + (number % 40), 45 + (number % 40),
  'final', 1, '2089-08-09T00:00:00Z'
from generate_series(1, 50000) number
on conflict (id) do nothing;

insert into app.fantasy_team_gameweek_results (
  id, fantasy_team_id, gameweek_id, starting_points, bench_points,
  captain_points, transfer_hit, provisional_score, state, calculation_version
)
select md5('fantasy-load-result-provisional-' || number)::uuid,
  md5('fantasy-load-team-' || number)::uuid,
  'fa640000-0000-4000-8000-000000000002',
  20 + (number % 20), 2 + (number % 6), 2 + (number % 8),
  0, 25 + (number % 30), 'provisional', 1
from generate_series(1, 50000) number
on conflict (id) do nothing;

insert into app.fantasy_transfer_batches (
  id, fantasy_team_id, gameweek_id, idempotency_key,
  base_team_version, resulting_team_version, transfers_count,
  free_transfers_before, free_transfers_used, point_hit,
  bank_before, bank_after, status, confirmed_at
)
select md5('fantasy-load-transfer-batch-' || number)::uuid,
  md5('fantasy-load-team-' || (40000 + number))::uuid,
  'fa640000-0000-4000-8000-000000000001',
  md5('fantasy-load-transfer-idempotency-' || number)::uuid,
  1, 2, 1, 1, 1, 0, 10.0, 10.0, 'confirmed',
  '2089-08-01T10:00:00Z'
from generate_series(1, 5000) number
on conflict (id) do nothing;

insert into app.fantasy_transfers (
  id, transfer_batch_id, sequence_number, player_out_id, player_in_id,
  sale_price, purchase_price
)
select md5('fantasy-load-transfer-' || number)::uuid,
  md5('fantasy-load-transfer-batch-' || number)::uuid,
  1, md5('fantasy-load-player-15')::uuid,
  md5('fantasy-load-player-60')::uuid, 6.0, 6.0
from generate_series(1, 5000) number
on conflict (id) do nothing;

insert into app.fantasy_chip_uses (
  id, fantasy_team_id, gameweek_id, chip_type, chip_rule_id,
  activation_idempotency_key, activated_at, finalized_at
)
select md5('fantasy-load-chip-use-' || number)::uuid,
  md5('fantasy-load-team-' || (46000 + number))::uuid,
  'fa640000-0000-4000-8000-000000000001',
  chip.chip_type, chip.id,
  md5('fantasy-load-chip-idempotency-' || number)::uuid,
  '2089-08-01T09:00:00Z', '2089-08-09T00:00:00Z'
from generate_series(1, 4000) number
join lateral (
  select id, chip_type from app.fantasy_chip_rules
  where ruleset_id = 'f6100000-0000-4000-8000-000000000100'
    and allocation_code = case number % 4
      when 0 then 'wildcard_1'
      when 1 then 'free_hit'
      when 2 then 'bench_boost'
      else 'triple_captain' end
) chip on true
on conflict (id) do nothing;

insert into app.fantasy_chip_uses (
  id, fantasy_team_id, gameweek_id, chip_type, chip_rule_id,
  activation_idempotency_key, activated_at
)
select md5('fantasy-load-free-hit-use-' || number)::uuid,
  md5('fantasy-load-team-' || (45000 + number))::uuid,
  'fa640000-0000-4000-8000-000000000002', 'free_hit',
  'f6200000-0000-4000-8000-000000000103',
  md5('fantasy-load-free-hit-idempotency-' || number)::uuid,
  statement_timestamp()
from generate_series(1, 100) number
on conflict (id) do nothing;

insert into app.fantasy_free_hit_snapshots (
  id, chip_use_id, fantasy_team_id, gameweek_id,
  bank, team_value, free_transfers, team_version
)
select md5('fantasy-load-free-hit-snapshot-' || number)::uuid,
  md5('fantasy-load-free-hit-use-' || number)::uuid,
  md5('fantasy-load-team-' || (45000 + number))::uuid,
  'fa640000-0000-4000-8000-000000000002', 10.0, 90.0, 1, 1
from generate_series(1, 100) number
on conflict (id) do nothing;

insert into app.fantasy_free_hit_snapshot_players (
  snapshot_id, fantasy_player_id, purchase_price, sale_price, acquired_gameweek_id
)
select md5('fantasy-load-free-hit-snapshot-' || team_number)::uuid,
  md5('fantasy-load-player-' || player_number)::uuid,
  6.0, 6.0, 'fa640000-0000-4000-8000-000000000001'
from generate_series(1, 100) team_number
cross join generate_series(1, 15) player_number
on conflict (snapshot_id, fantasy_player_id) do nothing;

insert into app.fantasy_leagues (
  id, fantasy_season_id, owner_user_id, name, visibility,
  member_count, active
) values (
  'fa900000-0000-4000-8000-000000000001',
  'fa630000-0000-4000-8000-000000000001',
  md5('fantasy-load-user-1')::uuid,
  'Capacity League 10000', 'public', 10000, true
) on conflict (id) do nothing;

insert into app.fantasy_league_memberships (
  id, league_id, fantasy_team_id, user_id, role, status
)
select md5('fantasy-load-big-league-member-' || number)::uuid,
  'fa900000-0000-4000-8000-000000000001',
  md5('fantasy-load-team-' || number)::uuid,
  md5('fantasy-load-user-' || number)::uuid,
  case when number = 1 then 'owner'::app.fantasy_league_role
    else 'member'::app.fantasy_league_role end,
  'active'
from generate_series(1, 10000) number
on conflict (id) do nothing;

insert into app.fantasy_leagues (
  id, fantasy_season_id, owner_user_id, name, visibility,
  invite_code_digest, invite_code_hint, member_count, active
)
select md5('fantasy-load-mixed-league-' || league_number)::uuid,
  'fa630000-0000-4000-8000-000000000001',
  md5('fantasy-load-user-' || league_number)::uuid,
  'Mixed Capacity League ' || league_number,
  case when league_number % 3 = 0 then 'private'::app.fantasy_league_visibility
    else 'public'::app.fantasy_league_visibility end,
  case when league_number % 3 = 0 then encode(extensions.digest(
    convert_to('capacity-invite-' || league_number, 'UTF8'), 'sha256'
  ), 'hex') else null end,
  case when league_number % 3 = 0 then upper(substr(md5(league_number::text), 1, 4))
    else null end,
  10 + (league_number % 191), true
from generate_series(1, 1000) league_number
on conflict (id) do nothing;

insert into app.fantasy_league_memberships (
  id, league_id, fantasy_team_id, user_id, role, status
)
select md5('fantasy-load-mixed-member-' || league_number || '-' || member_number)::uuid,
  md5('fantasy-load-mixed-league-' || league_number)::uuid,
  md5('fantasy-load-team-' || case when member_number = 1 then league_number
    else league_number + member_number - 1 end)::uuid,
  md5('fantasy-load-user-' || case when member_number = 1 then league_number
    else league_number + member_number - 1 end)::uuid,
  case when member_number = 1 then 'owner'::app.fantasy_league_role
    else 'member'::app.fantasy_league_role end,
  'active'
from generate_series(1, 1000) league_number
cross join lateral generate_series(1, 10 + (league_number % 191)) member_number
on conflict (id) do nothing;

analyze app.fantasy_teams;
analyze app.fantasy_squad_memberships;
analyze app.fantasy_lineups;
analyze app.fantasy_lineup_players;
analyze app.fantasy_team_gameweek_results;
analyze app.fantasy_transfer_batches;
analyze app.fantasy_leagues;
analyze app.fantasy_league_memberships;

select jsonb_build_object(
  'teams', (select count(*) from app.fantasy_teams),
  'activeSquadMemberships', (select count(*) from app.fantasy_squad_memberships where sold_at is null),
  'currentLineups', (select count(*) from app.fantasy_lineups where gameweek_id = 'fa640000-0000-4000-8000-000000000002'),
  'lineupPlayers', (select count(*) from app.fantasy_lineup_players),
  'largeLeagueMembers', (select count(*) from app.fantasy_league_memberships where league_id = 'fa900000-0000-4000-8000-000000000001'),
  'additionalLeagues', (select count(*) from app.fantasy_leagues where name like 'Mixed Capacity League %'),
  'finalResults', (select count(*) from app.fantasy_team_gameweek_results where state = 'final'),
  'provisionalResults', (select count(*) from app.fantasy_team_gameweek_results where state = 'provisional')
) as capacity_seed_profile;
