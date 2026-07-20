-- BotolaGO Production V2
-- Phase 3A: canonical football catalog.
--
-- This migration is additive. Canonical UUIDs are provider-independent, all
-- product tables are non-exposed and deny browser access, and no legacy data
-- or identifier is replayed.

create type app.competition_type as enum (
  'league',
  'cup',
  'super_cup',
  'international',
  'friendly'
);
create type app.season_status as enum ('planned', 'active', 'completed', 'cancelled');
create type app.round_status as enum ('planned', 'active', 'completed', 'cancelled');
create type app.football_position as enum ('goalkeeper', 'defender', 'midfielder', 'forward');
create type app.preferred_foot as enum ('left', 'right', 'both', 'unknown');
create type app.squad_role as enum ('player', 'captain', 'vice_captain', 'reserve');
create type app.media_kind as enum ('competition_logo', 'team_crest', 'player_photo', 'venue_image');
create type app.media_validation_status as enum ('pending', 'validated', 'rejected', 'expired');

create table app.media_assets (
  id uuid primary key default gen_random_uuid(),
  kind app.media_kind not null,
  source_url text,
  storage_path text,
  attribution text,
  license_code text,
  validation_status app.media_validation_status not null default 'pending',
  validated_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint media_assets_single_location_check check (
    num_nonnulls(source_url, storage_path) = 1
  ),
  constraint media_assets_source_url_check check (
    source_url is null
    or (
      source_url ~ '^https://[^[:space:]]+$'
      and source_url !~* '(access[_-]?token|api[_-]?key|signature|credential)='
    )
  ),
  constraint media_assets_storage_path_check check (
    storage_path is null
    or storage_path ~ '^football/[a-z0-9/_-]+[.](avif|jpg|jpeg|png|webp)$'
  ),
  constraint media_assets_validation_timestamp_check check (
    (validation_status = 'validated' and validated_at is not null)
    or (validation_status <> 'validated')
  )
);

comment on table app.media_assets is
  'Trusted Football media references. Browser upload is forbidden; copying third-party assets requires documented rights.';

create table app.countries (
  id uuid primary key default gen_random_uuid(),
  iso_alpha2 text not null,
  iso_alpha3 text not null,
  flag_emoji text,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint countries_iso_alpha2_key unique (iso_alpha2),
  constraint countries_iso_alpha3_key unique (iso_alpha3),
  constraint countries_iso_alpha2_check check (iso_alpha2 ~ '^[A-Z]{2}$'),
  constraint countries_iso_alpha3_check check (iso_alpha3 ~ '^[A-Z]{3}$'),
  constraint countries_flag_emoji_check check (
    flag_emoji is null or char_length(flag_emoji) between 1 and 8
  )
);

create table app.country_translations (
  country_id uuid not null references app.countries(id) on delete cascade,
  language app.language_code not null,
  display_name text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint country_translations_pkey primary key (country_id, language),
  constraint country_translations_name_check check (
    display_name = btrim(display_name) and char_length(display_name) between 2 and 120
  )
);

create table app.venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  default_name text not null,
  city text,
  country_id uuid references app.countries(id) on delete restrict,
  capacity integer,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  media_asset_id uuid references app.media_assets(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint venues_slug_key unique (slug),
  constraint venues_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint venues_name_check check (
    default_name = btrim(default_name) and char_length(default_name) between 2 and 160
  ),
  constraint venues_city_check check (
    city is null or (city = btrim(city) and char_length(city) between 2 and 120)
  ),
  constraint venues_capacity_check check (capacity is null or capacity between 0 and 250000),
  constraint venues_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint venues_longitude_check check (longitude is null or longitude between -180 and 180)
);

create table app.venue_translations (
  venue_id uuid not null references app.venues(id) on delete cascade,
  language app.language_code not null,
  display_name text not null,
  city_name text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint venue_translations_pkey primary key (venue_id, language),
  constraint venue_translations_name_check check (
    display_name = btrim(display_name) and char_length(display_name) between 2 and 160
  ),
  constraint venue_translations_city_check check (
    city_name is null or (city_name = btrim(city_name) and char_length(city_name) between 2 and 120)
  )
);

create table app.competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  short_name text,
  competition_type app.competition_type not null,
  country_id uuid references app.countries(id) on delete restrict,
  logo_asset_id uuid references app.media_assets(id) on delete set null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint competitions_slug_key unique (slug),
  constraint competitions_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint competitions_name_check check (
    name = btrim(name) and char_length(name) between 2 and 160
  ),
  constraint competitions_short_name_check check (
    short_name is null or (short_name = btrim(short_name) and char_length(short_name) between 1 and 40)
  ),
  constraint competitions_display_order_check check (display_order between 0 and 100000)
);

