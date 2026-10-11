-- Ops health: count adaptive (SofaScore) coverage in `fantasy_fixture_coverage`
-- and `fantasy_scoring`.
--
-- Production football data now comes from SofaScore. Its Fantasy observations
-- are recorded automatically into the adaptive path (20260927094823,
-- 20261011120000); nothing writes
-- app_private.historical_performance_fixture_coverage for them, which is what
-- 20260926003400 / 20260926113100 read to call a finished counted match
-- covered. 20260927094823 already routes both checks through
-- app_private.fantasy_fixture_ready, which answers from the fixture's SELECTED
-- scoring mode. A mode is selected only 12 h after the final whistle
-- (api.service_select_fantasy_scoring_modes), and `fantasy_fixture_coverage`
-- fails when a match is more than 12 h past the whistle without statistics.
-- So an adaptive match whose observation was ready within minutes would still
-- fail the check at 12 h, and page, until the next orchestrator run selected
-- its mode.
--
-- This migration changes only that, in two places and nothing else:
--
--   1. Coverage. A fixture of an adaptive gameweek (fantasy_adaptive_enabled)
--      with no selected mode yet counts as covered when its latest observation
--      is ready (simple_ready or full_ready). Once a mode is selected the
--      answer is still fantasy_fixture_ready's, unchanged. Everything outside
--      adaptive gameweeks is untouched: the legacy answer is passed through.
--   2. Points timing. Adaptive final points cannot exist before the mode
--      cutoff (final whistle + 12 h), so `fantasy_scoring` measures its
--      "statistics complete for N h, no final points" fail clock (8 h) from the
--      later of the certification and that cutoff, for adaptive gameweeks only.
--      Without this, a gameweek whose observations were ready at the whistle
--      would fail at 8 h while the 12 h selection window is by design.
--
-- Output shape is unchanged: same checks, same names, same detail wording.
--
-- How it is applied: the deployed body of the two checks is the
-- 20260926113100 body as patched by 20260927094823, now named
-- app_private.ops_health_checks_before_adaptive (wrapped since by adaptive,
-- account deletion, durable progression and manager card). Like 20260927094823
-- itself, this patches that body from pg_get_functiondef instead of copying it
-- a fifth time, and raises if an expected fragment is not found, so it can
-- never silently patch nothing. The wrappers are not touched.

create or replace function app_private.fantasy_fixture_health_ready(
  p_gameweek_id uuid, p_fixture_id uuid, p_legacy_ready boolean
) returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.fantasy_fixture_ready(p_gameweek_id, p_fixture_id, p_legacy_ready)
    or (
      app_private.fantasy_adaptive_enabled(p_gameweek_id)
      and not exists (
        select 1 from app_private.fantasy_fixture_scoring_modes m
        where m.gameweek_id = p_gameweek_id and m.fixture_id = p_fixture_id and m.mode is not null)
      and coalesce((
        select o.full_ready or o.simple_ready
        from app_private.fantasy_fixture_observations o
        where o.fixture_id = p_fixture_id
        order by o.observed_at desc, o.id desc
        limit 1), false)
    );
$$;
revoke all on function app_private.fantasy_fixture_health_ready(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_fixture_health_ready(uuid, uuid, boolean) is
  'Ops health only: fantasy_fixture_ready, or an adaptive fixture whose mode is not selected yet and whose latest observation is ready. 20261011150000.';

do $adaptive_health_coverage$
declare
  definition text := pg_get_functiondef('app_private.ops_health_checks_before_adaptive()'::regprocedure);
  patched text;
begin
  -- 1. Coverage (three places: coverage, scoring `complete`, scoring `certified_at`).
  patched := replace(definition, 'app_private.fantasy_fixture_ready(g.id,f.id,',
    'app_private.fantasy_fixture_health_ready(g.id,f.id,');
  if patched = definition then
    raise exception 'ops_health_adaptive_coverage: fantasy_fixture_ready fragment not found';
  end if;
  definition := patched;

  -- 2. Points timing: mark adaptive matches, and push their certification to the cutoff.
  patched := replace(definition, 'f.id as fixture_id, f.status::text as fixture_status,',
    'f.id as fixture_id, app_private.fantasy_adaptive_enabled(g.id) as adaptive, f.status::text as fixture_status,');
  if patched = definition then
    raise exception 'ops_health_adaptive_coverage: fixture list fragment not found';
  end if;
  definition := patched;

  patched := replace(definition, 'max(m.certified_at) as statistics_since,',
    'max(greatest(m.certified_at, case when m.adaptive then m.final_at + interval ''12 hours'' end)) as statistics_since,');
  if patched = definition then
    raise exception 'ops_health_adaptive_coverage: statistics_since fragment not found';
  end if;
  definition := patched;

  execute definition;
end
$adaptive_health_coverage$;
