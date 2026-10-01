-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply the player-mapping backend as ONE change set, in ONE transaction:
--   20261001150000  register_sofascore_flashscore_providers
--   20261001160000  football_player_mapping_tables
--   20261001161000  football_player_mapping_functions
--
-- WHY ONE TRANSACTION
--   Once sofascore and flashscore are registered, the older generic
--   api.resolve_football_mapping could create their PLAYER mappings with no
--   proposer, no second person and no audit. 20261001161000 adds the guard that
--   closes that path. So production must never rest in a state where the
--   providers are registered but the guard is absent: all three or none.
--   (None of the three adds an enum value or uses a statement that cannot run
--   inside a transaction, so nothing forces a second transaction.)
--
-- WHAT IT CHANGES
--   * two rows in app_private.football_providers;
--   * three new tables (candidates, observations, proposals), empty, with forced
--     row level security and no grant to any role;
--   * 35 new functions (12 staff RPCs, 3 service-role jobs, 20 internal helpers);
--   * ONE existing function, api.resolve_football_mapping: the same text plus one
--     guard that refuses to CREATE a player mapping for sofascore or flashscore.
--   It writes no mapping row, no candidate, no proposal, no Fantasy row, no
--   score, no gameweek, no lineup, and installs no schedule. The sweeper and the
--   90-day name purge stay unscheduled.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running (AGENTS.md: one
--      writer at a time).
--   2. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside the transaction,
--      checked, and ROLLED BACK. The result row says "Rehearsal passed" and the
--      server messages carry the report.
--   3. To apply for real (ONLY after the owner has approved the commit): change
--      the line `rollback;` near the bottom to `commit;` and run again.
--   If any check fails the script stops with a message saying what, and nothing
--   is saved. Do NOT edit a check to make it pass: a check firing means the
--   database is not in the state this script was reviewed against.
--
-- THE REPORT CHANNEL (changes nothing but how the report is shown)
--   The next `select set_config(...)` line picks how the postflight report leaves
--   the transaction. 'notice' (as shipped) prints it as a server message.
--   'error' ends the transaction with a deliberate error whose message IS the
--   report, for a client that cannot show messages; the transaction is rolled
--   back either way. Neither value skips or weakens a check.
--
-- WHAT IT CHECKS BEFORE WRITING (preflight)
--   * this is production, not staging (no staging-only migration is recorded;
--     the latest production migration, 20261001071120, is);
--   * none of the three migrations is recorded, and none of their objects exist;
--   * providers are exactly fixture and sportsmonks;
--   * no mapping row names sofascore or flashscore;
--   * the mapping table's constraints equal the reviewed digest
--     (84d45fbd1c71c689561c39afe04094c9);
--   * api.resolve_football_mapping is the reviewed text
--     (md5 5d7ad20856e2bb22e2b7d44741e21be1);
--   * no other client session is working, and no scheduled job is running
--     (app_private.hold_scheduled_jobs, pinned), no Fantasy gameweek is
--     finalizing, the lifecycle tick is off.
--
-- WHAT IT CHECKS AFTER APPLYING, STILL INSIDE THE TRANSACTION (postflight)
--   providers; mapping table unchanged (rows, constraints, indexes, triggers,
--   a digest of every row); the three tables, their forced RLS, their lack of
--   grants and policies; the exact function set and every grant; the resolver
--   guard (probes); that the guarded resolver is the reviewed text plus only the
--   guard; dual control; and no side effects anywhere.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

select set_config('botolago.mapping_apply_report', 'notice', true);

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  v_providers text;
  v_active integer;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  -- Production, not staging.
  if exists (select 1 from supabase_migrations.schema_migrations
      where name in ('news_engine_core', 'news_engine_seed', 'fantasy_incremental_envelope_fail_closed')) then
    raise exception 'stop: a staging-only migration is recorded -- this looks like STAGING, not Production V2';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261001071120') then
    raise exception 'stop: the latest production migration 20261001071120 is not recorded -- is this Production V2?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations
      where version in ('20261001150000', '20261001160000', '20261001161000')
         or name in ('register_sofascore_flashscore_providers', 'football_player_mapping_tables', 'football_player_mapping_functions')) then
    raise exception 'stop: one of the three migrations is already recorded as applied';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261001071120') then
    raise exception 'stop: a migration newer than the reviewed baseline is recorded -- review this script against it first';
  end if;

  if to_regclass('app_private.football_providers') is null
    or to_regclass('app_private.football_provider_mappings') is null
    or to_regclass('app_private.admin_audit_events') is null
    or to_regclass('app_private.staff_principals') is null then
    raise exception 'stop: a table this change builds on is missing';
  end if;
  -- None of the new objects exists.
  if to_regclass('app_private.football_player_mapping_candidates') is not null
    or to_regclass('app_private.football_player_mapping_observations') is not null
    or to_regclass('app_private.football_player_mapping_proposals') is not null then
    raise exception 'stop: a player-mapping table already exists';
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('api', 'app_private')
        and (p.proname like 'football_mapping%' or p.proname like 'admin_football_mapping%')) then
    raise exception 'stop: a player-mapping function already exists';
  end if;

  -- Providers: exactly fixture and sportsmonks.
  select string_agg(name, ',' order by name), count(*) filter (where active)
  into v_providers, v_active from app_private.football_providers;
  if v_providers is distinct from 'fixture,sportsmonks' then
    raise exception 'stop: the providers are "%" -- expected exactly fixture,sportsmonks', v_providers;
  end if;
  if exists (select 1 from app_private.football_provider_mappings where provider_name in ('sofascore', 'flashscore')) then
    raise exception 'stop: a mapping row already names sofascore or flashscore';
  end if;

  -- The mapping table is what the owner reviewed.
  if (select md5(string_agg(conname || ':' || pg_get_constraintdef(oid) || ':' || condeferrable::text, '|' order by conname))
      from pg_catalog.pg_constraint where conrelid = 'app_private.football_provider_mappings'::regclass)
    is distinct from '84d45fbd1c71c689561c39afe04094c9' then
    raise exception 'stop: the mapping table''s constraints are not the reviewed definitions';
  end if;
  if (select count(*) from pg_catalog.pg_constraint
      where conrelid = 'app_private.football_provider_mappings'::regclass and contype = 'u') <> 2 then
    raise exception 'stop: the mapping table does not have exactly its two unique constraints';
  end if;

  -- The resolver is the reviewed text.
  if to_regprocedure('api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)') is null
    or md5(pg_get_functiondef('api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure))
      is distinct from '5d7ad20856e2bb22e2b7d44741e21be1' then
    raise exception 'stop: api.resolve_football_mapping is not the text this change was reviewed against';
  end if;

  -- What the scheduled-job guard and the staff checks rely on.
  if to_regprocedure('app_private.hold_scheduled_jobs()') is null
    or md5(pg_get_functiondef('app_private.hold_scheduled_jobs()'::regprocedure)) is distinct from 'e0ff799389c935e3844df2620b53ae87' then
    raise exception 'stop: app_private.hold_scheduled_jobs is not the reviewed text';
  end if;
  if to_regprocedure('app_private.admin_assert_permission(text,boolean)') is null
    or to_regprocedure('app_private.admin_assert_principal(boolean,boolean)') is null
    or to_regprocedure('app_private.write_admin_audit(uuid,text,text,uuid,text,uuid,uuid,uuid,jsonb,jsonb,app_private.admin_audit_outcome,text,boolean)') is null
    or to_regprocedure('app_private.admin_begin_idempotent_operation(uuid,text,uuid,jsonb)') is null then
    raise exception 'stop: an admin helper this change calls is missing';
  end if;
  if not exists (select 1 from app_private.admin_permissions
      where name = 'football.manage_mappings' and active and requires_mfa and requires_recent_auth) then
    raise exception 'stop: football.manage_mappings is not an active permission requiring MFA and recent authentication';
  end if;

  -- One writer at a time: nobody else is working.
  if exists (select 1 from pg_catalog.pg_stat_activity
      where pid <> pg_backend_pid() and backend_type = 'client backend'
        and state in ('active', 'idle in transaction', 'idle in transaction (aborted)')) then
    raise exception 'stop: another database session is working right now -- wait for it to finish (one writer at a time)';
  end if;
  -- No scheduled job is running (this also holds new ones off until the transaction ends).
  perform app_private.hold_scheduled_jobs();
  -- No Fantasy lifecycle or finalization underway.
  if exists (select 1 from app.fantasy_gameweeks where status = 'finalizing') then
    raise exception 'stop: a Fantasy gameweek is finalizing right now';
  end if;
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first (select app_private.fantasy_automation_configure(false)), and put it back afterwards if it was on';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- What must not change, as it is now (dropped with the transaction)
-- ---------------------------------------------------------------------------
create temporary table mapping_apply_baseline on commit drop as
select
  (select count(*) from app_private.football_providers) as provider_count,
  (select md5(coalesce(string_agg(p::text, '|' order by p.name), '')) from app_private.football_providers p) as provider_digest,
  (select count(*) from app_private.football_provider_mappings) as mapping_count,
  (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m) as mapping_digest,
  (select md5(string_agg(conname || ':' || pg_get_constraintdef(oid) || ':' || condeferrable::text, '|' order by conname))
    from pg_catalog.pg_constraint where conrelid = 'app_private.football_provider_mappings'::regclass) as mapping_constraint_digest,
  (select md5(coalesce(string_agg(indexdef, '|' order by indexname), '')) from pg_catalog.pg_indexes
    where schemaname = 'app_private' and tablename = 'football_provider_mappings') as mapping_index_digest,
  (select md5(coalesce(string_agg(pg_get_triggerdef(oid), '|' order by tgname), '')) from pg_catalog.pg_trigger
    where tgrelid = 'app_private.football_provider_mappings'::regclass and not tgisinternal) as mapping_trigger_digest,
  (select relacl::text from pg_catalog.pg_class where oid = 'app_private.football_provider_mappings'::regclass) as mapping_acl,
  (select proacl::text from pg_catalog.pg_proc
    where oid = 'api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure) as resolver_acl,
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api') as api_procs,
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private') as private_procs,
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('api', 'app', 'app_private') and c.relkind in ('r', 'p', 'v', 'm')) as relations,
  (select count(*) from cron.job) as cron_jobs,
  (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), ''))
    from cron.job) as cron_digest,
  (select count(*) from app_private.admin_audit_events) as audit_events,
  (select count(*) from app_private.admin_idempotency_keys) as idempotency_keys,
  jsonb_build_object(
    'fantasy_seasons', (select count(*) from app.fantasy_seasons),
    'fantasy_gameweeks', (select count(*) from app.fantasy_gameweeks),
    'fantasy_players', (select count(*) from app.fantasy_players),
    'fantasy_teams', (select count(*) from app.fantasy_teams),
    'fantasy_lineup_players', (select count(*) from app.fantasy_lineup_players),
    'fantasy_fixture_assignments', (select count(*) from app.fantasy_fixture_assignments),
    'fantasy_player_gameweek_points', (select count(*) from app.fantasy_player_gameweek_points),
    'fantasy_player_point_events', (select count(*) from app.fantasy_player_point_events),
    'fantasy_team_gameweek_results', (select count(*) from app.fantasy_team_gameweek_results),
    'players', (select count(*) from app.players),
    'fixtures', (select count(*) from app.fixtures),
    'lineup_players', (select count(*) from app.lineup_players),
    'player_fixture_performances', (select count(*) from app.player_fixture_performances)
  ) as counts,
  (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g) as gameweek_digest;

