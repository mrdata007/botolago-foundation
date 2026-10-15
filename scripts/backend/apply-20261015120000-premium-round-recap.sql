-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Apply the BotolaGO+ round recap read, migration 20261015120000
-- (docs/product/botolago-plus-round-recap-brief.md): the figures behind « Votre
-- journée expliquée », which explains one journée of a member's own team against
-- their private league: api.get_round_recap.
--
-- It adds ONE api function and ONE helper function in app_private (no grant). It
-- adds NO table, no column, no job and no row, and it REPLACES NOTHING: the career,
-- duel and league context reads and every other function stay exactly as they are
-- -- the script checks that. The read is display
-- only, members only, and writes nothing.
--
-- IT SHIPS OFF. While app_private.premium_settings.mode is 'off' (or the Manager
-- Card reads are off) the read answers {"available": false}. It serves the member's
-- own journée and league averages of three managers or more; it names no other
-- manager's lineup.
--
-- WHEN
--   After the league context is applied on this database
--   (scripts/backend/apply-20261014150000-premium-card-league-context.sql), after the pull
--   request that adds this file is merged and its database-quality job passed.
--   Staging first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Make sure nothing else is writing to this database: no GitHub Actions run
--     in progress, no other query running, no other agent or workflow working on
--     the database.
--   * Nothing needs pausing: the script only creates functions and replaces none,
--     and the read it adds writes nothing. It is not a new writer.
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every
--      guard and every check runs on the real code path inside one transaction,
--      and the script ends with a deliberate error whose message carries the
--      state it computed ("REHEARSAL PASSED -- nothing was saved: {...}"). That
--      error is the expected, good outcome: it rolls everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select to_regprocedure('api.get_round_recap(uuid,uuid)') is null as rolled_back;
--      It must say true.
--   4. In the line `select set_config('bg.round_recap_mode', 'rehearsal', true);`
--      near the top, change 'rehearsal' to 'apply' and press Run again. The
--      result row says "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of its objects exist, or where the
--     migrations it builds on (the Manager Card reads, the BotolaGO+ foundation
--     20261013100000 to 20261013100300, the premium card reads 20261013100400 and
--     the league context 20261014150000)
--     are not recorded;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the two functions' grants,
--     security definer with an empty search_path, STABLE; the read answering
--     "off" while BotolaGO+ is off; the definitions of the career, duel and league
--     context reads and of the privacy switch unchanged; no table, no job and no row added.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.round_recap_mode', 'rehearsal', true);

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  needed text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261015120000') then
    raise exception 'stop: 20261015120000 is already recorded as applied';
  end if;
  foreach needed in array array['20261008123300', '20261010120200', '20261012200100', '20261013100000', '20261013100100', '20261013100200', '20261013100300', '20261013100400', '20261014150000'] loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = needed) then
      missing := missing || needed;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: migrations this builds on are not applied yet: %', missing;
  end if;
  foreach needed in array array[
    'app.profiles', 'app.fantasy_teams', 'app.fantasy_leagues', 'app.fantasy_league_memberships',
    'app.fantasy_team_gameweek_results', 'app.manager_card_gameweeks', 'app.manager_card_seasons',
    'app.card_history_visibility', 'app_private.premium_settings', 'cron.job',
    'app.fantasy_gameweeks', 'app.fantasy_lineups', 'app.fantasy_lineup_players',
    'app.fantasy_player_gameweek_points', 'app.fantasy_transfer_batches', 'app.fantasy_transfers',
    'app.fantasy_auto_substitutions', 'app.fantasy_players', 'app.fantasy_positions', 'app.players'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.assert_mfa_step_up()', 'app_private.has_premium(uuid,timestamptz)',
    'app_private.manager_card_active_rules()', 'app_private.manager_card_fantasy_season()',
    'app_private.manager_card_season_label(uuid)', 'app_private.card_reads_mode()',
    'app_private.card_resolve_season(text)', 'app_private.card_week_rows(uuid,uuid)',
    'app_private.card_captain_rows(uuid,uuid)', 'app_private.card_transfer_rows(uuid,uuid)',
    'api.get_my_card_career(text)', 'api.get_card_duel(uuid,text)',
    'api.set_card_history_visibility(boolean)', 'api.get_my_card_history_visibility()',
    'api.get_card_league_context(uuid,text,uuid)', 'app_private.card_league_members(uuid)'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'api' and p.proname = 'get_round_recap')
      or (n.nspname = 'app_private' and p.proname = 'round_recap_league')) then
    raise exception 'stop: one of the round recap functions already exists';
  end if;
  -- This adds no job, no table and replaces nothing: remember what is there, compare afterwards.
  perform set_config('bg.round_recap_jobs', (select count(*) from cron.job)::text, true);
  perform set_config('bg.round_recap_tables', (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text, true);
  perform set_config('bg.round_recap_defs', (select string_agg(
      p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in (
      'api.get_my_card_career(text)'::regprocedure, 'api.get_card_duel(uuid,text)'::regprocedure,
      'api.get_card_league_context(uuid,text,uuid)'::regprocedure,
      'app_private.card_league_members(uuid)'::regprocedure,
      'app_private.card_league_context(uuid,uuid,uuid,uuid,boolean,integer)'::regprocedure,
      'api.set_card_history_visibility(boolean)'::regprocedure,
      'api.get_my_card_history_visibility()'::regprocedure,
      'app_private.card_week_rows(uuid,uuid)'::regprocedure,
      'app_private.card_captain_rows(uuid,uuid)'::regprocedure,
      'app_private.card_transfer_rows(uuid,uuid)'::regprocedure)), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migration, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261015120000',
  'premium_round_recap',
  array[$bg_20261015120000_file$-- BotolaGO+ (membership), « Votre journée expliquée »: the read behind the round recap.
--
-- ONE new read, for members only, that explains one journée of the caller's own Fantasy team and
-- sets it against the private league they play in:
--
--   api.get_round_recap(p_gameweek, p_league)
--
-- WHY A NEW FUNCTION. The free recap ("Ma journée BotolaGO") is built in the browser from
-- api.get_my_fantasy_points and, by a rule written next to it, shows no league figure. The
-- league figures are the paid part and must come from the server, because they aggregate private
-- league lineups. api.get_card_league_context and api.get_my_card_career are shipped, their key
-- sets are asserted by database tests and zod contracts, and an applied migration is never
-- edited (CLAUDE.md); neither is touched. api.get_my_fantasy_points is not touched either.
--
-- DISPLAY ONLY, NOTHING WRITTEN. Every figure is read from what Fantasy already stored: the team's
-- result row, its lineup, the player points, the confirmed transfer batches of the journée and the
-- auto-substitutions. The only arithmetic is a subtraction to show a gap (score minus the league
-- average, captain minus the league's captains) and the remainder « vos autres choix », which is
-- named a remainder in the answer ("othersIsRemainder"), not a per-player measure. Membership never
-- changes a score, a rating, a tier or a rank. No table, no column, no job, no setting.
--
-- POINTS, NEVER RATINGS. This read serves points. It does not say which fantasy points came from a
-- rating and which from the 5 given to a player who appeared without one
-- (docs/backend/FANTASY_RATING_POINTS.md): the ledger line does not distinguish them. A screen must
-- therefore never show a number from here as a rating. A player whose points are not published yet
-- has "pending": true and "points": null, never a fallback.
--
-- WHICH JOURNÉE. p_gameweek names one of the current Fantasy season's journées for which the
-- caller's active team has a result row and whose status is provisional, finalizing, finalized or
-- corrected (the matches are over; ratings may still be arriving). Anything else is PT404
-- round_recap_not_found (the same answer for an unknown id, another season's journée, an earlier
-- journée the caller's team did not play, and one still to be played). Without p_gameweek the
-- latest such journée is used. A caller with no team, or no such journée yet, gets
-- {"gameweek": null} (an empty state, not an error).
--
-- WHICH LEAGUE. Exactly as api.get_card_league_context: p_league must be an ACTIVE PRIVATE league of
-- the current season of which the caller is an active member (else PT404 card_league_not_found, one
-- answer for unknown, public and not-a-member). Without it the caller's private league with the most
-- members, then the lowest id (the first one the leagues list shows). A caller with no private
-- league still gets the recap, with "league": null and no league figure.
--
-- WHO IS COUNTED AND HOW. The league's active members (app_private.card_league_members). A
-- journée's score is the final score, or, while the journée is still in the ratings window, the
-- provisional one; "leagueAverageSettled" says whether every counted score was final. Rank is the
-- competition rank on the cumulative score through the journée, and "previousRank" the one through
-- the journée before; movement is previousRank minus rank (positive is up). Scores and ranks by points
-- are what the standings already show every member. The league average of the journée and the
-- league's average captain points are given only for three or more managers (minGroup 3); under that
-- they are null. Nothing names or describes another manager's lineup.
--
-- CAPTAIN. The effective captain the scoring worker recorded in the result's scoring details
-- ("effectiveCaptainId": the captain, or the vice-captain when the captain did not play), else the
-- lineup's captain who played, else its vice-captain who played, exactly as the Manager Card's own
-- captain helper reads it. The lineup's stored multiplier is NOT used: it is the lineup's default,
-- the scoring multipliers live in the result. Counted points = the player's points plus the result's
-- captain points (the bonus the worker added); the multiplier shown is counted over points, and
-- null when the player scored nothing. "usedVice" says the counted player is the vice-captain. The
-- league average is over the managers whose effective captain has published points.
--
-- WHO IS ON THE PITCH. The lineup's starters, less those an automatic substitution took out, plus
-- those it brought in ("onPitch"); everyone else is the bench. "counted" adds the whole bench under
-- Bench Boost. The bench points of the result are the sum of the bench players that were not
-- substituted in.
--
-- THE ANSWERS (in order: argument check, off, step-up, caller, membership):
--   BotolaGO+ off, or the Manager Card reads off     {"available": false}
--   preview, caller not a member                      {"available": false}
--   on, caller not a member                           {"available": true, "locked": true}
--   a member                                          {"available": true, "locked": false, ...}
--
-- SHIPS OFF like the rest of BotolaGO+, no table, no job, no writer.

-- ---------------------------------------------------------------------------
-- Helper (app_private, no grant at all, not callable by any API role)
-- ---------------------------------------------------------------------------

-- The effective captain of a team's journée with his published points and the points that counted
-- (his points plus the captain bonus of the result). No row when there is no captain that played.
-- points is null while the player has no published points yet. Read only.
create function app_private.round_recap_captain(p_team uuid, p_gameweek uuid)
returns table (fantasy_player_id uuid, points integer, counted integer, used_vice boolean, multiplier integer)
language sql
stable
set search_path = ''
as $$
  with res as (
    select r.captain_points, r.scoring_details ->> 'effectiveCaptainId' as effective
    from app.fantasy_team_gameweek_results r
    where r.fantasy_team_id = p_team and r.gameweek_id = p_gameweek
  ), lp as (
    select x.fantasy_player_id as pid, x.captain, x.vice_captain,
      coalesce(pt.minutes_played, 0) as mins, pt.final_points
    from app.fantasy_lineups l
    join app.fantasy_lineup_players x on x.lineup_id = l.id
    left join app.fantasy_player_gameweek_points pt
      on pt.fantasy_player_id = x.fantasy_player_id and pt.gameweek_id = p_gameweek
    where l.fantasy_team_id = p_team and l.gameweek_id = p_gameweek
  ), eff as (
    select coalesce(
      (select a.pid from lp a where a.pid::text = (select res.effective from res)),
      (select a.pid from lp a where a.captain and a.mins > 0),
      (select a.pid from lp a where a.vice_captain and a.mins > 0)) as pid
  )
  select a.pid, a.final_points,
    a.final_points + res.captain_points,
    a.vice_captain and not a.captain,
    case when a.final_points <> 0 then round((a.final_points + res.captain_points)::numeric / a.final_points)::integer end
  from eff
  join lp a on a.pid = eff.pid
  cross join res;
$$;
revoke all on function app_private.round_recap_captain(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.round_recap_captain(uuid, uuid) is
  'The effective captain of a team''s journée (the scoring result''s effectiveCaptainId, else the captain who played, else the vice-captain who played) with his published points and the points that counted (his points plus the result''s captain bonus). Read only. No grant.';

-- The league figures of one journée of one season: the average, best and counted number of the
-- journée's scores, the caller's rank through it and through the journée before, and the league's
-- average counted captain points. Read only.
create function app_private.round_recap_league(
  p_actor_team uuid, p_league uuid, p_season uuid, p_gameweek uuid, p_seq integer, p_min_group integer
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with mem as (
    select * from app_private.card_league_members(p_league)
  ), sc as (
    -- every member's score per journée up to this one (final, else the provisional one)
    select m.user_id, g.sequence_number as seq,
      coalesce(r.final_score, r.provisional_score) as score,
      r.state = 'final' as final
    from mem m
    join app.fantasy_team_gameweek_results r on r.fantasy_team_id = m.team_id
    join app.fantasy_gameweeks g on g.id = r.gameweek_id
      and g.fantasy_season_id = p_season and g.sequence_number <= p_seq and g.status <> 'cancelled'
  ), this_week as (
    select s.* from sc s where s.seq = p_seq
  ), now_totals as (
    select s.user_id, sum(s.score)::integer as total from sc s group by s.user_id
  ), prev_totals as (
    select s.user_id, sum(s.score)::integer as total from sc s where s.seq < p_seq group by s.user_id
  ), now_rank as (
    select n.user_id, rank() over (order by n.total desc) as rk from now_totals n
  ), prev_rank as (
    select n.user_id, rank() over (order by n.total desc) as rk from prev_totals n
  ), caps as (
    -- each member's counted captain points this journée, where the points are published
    select m.user_id, c.counted::numeric as counted
    from mem m
    cross join lateral app_private.round_recap_captain(m.team_id, p_gameweek) c
    where c.counted is not null
  )
  select jsonb_build_object(
    'members', (select count(*)::integer from mem),
    'scored', (select count(*)::integer from this_week),
    'average', (select case when count(*) >= p_min_group then round(avg(t.score), 1) end from this_week t),
    'best', (select max(t.score) from this_week t),
    'settled', (select coalesce(bool_and(t.final), false) from this_week t),
    'rank', (select nr.rk from now_rank nr join mem m on m.user_id = nr.user_id
             where m.team_id = p_actor_team),
    'previousRank', (select pr.rk from prev_rank pr join mem m on m.user_id = pr.user_id
                     where m.team_id = p_actor_team),
    'captainContributors', (select count(*)::integer from caps),
    'captainAverage', (select case when count(*) >= p_min_group then round(avg(c.counted), 1) end from caps c)
  );
$$;
revoke all on function app_private.round_recap_league(uuid, uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated, service_role;
comment on function app_private.round_recap_league(uuid, uuid, uuid, uuid, integer, integer) is
  'The league figures of one journée for api.get_round_recap: the average, best and number of scores (the average only for p_min_group managers or more), whether they were all final, the caller''s team rank through the journée and the one before, and the league''s average counted captain points. Read only. No grant.';

-- ---------------------------------------------------------------------------
-- api.get_round_recap
-- ---------------------------------------------------------------------------
create function api.get_round_recap(
  p_gameweek uuid default null,
  p_league uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  v_season uuid;
  v_team uuid;
  v_league uuid;
  v_league_name text;
  v_gw app.fantasy_gameweeks%rowtype;
  v_res app.fantasy_team_gameweek_results%rowtype;
  v_lineup uuid;
  v_settled boolean;
  lg jsonb;
  v_players jsonb;
  v_captain jsonb;
  v_cap record;
  v_final boolean;
  v_transfers jsonb;
  v_subs jsonb;
  v_gameweeks jsonb;
  v_score integer;
  v_average numeric;
  v_vs numeric;
  v_cap_delta numeric;
  v_tr_net numeric;
  v_tr_pending boolean;
  v_other numeric;
  v_rank bigint;
  v_prev bigint;
  min_group constant integer := 3;
begin
  mode := app_private.card_reads_mode();
  if mode is distinct from 'on' and mode is distinct from 'preview' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not app_private.has_premium(actor) then
    -- In preview only members see anything; once on, the screen shows its lock.
    if mode = 'preview' then
      return jsonb_build_object('available', false);
    end if;
    return jsonb_build_object('available', true, 'locked', true);
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'round_recap_not_found';
  end if;

  v_season := app_private.manager_card_fantasy_season();
  select t.id into v_team
  from app.fantasy_teams t
  where t.user_id = actor and t.fantasy_season_id = v_season and t.status = 'active';

  -- The journées this team can have explained, newest first.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'seq', g.sequence_number, 'name', g.name, 'status', g.status::text,
      'settled', r.state = 'final') order by g.sequence_number desc), '[]'::jsonb)
  into v_gameweeks
  from app.fantasy_gameweeks g
  join app.fantasy_team_gameweek_results r on r.gameweek_id = g.id and r.fantasy_team_id = v_team
  where g.fantasy_season_id = v_season
    and g.status in ('provisional', 'finalizing', 'finalized', 'corrected');

  if p_gameweek is not null then
    select g.* into v_gw
    from app.fantasy_gameweeks g
    join app.fantasy_team_gameweek_results r on r.gameweek_id = g.id and r.fantasy_team_id = v_team
    where g.id = p_gameweek and g.fantasy_season_id = v_season
      and g.status in ('provisional', 'finalizing', 'finalized', 'corrected');
    if v_gw.id is null then
      raise exception using errcode = 'PT404', message = 'round_recap_not_found';
    end if;
  else
    select g.* into v_gw
    from app.fantasy_gameweeks g
    join app.fantasy_team_gameweek_results r on r.gameweek_id = g.id and r.fantasy_team_id = v_team
    where g.fantasy_season_id = v_season
      and g.status in ('provisional', 'finalizing', 'finalized', 'corrected')
    order by g.sequence_number desc
    limit 1;
  end if;

  if v_team is null or v_gw.id is null then
    return jsonb_build_object('available', true, 'locked', false, 'gameweek', null,
      'gameweeks', '[]'::jsonb);
  end if;

  select r.* into v_res
  from app.fantasy_team_gameweek_results r
  where r.fantasy_team_id = v_team and r.gameweek_id = v_gw.id;
  v_settled := v_res.state = 'final';
  v_final := v_gw.points_state = 'final';
  v_score := coalesce(v_res.final_score, v_res.provisional_score);

  -- The league: named, else the first the leagues list shows, else none.
  if p_league is not null then
    select l.id, l.name into v_league, v_league_name
    from app.fantasy_leagues l
    join app.fantasy_league_memberships me
      on me.league_id = l.id and me.user_id = actor and me.status = 'active'
    where l.id = p_league and l.fantasy_season_id = v_season and l.visibility = 'private' and l.active;
    if v_league is null then
      raise exception using errcode = 'PT404', message = 'card_league_not_found';
    end if;
  else
    select l.id, l.name into v_league, v_league_name
    from app.fantasy_leagues l
    join app.fantasy_league_memberships me
      on me.league_id = l.id and me.user_id = actor and me.status = 'active'
    where l.fantasy_season_id = v_season and l.visibility = 'private' and l.active
    order by l.member_count desc, l.id
    limit 1;
  end if;
  if v_league is not null then
    lg := app_private.round_recap_league(v_team, v_league, v_season, v_gw.id, v_gw.sequence_number, min_group);
  end if;

  select l.id into v_lineup
  from app.fantasy_lineups l
  where l.fantasy_team_id = v_team and l.gameweek_id = v_gw.id;

  -- Who the automatic substitutions moved, then the eleven and the bench. A player's points are the
  -- published ones; a journée still in the ratings window has players with none yet: pending, no number.
  select coalesce(jsonb_agg(jsonb_build_object(
      'fantasyPlayerId', lp.fantasy_player_id,
      'name', pl.display_name,
      'position', pos.code,
      'slot', lp.slot::text,
      'order', lp.slot_order,
      'captain', lp.captain,
      'viceCaptain', lp.vice_captain,
      'onPitch', oc.on_pitch,
      'counted', oc.on_pitch or coalesce(v_res.chip_type = 'bench_boost', false),
      'pending', (pt.final_points is null and not v_final),
      'points', case when pt.final_points is null and not v_final then null
                     else coalesce(pt.final_points, 0) end,
      'minutes', coalesce(pt.minutes_played, 0),
      'played', coalesce(pt.did_play, false)
    ) order by lp.slot, lp.slot_order), '[]'::jsonb)
  into v_players
  from app.fantasy_lineup_players lp
  join app.fantasy_players fp on fp.id = lp.fantasy_player_id
  join app.players pl on pl.id = fp.football_player_id
  join app.fantasy_positions pos on pos.id = fp.position_id
  cross join lateral (
    select (lp.slot = 'starter'
        and not exists (select 1 from app.fantasy_auto_substitutions s
          where s.lineup_id = v_lineup and s.player_out_id = lp.fantasy_player_id))
      or exists (select 1 from app.fantasy_auto_substitutions s
          where s.lineup_id = v_lineup and s.player_in_id = lp.fantasy_player_id) as on_pitch
  ) oc
  left join app.fantasy_player_gameweek_points pt
    on pt.fantasy_player_id = lp.fantasy_player_id and pt.gameweek_id = v_gw.id
  where lp.lineup_id = v_lineup;

  -- The counted captain (see the header): null when no captain played.
  select c.fantasy_player_id, c.points, c.counted, c.used_vice, c.multiplier, pl.display_name as name
  into v_cap
  from app_private.round_recap_captain(v_team, v_gw.id) c
  join app.fantasy_players fp on fp.id = c.fantasy_player_id
  join app.players pl on pl.id = fp.football_player_id;
  if v_cap.fantasy_player_id is not null then
    v_captain := jsonb_build_object(
      'fantasyPlayerId', v_cap.fantasy_player_id,
      'name', v_cap.name,
      'multiplier', v_cap.multiplier,
      'usedVice', v_cap.used_vice,
      'pending', (v_cap.points is null and not v_final),
      'points', case when v_cap.points is null and not v_final then null else coalesce(v_cap.points, 0) end,
      'counted', case when v_cap.points is null and not v_final then null else coalesce(v_cap.counted, 0) end);
  end if;

  -- The journée's transfers (confirmed, not a Free Hit) with this journée's points of the player
  -- out and in: what the swap was worth over the journée, then after its share of the hit.
  select coalesce(jsonb_agg(x.item order by x.sequence_number), '[]'::jsonb),
    coalesce(bool_or((x.item ->> 'pending')::boolean), false),
    case when bool_or((x.item ->> 'pending')::boolean) then null
         else round(coalesce(sum(x.net_exact), 0), 1) end
  into v_transfers, v_tr_pending, v_tr_net
  from (
    select tr.sequence_number,
      jsonb_build_object(
        'playerOutId', tr.player_out_id,
        'playerInId', tr.player_in_id,
        'playerOut', pout.display_name,
        'playerIn', pin.display_name,
        'outPoints', case when po.final_points is null and not v_final then null
                          else coalesce(po.final_points, 0) end,
        'inPoints', case when pi.final_points is null and not v_final then null
                         else coalesce(pi.final_points, 0) end,
        'hitShare', round(b.point_hit::numeric / b.transfers_count, 1),
        'pending', ((po.final_points is null or pi.final_points is null) and not v_final),
        'gain', case when (po.final_points is null or pi.final_points is null) and not v_final
                     then null else coalesce(pi.final_points, 0) - coalesce(po.final_points, 0) end,
        'net', case when (po.final_points is null or pi.final_points is null) and not v_final
                    then null
                    else coalesce(pi.final_points, 0) - coalesce(po.final_points, 0)
                      - round(b.point_hit::numeric / b.transfers_count, 1) end
      ) as item,
      -- The exact share: summed unrounded, so the shares of a batch add up to its hit.
      coalesce(pi.final_points, 0) - coalesce(po.final_points, 0)
        - b.point_hit::numeric / b.transfers_count as net_exact
    from app.fantasy_transfer_batches b
    join app.fantasy_transfers tr on tr.transfer_batch_id = b.id
    join app.fantasy_players fpo on fpo.id = tr.player_out_id
    join app.players pout on pout.id = fpo.football_player_id
    join app.fantasy_players fpi on fpi.id = tr.player_in_id
    join app.players pin on pin.id = fpi.football_player_id
    left join app.fantasy_player_gameweek_points po
      on po.fantasy_player_id = tr.player_out_id and po.gameweek_id = v_gw.id
    left join app.fantasy_player_gameweek_points pi
      on pi.fantasy_player_id = tr.player_in_id and pi.gameweek_id = v_gw.id
    where b.fantasy_team_id = v_team and b.gameweek_id = v_gw.id and b.status = 'confirmed'
      and b.chip_type is distinct from 'free_hit'
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'playerOut', pout.display_name, 'playerIn', pin.display_name, 'reason', s.reason)
      order by s.sequence_number), '[]'::jsonb)
  into v_subs
  from app.fantasy_auto_substitutions s
  join app.fantasy_players fpo on fpo.id = s.player_out_id
  join app.players pout on pout.id = fpo.football_player_id
  join app.fantasy_players fpi on fpi.id = s.player_in_id
  join app.players pin on pin.id = fpi.football_player_id
  where s.lineup_id = v_lineup;

  -- The gaps. Each is null whenever one of its parts is not there (no league, under three managers,
  -- a player not scored yet): nothing is guessed.
  v_average := (lg ->> 'average')::numeric;
  v_vs := case when v_average is not null then v_score - v_average end;
  v_cap_delta := case when (lg ->> 'captainAverage') is not null and (v_captain ->> 'counted') is not null
    then (v_captain ->> 'counted')::numeric - (lg ->> 'captainAverage')::numeric end;
  -- The transfer line, and the remainder: the gap to the league, less the captain's and the transfers'.
  v_other := case when v_vs is not null and v_cap_delta is not null and v_tr_net is not null
    then round(v_vs - v_cap_delta - v_tr_net, 1) end;
  v_rank := (lg ->> 'rank')::bigint;
  v_prev := (lg ->> 'previousRank')::bigint;

  return jsonb_build_object(
    'available', true,
    'locked', false,
    'minGroup', min_group,
    'league', case when v_league is null then null
      else jsonb_build_object('id', v_league, 'name', v_league_name, 'members', lg -> 'members') end,
    'gameweeks', v_gameweeks,
    'gameweek', jsonb_build_object(
      'id', v_gw.id,
      'seq', v_gw.sequence_number,
      'name', v_gw.name,
      'status', v_gw.status::text,
      'settled', v_settled,
      'corrected', v_gw.status = 'corrected' or v_gw.corrected_at is not null,
      'calculationVersion', v_res.calculation_version,
      'publishedAt', v_res.finalized_at),
    'me', jsonb_build_object(
      'score', v_score,
      'startingPoints', v_res.starting_points,
      'benchPoints', v_res.bench_points,
      'captainBonus', v_res.captain_points,
      'transferHit', v_res.transfer_hit,
      'chip', v_res.chip_type::text,
      'rank', v_rank,
      'previousRank', v_prev,
      'movement', case when v_rank is not null and v_prev is not null then v_prev - v_rank end),
    'leagueFigures', case when lg is null then null else jsonb_build_object(
      'scored', lg -> 'scored',
      'average', lg -> 'average',
      'best', lg -> 'best',
      'settled', lg -> 'settled',
      'captainAverage', lg -> 'captainAverage') end,
    'explain', jsonb_build_object(
      'vsLeague', v_vs,
      'captain', case when v_captain is null then null
        else v_captain || jsonb_build_object('vsLeague', v_cap_delta) end,
      'transfers', v_transfers,
      'transfersNet', v_tr_net,
      'others', v_other,
      'othersIsRemainder', true),
    'players', v_players,
    'autoSubstitutions', v_subs,
    'pendingPlayers', (select count(*)::integer from jsonb_array_elements(v_players) e
                       where (e ->> 'pending')::boolean and e ->> 'slot' = 'starter')
  );
end;
$$;
revoke all on function api.get_round_recap(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function api.get_round_recap(uuid, uuid) to authenticated, service_role;
comment on function api.get_round_recap(uuid, uuid) is
  'BotolaGO+ round recap: one journée of the caller''s own team explained against their private league: {available, locked, minGroup, league, gameweeks, gameweek, me, leagueFigures, explain, players, autoSubstitutions, pendingPlayers}. The journée is p_gameweek (one the caller''s team has a result for, status provisional to corrected, else PT404 round_recap_not_found) or the latest; the league is p_league (else PT404 card_league_not_found) or the caller''s one with the most members. Points, never ratings; a player not scored yet is pending with no number; averages of fewer than three managers are null. Members only: {available:true, locked:true} for anyone else, {available:false} while BotolaGO+ or the Manager Card reads are off. Nothing is written. Signed-in, step-up.';

notify pgrst, 'reload schema';
$bg_20261015120000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261015120000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261015120000'
  );
begin
  if encode(sha256(convert_to(part_20261015120000, 'UTF8')), 'hex')
    is distinct from '6e5a66c55d45fd1e808490d9c73cc7fb87638f4a18071af42e73060e4cda995a' then
    raise exception 'stop: 20261015120000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261015120000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own) and keep what was
-- computed in a session setting, so the result row can show it after the rollback
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  who text;
  sig text := 'api.get_round_recap(uuid,uuid)';
  rec record;
  premium_mode text;
  answer jsonb;
  state jsonb;
begin
  -- The api function: who may run it, how it runs, that it cannot write.
  if to_regprocedure(sig) is null then
    problems := problems || (sig || ' is missing');
  else
    foreach who in array array['authenticated', 'service_role'] loop
      if not has_function_privilege(who, to_regprocedure(sig), 'execute') then
        problems := problems || (who || ' cannot run ' || sig);
      end if;
    end loop;
    foreach who in array array['anon', 'public'] loop
      if has_function_privilege(who, to_regprocedure(sig), 'execute') then
        problems := problems || (who || ' can run ' || sig);
      end if;
    end loop;
    if not (select p.prosecdef and p.proconfig @> array['search_path=""'] and p.provolatile = 's'
      from pg_proc p where p.oid = to_regprocedure(sig)) then
      problems := problems || (sig || ' is not STABLE security definer with an empty search_path');
    end if;
  end if;

  -- Helpers: no API role, stable, empty search_path.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid, p.provolatile, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname = 'round_recap_league'
  loop
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, rec.oid, 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
    if rec.provolatile <> 's' or not (rec.proconfig @> array['search_path=""']) then
      problems := problems || (rec.signature || ' is not STABLE with an empty search_path');
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private' and p.proname = 'round_recap_league') <> 1 then
    problems := problems || 'the helper is not there'::text;
  end if;

  -- Replaces nothing: the career, duel, league context, switch and the card helpers are as they were.
  if (select string_agg(
        p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
      from pg_proc p where p.oid in (
        'api.get_my_card_career(text)'::regprocedure, 'api.get_card_duel(uuid,text)'::regprocedure,
      'api.get_card_league_context(uuid,text,uuid)'::regprocedure,
      'app_private.card_league_members(uuid)'::regprocedure,
      'app_private.card_league_context(uuid,uuid,uuid,uuid,boolean,integer)'::regprocedure,
        'api.set_card_history_visibility(boolean)'::regprocedure,
        'api.get_my_card_history_visibility()'::regprocedure,
        'app_private.card_week_rows(uuid,uuid)'::regprocedure,
        'app_private.card_captain_rows(uuid,uuid)'::regprocedure,
        'app_private.card_transfer_rows(uuid,uuid)'::regprocedure))
    is distinct from current_setting('bg.round_recap_defs', true) then
    problems := problems || 'an existing premium card read changed -- this script replaces none'::text;
  end if;

  -- Off means off (checked only while BotolaGO+ is off; if it is already on the
  -- read cannot be called here without a signed-in user).
  select s.mode into premium_mode from app_private.premium_settings s where s.id;
  if premium_mode = 'off' then
    answer := api.get_round_recap();
    if answer is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the read does not answer off while BotolaGO+ is off: '
        || coalesce(answer::text, 'nothing'));
    end if;
  end if;

  -- No job and no table was added, and the history row is there.
  if (select count(*) from cron.job)::text is distinct from current_setting('bg.round_recap_jobs', true) then
    problems := problems || 'the number of scheduled jobs changed -- this script adds none'::text;
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text
    is distinct from current_setting('bg.round_recap_tables', true) then
    problems := problems || 'the number of tables changed -- this script adds none'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version = '20261015120000') <> 1 then
    problems := problems || 'the history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  state := jsonb_build_object(
    'premiumMode', premium_mode,
    'apiFunctions', 1,
    'helpers', 1,
    'readWhileOff', case when premium_mode = 'off' then answer end,
    'historyRows', 1
  );
  perform set_config('bg.round_recap_state', state::text, true);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('bg.round_recap_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.round_recap_state', true);
  end if;
  raise notice 'premium round recap: applying: %', current_setting('bg.round_recap_state', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261015120000')
    then 'Applied. The round recap read is in place and OFF while BotolaGO+ is off. Next: docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md.'
  else 'NOT applied: nothing was saved (a rehearsal, or a check stopped it).'
end as result;
