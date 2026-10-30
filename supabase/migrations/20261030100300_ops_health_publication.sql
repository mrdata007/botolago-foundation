-- BotolaGO Production V2
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
