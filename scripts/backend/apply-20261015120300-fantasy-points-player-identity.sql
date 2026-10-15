-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261015120300_fantasy_points_player_identity
-- (audit finding FANT-07, 2026-10-15; docs/audits/2026-10-15-audit-remediation-phase-b.md):
--   an old Fantasy round names every player it scored, including one who has
--   since left today's buying pool.
--   api.get_my_fantasy_points returns each lineup player's id and points. The
--   screen used to look the id up in the buying pool (api.fantasy_player_pool),
--   which lists only players who are active and eligible TODAY, so a player
--   who was later retired, delisted or made ineligible was dropped from the
--   pitch of a round he scored in, while his points stayed in the total. Each
--   player of the payload now also carries `identity` (name, position, club
--   id, club name and short name), read from his own app.fantasy_players row
--   whether or not that row is active or eligible today.
--   It is a READ. It wraps the current function once more, exactly as
--   20260927140000 and 20261013160200 did: the current function is renamed to
--   api.get_my_fantasy_points_before_identity (nobody may execute it) and a
--   new api.get_my_fantasy_points calls it, adds `identity` to each player and
--   keeps the ownership check, the sign-in and the ordinary-account step-up
--   (app_private.assert_mfa_step_up is called by the new outer function too).
--   Every existing key, the order of the players and the callers (signed-in
--   users and the service role; not anon, not PUBLIC) are as they were; the
--   one other difference is that a payload with no `players` key now has an
--   empty list. It changes no table, no data, no setting; it never
--   reactivates or changes a player.
--   WHAT IT DOES NOT DO: `identity` is the fantasy player's CURRENT catalogue
--   row, not his club or position as of that round. A mid-season transfer
--   updates football_team_id on the same row, so a transferred player's old
--   round shows his CURRENT club (docs/audits/2026-10-15-audit-remediation-phase-b.md,
--   risk 3). Club history needs a snapshot taken when a lineup is saved, or the
--   team membership valid at the gameweek's date; neither is done here.
--
-- WHEN
--   Only after scripts/backend/apply-20261014-sofascore-rating-release.sql has
--   been COMMITTED: that release carries 20261013160200 (the wrapper that is
--   the current api.get_my_fantasy_points, which this one wraps). This script
--   refuses before it: it needs the 20261013160200 history row and the current
--   function byte for byte. It does not depend on the other two Phase A/B
--   scripts (apply-20261014180100-fantasy-worker-health-backlog.sql,
--   apply-20261015120200-client-error-intake-budget.sql); apply the three in
--   the order of their timestamps (this one last). Any time of day; it needs
--   well under a second. Run it ONCE: the rename makes a second run refuse.
--   The app works without it: the points screen then says that some players
--   of an old round cannot be named.
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   Nothing needs pausing, because this script writes no table at all: its
--   only change is to two function definitions in the system catalog. No cron
--   job, the Fantasy tick, the Fantasy worker tick (fantasy-worker-tick),
--   manager-card-tick or any other job calls api.get_my_fantasy_points (it is an
--   owner-scoped read for a signed-in manager) or writes pg_proc. Signed-in
--   managers calling it during the commit see the old function until the
--   transaction ends and the new one after; the swap is atomic. Still make
--   sure that no other schema change (another apply script, a migration, a
--   deploy) is running right now: a rehearsal that ends in rollback takes
--   locks too. The script proves nothing else depends on the function by name
--   (no view, default or constraint refers to it) before it renames it.
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address
--      contains tkewgajrljbwgwedqsxn; the database holds no project name this
--      script could check, so look at the address) -> SQL Editor -> New query.
--      Optional read-only pre-checks: docs/production/PHASE_A_B_MIGRATIONS_OWNER_RUNBOOK.md.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   2. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects. Do NOT run the
--   migration file by hand to get around a refusal: it is not repeatable.
--
-- WHAT IT DOES
--   * refuses to run twice (history row, or api.get_my_fantasy_points_before_identity
--     already there), before 20261013160200 is recorded, on a database missing
--     a table, column, function or role the new function uses, where the
--     current api.get_my_fantasy_points is not the 20261013160200 wrapper (md5
--     of its source, attributes, and callers: authenticated and service_role
--     only), where the function it wraps is executable by anyone, and where
--     anything depends on the function by name;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1] (the form the migration promoter and the other
--     apply scripts use), and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without writing anything: the new outer function is the
--     file's, with the same callers as before; the renamed one is the old
--     wrapper byte for byte and executable by nobody; the function it wraps
--     is still closed; the history row is there; and it prints, as a NOTICE,
--     how many fantasy players have no complete identity row (those would get
--     `identity: null`). It does NOT call the function (that needs a signed-in
--     manager): the behaviour is covered by the CI database tests
--     supabase/tests/database/fantasy_points_read_surfaces.test.sql and
--     ordinary_account_mfa_step_up_reads.test.sql.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  absent text;
  fn record;
  leaked boolean;
  dependents text;
  -- md5 of the source of the CURRENT api.get_my_fantasy_points (the wrapper
  -- 20261013160200 installs, the text between its $$ marks). The tests
  -- recompute it from the repository file.
  current_points_md5 constant text := 'b5cfcb2f2484ced5b9d18894fffe0ae4';
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261015120300') then
    raise exception 'stop: migration 20261015120300 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261013160200') then
    raise exception 'stop: 20261013160200 (staged stats progression, the current api.get_my_fantasy_points) is not applied yet -- run scripts/backend/apply-20261014-sofascore-rating-release.sql (committed) first';
  end if;
  if to_regprocedure('api.get_my_fantasy_points_before_identity(uuid,uuid)') is not null then
    raise exception 'stop: api.get_my_fantasy_points_before_identity(uuid,uuid) already exists -- this update was run before';
  end if;
  select string_agg(r.rolname, ', ') into absent
  from (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
  where not exists (select 1 from pg_catalog.pg_roles x where x.rolname = r.rolname);
  if absent is not null then
    raise exception 'stop: the database is missing roles: %', absent;
  end if;

  -- Tables and columns the new body joins.
  select string_agg(v.rel || '.' || v.col, ', ' order by v.rel, v.col) into absent
  from (values
    ('app.fantasy_players', 'id'), ('app.fantasy_players', 'football_player_id'),
    ('app.fantasy_players', 'football_team_id'), ('app.fantasy_players', 'position_id'),
    ('app.fantasy_positions', 'id'), ('app.fantasy_positions', 'code'),
    ('app.players', 'id'), ('app.players', 'display_name'),
    ('app.teams', 'id'), ('app.teams', 'name'), ('app.teams', 'short_name')
  ) v(rel, col)
  where not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass(v.rel) and a.attname = v.col and a.attnum > 0 and not a.attisdropped);
  if absent is not null then
    raise exception 'stop: the database is missing what the identity read joins: %', absent;
  end if;

  select string_agg(v.sig, ', ' order by v.sig) into absent
  from (values
    ('api.get_my_fantasy_points(uuid,uuid)'), ('api.get_my_fantasy_points_before_staged(uuid,uuid)'),
    ('app_private.assert_mfa_step_up()')
  ) v(sig)
  where to_regprocedure(v.sig) is null;
  if absent is not null then
    raise exception 'stop: the database is missing functions this update needs: %', absent;
  end if;

  -- The current function must be exactly the 20261013160200 wrapper, callable
  -- by authenticated and service_role, not by anon or PUBLIC.
  select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.prorettype::regtype::text as rettype,
         l.lanname, p.proacl, p.proowner
    into fn
  from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
  where p.oid = 'api.get_my_fantasy_points(uuid,uuid)'::regprocedure;
  if md5(fn.prosrc) <> current_points_md5 then
    raise exception 'stop: api.get_my_fantasy_points(uuid,uuid) is not the version this update wraps (20261013160200)';
  end if;
  if not fn.prosecdef or fn.provolatile <> 's' or fn.rettype <> 'jsonb' or fn.lanname <> 'plpgsql'
    or fn.proconfig is distinct from array['search_path=""'] then
    raise exception 'stop: api.get_my_fantasy_points(uuid,uuid) has attributes other than the reviewed ones (security definer, stable, plpgsql, jsonb, empty search_path)';
  end if;
  if has_function_privilege('anon', 'api.get_my_fantasy_points(uuid,uuid)', 'execute')
    or not has_function_privilege('authenticated', 'api.get_my_fantasy_points(uuid,uuid)', 'execute')
    or not has_function_privilege('service_role', 'api.get_my_fantasy_points(uuid,uuid)', 'execute')
    or exists (select 1 from aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) a where a.grantee = 0) then
    raise exception 'stop: api.get_my_fantasy_points(uuid,uuid) is not callable by exactly authenticated and service_role';
  end if;

  -- The function it wraps stays closed.
  select exists (
    select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 0 or a.grantee in (select oid from pg_catalog.pg_roles
      where rolname in ('anon', 'authenticated', 'service_role')))
    into leaked
  from pg_catalog.pg_proc p where p.oid = 'api.get_my_fantasy_points_before_staged(uuid,uuid)'::regprocedure;
  if leaked then
    raise exception 'stop: api.get_my_fantasy_points_before_staged(uuid,uuid) is executable by PUBLIC, anon, authenticated or service_role';
  end if;

  -- Renaming the function moves every dependency recorded on it by oid (a
  -- view, a default, a constraint, a SQL-bodied function). There must be none.
  select string_agg(d.classid::regclass::text || ' ' || d.objid::text, ', ') into dependents
  from pg_catalog.pg_depend d
  where d.refclassid = 'pg_proc'::regclass
    and d.refobjid = 'api.get_my_fantasy_points(uuid,uuid)'::regprocedure
    and d.deptype = 'n';
  if dependents is not null then
    raise exception 'stop: something depends on api.get_my_fantasy_points by name and would follow the rename: %', dependents;
  end if;

  perform set_config('bg.points_privs_before',
    has_function_privilege('anon', 'api.get_my_fantasy_points(uuid,uuid)', 'execute')::text || '/'
    || has_function_privilege('authenticated', 'api.get_my_fantasy_points(uuid,uuid)', 'execute')::text || '/'
    || has_function_privilege('service_role', 'api.get_my_fantasy_points(uuid,uuid)', 'execute')::text, true);
  perform set_config('bg.cron_jobs_before',
    (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
     from cron.job j), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261015120300, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261015120300',
  'fantasy_points_player_identity',
  array[$bg_20261015120300_file$-- FANT-07 (part): an old round can name a player who has left today's buying pool.
--
-- api.get_my_fantasy_points returns each lineup player's id and points, and the
-- screen used to look the id up in api.fantasy_player_pool, which lists only
-- players who are active and eligible today. A player who has since been
-- retired, delisted or made ineligible was dropped from the pitch of a round
-- he scored in, while his points stayed in the total.
--
-- Each player of the payload now also carries `identity`: his name, position,
-- club and club short name, read from his own app.fantasy_players row whether
-- or not that row is active or eligible today. The wrapped function (with its
-- ownership and step-up guards), every existing key, the order of the players
-- and the grants are as they were. It is a read. The one other difference: a
-- payload with no `players` key now has `players: []` (coalesce below).
--
-- What this does NOT do: it is not the player as of that round. `identity` is
-- the season's current catalogue row of the fantasy player, and a mid-season
-- transfer updates football_team_id on that same row (20260925200000,
-- 20260926060000), so a transferred player's old round shows his CURRENT club;
-- a position edit would show the same way. The database keeps no per-round copy
-- (app.fantasy_lineup_players freezes only the price). Club history for
-- transferred players needs either a snapshot taken when the lineup is saved or
-- the app.team_memberships row valid at the gameweek's date, the way
-- app_private.fantasy_player_fixture_modes reads it. Neither is done here.
-- It never reactivates or changes a player.
--
-- Same wrapping pattern as 20260927140000 and 20261013160200. The outer
-- function applies the ordinary-account step-up itself (as 20261013160200
-- does): ordinary_account_mfa_step_up_reads.test.sql counts the api functions
-- whose own code does, and the renamed inner function is no longer executable.

alter function api.get_my_fantasy_points(uuid, uuid) rename to get_my_fantasy_points_before_identity;
revoke all on function api.get_my_fantasy_points_before_identity(uuid, uuid)
  from public, anon, authenticated, service_role;

create function api.get_my_fantasy_points(p_team_id uuid, p_gameweek_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare d jsonb;
begin
  perform app_private.assert_mfa_step_up();
  -- Ownership, authentication and the same step-up also remain in the wrapped RPC.
  d := api.get_my_fantasy_points_before_identity(p_team_id, p_gameweek_id);
  return d || jsonb_build_object('players', coalesce((
    select jsonb_agg(
      player || jsonb_build_object('identity', (
        select jsonb_build_object(
          'name', football_player.display_name,
          'position', position.code,
          'footballTeamId', football_team.id,
          'teamName', football_team.name,
          'teamShortName', football_team.short_name
        )
        from app.fantasy_players fantasy_player
        join app.fantasy_positions position on position.id = fantasy_player.position_id
        join app.players football_player on football_player.id = fantasy_player.football_player_id
        join app.teams football_team on football_team.id = fantasy_player.football_team_id
        where fantasy_player.id = (player ->> 'fantasyPlayerId')::uuid
      ))
      order by ordinal
    )
    from jsonb_array_elements(
      case when jsonb_typeof(d -> 'players') = 'array' then d -> 'players' else '[]'::jsonb end
    ) with ordinality as lineup(player, ordinal)
  ), '[]'::jsonb));
end $$;

revoke all on function api.get_my_fantasy_points(uuid, uuid) from public, anon;
grant execute on function api.get_my_fantasy_points(uuid, uuid) to authenticated, service_role;

comment on function api.get_my_fantasy_points(uuid, uuid) is
  'Owner-scoped gameweek points for one fantasy team, including the per-player scoring events, the auto-substitutions applied at finalization and, per player, his identity (name, position, club) whether or not he is still in the buying pool.';
$bg_20261015120300_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261015120300 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261015120300'
  );
begin
  if encode(sha256(convert_to(part_20261015120300, 'UTF8')), 'hex')
    is distinct from '1bbe87cd63c667cabf5599fbaa143e639a046a8c113d67731071de5f3677fc99' then
    raise exception 'stop: 20261015120300 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261015120300;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn record;
  inner_fn record;
  leaked boolean;
  players_total bigint;
  players_without_identity bigint;
  new_points_md5 constant text := 'd55a006a09592712e19a8442d65384dc';
  previous_points_md5 constant text := 'b5cfcb2f2484ced5b9d18894fffe0ae4';
begin
  -- The new outer function: the file's source, the attributes, the callers.
  select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.prorettype::regtype::text as rettype,
         l.lanname, p.proacl, p.proowner, obj_description(p.oid, 'pg_proc') as comment
    into fn
  from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
  where p.oid = 'api.get_my_fantasy_points(uuid,uuid)'::regprocedure;
  if md5(fn.prosrc) <> new_points_md5 then
    problems := problems || 'api.get_my_fantasy_points is not the new source'::text;
  end if;
  if not fn.prosecdef or fn.provolatile <> 's' or fn.rettype <> 'jsonb' or fn.lanname <> 'plpgsql'
    or fn.proconfig is distinct from array['search_path=""'] then
    problems := problems || 'api.get_my_fantasy_points changed its attributes'::text;
  end if;
  if (has_function_privilege('anon', 'api.get_my_fantasy_points(uuid,uuid)', 'execute')::text || '/'
      || has_function_privilege('authenticated', 'api.get_my_fantasy_points(uuid,uuid)', 'execute')::text || '/'
      || has_function_privilege('service_role', 'api.get_my_fantasy_points(uuid,uuid)', 'execute')::text)
     is distinct from current_setting('bg.points_privs_before', true)
    or exists (select 1 from aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) a where a.grantee = 0) then
    problems := problems || 'who may call api.get_my_fantasy_points changed'::text;
  end if;
  if fn.comment is null or position('identity' in fn.comment) = 0 then
    problems := problems || 'the function comment was not updated'::text;
  end if;

  -- The renamed one is the old wrapper, byte for byte, and closed.
  if to_regprocedure('api.get_my_fantasy_points_before_identity(uuid,uuid)') is null then
    problems := problems || 'the wrapped function api.get_my_fantasy_points_before_identity is missing'::text;
  else
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.proacl, p.proowner
      into inner_fn
    from pg_catalog.pg_proc p
    where p.oid = 'api.get_my_fantasy_points_before_identity(uuid,uuid)'::regprocedure;
    if inner_fn.proowner is distinct from fn.proowner then
      problems := problems || 'the new function and the wrapped one have different owners'::text;
    end if;
    if md5(inner_fn.prosrc) <> previous_points_md5
      or not inner_fn.prosecdef or inner_fn.provolatile <> 's'
      or inner_fn.proconfig is distinct from array['search_path=""'] then
      problems := problems || 'the wrapped function is not the previous wrapper'::text;
    end if;
    select exists (
      select 1 from aclexplode(coalesce(inner_fn.proacl, acldefault('f', inner_fn.proowner))) a
      where a.grantee = 0 or a.grantee in (select oid from pg_catalog.pg_roles
        where rolname in ('anon', 'authenticated', 'service_role'))) into leaked;
    if leaked then
      problems := problems || 'api.get_my_fantasy_points_before_identity is executable by PUBLIC, anon, authenticated or service_role'::text;
    end if;
  end if;

  -- The function underneath is still the one it wrapped, and closed.
  if to_regprocedure('api.get_my_fantasy_points_before_staged(uuid,uuid)') is null then
    problems := problems || 'api.get_my_fantasy_points_before_staged disappeared'::text;
  elsif has_function_privilege('anon', 'api.get_my_fantasy_points_before_staged(uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'api.get_my_fantasy_points_before_staged(uuid,uuid)', 'execute')
    or has_function_privilege('service_role', 'api.get_my_fantasy_points_before_staged(uuid,uuid)', 'execute') then
    problems := problems || 'api.get_my_fantasy_points_before_staged became executable'::text;
  end if;

  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j)
    is distinct from current_setting('bg.cron_jobs_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261015120300') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  -- Information only: players for whom the read would return `identity: null`.
  select count(*), count(*) filter (where not exists (
      select 1 from app.fantasy_positions fpos
      join app.players fb on fb.id = fp.football_player_id
      join app.teams ft on ft.id = fp.football_team_id
      where fpos.id = fp.position_id))
    into players_total, players_without_identity
  from app.fantasy_players fp;
  raise notice 'fantasy players: %; without a complete identity row (identity would be null): %',
    players_total, players_without_identity;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261015120300')
    then 'Applied. api.get_my_fantasy_points now names every player of a round (identity), whether or not he is still in the buying pool.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
