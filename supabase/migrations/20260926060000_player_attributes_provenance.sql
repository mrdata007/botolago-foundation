-- BotolaGO Production V2
-- Pépites, migration 1 of the v1 sequence: player attributes with provenance.
-- docs/engineering/PEPITES_ARCHITECTURE.md §3.1 (revision 3, Gate A approved
-- for local implementation 2026-09-26).
--
-- Five columns of app.players now have exactly one writer,
-- app_private.resolve_player_attributes:
--
--   date_of_birth, nationality_country_id, preferred_foot   (existing)
--   height_cm, detailed_position                              (new here)
--
-- Every value comes from an observation in
-- app_private.player_attribute_observations (append-only), with its source,
-- time and reference. The resolver picks one per attribute by source priority
-- (manual, SportsMonks, BSD, derived, any other provider, legacy) and writes it.
-- A manual correction therefore survives the next provider import, and two
-- sources that disagree stay visible in app_private.player_attribute_conflicts
-- for the data desk (migration 3) instead of one silently overwriting the other.
--
-- Before this migration two functions wrote those columns directly:
--   api.ingest_football_squad (20260731203317) on insert and on every update;
--   api.service_apply_current_player_list (20260925200000) on insert.
-- Both are re-created below from their current source with one change each:
-- they no longer assign date_of_birth or preferred_foot, and record a provider
-- observation and resolve the player instead. Nothing else in them changes.
-- One behaviour follows from recording observations rather than overwriting:
-- a later payload with no date of birth, or foot 'unknown', no longer erases a
-- known value. Unknown is not evidence.
--
-- Existing values are seeded as `legacy`: unverified, because a provider
-- mapping on a player does not show where a particular value came from (the
-- promoted clubs' squads were typed by hand, then linked). Legacy ranks last,
-- so any real source replaces it, and a differing value then shows as a
-- conflict carrying the legacy value. Seeding changes no player value; the
-- migration asserts it by resolving every player and requiring zero changes.
--
-- Seeing the same value again later is kept as a confirmation (its own
-- append-only row), so an observation's freshness is when its value was last
-- seen; a different value seen before that is stale and does not replace it.
--
-- A guard trigger rejects any other write to the five columns. The resolver
-- sets the transaction-local flag botolago.player_attribute_writer for its own
-- write and restores the previous value straight after, so a later direct write
-- in the same transaction is still rejected. The guard stops an accidental
-- writer; a definer function that sets the flag on purpose is for review to
-- catch.
--
-- Deleting a country keeps working: players.nationality_country_id is
-- ON DELETE SET NULL, and the guard lets exactly that through (nationality to
-- null, nothing else changed, the country gone). The nationality observation
-- stays as evidence and resolves to null as well.

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------
create type app.detailed_position as enum (
  'gk', 'cb', 'lb', 'rb', 'dm', 'cm', 'am', 'lw', 'rw', 'cf'
);

alter table app.players
  add column height_cm smallint,
  add column detailed_position app.detailed_position,
  add constraint players_height_cm_check check (height_cm is null or height_cm between 140 and 215);

comment on column app.players.height_cm is
  'Written only by app_private.resolve_player_attributes, from player_attribute_observations.';
comment on column app.players.detailed_position is
  'Written only by app_private.resolve_player_attributes, from player_attribute_observations.';

-- ---------------------------------------------------------------------------
-- Observations: one row per value seen, append-only
-- ---------------------------------------------------------------------------
create table app_private.player_attribute_observations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references app.players(id) on delete restrict,
  attribute text not null,
  value_text text,
  value_numeric numeric,
  source_kind text not null,
  provider_name text,
  -- provider name for provider rows, else the kind: what priority is keyed on.
  source_key text generated always as (coalesce(provider_name, source_kind)) stored,
  source_ref text,
  observed_at timestamptz not null,
  recorded_by uuid,
  note text,
  superseded_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint player_attribute_observations_attribute_check check (attribute in (
    'date_of_birth', 'nationality', 'preferred_foot', 'height_cm', 'detailed_position'
  )),
  constraint player_attribute_observations_source_kind_check check (
    source_kind in ('provider', 'manual', 'derived', 'legacy')
  ),
  constraint player_attribute_observations_provider_check check (
    (source_kind = 'provider') = (provider_name is not null)
    and (provider_name is null or provider_name ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
  ),
  constraint player_attribute_observations_manual_actor_check check (
    source_kind <> 'manual' or recorded_by is not null
  ),
  constraint player_attribute_observations_value_check check (
    num_nonnulls(value_text, value_numeric) = 1
  ),
  constraint player_attribute_observations_text_check check (
    (source_ref is null or char_length(source_ref) between 1 and 200)
    and (note is null or char_length(note) between 1 and 500)
  ),
  constraint player_attribute_observations_superseded_check check (
    superseded_at is null or superseded_at >= created_at
  )
);

comment on table app_private.player_attribute_observations is
  'Append-only evidence for the five resolved app.players attributes. A new value from the same source supersedes the old row (superseded_at); nothing is updated otherwise or deleted.';

-- One current observation per player, attribute and source.
create unique index player_attribute_observations_current_key
  on app_private.player_attribute_observations (player_id, attribute, source_key)
  where superseded_at is null;
create index player_attribute_observations_player_idx
  on app_private.player_attribute_observations (player_id, attribute);

alter table app_private.player_attribute_observations enable row level security;
alter table app_private.player_attribute_observations force row level security;
revoke all on table app_private.player_attribute_observations
  from public, anon, authenticated, service_role;

create function app_private.player_attribute_observations_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- source_key is left out: a stored generated column is not computed yet in
  -- a BEFORE trigger, so NEW carries null there. It derives from columns that
  -- are compared.
  if tg_op = 'UPDATE'
    and old.superseded_at is null
    and new.superseded_at is not null
    and (pg_catalog.to_jsonb(new) - 'superseded_at' - 'source_key')
      = (pg_catalog.to_jsonb(old) - 'superseded_at' - 'source_key')
  then
    return new;
  end if;
  raise exception using errcode = '55000', message = 'PLAYER_ATTRIBUTE_OBSERVATIONS_APPEND_ONLY';
end;
$$;

create trigger player_attribute_observations_append_only
before update or delete on app_private.player_attribute_observations
for each row execute function app_private.player_attribute_observations_append_only();
create trigger player_attribute_observations_no_truncate
before truncate on app_private.player_attribute_observations
for each statement execute function app_private.player_attribute_observations_append_only();

-- ---------------------------------------------------------------------------
-- Confirmations: the same value seen again, later
-- ---------------------------------------------------------------------------
-- An observation's freshness is the latest time its value was seen: its own
-- observed_at, or a later confirmation. Without this, seeing 188 on the 20th
-- and again on the 22nd kept the 20th, and 170 seen on the 21st then won.
-- Each later sighting is its own append-only row, with its reference, so the
-- observation row itself never changes.
-- observation_id is checked on insert by a trigger rather than declared as a
-- foreign key. The guarantee is the same, because observations can never be
-- deleted or truncated, and a declared key would make PostgreSQL refuse a
-- TRUNCATE of the observations with its own error before their append-only
-- trigger could.
create table app_private.player_attribute_observation_confirmations (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null,
  observed_at timestamptz not null,
  source_ref text,
  recorded_by uuid,
  note text,
  created_at timestamptz not null default statement_timestamp(),
  constraint player_attribute_observation_confirmations_text_check check (
    (source_ref is null or char_length(source_ref) between 1 and 200)
    and (note is null or char_length(note) between 1 and 500)
  )
);

comment on table app_private.player_attribute_observation_confirmations is
  'Append-only later sightings of an unchanged observation value. An observation''s freshness is the greatest of its observed_at and its confirmations.';

create index player_attribute_observation_confirmations_observation_idx
  on app_private.player_attribute_observation_confirmations (observation_id, observed_at desc);

alter table app_private.player_attribute_observation_confirmations enable row level security;
alter table app_private.player_attribute_observation_confirmations force row level security;
revoke all on table app_private.player_attribute_observation_confirmations
  from public, anon, authenticated, service_role;

create function app_private.player_attribute_observation_confirmations_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'PLAYER_ATTRIBUTE_OBSERVATIONS_APPEND_ONLY';
end;
$$;

create trigger player_attribute_observation_confirmations_append_only
before update or delete on app_private.player_attribute_observation_confirmations
for each row execute function app_private.player_attribute_observation_confirmations_append_only();

create function app_private.player_attribute_observation_confirmations_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app_private.player_attribute_observations observation
    where observation.id = new.observation_id
  ) then
    raise exception using errcode = '23503', message = 'PLAYER_ATTRIBUTE_OBSERVATION_NOT_FOUND';
  end if;
  return new;
