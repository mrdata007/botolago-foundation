-- BotolaGO+ (membership), part 6: the league context behind the member analytics.
--
-- ONE new read, for members only, that sets the caller (and, in a duel, a rival)
-- against the private league they play in (docs/plans/BOTOLAGO_PLUS_PLAN.md
-- sections 2a and 2b):
--
--   api.get_card_league_context(p_league, p_season, p_rival_team)
--
-- WHY A NEW FUNCTION AND NOT MORE KEYS ON THE TWO EXISTING ONES. api.get_my_card_career
-- and api.get_card_duel (20261013100400) are shipped, their key sets are asserted
-- key for key by a database test and by the zod contracts, and a migration that
-- has been applied is never edited (CLAUDE.md). Replacing them to add keys would
-- also make every career and duel read pay for league arithmetic over every
-- member, and would tie a season-scoped, league-less career to a league choice
-- it does not have. The league figures have their own parameter (which league),
-- their own cost, and their own failure (no league at all). So they get their
-- own function; the two existing reads and their contracts are not touched.
--
-- DISPLAY ONLY, NOTHING COMPUTED. Every number is read from what Fantasy and the
-- Manager Card already stored, through the same read-only helpers the career and
-- the duel use (app_private.card_week_rows, card_captain_rows, card_transfer_rows),
-- so the captain and transfer definitions are the card's own and cannot drift
-- from it. Nothing is written, nothing in the card's or Fantasy's calculation is
-- touched, and membership never changes a score, a rating, a tier or a rank: the
-- ranks here are arithmetic over the stored final scores and ratings, shown, not
-- stored. The function is in the card_editions.test.sql list of functions that
-- name the membership tables (it calls has_premium), on purpose.
--
-- WHICH LEAGUE. A manager can be in several private leagues in a season. The
-- caller may name one (p_league); it must be an ACTIVE PRIVATE league of which
-- they are an active member, else PT404 card_league_not_found, the same answer
-- for an unknown league, a public one and one they are not in. Without p_league
-- the function takes the caller's active private league of the season (current
-- season, or p_season) with the most members, then the lowest id: exactly the
-- "first" league the Curva people page and the leagues list use when nothing is
-- remembered or asked for (api.fantasy_leagues orders member_count desc, id). The
-- Curva page remembers the league on the device (the client's localStorage), which
-- a database function cannot see, so the screen passes that league's id. A caller
-- with no private league that season gets {"league": null} (an empty state, not
-- an error).
--
-- WHO IS COUNTED. The league's ACTIVE members whose team is active and whose
-- profile is not deleted-pending. Only evaluable gameweeks (the card's own test:
-- finalized or corrected, points final, post-work complete) with a final result.
-- A member who has no result yet in a week is not ranked in it; ranks are
-- competition ranks (two managers on the same total share the rank, the next
-- rank is skipped), on the cumulative final score through that gameweek.
--
-- SMALL LEAGUES. The figures that the league standings do not already show to
-- every member (captain points, transfer gains, and the per-week rating history)
-- are averaged only over three or more managers; below that the average, and the
-- rank in the ratings history, are null ("minGroup": 3 in the answer). Scores and
-- ranks by points are what the standings already publish and are not gated.
-- OPEN QUESTION FOR THE OWNER AND THE LAWYER (plan Q6): the per-week rating
-- history averages include every member of the league whether or not they
-- switched their own card history on, because an average of three or more is not
-- anyone's history. If that is not acceptable, the rule is one line in
-- app_private.card_league_context.
--
-- THE RIVAL (p_rival_team). Must be another active member of the SAME league,
-- else PT404 card_duel_not_found (the duel's own answer, no hint why). The same
-- privacy switch as the duel (app.card_history_visibility, default off) decides
-- what comes with them: always their total, their rank and today's ratings with
-- their ranks (the standings and the batch card read already show these to
-- league mates); only if THEY switched it on, their week-by-week scores, ranks,
-- captain points, transfers and rating history ("historyVisible").
--
-- THE ANSWERS (signed-in read, in order: argument check PT400, the off answer,
-- app_private.assert_mfa_step_up(), the caller PT401, the membership):
--   BotolaGO+ off, or the Manager Card reads off     {"available": false}
--   preview, caller not a member                      {"available": false}
--   on, caller not a member                           {"available": true, "locked": true}
--   a member                                          {"available": true, "locked": false, ...}
--
-- RATINGS HISTORY. app.manager_card_gameweeks keeps every manager's figures as
-- of each evaluated gameweek, so the per-week league average and rank of CAP,
-- SEL, TRF, CON and OVR are returned (null under the rules' minimum of counted
-- weeks, as in the career). The "current" ratings are the season row.
--
-- SHIPS OFF like the rest of BotolaGO+, no table, no job, no writer.

-- ---------------------------------------------------------------------------
-- Helpers (app_private, no grant at all, not callable by any API role)
-- ---------------------------------------------------------------------------

-- The managers a league counts: active memberships, active teams, profiles that
-- are not deleted-pending.
create function app_private.card_league_members(p_league uuid)
returns table (user_id uuid, team_id uuid)
language sql
stable
set search_path = ''
as $$
  select m.user_id, m.fantasy_team_id
  from app.fantasy_league_memberships m
  join app.fantasy_teams t on t.id = m.fantasy_team_id and t.status = 'active'
  join app.profiles p on p.id = m.user_id and p.deleted_at is null
  where m.league_id = p_league and m.status = 'active';
$$;
revoke all on function app_private.card_league_members(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.card_league_members(uuid) is
  'The managers a private league counts: active memberships with an active team and a profile that is not deleted-pending. Read only. No grant.';

-- The league figures of one season for a league, as one jsonb (everything below
-- "available/locked/season/league", which the API function adds). p_rival is a
-- member of the league or null; p_rival_visible is their privacy switch.
create function app_private.card_league_context(
  p_actor uuid, p_league uuid, p_season uuid,
  p_rival uuid, p_rival_visible boolean, p_min_group integer
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with mem as (
    select * from app_private.card_league_members(p_league)
  ), wk as (
    -- every member's evaluable weeks: the score, the hit and the card's figures as of the week
    select m.user_id, w.seq, w.gameweek_id, w.gameweek_name, w.score, w.transfer_hit,
      w.ovr, w.cap, w.sel, w.trf, w.con
    from mem m
    cross join lateral app_private.card_week_rows(m.user_id, p_season) w
  ), pop as (
    select distinct wk.user_id from wk
  ), gws as (
    select distinct wk.seq, wk.gameweek_name from wk
  ), grid as (
    -- every member against every played week: the week's score and the total through it
    select g.seq, g.gameweek_name, m.user_id,
      (select w.score from wk w where w.user_id = m.user_id and w.seq = g.seq) as score,
      (select sum(w.score)::integer from wk w where w.user_id = m.user_id and w.seq <= g.seq) as total
    from gws g cross join mem m
  ), ranked as (
    select r.*,
      case when r.total is not null then rank() over (partition by r.seq order by r.total desc nulls last) end as rk,
      count(r.total) over (partition by r.seq) as n
    from grid r
  ), pos as (
    -- rank after the week and the rank before it
    select r.*, lag(r.rk) over (partition by r.user_id order by r.seq) as prev_rk
    from ranked r
  ), wagg as (
    select g.seq, count(g.score)::integer as scored, round(avg(g.score), 2) as average, max(g.score) as best
    from grid g where g.score is not null group by g.seq
  ), last_week as (
    select max(gws.seq) as seq from gws
  ), season_totals as (
    select p.user_id, p.total, p.rk, p.n from pos p, last_week lw
    where p.seq = lw.seq and p.total is not null
  ), cp as (
    -- the effective captain's points of each week, by the card's CAP definition
    select m.user_id, c.seq, c.captain_points
    from mem m
    cross join lateral app_private.card_captain_rows(m.user_id, p_season) c
    where c.captain_points is not null
  ), cpw as (
    select c.seq, count(*)::integer as contributors, round(avg(c.captain_points), 2) as average
    from cp c group by c.seq
  ), cpm as (
    select c.user_id, sum(c.captain_points)::integer as points, count(*)::integer as weeks
    from cp c group by c.user_id
  ), tr as (
    select m.user_id, t.ready, t.gain, t.hit_share, t.transfer_id
    from mem m
    cross join lateral app_private.card_transfer_rows(m.user_id, p_season) t
  ), hits as (
    select w.user_id, sum(w.transfer_hit)::integer as hits from wk w group by w.user_id
  ), trm as (
    -- net = the card's TRF gains summed (each already minus its share of the hit);
    -- gross = before the hit; both over the ready (counted) transfers only
    select p.user_id,
      coalesce(sum(t.gain) filter (where t.ready), 0) as net,
      coalesce(sum(t.gain + t.hit_share) filter (where t.ready), 0) as gross,
      (count(t.transfer_id) filter (where t.ready))::integer as counted,
      count(t.transfer_id)::integer as transfers,
      coalesce(h.hits, 0) as hits
    from pop p
    left join tr t on t.user_id = p.user_id
    left join hits h on h.user_id = p.user_id
    group by p.user_id, h.hits
  ), cur as (
    -- today's ratings: the season row, null under the rules' minimum of counted weeks
    select m.user_id, x.k, x.v
    from mem m
    join app.manager_card_seasons s on s.user_id = m.user_id and s.fantasy_season_id = p_season
      and s.gameweeks_counted >= (select a.min_rated from app_private.manager_card_active_rules() a)
    cross join lateral (values ('cap', s.cap), ('sel', s.sel), ('trf', s.trf), ('con', s.con), ('ovr', s.ovr)) x(k, v)
    where x.v is not null
  ), curr as (
    select c.user_id, c.k, c.v,
      rank() over (partition by c.k order by c.v desc) as rk,
      count(*) over (partition by c.k) as n,
      avg(c.v) over (partition by c.k) as av
    from cur c
  ), keys(k) as (
    values ('cap'), ('sel'), ('trf'), ('con'), ('ovr')
  ), hist as (
    -- the card's figures as of each week (already null under the minimum)
    select w.user_id, w.seq, x.k, x.v
    from wk w
    cross join lateral (values ('cap', w.cap), ('sel', w.sel), ('trf', w.trf), ('con', w.con), ('ovr', w.ovr)) x(k, v)
    where x.v is not null
  ), histr as (
    select h.user_id, h.seq, h.k, h.v,
      rank() over (partition by h.seq, h.k order by h.v desc) as rk,
      count(*) over (partition by h.seq, h.k) as n,
      avg(h.v) over (partition by h.seq, h.k) as av
    from hist h
  )
  select jsonb_build_object(
    'minGroup', p_min_group,
    'members', (select count(*)::integer from mem),
    'ranked', (select count(*)::integer from pop),
    'totals', jsonb_build_object(
      'ranked', (select count(*)::integer from season_totals),
      'leagueAverage', (select round(avg(st.total), 2) from season_totals st),
      'leaderTotal', (select max(st.total) from season_totals st)),
    'captain', jsonb_build_object(
      'contributors', (select count(*)::integer from cpm),
      'leagueAverage', (select case when count(*) >= p_min_group then round(avg(cpm.points), 2) end from cpm)),
    'transfers', jsonb_build_object(
      'contributors', (select count(*)::integer from trm where trm.counted > 0),
      'leagueAverage', (select case when count(*) >= p_min_group then round(avg(trm.net), 2) end
                        from trm where trm.counted > 0),
      'leagueAverageAll', (select case when count(*) >= p_min_group then round(avg(trm.net), 2) end from trm)),
    'ratings', (
      select jsonb_object_agg(k.k, jsonb_build_object(
        'average', (select round(max(c.av), 2) from curr c where c.k = k.k),
        'rated', (select coalesce(max(c.n), 0)::integer from curr c where c.k = k.k)))
      from keys k),
    'me', jsonb_build_object(
      'teamId', (select m.team_id from mem m where m.user_id = p_actor),
      'total', (select st.total from season_totals st where st.user_id = p_actor),
      'rank', (select st.rk from season_totals st where st.user_id = p_actor),
      'captain', (select jsonb_build_object('points', c.points, 'weeks', c.weeks) from cpm c where c.user_id = p_actor),
      'transfers', (select jsonb_build_object('net', t.net, 'gross', t.gross, 'hitsPaid', t.hits,
          'transfers', t.transfers, 'counted', t.counted) from trm t where t.user_id = p_actor),
      'ratings', (select jsonb_object_agg(k.k, jsonb_build_object(
          'value', (select c.v from curr c where c.k = k.k and c.user_id = p_actor),
          'rank', (select c.rk from curr c where c.k = k.k and c.user_id = p_actor))) from keys k)),
    'rival', case when p_rival is null then null else jsonb_build_object(
      'teamId', (select m.team_id from mem m where m.user_id = p_rival),
      'historyVisible', p_rival_visible,
      'total', (select st.total from season_totals st where st.user_id = p_rival),
      'rank', (select st.rk from season_totals st where st.user_id = p_rival),
      'captain', case when p_rival_visible then
        (select jsonb_build_object('points', c.points, 'weeks', c.weeks) from cpm c where c.user_id = p_rival) end,
      'transfers', case when p_rival_visible then
        (select jsonb_build_object('net', t.net, 'gross', t.gross, 'hitsPaid', t.hits,
          'transfers', t.transfers, 'counted', t.counted) from trm t where t.user_id = p_rival) end,
      'ratings', (select jsonb_object_agg(k.k, jsonb_build_object(
          'value', (select c.v from curr c where c.k = k.k and c.user_id = p_rival),
          'rank', (select c.rk from curr c where c.k = k.k and c.user_id = p_rival))) from keys k)) end,
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'gameweekSeq', g.seq,
        'gameweekName', g.gameweek_name,
        'scored', coalesce(wa.scored, 0),
        'ranked', (select max(r.n)::integer from ranked r where r.seq = g.seq),
        'leagueAverage', wa.average,
        'leagueBest', wa.best,
        'me', (select jsonb_build_object('score', p.score, 'rank', p.rk, 'previousRank', p.prev_rk,
            'movement', case when p.rk is not null and p.prev_rk is not null then (p.prev_rk - p.rk)::integer end)
          from pos p where p.seq = g.seq and p.user_id = p_actor),
        'captain', jsonb_build_object(
          'contributors', coalesce(cw.contributors, 0),
          'leagueAverage', case when cw.contributors >= p_min_group then cw.average end,
          'me', (select c.captain_points from cp c where c.seq = g.seq and c.user_id = p_actor)),
        'ratings', (
          select jsonb_object_agg(k.k, jsonb_build_object(
            'rated', coalesce((select max(h.n) from histr h where h.seq = g.seq and h.k = k.k), 0)::integer,
            'average', (select case when max(h.n) >= p_min_group then round(max(h.av), 2) end
                        from histr h where h.seq = g.seq and h.k = k.k),
            'me', (select h.v from histr h where h.seq = g.seq and h.k = k.k and h.user_id = p_actor),
            'rank', (select case when h.n >= p_min_group then h.rk end
                     from histr h where h.seq = g.seq and h.k = k.k and h.user_id = p_actor)))
          from keys k),
        'rival', case when p_rival is not null and p_rival_visible then jsonb_build_object(
          'score', (select p.score from pos p where p.seq = g.seq and p.user_id = p_rival),
          'rank', (select p.rk from pos p where p.seq = g.seq and p.user_id = p_rival),
          'movement', (select case when p.rk is not null and p.prev_rk is not null then (p.prev_rk - p.rk)::integer end
                       from pos p where p.seq = g.seq and p.user_id = p_rival),
          'captain', (select c.captain_points from cp c where c.seq = g.seq and c.user_id = p_rival),
          'ratings', (
            select jsonb_object_agg(k.k, jsonb_build_object(
              'value', (select h.v from histr h where h.seq = g.seq and h.k = k.k and h.user_id = p_rival),
              'rank', (select case when h.n >= p_min_group then h.rk end
                       from histr h where h.seq = g.seq and h.k = k.k and h.user_id = p_rival)))
            from keys k)) end
      ) order by g.seq)
      from gws g
      left join wagg wa on wa.seq = g.seq
      left join cpw cw on cw.seq = g.seq), '[]'::jsonb)
  );
