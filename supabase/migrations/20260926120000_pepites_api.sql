-- BotolaGO Production V2
-- Pépites, migration 8 of the v1 sequence: the API.
-- docs/engineering/PEPITES_ARCHITECTURE.md §6 and §7.
--
-- One check decides access for every public function, by mode:
--
--   off     nobody sees Pépites ({"available": false}); the admin screens work
--   staff   staff holding pepites.edit see it, marked "preview": true
--   public  everyone sees published data; drafts only in the admin screens
--
-- Public reads are versioned. The version is the current published edition,
-- or 'season_final:<run>' before the season's first edition. It changes only
-- when a publication, correction or withdrawal commits, and the content of a
-- version never changes while it is public, so pages can cache it.
--
-- Admin functions check a permission (pepites.edit, pepites.publish, or the
-- football ones for the data desk, attributes and photos) and write the admin
-- audit trail. Nothing here changes the mode: Pépites stays off.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
insert into app_private.admin_permissions (name, domain, description, requires_recent_auth)
values
  ('pepites.edit', 'pepites',
    'Prepares Pépites editions (order and reasons of a draft) and previews Pépites while it is in staff mode.',
    false),
  ('pepites.publish', 'pepites',
    'Schedules, publishes, corrects and withdraws Pépites editions, and reads their email report.',
    true)
on conflict (name) do nothing;

insert into app_private.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from app_private.admin_roles role
join app_private.admin_permissions permission on permission.name in ('pepites.edit', 'pepites.publish')
where role.name in ('publisher', 'content_admin', 'platform_admin')
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- Whether the caller is staff allowed to preview: the full staff check
-- (principal, role, verified factor, aal2), without raising.
create function app_private.pepites_staff_preview_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.admin_assert_permission('pepites.edit', false);
  return true;
exception when others then
  return false;
end;
$$;

-- 'public', 'staff_preview' or 'none' (§6.1).
create function app_private.pepites_access()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when settings.mode = 'public' then 'public'
    when settings.mode = 'staff' and app_private.pepites_staff_preview_allowed() then 'staff_preview'
    else 'none'
  end
  from app_private.pepites_settings settings
  where settings.id;
$$;

