-- Public ranking exclusions.
--
-- The owner decided on 2026-10-11 to HIDE test and QA accounts from the public
-- rankings. The accounts stay: they keep their teams, points and private
-- views. Hiding is reversible and audited.
--
-- What this migration adds:
--
--   * app_private.public_ranking_exclusions -- the list of hidden accounts.
--     No grants, row level security forced; it is read only by the functions
--     below, and written only by the admin function.
--   * api.admin_list_public_ranking_exclusions / api.admin_set_public_ranking_exclusion
--     -- the admin way to add or remove an account. New permission
--     `rankings.manage` (MFA, recent authentication), granted to
--     platform_admin, and every change is written to the admin audit log.
--   * The public readers skip hidden accounts and renumber what they show:
--       api.fantasy_overall_standings   the season board
--       api.fantasy_league_standings    public leagues only
--       api.fantasy_leagues             the leader and the caller's rank in public leagues
--       api.predictions_leaderboard     the Pronostics board
--
-- How ranks are shown. app.fantasy_rankings stores one unique rank per team
-- (row_number, written by api.service_recalculate_fantasy_rankings). Nothing
-- here changes those stored rows, so history is untouched and un-hiding needs
-- no recalculation. The readers compute the rank they show on the fly:
--
--     shown rank = stored rank - (hidden teams stored above it, same board)
--
-- so the public board is 1, 2, 3 ... with no gap, the sort order is unchanged,
-- and the keyset cursor keeps using the stored rank.
--
-- Private views are left alone. A hidden manager still sees their own team,
-- points and history; api.fantasy_overall_standings still returns their own
-- `myRank`, with the rank the account would hold on the public board. A hidden
-- manager does not see their own row inside a public league's list.
--
-- Known and accepted: figures frozen at finalization in
-- app.fantasy_team_gameweek_results (rank, overall_rank, shown in a manager's
-- own history) still count the hidden accounts. They are a manager's private
-- history and are not recomputed.
--
-- Pronostics: app.prediction_standings ranks can tie, and banned users are
-- already skipped without renumbering. The same hidden-ahead subtraction is
-- applied here, so a ban can still leave a gap, as before.
--
-- Nothing in this file names an account. Which accounts to hide is decided by
-- the owner, one call at a time: docs/backend/PUBLIC_RANKING_EXCLUSIONS.md.
--
-- Replaced functions are copies of their latest definitions in
-- 20260926003100_ordinary_account_mfa_step_up.sql (grants are kept by
-- `create or replace`) with the exclusion added; nothing else is changed.

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------