create table app.competition_translations (
  competition_id uuid not null references app.competitions(id) on delete cascade,
  language app.language_code not null,
  display_name text not null,
  short_name text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint competition_translations_pkey primary key (competition_id, language),
  constraint competition_translations_name_check check (
    display_name = btrim(display_name) and char_length(display_name) between 2 and 160
  ),
  constraint competition_translations_short_name_check check (
    short_name is null or (short_name = btrim(short_name) and char_length(short_name) between 1 and 40)
  )
);

create table app.seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references app.competitions(id) on delete restrict,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  status app.season_status not null default 'planned',
  is_current boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint seasons_competition_label_key unique (competition_id, label),
  constraint seasons_label_check check (
    label = btrim(label) and char_length(label) between 2 and 40
  ),
  constraint seasons_date_range_check check (ends_on >= starts_on)
);

create unique index seasons_one_current_per_competition_key
  on app.seasons (competition_id)
  where is_current;
create index seasons_competition_dates_idx
  on app.seasons (competition_id, starts_on desc, id);

create table app.rounds (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references app.seasons(id) on delete cascade,
  round_number integer,
  name text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status app.round_status not null default 'planned',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint rounds_season_name_key unique (season_id, name),
  constraint rounds_season_number_key unique nulls not distinct (season_id, round_number),
  constraint rounds_number_check check (round_number is null or round_number between 1 and 1000),
  constraint rounds_name_check check (
    name = btrim(name) and char_length(name) between 1 and 120
  ),
  constraint rounds_timestamp_range_check check (
    starts_at is null or ends_at is null or ends_at >= starts_at
  )
);

create index rounds_season_time_idx on app.rounds (season_id, starts_at, id);

