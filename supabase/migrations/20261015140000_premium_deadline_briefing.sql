-- BotolaGO+ (membership), the deadline briefing: two reads for members.
--
--   api.get_my_deadline_briefing(p_season_id)      the whole briefing in one call
--   api.get_my_briefing_alternatives(p_player_out) affordable same-position alternatives
--
-- WHAT THE BRIEFING IS. A pre-deadline screen for the caller's own team and the gameweek that is
-- open for changes: which of their players the data provider lists as injured or suspended (with
-- the provider's date), the minutes each played and the points each scored in the last three
-- journées (with the date those points were published), the next opponent with our own difficulty
-- estimate, who could replace a player inside the budget, and the transfer rules that apply
-- (free transfers, the cost of an extra one, the club limit). It is display only.
--
-- NOTHING IS INVENTED. The app has no injury or suspension feed of its own: app.fixture_absences
-- and app.player_availability are written only by a provider importer, and for the SofaScore
-- source nothing writes them. So "absence" is exactly a row of those two tables, with its source
-- date, and the answer says how many absences the provider listed for the gameweek
-- (`absenceFeed.listed`): zero means "no list available", never "nobody is absent".
-- app.fantasy_players.status is not read: nothing ever writes it, so "available" there means
-- "nothing known".
--
-- NO FALLBACK AS A RATING. Under the rating rule (20261014090000) a player who appeared and was
-- not rated scores 5, and a rating of 4.5 to 5.49 also rounds to 5; the stored result does not
-- say which. A 5 from an appearance under that rule is therefore returned as state `no_rating`
-- with no number. Before the rule (or outside it) a 5 is an ordinary total.
-- A journée not yet published is state `pending` with no number; "published" is the player's
-- final points and the date they were finalized.
--
-- WHO. Members only, in the order of the other premium reads (api.get_card_league_context):
--   BotolaGO+ off                                  {"available": false}
--   (the step-up, the caller PT401)
--   preview, caller not a member                   {"available": false}
--   on, caller not a member                        {"available": true, "locked": true}
--   a member with no team or no open gameweek      {"available": true, "locked": false, "gameweek": null}
-- SHIPS OFF with the rest of BotolaGO+. No table, no job, no writer: both reads are STABLE.
--
-- "SINCE YOUR LAST VISIT" is kept on the reader's device, not here: nothing is stored about it.

-- ---------------------------------------------------------------------------
-- Helpers (app_private, no grant at all)
-- ---------------------------------------------------------------------------

-- 'off' | 'locked' | 'member' for a signed-in caller, given the BotolaGO+ mode (preview or on).
create function app_private.briefing_membership(p_actor uuid, p_mode text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when app_private.has_premium(p_actor) then 'member'
    when p_mode = 'preview' then 'off'
    else 'locked'
  end;
$$;
revoke all on function app_private.briefing_membership(uuid, text)
  from public, anon, authenticated, service_role;
comment on function app_private.briefing_membership(uuid, text) is
  'The deadline briefing''s membership check: member, locked (BotolaGO+ on, not a member) or off (preview, not a member). No grant.';

-- The last three journées before p_before_seq for each given fantasy player: one jsonb array per
-- player, oldest first: {gameweekSequence, gameweekName, state: published|pending|no_rating,
-- points, minutes, publishedAt}. See the header for `no_rating` and `pending`.
create function app_private.briefing_form(p_season uuid, p_before_seq integer, p_players uuid[])
returns table (fantasy_player_id uuid, form jsonb)
language sql
stable
set search_path = ''
as $$
  with gws as (
    select g.id, g.sequence_number, g.name, g.finalized_at,
      g.status in ('finalized', 'corrected') as done,
      app_private.fantasy_rating_scoring_enabled(g.id) as rating_rule
    from app.fantasy_gameweeks g
    where g.fantasy_season_id = p_season
      and g.sequence_number < p_before_seq
      and g.status <> 'cancelled'
    order by g.sequence_number desc
    limit 3
  ), cells as (
    select p.id as pid, g.sequence_number, g.name, g.rating_rule, g.finalized_at as gw_at,
      pts.finalized_at as row_at, pts.minutes_played, pts.did_play,
      (g.done or pts.final_points is not null) as published,
      case when pts.final_points is not null then pts.final_points when g.done then 0 end as pts_value
    from unnest(p_players) as p(id)
    cross join gws g
    left join app.fantasy_player_gameweek_points pts
      on pts.fantasy_player_id = p.id and pts.gameweek_id = g.id
  ), shaped as (
    select c.*,
      case
        when not c.published then 'pending'
        when c.rating_rule and coalesce(c.did_play, false) and c.pts_value = 5 then 'no_rating'
        else 'published'
      end as state
    from cells c
  )
  select s.pid, jsonb_agg(jsonb_build_object(
      'gameweekSequence', s.sequence_number,
      'gameweekName', s.name,
      'state', s.state,
      'points', case when s.state = 'published' then s.pts_value end,
      'minutes', case when s.published then coalesce(s.minutes_played, 0) end,
      'publishedAt', case when s.published then coalesce(s.row_at, s.gw_at) end
    ) order by s.sequence_number)
  from shaped s
  group by s.pid;
$$;
revoke all on function app_private.briefing_form(uuid, integer, uuid[])
  from public, anon, authenticated, service_role;
comment on function app_private.briefing_form(uuid, integer, uuid[]) is
  'The last three journées before a sequence, per fantasy player: published points with their date, pending, or no_rating (a 5 from an appearance under the rating rule is never shown as a number). Read only. No grant.';

-- ---------------------------------------------------------------------------
-- api.get_my_deadline_briefing
-- ---------------------------------------------------------------------------
create function api.get_my_deadline_briefing(p_season_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  v_member text;
  v_season uuid;
  v_team app.fantasy_teams%rowtype;
  v_gw app.fantasy_gameweeks%rowtype;
  v_rules app.fantasy_rulesets%rowtype;
  v_lineup uuid;
  v_diff jsonb := '[]'::jsonb;
  v_league uuid;
  v_league_name text;
  v_league_json jsonb;
  v_my_rank bigint;
  v_ahead jsonb;
  v_size integer;
  v_listed integer;
  v_squad jsonb;
  v_published jsonb;
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
  v_member := app_private.briefing_membership(actor, mode);
  if v_member = 'off' then
    return jsonb_build_object('available', false);
  end if;
  if v_member = 'locked' then
    return jsonb_build_object('available', true, 'locked', true);
  end if;

  if p_season_id is null then
    select s.id into v_season from app.fantasy_seasons s
    where s.status in ('registration_open', 'active')
    order by s.starts_at desc, s.id limit 1;
  else
    v_season := p_season_id;
  end if;
  select * into v_team from app.fantasy_teams t
  where t.user_id = actor and t.fantasy_season_id = v_season and t.status = 'active';
  if v_team.id is null then
    return jsonb_build_object('available', true, 'locked', false, 'gameweek', null);
  end if;

  -- The gameweek open for changes: the one whose deadline comes next.
  select * into v_gw from app.fantasy_gameweeks g
  where g.fantasy_season_id = v_season and g.status = 'open'
  order by g.deadline_at, g.sequence_number limit 1;
  if v_gw.id is null then
    return jsonb_build_object('available', true, 'locked', false, 'gameweek', null);
  end if;
  select r.* into v_rules from app.fantasy_seasons s
  join app.fantasy_rulesets r on r.id = s.ruleset_id where s.id = v_season;

  select l.id into v_lineup from app.fantasy_lineups l
  where l.fantasy_team_id = v_team.id and l.gameweek_id = v_gw.id;
  if v_lineup is null then
    select l.id into v_lineup from app.fantasy_lineups l
    where l.fantasy_team_id = v_team.id and l.gameweek_id = v_team.current_gameweek_id;
  end if;

  -- Our own difficulty estimate for the gameweek; where it is not available, no estimate is shown.
  begin
    v_diff := api.fantasy_fixture_difficulty(v_season, v_gw.sequence_number, 1);
  exception when others then
    v_diff := '[]'::jsonb;
  end;

  select count(*)::integer into v_listed
  from app.fixture_absences a
  join app.fantasy_fixture_assignments fa
    on fa.fixture_id = a.fixture_id and fa.gameweek_id = v_gw.id
    and fa.superseded_at is null and fa.counts_points;

  with owned as (
    select fp.id, fp.football_player_id, fp.football_team_id, fp.price, m.current_sale_price,
      pos.code as position_code, pos.display_order, pl.display_name, t.short_name, t.name as club_name
    from app.fantasy_squad_memberships m
    join app.fantasy_players fp on fp.id = m.fantasy_player_id
    join app.fantasy_positions pos on pos.id = fp.position_id
    join app.players pl on pl.id = fp.football_player_id
    join app.teams t on t.id = fp.football_team_id
    where m.fantasy_team_id = v_team.id and m.sold_at is null
  ), forms as (
    select f.fantasy_player_id, f.form
    from app_private.briefing_form(v_season, v_gw.sequence_number, (select coalesce(array_agg(o.id), '{}') from owned o)) f
  ), next_fx as (
    select distinct on (d.club) d.club, d.opp, d.is_home, d.difficulty, d.confidence
    from (
      select (e ->> 'clubId')::uuid as club, (e ->> 'opponentClubId')::uuid as opp,
        (e ->> 'isHome')::boolean as is_home, (e ->> 'difficulty')::integer as difficulty,
        e ->> 'confidence' as confidence, (e ->> 'kickoffAt')::timestamptz as kickoff
      from jsonb_array_elements(v_diff) e
    ) d
    order by d.club, d.kickoff
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'fantasyPlayerId', o.id,
      'name', o.display_name,
      'position', o.position_code,
      'club', jsonb_build_object('id', o.football_team_id, 'shortName', o.short_name, 'name', o.club_name),
      'price', o.price,
      'salePrice', o.current_sale_price,
      'role', lp.slot::text,
      'captain', coalesce(lp.captain, false),
      'viceCaptain', coalesce(lp.vice_captain, false),
      'form', coalesce(fm.form, '[]'::jsonb),
      'absence', (
        select to_jsonb(x) from (
          select u.category, u.expected_return_on as "expectedReturnOn", u.games_missed as "gamesMissed",
            u.as_of as "asOf", 'provider'::text as source
          from (
            select a.category, a.expected_return_on, a.games_missed, a.provider_updated_at as as_of
            from app.fixture_absences a
            join app.fantasy_fixture_assignments fa
              on fa.fixture_id = a.fixture_id and fa.gameweek_id = v_gw.id
              and fa.superseded_at is null and fa.counts_points
            where a.player_id = o.football_player_id
            union all
            select case av.status when 'injured' then 'injury' else 'suspension' end,
              av.expected_return_on, null::integer, av.provider_updated_at
            from app.player_availability av
            where av.player_id = o.football_player_id and av.active
              and av.status in ('injured', 'suspended')
              and av.starts_on <= current_date and (av.ends_on is null or av.ends_on >= current_date)
          ) u
          order by u.as_of desc limit 1
        ) x),
      'nextFixture', (
        select jsonb_build_object(
          'opponent', jsonb_build_object('id', n.opp, 'shortName', ot.short_name, 'name', ot.name),
          'isHome', n.is_home, 'difficulty', n.difficulty, 'confidence', n.confidence)
        from next_fx n join app.teams ot on ot.id = n.opp
        where n.club = o.football_team_id)
    ) order by o.display_order, o.price desc, o.id), '[]'::jsonb)
  into v_squad
  from owned o
  left join forms fm on fm.fantasy_player_id = o.id
  left join app.fantasy_lineup_players lp on lp.lineup_id = v_lineup and lp.fantasy_player_id = o.id;

  -- The three journées before this one, as the squad's figures show them.
  select coalesce(jsonb_agg(jsonb_build_object(
      'sequence', g.sequence_number, 'name', g.name,
      'state', case when g.status in ('finalized', 'corrected') then 'published'
        when exists (select 1 from app.fantasy_player_gameweek_points p
          where p.gameweek_id = g.id and p.final_points is not null) then 'partial'
        else 'pending' end,
      'publishedAt', coalesce(g.finalized_at, (
        select max(p.finalized_at) from app.fantasy_player_gameweek_points p where p.gameweek_id = g.id))
    ) order by g.sequence_number), '[]'::jsonb)
  into v_published
  from (
    select * from app.fantasy_gameweeks g2
    where g2.fantasy_season_id = v_season and g2.sequence_number < v_gw.sequence_number
      and g2.status <> 'cancelled'
    order by g2.sequence_number desc limit 3
  ) g;

  -- The league the leagues list shows first, and where the caller stands in it.
  select l.id, l.name into v_league, v_league_name
  from app.fantasy_leagues l
  join app.fantasy_league_memberships me
    on me.league_id = l.id and me.user_id = actor and me.status = 'active'
  where l.fantasy_season_id = v_season and l.visibility = 'private' and l.active
  order by l.member_count desc, l.id limit 1;
  if v_league is not null then
    with latest as (
      select distinct on (r.fantasy_team_id) r.fantasy_team_id, r.rank
      from app.fantasy_rankings r
      where r.league_id = v_league
      order by r.fantasy_team_id, r.calculated_at desc, r.id
    )
    select (select x.rank from latest x where x.fantasy_team_id = v_team.id), (select count(*) from latest)::integer,
      coalesce((select jsonb_agg(ft.name order by x.rank)
        from latest x join app.fantasy_teams ft on ft.id = x.fantasy_team_id
        where x.rank < (select y.rank from latest y where y.fantasy_team_id = v_team.id)), '[]'::jsonb)
    into v_my_rank, v_size, v_ahead;
    if v_my_rank is not null then
      v_league_json := jsonb_build_object('id', v_league, 'name', v_league_name,
        'rank', v_my_rank, 'size', v_size, 'ahead', v_ahead);
    end if;
  end if;

  return jsonb_build_object(
    'available', true,
    'locked', false,
    'gameweek', jsonb_build_object('id', v_gw.id, 'sequence', v_gw.sequence_number, 'name', v_gw.name,
      'deadlineAt', v_gw.deadline_at),
    'team', jsonb_build_object('id', v_team.id, 'name', v_team.name, 'bank', v_team.bank,
      'teamValue', v_team.team_value, 'freeTransfers', v_team.free_transfers,
      'transferHitCost', v_rules.transfer_hit_cost, 'maxPerClub', v_rules.max_players_per_club,
      'captainMultiplier', v_rules.captain_multiplier),
    'published', v_published,
    'absenceFeed', jsonb_build_object('listed', v_listed),
    'squad', v_squad,
    'league', v_league_json);
end;
$$;
revoke all on function api.get_my_deadline_briefing(uuid) from public, anon, authenticated, service_role;
grant execute on function api.get_my_deadline_briefing(uuid) to authenticated, service_role;
comment on function api.get_my_deadline_briefing(uuid) is
  'BotolaGO+ deadline briefing for a member: {available, locked, gameweek, team, published, absenceFeed, squad, league}. The squad carries, per player, the provider''s absence (with its date), the last three journées'' published points or pending / no_rating, and the next opponent with our difficulty estimate. Display only; reads, writes nothing. Off answers {available: false}.';

-- ---------------------------------------------------------------------------
-- api.get_my_briefing_alternatives
-- ---------------------------------------------------------------------------
-- Same-position players the caller could afford in place of one of their own: the budget is the
-- sale price plus the bank. Players already in the squad and those whose club would go over the
-- club limit are left out. Listed by price, highest first, the pool's own order: no ranking, no
-- "best choice".
create function api.get_my_briefing_alternatives(p_player_out uuid, p_limit integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  v_member text;
  v_team app.fantasy_teams%rowtype;
  v_gw app.fantasy_gameweeks%rowtype;
  v_max integer;
  v_out record;
  v_budget numeric;
  v_items jsonb;
begin
  if p_player_out is null or p_limit is null or p_limit not between 1 and 12 then
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
  v_member := app_private.briefing_membership(actor, mode);
  if v_member = 'off' then
    return jsonb_build_object('available', false);
  end if;
  if v_member = 'locked' then
    return jsonb_build_object('available', true, 'locked', true);
  end if;

  select t.* into v_team from app.fantasy_teams t
  join app.fantasy_seasons s on s.id = t.fantasy_season_id and s.status in ('registration_open', 'active')
  where t.user_id = actor and t.status = 'active'
  order by s.starts_at desc limit 1;
  if v_team.id is null then
    raise exception using errcode = 'PT404', message = 'fantasy_team_not_found';
  end if;
  select m.current_sale_price as sale_price, fp.position_id, fp.football_team_id
  into v_out
  from app.fantasy_squad_memberships m
  join app.fantasy_players fp on fp.id = m.fantasy_player_id
  where m.fantasy_team_id = v_team.id and m.fantasy_player_id = p_player_out and m.sold_at is null;
  if v_out.sale_price is null then
    raise exception using errcode = 'PT404', message = 'fantasy_player_not_found';
  end if;
  select * into v_gw from app.fantasy_gameweeks g
  where g.fantasy_season_id = v_team.fantasy_season_id and g.status = 'open'
  order by g.deadline_at, g.sequence_number limit 1;
  select r.max_players_per_club into v_max from app.fantasy_seasons s
  join app.fantasy_rulesets r on r.id = s.ruleset_id where s.id = v_team.fantasy_season_id;
  v_budget := v_out.sale_price + v_team.bank;

  with owned as (
    select fp.id, fp.football_team_id
    from app.fantasy_squad_memberships m
    join app.fantasy_players fp on fp.id = m.fantasy_player_id
    where m.fantasy_team_id = v_team.id and m.sold_at is null
  ), candidates as (
    select fp.id, fp.football_player_id, fp.football_team_id, fp.price, pos.code as position_code,
      pl.display_name, t.short_name, t.name as club_name,
      (select count(*) from owned o where o.football_team_id = fp.football_team_id
         and o.id <> p_player_out)::integer as club_after
    from app.fantasy_players fp
    join app.fantasy_positions pos on pos.id = fp.position_id
    join app.players pl on pl.id = fp.football_player_id
    join app.teams t on t.id = fp.football_team_id
    where fp.fantasy_season_id = v_team.fantasy_season_id
      and fp.active and fp.eligible
      and fp.position_id = v_out.position_id
      and fp.price <= v_budget
      and not exists (select 1 from owned o where o.id = fp.id)
  ), allowed as (
    select c.* from candidates c where c.club_after < v_max
    order by c.price desc, c.id desc limit p_limit
  ), forms as (
    select f.fantasy_player_id, f.form
    from app_private.briefing_form(v_team.fantasy_season_id, coalesce(v_gw.sequence_number, 1000),
      (select coalesce(array_agg(a.id), '{}') from allowed a)) f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'fantasyPlayerId', a.id,
      'name', a.display_name,
      'position', a.position_code,
      'club', jsonb_build_object('id', a.football_team_id, 'shortName', a.short_name, 'name', a.club_name),
      'price', a.price,
      'clubInSquadAfter', a.club_after + 1,
      'form', coalesce(fm.form, '[]'::jsonb)
    ) order by a.price desc, a.id desc), '[]'::jsonb)
  into v_items
  from allowed a left join forms fm on fm.fantasy_player_id = a.id;

  return jsonb_build_object(
    'available', true,
    'locked', false,
    'playerOut', p_player_out,
    'budget', jsonb_build_object('salePrice', v_out.sale_price, 'bank', v_team.bank, 'max', v_budget),
    'maxPerClub', v_max,
    'items', v_items);
end;
$$;
revoke all on function api.get_my_briefing_alternatives(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function api.get_my_briefing_alternatives(uuid, integer) to authenticated, service_role;
comment on function api.get_my_briefing_alternatives(uuid, integer) is
  'BotolaGO+ deadline briefing, alternatives for one of the caller''s own players: same-position players within sale price plus bank, not in the squad, not over the club limit, by price, with their last three journées'' published points. Display only; reads, writes nothing. Members only.';

notify pgrst, 'reload schema';