end;
$$;

create trigger player_attribute_observation_confirmations_reference
before insert on app_private.player_attribute_observation_confirmations
for each row execute function app_private.player_attribute_observation_confirmations_reference();
create trigger player_attribute_observation_confirmations_no_truncate
before truncate on app_private.player_attribute_observation_confirmations
for each statement execute function app_private.player_attribute_observation_confirmations_append_only();

-- When an observation's value was last seen.
create function app_private.player_attribute_observation_freshness(p_observation_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    observation.observed_at,
    (select max(confirmation.observed_at)
     from app_private.player_attribute_observation_confirmations confirmation
     where confirmation.observation_id = observation.id)
  )
  from app_private.player_attribute_observations observation
  where observation.id = p_observation_id;
$$;

-- ---------------------------------------------------------------------------
-- Source priority: lower wins
-- ---------------------------------------------------------------------------
create table app_private.player_attribute_source_priority (
  attribute text not null,
  source_key text not null,
  priority smallint not null,
  primary key (attribute, source_key),
  constraint player_attribute_source_priority_priority_check check (priority between 1 and 1000)
);

comment on table app_private.player_attribute_source_priority is
  'Which source wins per attribute; lower wins. A provider without its own row ranks 50: after the configured providers, before legacy.';

alter table app_private.player_attribute_source_priority enable row level security;
alter table app_private.player_attribute_source_priority force row level security;
revoke all on table app_private.player_attribute_source_priority
  from public, anon, authenticated, service_role;