-- ---------------------------------------------------------------------------
-- The three migrations, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261001150000',
  'register_sofascore_flashscore_providers',
  array[$bg_20261001150000_file$-- BotolaGO Production V2
-- Register the two player-identity providers so a later change can store
-- provider ids and candidates under them. Registration only:
--   * no mapping row is written (app_private.football_provider_mappings and its
--     unique constraints are untouched);
--   * no table, function, grant or policy is created or changed;
--   * nothing reads the new rows yet, so no ingestion, scoring or job changes.
-- Forward-only and idempotent: a provider that is already registered is left
-- exactly as it is (its display name and configuration_version are not changed).
insert into app_private.football_providers (name, display_name)
values
  ('sofascore', 'Sofascore (RapidAPI)'),
  ('flashscore', 'Flashscore (RapidAPI)')
on conflict (name) do nothing;
$bg_20261001150000_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261001160000',
  'football_player_mapping_tables',
  array[$bg_20261001160000_file$-- BotolaGO Production V2
-- Player-identity mapping workflow, part 1 of 2: the tables.
-- Design: docs/backend/FANTASY_PLAYER_MAPPING_TABLE_AND_REVIEW_SCREEN_DESIGN.md
-- (owner decisions D1 to D5, A, B, E; shared-id decision of 1 Oct 2026).
--
-- WHAT THIS ADDS (workflow and evidence only; nothing here maps anyone)
--   app_private.football_player_mapping_candidates     one row per PROVIDER
--       identity (provider_name, external_id): the provider's player id and
--       nothing more. A player seen in two squads is still ONE row.
--   app_private.football_player_mapping_observations   where each candidate
--       was seen: one row per (candidate, requested squad/team). A repeat
--       observation under another club is an observation, never a second
--       candidate and never negative evidence.
--   app_private.football_player_mapping_proposals      a durable decision
--       (map, replace, deactivate, reactivate, ignore, reverse_ignore) that
--       needs a second, different human before it can be executed.
--   plus the guard triggers that make a proposal immutable once decided and
--   forbid deleting any of these rows.
--
-- WHAT THIS DOES NOT TOUCH
--   app_private.football_provider_mappings and its two unconditional unique
--   constraints are NOT altered. No column, trigger, index, policy or grant is
--   added to it, and these tables carry no foreign key to it (a foreign key
--   would add triggers to the referenced table), so `mapping_id` below is a
--   plain uuid that the trusted functions of part 2 validate. Nothing in this
--   file inserts, updates or deletes a mapping row, a player, a fixture, a
--   Fantasy row or a score. Applying it creates empty tables.
--
-- NAMES
--   The provider's display name is held on the candidate for a reviewer to
--   read and is purged 90 days after the candidate becomes mapped or ignored.
--   It is never an identity, ranking, fingerprint or evidence input, and the
--   evidence/signals documents refuse any key that looks like a name.
--
-- ACCESS
--   Row level security is forced and there is no policy and no grant: no
--   browser role, and not even service_role, can read or write these tables
--   directly. Only the SECURITY DEFINER functions of part 2 do.

do $precondition$
begin
  if not exists (select 1 from app_private.football_providers where name = 'sofascore')
    or not exists (select 1 from app_private.football_providers where name = 'flashscore') then
    raise exception 'football_player_mapping: register the sofascore and flashscore providers first (migration 20261001150000)';
  end if;
  if to_regclass('app_private.football_provider_mappings') is null
    or to_regclass('app_private.admin_audit_events') is null
    or to_regclass('app_private.staff_principals') is null then
    raise exception 'football_player_mapping: the mapping table or the admin tables are missing';
  end if;
end
$precondition$;

-- A jsonb document that carries a key that looks like a name is refused.
-- (Fails closed: a harmless key containing "name" is refused too.)
create function app_private.football_mapping_json_has_name_key(p_document jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_document is not null
    and p_document::text ~* '"[a-z0-9_]*name[a-z0-9_]*"[[:space:]]*:';
$$;

-- ---------------------------------------------------------------------------
-- Candidates: one row per provider identity
-- ---------------------------------------------------------------------------
create table app_private.football_player_mapping_candidates (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  external_id text not null,
  status text not null default 'unmapped',
  status_changed_at timestamptz not null default statement_timestamp(),
  -- The mapping row that already holds this provider id (active or not).
  -- Plain uuid on purpose: no foreign key to the mapping table.
  existing_mapping_id uuid,
  -- For a reviewer to read. Never read by any code that decides anything.
  display_name text,
  display_name_purged_at timestamptz,
  -- Set by the builder from reconciled matches: the id appeared in a Botola
  -- lineup or incident, so it can never be classified "not a Botola player".
  lineup_or_incident_seen boolean not null default false,
  -- Bumped whenever the observations change what a reviewer was shown.
  evidence_revision integer not null default 1,
  first_observed_at timestamptz not null default statement_timestamp(),
  last_observed_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint football_player_mapping_candidates_identity_key
    unique (provider_name, external_id),
  constraint football_player_mapping_candidates_provider_check
    check (provider_name in ('sofascore', 'flashscore')),
  constraint football_player_mapping_candidates_external_id_check
    check (external_id = btrim(external_id) and char_length(external_id) between 1 and 200),
  constraint football_player_mapping_candidates_status_check
    check (status in ('unmapped', 'proposed', 'mapped', 'ignored')),
  constraint football_player_mapping_candidates_name_check
    check (display_name is null or (display_name = btrim(display_name) and char_length(display_name) between 1 and 200)),
  constraint football_player_mapping_candidates_purge_check
    check (display_name_purged_at is null or display_name is null),
  constraint football_player_mapping_candidates_revision_check
    check (evidence_revision >= 1)
);
create index football_player_mapping_candidates_status_idx
  on app_private.football_player_mapping_candidates (status, provider_name, id);
create index football_player_mapping_candidates_purge_idx
  on app_private.football_player_mapping_candidates (status_changed_at)
  where status in ('mapped', 'ignored') and display_name is not null;

-- ---------------------------------------------------------------------------
-- Observations: each squad/team context a candidate was seen in
-- ---------------------------------------------------------------------------
create table app_private.football_player_mapping_observations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null
    references app_private.football_player_mapping_candidates(id) on delete restrict,
  -- The requested squad: the provider's own team id for the request.
  provider_team_id text not null,
  club_key text,
  -- The app team, when the builder could resolve it. A signal, never a filter.
  app_team_id uuid references app.teams(id) on delete restrict,
  squad_completeness text not null,
  registered_team_id text,
  registered_team_disagreement boolean not null default false,
  shirt_number smallint,
  position_signal text,
  dob_state text not null,
  -- Only for a valid date; the sanitized evidence never carries it.
  provider_birth_date date,
  dob_january1 boolean not null default false,
  height_cm smallint,
  nationality_signal text,
  observed_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint football_player_mapping_observations_context_key
    unique (candidate_id, provider_team_id),
  constraint football_player_mapping_observations_team_check
    check (provider_team_id = btrim(provider_team_id) and char_length(provider_team_id) between 1 and 100),
  constraint football_player_mapping_observations_club_check
    check (club_key is null or club_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint football_player_mapping_observations_completeness_check
    check (squad_completeness in ('COMPLETE', 'INCOMPLETE_PROVIDER_SQUAD')),
  constraint football_player_mapping_observations_shirt_check
    check (shirt_number is null or shirt_number between 0 and 99),
  constraint football_player_mapping_observations_position_check
    check (position_signal is null or position_signal in ('G', 'D', 'M', 'F')),
  constraint football_player_mapping_observations_dob_state_check
    check (dob_state in ('valid', 'missing', 'not_provided', 'unparseable', 'future',
      'age_below_minimum', 'age_above_maximum')),
  constraint football_player_mapping_observations_dob_value_check
    check ((dob_state = 'valid') = (provider_birth_date is not null)),
  constraint football_player_mapping_observations_jan1_check
    check (not dob_january1 or dob_state = 'valid'),
  constraint football_player_mapping_observations_height_check
    check (height_cm is null or height_cm between 120 and 230),
  constraint football_player_mapping_observations_nationality_check
    check (nationality_signal is null or nationality_signal ~ '^(alpha2:[A-Z]{2}|flag:[0-9]{1,6})$')
);
create index football_player_mapping_observations_team_idx
  on app_private.football_player_mapping_observations (app_team_id)
  where app_team_id is not null;

-- ---------------------------------------------------------------------------
-- Proposals: a decision waiting for (or past) a second person
-- ---------------------------------------------------------------------------
create table app_private.football_player_mapping_proposals (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  kind text not null,
  status text not null default 'pending',
  -- The candidate(s) the decision is about. `map` may carry one per provider;
  -- ignore and reverse_ignore carry exactly one; replace, deactivate and
  -- reactivate carry none (they name the mapping row).
  sofascore_candidate_id uuid
    references app_private.football_player_mapping_candidates(id) on delete restrict,
  flashscore_candidate_id uuid
    references app_private.football_player_mapping_candidates(id) on delete restrict,
  sofascore_external_id text,
  flashscore_external_id text,
  -- replace / deactivate / reactivate: the one mapping row this changes
  -- (no foreign key, see the header) and its provider.
  provider_name text,
  mapping_id uuid,
  -- map: the app player. replace / reactivate: the new values, null if unchanged.
  app_player_id uuid references app.players(id) on delete restrict,
  new_external_id text,
  new_app_player_id uuid references app.players(id) on delete restrict,
  expected_before jsonb,
  basis text not null default 'manual',
  evidence jsonb not null default '{}'::jsonb,
  signals jsonb not null default '{}'::jsonb,
  candidate_revisions jsonb not null default '{}'::jsonb,
  position_disagreement boolean not null default false,
  position_note text,
  position_disagreement_acknowledged boolean not null default false,
  reason text not null,
  requested_by uuid not null references app_private.staff_principals(id) on delete restrict,
  requested_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp() + interval '72 hours',
  decided_by uuid references app_private.staff_principals(id) on delete restrict,
  decided_at timestamptz,
  decision_reason text,
  fingerprint text not null,
  -- Written once at execution.
  executed_by uuid references app_private.staff_principals(id) on delete restrict,
  executed_at timestamptz,
  executed_before jsonb,
  executed_after jsonb,
  execution_idempotency_key uuid,
  -- The latest refusal a trusted function recorded (stable code), if any.
  hold_code text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint football_player_mapping_proposals_kind_check
    check (kind in ('map', 'replace', 'deactivate', 'reactivate', 'ignore', 'reverse_ignore')),
  constraint football_player_mapping_proposals_status_check
    check (status in ('pending', 'approved', 'executed', 'rejected', 'expired', 'cancelled',
      'stale_evidence', 'identity_conflict', 'position_disagreement', 'already_mapped')),
  constraint football_player_mapping_proposals_basis_check
    check (basis in ('incident', 'shirt_position', 'manual')),
  constraint football_player_mapping_proposals_provider_check
    check (provider_name is null or provider_name in ('sofascore', 'flashscore')),
  constraint football_player_mapping_proposals_shape_check check (
    case kind
      when 'map' then
        app_player_id is not null
        and (sofascore_candidate_id is not null or flashscore_candidate_id is not null)
        and (sofascore_candidate_id is not null) = (sofascore_external_id is not null)
        and (flashscore_candidate_id is not null) = (flashscore_external_id is not null)
        and mapping_id is null and new_external_id is null and new_app_player_id is null
      when 'replace' then
        mapping_id is not null and provider_name is not null
        and (new_external_id is not null or new_app_player_id is not null)
        and app_player_id is null
        and sofascore_candidate_id is null and flashscore_candidate_id is null
      when 'reactivate' then
        mapping_id is not null and provider_name is not null
        and app_player_id is null
        and sofascore_candidate_id is null and flashscore_candidate_id is null
      when 'deactivate' then
        mapping_id is not null and provider_name is not null
        and app_player_id is null and new_external_id is null and new_app_player_id is null
        and sofascore_candidate_id is null and flashscore_candidate_id is null
      else -- ignore, reverse_ignore: exactly one candidate
        (sofascore_candidate_id is not null) <> (flashscore_candidate_id is not null)
        and mapping_id is null and app_player_id is null
        and new_external_id is null and new_app_player_id is null
    end
  ),
  constraint football_player_mapping_proposals_reason_check
    check (reason = btrim(reason) and char_length(reason) between 10 and 500),
  constraint football_player_mapping_proposals_decision_reason_check
    check (decision_reason is null
      or (decision_reason = btrim(decision_reason) and char_length(decision_reason) between 10 and 500)),
  constraint football_player_mapping_proposals_note_check
    check (position_note is null
      or (position_note = btrim(position_note) and char_length(position_note) between 10 and 500)),
  constraint football_player_mapping_proposals_fingerprint_check
    check (fingerprint ~ '^[a-f0-9]{64}$'),
  constraint football_player_mapping_proposals_documents_check check (
    jsonb_typeof(evidence) = 'object' and jsonb_typeof(signals) = 'object'
    and jsonb_typeof(candidate_revisions) = 'object'
    and pg_column_size(evidence) <= 8192 and pg_column_size(signals) <= 8192
    and (expected_before is null or (jsonb_typeof(expected_before) = 'object' and pg_column_size(expected_before) <= 4096))
    and (executed_before is null or pg_column_size(executed_before) <= 4096)
    and (executed_after is null or pg_column_size(executed_after) <= 4096)
  ),
  -- No name is ever part of the evidence a decision rests on or of its fingerprint.
  constraint football_player_mapping_proposals_no_names_check check (
    not app_private.football_mapping_json_has_name_key(evidence)
    and not app_private.football_mapping_json_has_name_key(signals)
    and not app_private.football_mapping_json_has_name_key(expected_before)
    and not app_private.football_mapping_json_has_name_key(executed_before)
    and not app_private.football_mapping_json_has_name_key(executed_after)
  ),
  -- Two different humans, enforced here and not only in the functions.
  constraint football_player_mapping_proposals_two_people_check
    check (decided_by is null or decided_by is distinct from requested_by),
  constraint football_player_mapping_proposals_decision_pair_check
    check ((decided_by is null) = (decided_at is null)
      and (decided_by is null) = (decision_reason is null)),
  constraint football_player_mapping_proposals_executed_check check (
    (status = 'executed') = (executed_at is not null)
    and (executed_at is null) = (executed_by is null)
    and (executed_at is null) = (executed_before is null)
    and (executed_at is null) = (executed_after is null)
    and (executed_at is null) = (execution_idempotency_key is null)
    and (status <> 'executed' or (decided_by is not null and executed_by is not null))
  ),
  constraint football_player_mapping_proposals_expiry_check
    check (expires_at > requested_at)
);
create unique index football_player_mapping_proposals_exec_key
  on app_private.football_player_mapping_proposals (execution_idempotency_key)
  where execution_idempotency_key is not null;
create index football_player_mapping_proposals_status_idx
  on app_private.football_player_mapping_proposals (status, requested_at desc, id);
create index football_player_mapping_proposals_batch_idx
  on app_private.football_player_mapping_proposals (batch_id);
create index football_player_mapping_proposals_requester_idx
  on app_private.football_player_mapping_proposals (requested_by, requested_at desc);
create index football_player_mapping_proposals_decider_idx
  on app_private.football_player_mapping_proposals (decided_by) where decided_by is not null;
create index football_player_mapping_proposals_executor_idx
  on app_private.football_player_mapping_proposals (executed_by) where executed_by is not null;
create index football_player_mapping_proposals_app_player_idx
  on app_private.football_player_mapping_proposals (app_player_id) where app_player_id is not null;
create index football_player_mapping_proposals_new_app_player_idx
  on app_private.football_player_mapping_proposals (new_app_player_id) where new_app_player_id is not null;

-- At most one OPEN proposal per provider identity, per mapping row and per
-- app player: the database refuses a duplicate proposal, whatever the caller.
-- Open = pending, approved, position_disagreement, stale_evidence.
create unique index football_player_mapping_proposals_open_sofascore_key
  on app_private.football_player_mapping_proposals (sofascore_candidate_id)
  where sofascore_candidate_id is not null
    and status in ('pending', 'approved', 'position_disagreement', 'stale_evidence');
create unique index football_player_mapping_proposals_open_flashscore_key
  on app_private.football_player_mapping_proposals (flashscore_candidate_id)
  where flashscore_candidate_id is not null
    and status in ('pending', 'approved', 'position_disagreement', 'stale_evidence');
create unique index football_player_mapping_proposals_open_mapping_key
  on app_private.football_player_mapping_proposals (mapping_id)
  where mapping_id is not null
    and status in ('pending', 'approved', 'position_disagreement', 'stale_evidence');
create unique index football_player_mapping_proposals_open_player_key
  on app_private.football_player_mapping_proposals ((coalesce(app_player_id, new_app_player_id)))
  where coalesce(app_player_id, new_app_player_id) is not null
    and status in ('pending', 'approved', 'position_disagreement', 'stale_evidence');
create unique index football_player_mapping_proposals_open_new_external_key
  on app_private.football_player_mapping_proposals (provider_name, new_external_id)
  where new_external_id is not null
    and status in ('pending', 'approved', 'position_disagreement', 'stale_evidence');

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create function app_private.football_mapping_forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'football_mapping_rows_are_never_deleted';
end;
$$;

create trigger football_player_mapping_candidates_no_delete
  before delete on app_private.football_player_mapping_candidates
  for each row execute function app_private.football_mapping_forbid_delete();
create trigger football_player_mapping_observations_no_delete
  before delete on app_private.football_player_mapping_observations
  for each row execute function app_private.football_mapping_forbid_delete();
create trigger football_player_mapping_proposals_no_delete
  before delete on app_private.football_player_mapping_proposals
  for each row execute function app_private.football_mapping_forbid_delete();
create trigger football_player_mapping_candidates_no_truncate
  before truncate on app_private.football_player_mapping_candidates
  for each statement execute function app_private.football_mapping_forbid_delete();
create trigger football_player_mapping_observations_no_truncate
  before truncate on app_private.football_player_mapping_observations
  for each statement execute function app_private.football_mapping_forbid_delete();
create trigger football_player_mapping_proposals_no_truncate
  before truncate on app_private.football_player_mapping_proposals
  for each statement execute function app_private.football_mapping_forbid_delete();

-- A candidate's identity never changes.
create function app_private.football_mapping_candidate_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.provider_name is distinct from old.provider_name
    or new.external_id is distinct from old.external_id then
    raise exception using errcode = '42501', message = 'football_mapping_candidate_identity_is_immutable';
  end if;
  if new.status is distinct from old.status then
    new.status_changed_at := statement_timestamp();
  end if;
  return new;
end;
$$;
create trigger football_player_mapping_candidates_guard
  before update on app_private.football_player_mapping_candidates
  for each row execute function app_private.football_mapping_candidate_guard();

create function app_private.football_mapping_observation_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.candidate_id is distinct from old.candidate_id
    or new.provider_team_id is distinct from old.provider_team_id then
    raise exception using errcode = '42501', message = 'football_mapping_observation_context_is_immutable';
  end if;
  return new;
end;
$$;
create trigger football_player_mapping_observations_guard
  before update on app_private.football_player_mapping_observations
  for each row execute function app_private.football_mapping_observation_guard();

-- A proposal is immutable once it is final, its payload never changes except
-- through the evidence refresh (the trusted function sets a transaction-local
-- flag), and its states move only along the allowed edges.
create function app_private.football_mapping_proposal_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  refreshing boolean := coalesce(current_setting('app.football_mapping_refresh', true), '') = 'on';
  allowed boolean;
begin
  if old.status in ('executed', 'rejected', 'expired', 'cancelled', 'identity_conflict', 'already_mapped') then
    raise exception using errcode = '42501', message = 'football_mapping_proposal_is_final';
  end if;

  if new.id is distinct from old.id
    or new.batch_id is distinct from old.batch_id
    or new.kind is distinct from old.kind
    or new.requested_by is distinct from old.requested_by
    or new.requested_at is distinct from old.requested_at
    or new.correlation_id is distinct from old.correlation_id
    or new.sofascore_candidate_id is distinct from old.sofascore_candidate_id
    or new.flashscore_candidate_id is distinct from old.flashscore_candidate_id
    or new.sofascore_external_id is distinct from old.sofascore_external_id
    or new.flashscore_external_id is distinct from old.flashscore_external_id
    or new.provider_name is distinct from old.provider_name
    or new.mapping_id is distinct from old.mapping_id
    or new.app_player_id is distinct from old.app_player_id
    or new.new_external_id is distinct from old.new_external_id
    or new.new_app_player_id is distinct from old.new_app_player_id
    or new.basis is distinct from old.basis
    or new.reason is distinct from old.reason then
    raise exception using errcode = '42501', message = 'football_mapping_proposal_payload_is_immutable';
  end if;

  if not refreshing and (
    new.expected_before is distinct from old.expected_before
    or new.evidence is distinct from old.evidence
    or new.signals is distinct from old.signals
    or new.candidate_revisions is distinct from old.candidate_revisions
    or new.position_disagreement is distinct from old.position_disagreement
    or new.fingerprint is distinct from old.fingerprint
    or new.expires_at is distinct from old.expires_at
  ) then
    -- The note is added through its own function (position_note below).
    raise exception using errcode = '42501', message = 'football_mapping_proposal_evidence_is_immutable';
  end if;

  if new.position_note is distinct from old.position_note
    and not refreshing
    and coalesce(current_setting('app.football_mapping_note', true), '') <> 'on' then
    raise exception using errcode = '42501', message = 'football_mapping_proposal_note_is_set_by_function';
  end if;

  -- A decision, once made, is only ever cleared by a refresh.
  if old.decided_by is not null and new.decided_by is distinct from old.decided_by and not refreshing then
    raise exception using errcode = '42501', message = 'football_mapping_decision_is_immutable';
  end if;
  if old.executed_at is not null then
    raise exception using errcode = '42501', message = 'football_mapping_proposal_is_final';
  end if;

  if new.status is distinct from old.status then
    allowed := case old.status
      when 'pending' then new.status in ('approved', 'rejected', 'expired', 'cancelled',
        'stale_evidence', 'identity_conflict', 'position_disagreement', 'already_mapped')
      when 'position_disagreement' then new.status in ('pending', 'cancelled', 'expired',
        'stale_evidence', 'identity_conflict', 'already_mapped')
      when 'approved' then new.status in ('executed', 'stale_evidence', 'identity_conflict',
        'already_mapped', 'expired', 'cancelled')
      when 'stale_evidence' then new.status in ('pending', 'position_disagreement', 'cancelled', 'expired')
      else false
    end;
    if not allowed then
      raise exception using errcode = '42501',
        message = 'football_mapping_proposal_transition_refused',
        detail = old.status || ' -> ' || new.status;
    end if;
    if new.status = 'approved' and new.decided_by is null then
      raise exception using errcode = '42501', message = 'football_mapping_approval_needs_a_decider';
    end if;
  end if;
  return new;
end;
$$;
create trigger football_player_mapping_proposals_guard
  before update on app_private.football_player_mapping_proposals
  for each row execute function app_private.football_mapping_proposal_guard();

create trigger football_player_mapping_candidates_set_updated_at
  before update on app_private.football_player_mapping_candidates
  for each row execute function app_private.set_updated_at();
create trigger football_player_mapping_observations_set_updated_at
  before update on app_private.football_player_mapping_observations
  for each row execute function app_private.set_updated_at();
create trigger football_player_mapping_proposals_set_updated_at
  before update on app_private.football_player_mapping_proposals
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access: none. Only the trusted functions of part 2 reach these tables.
-- ---------------------------------------------------------------------------
alter table app_private.football_player_mapping_candidates enable row level security;
alter table app_private.football_player_mapping_candidates force row level security;
alter table app_private.football_player_mapping_observations enable row level security;
alter table app_private.football_player_mapping_observations force row level security;
alter table app_private.football_player_mapping_proposals enable row level security;
alter table app_private.football_player_mapping_proposals force row level security;

revoke all on table
  app_private.football_player_mapping_candidates,
  app_private.football_player_mapping_observations,
  app_private.football_player_mapping_proposals
from public, anon, authenticated, service_role;

revoke all on function
  app_private.football_mapping_json_has_name_key(jsonb),
  app_private.football_mapping_forbid_delete(),
  app_private.football_mapping_candidate_guard(),
  app_private.football_mapping_observation_guard(),
  app_private.football_mapping_proposal_guard()
from public, anon, authenticated, service_role;

comment on table app_private.football_player_mapping_candidates is
  'One row per provider identity (provider_name, external_id). Workflow and evidence only: the mapping table, not this one, says who is mapped. display_name is for reviewers to read and is purged 90 days after the candidate becomes mapped or ignored.';
comment on table app_private.football_player_mapping_observations is
  'Each requested squad/team a candidate was seen in. A second observation under another club is not a second candidate and is never negative evidence.';
comment on table app_private.football_player_mapping_proposals is
  'A durable mapping decision that needs a second, different human. Immutable once final; never deleted; history of the mapping row lives here and in app_private.admin_audit_events.';
$bg_20261001160000_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261001161000',
  'football_player_mapping_functions',
  array[$bg_20261001161000_file$-- BotolaGO Production V2
-- Player-identity mapping workflow, part 2 of 2: the trusted functions.
-- Needs 20261001150000 (providers) and 20261001160000 (tables).
-- Design: docs/backend/FANTASY_PLAYER_MAPPING_TABLE_AND_REVIEW_SCREEN_DESIGN.md
--
-- EVERY durable decision (map, replace, deactivate, reactivate, ignore,
-- reverse_ignore) goes through the same path and nothing shortcuts it:
--
--   api.admin_football_mapping_propose        a human proposer (football.manage_mappings,
--                                             AAL2, recent authentication)
--   api.admin_football_mapping_decide         a DIFFERENT human approves or rejects the
--                                             exact fingerprint (same strength of login)
--   api.admin_football_mapping_execute        written once, in one guarded transaction
--   api.admin_football_mapping_cancel         the proposer withdraws
--   api.admin_football_mapping_add_position_note / _refresh_evidence
--                                             the two ways out of a held state
--   api.admin_football_mapping_*  (reads)     candidates, proposals, app-player options,
--                                             reviewer availability
--   api.football_mapping_record_observations  trusted builder write (service_role only)
--   api.football_mapping_expire_proposals     trusted sweeper (service_role only)
--   api.football_mapping_purge_display_names  90-day name purge (service_role only)
--
-- THE MAPPING TABLE HOLDS CURRENT STATE. A replacement UPDATES the existing row
-- (its two unique constraints are unconditional, so a deactivated row still
-- holds its provider id and its app player); deactivate sets active = false on
-- that row; reactivate reuses it; only `map` inserts, and only when no row
-- holds either identity. History is the proposal record (executed_before /
-- executed_after) and app_private.admin_audit_events, never the mutable row.
-- These functions touch only entity_type = 'player' rows of sofascore and
-- flashscore: a sportsmonks mapping or any other entity can never be changed.
--
-- SHARED PROVIDER IDS. One provider id is one candidate, whatever number of
-- squads it was observed in; each squad is a separate observation. That is
-- shown as the flag MULTI_SQUAD_OBSERVATION and nothing else: it is never a
-- transfer, a duplicate, a wrong squad or a collision, and it never lowers a
-- rank or rejects a candidate. The approved mapping is global: provider id ->
-- one app player. A different human's conflicting identity evidence (an
-- earlier ignore, another open proposal for the same id or the same app player,
-- a mapping row that holds either identity) blocks approval.
--
-- SIGNALS. Machine structural input: provider, provider player id, requested
-- squad, response completeness. Reviewer signals only: DOB, shirt, position,
-- height, nationality, the provider's registered team. A missing value, an
-- app DOB on 1 January, an implausible or 1 January provider DOB and an
-- incomplete provider squad are NO SIGNAL. A position disagreement is a flag
-- that holds the proposal for a note and an acknowledgement; it never rejects.
-- Names are read by no function here except to show a reviewer.
--
-- STABLE ERRORS: PT401/PT403 (authority), PT404 (missing), PT409 (state), PT400
-- (input). A refusal that must be remembered (a held state) is returned as
-- {"ok": false, "code": ...} after the proposal is moved, never as an error.

-- ===========================================================================
-- Signal helpers
-- ===========================================================================
create function app_private.football_mapping_position_letter(p_position app.football_position)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_position::text
    when 'goalkeeper' then 'G'
    when 'defender' then 'D'
    when 'midfielder' then 'M'
    when 'forward' then 'F'
  end;
$$;

-- The only date-of-birth signal. Both sides must be valid; a 1 January date
-- is a possible placeholder on either side and gives nothing.
create function app_private.football_mapping_dob_signal(
  p_app_dob date,
  p_provider_state text,
  p_provider_dob date,
  p_provider_jan1 boolean,
  p_today date default current_date
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_age integer;
begin
  if p_app_dob is null then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'app_missing');
  end if;
  if p_app_dob > p_today then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'app_future');
  end if;
  v_age := extract(year from age(p_today, p_app_dob));
  if v_age < 15 then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'app_age_below_minimum');
  end if;
  if v_age > 50 then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'app_age_above_maximum');
  end if;
  if extract(month from p_app_dob) = 1 and extract(day from p_app_dob) = 1 then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'app_january_first_low_confidence');
  end if;
  if p_provider_state is distinct from 'valid' or p_provider_dob is null then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'provider_' || coalesce(p_provider_state, 'missing'));
  end if;
  if coalesce(p_provider_jan1, false) then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'provider_january_first_low_confidence');
  end if;
  if p_app_dob = p_provider_dob then
    return jsonb_build_object('signal', 'match', 'reason', null);
  end if;
  return jsonb_build_object('signal', 'conflict', 'reason', null);
