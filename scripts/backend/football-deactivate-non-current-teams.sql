-- BG-0043 — Deactivate the football clubs that are not in the current season.
--
-- WHAT THIS IS
--   A single administrative maintenance transaction that sets
--   `app.teams.active = false` on every ACTIVE club that has neither a
--   `app.team_memberships` row nor an `app.fixtures` appearance in the
--   CURRENT season (`app.seasons.is_current`). Nothing else is written: no
--   name, slug, code, colour, crest, membership, fixture, standing or
--   provider mapping is touched, and there is no DELETE anywhere.
--
-- WHY THIS EXISTS
--   `app.teams.active` is a provider-upsert flag with no season semantics:
--   the `team` branch of api.ingest_football_catalog_entity writes
--   active=true on insert and re-asserts it on update
--   (supabase/migrations/20260731180229_gate2b_football_catalog_ingestion.sql),
--   and nothing ever reconciles the complement. The 2024/25 backfill
--   therefore left five relegated clubs active, and
--   api.football_team_catalog — which correctly filters on `active` — offers
--   21 clubs to the news filters, the club pages and the FDR grid instead of
--   the 16 that actually play the 2026/27 season. See
--   docs/engineering/tasks/BG-0043/engineering-brief.yaml.
--
--   This script is the data-only correction (option (a) of the brief). The
--   durable ingestion rule that stops `active` drifting again (option (b))
--   is a separate task and is NOT attempted here.
--
-- GUARDS — the point of this file
--   A script that silently deactivates eleven clubs because a squad import
--   was mid-flight is far worse than one that refuses and asks. Every guard
--   below RAISES, which rolls the whole transaction back, and every message
--   names exactly what tripped it:
--
--     no_current_season          there is no app.seasons row with is_current.
--     unexpected_affected_count  the candidate set is neither the expected
--                                count nor empty — names every candidate.
--     affected_club_has_fantasy_player
--                                a candidate owns app.fantasy_players rows.
--     affected_club_has_current_season_fixture
--                                a candidate appears in a current-season fixture.
--     affected_club_has_current_season_membership
--                                a candidate has a current-season squad row.
--     unexpected_remaining_active_count
--                                post-condition: the surviving active count is
--                                not the expected 16.
--
--   The last three cannot fire given how the candidate set is built; they are
--   re-checked anyway, per row, immediately before the write, so that a
--   concurrent import committing between the SELECT and the UPDATE cannot
--   sneak a participating club through. The candidate rows are taken FOR
--   UPDATE for the same reason.
--
-- IDEMPOTENCY
--   The candidate set only ever contains rows that are still `active`. After
--   a committed run there are no candidates left, so a second run finds zero,
--   prints `already_applied`, writes nothing (not even an updated_at bump,
--   because no row is touched) and returns cleanly. Re-running is safe.
--
-- HOW TO RUN
--   Owner / BYPASSRLS session (Supabase SQL editor as the database owner, or
--   psql as `postgres`) — every app.* table carries FORCE ROW LEVEL SECURITY,
--   so service_role has no path to a raw per-row UPDATE on app.teams.
--   Run the whole file, read the RAISE NOTICE output and the review SELECT at
--   the bottom, and only then uncomment and run `commit;`. Anything else ends
--   the session with an implicit ROLLBACK, which is the safe outcome.
--
-- PARAMETERIZATION
--   The body lives in a SESSION-LOCAL temporary function,
--   `pg_temp.bg0043_deactivate_non_current_teams(...)`. A pg_temp function is
--   never written to the schema catalog beyond the calling session, needs no
--   GRANT/REVOKE bookkeeping, and gives the same body explicit typed
--   arguments so that supabase/tests/database/
--   football_deactivate_non_current_teams.test.sql can point it at synthetic
--   data. This is the same idiom as
--   scripts/backend/fantasy-catalog-restage-maintenance.sql. It performs no
--   schema change and touches no existing migration.

begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ---------------------------------------------------------------------------
-- The maintenance body. Kept byte-for-byte in sync with the copy in
-- supabase/tests/database/football_deactivate_non_current_teams.test.sql —
-- `supabase test db` runs from supabase/tests/database, so a \i of a path
-- under scripts/backend is not reachable from there.
-- ---------------------------------------------------------------------------
create function pg_temp.bg0043_deactivate_non_current_teams(
  p_expected_affected_count integer,
  p_expected_remaining_active_count integer
)
returns table (team_id uuid, team_name text, was_updated boolean)
language plpgsql
as $$
declare
  v_current_seasons uuid[];
  v_candidates integer;
  v_offenders text;
  v_updated integer;
  v_remaining integer;
begin
  -- 1. The current season(s). No current season means the whole notion of
  --    "not in the competition" is undefined: refuse rather than guess.
  select coalesce(array_agg(season.id), '{}'::uuid[])
  into v_current_seasons
  from app.seasons season
  where season.is_current;

  if cardinality(v_current_seasons) = 0 then
    raise exception 'bg0043 refused: no_current_season — app.seasons holds no row with is_current = true, so non-participation cannot be determined';
  end if;

  raise notice 'bg0043: current season(s): %', v_current_seasons;

  -- 2. Candidate set: ACTIVE clubs with no squad row and no fixture in any
  --    current season.
  -- (a re-call in the same session/transaction — the pgTAP suite does this —
  -- must not trip over the previous call's temp table)
  if to_regclass('pg_temp.bg0043_candidates') is not null then
    drop table bg0043_candidates;
  end if;
  create temporary table bg0043_candidates on commit drop as
  select team.id, team.name
  from app.teams team
  where team.active
    and not exists (
      select 1 from app.team_memberships membership
      where membership.team_id = team.id
        and membership.season_id = any (v_current_seasons)
    )
    and not exists (
      select 1 from app.fixtures fixture
      where fixture.season_id = any (v_current_seasons)
        and team.id in (fixture.home_team_id, fixture.away_team_id)
    );

  select count(*) into v_candidates from bg0043_candidates;

  -- 2b. Lock the candidate rows so a concurrent import cannot make a candidate
  --     current between the read above and the UPDATE below; the guards in
  --     steps 5-6 are re-evaluated after this lock is held.
  perform 1 from app.teams team
  where team.id in (select candidate.id from bg0043_candidates candidate)
  for update;

  -- 3. Idempotency: a committed run leaves nothing to do.
  if v_candidates = 0 then
    select count(*) into v_remaining from app.teams where active;
    raise notice 'bg0043: already_applied — no active club is outside the current season; % clubs remain active, nothing written', v_remaining;
    if v_remaining <> p_expected_remaining_active_count then
      raise exception 'bg0043 refused: unexpected_remaining_active_count — expected % active clubs, found %', p_expected_remaining_active_count, v_remaining;
    end if;
    return;
  end if;

  -- 4. Guard: the affected count must be exactly what was reviewed.
  if v_candidates <> p_expected_affected_count then
    select string_agg(format('%s (%s)', candidate.name, candidate.id), ', ' order by candidate.name)
    into v_offenders from bg0043_candidates candidate;
    raise exception 'bg0043 refused: unexpected_affected_count — expected % clubs, found %: %. Production drifted (a squad or fixture import may be mid-flight); re-run the review query and get the new list approved instead of loosening this guard.',
      p_expected_affected_count, v_candidates, v_offenders;
  end if;

  -- 5. Guard: no candidate may own a fantasy player.
  select string_agg(format('%s (%s): %s fantasy player row(s)', candidate.name, candidate.id, player.count), ', ' order by candidate.name)
  into v_offenders
  from bg0043_candidates candidate
  join lateral (
    select count(*) as count from app.fantasy_players fantasy_player
    where fantasy_player.football_team_id = candidate.id
  ) player on player.count > 0;

  if v_offenders is not null then
    raise exception 'bg0043 refused: affected_club_has_fantasy_player — %. Deactivating a club that is priced into a fantasy season would strand its players.', v_offenders;
  end if;

  -- 6. Guard: re-checked per row immediately before the write.
  select string_agg(format('%s (%s)', candidate.name, candidate.id), ', ' order by candidate.name)
  into v_offenders
  from bg0043_candidates candidate
  where exists (
    select 1 from app.fixtures fixture
    where fixture.season_id = any (v_current_seasons)
      and candidate.id in (fixture.home_team_id, fixture.away_team_id)
  );
  if v_offenders is not null then
    raise exception 'bg0043 refused: affected_club_has_current_season_fixture — %', v_offenders;
  end if;

  select string_agg(format('%s (%s)', candidate.name, candidate.id), ', ' order by candidate.name)
  into v_offenders
  from bg0043_candidates candidate
  where exists (
    select 1 from app.team_memberships membership
    where membership.team_id = candidate.id
      and membership.season_id = any (v_current_seasons)
  );
  if v_offenders is not null then
    raise exception 'bg0043 refused: affected_club_has_current_season_membership — %', v_offenders;
  end if;

  -- 7. Print the affected clubs BEFORE the write, so the operator sees the
  --    exact list even if a later guard rolls everything back.
  select string_agg(format('%s (%s)', candidate.name, candidate.id), E'\n  - ' order by candidate.name)
  into v_offenders from bg0043_candidates candidate;
  raise notice E'bg0043: about to deactivate % club(s):\n  - %', v_candidates, v_offenders;

  -- 8. The single write. Scoped to the exact candidate ids, never a broad
  --    predicate. The teams_set_updated_at trigger bumps updated_at on the
  --    changed rows only.
  update app.teams team
  set active = false
  from bg0043_candidates candidate
  where team.id = candidate.id
    and team.active is distinct from false;
  get diagnostics v_updated = row_count;

  if v_updated <> v_candidates then
    raise exception 'bg0043 refused: write_count_mismatch — % candidates but % rows updated', v_candidates, v_updated;
  end if;

  -- 9. Post-condition.
  select count(*) into v_remaining from app.teams where active;
  if v_remaining <> p_expected_remaining_active_count then
    raise exception 'bg0043 refused: unexpected_remaining_active_count — expected % active clubs after the write, found %', p_expected_remaining_active_count, v_remaining;
  end if;

  raise notice 'bg0043: deactivated % club(s); % clubs remain active', v_updated, v_remaining;

  return query
  select candidate.id, candidate.name, true from bg0043_candidates candidate order by candidate.name;
end;
$$;

comment on function pg_temp.bg0043_deactivate_non_current_teams is
  'Session-local (pg_temp) maintenance body for BG-0043. Not a persistent RPC: it exists '
  'only for the calling session and disappears when the session ends. Call it under an '
  'owner/BYPASSRLS session and COMMIT only after reviewing its RAISE NOTICE output.';

-- ---------------------------------------------------------------------------
-- Run it. Parameters reviewed against production on 2026-09-21:
--   5 clubs affected (Chabab Mohammédia, JS Soualem, Olympic Safi,
--   Olympique Dcheïra, Yacoub El Mansour), 16 clubs remaining active.
-- ---------------------------------------------------------------------------
select * from pg_temp.bg0043_deactivate_non_current_teams(5, 16);

-- ---------------------------------------------------------------------------
-- Review, then COMMIT (or ROLLBACK). Expect 16 active / 5 inactive, and the
-- catalog to offer exactly 16 clubs.
-- ---------------------------------------------------------------------------
select team.id, team.name, team.active, team.updated_at
from app.teams team
order by team.active desc, team.name;

select
  count(*) filter (where team.active) as active_clubs,
  count(*) filter (where not team.active) as inactive_clubs,
  jsonb_array_length(api.football_team_catalog('fr', 100)) as catalog_entries
from app.teams team;

-- commit;
