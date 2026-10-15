-- BotolaGO+ Trophées, part 3: the reads and the frame choice.
--
-- FIVE api functions and five helpers, all display only:
--
--   api.get_my_trophies(p_season)       the caller's cabinet: what they earned (each with the time
--                                       its result was published), what is waiting for a
--                                       publication, how far they are from the rest (figures the
--                                       server counts), the frames they hold, and whether they
--                                       show their trophies to their league mates
--   api.choose_card_frame(p_code)       the frame drawn around the caller's Manager Card
--   api.get_trophy_card_frames(p_teams) the frame other people see on up to 100 cards
--   api.set_trophies_visibility(p_visible)
--                                       the switch « Montrer mes trophées » (on by default)
--   api.get_league_member_trophies(p_league)
--                                       the trophies the caller's mates in one private league
--                                       have earned this season, for those who show them
--
-- WHO SEES WHAT (owner decisions, 2026-10-15). Trophées are earned by everyone, so the cabinet's
-- LIST is readable by every signed-in manager once BotolaGO+ is on; what BotolaGO+ adds is the
-- presentation: choosing a frame (a trophy earned and a membership held) and, on the screens, the
-- lit cabinet and the story card. The member flag in the answer says which the caller is.
--
--   BotolaGO+ off, or the Manager Card reads off     {"available": false}
--   preview, caller not a member                      {"available": false}
--   on, caller not a member                           {"available": true, "member": false, ...}
--   a member                                          {"available": true, "member": true, ...}
--
-- app_private.trophy_access(user) answers off / free / member in one place, so the three
-- functions cannot disagree. It is the one new function that names the membership functions; the
-- test card_editions.test.sql lists it.
--
-- WHO SEES A MANAGER'S TROPHIES (owner decision, 2026-10-15). Only the trophies earned: never
-- points, ratings or tiers. By default the managers who share a private Fantasy league with them
-- in the current season. Never strangers, never a public or overall league. A manager hides them
-- with api.set_trophies_visibility(false). Looking at mates' trophies is free (basic social
-- sharing stays free) and follows the cabinet's own gate: the viewer needs the same
-- app_private.trophy_access as for their own cabinet, so BotolaGO+ off (or preview and not a
-- member) shows nothing.
--
-- LEAGUE TROPHIES are placement awards given at the end of the season (20261015150100). Before
-- that the cabinet lists them as in progress, with the manager's rank today, never as earned.
--
-- FRAMES copy the card editions (20261013100100): cosmetic, public where the card is drawn,
-- standard when the membership ends (the choice is remembered), and in preview a member's frame
-- is shown to its owner only. Nothing here changes a score, a rating, a tier or a rank.
--
-- NEVER TAKEN BACK. Nothing here deletes or changes a trophy. A trophy the evaluator granted is
-- served as it was granted, whatever the card's calculation says later.

-- ---------------------------------------------------------------------------
-- Helpers (app_private, no grant)
-- ---------------------------------------------------------------------------
create function app_private.trophy_access(p_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case app_private.card_reads_mode()
    when 'on' then case when app_private.has_premium(p_user) then 'member' else 'free' end
    when 'preview' then case when app_private.has_premium(p_user) then 'member' else 'off' end
    else 'off'
  end;
$$;
revoke all on function app_private.trophy_access(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.trophy_access(uuid) is
  'What the Trophées reads show this person: off (BotolaGO+ or the card reads off, or preview and not a member), free (on, not a member) or member. No grant.';

-- The frame a card is drawn in for a viewer: the chosen frame when it is live, the trophy behind
-- it is earned and the manager is a member now (in preview, only to the manager); else standard.
create function app_private.card_frame_effective(p_user uuid, p_viewer uuid default null)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select f.code
    from app.card_frame_choices c
    join app.card_frames f on f.code = c.frame_code
    where c.user_id = p_user
      and f.status = 'active'
      and f.code <> 'standard'
      and app_private.trophy_access(p_user) = 'member'
      and (p_user is not distinct from p_viewer or app_private.card_premium_mode() = 'on')
      and exists (
        select 1 from app.trophies_earned e
        where e.user_id = p_user and e.trophy_code = f.trophy_code)
  ), 'standard');