insert into app_private.player_attribute_source_priority (attribute, source_key, priority)
select attribute, source.key, source.priority
from unnest(array[
  'date_of_birth', 'nationality', 'preferred_foot', 'height_cm', 'detailed_position'
]) attribute
cross join (values
  ('manual', 10), ('sportsmonks', 20), ('bsd', 30), ('derived', 40), ('legacy', 90)
) source(key, priority);

-- ---------------------------------------------------------------------------
-- Recording an observation
-- ---------------------------------------------------------------------------
create function app_private.record_player_attribute_observation(
  p_player_id uuid,
  p_attribute text,
  p_value_text text,
  p_value_numeric numeric,
  p_source_kind text,
  p_provider_name text,
  p_source_ref text,
  p_observed_at timestamptz,
  p_recorded_by uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_key text := coalesce(p_provider_name, p_source_kind);
  v_current app_private.player_attribute_observations%rowtype;
  v_freshness timestamptz;
  v_date date;
  v_new_id uuid;
begin
  if p_player_id is null or p_observed_at is null then
    raise exception using errcode = '23514', message = 'INVALID_ATTRIBUTE_VALUE';
  end if;
  if not exists (select 1 from app.players where id = p_player_id) then
    raise exception using errcode = 'P0002', message = 'PLAYER_NOT_FOUND';
  end if;

  -- The value must be one the column can hold, so the resolver never fails on
  -- it. check_violation, so provider importers map it to their payload error.
  case p_attribute
    when 'date_of_birth' then
      if p_value_numeric is not null or p_value_text is null
        or p_value_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then
        raise exception using errcode = '23514', message = 'INVALID_ATTRIBUTE_VALUE';
      end if;
      begin
        v_date := p_value_text::date;
      exception when others then
        raise exception using errcode = '23514', message = 'INVALID_ATTRIBUTE_VALUE';
      end;
      if v_date not between date '1900-01-01' and current_date then
        raise exception using errcode = '23514', message = 'INVALID_ATTRIBUTE_VALUE';
      end if;
    when 'nationality' then
      if p_value_numeric is not null or p_value_text is null
        or not exists (select 1 from app.countries where iso_alpha2 = p_value_text)
      then
        raise exception using errcode = '23514', message = 'INVALID_ATTRIBUTE_VALUE';
      end if;
    when 'preferred_foot' then
      if p_value_numeric is not null or p_value_text is null
        or p_value_text not in ('left', 'right', 'both')
      then
        raise exception using errcode = '23514', message = 'INVALID_ATTRIBUTE_VALUE';
      end if;
    when 'height_cm' then
      if p_value_text is not null or p_value_numeric is null
        or p_value_numeric <> trunc(p_value_numeric)
        or p_value_numeric not between 140 and 215
      then
        raise exception using errcode = '23514', message = 'INVALID_ATTRIBUTE_VALUE';
      end if;
    when 'detailed_position' then
      if p_value_numeric is not null or p_value_text is null
        or p_value_text not in ('gk', 'cb', 'lb', 'rb', 'dm', 'cm', 'am', 'lw', 'rw', 'cf')
      then
        raise exception using errcode = '23514', message = 'INVALID_ATTRIBUTE_VALUE';
      end if;
    else
      raise exception using errcode = '23514', message = 'INVALID_ATTRIBUTE_VALUE';
  end case;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('player_attribute:' || p_player_id || ':' || p_attribute, 0)
  );

  select * into v_current
  from app_private.player_attribute_observations observation
  where observation.player_id = p_player_id
    and observation.attribute = p_attribute
    and observation.source_key = v_source_key
    and observation.superseded_at is null;

  if found then
    v_freshness := app_private.player_attribute_observation_freshness(v_current.id);
    -- The same value again: nothing new unless it was seen later than before,
    -- in which case that sighting is kept as a confirmation, moving the
    -- observation's freshness forward.
    if v_current.value_text is not distinct from p_value_text
      and v_current.value_numeric is not distinct from p_value_numeric
    then
      if p_observed_at > v_freshness then
        insert into app_private.player_attribute_observation_confirmations (
          observation_id, observed_at, source_ref, recorded_by, note
        ) values (
          v_current.id, p_observed_at, p_source_ref, p_recorded_by, p_note
        );
      end if;
      return v_current.id;
    end if;
    -- A different value seen before the current one was last seen is stale.
    if p_observed_at < v_freshness then
      return v_current.id;
    end if;
    update app_private.player_attribute_observations
    set superseded_at = statement_timestamp()
    where id = v_current.id;
  end if;

  insert into app_private.player_attribute_observations (
    player_id, attribute, value_text, value_numeric, source_kind, provider_name,
    source_ref, observed_at, recorded_by, note
  ) values (
    p_player_id, p_attribute, p_value_text, p_value_numeric, p_source_kind, p_provider_name,
    p_source_ref, p_observed_at, p_recorded_by, p_note
  )
  returning id into v_new_id;
  return v_new_id;
