-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Apply the BotolaGO+ deadline briefing reads, migration 20261015140000
-- (docs/product/botolago-plus-deadline-briefing-brief.md): the two member reads behind the
-- « Briefing avant la deadline » screen: api.get_my_deadline_briefing and
-- api.get_my_briefing_alternatives.
--
-- It adds TWO api functions and TWO helper functions in app_private (no grant). It adds NO
-- table, no column, no job and no row, and it REPLACES NOTHING: every function it reads
-- (Fantasy team, difficulty, history, the BotolaGO+ membership checks) stays exactly as it is --
-- the script checks that. Both reads are STABLE, members only, and write nothing.
--
-- IT SHIPS OFF. While app_private.premium_settings.mode is 'off' both reads answer
-- {"available": false}. Nothing is stored about a reader's visits: « Depuis votre visite » lives
-- on the reader's device.
--
-- WHEN
--   After the premium card reads are applied on this database
--   (scripts/backend/apply-20261013100400-premium-card-reads.sql) and the Fantasy rating points
--   (20261014090000), after the pull request that adds this file is merged and its
--   database-quality job passed. Staging first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Make sure nothing else is writing to this database: no GitHub Actions run in progress, no
--     other query running, no other agent or workflow working on the database.
--   * Nothing needs pausing: the script only creates functions and replaces none, and the reads
--     it adds write nothing. It is not a new writer, and it adds no scheduled job.
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every guard and every
--      check runs on the real code path inside one transaction, and the script ends with a
--      deliberate error whose message carries the state it computed
--      ("REHEARSAL PASSED -- nothing was saved: {...}"). That error is the expected, good
--      outcome: it rolls everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select to_regprocedure('api.get_my_deadline_briefing(uuid)') is null as rolled_back;
--      It must say true.
--   4. In the line `select set_config('bg.deadline_briefing_mode', 'rehearsal', true);` near the
--      top, change 'rehearsal' to 'apply' and press Run again. The result row says "Applied".
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do
--   not edit a check to make it pass: a check firing means the database is not in the state
--   this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of its objects exist, or where the migrations it builds
--     on are not recorded;
--   * records the migration file in supabase_migrations.schema_migrations, whole as
--     statements[1], and runs it from that record once its sha256 matches the repository file;
--   * checks the result without saving anything: the grants of the two reads (authenticated and
--     service_role only), security definer with an empty search_path, STABLE; the helpers with
--     no grant; both reads answering "off" while BotolaGO+ is off; the definitions of the
--     functions they read unchanged; no table, no job and no row added.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.deadline_briefing_mode', 'rehearsal', true);

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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261015140000') then
    raise exception 'stop: 20261015140000 is already recorded as applied';
  end if;
  foreach needed in array array['20260925141500', '20261013100000', '20261013100100', '20261013100200', '20261013100300', '20261013100400', '20261014090000'] loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = needed) then
      missing := missing || needed;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: migrations this builds on are not applied yet: %', missing;
  end if;
  foreach needed in array array[
    'app.fantasy_teams', 'app.fantasy_gameweeks', 'app.fantasy_players', 'app.fantasy_positions',
    'app.fantasy_squad_memberships', 'app.fantasy_lineups', 'app.fantasy_lineup_players',
    'app.fantasy_player_gameweek_points', 'app.fantasy_fixture_assignments', 'app.fantasy_rankings',
    'app.fantasy_leagues', 'app.fantasy_league_memberships', 'app.fantasy_rulesets',
    'app.fixture_absences', 'app.player_availability', 'app.players', 'app.teams',
    'app_private.premium_settings', 'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.assert_mfa_step_up()', 'app_private.has_premium(uuid,timestamptz)',
    'app_private.card_premium_mode()', 'app_private.fantasy_rating_scoring_enabled(uuid)',
    'api.fantasy_fixture_difficulty(uuid,integer,integer)', 'api.get_my_fantasy_team(uuid)',
    'api.fantasy_player_gameweek_history(uuid)', 'api.fantasy_player_pool(uuid,text,uuid,numeric,text,numeric,uuid,integer)'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'api' and p.proname in ('get_my_deadline_briefing', 'get_my_briefing_alternatives'))
      or (n.nspname = 'app_private' and p.proname in ('briefing_membership', 'briefing_form'))) then
    raise exception 'stop: one of the deadline briefing functions already exists';
  end if;
  -- This adds no job, no table and replaces nothing: remember what is there, compare afterwards.
  perform set_config('bg.deadline_briefing_jobs', (select count(*) from cron.job)::text, true);
  perform set_config('bg.deadline_briefing_tables', (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text, true);
  perform set_config('bg.deadline_briefing_defs', (select string_agg(
      p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in (
      'app_private.has_premium(uuid,timestamptz)'::regprocedure,
      'app_private.card_premium_mode()'::regprocedure,
      'app_private.fantasy_rating_scoring_enabled(uuid)'::regprocedure,
      'api.fantasy_fixture_difficulty(uuid,integer,integer)'::regprocedure,
      'api.get_my_fantasy_team(uuid)'::regprocedure,
      'api.fantasy_player_gameweek_history(uuid)'::regprocedure)), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migration, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261015140000',
  'premium_deadline_briefing',
  array[$bg_20261015140000_file$-- BotolaGO+ (membership), the deadline briefing: two reads for members.
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
$bg_20261015140000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261015140000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261015140000'
  );
begin
  if encode(sha256(convert_to(part_20261015140000, 'UTF8')), 'hex')
    is distinct from '1922f8a0397263992bb9c92bf0decf65cd53db9ce0446bb316bfec424e09e643' then
    raise exception 'stop: 20261015140000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261015140000;
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
  sig text;
  rec record;
  premium_mode text;
  answer jsonb;
  answer_alt jsonb;
  state jsonb;
begin
  -- The two api functions: who may run them, how they run, that they cannot write.
  foreach sig in array array['api.get_my_deadline_briefing(uuid)', 'api.get_my_briefing_alternatives(uuid,integer)'] loop
    if to_regprocedure(sig) is null then
      problems := problems || (sig || ' is missing');
    else
      foreach who in array array['authenticated', 'service_role'] loop
        if not has_function_privilege(who, to_regprocedure(sig), 'execute') then
          problems := problems || (who || ' cannot run ' || sig);
        end if;
      end loop;
      foreach who in array array['anon', 'public'] loop
        if has_function_privilege(who, to_regprocedure(sig), 'execute') then
          problems := problems || (who || ' can run ' || sig);
        end if;
      end loop;
      if not (select p.prosecdef and p.proconfig @> array['search_path=""'] and p.provolatile = 's'
        from pg_proc p where p.oid = to_regprocedure(sig)) then
        problems := problems || (sig || ' is not STABLE security definer with an empty search_path');
      end if;
    end if;
  end loop;

  -- Helpers: no API role, stable, empty search_path.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid, p.provolatile, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname in ('briefing_membership', 'briefing_form')
  loop
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, rec.oid, 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
    if rec.provolatile <> 's' or not (rec.proconfig @> array['search_path=""']) then
      problems := problems || (rec.signature || ' is not STABLE with an empty search_path');
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private' and p.proname in ('briefing_membership', 'briefing_form')) <> 2 then
    problems := problems || 'the two helpers are not both there'::text;
  end if;

  -- Replaces nothing: what the reads build on is as it was.
  if (select string_agg(
        p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
      from pg_proc p where p.oid in (
        'app_private.has_premium(uuid,timestamptz)'::regprocedure,
        'app_private.card_premium_mode()'::regprocedure,
        'app_private.fantasy_rating_scoring_enabled(uuid)'::regprocedure,
        'api.fantasy_fixture_difficulty(uuid,integer,integer)'::regprocedure,
        'api.get_my_fantasy_team(uuid)'::regprocedure,
        'api.fantasy_player_gameweek_history(uuid)'::regprocedure))
    is distinct from current_setting('bg.deadline_briefing_defs', true) then
    problems := problems || 'an existing function changed -- this script replaces none'::text;
  end if;

  -- Off means off (checked only while BotolaGO+ is off; if it is already on the reads cannot be
  -- called here without a signed-in user).
  select s.mode into premium_mode from app_private.premium_settings s where s.id;
  if premium_mode = 'off' then
    answer := api.get_my_deadline_briefing();
    answer_alt := api.get_my_briefing_alternatives('00000000-0000-0000-0000-000000000000'::uuid);
    if answer is distinct from '{"available": false}'::jsonb
      or answer_alt is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the reads do not answer off while BotolaGO+ is off: '
        || coalesce(answer::text, 'nothing') || ' / ' || coalesce(answer_alt::text, 'nothing'));
    end if;
  end if;

  -- No job and no table was added, and the history row is there.
  if (select count(*) from cron.job)::text is distinct from current_setting('bg.deadline_briefing_jobs', true) then
    problems := problems || 'the number of scheduled jobs changed -- this script adds none'::text;
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text
    is distinct from current_setting('bg.deadline_briefing_tables', true) then
    problems := problems || 'the number of tables changed -- this script adds none'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version = '20261015140000') <> 1 then
    problems := problems || 'the history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  state := jsonb_build_object(
    'premiumMode', premium_mode,
    'apiFunctions', 2,
    'helpers', 2,
    'readsWhileOff', case when premium_mode = 'off' then jsonb_build_array(answer, answer_alt) end,
    'historyRows', 1
  );
  perform set_config('bg.deadline_briefing_state', state::text, true);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('bg.deadline_briefing_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.deadline_briefing_state', true);
  end if;
  raise notice 'premium deadline briefing: applying: %', current_setting('bg.deadline_briefing_state', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261015140000')
    then 'Applied. The deadline briefing reads are in place and OFF while BotolaGO+ is off. Next: docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md.'
  else 'NOT applied: nothing was saved (a rehearsal, or a check stopped it).'
end as result;