create table app_private.public_ranking_exclusions (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  reason text not null,
  created_by_principal_id uuid not null
    references app_private.staff_principals(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  constraint public_ranking_exclusions_reason_check check (
    reason = btrim(reason) and char_length(reason) between 8 and 500
  )
);
comment on table app_private.public_ranking_exclusions is
  'Accounts hidden from the public rankings (test and QA accounts). Reversible: delete the row. Never exposed; read by the ranking readers, written by api.admin_set_public_ranking_exclusion.';
create index public_ranking_exclusions_created_by_idx
  on app_private.public_ranking_exclusions (created_by_principal_id);
alter table app_private.public_ranking_exclusions enable row level security;
alter table app_private.public_ranking_exclusions force row level security;
revoke all on app_private.public_ranking_exclusions from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin permission
-- ---------------------------------------------------------------------------

insert into app_private.admin_permissions (name, domain, description, requires_recent_auth)
values (
  'rankings.manage', 'rankings',
  'Hides test and QA accounts from the public rankings, and shows them again.',
  true
)
on conflict (name) do nothing;

insert into app_private.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from app_private.admin_roles role
join app_private.admin_permissions permission on permission.name = 'rankings.manage'
where role.name = 'platform_admin'
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers used by the readers
-- ---------------------------------------------------------------------------

-- How many hidden teams sit above p_rank on one board (the board is a season,
-- a gameweek or null for the season total, and a league or null for overall).
-- p_previous compares the hidden teams' previous rank instead of their rank.
-- Starts from the exclusion list, which is a handful of rows.
create function app_private.fantasy_hidden_ahead(
  p_season_id uuid,
  p_gameweek_id uuid,
  p_league_id uuid,
  p_rank bigint,
  p_previous boolean default false
)
returns bigint
language sql
stable
set search_path = ''
as $$
  select count(*)
  from app_private.public_ranking_exclusions exclusion
  join app.fantasy_teams team on team.user_id = exclusion.user_id
  join app.fantasy_rankings ranking on ranking.fantasy_team_id = team.id
  where ranking.fantasy_season_id = p_season_id
    and ranking.gameweek_id is not distinct from p_gameweek_id
    and ranking.league_id is not distinct from p_league_id
    and (case when p_previous then ranking.previous_rank else ranking.rank end) < p_rank;
$$;

create function app_private.prediction_hidden_ahead(
  p_season_id uuid,
  p_round_id uuid,
  p_rank integer
)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from app_private.public_ranking_exclusions exclusion
  join app.prediction_standings standing on standing.user_id = exclusion.user_id
  where standing.rank is not null
    and standing.rank < p_rank
    and (
      (p_round_id is not null and standing.round_id = p_round_id)
      or (p_round_id is null and standing.season_id = p_season_id and standing.round_id is null)
    );
$$;

revoke all on function
  app_private.fantasy_hidden_ahead(uuid, uuid, uuid, bigint, boolean),
  app_private.prediction_hidden_ahead(uuid, uuid, integer)
from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin functions
-- ---------------------------------------------------------------------------

create function api.admin_list_public_ranking_exclusions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.admin_assert_permission('rankings.manage', false);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
        'userId', exclusion.user_id,
        'username', profile.username,
        'displayName', nullif(btrim(profile.display_name), ''),
        'reason', exclusion.reason,
        'hiddenAt', exclusion.created_at
      ) order by exclusion.created_at desc, exclusion.user_id)
    from app_private.public_ranking_exclusions exclusion
    left join app.profiles profile on profile.id = exclusion.user_id
  ), '[]'::jsonb));
end;
$$;