end;
$$;

comment on function app_private.record_player_attribute_observation(
  uuid, text, text, numeric, text, text, text, timestamptz, uuid, text
) is
  'Records one attribute observation: validated; the same value seen later is kept as a confirmation (freshness); a different value supersedes only if seen at or after the current value was last seen. Does not write app.players: call resolve_player_attributes after.';

-- ---------------------------------------------------------------------------
-- The single writer
-- ---------------------------------------------------------------------------
create function app_private.resolve_player_attributes(p_player_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_flag text := current_setting('botolago.player_attribute_writer', true);
  v_changed integer := 0;
begin
  if p_player_ids is null or cardinality(p_player_ids) = 0 then
    return 0;
  end if;

  perform 1 from app.players player
  where player.id = any(p_player_ids)
  order by player.id
  for update;

  perform pg_catalog.set_config('botolago.player_attribute_writer', 'resolver', true);

  with winners as (
    select distinct on (observation.player_id, observation.attribute)
      observation.player_id, observation.attribute,
      observation.value_text, observation.value_numeric
    from app_private.player_attribute_observations observation
    left join app_private.player_attribute_source_priority priority
      on priority.attribute = observation.attribute
      and priority.source_key = observation.source_key
    where observation.player_id = any(p_player_ids)
      and observation.superseded_at is null
    order by observation.player_id, observation.attribute,
      coalesce(priority.priority, 50),
      app_private.player_attribute_observation_freshness(observation.id) desc,
      observation.created_at desc, observation.id
  ),
  resolved as (
    select player.id,
      (select winner.value_text::date from winners winner
        where winner.player_id = player.id and winner.attribute = 'date_of_birth') as date_of_birth,
      (select country.id from winners winner
        join app.countries country on country.iso_alpha2 = winner.value_text
        where winner.player_id = player.id and winner.attribute = 'nationality') as nationality_country_id,
      coalesce((select winner.value_text::app.preferred_foot from winners winner
        where winner.player_id = player.id and winner.attribute = 'preferred_foot'),
        'unknown'::app.preferred_foot) as preferred_foot,
      (select winner.value_numeric::smallint from winners winner
        where winner.player_id = player.id and winner.attribute = 'height_cm') as height_cm,
      (select winner.value_text::app.detailed_position from winners winner
        where winner.player_id = player.id and winner.attribute = 'detailed_position') as detailed_position
    from app.players player
    where player.id = any(p_player_ids)
  )
  update app.players player set
    date_of_birth = resolved.date_of_birth,
    nationality_country_id = resolved.nationality_country_id,
    preferred_foot = resolved.preferred_foot,
    height_cm = resolved.height_cm,
    detailed_position = resolved.detailed_position
  from resolved
  where player.id = resolved.id
    and (player.date_of_birth, player.nationality_country_id, player.preferred_foot,
      player.height_cm, player.detailed_position)
      is distinct from (resolved.date_of_birth, resolved.nationality_country_id,
      resolved.preferred_foot, resolved.height_cm, resolved.detailed_position);
  get diagnostics v_changed = row_count;

  -- Restore the flag at once, so a later write in the same transaction is
  -- judged on its own.
  perform pg_catalog.set_config('botolago.player_attribute_writer', coalesce(v_previous_flag, ''), true);
  return v_changed;
exception when others then
  perform pg_catalog.set_config('botolago.player_attribute_writer', coalesce(v_previous_flag, ''), true);
  raise;
end;
$$;

comment on function app_private.resolve_player_attributes(uuid[]) is
  'The only writer of app.players date_of_birth, nationality_country_id, preferred_foot, height_cm and detailed_position: per attribute the current observation of the best-ranked source (ties: the latest sighting, confirmations included), or null (foot: unknown) when there is none. Returns the number of players changed.';

-- Recording what a provider says about a player, then resolving. The two
-- provider importers call this instead of assigning the columns.
create function app_private.record_provider_player_attributes(
  p_player_id uuid,
  p_provider_name text,
  p_source_ref text,
  p_date_of_birth date,
  p_preferred_foot app.preferred_foot,
  p_observed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_date_of_birth is not null then
    perform app_private.record_player_attribute_observation(
      p_player_id, 'date_of_birth', p_date_of_birth::text, null,
      'provider', p_provider_name, p_source_ref, p_observed_at
    );
  end if;
  if p_preferred_foot is not null and p_preferred_foot <> 'unknown' then
    perform app_private.record_player_attribute_observation(
      p_player_id, 'preferred_foot', p_preferred_foot::text, null,
      'provider', p_provider_name, p_source_ref, p_observed_at
    );
  end if;
  perform app_private.resolve_player_attributes(array[p_player_id]);
end;
$$;

-- ---------------------------------------------------------------------------
-- Disagreements, for the data desk
-- ---------------------------------------------------------------------------
create view app_private.player_attribute_conflicts
with (security_invoker = true)
as
select observation.player_id,
  observation.attribute,
  pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'source', observation.source_key,
      'value', coalesce(observation.value_text, observation.value_numeric::text),
      'observedAt', observation.observed_at,
      'lastSeenAt', app_private.player_attribute_observation_freshness(observation.id),
      'observationId', observation.id
    )
    order by coalesce(priority.priority, 50),
      app_private.player_attribute_observation_freshness(observation.id) desc
  ) as observations
