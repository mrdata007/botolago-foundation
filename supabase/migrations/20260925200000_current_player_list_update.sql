-- This season's player list, corrected from what SportsMonks shows today.
--
-- The 2026/27 list was carried over from 2025/26 on 17 September
-- (docs/backend/FANTASY_2026_27_BRIDGE_ACTIVATION.md, step 3): summer transfers
-- are not in it, and the promoted clubs' squads were typed in by hand without
-- SportsMonks ids. The squad import that would have corrected it refuses once
-- the Fantasy catalog is staged (fantasy_catalog_already_staged), by design:
-- "later transfers need a separately reconciled live catalog update". This is
-- that update. Owner decision, 2026-09-25.
--
-- Three steps, each its own call:
--   1. api.service_record_current_player_list stores one observation: every
--      club's current squad and the lineups of chosen fixtures, as read from
--      SportsMonks. It changes nothing else.
--   2. api.service_plan_current_player_list says, without writing, what that
--      observation would change, and a digest of exactly those changes.
--   3. api.service_apply_current_player_list makes the changes, only while the
--      Fantasy tick is paused, and only when the plan still has the reviewed
--      digest. It then plans again and refuses unless nothing is left to do.
-- Recording and applying both hold every scheduled (pg_cron) job off until
-- they finish, and refuse while one is mid-run (scheduled_job_running), so
-- they never write alongside one.
--
-- Only positive evidence changes anything. A player is placed at the club of
-- their latest lineup, else at the one club whose squad lists them; a player
-- SportsMonks does not show is left where they are. Nobody is removed from the
-- game. Fantasy teams keep every player they hold, and no price changes.
-- A player who moves keeps no record at their old club this season (the
-- statistics import checks a club by its dates); one with this season's
-- statistics for another club is left for a person to date the move.
create table app_private.current_player_list_observations (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references app.seasons(id) on delete restrict,
  provider_name text not null check (provider_name = 'sportsmonks'),
  observed_at timestamptz not null,
  observation_digest text not null check (observation_digest ~ '^[0-9a-f]{64}$'),
  observations jsonb not null,
  created_at timestamptz not null default statement_timestamp()
);
alter table app_private.current_player_list_observations enable row level security;
alter table app_private.current_player_list_observations force row level security;
revoke all on table app_private.current_player_list_observations from public, anon, authenticated, service_role;

create table app_private.current_player_list_updates (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null unique
    references app_private.current_player_list_observations(id) on delete restrict,
  plan_digest text not null check (plan_digest ~ '^[0-9a-f]{64}$'),
  plan jsonb not null,
  result jsonb not null,
  applied_at timestamptz not null default statement_timestamp()
);
alter table app_private.current_player_list_updates enable row level security;
alter table app_private.current_player_list_updates force row level security;
revoke all on table app_private.current_player_list_updates from public, anon, authenticated, service_role;

-- Lower case, no accents, words separated by one space. The two-argument
-- unaccent names its dictionary, because with an empty search_path the
-- one-argument form cannot find it.
create function app_private.person_name_key(p_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, normalize(coalesce(p_name, ''), nfkc))),
    '[^a-z0-9]+', ' ', 'g')), '')
$$;

create function app_private.current_player_list_member_ok(p_member jsonb, p_lineup boolean)
returns boolean
language sql
stable
set search_path = ''
as $$
  select jsonb_typeof(p_member) = 'object'
    and coalesce(p_member ->> 'externalPlayerId', '') ~ '^[1-9][0-9]{0,19}$'
    and (not p_lineup or coalesce(p_member ->> 'teamExternalId', '') ~ '^[1-9][0-9]{0,19}$')
    and jsonb_typeof(p_member -> 'fullName') = 'string'
    and p_member ->> 'fullName' = btrim(p_member ->> 'fullName')
    and char_length(p_member ->> 'fullName') between 2 and 200
    and jsonb_typeof(p_member -> 'displayName') = 'string'
    and p_member ->> 'displayName' = btrim(p_member ->> 'displayName')
    and char_length(p_member ->> 'displayName') between 2 and 120
    and case jsonb_typeof(p_member -> 'firstName')
      when 'string' then p_member ->> 'firstName' = btrim(p_member ->> 'firstName')
        and char_length(p_member ->> 'firstName') between 1 and 100
      when 'null' then true else p_member -> 'firstName' is null end
    and case jsonb_typeof(p_member -> 'lastName')
      when 'string' then p_member ->> 'lastName' = btrim(p_member ->> 'lastName')
        and char_length(p_member ->> 'lastName') between 1 and 100
      when 'null' then true else p_member -> 'lastName' is null end
    and case jsonb_typeof(p_member -> 'dateOfBirth')
      when 'string' then case when p_member ->> 'dateOfBirth' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then (p_member ->> 'dateOfBirth')::date between date '1900-01-01' and current_date
        else false end
      when 'null' then true else p_member -> 'dateOfBirth' is null end
    and case jsonb_typeof(p_member -> 'position')
      when 'string' then p_member ->> 'position' in ('goalkeeper', 'defender', 'midfielder', 'forward')
      when 'null' then true else p_member -> 'position' is null end
    and case jsonb_typeof(p_member -> 'shirtNumber')
      when 'number' then p_member ->> 'shirtNumber' ~ '^[1-9][0-9]?$'
      when 'null' then true else p_member -> 'shirtNumber' is null end
$$;

-- Holds every scheduled (pg_cron) job off until this transaction ends, and
-- refuses while one is mid-run (AGENTS.md, one writer at a time). pg_cron
-- records each run in cron.job_run_details before running its command, so
-- holding that table is the lock every scheduled writer shares: a job due
-- meanwhile starts once this transaction has finished. A run left unfinished
-- by a crash is marked failed when pg_cron restarts.
create function app_private.hold_scheduled_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('lock_timeout', '5s', true);
  begin
    lock table cron.job_run_details in exclusive mode;
  exception when lock_not_available then
    raise exception using errcode = 'PT409', message = 'scheduled_job_running';
  end;
  if exists (select 1 from cron.job_run_details run where run.status not in ('succeeded', 'failed')) then
    raise exception using errcode = 'PT409', message = 'scheduled_job_running';
  end if;
end;
$$;

-- Checks an observation's shape and scope, and returns its season. Every club
-- of this season's fixtures appears exactly once; a lineup names only players
-- of its fixture's two clubs.
create function app_private.current_player_list_season(p_observations jsonb)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_season app.seasons%rowtype;
  target_fixture app.fixtures%rowtype;
  club jsonb;
  lineup jsonb;
  season_club_count integer;
