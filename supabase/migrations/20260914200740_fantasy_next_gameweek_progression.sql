-- Preserve pre-Free-Hit selections and advance only an already staged next
-- gameweek, after durable completion of the previous game's postwork.
create table app_private.fantasy_free_hit_lineup_snapshots (
  snapshot_id uuid primary key references app.fantasy_free_hit_snapshots(id) on delete restrict,
  source_lineup_id uuid not null references app.fantasy_lineups(id) on delete restrict,
  selection jsonb not null,
  captured_at timestamptz not null default statement_timestamp(),
  constraint fantasy_free_hit_lineup_selection_check check (
    jsonb_typeof(selection) = 'array' and jsonb_array_length(selection) between 11 and 40
  )
);
alter table app_private.fantasy_free_hit_lineup_snapshots enable row level security;
alter table app_private.fantasy_free_hit_lineup_snapshots force row level security;
revoke all on app_private.fantasy_free_hit_lineup_snapshots from public,anon,authenticated,service_role;

create table app_private.fantasy_gameweek_progressions (
  previous_gameweek_id uuid primary key references app.fantasy_gameweeks(id) on delete restrict,
  next_gameweek_id uuid not null unique references app.fantasy_gameweeks(id) on delete restrict,
  calculation_version bigint not null check (calculation_version > 0),
  started_at timestamptz not null default statement_timestamp(),
  opened_at timestamptz,
  constraint fantasy_gameweek_progression_distinct_check check (previous_gameweek_id <> next_gameweek_id)
);
alter table app_private.fantasy_gameweek_progressions enable row level security;
alter table app_private.fantasy_gameweek_progressions force row level security;
revoke all on app_private.fantasy_gameweek_progressions from public,anon,authenticated,service_role;

create function app_private.fantasy_lineup_selection(p_lineup_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'fantasy_player_id', fantasy_player_id, 'slot', slot, 'slot_order', slot_order,
    'captain', captain, 'vice_captain', vice_captain
  ) order by slot, slot_order),'[]'::jsonb)
  from app.fantasy_lineup_players where lineup_id=p_lineup_id;
$$;
revoke all on function app_private.fantasy_lineup_selection(uuid) from public,anon,authenticated,service_role;

