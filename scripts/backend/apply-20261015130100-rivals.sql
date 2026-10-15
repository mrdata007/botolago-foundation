-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Rivaux, step 2 of 2: migrations 20261015130100 and 20261015130200
-- (docs/product/botolago-plus-rivals-brief.md). A BotolaGO+ member pins up to three
-- friends from their private leagues and reads a head-to-head after each published
-- journée; an optional notification (in-app and push) tells them when a published result
-- changes who leads.
--
-- IT ADDS
--   * four tables, row security forced and no grant: app.pinned_rivals,
--     app.rival_preferences, app_private.rivals_settings (one row, the tick's
--     switch, OFF) and app_private.rival_lead_notices;
--   * five api functions (get_my_rivals, get_rival_candidates, pin_rival,
--     unpin_rival, set_rivals_notify) for authenticated only, and eight
--     helpers in app_private with no API grant (the switch and the tick for
--     postgres only);
--   * eight notification texts (French and Arabic) of the type added by step 1;
--   * TWO pg_cron jobs: rivals-tick (minutes 7, 22, 37 and 52; does nothing while
--     app_private.rivals_settings.enabled is false) and rivals-history-prune (daily
--     03:59 UTC; deletes only this tick's cron.job_run_details older than 7 days and
--     its own notice records older than 365 days).
-- IT REPLACES NOTHING: the card reads, the duel, the privacy switch, the notification
-- rendering and the quiet-hours helper stay exactly as they are -- the script checks it.
--
-- IT SHIPS OFF. Every api function answers {"available": false} while BotolaGO+ or the
-- Manager Card reads are off, and the tick creates nothing until the owner runs
-- select app_private.rivals_configure(true). A friend's captain and transfers are
-- shown only when that friend switched their card history on (unchanged, default off).
--
-- WHEN
--   After step 1 (apply-20261015130000-rivals-notification-type.sql) has SAVED, after
--   the premium card reads are applied here, after the pull request that adds this
--   file is merged and its database-quality job passed. Staging first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * This script is a writer: it creates tables, functions, rows and two scheduled
--     jobs. Make sure nothing else is writing to this database: no GitHub Actions
--     run in progress, no other query running, no other agent or workflow working
--     on the database. Nothing needs pausing: it touches no existing table or job (it replaces two
--     immutable push rules, notification_push_topic and notification_push_ttl).
--   * Production: write down that you ran it, which database, and the counts the
--     result row shows (the rehearsal prints them).
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every
--      guard and every check runs on the real code path inside one transaction,
--      and the script ends with a deliberate error whose message carries the
--      state it computed ("REHEARSAL PASSED -- nothing was saved: {...}"). That
--      error is the expected, good outcome: it rolls everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select to_regclass('app.pinned_rivals') is null as rolled_back;
--      It must say true.
--   4. In the line `select set_config('bg.rivals_mode', 'rehearsal', true);`
--      near the top, change 'rehearsal' to 'apply' and press Run again. The
--      result row says "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of its objects exist, or where the
--     migrations it builds on (the premium foundation and card reads) or step 1
--     are not recorded;
--   * records both migration files in supabase_migrations.schema_migrations, each
--     whole as statements[1], and runs them from that record, in order, once each
--     sha256 matches the repository file;
--   * checks the result without saving anything: grants, security definer with an
--     empty search_path, volatility; row security forced on the four tables; the
--     switch off; eight texts; the two jobs; the tick answering "off"; the read
--     answering "off" while BotolaGO+ is off; the push rules knowing the new type
--     and the other existing functions unchanged;
--     exactly four tables and two jobs added.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.rivals_mode', 'rehearsal', true);

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
  if exists (select 1 from supabase_migrations.schema_migrations where version in ('20261015130100', '20261015130200')) then
    raise exception 'stop: one of these migrations is already recorded as applied';
  end if;
  foreach needed in array array['20261008123300', '20261010120200', '20261012200100', '20261013100000', '20261013100100', '20261013100200', '20261013100300', '20261013100400', '20261015130000'] loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = needed) then
      missing := missing || needed;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: migrations this builds on are not applied yet (step 1 included): %', missing;
  end if;
  if not exists (select 1 from pg_enum e where e.enumtypid = 'app.notification_type'::regtype
      and e.enumlabel = 'rival_lead_change') then
    raise exception 'stop: app.notification_type has no rival_lead_change value -- step 1 has not saved';
  end if;
  foreach needed in array array[
    'app.profiles', 'app.fantasy_teams', 'app.fantasy_seasons', 'app.fantasy_gameweeks',
    'app.fantasy_leagues', 'app.fantasy_league_memberships', 'app.fantasy_team_gameweek_results',
    'app.card_history_visibility', 'app.notifications', 'app.notification_deliveries',
    'app.notification_templates', 'app.user_preferences', 'app_private.notification_events',
    'app_private.premium_settings', 'app_private.fantasy_gameweek_postwork', 'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.assert_mfa_step_up()', 'app_private.refuse_unverified_mfa_actor()',
    'app_private.set_updated_at()', 'app_private.has_premium(uuid,timestamptz)',
    'app_private.manager_card_fantasy_season()', 'app_private.manager_card_season_label(uuid)',
    'app_private.card_reads_mode()', 'app_private.card_resolve_season(text)',
    'app_private.card_evaluable_gameweeks(uuid)', 'app_private.card_captain_rows(uuid,uuid)',
    'app_private.card_transfer_rows(uuid,uuid)',
    'app_private.render_notification_template(text,text[],jsonb)'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'api' and p.proname in ('get_my_rivals', 'get_rival_candidates', 'pin_rival', 'unpin_rival', 'set_rivals_notify'))
      or (n.nspname = 'app_private' and p.proname like 'rivals\_%')) then
    raise exception 'stop: one of the Rivaux functions already exists';
  end if;
  if to_regclass('app.pinned_rivals') is not null or to_regclass('app.rival_preferences') is not null
    or to_regclass('app_private.rivals_settings') is not null or to_regclass('app_private.rival_lead_notices') is not null then
    raise exception 'stop: one of the Rivaux tables already exists';
  end if;
  if exists (select 1 from cron.job where jobname in ('rivals-tick', 'rivals-history-prune')) then
    raise exception 'stop: a Rivaux scheduled job already exists';
  end if;
  -- The push rules this replaces must be the ones of 20261012200100 (the rating change known, the
  -- new type not yet).
  if app_private.notification_push_topic('manager_card_ovr_change') is distinct from 'fantasy'
    or app_private.notification_push_ttl('manager_card_ovr_change') is distinct from interval '12 hours'
    or app_private.notification_push_topic('rival_lead_change') is not null then
    raise exception 'stop: the push rules are not the ones this script replaces (20261012200100 missing, or already replaced)';
  end if;
  -- Remember what is there, compare afterwards.
  perform set_config('bg.rivals_jobs', (select count(*) from cron.job)::text, true);
  perform set_config('bg.rivals_tables', (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text, true);
  perform set_config('bg.rivals_defs', (select string_agg(
      p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in (
      'api.get_my_card_career(text)'::regprocedure,
      'api.get_card_duel(uuid,text)'::regprocedure,
      'api.get_card_league_context(uuid,text,uuid)'::regprocedure,
      'api.set_card_history_visibility(boolean)'::regprocedure,
      'api.get_my_card_history_visibility()'::regprocedure,
      'app_private.card_week_rows(uuid,uuid)'::regprocedure,
      'app_private.card_captain_rows(uuid,uuid)'::regprocedure,
      'app_private.card_transfer_rows(uuid,uuid)'::regprocedure,
      'app_private.card_evaluable_gameweeks(uuid)'::regprocedure,
      'app_private.has_premium(uuid,timestamptz)'::regprocedure,
      'app_private.render_notification_template(text,text[],jsonb)'::regprocedure,
      'app_private.defer_for_quiet_hours(timestamptz,text,boolean,time without time zone,time without time zone,boolean)'::regprocedure)), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migration file(s), exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261015130100',
  'rivals',
  array[$bg_20261015130100_file$-- BotolaGO+ Rivaux, migration 2 of 3: pinned rivals, the head-to-head read and their text.
--
-- A member pins up to three friends (managers who share an ACTIVE PRIVATE league with them in the
-- season) and reads, for each one, a head-to-head summary after every published journée. Owner
-- decisions, 2026-10-15: the shared image shows the friend's full name (the name the league already
-- shows to its members); nothing about a card rating ever leaves the app.
--
-- WHAT IS ADDED
--   app.pinned_rivals          who pins whom, per season, places 1 to 3. Row security forced, no
--                              grant: written only by api.pin_rival / api.unpin_rival.
--   app.rival_preferences      one row per user: notify_lead_change (OFF by default) and when it was
--                              last changed. Written only by api.set_rivals_notify.
--   app_private.rivals_settings  the tick's switch (OFF), changed only by rivals_configure.
--   app_private.rivals_leader, rivals_shared_league, rivals_pair, rivals_card: read-only helpers.
--   api.get_my_rivals, get_rival_candidates, pin_rival, unpin_rival, set_rivals_notify.
--   The text of the notification, French and Arabic (the type was added by 20261015130000).
-- The tick that creates the notification, and its schedule, are in 20261015130200.
--
-- WHAT IS NOT TOUCHED. No score, rating, tier or rank is computed or stored: every figure is the sum
-- of the final results Fantasy already stored, over the card's own evaluable journées
-- (app_private.card_evaluable_gameweeks), so a figure exists only once its result is published. The
-- card, the duel and the privacy switch (app.card_history_visibility, default off) are unchanged.
--
-- PRIVACY. What every league mate already sees: each journée's points and the running total. A
-- friend's captain and transfer come back ONLY when they switched their card history on
-- (historyVisible). The friend is not told they are pinned: nothing reads the pins but their owner.
-- A pin whose two managers no longer share an active private league that season is not returned, and
-- is dropped the next time the owner pins someone (so it never holds one of the three places).
--
-- SHIPS OFF like the rest of BotolaGO+: every api function answers {"available": false} while
-- BotolaGO+ or the Manager Card reads are off (and, in preview, to a non-member), writing nothing.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table app.pinned_rivals (
  user_id uuid not null references app.profiles(id) on delete cascade,
  rival_user_id uuid not null references app.profiles(id) on delete cascade,
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete restrict,
  slot smallint not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint pinned_rivals_pkey primary key (user_id, fantasy_season_id, rival_user_id),
  constraint pinned_rivals_slot_key unique (user_id, fantasy_season_id, slot),
  constraint pinned_rivals_slot_check check (slot between 1 and 3),
  constraint pinned_rivals_self_check check (user_id <> rival_user_id)
);
create index pinned_rivals_rival_idx on app.pinned_rivals (rival_user_id);
create trigger pinned_rivals_refuse_unverified_mfa_actor
before insert or update or delete on app.pinned_rivals
for each statement execute function app_private.refuse_unverified_mfa_actor();
alter table app.pinned_rivals enable row level security;
alter table app.pinned_rivals force row level security;
revoke all on app.pinned_rivals from public, anon, authenticated, service_role;
comment on table app.pinned_rivals is
  'BotolaGO+ Rivaux: the friends a member pinned in a season (at most three, places 1 to 3). Written only by api.pin_rival and api.unpin_rival; removed with either account. No grant.';

create table app.rival_preferences (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  notify_lead_change boolean not null default false,
  notify_changed_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
create trigger rival_preferences_set_updated_at
before update on app.rival_preferences
for each row execute function app_private.set_updated_at();
create trigger rival_preferences_refuse_unverified_mfa_actor
before insert or update or delete on app.rival_preferences
for each statement execute function app_private.refuse_unverified_mfa_actor();
alter table app.rival_preferences enable row level security;
alter table app.rival_preferences force row level security;
revoke all on app.rival_preferences from public, anon, authenticated, service_role;
comment on table app.rival_preferences is
  'BotolaGO+ Rivaux: whether a member wants a notification when a published result changes who leads against a pinned rival (off until they turn it on). Written only by api.set_rivals_notify. No grant.';

-- The tick's switch. One row, OFF.
create table app_private.rivals_settings (
  id boolean primary key default true,
  enabled boolean not null default false,
  updated_at timestamptz not null default statement_timestamp(),
  constraint rivals_settings_singleton check (id)
);
insert into app_private.rivals_settings (id, enabled) values (true, false);
alter table app_private.rivals_settings enable row level security;
alter table app_private.rivals_settings force row level security;
revoke all on app_private.rivals_settings from public, anon, authenticated, service_role;
comment on table app_private.rivals_settings is
  'BotolaGO+ Rivaux: enabled says whether the lead-change tick may create notifications. Off by default; changed only by app_private.rivals_configure. No grant.';

create function app_private.rivals_configure(p_enabled boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare result app_private.rivals_settings%rowtype;
begin
  if p_enabled is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  update app_private.rivals_settings set enabled = p_enabled, updated_at = statement_timestamp()
  where id
  returning * into result;
  return jsonb_build_object('enabled', result.enabled);
end;
$$;
revoke all on function app_private.rivals_configure(boolean)
  from public, anon, authenticated, service_role;
grant execute on function app_private.rivals_configure(boolean) to postgres;
comment on function app_private.rivals_configure(boolean) is
  'Owner-run switch for the Rivaux lead-change tick (true or false). Executable by postgres only.';

-- ---------------------------------------------------------------------------
-- Helpers (app_private, no grant at all, not callable by any API role)
-- ---------------------------------------------------------------------------

-- Who leads on two totals: 'me', 'rival', 'tie', or null when either is unknown.
create function app_private.rivals_leader(p_me integer, p_rival integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_me is null or p_rival is null then null
    when p_me > p_rival then 'me'
    when p_me < p_rival then 'rival'
    else 'tie'
  end;
$$;
revoke all on function app_private.rivals_leader(integer, integer)
  from public, anon, authenticated, service_role;
comment on function app_private.rivals_leader(integer, integer) is
  'Who leads on two totals (me, rival, tie), null when either is unknown. No grant.';

-- The active private league two managers share in a season: the one with the most members, then
-- the lowest id (the order the leagues list uses). No row when they share none.
create function app_private.rivals_shared_league(p_a uuid, p_b uuid, p_season uuid)
returns table (league_id uuid, league_name text)
language sql
stable
set search_path = ''
as $$
  select l.id, l.name
  from app.fantasy_leagues l
  join app.fantasy_league_memberships ma
    on ma.league_id = l.id and ma.user_id = p_a and ma.status = 'active'
  join app.fantasy_league_memberships mb
    on mb.league_id = l.id and mb.user_id = p_b and mb.status = 'active'
  where l.fantasy_season_id = p_season and l.visibility = 'private' and l.active
  order by l.member_count desc, l.id
  limit 1;
$$;
revoke all on function app_private.rivals_shared_league(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.rivals_shared_league(uuid, uuid, uuid) is
  'The active private league two managers share in a season (most members, then lowest id); no row when none. No grant.';

-- One row per evaluable journée of the season: both managers' final score (null where one has no
-- final result), the total of each through that journée and when the journée was published.
create function app_private.rivals_pair(p_actor uuid, p_rival uuid, p_season uuid)
returns table (
  seq integer, gameweek_id uuid, gameweek_name text,
  published_at timestamptz, corrected_at timestamptz,
  me integer, rival integer, me_total integer, rival_total integer
)
language sql
stable
set search_path = ''
as $$
  with ev as (
    select e.gameweek_id, e.seq, g.name, g.finalized_at, g.corrected_at
    from app_private.card_evaluable_gameweeks(p_season) e
    join app.fantasy_gameweeks g on g.id = e.gameweek_id
  ), sc as (
    select ev.*,
      (select max(r.final_score) from app.fantasy_team_gameweek_results r
        join app.fantasy_teams t on t.id = r.fantasy_team_id
        where t.user_id = p_actor and t.fantasy_season_id = p_season
          and r.gameweek_id = ev.gameweek_id and r.state = 'final') as me,
      (select max(r.final_score) from app.fantasy_team_gameweek_results r
        join app.fantasy_teams t on t.id = r.fantasy_team_id
        where t.user_id = p_rival and t.fantasy_season_id = p_season
          and r.gameweek_id = ev.gameweek_id and r.state = 'final') as rival
    from ev
  )
  select sc.seq, sc.gameweek_id, sc.name, sc.finalized_at, sc.corrected_at,
    sc.me::integer, sc.rival::integer,
    (sum(sc.me) over (order by sc.seq))::integer,
    (sum(sc.rival) over (order by sc.seq))::integer
  from sc
  order by sc.seq;
$$;
revoke all on function app_private.rivals_pair(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.rivals_pair(uuid, uuid, uuid) is
  'Both managers'' final score and running total per evaluable journée of a season, with when the journée was published and corrected. Read only. No grant.';

-- The head-to-head of one rival as one jsonb. p_visible is the rival's own card-history switch:
-- only then do their captain and last transfer come back.
create function app_private.rivals_card(p_actor uuid, p_rival uuid, p_season uuid, p_visible boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with p as (
    select * from app_private.rivals_pair(p_actor, p_rival, p_season)
  ), lw as (
    select * from p order by seq desc limit 1
  ), pw as (
    select * from p order by seq desc offset 1 limit 1
  ), cap as (
    select c.seq, c.captain_name, c.captain_points from app_private.card_captain_rows(p_actor, p_season) c
    where c.seq = (select seq from lw)
  ), rcap as (
    select c.seq, c.captain_name, c.captain_points from app_private.card_captain_rows(p_rival, p_season) c
    where p_visible and c.seq = (select seq from lw)
  ), rtr as (
    select t.player_in, t.ready, t.gain from app_private.card_transfer_rows(p_rival, p_season) t
    where p_visible and t.gameweek_seq = (select seq from lw)
    order by t.sequence_number desc
    limit 1
  )
  select jsonb_build_object(
    'last', (select jsonb_build_object(
        'seq', l.seq, 'name', l.gameweek_name,
        'publishedAt', l.published_at, 'correctedAt', l.corrected_at,
        'me', l.me, 'rival', l.rival, 'meTotal', l.me_total, 'rivalTotal', l.rival_total,
        'leader', app_private.rivals_leader(l.me_total, l.rival_total),
        'leaderBefore', (select app_private.rivals_leader(x.me_total, x.rival_total) from pw x))
      from lw l),
    'tally', jsonb_build_object(
      'played', (select count(*)::integer from p where p.me is not null and p.rival is not null),
      'won', (select count(*)::integer from p where p.me > p.rival),
      'lost', (select count(*)::integer from p where p.me < p.rival),
      'tied', (select count(*)::integer from p where p.me = p.rival)),
    'biggestWin', (select jsonb_build_object('seq', p.seq, 'me', p.me, 'rival', p.rival, 'margin', p.me - p.rival)
      from p where p.me > p.rival order by p.me - p.rival desc, p.seq limit 1),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('seq', p.seq, 'me', p.me, 'rival', p.rival) order by p.seq)
      from p), '[]'::jsonb),
    'captain', case when p_visible then jsonb_build_object(
      'me', (select jsonb_build_object('name', c.captain_name, 'points', c.captain_points) from cap c),
      'rival', (select jsonb_build_object('name', c.captain_name, 'points', c.captain_points) from rcap c)) end,
    'transfer', case when p_visible then
      (select jsonb_build_object('playerIn', t.player_in, 'pending', not t.ready,
        'gain', case when t.ready then t.gain end) from rtr t) end
  );
$$;
revoke all on function app_private.rivals_card(uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
comment on function app_private.rivals_card(uuid, uuid, uuid, boolean) is
  'The head-to-head of one rival for api.get_my_rivals: the last published journée, the tally, the biggest win, the journée by journée scores and, only when p_visible, the captain and the rival''s last transfer. Read only. No grant.';

-- The gate every api function here shares: the BotolaGO+ mode, the step-up, the caller and the
-- membership. Returns the caller, or null with p_answer set to the answer to give instead.
create function app_private.rivals_gate(out p_actor uuid, out p_answer jsonb)
language plpgsql
stable
set search_path = ''
as $$
declare mode text;
begin
  mode := app_private.card_reads_mode();
  if mode is distinct from 'on' and mode is distinct from 'preview' then
    p_answer := jsonb_build_object('available', false);
    return;
  end if;
  perform app_private.assert_mfa_step_up();
  p_actor := (select auth.uid());
  if p_actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not app_private.has_premium(p_actor) then
    p_actor := null;
    -- In preview only members see anything; once on, the screen shows its lock.
    p_answer := case when mode = 'preview' then jsonb_build_object('available', false)
      else jsonb_build_object('available', true, 'locked', true) end;
    return;
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = p_actor and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'profile_not_found';
  end if;
end;
$$;
revoke all on function app_private.rivals_gate()
  from public, anon, authenticated, service_role;
comment on function app_private.rivals_gate() is
  'The shared gate of the Rivaux api functions: {available:false} while off, the step-up, the caller (PT401), {locked:true} for a non-member. Returns the caller or an answer to give. No grant.';

-- A season given as text, or the current one; PT400 for a malformed text, PT404 for an unknown one.
create function app_private.rivals_season(p_season text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare v_season uuid;
begin
  if p_season is not null
    and p_season !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and p_season !~ '^[0-9]{4}/([0-9]{2}|[0-9]{4})$' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_season is null then
    return app_private.manager_card_fantasy_season();
  end if;
  v_season := app_private.card_resolve_season(p_season);
  if v_season is null then
    raise exception using errcode = 'PT404', message = 'card_season_not_found';
  end if;
  return v_season;
end;
$$;
revoke all on function app_private.rivals_season(text)
  from public, anon, authenticated, service_role;
comment on function app_private.rivals_season(text) is
  'The Fantasy season a Rivaux call means: the text given, else the current one. No grant.';

-- ---------------------------------------------------------------------------
-- api.get_my_rivals
-- ---------------------------------------------------------------------------
create function api.get_my_rivals(p_season text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  gate record;
  v_season uuid;
  me_name text;
  me_total integer;
  notify boolean;
  items jsonb;
begin
  -- The argument check comes first, before anything that depends on who asks.
  if p_season is not null
    and p_season !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and p_season !~ '^[0-9]{4}/([0-9]{2}|[0-9]{4})$' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into gate from app_private.rivals_gate();
  if gate.p_actor is null then
    return gate.p_answer;
  end if;
  v_season := app_private.rivals_season(p_season);
  notify := coalesce((select r.notify_lead_change from app.rival_preferences r
    where r.user_id = gate.p_actor), false);
  if v_season is null then
    return jsonb_build_object('available', true, 'locked', false, 'season', null,
      'max', 3, 'notify', notify, 'me', null, 'rivals', '[]'::jsonb);
  end if;

  select coalesce(nullif(btrim(pr.display_name), ''), t.name) into me_name
  from app.fantasy_teams t join app.profiles pr on pr.id = t.user_id
  where t.user_id = gate.p_actor and t.fantasy_season_id = v_season
  limit 1;
  select coalesce(sum(r.final_score), 0)::integer into me_total
  from app.fantasy_team_gameweek_results r
  join app.fantasy_teams t on t.id = r.fantasy_team_id
  join app_private.card_evaluable_gameweeks(v_season) ev on ev.gameweek_id = r.gameweek_id
  where t.user_id = gate.p_actor and t.fantasy_season_id = v_season and r.state = 'final';

  select coalesce(jsonb_agg(item.j order by item.slot), '[]'::jsonb) into items
  from (
    select pin.slot,
      jsonb_build_object(
        'teamId', rt.id,
        'name', coalesce(nullif(btrim(rp.display_name), ''), rt.name),
        'position', pin.slot,
        'league', jsonb_build_object('id', sl.league_id, 'name', sl.league_name),
        'historyVisible', coalesce(v.visible_to_league_mates, false)
      ) || app_private.rivals_card(gate.p_actor, pin.rival_user_id, v_season,
        coalesce(v.visible_to_league_mates, false)) as j
    from app.pinned_rivals pin
    join app.profiles rp on rp.id = pin.rival_user_id and rp.deleted_at is null
    join app.fantasy_teams rt on rt.user_id = pin.rival_user_id
      and rt.fantasy_season_id = v_season and rt.status = 'active'
    cross join lateral app_private.rivals_shared_league(gate.p_actor, pin.rival_user_id, v_season) sl
    left join app.card_history_visibility v on v.user_id = pin.rival_user_id
    where pin.user_id = gate.p_actor and pin.fantasy_season_id = v_season
  ) item;

  return jsonb_build_object(
    'available', true, 'locked', false,
    'season', jsonb_build_object('id', v_season, 'label', app_private.manager_card_season_label(v_season)),
    'max', 3,
    'notify', notify,
    'me', jsonb_build_object('name', me_name, 'total', me_total),
    'rivals', items);
end;
$$;
revoke all on function api.get_my_rivals(text) from public, anon, authenticated, service_role;
grant execute on function api.get_my_rivals(text) to authenticated;
comment on function api.get_my_rivals(text) is
  'BotolaGO+ Rivaux: the caller''s pinned rivals of the season, each with the last published journée (scores, totals, leader before and after, when published and corrected), the tally, the biggest win and the journée by journée scores, the shared league and, only when the rival shows their card history, their captain and last transfer. {available, locked, season, max, notify, me, rivals}. Members only: {available:true, locked:true} for anyone else, {available:false} while off. A pin whose managers no longer share an active private league is not returned. Nothing is written. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.get_rival_candidates: the league mates a member could pin
-- ---------------------------------------------------------------------------
create function api.get_rival_candidates(p_season text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  gate record;
  v_season uuid;
begin
  if p_season is not null
    and p_season !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and p_season !~ '^[0-9]{4}/([0-9]{2}|[0-9]{4})$' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into gate from app_private.rivals_gate();
  if gate.p_actor is null then
    return gate.p_answer;
  end if;
  v_season := app_private.rivals_season(p_season);
  return jsonb_build_object('available', true, 'locked', false,
    'candidates', coalesce((
      select jsonb_agg(c.j order by c.name collate "C", c.team_id)
      from (
        select rt.id as team_id, coalesce(nullif(btrim(rp.display_name), ''), rt.name) as name,
          jsonb_build_object('teamId', rt.id,
            'name', coalesce(nullif(btrim(rp.display_name), ''), rt.name),
            'league', jsonb_build_object('id', sl.league_id, 'name', sl.league_name)) as j
        from app.fantasy_league_memberships mem
        join app.fantasy_leagues l on l.id = mem.league_id and l.fantasy_season_id = v_season
          and l.visibility = 'private' and l.active
        join app.fantasy_league_memberships other on other.league_id = l.id
          and other.status = 'active' and other.user_id <> gate.p_actor
        join app.profiles rp on rp.id = other.user_id and rp.deleted_at is null
        join app.fantasy_teams rt on rt.id = other.fantasy_team_id and rt.status = 'active'
        cross join lateral app_private.rivals_shared_league(gate.p_actor, other.user_id, v_season) sl
        where mem.user_id = gate.p_actor and mem.status = 'active'
          and not exists (
            select 1 from app.pinned_rivals pin
            where pin.user_id = gate.p_actor and pin.fantasy_season_id = v_season
              and pin.rival_user_id = other.user_id)
        group by rt.id, rp.display_name, rt.name, sl.league_id, sl.league_name
        order by coalesce(nullif(btrim(rp.display_name), ''), rt.name) collate "C", rt.id
        limit 50
      ) c), '[]'::jsonb));
end;
$$;
revoke all on function api.get_rival_candidates(text) from public, anon, authenticated, service_role;
grant execute on function api.get_rival_candidates(text) to authenticated;
comment on function api.get_rival_candidates(text) is
  'BotolaGO+ Rivaux: the managers who share an active private league with the caller in the season and are not pinned yet (at most 50): {available, locked, candidates: [{teamId, name, league}]}. Members only. Nothing is written. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.pin_rival / api.unpin_rival / api.set_rivals_notify
-- ---------------------------------------------------------------------------
create function api.pin_rival(p_rival_team uuid, p_season text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  gate record;
  v_season uuid;
  rival_user uuid;
  free_slot smallint;
  taken integer;
begin
  if p_rival_team is null
    or (p_season is not null
      and p_season !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and p_season !~ '^[0-9]{4}/([0-9]{2}|[0-9]{4})$') then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into gate from app_private.rivals_gate();
  if gate.p_actor is null then
    return gate.p_answer;
  end if;
  v_season := app_private.rivals_season(p_season);
  if v_season is null then
    raise exception using errcode = 'PT404', message = 'rival_not_found';
  end if;
  -- One pin at a time per member, so the three places cannot be overfilled.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(gate.p_actor::text || ':rivals', 0));

  -- A rival must be another manager who shares an active private league with the caller.
  select t.user_id into rival_user
  from app.fantasy_teams t
  join app.profiles rp on rp.id = t.user_id and rp.deleted_at is null
  where t.id = p_rival_team and t.fantasy_season_id = v_season and t.status = 'active'
    and t.user_id <> gate.p_actor
    and exists (select 1 from app_private.rivals_shared_league(gate.p_actor, t.user_id, v_season));
  if rival_user is null then
    raise exception using errcode = 'PT404', message = 'rival_not_found';
  end if;

  -- Pins whose two managers no longer share a league (or whose rival is gone) free their place.
  delete from app.pinned_rivals pin
  where pin.user_id = gate.p_actor and pin.fantasy_season_id = v_season
    and (not exists (select 1 from app_private.rivals_shared_league(gate.p_actor, pin.rival_user_id, v_season))
      or not exists (select 1 from app.profiles rp where rp.id = pin.rival_user_id and rp.deleted_at is null));

  if exists (select 1 from app.pinned_rivals pin
    where pin.user_id = gate.p_actor and pin.fantasy_season_id = v_season and pin.rival_user_id = rival_user) then
    select count(*)::integer into taken from app.pinned_rivals pin
    where pin.user_id = gate.p_actor and pin.fantasy_season_id = v_season;
    return jsonb_build_object('available', true, 'locked', false, 'pinned', true, 'count', taken);
  end if;

  select p.n into free_slot
  from generate_series(1, 3) p(n)
  where not exists (select 1 from app.pinned_rivals pin
    where pin.user_id = gate.p_actor and pin.fantasy_season_id = v_season and pin.slot = p.n)
  order by p.n
  limit 1;
  if free_slot is null then
    raise exception using errcode = 'PT409', message = 'rivals_full';
  end if;
  insert into app.pinned_rivals (user_id, rival_user_id, fantasy_season_id, slot)
  values (gate.p_actor, rival_user, v_season, free_slot);
  select count(*)::integer into taken from app.pinned_rivals pin
  where pin.user_id = gate.p_actor and pin.fantasy_season_id = v_season;
  return jsonb_build_object('available', true, 'locked', false, 'pinned', true, 'count', taken);
end;
$$;
revoke all on function api.pin_rival(uuid, text) from public, anon, authenticated, service_role;
grant execute on function api.pin_rival(uuid, text) to authenticated;
comment on function api.pin_rival(uuid, text) is
  'BotolaGO+ Rivaux: pins a league mate (their Fantasy team id) as a rival for the season: {available, locked, pinned, count}. The rival must share an active private league with the caller (else PT404 rival_not_found, with no hint why); at most three (PT409 rivals_full); pinning a pinned rival is a no-op. Members only. The rival is not told. Signed-in, step-up.';

create function api.unpin_rival(p_rival_team uuid, p_season text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  gate record;
  v_season uuid;
  removed integer;
begin
  if p_rival_team is null
    or (p_season is not null
      and p_season !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and p_season !~ '^[0-9]{4}/([0-9]{2}|[0-9]{4})$') then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into gate from app_private.rivals_gate();
  if gate.p_actor is null then
    return gate.p_answer;
  end if;
  v_season := app_private.rivals_season(p_season);
  delete from app.pinned_rivals pin
  where pin.user_id = gate.p_actor and pin.fantasy_season_id = v_season
    and pin.rival_user_id = (select t.user_id from app.fantasy_teams t
      where t.id = p_rival_team and t.fantasy_season_id = v_season);
  get diagnostics removed = row_count;
  return jsonb_build_object('available', true, 'locked', false, 'removed', removed);
end;
$$;
revoke all on function api.unpin_rival(uuid, text) from public, anon, authenticated, service_role;
grant execute on function api.unpin_rival(uuid, text) to authenticated;
comment on function api.unpin_rival(uuid, text) is
  'BotolaGO+ Rivaux: removes a pinned rival (their Fantasy team id) of the season: {available, locked, removed}. Removing one that is not pinned removes none. Members only. Signed-in, step-up.';

create function api.set_rivals_notify(p_enabled boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare gate record;
begin
  if p_enabled is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into gate from app_private.rivals_gate();
  if gate.p_actor is null then
    return gate.p_answer;
  end if;
  insert into app.rival_preferences (user_id, notify_lead_change, notify_changed_at)
  values (gate.p_actor, p_enabled, statement_timestamp())
  on conflict (user_id) do update set
    notify_lead_change = excluded.notify_lead_change,
    notify_changed_at = case when app.rival_preferences.notify_lead_change is distinct from excluded.notify_lead_change
      then statement_timestamp() else app.rival_preferences.notify_changed_at end;
  return jsonb_build_object('available', true, 'locked', false, 'notify', p_enabled);
end;
$$;
revoke all on function api.set_rivals_notify(boolean) from public, anon, authenticated, service_role;
grant execute on function api.set_rivals_notify(boolean) to authenticated;
comment on function api.set_rivals_notify(boolean) is
  'BotolaGO+ Rivaux: turns the lead-change notification on or off for the caller (off until turned on): {available, locked, notify}. A journée published before it was turned on is never told. Members only. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- The text, French and Arabic. No AI notice, no model credit.
-- ---------------------------------------------------------------------------
insert into app.notification_templates (
  template_key, notification_type, category, channel, language, version,
  title_template, body_template, required_variables, max_title_length,
  max_body_length, active, activated_at
) values
  ('rival_lead_rival', 'rival_lead_change', 'fantasy', 'in_app', 'fr', 1,
    '{{rival}} vous passe devant',
    '{{rival_total}} contre {{my_total}} après la journée {{gameweek}}.',
    array['rival', 'rival_total', 'my_total', 'gameweek'], 120, 300, true, statement_timestamp()),
  ('rival_lead_rival', 'rival_lead_change', 'fantasy', 'in_app', 'ar', 1,
    '{{rival}} يتقدّم عليك',
    '{{rival_total}} مقابل {{my_total}} بعد الجولة {{gameweek}}.',
    array['rival', 'rival_total', 'my_total', 'gameweek'], 120, 300, true, statement_timestamp()),
  ('rival_lead_you', 'rival_lead_change', 'fantasy', 'in_app', 'fr', 1,
    'Vous passez devant {{rival}}',
    '{{my_total}} contre {{rival_total}} après la journée {{gameweek}}.',
    array['rival', 'rival_total', 'my_total', 'gameweek'], 120, 300, true, statement_timestamp()),
  ('rival_lead_you', 'rival_lead_change', 'fantasy', 'in_app', 'ar', 1,
    'تتقدّم على {{rival}}',
    '{{my_total}} مقابل {{rival_total}} بعد الجولة {{gameweek}}.',
    array['rival', 'rival_total', 'my_total', 'gameweek'], 120, 300, true, statement_timestamp()),
  ('rival_lead_rival_corrected', 'rival_lead_change', 'fantasy', 'in_app', 'fr', 1,
    '{{rival}} vous passe devant',
    'Résultat corrigé, journée {{gameweek}} : {{rival_total}} contre {{my_total}}.',
    array['rival', 'rival_total', 'my_total', 'gameweek'], 120, 300, true, statement_timestamp()),
  ('rival_lead_rival_corrected', 'rival_lead_change', 'fantasy', 'in_app', 'ar', 1,
    '{{rival}} يتقدّم عليك',
    'نتيجة مصحّحة، الجولة {{gameweek}}: {{rival_total}} مقابل {{my_total}}.',
    array['rival', 'rival_total', 'my_total', 'gameweek'], 120, 300, true, statement_timestamp()),
  ('rival_lead_you_corrected', 'rival_lead_change', 'fantasy', 'in_app', 'fr', 1,
    'Vous reprenez la tête sur {{rival}}',
    'Résultat corrigé, journée {{gameweek}} : {{my_total}} contre {{rival_total}}.',
    array['rival', 'rival_total', 'my_total', 'gameweek'], 120, 300, true, statement_timestamp()),
  ('rival_lead_you_corrected', 'rival_lead_change', 'fantasy', 'in_app', 'ar', 1,
    'تعود إلى الصدارة أمام {{rival}}',
    'نتيجة مصحّحة، الجولة {{gameweek}}: {{my_total}} مقابل {{rival_total}}.',
    array['rival', 'rival_total', 'my_total', 'gameweek'], 120, 300, true, statement_timestamp());

notify pgrst, 'reload schema';
$bg_20261015130100_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261015130200',
  'rivals_tick',
  array[$bg_20261015130200_file$-- BotolaGO+ Rivaux, migration 3 of 3: the lead-change notification and its two scheduled jobs.
--
-- Both jobs are scheduled but do nothing until the owner switches the tick on
-- (select app_private.rivals_configure(true)): rivals_tick() answers {"outcome": "off"} without
-- writing. cron.schedule with a name replaces a job of that name, so this file can be applied
-- again (apart from the table, which the guarded script refuses to create twice).
--
-- WHAT THE TICK DOES, while switched on. For the season's latest published journée (the card's own
-- evaluable test), for each pinned rival whose owner is a member, switched the notification on
-- BEFORE the journée was published, pinned the rival before it too, still shares an active private
-- league with them and has notifications and in-app notifications on: compare who leads after the
-- journée with who led before it (or, after a correction, with who the member was last told leads).
-- When the lead changed hands, create ONE notification (in-app, plus a push delivery per working phone
-- when the member has push and Fantasy reminders on; no email), once per change, in French or Arabic
-- by the member's language, quiet hours respected. The push follows the Manager Card rating change
-- exactly (20261012200100): the push rules below learn the type (topic "fantasy", life 12 hours), the
-- delivery is created pending, and the push claim sends it only while
-- app_private.notification_push_settings.mode allows ('off' sends nothing) and re-checks the reader. A journée published before the
-- member turned the notification on is never told. A corrected result that flips the lead again is
-- told again, in the corrected wording; one that does not flip it says nothing. Nothing is told
-- during matches: only a published result can move a total.
--
-- The push rules are replaced here (create or replace, bodies of 20261012200100 plus the new type).
--
-- WRITES: app.notifications, app.notification_deliveries (in_app and push), app_private.notification_events and
-- app_private.rival_lead_notices (its own record of what each member was told). Nothing of Fantasy,
-- the card or the pins.
--
-- rivals-tick runs at minutes 7, 22, 37 and 52 (off the quarter hours the other ticks use).
-- rivals-history-prune runs daily at 03:59 UTC, whatever the switch says: it deletes only this tick's
-- cron.job_run_details rows older than 7 days and the notice records older than 365 days.

create table app_private.rival_lead_notices (
  id bigint generated always as identity primary key,
  user_id uuid not null references app.profiles(id) on delete cascade,
  rival_user_id uuid not null references app.profiles(id) on delete cascade,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  leader text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint rival_lead_notices_leader_check check (leader in ('me', 'rival'))
);
create index rival_lead_notices_pair_idx
  on app_private.rival_lead_notices (user_id, rival_user_id, gameweek_id, id);
alter table app_private.rival_lead_notices enable row level security;
alter table app_private.rival_lead_notices force row level security;
revoke all on app_private.rival_lead_notices from public, anon, authenticated, service_role;
comment on table app_private.rival_lead_notices is
  'BotolaGO+ Rivaux: each change of lead a member was told about (who leads after it), so a correction is compared with what they were last told. Written only by app_private.rivals_tick. No grant.';

-- ---------------------------------------------------------------------------
-- The push rules learn the type: a Fantasy message (the Fantasy reminders switch), worth sending for
-- 12 hours (quiet hours included). Otherwise the bodies of 20261012200100.
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_push_topic(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'match_starting' then 'match'
    when 'goal' then 'match'
    when 'goal_cancelled' then 'match'
    when 'full_time' then 'match'
    when 'followed_team_result' then 'match'
    when 'deadline_24h' then 'fantasy'
    when 'deadline_1h' then 'fantasy'
    when 'manager_card_ovr_change' then 'fantasy'
    when 'rival_lead_change' then 'fantasy'
    else null
  end;
$$;

create or replace function app_private.notification_push_ttl(p_type text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'goal' then interval '10 minutes'
    when 'goal_cancelled' then interval '10 minutes'
    when 'match_starting' then interval '20 minutes'
    when 'full_time' then interval '30 minutes'
    when 'followed_team_result' then interval '30 minutes'
    when 'deadline_1h' then interval '30 minutes'
    when 'deadline_24h' then interval '2 hours'
    when 'manager_card_ovr_change' then interval '12 hours'
    when 'rival_lead_change' then interval '12 hours'
    else interval '1 hour'
  end;
$$;

create function app_private.rivals_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  enabled boolean;
  v_season uuid;
  gw record;
  published timestamptz;
  pin record;
  cur_me integer;
  cur_rival integer;
  prv_me integer;
  prv_rival integer;
  leader_after text;
  baseline text;
  told integer;
  last_leader text;
  corrected boolean;
  template app.notification_templates%rowtype;
  rival_name text;
  event_key text;
  new_event uuid;
  variables jsonb;
  available timestamptz;
  new_notification uuid;
  created integer := 0;
begin
  select s.enabled into enabled from app_private.rivals_settings s where s.id;
  if not coalesce(enabled, false) then
    return jsonb_build_object('outcome', 'off');
  end if;
  v_season := app_private.manager_card_fantasy_season();
  if v_season is null then
    return jsonb_build_object('outcome', 'no_season');
  end if;
  select e.gameweek_id, e.seq, g.finalized_at, g.corrected_at into gw
  from app_private.card_evaluable_gameweeks(v_season) e
  join app.fantasy_gameweeks g on g.id = e.gameweek_id
  order by e.seq desc
  limit 1;
  if not found then
    return jsonb_build_object('outcome', 'no_gameweek');
  end if;
  published := coalesce(gw.corrected_at, gw.finalized_at);
  -- The opt-in cutoff is the journée's first publication: a correction does not reopen it.

  for pin in
    select p.user_id, p.rival_user_id, profile.preferred_language,
      preference.notifications_enabled, preference.in_app_notifications_enabled,
      preference.push_notifications_enabled, preference.fantasy_deadline_reminders,
      preference.notification_timezone, preference.quiet_hours_enabled,
      preference.quiet_hours_start, preference.quiet_hours_end
    from app.pinned_rivals p
    join app.rival_preferences rp on rp.user_id = p.user_id
      and rp.notify_lead_change and rp.notify_changed_at <= gw.finalized_at
    join app.profiles profile on profile.id = p.user_id and profile.deleted_at is null
    join app.profiles rival_profile on rival_profile.id = p.rival_user_id and rival_profile.deleted_at is null
    left join app.user_preferences preference on preference.user_id = p.user_id
    where p.fantasy_season_id = v_season and p.created_at <= gw.finalized_at
    order by p.user_id, p.rival_user_id
  loop
    if not coalesce(pin.notifications_enabled and pin.in_app_notifications_enabled, false)
      or not app_private.has_premium(pin.user_id)
      or not exists (select 1 from app_private.rivals_shared_league(pin.user_id, pin.rival_user_id, v_season)) then
      continue;
    end if;

    cur_me := null; cur_rival := null; prv_me := null; prv_rival := null;
    select x.me_total, x.rival_total into cur_me, cur_rival
    from app_private.rivals_pair(pin.user_id, pin.rival_user_id, v_season) x where x.seq = gw.seq;
    select x.me_total, x.rival_total into prv_me, prv_rival
    from app_private.rivals_pair(pin.user_id, pin.rival_user_id, v_season) x
    where x.seq < gw.seq order by x.seq desc limit 1;

    leader_after := app_private.rivals_leader(cur_me, cur_rival);
    if leader_after is null or leader_after = 'tie' then
      continue;
    end if;
    select count(*)::integer into told from app_private.rival_lead_notices n
    where n.user_id = pin.user_id and n.rival_user_id = pin.rival_user_id and n.gameweek_id = gw.gameweek_id;
    last_leader := null;
    select n.leader into last_leader from app_private.rival_lead_notices n
    where n.user_id = pin.user_id and n.rival_user_id = pin.rival_user_id and n.gameweek_id = gw.gameweek_id
    order by n.id desc limit 1;
    baseline := coalesce(last_leader, app_private.rivals_leader(prv_me, prv_rival));
    if baseline is null or baseline = leader_after then
      continue;
    end if;

    corrected := told > 0 or gw.corrected_at is not null;
    select * into template from app.notification_templates t
    where t.template_key = case when leader_after = 'rival' then 'rival_lead_rival' else 'rival_lead_you' end
        || case when corrected then '_corrected' else '' end
      and t.channel = 'in_app' and t.language = pin.preferred_language and t.active
    order by t.version desc
    limit 1;
    if not found then
      continue;
    end if;

    select coalesce(nullif(btrim(rp.display_name), ''), (
        select t.name from app.fantasy_teams t
        where t.user_id = pin.rival_user_id and t.fantasy_season_id = v_season limit 1))
      into rival_name
    from app.profiles rp where rp.id = pin.rival_user_id;

    event_key := 'rivals:lead:' || pin.user_id || ':' || pin.rival_user_id || ':' || gw.gameweek_id
      || ':' || (told + 1);
    new_event := null;
    insert into app_private.notification_events (
      id, event_type, source_domain, source_entity_id, target_user_id, occurred_at,
      schema_version, deduplication_key, correlation_id, safe_payload, status,
      processing_started_at, completed_at
    ) values (
      gen_random_uuid(), 'rival_lead_change', 'fantasy', gw.gameweek_id, pin.user_id,
      statement_timestamp(), 1, event_key, gw.gameweek_id,
      jsonb_build_object('gameweek', gw.seq, 'leader', leader_after, 'corrected', corrected,
        'myTotal', cur_me, 'rivalTotal', cur_rival),
      'completed', statement_timestamp(), statement_timestamp()
    )
    on conflict (deduplication_key) do nothing
    returning id into new_event;
    if new_event is null then
      continue;
    end if;

    variables := jsonb_build_object(
      'rival', coalesce(rival_name, ''),
      'rival_total', cur_rival::text,
      'my_total', cur_me::text,
      'gameweek', gw.seq::text);
    available := app_private.defer_for_quiet_hours(
      statement_timestamp(), pin.notification_timezone, pin.quiet_hours_enabled,
      pin.quiet_hours_start, pin.quiet_hours_end, false);
    insert into app.notifications (
      user_id, event_id, template_id, notification_type, category, priority, language,
      title, body, deep_link_target, deep_link_entity_id, source_domain, source_entity_id,
      available_at
    ) values (
      pin.user_id, new_event, template.id, 'rival_lead_change', template.category,
      'normal', pin.preferred_language,
      app_private.render_notification_template(template.title_template, template.required_variables, variables),
      app_private.render_notification_template(template.body_template, template.required_variables, variables),
      'none', null, 'fantasy', gw.gameweek_id, available
    )
    on conflict (event_id, user_id) do nothing
    returning id into new_notification;
    if new_notification is null then
      continue;
    end if;
    insert into app.notification_deliveries (
      notification_id, channel, provider_key, status, attempt_count, sent_at, delivered_at
    ) values (new_notification, 'in_app', 'database', 'delivered', 1,
      statement_timestamp(), statement_timestamp());
    -- A push per working phone when the reader has push and Fantasy reminders on; the push claim
    -- sends it only while the push switch allows, and re-checks the reader.
    if coalesce(pin.push_notifications_enabled and pin.fantasy_deadline_reminders, false) then
      insert into app.notification_deliveries (
        notification_id, channel, device_registration_id, provider_key, status
      )
      select new_notification, 'push', device.id, device.push_provider::text, 'pending'
      from app.device_registrations device
      join app_private.push_destinations destination on destination.device_registration_id = device.id
      where device.user_id = pin.user_id
        and device.enabled and device.invalidated_at is null
        and device.push_provider::text in ('fcm', 'apns')
      on conflict do nothing;
    end if;
    insert into app_private.rival_lead_notices (user_id, rival_user_id, gameweek_id, leader)
    values (pin.user_id, pin.rival_user_id, gw.gameweek_id, leader_after);
    created := created + 1;
  end loop;
  return jsonb_build_object('outcome', 'ok', 'gameweek', gw.seq, 'created', created);
end;
$$;
revoke all on function app_private.rivals_tick()
  from public, anon, authenticated, service_role;
grant execute on function app_private.rivals_tick() to postgres;
comment on function app_private.rivals_tick() is
  'While app_private.rivals_settings.enabled is on, creates one rival_lead_change notification (in-app delivery, plus a pending push delivery per working phone with push and Fantasy reminders on) for each pinned rival whose lead changed hands in the season''s latest published journée, for members who opted in before it was published (a correction that flips the lead is told again). Answers {outcome: off} without writing while off. Executable by postgres only.';

select cron.schedule(
  'rivals-tick',
  '7,22,37,52 * * * *',
  $job$select app_private.rivals_tick();$job$
);

select cron.schedule(
  'rivals-history-prune',
  '59 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'rivals-tick')
      and end_time < now() - interval '7 days';
    delete from app_private.rival_lead_notices
    where created_at < now() - interval '365 days';
  $prune$
);
$bg_20261015130200_file$]
);

-- ---------------------------------------------------------------------------
-- Run them from the history, once each is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261015130100 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261015130100'
  );
  part_20261015130200 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261015130200'
  );
begin
  if encode(sha256(convert_to(part_20261015130100, 'UTF8')), 'hex')
    is distinct from 'ef6765dd954e3a2e2d4f1dba50c468ef724291874ce31eb13975cbdef14fa38a' then
    raise exception 'stop: 20261015130100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261015130100;

  if encode(sha256(convert_to(part_20261015130200, 'UTF8')), 'hex')
    is distinct from '9ba05d6a992590ff61ff7dd7f9bb668ea94804173e336ecfbf1261c93a21ad31' then
    raise exception 'stop: 20261015130200 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261015130200;
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
  rec record;
  premium_mode text;
  answer jsonb;
  tick jsonb;
  state jsonb;
begin
  -- The api functions: who may run them, how, volatility, one signature each.
  for rec in
    select * from (values
    ('get_my_rivals', 'text', 's'),
    ('get_rival_candidates', 'text', 's'),
    ('pin_rival', 'uuid,text', 'v'),
    ('unpin_rival', 'uuid,text', 'v'),
    ('set_rivals_notify', 'boolean', 'v')
    ) as f(name, args, vol)
  loop
    if to_regprocedure('api.' || rec.name || '(' || rec.args || ')') is null then
      problems := problems || ('api.' || rec.name || ' is missing');
      continue;
    end if;
    if not has_function_privilege('authenticated', to_regprocedure('api.' || rec.name || '(' || rec.args || ')'), 'execute') then
      problems := problems || ('authenticated cannot run api.' || rec.name);
    end if;
    foreach who in array array['anon', 'service_role', 'public'] loop
      if has_function_privilege(who, to_regprocedure('api.' || rec.name || '(' || rec.args || ')'), 'execute') then
        problems := problems || (who || ' can run api.' || rec.name);
      end if;
    end loop;
    if not (select p.prosecdef and p.proconfig @> array['search_path=""'] and p.provolatile = rec.vol::"char"
      from pg_proc p where p.oid = to_regprocedure('api.' || rec.name || '(' || rec.args || ')')) then
      problems := problems || ('api.' || rec.name || ' is not security definer, volatility ' || rec.vol || ', empty search_path');
    end if;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'api' and p.proname = rec.name) <> 1 then
      problems := problems || ('api.' || rec.name || ' has more than one signature');
    end if;
  end loop;

  -- The helpers: no API role at all, empty search_path.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname in ('rivals_configure', 'rivals_leader', 'rivals_shared_league', 'rivals_pair', 'rivals_card', 'rivals_gate', 'rivals_season', 'rivals_tick')
  loop
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, rec.oid, 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
    if not (rec.proconfig @> array['search_path=""']) then
      problems := problems || (rec.signature || ' has no empty search_path');
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private' and p.proname in ('rivals_configure', 'rivals_leader', 'rivals_shared_league', 'rivals_pair', 'rivals_card', 'rivals_gate', 'rivals_season', 'rivals_tick')) <> 8 then
    problems := problems || 'the 8 helpers are not all there'::text;
  end if;

  -- The four tables: row security forced, no grant to any API role; the switch is one row, off.
  for rec in
    select unnest(array['app.pinned_rivals', 'app.rival_preferences', 'app_private.rivals_settings', 'app_private.rival_lead_notices']) as name
  loop
    if to_regclass(rec.name) is null then
      problems := problems || (rec.name || ' is missing');
    else
      if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid = to_regclass(rec.name)) then
        problems := problems || (rec.name || ' does not force row security');
      end if;
      foreach who in array array['anon', 'authenticated', 'service_role'] loop
        if has_table_privilege(who, to_regclass(rec.name), 'select,insert,update,delete,truncate,references,trigger') then
          problems := problems || (who || ' has a grant on ' || rec.name);
        end if;
      end loop;
    end if;
  end loop;
  if (select count(*) from app_private.rivals_settings) <> 1
    or (select s.enabled from app_private.rivals_settings s where s.id) is distinct from false then
    problems := problems || 'the tick''s switch is not one row, off'::text;
  end if;

  -- The text: four wordings in two languages.
  if (select count(*) from app.notification_templates t
      where t.notification_type = 'rival_lead_change' and t.active and t.channel = 'in_app'
        and t.language in ('fr', 'ar')) <> 8 then
    problems := problems || 'the eight notification texts are not all there'::text;
  end if;

  -- The jobs: both there, active, the tick at its minutes.
  if (select count(*) from cron.job j where j.jobname = 'rivals-tick' and j.active
        and j.schedule = '7,22,37,52 * * * *') <> 1 then
    problems := problems || 'rivals-tick is not scheduled at 7,22,37,52 and active'::text;
  end if;
  if (select count(*) from cron.job j where j.jobname = 'rivals-history-prune' and j.active
        and j.schedule = '59 3 * * *') <> 1 then
    problems := problems || 'rivals-history-prune is not scheduled at 03:59 and active'::text;
  end if;
  if (select count(*) from cron.job)::text is distinct from (current_setting('bg.rivals_jobs', true)::integer + 2)::text then
    problems := problems || 'the number of scheduled jobs did not grow by exactly two'::text;
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text
    is distinct from (current_setting('bg.rivals_tables', true)::integer + 4)::text then
    problems := problems || 'the number of tables did not grow by exactly 4'::text;
  end if;

  -- Replaces only the two push rules, and they still answer as before for every other type.
  if app_private.notification_push_topic('rival_lead_change') is distinct from 'fantasy'
    or app_private.notification_push_ttl('rival_lead_change') is distinct from interval '12 hours'
    or app_private.notification_push_topic('manager_card_ovr_change') is distinct from 'fantasy'
    or app_private.notification_push_topic('goal') is distinct from 'match'
    or app_private.notification_push_topic('deadline_24h') is distinct from 'fantasy'
    or app_private.notification_push_topic('breaking_news') is not null
    or app_private.notification_push_ttl('goal') is distinct from interval '10 minutes'
    or app_private.notification_push_ttl('manager_card_ovr_change') is distinct from interval '12 hours'
    or app_private.notification_push_ttl('breaking_news') is distinct from interval '1 hour' then
    problems := problems || 'the push rules do not answer as expected'::text;
  end if;

  -- No other existing function changed.
  if (select string_agg(
        p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
      from pg_proc p where p.oid in (
      'api.get_my_card_career(text)'::regprocedure,
      'api.get_card_duel(uuid,text)'::regprocedure,
      'api.get_card_league_context(uuid,text,uuid)'::regprocedure,
      'api.set_card_history_visibility(boolean)'::regprocedure,
      'api.get_my_card_history_visibility()'::regprocedure,
      'app_private.card_week_rows(uuid,uuid)'::regprocedure,
      'app_private.card_captain_rows(uuid,uuid)'::regprocedure,
      'app_private.card_transfer_rows(uuid,uuid)'::regprocedure,
      'app_private.card_evaluable_gameweeks(uuid)'::regprocedure,
      'app_private.has_premium(uuid,timestamptz)'::regprocedure,
      'app_private.render_notification_template(text,text[],jsonb)'::regprocedure,
      'app_private.defer_for_quiet_hours(timestamptz,text,boolean,time without time zone,time without time zone,boolean)'::regprocedure))
    is distinct from current_setting('bg.rivals_defs', true) then
    problems := problems || 'an existing function changed -- this script replaces none'::text;
  end if;

  -- Off means off.
  tick := app_private.rivals_tick();
  if tick is distinct from '{"outcome": "off"}'::jsonb then
    problems := problems || ('the tick does not answer off: ' || coalesce(tick::text, 'nothing'));
  end if;
  select s.mode into premium_mode from app_private.premium_settings s where s.id;
  if premium_mode = 'off' then
    answer := api.get_my_rivals();
    if answer is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the read does not answer off while BotolaGO+ is off: '
        || coalesce(answer::text, 'nothing'));
    end if;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version in ('20261015130100', '20261015130200')) <> 2 then
    problems := problems || 'a history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  state := jsonb_build_object(
    'premiumMode', premium_mode,
    'apiFunctions', 5,
    'helpers', 8,
    'tablesAdded', 4,
    'jobsAdded', 2,
    'templates', 8,
    'tick', tick,
    'readWhileOff', case when premium_mode = 'off' then answer end,
    'historyRows', 2
  );
  perform set_config('bg.rivals_state', state::text, true);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('bg.rivals_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.rivals_state', true);
  end if;
  raise notice 'rivals: applying: %', current_setting('bg.rivals_state', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261015130200')
    then 'Applied. Rivaux is in place and OFF: the reads answer off while BotolaGO+ is off, and the tick does nothing until app_private.rivals_configure(true). Next: docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md.'
  else 'NOT applied: nothing was saved (a rehearsal, or a check stopped it).'
end as result;