-- The 2025-26 final ranking, shown before the first 2026-27 edition, is a
-- season_final run the operator activates once (postgres only).
create function app_private.pepites_activate_season_final(p_run_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run app.pepites_runs%rowtype;
begin
  select * into v_run from app.pepites_runs where id = p_run_id for update;
  if v_run.id is null or v_run.kind <> 'season_final' or v_run.status <> 'succeeded' then
    raise exception using errcode = '22023', message = 'PEPITES_RUN_NOT_SEASON_FINAL';
  end if;
  if v_run.activated_at is null then
    update app.pepites_runs set activated_at = statement_timestamp() where id = p_run_id;
    insert into app_private.pepites_job_log (kind, outcome, detail)
    values ('operator', 'season_final_activated', pg_catalog.jsonb_build_object('runId', p_run_id));
  end if;
  return pg_catalog.jsonb_build_object('runId', p_run_id, 'activated', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Versions
-- ---------------------------------------------------------------------------
-- The current version: the current season's latest published edition, or
-- before any, the latest activated season_final run of the competition.
create function app_private.pepites_current_version()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with season as (
    select app_private.pepites_current_season() as id
  ),
  edition as (
    select edition.id, edition.run_id, edition.season_id, edition.week_number
    from app.pepites_editions edition, season
    where edition.season_id = season.id and edition.status = 'published'
    order by edition.week_number desc
    limit 1
  ),
  final_run as (
    select run.id, run.season_id
    from app.pepites_runs run
    join app.seasons run_season on run_season.id = run.season_id
    cross join app_private.pepites_settings settings
    where run.kind = 'season_final' and run.activated_at is not null and settings.id
      and (settings.competition_id is null or run_season.competition_id = settings.competition_id)
    order by run_season.starts_on desc, run.activated_at desc
    limit 1
  )
  select case
    when exists (select 1 from edition) then (
      select pg_catalog.jsonb_build_object('version', edition.id::text, 'source', 'edition',
        'editionId', edition.id, 'runId', edition.run_id, 'seasonId', edition.season_id,
        'week', edition.week_number)
      from edition)
    when exists (select 1 from final_run) then (
      select pg_catalog.jsonb_build_object('version', 'season_final:' || final_run.id, 'source', 'previous_season',
        'editionId', null, 'runId', final_run.id, 'seasonId', final_run.season_id, 'week', null)
      from final_run)
    else pg_catalog.jsonb_build_object('version', null, 'source', null)
  end;
$$;

-- A version the public may read: a published, superseded or withdrawn
-- edition, or an activated season_final run. Null for anything else (a
-- draft, a scheduled edition, a run nobody published, garbage).
create function app_private.pepites_resolve_version(p_version text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_result jsonb;
begin
  if p_version is null or p_version in ('', 'current') then
    v_result := app_private.pepites_current_version();
    if v_result ->> 'version' is null then
      return null;
    end if;
    p_version := v_result ->> 'version';
  end if;
  if p_version ~ '^season_final:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := substring(p_version from 14)::uuid;
    select pg_catalog.jsonb_build_object('version', p_version, 'source', 'previous_season',
        'editionId', null, 'runId', run.id, 'seasonId', run.season_id, 'week', null,
        'status', 'published')
    into v_result
    from app.pepites_runs run
    where run.id = v_id and run.kind = 'season_final' and run.activated_at is not null;
    return v_result;
  end if;
  if p_version ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := p_version::uuid;
    select pg_catalog.jsonb_build_object('version', p_version, 'source', 'edition',
        'editionId', edition.id, 'runId', edition.run_id, 'seasonId', edition.season_id,
        'week', edition.week_number, 'status', edition.status)
    into v_result
    from app.pepites_editions edition
    where edition.id = v_id and edition.status in ('published', 'superseded', 'withdrawn');
    return v_result;
  end if;
  return null;
end;
$$;

-- The pointer with its state (§7): current, countdown (a scheduled edition
-- is due) or delayed (an open edition more than 2 minutes past its time and
-- less than 24 hours past it).
create function app_private.pepites_version_pointer(p_now timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with open_edition as (
    select edition.status, edition.scheduled_for
    from app.pepites_editions edition
    where edition.season_id = app_private.pepites_current_season()
      and edition.status in ('draft', 'scheduled') and edition.scheduled_for is not null
      and edition.scheduled_for > p_now - interval '24 hours'
    order by edition.week_number desc, edition.scheduled_for
    limit 1
  )
  select app_private.pepites_current_version() || case
    when exists (select 1 from open_edition where scheduled_for <= p_now - interval '2 minutes')
      then pg_catalog.jsonb_build_object('state', 'delayed', 'nextRevealAt', null)
    when exists (select 1 from open_edition where status = 'scheduled')
      then pg_catalog.jsonb_build_object('state', 'countdown',
        'nextRevealAt', (select scheduled_for from open_edition))
    else pg_catalog.jsonb_build_object('state', 'current', 'nextRevealAt', null)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Shapes
-- ---------------------------------------------------------------------------
create function app_private.pepites_team_json(p_team_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.notification_email_team_json(team.id) || pg_catalog.jsonb_build_object('slug', team.slug)
  from app.teams team
  where team.id = p_team_id;
$$;

-- A player's card in a run: identity, club, score and rank, photo when one
-- is approved for the app (else null: the page draws the silhouette).
create function app_private.pepites_player_card(p_player_id uuid, p_run_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', player.id,
    'slug', player.slug,
    'name', player.display_name,
    'fullName', player.full_name,
    'positionGroup', score.position_group,
    'detailedPosition', player.detailed_position,
    'age', score.age_years,
    'team', case when score.team_id is not null then app_private.pepites_team_json(score.team_id) end,
    'score', score.score,
    'rank', score.rank,
    'rankInPosition', score.rank_in_position,
    'photo', app_private.player_photo_for(player.id, 'app')
  )
  from app.players player
  left join app.pepites_player_scores score on score.run_id = p_run_id and score.player_id = player.id
  where player.id = p_player_id;
$$;

-- An edition as the public sees it. A withdrawn edition shows no entries.
create function app_private.pepites_edition_json(p_edition_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', edition.id,
    'seasonId', edition.season_id,
    'seasonLabel', season.label,
    'week', edition.week_number,
    'round', edition.round_number,
    'status', edition.status,
    'publishedAt', edition.published_at,
    'withdrawnAt', edition.withdrawn_at,
    'withdrawnReason', edition.withdrawn_reason,
    'correctsEditionId', edition.corrects_edition_id,
    'correctedBy', edition.superseded_by,
    'correctedByWeek', (select correction.week_number from app.pepites_editions correction
      where correction.id = edition.superseded_by),
    'previousEditionId', edition.previous_edition_id,
    'methodology', run.methodology_version,
    'entries', case when edition.status = 'withdrawn' then '[]'::jsonb else coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'rank', entry.editorial_rank,
          'computedRank', entry.computed_rank,
          'score', round(entry.computed_score)::integer,
          'reasonFr', entry.reason_fr,
          'reasonAr', entry.reason_ar,
          'movement', case
            when edition.previous_edition_id is null then null
            when previous.editorial_rank is null then pg_catalog.jsonb_build_object('kind', 'new')
            when previous.editorial_rank > entry.editorial_rank then
              pg_catalog.jsonb_build_object('kind', 'up', 'by', previous.editorial_rank - entry.editorial_rank)
            when previous.editorial_rank < entry.editorial_rank then
              pg_catalog.jsonb_build_object('kind', 'down', 'by', entry.editorial_rank - previous.editorial_rank)
            else pg_catalog.jsonb_build_object('kind', 'same')
          end,
          'player', app_private.pepites_player_card(entry.player_id, edition.run_id)
        ) order by entry.editorial_rank)
      from app.pepites_edition_entries entry
      left join app.pepites_edition_entries previous
        on previous.edition_id = edition.previous_edition_id and previous.player_id = entry.player_id
      where entry.edition_id = edition.id
    ), '[]'::jsonb) end
  )
  from app.pepites_editions edition
  join app.seasons season on season.id = edition.season_id
  join app.pepites_runs run on run.id = edition.run_id
  where edition.id = p_edition_id;
$$;

-- ---------------------------------------------------------------------------
-- Public reads (anon and authenticated; pg_catalog types only)
-- ---------------------------------------------------------------------------
create function api.pepites_version()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access text := app_private.pepites_access();
begin
  if v_access = 'none' then
    return pg_catalog.jsonb_build_object('available', false);
  end if;
  return app_private.pepites_version_pointer(statement_timestamp())
    || pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview');
end;
$$;

create function api.pepites_home(p_version text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access text := app_private.pepites_access();
  v_version jsonb;
begin
  if v_access = 'none' then
    return pg_catalog.jsonb_build_object('available', false);
  end if;
  v_version := app_private.pepites_resolve_version(p_version);
  if v_version is null then
    return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
      'found', false);
  end if;
  return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
    'found', true, 'version', v_version ->> 'version', 'source', v_version ->> 'source',
    'edition', case when v_version ->> 'source' = 'edition'
      then app_private.pepites_edition_json((v_version ->> 'editionId')::uuid) end,
    'previousSeason', case when v_version ->> 'source' = 'previous_season' then (
      select pg_catalog.jsonb_build_object(
        'runId', run.id, 'seasonId', season.id, 'seasonLabel', season.label,
        'methodology', run.methodology_version, 'asOfRound', run.as_of_round_number,
        'entries', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'rank', score.rank, 'score', score.score,
              'player', app_private.pepites_player_card(score.player_id, run.id)
            ) order by score.rank)
          from app.pepites_player_scores score
          where score.run_id = run.id and score.rank between 1 and 10
        ), '[]'::jsonb))
      from app.pepites_runs run
      join app.seasons season on season.id = run.season_id
      where run.id = (v_version ->> 'runId')::uuid) end);
