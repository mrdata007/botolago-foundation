-- BotolaGO+ Trophées, part 2: the evaluator and its two scheduled jobs.
--
-- The evaluator READS what Fantasy and the Manager Card have already stored and final, through
-- the same read-only helpers the premium career and league reads use (card_week_rows,
-- card_transfer_rows, card_league_members), and WRITES one table: app.trophies_earned, through
-- app_private.trophy_grant. It never writes a Fantasy, Manager Card, league, ranking or
-- Pronostics table, and nothing in those calculations reads a trophy (a pgTAP test lists the
-- functions that name the new tables).
--
-- THE RULES (version 1). A trophy is granted when its rule is true over final results; the rule
-- is then never asked again, so a later correction cannot take it back (the table refuses it
-- too, 20261015150000).
--
--   first_rating      the first week the card shows a rating (the card's own minimum of counted
--                     weeks applies)
--   first_stade, first_pro, first_champion, first_legend
--                     the first week the card shows that tier or a higher one
--   gw_80             the first journée with a final score of at least 80 points (catalogue need)
--   ten_gameweeks, thirty_gameweeks
--                     the journée in which the 10th (30th) played and published journée of the
--                     season is reached
--   winning_transfer  the first counted transfer (the card's TRF definition, gain after its share
--                     of the points hit) worth at least +10 points
--   league_podium     the first journée after which the manager is in the first 3 of a private
--                     league that ranks at least 3 managers
--   league_leader     the same, first place
--   founder_2026      the manager holds the founding-cohort mark (no season)
--
-- PUBLICATION STAMP. source_published_at is the finalized_at of the gameweek that completed the
-- rule (for a transfer: the last gameweek of the window that counted it). A rule whose source has
-- no stamp is not granted yet; the next pass tries again.
--
-- THE JOB. trophies-tick runs at minutes 10 and 40 of every hour and does nothing until the
-- owner switches app_private.trophy_settings on. It evaluates the active teams of the current
-- Fantasy season, one manager at a time (a manager that fails is counted and skipped, the pass
-- goes on), under an advisory lock so two passes never overlap. trophies-history-prune deletes
-- only this tick's cron.job_run_details rows older than 7 days, daily at 03:31 UTC, whatever the
-- switch says.

-- ---------------------------------------------------------------------------
-- The one writer
-- ---------------------------------------------------------------------------
create function app_private.trophy_grant(
  p_user uuid,
  p_code text,
  p_season uuid,
  p_gameweek_seq integer,
  p_facts jsonb,
  p_published timestamptz
)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_version integer;
  v_scope text;
  v_rows integer;