-- Hide or show one account, named by user id or by exact username
-- (case-insensitive). Exactly one of the two. Repeating the same request with
-- the same idempotency key returns the first answer.
create function api.admin_set_public_ranking_exclusion(
  p_user_id uuid,
  p_username text,
  p_hidden boolean,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  target uuid;
  was_hidden boolean;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('rankings.manage', true);
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'ranking_reason_invalid';
  end if;
  if p_hidden is null or p_idempotency_key is null or ((p_user_id is null) = (p_username is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_user_id is not null then
    select profile.id into target from app.profiles profile where profile.id = p_user_id;
  else
    select profile.id into target from app.profiles profile
    where profile.normalized_username = lower(btrim(p_username));
  end if;
  if target is null then
    raise exception using errcode = 'PT404', message = 'ranking_account_not_found';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'rankings.set_exclusion', p_idempotency_key,
    jsonb_build_object('userId', target, 'hidden', p_hidden, 'reason', p_reason)
  );
  if prior is not null then
    return prior;
  end if;

  was_hidden := exists (
    select 1 from app_private.public_ranking_exclusions exclusion where exclusion.user_id = target
  );
  if p_hidden then
    insert into app_private.public_ranking_exclusions (user_id, reason, created_by_principal_id)
    values (target, p_reason, actor)
    on conflict (user_id) do update set
      reason = excluded.reason, created_by_principal_id = excluded.created_by_principal_id;
  else
    delete from app_private.public_ranking_exclusions where user_id = target;
  end if;

  perform app_private.write_admin_audit(
    actor, 'rankings.set_exclusion', 'rankings', target, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    jsonb_build_object('status', case when was_hidden then 'hidden' else 'shown' end),
    jsonb_build_object('status', case when p_hidden then 'hidden' else 'shown' end)
  );

  result := jsonb_build_object('userId', target, 'hidden', p_hidden);
  return app_private.admin_complete_idempotent_operation(
    actor, 'rankings.set_exclusion', p_idempotency_key, result
  );
end;
$$;

revoke all on function
  api.admin_list_public_ranking_exclusions(),
  api.admin_set_public_ranking_exclusion(uuid, text, boolean, text, uuid)
from public, anon, authenticated, service_role;

grant execute on function
  api.admin_list_public_ranking_exclusions(),
  api.admin_set_public_ranking_exclusion(uuid, text, boolean, text, uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Readers
-- ---------------------------------------------------------------------------

-- As in 20260926003100: the leader and the caller rank in public leagues skip hidden teams.
create or replace function api.fantasy_leagues(
  p_season_id uuid,
  p_visibility text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  result jsonb;
  v_visibility app.fantasy_league_visibility;
begin
  perform app_private.assert_mfa_step_up();
  if p_limit not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  -- Resolve the enum here, where `app` is in reach. An unknown value is a
  -- client error, not a 500: report it the same way the limit check does,
  -- rather than letting a raw cast failure surface as an invalid_text_-
  -- representation from inside the function.
  if p_visibility is not null then
    begin
      v_visibility := p_visibility::app.fantasy_league_visibility;
    exception when invalid_text_representation then
      raise exception using errcode = 'PT400', message = 'validation_failed';
    end;
  end if;

  with visible as (
    select league.id, league.name, league.visibility, league.member_count,
      league.invite_code_hint, membership.role,
      case when league.visibility = 'public' then
        ranking.rank - app_private.fantasy_hidden_ahead(
          ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.rank)
      else ranking.rank end as rank,
      case when league.visibility = 'public' then
        ranking.previous_rank - app_private.fantasy_hidden_ahead(
          ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.previous_rank, true)
      else ranking.previous_rank end as previous_rank,
      ranking.total_points,
      leader.name as leader_name
    from app.fantasy_leagues league
    left join app.fantasy_league_memberships membership
      on membership.league_id = league.id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
    left join app.fantasy_teams member_team on member_team.id = membership.fantasy_team_id
    left join app.fantasy_rankings ranking
      on ranking.league_id = league.id and ranking.fantasy_team_id = member_team.id
      and ranking.gameweek_id is null
    left join lateral (
      select ranked_team.name
      from app.fantasy_rankings leader_rank
      join app.fantasy_teams ranked_team on ranked_team.id = leader_rank.fantasy_team_id
      where leader_rank.league_id = league.id and leader_rank.gameweek_id is null
        and not (league.visibility = 'public'
          and exists (select 1 from app.fantasy_teams hidden_team join app_private.public_ranking_exclusions hidden_exclusion on hidden_exclusion.user_id = hidden_team.user_id where hidden_team.id = leader_rank.fantasy_team_id))
      order by leader_rank.rank, leader_rank.fantasy_team_id limit 1
    ) leader on true
    where league.fantasy_season_id = p_season_id and league.active
      and (v_visibility is null or league.visibility = v_visibility)
      and (league.visibility = 'public' or membership.id is not null)
    order by league.member_count desc, league.id
    limit p_limit
  )
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'visibility', visibility,
    'memberCount', member_count, 'inviteCodeHint', invite_code_hint,
    'role', role, 'rank', rank, 'previousRank', previous_rank,
    'totalPoints', total_points, 'leaderName', leader_name
  ) order by member_count desc, id), '[]'::jsonb)) into result from visible;

  return result;
end;
$function$;

