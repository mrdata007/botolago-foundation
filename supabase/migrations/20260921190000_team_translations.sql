-- BotolaGO — BG-0068: Arabic club names.
--
-- The master plan's TEAM_TRANSLATIONS was never built. Competition, venue,
-- country and taxonomy translations all exist; teams do not. Every Football
-- read therefore hands the browser `app.teams.name` -- a Latin string -- even
-- when the caller asked for `ar`, so an Arabic reader sees every club in the
-- league spelled in a foreign alphabet.
--
-- This migration adds the missing table and teaches the single helper that
-- every language-aware team read already funnels through to prefer it.
--
-- The table ships EMPTY. `coalesce(translation.name, team.name)` means an
-- empty table reproduces today's output byte for byte, so this migration is
-- safe to apply before the Arabic names have been reviewed. Seeding is a
-- separate, owner-approved step:
-- scripts/backend/football-team-arabic-names-seed.sql.

-- ---------------------------------------------------------------------------
-- app.team_translations
-- ---------------------------------------------------------------------------
-- Shape, constraints, RLS and grants mirror app.competition_translations
-- (20260720095330_football_catalog.sql) deliberately rather than inventing a
-- new posture: catalog data is trusted-server write only, RLS is forced even
-- for table owners, and there are intentionally no browser policies and no
-- object grants. The browser never touches this table directly -- it reads it
-- only through the `security definer` api.* functions that wrap the helper
-- below.

create table app.team_translations (
  team_id uuid not null references app.teams(id) on delete cascade,
  language app.language_code not null,
  name text not null,
  short_name text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint team_translations_pkey primary key (team_id, language),
  constraint team_translations_name_check check (
    name = btrim(name) and char_length(name) between 2 and 160
  ),
  constraint team_translations_short_name_check check (
    short_name is null
      or (short_name = btrim(short_name) and char_length(short_name) between 1 and 40)
  )
);

alter table app.team_translations enable row level security;
alter table app.team_translations force row level security;

create trigger team_translations_set_updated_at before update on app.team_translations
for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- app_private.football_team_json
-- ---------------------------------------------------------------------------
-- This helper is the one place a team becomes JSON. api.football_team_catalog,
-- api.football_team_summary, api.football_standings and -- via
-- app_private.football_match_json -- api.football_match_detail all call it,
-- and nothing else builds a team object. Translating here covers all four
-- without touching a single signature, filter, join or ORDER BY in them.
--
-- In particular api.football_team_catalog still orders by `team.name` (the
-- Latin column) and api.football_standings still orders by `standing.rank,
-- standing.team_id`. Ordering deliberately does NOT follow the translation:
-- pinning it to the Latin name keeps the two languages paginating and
-- rendering in the same order, and keeps this migration out of the ORDER BY
-- of six live functions.
--
-- Body diffed against production's pg_get_functiondef. Changed: the 'name' and
-- 'shortName' expressions, plus the one LEFT JOIN that feeds them. The join is
-- LEFT and keyed on the target table's primary key, so it can neither drop a
-- row nor duplicate one. Every other key, cast, join and predicate is
-- byte-identical, as are `language sql`, `stable`, `security invoker` and
-- `set search_path = ''`.
--
-- `requested_language` was already accepted, and already validated by every
-- caller through app_private.football_language(); until now this function
-- simply ignored it. app_private.football_competition_json resolves the enum
-- with exactly this expression, so the same convention is reused rather than a
-- second one invented.

create or replace function app_private.football_team_json(
  target_team_id uuid,
  requested_language text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', team.id,
    'slug', team.slug,
    'name', coalesce(translation.name, team.name),
    'shortName', coalesce(translation.short_name, team.short_name),
    'code', team.code,
    'city', team.city,
    'countryCode', country.iso_alpha2,
    'crestUrl', case
      when media.validation_status = 'validated' then media.source_url
      else null
    end,
    'crestPath', case
      when media.validation_status = 'validated' then media.storage_path
      else null
    end,
    'primaryColor', team.primary_color,
    'secondaryColor', team.secondary_color,
    'active', team.active
  )
  from app.teams team
  left join app.team_translations translation
    on translation.team_id = team.id
   and translation.language = app_private.football_language(requested_language)
  left join app.countries country on country.id = team.country_id
  left join app.media_assets media on media.id = team.crest_asset_id
  where team.id = target_team_id;
$$;

-- Restated exactly as production holds them. This helper lives in app_private
-- and is never called by a browser; only the `security definer` api.* wrappers
-- reach it, and they run as their owner.
revoke all on function app_private.football_team_json(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.football_team_json(uuid, text) to postgres;

-- No app-schema type is named in any signature this migration touches:
-- app.language_code is produced and consumed entirely inside function bodies,
-- never coerced in a caller's context. This is the BG-0063 trap, and avoiding
-- it is why `anon` still needs no USAGE on `app` after this migration.

-- ---------------------------------------------------------------------------
-- api.fantasy_player_pool and api.fantasy_fixture_difficulty
-- ---------------------------------------------------------------------------
-- Both are deliberately NOT modified here. See
-- docs/engineering/tasks/BG-0068/implementation-report.yaml.
--
-- api.fantasy_fixture_difficulty(p_season_id, p_from_gameweek,
-- p_gameweek_count) emits fixtureId / gameweekId / gameweek / clubId /
-- opponentClubId / kickoffAt / isHome / difficulty / confidence /
-- algorithmVersion. There is no team name in the payload to translate; the
-- planner resolves club names from the catalog, which this migration fixes.
--
-- api.fantasy_player_pool(...) DOES emit `teamName` and `teamShortName`, and
-- they are Latin in Arabic today. It takes no language argument, and it cannot
-- be given one here: CREATE OR REPLACE cannot add a parameter, so it would
-- take a DROP -- a signature change, which the brief forbids, and which the
-- generated Supabase types, src/backend/fantasy/supabase-repository.ts and 22
-- Playwright journeys are pinned to. The alternative of inferring the language
-- from `request.headers` was written and then rejected: nothing in this
-- codebase sends `Accept-Language`, so it would key the squad builder's club
-- names off the viewer's browser locale rather than the app's selected
-- language -- a silent, wrong answer instead of an honest Latin one. Giving
-- this function a `p_language` belongs to its own release, alongside the type
-- regeneration and the journey updates.
