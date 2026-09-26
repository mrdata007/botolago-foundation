-- BG-0057 — scripts/backend/fantasy-deactivate-duplicate-player.sql
--
-- Exercises the guarded one-player deactivation end-to-end against a synthetic
-- catalog shaped like production's real problem: a three-row duplicate cluster
-- at one club (the Coulibaly shape), a two-row cluster at another (the
-- Boukhanfer shape), and a single non-duplicated player that must never be
-- touched — plus every shape that must NOT be deactivated silently: a player
-- held by an active squad, a player with squad history only, a player with
-- point events, a player with aggregated gameweek points, and a player whose
-- selected_by_count disagrees with app.fantasy_squad_memberships.
--
-- The maintenance body below is kept byte-for-byte in sync with
-- scripts/backend/fantasy-deactivate-duplicate-player.sql. `supabase test db`
-- runs from supabase/tests/database, so a \i / \ir of a path under
-- scripts/backend is not reachable from here — the same constraint (and the
-- same remedy) as supabase/tests/database/football_deactivate_non_current_teams.test.sql.
--
-- Scenario isolation: the body targets ONE id, so scenarios do not collide the
-- way BG-0043's global candidate set does. Each write-scenario still runs
-- inside its own savepoint and rolls back to it, so the fixture is identical at
-- the start of every section and the assertions can quote absolute counts.
begin;

-- The plan is declared, not deferred, and that is forced by the savepoints
-- this file relies on.
--
-- pgTAP numbers each test from a temp SEQUENCE, which `rollback to savepoint`
-- does not touch, so the emitted `ok N` lines stay correct and ascending. But
-- it also records how many tests it has run in the `__tcache__` temp TABLE,
-- and that write is ordinary transactional state, so every
-- `rollback to savepoint` below rewinds the counter while the TAP lines
-- already sent to the client remain sent.
--
-- Under `no_plan()`, finish() emits `1..<that counter>`. With nine rolled-back
-- scenarios the counter ends at 13 while 31 tests have actually run, and
-- pg_prove fails the file with "You planned 13 tests but ran 31" — no
-- assertion having failed. Declaring the plan up front emits `1..31` before
-- the first savepoint exists, where nothing can rewind it.
--
-- Adding or removing an assertion means updating this number. That is the
-- intended trade: if the two disagree, pg_prove fails the file loudly instead
-- of quietly accepting a short run.
select extensions.plan(31);

-- =====================================================================
-- FIXTURE
-- =====================================================================
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('d7000000-0000-4000-8000-000000000001', 'MA', 'MAR');

insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('d7100000-0000-4000-8000-000000000001', 'bg0057-league', 'BG0057 League', 'B57',
  'league', 'd7000000-0000-4000-8000-000000000001');

insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('d7200000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001',
  '2089/90', '2089-08-01', '2090-06-30', 'active', true);

insert into app.rounds (id, season_id, round_number, name, status)
values ('d7300000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
  1, 'Gameweek 1', 'active');