end;
$$;

create function api.pepites_ranking(
  p_version text default null,
  p_position text default null,
  p_max_age integer default null,
  p_team_id uuid default null,
  p_sort text default 'score',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access text := app_private.pepites_access();
  v_version jsonb;
  v_run_id uuid;
  v_previous_run_id uuid;
  v_total integer;
  v_rows jsonb;
begin
  if v_access = 'none' then
    return pg_catalog.jsonb_build_object('available', false);
  end if;
  if (p_position is not null and p_position not in ('GK', 'DEF', 'MID', 'FWD'))
    or (p_max_age is not null and p_max_age not between 14 and 23)
    or coalesce(p_sort, 'score') not in ('score', 'minutes', 'goals', 'assists', 'rating', 'form', 'ga90')
    or coalesce(p_limit, 20) not between 1 and 50
    or coalesce(p_offset, 0) not between 0 and 10000
  then
    raise exception using errcode = '22023', message = 'PEPITES_RANKING_INVALID';
  end if;
  v_version := app_private.pepites_resolve_version(p_version);
  if v_version is null or v_version ->> 'status' = 'withdrawn' then
    return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
      'found', false);
  end if;
  v_run_id := (v_version ->> 'runId')::uuid;
  -- Movement: against the run of the edition's previous edition.
  select previous.run_id into v_previous_run_id
  from app.pepites_editions edition
  join app.pepites_editions previous on previous.id = edition.previous_edition_id
  where edition.id = (v_version ->> 'editionId')::uuid;

  select count(*) into v_total
  from app.pepites_player_scores score
  where score.run_id = v_run_id and score.rank is not null
    and (p_position is null or score.position_group = p_position)
    and (p_max_age is null or score.age_years <= p_max_age)
    and (p_team_id is null or score.team_id = p_team_id);

  select coalesce(pg_catalog.jsonb_agg(row_json order by ordinal), '[]'::jsonb) into v_rows
  from (
    select row_number() over () as ordinal,
      app_private.pepites_player_card(ranked.player_id, v_run_id) || pg_catalog.jsonb_build_object(
        'minutes', ranked.minutes, 'apps', ranked.apps, 'starts', ranked.starts,
        'goals', ranked.goals, 'assists', ranked.assists,
        'ratingAvg', ranked.rating_avg, 'formAvg', ranked.form_avg,
        'ga90', round((ranked.per90 ->> 'goalsAssists')::numeric, 2),
        'flags', to_jsonb(ranked.flags),
        'movement', case
          when v_previous_run_id is null then null
          when previous.rank is null then pg_catalog.jsonb_build_object('kind', 'new')
          when previous.rank > ranked.rank then pg_catalog.jsonb_build_object('kind', 'up', 'by', previous.rank - ranked.rank)
          when previous.rank < ranked.rank then pg_catalog.jsonb_build_object('kind', 'down', 'by', ranked.rank - previous.rank)
          else pg_catalog.jsonb_build_object('kind', 'same')
        end
      ) as row_json
    from (
      select score.*
      from app.pepites_player_scores score
      where score.run_id = v_run_id and score.rank is not null
        and (p_position is null or score.position_group = p_position)
        and (p_max_age is null or score.age_years <= p_max_age)
        and (p_team_id is null or score.team_id = p_team_id)
      order by
        case coalesce(p_sort, 'score')
          when 'minutes' then -score.minutes
          when 'goals' then -score.goals
          when 'assists' then -score.assists
          when 'rating' then -coalesce(score.rating_avg, -1)
          when 'form' then -coalesce(score.form_avg, -1)
          when 'ga90' then -coalesce((score.per90 ->> 'goalsAssists')::numeric, -1)
          else score.rank
        end,
        score.rank
      limit coalesce(p_limit, 20) offset coalesce(p_offset, 0)
    ) ranked
    left join app.pepites_player_scores previous
      on previous.run_id = v_previous_run_id and previous.player_id = ranked.player_id
  ) rows_out;

  return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
    'found', true, 'version', v_version ->> 'version', 'source', v_version ->> 'source',
    'total', v_total, 'rows', v_rows);
end;
$$;

