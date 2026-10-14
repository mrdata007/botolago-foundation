-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Apply the BotolaGO+ premium card reads, migration 20261013100400
-- (docs/plans/BOTOLAGO_PLUS_PLAN.md sections 2a and 2b): « Votre carrière »
-- (api.get_my_card_career), « Face-à-face+ » (api.get_card_duel) and the privacy
-- switch for the card history (api.set_card_history_visibility,
-- api.get_my_card_history_visibility).
--
-- It adds ONE table (app.card_history_visibility, empty, closed to every API
-- role), nine helper functions in app_private (no grant), and four api
-- functions. It REPLACES NOTHING: no existing function, table or row changes,
-- the Manager Card calculation is not touched, and no job is scheduled. All
-- reads are display only and members only.
--
-- IT SHIPS OFF. While app_private.premium_settings.mode is 'off' (or the Manager
-- Card reads are off) the reads answer {"available": false} and the switch
-- function writes nothing. The history of nobody is shown to league mates until
-- they switch it on (default hidden: plan Q6, the CNDP point is open).
--
-- WHEN
--   After the membership foundation is applied on this database
--   (scripts/backend/apply-20261013100000-premium-foundation.sql), after the pull
--   request that adds this file is merged and its database-quality job passed.
--   Staging first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Make sure nothing else is writing to this database: no GitHub Actions run
--     in progress, no other query running, no other agent or workflow working on
--     the database.
--   * Nothing needs pausing: the script only creates a table and functions and
--     replaces none. (It does not touch the account erasure.)
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every
--      guard and every check runs on the real code path inside one transaction,
--      and the script ends with a deliberate error whose message carries the
--      state it computed ("REHEARSAL PASSED -- nothing was saved: {...}"). That
--      error is the expected, good outcome: it rolls everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select to_regclass('app.card_history_visibility') is null as rolled_back;
--      It must say true.
--   4. In the line `select set_config('bg.premium_reads_mode', 'rehearsal', true);`
--      near the top, change 'rehearsal' to 'apply' and press Run again. The
--      result row says "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of its objects exist, or where the
--     migrations it builds on (the Manager Card reads and the BotolaGO+
--     foundation, 20261013100000 to 20261013100300) are not recorded;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the table's row security
--     forced and closed to every API role, the step-up trigger on it, every
--     function's grants, the reads answering "off" while BotolaGO+ is off, no
--     row in the new table, no job added.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.premium_reads_mode', 'rehearsal', true);

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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261013100400') then
    raise exception 'stop: 20261013100400 is already recorded as applied';
  end if;
  foreach needed in array array['20261008123300', '20261010120200', '20261012200100', '20261013100000', '20261013100100', '20261013100200', '20261013100300'] loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = needed) then
      missing := missing || needed;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: migrations this builds on are not applied yet: %', missing;
  end if;
  foreach needed in array array[
    'app.profiles', 'app.fantasy_teams', 'app.fantasy_seasons', 'app.fantasy_gameweeks',
    'app.fantasy_leagues', 'app.fantasy_league_memberships', 'app.fantasy_team_gameweek_results',
    'app.fantasy_lineups', 'app.fantasy_lineup_players', 'app.fantasy_player_gameweek_points',
    'app.fantasy_transfer_batches', 'app.fantasy_transfers', 'app.fantasy_players', 'app.players',
    'app.seasons', 'app.manager_card_gameweeks', 'app.manager_card_seasons',
    'app_private.manager_card_rules', 'app_private.fantasy_gameweek_postwork',
    'app_private.premium_settings', 'app.premium_entitlements', 'app_private.premium_grants',
    'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.set_updated_at()', 'app_private.assert_mfa_step_up()',
    'app_private.refuse_unverified_mfa_actor()', 'app_private.has_premium(uuid,timestamptz)',
    'app_private.card_edition_effective(uuid,uuid)',
    'app_private.manager_card_read_ready()', 'app_private.manager_card_active_rules()',
    'app_private.manager_card_fantasy_season()', 'app_private.manager_card_season_label(uuid)',
    'app_private.manager_card_tier_rank(text)', 'app_private.manager_card_member_card(uuid[])'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if to_regclass('app.card_history_visibility') is not null then
    raise exception 'stop: app.card_history_visibility already exists';
  end if;
  -- This adds no job: remember how many there are, and compare afterwards.
  perform set_config('bg.premium_reads_jobs', (select count(*) from cron.job)::text, true);
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'api' and p.proname in ('get_my_card_career', 'get_card_duel',
        'set_card_history_visibility', 'get_my_card_history_visibility'))
      or (n.nspname = 'app_private' and p.proname in ('card_premium_mode', 'card_reads_mode',
        'card_resolve_season', 'card_evaluable_gameweeks', 'card_week_rows', 'card_week_top_half',
        'card_captain_rows', 'card_transfer_rows', 'card_duel_shared_seasons'))) then
    raise exception 'stop: one of the premium card read functions already exists';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migration, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261013100400',
  'premium_card_reads',
  array[$bg_20261013100400_file$-- BotolaGO+ (membership), part 5: the premium card reads.
--
-- Two reads that turn the Manager Card's stored history into a story, for
-- members only, and the privacy switch the second one needs
-- (docs/plans/BOTOLAGO_PLUS_PLAN.md sections 2a and 2b):
--
--   api.get_my_card_career(p_season)        « Votre carrière »: the caller's own
--                                           past, week by week
--   api.get_card_duel(p_other_team, p_season)  « Face-à-face+ »: the caller's
--                                           history against a league mate's
--   api.set_card_history_visibility(bool)   "show my card history to league mates"
--   api.get_my_card_history_visibility()    the current value of that switch
--
-- DISPLAY ONLY, NOTHING COMPUTED. Every number comes from data the Manager Card
-- and Fantasy already computed: app.manager_card_gameweeks (the four stats and
-- OVR as of each evaluated gameweek), app.fantasy_team_gameweek_results (the
-- week's score), the lineups and player points (the captain) and the confirmed
-- transfers. The card's calculation (app_private.manager_card_evaluate_gameweek
-- and the tick) is NOT touched, and nothing here writes any Fantasy, ranking,
-- league or card table. Membership unlocks a screen; it never changes a score,
-- a rating, a tier or a rank. The only table written is the privacy switch
-- below. A pgTAP test (card_editions.test.sql) lists every function that names
-- the membership tables, and these are in that list on purpose.
--
-- ONE RULE FOR ALL THREE DEFINITIONS the card already has. The captain figures
-- repeat the card's CAP definition (the effective captain, the best starter, the
-- skipped weeks), and the transfer gains repeat its TRF definition (D4: the
-- in-player's points minus the out-player's over the window, minus the hit
-- share; Free Hit and reversed batches excluded; a batch counts once its whole
-- window is evaluable or the season's last gameweek is). They are separate
-- read-only functions because the compute must not change, and the pgTAP test
-- proves they agree with the card: the mean of the gains equals trf_raw and the
-- mean captain share equals cap_raw of the same history row.
--
-- THE ANSWERS (signed-in reads run, in order: argument check PT400, the off
-- answer, app_private.assert_mfa_step_up(), the caller PT401, the membership):
--   BotolaGO+ off, or the Manager Card reads off     {"available": false}
--   preview, caller not a member                      {"available": false}
--   on, caller not a member                           {"available": true, "locked": true}
--                                                     and nothing else: no data
--   a member                                          {"available": true, "locked": false, ...}
-- "Evaluable gameweek" is the card's own: finalized or corrected, points final,
-- post-work complete for the current scoring version.
--
-- THE DUEL AND PRIVACY (law 09-08, CNDP). A duel is possible only against a
-- manager who shares an ACTIVE PRIVATE LEAGUE with the caller in the season
-- compared, both memberships active. Anything else (an unknown team, oneself, a
-- manager with no shared league, a deleted-pending profile, an unknown season)
-- is the same PT404 card_duel_not_found, so nothing says which it was. The
-- friend's week-by-week history is shown only when THEY switched it on
-- (app.card_history_visibility, default OFF until the lawyer answers, plan Q6);
-- otherwise the answer carries today's card values only (what the batch card
-- read already shows league mates), historyVisible false, no weeks, no summary.
-- The friend need not be a member: paying unlocks the viewer's screen, never
-- the friend's data, and the friend's switch wins.
--
-- SHIPS OFF like the rest of BotolaGO+: while premium_settings.mode is 'off' (or
-- the Manager Card reads are off) the reads answer {"available": false} and the
-- switch function writes nothing.