create table app.teams (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  short_name text not null,
  code text,
  country_id uuid references app.countries(id) on delete restrict,
  city text,
  crest_asset_id uuid references app.media_assets(id) on delete set null,
  venue_id uuid references app.venues(id) on delete set null,
  primary_color text,
  secondary_color text,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint teams_slug_key unique (slug),
  constraint teams_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint teams_name_check check (
    name = btrim(name) and char_length(name) between 2 and 160
  ),
  constraint teams_short_name_check check (
    short_name = btrim(short_name) and char_length(short_name) between 1 and 40
  ),
  constraint teams_code_check check (code is null or code ~ '^[A-Z0-9]{2,8}$'),
  constraint teams_city_check check (
    city is null or (city = btrim(city) and char_length(city) between 2 and 120)
  ),
  constraint teams_primary_color_check check (
    primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  constraint teams_secondary_color_check check (
    secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

create index teams_country_active_idx on app.teams (country_id, active, name, id);

create table app.players (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  full_name text not null,
  display_name text not null,
  first_name text,
  last_name text,
  date_of_birth date,
  nationality_country_id uuid references app.countries(id) on delete set null,
  position app.football_position not null,
  preferred_foot app.preferred_foot not null default 'unknown',
  photo_asset_id uuid references app.media_assets(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint players_slug_key unique (slug),
  constraint players_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint players_full_name_check check (
    full_name = btrim(full_name) and char_length(full_name) between 2 and 200
  ),
  constraint players_display_name_check check (
    display_name = btrim(display_name) and char_length(display_name) between 2 and 120
  ),
  constraint players_first_name_check check (
    first_name is null or (first_name = btrim(first_name) and char_length(first_name) between 1 and 100)
  ),
  constraint players_last_name_check check (
    last_name is null or (last_name = btrim(last_name) and char_length(last_name) between 1 and 100)
  ),
  constraint players_date_of_birth_check check (
    date_of_birth is null or date_of_birth between date '1900-01-01' and current_date
  )
);

create index players_position_active_idx on app.players (position, active, display_name, id);
create index players_nationality_idx on app.players (nationality_country_id, id);

create table app.team_memberships (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references app.players(id) on delete restrict,
  team_id uuid not null references app.teams(id) on delete restrict,
  season_id uuid references app.seasons(id) on delete restrict,
  shirt_number integer,
  squad_role app.squad_role not null default 'player',
  valid_from date not null,
  valid_to date,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint team_memberships_identity_key unique (player_id, team_id, season_id, valid_from),
  constraint team_memberships_shirt_number_check check (
    shirt_number is null or shirt_number between 1 and 99
  ),
  constraint team_memberships_date_range_check check (
    valid_to is null or valid_to >= valid_from
  )
);

create unique index team_memberships_team_season_shirt_active_key
  on app.team_memberships (team_id, season_id, shirt_number)
  where active and shirt_number is not null;
create index team_memberships_player_history_idx
  on app.team_memberships (player_id, valid_from desc, id);
create index team_memberships_team_current_idx
  on app.team_memberships (team_id, season_id, active, squad_role, shirt_number, id);

create or replace function app_private.prevent_overlapping_team_membership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.active and exists (
    select 1
    from app.team_memberships existing
    where existing.player_id = new.player_id
      and existing.active
      and existing.id <> new.id
      and existing.season_id is not distinct from new.season_id
      and daterange(existing.valid_from, coalesce(existing.valid_to, 'infinity'::date), '[]')
          && daterange(new.valid_from, coalesce(new.valid_to, 'infinity'::date), '[]')
  ) then
    raise exception using errcode = '23P01', message = 'OVERLAPPING_TEAM_MEMBERSHIP';
  end if;
  return new;
end;
$$;

revoke all on function app_private.prevent_overlapping_team_membership()
  from public, anon, authenticated, service_role;
grant execute on function app_private.prevent_overlapping_team_membership() to postgres;

create trigger team_memberships_prevent_overlap
before insert or update on app.team_memberships
for each row execute function app_private.prevent_overlapping_team_membership();

-- Phase 2 intentionally reserved these UUID columns. Phase 3 now binds them
-- to canonical Football entities without rewriting existing identity rows.
alter table app.user_preferences
  add constraint user_preferences_favorite_team_id_fkey
  foreign key (favorite_team_id) references app.teams(id) on delete set null;
alter table app.followed_teams
  add constraint followed_teams_team_id_fkey
  foreign key (team_id) references app.teams(id) on delete cascade;
alter table app.followed_competitions
  add constraint followed_competitions_competition_id_fkey
  foreign key (competition_id) references app.competitions(id) on delete cascade;

-- All catalog data is trusted-server write only. RLS is forced even for table
-- owners; there are intentionally no browser policies and no object grants.
alter table app.media_assets enable row level security;
alter table app.media_assets force row level security;
alter table app.countries enable row level security;
alter table app.countries force row level security;
alter table app.country_translations enable row level security;
alter table app.country_translations force row level security;
alter table app.venues enable row level security;
alter table app.venues force row level security;
alter table app.venue_translations enable row level security;
alter table app.venue_translations force row level security;
alter table app.competitions enable row level security;
alter table app.competitions force row level security;
alter table app.competition_translations enable row level security;
alter table app.competition_translations force row level security;
alter table app.seasons enable row level security;
alter table app.seasons force row level security;
alter table app.rounds enable row level security;
alter table app.rounds force row level security;
alter table app.teams enable row level security;
alter table app.teams force row level security;
alter table app.players enable row level security;
alter table app.players force row level security;
alter table app.team_memberships enable row level security;
alter table app.team_memberships force row level security;

create trigger media_assets_set_updated_at before update on app.media_assets
for each row execute function app_private.set_updated_at();
create trigger countries_set_updated_at before update on app.countries
for each row execute function app_private.set_updated_at();
create trigger country_translations_set_updated_at before update on app.country_translations
for each row execute function app_private.set_updated_at();
create trigger venues_set_updated_at before update on app.venues
for each row execute function app_private.set_updated_at();
create trigger venue_translations_set_updated_at before update on app.venue_translations
for each row execute function app_private.set_updated_at();
create trigger competitions_set_updated_at before update on app.competitions
for each row execute function app_private.set_updated_at();
create trigger competition_translations_set_updated_at before update on app.competition_translations
for each row execute function app_private.set_updated_at();
create trigger seasons_set_updated_at before update on app.seasons
for each row execute function app_private.set_updated_at();
create trigger rounds_set_updated_at before update on app.rounds
for each row execute function app_private.set_updated_at();
create trigger teams_set_updated_at before update on app.teams
for each row execute function app_private.set_updated_at();
create trigger players_set_updated_at before update on app.players
for each row execute function app_private.set_updated_at();
create trigger team_memberships_set_updated_at before update on app.team_memberships
for each row execute function app_private.set_updated_at();
