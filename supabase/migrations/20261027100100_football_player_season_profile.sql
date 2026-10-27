-- Player page, football profile: api.football_player_season_profile.
--
-- The Fantasy player page shows points and minutes per gameweek, but nothing
-- about the player's football season: matches played, starts, goals, assists,
-- cards, the average rating, the last matches with their score. No public read
-- returned it: api.football_player_summary is identity only, and
-- api.pepites_player_matches is gated by the Pépites switch (off) and limited
-- to its pool. This migration adds the one missing read. It changes no existing
-- function, table or grant.
--
--   api.football_player_season_profile(p_fantasy_player_id uuid) returns jsonb
--
-- Same contract as api.fantasy_player_gameweek_history, which the page already
-- calls: STABLE SECURITY DEFINER, search_path = '', a uuid parameter only (a
-- parameter typed in schema app would fail for anon, which has no USAGE on it;
-- BG-0063), granted to anon, authenticated and service_role because
-- /fantasy/players/$playerId is a public route, and no feature switch. It
-- exposes season totals of a footballer and the scores of finished league
-- matches, which every match page already shows; never a squad, a user id or a
-- provider name.
--
-- ---------------------------------------------------------------------------
-- Where the figures come from
-- ---------------------------------------------------------------------------
-- app.player_fixture_performances, active rows only (the table keeps one active
-- row per fixture and player), joined to FINISHED fixtures of the football
-- season of the player's own Fantasy season. app.match_events is not used: a
-- fifth of its goals carry no player id, so a sum over it would undercount.
--
-- The season is the one the Fantasy player belongs to
-- (fantasy_seasons.football_season_id), the same link the Fantasy calendar
-- sync and the Manager Card readers use, so the page can never show another
-- season's figures.
--
-- ---------------------------------------------------------------------------
-- Coverage (why the payload carries `coverage`)
-- ---------------------------------------------------------------------------
-- The post-match pipeline writes performance rows fixture by fixture, and some
-- finished matches have none yet. A total over what exists would then read as
-- the whole season. So the payload says how far it reaches:
--
--   coverage.finished = finished fixtures of the player's current club this season
--   coverage.covered  = those with at least one active performance row for that club
--
-- The screen says "Sur 4 des 5 matchs de son club" when covered < finished and
-- stays silent when they are equal. The figures are always computed over the
-- covered matches only, so they are true statements about those matches.
--
-- ---------------------------------------------------------------------------
-- Payload
-- ---------------------------------------------------------------------------
--   coverage     {covered, finished}
--   totals       {appearances, starts, minutes, goals, assists, yellowCards,
--                 redCards, averageRating, ratedMatches}
--                averageRating is the mean provider rating over the matches that
--                carry one (ratedMatches of them), to two decimals, and JSON
--                null when none does. It is never 0 for "no rating".
--   lastMatches  up to five appearances, newest first: fixtureId, kickoffAt,
--                home (true when the player's club hosted), opponent
--                {teamId, shortName, name} as fantasy_player_gameweek_history
--                returns it, homeScore, awayScore, minutes, started, goals,
--                assists, rating (null when unrated)
--
-- A match counts as an appearance when `appeared` is true. A bench row with no
-- minutes is not one.
create function api.football_player_season_profile(
  p_fantasy_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_player_id uuid;
  v_team_id uuid;
  v_season_id uuid;
  v_finished integer;
  v_covered integer;
  v_totals jsonb;
  v_last jsonb;
begin
  select fantasy_player.football_player_id, fantasy_player.football_team_id,
    fantasy_season.football_season_id
  into v_player_id, v_team_id, v_season_id
  from app.fantasy_players fantasy_player
  join app.fantasy_seasons fantasy_season on fantasy_season.id = fantasy_player.fantasy_season_id
  where fantasy_player.id = p_fantasy_player_id;

  if v_player_id is null then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'PT404',
        'message', 'fantasy_player_not_found',
        'details', null,
        'hint', null
      )::text,
      detail = json_build_object('status', 404, 'headers', json_build_object())::text;
  end if;

  select
    count(*)::integer,
    (count(*) filter (where exists (
      select 1
      from app.player_fixture_performances covered
      where covered.fixture_id = fixture.id
        and covered.team_id = v_team_id
        and covered.active
    )))::integer
  into v_finished, v_covered
  from app.fixtures fixture
  where fixture.season_id = v_season_id
    and fixture.status = 'finished'
    and v_team_id in (fixture.home_team_id, fixture.away_team_id);

  select jsonb_build_object(
    'appearances', count(*) filter (where performance.appeared),
    'starts', count(*) filter (where performance.started),
    'minutes', coalesce(sum(performance.minutes) filter (where performance.appeared), 0),
    'goals', coalesce(sum(performance.goals) filter (where performance.appeared), 0),
    'assists', coalesce(sum(performance.assists) filter (where performance.appeared), 0),
    'yellowCards', coalesce(sum(performance.yellow_cards) filter (where performance.appeared), 0),
    'redCards', coalesce(sum(performance.red_cards) filter (where performance.appeared), 0),
    'averageRating', round(avg(performance.provider_rating)
      filter (where performance.appeared and performance.provider_rating is not null), 2),
    'ratedMatches', count(*)
      filter (where performance.appeared and performance.provider_rating is not null)
  )
  into v_totals
  from app.player_fixture_performances performance
  join app.fixtures fixture on fixture.id = performance.fixture_id
  where performance.player_id = v_player_id
    and performance.football_season_id = v_season_id
    and performance.active
    and fixture.season_id = v_season_id
    and fixture.status = 'finished';

  select coalesce(jsonb_agg(entry.match order by entry.kickoff_at desc, entry.fixture_id desc), '[]'::jsonb)
  into v_last
  from (
    select
      fixture.id as fixture_id,
      fixture.kickoff_at,
      jsonb_build_object(
        'fixtureId', fixture.id,
        'kickoffAt', fixture.kickoff_at,
        'home', fixture.home_team_id = performance.team_id,
        'opponent', jsonb_build_object(
          'teamId', opponent.id,
          'shortName', opponent.short_name,
          'name', opponent.name
        ),
        'homeScore', fixture.home_score,
        'awayScore', fixture.away_score,
        'minutes', performance.minutes,
        'started', performance.started,
        'goals', performance.goals,
        'assists', performance.assists,
        'rating', performance.provider_rating
      ) as match
    from app.player_fixture_performances performance
    join app.fixtures fixture on fixture.id = performance.fixture_id
    join app.teams opponent on opponent.id = case
      when fixture.home_team_id = performance.team_id then fixture.away_team_id
      else fixture.home_team_id
    end
    where performance.player_id = v_player_id
      and performance.football_season_id = v_season_id
      and performance.active
      and performance.appeared
      and fixture.season_id = v_season_id
      and fixture.status = 'finished'
    order by fixture.kickoff_at desc, fixture.id desc
    limit 5
  ) entry;

  return jsonb_build_object(
    'coverage', jsonb_build_object('covered', v_covered, 'finished', v_finished),
    'totals', v_totals,
    'lastMatches', v_last
  );
end;
$function$;

comment on function api.football_player_season_profile(uuid) is
  'Football season of a Fantasy player, from active player_fixture_performances '
  'over finished fixtures of the player''s Fantasy season: totals (appearances, '
  'starts, minutes, goals, assists, cards, average provider rating or null), '
  'coverage (finished matches of the current club vs those with performance '
  'rows) and the last five appearances. Anon-callable; 404 for an unknown player.';

revoke all on function api.football_player_season_profile(uuid) from public;
grant execute on function api.football_player_season_profile(uuid)
  to anon, authenticated, service_role;
