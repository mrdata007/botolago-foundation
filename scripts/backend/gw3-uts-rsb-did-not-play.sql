-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Fantasy GW3 (0b455d0b-7289-4c93-b237-8f16ce4b159e): record the OWNER-CONFIRMED
-- fact that Haytam Manaout, Mamadou Lamine Camara (RSB Berkane) and Takha Majni
-- (UTS Rabat) did not play in UTS Rabat - RSB Berkane
-- (fixture ac95346b-200c-4c5d-bd1b-c64ceb9fee2d, football season
-- d03223b0-8f4a-4309-93e1-2a708d7c3584), so the gameweek can finalize.
--
-- OWNER DECISION (2026-10-13). The owner states: "they did not play". This
-- script records that statement and nothing else about them: participation
-- only (0 minutes, did not appear). No goal, card, assist or any other
-- statistic is invented, and no other player or fixture is touched.
--
-- WHY THESE THREE BLOCK THE GAMEWEEK (read from the code on main).
--   GW3 is 'provisional'; every fixture is ready. The lifecycle worker still
--   returns remaining_fixtures_pending because the scoring document lists
--   pendingPlayerIds = exactly these three fantasy players, and
--   api.service_begin_fantasy_finalization refuses while that list is not
--   empty (20260927140000_incremental_fantasy_points.sql:134-146).
--
--   A fantasy player is pending when he is in a LOCKED lineup and any of three
--   things holds (20260927145230_fantasy_live_participation_scope.sql:40-51):
--     (1) his fixture is not eligible     -> it would be in pendingFixtures;
--                                            that list is empty. Not this.
--     (2) the gameweek is adaptive and his entry has participationKnown <> true
--                                         -> lines 43.
--     (3) the fixture's coverage row (app_private.historical_performance_
--         fixture_coverage, written only by the old SportsMonks path) says
--         anonymous_starter_rows > 0 and he has no active
--         app.player_fixture_performances row     -> lines 44-47.
--   Cause (3) cannot arise for a fixture of an adaptive gameweek: the adaptive
--   SportsMonks wrapper and the SofaScore recorder write no coverage row
--   (20260927094823_adaptive_fantasy_scoring.sql:632-670;
--   20261011180000_sofascore_player_performances.sql:57 "coverage table is not
--   written"). The script still prints the coverage figure, so if it is ever
--   the cause the final proof below fails and rolls everything back.
--   That leaves (2). How participationKnown is built for a squad member who is
--   not in the observation's rows (20260927120659_adaptive_reviewed_estimates.sql
--   :223-248): a squad member is "known absent" only when the LATEST observation
--   has participationComplete AND lists his player id in verifiedNonParticipants
--   or estimatedNonParticipants (lines 234-236). Then his stats are 0 minutes
--   with 'verified' evidence and participationKnown is true (line 247). Anyone
--   else gets empty evidence, so participationKnown is false.
--   The SofaScore recorder derives that list ONCE, at the moment of recording,
--   as "every squad member with a membership covering the kickoff date who is
--   not in the rows" (20261012120000_sofascore_hands_off.sql:219-228, same
--   query in 20261011120000/20261011190000). So a squad member is pending for
--   exactly one reason: the UTS - RSB observation (recorded 2026-10-12 12:00)
--   does not carry his id in verifiedNonParticipants, while the scoring
--   document, which recomputes membership today, includes him because his
--   membership covers the kickoff date now. The observation is a snapshot; the
--   membership test is live. The script prints, per player, the membership
--   dates and created/updated timestamps next to the observation timestamp, so
--   the rehearsal itself shows which side moved.
--   (Why this did not make the observation "not ready": the recorder only
--   marks core facts incomplete for a lineup player whose fantasy_players row
--   names one of the two clubs and who is neither in the rows nor in the lists,
--   20261003180000:143-148. Fantasy rows that name another club escape that
--   check but are included by the document, which reads memberships.)
--
-- CHOSEN MECHANISM (existing, reviewed, no guard weakened).
--   api.service_record_fantasy_observation(fixture, payload, 'reviewed-correction'),
--   the path scripts/backend/adaptive-corrections.ts prepares documents for. The
--   payload is the LATEST observation's payload with exactly these changes:
--     verifiedNonParticipants  + the player ids that need it
--     expectedDigest           = the latest observation's digest (the recorder
--                                refuses a correction built on a stale one)
--     reason, reviewer         = the owner statement and the staff user
--     references               + 'owner-confirmed:gw3-uts-rsb-did-not-play:2026-10-13'
--   Every row, statistic, evidence, score and flag stays byte-identical (the
--   script proves it). The recorder, for a provisional gameweek, still checks:
--   fixture finished, adaptive on, gameweek not finalizing/finalized, no sealed
--   snapshot, final score, 22 starters, memberships, and that each listed
--   player is a member of one of the two clubs on the kickoff date and is in
--   no row (20261003180000:56-66, 89-95, 100-165). Readiness is recomputed from
--   the same payload, so full_ready / simple_ready stay true; the fixture's
--   scoring mode row stays 'full' (modes are selected once, not by new
--   observations: 20260927094823:187-222), and a new observation bumps the
--   gameweek's scoring_input_version (trigger adaptive_observation_changed,
--   20260927094823:615-624) so the worker prepares a new calculation version
--   from the new digest (api.service_prepare_fantasy_live_scoring).
--   Consequences to know:
--     * A later SofaScore re-recording of this fixture returns the correction
--       unchanged ('reviewedOverride', 20261003180000:96-99), so the owner's
--       fact is not overwritten.
--     * api.service_sync_sofascore_player_performances (Pépites rows) only
--       derives rows from a 'provider-reconciled' newest observation
--       (20261011180000:172-173, 343). The 22 rows already written for this
--       fixture stay active and untouched; no new row is derived from a
--       correction. The player rows of this fixture do not change.
--     * The two other derived non-participants of this fixture (squad members
--       23/24-style spares) keep 0 minutes and 'verified' evidence, but their
--       evidence now cites the correction's reason, references and time; the
--       script proves their statistics did not change.
--     * Fantasy's published points of GW3 do not change by this write: it adds
--       knowledge for three players who score 0 either way; it lifts the
--       "participation unknown" hold (no substitution or captain promotion can
--       be decided while a lineup member's participation is unknown).
--   A direct table write was NOT used: nothing needs one.
--
-- WHAT THIS SCRIPT CHECKS BEFORE WRITING (stop = the world is not as assumed;
-- never edit a check to get past one).
--   OWNER_EMAIL is an active staff member; production writers are paused
--   (no active cron job, live refresh off, lifecycle tick off); GW3 is
--   'provisional', has live scoring and adaptive scoring on, no sealed snapshot;
--   the fixture is UTS - RSB and finished; each of the three resolves to exactly
--   one player by full name with an active current-season membership at one of
--   the two clubs (Manaout and Camara at the same club, Majni at the other),
--   covering the kickoff date, with exactly one fantasy player; the fixture's
--   scoring mode is 'full'; the latest observation is ready, none of the three is
--   in its rows or already in its non-participant lists; Manaout's SofaScore id
--   1095727 appears NOWHERE in the observation payload (if it does, SofaScore
--   says he appeared: stop) and is mapped to him; the document's pending players
--   are exactly the three and pendingFixtures is empty.
-- AFTER THE WRITE, in the same transaction, it recomputes
--   app_private.fantasy_scoring_input_document(GW3) and raises (rolling back)
--   unless pendingPlayerIds AND pendingFixtures are empty and the document still
--   passes app_private.fantasy_validate_scoring_document (what
--   service_prepare_fantasy_live_scoring runs). It also proves the new
--   observation changes only the listed fields, is ready, is the latest, the
--   three now read as verified 0-minute non-participants, everyone else's
--   statistics are unchanged, and the only table footprint is ONE new row in
--   app_private.fantasy_fixture_observations.
--
-- HOW TO RUN (owner, as database owner in the SQL editor).
--   1. Check GitHub production workflows and in-flight Edge responses; pause the
--      writers: scripts/backend/sofascore-held-maintenance-pause.sql (rehearse,
--      verify the rollback held, then commit it). AGENTS.md "One writer at a
--      time" applies: nothing else writes to this database meanwhile.
--   2. Replace PASTE-OWNER-EMAIL below with your staff email.
--   3. Run this whole file as it is: it ends in rollback (a rehearsal). Read
--      the final result row: nothing is saved, but it shows what WOULD be
--      written and the recomputed pending lists (both empty).
--   4. Change only the final `rollback;` to `commit;` and run the file once.
--   5. Resume the writers: scripts/backend/sofascore-held-maintenance-resume.sql.
--      The lifecycle tick then prepares the new calculation version and
--      finalizes GW3.
-- ============================================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create temporary table gw3_dnp_result (summary jsonb) on commit drop;

-- A cheap before/after footprint of the tables this could conceivably touch.
create function pg_temp.gw3_dnp_footprint() returns jsonb language sql as $fp$
  select jsonb_build_object(
    'observations', (select count(*) from app_private.fantasy_fixture_observations),
    'otherFixtureObservations', (select coalesce(md5(string_agg(o.fixture_id::text || ':' || o.id::text, ',' order by o.id)), '')
        from app_private.fantasy_fixture_observations o where o.fixture_id <> 'ac95346b-200c-4c5d-bd1b-c64ceb9fee2d'),
    'performances', (select coalesce(md5(string_agg(p.id::text || ':' || p.active::text || ':' || p.updated_at::text, ',' order by p.id)), '')
        from app.player_fixture_performances p),
    'scoringSnapshots', (select count(*) from app_private.fantasy_scoring_snapshots),
    'pointEvents', (select count(*) from app.fantasy_player_point_events),
    'memberships', (select coalesce(md5(string_agg(m.id::text || ':' || m.valid_from::text || ':' || coalesce(m.valid_to::text, '') || ':' || m.active::text, ',' order by m.id)), '')
        from app.team_memberships m),
    'fixtures', (select coalesce(md5(string_agg(f.id::text || ':' || f.status::text || ':' || coalesce(f.home_score, -1)::text || ':' || coalesce(f.away_score, -1)::text || ':' || coalesce(f.finalized_at::text, ''), ',' order by f.id)), '')
        from app.fixtures f),
    'scoringModes', (select coalesce(md5(string_agg(m.gameweek_id::text || ':' || m.fixture_id::text || ':' || coalesce(m.mode, ''), ',' order by m.gameweek_id, m.fixture_id)), '')
        from app_private.fantasy_fixture_scoring_modes m),
    'fantasyPlayers', (select coalesce(md5(string_agg(p.id::text || ':' || p.active::text || ':' || p.football_team_id::text, ',' order by p.id)), '')
        from app.fantasy_players p)
  )
$fp$;

do $dnp$
declare
  c_owner_email constant text := 'PASTE-OWNER-EMAIL';
  c_fixture constant uuid := 'ac95346b-200c-4c5d-bd1b-c64ceb9fee2d';
  c_gameweek constant uuid := '0b455d0b-7289-4c93-b237-8f16ce4b159e';
  c_season constant uuid := 'd03223b0-8f4a-4309-93e1-2a708d7c3584';
  c_sofascore_manaout constant text := '1095727';
  c_names constant text[] := array['Haytam Manaout', 'Mamadou Lamine Camara', 'Takha Majni'];
  c_reference constant text := 'owner-confirmed:gw3-uts-rsb-did-not-play:2026-10-13';
  v_user uuid;
  f app.fixtures%rowtype;
  g app.fantasy_gameweeks%rowtype;
  o app_private.fantasy_fixture_observations%rowtype;
  n app_private.fantasy_fixture_observations%rowtype;
  v_mode text;
  i integer;
  v_cnt integer; v_teams integer;
  v_player uuid[] := '{}'; v_team uuid[] := '{}'; v_fp uuid[] := '{}';
  v_pid uuid; v_tid uuid; v_fpid uuid;
  v_in_rows boolean; v_listed boolean; v_valid boolean; v_known text; v_locked boolean;
  v_entry jsonb; v_mem record;
  v_diag jsonb := '[]'::jsonb;
  v_need uuid[] := '{}';
  v_already integer := 0;
  d0 jsonb; d1 jsonb; v_list jsonb; v_payload jsonb; v_res jsonb;
  v_pending0 text[]; v_expected text[];
  fp_before jsonb; fp_after jsonb;
  v_coverage_anon integer;
  v_strip text[] := array['verifiedNonParticipants', 'expectedDigest', 'reason', 'reviewer', 'references'];
begin
  -- 0. Owner and writers ---------------------------------------------------
  if c_owner_email = 'PASTE-OWNER-EMAIL' then raise exception 'stop: fill in OWNER_EMAIL'; end if;
  select u.id into v_user from auth.users u
    join app_private.staff_principals sp on sp.auth_user_id = u.id and sp.status = 'active'
   where lower(u.email) = lower(c_owner_email);
  if v_user is null then raise exception 'stop: OWNER_EMAIL is not an active staff member'; end if;
  if exists(select 1 from cron.job where active)
    or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled)
    or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
  then raise exception 'stop: production writers must be paused and drained'; end if;

  -- 1. The world is the one described -------------------------------------
  select * into f from app.fixtures where id = c_fixture;
  if not found or f.season_id is distinct from c_season or f.status <> 'finished' or f.finalized_at is null then
    raise exception 'stop: the fixture is not the finished UTS - RSB match of the football season'; end if;
  select * into g from app.fantasy_gameweeks where id = c_gameweek for update;
  if not found or g.status <> 'provisional' then
    raise exception 'stop: GW3 is not provisional (status %)', coalesce(g.status::text, 'missing'); end if;
  if not exists(select 1 from app.fantasy_fixture_assignments a
       where a.gameweek_id = c_gameweek and a.fixture_id = c_fixture and a.superseded_at is null and a.counts_points)
    or not app_private.fantasy_live_scoring_enabled(c_gameweek)
    or not app_private.fantasy_adaptive_enabled(c_gameweek) then
    raise exception 'stop: the fixture is not a counting fixture of GW3, or live/adaptive scoring is off'; end if;
  if exists(select 1 from app_private.fantasy_scoring_snapshots s where s.gameweek_id = c_gameweek and s.sealed_at is not null) then
    raise exception 'stop: a sealed scoring snapshot exists for GW3'; end if;
  select m.mode into v_mode from app_private.fantasy_fixture_scoring_modes m
   where m.gameweek_id = c_gameweek and m.fixture_id = c_fixture;
  if v_mode is distinct from 'full' then
    raise exception 'stop: the scoring mode of the fixture is %, not full', coalesce(v_mode, 'unset'); end if;

  -- 2. The three players: exactly one each --------------------------------
  for i in 1..3 loop
    select count(distinct p.id), count(distinct m.team_id), (array_agg(distinct p.id))[1], (array_agg(distinct m.team_id))[1]
      into v_cnt, v_teams, v_pid, v_tid
      from app.players p join app.team_memberships m on m.player_id = p.id
     where lower(btrim(p.full_name)) = lower(c_names[i])
       and m.active and m.season_id = c_season and m.team_id in (f.home_team_id, f.away_team_id);
    if v_cnt <> 1 or v_teams <> 1 then
      raise exception 'stop: % resolves to % players at % clubs of the fixture (need exactly one)', c_names[i], v_cnt, v_teams; end if;
    select count(*), min(fp.id::text)::uuid into v_cnt, v_fpid from app.fantasy_players fp
     where fp.fantasy_season_id = g.fantasy_season_id and fp.football_player_id = v_pid;
    if v_cnt <> 1 then raise exception 'stop: % has % fantasy players in the season (need exactly one)', c_names[i], v_cnt; end if;
    v_player := v_player || v_pid; v_team := v_team || v_tid; v_fp := v_fp || v_fpid;
  end loop;
  if v_team[1] is distinct from v_team[2] or v_team[3] is not distinct from v_team[1] then
    raise exception 'stop: Manaout and Camara must be at one club of the fixture and Majni at the other'; end if;

  -- 3. The latest observation ----------------------------------------------
  select * into o from app_private.fantasy_fixture_observations
   where fixture_id = c_fixture order by observed_at desc, id desc limit 1;
  if not found or o.source not in ('provider-reconciled', 'reviewed-correction') or not o.full_ready or not o.simple_ready then
    raise exception 'stop: the latest observation of the fixture is missing, not SofaScore/reviewed, or not ready'; end if;
  if position(c_sofascore_manaout in o.payload::text) > 0 then
    raise exception 'stop: SofaScore id % appears in the observation (rows or exclusions): the data says Manaout was on the sheet; do not record that he did not play without looking', c_sofascore_manaout; end if;
  if not exists(select 1 from app_private.football_provider_mappings pm
      where pm.provider_name = 'sofascore' and pm.entity_type = 'player' and pm.external_id = c_sofascore_manaout
        and pm.internal_entity_id = v_player[1] and pm.active) then
    raise exception 'stop: SofaScore id % is not an active mapping of Manaout', c_sofascore_manaout; end if;

  d0 := app_private.fantasy_scoring_input_document(c_gameweek);
  v_coverage_anon := coalesce((select (x #>> '{coverage,anonymous_starter_rows}')::integer
    from jsonb_array_elements(d0 -> 'fixtures') x where x ->> 'fixtureId' = c_fixture::text), 0);

  for i in 1..3 loop
    v_in_rows := exists(select 1 from jsonb_array_elements(o.payload -> 'players') r where r ->> 'playerId' = v_player[i]::text);
    v_listed := (coalesce(o.payload -> 'verifiedNonParticipants', '[]'::jsonb) || coalesce(o.payload -> 'estimatedNonParticipants', '[]'::jsonb)) ? v_player[i]::text;
    select * into v_mem from app.team_memberships m
     where m.player_id = v_player[i] and m.team_id = v_team[i] and m.season_id = c_season and m.active
     order by m.valid_from desc limit 1;
    v_valid := v_mem.valid_from <= f.kickoff_at::date and (v_mem.valid_to is null or v_mem.valid_to >= f.kickoff_at::date);
    select x into v_entry from jsonb_array_elements(d0 -> 'playerFixtures') x
     where x ->> 'fixtureId' = c_fixture::text and x ->> 'fantasyPlayerId' = v_fp[i]::text;
    v_known := v_entry ->> 'participationKnown';
    v_locked := exists(select 1 from app.fantasy_lineup_players lp join app.fantasy_lineups l on l.id = lp.lineup_id
       where l.gameweek_id = c_gameweek and l.locked_at is not null and lp.fantasy_player_id = v_fp[i]);
    v_diag := v_diag || jsonb_build_array(jsonb_build_object(
      'name', c_names[i], 'playerId', v_player[i], 'fantasyPlayerId', v_fp[i], 'teamId', v_team[i],
      'inObservationRows', v_in_rows, 'inNonParticipantLists', v_listed,
      'membershipFrom', v_mem.valid_from, 'membershipTo', v_mem.valid_to,
      'membershipCreatedAt', v_mem.created_at, 'membershipUpdatedAt', v_mem.updated_at,
      'membershipCoversKickoff', v_valid, 'inLockedLineup', v_locked,
      'documentEntry', v_entry is not null, 'participationKnown', v_known,
      'coverageAnonymousStarterRows', v_coverage_anon,
      'hasActivePerformanceRow', exists(select 1 from app.player_fixture_performances pf
         where pf.fixture_id = c_fixture and pf.player_id = v_player[i] and pf.active),
      'observationRecordedAt', o.observed_at));
    if v_in_rows then raise exception 'stop: % is in the observation rows: SofaScore says he appeared', c_names[i]; end if;
    if not v_valid then raise exception 'stop: the club record of % does not cover the kickoff date: the recorder would refuse', c_names[i]; end if;
    if v_listed then v_already := v_already + 1; end if;
    if v_entry is null then raise exception 'stop: % has no scoring entry for this fixture', c_names[i]; end if;
    if not v_locked then raise exception 'stop: % is in no locked lineup of GW3, so he is not what blocks it', c_names[i]; end if;
  end loop;
  if v_already > 0 then
    raise exception 'stop: % of the three are already listed as non-participants in the latest observation (%): either this script already ran or the world is not the assumed one; read the diagnosis, do not force it',
      v_already, (select string_agg(e ->> 'name', ', ') from jsonb_array_elements(v_diag) e where (e ->> 'inNonParticipantLists')::boolean);
  end if;
  for i in 1..3 loop
    if (v_diag -> (i - 1) ->> 'participationKnown') is not distinct from 'true' then
      raise exception 'stop: participation of % is already known; pending for another reason: %', c_names[i], v_diag -> (i - 1); end if;
  end loop;

  select array_agg(x order by x) into v_pending0 from jsonb_array_elements_text(d0 -> 'pendingPlayerIds') x;
  select array_agg(x order by x) into v_expected from unnest(v_fp::text[]) x;
  if v_pending0 is distinct from v_expected or jsonb_array_length(d0 -> 'pendingFixtures') <> 0 then
    raise exception 'stop: the pending lists are not exactly the three players (pendingPlayerIds %, pendingFixtures %)',
      d0 -> 'pendingPlayerIds', d0 -> 'pendingFixtures'; end if;

  -- 4. The write: one reviewed-correction observation ----------------------
  fp_before := pg_temp.gw3_dnp_footprint();
  select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into v_list from (
    select jsonb_array_elements_text(coalesce(o.payload -> 'verifiedNonParticipants', '[]'::jsonb)) as x
    union select unnest(v_player::text[])) u;
  v_payload := o.payload || jsonb_build_object(
    'verifiedNonParticipants', v_list,
    'expectedDigest', o.digest,
    'reason', 'Owner-confirmed 2026-10-13: Haytam Manaout, Mamadou Lamine Camara (RSB Berkane) and Takha Majni (UTS Rabat) did not play in UTS Rabat - RSB Berkane. Participation only: 0 minutes, did not appear.',
    'reviewer', 'owner:' || v_user::text,
    'references', coalesce(o.payload -> 'references', '[]'::jsonb) || jsonb_build_array(c_reference));
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_res := api.service_record_fantasy_observation(c_fixture, v_payload, 'reviewed-correction');
  perform set_config('request.jwt.claim.role', null, true);
  perform set_config('request.jwt.claims', null, true);

  -- 5. Proof, in the same transaction --------------------------------------
  select * into n from app_private.fantasy_fixture_observations
   where fixture_id = c_fixture order by observed_at desc, id desc limit 1;
  if n.id is distinct from (v_res ->> 'observationId')::bigint or n.id = o.id or n.source <> 'reviewed-correction'
    or not n.full_ready or not n.simple_ready or (v_res ->> 'fullReady')::boolean is not true then
    raise exception 'stop: the correction is not the latest ready observation: %', v_res; end if;
  if (n.payload - v_strip) is distinct from (o.payload - v_strip) then
    raise exception 'stop: the correction changed a fact other than the listed fields'; end if;
  if n.payload -> 'verifiedNonParticipants' is distinct from v_list then
    raise exception 'stop: the stored non-participant list is not the old list plus the three'; end if;
  if (select mode from app_private.fantasy_fixture_scoring_modes where gameweek_id = c_gameweek and fixture_id = c_fixture) is distinct from 'full' then
    raise exception 'stop: the scoring mode of the fixture changed'; end if;

  d1 := app_private.fantasy_scoring_input_document(c_gameweek);
  if jsonb_array_length(d1 -> 'pendingPlayerIds') <> 0 or jsonb_array_length(d1 -> 'pendingFixtures') <> 0 then
    raise exception 'stop: GW3 would still not finalize: pendingPlayerIds %, pendingFixtures %',
      d1 -> 'pendingPlayerIds', d1 -> 'pendingFixtures'; end if;
  perform app_private.fantasy_validate_scoring_document(d1);
  if exists(select 1 from jsonb_array_elements(d1 -> 'fixtures') x where x ->> 'fixtureId' = c_fixture::text
        and (x ->> 'scoringMode' is distinct from 'full' or (x ->> 'adaptiveReady')::boolean is not true))
    or not exists(select 1 from jsonb_array_elements(d1 -> 'fixtures') x where x ->> 'fixtureId' = c_fixture::text) then
    raise exception 'stop: the fixture is not a ready full-mode fixture in the recomputed document'; end if;
  for i in 1..3 loop
    select x into v_entry from jsonb_array_elements(d1 -> 'playerFixtures') x
     where x ->> 'fixtureId' = c_fixture::text and x ->> 'fantasyPlayerId' = v_fp[i]::text;
    if v_entry is null or (v_entry ->> 'participationKnown')::boolean is not true
      or (v_entry #>> '{stats,minutes}')::integer <> 0
      or exists(select 1 from jsonb_each(v_entry -> 'stats') s where s.key <> 'cleanSheet' and s.value <> '0'::jsonb)
      or (v_entry #>> '{stats,cleanSheet}')::boolean is not false
      or (v_entry #>> '{evidence,minutes,state}') <> 'verified' then
      raise exception 'stop: % does not read as a verified 0-minute non-participant: %', c_names[i], v_entry; end if;
  end loop;
  -- Everyone else keeps exactly the statistics and participation they had.
  if (select coalesce(jsonb_agg(jsonb_build_object('p', x ->> 'fantasyPlayerId', 'f', x ->> 'fixtureId', 's', x -> 'stats', 'k', x -> 'participationKnown')
          order by x ->> 'fantasyPlayerId', x ->> 'fixtureId'), '[]'::jsonb)
        from jsonb_array_elements(d1 -> 'playerFixtures') x where not (x ->> 'fantasyPlayerId' = any (v_fp::text[])))
     is distinct from
     (select coalesce(jsonb_agg(jsonb_build_object('p', x ->> 'fantasyPlayerId', 'f', x ->> 'fixtureId', 's', x -> 'stats', 'k', x -> 'participationKnown')
          order by x ->> 'fantasyPlayerId', x ->> 'fixtureId'), '[]'::jsonb)
        from jsonb_array_elements(d0 -> 'playerFixtures') x where not (x ->> 'fantasyPlayerId' = any (v_fp::text[]))) then
    raise exception 'stop: another player''s statistics or participation changed'; end if;

  fp_after := pg_temp.gw3_dnp_footprint();
  if (fp_after - 'observations') is distinct from (fp_before - 'observations')
    or (fp_after ->> 'observations')::integer <> (fp_before ->> 'observations')::integer + 1 then
    raise exception 'stop: the write touched more than one new observation row: before % after %', fp_before, fp_after; end if;

  insert into gw3_dnp_result values (jsonb_build_object(
    'writesInThisTransaction', 'one reviewed-correction observation in app_private.fantasy_fixture_observations (rolled back unless the last line says commit)',
    'fixtureId', c_fixture, 'gameweekId', c_gameweek,
    'previousObservation', jsonb_build_object('id', o.id, 'source', o.source, 'digest', o.digest, 'observedAt', o.observed_at),
    'newObservation', jsonb_build_object('id', n.id, 'source', n.source, 'digest', n.digest, 'fullReady', n.full_ready, 'simpleReady', n.simple_ready),
    'nonParticipantsAdded', to_jsonb(v_player),
    'diagnosisBeforeWrite', v_diag,
    'pendingBefore', jsonb_build_object('pendingPlayerIds', d0 -> 'pendingPlayerIds', 'pendingFixtures', d0 -> 'pendingFixtures'),
    'pendingAfter', jsonb_build_object('pendingPlayerIds', d1 -> 'pendingPlayerIds', 'pendingFixtures', d1 -> 'pendingFixtures'),
    'footprintBefore', fp_before, 'footprintAfter', fp_after));
end $dnp$;

select jsonb_pretty(summary) as gw3_did_not_play_result from gw3_dnp_result;

-- REHEARSAL: nothing is saved. To apply, change only this line to commit.
rollback;