create function api.pepites_player(p_version text, p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access text := app_private.pepites_access();
  v_version jsonb;
  v_run_id uuid;
  v_result jsonb;
begin
  if v_access = 'none' then
    return pg_catalog.jsonb_build_object('available', false);
  end if;
  v_version := app_private.pepites_resolve_version(p_version);
  v_run_id := (v_version ->> 'runId')::uuid;
  -- Only a player the version's run assessed (in its pool).
  if v_version is null or v_version ->> 'status' = 'withdrawn' or not exists (
    select 1 from app_private.pepites_run_players pool
    where pool.run_id = v_run_id and pool.player_id = p_player_id and pool.in_pool
  ) then
    return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
      'found', false);
  end if;
  select pg_catalog.jsonb_build_object(
    'available', true, 'preview', v_access = 'staff_preview', 'found', true,
    'version', v_version ->> 'version', 'source', v_version ->> 'source',
    'player', app_private.pepites_player_card(player.id, v_run_id) || pg_catalog.jsonb_build_object(
      'preferredFoot', nullif(player.preferred_foot::text, 'unknown'),
      'heightCm', player.height_cm,
      'nationality', (select country.iso_alpha2 from app.countries country
        where country.id = player.nationality_country_id),
      'missing', to_jsonb(array_remove(array[
        case when coalesce(player.preferred_foot::text, 'unknown') = 'unknown' then 'preferred_foot' end,
        case when player.height_cm is null then 'height_cm' end,
        case when player.nationality_country_id is null then 'nationality' end,
        case when player.detailed_position is null then 'detailed_position' end
      ], null))),
    'score', (
      select pg_catalog.jsonb_build_object(
        'eligible', score.eligible, 'score', score.score, 'rank', score.rank,
        'rankInPosition', score.rank_in_position, 'apps', score.apps, 'starts', score.starts,
        'minutes', score.minutes, 'goals', score.goals, 'assists', score.assists,
        'saves', score.saves, 'cleanSheets', score.clean_sheets,
        'ratingAvg', score.rating_avg, 'ratingCount', score.rating_n, 'formAvg', score.form_avg,
        'per90', score.per90, 'percentiles', score.percentiles, 'components', score.components,
        'flags', to_jsonb(score.flags))
      from app.pepites_player_scores score
      where score.run_id = v_run_id and score.player_id = player.id),
    'editions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'editionId', edition.id, 'week', edition.week_number, 'rank', entry.editorial_rank,
          'status', edition.status) order by edition.week_number desc)
      from app.pepites_edition_entries entry
      join app.pepites_editions edition on edition.id = entry.edition_id
      where entry.player_id = player.id and edition.status in ('published', 'superseded')
        and edition.season_id = (v_version ->> 'seasonId')::uuid
    ), '[]'::jsonb)
  ) into v_result
  from app.players player
  where player.id = p_player_id;
  return v_result;
end;
$$;

create function api.pepites_player_matches(p_player_id uuid, p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access text := app_private.pepites_access();
  v_version jsonb;
begin
  if v_access = 'none' then
    return pg_catalog.jsonb_build_object('available', false);
  end if;
  if coalesce(p_limit, 10) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'PEPITES_LIMIT_INVALID';
  end if;
  v_version := app_private.pepites_resolve_version(null);
  if v_version is null or not exists (
    select 1 from app_private.pepites_run_players pool
    where pool.run_id = (v_version ->> 'runId')::uuid and pool.player_id = p_player_id and pool.in_pool
  ) then
    return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
      'found', false);
  end if;
  return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
    'found', true, 'matches', coalesce((
      select pg_catalog.jsonb_agg(match_json order by kickoff desc)
      from (
        select fixture.kickoff_at as kickoff, pg_catalog.jsonb_build_object(
          'fixtureId', fixture.id,
          'kickoffAt', fixture.kickoff_at,
          'home', fixture.home_team_id = performance.team_id,
          'opponent', app_private.pepites_team_json(case when fixture.home_team_id = performance.team_id
            then fixture.away_team_id else fixture.home_team_id end),
          'teamScore', case when fixture.home_team_id = performance.team_id then fixture.home_score else fixture.away_score end,
          'opponentScore', case when fixture.home_team_id = performance.team_id then fixture.away_score else fixture.home_score end,
          'minutes', performance.minutes, 'started', performance.started,
          'goals', performance.goals, 'assists', performance.assists,
          'yellowCards', performance.yellow_cards, 'redCards', performance.red_cards,
          'rating', performance.provider_rating
        ) as match_json
        from app.player_fixture_performances performance
        join app.fixtures fixture on fixture.id = performance.fixture_id
        where performance.player_id = p_player_id and performance.active and performance.minutes > 0
          and fixture.status = 'finished'
          and performance.football_season_id = (v_version ->> 'seasonId')::uuid
        order by fixture.kickoff_at desc
        limit coalesce(p_limit, 10)
      ) matches
    ), '[]'::jsonb));
end;
$$;

create function api.pepites_edition(p_season_id uuid, p_week integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access text := app_private.pepites_access();
  v_edition_id uuid;
begin
  if v_access = 'none' then
    return pg_catalog.jsonb_build_object('available', false);
  end if;
  -- The week's published edition; else the latest one that was public.
  select edition.id into v_edition_id
  from app.pepites_editions edition
  where edition.season_id = coalesce(p_season_id, app_private.pepites_current_season())
    and edition.week_number = p_week
    and edition.status in ('published', 'superseded', 'withdrawn')
  order by edition.status = 'published' desc, edition.published_at desc
  limit 1;
  if v_edition_id is null then
    return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
      'found', false);
  end if;
  return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
    'found', true, 'edition', app_private.pepites_edition_json(v_edition_id));