create function app_private.fantasy_validate_carried_selection(p_team_id uuid,p_selection jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare team app.fantasy_teams%rowtype; rules app.fantasy_rulesets%rowtype;
begin
  select * into team from app.fantasy_teams where id=p_team_id;
  select r.* into rules from app.fantasy_rulesets r join app.fantasy_seasons s on s.ruleset_id=r.id where s.id=team.fantasy_season_id;
  if team.id is null or jsonb_typeof(p_selection) is distinct from 'array'
    or jsonb_array_length(p_selection)<>rules.squad_size
    or (select count(distinct v->>'fantasy_player_id') from jsonb_array_elements(p_selection) v)<>rules.squad_size
    or (select count(*) from app.fantasy_squad_memberships where fantasy_team_id=team.id and sold_at is null)<>rules.squad_size
    or exists(select 1 from jsonb_array_elements(p_selection) v
      left join app.fantasy_squad_memberships m on m.fantasy_team_id=team.id and m.sold_at is null and m.fantasy_player_id::text=v->>'fantasy_player_id'
      where m.id is null or v->>'slot' not in ('starter','bench')
        or v->>'slot' is null or jsonb_typeof(v->'slot_order') is distinct from 'number'
        or jsonb_typeof(v->'captain') is distinct from 'boolean' or jsonb_typeof(v->'vice_captain') is distinct from 'boolean'
        or ((v->>'captain')::boolean and (v->>'vice_captain')::boolean)
        or (v->>'slot'='bench' and ((v->>'captain')::boolean or (v->>'vice_captain')::boolean))
        or (v->>'slot_order')::integer not between 1 and case when v->>'slot'='starter' then 11 else 4 end)
    or (select count(*) from jsonb_array_elements(p_selection) v where v->>'slot'='starter')<>11
    or (select count(*) from jsonb_array_elements(p_selection) v where (v->>'captain')::boolean)<>1
    or (select count(*) from jsonb_array_elements(p_selection) v where (v->>'vice_captain')::boolean)<>1
    or (select count(distinct (v->>'slot',v->>'slot_order')) from jsonb_array_elements(p_selection) v)<>rules.squad_size then
    raise exception using errcode='PT409',message='fantasy_carried_selection_invalid';
  end if;
  -- Existing owned unavailable players may be retained so their owner can
  -- transfer them during the new window; this does not authorize a purchase.
  if exists(select 1 from app.fantasy_position_rules rule
    left join lateral (select count(*) as squad_count,count(*) filter(where v->>'slot'='starter') as starters
      from jsonb_array_elements(p_selection) v join app.fantasy_players fp on fp.id::text=v->>'fantasy_player_id'
      where fp.position_id=rule.position_id and fp.fantasy_season_id=team.fantasy_season_id) counts on true
    where rule.ruleset_id=rules.id and (counts.squad_count<>rule.squad_quota or counts.starters not between rule.starting_minimum and rule.starting_maximum)) then
    raise exception using errcode='PT409',message='fantasy_carried_formation_invalid';
  end if;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='PT409',message='fantasy_carried_selection_invalid';
end;
$$;
revoke all on function app_private.fantasy_validate_carried_selection(uuid,jsonb) from public,anon,authenticated,service_role;

create function app_private.fantasy_capture_free_hit_lineup()
returns trigger language plpgsql security definer set search_path='' as $$
declare source_id uuid; selection jsonb;
begin
  select id into source_id from app.fantasy_lineups
  where fantasy_team_id=new.fantasy_team_id and gameweek_id=new.gameweek_id
    and locked_at is null and finalized_at is null;
  if source_id is null then raise exception using errcode='PT409',message='fantasy_free_hit_lineup_missing'; end if;
  selection:=app_private.fantasy_lineup_selection(source_id);
  perform app_private.fantasy_validate_carried_selection(new.fantasy_team_id,selection);
  insert into app_private.fantasy_free_hit_lineup_snapshots(snapshot_id,source_lineup_id,selection)
  values(new.id,source_id,selection);
  return new;
end;
$$;
revoke all on function app_private.fantasy_capture_free_hit_lineup() from public,anon,authenticated,service_role;
create trigger fantasy_capture_free_hit_lineup after insert on app.fantasy_free_hit_snapshots
for each row execute function app_private.fantasy_capture_free_hit_lineup();

-- Repeated Free Hit transfer confirmations attempt to copy the then-current
-- squad again. Only original captured members may populate this snapshot.
create function app_private.fantasy_preserve_free_hit_snapshot_members()
returns trigger language plpgsql security definer set search_path='' as $$
declare captured jsonb;
begin
  select selection into captured from app_private.fantasy_free_hit_lineup_snapshots where snapshot_id=new.snapshot_id;
  if found and not exists(select 1 from jsonb_array_elements(captured) v where v->>'fantasy_player_id'=new.fantasy_player_id::text) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function app_private.fantasy_preserve_free_hit_snapshot_members() from public,anon,authenticated,service_role;
create trigger fantasy_preserve_free_hit_snapshot_members before insert on app.fantasy_free_hit_snapshot_players
for each row execute function app_private.fantasy_preserve_free_hit_snapshot_members();

create function api.service_prepare_next_fantasy_gameweek(
  p_previous_gameweek_id uuid,p_next_gameweek_id uuid,p_calculation_version bigint,p_batch_size integer default 100
) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous app.fantasy_gameweeks%rowtype; next_week app.fantasy_gameweeks%rowtype;
  season app.fantasy_seasons%rowtype; progress app_private.fantasy_gameweek_progressions%rowtype;
  team app.fantasy_teams%rowtype; source_id uuid; next_lineup_id uuid;
  free_hit_id uuid; selection jsonb; prepared integer:=0; remaining boolean;
  expected_clubs integer; fixture_count integer; participant_count integer; first_kickoff timestamptz;
begin
  if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
  if p_previous_gameweek_id is null or p_next_gameweek_id is null or p_calculation_version is null
    or p_calculation_version<1 or p_batch_size is null or p_batch_size not between 1 and 1000 then
    raise exception using errcode='PT400',message='validation_failed'; end if;
  select * into previous from app.fantasy_gameweeks where id=p_previous_gameweek_id for update;
  select * into next_week from app.fantasy_gameweeks where id=p_next_gameweek_id for update;
  if previous.id is null or next_week.id is null then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
  if next_week.fantasy_season_id<>previous.fantasy_season_id or next_week.sequence_number<>previous.sequence_number+1 then
    raise exception using errcode='PT409',message='fantasy_next_gameweek_scope_invalid'; end if;
  select * into progress from app_private.fantasy_gameweek_progressions where previous_gameweek_id=previous.id;
  if found and (progress.next_gameweek_id<>next_week.id or progress.calculation_version<>p_calculation_version) then
    raise exception using errcode='PT409',message='idempotency_conflict'; end if;
  if progress.opened_at is not null then
    return jsonb_build_object('prepared',0,'hasMore',false,'nextGameweekId',next_week.id,'status',next_week.status,'alreadyAdvanced',true);
  end if;
  if previous.status<>'finalized' or previous.scoring_input_version<>p_calculation_version
    or not exists(select 1 from app_private.fantasy_gameweek_postwork work
      where work.gameweek_id=previous.id and work.calculation_version=p_calculation_version and work.completed_at is not null) then
    raise exception using errcode='PT409',message='fantasy_previous_postwork_incomplete'; end if;
  select * into season from app.fantasy_seasons where id=previous.fantasy_season_id;
  if season.status not in ('registration_open','active') or next_week.status<>'scheduled'
    or next_week.deadline_at<=statement_timestamp() then
    raise exception using errcode='PT409',message='fantasy_next_gameweek_not_openable'; end if;
  perform a.id from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
  where a.gameweek_id=next_week.id and a.superseded_at is null order by a.id for share of a,f;
  if exists(select 1 from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
    where a.gameweek_id=next_week.id and a.superseded_at is null and (
      a.fantasy_season_id<>season.id or f.season_id<>season.football_season_id
      or f.round_id is distinct from next_week.football_round_id or not a.counts_points or a.frozen_at is not null
      or a.assignment_status not in ('assigned','confirmed','reassigned')
      or f.status not in ('scheduled','not_started') or f.kickoff_at is distinct from a.assigned_kickoff_at
      or not exists(select 1 from app.fantasy_players fp where fp.fantasy_season_id=season.id and fp.football_team_id=f.home_team_id)
      or not exists(select 1 from app.fantasy_players fp where fp.fantasy_season_id=season.id and fp.football_team_id=f.away_team_id))) then
    raise exception using errcode='PT409',message='fantasy_next_fixture_unverified'; end if;
  select count(distinct fp.football_team_id) into expected_clubs from app.fantasy_players fp where fp.fantasy_season_id=season.id;
  select count(distinct f.id),count(distinct t.team_id),min(f.kickoff_at)
  into fixture_count,participant_count,first_kickoff
  from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
  cross join lateral(values(f.home_team_id),(f.away_team_id)) t(team_id)
  where a.gameweek_id=next_week.id and a.superseded_at is null and a.counts_points;
  if expected_clubs<2 or mod(expected_clubs,2)<>0 or fixture_count<>expected_clubs/2 or participant_count<>expected_clubs
    or next_week.deadline_at is distinct from app_private.fantasy_calculate_deadline(season.ruleset_id,first_kickoff)
    or next_week.starts_at is distinct from first_kickoff then
    raise exception using errcode='PT409',message='fantasy_next_calendar_incomplete'; end if;
  if exists(select 1 from app.fantasy_teams t where t.fantasy_season_id=season.id and t.status='active'
    and (t.current_gameweek_id is null or t.current_gameweek_id not in (previous.id,next_week.id))) then
    raise exception using errcode='PT409',message='fantasy_team_progression_conflict'; end if;
  insert into app_private.fantasy_gameweek_progressions(previous_gameweek_id,next_gameweek_id,calculation_version)
  values(previous.id,next_week.id,p_calculation_version) on conflict(previous_gameweek_id) do nothing;
  for team in select * from app.fantasy_teams where fantasy_season_id=season.id and status='active'
    and current_gameweek_id=previous.id order by id for update limit p_batch_size loop
    select id into next_lineup_id from app.fantasy_lineups where fantasy_team_id=team.id and gameweek_id=next_week.id
      and locked_at is null and finalized_at is null;
    if next_lineup_id is not null then
      selection:=app_private.fantasy_lineup_selection(next_lineup_id);
    else
      select id into free_hit_id from app.fantasy_free_hit_snapshots
      where fantasy_team_id=team.id and gameweek_id=previous.id and restored_at is not null;
      if free_hit_id is not null then
        select captured.selection into selection from app_private.fantasy_free_hit_lineup_snapshots captured where captured.snapshot_id=free_hit_id;
        if selection is null then raise exception using errcode='PT409',message='fantasy_free_hit_selection_unavailable'; end if;
      else
        select id into source_id from app.fantasy_lineups where fantasy_team_id=team.id and gameweek_id=previous.id and locked_at is not null;
        selection:=app_private.fantasy_lineup_selection(source_id);
      end if;
    end if;
    perform app_private.fantasy_validate_carried_selection(team.id,selection);
    if next_lineup_id is null then
      insert into app.fantasy_lineups(fantasy_team_id,gameweek_id,team_version)
      values(team.id,next_week.id,team.version+1) returning id into next_lineup_id;
      insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,multiplier,snapshot_price)
      select next_lineup_id,(v->>'fantasy_player_id')::uuid,(v->>'slot')::app.fantasy_lineup_slot,(v->>'slot_order')::integer,
        (v->>'captain')::boolean,(v->>'vice_captain')::boolean,
        case when (v->>'captain')::boolean then r.captain_multiplier else 1 end,fp.price
      from jsonb_array_elements(selection) v join app.fantasy_players fp on fp.id::text=v->>'fantasy_player_id'
      join app.fantasy_rulesets r on r.id=season.ruleset_id;
    end if;
    update app.fantasy_teams set current_gameweek_id=next_week.id,version=version+1,
      team_value=(select sum(fp.price) from app.fantasy_squad_memberships m join app.fantasy_players fp on fp.id=m.fantasy_player_id
        where m.fantasy_team_id=team.id and m.sold_at is null)
    where id=team.id;
    prepared:=prepared+1;
  end loop;
  remaining:=exists(select 1 from app.fantasy_teams where fantasy_season_id=season.id and status='active' and current_gameweek_id=previous.id);
  if not remaining then
    if exists(select 1 from app.fantasy_teams t where t.fantasy_season_id=season.id and t.status='active'
      and not exists(select 1 from app.fantasy_lineups l where l.fantasy_team_id=t.id and l.gameweek_id=next_week.id and l.locked_at is null)) then
      raise exception using errcode='PT409',message='fantasy_next_lineup_missing'; end if;
    update app.fantasy_gameweeks set status='open',lock_version=lock_version+1 where id=next_week.id;
    update app_private.fantasy_gameweek_progressions set opened_at=statement_timestamp() where previous_gameweek_id=previous.id;
  end if;
  return jsonb_build_object('prepared',prepared,'hasMore',remaining,'nextGameweekId',next_week.id,
    'status',case when remaining then 'scheduled' else 'open' end,'alreadyAdvanced',false);