begin
  if p_observations is null or jsonb_typeof(p_observations) <> 'object'
    or octet_length(p_observations::text) > 4194304
    or p_observations ->> 'providerName' is distinct from 'sportsmonks'
    or p_observations ->> 'seasonExternalId' is distinct from '28647'
    or coalesce(p_observations ->> 'observedAt', '')
      !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'
    or jsonb_typeof(p_observations -> 'clubs') is distinct from 'array'
    or jsonb_typeof(p_observations -> 'lineups') is distinct from 'array'
    or jsonb_array_length(p_observations -> 'lineups') > 60
  then
    raise exception using errcode = 'PT400', message = 'invalid_player_list_observations';
  end if;
  select season.* into target_season
  from app.seasons season
  join app_private.football_provider_mappings mapping
    on mapping.internal_entity_id = season.id and mapping.provider_name = 'sportsmonks'
    and mapping.entity_type = 'season' and mapping.external_id = '28647' and mapping.active
  where season.is_current;
  if target_season.id is null or target_season.label <> '2026/2027' then
    raise exception using errcode = 'PT409', message = 'current_season_required';
  end if;

  select count(distinct participant.team_id) into season_club_count
  from app.fixtures fixture
  cross join lateral (values (fixture.home_team_id), (fixture.away_team_id)) participant(team_id)
  where fixture.season_id = target_season.id;
  if season_club_count = 0
    or jsonb_array_length(p_observations -> 'clubs') <> season_club_count
    or (select count(distinct value ->> 'teamExternalId')
        from jsonb_array_elements(p_observations -> 'clubs')) <> season_club_count
  then
    raise exception using errcode = 'PT409', message = 'player_list_club_scope_mismatch';
  end if;
  for club in select value from jsonb_array_elements(p_observations -> 'clubs')
  loop
    if jsonb_typeof(club) <> 'object'
      or coalesce(club ->> 'teamExternalId', '') !~ '^[1-9][0-9]{0,19}$'
      or coalesce(club ->> 'source', '') not in ('season-squad', 'current-team-roster')
      or jsonb_typeof(club -> 'players') is distinct from 'array'
      or jsonb_array_length(club -> 'players') > 100
      or exists (select 1 from jsonb_array_elements(club -> 'players') member
        where not app_private.current_player_list_member_ok(member, false))
      or (select count(distinct member ->> 'externalPlayerId')
          from jsonb_array_elements(club -> 'players') member) <> jsonb_array_length(club -> 'players')
    then
      raise exception using errcode = 'PT400', message = 'invalid_player_list_observations';
    end if;
    if not exists (
      select 1
      from app_private.football_provider_mappings mapping
      join app.fixtures fixture on fixture.season_id = target_season.id
        and mapping.internal_entity_id in (fixture.home_team_id, fixture.away_team_id)
      where mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'team'
        and mapping.external_id = club ->> 'teamExternalId' and mapping.active
    ) then
      raise exception using errcode = 'PT409', message = 'player_list_club_scope_mismatch';
    end if;
  end loop;

  if (select count(distinct value ->> 'fixtureExternalId') from jsonb_array_elements(p_observations -> 'lineups'))
    <> jsonb_array_length(p_observations -> 'lineups')
  then
    raise exception using errcode = 'PT400', message = 'invalid_player_list_observations';
  end if;
  for lineup in select value from jsonb_array_elements(p_observations -> 'lineups')
  loop
    if jsonb_typeof(lineup) <> 'object'
      or coalesce(lineup ->> 'fixtureExternalId', '') !~ '^[1-9][0-9]{0,19}$'
      or jsonb_typeof(lineup -> 'players') is distinct from 'array'
      or jsonb_array_length(lineup -> 'players') > 80
      or exists (select 1 from jsonb_array_elements(lineup -> 'players') member
        where not app_private.current_player_list_member_ok(member, true))
      or (select count(distinct member ->> 'externalPlayerId')
          from jsonb_array_elements(lineup -> 'players') member) <> jsonb_array_length(lineup -> 'players')
    then
      raise exception using errcode = 'PT400', message = 'invalid_player_list_observations';
    end if;
    target_fixture := null;
    select fixture.* into target_fixture
    from app_private.football_provider_mappings mapping
    join app.fixtures fixture on fixture.id = mapping.internal_entity_id
    where mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'fixture'
      and mapping.external_id = lineup ->> 'fixtureExternalId' and mapping.active
      and fixture.season_id = target_season.id;
    if target_fixture.id is null or exists (
      select 1 from jsonb_array_elements(lineup -> 'players') member
      where not exists (
        select 1 from app_private.football_provider_mappings mapping
        where mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'team'
          and mapping.external_id = member ->> 'teamExternalId' and mapping.active
          and mapping.internal_entity_id in (target_fixture.home_team_id, target_fixture.away_team_id))
    ) then
      raise exception using errcode = 'PT409', message = 'player_list_fixture_scope_mismatch';
    end if;
  end loop;
  return target_season.id;
end;
$$;

