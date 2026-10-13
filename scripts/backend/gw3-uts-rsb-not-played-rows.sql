-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- GW3: record that Haytam Manaout, Mamadou Lamine Camara and Takha Majni did
-- not play in UTS Rabat - RSB Berkane (fixture ac95346b-200c-4c5d-bd1b-c64ceb9fee2d),
-- so GW3 can be finalized. Owner decision 2026-10-13: "they did not play".
--
-- WHY (owner reads of 2026-10-13):
--   * The scoring document lists exactly these three fantasy players as
--     pendingPlayerIds (5524935c-..., dcdb51df-..., df17f9bd-...).
--   * The SofaScore observation already lists all three as verified
--     non-participants: SofaScore says they did not play.
--   * But an older SportsMonks coverage row for this fixture (created
--     2026-10-08) has anonymous_starter_rows = 1. While such a row exists, the
--     scoring document (20260927145230, pending_players) keeps every picked
--     player of the fixture who has no active app.player_fixture_performances
--     row as "participation unknown". These three have none: they did not play.
-- WHAT: one app.player_fixture_performances row each, appeared = false,
--   started = false, minutes 0, every count 0, source 'owner-decision'. Nothing
--   else is written; no existing row is changed. Pépites counts only minutes
--   > 0, so these rows show nowhere. The scoring document then changes, and the
--   next points run prepares a new calculation version by itself (digest).
-- PROOF: after the insert, inside the same transaction, the script recomputes
--   GW3's scoring document and stops (rolling back) unless pendingPlayerIds and
--   pendingFixtures are both empty.
--
-- HOW: pause the writers (scripts/backend/sofascore-held-maintenance-pause.sql),
--   run this whole file (it ends in rollback: a rehearsal), change only the
--   final rollback to commit, run once, then resume
--   (scripts/backend/sofascore-held-maintenance-resume.sql). Any "stop:" means
--   the world is not as read on 2026-10-13: send it, do not edit a check.
-- ============================================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $rows$
declare
  c_gw constant uuid := '0b455d0b-7289-4c93-b237-8f16ce4b159e';
  c_fixture constant uuid := 'ac95346b-200c-4c5d-bd1b-c64ceb9fee2d';
  c_pending constant text[] := array['5524935c-b3d1-493d-aa61-edca38b74281',
    'dcdb51df-2868-4e36-8b59-577fcdfa0d47', 'df17f9bd-fba5-43fd-a013-bea79c4a3950'];
  f app.fixtures%rowtype; doc jsonb; obs jsonb; item record; v_team uuid; v_inserted integer := 0;
begin
  if exists(select 1 from cron.job where active)
    or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled)
    or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
  then raise exception 'stop: production writers must be paused and drained'; end if;

  if (select status::text from app.fantasy_gameweeks where id = c_gw) is distinct from 'provisional' then
    raise exception 'stop: GW3 is not provisional'; end if;
  select * into f from app.fixtures where id = c_fixture;
  if not found or f.status::text <> 'finished' then raise exception 'stop: UTS-RSB is not a finished fixture'; end if;
  if not exists(select 1 from app_private.historical_performance_fixture_coverage
     where fixture_id = c_fixture and source_provider = 'sportsmonks' and anonymous_starter_rows > 0) then
    raise exception 'stop: the SportsMonks coverage row with anonymous starters is gone: re-read pendingPlayerIds first'; end if;

  doc := app_private.fantasy_scoring_input_document(c_gw);
  if (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(doc->'pendingPlayerIds') x)
     is distinct from (select array_agg(x order by x) from unnest(c_pending) x)
    or jsonb_array_length(coalesce(doc->'pendingFixtures', '[]')) <> 0 then
    raise exception 'stop: GW3 pending is not exactly these three players: %', doc->'pendingPlayerIds'; end if;

  select payload into obs from app_private.fantasy_fixture_observations
   where fixture_id = c_fixture order by observed_at desc, id desc limit 1;

  for item in
    select fp.id as fantasy_player_id, p.id as player_id, p.full_name, p.position
      from unnest(c_pending) x(id)
      join app.fantasy_players fp on fp.id::text = x.id
      join app.players p on p.id = fp.football_player_id
  loop
    if not coalesce(obs->'verifiedNonParticipants' ? item.player_id::text, false) then
      raise exception 'stop: SofaScore does not list % as not having played', item.full_name; end if;
    if exists(select 1 from app.player_fixture_performances
       where fixture_id = c_fixture and player_id = item.player_id and active) then
      raise exception 'stop: % already has an active performance row', item.full_name; end if;
    select m.team_id into v_team from app.team_memberships m
     where m.player_id = item.player_id and m.season_id = f.season_id
       and m.team_id in (f.home_team_id, f.away_team_id)
       and m.valid_from <= f.kickoff_at::date and (m.valid_to is null or m.valid_to >= f.kickoff_at::date)
     order by m.active desc limit 1;
    if v_team is null then raise exception 'stop: % has no membership at either club on the match day', item.full_name; end if;

    insert into app.player_fixture_performances(football_season_id, fixture_id, player_id, team_id, position,
      source_provider, source_version, started, appeared, minutes, goals, assists, clean_sheets,
      goals_conceded, saves, penalties_saved, penalties_missed, yellow_cards, red_cards,
      second_yellow_dismissals, own_goals, provider_rating, active, provider_observed_at)
    values (f.season_id, c_fixture, item.player_id, v_team, item.position,
      'owner-decision',
      'owner-decision:' || encode(extensions.digest(c_fixture::text || ':' || item.player_id::text || ':did-not-play', 'sha256'), 'hex'),
      false, false, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, true, statement_timestamp());
    v_inserted := v_inserted + 1;
  end loop;
  if v_inserted <> 3 then raise exception 'stop: expected 3 players, resolved %', v_inserted; end if;

  -- Proof: GW3 now has nothing pending.
  doc := app_private.fantasy_scoring_input_document(c_gw);
  if jsonb_array_length(coalesce(doc->'pendingPlayerIds', '[]')) <> 0
    or jsonb_array_length(coalesce(doc->'pendingFixtures', '[]')) <> 0 then
    raise exception 'stop: GW3 would still not finalize: pending players %, pending fixtures %',
      doc->'pendingPlayerIds', doc->'pendingFixtures'; end if;
  raise notice 'GW3 pending after: none (3 did-not-play rows written)';
end $rows$;

select p.full_name, pf.appeared, pf.minutes, pf.source_provider,
  jsonb_array_length(coalesce(app_private.fantasy_scoring_input_document('0b455d0b-7289-4c93-b237-8f16ce4b159e')->'pendingPlayerIds', '[]')) as gw3_pending_after
from app.player_fixture_performances pf join app.players p on p.id = pf.player_id
where pf.fixture_id = 'ac95346b-200c-4c5d-bd1b-c64ceb9fee2d' and pf.source_provider = 'owner-decision';

-- REHEARSAL: nothing is saved. To apply, change only this line to commit.
rollback;
