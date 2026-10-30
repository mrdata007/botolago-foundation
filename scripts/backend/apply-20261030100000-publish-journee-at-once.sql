-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migrations 20261030100000 .. 20261030100300: a Fantasy journée's points
-- are published all at once (owner request, 2026-10-29), from Journée 6.
--
--   20261030100000_fantasy_publication_gate
--       a publication time per gated journée (two Moroccan days after its last
--       match, 14:00 Moroccan time); the database refuses to write points, rank
--       or finalize a gated journée until it is released (its time has come AND
--       no rating is pending; a pending rating moves it to the next 14:00);
--       the fan readers show it as unpublished until then.
--   20261030100100_selection_close_accepts_moved_match
--       item F7: a finished match whose kickoff moved after the lock, completed
--       within the rules' 48 h, no longer blocks the selection close.
--   20261030100200_rating_poll_mark_24h30
--       one more rating poll, 24 h 30 min after full time (at most one extra
--       SportAPI call per unfinished-rating match).
--   20261030100300_ops_health_publication
--       the coverage, scoring and progression checks follow the new rule.
--
-- WHEN
--   After the pull request that adds this file is merged, and BEFORE
--   Journée 6 locks. Deploy the fantasy-lifecycle-worker Edge Function of the
--   same pull request FIRST (recommended: the new worker against the old
--   database behaves exactly as before, because it asks the database about
--   publication only when the state says a journée is gated), then apply this
--   script, then publish the website. If the script is applied first, deploy
--   the worker within minutes: the old worker against the new database is
--   refused (fantasy_publication_held) for a gated journée, so it publishes
--   nothing and the journée is never released until the new worker runs.
--   Journée 5 and earlier are not touched.
--   AGENTS.md "One writer at a time": the script calls
--   app_private.hold_scheduled_jobs(), which holds every pg_cron job (the
--   Fantasy worker tick, the live refresh, the notification and Manager Card
--   ticks and the rest) off for the length of the transaction, refuses while
--   one is mid-run, and lets them start again the moment the transaction ends,
--   committed or rolled back: that is the pause and the restore. It also takes
--   the Fantasy worker lease table in exclusive mode and stops if a pass holds
--   the lease (up to about eight minutes), and stops if an HTTP request is
--   still queued. GitHub's hourly orchestrator and the manual worker workflow
--   take the same lease, so they are covered too. If the script stops on one of
--   these, wait a few minutes and run it again; nothing was saved. The message
--   scheduled_job_running means a scheduled job was mid-run: wait one minute and
--   run it again.
--   No Fantasy setting needs to be switched off by hand for this script.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL:
--      applied inside one transaction, checked, then ROLLED BACK. The result
--      row should say "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and run again.
--      The result row should say "Applied".
--   4. Then deploy the Edge Function and publish the website (the owner steps
--      list in docs/review/batch2-2026-10-30/OWNER_STEPS.md).
--   If a check fails the script stops with a message and nothing is saved. Do
--   not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, before 20261028140000 (the latest on main), without
--     the Morocco clock helpers (20261016090000) or where any of the fourteen
--     functions it replaces or wraps is not the version the repository
--     migrations left (md5 of its body), or a fan view was changed;
--   * holds the scheduled jobs and the worker lease (above);
--   * keeps the health answer, the current journée's lifecycle state and the
--     gameweek list as they are today;
--   * records the four migration files in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs each from its record, in order, once its
--     sha256 matches the repository file;
--   * checks the result: no journée before 6 is gated, nothing that is shown
--     today becomes hidden, the lifecycle state and the health answer are as
--     before for every journée before 6, the gameweek list only gained its two
--     new keys, only the service role may decide a publication, the poll
--     schedule has the 24 h 30 min mark.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local timezone = 'UTC';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations
    where version in ('20261030100000', '20261030100100', '20261030100200', '20261030100300')) then
    raise exception 'stop: one of these migrations is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261028140000') then
    raise exception 'stop: migration 20261028140000 (the latest on main) is not applied -- this update follows it';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090000')
    or to_regprocedure('app_private.morocco_instant(timestamp without time zone)') is null then
    raise exception 'stop: the Morocco clock helpers (20261016090000) are not installed';
  end if;
  if to_regclass('app_private.fantasy_publication_settings') is not null
    or to_regclass('app_private.fantasy_publication_state') is not null
    or to_regprocedure('api.service_evaluate_fantasy_publication(uuid)') is not null then
    raise exception 'stop: the publication gate already exists -- it was applied some other way';
  end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.fantasy_api_rating_candidates()'::regprocedure))
    is distinct from '4a087788345c2eb22f486c57526f1c8a' then
    raise exception 'stop: app_private.fantasy_api_rating_candidates() is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.service_begin_fantasy_selection_close(uuid,bigint)'::regprocedure))
    is distinct from 'a8ff68656a09cf6a52c30197f42c6cc8' then
    raise exception 'stop: api.service_begin_fantasy_selection_close(uuid,bigint) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.service_fantasy_lifecycle_state(uuid)'::regprocedure))
    is distinct from '8e9a265974f70ad129c7019a63bccd2b' then
    raise exception 'stop: api.service_fantasy_lifecycle_state(uuid) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.service_prepare_fantasy_live_scoring(uuid)'::regprocedure))
    is distinct from '485da3a2df638b20a7e11364db984950' then
    raise exception 'stop: api.service_prepare_fantasy_live_scoring(uuid) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure))
    is distinct from 'ac72c2f5bc7b1d69ac68d4aea79bfe32' then
    raise exception 'stop: api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.service_begin_fantasy_finalization(uuid,bigint,text)'::regprocedure))
    is distinct from '02dc756e687dcb85b3c674b2714db323' then
    raise exception 'stop: api.service_begin_fantasy_finalization(uuid,bigint,text) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.service_recalculate_fantasy_rankings(uuid,uuid,uuid,bigint)'::regprocedure))
    is distinct from '07ed1a6bf57045dcd270b0dcae48144c' then
    raise exception 'stop: api.service_recalculate_fantasy_rankings(uuid,uuid,uuid,bigint) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.get_my_fantasy_points(uuid,uuid)'::regprocedure))
    is distinct from '3e99c6351dca37faa61894d3136d337d' then
    raise exception 'stop: api.get_my_fantasy_points(uuid,uuid) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.fantasy_gameweek_summary(uuid)'::regprocedure))
    is distinct from '975240443e0ddae121a52423104c784a' then
    raise exception 'stop: api.fantasy_gameweek_summary(uuid) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.fantasy_gameweeks(uuid,integer,integer)'::regprocedure))
    is distinct from 'e8b1ffb520f67a781b1c213e06af9f9a' then
    raise exception 'stop: api.fantasy_gameweeks(uuid,integer,integer) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.ops_health_checks()'::regprocedure))
    is distinct from 'ca709021ea02c00c08d4f35a78f5fb7f' then
    raise exception 'stop: app_private.ops_health_checks() is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.ops_health_checks_before_adaptive()'::regprocedure))
    is distinct from '3970fa1249c8cfa72c03701206aaa4e9' then
    raise exception 'stop: app_private.ops_health_checks_before_adaptive() is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.fantasy_fixture_health_ready(uuid,uuid,boolean)'::regprocedure))
    is distinct from '64b5ca75680ec70476769400a3d73c42' then
    raise exception 'stop: app_private.fantasy_fixture_health_ready(uuid,uuid,boolean) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.fantasy_fixture_full_stats(uuid,uuid,boolean)'::regprocedure))
    is distinct from '489dd14fc37551fc2fbddd23404dd24d' then
    raise exception 'stop: app_private.fantasy_fixture_full_stats(uuid,uuid,boolean) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.fantasy_hub(text)'::regprocedure))
    is distinct from '1347c4decea536eb6fb95afab6fbcd29' then
    raise exception 'stop: api.fantasy_hub(text) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.fantasy_leagues(uuid,text,integer)'::regprocedure))
    is distinct from '84a9f450d5afb7049e93a7d0c9f541ad' then
    raise exception 'stop: api.fantasy_leagues(uuid,text,integer) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.fantasy_league_standings(uuid,uuid,bigint,uuid,integer)'::regprocedure))
    is distinct from '7b60b41f3b28db6d939292f1b4ada9d7' then
    raise exception 'stop: api.fantasy_league_standings(uuid,uuid,bigint,uuid,integer) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.fantasy_overall_standings(uuid,uuid,bigint,uuid,integer)'::regprocedure))
    is distinct from 'df08f7ccefe1037caf1ef3feab4c3763' then
    raise exception 'stop: api.fantasy_overall_standings(uuid,uuid,bigint,uuid,integer) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.get_my_rivals(text)'::regprocedure))
    is distinct from 'a308a0b615382f79c3496eff14cb62a6' then
    raise exception 'stop: api.get_my_rivals(text) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.get_my_deadline_briefing(uuid)'::regprocedure))
    is distinct from '90ac88fb9255b9dc75947bf1d4f7e96e' then
    raise exception 'stop: api.get_my_deadline_briefing(uuid) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.fantasy_hidden_ahead(uuid,uuid,uuid,bigint,boolean)'::regprocedure))
    is distinct from '0be0d1fe23a050b5bddbb02d40adce77' then
    raise exception 'stop: app_private.fantasy_hidden_ahead(uuid,uuid,uuid,bigint,boolean) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.rivals_pair(uuid,uuid,uuid)'::regprocedure))
    is distinct from '1bd8218d112b17c38ecfb72bb276e68a' then
    raise exception 'stop: app_private.rivals_pair(uuid,uuid,uuid) is not the version the repository migrations left -- something changed it since';
  end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.round_recap_league(uuid,uuid,uuid,uuid,integer,integer)'::regprocedure))
    is distinct from '747a1c5b78a24ac70a40b16f7779db4e' then
    raise exception 'stop: app_private.round_recap_league(uuid,uuid,uuid,uuid,integer,integer) is not the version the repository migrations left -- something changed it since';
  end if;
  if position('fantasy_current_rating_publications' in pg_get_viewdef('app_private.fantasy_visible_team_results'::regclass)) = 0
    or position('fantasy_unpublished_gameweeks' in pg_get_viewdef('app_private.fantasy_visible_team_results'::regclass)) <> 0
    or position('fantasy_current_rating_publications' in pg_get_viewdef('app_private.fantasy_visible_player_points'::regclass)) = 0
    or position('fantasy_current_rating_publications' in pg_get_viewdef('app_private.fantasy_visible_point_events'::regclass)) = 0
    or position('fantasy_current_rating_publications' in pg_get_viewdef('app_private.fantasy_visible_substitutions'::regclass)) = 0 then
    raise exception 'stop: a fan view (fantasy_visible_*) is not what the repository migrations left -- something changed it since';
  end if;