create function api.service_record_current_player_list(p_observations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_season_id uuid;
  observed timestamptz;
  new_id uuid;
  digest text;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  target_season_id := app_private.current_player_list_season(p_observations);
  observed := (p_observations ->> 'observedAt')::timestamptz;
  if observed < statement_timestamp() - interval '30 minutes'
    or observed > statement_timestamp() + interval '1 minute'
  then
    raise exception using errcode = 'PT400', message = 'player_list_observation_not_fresh';
  end if;
  -- No scheduled job runs alongside this write; while one is mid-run the
  -- caller waits and tries again.
  perform app_private.hold_scheduled_jobs();
  digest := encode(extensions.digest(p_observations::text, 'sha256'), 'hex');
  insert into app_private.current_player_list_observations (
    season_id, provider_name, observed_at, observation_digest, observations
  ) values (target_season_id, 'sportsmonks', observed, digest, p_observations)
  returning id into new_id;
  return jsonb_build_object(
    'observationId', new_id,
    'observationDigest', digest,
    'observedAt', observed,
    'clubs', jsonb_array_length(p_observations -> 'clubs'),
    'squadPlayers', (select count(*) from jsonb_array_elements(p_observations -> 'clubs') club
      cross join lateral jsonb_array_elements(club -> 'players')),
    'lineupFixtures', jsonb_array_length(p_observations -> 'lineups'),
    'lineupPlayers', (select count(*) from jsonb_array_elements(p_observations -> 'lineups') lineup
      cross join lateral jsonb_array_elements(lineup -> 'players'))
  );
end;
$$;

-- What an observation would change, without writing. The digest covers the
-- changes only, so the same observation planned twice against an unchanged
-- list gives the same digest.
create function app_private.current_player_list_plan(p_observation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  observation app_private.current_player_list_observations%rowtype;
  target_season app.seasons%rowtype;
  target_fantasy app.fantasy_seasons%rowtype;
  club_limit integer;
  plan jsonb;
begin
  select * into observation
  from app_private.current_player_list_observations stored
  where stored.id = p_observation_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'player_list_observation_not_found';
  end if;
  select * into target_season from app.seasons season where season.id = observation.season_id;
  if not target_season.is_current then
    raise exception using errcode = 'PT409', message = 'current_season_required';
  end if;
  select * into target_fantasy
  from app.fantasy_seasons fantasy_season
  where fantasy_season.football_season_id = target_season.id;
  if not found then
    raise exception using errcode = 'PT409', message = 'fantasy_season_required';
  end if;
  select ruleset.max_players_per_club into club_limit
  from app.fantasy_rulesets ruleset
  where ruleset.id = target_fantasy.ruleset_id;

  with team_map as (
    select mapping.external_id, mapping.internal_entity_id as team_id
    from app_private.football_provider_mappings mapping
    where mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'team' and mapping.active
  ), squad_evidence as (
    select member ->> 'externalPlayerId' as external_player_id, team_map.team_id, member
    from jsonb_array_elements(observation.observations -> 'clubs') club
    join team_map on team_map.external_id = club ->> 'teamExternalId'
    cross join lateral jsonb_array_elements(club -> 'players') member
  ), lineup_evidence as (
    select member ->> 'externalPlayerId' as external_player_id, team_map.team_id,
      fixture.kickoff_at, fixture.id as fixture_id, member
    from jsonb_array_elements(observation.observations -> 'lineups') lineup
    join app_private.football_provider_mappings fixture_mapping
      on fixture_mapping.provider_name = 'sportsmonks' and fixture_mapping.entity_type = 'fixture'
      and fixture_mapping.external_id = lineup ->> 'fixtureExternalId' and fixture_mapping.active
    join app.fixtures fixture on fixture.id = fixture_mapping.internal_entity_id
    cross join lateral jsonb_array_elements(lineup -> 'players') member
    join team_map on team_map.external_id = member ->> 'teamExternalId'
  ), latest_lineup as (
    -- A lineup is the strongest evidence: the player was there. The latest wins.
    select distinct on (evidence.external_player_id)
      evidence.external_player_id, evidence.team_id, evidence.member
    from lineup_evidence evidence
    order by evidence.external_player_id, evidence.kickoff_at desc, evidence.fixture_id
  ), squad_clubs as (
    select evidence.external_player_id, array_agg(distinct evidence.team_id) as team_ids
    from squad_evidence evidence
    group by evidence.external_player_id
  ), observed as (
    select coalesce(lineup.external_player_id, squad.external_player_id) as external_player_id,
      case when lineup.team_id is not null then lineup.team_id
        when cardinality(squad.team_ids) = 1 then squad.team_ids[1] end as club_id,
      case when lineup.team_id is not null then 'lineup'
        when cardinality(squad.team_ids) = 1 then 'squad' end as basis,
      coalesce(squad.team_ids, '{}'::uuid[]) as squad_team_ids,
      lineup.member as lineup_member
    from latest_lineup lineup
    full join squad_clubs squad on squad.external_player_id = lineup.external_player_id
  ), detailed as (
    -- The squad's record is the richer one (names, date of birth).
    select observed.*,
      coalesce(
        (select evidence.member from squad_evidence evidence
          where evidence.external_player_id = observed.external_player_id
            and evidence.team_id = observed.club_id),
        observed.lineup_member,
        (select evidence.member from squad_evidence evidence
          where evidence.external_player_id = observed.external_player_id
          order by evidence.team_id limit 1)
      ) as detail
    from observed
  ), mapped as (
    select detailed.*,
      coalesce(detailed.detail ->> 'position', detailed.lineup_member ->> 'position') as observed_position,
      mapping.internal_entity_id as mapped_player_id,
      mapping.active as mapping_active
    from detailed
    left join app_private.football_provider_mappings mapping
      on mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'player'
      and mapping.external_id = detailed.external_player_id
  ), unlinked as (
    -- Players typed in by hand: listed this season, never linked to SportsMonks.
    select membership.player_id, membership.team_id,
      app_private.person_name_key(player.full_name) as name_key
    from app.team_memberships membership
    join app.players player on player.id = membership.player_id
    where membership.season_id = target_season.id and membership.active
      and not exists (
        select 1 from app_private.football_provider_mappings mapping
        where mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'player'
          and mapping.internal_entity_id = membership.player_id)
  ), observed_keys as (
    -- Full names only (two words at least), at the same club: a display name
    -- or a surname alone never identifies a person, since a match can retire
    -- a record.
    select distinct mapped.external_player_id, mapped.club_id, name.key
    from mapped
    left join app.players player on player.id = mapped.mapped_player_id
    cross join lateral (values
      (app_private.person_name_key(mapped.detail ->> 'fullName')),
      (app_private.person_name_key(player.full_name))
    ) name(key)
    where mapped.club_id is not null and name.key like '% %'
  ), name_matches as (
    select distinct observed_keys.external_player_id, unlinked.player_id
    from observed_keys
    join unlinked on unlinked.team_id = observed_keys.club_id and unlinked.name_key = observed_keys.key
  ), unique_matches as (
    select match.external_player_id, match.player_id
    from name_matches match
    where (select count(*) from name_matches other
        where other.external_player_id = match.external_player_id) = 1
      and (select count(*) from name_matches other where other.player_id = match.player_id) = 1
  ), decisions as (
    select mapped.*,
      unique_match.player_id as matched_player_id,
      case
        when mapped.club_id is null then 'skip_ambiguous_club'
        when mapped.mapped_player_id is not null and not mapped.mapping_active then 'skip_inactive_mapping'
        -- Statistics this season for another club mean a move during the
        -- season, not a summer transfer: left for a person to date.
        when mapped.mapped_player_id is not null and exists (
          select 1 from app.player_fixture_performances performance
          where performance.player_id = mapped.mapped_player_id
            and performance.football_season_id = target_season.id
            and performance.active and performance.team_id <> mapped.club_id
        ) then 'skip_played_for_another_club'
        when mapped.mapped_player_id is not null then 'mapped'
        when unique_match.player_id is not null then 'link'
        when exists (select 1 from name_matches match
          where match.external_player_id = mapped.external_player_id) then 'skip_ambiguous_name'
        when mapped.observed_position is null then 'skip_no_position'
        else 'add'
      end as kind
    from mapped
    left join unique_matches unique_match on unique_match.external_player_id = mapped.external_player_id
  ), resolved as (
    select decisions.*,
      case decisions.kind when 'mapped' then decisions.mapped_player_id
        when 'link' then decisions.matched_player_id end as player_id,
      -- A linked player who also sits at the club under a hand-typed record.
      case when decisions.kind = 'mapped' then decisions.matched_player_id end as duplicate_player_id
    from decisions
  ), current_clubs as (
    select membership.player_id, array_agg(membership.team_id order by membership.team_id) as team_ids
    from app.team_memberships membership
    where membership.season_id = target_season.id and membership.active
    group by membership.player_id
  ), pool as (
    select fantasy_player.*
    from app.fantasy_players fantasy_player
    where fantasy_player.fantasy_season_id = target_fantasy.id
  ), staged as (
    select resolved.*,
      current_clubs.team_ids as current_team_ids,
      case
        when resolved.kind not in ('mapped', 'link', 'add') then null
        when current_clubs.team_ids is null then 'join'
        when resolved.club_id = any(current_clubs.team_ids) then 'keep'
        else 'move'
      end as membership,
      pool.id as fantasy_player_id,
      pool.football_team_id as fantasy_team_id,
      case
        when resolved.kind not in ('mapped', 'link', 'add') then null
        when pool.id is null then 'add'
        when pool.football_team_id <> resolved.club_id then 'move'
        else 'keep'
      end as fantasy,
      duplicate_entry.id as duplicate_fantasy_player_id,
      -- The same test as scripts/backend/fantasy-deactivate-duplicate-player.sql:
      -- a row anyone has held, traded or scored with is never retired.
      duplicate_entry.id is not null and (
        duplicate_entry.selected_by_count <> 0
        or exists (select 1 from app.fantasy_squad_memberships squad_membership
          where squad_membership.fantasy_player_id = duplicate_entry.id)
        or exists (select 1 from app.fantasy_transfers transfer
          where duplicate_entry.id in (transfer.player_in_id, transfer.player_out_id))
        or exists (select 1 from app.fantasy_free_hit_snapshot_players snapshot_player
          where snapshot_player.fantasy_player_id = duplicate_entry.id)
        or exists (select 1 from app.fantasy_auto_substitutions substitution
          where duplicate_entry.id in (substitution.player_in_id, substitution.player_out_id))
        or exists (select 1 from app.fantasy_player_point_events point_event
          where point_event.fantasy_player_id = duplicate_entry.id)
        or exists (select 1 from app.fantasy_player_gameweek_points gameweek_points
          where gameweek_points.fantasy_player_id = duplicate_entry.id)
      ) as duplicate_used
    from resolved
    left join current_clubs on current_clubs.player_id = resolved.player_id
    left join pool on pool.football_player_id = resolved.player_id
    left join pool duplicate_entry on duplicate_entry.football_player_id = resolved.duplicate_player_id
  ), priced as (
    -- Priced exactly as the opening catalog was
    -- (app_private.fantasy_catalog_candidates): the latest completed season's
    -- rating in this competition, else the neutral 6.0 with no confidence.
    select staged.*,
      coalesce(player.position::text, staged.observed_position) as football_position,
      rating.football_season_id as rating_season_id,
      rating.algorithm_version as rating_algorithm,
      coalesce(rating.rating, 6.0::numeric) as source_rating,
      coalesce(rating.confidence, 0.0::numeric) as source_confidence
    from staged
    left join app.players player on player.id = staged.player_id
    left join lateral (
      select player_rating.football_season_id, player_rating.algorithm_version,
        player_rating.rating, player_rating.confidence
      from app.player_season_ratings player_rating
      join app.seasons rating_season on rating_season.id = player_rating.football_season_id
      where player_rating.player_id = staged.player_id
        and player_rating.active
        and rating_season.competition_id = target_season.competition_id
        and rating_season.ends_on < target_season.starts_on
        and rating_season.status = 'completed'
      order by rating_season.ends_on desc, player_rating.calculated_at desc, player_rating.id desc
      limit 1
    ) rating on staged.fantasy = 'add' and staged.player_id is not null
  ), outcome as (
    select priced.*,
      case priced.football_position when 'goalkeeper' then 'GK' when 'defender' then 'DEF'
        when 'midfielder' then 'MID' when 'forward' then 'FWD' end as position_code,
      priced.duplicate_player_id is not null and not priced.duplicate_used as retire_duplicate,
      priced.kind in ('mapped', 'link', 'add') and (
        priced.kind in ('link', 'add')
        or priced.membership in ('move', 'join')
        or priced.fantasy in ('move', 'add')
        or (priced.duplicate_player_id is not null and not priced.duplicate_used)
      ) as changes_something
    from priced
  ), fantasy_clubs_after as (
    select pool.id as fantasy_player_id,
      coalesce((select outcome.club_id from outcome
        where outcome.fantasy_player_id = pool.id and outcome.fantasy = 'move'), pool.football_team_id) as team_id
    from pool
  ), violations as (
    select squad_membership.fantasy_team_id, fantasy_clubs_after.team_id, count(*) as players
    from app.fantasy_squad_memberships squad_membership
    join fantasy_clubs_after on fantasy_clubs_after.fantasy_player_id = squad_membership.fantasy_player_id
    where squad_membership.sold_at is null
    group by squad_membership.fantasy_team_id, fantasy_clubs_after.team_id
    having count(*) > club_limit
  ), changes as (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'externalPlayerId', outcome.external_player_id,
      'basis', outcome.basis,
      'clubId', outcome.club_id,
      'club', club.short_name,
      'player', outcome.kind,
      'playerId', outcome.player_id,
      'name', outcome.detail ->> 'fullName',
      'listedName', listed.full_name,
      'membership', outcome.membership,
      'fromClubIds', case when outcome.membership = 'move' then to_jsonb(outcome.current_team_ids) end,
      'fromClubs', case when outcome.membership = 'move' then (
        select jsonb_agg(team.short_name order by team.id) from app.teams team
        where team.id = any(outcome.current_team_ids)) end,
      'shirtNumber', case when outcome.membership in ('move', 'join') then outcome.detail -> 'shirtNumber' end,
      'fantasy', outcome.fantasy,
      'fantasyPlayerId', outcome.fantasy_player_id,
      'fromFantasyClubId', case when outcome.fantasy = 'move' then outcome.fantasy_team_id end,
      'fantasyPosition', case when outcome.fantasy = 'add' then outcome.position_code end,
      'fantasyPrice', case when outcome.fantasy = 'add' then round(app_private.fantasy_initial_price_v1(
        outcome.position_code, outcome.source_rating, outcome.source_confidence), 1) end,
      'ratingSeasonId', case when outcome.fantasy = 'add' then outcome.rating_season_id end,
      'ratingAlgorithm', case when outcome.fantasy = 'add' then outcome.rating_algorithm end,
      'rating', case when outcome.fantasy = 'add' then outcome.source_rating end,
      'confidence', case when outcome.fantasy = 'add' then outcome.source_confidence end,
      'duplicatePlayerId', case when outcome.retire_duplicate then outcome.duplicate_player_id end,
      'duplicateFantasyPlayerId', case when outcome.retire_duplicate then outcome.duplicate_fantasy_player_id end,
      'displayName', case when outcome.kind = 'add' then outcome.detail ->> 'displayName' end,
      'firstName', case when outcome.kind = 'add' then outcome.detail ->> 'firstName' end,
      'lastName', case when outcome.kind = 'add' then outcome.detail ->> 'lastName' end,
      'dateOfBirth', case when outcome.kind = 'add' then outcome.detail ->> 'dateOfBirth' end,
      'position', case when outcome.kind = 'add' then outcome.observed_position end
    )) order by length(outcome.external_player_id), outcome.external_player_id), '[]'::jsonb) as items
    from outcome
    left join app.teams club on club.id = outcome.club_id
    left join app.players listed on listed.id = outcome.player_id
    where outcome.changes_something
  )
  select jsonb_build_object(
    'planVersion', 1,
    'observationId', observation.id,
    'observationDigest', observation.observation_digest,
    'observedAt', observation.observed_at,
    'seasonId', target_season.id,
    'fantasySeasonId', target_fantasy.id,
    'digest', encode(extensions.digest(changes.items::text, 'sha256'), 'hex'),
    'summary', (
      select jsonb_build_object(
        'observedPlayers', count(*),
        'changes', count(*) filter (where outcome.changes_something),
        'unchanged', count(*) filter (where outcome.kind in ('mapped', 'link', 'add') and not outcome.changes_something),
        'fromLineups', count(*) filter (where outcome.basis = 'lineup'),
        'link', count(*) filter (where outcome.kind = 'link'),
        'add', count(*) filter (where outcome.kind = 'add'),
        'move', count(*) filter (where outcome.membership = 'move'),
        'join', count(*) filter (where outcome.membership = 'join' and outcome.kind <> 'add'),
        'fantasyMove', count(*) filter (where outcome.fantasy = 'move'),
        'fantasyAdd', count(*) filter (where outcome.fantasy = 'add'),
        'retireDuplicate', count(*) filter (where outcome.retire_duplicate),
        'usedDuplicate', count(*) filter (where outcome.duplicate_player_id is not null and outcome.duplicate_used),
        'skipAmbiguousClub', count(*) filter (where outcome.kind = 'skip_ambiguous_club'),
        'skipAmbiguousName', count(*) filter (where outcome.kind = 'skip_ambiguous_name'),
        'skipNoPosition', count(*) filter (where outcome.kind = 'skip_no_position'),
        'skipInactiveMapping', count(*) filter (where outcome.kind = 'skip_inactive_mapping'),
        'skipPlayedForAnotherClub', count(*) filter (where outcome.kind = 'skip_played_for_another_club'),
        'clubLimitViolations', (select count(*) from violations)
      ) from outcome),
    'changes', changes.items,
    'skipped', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'externalPlayerId', outcome.external_player_id,
        'name', outcome.detail ->> 'fullName',
        'reason', outcome.kind,
        'squadClubs', (select coalesce(jsonb_agg(team.short_name order by team.short_name), '[]'::jsonb)
          from app.teams team where team.id = any(outcome.squad_team_ids))
      ) order by length(outcome.external_player_id), outcome.external_player_id), '[]'::jsonb)
      from outcome where outcome.kind like 'skip%'),
    'usedDuplicates', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'externalPlayerId', outcome.external_player_id,
        'playerId', outcome.player_id,
        'duplicatePlayerId', outcome.duplicate_player_id,
        'duplicateFantasyPlayerId', outcome.duplicate_fantasy_player_id,
        'name', outcome.detail ->> 'fullName'
      ) order by length(outcome.external_player_id), outcome.external_player_id), '[]'::jsonb)
      from outcome where outcome.duplicate_player_id is not null and outcome.duplicate_used),
    'clubLimitViolations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'fantasyTeamId', violations.fantasy_team_id, 'clubId', violations.team_id,
        'players', violations.players) order by violations.fantasy_team_id, violations.team_id), '[]'::jsonb)
      from violations),
    'report', jsonb_build_object(
      'squadsByClub', (
        select coalesce(jsonb_object_agg(team.short_name, jsonb_build_object(
          'source', club ->> 'source', 'players', jsonb_array_length(club -> 'players'))), '{}'::jsonb)
        from jsonb_array_elements(observation.observations -> 'clubs') club
        join team_map on team_map.external_id = club ->> 'teamExternalId'
        join app.teams team on team.id = team_map.team_id),
      -- Listed at a club this season, linked to SportsMonks, but shown nowhere
      -- today: left as they are.
      'unobservedByClub', (
        select coalesce(jsonb_object_agg(counted.short_name, counted.players), '{}'::jsonb)
        from (
          select team.short_name, count(*) as players
          from app.team_memberships membership
          join app.teams team on team.id = membership.team_id
          where membership.season_id = target_season.id and membership.active
            and exists (select 1 from app_private.football_provider_mappings mapping
              where mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'player'
                and mapping.internal_entity_id = membership.player_id)
            and not exists (select 1 from outcome where outcome.mapped_player_id = membership.player_id)
          group by team.short_name
        ) counted),
      -- Typed in by hand and still matched to nobody: left as they are.
      'handTypedUnmatched', (
        select coalesce(jsonb_agg(jsonb_build_object('club', team.short_name, 'name', player.full_name)
          order by team.short_name, player.full_name), '[]'::jsonb)
        from unlinked
        join app.players player on player.id = unlinked.player_id
        join app.teams team on team.id = unlinked.team_id
        where not exists (select 1 from outcome
          where outcome.player_id = unlinked.player_id
            or (outcome.retire_duplicate and outcome.duplicate_player_id = unlinked.player_id)))
    )
  ) into plan
  from changes;
  return plan;
