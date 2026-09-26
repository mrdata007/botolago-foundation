-- BotolaGO Production V2
-- Pépites, migration 3 of the v1 sequence: the data desk.
-- docs/engineering/PEPITES_ARCHITECTURE.md §3.7.
--
-- One list of what is wrong or missing in the football data Pépites relies
-- on, for a person to fix. Issues come from three places:
--
--   * the sweep (app_private.data_desk_sweep), which opens an issue for
--       - an attribute two sources disagree on
--         (app_private.player_attribute_conflicts, 20260926060000);
--       - a player of the current season with no date of birth: in a squad
--         or with league minutes, so the ranking cannot say whether he is
--         under 23;
--       - a lineup entry with only a name, not linked to a player;
--       - a published photo whose rights no longer hold (for example a date
--         of birth corrected so the player was a minor when it was taken);
--     and closes the issues it opened once the cause is gone;
--   * signed-in fans reporting an error (rate-limited);
--   * staff, who resolve or dismiss.
--
-- Fixing is done where the data lives: a manual attribute observation, a
-- provider mapping correction, a photo release. This table only tracks the
-- work. One open issue per entity, field and kind.

-- ---------------------------------------------------------------------------
-- The current season
-- ---------------------------------------------------------------------------
-- The latest current season. Redefined by the editions migration once
-- Pépites has its own settings.
create function app_private.pepites_current_season()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select season.id
  from app.seasons season
  where season.is_current
  order by season.starts_on desc, season.id desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Issues
-- ---------------------------------------------------------------------------
create table app_private.data_desk_issues (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  field text not null,
  kind text not null,
  status text not null default 'open',
  source text not null,
  details jsonb not null default '{}'::jsonb,
  reported_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint data_desk_issues_entity_type_check check (
    entity_type in ('player', 'lineup_player', 'photo')
  ),
  constraint data_desk_issues_field_check check (field ~ '^[a-z_]{1,40}$'),
  constraint data_desk_issues_kind_check check (
    kind in ('missing', 'conflict', 'reported', 'unlinked')
  ),
  constraint data_desk_issues_status_check check (status in ('open', 'resolved', 'dismissed')),
  constraint data_desk_issues_source_check check (source in ('sweep', 'report', 'staff')),
  constraint data_desk_issues_reported_check check ((source = 'report') = (reported_by is not null)),
  constraint data_desk_issues_resolution_check check (
    (status = 'open') = (resolved_at is null)
    and (resolution_note is null or char_length(resolution_note) between 1 and 500)
  ),
  constraint data_desk_issues_details_check check (
    jsonb_typeof(details) = 'object' and octet_length(details::text) <= 8192
  )
);

comment on table app_private.data_desk_issues is
  'Work list of football data problems for Pépites. Opened by the sweep, by fan reports and by staff; closed by the sweep when the cause is gone, or by staff.';

-- One open issue per entity, field and kind. Fan reports are keyed on the
-- reporter too, so two fans reporting the same field are two reports.
create unique index data_desk_issues_open_key
  on app_private.data_desk_issues (entity_type, entity_id, field, kind)
  where status = 'open' and source <> 'report';
create unique index data_desk_issues_open_report_key
  on app_private.data_desk_issues (entity_type, entity_id, field, reported_by)
  where status = 'open' and source = 'report';
create index data_desk_issues_status_idx
  on app_private.data_desk_issues (status, created_at desc);
create index data_desk_issues_reporter_idx
  on app_private.data_desk_issues (reported_by, created_at desc)
  where reported_by is not null;

alter table app_private.data_desk_issues enable row level security;
alter table app_private.data_desk_issues force row level security;
revoke all on table app_private.data_desk_issues from public, anon, authenticated, service_role;

create trigger data_desk_issues_set_updated_at
before update on app_private.data_desk_issues
for each row execute function app_private.set_updated_at();

