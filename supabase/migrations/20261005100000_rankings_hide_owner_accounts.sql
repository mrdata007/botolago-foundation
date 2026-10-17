-- Rankings show real players only.
--
-- The accounts we run ourselves (QA and test logins, the owner's own logins,
-- staff) were showing up on the Fantasy overall board and on the Pronostics
-- leaderboard. This adds one list of such accounts and makes both boards skip
-- them, closing the gap in the ranks so the first real player reads #1.
--
-- An account is hidden when ANY of these is true:
--   * it is listed in app_private.ranking_hidden_accounts;
--   * it is an active or suspended staff principal;
--   * its e-mail ends in @botolago.com (the company domain).
-- To hide another account later, insert its id into the list; nothing else
-- needs to change. Nothing is deleted: the accounts, teams and predictions
-- stay exactly as they are, they are just not shown.

create table if not exists app_private.ranking_hidden_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null default 'owner_account',
  created_at timestamptz not null default now()
);
alter table app_private.ranking_hidden_accounts enable row level security;
revoke all on table app_private.ranking_hidden_accounts
  from public, anon, authenticated, service_role;

create or replace function app_private.ranking_account_hidden(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and (
    exists (
      select 1 from app_private.ranking_hidden_accounts hidden
      where hidden.user_id = p_user_id
    )
    or exists (
      select 1 from app_private.staff_principals principal
      where principal.auth_user_id = p_user_id
        and principal.status in ('active', 'suspended')
    )
    or exists (
      select 1 from auth.users account
      where account.id = p_user_id
        and lower(account.email) like '%@botolago.com'
    )
  );
$$;
revoke all on function app_private.ranking_account_hidden(uuid)
  from public, anon, authenticated, service_role;

-- The accounts we created that are not on the company domain: the owner's
-- plus-address and personal test logins and the throwaway QA mailboxes.
insert into app_private.ranking_hidden_accounts (user_id, reason)
select account.id, 'owner_account'
from auth.users account
where lower(account.email) ~ '^(alisarhane73|compak2026|abdelalisarhane0[0-9])(\+[^@]*)?@gmail\.com$'
   or lower(account.email) like '%@guerrillamailblock.com'
   or lower(account.email) like '%@uberip.com'
on conflict (user_id) do nothing;

-- Fantasy overall board, as in 20260926003100 plus the hidden-account filter.
create or replace function api.fantasy_overall_standings(
  p_season_id uuid,
  p_gameweek_id uuid default null,
  p_after_rank bigint default null,
  p_after_team_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
declare target_gameweek uuid;
declare items jsonb;
declare total bigint;
declare next_cursor jsonb;
declare my_rank jsonb;
declare hidden_ranks bigint[];
declare last_rank bigint;
declare last_team uuid;
begin
  perform app_private.assert_mfa_step_up();
  -- Same validation contract as api.fantasy_league_standings: a page size
  -- outside 1..100, or half a cursor, is a client bug and not a 500.
  if p_season_id is null
    or p_limit is null
    or p_limit not between 1 and 100
    or ((p_after_rank is null) <> (p_after_team_id is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  if not exists (select 1 from app.fantasy_seasons season where season.id = p_season_id) then
    raise exception using errcode = 'PT404', message = 'fantasy_season_not_found';
  end if;

  if p_gameweek_id is not null then
    -- A gameweek from another season is a foreign id, not an empty page.
    if not exists (
      select 1 from app.fantasy_gameweeks gameweek
      where gameweek.id = p_gameweek_id and gameweek.fantasy_season_id = p_season_id
    ) then
      raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
    end if;
    target_gameweek := p_gameweek_id;
  else
    -- Default scope resolution. The season cumulative board (gameweek_id is
    -- null) is preferred: it is what "overall standings" means, it carries both
    -- total_points and the latest gameweek_points, and it is exactly what
    -- api.fantasy_league_standings returns for a null p_gameweek_id, so the two
    -- readers speak one dialect. If the lifecycle runner has written the
    -- per-gameweek overall rows but not yet the cumulative ones, fall back to
    -- the latest gameweek that actually has overall rows. If neither exists --
    -- which is production today -- target_gameweek stays null and the scope
    -- predicate below matches nothing, yielding an empty page, not an error.
    if exists (
      select 1 from app.fantasy_rankings ranking
      where ranking.fantasy_season_id = p_season_id
        and ranking.league_id is null
        and ranking.gameweek_id is null
    ) then
      target_gameweek := null;
    else
      select ranking.gameweek_id into target_gameweek
      from app.fantasy_rankings ranking
      join app.fantasy_gameweeks gameweek on gameweek.id = ranking.gameweek_id
      where ranking.fantasy_season_id = p_season_id
        and ranking.league_id is null
        and ranking.gameweek_id is not null
      order by gameweek.sequence_number desc, gameweek.id desc
      limit 1;
    end if;
  end if;

  -- Accounts the owner runs (test, QA, staff) never appear on the board.
  -- Their ranks are remembered so everyone below them moves up and the
  -- board reads 1, 2, 3 with no holes.
  select coalesce(array_agg(ranking.rank), '{}'::bigint[]) into hidden_ranks
  from app.fantasy_rankings ranking
  join app.fantasy_teams team on team.id = ranking.fantasy_team_id
  where ranking.fantasy_season_id = p_season_id
    and ranking.league_id is null
    and (case
      when target_gameweek is null then ranking.gameweek_id is null
      else ranking.gameweek_id = target_gameweek
    end)
    and app_private.ranking_account_hidden(team.user_id);

  select count(*) into total
  from app.fantasy_rankings ranking
  join app.fantasy_teams team on team.id = ranking.fantasy_team_id
  where ranking.fantasy_season_id = p_season_id
    and ranking.league_id is null
    and (case
      when target_gameweek is null then ranking.gameweek_id is null
      else ranking.gameweek_id = target_gameweek
    end)
    and not app_private.ranking_account_hidden(team.user_id);

  -- Bound the ranking rows on the covering keyset index before joining team
  -- and profile data, so a 50k-team board never sorts the whole season.
  with ranked_page as materialized (
    select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
      ranking.total_points, ranking.gameweek_points, ranking.calculated_at
    from app.fantasy_rankings ranking
    join app.fantasy_teams ranked_team on ranked_team.id = ranking.fantasy_team_id
    where not app_private.ranking_account_hidden(ranked_team.user_id)
      and ranking.fantasy_season_id = p_season_id
      and ranking.league_id is null
      and (case
        when target_gameweek is null then ranking.gameweek_id is null
        else ranking.gameweek_id = target_gameweek
      end)
      and (
        p_after_rank is null
        or (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id)
      )
    order by ranking.rank, ranking.fantasy_team_id
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id,
      'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.rank - (select count(*) from unnest(hidden_ranks) hidden where hidden < ranked_page.rank),
      'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb),
    max(ranked_page.rank),
    (array_agg(ranked_page.fantasy_team_id
      order by ranked_page.rank desc, ranked_page.fantasy_team_id desc))[1]
  into items, last_rank, last_team
  from ranked_page
  join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
  left join app.profiles profile
    on profile.id = team.user_id and profile.deleted_at is null;

  -- Only advertise a cursor when a row genuinely follows this page, so a client
  -- that follows nextCursor never burns a round trip on an empty tail.
  if last_team is not null and exists (
    select 1
    from app.fantasy_rankings ranking
    join app.fantasy_teams next_team on next_team.id = ranking.fantasy_team_id
    where ranking.fantasy_season_id = p_season_id
      and ranking.league_id is null
      and (case
        when target_gameweek is null then ranking.gameweek_id is null
        else ranking.gameweek_id = target_gameweek
      end)
      and not app_private.ranking_account_hidden(next_team.user_id)
      and (ranking.rank, ranking.fantasy_team_id) > (last_rank, last_team)
  ) then
    next_cursor := jsonb_build_object('rank', last_rank, 'teamId', last_team);
  end if;

  -- myRank is page-independent: the signed-in manager's own standing, whether
  -- or not it falls on the page being read. auth.uid() is null for anonymous
  -- callers, so no row matches and myRank is JSON null -- never an error.
  select jsonb_build_object(
    'teamId', ranking.fantasy_team_id,
    'teamName', team.name,
    'managerName', coalesce(nullif(btrim(profile.display_name), ''), team.name),
    'rank', ranking.rank - (select count(*) from unnest(hidden_ranks) hidden where hidden < ranking.rank),
    'previousRank', ranking.previous_rank,
    'totalPoints', ranking.total_points,
    'gameweekPoints', ranking.gameweek_points,
    'calculatedAt', ranking.calculated_at
  ) into my_rank
  from app.fantasy_rankings ranking
  join app.fantasy_teams team on team.id = ranking.fantasy_team_id
  left join app.profiles profile
    on profile.id = team.user_id and profile.deleted_at is null
  where ranking.fantasy_season_id = p_season_id
    and ranking.league_id is null
    and (case
      when target_gameweek is null then ranking.gameweek_id is null
      else ranking.gameweek_id = target_gameweek
    end)
    and team.user_id = caller
    and not app_private.ranking_account_hidden(team.user_id)
    and team.status = 'active'
  order by ranking.rank, ranking.fantasy_team_id
  limit 1;

  return jsonb_build_object(
    'seasonId', p_season_id,
    'gameweekId', target_gameweek,
    'items', items,
    'nextCursor', next_cursor,
    'total', total,
    'myRank', my_rank
  );
end;
$$;

-- Pronostics leaderboard, as in 20260926003100 plus the hidden-account filter.
create or replace function api.predictions_leaderboard(
  p_scope text default 'round',
  p_round_number integer default null,
  p_after_rank integer default null,
  p_after_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  settings app_private.prediction_settings%rowtype;
  v_season_id uuid;
  v_round_id uuid;
  v_round_number integer;
  page_ids uuid[];
  items jsonb := '[]'::jsonb;
  total integer;
  me jsonb;
  last_rank integer;
  last_id uuid;
  round_state text;
  matches_left integer;
  has_more boolean;
  hidden_ranks integer[];
begin
  perform app_private.assert_mfa_step_up();
  if p_scope is null or p_scope not in ('round', 'season')
    or p_limit is null or p_limit not between 1 and 100
    or ((p_after_rank is null) <> (p_after_id is null))
  then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into settings from app_private.prediction_settings where id;
  if not app_private.predictions_access_allowed(caller) then
    return jsonb_build_object('allowed', false, 'mode', settings.mode);
  end if;
  v_season_id := app_private.predictions_current_season();
  if p_scope = 'round' then
    v_round_id := app_private.predictions_resolve_round(v_season_id, p_round_number, now_ts);
  end if;
  if v_season_id is null or (p_scope = 'round' and v_round_id is null) then
    return jsonb_build_object('allowed', true, 'scope', p_scope, 'items', '[]'::jsonb,
      'total', 0, 'nextCursor', null, 'me', null);
  end if;

  -- Accounts the owner runs (test, QA, staff) never appear on the board.
  -- Their ranks are remembered so everyone below them moves up and the
  -- board reads 1, 2, 3 with no holes.
  select coalesce(array_agg(standing.rank), '{}'::integer[]) into hidden_ranks
  from app.prediction_standings standing
  where standing.rank is not null
    and (case
      when p_scope = 'round' then standing.round_id = v_round_id
      else standing.season_id = v_season_id and standing.round_id is null
    end)
    and app_private.ranking_account_hidden(standing.user_id);

  -- The page: one index range per scope (journée rows, or season rows).
  if p_scope = 'round' then
    select round_number into v_round_number from app.rounds where id = v_round_id;
    round_state := app_private.prediction_round_state(v_round_id, now_ts);
    select count(*) into matches_left
    from app.fixtures fixture
    left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
    where fixture.round_id = v_round_id
      and not (fixture.status = 'finished' and fixture.finalized_at is not null)
      and fixture.status not in ('cancelled', 'abandoned')
      and scoring.override is distinct from 'void';

    select array_agg(page.id order by page.rank, page.id) into page_ids
    from (
      select standing.id, standing.rank
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.round_id = v_round_id and standing.rank is not null
        and (p_after_rank is null or (standing.rank, standing.id) > (p_after_rank, p_after_id))
        and not app_private.ranking_account_hidden(standing.user_id)
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        )
      order by standing.rank, standing.id
      limit p_limit + 1
    ) page;
    if p_after_rank is null then
      select count(*) into total
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.round_id = v_round_id and standing.rank is not null
        and not app_private.ranking_account_hidden(standing.user_id)
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        );
    end if;
    if caller is not null then
      select jsonb_build_object('rank',
        standing.rank - (select count(*) from unnest(hidden_ranks) hidden where hidden < standing.rank),
        'points', standing.points, 'exact', standing.exact_count)
      into me from app.prediction_standings standing
      where standing.round_id = v_round_id and standing.user_id = caller
        and not app_private.ranking_account_hidden(standing.user_id);
    end if;
  else
    select array_agg(page.id order by page.rank, page.id) into page_ids
    from (
      select standing.id, standing.rank
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.rank is not null
        and (p_after_rank is null or (standing.rank, standing.id) > (p_after_rank, p_after_id))
        and not app_private.ranking_account_hidden(standing.user_id)
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        )
      order by standing.rank, standing.id
      limit p_limit + 1
    ) page;
    if p_after_rank is null then
      select count(*) into total
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.rank is not null
        and not app_private.ranking_account_hidden(standing.user_id)
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        );
    end if;
    if caller is not null then
      select jsonb_build_object('rank',
        standing.rank - (select count(*) from unnest(hidden_ranks) hidden where hidden < standing.rank),
        'points', standing.points,
        'exact', standing.exact_count, 'roundsPlayed', standing.rounds_played)
      into me from app.prediction_standings standing
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.user_id = caller
        and not app_private.ranking_account_hidden(standing.user_id);
    end if;
  end if;

  -- One row more than asked says whether another page follows.
  has_more := coalesce(cardinality(page_ids), 0) > p_limit;
  if has_more then
    page_ids := page_ids[1:p_limit];
  end if;

  -- The rows of the page (at most p_limit), with names and ties.
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', standing.id,
      'rank', standing.rank - (select count(*) from unnest(hidden_ranks) hidden where hidden < standing.rank),
      -- Two probes so each one stays on its own partial rank index.
      'tied', case
        when standing.round_id is null then exists (
          select 1 from app.prediction_standings other
          where other.season_id = standing.season_id and other.round_id is null
            and other.rank = standing.rank and other.id <> standing.id
            and not app_private.ranking_account_hidden(other.user_id))
        else exists (
          select 1 from app.prediction_standings other
          where other.round_id = standing.round_id
            and other.rank = standing.rank and other.id <> standing.id
            and not app_private.ranking_account_hidden(other.user_id))
      end,
      'name', case
        when caller is null then app_private.fantasy_mask_username(profile.username)
        else coalesce(nullif(btrim(profile.display_name), ''),
          app_private.fantasy_mask_username(profile.username))
      end,
      'points', standing.points,
      'exact', standing.exact_count,
      'roundsPlayed', standing.rounds_played,
      'isMe', coalesce(standing.user_id = caller, false)
    ) order by standing.rank, standing.id), '[]'::jsonb),
    (array_agg(standing.rank order by standing.rank desc, standing.id desc))[1],
    (array_agg(standing.id order by standing.rank desc, standing.id desc))[1]
  into items, last_rank, last_id
  from app.prediction_standings standing
  left join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
  where standing.id = any(coalesce(page_ids, '{}'::uuid[]));

  return jsonb_build_object(
    'allowed', true,
    'scope', p_scope,
    'round', v_round_number,
    'provisional', case when p_scope = 'round' then round_state <> 'completed' end,
    'matchesLeft', matches_left,
    'total', total,
    'items', items,
    'nextCursor', case when has_more
      then jsonb_build_object('rank', last_rank, 'id', last_id) end,
    'me', me
  );
end;
$$;
