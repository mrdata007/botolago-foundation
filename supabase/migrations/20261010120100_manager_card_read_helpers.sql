-- Manager Card (BG-0158), gap plan 3.2: ten read helpers for the Gradins contract.
--
-- Everything the merged front end (src/backend/manager-card/contracts.ts) shows
-- and #381 does not store is derived here at read time from #381's tables: the
-- usable rules, the current season, club names, null reasons, moments, the
-- caller's card and a member's card. No column of any #381 table changes and the
-- tick is untouched.
--
-- The helpers live in app_private, are not security definer (they run inside the
-- security definer api functions of 20261010120200), carry no grant at all and
-- do not read the caller: the api functions own the caller, the step-up and the
-- switch. Display only.
--
-- Tier order everywhere: homa < stade < pro < champion < legend.
-- "Qualifies": gameweeks_counted >= the rules' minimum. A "rated row" is a
-- history row (app.manager_card_gameweeks) that qualifies and has an OVR. "The
-- order" of a manager's history rows is fantasy_seasons.starts_at,
-- fantasy_seasons.id, fantasy_gameweeks.sequence_number.

-- H1. The active rules, read defensively. Never raises; no active row, no row.
create function app_private.manager_card_active_rules()
returns table (
  version integer,
  min_rated integer,
  min_confirmed integer,
  tiers jsonb,
  cap_ignore timestamptz,
  usable boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  rule app_private.manager_card_rules%rowtype;
  v_min_rated integer;
  v_min_confirmed integer;
  v_tiers jsonb;
  v_cap_ignore timestamptz;
  v_stade numeric;
  v_pro numeric;
  v_champion numeric;
  v_legend numeric;
  v_usable boolean;
begin
  select * into rule from app_private.manager_card_rules r where r.active;
  if not found then
    return;
  end if;

  if (rule.config ->> 'minimum_gameweeks') ~ '^[0-9]{1,6}$' then
    v_min_rated := (rule.config ->> 'minimum_gameweeks')::integer;
  end if;
  if (rule.config ->> 'provisional_below') ~ '^[0-9]{1,6}$' then
    v_min_confirmed := (rule.config ->> 'provisional_below')::integer;
  end if;
  v_tiers := rule.config -> 'tiers';
  if jsonb_typeof(rule.config -> 'cap_ignore_deadlines_before') = 'string' then
    begin
      v_cap_ignore := (rule.config ->> 'cap_ignore_deadlines_before')::timestamptz;
    exception when others then
      v_cap_ignore := null;
    end;
  end if;

  if jsonb_typeof(v_tiers) = 'object'
    and jsonb_typeof(v_tiers -> 'stade') = 'number'
    and jsonb_typeof(v_tiers -> 'pro') = 'number'
    and jsonb_typeof(v_tiers -> 'champion') = 'number'
    and jsonb_typeof(v_tiers -> 'legend') = 'number' then
    v_stade := (v_tiers ->> 'stade')::numeric;
    v_pro := (v_tiers ->> 'pro')::numeric;
    v_champion := (v_tiers ->> 'champion')::numeric;
    v_legend := (v_tiers ->> 'legend')::numeric;
  end if;

  v_usable := coalesce(
    v_min_rated >= 1
    and v_min_confirmed >= v_min_rated
    and v_stade >= 1 and v_legend <= 99
    and v_stade < v_pro and v_pro < v_champion and v_champion < v_legend,
    false
  );

  return query select rule.version, v_min_rated, v_min_confirmed, v_tiers, v_cap_ignore, v_usable;
end;
$$;
revoke all on function app_private.manager_card_active_rules()
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_active_rules() is
  'The active Manager Card rules row read defensively: version, minimum_gameweeks, provisional_below, tiers, cap_ignore_deadlines_before and whether the numbers are usable for the API (a minimum of at least 1, a provisional line at or above it, four rising tiers between 1 and 99). No active row, no row. Never raises. No grant.';

-- H2. May the reads answer? Switch on and a usable active rules row.
create function app_private.manager_card_read_ready()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select s.read_enabled from app_private.manager_card_settings s where s.id), false)
    and coalesce((select r.usable from app_private.manager_card_active_rules() r), false);