-- A closed issue stays closed; an issue's identity never changes; nothing
-- is deleted.
create function app_private.data_desk_issues_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception using errcode = '55000', message = 'DATA_DESK_ISSUE_IMMUTABLE';
  end if;
  if (new.id, new.entity_type, new.entity_id, new.field, new.kind, new.source,
      new.reported_by, new.created_at)
    is distinct from
     (old.id, old.entity_type, old.entity_id, old.field, old.kind, old.source,
      old.reported_by, old.created_at)
    or old.status <> 'open'
  then
    raise exception using errcode = '55000', message = 'DATA_DESK_ISSUE_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger data_desk_issues_guard
before update or delete on app_private.data_desk_issues
for each row execute function app_private.data_desk_issues_guard();
create trigger data_desk_issues_no_truncate
before truncate on app_private.data_desk_issues
for each statement execute function app_private.data_desk_issues_guard();

-- ---------------------------------------------------------------------------
-- The sweep
-- ---------------------------------------------------------------------------
create function app_private.data_desk_sweep(p_season_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid := coalesce(p_season_id, app_private.pepites_current_season());
  v_opened integer := 0;
  v_closed integer := 0;
begin
  create temporary table pg_temp.data_desk_found (
    entity_type text, entity_id uuid, field text, kind text, details jsonb
  ) on commit drop;

  -- Attribute disagreements: which source says what. Only the values, so a
  -- source seeing its value again does not count as a change.
  insert into pg_temp.data_desk_found
  select 'player', conflict.player_id, conflict.attribute, 'conflict',
    pg_catalog.jsonb_build_object('values', (
      select pg_catalog.jsonb_object_agg(observation ->> 'source', observation ->> 'value')
      from pg_catalog.jsonb_array_elements(conflict.observations) observation
    ))
  from app_private.player_attribute_conflicts conflict;

  -- Current-season players with no date of birth.
  if v_season_id is not null then
    insert into pg_temp.data_desk_found
    select 'player', player.id, 'date_of_birth', 'missing',
      pg_catalog.jsonb_build_object('seasonId', v_season_id)
    from app.players player
    where player.date_of_birth is null
      and (
        exists (
          select 1 from app.team_memberships membership
          where membership.player_id = player.id and membership.season_id = v_season_id
            and membership.active
        )
        or exists (
          select 1 from app.player_fixture_performances performance
          where performance.player_id = player.id
            and performance.football_season_id = v_season_id
            and performance.active and performance.minutes > 0
        )
      );

    -- Lineup entries with only a name.
    insert into pg_temp.data_desk_found
    select 'lineup_player', lineup_player.id, 'player_id', 'unlinked',
      pg_catalog.jsonb_build_object('playerName', lineup_player.player_name,
        'fixtureId', lineup.fixture_id, 'teamId', lineup.team_id)
    from app.lineup_players lineup_player
    join app.lineups lineup on lineup.id = lineup_player.lineup_id
    join app.fixtures fixture on fixture.id = lineup.fixture_id
    where lineup_player.player_id is null
      and fixture.season_id = v_season_id;
  end if;

  -- Published photos whose rights no longer hold.
  insert into pg_temp.data_desk_found
  select 'photo', release.id, 'rights', 'conflict',
    pg_catalog.jsonb_build_object('playerId', release.player_id, 'problems', problems.list)
  from app_private.player_photo_releases release
  cross join lateral (
    select array_remove(app_private.player_photo_release_problems(release), 'intake_missing') as list
  ) problems
  where release.status = 'published' and cardinality(problems.list) > 0;

  -- Open what is new; refresh the details of what is still there.
  with upserted as (
    insert into app_private.data_desk_issues (entity_type, entity_id, field, kind, source, details)
    select found.entity_type, found.entity_id, found.field, found.kind, 'sweep', found.details
    from pg_temp.data_desk_found found
    -- A person already closed this exact problem: not raised again until
    -- what is found changes.
    where not exists (
      select 1 from app_private.data_desk_issues closed
      where closed.status <> 'open' and closed.resolved_by is not null
        and closed.entity_type = found.entity_type and closed.entity_id = found.entity_id
        and closed.field = found.field and closed.kind = found.kind
        and closed.details = found.details
    )
    on conflict (entity_type, entity_id, field, kind) where status = 'open' and source <> 'report'
    do update set details = excluded.details
    where data_desk_issues.details is distinct from excluded.details
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_opened from upserted;

  -- Close what the sweep opened and no longer finds.
  update app_private.data_desk_issues issue
  set status = 'resolved', resolved_at = statement_timestamp(),
    resolution_note = 'Cause gone (sweep)'
  where issue.status = 'open' and issue.source = 'sweep'
    and not exists (
      select 1 from pg_temp.data_desk_found found
      where found.entity_type = issue.entity_type and found.entity_id = issue.entity_id
        and found.field = issue.field and found.kind = issue.kind
    );
  get diagnostics v_closed = row_count;

  drop table pg_temp.data_desk_found;
  return pg_catalog.jsonb_build_object('opened', v_opened, 'closed', v_closed,
    'open', (select count(*) from app_private.data_desk_issues where status = 'open'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Fan reports
-- ---------------------------------------------------------------------------
-- Signed-in only (the API wrapper passes auth.uid()). At most 5 a day per
-- account, one open report per account and field.
create function app_private.report_data_issue(
  p_entity_type text,
  p_entity_id uuid,
  p_field text,
  p_message text,
  p_reporter uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_reporter is null then
    raise exception using errcode = 'PT401', message = 'data_desk_unauthenticated';
  end if;
  if p_message is null or char_length(btrim(p_message)) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'DATA_DESK_REPORT_INVALID';
  end if;
  if p_entity_type is distinct from 'player'
    or p_field not in ('date_of_birth', 'nationality', 'preferred_foot', 'height_cm',
      'detailed_position', 'photo', 'club', 'name', 'stats')
    or not exists (select 1 from app.players where id = p_entity_id)
  then
    raise exception using errcode = '22023', message = 'DATA_DESK_REPORT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('data_desk_report:' || p_reporter, 0)
  );
  if (select count(*) from app_private.data_desk_issues
      where reported_by = p_reporter and created_at > statement_timestamp() - interval '24 hours') >= 5
  then
    raise exception using errcode = 'PT429', message = 'data_desk_rate_limited';
  end if;

  insert into app_private.data_desk_issues (
    entity_type, entity_id, field, kind, source, details, reported_by
  ) values (
    p_entity_type, p_entity_id, p_field, 'reported', 'report',
    pg_catalog.jsonb_build_object('message', btrim(p_message)), p_reporter
  )
  on conflict (entity_type, entity_id, field, reported_by) where status = 'open' and source = 'report'
  do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from app_private.data_desk_issues
    where entity_type = p_entity_type and entity_id = p_entity_id and field = p_field
      and reported_by = p_reporter and status = 'open' and source = 'report';
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: close an issue
-- ---------------------------------------------------------------------------
create function app_private.close_data_desk_issue(
  p_issue_id uuid,
  p_status text,
  p_note text,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null or p_status not in ('resolved', 'dismissed')
    or p_note is null or char_length(btrim(p_note)) not between 1 and 500
  then
    raise exception using errcode = '22023', message = 'DATA_DESK_CLOSE_INVALID';
  end if;
  update app_private.data_desk_issues
  set status = p_status, resolved_by = p_actor, resolved_at = statement_timestamp(),
    resolution_note = btrim(p_note)
  where id = p_issue_id and status = 'open';
  if not found then
    raise exception using errcode = 'P0002', message = 'DATA_DESK_ISSUE_NOT_OPEN';
  end if;
end;
$$;

revoke all on function app_private.pepites_current_season() from public, anon, authenticated, service_role;
revoke all on function app_private.data_desk_issues_guard() from public, anon, authenticated, service_role;
revoke all on function app_private.data_desk_sweep(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.report_data_issue(text, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.close_data_desk_issue(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