end;
$$;

create function api.service_plan_current_player_list(p_observation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  return app_private.current_player_list_plan(p_observation_id);
end;
$$;

create function api.service_apply_current_player_list(
  p_observation_id uuid,
  p_expected_plan_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  observation app_private.current_player_list_observations%rowtype;
  target_season app.seasons%rowtype;
  target_fantasy app.fantasy_seasons%rowtype;
  plan jsonb;
  after_plan jsonb;
  change jsonb;
  target_player_id uuid;
  target_club_id uuid;
  new_fantasy_player_id uuid;
  shirt integer;
  source_version text;
  touched integer;
  removed_memberships jsonb := '[]'::jsonb;
  result jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_observation_id is null or coalesce(p_expected_plan_digest, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'PT400', message = 'invalid_player_list_apply_input';
  end if;
  select * into observation
  from app_private.current_player_list_observations stored
  where stored.id = p_observation_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'player_list_observation_not_found';
  end if;
  if observation.observed_at < statement_timestamp() - interval '24 hours' then
    raise exception using errcode = 'PT409', message = 'player_list_observation_stale';
  end if;
  select * into target_season from app.seasons season where season.id = observation.season_id;
  select * into target_fantasy
  from app.fantasy_seasons fantasy_season
  where fantasy_season.football_season_id = target_season.id;
  -- This writes the Fantasy catalog, so the tick that moves gameweeks along
  -- must be paused first (AGENTS.md, one writer at a time).
  if exists (select 1 from app_private.fantasy_automation_settings settings
    where settings.lifecycle_tick_enabled) then
    raise exception using errcode = 'PT409', message = 'fantasy_tick_must_be_paused';
  end if;
  if exists (select 1 from app.fantasy_gameweeks gameweek
    where gameweek.fantasy_season_id = target_fantasy.id and gameweek.status = 'finalizing') then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_finalizing';
  end if;
  -- No scheduled job runs alongside this write, and nothing else writes the
  -- players' clubs or the Fantasy catalog until it ends.
  perform app_private.hold_scheduled_jobs();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:catalog:' || target_season.id::text, 0));
  -- Transfers and new teams take this lock shared before checking the club
  -- limit, so none is checked against a club this update is changing.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:squads:' || target_fantasy.id::text, 0));
  lock table app.team_memberships, app.fantasy_players, app.fantasy_squad_memberships
    in share row exclusive mode;
  if exists (select 1 from app_private.current_player_list_updates applied
    where applied.observation_id = p_observation_id) then
    raise exception using errcode = 'PT409', message = 'player_list_observation_already_applied';
  end if;

  plan := app_private.current_player_list_plan(p_observation_id);
  if plan ->> 'digest' is distinct from p_expected_plan_digest then
    raise exception using errcode = 'PT409', message = 'player_list_plan_changed';
  end if;
  if (plan #>> '{summary,clubLimitViolations}')::integer <> 0 then
    raise exception using errcode = 'PT409', message = 'fantasy_club_limit_exceeded';
  end if;
  source_version := 'sportsmonks-player-list:' || p_observation_id::text;

  -- 1. Hand-typed duplicates nobody has used leave the list and the game. Their
  --    club records for this season are removed and kept in the result.
  for change in select value from jsonb_array_elements(plan -> 'changes') where value ? 'duplicatePlayerId'
  loop
    with removed as (
      delete from app.team_memberships membership
      where membership.player_id = (change ->> 'duplicatePlayerId')::uuid
        and membership.season_id = target_season.id
      returning to_jsonb(membership) as row_data
    )
    select removed_memberships || coalesce(jsonb_agg(removed.row_data), '[]'::jsonb)
    into removed_memberships
    from removed;
    if change ? 'duplicateFantasyPlayerId' then
      update app.fantasy_players fantasy_player set active = false, eligible = false
      where fantasy_player.id = (change ->> 'duplicateFantasyPlayerId')::uuid
        and fantasy_player.fantasy_season_id = target_fantasy.id
        and fantasy_player.selected_by_count = 0;
      get diagnostics touched = row_count;
      if touched <> 1 then
        raise exception using errcode = 'PT409', message = 'player_list_duplicate_changed';
      end if;
    end if;
  end loop;

  -- 2. A player who moved or joins keeps no other club this season. The
  --    statistics import checks a club by its dates, not by active, so the
  --    other records are removed rather than deactivated; this season's moves
  --    are summer transfers (one during the season is skipped by the plan).
  --    The removed rows are kept in the result.
  for change in select value from jsonb_array_elements(plan -> 'changes')
    where value ->> 'membership' in ('move', 'join') and value ? 'playerId'
  loop
    with removed as (
      delete from app.team_memberships membership
      where membership.player_id = (change ->> 'playerId')::uuid
        and membership.season_id = target_season.id
        and membership.team_id <> (change ->> 'clubId')::uuid
      returning to_jsonb(membership) as row_data
    )
    select removed_memberships || coalesce(jsonb_agg(removed.row_data), '[]'::jsonb)
    into removed_memberships
    from removed;
  end loop;

  -- 3. Hand-typed players get their SportsMonks id; new players are created
  --    with theirs, as the squad import creates them.
  for change in select value from jsonb_array_elements(plan -> 'changes')
    where value ->> 'player' in ('link', 'add')
  loop
    if change ->> 'player' = 'add' then
      target_player_id := gen_random_uuid();
      insert into app.players (
        id, slug, full_name, display_name, first_name, last_name,
        date_of_birth, position, preferred_foot, active
      ) values (
        target_player_id,
        app_private.football_catalog_slug('player', change ->> 'displayName', target_player_id),
        change ->> 'name', change ->> 'displayName', change ->> 'firstName', change ->> 'lastName',
        (change ->> 'dateOfBirth')::date, (change ->> 'position')::app.football_position, 'unknown', true
      );
    else
      target_player_id := (change ->> 'playerId')::uuid;
    end if;
    perform api.resolve_football_mapping('sportsmonks', 'player', change ->> 'externalPlayerId',
      target_player_id, source_version, observation.observed_at);
  end loop;

  -- 4. Their club this season. A shirt number already worn at the club is
  --    left blank rather than taken.
  for change in select value from jsonb_array_elements(plan -> 'changes')
    where value ->> 'membership' in ('move', 'join')
  loop
    select mapping.internal_entity_id into target_player_id
    from app_private.football_provider_mappings mapping
    where mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'player'
      and mapping.external_id = change ->> 'externalPlayerId' and mapping.active;
    target_club_id := (change ->> 'clubId')::uuid;
    shirt := (change ->> 'shirtNumber')::integer;
    if shirt is not null and exists (
      select 1 from app.team_memberships membership
      where membership.team_id = target_club_id and membership.season_id = target_season.id
        and membership.active and membership.shirt_number = shirt
        and membership.player_id <> target_player_id
    ) then
      shirt := null;
    end if;
    update app.team_memberships membership
    set active = true, shirt_number = shirt, squad_role = 'player', valid_to = target_season.ends_on
    where membership.player_id = target_player_id and membership.team_id = target_club_id
      and membership.season_id = target_season.id and membership.valid_from = target_season.starts_on;
    if not found then
      insert into app.team_memberships (
        player_id, team_id, season_id, shirt_number, squad_role, valid_from, valid_to, active
      ) values (
        target_player_id, target_club_id, target_season.id, shirt, 'player',
        target_season.starts_on, target_season.ends_on, true
      );
    end if;
  end loop;

  -- 5. Fantasy follows the club. Squads keep the player; the price stays.
  for change in select value from jsonb_array_elements(plan -> 'changes') where value ->> 'fantasy' = 'move'
  loop
    update app.fantasy_players fantasy_player set football_team_id = (change ->> 'clubId')::uuid
    where fantasy_player.id = (change ->> 'fantasyPlayerId')::uuid
      and fantasy_player.fantasy_season_id = target_fantasy.id;
    get diagnostics touched = row_count;
    if touched <> 1 then
      raise exception using errcode = 'PT409', message = 'player_list_fantasy_player_changed';
    end if;
  end loop;

  -- 6. New Fantasy players, priced and recorded as the opening catalog was.
  for change in select value from jsonb_array_elements(plan -> 'changes') where value ->> 'fantasy' = 'add'
  loop
    select mapping.internal_entity_id into target_player_id
    from app_private.football_provider_mappings mapping
    where mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'player'
      and mapping.external_id = change ->> 'externalPlayerId' and mapping.active;
    insert into app.fantasy_players (
      fantasy_season_id, football_player_id, football_team_id, position_id,
      price, status, eligible, active
    ) values (
      target_fantasy.id, target_player_id, (change ->> 'clubId')::uuid,
      (select fantasy_position.id from app.fantasy_positions fantasy_position
        where fantasy_position.code = change ->> 'fantasyPosition'),
      (change ->> 'fantasyPrice')::numeric, 'available', true, true
    ) returning id into new_fantasy_player_id;
    insert into app_private.fantasy_initial_price_evidence (
      fantasy_player_id, algorithm_code, source_rating_season_id,
      source_rating_algorithm, source_rating, source_confidence, calculated_price
    ) values (
      new_fantasy_player_id, 'botolago-initial-price-v1.0', (change ->> 'ratingSeasonId')::uuid,
      change ->> 'ratingAlgorithm', (change ->> 'rating')::numeric,
      (change ->> 'confidence')::numeric, (change ->> 'fantasyPrice')::numeric
    );
    insert into app.fantasy_player_price_history (
      fantasy_player_id, gameweek_id, old_price, new_price, reason,
      effective_at, source_version, movement
    ) values (
      new_fantasy_player_id, null, null, (change ->> 'fantasyPrice')::numeric,
      'player_list_addition_v1', statement_timestamp(), 1, 0
    );
  end loop;

  -- 7. The same observation must now plan nothing, and no squad may be over
  --    the club limit with the clubs as they now stand.
  after_plan := app_private.current_player_list_plan(p_observation_id);
  if (after_plan #>> '{summary,changes}')::integer <> 0 then
    raise exception using errcode = 'PT409', message = 'player_list_apply_incomplete';
  end if;
  if (after_plan #>> '{summary,clubLimitViolations}')::integer <> 0 then
    raise exception using errcode = 'PT409', message = 'fantasy_club_limit_exceeded';
  end if;

  result := jsonb_build_object(
    'observationId', p_observation_id,
    'planDigest', plan ->> 'digest',
    'changes', (plan #>> '{summary,changes}')::integer,
    'linked', (plan #>> '{summary,link}')::integer,
    'added', (plan #>> '{summary,add}')::integer,
    'moved', (plan #>> '{summary,move}')::integer,
    'joined', (plan #>> '{summary,join}')::integer,
    'fantasyMoved', (plan #>> '{summary,fantasyMove}')::integer,
    'fantasyAdded', (plan #>> '{summary,fantasyAdd}')::integer,
    'duplicatesRetired', (plan #>> '{summary,retireDuplicate}')::integer,
    'removedMemberships', removed_memberships
  );
  insert into app_private.current_player_list_updates (observation_id, plan_digest, plan, result)
  values (p_observation_id, plan ->> 'digest', plan, result);
  return result;
end;
$$;

-- Transfers and new teams wait for a player list update, and it for them:
-- each takes the squads lock shared before it checks the club limit (the
-- apply takes it exclusively). Otherwise both functions are exactly as
-- 20260803173344 and 20260924200000 left them; their grants are kept.
create or replace function api.confirm_fantasy_transfers(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_transfers jsonb,
  p_expected_version bigint,
  p_idempotency_key uuid,
  p_chip_type app.fantasy_chip_type default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare preview jsonb;
declare request_hash text;
declare existing_hash text;
declare cached_response jsonb;
declare target_batch_id uuid;
declare target_lineup_id uuid;
declare updated_lineup_players integer;
declare resulting_team_value numeric(10,2);
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  -- 20260925200000: transfers are checked against the clubs as they stand
  -- once any player list update has finished, and an update waits for them.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'fantasy:squads:' || team.fantasy_season_id::text, 0));
  if p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  request_hash := encode(extensions.digest(convert_to(
    team.id::text || ':' || p_gameweek_id::text || ':' || p_transfers::text || ':'
      || coalesce(p_chip_type::text, ''), 'UTF8'
  ), 'sha256'), 'hex');
  select idempotency.request_hash, idempotency.response_body
  into existing_hash, cached_response
  from app_private.fantasy_idempotency_keys idempotency
  where idempotency.user_id = current_user_id
    and idempotency.operation = 'confirm_transfers'
    and idempotency.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> request_hash then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return cached_response;
  end if;

  select * into team from app.fantasy_teams
  where id = p_team_id and user_id = current_user_id for update;
  preview := api.preview_fantasy_transfers(
    p_team_id, p_gameweek_id, p_transfers, p_expected_version, p_chip_type
  );
  select lineup.id into target_lineup_id
  from app.fantasy_lineups lineup
  where lineup.fantasy_team_id = team.id and lineup.gameweek_id = p_gameweek_id
    and lineup.locked_at is null and lineup.finalized_at is null
  for update;
  if target_lineup_id is null then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;

  if p_chip_type = 'free_hit' then
    insert into app.fantasy_free_hit_snapshots (
      chip_use_id, fantasy_team_id, gameweek_id, bank, team_value,
      free_transfers, team_version
    ) select chip.id, team.id, p_gameweek_id, team.bank, team.team_value,
      team.free_transfers, team.version
    from app.fantasy_chip_uses chip
    where chip.fantasy_team_id = team.id and chip.gameweek_id = p_gameweek_id
      and chip.chip_type = 'free_hit' and chip.cancelled_at is null
    on conflict (chip_use_id) do nothing;
    insert into app.fantasy_free_hit_snapshot_players (
      snapshot_id, fantasy_player_id, purchase_price, sale_price,
      acquired_gameweek_id
    ) select snapshot.id, membership.fantasy_player_id,
      membership.purchase_price, membership.current_sale_price,
      membership.acquired_gameweek_id
    from app.fantasy_free_hit_snapshots snapshot
    join app.fantasy_squad_memberships membership
      on membership.fantasy_team_id = team.id and membership.sold_at is null
    where snapshot.fantasy_team_id = team.id and snapshot.gameweek_id = p_gameweek_id
    on conflict (snapshot_id, fantasy_player_id) do nothing;
  end if;

  insert into app.fantasy_transfer_batches (
    fantasy_team_id, gameweek_id, idempotency_key, base_team_version,
    resulting_team_version, transfers_count, free_transfers_before,
    free_transfers_used, point_hit, bank_before, bank_after, chip_type
  ) values (
    team.id, p_gameweek_id, p_idempotency_key, team.version, team.version + 1,
    (preview->>'transferCount')::integer, team.free_transfers,
    (preview->>'freeTransfersUsed')::integer, (preview->>'pointHit')::integer,
    team.bank, (preview->>'bankAfter')::numeric, p_chip_type
  ) returning id into target_batch_id;

  insert into app.fantasy_transfers (
    transfer_batch_id, sequence_number, player_out_id, player_in_id,
    sale_price, purchase_price
  ) select target_batch_id, item.ordinality::integer,
    (item.value->>'player_out_id')::uuid,
    (item.value->>'player_in_id')::uuid,
    membership.current_sale_price, player_in.price
  from jsonb_array_elements(p_transfers) with ordinality as item(value, ordinality)
  join app.fantasy_squad_memberships membership
    on membership.fantasy_team_id = team.id
    and membership.fantasy_player_id = (item.value->>'player_out_id')::uuid
    and membership.sold_at is null
  join app.fantasy_players player_in
    on player_in.id = (item.value->>'player_in_id')::uuid;

  update app.fantasy_lineup_players lineup_player set
    fantasy_player_id = requested.player_in_id,
    snapshot_price = player_in.price,
    updated_at = statement_timestamp()
  from jsonb_to_recordset(p_transfers)
    as requested(player_out_id uuid, player_in_id uuid)
  join app.fantasy_players player_in on player_in.id = requested.player_in_id
  where lineup_player.lineup_id = target_lineup_id
    and lineup_player.fantasy_player_id = requested.player_out_id;
  get diagnostics updated_lineup_players = row_count;
  if updated_lineup_players <> (preview->>'transferCount')::integer then
    raise exception using errcode = 'PT400', message = 'invalid_squad';
  end if;

  update app.fantasy_squad_memberships membership set
    sold_gameweek_id = p_gameweek_id, sold_at = statement_timestamp()
  where membership.fantasy_team_id = team.id and membership.sold_at is null
    and membership.fantasy_player_id in (
      select item.player_out_id from jsonb_to_recordset(p_transfers)
        as item(player_out_id uuid)
    );
  insert into app.fantasy_squad_memberships (
    fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price,
    acquired_gameweek_id
  ) select team.id, player.id, player.price, player.price, p_gameweek_id
  from jsonb_to_recordset(p_transfers) as item(player_in_id uuid)
  join app.fantasy_players player on player.id = item.player_in_id;

  select sum(player.price) into resulting_team_value
  from app.fantasy_squad_memberships membership
  join app.fantasy_players player on player.id = membership.fantasy_player_id
  where membership.fantasy_team_id = team.id and membership.sold_at is null;
  update app.fantasy_teams set
    bank = (preview->>'bankAfter')::numeric,
    team_value = resulting_team_value,
    free_transfers = case when p_chip_type in ('wildcard','free_hit') then free_transfers
      else greatest(free_transfers - (preview->>'freeTransfersUsed')::integer, 0) end,
    version = version + 1
  where id = team.id returning version into team.version;
  update app.fantasy_lineups set team_version = team.version,
    updated_at = statement_timestamp() where id = target_lineup_id;

  cached_response := jsonb_build_object(
    'transferBatchId', target_batch_id, 'preview', preview,
    'team', app_private.fantasy_team_dto(team.id)
  );
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (
    current_user_id, 'confirm_transfers', p_idempotency_key, request_hash,
    cached_response, statement_timestamp() + interval '30 days'
  );
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version,
    resulting_version, idempotency_key, safe_metadata
  ) values (
    current_user_id, team.id, 'confirm_transfers', true, p_expected_version,
    team.version, p_idempotency_key, preview
  );
  return cached_response;
end;
$$;

create or replace function api.create_fantasy_team(
  p_season_id uuid,
  p_gameweek_id uuid,
  p_team_name text,
  p_selection jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare season app.fantasy_seasons%rowtype;
declare gameweek app.fantasy_gameweeks%rowtype;
declare requested app.fantasy_gameweeks%rowtype;
declare rules app.fantasy_rulesets%rowtype;
declare request_hash text;
declare existing_hash text;
declare cached_response jsonb;
declare target_team_id uuid;
declare target_lineup_id uuid;
declare squad_cost numeric(10,2);
begin
  if current_user_id is null then raise exception using errcode = 'PT401', message = 'fantasy_team_not_found'; end if;
  if p_idempotency_key is null or p_team_name is null
    or p_team_name <> btrim(p_team_name) or char_length(p_team_name) not between 3 and 40
    or p_team_name !~ '^[[:alnum:]][[:alnum:] _''.-]{1,38}[[:alnum:]]$'
  then raise exception using errcode = 'PT400', message = 'invalid_team_name'; end if;
  select * into season from app.fantasy_seasons where id = p_season_id and status in ('registration_open','active');
  if not found then raise exception using errcode = 'PT409', message = 'fantasy_season_closed'; end if;
  select * into requested from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  if requested.fantasy_season_id <> season.id then raise exception using errcode = 'PT400', message = 'invalid_squad'; end if;
  -- A new team joins the gameweek a squad can still enter. The client names
  -- the one it showed the manager; any other gameweek -- past its deadline,
  -- or no longer the next one -- is refused with the long-standing code.
  gameweek := app_private.fantasy_enrolment_gameweek(season.id);
  if gameweek.id is null or gameweek.id <> requested.id then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  select * into rules from app.fantasy_rulesets where id = season.ruleset_id;
  request_hash := app_private.fantasy_selection_hash(p_team_name, p_gameweek_id, p_selection);
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text || ':fantasy:create:' || p_season_id::text, 0));
  -- 20260925200000: a new squad is checked against the clubs as they stand
  -- once any player list update has finished, and an update waits for it.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'fantasy:squads:' || season.id::text, 0));
  select fantasy_idempotency.request_hash, fantasy_idempotency.response_body
  into existing_hash, cached_response
  from app_private.fantasy_idempotency_keys fantasy_idempotency
  where fantasy_idempotency.user_id = current_user_id
    and fantasy_idempotency.operation = 'create_team'
    and fantasy_idempotency.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> request_hash then raise exception using errcode = 'PT409', message = 'idempotency_conflict'; end if;
    return cached_response;
  end if;
  if exists (select 1 from app.fantasy_teams where user_id = current_user_id and fantasy_season_id = season.id) then
    raise exception using errcode = 'PT409', message = 'fantasy_team_already_exists';
  end if;
  perform app_private.fantasy_validate_selection(season.id, season.ruleset_id, p_selection);
  select sum(player.price) into squad_cost
  from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  join app.fantasy_players player on player.id = item.fantasy_player_id;
  if squad_cost > rules.initial_budget then raise exception using errcode = 'PT400', message = 'budget_exceeded'; end if;
  insert into app.fantasy_teams (
    user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
  ) values (
    current_user_id, season.id, gameweek.id, p_team_name,
    rules.initial_budget - squad_cost, squad_cost, rules.initial_free_transfers
  ) returning id into target_team_id;
  insert into app.fantasy_squad_memberships (
    fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id
  ) select target_team_id, player.id, player.price, player.price, gameweek.id
  from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  join app.fantasy_players player on player.id = item.fantasy_player_id;
  insert into app.fantasy_lineups (fantasy_team_id, gameweek_id, team_version)
  values (target_team_id, gameweek.id, 1) returning id into target_lineup_id;
  insert into app.fantasy_lineup_players (
    lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, multiplier, snapshot_price
  ) select target_lineup_id, item.fantasy_player_id, item.slot, item.slot_order,
    item.captain, item.vice_captain,
    case when item.captain then rules.captain_multiplier else 1 end, player.price
  from jsonb_to_recordset(p_selection) as item(
    fantasy_player_id uuid, slot app.fantasy_lineup_slot, slot_order integer,
    captain boolean, vice_captain boolean
  ) join app.fantasy_players player on player.id = item.fantasy_player_id;
  cached_response := app_private.fantasy_team_dto(target_team_id);
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (current_user_id, 'create_team', p_idempotency_key, request_hash, cached_response, statement_timestamp() + interval '7 days');
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, resulting_version, idempotency_key,
    safe_metadata
  ) values (current_user_id, target_team_id, 'create_team', true, 1, p_idempotency_key,
    jsonb_build_object('seasonId', season.id, 'gameweekId', gameweek.id));
  return cached_response;
end;
$$;

revoke all on function app_private.hold_scheduled_jobs() from public, anon, authenticated, service_role;
revoke all on function app_private.person_name_key(text) from public, anon, authenticated, service_role;
revoke all on function app_private.current_player_list_member_ok(jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke all on function app_private.current_player_list_season(jsonb) from public, anon, authenticated, service_role;
revoke all on function app_private.current_player_list_plan(uuid) from public, anon, authenticated, service_role;
revoke all on function api.service_record_current_player_list(jsonb) from public, anon, authenticated, service_role;
revoke all on function api.service_plan_current_player_list(uuid) from public, anon, authenticated, service_role;
revoke all on function api.service_apply_current_player_list(uuid, text) from public, anon, authenticated, service_role;
grant execute on function api.service_record_current_player_list(jsonb) to service_role;
grant execute on function api.service_plan_current_player_list(uuid) to service_role;
grant execute on function api.service_apply_current_player_list(uuid, text) to service_role;
notify pgrst, 'reload schema';