end;
$$;

-- The method and its coverage, for the version's run.
create function api.pepites_methodology()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access text := app_private.pepites_access();
  v_version jsonb;
  v_run_id uuid;
begin
  if v_access = 'none' then
    return pg_catalog.jsonb_build_object('available', false);
  end if;
  v_version := app_private.pepites_resolve_version(null);
  v_run_id := (v_version ->> 'runId')::uuid;
  return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
    'methodology', (
      select pg_catalog.jsonb_build_object('version', methodology.version, 'params', methodology.params,
        'descriptionFr', methodology.description_fr, 'descriptionAr', methodology.description_ar)
      from app.pepites_methodologies methodology
      where methodology.version = coalesce(
        (select run.methodology_version from app.pepites_runs run where run.id = v_run_id), 'v1')),
    'coverage', case when v_run_id is null then null else (
      select pg_catalog.jsonb_build_object(
        'runId', v_run_id,
        'source', v_version ->> 'source',
        'asOfRound', (select run.as_of_round_number from app.pepites_runs run where run.id = v_run_id),
        'poolSize', count(*) filter (where pool.in_pool),
        'noDateOfBirth', count(*) filter (where pool.date_of_birth is null),
        'eligible', (select count(*) from app.pepites_player_scores score
          where score.run_id = v_run_id and score.eligible),
        'ranked', (select count(*) from app.pepites_player_scores score
          where score.run_id = v_run_id and score.rank is not null),
        'ratingCoverage', (select round(avg(case when appearance.rating is not null then 1.0 else 0 end), 3)
          from app_private.pepites_run_appearances appearance
          where appearance.run_id = v_run_id and appearance.minutes >= 20),
        'footCoverage', round(avg(case when coalesce(player.preferred_foot::text, 'unknown') <> 'unknown' then 1.0 else 0 end)
          filter (where pool.in_pool), 3),
        'heightCoverage', round(avg(case when player.height_cm is not null then 1.0 else 0 end)
          filter (where pool.in_pool), 3))
      from app_private.pepites_run_players pool
      join app.players player on player.id = pool.player_id
      where pool.run_id = v_run_id) end);
end;
$$;

-- "Report an error" on a player page: signed-in fans, 5 a day (§3.7).
create function api.report_pepites_data_issue(
  p_entity_type text,
  p_entity_id uuid,
  p_field text,
  p_message text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'PEPITES_SIGN_IN_REQUIRED';
  end if;
  if app_private.pepites_access() = 'none' then
    raise exception using errcode = 'PT403', message = 'PEPITES_UNAVAILABLE';
  end if;
  return pg_catalog.jsonb_build_object('issueId',
    app_private.report_data_issue(p_entity_type, p_entity_id, p_field, p_message, current_user_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
create function app_private.pepites_admin_audit(
  p_actor uuid,
  p_action text,
  p_target uuid,
  p_reason text,
  p_after jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select app_private.write_admin_audit(p_actor, p_action, 'pepites', p_target, p_reason,
    gen_random_uuid(), gen_random_uuid(), null, null, p_after);
$$;

create function api.admin_pepites_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
begin
  perform app_private.admin_assert_permission('pepites.edit', false);
  v_season_id := app_private.pepites_current_season();
  return pg_catalog.jsonb_build_object(
    'settings', (select pg_catalog.jsonb_build_object('mode', settings.mode,
        'autoPublish', settings.auto_publish, 'publishLocalTime', settings.publish_local_time,
        'draftLocalTime', settings.draft_local_time)
      from app_private.pepites_settings settings where settings.id),
    'jobActive', exists (select 1 from cron.job where jobname = 'pepites-tick' and active),
    'season', (select pg_catalog.jsonb_build_object('id', season.id, 'label', season.label)
      from app.seasons season where season.id = v_season_id),
    'pointer', app_private.pepites_version_pointer(statement_timestamp()),
    'runs', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', run.id, 'kind', run.kind,
          'round', run.as_of_round_number, 'revision', run.revision, 'status', run.status,
          'eligible', run.eligible_count, 'ranked', run.ranked_count,
          'activatedAt', run.activated_at, 'finishedAt', run.finished_at, 'error', run.error)
        order by run.started_at desc)
      from (select * from app.pepites_runs where season_id = v_season_id
            order by started_at desc limit 8) run
    ), '[]'::jsonb),
    'editions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', edition.id,
          'week', edition.week_number, 'round', edition.round_number, 'status', edition.status,
          'scheduledFor', edition.scheduled_for, 'publishedAt', edition.published_at,
          'correctsEditionId', edition.corrects_edition_id,
          'problems', to_jsonb(app_private.pepites_edition_problems(edition.id)))
        order by edition.week_number desc, edition.created_at desc)
      from (select * from app.pepites_editions where season_id = v_season_id
            order by week_number desc, created_at desc limit 12) edition
    ), '[]'::jsonb),
    'notices', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('subject', notice.subject,
          'body', notice.body, 'sentAt', notice.sent_at) order by notice.sent_at desc)
      from (select * from app_private.pepites_notices order by sent_at desc limit 10) notice
    ), '[]'::jsonb)
  );
end;
$$;