-- ---------------------------------------------------------------------------
-- The privacy switch: one row per manager who ever set it; absent means hidden
-- ---------------------------------------------------------------------------
create table app.card_history_visibility (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  visible_to_league_mates boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
create trigger card_history_visibility_set_updated_at
before update on app.card_history_visibility
for each row execute function app_private.set_updated_at();
create trigger card_history_visibility_refuse_unverified_mfa_actor
before insert or update or delete on app.card_history_visibility
for each statement execute function app_private.refuse_unverified_mfa_actor();
alter table app.card_history_visibility enable row level security;
alter table app.card_history_visibility force row level security;
revoke all on app.card_history_visibility from public, anon, authenticated, service_role;
comment on table app.card_history_visibility is
  'Whether a manager shows their Manager Card week-by-week history to league mates in a BotolaGO+ duel. No row means hidden (the default stays off until the lawyer answers, plan Q6). Written only by api.set_card_history_visibility; read by api.get_card_duel. Row security forced, no policy. Cascades from the profile (the account erasure removes it).';

-- ---------------------------------------------------------------------------
-- Helpers (app_private, no grant at all, not callable by any API role)
-- ---------------------------------------------------------------------------

-- The BotolaGO+ mode: off, preview or on. A missing row reads as off.
create function app_private.card_premium_mode()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select s.mode from app_private.premium_settings s where s.id), 'off');
$$;
revoke all on function app_private.card_premium_mode()
  from public, anon, authenticated, service_role;
comment on function app_private.card_premium_mode() is
  'The BotolaGO+ mode (off, preview, on); off when the row is missing. No grant.';

-- The mode the two premium card reads run under: off unless the Manager Card
-- reads are ready AND BotolaGO+ is in preview or on.
create function app_private.card_reads_mode()
returns text
language sql
stable
set search_path = ''
as $$
  select case when app_private.manager_card_read_ready() then app_private.card_premium_mode() else 'off' end;
$$;
revoke all on function app_private.card_reads_mode()
  from public, anon, authenticated, service_role;
comment on function app_private.card_reads_mode() is
  'off while the Manager Card reads are not ready, else the BotolaGO+ mode (off, preview, on). No grant.';