$$;
revoke all on function app_private.card_frame_effective(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.card_frame_effective(uuid, uuid) is
  'The frame code a manager''s card shows to a viewer: the chosen frame when active, earned, and the manager is a member now (in preview, only to the manager); else standard. Cosmetic: nothing computes from it. No grant.';

-- The journée a podium may be waiting on. The podium is given at the end of the season, so this
-- is null all season; it speaks only once the season is over (completed, or active past its end
-- date) and not yet final: the manager plays in a private league of at least three managers, has
-- not earned the podium this season, and there is a journée with a result that is not yet final
-- for the card (ratings not all published). When the manager would stand in the first three on the
-- scores that exist today, that journée's number; otherwise null. Shown as "en attente", never as
-- a trophy.
create function app_private.trophy_pending_podium(p_user uuid, p_season uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  with waiting as (
    select max(g.sequence_number) as seq
    from app.fantasy_team_gameweek_results r
    join app.fantasy_teams t on t.id = r.fantasy_team_id and t.user_id = p_user
      and t.fantasy_season_id = p_season
    join app.fantasy_gameweeks g on g.id = r.gameweek_id
    where g.id not in (select e.gameweek_id from app_private.card_evaluable_gameweeks(p_season) e)
  ), leagues as (
    select l.id
    from app.fantasy_leagues l
    join app.fantasy_league_memberships me
      on me.league_id = l.id and me.user_id = p_user and me.status = 'active'
    where l.fantasy_season_id = p_season and l.visibility = 'private' and l.active
  ), mem as (
    select l.id as league_id, m.user_id, m.team_id
    from leagues l cross join lateral app_private.card_league_members(l.id) m
  ), tot as (
    select m.league_id, m.user_id,
      coalesce((select sum(w.score) from app_private.card_week_rows(m.user_id, p_season) w), 0)
      + coalesce((
          select coalesce(r.final_score, r.provisional_score)
          from app.fantasy_team_gameweek_results r
          join app.fantasy_gameweeks g on g.id = r.gameweek_id
          where r.fantasy_team_id = m.team_id and g.fantasy_season_id = p_season
            and g.sequence_number = (select w.seq from waiting w)), 0) as total
    from mem m
  ), ranked as (
    select t.*, rank() over (partition by t.league_id order by t.total desc) as rk,
      count(*) over (partition by t.league_id) as n
    from tot t
  )
  select case when exists (
      select 1 from ranked r
      where r.user_id = p_user and r.n >= 3
        and r.rk <= (select c.need from app.trophy_catalog c where c.code = 'league_podium'))
    and exists (
      select 1 from app.fantasy_seasons fs
      where fs.id = p_season
        and (fs.status = 'completed' or (fs.status = 'active' and fs.ends_at <= statement_timestamp())))
    and not exists (select 1 from app_private.trophy_season_end(p_season))
    and not exists (
      select 1 from app.trophies_earned e
      where e.user_id = p_user and e.trophy_code = 'league_podium' and e.fantasy_season_id = p_season)
    then (select w.seq from waiting w) end;
$$;
revoke all on function app_private.trophy_pending_podium(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.trophy_pending_podium(uuid, uuid) is
  'The journée whose unpublished ratings keep the league podium waiting for this manager, or null. Read only. No grant.';

-- Where the manager stands today in their best private league of at least three managers: the
-- rank and the number of managers ranked, on the cumulative final score. One row, or none. The
-- cabinet shows it as « en cours » for the league trophies, which are given at the end of the
-- season only.
create function app_private.trophy_league_now(p_user uuid, p_season uuid)
returns table (rk integer, n integer)
language sql
stable
set search_path = ''
as $$
  select f.rk, f.n
  from (
    select distinct on (l.league_id) l.rk, l.n
    from app_private.trophy_league_ranks(p_user, p_season) l
    order by l.league_id, l.seq desc) f
  where f.n >= 3
  order by f.rk, f.n desc
  limit 1;
$$;
revoke all on function app_private.trophy_league_now(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.trophy_league_now(uuid, uuid) is
  'The manager''s rank today (and how many are ranked) in their best private league of at least three managers, or no row. Shown as in progress for the end-of-season league trophies. Read only. No grant.';

-- ---------------------------------------------------------------------------
-- api.get_my_trophies
-- ---------------------------------------------------------------------------
create function api.get_my_trophies(p_season text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  access text;
  v_season uuid;
  v_played integer;
  v_best integer;
  v_counted integer;
  v_ovr integer;
  v_gain numeric;
  v_min_rated integer;
  v_tiers jsonb;
  v_pending integer;
  v_rank integer;
  v_earned jsonb;
  v_catalog jsonb;
  v_progress jsonb;
  v_frames jsonb;
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
  access := app_private.trophy_access(actor);
  if access = 'off' then
    return jsonb_build_object('available', false);
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'profile_not_found';
  end if;

  if p_season is null then
    v_season := app_private.manager_card_fantasy_season();
  else
    v_season := app_private.card_resolve_season(p_season);
    if v_season is null then
      raise exception using errcode = 'PT404', message = 'card_season_not_found';
    end if;
  end if;

  -- What the caller earned in the season, and the card-scope trophy.
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', e.trophy_code,
      'family', c.family,
      'labelFr', c.label_fr,
      'labelAr', c.label_ar,
      'seasonId', e.fantasy_season_id,
      'gameweekSeq', e.gameweek_seq,
      'facts', e.facts,
      'publishedAt', e.source_published_at,
      'earnedAt', e.earned_at
    ) order by c.sort_order, e.earned_at), '[]'::jsonb)
  into v_earned
  from app.trophies_earned e
  join app.trophy_catalog c on c.code = e.trophy_code
  where e.user_id = actor
    and (e.fantasy_season_id is not distinct from v_season or e.fantasy_season_id is null);

  select coalesce(jsonb_agg(jsonb_build_object(
      'code', c.code, 'family', c.family, 'scope', c.scope, 'need', c.need,
      'labelFr', c.label_fr, 'labelAr', c.label_ar
    ) order by c.sort_order), '[]'::jsonb)
  into v_catalog
  from app.trophy_catalog c where c.status = 'active';

  -- The figures the server counts, for the trophies still to earn.
  select count(*)::integer, max(w.score)::integer, max(w.gameweeks_counted)::integer,
    (array_agg(w.ovr order by w.seq desc) filter (where w.ovr is not null))[1]::integer
  into v_played, v_best, v_counted, v_ovr
  from app_private.card_week_rows(actor, v_season) w;
  select max(t.gain) into v_gain
  from app_private.card_transfer_rows(actor, v_season) t where t.ready;
  select r.min_rated, r.tiers into v_min_rated, v_tiers from app_private.manager_card_active_rules() r;
  -- league trophies are given at the end of the season: today's rank is progress, never a trophy
  select n.rk into v_rank from app_private.trophy_league_now(actor, v_season) n;

  select coalesce(jsonb_agg(jsonb_build_object(
      'code', c.code,
      'have', case c.code
        when 'ten_gameweeks' then v_played
        when 'thirty_gameweeks' then v_played
        when 'gw_80' then v_best
        when 'first_rating' then v_counted
        when 'winning_transfer' then floor(v_gain)::integer
        when 'first_stade' then v_ovr
        when 'first_pro' then v_ovr
        when 'first_champion' then v_ovr
        when 'first_legend' then v_ovr
        when 'league_podium' then v_rank
        when 'league_leader' then v_rank
      end,
      'need', case
        when c.code = 'first_rating' then v_min_rated
        when c.code = 'first_stade' then ceil((v_tiers ->> 'stade')::numeric)::integer
        when c.code = 'first_pro' then ceil((v_tiers ->> 'pro')::numeric)::integer
        when c.code = 'first_champion' then ceil((v_tiers ->> 'champion')::numeric)::integer
        when c.code = 'first_legend' then ceil((v_tiers ->> 'legend')::numeric)::integer
        else c.need
      end,
      'unit', case
        when c.code in ('ten_gameweeks', 'thirty_gameweeks', 'first_rating') then 'gameweeks'
        when c.code in ('gw_80', 'winning_transfer') then 'points'
        when c.code like 'first\_%' then 'rating'
        else 'rank'
      end
    ) order by c.sort_order), '[]'::jsonb)
  into v_progress
  from app.trophy_catalog c
  where c.status = 'active' and c.code <> 'founder_2026'
    and not exists (
      select 1 from app.trophies_earned e
      where e.user_id = actor and e.trophy_code = c.code
        and e.fantasy_season_id is not distinct from case when c.scope = 'card' then null else v_season end);

  v_pending := case when v_season is not null then app_private.trophy_pending_podium(actor, v_season) end;

  select coalesce(jsonb_agg(jsonb_build_object(
      'code', f.code,
      'trophyCode', f.trophy_code,
      'labelFr', f.label_fr,
      'labelAr', f.label_ar,
      'earned', f.trophy_code is null or exists (
        select 1 from app.trophies_earned e where e.user_id = actor and e.trophy_code = f.trophy_code)
    ) order by f.sort_order), '[]'::jsonb)
  into v_frames
  from app.card_frames f where f.status = 'active';

  return jsonb_build_object(
    'available', true,
    'member', access = 'member',
    'season', case when v_season is not null then jsonb_build_object(
      'id', v_season, 'label', app_private.manager_card_season_label(v_season)) end,
    'journeesPlayed', coalesce(v_played, 0),
    'catalog', v_catalog,
    'earned', v_earned,
    'pending', case when v_pending is not null then jsonb_build_array(jsonb_build_object(
      'code', 'league_podium', 'gameweekSeq', v_pending, 'reason', 'ratings_not_published'))
      else '[]'::jsonb end,
    'progress', v_progress,
    'frames', v_frames,
    'chosenFrame', coalesce((select c.frame_code from app.card_frame_choices c where c.user_id = actor), 'standard'),
    'frame', app_private.card_frame_effective(actor, actor),
    'showToLeagues', coalesce((
      select v.show_to_league_mates from app.trophy_visibility v where v.user_id = actor), true)
  );
end;
$$;
revoke all on function api.get_my_trophies(text) from public, anon, authenticated, service_role;
grant execute on function api.get_my_trophies(text) to authenticated, service_role;
comment on function api.get_my_trophies(text) is
  'The caller''s Trophées for a Fantasy season (default the current one): {available, member, season, journeesPlayed, catalog, earned, pending, progress, frames, chosenFrame, frame, showToLeagues}. earned carries each trophy''s facts and the time its result was published; a trophy is never removed. progress counts the rest on the server (for the league podium and champion, given only at the end of the season, it is today''s rank in the best private league of three or more). showToLeagues says whether league mates see the caller''s trophies (default true). Readable by every signed-in manager once BotolaGO+ is on (member says whether they hold the subscription); {available:false} while BotolaGO+ or the card reads are off, or in preview for a non-member. Nothing is written. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.choose_card_frame
-- ---------------------------------------------------------------------------
create function api.choose_card_frame(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  access text;
  frame app.card_frames%rowtype;
begin
  if p_code is null or p_code !~ '^[a-z][a-z0-9_]{1,39}$' then
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
  access := app_private.trophy_access(actor);
  if access = 'off' then
    return jsonb_build_object('available', false);
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'profile_not_found';
  end if;

  select * into frame from app.card_frames f where f.code = p_code and f.status = 'active';
  if not found then
    raise exception using errcode = 'PT404', message = 'card_frame_not_found';
  end if;
  -- The standard frame is always allowed, so a lapsed member can go back to it. Any other frame
  -- needs the membership now AND the trophy earned.
  if frame.code <> 'standard' then
    if access <> 'member' then
      raise exception using errcode = 'PT403', message = 'premium_required';
    end if;
    if not exists (
      select 1 from app.trophies_earned e where e.user_id = actor and e.trophy_code = frame.trophy_code
    ) then
      raise exception using errcode = 'PT403', message = 'trophy_not_earned';
    end if;
  end if;

  insert into app.card_frame_choices (user_id, frame_code)
  values (actor, frame.code)
  on conflict (user_id) do update set
    frame_code = excluded.frame_code,
    chosen_at = statement_timestamp();

  return jsonb_build_object(
    'available', true,
    'chosenFrame', frame.code,
    'frame', app_private.card_frame_effective(actor, actor)
  );
end;
$$;
revoke all on function api.choose_card_frame(text) from public, anon, authenticated, service_role;
grant execute on function api.choose_card_frame(text) to authenticated, service_role;
comment on function api.choose_card_frame(text) is
  'Chooses the caller''s card frame: {available, chosenFrame, frame}. standard is always allowed; another frame needs BotolaGO+ (PT403 premium_required) and the trophy it rewards (PT403 trophy_not_earned). {available:false} while BotolaGO+ or the card reads are off. Cosmetic only. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.get_trophy_card_frames
-- ---------------------------------------------------------------------------
create function api.get_trophy_card_frames(p_team_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  result jsonb;
begin
  if p_team_ids is null or cardinality(p_team_ids) > 1000
    or (select count(distinct asked.id) from unnest(p_team_ids) as asked(id)) > 100 then
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
  -- Only the cards that wear a frame are listed; every other card is the standard frame.
  select coalesce(jsonb_agg(jsonb_build_object('teamId', found.team_id, 'frame', found.frame)
    order by found.team_id), '[]'::jsonb)
  into result
  from (
    select team.id as team_id, app_private.card_frame_effective(team.user_id, actor) as frame
    from app.fantasy_teams team
    join app.profiles profile on profile.id = team.user_id and profile.deleted_at is null
    where team.id in (select distinct t.id from unnest(p_team_ids) as t(id) where t.id is not null)
  ) found
  where found.frame <> 'standard';
  return jsonb_build_object('available', true, 'frames', result);
end;
$$;
revoke all on function api.get_trophy_card_frames(uuid[]) from public, anon, authenticated, service_role;
grant execute on function api.get_trophy_card_frames(uuid[]) to authenticated, service_role;
comment on function api.get_trophy_card_frames(uuid[]) is
  'The frames up to 100 Fantasy teams'' cards are drawn in: {available, frames:[{teamId, frame}]}, only the cards that wear a frame (public where the card is drawn; in preview a member''s frame is shown to its owner only). {available:false} while BotolaGO+ or the card reads are off. Nothing is written. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.set_trophies_visibility
-- ---------------------------------------------------------------------------
create function api.set_trophies_visibility(p_visible boolean)
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
  mode := app_private.card_reads_mode();
  if mode is distinct from 'on' and mode is distinct from 'preview' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if app_private.trophy_access(actor) = 'off' then
    return jsonb_build_object('available', false);
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'profile_not_found';
  end if;

  insert into app.trophy_visibility (user_id, show_to_league_mates)
  values (actor, p_visible)
  on conflict (user_id) do update set show_to_league_mates = excluded.show_to_league_mates;

  return jsonb_build_object('available', true, 'showToLeagues', p_visible);
end;
$$;
revoke all on function api.set_trophies_visibility(boolean) from public, anon, authenticated, service_role;
grant execute on function api.set_trophies_visibility(boolean) to authenticated, service_role;
comment on function api.set_trophies_visibility(boolean) is
  'The switch « Montrer mes trophées »: whether the managers who share a private Fantasy league with the caller see the trophies they earned (never points, ratings or tiers). On by default. {available, showToLeagues}; {available:false} while BotolaGO+ or the card reads are off. Changes nothing else. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.get_league_member_trophies
-- ---------------------------------------------------------------------------
-- The trophies the caller's mates in one private league have earned this season (and the card
-- trophy), for the mates who show them. Only the caller's own active private leagues of the
-- current season answer; for anything else (a stranger, a public league, a past season) the answer
-- is PT404 league_not_found and nothing about the league is said. The caller's own trophies are
-- not listed (they have the cabinet), nor are mates who switched them off or have none.
create function api.get_league_member_trophies(p_league uuid)
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
  v_league uuid;
  result jsonb;
begin
  if p_league is null then
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
  if app_private.trophy_access(actor) = 'off' then
    return jsonb_build_object('available', false);
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'profile_not_found';
  end if;

  v_season := app_private.manager_card_fantasy_season();
  select l.id into v_league
  from app.fantasy_leagues l
  join app.fantasy_league_memberships me
    on me.league_id = l.id and me.user_id = actor and me.status = 'active'
  where l.id = p_league and l.visibility = 'private' and l.active
    and l.fantasy_season_id = v_season;
  if v_league is null then
    raise exception using errcode = 'PT404', message = 'league_not_found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', m.team_id, 'count', t.n, 'trophies', t.list
    ) order by m.team_id), '[]'::jsonb)
  into result
  from app_private.card_league_members(v_league) m
  cross join lateral (
    select count(*)::integer as n,
      jsonb_agg(jsonb_build_object(
        'code', e.trophy_code,
        'family', c.family,
        'labelFr', c.label_fr,
        'labelAr', c.label_ar,
        'gameweekSeq', e.gameweek_seq,
        'publishedAt', e.source_published_at
      ) order by c.sort_order, e.earned_at) as list
    from app.trophies_earned e
    join app.trophy_catalog c on c.code = e.trophy_code
    where e.user_id = m.user_id
      and (e.fantasy_season_id = v_season or e.fantasy_season_id is null)
  ) t
  where m.user_id <> actor
    and t.n > 0
    and coalesce((
      select v.show_to_league_mates from app.trophy_visibility v where v.user_id = m.user_id), true);

  return jsonb_build_object('available', true, 'leagueId', v_league, 'members', result);
end;
$$;
revoke all on function api.get_league_member_trophies(uuid) from public, anon, authenticated, service_role;
grant execute on function api.get_league_member_trophies(uuid) to authenticated, service_role;
comment on function api.get_league_member_trophies(uuid) is
  'The trophies earned this season (and the card trophy) by the caller''s mates in one of their active private leagues of the current season: {available, leagueId, members:[{teamId, count, trophies:[{code, family, labelFr, labelAr, gameweekSeq, publishedAt}]}]}. Only mates who show them (the switch is on by default) and have at least one; never the caller, never points, ratings or tiers. PT404 league_not_found for any league the caller is not an active member of, a public league or a past season. Same gate as the cabinet: {available:false} while BotolaGO+ or the card reads are off, or in preview for a non-member. Nothing is written. Signed-in, step-up.';

notify pgrst, 'reload schema';