end;
$$;

-- The reviewer signals of one candidate against one app player. Reads
-- structure and attributes only; never a name. Missing data is no signal.
create function app_private.football_mapping_candidate_signals(
  p_candidate_id uuid,
  p_app_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player app.players%rowtype;
  v_count integer;
  v_obs app_private.football_player_mapping_observations%rowtype;
  v_provider_pos text;
  v_app_pos text;
  v_shirt text := 'no_signal';
  v_pos text := 'no_signal';
  v_club text := 'no_signal';
  v_dob jsonb;
  v_flags text[] := array[]::text[];
  v_registered boolean;
  v_incomplete boolean;
  v_app_shirts integer[];
begin
  select * into v_player from app.players where id = p_app_player_id;
  select count(*) into v_count
  from app_private.football_player_mapping_observations where candidate_id = p_candidate_id;

  -- DOB: the latest observation that carries a valid date, else the latest one.
  select * into v_obs
  from app_private.football_player_mapping_observations
  where candidate_id = p_candidate_id
  order by (dob_state = 'valid') desc, observed_at desc, id
  limit 1;
  v_dob := app_private.football_mapping_dob_signal(
    v_player.date_of_birth, v_obs.dob_state, v_obs.provider_birth_date, v_obs.dob_january1);

  -- Shirt: any observed number equal to the app player's shirt is a match.
  select coalesce(array_agg(distinct membership.shirt_number), '{}') into v_app_shirts
  from app.team_memberships membership
  where membership.player_id = p_app_player_id and membership.active and membership.shirt_number is not null;
  if exists (select 1 from app_private.football_player_mapping_observations
      where candidate_id = p_candidate_id and shirt_number = any (v_app_shirts)) then
    v_shirt := 'match';
  elsif cardinality(v_app_shirts) > 0 and exists (
      select 1 from app_private.football_player_mapping_observations
      where candidate_id = p_candidate_id and shirt_number is not null) then
    v_shirt := 'conflict';
  end if;

  -- Position: the provider's most recent known position against the app's.
  select position_signal into v_provider_pos
  from app_private.football_player_mapping_observations
  where candidate_id = p_candidate_id and position_signal is not null
  order by observed_at desc, id limit 1;
  v_app_pos := app_private.football_mapping_position_letter(v_player.position);
  if v_provider_pos is not null and v_app_pos is not null then
    v_pos := case when v_provider_pos = v_app_pos then 'match' else 'conflict' end;
  end if;

  -- Club context: informational only. A mismatch is a flag, never a rejection.
  if exists (select 1 from app_private.football_player_mapping_observations
      where candidate_id = p_candidate_id and app_team_id is not null) then
    if exists (select 1 from app_private.football_player_mapping_observations o
        join app.team_memberships m on m.team_id = o.app_team_id and m.player_id = p_app_player_id and m.active
        where o.candidate_id = p_candidate_id) then
      v_club := 'match';
    elsif exists (select 1 from app.team_memberships where player_id = p_app_player_id and active) then
      v_club := 'mismatch';
    end if;
  end if;

  select coalesce(bool_or(registered_team_disagreement), false),
         coalesce(bool_or(squad_completeness = 'INCOMPLETE_PROVIDER_SQUAD'), false)
  into v_registered, v_incomplete
  from app_private.football_player_mapping_observations where candidate_id = p_candidate_id;

  if v_count > 1 then v_flags := array_append(v_flags, 'MULTI_SQUAD_OBSERVATION'); end if;
  if v_dob ->> 'signal' = 'conflict' then v_flags := array_append(v_flags, 'DOB_CONFLICT'); end if;
  if v_pos = 'conflict' then v_flags := array_append(v_flags, 'POSITION_DISAGREEMENT'); end if;
  if v_shirt = 'conflict' then v_flags := array_append(v_flags, 'SHIRT_DIFFERENCE'); end if;
  if v_registered then v_flags := array_append(v_flags, 'REGISTERED_TEAM_DISAGREEMENT'); end if;
  if v_club = 'mismatch' then v_flags := array_append(v_flags, 'CLUB_CONTEXT_MISMATCH'); end if;
  if v_incomplete then v_flags := array_append(v_flags, 'INCOMPLETE_PROVIDER_SQUAD'); end if;

  return jsonb_build_object(
    'dob', v_dob ->> 'signal',
    'dobReason', v_dob ->> 'reason',
    'shirt', v_shirt,
    'position', v_pos,
    'providerPosition', v_provider_pos,
    'club', v_club,
    'registeredTeamDisagreement', v_registered,
    'observationCount', v_count,
    'flags', to_jsonb(v_flags));
end;
$$;

-- A rank for the reviewer's list. Only agreement adds; a valid conflict costs a
-- little; a missing value costs nothing; nothing is ever dropped from a list.
create function app_private.football_mapping_signal_score(p_signals jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (case p_signals ->> 'dob' when 'match' then 4 when 'conflict' then -2 else 0 end)
    + (case p_signals ->> 'shirt' when 'match' then 1 else 0 end)
    + (case p_signals ->> 'position' when 'match' then 1 when 'conflict' then -1 else 0 end);
$$;

-- ===========================================================================
-- The fingerprint, assembly and re-validation of a proposal
-- ===========================================================================
create function app_private.football_mapping_row_fingerprint(r app_private.football_player_mapping_proposals)
returns text
language sql
immutable
set search_path = ''
as $$
  -- No name is in here, by construction.
  select app_private.admin_payload_fingerprint(jsonb_build_object(
    'kind', r.kind,
    'sofascoreCandidateId', r.sofascore_candidate_id,
    'flashscoreCandidateId', r.flashscore_candidate_id,
    'sofascoreExternalId', r.sofascore_external_id,
    'flashscoreExternalId', r.flashscore_external_id,
    'providerName', r.provider_name,
    'mappingId', r.mapping_id,
    'appPlayerId', r.app_player_id,
    'newExternalId', r.new_external_id,
    'newAppPlayerId', r.new_app_player_id,
    'expectedBefore', r.expected_before,
    'basis', r.basis,
    'evidence', r.evidence,
    'signals', r.signals,
    'candidateRevisions', r.candidate_revisions,
    'positionDisagreement', r.position_disagreement,
    'positionNote', r.position_note,
    'reason', r.reason));
$$;

create function app_private.football_mapping_refuse(p_code text)
returns jsonb
language sql
immutable
set search_path = ''
as $$ select jsonb_build_object('ok', false, 'code', p_code); $$;

-- What the world says today about a proposed decision. Returns either
-- {"ok": false, "code": ...} or {"ok": true, ...the evidence...}. Used to
-- build a proposal and again, unchanged, to re-check it at approval and at
-- execution, so a proposal can never rest on evidence that has moved.
create function app_private.football_mapping_compute(
  p_kind text,
  p_sofascore_candidate uuid,
  p_flashscore_candidate uuid,
  p_provider text,
  p_mapping_id uuid,
  p_app_player_id uuid,
  p_new_external_id text,
  p_new_app_player_id uuid,
  p_exclude_proposal uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_open constant text[] := array['pending', 'approved', 'position_disagreement', 'stale_evidence'];
  v_cid uuid;
  v_candidate app_private.football_player_mapping_candidates%rowtype;
  v_row app_private.football_provider_mappings%rowtype;
  v_expected jsonb;
  v_signals jsonb := '{}'::jsonb;
  v_evidence_candidates jsonb := '[]'::jsonb;
  v_revisions jsonb := '{}'::jsonb;
  v_sofa_ext text;
  v_flash_ext text;
  v_sofa_pos text;
  v_flash_pos text;
  v_app_pos text;
  v_pos_dis boolean := false;
  v_target_player uuid;
  v_target_candidate uuid;
  v_player_ok boolean;
  v_rev integer;
begin
  if p_kind = 'map' then
    if p_app_player_id is null or (p_sofascore_candidate is null and p_flashscore_candidate is null) then
      return app_private.football_mapping_refuse('invalid_proposal');
    end if;
    if not exists (select 1 from app.players where id = p_app_player_id and active) then
      return app_private.football_mapping_refuse('app_player_not_found');
    end if;
    foreach v_cid in array array[p_sofascore_candidate, p_flashscore_candidate] loop
      continue when v_cid is null;
      select * into v_candidate from app_private.football_player_mapping_candidates where id = v_cid;
      if not found then return app_private.football_mapping_refuse('candidate_not_found'); end if;
      if (v_cid = p_sofascore_candidate and v_candidate.provider_name <> 'sofascore')
        or (v_cid = p_flashscore_candidate and v_candidate.provider_name <> 'flashscore') then
        return app_private.football_mapping_refuse('candidate_provider_mismatch');
      end if;
      if v_candidate.status = 'ignored' then
        return app_private.football_mapping_refuse('identity_conflict');
      end if;
      if v_candidate.status = 'mapped' or v_candidate.existing_mapping_id is not null
        or exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_candidate.provider_name and m.entity_type = 'player'
            and m.external_id = v_candidate.external_id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_candidate.provider_name and m.entity_type = 'player'
            and m.internal_entity_id = p_app_player_id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if exists (select 1 from app_private.football_player_mapping_proposals p
          where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
            and (p.sofascore_candidate_id = v_cid or p.flashscore_candidate_id = v_cid)) then
        return app_private.football_mapping_refuse('proposal_already_open');
      end if;
      if v_candidate.provider_name = 'sofascore' then v_sofa_ext := v_candidate.external_id;
      else v_flash_ext := v_candidate.external_id; end if;
      v_signals := v_signals || jsonb_build_object(
        v_candidate.provider_name, app_private.football_mapping_candidate_signals(v_cid, p_app_player_id));
      v_revisions := v_revisions || jsonb_build_object(v_candidate.provider_name, v_candidate.evidence_revision);
      v_evidence_candidates := v_evidence_candidates || jsonb_build_array(jsonb_build_object(
        'provider', v_candidate.provider_name,
        'candidateId', v_cid,
        'externalId', v_candidate.external_id,
        'observationCount', (v_signals -> v_candidate.provider_name ->> 'observationCount')::integer));
    end loop;
    if exists (select 1 from app_private.football_player_mapping_proposals p
        where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
          and coalesce(p.app_player_id, p.new_app_player_id) = p_app_player_id) then
      return app_private.football_mapping_refuse('identity_conflict');
    end if;
    v_app_pos := app_private.football_mapping_position_letter(
      (select position from app.players where id = p_app_player_id));
    v_sofa_pos := v_signals -> 'sofascore' ->> 'providerPosition';
    v_flash_pos := v_signals -> 'flashscore' ->> 'providerPosition';
    v_pos_dis := (v_sofa_pos is not null and v_flash_pos is not null and v_sofa_pos <> v_flash_pos)
      or (v_sofa_pos is not null and v_app_pos is not null and v_sofa_pos <> v_app_pos)
      or (v_flash_pos is not null and v_app_pos is not null and v_flash_pos <> v_app_pos);
    return jsonb_build_object('ok', true,
      'sofascoreExternalId', v_sofa_ext, 'flashscoreExternalId', v_flash_ext,
      'providerName', null, 'expectedBefore', null,
      'evidence', jsonb_build_object('candidates', v_evidence_candidates, 'appPlayerId', p_app_player_id),
      'signals', v_signals, 'candidateRevisions', v_revisions, 'positionDisagreement', v_pos_dis);

  elsif p_kind in ('replace', 'deactivate', 'reactivate') then
    if p_mapping_id is null then return app_private.football_mapping_refuse('invalid_proposal'); end if;
    select * into v_row from app_private.football_provider_mappings
    where id = p_mapping_id and entity_type = 'player' and provider_name in ('sofascore', 'flashscore');
    if not found then return app_private.football_mapping_refuse('mapping_not_found'); end if;
    if p_provider is distinct from v_row.provider_name then
      return app_private.football_mapping_refuse('mapping_provider_mismatch');
    end if;
    v_expected := jsonb_build_object('mappingId', v_row.id, 'provider', v_row.provider_name,
      'externalId', v_row.external_id, 'appPlayerId', v_row.internal_entity_id, 'active', v_row.active);
    if exists (select 1 from app_private.football_player_mapping_proposals p
        where p.status = any (c_open) and p.id is distinct from p_exclude_proposal and p.mapping_id = v_row.id) then
      return app_private.football_mapping_refuse('proposal_already_open');
    end if;
    if p_kind in ('replace', 'deactivate') and not v_row.active then
      return app_private.football_mapping_refuse('mapping_not_active');
    end if;
    if p_kind = 'reactivate' and v_row.active then
      return app_private.football_mapping_refuse('mapping_already_active');
    end if;
    if p_kind = 'deactivate' and (p_new_external_id is not null or p_new_app_player_id is not null) then
      return app_private.football_mapping_refuse('invalid_proposal');
    end if;
    if p_kind = 'replace' and p_new_external_id is null and p_new_app_player_id is null then
      return app_private.football_mapping_refuse('invalid_proposal');
    end if;
    if (p_new_external_id is not null and p_new_external_id = v_row.external_id)
      or (p_new_app_player_id is not null and p_new_app_player_id = v_row.internal_entity_id) then
      return app_private.football_mapping_refuse('no_change');
    end if;
    if p_new_external_id is not null then
      if exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_row.provider_name and m.entity_type = 'player'
            and m.external_id = p_new_external_id and m.id <> v_row.id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if exists (select 1 from app_private.football_player_mapping_proposals p
          where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
            and ((p.provider_name = v_row.provider_name and p.new_external_id = p_new_external_id)
              or (v_row.provider_name = 'sofascore' and p.sofascore_external_id = p_new_external_id)
              or (v_row.provider_name = 'flashscore' and p.flashscore_external_id = p_new_external_id))) then
        return app_private.football_mapping_refuse('identity_conflict');
      end if;
    end if;
    if p_new_app_player_id is not null then
      select exists (select 1 from app.players where id = p_new_app_player_id and active) into v_player_ok;
      if not v_player_ok then return app_private.football_mapping_refuse('app_player_not_found'); end if;
      if exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_row.provider_name and m.entity_type = 'player'
            and m.internal_entity_id = p_new_app_player_id and m.id <> v_row.id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if exists (select 1 from app_private.football_player_mapping_proposals p
          where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
            and coalesce(p.app_player_id, p.new_app_player_id) = p_new_app_player_id) then
        return app_private.football_mapping_refuse('identity_conflict');
      end if;
    end if;
    -- Signals for the pairing the row will hold afterwards, where a candidate exists.
    v_target_player := coalesce(p_new_app_player_id, v_row.internal_entity_id);
    select id, evidence_revision into v_target_candidate, v_rev
    from app_private.football_player_mapping_candidates
    where provider_name = v_row.provider_name
      and external_id = coalesce(p_new_external_id, v_row.external_id);
    if v_target_candidate is not null and p_kind <> 'deactivate' then
      v_signals := jsonb_build_object(v_row.provider_name,
        app_private.football_mapping_candidate_signals(v_target_candidate, v_target_player));
      v_revisions := jsonb_build_object(v_row.provider_name, v_rev);
      v_app_pos := app_private.football_mapping_position_letter(
        (select position from app.players where id = v_target_player));
      v_sofa_pos := v_signals -> v_row.provider_name ->> 'providerPosition';
      v_pos_dis := v_sofa_pos is not null and v_app_pos is not null and v_sofa_pos <> v_app_pos;
    end if;
    return jsonb_build_object('ok', true,
      'sofascoreExternalId', null, 'flashscoreExternalId', null,
      'providerName', v_row.provider_name, 'expectedBefore', v_expected,
      'evidence', jsonb_build_object('mappingId', v_row.id, 'before', v_expected,
        'newExternalId', p_new_external_id, 'newAppPlayerId', p_new_app_player_id),
      'signals', v_signals, 'candidateRevisions', v_revisions, 'positionDisagreement', v_pos_dis);

  elsif p_kind in ('ignore', 'reverse_ignore') then
    if (p_sofascore_candidate is null) = (p_flashscore_candidate is null) then
      return app_private.football_mapping_refuse('invalid_proposal');
    end if;
    v_cid := coalesce(p_sofascore_candidate, p_flashscore_candidate);
    select * into v_candidate from app_private.football_player_mapping_candidates where id = v_cid;
    if not found then return app_private.football_mapping_refuse('candidate_not_found'); end if;
    if (p_sofascore_candidate is not null and v_candidate.provider_name <> 'sofascore')
      or (p_flashscore_candidate is not null and v_candidate.provider_name <> 'flashscore') then
      return app_private.football_mapping_refuse('candidate_provider_mismatch');
    end if;
    if exists (select 1 from app_private.football_player_mapping_proposals p
        where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
          and (p.sofascore_candidate_id = v_cid or p.flashscore_candidate_id = v_cid)) then
      return app_private.football_mapping_refuse('proposal_already_open');
    end if;
    if p_kind = 'ignore' then
      if v_candidate.status = 'ignored' then return app_private.football_mapping_refuse('already_ignored'); end if;
      if v_candidate.status = 'mapped' or v_candidate.existing_mapping_id is not null
        or exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_candidate.provider_name and m.entity_type = 'player'
            and m.external_id = v_candidate.external_id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if v_candidate.lineup_or_incident_seen then
        return app_private.football_mapping_refuse('ignore_refused_id_in_lineup');
      end if;
    elsif v_candidate.status <> 'ignored' then
      return app_private.football_mapping_refuse('not_ignored');
    end if;
    return jsonb_build_object('ok', true,
      'sofascoreExternalId', case when p_sofascore_candidate is not null then v_candidate.external_id end,
      'flashscoreExternalId', case when p_flashscore_candidate is not null then v_candidate.external_id end,
      'providerName', v_candidate.provider_name, 'expectedBefore', null,
      'evidence', jsonb_build_object('candidates', jsonb_build_array(jsonb_build_object(
        'provider', v_candidate.provider_name, 'candidateId', v_cid, 'externalId', v_candidate.external_id,
        'lineupOrIncidentSeen', v_candidate.lineup_or_incident_seen))),
      'signals', '{}'::jsonb,
      'candidateRevisions', jsonb_build_object(v_candidate.provider_name, v_candidate.evidence_revision),
      'positionDisagreement', false);
  end if;
  return app_private.football_mapping_refuse('invalid_proposal');
end;
$$;

-- A proposal moved into a held state by what changed since it was made.
create function app_private.football_mapping_hold_status(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_code
    when 'already_mapped' then 'already_mapped'
    when 'identity_conflict' then 'identity_conflict'
    when 'proposal_already_open' then 'identity_conflict'
    when 'ignore_refused_id_in_lineup' then 'identity_conflict'
    when 'already_ignored' then 'identity_conflict'
    else 'stale_evidence'
  end;
$$;

-- Null when the proposal still rests on today's world; else the code to hold it.
create function app_private.football_mapping_revalidate(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p app_private.football_player_mapping_proposals%rowtype;
  v jsonb;
begin
  select * into p from app_private.football_player_mapping_proposals where id = p_id;
  v := app_private.football_mapping_compute(p.kind, p.sofascore_candidate_id, p.flashscore_candidate_id,
    p.provider_name, p.mapping_id, p.app_player_id, p.new_external_id, p.new_app_player_id, p.id);
  if not (v ->> 'ok')::boolean then
    return v ->> 'code';
  end if;
  if nullif(v -> 'expectedBefore', 'null'::jsonb) is distinct from p.expected_before then
    return 'mapping_row_changed';
  end if;
  if v -> 'candidateRevisions' is distinct from p.candidate_revisions
    or v -> 'evidence' is distinct from (p.evidence - 'refs')
    or v -> 'signals' is distinct from p.signals
    or (v ->> 'positionDisagreement')::boolean is distinct from p.position_disagreement then
    return 'stale_evidence';
  end if;
  return null;
end;
$$;

-- ===========================================================================
-- Candidate bookkeeping
-- ===========================================================================
-- Bring a candidate's status in line with what the mapping table says now.
create function app_private.football_mapping_resync_candidate(p_provider text, p_external_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_open constant text[] := array['pending', 'approved', 'position_disagreement', 'stale_evidence'];
  v_candidate app_private.football_player_mapping_candidates%rowtype;
  v_row app_private.football_provider_mappings%rowtype;
  v_status text;
begin
  select * into v_candidate from app_private.football_player_mapping_candidates
  where provider_name = p_provider and external_id = p_external_id for update;
  if not found then return; end if;
  select * into v_row from app_private.football_provider_mappings
  where provider_name = p_provider and entity_type = 'player' and external_id = p_external_id;
  if found then
    v_status := case when v_row.active then 'mapped' else 'unmapped' end;
    update app_private.football_player_mapping_candidates
    set status = v_status, existing_mapping_id = v_row.id
    where id = v_candidate.id;
  else
    v_status := case
      when v_candidate.status = 'ignored' then 'ignored'
      when exists (select 1 from app_private.football_player_mapping_proposals p
        where p.status = any (c_open)
          and (p.sofascore_candidate_id = v_candidate.id or p.flashscore_candidate_id = v_candidate.id)
          and p.kind in ('map', 'ignore')) then 'proposed'
      else 'unmapped' end;
    update app_private.football_player_mapping_candidates
    set status = v_status, existing_mapping_id = null
    where id = v_candidate.id;
  end if;
end;
$$;

-- A proposal that ended without being executed gives its candidates back.
create function app_private.football_mapping_release_candidates(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p app_private.football_player_mapping_proposals%rowtype;
  v_candidate app_private.football_player_mapping_candidates%rowtype;
  v_cid uuid;
begin
  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id;
  foreach v_cid in array array[p.sofascore_candidate_id, p.flashscore_candidate_id] loop
    continue when v_cid is null;
    select * into v_candidate from app_private.football_player_mapping_candidates where id = v_cid;
    perform app_private.football_mapping_resync_candidate(v_candidate.provider_name, v_candidate.external_id);
  end loop;
end;
$$;

create function app_private.football_mapping_audit(
  p_actor uuid,
  p_action text,
  p_proposal app_private.football_player_mapping_proposals,
  p_reason text,
  p_request_id uuid,
  p_before jsonb default null,
  p_after jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.write_admin_audit(
    p_actor, p_action, 'football', p_proposal.id,
    coalesce(nullif(btrim(p_reason), ''), p_proposal.reason),
    coalesce(p_request_id, gen_random_uuid()), p_proposal.correlation_id, null,
    p_before,
    coalesce(p_after, '{}'::jsonb) || jsonb_build_object(
      'proposalId', p_proposal.id, 'kind', p_proposal.kind, 'status', p_proposal.status,
      'fingerprint', p_proposal.fingerprint, 'batchId', p_proposal.batch_id));
end;
$$;

-- ===========================================================================
-- Propose
-- ===========================================================================
create function api.admin_football_mapping_propose(
  p_items jsonb,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_prev jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_batch uuid := gen_random_uuid();
  v_item jsonb;
  v_index integer := 0;
  v_kind text;
  v_computed jsonb;
  v_row app_private.football_player_mapping_proposals%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_sofa uuid;
  v_flash uuid;
  v_basis text;
  v_status text;
  v_refs jsonb;
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'invalid_proposal';
  end if;
  if char_length(v_reason) not between 10 and 500 then
    raise exception using errcode = 'PT400', message = 'reason_required';
  end if;
  v_prev := app_private.admin_begin_idempotent_operation(
    v_actor, 'football.mapping_propose', p_idempotency_key,
    jsonb_build_object('items', p_items, 'reason', v_reason));
  if v_prev is not null then return v_prev; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_index := v_index + 1;
    v_kind := v_item ->> 'kind';
    v_sofa := nullif(v_item ->> 'sofascoreCandidateId', '')::uuid;
    v_flash := nullif(v_item ->> 'flashscoreCandidateId', '')::uuid;
    v_basis := coalesce(v_item ->> 'basis', 'manual');
    v_refs := coalesce(v_item -> 'evidenceRefs', '[]'::jsonb);
    if v_kind is null or v_kind not in ('map', 'replace', 'deactivate', 'reactivate', 'ignore', 'reverse_ignore')
      or v_basis not in ('incident', 'shirt_position', 'manual')
      or jsonb_typeof(v_refs) <> 'array' or jsonb_array_length(v_refs) > 20
      or app_private.football_mapping_json_has_name_key(v_refs) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'ok', false, 'code', 'invalid_proposal'));
      continue;
    end if;
    v_computed := app_private.football_mapping_compute(
      v_kind, v_sofa, v_flash,
      v_item ->> 'providerName',
      nullif(v_item ->> 'mappingId', '')::uuid,
      nullif(v_item ->> 'appPlayerId', '')::uuid,
      nullif(v_item ->> 'newExternalId', ''),
      nullif(v_item ->> 'newAppPlayerId', '')::uuid);
    if not (v_computed ->> 'ok')::boolean then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'ok', false, 'code', v_computed ->> 'code'));
      continue;
    end if;

    v_row := null;
    v_row.id := gen_random_uuid();
    v_row.batch_id := v_batch;
    v_row.kind := v_kind;
    v_row.sofascore_candidate_id := v_sofa;
    v_row.flashscore_candidate_id := v_flash;
    v_row.sofascore_external_id := v_computed ->> 'sofascoreExternalId';
    v_row.flashscore_external_id := v_computed ->> 'flashscoreExternalId';
    v_row.provider_name := v_computed ->> 'providerName';
    v_row.mapping_id := nullif(v_item ->> 'mappingId', '')::uuid;
    v_row.app_player_id := nullif(v_item ->> 'appPlayerId', '')::uuid;
    v_row.new_external_id := nullif(v_item ->> 'newExternalId', '');
    v_row.new_app_player_id := nullif(v_item ->> 'newAppPlayerId', '')::uuid;
    v_row.expected_before := nullif(v_computed -> 'expectedBefore', 'null'::jsonb);
    v_row.basis := v_basis;
    v_row.evidence := (v_computed -> 'evidence') || jsonb_build_object('refs', v_refs);
    v_row.signals := v_computed -> 'signals';
    v_row.candidate_revisions := v_computed -> 'candidateRevisions';
    v_row.position_disagreement := (v_computed ->> 'positionDisagreement')::boolean;
    v_row.reason := v_reason;
    v_row.requested_by := v_actor;
    v_row.requested_at := statement_timestamp();
    v_row.expires_at := statement_timestamp() + interval '72 hours';
    v_row.correlation_id := gen_random_uuid();
    v_status := case when v_row.position_disagreement then 'position_disagreement' else 'pending' end;
    v_row.status := v_status;
    v_row.fingerprint := app_private.football_mapping_row_fingerprint(v_row);

    begin
      insert into app_private.football_player_mapping_proposals (
        id, batch_id, kind, status, sofascore_candidate_id, flashscore_candidate_id,
        sofascore_external_id, flashscore_external_id, provider_name, mapping_id,
        app_player_id, new_external_id, new_app_player_id, expected_before, basis,
        evidence, signals, candidate_revisions, position_disagreement, reason,
        requested_by, requested_at, expires_at, fingerprint, correlation_id)
      values (
        v_row.id, v_row.batch_id, v_row.kind, v_row.status, v_row.sofascore_candidate_id,
        v_row.flashscore_candidate_id, v_row.sofascore_external_id, v_row.flashscore_external_id,
        v_row.provider_name, v_row.mapping_id, v_row.app_player_id, v_row.new_external_id,
        v_row.new_app_player_id, v_row.expected_before, v_row.basis, v_row.evidence, v_row.signals,
        v_row.candidate_revisions, v_row.position_disagreement, v_row.reason,
        v_row.requested_by, v_row.requested_at, v_row.expires_at, v_row.fingerprint, v_row.correlation_id);
    exception when unique_violation then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'ok', false, 'code', 'proposal_already_open'));
      continue;
    end;

    if v_kind in ('map', 'ignore') then
      update app_private.football_player_mapping_candidates
      set status = 'proposed'
      where id in (v_sofa, v_flash) and status = 'unmapped';
    end if;
    select * into v_row from app_private.football_player_mapping_proposals where id = v_row.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_proposed', v_row,
      v_reason, p_idempotency_key);
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'index', v_index, 'ok', true, 'id', v_row.id, 'kind', v_row.kind, 'status', v_row.status,
      'fingerprint', v_row.fingerprint, 'positionDisagreement', v_row.position_disagreement));
  end loop;

  return app_private.admin_complete_idempotent_operation(
    v_actor, 'football.mapping_propose', p_idempotency_key,
    jsonb_build_object('batchId', v_batch, 'proposals', v_results));