from app_private.player_attribute_observations observation
left join app_private.player_attribute_source_priority priority
  on priority.attribute = observation.attribute
  and priority.source_key = observation.source_key
where observation.superseded_at is null
group by observation.player_id, observation.attribute
having count(distinct coalesce(observation.value_text, observation.value_numeric::text)) > 1;

comment on view app_private.player_attribute_conflicts is
  'Players whose current observations disagree on an attribute, best source first. The data-desk sweep turns these into issues.';

revoke all on app_private.player_attribute_conflicts from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seed existing values as legacy (unverified)
-- ---------------------------------------------------------------------------
-- A function, so it can be tested and re-run: a value that already has a
-- current legacy observation is skipped. Returns the number recorded.
create function app_private.seed_legacy_player_attributes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seeded integer;
begin
  insert into app_private.player_attribute_observations (
    player_id, attribute, value_text, source_kind, source_ref, observed_at, note
  )
  select player.id, seeded.attribute, seeded.value_text, 'legacy',
    'seed:20260926060000', coalesce(player.updated_at, player.created_at),
    'Unverified: present before provenance was recorded.'
  from app.players player
  cross join lateral (values
    ('date_of_birth', player.date_of_birth::text),
    ('nationality', (select country.iso_alpha2 from app.countries country
      where country.id = player.nationality_country_id)),
    ('preferred_foot', nullif(player.preferred_foot::text, 'unknown'))
  ) seeded(attribute, value_text)
  where seeded.value_text is not null
    and not exists (
      select 1 from app_private.player_attribute_observations existing
      where existing.player_id = player.id
        and existing.attribute = seeded.attribute
        and existing.source_key = 'legacy'
        and existing.superseded_at is null
    );
  get diagnostics v_seeded = row_count;
  return v_seeded;