-- Two clubs: club 1 carries the three-row cluster, club 2 the two-row cluster.
insert into app.teams (id, slug, name, short_name, code, country_id)
select ('d74' || lpad(club_number::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid,
  'bg0057-club-' || club_number, 'BG0057 Club ' || club_number,
  'B57C' || club_number, 'D' || lpad(club_number::text, 2, '0'),
  'd7000000-0000-4000-8000-000000000001'
from generate_series(1, 5) club_number;

-- 20 distinct app.players rows. Players 1-3 share one display name (the
-- three-row cluster), players 4-5 share another (the two-row cluster), the rest
-- are distinct.
insert into app.players (id, slug, full_name, display_name, position)
select ('d75' || lpad(player_number::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid,
  'bg0057-player-' || player_number,
  'BG0057 Player ' || player_number,
  case
    when player_number <= 3 then 'Abdoulaye Cluster'
    when player_number <= 5 then 'Abdallah Pair'
    else 'BG0057 Unique ' || player_number
  end,
  case when player_number <= 2 then 'goalkeeper'::app.football_position
    when player_number <= 7 then 'defender'::app.football_position
    when player_number <= 12 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 20) player_number;
-- Dates of birth are written only by the attribute resolver, from
-- observations (20260926060000). Player 2 has none.
do $$
begin
  perform app_private.record_player_attribute_observation(
    ('d75' || lpad(player_number::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid,
    'date_of_birth', make_date(1990 + player_number, 1, 1)::text, null,
    'provider', 'sportsmonks', 'test-fixture', '2026-01-01T00:00:00Z')
  from generate_series(1, 20) player_number
  where player_number <> 2;
  perform app_private.resolve_player_attributes(array(
    select ('d75' || lpad(player_number::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid
    from generate_series(1, 20) player_number));
end;
$$;

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('d7600000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001',
  'bg0057-fantasy', 'BG0057 Fantasy', true);

insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('d7630000-0000-4000-8000-000000000001', 'd7600000-0000-4000-8000-000000000001',
  'd7200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  '2089/90', 'active', '2089-08-01', '2090-06-30');

insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status
) values ('d7640000-0000-4000-8000-000000000001', 'd7630000-0000-4000-8000-000000000001',
  'd7300000-0000-4000-8000-000000000001', 1, 'Gameweek 1',
  '2090-01-01T11:00:00Z', '2090-01-01T12:00:00Z', '2090-01-08T12:00:00Z', 'open');

-- The fantasy pool. Cluster rows 1-3 all sit at club 1; cluster rows 4-5 both
-- sit at club 2. Everything else is spread across clubs 3-5.
insert into app.fantasy_players (
  id, fantasy_season_id, football_player_id, football_team_id, position_id, price
)
select ('d77' || lpad(player_number::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid,
  'd7630000-0000-4000-8000-000000000001',
  ('d75' || lpad(player_number::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('d74' || lpad((case
      when player_number <= 3 then 1
      when player_number <= 5 then 2
      else 3 + (player_number % 3)
    end)::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid,
  (select id from app.fantasy_positions where code = case
    when player_number <= 2 then 'GK' when player_number <= 7 then 'DEF'
    when player_number <= 12 then 'MID' else 'FWD' end),
  6
from generate_series(1, 20) player_number;

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d7800000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bg0057-owner@example.test', statement_timestamp(), 'hash',
    '{}', '{"username":"bg0057_owner"}', statement_timestamp(), statement_timestamp());

select extensions.is(
  (select count(*)::integer from app.fantasy_players where active and eligible),
  20,
  'fixture: all 20 synthetic fantasy players start active and eligible'
);

select extensions.is(
  (select count(*)::integer from app.fantasy_squad_memberships),
  0,
  'fixture: no squad owns anything yet — the production precondition this script relies on'
);

-- ---------------------------------------------------------------------
-- Maintenance body — SYNCED COPY of scripts/backend/fantasy-deactivate-duplicate-player.sql
-- ---------------------------------------------------------------------
create function pg_temp.bg0057_deactivate_duplicate_player(
  p_fantasy_player_id uuid,
  p_reason text default 'BG-0057 roster hygiene: retire a duplicated fantasy player row staged for the 2026/27 catalog.'
)
returns table (
  fantasy_player_id uuid,
  display_name text,
  club_name text,
  was_updated boolean,
  audit_event_id bigint
)
language plpgsql
as $$
declare
  v_player record;
  v_active_squads integer;
  v_sold_squads integer;
  v_transfers integer;
  v_free_hit integer;
  v_auto_subs integer;
  v_point_events integer;
  v_gameweek_points integer;
  v_updated integer;
  v_audit_id bigint;
  v_offenders text;
begin
  -- 1. Resolve the target and LOCK it. Everything below is evaluated with the
  --    row held, so a concurrent squad save cannot change the answer between
  --    the guards and the write.
  select
    fantasy_player.id,
    fantasy_player.active,
    fantasy_player.eligible,
    fantasy_player.status,
    fantasy_player.price,
    fantasy_player.selected_by_count,
    fantasy_player.football_player_id,
    fantasy_player.football_team_id,
    fantasy_player.position_id
  into v_player
  from app.fantasy_players fantasy_player
  where fantasy_player.id = p_fantasy_player_id
  for update;

  if not found then
    raise exception 'bg0057 refused: player_not_found — app.fantasy_players holds no row with id %. Check the id against the review query in the human-actions section before re-running.', p_fantasy_player_id;
  end if;

  -- 2. Ownership guards. Each one is a separate, separately named refusal, so
  --    the operator learns WHICH kind of attachment blocked the retirement.
  select count(*) into v_active_squads
  from app.fantasy_squad_memberships squad_membership
  where squad_membership.fantasy_player_id = p_fantasy_player_id
    and squad_membership.sold_at is null;

  if v_active_squads > 0 then
    select string_agg(format('%s (%s)', fantasy_team.name, fantasy_team.id), ', ' order by fantasy_team.name)
    into v_offenders
    from app.fantasy_squad_memberships squad_membership
    join app.fantasy_teams fantasy_team on fantasy_team.id = squad_membership.fantasy_team_id
    where squad_membership.fantasy_player_id = p_fantasy_player_id
      and squad_membership.sold_at is null;

    raise exception 'bg0057 refused: player_owned_by_squad — fantasy player % is held by % active squad(s): %. Deactivating an owned player would leave those squads below the legal size; resolve the ownership first, or retire the OTHER row of the cluster.',
      p_fantasy_player_id, v_active_squads, v_offenders;
  end if;

  select count(*) into v_sold_squads
  from app.fantasy_squad_memberships squad_membership
  where squad_membership.fantasy_player_id = p_fantasy_player_id;

  select count(*) into v_transfers
  from app.fantasy_transfers transfer
  where p_fantasy_player_id in (transfer.player_in_id, transfer.player_out_id);

  select count(*) into v_free_hit
  from app.fantasy_free_hit_snapshot_players snapshot_player
  where snapshot_player.fantasy_player_id = p_fantasy_player_id;

  select count(*) into v_auto_subs
  from app.fantasy_auto_substitutions auto_substitution
  where p_fantasy_player_id in (auto_substitution.player_in_id, auto_substitution.player_out_id);

  if v_sold_squads > 0 or v_transfers > 0 or v_free_hit > 0 or v_auto_subs > 0 then
    raise exception 'bg0057 refused: player_has_squad_history — fantasy player % carries squad_memberships=%, transfers=%, free_hit_snapshot_players=%, auto_substitutions=%. A row somebody has already owned or traded is not a staging duplicate; it must not be retired by this script.',
      p_fantasy_player_id, v_sold_squads, v_transfers, v_free_hit, v_auto_subs;
  end if;

  -- 3. Scoring guards. A row that has scored is a live scored entity.
  select count(*) into v_point_events
  from app.fantasy_player_point_events point_event
  where point_event.fantasy_player_id = p_fantasy_player_id;

  if v_point_events > 0 then
    raise exception 'bg0057 refused: player_has_point_events — fantasy player % has % point event(s). A scored player is never a duplicate to retire; re-check which row of the cluster is the real footballer.',
      p_fantasy_player_id, v_point_events;
  end if;

  select count(*) into v_gameweek_points
  from app.fantasy_player_gameweek_points gameweek_points
  where gameweek_points.fantasy_player_id = p_fantasy_player_id;

  if v_gameweek_points > 0 then
    raise exception 'bg0057 refused: player_has_gameweek_points — fantasy player % has % gameweek point row(s). A scored player is never a duplicate to retire.',
      p_fantasy_player_id, v_gameweek_points;
  end if;

  -- 4. Consistency guard: the denormalised counter must agree with the
  --    membership table. If they disagree, neither is trustworthy — refuse.
  if v_player.selected_by_count <> 0 then
    raise exception 'bg0057 refused: player_still_selected — fantasy player % reports selected_by_count = % but no squad membership was found. The counter and app.fantasy_squad_memberships disagree; investigate before retiring anything.',
      p_fantasy_player_id, v_player.selected_by_count;
  end if;

  -- 5. Idempotency. Fully applied already: say so, write nothing.
  if v_player.active is false and v_player.eligible is false then
    raise notice 'bg0057: already_applied — fantasy player % is already active=false, eligible=false; nothing written', p_fantasy_player_id;

    return query
    select
      v_player.id,
      player.display_name,
      team.name,
      false,
      null::bigint
    from app.players player, app.teams team
    where player.id = v_player.football_player_id
      and team.id = v_player.football_team_id;
    return;
  end if;

  -- 6. Print the target BEFORE the write, so the operator sees exactly which
  --    row was about to change even if a later guard rolls everything back.
  select format('%s (%s) — club %s, price %s, position %s, active=%s, eligible=%s',
    player.display_name, v_player.id, team.name, v_player.price, position.code,
    v_player.active, v_player.eligible)
  into v_offenders
  from app.players player, app.teams team, app.fantasy_positions position
  where player.id = v_player.football_player_id
    and team.id = v_player.football_team_id
    and position.id = v_player.position_id;

  raise notice 'bg0057: about to deactivate %', v_offenders;

  -- 7. The single write. Scoped to the exact id, never a predicate over a
  --    name or a club. The fantasy_players_set_updated_at trigger bumps
  --    updated_at on this row only.
  update app.fantasy_players fantasy_player
  set active = false,
      eligible = false
  where fantasy_player.id = p_fantasy_player_id
    and (fantasy_player.active is distinct from false
         or fantasy_player.eligible is distinct from false);
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    raise exception 'bg0057 refused: write_count_mismatch — expected exactly 1 updated row for %, got %', p_fantasy_player_id, v_updated;
  end if;

  -- 8. The audit row, through the repository's existing administrative audit
  --    writer. actor_principal_id is null: this is an owner-run maintenance
  --    transaction, not an admin-console action by a staff principal, and the
  --    writer records that faithfully (empty roles/permissions).
  select app_private.write_admin_audit(
    p_actor_principal_id => null,
    p_action             => 'fantasy_catalog.deactivate_duplicate_player',
    p_target_domain      => 'fantasy',
    p_target_entity_id   => p_fantasy_player_id,
    p_reason             => p_reason,
    p_request_id         => gen_random_uuid(),
    p_correlation_id     => gen_random_uuid(),
    p_approval_id        => null,
    p_safe_before        => jsonb_build_object(
                              'active', v_player.active,
                              'eligible', v_player.eligible,
                              'status', v_player.status,
                              'selectedByCount', v_player.selected_by_count
                            ),
    p_safe_after         => jsonb_build_object(
                              'active', false,
                              'eligible', false,
                              'status', v_player.status,
                              'selectedByCount', v_player.selected_by_count
                            ),
    p_outcome            => 'succeeded'::app_private.admin_audit_outcome,
    p_error_code         => null,
    p_synthetic_test     => false
  ) into v_audit_id;

  raise notice 'bg0057: deactivated fantasy player %; audit event id %', p_fantasy_player_id, v_audit_id;

  return query
  select
    v_player.id,
    player.display_name,
    team.name,
    true,
    v_audit_id
  from app.players player, app.teams team
  where player.id = v_player.football_player_id
    and team.id = v_player.football_team_id;
end;
$$;

-- Shared fixture for the ownership scenarios: one fantasy team and one
-- fixture, both created once so each savepoint starts from the same state.
insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
) values ('d7900000-0000-4000-8000-000000000001', 'd7800000-0000-4000-8000-000000000001',
  'd7630000-0000-4000-8000-000000000001', 'd7640000-0000-4000-8000-000000000001',
  'BG0057 Owner XI', 10, 100, 1);

insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, provider_updated_at, source_sequence
) values ('d7a00000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001',
  'd7200000-0000-4000-8000-000000000001',
  'd7400001-0000-4000-8000-000000000001', 'd7400002-0000-4000-8000-000000000001',
  '2090-01-02T18:00:00Z', '2090-01-02T20:00:00Z', 1);

-- =====================================================================
-- 1. HAPPY PATH — exactly the one named row of the three-row cluster is
--    retired. The other two rows of the same cluster, and every other
--    player in the pool, are untouched.
-- =====================================================================
savepoint bg0057_happy;

select extensions.is(
  (select was_updated from pg_temp.bg0057_deactivate_duplicate_player(
    'd7700002-0000-4000-8000-000000000001'::uuid)),
  true,
  'happy path: the body reports the named row as updated'
);

select extensions.ok(
  (select not active and not eligible from app.fantasy_players
   where id = 'd7700002-0000-4000-8000-000000000001'),
  'happy path: the named row is now active = false AND eligible = false'
);

select extensions.ok(
  (select bool_and(active and eligible) from app.fantasy_players
   where id in ('d7700001-0000-4000-8000-000000000001',
                'd7700003-0000-4000-8000-000000000001')),
  'happy path: the other two rows of the same cluster are left alone'
);

select extensions.is(
  (select count(*)::integer from app.fantasy_players where active and eligible),
  19,
  'happy path: exactly one row left the pool — 19 of 20 remain active and eligible'
);

select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'fantasy_catalog.deactivate_duplicate_player'
     and target_entity_id = 'd7700002-0000-4000-8000-000000000001'
     and target_domain = 'fantasy'
     and outcome = 'succeeded'),
  1,
  'happy path: exactly one audit row is written, naming the retired player'
);

select extensions.is(
  (select safe_before ->> 'active' || '/' || (safe_after ->> 'active')
   from app_private.admin_audit_events
   where action = 'fantasy_catalog.deactivate_duplicate_player'
     and target_entity_id = 'd7700002-0000-4000-8000-000000000001'),
  'true/false',
  'happy path: the audit row records the before and after state of `active`'
);

-- 2. IDEMPOTENCE — a second run on the same id reports already_applied,
--    writes nothing, and does not raise.
select extensions.is(
  (select was_updated from pg_temp.bg0057_deactivate_duplicate_player(
    'd7700002-0000-4000-8000-000000000001'::uuid)),
  false,
  'second run: the already-deactivated row reports was_updated = false instead of erroring'
);

select extensions.is(
  (select audit_event_id from pg_temp.bg0057_deactivate_duplicate_player(
    'd7700002-0000-4000-8000-000000000001'::uuid)),
  null::bigint,
  'second run: no audit row is written for a no-op'
);

select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'fantasy_catalog.deactivate_duplicate_player'),
  1,
  'second run: the audit table still holds exactly the one row from the first run'
);

select extensions.is(
  (select count(*)::integer from app.fantasy_players where active and eligible),
  19,
  'second run: the active/eligible count is unchanged'
);

rollback to savepoint bg0057_happy;

select extensions.is(
  (select count(*)::integer from app.fantasy_players where active and eligible),
  20,
  'rollback to savepoint restores all 20 players to active and eligible'
);

-- =====================================================================
-- 3. HALF-APPLIED ROW — a row with exactly one of active/eligible already
--    false is completed rather than reported as already applied. The pair
--    must never be left inconsistent.
-- =====================================================================
savepoint bg0057_half_applied;

update app.fantasy_players set eligible = false
where id = 'd7700004-0000-4000-8000-000000000001';

select extensions.is(
  (select was_updated from pg_temp.bg0057_deactivate_duplicate_player(
    'd7700004-0000-4000-8000-000000000001'::uuid)),
  true,
  'half-applied: a row that is already ineligible but still active is completed, not skipped'
);

select extensions.ok(
  (select not active and not eligible from app.fantasy_players
   where id = 'd7700004-0000-4000-8000-000000000001'),
  'half-applied: both flags end false'
);

rollback to savepoint bg0057_half_applied;

-- =====================================================================
-- 4. NOT FOUND — an id that matches nothing refuses. This is what running
--    the script file UNCHANGED does, by design.
-- =====================================================================
savepoint bg0057_not_found;

select extensions.throws_ok(
  $$select * from pg_temp.bg0057_deactivate_duplicate_player('00000000-0000-0000-0000-000000000000'::uuid)$$,
  'bg0057 refused: player_not_found — app.fantasy_players holds no row with id 00000000-0000-0000-0000-000000000000. Check the id against the review query in the human-actions section before re-running.',
  'not found: the all-zero placeholder in the shipped file refuses and names the id'
);

select extensions.is(
  (select count(*)::integer from app.fantasy_players where active and eligible),
  20,
  'not found: nothing was written'
);

rollback to savepoint bg0057_not_found;

-- =====================================================================
-- 5. ACTIVE-OWNERSHIP GUARD — a player held by a squad whose membership has
--    not been sold refuses, and the message names the squad.
-- =====================================================================
savepoint bg0057_owned;

insert into app.fantasy_squad_memberships (
  fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id
) values ('d7900000-0000-4000-8000-000000000001', 'd7700002-0000-4000-8000-000000000001',
  6, 6, 'd7640000-0000-4000-8000-000000000001');

select extensions.throws_ok(
  $$select * from pg_temp.bg0057_deactivate_duplicate_player('d7700002-0000-4000-8000-000000000001'::uuid)$$,
  'bg0057 refused: player_owned_by_squad — fantasy player d7700002-0000-4000-8000-000000000001 is held by 1 active squad(s): BG0057 Owner XI (d7900000-0000-4000-8000-000000000001). Deactivating an owned player would leave those squads below the legal size; resolve the ownership first, or retire the OTHER row of the cluster.',
  'ownership guard: an owned player refuses and names the squad that holds it'
);

select extensions.ok(
  (select active and eligible from app.fantasy_players
   where id = 'd7700002-0000-4000-8000-000000000001'),
  'ownership guard: the refusal rolled the write back — the player is still active and eligible'
);

select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'fantasy_catalog.deactivate_duplicate_player'),
  0,
  'ownership guard: no audit row is written for a refusal'
);

rollback to savepoint bg0057_owned;

-- =====================================================================
-- 6. SQUAD-HISTORY GUARD — a SOLD membership still blocks. The row was part
--    of somebody's squad once, so it is not a staging artefact.
-- =====================================================================
savepoint bg0057_history;

insert into app.fantasy_squad_memberships (
  fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price,
  acquired_gameweek_id, sold_gameweek_id, sold_at
) values ('d7900000-0000-4000-8000-000000000001', 'd7700003-0000-4000-8000-000000000001',
  6, 6, 'd7640000-0000-4000-8000-000000000001', 'd7640000-0000-4000-8000-000000000001',
  statement_timestamp());

select extensions.throws_ok(
  $$select * from pg_temp.bg0057_deactivate_duplicate_player('d7700003-0000-4000-8000-000000000001'::uuid)$$,
  'bg0057 refused: player_has_squad_history — fantasy player d7700003-0000-4000-8000-000000000001 carries squad_memberships=1, transfers=0, free_hit_snapshot_players=0, auto_substitutions=0. A row somebody has already owned or traded is not a staging duplicate; it must not be retired by this script.',
  'history guard: a sold membership still refuses and reports every attachment count'
);

select extensions.ok(
  (select active and eligible from app.fantasy_players
   where id = 'd7700003-0000-4000-8000-000000000001'),
  'history guard: nothing was written'
);

rollback to savepoint bg0057_history;

-- =====================================================================
-- 7. POINT-EVENTS GUARD — a scored player is never a duplicate to retire.
-- =====================================================================
savepoint bg0057_points;

insert into app.fantasy_player_point_events (
  fantasy_player_id, gameweek_id, fixture_id, category, points,
  scoring_version, source_sequence, source_key
) values ('d7700001-0000-4000-8000-000000000001', 'd7640000-0000-4000-8000-000000000001',
  'd7a00000-0000-4000-8000-000000000001', 'appearance', 2, 1, 1, 'bg0057-source-1');

select extensions.throws_ok(
  $$select * from pg_temp.bg0057_deactivate_duplicate_player('d7700001-0000-4000-8000-000000000001'::uuid)$$,
  'bg0057 refused: player_has_point_events — fantasy player d7700001-0000-4000-8000-000000000001 has 1 point event(s). A scored player is never a duplicate to retire; re-check which row of the cluster is the real footballer.',
  'points guard: a player with point events refuses and names the count'
);

select extensions.ok(
  (select active and eligible from app.fantasy_players
   where id = 'd7700001-0000-4000-8000-000000000001'),
  'points guard: nothing was written'
);

rollback to savepoint bg0057_points;

-- =====================================================================
-- 8. GAMEWEEK-POINTS GUARD — the aggregated table blocks independently of
--    the event table, so a finalized-then-compacted player is still safe.
-- =====================================================================
savepoint bg0057_gw_points;

insert into app.fantasy_player_gameweek_points (
  fantasy_player_id, gameweek_id, provisional_points, minutes_played, did_play,
  calculation_version, football_input_version
) values ('d7700005-0000-4000-8000-000000000001', 'd7640000-0000-4000-8000-000000000001',
  4, 90, true, 1, 1);

select extensions.throws_ok(
  $$select * from pg_temp.bg0057_deactivate_duplicate_player('d7700005-0000-4000-8000-000000000001'::uuid)$$,
  'bg0057 refused: player_has_gameweek_points — fantasy player d7700005-0000-4000-8000-000000000001 has 1 gameweek point row(s). A scored player is never a duplicate to retire.',
  'gameweek-points guard: the aggregated table refuses on its own'
);

rollback to savepoint bg0057_gw_points;

-- =====================================================================
-- 9. SELECTED-BY-COUNT GUARD — the denormalised counter and the membership
--    table disagree. Trust neither; refuse.
-- =====================================================================
savepoint bg0057_selected;

update app.fantasy_players set selected_by_count = 3
where id = 'd7700002-0000-4000-8000-000000000001';

select extensions.throws_ok(
  $$select * from pg_temp.bg0057_deactivate_duplicate_player('d7700002-0000-4000-8000-000000000001'::uuid)$$,
  'bg0057 refused: player_still_selected — fantasy player d7700002-0000-4000-8000-000000000001 reports selected_by_count = 3 but no squad membership was found. The counter and app.fantasy_squad_memberships disagree; investigate before retiring anything.',
  'selected-by-count guard: a non-zero counter with no membership refuses'
);

select extensions.ok(
  (select active and eligible from app.fantasy_players
   where id = 'd7700002-0000-4000-8000-000000000001'),
  'selected-by-count guard: nothing was written'
);

rollback to savepoint bg0057_selected;

-- =====================================================================
-- 10. READ SURFACE — api.fantasy_player_pool must stop offering the retired
--     row. This is the whole point of the operation. The function's
--     signature and ordering are NOT touched by BG-0057; only its output
--     shrinks by one.
-- =====================================================================
savepoint bg0057_pool;

select extensions.is(
  jsonb_array_length(
    api.fantasy_player_pool('d7630000-0000-4000-8000-000000000001', null, null, null, null, null, null, 100)
      -> 'items'
  ),
  20,
  'pool: all 20 players are offered before the retirement'
);

select extensions.is(
  (select was_updated from pg_temp.bg0057_deactivate_duplicate_player(
    'd7700002-0000-4000-8000-000000000001'::uuid)),
  true,
  'pool: the retirement runs'
);

select extensions.is(
  jsonb_array_length(
    api.fantasy_player_pool('d7630000-0000-4000-8000-000000000001', null, null, null, null, null, null, 100)
      -> 'items'
  ),
  19,
  'pool: api.fantasy_player_pool offers 19 players afterwards — the retired row is gone'
);

select extensions.ok(
  not exists (
    select 1
    from jsonb_array_elements(
      api.fantasy_player_pool('d7630000-0000-4000-8000-000000000001', null, null, null, null, null, null, 100)
        -> 'items'
    ) pool_entry
    where pool_entry ->> 'id' = 'd7700002-0000-4000-8000-000000000001'
  ),
  'pool: the retired id is specifically absent from the pool payload'
);

rollback to savepoint bg0057_pool;

-- Re-sync pgTAP's rolled-back run counter before finishing.
--
-- The declared plan above is what pg_prove parses, so the file already passes
-- without this. But finish() also compares the plan against that rewound
-- counter, and would print "Looks like you planned 31 tests but ran 13" on a
-- fully passing run — a false alarm in the CI log, which is worse than no
-- message. The sequence that numbered the tests is the honest count, because
-- rollback does not touch it, so finish() is given that instead.
--
-- This does not hide a real failure. pg_prove decides pass/fail from the
-- `ok`/`not ok` lines themselves, which are emitted as each test runs and
-- cannot be rolled back.
--
-- Wrapped in a DO block on purpose: `_set` returns the value it set, and a
-- bare `select` of it would print a stray `31` into the middle of the TAP
-- stream. A DO block returns nothing, so the output stays clean.
do $resync$
begin
  perform extensions._set('curr_test'::text, currval('__tresults___numb_seq')::integer);
end;
$resync$;

select * from extensions.finish();
rollback;