begin
  select c.rules_version, c.scope into v_version, v_scope
  from app.trophy_catalog c
  where c.code = p_code and c.status = 'active';
  -- an unknown or retired trophy, a rule with no publication stamp, or a season trophy without
  -- a season: nothing is granted (and the next pass asks again)
  if not found or p_published is null or (v_scope = 'season' and p_season is null) then
    return 0;
  end if;
  insert into app.trophies_earned (
    user_id, trophy_code, fantasy_season_id, gameweek_seq, facts, rules_version, source_published_at
  )
  values (
    p_user, p_code, case when v_scope = 'card' then null else p_season end,
    p_gameweek_seq, coalesce(p_facts, '{}'::jsonb), v_version, p_published
  )
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
revoke all on function app_private.trophy_grant(uuid, text, uuid, integer, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
comment on function app_private.trophy_grant(uuid, text, uuid, integer, jsonb, timestamptz) is
  'Grants one trophy once (on conflict nothing): the only writer of app.trophies_earned. Returns 1 when a row was added, 0 when it was already there, unknown, or has no publication stamp. Called by the evaluator. No grant.';

-- ---------------------------------------------------------------------------
-- League ranks, week by week, for the private leagues the manager plays in
-- ---------------------------------------------------------------------------
-- One row per league and evaluable week: the manager's competition rank on the cumulative final
-- score through that week, and how many managers are ranked. The same arithmetic as the league
-- context read (20261014150000), restricted to the manager's own leagues.
create function app_private.trophy_league_ranks(p_user uuid, p_season uuid)
returns table (league_id uuid, seq integer, gameweek_id uuid, rk integer, n integer)
language sql
stable
set search_path = ''
as $$
  with leagues as (
    select l.id
    from app.fantasy_leagues l
    join app.fantasy_league_memberships me
      on me.league_id = l.id and me.user_id = p_user and me.status = 'active'
    where l.fantasy_season_id = p_season and l.visibility = 'private' and l.active
  ), mem as (
    select l.id as league_id, m.user_id
    from leagues l
    cross join lateral app_private.card_league_members(l.id) m
  ), wk as (
    select m.league_id, m.user_id, w.seq, w.gameweek_id, w.score
    from mem m
    cross join lateral app_private.card_week_rows(m.user_id, p_season) w
  ), gws as (
    select distinct wk.league_id, wk.seq, wk.gameweek_id from wk
  ), grid as (
    select g.league_id, g.seq, g.gameweek_id, m.user_id,
      (select sum(w.score)::integer from wk w
        where w.league_id = g.league_id and w.user_id = m.user_id and w.seq <= g.seq) as total
    from gws g
    join mem m on m.league_id = g.league_id
  ), ranked as (
    select r.*,
      case when r.total is not null
        then rank() over (partition by r.league_id, r.seq order by r.total desc nulls last) end as rk,
      count(r.total) over (partition by r.league_id, r.seq) as n
    from grid r
  )
  select r.league_id, r.seq, r.gameweek_id, r.rk::integer, r.n::integer
  from ranked r
  where r.user_id = p_user and r.total is not null;
$$;
revoke all on function app_private.trophy_league_ranks(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.trophy_league_ranks(uuid, uuid) is
  'The manager''s rank in each private league they play in, after each evaluable week, with the number of managers ranked. Competition ranks on the cumulative final score. Read only. No grant.';

-- ---------------------------------------------------------------------------
-- The rules, for one manager and one season
-- ---------------------------------------------------------------------------
create function app_private.trophies_evaluate_season(p_user uuid, p_season uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  granted integer := 0;
  r record;
begin
  for r in
    with need as (
      select c.code, c.need from app.trophy_catalog c where c.status = 'active'
    ), wk as (
      select w.seq, w.score, w.ovr, w.tier, gw.finalized_at as published,
        row_number() over (order by w.seq) as nth
      from app_private.card_week_rows(p_user, p_season) w
      join app.fantasy_gameweeks gw on gw.id = w.gameweek_id
      where gw.finalized_at is not null
    ), tiers(code, tier) as (
      values ('first_stade', 'stade'), ('first_pro', 'pro'),
        ('first_champion', 'champion'), ('first_legend', 'legend')
    ), lr as (
      select l.seq, l.rk, l.n, gw.finalized_at as published
      from app_private.trophy_league_ranks(p_user, p_season) l
      join app.fantasy_gameweeks gw on gw.id = l.gameweek_id
      where l.n >= 3 and gw.finalized_at is not null
    ), cands as (
      select 'first_rating'::text as code, x.seq, jsonb_build_object('ovr', x.ovr, 'tier', x.tier) as facts,
        x.published
      from (select * from wk where ovr is not null order by seq limit 1) x
      union all
      select t.code, x.seq, jsonb_build_object('ovr', x.ovr, 'tier', x.tier), x.published
      from tiers t
      cross join lateral (
        select * from wk
        where tier is not null
          and app_private.manager_card_tier_rank(wk.tier) >= app_private.manager_card_tier_rank(t.tier)
        order by seq limit 1) x
      union all
      select 'gw_80', x.seq, jsonb_build_object('score', x.score), x.published
      from (select * from wk
        where score >= (select n.need from need n where n.code = 'gw_80') order by seq limit 1) x
      union all
      select 'ten_gameweeks', x.seq, jsonb_build_object('played', x.nth), x.published
      from wk x where x.nth = (select n.need from need n where n.code = 'ten_gameweeks')
      union all
      select 'thirty_gameweeks', x.seq, jsonb_build_object('played', x.nth), x.published
      from wk x where x.nth = (select n.need from need n where n.code = 'thirty_gameweeks')
      union all
      select 'winning_transfer', t.gameweek_seq,
        jsonb_build_object('playerOut', t.player_out, 'playerIn', t.player_in, 'gain', round(t.gain)::integer),
        -- published when the last gameweek of the window that counted it was
        (select max(f.finalized_at)
         from (
           select gw.finalized_at
           from app_private.card_evaluable_gameweeks(p_season) e
           join app.fantasy_gameweeks gw on gw.id = e.gameweek_id
           where e.seq >= t.gameweek_seq
           order by e.seq
           limit greatest(t.window_used, 1)) f)
      from (
        select * from app_private.card_transfer_rows(p_user, p_season) tr
        where tr.ready and tr.gain >= (select n.need from need n where n.code = 'winning_transfer')
        order by tr.gameweek_seq, tr.sequence_number
        limit 1) t
      union all
      select 'league_podium', x.seq, jsonb_build_object('rank', x.rk, 'of', x.n), x.published
      from (select * from lr
        where rk <= (select n.need from need n where n.code = 'league_podium')
        order by seq, rk limit 1) x
      union all
      select 'league_leader', x.seq, jsonb_build_object('rank', x.rk, 'of', x.n), x.published
      from (select * from lr
        where rk <= (select n.need from need n where n.code = 'league_leader')
        order by seq, rk limit 1) x
    )
    select c.code, c.seq, c.facts, c.published from cands c
  loop
    granted := granted + app_private.trophy_grant(p_user, r.code, p_season, r.seq, r.facts, r.published);
  end loop;
  return granted;
end;
$$;
revoke all on function app_private.trophies_evaluate_season(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.trophies_evaluate_season(uuid, uuid) is
  'Evaluates the version 1 trophy rules for one manager over one Fantasy season''s final results and grants what is true (once; a granted trophy is never asked again). Returns the number of trophies added. Reads Fantasy and card data, writes only app.trophies_earned through trophy_grant. No grant.';

-- ---------------------------------------------------------------------------
-- One manager: the season and the card-scope trophy
-- ---------------------------------------------------------------------------
create function app_private.trophies_evaluate_user(p_user uuid, p_season uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  granted integer := 0;
  card app.manager_cards%rowtype;
begin
  select * into card from app.manager_cards c
  where c.user_id = p_user and c.founder_cohort is not null;
  if found then
    granted := granted + app_private.trophy_grant(
      p_user, 'founder_2026', null, null,
      jsonb_build_object('cohort', card.founder_cohort), card.founder_granted_at);
  end if;
  if p_season is not null then
    granted := granted + app_private.trophies_evaluate_season(p_user, p_season);
  end if;
  return granted;
end;
$$;
revoke all on function app_private.trophies_evaluate_user(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.trophies_evaluate_user(uuid, uuid) is
  'Evaluates the trophies of one manager: the founding-cohort trophy and the season rules. Returns the number added. Writes only app.trophies_earned. No grant.';

-- ---------------------------------------------------------------------------
-- The pass
-- ---------------------------------------------------------------------------
create function app_private.trophies_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_season uuid;
  v_user uuid;
  v_users integer := 0;
  v_granted integer := 0;
  v_errors integer := 0;
  v_result jsonb;
begin
  select s.enabled into v_enabled from app_private.trophy_settings s where s.id;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('status', 'off');
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('botolago:trophies-tick', 0)) then
    return jsonb_build_object('status', 'busy');
  end if;
  if not exists (select 1 from app_private.manager_card_active_rules() r where r.usable) then
    return jsonb_build_object('status', 'no_rules');
  end if;
  v_season := app_private.manager_card_fantasy_season();
  if v_season is null then
    return jsonb_build_object('status', 'no_season');
  end if;

  for v_user in
    select distinct t.user_id
    from app.fantasy_teams t
    join app.profiles p on p.id = t.user_id and p.deleted_at is null
    where t.fantasy_season_id = v_season and t.status = 'active'
  loop
    v_users := v_users + 1;
    begin
      v_granted := v_granted + app_private.trophies_evaluate_user(v_user, v_season);
    exception when others then
      -- one manager (for instance an account erased mid-pass) never stops the pass
      v_errors := v_errors + 1;
    end;
  end loop;

  v_result := jsonb_build_object(
    'status', 'ok', 'season', v_season, 'users', v_users, 'granted', v_granted, 'errors', v_errors);
  update app_private.trophy_settings
  set last_run_at = statement_timestamp(), last_result = v_result, updated_at = statement_timestamp()
  where id;
  return v_result;
end;
$$;
revoke all on function app_private.trophies_tick() from public, anon, authenticated, service_role;
grant execute on function app_private.trophies_tick() to postgres;
comment on function app_private.trophies_tick() is
  'The Trophées pass: answers off until app_private.trophy_settings.enabled, then evaluates every active team of the current Fantasy season under an advisory lock. Returns {status, season, users, granted, errors}. Writes only app.trophies_earned and its own bookkeeping. Executable by postgres (pg_cron) only.';

-- ---------------------------------------------------------------------------
-- The jobs (cron.schedule with a name replaces a job of that name)
-- ---------------------------------------------------------------------------
select cron.schedule(
  'trophies-tick',
  '10,40 * * * *',
  $job$set local statement_timeout = '10min'; select app_private.trophies_tick();$job$
);

select cron.schedule(
  'trophies-history-prune',
  '31 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'trophies-tick')
      and end_time < now() - interval '7 days';
  $prune$
);

notify pgrst, 'reload schema';
