-- Read only (one select, changes nothing). Why do GW3 matches still have no Fantasy statistics?
-- Run in Supabase -> BotolaGO Production V2 -> SQL Editor.
-- One row per GW3 match: SofaScore automatic-path status and last reason, latest observation
-- and whether it is ready, and the scoring mode chosen. Matches without a ready observation
-- come first.
select
  g.status::text as gameweek_status,
  f.id as fixture_id,
  f.status::text as fixture_status,
  f.kickoff_at,
  a.status as auto_status,
  a.attempts,
  a.last_attempt_at,
  a.next_retry_at,
  a.last_outcome,
  a.last_blockers,
  o.observed_at as latest_observation_at,
  o.full_ready,
  o.simple_ready,
  m.mode as selected_mode,
  m.selected_at,
  m.reason as mode_reason
from app.fantasy_gameweeks g
join app.fantasy_seasons s on s.id = g.fantasy_season_id
join app_private.fantasy_fixture_scoring_modes m on m.gameweek_id = g.id
join app.fixtures f on f.id = m.fixture_id
left join app_private.sofascore_fantasy_attempts a on a.fixture_id = f.id
left join lateral (
  select observed_at, full_ready, simple_ready
  from app_private.fantasy_fixture_observations
  where fixture_id = f.id
  order by observed_at desc, id desc
  limit 1
) o on true
where g.sequence_number = 3
  and s.status::text in ('registration_open', 'active')
order by (coalesce(o.full_ready, false) or coalesce(o.simple_ready, false)), f.kickoff_at;