end;
$$;

-- ===========================================================================
-- The proposer's two ways out of a held state, and withdrawing
-- ===========================================================================
create function api.admin_football_mapping_add_position_note(
  p_proposal_id uuid,
  p_note text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_prev jsonb;
  p app_private.football_player_mapping_proposals%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  v_prev := app_private.admin_begin_idempotent_operation(v_actor, 'football.mapping_note',
    p_idempotency_key, jsonb_build_object('id', p_proposal_id, 'note', v_note));
  if v_prev is not null then return v_prev; end if;
  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  if p.requested_by <> v_actor then
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;
  if char_length(v_note) not between 10 and 500 then
    raise exception using errcode = 'PT400', message = 'note_required';
  end if;
  if p.status <> 'position_disagreement' then
    raise exception using errcode = 'PT409', message = 'proposal_not_awaiting_note';
  end if;
  perform set_config('app.football_mapping_note', 'on', true);
  perform set_config('app.football_mapping_refresh', 'on', true);
  p.position_note := v_note;
  p.fingerprint := app_private.football_mapping_row_fingerprint(p);
  update app_private.football_player_mapping_proposals
  set position_note = v_note, fingerprint = p.fingerprint, status = 'pending'
  where id = p.id;
  perform set_config('app.football_mapping_note', 'off', true);
  perform set_config('app.football_mapping_refresh', 'off', true);
  select * into p from app_private.football_player_mapping_proposals where id = p.id;
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_note_added', p, v_note, p_idempotency_key);
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_note',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status,
      'fingerprint', p.fingerprint));