-- A season given as text (a Fantasy season id, or its label NNNN/NN or
-- NNNN/NNNN) to the Fantasy season id; null when no season matches.
create function app_private.card_resolve_season(p_season text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select fs.id
  from app.fantasy_seasons fs
  join app.seasons s on s.id = fs.football_season_id
  where (p_season ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and fs.id::text = lower(p_season))
    or (p_season ~ '^[0-9]{4}/([0-9]{2}|[0-9]{4})$'
      and (app_private.manager_card_season_label(fs.id) = p_season or s.label = p_season))
  order by fs.starts_at desc, fs.id desc
  limit 1;
$$;
revoke all on function app_private.card_resolve_season(text)
  from public, anon, authenticated, service_role;
comment on function app_private.card_resolve_season(text) is
  'A season given as text (Fantasy season id, or label NNNN/NN or NNNN/NNNN) to its Fantasy season id; null when none matches. No grant.';

-- The gameweeks of a season the card can evaluate: finalized or corrected,
-- points final, post-work complete for the current scoring version. The same
-- test as app_private.manager_card_evaluate_gameweek.
create function app_private.card_evaluable_gameweeks(p_season uuid)
returns table (gameweek_id uuid, seq integer, deadline_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select g.id, g.sequence_number, g.deadline_at
  from app.fantasy_gameweeks g
  where g.fantasy_season_id = p_season
    and g.status in ('finalized', 'corrected') and g.points_state = 'final'
    and exists (
      select 1 from app_private.fantasy_gameweek_postwork work
      where work.gameweek_id = g.id and work.calculation_version = g.scoring_input_version
        and work.completed_at is not null);
$$;
revoke all on function app_private.card_evaluable_gameweeks(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.card_evaluable_gameweeks(uuid) is
  'The evaluable gameweeks of a Fantasy season (finalized or corrected, points final, post-work complete for the current scoring version): the card''s own test. No grant.';

-- One row per evaluable gameweek in which the manager's team in the season has
-- a final result: the week's score and the card's figures as of that week. The
-- figures follow the history read: null under the rules' minimum number of
-- counted weeks, the tier only with an OVR, provisional only with an OVR.
create function app_private.card_week_rows(p_user uuid, p_season uuid)
returns table (
  gameweek_id uuid, seq integer, gameweek_name text, team_id uuid, score integer,
  transfer_hit integer, chip text,
  ovr smallint, tier text, provisional boolean, gameweeks_counted integer,
  cap smallint, sel smallint, trf smallint, con smallint,
  cap_raw numeric, sel_raw numeric, trf_raw numeric, con_raw numeric
)
language sql
stable
set search_path = ''
as $$
  select ev.gameweek_id, ev.seq, gw.name, t.id, r.final_score, r.transfer_hit, r.chip_type::text,
    case when q.ok then h.ovr end,
    case when q.ok and h.ovr is not null then h.tier end,
    q.ok and h.ovr is not null and h.provisional,
    coalesce(h.gameweeks_counted, 0),
    case when q.ok then h.cap end, case when q.ok then h.sel end,
    case when q.ok then h.trf end, case when q.ok then h.con end,
    case when q.ok then h.cap_raw end, case when q.ok then h.sel_raw end,
    case when q.ok then h.trf_raw end, case when q.ok then h.con_raw end
  from app.fantasy_teams t
  join app.fantasy_team_gameweek_results r on r.fantasy_team_id = t.id and r.state = 'final'
  join app_private.card_evaluable_gameweeks(p_season) ev on ev.gameweek_id = r.gameweek_id
  join app.fantasy_gameweeks gw on gw.id = ev.gameweek_id
  left join app.manager_card_gameweeks h on h.user_id = p_user and h.gameweek_id = ev.gameweek_id
  cross join lateral (
    select coalesce(h.gameweeks_counted >= (select a.min_rated from app_private.manager_card_active_rules() a), false) as ok
  ) q
  where t.user_id = p_user and t.fantasy_season_id = p_season
  order by ev.seq;
$$;
revoke all on function app_private.card_week_rows(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.card_week_rows(uuid, uuid) is
  'One row per evaluable gameweek in which the manager''s team in the season has a final result: score, hit, chip and the card''s figures as of that week (null under the rules'' minimum). Read only. No grant.';

-- Was the score in the top half of the active teams' final results that week?
-- The card's CON definition: fewer than half the teams scored strictly more.
create function app_private.card_week_top_half(p_gameweek uuid, p_season uuid, p_score integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select count(*) filter (where r.final_score > p_score) * 2 < count(*)
  from app.fantasy_team_gameweek_results r
  join app.fantasy_teams t on t.id = r.fantasy_team_id
    and t.fantasy_season_id = p_season and t.status = 'active'
  where r.gameweek_id = p_gameweek and r.state = 'final';
$$;
revoke all on function app_private.card_week_top_half(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
comment on function app_private.card_week_top_half(uuid, uuid, integer) is
  'True when fewer than half of the active teams'' final results of the gameweek scored strictly more than the score (the card''s CON definition). Read only. No grant.';

-- The captain of each evaluable week, by the card's CAP definition: the
-- captain, or the vice-captain when the captain played no minutes; skipped
-- (share null) when neither played, when the best starter scored 0 or less,
-- when the week is before the rules' captain start date, or when the stored
-- scoring details name another captain. share = effective captain's points /
-- best starter's points, floored at 0, not rounded (the raw CAP figure per week); hit = the captain
-- scored at least as much as the best starter.
create function app_private.card_captain_rows(p_user uuid, p_season uuid)
returns table (
  gameweek_id uuid, seq integer, captain_name text, captain_points integer, used_vice boolean,
  best_points integer, share numeric, hit boolean
)
language sql
stable
set search_path = ''
as $$
  with rules as (
    select a.cap_ignore from app_private.manager_card_active_rules() a
  ), res as (
    select ev.gameweek_id, ev.seq, ev.deadline_at, r.scoring_details, l.id as lineup_id
    from app.fantasy_teams t
    join app.fantasy_team_gameweek_results r on r.fantasy_team_id = t.id and r.state = 'final'
    join app_private.card_evaluable_gameweeks(p_season) ev on ev.gameweek_id = r.gameweek_id
    left join app.fantasy_lineups l on l.fantasy_team_id = t.id and l.gameweek_id = ev.gameweek_id
    where t.user_id = p_user and t.fantasy_season_id = p_season
  ), agg as (
    select res.gameweek_id, res.seq, res.deadline_at, res.scoring_details,
      max(coalesce(pt.final_points, 0)) filter (where lp.slot = 'starter') as best,
      (array_agg(lp.fantasy_player_id) filter (where lp.captain))[1] as cap_id,
      coalesce(max(coalesce(pt.minutes_played, 0)) filter (where lp.captain), 0) as cap_mins,
      coalesce(max(coalesce(pt.final_points, 0)) filter (where lp.captain), 0) as cap_pts,
      (array_agg(lp.fantasy_player_id) filter (where lp.vice_captain))[1] as vice_id,
      coalesce(max(coalesce(pt.minutes_played, 0)) filter (where lp.vice_captain), 0) as vice_mins,
      coalesce(max(coalesce(pt.final_points, 0)) filter (where lp.vice_captain), 0) as vice_pts
    from res
    left join app.fantasy_lineup_players lp on lp.lineup_id = res.lineup_id
    left join app.fantasy_player_gameweek_points pt
      on pt.fantasy_player_id = lp.fantasy_player_id and pt.gameweek_id = res.gameweek_id
    group by res.gameweek_id, res.seq, res.deadline_at, res.scoring_details
  ), eff as (
    select agg.*,
      case when agg.cap_id is null then null
           when agg.cap_mins > 0 then agg.cap_id
           when agg.vice_id is not null and agg.vice_mins > 0 then agg.vice_id end as eff_id,
      case when agg.cap_id is null then null
           when agg.cap_mins > 0 then agg.cap_pts
           when agg.vice_id is not null and agg.vice_mins > 0 then agg.vice_pts end as eff_pts
    from agg
  )
  select eff.gameweek_id, eff.seq,
    pl.display_name, eff.eff_pts, eff.eff_id is not null and eff.eff_id = eff.vice_id and eff.cap_mins = 0,
    eff.best,
    case
      when rules.cap_ignore is not null and eff.deadline_at < rules.cap_ignore then null
      when eff.eff_id is null or eff.best is null or eff.best <= 0 then null
      when eff.scoring_details is not null and eff.scoring_details ? 'effectiveCaptainId'
        and (eff.scoring_details ->> 'effectiveCaptainId') is distinct from eff.eff_id::text then null
      else greatest(0, eff.eff_pts::numeric / eff.best)
    end,
    case
      when rules.cap_ignore is not null and eff.deadline_at < rules.cap_ignore then null
      when eff.eff_id is null or eff.best is null or eff.best <= 0 then null
      when eff.scoring_details is not null and eff.scoring_details ? 'effectiveCaptainId'
        and (eff.scoring_details ->> 'effectiveCaptainId') is distinct from eff.eff_id::text then null
      else eff.eff_pts >= eff.best
    end
  from eff
  cross join rules
  left join app.fantasy_players fp on fp.id = eff.eff_id
  left join app.players pl on pl.id = fp.football_player_id
  order by eff.seq;
$$;
revoke all on function app_private.card_captain_rows(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.card_captain_rows(uuid, uuid) is
  'The effective captain of each evaluable week with the card''s CAP share (null when the card skips the week) and whether the captain was the best starter. Read only; the card''s CAP figure is the mean of the shares. No grant.';

-- Each confirmed, non-Free-Hit transfer with its gain by the card's TRF
-- definition (D4): the in-player's points minus the out-player's over the
-- window of trf_window_gameweeks non-cancelled gameweeks from the batch's, minus
-- the batch's hit divided by its transfers. A batch is ready once its whole
-- window is evaluable or the season's last gameweek is; before that the gain is
-- null (pending). The card's TRF figure is the mean of the ready gains.
create function app_private.card_transfer_rows(p_user uuid, p_season uuid)
returns table (
  transfer_id uuid, gameweek_seq integer, sequence_number integer,
  player_out text, player_in text, point_hit integer, hit_share numeric,
  ready boolean, window_used integer, gain numeric
)
language sql
stable
set search_path = ''
as $$
  with rules as (
    select case when (r.config ->> 'trf_window_gameweeks') ~ '^[0-9]{1,3}$'
      then (r.config ->> 'trf_window_gameweeks')::integer end as window_size
    from app_private.manager_card_rules r where r.active
  ), all_gws as (
    select g.id as gameweek_id, g.sequence_number as seq
    from app.fantasy_gameweeks g
    where g.fantasy_season_id = p_season and g.status <> 'cancelled'
  ), ev as (
    select e.gameweek_id, e.seq from app_private.card_evaluable_gameweeks(p_season) e
  ), batches as (
    select b.id as batch_id, b.point_hit, b.transfers_count, bg.sequence_number as b_seq
    from app.fantasy_transfer_batches b
    join app.fantasy_teams t on t.id = b.fantasy_team_id
      and t.user_id = p_user and t.fantasy_season_id = p_season
    join app.fantasy_gameweeks bg on bg.id = b.gameweek_id
    where b.status = 'confirmed' and b.chip_type is distinct from 'free_hit'
  ), win as (
    select bt.batch_id, a.gameweek_id, a.seq,
      row_number() over (partition by bt.batch_id order by a.seq) as rn
    from batches bt
    join all_gws a on a.seq >= bt.b_seq
  ), win_w as (
    select win.* from win cross join rules where win.rn <= rules.window_size
  ), ready as (
    select ww.batch_id
    from win_w ww
    left join ev on ev.gameweek_id = ww.gameweek_id
    group by ww.batch_id
    having bool_and(ev.gameweek_id is not null)
      or exists (select 1 from ev where ev.seq = (select max(seq) from all_gws))
  ), used as (
    select ww.batch_id, ww.gameweek_id
    from win_w ww
    join ready on ready.batch_id = ww.batch_id
    join ev on ev.gameweek_id = ww.gameweek_id
  )
  select tr.id, bt.b_seq, tr.sequence_number,
    pout.display_name, pin.display_name, bt.point_hit,
    bt.point_hit::numeric / bt.transfers_count,
    ready.batch_id is not null,
    (select count(*)::integer from used u where u.batch_id = bt.batch_id),
    case when ready.batch_id is not null then
      coalesce((
        select sum(case when p.fantasy_player_id = tr.player_in_id
            then coalesce(p.final_points, 0) else -coalesce(p.final_points, 0) end)
        from used u
        join app.fantasy_player_gameweek_points p
          on p.gameweek_id = u.gameweek_id
          and p.fantasy_player_id in (tr.player_in_id, tr.player_out_id)
        where u.batch_id = bt.batch_id), 0)
      - bt.point_hit::numeric / bt.transfers_count
    end
  from batches bt
  join app.fantasy_transfers tr on tr.transfer_batch_id = bt.batch_id
  left join ready on ready.batch_id = bt.batch_id
  join app.fantasy_players fpo on fpo.id = tr.player_out_id
  join app.players pout on pout.id = fpo.football_player_id
  join app.fantasy_players fpi on fpi.id = tr.player_in_id
  join app.players pin on pin.id = fpi.football_player_id
  order by bt.b_seq, tr.sequence_number;
$$;
revoke all on function app_private.card_transfer_rows(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.card_transfer_rows(uuid, uuid) is
  'The confirmed, non-Free-Hit transfers of the manager''s team in the season with their gain by the card''s TRF definition (null while the batch''s window is not yet evaluable). Read only; the card''s TRF figure is the mean of the gains. No grant.';

-- The seasons in which two managers share an active private league, newest
-- first. Both memberships must be active.
create function app_private.card_duel_shared_seasons(p_a uuid, p_b uuid)
returns table (season_id uuid)
language sql
stable
set search_path = ''
as $$
  select fs.id
  from app.fantasy_seasons fs
  where exists (
    select 1
    from app.fantasy_leagues l
    join app.fantasy_league_memberships ma on ma.league_id = l.id and ma.user_id = p_a and ma.status = 'active'
    join app.fantasy_league_memberships mb on mb.league_id = l.id and mb.user_id = p_b and mb.status = 'active'
    where l.fantasy_season_id = fs.id and l.visibility = 'private' and l.active)
  order by fs.starts_at desc, fs.id desc;
$$;
revoke all on function app_private.card_duel_shared_seasons(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.card_duel_shared_seasons(uuid, uuid) is
  'The Fantasy seasons in which two managers are both active members of the same active private league, newest first: the only seasons a duel may compare. No grant.';

-- ---------------------------------------------------------------------------
-- api.get_my_card_career
-- ---------------------------------------------------------------------------
create function api.get_my_card_career(p_season text default null)
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
  v_weeks jsonb;
  v_best jsonb;
  v_worst jsonb;
  v_captain jsonb;
  v_transfers jsonb;
  v_seasons jsonb;
  v_hero jsonb;
begin
  if p_season is not null
    and p_season !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and p_season !~ '^[0-9]{4}/([0-9]{2}|[0-9]{4})$' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
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

  if p_season is null then
    v_season := app_private.manager_card_fantasy_season();
  else
    v_season := app_private.card_resolve_season(p_season);
    if v_season is null then
      raise exception using errcode = 'PT404', message = 'card_season_not_found';
    end if;
  end if;
  if v_season is not null and not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    v_season := null;
  end if;

  -- Week by week: the score, the four stats and OVR as of the week, the captain.
  select coalesce(jsonb_agg(jsonb_build_object(
      'gameweekSeq', w.seq,
      'gameweekName', w.gameweek_name,
      'score', w.score,
      'transferHit', w.transfer_hit,
      'chip', w.chip,
      'ovr', w.ovr,
      'tier', w.tier,
      'provisional', w.provisional,
      'gameweeksCounted', w.gameweeks_counted,
      'stats', jsonb_build_object('cap', w.cap, 'sel', w.sel, 'trf', w.trf, 'con', w.con),
      'raw', jsonb_build_object('cap', w.cap_raw, 'sel', w.sel_raw, 'trf', w.trf_raw, 'con', w.con_raw),
      'captain', case when c.captain_name is not null then jsonb_build_object(
        'name', c.captain_name, 'points', c.captain_points, 'bestStarterPoints', c.best_points,
        'usedVice', c.used_vice, 'share', round(c.share, 6), 'hit', c.hit) end
    ) order by w.seq), '[]'::jsonb)
  into v_weeks
  from app_private.card_week_rows(actor, v_season) w
  left join app_private.card_captain_rows(actor, v_season) c on c.gameweek_id = w.gameweek_id;

  -- The hero line: the first rated OVR of the season and the latest.
  select jsonb_build_object(
      'firstOvr', first_row.ovr, 'firstGameweekSeq', first_row.seq,
      'lastOvr', last_row.ovr, 'lastGameweekSeq', last_row.seq,
      'tier', last_row.tier, 'provisional', last_row.provisional)
  into v_hero
  from (select w.* from app_private.card_week_rows(actor, v_season) w
        where w.ovr is not null order by w.seq asc limit 1) first_row
  cross join (select w.* from app_private.card_week_rows(actor, v_season) w
        where w.ovr is not null order by w.seq desc limit 1) last_row;

  -- Best and worst weeks: the three highest and, of the rest, the three lowest.
  with ranked as (
    select w.*, row_number() over (order by w.score desc, w.seq) as hi
    from app_private.card_week_rows(actor, v_season) w
  ), lows as (
    select r.*, row_number() over (order by r.score asc, r.seq) as lo
    from ranked r where r.hi > 3
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
        'gameweekSeq', r.seq, 'score', r.score,
        'topHalf', app_private.card_week_top_half(r.gameweek_id, v_season, r.score),
        'captain', case when c.captain_name is not null then jsonb_build_object(
          'name', c.captain_name, 'points', c.captain_points, 'usedVice', c.used_vice) end
      ) order by r.hi), '[]'::jsonb)
     from ranked r left join app_private.card_captain_rows(actor, v_season) c on c.gameweek_id = r.gameweek_id
     where r.hi <= 3),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'gameweekSeq', l.seq, 'score', l.score,
        'topHalf', app_private.card_week_top_half(l.gameweek_id, v_season, l.score),
        'captain', case when c.captain_name is not null then jsonb_build_object(
          'name', c.captain_name, 'points', c.captain_points, 'usedVice', c.used_vice) end
      ) order by l.lo), '[]'::jsonb)
     from lows l left join app_private.card_captain_rows(actor, v_season) c on c.gameweek_id = l.gameweek_id
     where l.lo <= 3)
  into v_best, v_worst;

  -- Captain hit rate: how often the captain was the best starter, and the mean
  -- share of the best starter's points (the raw CAP figure).
  select jsonb_build_object(
      'weeksCounted', count(*) filter (where c.share is not null),
      'hits', count(*) filter (where c.hit),
      'averageShare', round(avg(c.share), 6))
  into v_captain
  from app_private.card_captain_rows(actor, v_season) c;

  -- Transfer gains.
  with t as (
    select * from app_private.card_transfer_rows(actor, v_season)
  ), item as (
    select t.*, jsonb_build_object(
        'gameweekSeq', t.gameweek_seq, 'playerOut', t.player_out, 'playerIn', t.player_in,
        'hit', round(t.hit_share, 6), 'gain', round(t.gain, 6),
        'state', case when t.ready then 'counted' else 'pending' end) as j
    from t
  )
  select jsonb_build_object(
      'items', coalesce((select jsonb_agg(item.j order by item.gameweek_seq, item.sequence_number) from item), '[]'::jsonb),
      'byGameweek', coalesce((
        select jsonb_agg(jsonb_build_object('gameweekSeq', g.gameweek_seq, 'gain', round(g.gain, 6), 'transfers', g.n)
          order by g.gameweek_seq)
        from (select t.gameweek_seq, sum(t.gain) as gain, count(*)::integer as n
              from t where t.ready group by t.gameweek_seq) g), '[]'::jsonb),
      'seasonGain', (select round(sum(t.gain), 6) from t where t.ready),
      'averageGain', (select round(avg(t.gain), 6) from t where t.ready),
      'hitsPaid', (select coalesce(sum(w.transfer_hit), 0)::integer
                   from app_private.card_week_rows(actor, v_season) w),
      'best', (select item.j from item where item.ready
               order by item.gain desc, item.gameweek_seq, item.sequence_number limit 1),
      'worst', (select item.j from item where item.ready
                order by item.gain asc, item.gameweek_seq, item.sequence_number limit 1))
  into v_transfers;

  -- Season against season: every season's final figures, newest first.
  select coalesce(jsonb_agg(jsonb_build_object(
      'seasonId', s.id,
      'label', app_private.manager_card_season_label(s.id),
      'ovr', case when s.ok then s.ovr end,
      'tier', case when s.ok and s.ovr is not null then s.tier end,
      'provisional', s.ok and s.ovr is not null and s.provisional,
      'bestTier', (
        select h.tier from app.manager_card_gameweeks h
        where h.user_id = actor and h.fantasy_season_id = s.id
          and h.gameweeks_counted >= (select a.min_rated from app_private.manager_card_active_rules() a)
          and h.ovr is not null and h.tier is not null
        order by app_private.manager_card_tier_rank(h.tier) desc limit 1),
      'gameweeksCounted', s.gameweeks_counted,
      'stats', jsonb_build_object(
        'cap', case when s.ok then s.cap end, 'sel', case when s.ok then s.sel end,
        'trf', case when s.ok then s.trf end, 'con', case when s.ok then s.con end),
      'closedAt', case when s.status = 'completed' then s.ends_at end
    ) order by s.starts_at desc, s.id desc), '[]'::jsonb)
  into v_seasons
  from (
    select fs.id, fs.starts_at, fs.status, fs.ends_at, ms.ovr, ms.tier, ms.provisional,
      ms.cap, ms.sel, ms.trf, ms.con, ms.gameweeks_counted,
      ms.gameweeks_counted >= (select a.min_rated from app_private.manager_card_active_rules() a) as ok
    from app.manager_card_seasons ms
    join app.fantasy_seasons fs on fs.id = ms.fantasy_season_id
    where ms.user_id = actor
  ) s;

  return jsonb_build_object(
    'available', true,
    'locked', false,
    'season', case when v_season is not null then jsonb_build_object(
      'id', v_season, 'label', app_private.manager_card_season_label(v_season)) end,
    'hero', v_hero,
    'weeks', v_weeks,
    'bestWeeks', coalesce(v_best, '[]'::jsonb),
    'worstWeeks', coalesce(v_worst, '[]'::jsonb),
    'captain', coalesce(v_captain, jsonb_build_object('weeksCounted', 0, 'hits', 0, 'averageShare', null)),
    'transfers', coalesce(v_transfers, jsonb_build_object(
      'items', '[]'::jsonb, 'byGameweek', '[]'::jsonb, 'seasonGain', null, 'averageGain', null,
      'hitsPaid', 0, 'best', null, 'worst', null)),
    'seasons', v_seasons
  );
end;
$$;
revoke all on function api.get_my_card_career(text) from public, anon, authenticated, service_role;
grant execute on function api.get_my_card_career(text) to authenticated, service_role;
comment on function api.get_my_card_career(text) is
  'BotolaGO+ « Votre carrière » for a season (default the current one; a Fantasy season id or its label): {available, locked, season, hero, weeks, bestWeeks, worstWeeks, captain, transfers, seasons}. Members only: {available:true, locked:true} and nothing else for anyone else, {available:false} while BotolaGO+ or the Manager Card reads are off (and in preview for a non-member). Everything comes from data the card already computed; nothing is written. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.get_card_duel
-- ---------------------------------------------------------------------------
create function api.get_card_duel(p_other_team uuid, p_season text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  other_user uuid;
  other_season uuid;
  shared uuid[];
  v_season uuid;
  my_team uuid;
  their_team uuid;
  visible boolean;
  my_card jsonb;
  their_card jsonb;
  v_weeks jsonb := '[]'::jsonb;
  v_summary jsonb;
  v_seasons jsonb;
begin
  if p_other_team is null
    or (p_season is not null
      and p_season !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and p_season !~ '^[0-9]{4}/([0-9]{2}|[0-9]{4})$') then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
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
    if mode = 'preview' then
      return jsonb_build_object('available', false);
    end if;
    return jsonb_build_object('available', true, 'locked', true);
  end if;

  -- Every refusal below is the same answer, so nothing says why.
  select t.user_id, t.fantasy_season_id into other_user, other_season
  from app.fantasy_teams t
  join app.profiles p on p.id = t.user_id and p.deleted_at is null
  where t.id = p_other_team;
  if other_user is null or other_user = actor or not exists (
    select 1 from app.profiles me where me.id = actor and me.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'card_duel_not_found';
  end if;
  select coalesce(array_agg(s.season_id order by fs.starts_at desc, fs.id desc), '{}')
  into shared
  from app_private.card_duel_shared_seasons(actor, other_user) s
  join app.fantasy_seasons fs on fs.id = s.season_id;
  if p_season is null then
    v_season := case when other_season = any (shared) then other_season else shared[1] end;
  else
    v_season := app_private.card_resolve_season(p_season);
  end if;
  if v_season is null or not (v_season = any (shared)) then
    raise exception using errcode = 'PT404', message = 'card_duel_not_found';
  end if;

  select t.id into my_team from app.fantasy_teams t
    where t.user_id = actor and t.fantasy_season_id = v_season;
  select t.id into their_team from app.fantasy_teams t
    where t.user_id = other_user and t.fantasy_season_id = v_season;
  visible := coalesce((select v.visible_to_league_mates from app.card_history_visibility v
    where v.user_id = other_user), false);

  -- Today's values: what a league mate's batch card read already shows.
  select c.card || jsonb_build_object('edition', app_private.card_edition_effective(actor, actor))
    into my_card from app_private.manager_card_member_card(array[my_team]) c;
  select c.card || jsonb_build_object('edition', app_private.card_edition_effective(other_user, actor))
    into their_card from app_private.manager_card_member_card(array[their_team]) c;

  select coalesce(jsonb_agg(jsonb_build_object('seasonId', s.season_id,
      'label', app_private.manager_card_season_label(s.season_id)) order by s.ord), '[]'::jsonb)
  into v_seasons
  from unnest(shared) with ordinality as s(season_id, ord);

  if visible then
    with a as (
      select * from app_private.card_week_rows(actor, v_season)
    ), b as (
      select * from app_private.card_week_rows(other_user, v_season)
    ), duel as (
      select a.seq, a.gameweek_name,
        a.score as my_score, b.score as their_score,
        a.ovr as my_ovr, a.tier as my_tier, a.provisional as my_provisional,
        a.cap as my_cap, a.sel as my_sel, a.trf as my_trf, a.con as my_con,
        b.ovr as their_ovr, b.tier as their_tier, b.provisional as their_provisional,
        b.cap as their_cap, b.sel as their_sel, b.trf as their_trf, b.con as their_con,
        case when a.score > b.score then 'me' when a.score < b.score then 'opponent' else 'tie' end as winner
      from a join b on b.seq = a.seq
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'gameweekSeq', d.seq,
        'gameweekName', d.gameweek_name,
        'winner', d.winner,
        'me', jsonb_build_object('score', d.my_score, 'ovr', d.my_ovr, 'tier', d.my_tier,
          'provisional', d.my_provisional,
          'stats', jsonb_build_object('cap', d.my_cap, 'sel', d.my_sel, 'trf', d.my_trf, 'con', d.my_con)),
        'opponent', jsonb_build_object('score', d.their_score, 'ovr', d.their_ovr, 'tier', d.their_tier,
          'provisional', d.their_provisional,
          'stats', jsonb_build_object('cap', d.their_cap, 'sel', d.their_sel, 'trf', d.their_trf, 'con', d.their_con))
      ) order by d.seq), '[]'::jsonb),
      jsonb_build_object(
        'played', count(*),
        'meWins', count(*) filter (where d.winner = 'me'),
        'opponentWins', count(*) filter (where d.winner = 'opponent'),
        'ties', count(*) filter (where d.winner = 'tie'),
        'biggestWin', (select jsonb_build_object('gameweekSeq', x.seq, 'margin', x.my_score - x.their_score)
          from duel x where x.winner = 'me' order by x.my_score - x.their_score desc, x.seq limit 1),
        'biggestLoss', (select jsonb_build_object('gameweekSeq', x.seq, 'margin', x.their_score - x.my_score)
          from duel x where x.winner = 'opponent' order by x.their_score - x.my_score desc, x.seq limit 1),
        'opponentBestCaptain', (select jsonb_build_object(
            'gameweekSeq', c.seq, 'name', c.captain_name, 'points', c.captain_points)
          from app_private.card_captain_rows(other_user, v_season) c
          join duel x on x.seq = c.seq
          where c.captain_name is not null
          order by c.captain_points desc, c.seq limit 1))
    into v_weeks, v_summary
    from duel d;
  end if;

  return jsonb_build_object(
    'available', true,
    'locked', false,
    'season', jsonb_build_object('id', v_season, 'label', app_private.manager_card_season_label(v_season)),
    'seasons', v_seasons,
    'me', jsonb_build_object('teamId', my_team, 'card', my_card),
    'opponent', jsonb_build_object('teamId', their_team, 'card', their_card, 'historyVisible', visible),
    'weeks', v_weeks,
    'summary', v_summary
  );
end;
$$;
revoke all on function api.get_card_duel(uuid, text) from public, anon, authenticated, service_role;
grant execute on function api.get_card_duel(uuid, text) to authenticated, service_role;
comment on function api.get_card_duel(uuid, text) is
  'BotolaGO+ « Face-à-face+ » against a league mate: {available, locked, season, seasons, me, opponent, weeks, summary}. Members only. Only against a manager who shares an active private league with the caller in the season compared; anything else is PT404 card_duel_not_found with no hint why. The opponent''s week-by-week history (weeks, summary) appears only if they switched it on (opponent.historyVisible); otherwise only today''s card values. {available:false} while BotolaGO+ or the Manager Card reads are off. Nothing is written. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- The privacy switch: set it, read it
-- ---------------------------------------------------------------------------
create function api.set_card_history_visibility(p_visible boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
begin
  if p_visible is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  mode := app_private.card_premium_mode();
  if mode is distinct from 'on' and mode is distinct from 'preview' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  -- In preview only members (the owner and staff) take part; once on, everyone
  -- may choose, member or not: a friend of a member is in the duel too.
  if mode = 'preview' and not app_private.has_premium(actor) then
    return jsonb_build_object('available', false);
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'profile_not_found';
  end if;
  insert into app.card_history_visibility (user_id, visible_to_league_mates)
  values (actor, p_visible)
  on conflict (user_id) do update set
    visible_to_league_mates = excluded.visible_to_league_mates;
  return jsonb_build_object('available', true, 'visible', p_visible);
end;
$$;
revoke all on function api.set_card_history_visibility(boolean) from public, anon, authenticated, service_role;
grant execute on function api.set_card_history_visibility(boolean) to authenticated, service_role;
comment on function api.set_card_history_visibility(boolean) is
  'Shows (true) or hides (false) the caller''s Manager Card week-by-week history to league mates in a BotolaGO+ duel: {available, visible}. Hidden until set (default off, plan Q6). Open to any signed-in account once BotolaGO+ is on (in preview, to members only); {available:false} while off, writing nothing. Signed-in, step-up.';

create function api.get_my_card_history_visibility()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
begin
  mode := app_private.card_premium_mode();
  if mode is distinct from 'on' and mode is distinct from 'preview' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if mode = 'preview' and not app_private.has_premium(actor) then
    return jsonb_build_object('available', false);
  end if;
  return jsonb_build_object('available', true, 'visible', coalesce((
    select v.visible_to_league_mates from app.card_history_visibility v where v.user_id = actor), false));
end;
$$;
revoke all on function api.get_my_card_history_visibility() from public, anon, authenticated, service_role;
grant execute on function api.get_my_card_history_visibility() to authenticated, service_role;
comment on function api.get_my_card_history_visibility() is
  'Whether the caller shows their Manager Card history to league mates: {available, visible} (false until set). {available:false} while BotolaGO+ is off (and in preview for a non-member). Signed-in, step-up.';

notify pgrst, 'reload schema';
$bg_20261013100400_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261013100400 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261013100400'
  );
begin
  if encode(sha256(convert_to(part_20261013100400, 'UTF8')), 'hex')
    is distinct from 'a36898dd501eee0fc0e897ef7682ff43e07ca4b112fe0adda317a8ff7ff8600e' then
    raise exception 'stop: 20261013100400 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261013100400;
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
  tbl text := 'app.card_history_visibility';
  rec record;
  premium_mode text;
  career jsonb;
  duel jsonb;
  setter jsonb;
  getter jsonb;
  state jsonb;
begin
  -- The table: row security forced, no right for any API role, no policy, empty.
  if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid = tbl::regclass) then
    problems := problems || ('row security is not forced on ' || tbl);
  end if;
  if exists (select 1 from pg_policies where schemaname = 'app' and tablename = 'card_history_visibility') then
    problems := problems || ('a policy exists on ' || tbl);
  end if;
  foreach who in array array['anon', 'authenticated', 'service_role'] loop
    if has_any_column_privilege(who, tbl::regclass, 'select,insert,update,references')
      or has_table_privilege(who, tbl::regclass, 'delete,truncate,trigger') then
      problems := problems || (who || ' has a right on ' || tbl);
    end if;
  end loop;
  if (select count(*) from app.card_history_visibility) <> 0 then
    problems := problems || 'the privacy table is not empty -- nobody shows their history at the start'::text;
  end if;
  if not exists (select 1 from pg_trigger
    where tgrelid = tbl::regclass
      and tgfoid = 'app_private.refuse_unverified_mfa_actor()'::regprocedure and tgenabled = 'O') then
    problems := problems || ('the step-up trigger is missing on ' || tbl);
  end if;

  -- The api functions: who may run what.
  for rec in select * from (values
    ('api.get_my_card_career(text)', 'authenticated,service_role', 'anon'),
    ('api.get_card_duel(uuid,text)', 'authenticated,service_role', 'anon'),
    ('api.set_card_history_visibility(boolean)', 'authenticated,service_role', 'anon'),
    ('api.get_my_card_history_visibility()', 'authenticated,service_role', 'anon')
  ) as t(signature, may, may_not) loop
    if to_regprocedure(rec.signature) is null then
      problems := problems || (rec.signature || ' is missing');
      continue;
    end if;
    foreach who in array string_to_array(rec.may, ',') loop
      if not has_function_privilege(who, to_regprocedure(rec.signature), 'execute') then
        problems := problems || (who || ' cannot run ' || rec.signature);
      end if;
    end loop;
    foreach who in array string_to_array(rec.may_not || ',public', ',') loop
      if has_function_privilege(who, to_regprocedure(rec.signature), 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
    if not (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
      where p.oid = to_regprocedure(rec.signature)) then
      problems := problems || (rec.signature || ' is not security definer with an empty search_path');
    end if;
  end loop;

  -- Helpers: no API role.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname in ('card_premium_mode', 'card_reads_mode', 'card_resolve_season',
        'card_evaluable_gameweeks', 'card_week_rows', 'card_week_top_half', 'card_captain_rows',
        'card_transfer_rows', 'card_duel_shared_seasons')
  loop
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, rec.oid, 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private'
        and p.proname in ('card_premium_mode', 'card_reads_mode', 'card_resolve_season',
        'card_evaluable_gameweeks', 'card_week_rows', 'card_week_top_half', 'card_captain_rows',
        'card_transfer_rows', 'card_duel_shared_seasons')) <> 9 then
    problems := problems || 'the nine helpers are not all there'::text;
  end if;

  -- Off means off (checked only while BotolaGO+ is off; if it is already on the
  -- reads cannot be called here without a signed-in user).
  select s.mode into premium_mode from app_private.premium_settings s where s.id;
  if premium_mode = 'off' then
    career := api.get_my_card_career();
    duel := api.get_card_duel(gen_random_uuid());
    setter := api.set_card_history_visibility(true);
    getter := api.get_my_card_history_visibility();
    if career is distinct from '{"available": false}'::jsonb
      or duel is distinct from '{"available": false}'::jsonb
      or setter is distinct from '{"available": false}'::jsonb
      or getter is distinct from '{"available": false}'::jsonb then
      problems := problems || ('a read does not answer off while BotolaGO+ is off: '
        || coalesce(career::text, 'nothing') || ' ' || coalesce(duel::text, 'nothing') || ' '
        || coalesce(setter::text, 'nothing') || ' ' || coalesce(getter::text, 'nothing'));
    end if;
    if (select count(*) from app.card_history_visibility) <> 0 then
      problems := problems || 'the off switch function wrote a row'::text;
    end if;
  end if;

  -- No job was added, and the history row is there.
  if (select count(*) from cron.job)::text is distinct from current_setting('bg.premium_reads_jobs', true) then
    problems := problems || 'the number of scheduled jobs changed -- this script adds none'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version = '20261013100400') <> 1 then
    problems := problems || 'the history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  state := jsonb_build_object(
    'premiumMode', premium_mode,
    'privacyRows', (select count(*) from app.card_history_visibility),
    'apiFunctions', 4,
    'helpers', 9,
    'readsWhileOff', case when premium_mode = 'off' then career end,
    'historyRows', 1
  );
  perform set_config('bg.premium_reads_state', state::text, true);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('bg.premium_reads_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.premium_reads_state', true);
  end if;
  raise notice 'premium card reads: applying: %', current_setting('bg.premium_reads_state', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261013100400')
    then 'Applied. The premium card reads are in place and OFF while BotolaGO+ is off; nobody shows their card history to league mates. Next: docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md.'
  else 'NOT applied: nothing was saved (a rehearsal, or a check stopped it).'
end as result;