$$;
revoke all on function app_private.manager_card_read_ready()
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_read_ready() is
  'True when manager_card_settings.read_enabled is on and the active rules row is usable (manager_card_active_rules). While false every Manager Card read answers {available:false}. No grant.';

-- H3. The Fantasy season the section shows: the open or active one (latest
-- start), else the latest completed one, else null.
create function app_private.manager_card_fantasy_season()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select fs.id from app.fantasy_seasons fs
      where fs.status in ('registration_open', 'active')
      order by fs.starts_at desc, fs.id desc limit 1),
    (select fs.id from app.fantasy_seasons fs
      where fs.status = 'completed'
      order by fs.starts_at desc, fs.id desc limit 1)
  );
$$;
revoke all on function app_private.manager_card_fantasy_season()
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_fantasy_season() is
  'The current Fantasy season for the Manager Card: open or active (latest start), else the latest completed, else null. No grant.';

-- H4. The season label as the card shows it: 2026/2027 becomes 2026/27.
create function app_private.manager_card_season_label(p_fantasy_season_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case when s.label ~ '^[0-9]{4}/[0-9]{4}$' then left(s.label, 5) || right(s.label, 2)
    else s.label end
  from app.fantasy_seasons fs
  join app.seasons s on s.id = fs.football_season_id
  where fs.id = p_fantasy_season_id;
$$;
revoke all on function app_private.manager_card_season_label(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_season_label(uuid) is
  'The label of a Fantasy season''s football season, NNNN/NNNN shortened to NNNN/NN; null for an unknown season. No grant.';

-- H5. Tier order.
create function app_private.manager_card_tier_rank(p_tier text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tier
    when 'homa' then 1 when 'stade' then 2 when 'pro' then 3
    when 'champion' then 4 when 'legend' then 5 end;
$$;
revoke all on function app_private.manager_card_tier_rank(text)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_tier_rank(text) is
  'homa 1 .. legend 5; null for anything else. No grant.';

-- H6. The manager's club as the card shows it, or null.
create function app_private.manager_card_club(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', team.id,
    'slug', team.slug,
    'code', nullif(btrim(team.code), ''),
    'name', jsonb_build_object(
      'fr', coalesce(fr.name, team.name), 'ar', coalesce(ar.name, team.name)),
    'shortName', jsonb_build_object(
      'fr', coalesce(fr.short_name, team.short_name),
      'ar', coalesce(ar.short_name, team.short_name)),
    'city', null,
    'primaryColor', team.primary_color,
    'secondaryColor', team.secondary_color
  )
  from app.user_preferences preference
  cross join lateral (
    select picked.id from (
      select t.id, 1 as rank from app.teams t where t.id = preference.favorite_team_id
      union all
      select t.id, 2 from app.teams t
      where preference.favorite_team_id is null
        and t.id::text = preference.favorite_team_provisional_ref
      union all
      select t.id, 3 from app.teams t
      where preference.favorite_team_id is null
        and t.slug = preference.favorite_team_provisional_ref
    ) picked
    order by picked.rank
    limit 1
  ) pick
  join app.teams team on team.id = pick.id
  left join app.team_translations fr on fr.team_id = team.id and fr.language = 'fr'
  left join app.team_translations ar on ar.team_id = team.id and ar.language = 'ar'
  where preference.user_id = p_user_id;
$$;
revoke all on function app_private.manager_card_club(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_club(uuid) is
  'The manager''s club for the card: user_preferences.favorite_team_id, else favorite_team_provisional_ref matched to a team id, then a slug. Eight keys; city is always null; null when there is none. Never writes. No grant.';

-- H7. Why a stat that is null is null. Used only for a qualifying season, and
-- only for stats that are null.
create function app_private.manager_card_stat_reasons(
  p_user_id uuid,
  p_fantasy_season_id uuid,
  p_fantasy_team_id uuid,
  p_cap_ignore timestamptz
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'cap', case when p_cap_ignore is not null and exists (
        select 1
        from app.manager_card_gameweeks h
        join app.fantasy_gameweeks gw on gw.id = h.gameweek_id
        where h.user_id = p_user_id and h.fantasy_season_id = p_fantasy_season_id
          and gw.deadline_at < p_cap_ignore
      ) then 'pre_captain_fix' else 'excluded_weeks_only' end,
    'sel', 'excluded_weeks_only',
    'trf', case
      when not exists (
        select 1 from app.fantasy_transfer_batches b
        where b.fantasy_team_id = p_fantasy_team_id and b.status = 'confirmed'
      ) then 'no_transfers'
      when not exists (
        select 1 from app.fantasy_transfer_batches b
        where b.fantasy_team_id = p_fantasy_team_id and b.status = 'confirmed'
          and b.chip_type is distinct from 'free_hit'
      ) then 'excluded_weeks_only'
      else 'window_open' end,
    'con', 'excluded_weeks_only'
  );
$$;
revoke all on function app_private.manager_card_stat_reasons(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_stat_reasons(uuid, uuid, uuid, timestamptz) is
  'The reason each of cap, sel, trf, con is null in a qualifying season, read live. The caller uses a reason only for a null stat. board_not_final is never emitted. No grant.';

-- H8. Every derivable moment of a manager, with whether it is still pending.
create function app_private.manager_card_moments(p_user_id uuid)
returns table (moment_key text, occurred_at timestamptz, moment jsonb, pending boolean)
language sql
stable
set search_path = ''
as $$
  with rules as (
    select r.min_rated from app_private.manager_card_active_rules() r
  ),
  cur as (
    select app_private.manager_card_fantasy_season() as season_id
  ),
  team as (
    select t.id, t.created_at
    from app.fantasy_teams t
    join cur on t.fantasy_season_id = cur.season_id
    where t.user_id = p_user_id
    limit 1
  ),
  card as (
    select c.created_at, c.founder_cohort, c.founder_granted_at
    from app.manager_cards c
    where c.user_id = p_user_id
  ),
  rated as (
    select h.fantasy_season_id as season_id, gw.sequence_number as seq, h.ovr, h.tier,
      h.provisional, h.gameweeks_counted, h.calculated_at,
      row_number() over (order by fs.starts_at, fs.id, gw.sequence_number) as rn
    from app.manager_card_gameweeks h
    join app.fantasy_seasons fs on fs.id = h.fantasy_season_id
    join app.fantasy_gameweeks gw on gw.id = h.gameweek_id
    join rules on h.gameweeks_counted >= rules.min_rated
    where h.user_id = p_user_id and h.ovr is not null
  ),
  user_seasons as (
    select s.fantasy_season_id as season_id, fs.status as season_status, fs.starts_at, fs.ends_at,
      s.ovr, s.tier, (s.gameweeks_counted >= rules.min_rated) as q
    from app.manager_card_seasons s
    join app.fantasy_seasons fs on fs.id = s.fantasy_season_id
    cross join rules
    where s.user_id = p_user_id
  ),
  cur_row as (
    select us.* from user_seasons us join cur on us.season_id = cur.season_id
  ),
  cur_tier as (
    select case when cr.q and cr.ovr is not null then cr.tier end as tier from cur_row cr
  ),
  all_moments as (
    -- card_created
    select 'card_created'::text as mkey, (select c.created_at from card c) as mat,
      jsonb_build_object('kind', 'card_created', 'key', 'card_created',
        'occurredAt', (select c.created_at from card c),
        'seasonLabel', app_private.manager_card_season_label(cur.season_id)) as mjson,
      true as mwin
    from cur
    where cur.season_id is not null
      and (exists (select 1 from card) or exists (select 1 from team))
    union all
    -- first_rating
    select 'first_rating:' || f.season_id, f.calculated_at,
      jsonb_build_object('kind', 'first_rating', 'key', 'first_rating:' || f.season_id,
        'occurredAt', f.calculated_at, 'gameweekSeq', f.seq, 'ovr', f.ovr, 'tier', f.tier,
        'provisional', f.provisional, 'gameweeksCounted', f.gameweeks_counted,
        'firstEver', f.rn = 1),
      coalesce(f.season_id = cur.season_id, false)
    from (select distinct on (r.season_id) r.* from rated r order by r.season_id, r.rn) f
    cross join cur
    union all
    -- provisional_cleared
    select 'provisional_cleared:' || f.season_id, f.calculated_at,
      jsonb_build_object('kind', 'provisional_cleared',
        'key', 'provisional_cleared:' || f.season_id,
        'occurredAt', f.calculated_at, 'gameweekSeq', f.seq, 'ovr', f.ovr,
        'gameweeksCounted', f.gameweeks_counted),
      coalesce(f.season_id = cur.season_id, false)
    from (select distinct on (r.season_id) r.* from rated r
      where not r.provisional order by r.season_id, r.rn) f
    cross join cur
    union all
    -- tier_changed
    select 'tier_changed:' || e.tier, e.calculated_at,
      jsonb_build_object('kind', 'tier_changed', 'key', 'tier_changed:' || e.tier,
        'occurredAt', e.calculated_at, 'tier', e.tier, 'previousTier', p.tier,
        'ovr', e.ovr, 'gameweekSeq', e.seq,
        'seasonLabel', app_private.manager_card_season_label(e.season_id)),
      coalesce(app_private.manager_card_tier_rank((select ct.tier from cur_tier ct))
        >= app_private.manager_card_tier_rank(e.tier), false)
    from (select distinct on (r.tier) r.* from rated r
      where r.tier in ('stade', 'pro', 'champion', 'legend')
      order by r.tier, r.rn) e
    join rated p on p.rn = e.rn - 1
    where app_private.manager_card_tier_rank(p.tier) < app_private.manager_card_tier_rank(e.tier)
    union all
    -- founder_granted
    select 'founder_granted', c.founder_granted_at,
      jsonb_build_object('kind', 'founder_granted', 'key', 'founder_granted',
        'occurredAt', c.founder_granted_at, 'cohort', c.founder_cohort, 'cutoffDate', null),
      true
    from card c
    where c.founder_cohort is not null
    union all
    -- season_closed
    select 'season_closed:' || us.season_id, us.ends_at,
      jsonb_build_object('kind', 'season_closed', 'key', 'season_closed:' || us.season_id,
        'occurredAt', us.ends_at,
        'seasonLabel', app_private.manager_card_season_label(us.season_id),
        'ovr', case when us.q then us.ovr end,
        'tier', case when us.q and us.ovr is not null then us.tier end),
      us.season_id = (
        select u2.season_id from user_seasons u2
        where u2.season_status = 'completed'
        order by u2.starts_at desc, u2.season_id desc limit 1)
    from user_seasons us
    where us.season_status = 'completed'
    union all
    -- season_started
    select 'season_started:' || cur.season_id, team.created_at,
      jsonb_build_object('kind', 'season_started', 'key', 'season_started:' || cur.season_id,
        'occurredAt', team.created_at,
        'seasonLabel', app_private.manager_card_season_label(cur.season_id),
        'previous', jsonb_build_object(
          'label', app_private.manager_card_season_label(prev.season_id),
          'ovr', case when prev.q then prev.ovr end,
          'tier', case when prev.q and prev.ovr is not null then prev.tier end)),
      not exists (select 1 from cur_row cr where cr.q and cr.ovr is not null)
    from cur
    join team on true
    join app.fantasy_seasons cs on cs.id = cur.season_id
    cross join lateral (
      select us.* from user_seasons us
      where us.season_status = 'completed' and us.starts_at < cs.starts_at
      order by us.starts_at desc, us.season_id desc
      limit 1
    ) prev
  )
  select m.mkey, m.mat, m.mjson,
    (coalesce(m.mwin, false) and not exists (
      select 1 from app.manager_card_moment_acks a
      where a.user_id = p_user_id and a.moment_key = m.mkey))
  from all_moments m
  order by m.mat nulls first, m.mkey;
$$;
revoke all on function app_private.manager_card_moments(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_moments(uuid) is
  'Every derivable Manager Card moment of a manager (contracts.ts moment DTOs) with pending = inside its window and not yet acknowledged. Derived at read time from the card tables and app.manager_card_moment_acks. No grant.';

-- H9. The caller's own card, the thirty keys of myCardSchema, or null.
create function app_private.manager_card_my_card(p_user_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_season uuid := app_private.manager_card_fantasy_season();
  rules record;
  profile app.profiles%rowtype;
  team app.fantasy_teams%rowtype;
  card app.manager_cards%rowtype;
  season_row app.manager_card_seasons%rowtype;
  season app.fantasy_seasons%rowtype;
  qualifies boolean;
  state text;
  v_ovr smallint;
  v_tier text;
  v_next text;
  v_best text;
  v_reasons jsonb;
  v_counted integer[];
  v_start integer;
  v_rating_gameweeks integer[];
  v_through integer;
  v_first_counted integer;
  v_first_rated integer;
  v_previous jsonb;
  v_seasons jsonb;
  v_moments jsonb;
begin
  select * into profile from app.profiles p where p.id = p_user_id and p.deleted_at is null;
  if not found or v_season is null then
    return null;
  end if;
  select * into team from app.fantasy_teams t
    where t.user_id = p_user_id and t.fantasy_season_id = v_season;
  if not found then
    return null;
  end if;
  select * into rules from app_private.manager_card_active_rules() r;
  if not found or rules.min_rated is null or rules.min_confirmed is null then
    return null;
  end if;
  select * into season from app.fantasy_seasons fs where fs.id = v_season;
  select * into card from app.manager_cards c where c.user_id = p_user_id;
  select * into season_row from app.manager_card_seasons s
    where s.user_id = p_user_id and s.fantasy_season_id = v_season;

  qualifies := season_row.user_id is not null and season_row.gameweeks_counted >= rules.min_rated;
  state := case
    when not qualifies then 'forming'
    when season_row.ovr is null then 'insufficient'
    when season_row.provisional then 'provisional'
    else 'rated' end;
  v_ovr := case when qualifies then season_row.ovr end;
  v_tier := case when v_ovr is not null then season_row.tier end;

  select h.tier into v_best
  from app.manager_card_gameweeks h
  where h.user_id = p_user_id and h.fantasy_season_id = v_season
    and h.gameweeks_counted >= rules.min_rated and h.ovr is not null and h.tier is not null
  order by app_private.manager_card_tier_rank(h.tier) desc
  limit 1;

  v_next := case v_tier
    when 'homa' then 'stade' when 'stade' then 'pro'
    when 'pro' then 'champion' when 'champion' then 'legend' end;

  v_reasons := app_private.manager_card_stat_reasons(
    p_user_id, v_season, team.id, rules.cap_ignore);

  select gw.sequence_number into v_through
  from app.fantasy_gameweeks gw where gw.id = season_row.through_gameweek_id;

  select min(gw.sequence_number) into v_first_counted
  from app.manager_card_gameweeks h
  join app.fantasy_gameweeks gw on gw.id = h.gameweek_id
  where h.user_id = p_user_id and h.fantasy_season_id = v_season;

  select min(gw.sequence_number) into v_first_rated
  from app.manager_card_gameweeks h
  join app.fantasy_gameweeks gw on gw.id = h.gameweek_id
  where h.user_id = p_user_id and h.fantasy_season_id = v_season
    and h.gameweeks_counted >= rules.min_rated and h.ovr is not null;

  if state = 'forming' and season.status is distinct from 'completed' then
    select coalesce(array_agg(gw.sequence_number order by gw.sequence_number), '{}')
      into v_counted
    from app.manager_card_gameweeks h
    join app.fantasy_gameweeks gw on gw.id = h.gameweek_id
    where h.user_id = p_user_id and h.fantasy_season_id = v_season;

    v_start := case when cardinality(v_counted) > 0 then v_counted[cardinality(v_counted)] + 1 end;
    if v_start is null then
      select min(gw.sequence_number) into v_start
      from app.fantasy_lineups l
      join app.fantasy_gameweeks gw on gw.id = l.gameweek_id
      where l.fantasy_team_id = team.id and gw.fantasy_season_id = v_season;
    end if;
    if v_start is null then
      select min(gw.sequence_number) into v_start
      from app.fantasy_gameweeks gw
      where gw.fantasy_season_id = v_season
        and gw.status in ('scheduled', 'open', 'locked', 'live', 'provisional', 'finalizing');
    end if;
    if v_start is not null then
      v_rating_gameweeks := v_counted || coalesce((
        select array_agg(next.sequence_number order by next.sequence_number)
        from (
          select gw.sequence_number
          from app.fantasy_gameweeks gw
          where gw.fantasy_season_id = v_season and gw.status <> 'cancelled'
            and gw.sequence_number >= v_start
          order by gw.sequence_number
          limit greatest(rules.min_rated - cardinality(v_counted), 0)
        ) next
      ), '{}');
      if cardinality(v_rating_gameweeks) = 0 then
        v_rating_gameweeks := null;
      end if;
    end if;
  end if;

  select jsonb_build_object(
    'label', app_private.manager_card_season_label(prev.fantasy_season_id),
    'ovr', case when prev.gameweeks_counted >= rules.min_rated then prev.ovr end,
    'tier', case when prev.gameweeks_counted >= rules.min_rated and prev.ovr is not null
      then prev.tier end)
  into v_previous
  from app.manager_card_seasons prev
  join app.fantasy_seasons pfs on pfs.id = prev.fantasy_season_id
  where prev.user_id = p_user_id and pfs.starts_at < season.starts_at
  order by pfs.starts_at desc, pfs.id desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'seasonId', s.id,
      'label', app_private.manager_card_season_label(s.id),
      'ovr', case when s.counted >= rules.min_rated then s.ovr end,
      'tier', case when s.counted >= rules.min_rated and s.ovr is not null then s.tier end,
      'bestTier', (
        select h.tier from app.manager_card_gameweeks h
        where h.user_id = p_user_id and h.fantasy_season_id = s.id
          and h.gameweeks_counted >= rules.min_rated and h.ovr is not null
          and h.tier is not null
        order by app_private.manager_card_tier_rank(h.tier) desc limit 1),
      'gameweeksCounted', s.counted,
      'closedAt', case when s.status = 'completed' then s.ends_at end
    ) order by s.starts_at desc, s.id desc), '[]'::jsonb)
  into v_seasons
  from (
    select fs.id, fs.starts_at, fs.status, fs.ends_at, ms.gameweeks_counted as counted,
      ms.ovr, ms.tier
    from app.manager_card_seasons ms
    join app.fantasy_seasons fs on fs.id = ms.fantasy_season_id
    where ms.user_id = p_user_id
    union all
    select fs.id, fs.starts_at, fs.status, fs.ends_at, 0, null::smallint, null::text
    from app.fantasy_seasons fs
    where fs.id = v_season and season_row.user_id is null
  ) s;

  select coalesce(jsonb_agg(m.moment order by m.occurred_at nulls first, m.moment_key), '[]'::jsonb)
  into v_moments
  from app_private.manager_card_moments(p_user_id) m
  where m.pending;

  return jsonb_build_object(
    'teamId', team.id,
    'name', coalesce(nullif(btrim(profile.display_name), ''), team.name),
    'handle', profile.username,
    'season', jsonb_build_object('id', v_season, 'label', app_private.manager_card_season_label(v_season)),
    'serial', card.serial,
    'founder', case when card.founder_cohort is not null then jsonb_build_object(
      'cohort', card.founder_cohort, 'grantedAt', card.founder_granted_at, 'cutoffDate', null)
      end,
    'club', app_private.manager_card_club(p_user_id),
    'ratingState', state,
    'ovr', v_ovr,
    'ovrNullReason', case state when 'forming' then 'pending_minimum'
      when 'insufficient' then 'too_few_stats' end,
    'tier', v_tier,
    'bestTier', v_best,
    'nextTier', case when v_ovr is not null and v_next is not null then jsonb_build_object(
      'code', v_next, 'fromOvr', ceil((rules.tiers ->> v_next)::numeric)::integer) end,
    'provisional', v_ovr is not null and season_row.provisional,
    'stats', jsonb_build_object(
      'cap', jsonb_build_object(
        'value', case when state <> 'forming' then season_row.cap end,
        'nullReason', case when state = 'forming' then 'pending_minimum'
          when season_row.cap is null then v_reasons ->> 'cap' end),
      'sel', jsonb_build_object(
        'value', case when state <> 'forming' then season_row.sel end,
        'nullReason', case when state = 'forming' then 'pending_minimum'
          when season_row.sel is null then v_reasons ->> 'sel' end),
      'trf', jsonb_build_object(
        'value', case when state <> 'forming' then season_row.trf end,
        'nullReason', case when state = 'forming' then 'pending_minimum'
          when season_row.trf is null then v_reasons ->> 'trf' end),
      'con', jsonb_build_object(
        'value', case when state <> 'forming' then season_row.con end,
        'nullReason', case when state = 'forming' then 'pending_minimum'
          when season_row.con is null then v_reasons ->> 'con' end)
    ),
    'gameweeksCounted', coalesce(season_row.gameweeks_counted, 0),
    'minRated', rules.min_rated,
    'minConfirmed', rules.min_confirmed,
    'rulesVersion', case when season_row.user_id is not null
      then 'v' || season_row.rules_version end,
    'throughGameweekSeq', v_through,
    'calculatedAt', season_row.calculated_at,
    'firstCountedGameweekSeq', v_first_counted,
    'firstRatedGameweekSeq', v_first_rated,
    'ratingGameweeks', to_jsonb(v_rating_gameweeks),
    'ratingGameweeksComplete', v_rating_gameweeks is not null
      and cardinality(v_rating_gameweeks) >= rules.min_rated,
    'previousSeason', v_previous,
    'seasonClosed', season.status = 'completed',
    'seasons', v_seasons,
    'createdAt', card.created_at,
    'moments', v_moments
  );
end;
$$;
revoke all on function app_private.manager_card_my_card(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_my_card(uuid) is
  'The caller''s card for the current Fantasy season in the shape of myCardSchema (30 keys), or null (no profile, deleted-pending, no season, no team). Figures are null under the minimum. Display only. No grant.';

-- H10. Other managers' cards, the fourteen keys of memberCardSchema each, for a
-- list of Fantasy teams at once. One row per known team with a visible profile;
-- unknown teams and deleted-pending profiles give no row. It takes the whole
-- list on purpose: called once per team (a function per row, each call with its
-- own nested club, label and rules calls) it cost about 1 ms a team on the local
-- stack, 200 ms for 100 teams; as one statement over the list it takes under
-- 10 ms.
create function app_private.manager_card_member_card(p_fantasy_team_ids uuid[])
returns table (team_id uuid, card jsonb)
language sql
stable
set search_path = ''
as $$
  select t.id, jsonb_build_object(
    'teamId', t.id,
    'name', coalesce(nullif(btrim(p.display_name), ''), t.name),
    'club', app_private.manager_card_club(t.user_id),
    'serial', c.serial,
    'founderCohort', c.founder_cohort,
    'seasonLabel', app_private.manager_card_season_label(t.fantasy_season_id),
    'ratingState', st.state,
    'ovr', case when st.q then s.ovr end,
    'tier', case when st.q and s.ovr is not null then s.tier end,
    'provisional', st.q and s.ovr is not null and s.provisional,
    'stats', jsonb_build_object(
      'cap', case when st.q then s.cap end,
      'sel', case when st.q then s.sel end,
      'trf', case when st.q then s.trf end,
      'con', case when st.q then s.con end),
    'gameweeksCounted', coalesce(s.gameweeks_counted, 0),
    'minRated', rules.min_rated,
    'firstRatedGameweekSeq', (
      select min(gw.sequence_number)
      from app.manager_card_gameweeks h
      join app.fantasy_gameweeks gw on gw.id = h.gameweek_id
      where h.user_id = t.user_id and h.fantasy_season_id = t.fantasy_season_id
        and h.gameweeks_counted >= rules.min_rated and h.ovr is not null)
  )
  from app.fantasy_teams t
  join app.profiles p on p.id = t.user_id and p.deleted_at is null
  left join app.manager_cards c on c.user_id = t.user_id
  left join app.manager_card_seasons s
    on s.user_id = t.user_id and s.fantasy_season_id = t.fantasy_season_id
  cross join (select r.min_rated from app_private.manager_card_active_rules() r) rules
  cross join lateral (
    select coalesce(s.gameweeks_counted >= rules.min_rated, false) as q,
      case
        when not coalesce(s.gameweeks_counted >= rules.min_rated, false) then 'forming'
        when s.ovr is null then 'insufficient'
        when s.provisional then 'provisional'
        else 'rated' end as state
  ) st
  where t.id = any (p_fantasy_team_ids);
$$;
revoke all on function app_private.manager_card_member_card(uuid[])
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_member_card(uuid[]) is
  'The cards of the given Fantasy teams for each team''s own season in the shape of memberCardSchema (14 keys), one (team_id, card) row per known team with a visible profile; unknown teams and deleted-pending profiles give no row. A team with no card row is a forming card. Set-based: one statement for the whole list. No handle, moments, user id or e-mail. No grant.';