end
$preflight$;

-- One writer at a time: every scheduled job held off until this transaction
-- ends, the Fantasy worker lease table locked, nothing left in the HTTP queue.
select app_private.hold_scheduled_jobs();
lock table app_private.fantasy_worker_lease in exclusive mode;
do $writers$
begin
  if exists (select 1 from app_private.fantasy_worker_lease
    where released_at is null and expires_at > statement_timestamp()) then
    raise exception 'stop: a Fantasy worker pass holds its lease -- wait for it to finish (up to about eight minutes) and run this again';
  end if;
  if exists (select 1 from net.http_request_queue) then
    raise exception 'stop: an HTTP request is still queued -- wait a minute and run this again';
  end if;
end
$writers$;

-- What must be the same afterwards for every journée before 6.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('botolago.health_before',
  (select coalesce(jsonb_agg(c ->> 'name' || ':' || (c ->> 'status') order by c ->> 'name'), '[]'::jsonb)::text
   from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c), true);
select set_config('botolago.state_before',
  coalesce((select (api.service_fantasy_lifecycle_state(g.id) - 'serverTime')::text
    from app.fantasy_gameweeks g where g.sequence_number < 6
    order by g.sequence_number desc limit 1), 'none'), true);
select set_config('botolago.list_before',
  coalesce((select api.fantasy_gameweeks(s.id)::text
    from app.fantasy_seasons s where s.status in ('registration_open', 'active')
    order by s.starts_at desc limit 1), 'none'), true);
select set_config('botolago.shown_before',
  (select count(*)::text from app_private.fantasy_visible_team_results v
   join app.fantasy_gameweeks g on g.id = v.gameweek_id where g.sequence_number < 6), true);
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- The four migrations, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261030100000',
  'fantasy_publication_gate',
  array[$bg_20261030100000_file$-- BotolaGO Production V2
-- Publish a Fantasy journée's points all at once (owner request 2026-10-29).
--
-- Why. Fantasy points are SofaScore ratings, so a match has none while it is
-- played and each player gets points the moment his rating arrives (11 to 38 h
-- after full time). Fans saw some matches with points and others without, and
-- the rankings moved every ten minutes. From Journée 6 a journée's points,
-- rankings and finalization go out together, at one fixed moment, when every
-- rating is in.
--
-- The rule.
--   * publish-not-before: the Moroccan local date of the latest
--     finalized_at among the journée's counted matches, plus two days, at 14:00
--     local time. It is null until every counted match is finished.
--   * the worker (and every database write that publishes) refuses to write
--     points, rank, or finalize a gated journée until BOTH hold: now is at or
--     after publish-not-before AND no rating is pending. The decision is made
--     by api.service_evaluate_fantasy_publication and is recorded
--     (app_private.fantasy_publication_state). If a rating is still pending at a
--     slot, the journée waits for the next 14:00 local slot, whatever happens
--     in between. Once released it stays released, so a pass interrupted
--     halfway resumes. Never half-published.
--   * not gated, so unchanged: the selection close, the next journée's opening,
--     the Free Hit restore, free-transfer rollover and prices
--     (api.service_begin_fantasy_selection_close and the close steps are not
--     touched here), and every journée before the first gated one.
--
-- Nothing in this file changes a scoring rule, a captain, chip or transfer
-- rule, a price, or live match data.
--
-- How it is applied. Functions are wrapped (renamed to *_before_publication,
-- then a function of the old name checks the gate and calls it), the same method
-- as 20260927140000 and 20261018215311, so no reviewed body is copied. The four
-- fan-facing views of 20261018215311 are redefined with one extra condition.
--
-- Readers. A gated journée that is not yet published is hidden from the
-- visible_* views (team results, player points, point events, substitutions),
-- so every reader built on them (points, history, round recap, public recap,
-- top players, briefing) treats it as unpublished. "Published" means the
-- journée was released AND its overall ranking exists, so the few seconds the
-- worker spends writing the results are not shown either.

-- 1. Settings and decisions -----------------------------------------------------

create table app_private.fantasy_publication_settings (
  season_id uuid primary key references app.fantasy_seasons(id),
  first_gameweek integer not null default 6 check (first_gameweek between 1 and 1000),
  updated_at timestamptz not null default statement_timestamp()
);
comment on table app_private.fantasy_publication_settings is
  'Per Fantasy season: the first gameweek sequence whose points are published all at once. A season without a row uses 6. Use 1000 to switch the rule off for a season.';

create table app_private.fantasy_publication_state (
  gameweek_id uuid primary key references app.fantasy_gameweeks(id),
  first_slot_at timestamptz,
  deferred_until timestamptz,
  released_at timestamptz,
  last_evaluated_at timestamptz,
  last_outcome text check (last_outcome in (
    'matches_unfinished', 'before_publish_time', 'gameweek_not_provisional',
    'ratings_pending', 'released'))
);
comment on table app_private.fantasy_publication_state is
  'One row per gated gameweek once the worker looked at it: the first publish-not-before time seen, the next slot after a pending-rating decision (deferred_until), and when it was released.';

alter table app_private.fantasy_publication_settings enable row level security;
alter table app_private.fantasy_publication_settings force row level security;
alter table app_private.fantasy_publication_state enable row level security;
alter table app_private.fantasy_publication_state force row level security;
revoke all on app_private.fantasy_publication_settings, app_private.fantasy_publication_state
  from public, anon, authenticated, service_role;

-- 2. The rule, as functions -------------------------------------------------------

-- Which gameweek sequence a season starts publishing all at once from.
create function app_private.fantasy_publication_first_gameweek(p_season_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select s.first_gameweek from app_private.fantasy_publication_settings s
    where s.season_id = p_season_id), 6);
$$;

-- A gameweek is gated when its season scores native ratings from it and its
-- sequence is at or past the season's first gated gameweek. A settled
-- gameweek is never gated (its points are out).
create function app_private.fantasy_publication_gated(p_gameweek_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from app.fantasy_gameweeks g
    join app_private.fantasy_api_rating_seasons p on p.season_id = g.fantasy_season_id
    where g.id = p_gameweek_id
      and g.status not in ('finalized', 'corrected', 'cancelled')
      and g.sequence_number >= p.from_gameweek
      and g.sequence_number >= app_private.fantasy_publication_first_gameweek(g.fantasy_season_id));