-- As in 20260926003100: public league boards skip hidden teams and show gapless ranks.
create or replace function api.fantasy_league_standings(
  p_league_id uuid,
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
declare target app.fantasy_leagues%rowtype;
declare items jsonb;
declare caller uuid := (select auth.uid());
begin
  perform app_private.assert_mfa_step_up();
  if p_limit not between 1 and 100 or ((p_after_rank is null) <> (p_after_team_id is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into target
  from app.fantasy_leagues
  where id = p_league_id and active;

  if not found then
    raise exception using errcode = 'PT404', message = 'league_not_found';
  end if;

  if target.visibility = 'private' and not exists (
    select 1
    from app.fantasy_league_memberships membership
    where membership.league_id = target.id
      and membership.user_id = caller
      and membership.status = 'active'
  ) then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;

  if p_gameweek_id is null and p_after_rank is null then
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at,
        case when target.visibility = 'public' then
          ranking.rank - app_private.fantasy_hidden_ahead(
            ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.rank)
        else ranking.rank end as shown_rank,
        case when target.visibility = 'public' then
          ranking.previous_rank - app_private.fantasy_hidden_ahead(
            ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.previous_rank, true)
        else ranking.previous_rank end as shown_previous_rank
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id is null
        and not (target.visibility = 'public'
          and exists (select 1 from app.fantasy_teams hidden_team join app_private.public_ranking_exclusions hidden_exclusion on hidden_exclusion.user_id = hidden_team.user_id where hidden_team.id = ranking.fantasy_team_id))
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.shown_rank, 'previousRank', ranked_page.shown_previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
    left join app.profiles profile
      on profile.id = team.user_id and profile.deleted_at is null;
  elsif p_gameweek_id is null then
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at,
        case when target.visibility = 'public' then
          ranking.rank - app_private.fantasy_hidden_ahead(
            ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.rank)
        else ranking.rank end as shown_rank,
        case when target.visibility = 'public' then
          ranking.previous_rank - app_private.fantasy_hidden_ahead(
            ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.previous_rank, true)
        else ranking.previous_rank end as shown_previous_rank
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id is null
        and (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id)
        and not (target.visibility = 'public'
          and exists (select 1 from app.fantasy_teams hidden_team join app_private.public_ranking_exclusions hidden_exclusion on hidden_exclusion.user_id = hidden_team.user_id where hidden_team.id = ranking.fantasy_team_id))
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.shown_rank, 'previousRank', ranked_page.shown_previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
    left join app.profiles profile
      on profile.id = team.user_id and profile.deleted_at is null;
  elsif p_after_rank is null then
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at,
        case when target.visibility = 'public' then
          ranking.rank - app_private.fantasy_hidden_ahead(
            ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.rank)
        else ranking.rank end as shown_rank,
        case when target.visibility = 'public' then
          ranking.previous_rank - app_private.fantasy_hidden_ahead(
            ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.previous_rank, true)
        else ranking.previous_rank end as shown_previous_rank
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id = p_gameweek_id
        and not (target.visibility = 'public'
          and exists (select 1 from app.fantasy_teams hidden_team join app_private.public_ranking_exclusions hidden_exclusion on hidden_exclusion.user_id = hidden_team.user_id where hidden_team.id = ranking.fantasy_team_id))
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.shown_rank, 'previousRank', ranked_page.shown_previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
    left join app.profiles profile
      on profile.id = team.user_id and profile.deleted_at is null;
  else
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at,
        case when target.visibility = 'public' then
          ranking.rank - app_private.fantasy_hidden_ahead(
            ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.rank)
        else ranking.rank end as shown_rank,
        case when target.visibility = 'public' then
          ranking.previous_rank - app_private.fantasy_hidden_ahead(
            ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.previous_rank, true)
        else ranking.previous_rank end as shown_previous_rank
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id = p_gameweek_id
        and (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id)
        and not (target.visibility = 'public'
          and exists (select 1 from app.fantasy_teams hidden_team join app_private.public_ranking_exclusions hidden_exclusion on hidden_exclusion.user_id = hidden_team.user_id where hidden_team.id = ranking.fantasy_team_id))
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.shown_rank, 'previousRank', ranked_page.shown_previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
    left join app.profiles profile
      on profile.id = team.user_id and profile.deleted_at is null;
  end if;

  return jsonb_build_object(
    'league', jsonb_build_object(
      'id', target.id,
      'name', target.name,
      'visibility', target.visibility,
      'memberCount', target.member_count
    ),
    'items', items
  );
end;
$$;

-- As in 20260926003100: the season board skips hidden teams and shows gapless ranks.
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

  select count(*) into total
  from app.fantasy_rankings ranking
  where ranking.fantasy_season_id = p_season_id
    and ranking.league_id is null
    and (case
      when target_gameweek is null then ranking.gameweek_id is null
      else ranking.gameweek_id = target_gameweek
    end)
    and not exists (select 1 from app.fantasy_teams hidden_team join app_private.public_ranking_exclusions hidden_exclusion on hidden_exclusion.user_id = hidden_team.user_id where hidden_team.id = ranking.fantasy_team_id);

  -- Bound the ranking rows on the covering keyset index before joining team
  -- and profile data, so a 50k-team board never sorts the whole season.
  with ranked_page as materialized (
    select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
      ranking.total_points, ranking.gameweek_points, ranking.calculated_at,
      -- The rank the public sees: the stored rank minus the hidden accounts
      -- that sit above it, so the board has no gaps. The cursor and the sort
      -- stay on the stored rank (same order, same keyset index).
      ranking.rank - app_private.fantasy_hidden_ahead(
        ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.rank
      ) as shown_rank,
      ranking.previous_rank - app_private.fantasy_hidden_ahead(
        ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.previous_rank, true
      ) as shown_previous_rank
    from app.fantasy_rankings ranking
    where ranking.fantasy_season_id = p_season_id
      and ranking.league_id is null
      and (case
        when target_gameweek is null then ranking.gameweek_id is null
        else ranking.gameweek_id = target_gameweek
      end)
      and (
        p_after_rank is null
        or (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id)
      )
      and not exists (select 1 from app.fantasy_teams hidden_team join app_private.public_ranking_exclusions hidden_exclusion on hidden_exclusion.user_id = hidden_team.user_id where hidden_team.id = ranking.fantasy_team_id)
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
      'rank', ranked_page.shown_rank,
      'previousRank', ranked_page.shown_previous_rank,
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
    where ranking.fantasy_season_id = p_season_id
      and ranking.league_id is null
      and (case
        when target_gameweek is null then ranking.gameweek_id is null
        else ranking.gameweek_id = target_gameweek
      end)
      and (ranking.rank, ranking.fantasy_team_id) > (last_rank, last_team)
      and not exists (select 1 from app.fantasy_teams hidden_team join app_private.public_ranking_exclusions hidden_exclusion on hidden_exclusion.user_id = hidden_team.user_id where hidden_team.id = ranking.fantasy_team_id)
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
    -- The caller's own row is never hidden from the caller; it carries the
    -- rank the account would hold on the public board.
    'rank', ranking.rank - app_private.fantasy_hidden_ahead(
      ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.rank),
    'previousRank', ranking.previous_rank - app_private.fantasy_hidden_ahead(
      ranking.fantasy_season_id, ranking.gameweek_id, ranking.league_id, ranking.previous_rank, true),
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

-- As in 20260926003100: the Pronostics board skips hidden accounts and shows gapless ranks.
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
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        )
        and not exists (select 1 from app_private.public_ranking_exclusions hidden_exclusion where hidden_exclusion.user_id = standing.user_id)
      order by standing.rank, standing.id
      limit p_limit + 1
    ) page;
    if p_after_rank is null then
      select count(*) into total
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.round_id = v_round_id and standing.rank is not null
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        )
        and not exists (select 1 from app_private.public_ranking_exclusions hidden_exclusion where hidden_exclusion.user_id = standing.user_id);
    end if;
    if caller is not null then
      select jsonb_build_object('rank', standing.rank - app_private.prediction_hidden_ahead(
          null, standing.round_id, standing.rank), 'points', standing.points,
        'exact', standing.exact_count)
      into me from app.prediction_standings standing
      where standing.round_id = v_round_id and standing.user_id = caller;
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
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        )
        and not exists (select 1 from app_private.public_ranking_exclusions hidden_exclusion where hidden_exclusion.user_id = standing.user_id)
      order by standing.rank, standing.id
      limit p_limit + 1
    ) page;
    if p_after_rank is null then
      select count(*) into total
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.rank is not null
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        )
        and not exists (select 1 from app_private.public_ranking_exclusions hidden_exclusion where hidden_exclusion.user_id = standing.user_id);
    end if;
    if caller is not null then
      select jsonb_build_object('rank', standing.rank - app_private.prediction_hidden_ahead(
          standing.season_id, null, standing.rank), 'points', standing.points,
        'exact', standing.exact_count, 'roundsPlayed', standing.rounds_played)
      into me from app.prediction_standings standing
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.user_id = caller;
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
      'rank', standing.rank - case
        when standing.round_id is null then app_private.prediction_hidden_ahead(
          standing.season_id, null, standing.rank)
        else app_private.prediction_hidden_ahead(null, standing.round_id, standing.rank)
      end,
      -- Two probes so each one stays on its own partial rank index.
      'tied', case
        when standing.round_id is null then exists (
          select 1 from app.prediction_standings other
          where other.season_id = standing.season_id and other.round_id is null
            and other.rank = standing.rank and other.id <> standing.id
            and not exists (select 1 from app_private.public_ranking_exclusions hidden_exclusion where hidden_exclusion.user_id = other.user_id))
        else exists (
          select 1 from app.prediction_standings other
          where other.round_id = standing.round_id
            and other.rank = standing.rank and other.id <> standing.id
            and not exists (select 1 from app_private.public_ranking_exclusions hidden_exclusion where hidden_exclusion.user_id = other.user_id))
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
