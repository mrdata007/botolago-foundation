-- BG-0057 — Deactivate ONE duplicated fantasy player row.
--
-- WHAT THIS IS
--   A single administrative maintenance transaction that sets
--   `app.fantasy_players.active = false, eligible = false` on exactly ONE row,
--   named by its `fantasy_player_id`, and writes one
--   `app_private.admin_audit_events` row recording the change. Nothing else is
--   written: no price, position, status, selected_by_count, price history,
--   squad membership, lineup or football-catalog row is touched, and there is
--   no DELETE anywhere.
--
-- WHY THIS EXISTS
--   The 2026/27 fantasy catalog staging produced several `app.players` rows for
--   the same human being — distinct provider external ids, distinct (or absent)
--   dates of birth, the same club — and the fantasy pricing pass priced each one
--   into `app.fantasy_players`. The pool therefore offers the same footballer two
--   or three times. See docs/engineering/tasks/BG-0057/engineering-brief.yaml for
--   the clusters this was built for and the production evidence behind them.
--
--   Deactivating the wrong row of a cluster is cheap to undo TODAY, while no
--   squad owns any of them, and expensive after launch. That asymmetry is the
--   whole reason this exists now.
--
-- WHY IT IS PARAMETERISED — ONE PLAYER PER RUN
--   The owner is still deciding, cluster by cluster, which row is the real
--   footballer. A hardcoded list would force all of those decisions into one
--   edit of one file, and a mistake in any entry would be committed alongside
--   the correct ones. Instead the body takes ONE `p_fantasy_player_id`, and the
--   operator runs the file once per decided row, reading the review output in
--   between. This is deliberate and must not be "improved" into a batch script.
--
-- GUARDS — the point of this file
--   Every guard RAISES, which rolls the whole transaction back, and every
--   message names exactly what tripped it:
--
--     player_not_found            no app.fantasy_players row with that id.
--     player_owned_by_squad       the player sits in at least one squad whose
--                                 membership has not been sold
--                                 (app.fantasy_squad_memberships.sold_at is
--                                 null). Deactivating it would strand a real
--                                 manager's squad below the legal size.
--     player_has_squad_history    the player was owned at some point (a sold
--                                 membership, a transfer, a free-hit snapshot,
--                                 or an auto-substitution). The row is part of
--                                 somebody's history even if nobody holds it
--                                 now, so it is not a staging artefact.
--     player_has_point_events     the player has scored. A row with point
--                                 events is a scored entity, never a duplicate
--                                 to be retired mid-season.
--     player_has_gameweek_points  the same, via the aggregated table.
--     player_still_selected       selected_by_count is not zero even though no
--                                 membership was found — the two disagree, so
--                                 refuse rather than trust either.
--     write_count_mismatch        post-condition: the single UPDATE did not
--                                 affect exactly one row.
--
--   The ownership guards are evaluated AFTER the target row is taken FOR
--   UPDATE, so a squad save committing between the read and the write cannot
--   sneak an owned player through.
--
-- IDEMPOTENCY
--   If the named row is already `active = false and eligible = false` the body
--   prints `already_applied`, writes nothing — not the fantasy_players row, not
--   an audit row, not even an updated_at bump, because no row is touched — and
--   returns cleanly with `was_updated = false`. Re-running the file is safe.
--
--   A row that is half-applied (exactly one of active/eligible already false)
--   is NOT treated as already applied: the body completes it, so the pair
--   always ends consistent.
--
-- HOW TO RUN
--   Owner / BYPASSRLS session (Supabase SQL editor as the database owner, or
--   psql as `postgres`) — app.fantasy_players carries FORCE ROW LEVEL SECURITY
--   and exposes no per-row UPDATE path to service_role.
--
--   1. Edit the single `select * from pg_temp.bg0057_deactivate_duplicate_player(...)`
--      call below to name the ONE id you have decided to retire.
--   2. Run the whole file.
--   3. Read the RAISE NOTICE output and the review SELECTs at the bottom.
--   4. Only then uncomment and run `commit;`.
--   Anything else ends the session with an implicit ROLLBACK, which is the safe
--   outcome. Repeat from step 1 for the next decided row.
--
-- PARAMETERIZATION
--   The body lives in a SESSION-LOCAL temporary function,
--   `pg_temp.bg0057_deactivate_duplicate_player(...)`. A pg_temp function is
--   never written to the schema catalog beyond the calling session, needs no
--   GRANT/REVOKE bookkeeping, and gives the same body explicit typed arguments
--   so that supabase/tests/database/fantasy_deactivate_duplicate_player.test.sql
--   can point it at synthetic data. This is the same idiom as
--   scripts/backend/football-deactivate-non-current-teams.sql and
--   scripts/backend/fantasy-catalog-restage-maintenance.sql. It performs no
--   schema change and touches no existing migration.

begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ---------------------------------------------------------------------------
-- The maintenance body. Kept byte-for-byte in sync with the copy in
-- supabase/tests/database/fantasy_deactivate_duplicate_player.test.sql —
-- `supabase test db` runs from supabase/tests/database, so a \i of a path
-- under scripts/backend is not reachable from there.
-- ---------------------------------------------------------------------------
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

comment on function pg_temp.bg0057_deactivate_duplicate_player is
  'Session-local (pg_temp) maintenance body for BG-0057. Not a persistent RPC: it exists '
  'only for the calling session and disappears when the session ends. Takes exactly ONE '
  'fantasy_player_id on purpose — see the PARAMETERIZATION note in '
  'scripts/backend/fantasy-deactivate-duplicate-player.sql. Call it under an owner/BYPASSRLS '
  'session and COMMIT only after reviewing its RAISE NOTICE output.';

-- ---------------------------------------------------------------------------
-- Run it. REPLACE the id below with the ONE row you have decided to retire.
--
-- The placeholder below is the all-zero uuid, which matches nothing: running
-- this file UNCHANGED refuses with `player_not_found` and writes nothing. That
-- is intentional — the file must never do something useful by accident.
--
-- The eight candidate rows and the per-cluster keep/drop question are in
-- docs/engineering/tasks/BG-0057/human-actions-section.md.
-- ---------------------------------------------------------------------------
select * from pg_temp.bg0057_deactivate_duplicate_player(
  '00000000-0000-0000-0000-000000000000'::uuid
);

-- ---------------------------------------------------------------------------
-- Review, then COMMIT (or ROLLBACK).
--
-- (a) The whole cluster the retired row belongs to, so the operator can see
--     that exactly one row of it went inactive and the rest are untouched.
-- ---------------------------------------------------------------------------
select
  fantasy_player.id as fantasy_player_id,
  player.display_name,
  player.date_of_birth,
  (
    select string_agg(mapping.provider_name || ':' || mapping.external_id, ' | ')
    from app_private.football_provider_mappings mapping
    where mapping.entity_type = 'player'
      and mapping.internal_entity_id = player.id
  ) as provider_external_id,
  team.name as club,
  fantasy_player.price,
  position.code as position,
  fantasy_player.active,
  fantasy_player.eligible,
  fantasy_player.selected_by_count,
  fantasy_player.updated_at
from app.fantasy_players fantasy_player
join app.players player on player.id = fantasy_player.football_player_id
join app.teams team on team.id = fantasy_player.football_team_id
join app.fantasy_positions position on position.id = fantasy_player.position_id
where (fantasy_player.football_team_id, lower(player.display_name)) in (
  select other_player_row.football_team_id, lower(other_player.display_name)
  from app.fantasy_players other_player_row
  join app.players other_player on other_player.id = other_player_row.football_player_id
  group by other_player_row.football_team_id, lower(other_player.display_name)
  having count(*) > 1
)
order by team.name, player.display_name, fantasy_player.active desc, fantasy_player.id;

-- ---------------------------------------------------------------------------
-- (b) The pool contract. Expect the deactivated row to have LEFT the pool and
--     the count to have dropped by exactly one. api.fantasy_player_pool's
--     signature and ordering are untouched by this script.
-- ---------------------------------------------------------------------------
select
  count(*) filter (where fantasy_player.active) as active_fantasy_players,
  count(*) filter (where fantasy_player.eligible) as eligible_fantasy_players,
  count(*) filter (where not fantasy_player.active) as inactive_fantasy_players
from app.fantasy_players fantasy_player;

-- ---------------------------------------------------------------------------
-- (c) The audit trail this run wrote.
-- ---------------------------------------------------------------------------
select
  audit_event.id,
  audit_event.action,
  audit_event.target_domain,
  audit_event.target_entity_id,
  audit_event.outcome,
  audit_event.environment,
  audit_event.safe_before,
  audit_event.safe_after,
  audit_event.occurred_at
from app_private.admin_audit_events audit_event
where audit_event.action = 'fantasy_catalog.deactivate_duplicate_player'
order by audit_event.occurred_at desc, audit_event.id desc
limit 10;

-- commit;