end;
$$;

create function api.admin_football_mapping_refresh_evidence(
  p_proposal_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_prev jsonb;
  p app_private.football_player_mapping_proposals%rowtype;
  v_computed jsonb;
  v_hold text;
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  v_prev := app_private.admin_begin_idempotent_operation(v_actor, 'football.mapping_refresh',
    p_idempotency_key, jsonb_build_object('id', p_proposal_id));
  if v_prev is not null then return v_prev; end if;
  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  if p.requested_by <> v_actor then
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;
  if p.status <> 'stale_evidence' then
    raise exception using errcode = 'PT409', message = 'proposal_not_stale';
  end if;
  v_computed := app_private.football_mapping_compute(p.kind, p.sofascore_candidate_id,
    p.flashscore_candidate_id, p.provider_name, p.mapping_id, p.app_player_id,
    p.new_external_id, p.new_app_player_id, p.id);
  if not (v_computed ->> 'ok')::boolean then
    v_hold := app_private.football_mapping_hold_status(v_computed ->> 'code');
    if v_hold = 'stale_evidence' then
      -- Nothing to refresh to: the world does not allow this decision at all.
      raise exception using errcode = 'PT409', message = v_computed ->> 'code';
    end if;
    update app_private.football_player_mapping_proposals
    set status = v_hold, hold_code = v_computed ->> 'code' where id = p.id;
    perform app_private.football_mapping_release_candidates(p.id);
    select * into p from app_private.football_player_mapping_proposals where id = p.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_held', p,
      'Refresh found the decision no longer possible: ' || (v_computed ->> 'code'), p_idempotency_key);
    return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_refresh',
      p_idempotency_key, jsonb_build_object('ok', false, 'code', v_computed ->> 'code', 'status', p.status));
  end if;

  perform set_config('app.football_mapping_refresh', 'on', true);
  p.expected_before := nullif(v_computed -> 'expectedBefore', 'null'::jsonb);
  p.evidence := (v_computed -> 'evidence') || jsonb_build_object('refs', coalesce(p.evidence -> 'refs', '[]'::jsonb));
  p.signals := v_computed -> 'signals';
  p.candidate_revisions := v_computed -> 'candidateRevisions';
  p.position_disagreement := (v_computed ->> 'positionDisagreement')::boolean;
  p.fingerprint := app_private.football_mapping_row_fingerprint(p);
  -- An earlier approval never carries over: the decision is cleared with the old fingerprint.
  update app_private.football_player_mapping_proposals
  set expected_before = p.expected_before, evidence = p.evidence, signals = p.signals,
      candidate_revisions = p.candidate_revisions, position_disagreement = p.position_disagreement,
      fingerprint = p.fingerprint,
      expires_at = statement_timestamp() + interval '72 hours',
      decided_by = null, decided_at = null, decision_reason = null,
      position_disagreement_acknowledged = false, hold_code = null,
      status = case when p.position_disagreement and p.position_note is null
        then 'position_disagreement' else 'pending' end
  where id = p.id;
  perform set_config('app.football_mapping_refresh', 'off', true);
  select * into p from app_private.football_player_mapping_proposals where id = p.id;
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_refreshed', p,
    'Evidence refreshed; any earlier approval no longer applies.', p_idempotency_key);
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_refresh',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status,
      'fingerprint', p.fingerprint));
end;
$$;

create function api.admin_football_mapping_cancel(
  p_proposal_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_prev jsonb;
  p app_private.football_player_mapping_proposals%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  if char_length(v_reason) not between 10 and 500 then
    raise exception using errcode = 'PT400', message = 'reason_required';
  end if;
  v_prev := app_private.admin_begin_idempotent_operation(v_actor, 'football.mapping_cancel',
    p_idempotency_key, jsonb_build_object('id', p_proposal_id, 'reason', v_reason));
  if v_prev is not null then return v_prev; end if;
  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  if p.requested_by <> v_actor then
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;
  if p.status not in ('pending', 'position_disagreement', 'stale_evidence', 'approved') then
    raise exception using errcode = 'PT409', message = 'proposal_not_open';
  end if;
  -- The cancel reason lives in the audit event; the decision columns stay as they were.
  update app_private.football_player_mapping_proposals set status = 'cancelled' where id = p.id;
  perform app_private.football_mapping_release_candidates(p.id);
  select * into p from app_private.football_player_mapping_proposals where id = p.id;
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_cancelled', p, v_reason, p_idempotency_key);
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_cancel',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status));
end;
$$;

-- ===========================================================================
-- Decide: a DIFFERENT human approves or rejects the exact fingerprint
-- ===========================================================================
create function api.admin_football_mapping_decide(
  p_proposal_id uuid,
  p_decision text,
  p_decision_reason text,
  p_fingerprint text,
  p_position_acknowledged boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_prev jsonb;
  p app_private.football_player_mapping_proposals%rowtype;
  v_reason text := btrim(coalesce(p_decision_reason, ''));
  v_hold text;
  v_new_status text;
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'PT400', message = 'invalid_decision';
  end if;
  if char_length(v_reason) not between 10 and 500 then
    raise exception using errcode = 'PT400', message = 'reason_required';
  end if;
  v_prev := app_private.admin_begin_idempotent_operation(v_actor, 'football.mapping_decide',
    p_idempotency_key, jsonb_build_object('id', p_proposal_id, 'decision', p_decision,
      'reason', v_reason, 'fingerprint', p_fingerprint,
      'ack', coalesce(p_position_acknowledged, false)));
  if v_prev is not null then return v_prev; end if;

  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  if p.requested_by = v_actor then
    raise exception using errcode = 'PT403', message = 'self_approval_denied';
  end if;
  case p.status
    when 'pending' then null;
    when 'position_disagreement' then
      raise exception using errcode = 'PT409', message = 'position_disagreement_unacknowledged';
    when 'stale_evidence' then
      raise exception using errcode = 'PT409', message = 'stale_evidence';
    when 'identity_conflict' then
      raise exception using errcode = 'PT409', message = 'identity_conflict';
    when 'already_mapped' then
      raise exception using errcode = 'PT409', message = 'already_mapped';
    else
      raise exception using errcode = 'PT409', message = 'proposal_not_pending';
  end case;
  if statement_timestamp() > p.expires_at then
    raise exception using errcode = 'PT409', message = 'proposal_expired';
  end if;
  if p_fingerprint is distinct from p.fingerprint
    or app_private.football_mapping_row_fingerprint(p) is distinct from p.fingerprint then
    raise exception using errcode = 'PT409', message = 'fingerprint_mismatch';
  end if;

  if p_decision = 'reject' then
    update app_private.football_player_mapping_proposals
    set status = 'rejected', decided_by = v_actor, decided_at = statement_timestamp(),
        decision_reason = v_reason
    where id = p.id;
    perform app_private.football_mapping_release_candidates(p.id);
    select * into p from app_private.football_player_mapping_proposals where id = p.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_rejected', p, v_reason, p_idempotency_key);
    return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_decide',
      p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status));
  end if;

  -- Approve: the world must still be the one the proposer saw.
  v_hold := app_private.football_mapping_revalidate(p.id);
  if v_hold is not null then
    v_new_status := app_private.football_mapping_hold_status(v_hold);
    update app_private.football_player_mapping_proposals
    set status = v_new_status, hold_code = v_hold where id = p.id;
    perform app_private.football_mapping_release_candidates(p.id);
    select * into p from app_private.football_player_mapping_proposals where id = p.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_held', p,
      'Approval refused, the evidence changed: ' || v_hold, p_idempotency_key);
    return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_decide',
      p_idempotency_key, jsonb_build_object('ok', false, 'code', v_hold, 'status', p.status));
  end if;

  if p.position_disagreement and (p.position_note is null or not coalesce(p_position_acknowledged, false)) then
    raise exception using errcode = 'PT409', message = 'position_disagreement_unacknowledged';
  end if;

  update app_private.football_player_mapping_proposals
  set status = 'approved', decided_by = v_actor, decided_at = statement_timestamp(),
      decision_reason = v_reason,
      position_disagreement_acknowledged = coalesce(p_position_acknowledged, false)
  where id = p.id;
  select * into p from app_private.football_player_mapping_proposals where id = p.id;
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_approved', p, v_reason, p_idempotency_key);
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_decide',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status,
      'fingerprint', p.fingerprint));
end;
$$;

-- ===========================================================================
-- Execute: exactly once, one guarded transaction
-- ===========================================================================
create function api.admin_football_mapping_execute(
  p_proposal_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_prev jsonb;
  p app_private.football_player_mapping_proposals%rowtype;
  v_approver_user uuid;
  v_hold text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_row app_private.football_provider_mappings%rowtype;
  v_cid uuid;
  v_candidate app_private.football_player_mapping_candidates%rowtype;
  v_rows jsonb := '[]'::jsonb;
  v_refusal text;
  v_old_ext text;
  v_source text;
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  v_prev := app_private.admin_begin_idempotent_operation(v_actor, 'football.mapping_execute',
    p_idempotency_key, jsonb_build_object('id', p_proposal_id));
  if v_prev is not null then return v_prev; end if;

  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  if p.status = 'executed' then
    raise exception using errcode = 'PT409', message = 'operation_already_executed';
  end if;
  if p.status <> 'approved' then
    raise exception using errcode = 'PT409', message = 'proposal_not_approved';
  end if;
  if p.decided_at < statement_timestamp() - interval '24 hours' then
    raise exception using errcode = 'PT409', message = 'approval_expired';
  end if;
  if p.decided_by is null or p.decided_by = p.requested_by
    or app_private.football_mapping_row_fingerprint(p) is distinct from p.fingerprint then
    raise exception using errcode = 'PT409', message = 'fingerprint_mismatch';
  end if;
  -- The approver must still be who they were: active, and still allowed to approve.
  select sp.auth_user_id into v_approver_user
  from app_private.staff_principals sp
  where sp.id = p.decided_by and sp.status = 'active';
  if v_approver_user is null
    or not app_private.admin_has_permission(p.decided_by, 'football.manage_mappings') then
    raise exception using errcode = 'PT409', message = 'approver_no_longer_qualified';
  end if;

  -- Re-check the world once more, then write; any refusal rolls the block back.
  begin
    v_hold := app_private.football_mapping_revalidate(p.id);
    if v_hold is not null then
      raise exception using errcode = 'PT409', message = v_hold;
    end if;
    v_source := 'football_player_mapping:' || p.id::text;

    if p.kind = 'map' then
      foreach v_cid in array array[p.sofascore_candidate_id, p.flashscore_candidate_id] loop
        continue when v_cid is null;
        select * into v_candidate from app_private.football_player_mapping_candidates
        where id = v_cid for update;
        if exists (select 1 from app_private.football_provider_mappings m
            where m.provider_name = v_candidate.provider_name and m.entity_type = 'player'
              and (m.external_id = v_candidate.external_id or m.internal_entity_id = p.app_player_id)) then
          raise exception using errcode = 'PT409', message = 'already_mapped';
        end if;
        insert into app_private.football_provider_mappings (
          provider_name, entity_type, external_id, internal_entity_id, source_version,
          last_seen_at, active, manually_corrected, correction_reason, corrected_by, corrected_at)
        values (v_candidate.provider_name, 'player', v_candidate.external_id, p.app_player_id,
          v_source, statement_timestamp(), true, true, p.reason, v_approver_user, statement_timestamp())
        returning * into v_row;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'mappingId', v_row.id, 'provider', v_row.provider_name, 'externalId', v_row.external_id,
          'appPlayerId', v_row.internal_entity_id, 'active', v_row.active));
        perform app_private.football_mapping_resync_candidate(v_candidate.provider_name, v_candidate.external_id);
      end loop;
      v_before := jsonb_build_object('rows', '[]'::jsonb);
      v_after := jsonb_build_object('rows', v_rows);

    elsif p.kind in ('replace', 'deactivate', 'reactivate') then
      select * into v_row from app_private.football_provider_mappings
      where id = p.mapping_id and entity_type = 'player' for update;
      if not found then raise exception using errcode = 'PT409', message = 'mapping_row_changed'; end if;
      -- Compare and swap.
      if jsonb_build_object('mappingId', v_row.id, 'provider', v_row.provider_name,
          'externalId', v_row.external_id, 'appPlayerId', v_row.internal_entity_id, 'active', v_row.active)
        is distinct from p.expected_before then
        raise exception using errcode = 'PT409', message = 'mapping_row_changed';
      end if;
      v_old_ext := v_row.external_id;
      v_before := jsonb_build_object('mappingId', v_row.id, 'provider', v_row.provider_name,
        'externalId', v_row.external_id, 'appPlayerId', v_row.internal_entity_id, 'active', v_row.active);
      update app_private.football_provider_mappings
      set external_id = coalesce(p.new_external_id, external_id),
          internal_entity_id = coalesce(p.new_app_player_id, internal_entity_id),
          active = case p.kind when 'deactivate' then false when 'reactivate' then true else active end,
          source_version = v_source,
          last_seen_at = statement_timestamp(),
          manually_corrected = true,
          correction_reason = p.reason,
          corrected_by = v_approver_user,
          corrected_at = statement_timestamp()
      where id = v_row.id
      returning * into v_row;
      v_after := jsonb_build_object('mappingId', v_row.id, 'provider', v_row.provider_name,
        'externalId', v_row.external_id, 'appPlayerId', v_row.internal_entity_id, 'active', v_row.active);
      perform app_private.football_mapping_resync_candidate(v_row.provider_name, v_old_ext);
      perform app_private.football_mapping_resync_candidate(v_row.provider_name, v_row.external_id);

    elsif p.kind = 'ignore' then
      select * into v_candidate from app_private.football_player_mapping_candidates
      where id = coalesce(p.sofascore_candidate_id, p.flashscore_candidate_id) for update;
      if v_candidate.lineup_or_incident_seen then
        raise exception using errcode = 'PT409', message = 'ignore_refused_id_in_lineup';
      end if;
      v_before := jsonb_build_object('candidateId', v_candidate.id, 'status', v_candidate.status);
      update app_private.football_player_mapping_candidates set status = 'ignored' where id = v_candidate.id;
      v_after := jsonb_build_object('candidateId', v_candidate.id, 'status', 'ignored');

    else -- reverse_ignore
      select * into v_candidate from app_private.football_player_mapping_candidates
      where id = coalesce(p.sofascore_candidate_id, p.flashscore_candidate_id) for update;
      v_before := jsonb_build_object('candidateId', v_candidate.id, 'status', v_candidate.status);
      update app_private.football_player_mapping_candidates set status = 'unmapped' where id = v_candidate.id;
      v_after := jsonb_build_object('candidateId', v_candidate.id, 'status', 'unmapped');
    end if;

    update app_private.football_player_mapping_proposals
    set status = 'executed', executed_by = v_actor, executed_at = statement_timestamp(),
        executed_before = v_before, executed_after = v_after,
        execution_idempotency_key = p_idempotency_key
    where id = p.id;
  exception
    when unique_violation then v_refusal := 'already_mapped';
    when sqlstate 'PT409' then get stacked diagnostics v_refusal = message_text;
  end;

  if v_refusal is not null then
    -- The block rolled back: the mapping table is exactly as it was. Remember why.
    v_hold := app_private.football_mapping_hold_status(v_refusal);
    update app_private.football_player_mapping_proposals
    set status = v_hold, hold_code = v_refusal where id = p.id;
    perform app_private.football_mapping_release_candidates(p.id);
    select * into p from app_private.football_player_mapping_proposals where id = p.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_held', p,
      'Execution refused, nothing written: ' || v_refusal, p_idempotency_key);
    return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_execute',
      p_idempotency_key, jsonb_build_object('ok', false, 'code', v_refusal, 'status', p.status));
  end if;

  select * into p from app_private.football_player_mapping_proposals where id = p.id;
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_executed', p,
    p.decision_reason, p_idempotency_key, v_before,
    jsonb_build_object('after', v_after, 'requestedBy', p.requested_by, 'decidedBy', p.decided_by,
      'executedBy', p.executed_by, 'requestedAt', p.requested_at, 'decidedAt', p.decided_at,
      'executedAt', p.executed_at, 'reason', p.reason));
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_execute',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status,
      'before', v_before, 'after', v_after));
