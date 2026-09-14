-- Durable, target-user events only. This boundary neither fans out notifications
-- nor queues or sends push/email deliveries; existing delivery preferences apply.
create function api.service_enqueue_gameweek_finalized_notifications(
  p_gameweek_id uuid,
  p_calculation_version bigint,
  p_after_team_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gameweek app.fantasy_gameweeks%rowtype;
  snapshot app_private.fantasy_scoring_snapshots%rowtype;
  candidate record;
  existing_event app_private.notification_events%rowtype;
  event_key text;
  event_hash text;
  event_id uuid;
  resolved_id uuid;
  payload jsonb;
  scanned integer := 0;
  enqueued integer := 0;
  skipped integer := 0;
  last_team_id uuid;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_gameweek_id is null or p_calculation_version is null or p_calculation_version < 1
    or p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  -- Serialize pages/replays with finalization and corrections. Do not SKIP LOCKED:
  -- advancing a UUID cursor over a locked team would permanently omit its event.
  select * into gameweek from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if gameweek.status <> 'finalized' or gameweek.points_state <> 'final'
    or gameweek.finalized_at is null
    or gameweek.scoring_input_version <> p_calculation_version then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;
  -- These events describe the completed calculation. Later provider updates must
  -- not invalidate its durable facts or prevent resuming an interrupted page.
  select * into snapshot from app_private.fantasy_scoring_snapshots
    where gameweek_id = gameweek.id and calculation_version = p_calculation_version for update;
  if not found then
    raise exception using errcode = 'PT409', message = 'fantasy_scoring_snapshot_missing';
  end if;
  if exists (select 1 from app_private.fantasy_scoring_snapshots newer
    where newer.gameweek_id = gameweek.id and newer.calculation_version > p_calculation_version) then
    raise exception using errcode = 'PT409', message = 'stale_update';
  end if;
  if snapshot.sealed_at is null or not snapshot.players_persisted then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;

  -- A cursor cannot conceal missing, provisional, or differently versioned results.
  if exists (
    select 1 from app.fantasy_lineups lineup
    left join app.fantasy_team_gameweek_results result
      on result.gameweek_id = lineup.gameweek_id and result.fantasy_team_id = lineup.fantasy_team_id
    where lineup.gameweek_id = gameweek.id
      and (lineup.locked_at is null or lineup.finalized_at is null
        or result.state is distinct from 'final'::app.fantasy_points_state
        or result.calculation_version is distinct from p_calculation_version)
  ) or exists (
    select 1 from app.fantasy_team_gameweek_results result
    join app.fantasy_teams team on team.id = result.fantasy_team_id
    where result.gameweek_id = gameweek.id
      and (result.state <> 'final' or result.finalized_at is null
        or result.final_score is distinct from result.provisional_score
        or result.calculation_version <> p_calculation_version
        or result.final_score not between -100 and 1000
        or team.fantasy_season_id <> gameweek.fantasy_season_id
        or not exists (select 1 from app.fantasy_lineups lineup
          where lineup.gameweek_id = gameweek.id and lineup.fantasy_team_id = team.id))
  ) then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;

  for candidate in
    select result.fantasy_team_id, result.final_score, team.user_id
    from app.fantasy_team_gameweek_results result
    join app.fantasy_teams team on team.id = result.fantasy_team_id
    where result.gameweek_id = gameweek.id
      and (p_after_team_id is null or result.fantasy_team_id > p_after_team_id)
    order by result.fantasy_team_id
    limit p_limit
  loop
    scanned := scanned + 1;
    last_team_id := candidate.fantasy_team_id;
    event_key := 'fantasy:gameweek_finalized:' || gameweek.id::text || ':'
      || candidate.fantasy_team_id::text || ':v' || p_calculation_version::text;
    event_hash := encode(extensions.digest(event_key, 'sha256'), 'hex');
    -- Application-defined UUIDv8: stable identity with valid version/variant bits.
    event_id := (substr(event_hash, 1, 12) || '8' || substr(event_hash, 14, 3)
      || 'a' || substr(event_hash, 18, 15))::uuid;
    payload := jsonb_build_object('gameweek', gameweek.sequence_number, 'points', candidate.final_score);

    select * into existing_event from app_private.notification_events
      where deduplication_key = event_key;
    if not found then
      resolved_id := api.service_ingest_notification_event(
        event_id, 'gameweek_finalized', 'fantasy', gameweek.id, candidate.user_id,
        gameweek.finalized_at, 1, event_key, gameweek.id, payload
      );
      enqueued := enqueued + 1;
      select * into existing_event from app_private.notification_events where id = resolved_id;
    else
      skipped := skipped + 1;
    end if;
    -- Replays must agree with the original facts; never silently reuse another event.
    if existing_event.id is distinct from event_id
      or existing_event.event_type is distinct from 'gameweek_finalized'::app.notification_type
      or existing_event.source_domain is distinct from 'fantasy'::app.notification_source_domain
      or existing_event.source_entity_id is distinct from gameweek.id
      or existing_event.target_user_id is distinct from candidate.user_id
      or existing_event.schema_version is distinct from 1
      or existing_event.occurred_at is distinct from gameweek.finalized_at
      or existing_event.correlation_id is distinct from gameweek.id
      or existing_event.safe_payload is distinct from payload then
      raise exception using errcode = 'PT409', message = 'fantasy_notification_conflict';
    end if;
  end loop;

  return jsonb_build_object(
    'scanned', scanned, 'enqueued', enqueued, 'skipped', skipped,
    'nextCursor', last_team_id,
    'hasMore', exists (select 1 from app.fantasy_team_gameweek_results result
      where result.gameweek_id = gameweek.id and result.fantasy_team_id > last_team_id)
  );
end;
$$;

revoke all on function api.service_enqueue_gameweek_finalized_notifications(uuid,bigint,uuid,integer)
  from public, anon, authenticated;
grant execute on function api.service_enqueue_gameweek_finalized_notifications(uuid,bigint,uuid,integer)
  to service_role;

comment on function api.service_enqueue_gameweek_finalized_notifications(uuid,bigint,uuid,integer) is
  'Enqueue up to 1000 deterministic target-user gameweek_finalized events for a verified final calculation. Resume by nextCursor; no notification fanout or external delivery.';