end;
$$;

select app_private.seed_legacy_player_attributes();

-- ---------------------------------------------------------------------------
-- Provider importers: record, do not assign
-- ---------------------------------------------------------------------------
create or replace function api.ingest_football_squad(
  p_provider_name text,
  p_season_external_id text,
  p_team_external_id text,
  p_memberships jsonb,
  p_observed_at timestamptz,
  p_source_sequence bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_team_id uuid;
  v_season_starts_on date;
  v_season_ends_on date;
  v_item jsonb;
  v_external_player_id text;
  v_player_id uuid;
  v_membership_id uuid;
  v_mapped_last_seen_at timestamptz;
  v_mapped_source_version text;
  v_player_updated_at timestamptz;
  v_player_source_sequence bigint;
  v_source_version text;
  v_full_name text;
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_date_of_birth date;
  v_position app.football_position;
  v_preferred_foot app.preferred_foot;
  v_shirt_number integer;
  v_players_inserted integer := 0;
  v_players_updated integer := 0;
  v_players_skipped integer := 0;
  v_memberships_inserted integer := 0;
  v_memberships_updated integer := 0;
begin
  if p_provider_name is null
    or p_season_external_id is null
    or p_team_external_id is null
    or p_observed_at is null
    or p_source_sequence is null
    or p_source_sequence < 0
    or p_season_external_id <> btrim(p_season_external_id)
    or p_team_external_id <> btrim(p_team_external_id)
    or char_length(p_season_external_id) not between 1 and 200
    or char_length(p_team_external_id) not between 1 and 200
    or p_memberships is null
    or jsonb_typeof(p_memberships) <> 'array'
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if jsonb_array_length(p_memberships) > 100
    or octet_length(p_memberships::text) > 262144
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if not exists (
    select 1 from app_private.football_providers
    where name = p_provider_name and active
  ) then
    raise exception using errcode = 'P0002', message = 'PROVIDER_NOT_FOUND';
  end if;

  select mapping.internal_entity_id
  into v_season_id
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = 'season'
    and mapping.external_id = p_season_external_id
    and mapping.active;
  select mapping.internal_entity_id
  into v_team_id
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = 'team'
    and mapping.external_id = p_team_external_id
    and mapping.active;
  if v_season_id is null or v_team_id is null then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;
  select starts_on, ends_on
  into v_season_starts_on, v_season_ends_on
  from app.seasons
  where id = v_season_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_provider_name || ':squad:' || p_season_external_id || ':' || p_team_external_id,
      0
    )
  );

  for v_item in select value from jsonb_array_elements(p_memberships)
  loop
    if jsonb_typeof(v_item) <> 'object' or octet_length(v_item::text) > 8192 then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
    begin
      v_external_player_id := nullif(v_item ->> 'externalPlayerId', '');
      v_full_name := nullif(btrim(v_item ->> 'fullName'), '');
      v_display_name := nullif(btrim(v_item ->> 'displayName'), '');
      v_first_name := nullif(btrim(v_item ->> 'firstName'), '');
      v_last_name := nullif(btrim(v_item ->> 'lastName'), '');
      v_date_of_birth := nullif(v_item ->> 'dateOfBirth', '')::date;
      v_position := (v_item ->> 'position')::app.football_position;
      v_preferred_foot := coalesce(v_item ->> 'preferredFoot', 'unknown')::app.preferred_foot;
      v_shirt_number := nullif(v_item ->> 'shirtNumber', '')::integer;
      v_player_updated_at := (v_item #>> '{freshness,updatedAt}')::timestamptz;
      v_player_source_sequence := (v_item #>> '{freshness,sourceSequence}')::bigint;
      v_source_version := nullif(v_item #>> '{freshness,sourceVersion}', '');
    exception when invalid_text_representation or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end;
    if v_external_player_id is null
      or v_external_player_id <> btrim(v_external_player_id)
      or char_length(v_external_player_id) not between 1 and 200
      or v_full_name is null
      or v_display_name is null
      or v_position is null
      or v_player_updated_at is null
      or v_player_source_sequence is null
      or v_player_source_sequence < 0
      or v_source_version is null
    then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        p_provider_name || ':player:' || v_external_player_id,
        0
      )
    );
    select mapping.internal_entity_id, mapping.last_seen_at, mapping.source_version
    into v_player_id, v_mapped_last_seen_at, v_mapped_source_version
    from app_private.football_provider_mappings mapping
    where mapping.provider_name = p_provider_name
      and mapping.entity_type = 'player'
      and mapping.external_id = v_external_player_id
      and mapping.active;

    if v_mapped_last_seen_at is not null and v_player_updated_at < v_mapped_last_seen_at then
      raise exception using errcode = 'P0001', message = 'STALE_UPDATE';
    end if;
    if v_player_id is null then
      v_player_id := gen_random_uuid();
      insert into app.players (
        id, slug, full_name, display_name, first_name, last_name,
        position, active
      ) values (
        v_player_id,
        app_private.football_catalog_slug('player', v_display_name, v_player_id),
        v_full_name, v_display_name, v_first_name, v_last_name,
        v_position, true
      );
      -- Date of birth and foot: recorded as observations, then resolved.
      perform app_private.record_provider_player_attributes(
        v_player_id, p_provider_name, v_external_player_id,
        v_date_of_birth, v_preferred_foot, v_player_updated_at
      );
      v_players_inserted := v_players_inserted + 1;
    elsif v_mapped_last_seen_at = v_player_updated_at
      and v_mapped_source_version is not distinct from v_source_version
    then
      v_players_skipped := v_players_skipped + 1;
    else
      update app.players set
        full_name = v_full_name,
        display_name = v_display_name,
        first_name = v_first_name,
        last_name = v_last_name,
        position = v_position,
        active = true
      where id = v_player_id;
      -- Date of birth and foot: recorded as observations, then resolved.
      perform app_private.record_provider_player_attributes(
        v_player_id, p_provider_name, v_external_player_id,
        v_date_of_birth, v_preferred_foot, v_player_updated_at
      );
      v_players_updated := v_players_updated + 1;
    end if;
    perform api.resolve_football_mapping(
      p_provider_name, 'player', v_external_player_id, v_player_id,
      v_source_version, v_player_updated_at
    );

    select membership.id
    into v_membership_id
    from app.team_memberships membership
    where membership.player_id = v_player_id
      and membership.team_id = v_team_id
      and membership.season_id = v_season_id
      and membership.valid_from = v_season_starts_on;
    if v_membership_id is null then
      insert into app.team_memberships (
        player_id, team_id, season_id, shirt_number, squad_role,
        valid_from, valid_to, active
      ) values (
        v_player_id, v_team_id, v_season_id, v_shirt_number, 'player',
        v_season_starts_on, v_season_ends_on, false
      );
      v_memberships_inserted := v_memberships_inserted + 1;
    else
      update app.team_memberships set
        shirt_number = v_shirt_number,
        squad_role = 'player',
        valid_to = v_season_ends_on,
        active = false
      where id = v_membership_id;
      v_memberships_updated := v_memberships_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'playersInserted', v_players_inserted,
    'playersUpdated', v_players_updated,
    'playersSkipped', v_players_skipped,
    'membershipsInserted', v_memberships_inserted,
    'membershipsUpdated', v_memberships_updated
  );
