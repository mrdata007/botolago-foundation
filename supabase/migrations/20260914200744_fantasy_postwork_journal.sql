-- Durable proof that the completed calculation's price pass and target-user
-- event enqueue are finished before the next gameweek may open.
create table app_private.fantasy_gameweek_postwork (
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  calculation_version bigint not null check (calculation_version > 0),
  price_source_version bigint not null check (price_source_version > 0),
  price_player_ids uuid[] not null,
  price_after_player_id uuid,
  price_last_request_after uuid,
  price_last_response jsonb,
  prices_completed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  primary key (gameweek_id, calculation_version),
  check (price_last_response is null or jsonb_typeof(price_last_response) = 'object'),
  check (completed_at is null or prices_completed_at is not null)
);
alter table app_private.fantasy_gameweek_postwork enable row level security;
alter table app_private.fantasy_gameweek_postwork force row level security;
revoke all on app_private.fantasy_gameweek_postwork from public, anon, authenticated, service_role;

create function app_private.fantasy_require_finalized_postwork(p_gameweek_id uuid, p_calculation_version bigint)
returns app.fantasy_gameweeks
language plpgsql security definer set search_path = '' as $$
declare gameweek app.fantasy_gameweeks%rowtype;
declare snapshot app_private.fantasy_scoring_snapshots%rowtype;
begin
  if p_gameweek_id is null or p_calculation_version is null or p_calculation_version < 1 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into gameweek from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  if gameweek.status <> 'finalized' or gameweek.points_state <> 'final'
    or gameweek.scoring_input_version <> p_calculation_version then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;
  select * into snapshot from app_private.fantasy_scoring_snapshots
    where gameweek_id = gameweek.id and calculation_version = p_calculation_version for update;
  if not found or snapshot.sealed_at is null or not snapshot.players_persisted then
    raise exception using errcode = 'PT409', message = 'fantasy_scoring_snapshot_not_sealed';
  end if;
  if exists (select 1 from app_private.fantasy_scoring_snapshots newer
    where newer.gameweek_id = gameweek.id and newer.calculation_version > p_calculation_version) then
    raise exception using errcode = 'PT409', message = 'stale_update';
  end if;
  return gameweek;
end;
$$;
revoke all on function app_private.fantasy_require_finalized_postwork(uuid,bigint)
  from public, anon, authenticated, service_role;