end;
$$;

-- ===========================================================================
-- Reads (staff: football.read_operations or football.manage_mappings)
-- ===========================================================================
create function app_private.football_mapping_require_reader(p_principal uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app_private.admin_has_permission(p_principal, 'football.read_operations')
    or app_private.admin_has_permission(p_principal, 'football.manage_mappings')) then
    raise exception using errcode = 'PT403', message = 'permission_missing';
  end if;
end;
$$;

create function app_private.football_mapping_candidate_json(p_candidate app_private.football_player_mapping_candidates)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_candidate.id,
    'provider', p_candidate.provider_name,
    'externalId', p_candidate.external_id,
    'status', p_candidate.status,
    'statusChangedAt', p_candidate.status_changed_at,
    'existingMappingId', p_candidate.existing_mapping_id,
    'displayName', p_candidate.display_name,
    'displayNamePurgedAt', p_candidate.display_name_purged_at,
    'lineupOrIncidentSeen', p_candidate.lineup_or_incident_seen,
    'evidenceRevision', p_candidate.evidence_revision,
    'flags', to_jsonb(array_remove(array[
      case when (select count(*) from app_private.football_player_mapping_observations o
        where o.candidate_id = p_candidate.id) > 1 then 'MULTI_SQUAD_OBSERVATION' end,
      case when exists (select 1 from app_private.football_player_mapping_observations o
        where o.candidate_id = p_candidate.id and o.squad_completeness = 'INCOMPLETE_PROVIDER_SQUAD')
        then 'INCOMPLETE_PROVIDER_SQUAD' end,
      case when exists (select 1 from app_private.football_player_mapping_observations o
        where o.candidate_id = p_candidate.id and o.registered_team_disagreement)
        then 'REGISTERED_TEAM_DISAGREEMENT' end
    ], null)),
    'observations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'providerTeamId', o.provider_team_id, 'clubKey', o.club_key, 'appTeamId', o.app_team_id,
        'squadCompleteness', o.squad_completeness, 'registeredTeamId', o.registered_team_id,
        'registeredTeamDisagreement', o.registered_team_disagreement,
        'shirtNumber', o.shirt_number, 'position', o.position_signal, 'dobState', o.dob_state,
        'dobJanuary1', o.dob_january1, 'heightCm', o.height_cm,
        'nationality', o.nationality_signal, 'observedAt', o.observed_at)
        order by o.provider_team_id)
      from app_private.football_player_mapping_observations o where o.candidate_id = p_candidate.id), '[]'::jsonb),
    'openProposalId', (select p.id from app_private.football_player_mapping_proposals p
      where (p.sofascore_candidate_id = p_candidate.id or p.flashscore_candidate_id = p_candidate.id)
        and p.status in ('pending', 'approved', 'position_disagreement', 'stale_evidence') limit 1));
$$;