exception
  when foreign_key_violation then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  when check_violation or not_null_violation or string_data_right_truncation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'MAPPING_COLLISION';
end;
$$;

revoke all on function api.ingest_football_squad(text, text, text, jsonb, timestamptz, bigint)
  from public, anon, authenticated, service_role;
grant execute on function api.ingest_football_squad(text, text, text, jsonb, timestamptz, bigint)
  to service_role;

create or replace function api.service_apply_current_player_list(
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
        position, active
      ) values (
        target_player_id,
        app_private.football_catalog_slug('player', change ->> 'displayName', target_player_id),
        change ->> 'name', change ->> 'displayName', change ->> 'firstName', change ->> 'lastName',
        (change ->> 'position')::app.football_position, true
      );
      -- Date of birth: recorded as a SportsMonks observation, then resolved.
      perform app_private.record_provider_player_attributes(
        target_player_id, 'sportsmonks', change ->> 'externalPlayerId',
        (change ->> 'dateOfBirth')::date, 'unknown', observation.observed_at
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

revoke all on function api.service_apply_current_player_list(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function api.service_apply_current_player_list(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Seeding changed nothing: resolve every player and require zero changes
-- ---------------------------------------------------------------------------
do $$
declare
  changed integer;
begin
  changed := app_private.resolve_player_attributes(array(select id from app.players));
  if changed <> 0 then
    raise exception using errcode = 'P0001',
      message = 'PLAYER_ATTRIBUTE_SEED_WOULD_CHANGE_VALUES',
      detail = changed || ' player(s) would change';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The guard: nothing but the resolver writes the five columns
-- ---------------------------------------------------------------------------
-- Whether a country row exists, read as the owner so the answer does not
-- depend on the row-level security of whoever caused the update.
create function app_private.country_exists(p_country_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app.countries country where country.id = p_country_id);
$$;

create function app_private.players_attribute_writer_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('botolago.player_attribute_writer', true), '') = 'resolver' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.date_of_birth is not null
      or new.nationality_country_id is not null
      or new.preferred_foot <> 'unknown'
      or new.height_cm is not null
      or new.detailed_position is not null
    then
      raise exception using errcode = '55000', message = 'PLAYER_ATTRIBUTES_RESOLVER_ONLY';
    end if;
  elsif (new.date_of_birth, new.nationality_country_id, new.preferred_foot,
      new.height_cm, new.detailed_position)
    is distinct from (old.date_of_birth, old.nationality_country_id, old.preferred_foot,
      old.height_cm, old.detailed_position)
  then
    -- The one change allowed without the resolver: the foreign key's
    -- ON DELETE SET NULL after the player's country was deleted. Only the
    -- nationality changes, only to null, and only when its country is gone.
    -- The resolver agrees afterwards: the observation's ISO code no longer
    -- matches a country, so it resolves to null too.
    if new.nationality_country_id is null
      and old.nationality_country_id is not null
      and (new.date_of_birth, new.preferred_foot, new.height_cm, new.detailed_position)
        is not distinct from (old.date_of_birth, old.preferred_foot, old.height_cm,
          old.detailed_position)
      and not app_private.country_exists(old.nationality_country_id)
    then
      return new;
    end if;
    raise exception using errcode = '55000', message = 'PLAYER_ATTRIBUTES_RESOLVER_ONLY';
  end if;
  return new;
end;
$$;

create trigger players_attribute_writer_guard
before insert or update on app.players
for each row execute function app_private.players_attribute_writer_guard();

-- ---------------------------------------------------------------------------
-- Grants: none of the new functions is callable by a client
-- ---------------------------------------------------------------------------
revoke all on function app_private.player_attribute_observations_append_only()
  from public, anon, authenticated, service_role;
revoke all on function app_private.record_player_attribute_observation(
  uuid, text, text, numeric, text, text, text, timestamptz, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function app_private.resolve_player_attributes(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function app_private.record_provider_player_attributes(
  uuid, text, text, date, app.preferred_foot, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.players_attribute_writer_guard()
  from public, anon, authenticated, service_role;
revoke all on function app_private.seed_legacy_player_attributes()
  from public, anon, authenticated, service_role;
revoke all on function app_private.player_attribute_observation_confirmations_append_only()
  from public, anon, authenticated, service_role;
revoke all on function app_private.player_attribute_observation_confirmations_reference()
  from public, anon, authenticated, service_role;
revoke all on function app_private.player_attribute_observation_freshness(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.country_exists(uuid)
  from public, anon, authenticated, service_role;