$$;
revoke all on function app_private.card_league_context(uuid, uuid, uuid, uuid, boolean, integer)
  from public, anon, authenticated, service_role;
comment on function app_private.card_league_context(uuid, uuid, uuid, uuid, boolean, integer) is
  'The league figures for api.get_card_league_context: per played week the league average and best score, the caller''s rank and movement, the captain average and the ratings average and rank; the season totals, the captain and transfer averages, today''s ratings; the caller''s and the rival''s own figures (the rival''s week by week only when p_rival_visible). Averages of fewer than p_min_group managers are null for the figures the standings do not show. Read only. No grant.';

-- ---------------------------------------------------------------------------
-- api.get_card_league_context
-- ---------------------------------------------------------------------------
create function api.get_card_league_context(
  p_league uuid default null,
  p_season text default null,
  p_rival_team uuid default null
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
  v_league uuid;
  v_name text;
  rival_user uuid;
  visible boolean := false;
  ctx jsonb;
  min_group constant integer := 3;
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
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'card_league_not_found';
  end if;

  if p_league is not null then
    -- A named league: an active private league the caller is an active member of.
    select l.id, l.fantasy_season_id, l.name into v_league, v_season, v_name
    from app.fantasy_leagues l
    join app.fantasy_league_memberships me
      on me.league_id = l.id and me.user_id = actor and me.status = 'active'
    where l.id = p_league and l.visibility = 'private' and l.active;
    if v_league is null
      or (p_season is not null and app_private.card_resolve_season(p_season) is distinct from v_season) then
      raise exception using errcode = 'PT404', message = 'card_league_not_found';
    end if;
  else
    if p_season is null then
      v_season := app_private.manager_card_fantasy_season();
    else
      v_season := app_private.card_resolve_season(p_season);
      if v_season is null then
        raise exception using errcode = 'PT404', message = 'card_season_not_found';
      end if;
    end if;
    -- The default league: the one the leagues list shows first (most members, then id).
    select l.id, l.name into v_league, v_name
    from app.fantasy_leagues l
    join app.fantasy_league_memberships me
      on me.league_id = l.id and me.user_id = actor and me.status = 'active'
    where l.fantasy_season_id = v_season and l.visibility = 'private' and l.active
    order by l.member_count desc, l.id
    limit 1;
    if v_league is null then
      return jsonb_build_object(
        'available', true, 'locked', false,
        'season', case when v_season is not null then jsonb_build_object(
          'id', v_season, 'label', app_private.manager_card_season_label(v_season)) end,
        'league', null);
    end if;
  end if;

  if p_rival_team is not null then
    -- Every refusal is the duel's own answer, so nothing says why.
    select m.user_id into rival_user
    from app_private.card_league_members(v_league) m
    where m.team_id = p_rival_team and m.user_id <> actor;
    if rival_user is null then
      raise exception using errcode = 'PT404', message = 'card_duel_not_found';
    end if;
    visible := coalesce((select v.visible_to_league_mates from app.card_history_visibility v
      where v.user_id = rival_user), false);
  end if;

  ctx := app_private.card_league_context(actor, v_league, v_season, rival_user, visible, min_group);
  return jsonb_build_object(
      'available', true,
      'locked', false,
      'season', jsonb_build_object('id', v_season, 'label', app_private.manager_card_season_label(v_season)),
      'league', jsonb_build_object('id', v_league, 'name', v_name,
        'members', ctx -> 'members', 'ranked', ctx -> 'ranked'))
    || (ctx - 'members' - 'ranked');
end;
$$;
revoke all on function api.get_card_league_context(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function api.get_card_league_context(uuid, text, uuid) to authenticated, service_role;
comment on function api.get_card_league_context(uuid, text, uuid) is
  'BotolaGO+ league context for the member analytics: the caller (and a rival) against a private league of the season: {available, locked, season, league, minGroup, totals, captain, transfers, ratings, me, rival, weeks}. The league is p_league (an active private league the caller is in, else PT404 card_league_not_found) or, by default, the caller''s one with the most members, then the lowest id; none gives league null. p_rival_team must be another active member of it (else PT404 card_duel_not_found); their week-by-week figures appear only if they switched their card history on (rival.historyVisible). Members only: {available:true, locked:true} for anyone else, {available:false} while BotolaGO+ or the Manager Card reads are off. Averages of fewer than three managers are null for captain, transfer and ratings-history figures. Nothing is written. Signed-in, step-up.';

notify pgrst, 'reload schema';
