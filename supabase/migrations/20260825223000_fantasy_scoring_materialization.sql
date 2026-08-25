-- BotolaGO Fantasy launch scoring materialization.
--
-- This migration deliberately installs no cron or scheduler. A trusted worker
-- submits one complete, canonical fixture snapshot at a time. Replacements are
-- atomic and correction-safe; finalization remains bounded and service-only.

create table app_private.fantasy_fixture_scoring_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references app.fixtures(id) on delete restrict,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  calculation_version bigint not null,
  football_input_version bigint not null,
  source_digest text not null,
  player_count integer not null,
  starter_count integer not null,
  team_count integer not null,
  finalized_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint fantasy_fixture_scoring_snapshots_input_key unique (
    fixture_id, gameweek_id, calculation_version, football_input_version
  ),
  constraint fantasy_fixture_scoring_snapshots_version_check check (
    calculation_version > 0 and football_input_version >= 0
  ),
  constraint fantasy_fixture_scoring_snapshots_digest_check check (
    source_digest ~ '^[0-9a-f]{64}$'
  ),
  constraint fantasy_fixture_scoring_snapshots_coverage_check check (
    player_count between 22 and 100 and starter_count = 22 and team_count = 2
  ),
  constraint fantasy_fixture_scoring_snapshots_lifecycle_check check (
    superseded_at is null or superseded_at >= created_at
  )
);
create unique index fantasy_fixture_scoring_snapshots_current_idx
  on app_private.fantasy_fixture_scoring_snapshots (fixture_id, gameweek_id)
  where superseded_at is null;
create index fantasy_fixture_scoring_snapshots_gameweek_idx
  on app_private.fantasy_fixture_scoring_snapshots (
    gameweek_id, calculation_version, fixture_id
  ) where superseded_at is null;
create index fantasy_fixture_scoring_snapshots_gameweek_fk_idx
  on app_private.fantasy_fixture_scoring_snapshots (gameweek_id, fixture_id);

create table app_private.fantasy_fixture_player_snapshots (
  scoring_snapshot_id uuid not null
    references app_private.fantasy_fixture_scoring_snapshots(id) on delete restrict,
  fantasy_player_id uuid not null references app.fantasy_players(id) on delete restrict,
  football_team_id uuid not null references app.teams(id) on delete restrict,
  started boolean not null,
  did_play boolean not null,
  minutes_played integer not null,
  events jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint fantasy_fixture_player_snapshots_pkey primary key (
    scoring_snapshot_id, fantasy_player_id
  ),
  constraint fantasy_fixture_player_snapshots_minutes_check check (
    minutes_played between 0 and 180 and (did_play or minutes_played = 0)
  ),
  constraint fantasy_fixture_player_snapshots_events_check check (
    case when jsonb_typeof(events) = 'array' then
      jsonb_array_length(events) <= 32 and pg_column_size(events) <= 32768
    else false end
  )
);
create index fantasy_fixture_player_snapshots_player_idx
  on app_private.fantasy_fixture_player_snapshots (fantasy_player_id, scoring_snapshot_id);
create index fantasy_fixture_player_snapshots_team_idx
  on app_private.fantasy_fixture_player_snapshots (football_team_id, scoring_snapshot_id);

alter table app.fantasy_player_point_events
  add column scoring_snapshot_id uuid
    references app_private.fantasy_fixture_scoring_snapshots(id) on delete restrict;
create index fantasy_player_point_events_snapshot_idx
  on app.fantasy_player_point_events (scoring_snapshot_id, fantasy_player_id)
  where scoring_snapshot_id is not null;
create index fantasy_player_gameweek_points_unfinalized_idx
  on app.fantasy_player_gameweek_points (
    gameweek_id, calculation_version, fantasy_player_id
  ) where final_points is null;
create index fantasy_team_gameweek_results_materialization_idx
  on app.fantasy_team_gameweek_results (
    gameweek_id, calculation_version, state, fantasy_team_id
  );

alter table app_private.fantasy_fixture_scoring_snapshots enable row level security;
alter table app_private.fantasy_fixture_scoring_snapshots force row level security;
alter table app_private.fantasy_fixture_player_snapshots enable row level security;
alter table app_private.fantasy_fixture_player_snapshots force row level security;

revoke all on table app_private.fantasy_fixture_scoring_snapshots,
  app_private.fantasy_fixture_player_snapshots
  from public, anon, authenticated, service_role;

