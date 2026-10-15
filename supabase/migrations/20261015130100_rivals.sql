-- BotolaGO+ Rivaux, migration 2 of 3: pinned rivals, the head-to-head read and their text.
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