create function api.service_run_fantasy_price_batch(
  p_gameweek_id uuid, p_calculation_version bigint,
  p_after_player_id uuid default null, p_batch_size integer default 100
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gameweek app.fantasy_gameweeks%rowtype;
declare journal app_private.fantasy_gameweek_postwork%rowtype;
declare player_ids uuid[];
declare expected_after uuid;
declare expected_more boolean;
declare response jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_batch_size is null or p_batch_size not between 1 and 1000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  gameweek := app_private.fantasy_require_finalized_postwork(p_gameweek_id, p_calculation_version);
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into player_ids
    from app.fantasy_players where fantasy_season_id = gameweek.fantasy_season_id;
  insert into app_private.fantasy_gameweek_postwork (
    gameweek_id, calculation_version, price_source_version, price_player_ids
  ) values (gameweek.id, p_calculation_version, gameweek.sequence_number::bigint + 1, player_ids)
  on conflict (gameweek_id, calculation_version) do nothing;
  select * into journal from app_private.fantasy_gameweek_postwork
    where gameweek_id = gameweek.id and calculation_version = p_calculation_version for update;
  if journal.price_player_ids is distinct from player_ids then
    raise exception using errcode = 'PT409', message = 'fantasy_price_catalog_changed';
  end if;

  -- A restarted worker may begin at null and receive the durable current cursor.
  if p_after_player_id is null and journal.price_last_response is not null then
    return jsonb_build_object('updatedMemberships', 0, 'afterPlayerId', journal.price_after_player_id,
      'hasMore', journal.prices_completed_at is null, 'stableResult', true);
  end if;
  if journal.price_last_response is not null
    and p_after_player_id is not distinct from journal.price_last_request_after then
    return journal.price_last_response || jsonb_build_object('stableResult', true);
  end if;
  if p_after_player_id is distinct from journal.price_after_player_id then
    raise exception using errcode = 'PT409', message = 'fantasy_price_cursor_invalid';
  end if;
  if journal.prices_completed_at is not null then
    return jsonb_build_object('updatedMemberships', 0, 'afterPlayerId', journal.price_after_player_id,
      'hasMore', false, 'stableResult', true);
  end if;

  select (array_agg(id order by id desc))[1] into expected_after from (
    select id from unnest(player_ids) as pool(id)
    where p_after_player_id is null or id > p_after_player_id order by id limit p_batch_size
  ) page;
  expected_more := exists (select 1 from unnest(player_ids) as pool(id) where id > expected_after);
  response := api.service_apply_fantasy_price_changes(
    gameweek.id, journal.price_source_version, p_after_player_id, p_batch_size
  );
  if (response->>'afterPlayerId')::uuid is distinct from expected_after
    or (response->>'hasMore')::boolean is distinct from expected_more then
    raise exception using errcode = 'PT409', message = 'fantasy_price_cursor_invalid';
  end if;
  update app_private.fantasy_gameweek_postwork set
    price_after_player_id = expected_after, price_last_request_after = p_after_player_id,
    price_last_response = response,
    prices_completed_at = case when not expected_more then statement_timestamp() else null end
  where gameweek_id = gameweek.id and calculation_version = p_calculation_version;
  return response || jsonb_build_object('stableResult', false);
end;
$$;
revoke all on function api.service_run_fantasy_price_batch(uuid,bigint,uuid,integer)
  from public, anon, authenticated;
grant execute on function api.service_run_fantasy_price_batch(uuid,bigint,uuid,integer) to service_role;

create function api.service_complete_fantasy_postwork(p_gameweek_id uuid, p_calculation_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gameweek app.fantasy_gameweeks%rowtype;
declare journal app_private.fantasy_gameweek_postwork%rowtype;
declare player_ids uuid[];
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  gameweek := app_private.fantasy_require_finalized_postwork(p_gameweek_id, p_calculation_version);
  select * into journal from app_private.fantasy_gameweek_postwork
    where gameweek_id = gameweek.id and calculation_version = p_calculation_version for update;
  if not found or journal.prices_completed_at is null then
    raise exception using errcode = 'PT409', message = 'fantasy_prices_incomplete';
  end if;
  if journal.completed_at is not null then
    return jsonb_build_object('completed', true, 'stableResult', true, 'completedAt', journal.completed_at);
  end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into player_ids
    from app.fantasy_players where fantasy_season_id = gameweek.fantasy_season_id;
  if journal.price_player_ids is distinct from player_ids then
    raise exception using errcode = 'PT409', message = 'fantasy_price_catalog_changed';
  end if;
  if exists (
    select 1 from app.fantasy_lineups lineup
    left join app.fantasy_team_gameweek_results result on result.gameweek_id = lineup.gameweek_id
      and result.fantasy_team_id = lineup.fantasy_team_id
    where lineup.gameweek_id = gameweek.id
      and (lineup.finalized_at is null or result.state is distinct from 'final'::app.fantasy_points_state
        or result.calculation_version is distinct from p_calculation_version)
  ) then
    raise exception using errcode = 'PT409', message = 'fantasy_notifications_incomplete';
  end if;
  if exists (
    select 1 from app.fantasy_team_gameweek_results result
    join app.fantasy_teams team on team.id = result.fantasy_team_id
    left join app_private.notification_events event on event.deduplication_key =
      'fantasy:gameweek_finalized:' || gameweek.id::text || ':' || team.id::text || ':v' || p_calculation_version::text
    where result.gameweek_id = gameweek.id and (
      result.state <> 'final' or result.calculation_version <> p_calculation_version
      or event.event_type is distinct from 'gameweek_finalized'::app.notification_type
      or event.source_domain is distinct from 'fantasy'::app.notification_source_domain
      or event.source_entity_id is distinct from gameweek.id
      or event.target_user_id is distinct from team.user_id
      or event.schema_version is distinct from 1
      or event.occurred_at is distinct from gameweek.finalized_at
      or event.correlation_id is distinct from gameweek.id
      or event.safe_payload is distinct from jsonb_build_object('gameweek', gameweek.sequence_number, 'points', result.final_score)
    )
  ) then
    raise exception using errcode = 'PT409', message = 'fantasy_notifications_incomplete';
  end if;
  update app_private.fantasy_gameweek_postwork set completed_at = statement_timestamp()
    where gameweek_id = gameweek.id and calculation_version = p_calculation_version
    returning * into journal;
  return jsonb_build_object('completed', true, 'stableResult', false, 'completedAt', journal.completed_at);
end;
$$;
revoke all on function api.service_complete_fantasy_postwork(uuid,bigint)
  from public, anon, authenticated;
grant execute on function api.service_complete_fantasy_postwork(uuid,bigint) to service_role;