create or replace function api.service_replace_fantasy_fixture_points(
  p_gameweek_id uuid,
  p_fixture_id uuid,
  p_football_input_version bigint,
  p_calculation_version bigint,
  p_players jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target_gameweek app.fantasy_gameweeks%rowtype;
declare target_fixture app.fixtures%rowtype;
declare previous_snapshot app_private.fantasy_fixture_scoring_snapshots%rowtype;
declare new_snapshot_id uuid;
declare source_digest text;
declare player_count integer;
declare starter_count integer;
declare team_count integer;
declare invalid_count integer;
declare total_event_count integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_gameweek_id is null or p_fixture_id is null
    or p_football_input_version is null
    or p_calculation_version is null
    or p_football_input_version < 0
    or p_calculation_version <= 0
    or p_calculation_version > 2147483647
    or jsonb_typeof(p_players) is distinct from 'array'
    or pg_column_size(p_players) > 262144 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if jsonb_array_length(p_players) not between 22 and 100
    or exists (
      select 1 from jsonb_array_elements(p_players) item
      where jsonb_typeof(item) <> 'object'
    ) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into target_gameweek
  from app.fantasy_gameweeks gameweek
  where gameweek.id = p_gameweek_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  -- finalizing/finalized are admitted only so the exact current snapshot can
  -- be replayed below. Any mutation after finalization begins remains blocked.
  if target_gameweek.status not in ('locked', 'live', 'provisional', 'finalizing', 'finalized')
    or target_gameweek.scoring_input_version > p_calculation_version then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;

  select fixture.* into target_fixture
  from app.fixtures fixture
  join app.fantasy_fixture_assignments assignment
    on assignment.fixture_id = fixture.id
   and assignment.gameweek_id = target_gameweek.id
   and assignment.fantasy_season_id = target_gameweek.fantasy_season_id
   and assignment.counts_points
   and assignment.superseded_at is null
  where fixture.id = p_fixture_id;
  if not found then
    raise exception using errcode = 'PT400', message = 'fantasy_fixture_not_assigned';
  end if;
  if target_fixture.status <> 'finished' or target_fixture.finalized_at is null then
    raise exception using errcode = 'PT409', message = 'football_fixture_not_final';
  end if;

  with parsed as (
    select *
    from jsonb_to_recordset(p_players) as player(
      fantasy_player_id uuid,
      football_team_id uuid,
      started boolean,
      did_play boolean,
      minutes_played integer,
      events jsonb
    )
  )
  select count(*)::integer,
    count(*) filter (where started)::integer,
    count(distinct football_team_id)::integer,
    count(*) filter (where
      fantasy_player_id is null or football_team_id is null
      or started is null or did_play is null or minutes_played is null
      or minutes_played not between 0 and 180
      or (not did_play and minutes_played <> 0)
      or jsonb_typeof(events) is distinct from 'array'
      or case when jsonb_typeof(events) = 'array'
        then jsonb_array_length(events) > 32 or pg_column_size(events) > 32768
        else false end
    )::integer
  into player_count, starter_count, team_count, invalid_count
  from parsed;

  if player_count not between 22 and 100 or starter_count <> 22
    or team_count <> 2 or invalid_count <> 0 then
    raise exception using errcode = 'PT400', message = 'invalid_fantasy_scoring_snapshot';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_players) as player(fantasy_player_id uuid)
    group by player.fantasy_player_id having count(*) <> 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_players) as player(
      football_team_id uuid, started boolean
    )
    where player.started
    group by player.football_team_id having count(*) <> 11
  ) then
    raise exception using errcode = 'PT400', message = 'invalid_fantasy_scoring_snapshot';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_players) as snapshot_player(
      fantasy_player_id uuid, football_team_id uuid
    )
    left join app.fantasy_players fantasy_player
      on fantasy_player.id = snapshot_player.fantasy_player_id
     and fantasy_player.fantasy_season_id = target_gameweek.fantasy_season_id
     and fantasy_player.football_team_id = snapshot_player.football_team_id
    where fantasy_player.id is null
      or snapshot_player.football_team_id not in (
        target_fixture.home_team_id, target_fixture.away_team_id
      )
  ) then
    raise exception using errcode = 'PT400', message = 'invalid_fantasy_scoring_snapshot';
  end if;

  with player_rows as (
    select *
    from jsonb_to_recordset(p_players) as player(
      fantasy_player_id uuid, events jsonb
    )
  ), event_rows as (
    select player.fantasy_player_id, event.category, event.points
    from player_rows player
    cross join lateral jsonb_to_recordset(player.events) as event(
      category text, points integer
    )
  )
  select count(*)::integer into total_event_count from event_rows;
  if total_event_count > 1000 or exists (
    select 1
    from jsonb_to_recordset(p_players) as player(events jsonb)
    cross join lateral jsonb_array_elements(player.events) item
    where jsonb_typeof(item) <> 'object'
  ) or exists (
    with player_rows as (
      select *
      from jsonb_to_recordset(p_players) as player(
        fantasy_player_id uuid, events jsonb
      )
    ), event_rows as (
      select player.fantasy_player_id, event.category, event.points
      from player_rows player
      cross join lateral jsonb_to_recordset(player.events) as event(
        category text, points integer
      )
    )
    select 1 from event_rows event
    group by event.fantasy_player_id, event.category
    having count(*) <> 1 or bool_or(
      event.category is null
      or coalesce(event.category !~ '^[a-z][a-z0-9_]{2,79}$', true)
      or event.points is null or event.points not between -100 and 100
    )
  ) then
    raise exception using errcode = 'PT400', message = 'invalid_fantasy_scoring_snapshot';
  end if;

  source_digest := encode(extensions.digest(convert_to(p_players::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:fixture-points:' || p_fixture_id::text, 0
  ));
  select * into previous_snapshot
  from app_private.fantasy_fixture_scoring_snapshots snapshot
  where snapshot.fixture_id = p_fixture_id
    and snapshot.gameweek_id = p_gameweek_id
    and snapshot.superseded_at is null
  for update;

  if target_gameweek.status in ('finalizing', 'finalized') then
    if found
      and target_gameweek.scoring_input_version = p_calculation_version
      and previous_snapshot.calculation_version = p_calculation_version
      and previous_snapshot.football_input_version = p_football_input_version
      and previous_snapshot.source_digest = source_digest then
      return jsonb_build_object(
        'snapshotId', previous_snapshot.id,
        'players', previous_snapshot.player_count,
        'stableResult', true
      );
    end if;
    raise exception using
      errcode = 'PT409',
      message = 'gameweek_not_finalizable';
  end if;

  if found then
    if previous_snapshot.calculation_version > p_calculation_version
      or previous_snapshot.football_input_version > p_football_input_version then
      raise exception using errcode = 'PT409', message = 'stale_update';
    end if;
    if previous_snapshot.calculation_version = p_calculation_version
      and previous_snapshot.football_input_version = p_football_input_version then
      if previous_snapshot.source_digest <> source_digest then
        raise exception using errcode = 'PT409', message = 'input_version_conflict';
      end if;
      return jsonb_build_object(
        'snapshotId', previous_snapshot.id,
        'players', previous_snapshot.player_count,
        'stableResult', true
      );
    end if;
    update app_private.fantasy_fixture_scoring_snapshots
    set superseded_at = statement_timestamp()
    where id = previous_snapshot.id;
  end if;

  insert into app_private.fantasy_fixture_scoring_snapshots (
    fixture_id, gameweek_id, calculation_version, football_input_version,
    source_digest, player_count, starter_count, team_count
  ) values (
    p_fixture_id, p_gameweek_id, p_calculation_version, p_football_input_version,
    source_digest, player_count, starter_count, team_count
  ) returning id into new_snapshot_id;

  insert into app_private.fantasy_fixture_player_snapshots (
    scoring_snapshot_id, fantasy_player_id, football_team_id, started,
    did_play, minutes_played, events
  )
  select new_snapshot_id, player.fantasy_player_id, player.football_team_id,
    player.started, player.did_play, player.minutes_played, player.events
  from jsonb_to_recordset(p_players) as player(
    fantasy_player_id uuid,
    football_team_id uuid,
    started boolean,
    did_play boolean,
    minutes_played integer,
    events jsonb
  );

  update app.fantasy_player_point_events event
  set superseded_at = statement_timestamp()
  where event.fixture_id = p_fixture_id
    and event.gameweek_id = p_gameweek_id
    and event.superseded_at is null;

  insert into app.fantasy_player_point_events (
    fantasy_player_id, gameweek_id, fixture_id, category, points, state,
    scoring_version, source_sequence, source_key, scoring_snapshot_id
  )
  select player.fantasy_player_id, p_gameweek_id, p_fixture_id,
    event.category, event.points, 'provisional', p_calculation_version::integer,
    p_football_input_version,
    p_fixture_id::text || ':' || player.fantasy_player_id::text || ':' || event.category,
    new_snapshot_id
  from jsonb_to_recordset(p_players) as player(
    fantasy_player_id uuid, events jsonb
  )
  cross join lateral jsonb_to_recordset(player.events) as event(
    category text, points integer
  )
  on conflict (fantasy_player_id, fixture_id, source_key, scoring_version)
  do update set
    gameweek_id = excluded.gameweek_id,
    category = excluded.category,
    points = excluded.points,
    state = 'provisional',
    source_sequence = excluded.source_sequence,
    scoring_snapshot_id = excluded.scoring_snapshot_id,
    superseded_at = null;

  with affected as (
    select player.fantasy_player_id
    from app_private.fantasy_fixture_player_snapshots player
    where player.scoring_snapshot_id = new_snapshot_id
    union
    select player.fantasy_player_id
    from app_private.fantasy_fixture_player_snapshots player
    where player.scoring_snapshot_id = previous_snapshot.id
  ), point_totals as (
    select affected.fantasy_player_id,
      coalesce(sum(event.points) filter (
        where event.superseded_at is null and event_snapshot.id is not null
      ), 0)::integer
        as provisional_points
    from affected
    left join app.fantasy_player_point_events event
      on event.fantasy_player_id = affected.fantasy_player_id
     and event.gameweek_id = p_gameweek_id
     and event.superseded_at is null
    left join app_private.fantasy_fixture_scoring_snapshots event_snapshot
      on event_snapshot.id = event.scoring_snapshot_id
     and event_snapshot.gameweek_id = p_gameweek_id
     and event_snapshot.superseded_at is null
    group by affected.fantasy_player_id
  ), participation as (
    select affected.fantasy_player_id,
      coalesce(sum(player.minutes_played), 0)::integer as minutes_played,
      coalesce(bool_or(player.did_play), false) as did_play,
      coalesce(max(snapshot.football_input_version), 0)::bigint as football_input_version
    from affected
    left join app_private.fantasy_fixture_scoring_snapshots snapshot
      on snapshot.gameweek_id = p_gameweek_id
     and snapshot.superseded_at is null
    left join app_private.fantasy_fixture_player_snapshots player
      on player.scoring_snapshot_id = snapshot.id
     and player.fantasy_player_id = affected.fantasy_player_id
    group by affected.fantasy_player_id
  )
  insert into app.fantasy_player_gameweek_points (
    fantasy_player_id, gameweek_id, provisional_points, final_points,
    minutes_played, did_play, calculation_version, football_input_version,
    finalized_at
  )
  select points.fantasy_player_id, p_gameweek_id, points.provisional_points, null,
    participation.minutes_played, participation.did_play,
    p_calculation_version, participation.football_input_version, null
  from point_totals points
  join participation using (fantasy_player_id)
  on conflict (fantasy_player_id, gameweek_id) do update set
    provisional_points = excluded.provisional_points,
    final_points = null,
    minutes_played = excluded.minutes_played,
    did_play = excluded.did_play,
    calculation_version = excluded.calculation_version,
    football_input_version = excluded.football_input_version,
    finalized_at = null;

  update app.fantasy_gameweeks
  set scoring_input_version = greatest(scoring_input_version, p_calculation_version)
  where id = p_gameweek_id;

  return jsonb_build_object(
    'snapshotId', new_snapshot_id,
    'players', player_count,
    'events', total_event_count,
    'stableResult', false
  );
end;
$$;

create or replace function api.service_finalize_fantasy_player_points(
  p_gameweek_id uuid,
  p_calculation_version bigint,
  p_after_player_id uuid default null,
  p_batch_size integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target_gameweek app.fantasy_gameweeks%rowtype;
declare finalized_count integer;
declare last_player_id uuid;
declare maximum_input_version bigint;
declare has_more boolean;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_calculation_version is null or p_calculation_version <= 0
    or p_batch_size is null or p_batch_size not between 1 and 2000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into target_gameweek
  from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if target_gameweek.status = 'finalized' then
    if target_gameweek.scoring_input_version <> p_calculation_version then
      raise exception using errcode = 'PT409', message = 'stale_update';
    end if;
    return jsonb_build_object(
      'finalized', 0, 'afterPlayerId', null, 'hasMore', false, 'stableResult', true
    );
  end if;
  if target_gameweek.status not in ('locked', 'live', 'provisional', 'finalizing')
    or target_gameweek.scoring_input_version <> p_calculation_version
    or not exists (
      select 1 from app.fantasy_fixture_assignments assignment
      where assignment.gameweek_id = p_gameweek_id
        and assignment.counts_points and assignment.superseded_at is null
    )
    or exists (
      select 1
      from app.fantasy_fixture_assignments assignment
      join app.fixtures fixture on fixture.id = assignment.fixture_id
      left join app_private.fantasy_fixture_scoring_snapshots snapshot
        on snapshot.fixture_id = assignment.fixture_id
       and snapshot.gameweek_id = assignment.gameweek_id
       and snapshot.superseded_at is null
      where assignment.gameweek_id = p_gameweek_id
        and assignment.counts_points and assignment.superseded_at is null
        and (
          fixture.status <> 'finished' or fixture.finalized_at is null
          or snapshot.id is null
          or snapshot.calculation_version <> p_calculation_version
        )
  ) then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;

  -- This is the production lifecycle transition. It is reachable only after
  -- every assigned scoring fixture is final and has a complete current
  -- snapshot at the requested calculation version (the guards above).
  update app.fantasy_gameweeks set status = 'provisional', points_state = 'provisional'
  where id = p_gameweek_id and status in ('locked', 'live');

  select max(snapshot.football_input_version)
  into maximum_input_version
  from app_private.fantasy_fixture_scoring_snapshots snapshot
  where snapshot.gameweek_id = p_gameweek_id and snapshot.superseded_at is null;

  with players as (
    select player.id as fantasy_player_id
    from app.fantasy_players player
    where player.fantasy_season_id = target_gameweek.fantasy_season_id
      and player.active
  ), point_totals as (
    select player.fantasy_player_id,
      coalesce(sum(event.points) filter (
        where event.superseded_at is null and event_snapshot.id is not null
      ), 0)::integer
        as provisional_points
    from players player
    left join app.fantasy_player_point_events event
      on event.fantasy_player_id = player.fantasy_player_id
     and event.gameweek_id = p_gameweek_id
     and event.superseded_at is null
    left join app_private.fantasy_fixture_scoring_snapshots event_snapshot
      on event_snapshot.id = event.scoring_snapshot_id
     and event_snapshot.gameweek_id = p_gameweek_id
     and event_snapshot.superseded_at is null
    group by player.fantasy_player_id
  ), participation as (
    select player.fantasy_player_id,
      coalesce(sum(input.minutes_played), 0)::integer as minutes_played,
      coalesce(bool_or(input.did_play), false) as did_play
    from players player
    left join app_private.fantasy_fixture_scoring_snapshots snapshot
      on snapshot.gameweek_id = p_gameweek_id and snapshot.superseded_at is null
    left join app_private.fantasy_fixture_player_snapshots input
      on input.scoring_snapshot_id = snapshot.id
     and input.fantasy_player_id = player.fantasy_player_id
    group by player.fantasy_player_id
  )
  insert into app.fantasy_player_gameweek_points (
    fantasy_player_id, gameweek_id, provisional_points, final_points,
    minutes_played, did_play, calculation_version, football_input_version,
    finalized_at
  )
  select points.fantasy_player_id, p_gameweek_id, points.provisional_points, null,
    participation.minutes_played, participation.did_play,
    p_calculation_version, maximum_input_version, null
  from point_totals points
  join participation using (fantasy_player_id)
  on conflict (fantasy_player_id, gameweek_id) do update set
    provisional_points = excluded.provisional_points,
    final_points = case
      when app.fantasy_player_gameweek_points.calculation_version = p_calculation_version
        then app.fantasy_player_gameweek_points.final_points else null end,
    minutes_played = excluded.minutes_played,
    did_play = excluded.did_play,
    calculation_version = excluded.calculation_version,
    football_input_version = excluded.football_input_version,
    finalized_at = case
      when app.fantasy_player_gameweek_points.calculation_version = p_calculation_version
        then app.fantasy_player_gameweek_points.finalized_at else null end;

  update app.fantasy_gameweeks set status = 'finalizing'
  where id = p_gameweek_id and status = 'provisional';

  with candidates as (
    select points.fantasy_player_id
    from app.fantasy_player_gameweek_points points
    where points.gameweek_id = p_gameweek_id
      and points.calculation_version = p_calculation_version
      and points.final_points is null
      and (p_after_player_id is null or points.fantasy_player_id > p_after_player_id)
    order by points.fantasy_player_id
    limit p_batch_size
  ), finalized as (
    update app.fantasy_player_gameweek_points points set
      final_points = points.provisional_points,
      finalized_at = statement_timestamp()
    from candidates candidate
    where points.fantasy_player_id = candidate.fantasy_player_id
      and points.gameweek_id = p_gameweek_id
    returning points.fantasy_player_id
  )
  select count(*)::integer,
    (array_agg(fantasy_player_id order by fantasy_player_id desc))[1]
  into finalized_count, last_player_id
  from finalized;

  update app.fantasy_player_point_events event set state = 'final'
  where event.gameweek_id = p_gameweek_id and event.superseded_at is null
    and exists (
      select 1
      from app_private.fantasy_fixture_scoring_snapshots snapshot
      where snapshot.id = event.scoring_snapshot_id
        and snapshot.gameweek_id = p_gameweek_id
        and snapshot.superseded_at is null
    )
    and event.fantasy_player_id in (
      select points.fantasy_player_id
      from app.fantasy_player_gameweek_points points
      where points.gameweek_id = p_gameweek_id
        and points.calculation_version = p_calculation_version
        and points.final_points is not null
        and (p_after_player_id is null or points.fantasy_player_id > p_after_player_id)
        and (last_player_id is null or points.fantasy_player_id <= last_player_id)
    );

  select exists (
    select 1 from app.fantasy_player_gameweek_points points
    where points.gameweek_id = p_gameweek_id
      and points.calculation_version = p_calculation_version
      and points.final_points is null
  ) into has_more;
  if not has_more then
    update app_private.fantasy_fixture_scoring_snapshots
    set finalized_at = coalesce(finalized_at, statement_timestamp())
    where gameweek_id = p_gameweek_id and superseded_at is null
      and calculation_version = p_calculation_version;
  end if;

  return jsonb_build_object(
    'finalized', finalized_count,
    'afterPlayerId', last_player_id,
    'hasMore', has_more,
    'stableResult', finalized_count = 0 and not has_more
  );
end;
$$;

create or replace function api.service_materialize_fantasy_team_results(
  p_gameweek_id uuid,
  p_calculation_version bigint,
  p_after_team_id uuid default null,
  p_batch_size integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target_gameweek app.fantasy_gameweeks%rowtype;
declare candidate record;
declare rules app.fantasy_rulesets%rowtype;
declare active_chip app.fantasy_chip_type;
declare starter_ids uuid[];
declare starter_positions text[];
declare starter_played boolean[];
declare bench_ids uuid[];
declare bench_positions text[];
declare bench_played boolean[];
declare bench_used boolean[];
declare effective_ids uuid[];
declare effective_positions text[];
declare substitutions jsonb;
declare position_rule record;
declare position_count integer;
declare replacement_valid boolean;
declare declared_captain_id uuid;
declare declared_vice_id uuid;
declare effective_captain_id uuid;
declare effective_captain_points integer;
declare effective_captain_multiplier numeric;
declare starting_points integer;
declare bench_points integer;
declare captain_points integer;
declare transfer_hit integer;
declare provisional_score integer;
declare lineup_player_count integer;
declare finalized_player_count integer;
declare processed_count integer := 0;
declare affected_count integer;
declare last_team_id uuid;
declare has_more boolean;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_calculation_version is null or p_calculation_version <= 0
    or p_batch_size is null or p_batch_size not between 1 and 1000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into target_gameweek
  from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if target_gameweek.status <> 'finalizing'
    or target_gameweek.scoring_input_version <> p_calculation_version
    or exists (
      select 1
      from app.fantasy_teams team
      left join app.fantasy_lineups lineup
        on lineup.fantasy_team_id = team.id
       and lineup.gameweek_id = p_gameweek_id
      where team.fantasy_season_id = target_gameweek.fantasy_season_id
        and team.status = 'active'
        and lineup.id is null
    ) then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;
  select ruleset.* into rules
  from app.fantasy_seasons season
  join app.fantasy_rulesets ruleset on ruleset.id = season.ruleset_id
  where season.id = target_gameweek.fantasy_season_id;

  for candidate in
    select lineup.id as lineup_id, lineup.fantasy_team_id
    from app.fantasy_lineups lineup
    join app.fantasy_teams team on team.id = lineup.fantasy_team_id
    where lineup.gameweek_id = p_gameweek_id and team.status = 'active'
      and (p_after_team_id is null or lineup.fantasy_team_id > p_after_team_id)
      and not exists (
        select 1
        from app.fantasy_team_gameweek_results result
        where result.fantasy_team_id = lineup.fantasy_team_id
          and result.gameweek_id = p_gameweek_id
          and result.calculation_version = p_calculation_version
      )
    order by lineup.fantasy_team_id
    limit p_batch_size
  loop
    perform 1 from app.fantasy_lineups lineup
    where lineup.id = candidate.lineup_id for update;

    select count(*)::integer,
      count(points.final_points)::integer
    into lineup_player_count, finalized_player_count
    from app.fantasy_lineup_players lineup_player
    left join app.fantasy_player_gameweek_points points
      on points.fantasy_player_id = lineup_player.fantasy_player_id
     and points.gameweek_id = p_gameweek_id
     and points.calculation_version = p_calculation_version
    where lineup_player.lineup_id = candidate.lineup_id;
    if lineup_player_count <> rules.squad_size
      or finalized_player_count <> lineup_player_count
      or (select count(*) from app.fantasy_lineup_players lineup_player
          where lineup_player.lineup_id = candidate.lineup_id
            and lineup_player.slot = 'starter') <> 11
      or (select count(*) from app.fantasy_lineup_players lineup_player
          where lineup_player.lineup_id = candidate.lineup_id
            and lineup_player.slot = 'bench') <> rules.squad_size - 11
      or (select count(*) from app.fantasy_lineup_players lineup_player
          where lineup_player.lineup_id = candidate.lineup_id
            and lineup_player.captain and lineup_player.slot = 'starter') <> 1
      or (select count(*) from app.fantasy_lineup_players lineup_player
          where lineup_player.lineup_id = candidate.lineup_id
            and lineup_player.vice_captain and lineup_player.slot = 'starter') <> 1 then
      raise exception using errcode = 'PT409', message = 'fantasy_lineup_not_scoreable';
    end if;

    select array_agg(lineup_player.fantasy_player_id order by lineup_player.slot_order),
      array_agg(position.code order by lineup_player.slot_order),
      array_agg(points.did_play order by lineup_player.slot_order)
    into starter_ids, starter_positions, starter_played
    from app.fantasy_lineup_players lineup_player
    join app.fantasy_players fantasy_player on fantasy_player.id = lineup_player.fantasy_player_id
    join app.fantasy_positions position on position.id = fantasy_player.position_id
    join app.fantasy_player_gameweek_points points
      on points.fantasy_player_id = lineup_player.fantasy_player_id
     and points.gameweek_id = p_gameweek_id
     and points.calculation_version = p_calculation_version
     and points.final_points is not null
    where lineup_player.lineup_id = candidate.lineup_id
      and lineup_player.slot = 'starter';
    select array_agg(lineup_player.fantasy_player_id order by lineup_player.slot_order),
      array_agg(position.code order by lineup_player.slot_order),
      array_agg(points.did_play order by lineup_player.slot_order)
    into bench_ids, bench_positions, bench_played
    from app.fantasy_lineup_players lineup_player
    join app.fantasy_players fantasy_player on fantasy_player.id = lineup_player.fantasy_player_id
    join app.fantasy_positions position on position.id = fantasy_player.position_id
    join app.fantasy_player_gameweek_points points
      on points.fantasy_player_id = lineup_player.fantasy_player_id
     and points.gameweek_id = p_gameweek_id
     and points.calculation_version = p_calculation_version
     and points.final_points is not null
    where lineup_player.lineup_id = candidate.lineup_id
      and lineup_player.slot = 'bench';

    active_chip := null;
    select chip.chip_type into active_chip
    from app.fantasy_chip_uses chip
    where chip.fantasy_team_id = candidate.fantasy_team_id
      and chip.gameweek_id = p_gameweek_id
      and chip.cancelled_at is null and chip.finalized_at is null;

    effective_ids := starter_ids;
    effective_positions := starter_positions;
    bench_used := array_fill(false, array[cardinality(bench_ids)]);
    substitutions := '[]'::jsonb;
    if active_chip is distinct from 'bench_boost'::app.fantasy_chip_type then
      for i in 1..cardinality(starter_ids) loop
        if starter_played[i] then continue; end if;
        for j in 1..cardinality(bench_ids) loop
          if bench_used[j] or not bench_played[j] then continue; end if;
          if starter_positions[i] = 'GK' or bench_positions[j] = 'GK' then
            replacement_valid := starter_positions[i] = bench_positions[j];
          else
            replacement_valid := true;
            for position_rule in
              select position.code, rule.starting_minimum, rule.starting_maximum
              from app.fantasy_position_rules rule
              join app.fantasy_positions position on position.id = rule.position_id
              where rule.ruleset_id = rules.id
            loop
              position_count := 0;
              for k in 1..cardinality(effective_positions) loop
                if (case when k = i then bench_positions[j]
                      else effective_positions[k] end) = position_rule.code then
                  position_count := position_count + 1;
                end if;
              end loop;
              if position_count not between position_rule.starting_minimum
                  and position_rule.starting_maximum then
                replacement_valid := false;
                exit;
              end if;
            end loop;
          end if;
          if replacement_valid then
            substitutions := substitutions || jsonb_build_array(jsonb_build_object(
              'player_out_id', starter_ids[i],
              'player_in_id', bench_ids[j],
              'reason', case when starter_positions[i] = 'GK'
                then 'goalkeeper_did_not_play' else 'outfield_did_not_play' end
            ));
            effective_ids[i] := bench_ids[j];
            effective_positions[i] := bench_positions[j];
            bench_used[j] := true;
            exit;
          end if;
        end loop;
      end loop;
    end if;

    delete from app.fantasy_auto_substitutions substitution
    where substitution.lineup_id = candidate.lineup_id;
    insert into app.fantasy_auto_substitutions (
      lineup_id, player_out_id, player_in_id, sequence_number, reason,
      calculation_version
    )
    select candidate.lineup_id,
      (item.value ->> 'player_out_id')::uuid,
      (item.value ->> 'player_in_id')::uuid,
      item.ordinality::integer,
      item.value ->> 'reason',
      p_calculation_version
    from jsonb_array_elements(substitutions) with ordinality as item(value, ordinality);

    select lineup_player.fantasy_player_id into declared_captain_id
    from app.fantasy_lineup_players lineup_player
    where lineup_player.lineup_id = candidate.lineup_id and lineup_player.captain;
    select lineup_player.fantasy_player_id into declared_vice_id
    from app.fantasy_lineup_players lineup_player
    where lineup_player.lineup_id = candidate.lineup_id and lineup_player.vice_captain;
    if (select points.did_play from app.fantasy_player_gameweek_points points
        where points.fantasy_player_id = declared_captain_id
          and points.gameweek_id = p_gameweek_id) then
      effective_captain_id := declared_captain_id;
      effective_captain_multiplier := case when active_chip = 'triple_captain'
        then rules.triple_captain_multiplier else rules.captain_multiplier end;
    elsif (select points.did_play from app.fantasy_player_gameweek_points points
           where points.fantasy_player_id = declared_vice_id
             and points.gameweek_id = p_gameweek_id) then
      effective_captain_id := declared_vice_id;
      effective_captain_multiplier := rules.captain_multiplier;
    else
      effective_captain_id := null;
      effective_captain_multiplier := 1;
    end if;

    select coalesce(sum(points.final_points), 0)::integer into starting_points
    from app.fantasy_player_gameweek_points points
    where points.gameweek_id = p_gameweek_id
      and points.fantasy_player_id = any(effective_ids);
    select coalesce(sum(points.final_points), 0)::integer into bench_points
    from app.fantasy_player_gameweek_points points
    where points.gameweek_id = p_gameweek_id
      and points.fantasy_player_id = any(bench_ids);
    if effective_captain_id is null then
      effective_captain_points := 0;
    else
      select points.final_points into effective_captain_points
      from app.fantasy_player_gameweek_points points
      where points.gameweek_id = p_gameweek_id
        and points.fantasy_player_id = effective_captain_id;
    end if;
    captain_points := round(
      effective_captain_points * (effective_captain_multiplier - 1)
    )::integer;
    select coalesce(sum(batch.point_hit), 0)::integer into transfer_hit
    from app.fantasy_transfer_batches batch
    where batch.fantasy_team_id = candidate.fantasy_team_id
      and batch.gameweek_id = p_gameweek_id and batch.status = 'confirmed';
    provisional_score := starting_points
      + case when active_chip = 'bench_boost' then bench_points else 0 end
      + captain_points - transfer_hit;

    insert into app.fantasy_team_gameweek_results (
      fantasy_team_id, gameweek_id, starting_points, bench_points,
      captain_points, transfer_hit, chip_type, provisional_score,
      final_score, state, rank, overall_rank, calculation_version, finalized_at
    ) values (
      candidate.fantasy_team_id, p_gameweek_id, starting_points, bench_points,
      captain_points, transfer_hit, active_chip, provisional_score,
      null, 'provisional', null, null, p_calculation_version, null
    )
    on conflict (fantasy_team_id, gameweek_id) do update set
      starting_points = excluded.starting_points,
      bench_points = excluded.bench_points,
      captain_points = excluded.captain_points,
      transfer_hit = excluded.transfer_hit,
      chip_type = excluded.chip_type,
      provisional_score = excluded.provisional_score,
      final_score = null,
      state = 'provisional',
      rank = null,
      overall_rank = null,
      calculation_version = excluded.calculation_version,
      finalized_at = null
    where app.fantasy_team_gameweek_results.state = 'provisional'
      and app.fantasy_team_gameweek_results.calculation_version <= excluded.calculation_version;
    get diagnostics affected_count = row_count;
    if affected_count <> 1 then
      raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
    end if;
    processed_count := processed_count + 1;
    last_team_id := candidate.fantasy_team_id;
  end loop;

  select exists (
    select 1 from app.fantasy_lineups lineup
    join app.fantasy_teams team on team.id = lineup.fantasy_team_id
    where lineup.gameweek_id = p_gameweek_id and team.status = 'active'
      and not exists (
        select 1
        from app.fantasy_team_gameweek_results result
        where result.fantasy_team_id = lineup.fantasy_team_id
          and result.gameweek_id = p_gameweek_id
          and result.calculation_version = p_calculation_version
      )
  ) into has_more;
  return jsonb_build_object(
    'materialized', processed_count,
    'afterTeamId', last_team_id,
    'hasMore', has_more
  );
end;
$$;

create or replace function api.service_finalize_fantasy_team_results(
  p_gameweek_id uuid,
  p_calculation_version bigint,
  p_after_team_id uuid default null,
  p_batch_size integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target_gameweek app.fantasy_gameweeks%rowtype;
declare candidate_team_ids uuid[];
declare finalized_count integer;
declare last_team_id uuid;
declare has_more boolean;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_calculation_version is null or p_calculation_version <= 0
    or p_batch_size is null or p_batch_size not between 1 and 2000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into target_gameweek
  from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if target_gameweek.status = 'finalized' then
    if target_gameweek.scoring_input_version <> p_calculation_version then
      raise exception using errcode = 'PT409', message = 'stale_update';
    end if;
    return jsonb_build_object(
      'finalized', 0, 'afterTeamId', null, 'hasMore', false, 'stableResult', true
    );
  end if;
  if target_gameweek.status <> 'finalizing'
    or target_gameweek.scoring_input_version <> p_calculation_version
    or exists (
      select 1 from app.fantasy_teams team
      left join app.fantasy_lineups lineup
        on lineup.fantasy_team_id = team.id and lineup.gameweek_id = p_gameweek_id
      left join app.fantasy_team_gameweek_results result
        on result.fantasy_team_id = team.id and result.gameweek_id = p_gameweek_id
       and result.calculation_version = p_calculation_version
      where team.fantasy_season_id = target_gameweek.fantasy_season_id
        and team.status = 'active'
        and (lineup.id is null or result.id is null)
    ) then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;

  select array_agg(result.fantasy_team_id order by result.fantasy_team_id),
    (array_agg(result.fantasy_team_id order by result.fantasy_team_id desc))[1]
  into candidate_team_ids, last_team_id
  from (
    select result.fantasy_team_id
    from app.fantasy_team_gameweek_results result
    join app.fantasy_teams team on team.id = result.fantasy_team_id
    where result.gameweek_id = p_gameweek_id
      and result.calculation_version = p_calculation_version
      and result.state = 'provisional' and team.status = 'active'
      and (p_after_team_id is null or result.fantasy_team_id > p_after_team_id)
    order by result.fantasy_team_id
    limit p_batch_size
  ) result;

  if candidate_team_ids is null then
    select exists (
      select 1
      from app.fantasy_team_gameweek_results result
      join app.fantasy_teams team on team.id = result.fantasy_team_id
      where result.gameweek_id = p_gameweek_id
        and result.calculation_version = p_calculation_version
        and result.state = 'provisional' and team.status = 'active'
    ) into has_more;
    return jsonb_build_object(
      'finalized', 0, 'afterTeamId', null, 'hasMore', has_more,
      'stableResult', not has_more
    );
  end if;
  update app.fantasy_team_gameweek_results result set
    final_score = result.provisional_score,
    state = 'final',
    finalized_at = statement_timestamp()
  where result.gameweek_id = p_gameweek_id
    and result.fantasy_team_id = any(candidate_team_ids)
    and result.calculation_version = p_calculation_version
    and result.state = 'provisional';
  get diagnostics finalized_count = row_count;
  update app.fantasy_lineups lineup set
    locked_at = coalesce(lineup.locked_at, statement_timestamp()),
    finalized_at = coalesce(lineup.finalized_at, statement_timestamp())
  where lineup.gameweek_id = p_gameweek_id
    and lineup.fantasy_team_id = any(candidate_team_ids);
  update app.fantasy_chip_uses chip set finalized_at = statement_timestamp()
  where chip.gameweek_id = p_gameweek_id
    and chip.fantasy_team_id = any(candidate_team_ids)
    and chip.cancelled_at is null and chip.finalized_at is null;
  select exists (
    select 1 from app.fantasy_team_gameweek_results result
    join app.fantasy_teams team on team.id = result.fantasy_team_id
    where result.gameweek_id = p_gameweek_id
      and result.calculation_version = p_calculation_version
      and result.state = 'provisional' and team.status = 'active'
  ) into has_more;
  return jsonb_build_object(
    'finalized', finalized_count,
    'afterTeamId', last_team_id,
    'hasMore', has_more,
    'stableResult', false
  );
end;
$$;

create or replace function api.service_roll_fantasy_free_transfers(
  p_gameweek_id uuid,
  p_batch_size integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare updated_count integer;
declare has_more boolean;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_batch_size is null or p_batch_size not between 1 and 2000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  with candidates as (
    select team.id, rules.max_free_transfer_rollover, rules.initial_free_transfers,
      team.free_transfers as free_transfers_before,
      active_chip.post_gameweek_free_transfers, active_chip.chip_rule_id
    from app.fantasy_teams team
    join app.fantasy_lineups lineup on lineup.fantasy_team_id = team.id
      and lineup.gameweek_id = p_gameweek_id
    join app.fantasy_seasons season on season.id = team.fantasy_season_id
    join app.fantasy_rulesets rules on rules.id = season.ruleset_id
    join app.fantasy_gameweeks gameweek on gameweek.id = p_gameweek_id
      and gameweek.fantasy_season_id = team.fantasy_season_id
    left join lateral (
      select chip_rule.post_gameweek_free_transfers, chip_rule.id as chip_rule_id
      from app.fantasy_chip_uses chip_use
      join app.fantasy_chip_rules chip_rule on chip_rule.id = chip_use.chip_rule_id
      where chip_use.fantasy_team_id = team.id
        and chip_use.gameweek_id = p_gameweek_id
        and chip_use.cancelled_at is null
      limit 1
    ) active_chip on true
    where team.status = 'active'
      and not exists (
        select 1 from app_private.fantasy_free_transfer_rollovers rollover
        where rollover.fantasy_team_id = team.id and rollover.gameweek_id = p_gameweek_id
      )
    order by team.id for update of team skip locked limit p_batch_size
  ), updated as (
    update app.fantasy_teams team set
      free_transfers = coalesce(candidate.post_gameweek_free_transfers,
        least(candidate.max_free_transfer_rollover,
          team.free_transfers + candidate.initial_free_transfers)),
      version = version + 1
    from candidates candidate where team.id = candidate.id
    returning team.id, team.free_transfers
  ), recorded as (
    insert into app_private.fantasy_free_transfer_rollovers (
      fantasy_team_id, gameweek_id, free_transfers_before,
      free_transfers_after, chip_rule_id
    )
    select updated.id, p_gameweek_id, candidate.free_transfers_before,
      updated.free_transfers, candidate.chip_rule_id
    from updated join candidates candidate on candidate.id = updated.id
    on conflict (fantasy_team_id, gameweek_id) do nothing
    returning fantasy_team_id
  )
  select count(*)::integer into updated_count from recorded;
  select exists (
    select 1 from app.fantasy_teams team
    join app.fantasy_lineups lineup on lineup.fantasy_team_id = team.id
      and lineup.gameweek_id = p_gameweek_id
    where team.status = 'active'
      and not exists (
        select 1 from app_private.fantasy_free_transfer_rollovers rollover
        where rollover.fantasy_team_id = team.id and rollover.gameweek_id = p_gameweek_id
      )
  ) into has_more;
  return jsonb_build_object('updated', updated_count, 'hasMore', has_more);
end;
$$;

create or replace function api.service_complete_fantasy_gameweek(
  p_gameweek_id uuid,
  p_calculation_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target app.fantasy_gameweeks%rowtype;
declare expected_active_teams integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_calculation_version is null or p_calculation_version <= 0 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into target
  from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if target.status = 'finalized' then
    if target.scoring_input_version <> p_calculation_version then
      raise exception using errcode = 'PT409', message = 'stale_update';
    end if;
    return jsonb_build_object(
      'finalized', true, 'stableResult', true, 'finalizedAt', target.finalized_at
    );
  end if;
  select count(*)::integer into expected_active_teams
  from app.fantasy_teams team
  where team.fantasy_season_id = target.fantasy_season_id and team.status = 'active';

  if target.status <> 'finalizing'
    or target.scoring_input_version <> p_calculation_version
    or expected_active_teams = 0
    or not exists (
      select 1 from app.fantasy_fixture_assignments assignment
      where assignment.gameweek_id = p_gameweek_id
        and assignment.counts_points and assignment.superseded_at is null
    )
    or exists (
      select 1
      from app.fantasy_fixture_assignments assignment
      join app.fixtures fixture on fixture.id = assignment.fixture_id
      left join app_private.fantasy_fixture_scoring_snapshots snapshot
        on snapshot.fixture_id = assignment.fixture_id
       and snapshot.gameweek_id = p_gameweek_id
       and snapshot.superseded_at is null
      where assignment.gameweek_id = p_gameweek_id
        and assignment.counts_points and assignment.superseded_at is null
        and (
          fixture.status <> 'finished' or fixture.finalized_at is null
          or snapshot.id is null or snapshot.finalized_at is null
          or snapshot.calculation_version <> p_calculation_version
        )
    )
    or exists (
      select 1 from app.fantasy_players player
      left join app.fantasy_player_gameweek_points points
        on points.fantasy_player_id = player.id and points.gameweek_id = p_gameweek_id
      where player.fantasy_season_id = target.fantasy_season_id and player.active
        and (
          points.fantasy_player_id is null or points.final_points is null
          or points.finalized_at is null
          or points.calculation_version <> p_calculation_version
        )
    )
    or exists (
      select 1 from app.fantasy_teams team
      left join app.fantasy_lineups lineup
        on lineup.fantasy_team_id = team.id and lineup.gameweek_id = p_gameweek_id
      left join app.fantasy_team_gameweek_results result
        on result.fantasy_team_id = team.id and result.gameweek_id = p_gameweek_id
      where team.fantasy_season_id = target.fantasy_season_id and team.status = 'active'
        and (
          lineup.id is null or lineup.finalized_at is null
          or result.id is null or result.state <> 'final' or result.final_score is null
          or result.calculation_version <> p_calculation_version
        )
    )
    or exists (
      select 1 from app.fantasy_free_hit_snapshots snapshot
      where snapshot.gameweek_id = p_gameweek_id and snapshot.restored_at is null
    )
    or exists (
      select 1 from app.fantasy_teams team
      where team.fantasy_season_id = target.fantasy_season_id and team.status = 'active'
        and not exists (
          select 1 from app_private.fantasy_free_transfer_rollovers rollover
          where rollover.fantasy_team_id = team.id
            and rollover.gameweek_id = p_gameweek_id
        )
    )
    or (select count(*) from app.fantasy_rankings ranking
        join app.fantasy_teams team on team.id = ranking.fantasy_team_id
        where ranking.fantasy_season_id = target.fantasy_season_id
          and team.fantasy_season_id = target.fantasy_season_id
          and team.status = 'active'
          and ranking.gameweek_id = p_gameweek_id and ranking.league_id is null
          and ranking.calculation_version = p_calculation_version) <> expected_active_teams
    or (select count(*) from app.fantasy_rankings ranking
        join app.fantasy_teams team on team.id = ranking.fantasy_team_id
        where ranking.fantasy_season_id = target.fantasy_season_id
          and team.fantasy_season_id = target.fantasy_season_id
          and team.status = 'active'
          and ranking.gameweek_id is null and ranking.league_id is null
          and ranking.calculation_version = p_calculation_version) <> expected_active_teams
    or exists (
      select 1
      from app.fantasy_leagues league
      where league.fantasy_season_id = target.fantasy_season_id and league.active
        and (
          (select count(*) from app.fantasy_rankings ranking
           join app.fantasy_league_memberships membership
             on membership.league_id = league.id
            and membership.fantasy_team_id = ranking.fantasy_team_id
            and membership.status = 'active'
           join app.fantasy_teams team
             on team.id = ranking.fantasy_team_id and team.status = 'active'
           where ranking.league_id = league.id
             and ranking.gameweek_id = p_gameweek_id
             and ranking.calculation_version = p_calculation_version)
          <> (select count(*) from app.fantasy_league_memberships membership
              join app.fantasy_teams team on team.id = membership.fantasy_team_id
              where membership.league_id = league.id and membership.status = 'active'
                and team.status = 'active')
          or
          (select count(*) from app.fantasy_rankings ranking
           join app.fantasy_league_memberships membership
             on membership.league_id = league.id
            and membership.fantasy_team_id = ranking.fantasy_team_id
            and membership.status = 'active'
           join app.fantasy_teams team
             on team.id = ranking.fantasy_team_id and team.status = 'active'
           where ranking.league_id = league.id
             and ranking.gameweek_id is null
             and ranking.calculation_version = p_calculation_version)
          <> (select count(*) from app.fantasy_league_memberships membership
              join app.fantasy_teams team on team.id = membership.fantasy_team_id
              where membership.league_id = league.id and membership.status = 'active'
                and team.status = 'active')
        )
    ) then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;

  update app.fantasy_gameweeks set
    status = 'finalized',
    points_state = 'final',
    scoring_input_version = p_calculation_version,
    finalized_at = statement_timestamp()
  where id = target.id returning * into target;
  return jsonb_build_object(
    'finalized', true, 'stableResult', false, 'finalizedAt', target.finalized_at
  );
end;
$$;

create or replace function api.service_validate_fantasy_scoring_scope(
  p_gameweek_id uuid,
  p_season_id uuid,
  p_calculation_version bigint,
  p_fixture_ids uuid[],
  p_league_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target app.fantasy_gameweeks%rowtype;
declare assigned_fixture_ids uuid[];
declare active_league_ids uuid[];
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_gameweek_id is null or p_season_id is null
    or p_calculation_version is null or p_calculation_version <= 0
    or p_fixture_ids is null or cardinality(p_fixture_ids) = 0
    or p_league_ids is null
    or exists (select 1 from unnest(p_fixture_ids) item where item is null)
    or exists (select 1 from unnest(p_league_ids) item where item is null) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into target
  from app.fantasy_gameweeks gameweek
  where gameweek.id = p_gameweek_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if target.fantasy_season_id <> p_season_id
    or target.status not in ('locked', 'live', 'provisional', 'finalizing', 'finalized')
    or target.scoring_input_version > p_calculation_version
    or (target.status in ('finalizing', 'finalized')
      and target.scoring_input_version <> p_calculation_version) then
    raise exception using errcode = 'PT409', message = 'fantasy_scoring_scope_mismatch';
  end if;

  select coalesce(array_agg(assignment.fixture_id order by assignment.fixture_id), '{}'::uuid[])
  into assigned_fixture_ids
  from app.fantasy_fixture_assignments assignment
  where assignment.fantasy_season_id = p_season_id
    and assignment.gameweek_id = p_gameweek_id
    and assignment.counts_points
    and assignment.superseded_at is null;
  select coalesce(array_agg(league.id order by league.id), '{}'::uuid[])
  into active_league_ids
  from app.fantasy_leagues league
  where league.fantasy_season_id = p_season_id and league.active;

  if p_fixture_ids is distinct from assigned_fixture_ids
    or p_league_ids is distinct from active_league_ids then
    raise exception using errcode = 'PT409', message = 'fantasy_scoring_scope_mismatch';
  end if;
  return jsonb_build_object(
    'status', target.status,
    'fixtureCount', cardinality(assigned_fixture_ids),
    'leagueCount', cardinality(active_league_ids),
    'stableResult', true
  );
end;
$$;

-- The legacy single-event contract cannot safely represent a complete
-- correction. Keep it for migration compatibility, but remove the worker grant.
revoke execute on function api.service_upsert_fantasy_player_points(
  uuid, uuid, uuid, text, integer, text, bigint, integer, app.fantasy_points_state
) from service_role;

revoke all on function api.service_replace_fantasy_fixture_points(
  uuid, uuid, bigint, bigint, jsonb
) from public, anon, authenticated, service_role;
revoke all on function api.service_finalize_fantasy_player_points(
  uuid, bigint, uuid, integer
) from public, anon, authenticated, service_role;
revoke all on function api.service_materialize_fantasy_team_results(
  uuid, bigint, uuid, integer
) from public, anon, authenticated, service_role;
revoke all on function api.service_finalize_fantasy_team_results(
  uuid, bigint, uuid, integer
) from public, anon, authenticated, service_role;
revoke all on function api.service_roll_fantasy_free_transfers(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function api.service_complete_fantasy_gameweek(uuid, bigint)
  from public, anon, authenticated, service_role;
revoke all on function api.service_validate_fantasy_scoring_scope(
  uuid, uuid, bigint, uuid[], uuid[]
) from public, anon, authenticated, service_role;

grant execute on function api.service_replace_fantasy_fixture_points(
  uuid, uuid, bigint, bigint, jsonb
) to service_role;
grant execute on function api.service_finalize_fantasy_player_points(
  uuid, bigint, uuid, integer
) to service_role;
grant execute on function api.service_materialize_fantasy_team_results(
  uuid, bigint, uuid, integer
) to service_role;
grant execute on function api.service_finalize_fantasy_team_results(
  uuid, bigint, uuid, integer
) to service_role;
grant execute on function api.service_roll_fantasy_free_transfers(uuid, integer)
  to service_role;
grant execute on function api.service_complete_fantasy_gameweek(uuid, bigint)
  to service_role;
grant execute on function api.service_validate_fantasy_scoring_scope(
  uuid, uuid, bigint, uuid[], uuid[]
) to service_role;

comment on function api.service_replace_fantasy_fixture_points(
  uuid, uuid, bigint, bigint, jsonb
) is 'Service-only complete fixture scoring snapshot replacement. No production schedule is installed by this migration.';