$$;

-- The next 14:00 in Morocco strictly after the given moment. Morocco's clock is
-- read through the helpers of 20261016090000 (the application's rule, whatever
-- time-zone data the database carries), never through the zone name.
create function app_private.fantasy_publication_next_slot(p_after timestamptz)
returns timestamptz language sql stable set search_path = '' as $$
  select app_private.morocco_instant(
    case when app_private.morocco_local(p_after)::time < time '14:00'
      then app_private.morocco_local_date(p_after) + time '14:00'
      else app_private.morocco_local_date(p_after) + 1 + time '14:00' end);
$$;

-- Publish not before: two Moroccan days after the latest counted match ended,
-- at 14:00 Moroccan time. Null until every counted match is finished.
create function app_private.fantasy_publish_not_before(p_gameweek_id uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select case
    when count(*) = 0 or count(*) filter (where f.status <> 'finished' or f.finalized_at is null) > 0 then null
    else app_private.morocco_instant(app_private.morocco_local_date(max(f.finalized_at)) + 2 + time '14:00')
  end
  from app.fantasy_fixture_assignments a
  join app.fixtures f on f.id = a.fixture_id
  where a.gameweek_id = p_gameweek_id and a.superseded_at is null and a.counts_points;
$$;

-- The publication moment the fans are told: publish-not-before, or the next
-- slot once a decision found a rating pending. Null while it cannot be known.
create function app_private.fantasy_publication_slot(p_gameweek_id uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select case when pnb is null then null
    else greatest(pnb, coalesce((select s.deferred_until from app_private.fantasy_publication_state s
      where s.gameweek_id = p_gameweek_id), pnb)) end
  from (select app_private.fantasy_publish_not_before(p_gameweek_id) as pnb) x;
$$;

-- Published to fans: the journée was released and its overall ranking exists.
create view app_private.fantasy_unpublished_gameweeks with (security_invoker = true) as
select g.id as gameweek_id
from app.fantasy_gameweeks g
where g.status not in ('finalized', 'corrected', 'cancelled')
  and app_private.fantasy_publication_gated(g.id)
  and not exists (
    select 1 from app_private.fantasy_publication_state s
    where s.gameweek_id = g.id and s.released_at is not null
      and exists (select 1 from app.fantasy_rankings k
        where k.gameweek_id = g.id and k.league_id is null));
revoke all on app_private.fantasy_unpublished_gameweeks from public, anon, authenticated, service_role;

-- Were all ratings in at the given moment? Every counted match has a rating
-- source captured at or before it that is ready, and was not made ready only by
-- a Not-rated settlement recorded after it. (A source that is ready now but was
-- captured, or settled, after the moment does not count.)
create function app_private.fantasy_publication_ready_at(p_gameweek_id uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1
    from app.fantasy_fixture_assignments a
    where a.gameweek_id = p_gameweek_id and a.superseded_at is null and a.counts_points
      and not coalesce((
        select src.ready and not exists (
          select 1 from app_private.fantasy_not_rated_settlements n
          where n.source_id = src.id and n.settled_at > p_at)
        from app_private.fantasy_api_rating_sources src
        where src.fixture_id = a.fixture_id and src.captured_at <= p_at
        order by src.id desc limit 1), false));
$$;

-- Decide, and record the decision. p_now is a parameter so the rule can be
-- tested at any moment; the service function passes statement_timestamp().
-- The decision is made at the SLOT, not at the moment the worker happens to
-- look: a journée is released only if every rating was ready at or before a
-- slot that has come (and none is pending now). If the last rating arrived
-- after the slot, the journée waits for the next one; slots already past are
-- walked in order, so a late look cannot release early or skip a day.
create function app_private.fantasy_publication_evaluate_at(p_gameweek_id uuid, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g app.fantasy_gameweeks%rowtype;
  st app_private.fantasy_publication_state%rowtype;
  pnb timestamptz;
  slot timestamptz;
  outcome text;
  guard integer := 0;
begin
  select * into g from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if not app_private.fantasy_publication_gated(g.id) then
    return jsonb_build_object('gated', false, 'released', true, 'held', false);
  end if;
  insert into app_private.fantasy_publication_state(gameweek_id) values (g.id) on conflict do nothing;
  select * into st from app_private.fantasy_publication_state where gameweek_id = g.id for update;
  if st.released_at is not null then
    return jsonb_build_object('gated', true, 'released', true, 'held', false,
      'publishAt', st.released_at, 'outcome', st.last_outcome);
  end if;

  pnb := app_private.fantasy_publish_not_before(g.id);
  if pnb is not null and st.first_slot_at is null then
    update app_private.fantasy_publication_state set first_slot_at = pnb where gameweek_id = g.id;
  end if;

  if pnb is null then
    outcome := 'matches_unfinished';
  else
    slot := greatest(pnb, coalesce(st.deferred_until, pnb));
    if p_now < slot then
      outcome := 'before_publish_time';
    elsif g.status not in ('provisional', 'finalizing') then
      outcome := 'gameweek_not_provisional';
    elsif app_private.fantasy_selection_ratings_pending(g.id) then
      -- Not ready now: the whole journée waits for the next slot, even if the
      -- last rating arrives a minute later. This is checked before anything
      -- that was already written can release it.
      slot := app_private.fantasy_publication_next_slot(p_now);
      update app_private.fantasy_publication_state
      set deferred_until = slot, last_evaluated_at = p_now, last_outcome = 'ratings_pending'
      where gameweek_id = g.id;
      return jsonb_build_object('gated', true, 'released', false, 'held', true,
        'publishNotBefore', pnb, 'publishAt', slot, 'outcome', 'ratings_pending');
    else
      -- Ready now. Was it ready at the slot that has come? Walk the slots that
      -- are past until one found everything ready.
      while slot <= p_now and not app_private.fantasy_publication_ready_at(g.id, slot) and guard < 400 loop
        slot := app_private.fantasy_publication_next_slot(slot);
        guard := guard + 1;
      end loop;
      if slot > p_now then
        update app_private.fantasy_publication_state
        set deferred_until = slot, last_evaluated_at = p_now, last_outcome = 'ratings_pending'
        where gameweek_id = g.id;
        return jsonb_build_object('gated', true, 'released', false, 'held', true,
          'publishNotBefore', pnb, 'publishAt', slot, 'outcome', 'ratings_pending');
      end if;
      update app_private.fantasy_publication_state
      set released_at = p_now, last_evaluated_at = p_now, last_outcome = 'released'
      where gameweek_id = g.id;
      return jsonb_build_object('gated', true, 'released', true, 'held', false,
        'publishNotBefore', pnb, 'publishAt', p_now, 'outcome', 'released');
    end if;
  end if;

  update app_private.fantasy_publication_state
  set last_evaluated_at = p_now, last_outcome = outcome where gameweek_id = g.id;
  return jsonb_build_object('gated', true, 'released', false, 'held', true,
    'publishNotBefore', pnb,
    'publishAt', case when pnb is null then null
      else greatest(pnb, coalesce(st.deferred_until, pnb)) end,
    'outcome', outcome);
end $$;

-- The state the lifecycle state RPC reports, at a given moment.
create function app_private.fantasy_publication_state_json(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not app_private.fantasy_publication_gated(p_gameweek_id) then '{}'::jsonb
    else jsonb_build_object(
      'publicationGated', true,
      'publicationReleased', coalesce(s.released_at is not null, false),
      'publicationHeld', s.released_at is null,
      'publishNotBefore', app_private.fantasy_publish_not_before(p_gameweek_id),
      'publishAt', app_private.fantasy_publication_slot(p_gameweek_id))
    end
  from (select p_gameweek_id as gameweek_id) x
  left join app_private.fantasy_publication_state s on s.gameweek_id = x.gameweek_id;
$$;

-- The write functions call this: a gated journée that was not released refuses.
create function app_private.fantasy_assert_publication_released(p_gameweek_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if app_private.fantasy_publication_gated(p_gameweek_id)
    and not exists (select 1 from app_private.fantasy_publication_state s
      where s.gameweek_id = p_gameweek_id and s.released_at is not null) then
    raise exception using errcode = 'PT409', message = 'fantasy_publication_held';
  end if;
end $$;

revoke all on function app_private.fantasy_publication_first_gameweek(uuid),
  app_private.fantasy_publication_gated(uuid), app_private.fantasy_publication_next_slot(timestamptz),
  app_private.fantasy_publish_not_before(uuid), app_private.fantasy_publication_slot(uuid),
  app_private.fantasy_publication_evaluate_at(uuid, timestamptz), app_private.fantasy_publication_ready_at(uuid, timestamptz),
  app_private.fantasy_publication_state_json(uuid), app_private.fantasy_assert_publication_released(uuid)
  from public, anon, authenticated, service_role;

comment on function app_private.fantasy_publish_not_before(uuid) is
  'Publish not before: the Moroccan date of the latest finalized_at among the counted matches, plus two days, at 14:00 Moroccan time. Null until every counted match is finished.';
comment on function app_private.fantasy_publication_evaluate_at(uuid, timestamptz) is
  'Decides, at the given moment, whether a gated journée may publish: at or after its slot and no rating pending releases it; a pending rating moves the slot to the next 14:00 Moroccan time. Recorded in app_private.fantasy_publication_state.';

-- 3. The service function the worker calls ----------------------------------------

create function api.service_evaluate_fantasy_publication(p_gameweek_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_gameweek_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  return app_private.fantasy_publication_evaluate_at(p_gameweek_id, statement_timestamp());
end $$;
revoke all on function api.service_evaluate_fantasy_publication(uuid) from public, anon, authenticated;
grant execute on function api.service_evaluate_fantasy_publication(uuid) to service_role;
comment on function api.service_evaluate_fantasy_publication(uuid) is
  'Service role: decide whether a gated journée may publish its points now (its slot has come and no rating is pending). Returns {gated, released, held, publishAt, outcome}.';

-- 4. The lifecycle state says it ---------------------------------------------------

alter function api.service_fantasy_lifecycle_state(uuid) rename to fantasy_lifecycle_state_before_publication;
alter function api.fantasy_lifecycle_state_before_publication(uuid) set schema app_private;
revoke all on function app_private.fantasy_lifecycle_state_before_publication(uuid)
  from public, anon, authenticated, service_role;
create function api.service_fantasy_lifecycle_state(p_gameweek_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select app_private.fantasy_lifecycle_state_before_publication(p_gameweek_id)
    || app_private.fantasy_publication_state_json(p_gameweek_id);
$$;
revoke all on function api.service_fantasy_lifecycle_state(uuid) from public, anon, authenticated;
grant execute on function api.service_fantasy_lifecycle_state(uuid) to service_role;

-- 5. The database refuses to publish before release ------------------------------------

alter function api.service_prepare_fantasy_live_scoring(uuid)
  rename to service_prepare_fantasy_live_scoring_before_publication;
revoke all on function api.service_prepare_fantasy_live_scoring_before_publication(uuid)
  from public, anon, authenticated, service_role;
create function api.service_prepare_fantasy_live_scoring(p_gameweek_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  perform app_private.fantasy_assert_publication_released(p_gameweek_id);
  return api.service_prepare_fantasy_live_scoring_before_publication(p_gameweek_id);
end $$;
revoke all on function api.service_prepare_fantasy_live_scoring(uuid) from public, anon, authenticated;
grant execute on function api.service_prepare_fantasy_live_scoring(uuid) to service_role;

-- The result writer is patched in place (like 20261019172832), so its reviewed
-- body, and the tests that read it, stay where they are: one line is added.
do $persist$
declare
  source text;
  anchor constant text := 'if gw.status<>''provisional'' and not (gw.status=''live'' and (app_private.fantasy_adaptive_enabled(gw.id) or app_private.fantasy_live_scoring_enabled(gw.id))) then raise exception using errcode=''PT409'',message=''gameweek_not_scorable''; end if;';
begin
  if md5((select prosrc from pg_proc
    where oid = 'api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure))
    is distinct from 'ac72c2f5bc7b1d69ac68d4aea79bfe32' then
    raise exception 'publication_gate_unexpected_persist_body';
  end if;
  source := pg_get_functiondef('api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure);
  if (length(source) - length(replace(source, anchor, ''))) <> length(anchor) then
    raise exception 'publication_gate_persist_anchor_not_unique';
  end if;
  execute replace(source, anchor,
    'perform app_private.fantasy_assert_publication_released(gw.id);' || E'\n  ' || anchor);
end
$persist$;

alter function api.service_begin_fantasy_finalization(uuid, bigint, text)
  rename to service_begin_fantasy_finalization_before_publication;
revoke all on function api.service_begin_fantasy_finalization_before_publication(uuid, bigint, text)
  from public, anon, authenticated, service_role;
create function api.service_begin_fantasy_finalization(
  p_gameweek_id uuid, p_calculation_version bigint, p_input_digest text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  perform app_private.fantasy_assert_publication_released(p_gameweek_id);
  return api.service_begin_fantasy_finalization_before_publication(
    p_gameweek_id, p_calculation_version, p_input_digest);
end $$;
revoke all on function api.service_begin_fantasy_finalization(uuid, bigint, text) from public, anon, authenticated;
grant execute on function api.service_begin_fantasy_finalization(uuid, bigint, text) to service_role;

-- The overall ranking (no gameweek) only sums what is already published.
alter function api.service_recalculate_fantasy_rankings(uuid, uuid, uuid, bigint)
  rename to service_recalculate_fantasy_rankings_before_publication;
revoke all on function api.service_recalculate_fantasy_rankings_before_publication(uuid, uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
create function api.service_recalculate_fantasy_rankings(
  p_season_id uuid, p_gameweek_id uuid default null, p_league_id uuid default null,
  p_calculation_version bigint default 1
) returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_gameweek_id is not null then
    perform app_private.fantasy_assert_publication_released(p_gameweek_id);
  end if;
  return api.service_recalculate_fantasy_rankings_before_publication(
    p_season_id, p_gameweek_id, p_league_id, p_calculation_version);
end $$;
revoke all on function api.service_recalculate_fantasy_rankings(uuid, uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function api.service_recalculate_fantasy_rankings(uuid, uuid, uuid, bigint) to service_role;

-- 6. Fan readers: an unpublished gated journée is not there ---------------------------

create or replace view app_private.fantasy_visible_team_results with (security_invoker = true) as
select r.* from app.fantasy_team_gameweek_results r
where not exists (select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id = r.gameweek_id)
  and not exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = r.gameweek_id)
union all
select (jsonb_populate_record(null::app.fantasy_team_gameweek_results, to_jsonb(r) || jsonb_build_object(
 'starting_points', t->'startingPoints', 'bench_points', t->'benchPoints', 'captain_points', t->'captainPoints',
 'transfer_hit', t->'transferHit', 'provisional_score', t->'provisionalScore', 'final_score', null,
 'state', 'provisional', 'finalized_at', null, 'calculation_version', p.calculation_version,
 'scoring_details', t, 'updated_at', p.published_at,
 'rank', (select k.rank from app.fantasy_rankings k where k.gameweek_id = r.gameweek_id and k.league_id is null and k.fantasy_team_id = r.fantasy_team_id),
 'overall_rank', (select k.rank from app.fantasy_rankings k where k.fantasy_season_id = g.fantasy_season_id and k.gameweek_id is null and k.league_id is null and k.fantasy_team_id = r.fantasy_team_id)
))).*
from app.fantasy_team_gameweek_results r join app.fantasy_gameweeks g on g.id = r.gameweek_id
join app_private.fantasy_current_rating_publications p on p.gameweek_id = r.gameweek_id
cross join lateral jsonb_array_elements(p.results->'teamResults') t
where t->>'teamId' = r.fantasy_team_id::text;

create or replace view app_private.fantasy_visible_player_points with (security_invoker = true) as
select r.* from app.fantasy_player_gameweek_points r
where not exists (select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id = r.gameweek_id)
  and not exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = r.gameweek_id)
union all
select c.fantasy_player_id, c.gameweek_id, c.provisional_points, null::integer, c.minutes_played, c.did_play,
 p.calculation_version, c.football_input_version, null::timestamptz, p.published_at, p.published_at
from app_private.fantasy_published_rating_players c
join app_private.fantasy_current_rating_publications p on p.id = c.publication_id;

create or replace view app_private.fantasy_visible_point_events with (security_invoker = true) as
select r.* from app.fantasy_player_point_events r
where not exists (select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id = r.gameweek_id)
  and not exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = r.gameweek_id)
union all
select md5(p.id::text || ':' || c.fantasy_player_id::text || ':' || (ev->>'fixtureId') || ':' || (ev->>'category'))::uuid,
 c.fantasy_player_id, c.gameweek_id, (ev->>'fixtureId')::uuid, null::uuid, ev->>'category', (ev->>'points')::integer,
 'provisional'::app.fantasy_points_state, 3, p.calculation_version, ev->>'sourceKey', null::timestamptz, p.published_at, p.published_at
from app_private.fantasy_published_rating_players c
join app_private.fantasy_current_rating_publications p on p.id = c.publication_id
cross join lateral jsonb_array_elements(c.events) ev;

create or replace view app_private.fantasy_visible_substitutions with (security_invoker = true) as
select r.* from app.fantasy_auto_substitutions r join app.fantasy_lineups l on l.id = r.lineup_id
where not exists (select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id = l.gameweek_id)
  and not exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = l.gameweek_id)
union all
select (jsonb_populate_record(null::app.fantasy_auto_substitutions, jsonb_build_object(
 'id', md5(p.id::text || ':' || (t->>'lineupId') || ':' || ord::text)::uuid, 'lineup_id', t->'lineupId',
 'player_out_id', s->'playerOutId', 'player_in_id', s->'playerInId', 'sequence_number', ord,
 'reason', s->'reason', 'calculation_version', p.calculation_version, 'created_at', p.published_at
))).*
from app_private.fantasy_current_rating_publications p
cross join lateral jsonb_array_elements(p.results->'teamResults') t
cross join lateral jsonb_array_elements(t->'substitutions') with ordinality x(s, ord);

-- Standings. A gated journée that is not published has no row of its own, and
-- the season and league totals that were written with it (points can be written
-- before the gate is switched on, or while a release is under way) are shown
-- without it: its score is taken off every total, the ranks are worked out
-- again on what is shown, and the journée's own points column is empty.
create view app_private.fantasy_held_result_seasons with (security_invoker = true) as
select distinct g.fantasy_season_id as season_id
from app_private.fantasy_unpublished_gameweeks h
join app.fantasy_gameweeks g on g.id = h.gameweek_id
where exists (select 1 from app.fantasy_team_gameweek_results r where r.gameweek_id = h.gameweek_id);
revoke all on app_private.fantasy_held_result_seasons from public, anon, authenticated, service_role;

create view app_private.fantasy_visible_rankings with (security_invoker = true) as
select r.* from app.fantasy_rankings r
where (r.gameweek_id is not null
    and not exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = r.gameweek_id))
  or (r.gameweek_id is null
    and r.fantasy_season_id not in (select season_id from app_private.fantasy_held_result_seasons))
union all
select (jsonb_populate_record(null::app.fantasy_rankings, to_jsonb(x) || jsonb_build_object(
  'total_points', x.shown_total, 'gameweek_points', null,
  'rank', rank() over (partition by x.fantasy_season_id, x.league_id order by x.shown_total desc, x.rank, x.fantasy_team_id)
))).*
from (
  select r.*, r.total_points - coalesce((
    select sum(coalesce(t.final_score, t.provisional_score))
    from app.fantasy_team_gameweek_results t
    where t.fantasy_team_id = r.fantasy_team_id
      and t.gameweek_id in (select h.gameweek_id from app_private.fantasy_unpublished_gameweeks h)), 0) as shown_total
  from app.fantasy_rankings r
  where r.gameweek_id is null
    and r.fantasy_season_id in (select season_id from app_private.fantasy_held_result_seasons)
) x;
revoke all on app_private.fantasy_visible_rankings from public, anon, authenticated, service_role;

-- The readers that took standings and journée points straight from the tables
-- read the visible views instead. Patched from pg_get_functiondef; each must
-- change, so nothing is silently left as it was.
do $readers$
declare
  sig text;
  source text;
  changed text;
begin
  foreach sig in array array[
    'api.fantasy_hub(text)',
    'api.fantasy_leagues(uuid,text,integer)',
    'api.fantasy_league_standings(uuid,uuid,bigint,uuid,integer)',
    'api.fantasy_overall_standings(uuid,uuid,bigint,uuid,integer)',
    'api.get_my_rivals(text)',
    'api.get_my_deadline_briefing(uuid)',
    'app_private.fantasy_hidden_ahead(uuid,uuid,uuid,bigint,boolean)',
    'app_private.rivals_pair(uuid,uuid,uuid)',
    'app_private.round_recap_league(uuid,uuid,uuid,uuid,integer,integer)'
  ] loop
    source := pg_get_functiondef(sig::regprocedure);
    changed := regexp_replace(source, '\mapp\.fantasy_rankings\M', 'app_private.fantasy_visible_rankings', 'g');
    changed := regexp_replace(changed, '\mapp\.fantasy_team_gameweek_results\M', 'app_private.fantasy_visible_team_results', 'g');
    if changed = source then
      raise exception 'publication_gate_reader_unchanged: %', sig;
    end if;
    execute changed;
  end loop;
end
$readers$;

-- The owner's points read: say the journée is waiting, and show no rating
-- progress for it (the pending flags come from the live rating document).
alter function api.get_my_fantasy_points(uuid, uuid) rename to get_my_fantasy_points_before_hold;
revoke all on function api.get_my_fantasy_points_before_hold(uuid, uuid) from public, anon, authenticated, service_role;
create function api.get_my_fantasy_points(p_team_id uuid, p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d jsonb; held boolean;
begin
  perform app_private.assert_mfa_step_up();
  d := api.get_my_fantasy_points_before_hold(p_team_id, p_gameweek_id);
  held := exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = p_gameweek_id);
  if not held then
    return d;
  end if;
  return (d - 'ratingPublication' - 'incrementalScoring' - 'result' - 'autoSubstitutions' - 'players')
    || jsonb_build_object(
      'result', null,
      'autoSubstitutions', '[]'::jsonb,
      'players', coalesce((select jsonb_agg(player || jsonb_build_object(
          'ratingPending', false, 'provisionalPoints', null, 'finalPoints', null, 'didPlay', null,
          'events', '[]'::jsonb) order by ord)
        from jsonb_array_elements(d->'players') with ordinality x(player, ord)), '[]'::jsonb),
      'pointsState', 'provisional',
      'publicationHeld', true,
      'publishAt', app_private.fantasy_publication_slot(p_gameweek_id));
end $$;
revoke all on function api.get_my_fantasy_points(uuid, uuid) from public, anon;
grant execute on function api.get_my_fantasy_points(uuid, uuid) to authenticated, service_role;

alter function api.fantasy_gameweek_summary(uuid) rename to fantasy_gameweek_summary_before_hold;
revoke all on function api.fantasy_gameweek_summary_before_hold(uuid) from public, anon, authenticated, service_role;
create function api.fantasy_gameweek_summary(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = p_gameweek_id)
    then (api.fantasy_gameweek_summary_before_hold(p_gameweek_id)
      - 'averagePoints' - 'highestPoints' - 'teamCount' - 'pointsState')
      || jsonb_build_object('averagePoints', null, 'highestPoints', null, 'teamCount', 0,
        'pointsState', 'provisional', 'publicationHeld', true,
        'publishAt', app_private.fantasy_publication_slot(p_gameweek_id))
    else api.fantasy_gameweek_summary_before_hold(p_gameweek_id) end;
$$;
revoke all on function api.fantasy_gameweek_summary(uuid) from public;
grant execute on function api.fantasy_gameweek_summary(uuid) to anon, authenticated, service_role;

-- The gameweek list the screens read says which journées wait, and until when.
create or replace function api.fantasy_gameweeks(p_season_id uuid, p_before_sequence integer default null, p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  with page as (
    select gameweek.id, gameweek.sequence_number, gameweek.name,
      gameweek.deadline_at, gameweek.starts_at, gameweek.ends_at,
      gameweek.status, gameweek.points_state, gameweek.closed_at,
      exists (select 1 from app_private.fantasy_unpublished_gameweeks h
        where h.gameweek_id = gameweek.id) as publication_held
    from app.fantasy_gameweeks gameweek
    where gameweek.fantasy_season_id = p_season_id
      and (p_before_sequence is null or gameweek.sequence_number < p_before_sequence)
    order by gameweek.sequence_number desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'sequence', sequence_number, 'name', name,
      'deadlineAt', deadline_at, 'startsAt', starts_at, 'endsAt', ends_at,
      'status', status, 'pointsState', points_state,
      'closedAt', closed_at,
      'publicationHeld', publication_held,
      'publishAt', case when publication_held then app_private.fantasy_publication_slot(id) end
    ) order by sequence_number desc), '[]'::jsonb),
    'nextCursor', case when count(*) = p_limit then min(sequence_number) else null end
  ) into result from page;
  return result;
end $$;

notify pgrst, 'reload schema';
$bg_20261030100000_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261030100100',
  'selection_close_accepts_moved_match',
  array[$bg_20261030100100_file$-- BotolaGO Production V2
-- Item F7: a counted match whose kickoff moved after the journée locked, and
-- which was completed within the rules' window, no longer blocks the
-- selection close.
--
-- What happened. On 29 Oct 2026 Maghreb Fès v RSB Berkane was booked in the
-- Fantasy calendar for 20:00 and kicked off at 17:00. Every team of the journée
-- had been locked on 24 Oct, before both times. api.service_begin_fantasy_
-- selection_close (20261020103533) refuses a counted match whose kickoff is
-- different from the kickoff the assignment was frozen with
-- (f.kickoff_at is distinct from a.assigned_kickoff_at), so the close, and with
-- it the opening of the next journée, failed on every worker pass.
--
-- The smallest correct change. Keep the guard, relax it for exactly the case
-- the rules already allow: a match that is FINISHED and was completed within
-- the ruleset's post-lock completion window (48 h, app.fantasy_fixture_rules.
-- post_lock_completion_window_hours) of the kickoff the journée locked with
-- stays in the journée. The fairness guard is kept in full: no team's lineup
-- may have locked AFTER the real kickoff (the lock must precede the real
-- kickoff). Nothing is written to the assignment: realigning
-- assigned_kickoff_at would rewrite a frozen record, and the close receipt
-- already carries the input digest.
--
-- Everything else in the function is unchanged. A match moved past the window,
-- one that is not finished, or one that started before a lineup locked still
-- refuses with fantasy_selection_matches_unfinished.

do $f7$
declare
  source text;
  changed text;
  old_check constant text := 'f.kickoff_at is distinct from a.assigned_kickoff_at';
  new_check constant text := $new$(f.kickoff_at is distinct from a.assigned_kickoff_at and not (
         f.status='finished' and f.finalized_at is not null
         and f.finalized_at<=a.assigned_kickoff_at+make_interval(hours=>coalesce(
           (select r.post_lock_completion_window_hours from app.fantasy_fixture_rules r where r.ruleset_id=s.ruleset_id),48))
         and not exists(select 1 from app.fantasy_lineups l where l.gameweek_id=g.id and l.locked_at>f.kickoff_at)))$new$;
begin
  if md5((select prosrc from pg_proc where oid = 'api.service_begin_fantasy_selection_close(uuid,bigint)'::regprocedure))
    is distinct from 'a8ff68656a09cf6a52c30197f42c6cc8' then
    raise exception 'selection_close_moved_match_unexpected_previous_body';
  end if;
  source := pg_get_functiondef('api.service_begin_fantasy_selection_close(uuid,bigint)'::regprocedure);
  if (length(source) - length(replace(source, old_check, ''))) <> length(old_check) then
    raise exception 'selection_close_moved_match_anchor_not_unique';
  end if;
  changed := replace(source, old_check, new_check);
  execute changed;
end
$f7$;

comment on function api.service_begin_fantasy_selection_close(uuid, bigint) is
  'Service role: carry a provisional journée over (selection-only close). A counted match whose kickoff moved after the lock is accepted when it is finished, completed within the ruleset''s post-lock window of the locked kickoff, and every lineup locked before its real kickoff (20261030100100).';
$bg_20261030100100_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261030100200',
  'rating_poll_mark_24h30',
  array[$bg_20261030100200_file$-- BotolaGO Production V2
-- Faster settling of short cameos: one more rating poll mark, 24 h 30 min after
-- full time.
--
-- Why. The audited Not-rated rule (20261019172832, owner-approved 2026-10-19)
-- settles a 1 to 9 minute appearance whose rating stays empty only after TWO
-- successful reads at least 24 hours apart (checks and captures). The poll
-- back-off of 20261026143000 reads at 15 min, 1 h, 3 h, 12 h, 24 h, 48 h, ... So
-- the first read lands about 15 minutes after the whistle and the next read that
-- is 24 h after it is the 48 h mark: a cameo settled two days after the match,
-- which is later than the journée's publication slot (two Moroccan days after
-- the last match, 14:00).
--
-- What changes. One mark, 24 h 30 min, between the 24 h and 48 h marks. A read
-- at about 24.5 h is more than 24 h after a read in the first half hour, so the
-- cameo rule can be satisfied at about 24.5 h. The cameo rule itself is not
-- touched. Nothing else in the function changes: same joins, same gameweek
-- rules, same "none once the latest source is complete", same retry of a failed
-- attempt every 30 minutes for six hours after a mark.
--
-- Cost. At most one extra SportAPI call per finished counted match whose latest
-- rating source is not yet complete at 24 h 30 min, once. For a journée of 8
-- matches that is at most 8 calls (fewer, for a match whose ratings were all in
-- by then), plus 30 minute retries of a failed read inside the six hour window.

do $mark$
declare
  source text;
  old_marks constant text := 'interval ''12 hours'',interval ''24 hours'',interval ''48 hours''';
  new_marks constant text := 'interval ''12 hours'',interval ''24 hours'',interval ''24 hours 30 minutes'',interval ''48 hours''';
begin
  if md5((select prosrc from pg_proc where oid = 'app_private.fantasy_api_rating_candidates()'::regprocedure))
    is distinct from '4a087788345c2eb22f486c57526f1c8a' then
    raise exception 'rating_poll_mark_unexpected_previous_body';
  end if;
  source := pg_get_functiondef('app_private.fantasy_api_rating_candidates()'::regprocedure);
  if (length(source) - length(replace(source, old_marks, ''))) <> length(old_marks) then
    raise exception 'rating_poll_mark_anchor_not_unique';
  end if;
  execute replace(source, old_marks, new_marks);
end
$mark$;

comment on function app_private.fantasy_api_rating_candidates() is
  'Finished Fantasy fixtures whose rating poll is due: a fixed back-off after full time (15 min, 1 h, 3 h, 12 h, 24 h, 24 h 30 min, 48 h, 4 d, 7 d, 14 d), none once the latest rating source is complete, failed attempts retried every 30 minutes for 6 hours after a mark. The 24 h 30 min mark lets the Not-rated rule (two reads 24 h apart) settle a cameo at about 24.5 h.';
$bg_20261030100200_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261030100300',
  'ops_health_publication',
  array[$bg_20261030100300_file$-- BotolaGO Production V2
-- Ops health follows the publish-all-at-once rule (20261030100000).
--
-- Why. fantasy_fixture_coverage, fantasy_scoring and fantasy_progression judge a
-- counted match by whether its rating is in and its points exist. With the
-- points of a gated journée held until its publication slot, a missing rating
-- or missing points before the slot is the normal state, not an incident: the
-- watchdog went red after every match day.
--
-- The rule (owner, 2026-10-29).
--   1. For a gated journée, a missing rating or missing points BEFORE its
--      publication slot is information only. The three checks no longer count
--      it (fantasy_fixture_health_ready and fantasy_fixture_full_stats, the
--      health-only readiness functions, answer "ready" for a journée that is
--      quiet, and the scoring check's has_points likewise).
--   2. The three checks fail only when:
--        unpublished_after_slot    the journée is still unpublished 30 minutes
--                                  after its publication slot while its
--                                  ratings are ready (the worker did not run,
--                                  or could not release it), or
--        ratings_missing_7_days    it is still unpublished 7 days after its
--                                  first slot because ratings are missing: the
--                                  owner must decide.
--        released_not_published    it was released and 30 minutes later its
--                                  points are still not written, or
--        publication_time_unknown  its publication time is still unknown 48
--                                  hours after its window ended (a counted
--                                  match is not finished): the ordinary
--                                  "match not completed" warnings are not muted.
--      All name the journée in the detail text of all three checks.
--   3. Journées before the first gated one, and every other check, are
--      untouched.
--
-- Nothing is lowered: a journée that is not gated is judged exactly as before,
-- and once a gated journée is past an alarm moment it is no longer quiet, so
-- the existing checks judge it with their own rules too.
--
-- How it is applied. fantasy_fixture_health_ready, fantasy_fixture_full_stats
-- and ops_health_checks() are wrapped (renamed, then a function of the old name
-- calls the old one); the scoring check's has_points is patched from
-- pg_get_functiondef, which raises if its anchor is not found, like
-- 20261013140000.

-- 1. The alarm moments --------------------------------------------------------------

create function app_private.fantasy_publication_alarm_at(p_gameweek_id uuid, p_now timestamptz)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  st app_private.fantasy_publication_state%rowtype;
  gw app.fantasy_gameweeks%rowtype;
  pnb timestamptz;
  slot timestamptz;
begin
  if not app_private.fantasy_publication_gated(p_gameweek_id) then return null; end if;
  select * into st from app_private.fantasy_publication_state where gameweek_id = p_gameweek_id;
  select * into gw from app.fantasy_gameweeks where id = p_gameweek_id;
  if st.released_at is not null then
    -- Released, but the points were never written (or never ranked).
    if exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = p_gameweek_id)
      and p_now > st.released_at + interval '30 minutes' then
      return 'released_not_published';
    end if;
    return null;
  end if;
  pnb := app_private.fantasy_publish_not_before(p_gameweek_id);
  if pnb is null then
    -- A counted match is not finished (or has no final time) long after the
    -- journée's window: the publication time cannot be known. Not quiet.
    if p_now > gw.ends_at + interval '48 hours' then return 'publication_time_unknown'; end if;
    return null;
  end if;
  slot := greatest(pnb, coalesce(st.deferred_until, pnb));
  if p_now > slot + interval '30 minutes' and not app_private.fantasy_selection_ratings_pending(p_gameweek_id) then
    return 'unpublished_after_slot';
  end if;
  if p_now > coalesce(st.first_slot_at, pnb) + interval '7 days' then
    return 'ratings_missing_7_days';
  end if;
  return null;
end $$;

-- Quiet: gated, not yet published to fans, and not at an alarm moment.
create function app_private.fantasy_publication_alarm_quiet(p_gameweek_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = p_gameweek_id)
    and app_private.fantasy_publication_alarm_at(p_gameweek_id, statement_timestamp()) is null;
$$;

revoke all on function app_private.fantasy_publication_alarm_at(uuid, timestamptz),
  app_private.fantasy_publication_alarm_quiet(uuid) from public, anon, authenticated, service_role;

-- 2. Readiness the health checks use ---------------------------------------------------

alter function app_private.fantasy_fixture_health_ready(uuid, uuid, boolean)
  rename to fantasy_fixture_health_ready_before_publication;
revoke all on function app_private.fantasy_fixture_health_ready_before_publication(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
create function app_private.fantasy_fixture_health_ready(p_gameweek_id uuid, p_fixture_id uuid, p_legacy_ready boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when app_private.fantasy_publication_alarm_quiet(p_gameweek_id) then true
    else app_private.fantasy_fixture_health_ready_before_publication(p_gameweek_id, p_fixture_id, p_legacy_ready) end;
$$;
revoke all on function app_private.fantasy_fixture_health_ready(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_fixture_health_ready(uuid, uuid, boolean) is
  'Ops health only: whether a counted fixture has core data. A gated journée waiting for its publication slot is ready by definition (information only, 20261030100300).';

alter function app_private.fantasy_fixture_full_stats(uuid, uuid, boolean)
  rename to fantasy_fixture_full_stats_before_publication;
revoke all on function app_private.fantasy_fixture_full_stats_before_publication(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
create function app_private.fantasy_fixture_full_stats(p_gameweek_id uuid, p_fixture_id uuid, p_legacy_ready boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when app_private.fantasy_publication_alarm_quiet(p_gameweek_id) then true
    else app_private.fantasy_fixture_full_stats_before_publication(p_gameweek_id, p_fixture_id, p_legacy_ready) end;
$$;
revoke all on function app_private.fantasy_fixture_full_stats(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

-- 3. The scoring check: no points yet is not missing points ------------------------------

do $scoring$
declare
  definition text := pg_get_functiondef('app_private.ops_health_checks_before_adaptive()'::regprocedure);
  old_fragment constant text := 'and e.superseded_at is null) as has_points';
  new_fragment constant text := 'and e.superseded_at is null) or app_private.fantasy_publication_alarm_quiet(g.id) as has_points';
begin
  if (length(definition) - length(replace(definition, old_fragment, ''))) <> length(old_fragment) then
    raise exception 'ops_health_publication: has_points anchor missing or not unique';
  end if;
  execute replace(definition, old_fragment, new_fragment);
end
$scoring$;

-- 4. Alarms, and the information, on the health answer --------------------------------------

create function app_private.fantasy_publication_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  alarms jsonb := '[]'::jsonb;
  info jsonb := '[]'::jsonb;
  item record;
  alarm text;
begin
  for item in
    select g.id, g.sequence_number, g.name, s.last_outcome, s.first_slot_at, s.deferred_until
    from app.fantasy_gameweeks g
    left join app_private.fantasy_publication_state s on s.gameweek_id = g.id
    where g.id in (select h.gameweek_id from app_private.fantasy_unpublished_gameweeks h)
    order by g.sequence_number
  loop
    alarm := app_private.fantasy_publication_alarm_at(item.id, statement_timestamp());
    info := info || jsonb_build_array(jsonb_build_object(
      'gameweekId', item.id, 'sequence', item.sequence_number,
      'publishNotBefore', app_private.fantasy_publish_not_before(item.id),
      'publishAt', app_private.fantasy_publication_slot(item.id),
      'lastOutcome', item.last_outcome, 'alarm', alarm));
    if alarm is not null then
      alarms := alarms || jsonb_build_array(jsonb_build_object(
        'gameweekId', item.id, 'sequence', item.sequence_number, 'reason', alarm,
        'detail', case alarm
          when 'unpublished_after_slot' then 'Journée ' || item.sequence_number
            || ' is still unpublished more than 30 minutes after its publication time (all ratings are in): the worker did not release it'
          when 'released_not_published' then 'Journée ' || item.sequence_number
            || ' was released more than 30 minutes ago but its points are not written: the worker did not finish'
          when 'publication_time_unknown' then 'Journée ' || item.sequence_number
            || ' has no publication time 48 hours after its window ended: a counted match is not finished'
          else 'Journée ' || item.sequence_number
            || ' is still unpublished 7 days after its first publication time because ratings are missing: the owner must decide' end));
    end if;
  end loop;
  return jsonb_build_object('info', info, 'alarms', alarms);
end $$;
revoke all on function app_private.fantasy_publication_health() from public, anon, authenticated, service_role;

alter function app_private.ops_health_checks() rename to ops_health_checks_before_publication;

create function app_private.ops_health_checks()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  result jsonb := app_private.ops_health_checks_before_publication();
  health jsonb := app_private.fantasy_publication_health();
  checks jsonb := coalesce(result -> 'checks', '[]'::jsonb);
  message text;
begin
  if jsonb_array_length(health -> 'alarms') > 0 then
    select string_agg(a ->> 'detail', '; ' order by (a ->> 'sequence')::integer)
    into message from jsonb_array_elements(health -> 'alarms') a;
    select coalesce(jsonb_agg(
      case when c ->> 'name' in ('fantasy_fixture_coverage', 'fantasy_scoring', 'fantasy_progression')
        then c || jsonb_build_object('status', 'fail',
          'detail', coalesce(nullif(c ->> 'detail', '') || '; ', '') || message)
        else c end order by ord), '[]'::jsonb)
    into checks from jsonb_array_elements(checks) with ordinality t(c, ord);
  end if;
  return result || jsonb_build_object(
    'status', case
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'fail') then 'fail'
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'warn') then 'warn'
      else 'ok' end,
    'checks', checks,
    'fantasyPublication', health -> 'info');
end $$;

revoke all on function app_private.ops_health_checks(), app_private.ops_health_checks_before_publication()
  from public, anon, authenticated, service_role;
grant execute on function app_private.ops_health_checks(), app_private.ops_health_checks_before_publication()
  to postgres;

comment on function app_private.ops_health_checks() is
  'Production health checks. For a gated Fantasy journée (20261030100000) a missing rating before its publication slot is information only (key fantasyPublication); fantasy_fixture_coverage, fantasy_scoring and fantasy_progression fail when it is unpublished 30 minutes after its slot with all ratings in, or 7 days after its first slot with ratings missing.';
$bg_20261030100300_file$]
);

do $apply_20261030100000$
declare
  part_20261030100000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261030100000'
  );
begin
  if encode(sha256(convert_to(part_20261030100000, 'UTF8')), 'hex')
    is distinct from '35683b27e2d821bcea12cf80c8c157a9fed90d54f4e4cce1f1d48c28047355c8' then
    raise exception 'stop: 20261030100000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261030100000;
end
$apply_20261030100000$;

do $apply_20261030100100$
declare
  part_20261030100100 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261030100100'
  );
begin
  if encode(sha256(convert_to(part_20261030100100, 'UTF8')), 'hex')
    is distinct from '63d07993722a7d7cf7a4b0efd7d7b40e57c8fb52753482502c76b8df31ad52d3' then
    raise exception 'stop: 20261030100100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261030100100;
end
$apply_20261030100100$;

do $apply_20261030100200$
declare
  part_20261030100200 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261030100200'
  );
begin
  if encode(sha256(convert_to(part_20261030100200, 'UTF8')), 'hex')
    is distinct from '0aa41d33181517d1430bbfb76adf5ffe771fb1653aa0334e15ac90e588df71fc' then
    raise exception 'stop: 20261030100200 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261030100200;
end
$apply_20261030100200$;

do $apply_20261030100300$
declare
  part_20261030100300 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261030100300'
  );
begin
  if encode(sha256(convert_to(part_20261030100300, 'UTF8')), 'hex')
    is distinct from '4c08fdd3a4af8f386b86d6b6e110240aef651f0adcc88c1546726e57740f6c97' then
    raise exception 'stop: 20261030100300 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261030100300;
end
$apply_20261030100300$;

do $postflight$
declare
  problems text[] := '{}';
  list_before jsonb;
  list_after jsonb;
  health_after text;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Journée 5 and earlier are untouched: none is gated.
  if exists (select 1 from app.fantasy_gameweeks g
    where g.sequence_number < 6 and app_private.fantasy_publication_gated(g.id)) then
    problems := problems || 'a journée before 6 is gated'::text;
  end if;
  if app_private.fantasy_publication_first_gameweek(
    (select s.id from app.fantasy_seasons s where s.status in ('registration_open', 'active') order by s.starts_at desc limit 1)) <> 6 then
    problems := problems || 'the first gated journée is not 6'::text;
  end if;
  -- Nothing that fans see today becomes hidden.
  if (select count(*)::text from app_private.fantasy_visible_team_results v
      join app.fantasy_gameweeks g on g.id = v.gameweek_id where g.sequence_number < 6)
    is distinct from current_setting('botolago.shown_before', true) then
    problems := problems || 'the fan view of team results changed for a journée before 6'::text;
  end if;
  -- A gated journée that already has results is hidden until its slot (not a stop): say so.
  if exists (select 1 from app_private.fantasy_held_result_seasons) then
    raise notice 'publication: a gated journée already has results; they stay hidden and are published at its slot';
  end if;
  -- The lifecycle state of the latest journée before 6 is exactly as it was.
  if current_setting('botolago.state_before', true) <> 'none' and
    (select (api.service_fantasy_lifecycle_state(g.id) - 'serverTime')::text from app.fantasy_gameweeks g
      where g.sequence_number < 6 order by g.sequence_number desc limit 1)
    is distinct from current_setting('botolago.state_before', true) then
    problems := problems || 'the lifecycle state of the latest journée before 6 changed'::text;
  end if;
  -- The gameweek list only gained its two keys; for journées before 6 they say "not held".
  if current_setting('botolago.list_before', true) <> 'none' then
    list_before := current_setting('botolago.list_before', true)::jsonb;
    list_after := (select api.fantasy_gameweeks(s.id) from app.fantasy_seasons s
      where s.status in ('registration_open', 'active') order by s.starts_at desc limit 1);
    if (select coalesce(jsonb_agg(i - 'publicationHeld' - 'publishAt' order by i ->> 'sequence'), '[]'::jsonb)
        from jsonb_array_elements(list_after -> 'items') i)
      is distinct from (select coalesce(jsonb_agg(i order by i ->> 'sequence'), '[]'::jsonb)
        from jsonb_array_elements(list_before -> 'items') i) then
      problems := problems || 'the gameweek list changed beyond its two new keys'::text;
    end if;
    if exists (select 1 from jsonb_array_elements(list_after -> 'items') i
      where (i ->> 'sequence')::integer < 6 and (i ->> 'publicationHeld')::boolean is distinct from false) then
      problems := problems || 'a journée before 6 reads as held in the gameweek list'::text;
    end if;
  end if;
  -- The health answer: the same checks with the same statuses, plus the information key.
  health_after := (select coalesce(jsonb_agg(c ->> 'name' || ':' || (c ->> 'status') order by c ->> 'name'), '[]'::jsonb)::text
    from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c);
  if health_after is distinct from current_setting('botolago.health_before', true) then
    problems := problems || ('the health checks changed: ' || health_after);
  end if;
  if jsonb_typeof(app_private.ops_health_checks() -> 'fantasyPublication') is distinct from 'array' then
    problems := problems || 'the health answer has no fantasyPublication information'::text;
  end if;
  -- Only the service role decides a publication; the new tables are not reachable from the API.
  if not has_function_privilege('service_role', 'api.service_evaluate_fantasy_publication(uuid)', 'execute')
    or has_function_privilege('anon', 'api.service_evaluate_fantasy_publication(uuid)', 'execute')
    or has_function_privilege('authenticated', 'api.service_evaluate_fantasy_publication(uuid)', 'execute') then
    problems := problems || 'api.service_evaluate_fantasy_publication is not service-role only'::text;
  end if;
  if has_table_privilege('service_role', 'app_private.fantasy_publication_state', 'select')
    or has_table_privilege('authenticated', 'app_private.fantasy_publication_settings', 'select')
    or has_table_privilege('authenticated', 'app_private.fantasy_unpublished_gameweeks', 'select') then
    problems := problems || 'a publication table or view is reachable from the API'::text;
  end if;
  if not has_function_privilege('service_role', 'api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)', 'execute')
    or not has_function_privilege('service_role', 'api.service_recalculate_fantasy_rankings(uuid,uuid,uuid,bigint)', 'execute')
    or has_function_privilege('authenticated', 'api.service_begin_fantasy_finalization(uuid,bigint,text)', 'execute')
    or not has_function_privilege('authenticated', 'api.get_my_fantasy_points(uuid,uuid)', 'execute')
    or not has_function_privilege('anon', 'api.fantasy_gameweeks(uuid,integer,integer)', 'execute') then
    problems := problems || 'a replaced function lost or gained a grant'::text;
  end if;
  -- The selection close keeps its guard on a real kickoff change, and the poll has its new mark.
  if position('post_lock_completion_window_hours' in (select prosrc from pg_proc
      where oid = 'api.service_begin_fantasy_selection_close(uuid,bigint)'::regprocedure)) = 0 then
    problems := problems || 'the selection close does not read the completion window'::text;
  end if;
  if position('interval ''24 hours 30 minutes''' in (select prosrc from pg_proc
      where oid = 'app_private.fantasy_api_rating_candidates()'::regprocedure)) = 0 then
    problems := problems || 'the rating poll schedule lacks the 24 h 30 min mark'::text;
  end if;
  -- The Morocco clock is the application's: Saturday 14:00 Moroccan time.
  if app_private.fantasy_publication_next_slot('2026-10-31 13:59:00+00')
    is distinct from '2026-10-31 14:00:00+00'::timestamptz
    or app_private.fantasy_publication_next_slot('2026-10-31 14:00:00+00')
    is distinct from '2026-11-01 14:00:00+00'::timestamptz then
    problems := problems || 'the publication slot does not follow the application''s Morocco clock'::text;
  end if;
  perform set_config('request.jwt.claims', '', true);

  if (select count(*) from supabase_migrations.schema_migrations
    where version in ('20261030100000', '20261030100100', '20261030100200', '20261030100300')) <> 4 then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'publication: no journée before 6 gated; health checks and gameweek list as before; slot follows the Morocco clock';
end
$postflight$;

rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261030100000')
    and to_regprocedure('api.service_evaluate_fantasy_publication(uuid)') is not null
    and to_regclass('app_private.fantasy_publication_state') is not null
    then 'Applied. Next: deploy the fantasy-lifecycle-worker Edge Function now if it is not deployed yet, then publish the website.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