create function api.admin_pepites_edition_get(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_edition app.pepites_editions%rowtype;
begin
  perform app_private.admin_assert_permission('pepites.edit', false);
  select * into v_edition from app.pepites_editions where id = p_edition_id;
  if v_edition.id is null then
    raise exception using errcode = 'PT404', message = 'PEPITES_EDITION_NOT_FOUND';
  end if;
  return pg_catalog.jsonb_build_object(
    'edition', pg_catalog.jsonb_build_object('id', v_edition.id, 'seasonId', v_edition.season_id,
      'week', v_edition.week_number, 'round', v_edition.round_number, 'status', v_edition.status,
      'runId', v_edition.run_id, 'scheduledFor', v_edition.scheduled_for,
      'publishedAt', v_edition.published_at, 'correctsEditionId', v_edition.corrects_edition_id,
      'supersededBy', v_edition.superseded_by, 'withdrawnReason', v_edition.withdrawn_reason),
    'problems', to_jsonb(app_private.pepites_edition_problems(v_edition.id)),
    'entries', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('rank', entry.editorial_rank,
          'computedRank', entry.computed_rank, 'computedScore', entry.computed_score,
          'reasonFr', entry.reason_fr, 'reasonAr', entry.reason_ar,
          'player', app_private.pepites_player_card(entry.player_id, v_edition.run_id))
        order by entry.editorial_rank)
      from app.pepites_edition_entries entry where entry.edition_id = v_edition.id
    ), '[]'::jsonb),
    -- The editorial shortlist: the run's computed top 20, read now.
    'shortlist', coalesce((
      select pg_catalog.jsonb_agg(app_private.pepites_player_card(score.player_id, v_edition.run_id)
          || pg_catalog.jsonb_build_object('minutes', score.minutes, 'goals', score.goals,
            'assists', score.assists, 'ratingAvg', score.rating_avg, 'flags', to_jsonb(score.flags))
        order by score.rank)
      from app.pepites_player_scores score
      where score.run_id = v_edition.run_id and score.rank between 1 and 20
    ), '[]'::jsonb),
    'moves', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('from', move.from_status,
          'to', move.to_status, 'actorKind', move.actor_kind, 'at', move.at, 'detail', move.detail)
        order by move.id)
      from app_private.pepites_edition_moves move where move.edition_id = v_edition.id
    ), '[]'::jsonb)
  );
end;
$$;