end;
$$;
revoke all on function api.service_prepare_next_fantasy_gameweek(uuid,uuid,bigint,integer) from public,anon,authenticated,service_role;
grant execute on function api.service_prepare_next_fantasy_gameweek(uuid,uuid,bigint,integer) to service_role;

create or replace function api.service_fantasy_lifecycle_state(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target app.fantasy_gameweeks%rowtype;
begin
  if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
  select * into target from app.fantasy_gameweeks where id=p_gameweek_id;
  if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
  return jsonb_build_object('schemaVersion',1,'gameweekId',target.id,'seasonId',target.fantasy_season_id,
    'status',target.status,'lockVersion',target.lock_version,'sequenceNumber',target.sequence_number,
    'scoringInputVersion',target.scoring_input_version,'deadlineAt',target.deadline_at,'serverTime',statement_timestamp(),
    'unlockedLineups',(select count(*) from app.fantasy_lineups where gameweek_id=target.id and locked_at is null),
    'nextGameweekId',(select id from app.fantasy_gameweeks where fantasy_season_id=target.fantasy_season_id and sequence_number=target.sequence_number+1),
    'advancedToGameweekId',(select next_gameweek_id from app_private.fantasy_gameweek_progressions
      where previous_gameweek_id=target.id and opened_at is not null));
end;
$$;