create function api.admin_football_mapping_list_candidates(
  p_status text default null,
  p_provider text default null,
  p_limit integer default 50,
  p_after uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  if p_status is not null and p_status not in ('unmapped', 'proposed', 'mapped', 'ignored') then
    raise exception using errcode = 'PT400', message = 'invalid_filter';
  end if;
  if p_provider is not null and p_provider not in ('sofascore', 'flashscore') then
    raise exception using errcode = 'PT400', message = 'invalid_filter';
  end if;
  return coalesce((
    select jsonb_agg(app_private.football_mapping_candidate_json(c) order by c.id)
    from (
      select * from app_private.football_player_mapping_candidates c
      where (p_status is null or c.status = p_status)
        and (p_provider is null or c.provider_name = p_provider)
        and (p_after is null or c.id > p_after)
      order by c.id
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) c), '[]'::jsonb);
end;
$$;

create function api.admin_football_mapping_get_candidate(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
  c app_private.football_player_mapping_candidates%rowtype;
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  select * into c from app_private.football_player_mapping_candidates where id = p_candidate_id;
  if not found then raise exception using errcode = 'PT404', message = 'candidate_not_found'; end if;
  return app_private.football_mapping_candidate_json(c);
end;
$$;

create function app_private.football_mapping_proposal_json(
  p app_private.football_player_mapping_proposals,
  p_viewer uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'batchId', p.batch_id, 'kind', p.kind, 'status', p.status,
    'effectiveStatus', case
      when p.status in ('pending', 'position_disagreement', 'stale_evidence')
        and statement_timestamp() > p.expires_at then 'expired'
      when p.status = 'approved' and statement_timestamp() > p.decided_at + interval '24 hours' then 'expired'
      else p.status end,
    'sofascoreCandidateId', p.sofascore_candidate_id, 'flashscoreCandidateId', p.flashscore_candidate_id,
    'sofascoreExternalId', p.sofascore_external_id, 'flashscoreExternalId', p.flashscore_external_id,
    'providerName', p.provider_name, 'mappingId', p.mapping_id, 'appPlayerId', p.app_player_id,
    'newExternalId', p.new_external_id, 'newAppPlayerId', p.new_app_player_id,
    'expectedBefore', p.expected_before, 'basis', p.basis, 'evidence', p.evidence, 'signals', p.signals,
    'positionDisagreement', p.position_disagreement, 'positionNote', p.position_note,
    'positionDisagreementAcknowledged', p.position_disagreement_acknowledged,
    'reason', p.reason, 'requestedBy', p.requested_by, 'requestedAt', p.requested_at,
    'expiresAt', p.expires_at, 'decidedBy', p.decided_by, 'decidedAt', p.decided_at,
    'decisionReason', p.decision_reason, 'fingerprint', p.fingerprint,
    'executedBy', p.executed_by, 'executedAt', p.executed_at,
    'executedBefore', p.executed_before, 'executedAfter', p.executed_after,
    'holdCode', p.hold_code,
    'proposedByMe', p.requested_by = p_viewer,
    'canApprove', p.status = 'pending' and p.requested_by <> p_viewer
      and statement_timestamp() <= p.expires_at);
$$;

create function api.admin_football_mapping_list_proposals(
  p_status text default null,
  p_limit integer default 50,
  p_after uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  if p_status is not null and p_status not in ('open', 'pending', 'approved', 'executed', 'rejected',
    'expired', 'cancelled', 'stale_evidence', 'identity_conflict', 'position_disagreement', 'already_mapped') then
    raise exception using errcode = 'PT400', message = 'invalid_filter';
  end if;
  return coalesce((
    select jsonb_agg(app_private.football_mapping_proposal_json(p, v_viewer) order by p.id)
    from (
      select * from app_private.football_player_mapping_proposals p
      where (p_status is null
          or (p_status = 'open' and p.status in ('pending', 'approved', 'position_disagreement', 'stale_evidence'))
          or p.status = p_status)
        and (p_after is null or p.id > p_after)
      order by p.id
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) p), '[]'::jsonb);
end;
$$;

create function api.admin_football_mapping_get_proposal(p_proposal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
  p app_private.football_player_mapping_proposals%rowtype;
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  return app_private.football_mapping_proposal_json(p, v_viewer);
end;
$$;

-- The count behind "second qualified reviewer required" (decision D4).
create function api.admin_football_mapping_reviewer_availability()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
  v_count integer;
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  select count(*) into v_count
  from app_private.staff_principals sp
  where sp.status = 'active' and sp.id <> v_viewer
    and app_private.admin_has_permission(sp.id, 'football.manage_mappings')
    and app_private.admin_has_verified_mfa(sp.auth_user_id);
  return jsonb_build_object('qualifiedReviewersAvailable', v_count,
    'secondReviewerRequired', v_count = 0);
end;
$$;

-- App players for the reviewer to choose from, ranked by agreement. Position
-- never filters, a missing value never lowers a rank, nobody is dropped.
create function api.admin_football_mapping_app_player_options(
  p_candidate_id uuid,
  p_app_team_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
  c app_private.football_player_mapping_candidates%rowtype;
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  select * into c from app_private.football_player_mapping_candidates where id = p_candidate_id;
  if not found then raise exception using errcode = 'PT404', message = 'candidate_not_found'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'appPlayerId', ranked.id, 'displayName', ranked.display_name,
        'position', app_private.football_mapping_position_letter(ranked.position),
        'signals', ranked.signals, 'score', ranked.score,
        'alreadyMappedForProvider', ranked.mapped) order by ranked.score desc, ranked.id)
    from (
      select scored.*
      from (
        select pl.id, pl.display_name, pl.position, signal.signals,
          app_private.football_mapping_signal_score(signal.signals) as score,
          exists (select 1 from app_private.football_provider_mappings m
            where m.provider_name = c.provider_name and m.entity_type = 'player'
              and m.internal_entity_id = pl.id) as mapped
        from (
          select * from app.players pool
          where pool.active
            and (p_app_team_id is null or exists (select 1 from app.team_memberships m
              where m.player_id = pool.id and m.team_id = p_app_team_id and m.active))
          order by pool.id
          limit 2000
        ) pl
        cross join lateral (select app_private.football_mapping_candidate_signals(c.id, pl.id) as signals) signal
      ) scored
      order by scored.score desc, scored.id
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) ranked), '[]'::jsonb);
end;
$$;

-- ===========================================================================
-- Trusted writes (service_role): the builder, the sweeper, the name purge
-- ===========================================================================
-- Records what the read-only collector saw. Writes only the candidate and
-- observation tables: never a mapping, a proposal, a player or a score.
create function api.football_mapping_record_observations(p_observations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_candidate_id uuid;
  v_created integer := 0;
  v_seen integer := 0;
  v_obs_new integer := 0;
  v_obs_changed integer := 0;
  v_bumped integer := 0;
  v_provider text;
  v_external text;
  v_existing app_private.football_player_mapping_observations%rowtype;
  v_status text;
  v_mapping app_private.football_provider_mappings%rowtype;
  v_changed boolean;
  v_dob_state text;
  v_birth date;
begin
  if p_observations is null or jsonb_typeof(p_observations) <> 'array'
    or jsonb_array_length(p_observations) > 2000 then
    raise exception using errcode = 'PT400', message = 'invalid_observations';
  end if;
  for v_item in select value from jsonb_array_elements(p_observations) loop
    v_provider := v_item ->> 'provider';
    v_external := v_item ->> 'externalPlayerId';
    if v_provider not in ('sofascore', 'flashscore') or v_external is null
      or char_length(btrim(v_external)) not between 1 and 200 then
      raise exception using errcode = 'PT400', message = 'invalid_observations';
    end if;
    v_dob_state := coalesce(v_item ->> 'dobState', 'missing');
    v_birth := case when v_dob_state = 'valid' then (v_item ->> 'birthDate')::date end;

    select id into v_candidate_id from app_private.football_player_mapping_candidates
    where provider_name = v_provider and external_id = v_external;
    if v_candidate_id is null then
      select * into v_mapping from app_private.football_provider_mappings
      where provider_name = v_provider and entity_type = 'player' and external_id = v_external;
      v_status := case when v_mapping.id is null then 'unmapped'
        when v_mapping.active then 'mapped' else 'unmapped' end;
      insert into app_private.football_player_mapping_candidates (
        provider_name, external_id, status, existing_mapping_id, display_name, lineup_or_incident_seen)
      values (v_provider, v_external, v_status, v_mapping.id,
        nullif(btrim(v_item ->> 'displayName'), ''),
        coalesce((v_item ->> 'seenInLineupOrIncident')::boolean, false))
      returning id into v_candidate_id;
      v_created := v_created + 1;
    end if;
    v_seen := v_seen + 1;

    select * into v_existing from app_private.football_player_mapping_observations
    where candidate_id = v_candidate_id and provider_team_id = v_item ->> 'providerTeamId' for update;
    if not found then
      insert into app_private.football_player_mapping_observations (
        candidate_id, provider_team_id, club_key, app_team_id, squad_completeness, registered_team_id,
        registered_team_disagreement, shirt_number, position_signal, dob_state, provider_birth_date,
        dob_january1, height_cm, nationality_signal)
      values (v_candidate_id, v_item ->> 'providerTeamId', nullif(v_item ->> 'clubKey', ''),
        nullif(v_item ->> 'appTeamId', '')::uuid,
        coalesce(v_item ->> 'squadCompleteness', 'COMPLETE'),
        nullif(v_item ->> 'registeredTeamId', ''),
        coalesce((v_item ->> 'registeredTeamDisagreement')::boolean, false),
        nullif(v_item ->> 'shirtNumber', '')::smallint, nullif(v_item ->> 'positionSignal', ''),
        v_dob_state, v_birth, coalesce((v_item ->> 'dobJanuary1')::boolean, false),
        nullif(v_item ->> 'heightCm', '')::smallint, nullif(v_item ->> 'nationalitySignal', ''));
      v_obs_new := v_obs_new + 1;
      v_changed := true;
    else
      v_changed := (v_existing.squad_completeness, v_existing.registered_team_id,
          v_existing.registered_team_disagreement, v_existing.shirt_number, v_existing.position_signal,
          v_existing.dob_state, v_existing.provider_birth_date, v_existing.dob_january1,
          v_existing.height_cm, v_existing.nationality_signal, v_existing.app_team_id)
        is distinct from (coalesce(v_item ->> 'squadCompleteness', 'COMPLETE'),
          nullif(v_item ->> 'registeredTeamId', ''),
          coalesce((v_item ->> 'registeredTeamDisagreement')::boolean, false),
          nullif(v_item ->> 'shirtNumber', '')::smallint, nullif(v_item ->> 'positionSignal', ''),
          v_dob_state, v_birth, coalesce((v_item ->> 'dobJanuary1')::boolean, false),
          nullif(v_item ->> 'heightCm', '')::smallint, nullif(v_item ->> 'nationalitySignal', ''),
          nullif(v_item ->> 'appTeamId', '')::uuid);
      update app_private.football_player_mapping_observations
      set squad_completeness = coalesce(v_item ->> 'squadCompleteness', 'COMPLETE'),
          registered_team_id = nullif(v_item ->> 'registeredTeamId', ''),
          registered_team_disagreement = coalesce((v_item ->> 'registeredTeamDisagreement')::boolean, false),
          shirt_number = nullif(v_item ->> 'shirtNumber', '')::smallint,
          position_signal = nullif(v_item ->> 'positionSignal', ''),
          dob_state = v_dob_state, provider_birth_date = v_birth,
          dob_january1 = coalesce((v_item ->> 'dobJanuary1')::boolean, false),
          height_cm = nullif(v_item ->> 'heightCm', '')::smallint,
          nationality_signal = nullif(v_item ->> 'nationalitySignal', ''),
          app_team_id = nullif(v_item ->> 'appTeamId', '')::uuid,
          club_key = nullif(v_item ->> 'clubKey', ''),
          observed_at = statement_timestamp()
      where id = v_existing.id;
      if v_changed then v_obs_changed := v_obs_changed + 1; end if;
    end if;

    update app_private.football_player_mapping_candidates
    set last_observed_at = statement_timestamp(),
        evidence_revision = evidence_revision + case when v_changed then 1 else 0 end,
        lineup_or_incident_seen = lineup_or_incident_seen
          or coalesce((v_item ->> 'seenInLineupOrIncident')::boolean, false),
        -- A reviewer reads the name while the decision is open; mapped and ignored
        -- candidates keep the retention rule (no refill after the purge).
        display_name = case when status in ('unmapped', 'proposed')
          then coalesce(nullif(btrim(v_item ->> 'displayName'), ''), display_name) else display_name end
    where id = v_candidate_id;
    if v_changed then v_bumped := v_bumped + 1; end if;
  end loop;
  return jsonb_build_object('candidatesCreated', v_created, 'observationsSeen', v_seen,
    'observationsCreated', v_obs_new, 'observationsChanged', v_obs_changed, 'revisionsBumped', v_bumped);
end;
$$;

create function api.football_mapping_expire_proposals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  p app_private.football_player_mapping_proposals%rowtype;
  v_count integer := 0;
begin
  for p in
    select * from app_private.football_player_mapping_proposals
    where (status in ('pending', 'position_disagreement', 'stale_evidence') and expires_at < statement_timestamp())
      or (status = 'approved' and decided_at < statement_timestamp() - interval '24 hours')
    order by requested_at
    for update skip locked
  loop
    update app_private.football_player_mapping_proposals set status = 'expired' where id = p.id;
    perform app_private.football_mapping_release_candidates(p.id);
    select * into p from app_private.football_player_mapping_proposals where id = p.id;
    perform app_private.football_mapping_audit(null, 'football.mapping_expired', p,
      'The proposal was not decided or executed in time.', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Retention (decision D3): ONLY the provider's display name, 90 days after the
-- candidate became mapped or ignored. Ids, signals, fingerprints, decisions
-- and audit events stay.
create function api.football_mapping_purge_display_names()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update app_private.football_player_mapping_candidates
  set display_name = null, display_name_purged_at = statement_timestamp()
  where status in ('mapped', 'ignored')
    and display_name is not null
    and status_changed_at < statement_timestamp() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ===========================================================================
-- The one existing path that could write a player mapping for the new providers
-- ===========================================================================
-- api.resolve_football_mapping (service_role, used by the SportsMonks
-- ingestion) inserts a mapping row for any registered provider. Once sofascore
-- and flashscore are registered it could therefore create their PLAYER mappings
-- with no proposer, no second person and no audit. This adds exactly one guard
-- and changes nothing else: a player mapping for either reviewed provider is
-- refused (MAPPING_REVIEW_REQUIRED) before the insert. Every other provider and
-- entity behaves as before, and no code calls it for these providers today.
-- The preflight pins the text it was reviewed against (md5 read on production
-- on 1 Oct 2026), so a drifted definition stops this migration instead of
-- being overwritten.
do $guard_preflight$
begin
  if md5(pg_get_functiondef('api.resolve_football_mapping(text,text,text,uuid,text,timestamptz)'::regprocedure))
    <> '5d7ad20856e2bb22e2b7d44741e21be1' then
    raise exception 'football_player_mapping: api.resolve_football_mapping is not the text this migration was reviewed against';
  end if;
end
$guard_preflight$;

create or replace function api.resolve_football_mapping(
  p_provider_name text,
  p_entity_type text,
  p_external_id text,
  p_internal_entity_id uuid default null,
  p_source_version text default null,
  p_last_seen_at timestamp with time zone default statement_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  mapped_id uuid;
  normalized_entity_type app_private.football_entity_type;
begin
  if p_entity_type not in (
    'country', 'competition', 'season', 'round', 'venue', 'team',
    'player', 'fixture', 'event'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ENTITY_TYPE';
  end if;
  normalized_entity_type := p_entity_type::app_private.football_entity_type;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider_name || ':' || p_entity_type || ':' || p_external_id, 0)
  );

  select mapping.internal_entity_id into mapped_id
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = normalized_entity_type
    and mapping.external_id = p_external_id
    and mapping.active;

  if mapped_id is not null then
    if p_internal_entity_id is not null and mapped_id <> p_internal_entity_id then
      raise exception using errcode = 'P0001', message = 'MAPPING_COLLISION';
    end if;
    update app_private.football_provider_mappings
    set last_seen_at = greatest(last_seen_at, p_last_seen_at),
        source_version = coalesce(p_source_version, source_version)
    where provider_name = p_provider_name
      and entity_type = normalized_entity_type
      and external_id = p_external_id;
    return mapped_id;
  end if;

  if p_internal_entity_id is null then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;

  -- The only change: a reviewed provider's player mapping is never created here.
  if p_provider_name in ('sofascore', 'flashscore') and normalized_entity_type = 'player' then
    raise exception using errcode = 'P0001', message = 'MAPPING_REVIEW_REQUIRED';
  end if;

  begin
    insert into app_private.football_provider_mappings (
      provider_name, entity_type, external_id, internal_entity_id,
      source_version, last_seen_at
    ) values (
      p_provider_name, normalized_entity_type, p_external_id,
      p_internal_entity_id, p_source_version, p_last_seen_at
    );
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'MAPPING_COLLISION';
  end;
  return p_internal_entity_id;
end;
$$;

-- ===========================================================================
-- Privileges
-- ===========================================================================
revoke all on function
  app_private.football_mapping_position_letter(app.football_position),
  app_private.football_mapping_dob_signal(date, text, date, boolean, date),
  app_private.football_mapping_candidate_signals(uuid, uuid),
  app_private.football_mapping_signal_score(jsonb),
  app_private.football_mapping_row_fingerprint(app_private.football_player_mapping_proposals),
  app_private.football_mapping_refuse(text),
  app_private.football_mapping_compute(text, uuid, uuid, text, uuid, uuid, text, uuid, uuid),
  app_private.football_mapping_hold_status(text),
  app_private.football_mapping_revalidate(uuid),
  app_private.football_mapping_resync_candidate(text, text),
  app_private.football_mapping_release_candidates(uuid),
  app_private.football_mapping_audit(uuid, text, app_private.football_player_mapping_proposals, text, uuid, jsonb, jsonb),
  app_private.football_mapping_require_reader(uuid),
  app_private.football_mapping_candidate_json(app_private.football_player_mapping_candidates),
  app_private.football_mapping_proposal_json(app_private.football_player_mapping_proposals, uuid)
from public, anon, authenticated, service_role;

revoke all on function
  api.admin_football_mapping_propose(jsonb, text, uuid),
  api.admin_football_mapping_add_position_note(uuid, text, uuid),
  api.admin_football_mapping_refresh_evidence(uuid, uuid),
  api.admin_football_mapping_cancel(uuid, text, uuid),
  api.admin_football_mapping_decide(uuid, text, text, text, boolean, uuid),
  api.admin_football_mapping_execute(uuid, uuid),
  api.admin_football_mapping_list_candidates(text, text, integer, uuid),
  api.admin_football_mapping_get_candidate(uuid),
  api.admin_football_mapping_list_proposals(text, integer, uuid),
  api.admin_football_mapping_get_proposal(uuid),
  api.admin_football_mapping_reviewer_availability(),
  api.admin_football_mapping_app_player_options(uuid, uuid, integer),
  api.football_mapping_record_observations(jsonb),
  api.football_mapping_expire_proposals(),
  api.football_mapping_purge_display_names()
from public, anon, authenticated, service_role;

-- Staff, through the browser session: authority is checked inside each function.
grant execute on function
  api.admin_football_mapping_propose(jsonb, text, uuid),
  api.admin_football_mapping_add_position_note(uuid, text, uuid),
  api.admin_football_mapping_refresh_evidence(uuid, uuid),
  api.admin_football_mapping_cancel(uuid, text, uuid),
  api.admin_football_mapping_decide(uuid, text, text, text, boolean, uuid),
  api.admin_football_mapping_execute(uuid, uuid),
  api.admin_football_mapping_list_candidates(text, text, integer, uuid),
  api.admin_football_mapping_get_candidate(uuid),
  api.admin_football_mapping_list_proposals(text, integer, uuid),
  api.admin_football_mapping_get_proposal(uuid),
  api.admin_football_mapping_reviewer_availability(),
  api.admin_football_mapping_app_player_options(uuid, uuid, integer)
to authenticated;

-- Trusted jobs: the service role only. Never a browser role.
grant execute on function
  api.football_mapping_record_observations(jsonb),
  api.football_mapping_expire_proposals(),
  api.football_mapping_purge_display_names()
to service_role;

comment on function api.admin_football_mapping_propose(jsonb, text, uuid) is
  'Staff (football.manage_mappings, AAL2, recent authentication): propose up to 100 mapping decisions as one batch. Creates pending proposals only; nothing is mapped.';
comment on function api.admin_football_mapping_decide(uuid, text, text, text, boolean, uuid) is
  'Staff (football.manage_mappings, AAL2, recent authentication): a DIFFERENT human approves or rejects the exact fingerprint. Self-approval is refused here and by a table check.';
comment on function api.admin_football_mapping_execute(uuid, uuid) is
  'Staff (football.manage_mappings, AAL2, recent authentication): executes one approved proposal exactly once, in one guarded transaction. Replace, deactivate and reactivate update the existing mapping row.';
comment on function api.football_mapping_record_observations(jsonb) is
  'Service role: records what the read-only squad collector saw as candidates and observations. Never writes a mapping, proposal, player or score.';
comment on function api.football_mapping_purge_display_names() is
  'Service role: nulls provider display names 90 days after a candidate became mapped or ignored; nothing else is purged.';
$bg_20261001161000_file$]
);

-- ---------------------------------------------------------------------------
-- Run them from the history, in order, once each is the repository file byte
-- for byte. Same transaction: all three or none.
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261001150000 text := (select statements[1] from supabase_migrations.schema_migrations where version = '20261001150000');
  part_20261001160000 text := (select statements[1] from supabase_migrations.schema_migrations where version = '20261001160000');
  part_20261001161000 text := (select statements[1] from supabase_migrations.schema_migrations where version = '20261001161000');
begin
  if encode(sha256(convert_to(part_20261001150000, 'UTF8')), 'hex') is distinct from '0259c253dd732a80479659d0227588cc1b6178154fe71c407f951cf4ab84f8ff' then
    raise exception 'stop: 20261001150000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261001160000, 'UTF8')), 'hex') is distinct from '9377693f2c93836e211c6988de72dc7edafeee16d8a3d8edea1cf11fcc452005' then
    raise exception 'stop: 20261001160000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261001161000, 'UTF8')), 'hex') is distinct from '74e38306009dff996e12e191057232a269ef961c2e1176b330adbb268d4f0406' then
    raise exception 'stop: 20261001161000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261001150000;
  execute part_20261001160000;
  execute part_20261001161000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight (reads, and probes that write nothing or roll themselves back)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  b mapping_apply_baseline%rowtype;
  problems text[] := array[]::text[];
  report jsonb := '{}'::jsonb;
  staff_fns text[] := array['api.admin_football_mapping_add_position_note', 'api.admin_football_mapping_app_player_options', 'api.admin_football_mapping_cancel', 'api.admin_football_mapping_decide', 'api.admin_football_mapping_execute', 'api.admin_football_mapping_get_candidate', 'api.admin_football_mapping_get_proposal', 'api.admin_football_mapping_list_candidates', 'api.admin_football_mapping_list_proposals', 'api.admin_football_mapping_propose', 'api.admin_football_mapping_refresh_evidence', 'api.admin_football_mapping_reviewer_availability'];
  trusted_fns text[] := array['api.football_mapping_expire_proposals', 'api.football_mapping_purge_display_names', 'api.football_mapping_record_observations'];
  helper_fns text[] := array['app_private.football_mapping_audit', 'app_private.football_mapping_candidate_guard', 'app_private.football_mapping_candidate_json', 'app_private.football_mapping_candidate_signals', 'app_private.football_mapping_compute', 'app_private.football_mapping_dob_signal', 'app_private.football_mapping_forbid_delete', 'app_private.football_mapping_hold_status', 'app_private.football_mapping_json_has_name_key', 'app_private.football_mapping_observation_guard', 'app_private.football_mapping_position_letter', 'app_private.football_mapping_proposal_guard', 'app_private.football_mapping_proposal_json', 'app_private.football_mapping_refuse', 'app_private.football_mapping_release_candidates', 'app_private.football_mapping_require_reader', 'app_private.football_mapping_resync_candidate', 'app_private.football_mapping_revalidate', 'app_private.football_mapping_row_fingerprint', 'app_private.football_mapping_signal_score'];
  fn text;
  oid_ regprocedure;
  tbl text;
  role_ text;
  probe_player uuid;
  probe_ext text;
  probe_internal uuid;
  probe_team uuid;
  answer uuid;
  msg text;
  new_def text;
  guard_text constant text :=
    E'  -- The only change: a reviewed provider''s player mapping is never created here.\n'
    || E'  if p_provider_name in (''sofascore'', ''flashscore'') and normalized_entity_type = ''player'' then\n'
    || E'    raise exception using errcode = ''P0001'', message = ''MAPPING_REVIEW_REQUIRED'';\n'
    || E'  end if;\n\n';
  n integer;
begin
  select * into b from mapping_apply_baseline;

  -- ---- Provider registration -------------------------------------------------
  if (select count(*) from app_private.football_providers where name = 'sofascore') <> 1
    or (select count(*) from app_private.football_providers where name = 'flashscore') <> 1 then
    problems := problems || 'sofascore and flashscore must each exist exactly once'::text;
  end if;
  if exists (select 1 from app_private.football_providers
      where name in ('sofascore', 'flashscore') and not (active and configuration_version = 1)) then
    problems := problems || 'a new provider is not active at configuration_version 1'::text;
  end if;
  if (select count(*) from app_private.football_providers) <> b.provider_count + 2 then
    problems := problems || 'the provider table did not grow by exactly two rows'::text;
  end if;
  if (select md5(coalesce(string_agg(p::text, '|' order by p.name), ''))
      from app_private.football_providers p where p.name not in ('sofascore', 'flashscore')) is distinct from b.provider_digest then
    problems := problems || 'an earlier provider row changed'::text;
  end if;

  -- ---- The mapping table is untouched ----------------------------------------
  if (select count(*) from app_private.football_provider_mappings) is distinct from b.mapping_count
    or (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m)
      is distinct from b.mapping_digest then
    problems := problems || 'existing football_provider_mappings rows changed'::text;
  end if;
  if (select md5(string_agg(conname || ':' || pg_get_constraintdef(oid) || ':' || condeferrable::text, '|' order by conname))
      from pg_catalog.pg_constraint where conrelid = 'app_private.football_provider_mappings'::regclass)
    is distinct from b.mapping_constraint_digest
    or (select count(*) from pg_catalog.pg_constraint
        where conrelid = 'app_private.football_provider_mappings'::regclass and contype = 'u') <> 2 then
    problems := problems || 'the mapping table''s constraints changed'::text;
  end if;
  if (select md5(coalesce(string_agg(indexdef, '|' order by indexname), '')) from pg_catalog.pg_indexes
      where schemaname = 'app_private' and tablename = 'football_provider_mappings') is distinct from b.mapping_index_digest then
    problems := problems || 'the mapping table''s indexes changed'::text;
  end if;
  if (select md5(coalesce(string_agg(pg_get_triggerdef(oid), '|' order by tgname), '')) from pg_catalog.pg_trigger
      where tgrelid = 'app_private.football_provider_mappings'::regclass and not tgisinternal) is distinct from b.mapping_trigger_digest then
    problems := problems || 'the mapping table''s triggers changed'::text;
  end if;
  if (select relacl::text from pg_catalog.pg_class where oid = 'app_private.football_provider_mappings'::regclass)
    is distinct from b.mapping_acl then
    problems := problems || 'the mapping table''s privileges changed'::text;
  end if;
  if exists (select 1 from pg_catalog.pg_constraint c
      where c.confrelid = 'app_private.football_provider_mappings'::regclass) then
    problems := problems || 'a foreign key now points at the mapping table'::text;
  end if;
  if exists (select 1 from app_private.football_provider_mappings where provider_name in ('sofascore', 'flashscore')) then
    problems := problems || 'applying the migrations created a mapping row for a reviewed provider'::text;
  end if;

  -- ---- The new workflow tables ----------------------------------------------
  foreach tbl in array array['football_player_mapping_candidates', 'football_player_mapping_observations',
      'football_player_mapping_proposals'] loop
    if to_regclass('app_private.' || tbl) is null then
      problems := problems || (tbl || ' does not exist');
      continue;
    end if;
    if not (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class where oid = ('app_private.' || tbl)::regclass) then
      problems := problems || (tbl || ' does not have forced row level security');
    end if;
    if exists (select 1 from pg_catalog.pg_policy where polrelid = ('app_private.' || tbl)::regclass) then
      problems := problems || (tbl || ' has a policy');
    end if;
    foreach role_ in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(role_, 'app_private.' || tbl, 'select, insert, update, delete, truncate, references, trigger') then
        problems := problems || (role_ || ' holds a table privilege on ' || tbl);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_class c, aclexplode(c.relacl) a
        where c.oid = ('app_private.' || tbl)::regclass and a.grantee = 0) then
      problems := problems || ('PUBLIC holds a grant on ' || tbl);
    end if;
    execute format('select count(*) from app_private.%I', tbl) into n;
    if n <> 0 then problems := problems || (tbl || ' is not empty'); end if;
  end loop;
  if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'app_private' and c.relname like 'football_player_mapping%' and c.relkind = 'r') <> 3 then
    problems := problems || 'the new tables are not exactly three'::text;
  end if;
  if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
      where s.nspname in ('api', 'app', 'app_private') and c.relkind in ('r', 'p', 'v', 'm')) <> b.relations + 3 then
    problems := problems || 'the number of tables and views did not grow by exactly three'::text;
  end if;
  if exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'app_private' and c.relname like 'football_player_mapping%' and c.relkind = 'S') then
    problems := problems || 'a sequence was created'::text;
  end if;

  -- ---- Functions and privileges ---------------------------------------------
  select count(*) into n from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'api' and (p.proname like 'football_mapping%' or p.proname like 'admin_football_mapping%');
  if n <> 15 or (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace where s.nspname = 'api') <> b.api_procs + 15 then
    problems := problems || 'the api schema did not gain exactly the 15 expected functions'::text;
  end if;
  select count(*) into n from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'app_private' and (p.proname like 'football_mapping%' or p.proname like 'admin_football_mapping%');
  if n <> 20 or (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace where s.nspname = 'app_private') <> b.private_procs + 20 then
    problems := problems || 'app_private did not gain exactly the 20 expected helpers'::text;
  end if;
  -- Every new function, by name, and nothing else of that kind.
  if (select array_agg(s.nspname || '.' || p.proname order by s.nspname, p.proname)
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
      where s.nspname in ('api', 'app_private') and (p.proname like 'football_mapping%' or p.proname like 'admin_football_mapping%'))
    is distinct from (select array_agg(x order by x) from unnest(staff_fns || trusted_fns || helper_fns) x) then
    problems := problems || 'the set of new functions is not the reviewed set'::text;
  end if;
  foreach fn in array staff_fns loop
    select p.oid::regprocedure into oid_ from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
      where s.nspname || '.' || p.proname = fn;
    if not has_function_privilege('authenticated', oid_, 'execute')
      or has_function_privilege('anon', oid_, 'execute') or has_function_privilege('service_role', oid_, 'execute') then
      problems := problems || (fn || ' must be executable by authenticated only');
    end if;
  end loop;
  foreach fn in array trusted_fns loop
    select p.oid::regprocedure into oid_ from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
      where s.nspname || '.' || p.proname = fn;
    if not has_function_privilege('service_role', oid_, 'execute')
      or has_function_privilege('anon', oid_, 'execute') or has_function_privilege('authenticated', oid_, 'execute') then
      problems := problems || (fn || ' must be executable by service_role only');
    end if;
  end loop;
  foreach fn in array helper_fns loop
    select p.oid::regprocedure into oid_ from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
      where s.nspname || '.' || p.proname = fn;
    if has_function_privilege('anon', oid_, 'execute') or has_function_privilege('authenticated', oid_, 'execute')
      or has_function_privilege('service_role', oid_, 'execute') then
      problems := problems || (fn || ' must have no grant for any API role');
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace, aclexplode(p.proacl) a
      where s.nspname in ('api', 'app_private') and (p.proname like 'football_mapping%' or p.proname like 'admin_football_mapping%')
        and a.grantee = 0) then
    problems := problems || 'PUBLIC holds a grant on a new function'::text;
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
      where s.nspname in ('api', 'app_private') and (p.proname like 'football_mapping%' or p.proname like 'admin_football_mapping%')
        and p.prosecdef and not (p.proconfig @> array['search_path=""']) ) then
    problems := problems || 'a SECURITY DEFINER mapping function lacks an empty search_path'::text;
  end if;

  -- ---- The resolver guard -----------------------------------------------------
  oid_ := 'api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure;
  if (select proacl::text from pg_catalog.pg_proc where oid = oid_) is distinct from b.resolver_acl then
    problems := problems || 'the resolver''s privileges changed'::text;
  end if;
  new_def := pg_get_functiondef(oid_);
  if position(guard_text in new_def) = 0 then
    problems := problems || 'the resolver does not contain the guard'::text;
  elsif md5(replace(new_def, guard_text, '')) is distinct from '5d7ad20856e2bb22e2b7d44741e21be1' then
    problems := problems || 'the resolver differs from the reviewed text by more than the guard'::text;
  end if;
  select id into probe_player from app.players order by id limit 1;
  select id into probe_team from app.teams order by id limit 1;
  if probe_player is null or probe_team is null then
    problems := problems || 'no app player or team to probe the resolver with'::text;
  else
    foreach role_ in array array['sofascore', 'flashscore'] loop
      begin
        perform api.resolve_football_mapping(role_, 'player', 'PROBE-NEVER-CREATED', probe_player, 'probe');
        problems := problems || (role_ || ' player creation was NOT refused');
      exception when others then
        get stacked diagnostics msg = message_text;
        if msg is distinct from 'MAPPING_REVIEW_REQUIRED' then
          problems := problems || (role_ || ' player creation failed with "' || msg || '" instead of MAPPING_REVIEW_REQUIRED');
        end if;
      end;
      -- A lookup of an unmapped id with no app player keeps the old not-found answer.
      begin
        perform api.resolve_football_mapping(role_, 'player', 'PROBE-NEVER-CREATED');
        problems := problems || (role_ || ' lookup of an unmapped id did not raise');
      exception when others then
        get stacked diagnostics msg = message_text;
        if msg is distinct from 'MAPPING_NOT_FOUND' then
          problems := problems || (role_ || ' lookup answered "' || msg || '" instead of MAPPING_NOT_FOUND');
        end if;
      end;
    end loop;
    begin
      perform api.resolve_football_mapping('sofascore', 'planet', 'PROBE', probe_player);
      problems := problems || 'an unknown entity type was accepted'::text;
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg is distinct from 'INVALID_ENTITY_TYPE' then
        problems := problems || ('an unknown entity type answered "' || msg || '"');
      end if;
    end;
    -- The writing probes run inside a sub-transaction that is always rolled back.
    -- (a) Non-player entities of the reviewed providers are not blocked.
    begin
      answer := api.resolve_football_mapping('sofascore', 'team', 'PROBE-TEAM', probe_team, 'probe');
      if answer is distinct from probe_team then problems := problems || 'a sofascore TEAM mapping was not resolved'::text; end if;
      raise exception using errcode = 'P0001', message = 'probe_rollback';
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg is distinct from 'probe_rollback' then problems := problems || ('the sofascore team probe failed: ' || msg); end if;
    end;
    -- (b) SportsMonks players: an existing mapping still resolves, and a new one is still created.
    select m.external_id, m.internal_entity_id into probe_ext, probe_internal
    from app_private.football_provider_mappings m
    where m.provider_name = 'sportsmonks' and m.entity_type = 'player' and m.active order by m.id limit 1;
    begin
      if probe_ext is not null then
        answer := api.resolve_football_mapping('sportsmonks', 'player', probe_ext);
        if answer is distinct from probe_internal then problems := problems || 'an existing sportsmonks player mapping no longer resolves'::text; end if;
      end if;
      raise exception using errcode = 'P0001', message = 'probe_rollback';
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg is distinct from 'probe_rollback' then problems := problems || ('the sportsmonks lookup probe failed: ' || msg); end if;
    end;
    begin
      -- A player no sportsmonks mapping holds yet.
      select p.id into probe_internal from app.players p
      where not exists (select 1 from app_private.football_provider_mappings m
        where m.provider_name = 'sportsmonks' and m.entity_type = 'player' and m.internal_entity_id = p.id)
      order by p.id limit 1;
      if probe_internal is not null then
        answer := api.resolve_football_mapping('sportsmonks', 'player', 'PROBE-SM-NEVER-KEPT', probe_internal, 'probe');
        if answer is distinct from probe_internal then problems := problems || 'a new sportsmonks player mapping was not created as before'::text; end if;
      end if;
      raise exception using errcode = 'P0001', message = 'probe_rollback';
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg is distinct from 'probe_rollback' then problems := problems || ('the sportsmonks creation probe failed: ' || msg); end if;
    end;
  end if;

  -- ---- Dual control ------------------------------------------------------------
  if (select pg_get_constraintdef(oid) from pg_catalog.pg_constraint
      where conname = 'football_player_mapping_proposals_two_people_check')
    is distinct from 'CHECK (((decided_by IS NULL) OR (decided_by IS DISTINCT FROM requested_by)))' then
    problems := problems || 'requested_by <> decided_by is not enforced by the table'::text;
  end if;
  if exists (select 1 from information_schema.columns
      where table_schema = 'app_private' and table_name like 'football_player_mapping%'
        and (column_name ilike '%approvals_required%' or column_name ilike '%required_approvals%' or column_name ilike '%single_approval%')) then
    problems := problems || 'an approvals_required-style column exists'::text;
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
      where s.nspname in ('api', 'app_private') and (p.proname like 'football_mapping%' or p.proname like 'admin_football_mapping%')
        and (p.prosrc ~* 'approvals_required|single_approval|skip_approval|bypass|break_?glass|owner_override')) then
    problems := problems || 'a mapping function mentions an approval bypass'::text;
  end if;
  if (select prosrc !~ 'self_approval_denied' from pg_catalog.pg_proc where oid = 'api.admin_football_mapping_decide(uuid,text,text,text,boolean,uuid)'::regprocedure) then
    problems := problems || 'the decide function does not refuse self-approval'::text;
  end if;
  foreach fn in array array['propose', 'decide', 'execute', 'cancel', 'add_position_note', 'refresh_evidence'] loop
    if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
        where s.nspname = 'api' and p.proname = 'admin_football_mapping_' || fn
          and p.prosrc !~ 'admin_assert_permission\(''football\.manage_mappings''\)') then
      problems := problems || ('admin_football_mapping_' || fn || ' does not call the staff permission check');
    end if;
  end loop;
  foreach fn in array array['list_candidates', 'get_candidate', 'list_proposals', 'get_proposal', 'reviewer_availability', 'app_player_options'] loop
    if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
        where s.nspname = 'api' and p.proname = 'admin_football_mapping_' || fn
          and p.prosrc !~ 'admin_assert_principal\(true, false\)') then
      problems := problems || ('admin_football_mapping_' || fn || ' does not call the staff check with MFA');
    end if;
  end loop;
  if (select prosrc !~ 'approver_no_longer_qualified' or prosrc !~ 'approval_expired'
      from pg_catalog.pg_proc where oid = 'api.admin_football_mapping_execute(uuid,uuid)'::regprocedure) then
    problems := problems || 'the execute function does not re-check the approver and the approval age'::text;
  end if;
  if not exists (select 1 from app_private.admin_permissions
      where name = 'football.manage_mappings' and active and requires_mfa and requires_recent_auth) then
    problems := problems || 'football.manage_mappings no longer requires MFA and recent authentication'::text;
  end if;

  -- ---- No side effects ---------------------------------------------------------
  if (select count(*) from app_private.admin_audit_events) is distinct from b.audit_events
    or (select count(*) from app_private.admin_idempotency_keys) is distinct from b.idempotency_keys then
    problems := problems || 'an audit event or idempotency key was written'::text;
  end if;
  if (select count(*) from cron.job) is distinct from b.cron_jobs
    or (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), ''))
        from cron.job) is distinct from b.cron_digest
    or exists (select 1 from cron.job where command ~* 'football_mapping') then
    problems := problems || 'a schedule was installed or changed'::text;
  end if;
  if jsonb_build_object(
      'fantasy_seasons', (select count(*) from app.fantasy_seasons),
      'fantasy_gameweeks', (select count(*) from app.fantasy_gameweeks),
      'fantasy_players', (select count(*) from app.fantasy_players),
      'fantasy_teams', (select count(*) from app.fantasy_teams),
      'fantasy_lineup_players', (select count(*) from app.fantasy_lineup_players),
      'fantasy_fixture_assignments', (select count(*) from app.fantasy_fixture_assignments),
      'fantasy_player_gameweek_points', (select count(*) from app.fantasy_player_gameweek_points),
      'fantasy_player_point_events', (select count(*) from app.fantasy_player_point_events),
      'fantasy_team_gameweek_results', (select count(*) from app.fantasy_team_gameweek_results),
      'players', (select count(*) from app.players),
      'fixtures', (select count(*) from app.fixtures),
      'lineup_players', (select count(*) from app.lineup_players),
      'player_fixture_performances', (select count(*) from app.player_fixture_performances)
    ) is distinct from b.counts
    or (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g) is distinct from b.gameweek_digest then
    problems := problems || 'a Fantasy, player, fixture or lineup table changed'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version in ('20261001150000', '20261001160000', '20261001161000')) <> 3 then
    problems := problems || 'the three history rows are not all there'::text;
  end if;

  report := jsonb_build_object(
    'providersAdded', 2,
    'newTables', 3,
    'newFunctions', 35,
    'resolverChanged', true,
    'mappingRowsBefore', b.mapping_count,
    'mappingRowsAfter', (select count(*) from app_private.football_provider_mappings),
    'mappingDigestBefore', b.mapping_digest,
    'mappingDigestAfter', (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m),
    'reviewedProviderMappingRows', (select count(*) from app_private.football_provider_mappings where provider_name in ('sofascore', 'flashscore')),
    'candidates', (select count(*) from app_private.football_player_mapping_candidates),
    'observations', (select count(*) from app_private.football_player_mapping_observations),
    'proposals', (select count(*) from app_private.football_player_mapping_proposals),
    'cronJobs', (select count(*) from cron.job),
    'fantasyCounts', b.counts,
    'problems', to_jsonb(problems));

  if cardinality(problems) > 0 then
    raise exception 'stop: postflight failed: %', array_to_string(problems, '; ');
  end if;

  raise notice 'MAPPING BACKEND POSTFLIGHT PASSED: %', report;
  if current_setting('botolago.mapping_apply_report', true) = 'error' then
    raise exception 'REHEARSAL_REPORT_PASSED %', report;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real (only after the owner has
-- approved the commit), change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261001161000')
    then 'Applied. The player-mapping backend is installed: providers ' || (select string_agg(name, ', ' order by name) from app_private.football_providers)
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