create function api.admin_pepites_edition_update(p_edition_id uuid, p_entries jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.admin_assert_permission('pepites.edit', false);
  v_result jsonb;
begin
  v_result := app_private.pepites_set_entries(p_edition_id, p_entries, v_actor);
  perform app_private.pepites_admin_audit(v_actor, 'pepites.edition_update', p_edition_id,
    'Pépites draft order and reasons saved.', pg_catalog.jsonb_build_object('entries', v_result -> 'entries'));
  return v_result;
end;
$$;

create function api.admin_pepites_edition_schedule(p_edition_id uuid, p_at timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.admin_assert_permission('pepites.publish', true);
  v_result jsonb;
begin
  if p_at is null or p_at < statement_timestamp() - interval '5 minutes'
    or p_at > statement_timestamp() + interval '14 days'
  then
    raise exception using errcode = '22023', message = 'PEPITES_SCHEDULE_TIME_INVALID';
  end if;
  v_result := app_private.pepites_schedule(p_edition_id, p_at, v_actor);
  perform app_private.pepites_admin_audit(v_actor, 'pepites.edition_schedule', p_edition_id,
    'Pépites edition scheduled.', pg_catalog.jsonb_build_object('scheduledFor', p_at));
  return v_result;
end;
$$;

create function api.admin_pepites_edition_unschedule(p_edition_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.admin_assert_permission('pepites.publish', true);
  v_result jsonb;
begin
  v_result := app_private.pepites_unschedule(p_edition_id, v_actor);
  perform app_private.pepites_admin_audit(v_actor, 'pepites.edition_unschedule', p_edition_id,
    'Pépites edition taken back to draft.', '{}'::jsonb);
  return v_result;
end;
$$;

create function api.admin_pepites_edition_publish_now(p_edition_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.admin_assert_permission('pepites.publish', true);
  v_result jsonb;
begin
  v_result := app_private.pepites_publish_edition(p_edition_id, v_actor);
  if not (v_result ->> 'alreadyPublished')::boolean then
    perform app_private.pepites_admin_audit(v_actor, 'pepites.edition_publish', p_edition_id,
      'Pépites edition published from the admin screen.', v_result);
  end if;
  return v_result;
end;
$$;

create function api.admin_pepites_edition_correct(p_edition_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.admin_assert_permission('pepites.publish', true);
  v_correction_id uuid;
begin
  v_correction_id := app_private.pepites_create_correction(p_edition_id, v_actor);
  perform app_private.pepites_admin_audit(v_actor, 'pepites.edition_correct', p_edition_id,
    'Pépites correction draft created.', pg_catalog.jsonb_build_object('correctionId', v_correction_id));
  return pg_catalog.jsonb_build_object('editionId', v_correction_id, 'status', 'draft');
end;
$$;

create function api.admin_pepites_edition_withdraw(p_edition_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.admin_assert_permission('pepites.publish', true);
  v_result jsonb;
begin
  v_result := app_private.pepites_withdraw(p_edition_id, p_reason, v_actor);
  perform app_private.pepites_admin_audit(v_actor, 'pepites.edition_withdraw', p_edition_id,
    btrim(p_reason), '{}'::jsonb);
  return v_result;
end;
$$;

create function api.admin_pepites_email_report(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.admin_assert_permission('pepites.publish', false);
  return app_private.pepites_email_report(p_edition_id);
end;
$$;

-- Data desk (§3.7).
create function api.admin_data_desk_list(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text := coalesce(p_filters ->> 'status', 'open');
  v_kind text := p_filters ->> 'kind';
  v_limit integer := coalesce((p_filters ->> 'limit')::integer, 50);
  v_offset integer := coalesce((p_filters ->> 'offset')::integer, 0);
begin
  perform app_private.admin_assert_permission('football.read_operations', false);
  if v_status not in ('open', 'resolved', 'dismissed', 'all') or v_limit not between 1 and 200
    or v_offset not between 0 and 100000
    or (v_kind is not null and v_kind not in ('missing', 'conflict', 'reported', 'unlinked'))
  then
    raise exception using errcode = '22023', message = 'DATA_DESK_FILTERS_INVALID';
  end if;
  return pg_catalog.jsonb_build_object(
    'total', (select count(*) from app_private.data_desk_issues issue
      where (v_status = 'all' or issue.status = v_status) and (v_kind is null or issue.kind = v_kind)),
    'issues', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', issue.id,
          'entityType', issue.entity_type, 'entityId', issue.entity_id, 'field', issue.field,
          'kind', issue.kind, 'status', issue.status, 'source', issue.source, 'details', issue.details,
          'playerName', (select player.display_name from app.players player
            where issue.entity_type = 'player' and player.id = issue.entity_id),
          'createdAt', issue.created_at, 'resolvedAt', issue.resolved_at,
          'resolutionNote', issue.resolution_note) order by issue.created_at desc)
      from (select * from app_private.data_desk_issues issue
            where (v_status = 'all' or issue.status = v_status) and (v_kind is null or issue.kind = v_kind)
            order by issue.created_at desc limit v_limit offset v_offset) issue
    ), '[]'::jsonb));
end;
$$;

create function api.admin_data_desk_close(p_issue_id uuid, p_status text, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.admin_assert_permission('football.correct', false);
begin
  perform app_private.close_data_desk_issue(p_issue_id, p_status, p_note, v_actor);
  perform app_private.write_admin_audit(v_actor, 'football.data_desk_close', 'football', p_issue_id,
    coalesce(nullif(btrim(p_note), ''), 'Data desk issue closed.'), gen_random_uuid(),
    gen_random_uuid(), null, null, pg_catalog.jsonb_build_object('status', p_status));
  return pg_catalog.jsonb_build_object('issueId', p_issue_id, 'status', p_status);
end;
$$;

-- A manual attribute value (§3.1): recorded as an observation, then resolved.
create function api.admin_player_attribute_correct(
  p_player_id uuid,
  p_attribute text,
  p_value text,
  p_source_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.admin_assert_permission('football.correct', true);
  v_note text := btrim(p_source_note);
  v_observation_id uuid;
begin
  if v_note is null or char_length(v_note) not between 8 and 500 then
    raise exception using errcode = '22023', message = 'ATTRIBUTE_SOURCE_NOTE_REQUIRED';
  end if;
  if p_attribute not in ('date_of_birth', 'nationality_country_id', 'preferred_foot', 'height_cm', 'detailed_position') then
    raise exception using errcode = '22023', message = 'ATTRIBUTE_INVALID';
  end if;
  v_observation_id := app_private.record_player_attribute_observation(p_player_id, p_attribute,
    case when p_attribute = 'height_cm' then null else p_value end,
    case when p_attribute = 'height_cm' then p_value::numeric end,
    'manual', null, 'admin:' || v_actor, statement_timestamp(), v_actor, v_note);
  perform app_private.resolve_player_attributes(array[p_player_id]);
  perform app_private.write_admin_audit(v_actor, 'football.player_attribute_correct', 'football',
    p_player_id, v_note, gen_random_uuid(), gen_random_uuid(), null, null,
    pg_catalog.jsonb_build_object('attribute', p_attribute, 'observationId', v_observation_id));
  return pg_catalog.jsonb_build_object('observationId', v_observation_id);
end;
$$;

-- Photos (§3.3): the release is recorded; approval runs the checks.
create function api.admin_player_photo_submit(p_player_id uuid, p_intake_path text, p_release jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.admin_assert_permission('football.correct', false);
  v_release_id uuid;
begin
  if p_release is null or jsonb_typeof(p_release) <> 'object' then
    raise exception using errcode = '22023', message = 'PHOTO_RELEASE_INVALID';
  end if;
  v_release_id := app_private.submit_player_photo_release(p_player_id, p_intake_path,
    p_release ->> 'documentPath', (p_release ->> 'capturedOn')::date, (p_release ->> 'signedOn')::date,
    p_release ->> 'signerRole', p_release ->> 'scope', p_release ->> 'licenceCode',
    p_release ->> 'credit', p_release ->> 'copyrightOwner', (p_release ->> 'expiresOn')::date, v_actor);
  perform app_private.write_admin_audit(v_actor, 'football.player_photo_submit', 'football',
    v_release_id, 'Player photo release recorded for review.', gen_random_uuid(), gen_random_uuid(),
    null, null, pg_catalog.jsonb_build_object('playerId', p_player_id, 'scope', p_release ->> 'scope'));
  return pg_catalog.jsonb_build_object('releaseId', v_release_id, 'status', 'pending');
end;
$$;

create function api.admin_player_photo_approve(p_release_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.admin_assert_permission('football.correct', true);
begin
  perform app_private.approve_player_photo_release(p_release_id, v_actor);
  perform app_private.write_admin_audit(v_actor, 'football.player_photo_approve', 'football',
    p_release_id, 'Player photo release approved.', gen_random_uuid(), gen_random_uuid());
  return pg_catalog.jsonb_build_object('releaseId', p_release_id, 'status', 'approved');
end;
$$;

create function api.admin_player_photo_reject(p_release_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.admin_assert_permission('football.correct', false);
begin
  perform app_private.reject_player_photo_release(p_release_id, p_reason, v_actor);
  perform app_private.write_admin_audit(v_actor, 'football.player_photo_reject', 'football',
    p_release_id, btrim(p_reason), gen_random_uuid(), gen_random_uuid());
  return pg_catalog.jsonb_build_object('releaseId', p_release_id, 'status', 'rejected');
end;
$$;

create function api.admin_player_photo_revoke(p_release_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app_private.admin_assert_permission('football.correct', true);
begin
  perform app_private.revoke_player_photo_release(p_release_id, p_reason, v_actor);
  perform app_private.write_admin_audit(v_actor, 'football.player_photo_revoke', 'football',
    p_release_id, btrim(p_reason), gen_random_uuid(), gen_random_uuid());
  return pg_catalog.jsonb_build_object('releaseId', p_release_id, 'status', 'revoked');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (the review list for this migration)
-- ---------------------------------------------------------------------------
revoke all on function app_private.pepites_staff_preview_allowed() from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_access() from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_activate_season_final(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_current_version() from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_resolve_version(text) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_version_pointer(timestamptz) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_team_json(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_player_card(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_edition_json(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_admin_audit(uuid, text, uuid, text, jsonb) from public, anon, authenticated, service_role;

-- Public reads: visitors and signed-in readers.
revoke all on function api.pepites_version() from public, anon, authenticated, service_role;
revoke all on function api.pepites_home(text) from public, anon, authenticated, service_role;
revoke all on function api.pepites_ranking(text, text, integer, uuid, text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function api.pepites_player(text, uuid) from public, anon, authenticated, service_role;
revoke all on function api.pepites_player_matches(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function api.pepites_edition(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function api.pepites_methodology() from public, anon, authenticated, service_role;
grant execute on function api.pepites_version() to anon, authenticated;
grant execute on function api.pepites_home(text) to anon, authenticated;
grant execute on function api.pepites_ranking(text, text, integer, uuid, text, integer, integer) to anon, authenticated;
grant execute on function api.pepites_player(text, uuid) to anon, authenticated;
grant execute on function api.pepites_player_matches(uuid, integer) to anon, authenticated;
grant execute on function api.pepites_edition(uuid, integer) to anon, authenticated;
grant execute on function api.pepites_methodology() to anon, authenticated;

-- Signed-in only.
revoke all on function api.report_pepites_data_issue(text, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function api.report_pepites_data_issue(text, uuid, text, text) to authenticated;

-- Staff: authenticated, with the permission check inside.
revoke all on function api.admin_pepites_overview() from public, anon, authenticated, service_role;
revoke all on function api.admin_pepites_edition_get(uuid) from public, anon, authenticated, service_role;
revoke all on function api.admin_pepites_edition_update(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function api.admin_pepites_edition_schedule(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function api.admin_pepites_edition_unschedule(uuid) from public, anon, authenticated, service_role;
revoke all on function api.admin_pepites_edition_publish_now(uuid) from public, anon, authenticated, service_role;
revoke all on function api.admin_pepites_edition_correct(uuid) from public, anon, authenticated, service_role;
revoke all on function api.admin_pepites_edition_withdraw(uuid, text) from public, anon, authenticated, service_role;
revoke all on function api.admin_pepites_email_report(uuid) from public, anon, authenticated, service_role;
revoke all on function api.admin_data_desk_list(jsonb) from public, anon, authenticated, service_role;
revoke all on function api.admin_data_desk_close(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function api.admin_player_attribute_correct(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function api.admin_player_photo_submit(uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function api.admin_player_photo_approve(uuid) from public, anon, authenticated, service_role;
revoke all on function api.admin_player_photo_reject(uuid, text) from public, anon, authenticated, service_role;
revoke all on function api.admin_player_photo_revoke(uuid, text) from public, anon, authenticated, service_role;
grant execute on function api.admin_pepites_overview() to authenticated;
grant execute on function api.admin_pepites_edition_get(uuid) to authenticated;
grant execute on function api.admin_pepites_edition_update(uuid, jsonb) to authenticated;
grant execute on function api.admin_pepites_edition_schedule(uuid, timestamptz) to authenticated;
grant execute on function api.admin_pepites_edition_unschedule(uuid) to authenticated;
grant execute on function api.admin_pepites_edition_publish_now(uuid) to authenticated;
grant execute on function api.admin_pepites_edition_correct(uuid) to authenticated;
grant execute on function api.admin_pepites_edition_withdraw(uuid, text) to authenticated;
grant execute on function api.admin_pepites_email_report(uuid) to authenticated;
grant execute on function api.admin_data_desk_list(jsonb) to authenticated;
grant execute on function api.admin_data_desk_close(uuid, text, text) to authenticated;
grant execute on function api.admin_player_attribute_correct(uuid, text, text, text) to authenticated;
grant execute on function api.admin_player_photo_submit(uuid, text, jsonb) to authenticated;
grant execute on function api.admin_player_photo_approve(uuid) to authenticated;
grant execute on function api.admin_player_photo_reject(uuid, text) to authenticated;
grant execute on function api.admin_player_photo_revoke(uuid, text) to authenticated;
