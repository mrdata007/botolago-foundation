-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Apply the BotolaGO+ Trophées backend, migrations 20261015150000 to 20261015150200
-- (docs/product/botolago-plus-trophies-brief.md, owner decisions of 2026-10-15): the trophies a
-- manager earns by playing, the card frames, the evaluator and the three reads.
--
-- It adds five tables (app.trophy_catalog, app.trophies_earned, app.card_frames,
-- app.card_frame_choices, app_private.trophy_settings), twelve trophies and nine frames of
-- configuration, the switch app_private.trophy_configure, the evaluator
-- (app_private.trophies_tick and its helpers), three api functions (get_my_trophies,
-- choose_card_frame, get_trophy_card_frames) and TWO SCHEDULED JOBS: trophies-tick (minutes 10
-- and 40 of every hour) and trophies-history-prune (daily 03:31 UTC). It REPLACES NOTHING: no
-- existing function, table or row changes -- the script checks that.
--
-- IT SHIPS OFF. app_private.trophy_settings.enabled is false, so trophies-tick answers
-- {"status": "off"} and writes nothing; and while BotolaGO+ is off every read answers
-- {"available": false}. Nothing is granted, shown or changed for anyone by this script. Turning
-- the evaluator on is a separate, later step (docs/backend/TROPHIES_OPERATIONS_RUNBOOK.md).
--
-- A TROPHY IS NEVER TAKEN BACK. app.trophies_earned refuses every update and every statement
-- that deletes a row; only the cascade of an erased account, season or catalogue entry removes
-- one. The script checks that the two triggers are there.
--
-- WHEN
--   After the premium card reads and the league context read are applied on this database
--   (apply-20261013100400-premium-card-reads.sql, apply-20261014150000-premium-card-league-context.sql),
--   after the pull request that adds this file is merged and its database-quality job passed.
--   Staging first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Make sure nothing else is writing to this database: no GitHub Actions run in progress, no
--     other query running, no other agent or workflow working on the database.
--   * Nothing needs pausing: the script creates tables, functions and two cron entries, and
--     replaces nothing. The new jobs do nothing while the switch is off.
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every guard and every
--      check runs on the real code path inside one transaction, and the script ends with a
--      deliberate error whose message carries the state it computed ("REHEARSAL PASSED --
--      nothing was saved: {...}"). That error is the expected, good outcome: it rolls
--      everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select to_regclass('app.trophy_catalog') is null as rolled_back;
--      It must say true.
--   4. In the line `select set_config('bg.trophies_mode', 'rehearsal', true);` near the top,
--      change 'rehearsal' to 'apply' and press Run again. The result row says "Applied".
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of its objects or jobs exist, or where the migrations it
--     builds on are not recorded;
--   * records the three migration files in supabase_migrations.schema_migrations, each whole as
--     statements[1], and runs each from that record once its sha256 matches the repository file;
--   * checks the result without saving anything: row security forced and no client privilege on
--     the five tables; twelve trophies, nine frames; the switch off; the never-taken-back
--     triggers; the three api functions' grants and security settings; the helpers callable by
--     no API role; the reads answering "off" while BotolaGO+ is off; the pass answering "off";
--     exactly two jobs added; the definitions of the card reads, the editions and the membership
--     check unchanged; no trophy and no frame choice exist.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.trophies_mode', 'rehearsal', true);

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  needed text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in ('20261015150000', '20261015150100', '20261015150200')) then
    raise exception 'stop: one of 20261015150000, 20261015150100, 20261015150200 is already recorded as applied';
  end if;
  foreach needed in array array['20261008123300', '20261010120200', '20261012200100', '20261013100000', '20261013100100', '20261013100200', '20261013100300', '20261013100400', '20261014150000'] loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = needed) then
      missing := missing || needed;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: migrations this builds on are not applied yet: %', missing;
  end if;
  foreach needed in array array[
    'app.profiles', 'app.fantasy_seasons', 'app.fantasy_teams', 'app.fantasy_gameweeks',
    'app.fantasy_leagues', 'app.fantasy_league_memberships', 'app.fantasy_team_gameweek_results',
    'app.manager_cards', 'app.manager_card_gameweeks', 'app_private.premium_settings',
    'app_private.manager_card_settings', 'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.assert_mfa_step_up()', 'app_private.has_premium(uuid,timestamptz)',
    'app_private.set_updated_at()', 'app_private.refuse_unverified_mfa_actor()',
    'app_private.manager_card_active_rules()', 'app_private.manager_card_fantasy_season()',
    'app_private.manager_card_season_label(uuid)', 'app_private.manager_card_tier_rank(text)',
    'app_private.card_reads_mode()', 'app_private.card_premium_mode()',
    'app_private.card_resolve_season(text)', 'app_private.card_week_rows(uuid,uuid)',
    'app_private.card_transfer_rows(uuid,uuid)', 'app_private.card_evaluable_gameweeks(uuid)',
    'app_private.card_league_members(uuid)', 'api.choose_card_design(text)',
    'api.get_my_manager_card()', 'api.get_manager_cards(uuid[])'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if to_regclass('app.trophy_catalog') is not null or to_regclass('app.trophies_earned') is not null
    or to_regclass('app.card_frames') is not null or to_regclass('app.card_frame_choices') is not null
    or to_regclass('app_private.trophy_settings') is not null then
    raise exception 'stop: one of the Trophées tables already exists';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'api' and p.proname in ('get_my_trophies', 'choose_card_frame', 'get_trophy_card_frames'))
      or (n.nspname = 'app_private' and (p.proname like 'trophy\_%' or p.proname like 'trophies\_%'
        or p.proname = 'card_frame_effective'))) then
    raise exception 'stop: one of the Trophées functions already exists';
  end if;
  if exists (select 1 from cron.job where jobname in ('trophies-tick', 'trophies-history-prune')) then
    raise exception 'stop: a Trophées job is already scheduled';
  end if;
  -- This replaces nothing: remember what is there and compare afterwards.
  perform set_config('bg.trophies_jobs', (select count(*) from cron.job)::text, true);
  perform set_config('bg.trophies_defs', (select string_agg(
      p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in (
      'api.choose_card_design(text)'::regprocedure, 'api.get_my_manager_card()'::regprocedure,
      'api.get_manager_cards(uuid[])'::regprocedure, 'app_private.has_premium(uuid,timestamptz)'::regprocedure,
      'app_private.card_reads_mode()'::regprocedure, 'app_private.card_week_rows(uuid,uuid)'::regprocedure,
      'app_private.card_transfer_rows(uuid,uuid)'::regprocedure,
      'app_private.card_evaluable_gameweeks(uuid)'::regprocedure,
      'app_private.card_league_members(uuid)'::regprocedure,
      'app_private.manager_card_tick()'::regprocedure)), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migrations, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261015150000',
  'trophies_schema',
  array[$bg_20261015150000_file$-- BotolaGO+ Trophées, part 1: the tables, the switch, the catalogue.
--
-- A TROPHY is a milestone a manager earns by playing Fantasy: a first published rating, a first
-- passage into a tier, a journée at 80 points, ten journées played, a transfer that paid off, a
-- place on the podium of a private league, the founding cohort. Owner decisions, 2026-10-15:
--
--   * Trophées are earned by everyone, by playing. BotolaGO+ changes only how they are PRESENTED
--     (the lit cabinet, the frames drawn on the Manager Card, the 9:16 story card). Nothing is
--     sold, and nothing here changes a point, a rating, a tier or a rank.
--   * A trophy is NEVER taken back. Once earned it stays, whatever a later correction of a result
--     does to the figure that earned it. There is no "withdrawn" state: the table has no state
--     column at all, an update of an earned row is refused, and a direct delete is refused (only
--     the cascades of an erased account, a removed season or a removed catalogue entry pass).
--   * A trophy counts only once the result behind it is final, which for rating-based Fantasy
--     points means 5 to 16 days after the match. Each trophy carries the time that result was
--     published (source_published_at), and the screens say « Publié le … ».
--   * The word in French is « trophée », in Arabic « كأس / كؤوس ». The admin prize system
--     (app.fantasy_prizes) is a different thing and is not touched, read or imitated.
--
-- SHIPS OFF. app_private.trophy_settings has one row, switched off. Until the owner switches the
-- evaluator on nothing is written; and while BotolaGO+ is off every read answers
-- {"available": false}. This migration adds tables, rows of configuration (the catalogue and the
-- frames) and one switch function. No existing table, function or row changes.
--
-- WHO WRITES WHAT
--   trophy_settings       app_private.trophy_configure (postgres only) and the evaluator's two
--                         bookkeeping columns (last_run_at, last_result)
--   trophy_catalog        the owner's script (rules are versioned; a new rule is a new code)
--   trophies_earned       app_private.trophy_grant only, called by the evaluator (20261015150100)
--   card_frames           the owner's script
--   card_frame_choices    api.choose_card_frame only (20261015150200)
--
-- Every table: row security enabled and forced, all rights revoked from public, anon,
-- authenticated and service_role, no policy, an index on every foreign-key column. Reads go
-- through api functions (20261015150200).
--
-- DELETION. Earned trophies and frame choices hang off app.profiles by cascade, so erasing an
-- account (app_private.account_deletion_erase) removes them with the rest of the account.

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------
create table app_private.trophy_settings (
  id boolean primary key default true,
  enabled boolean not null default false,
  last_run_at timestamptz,
  last_result jsonb,
  updated_at timestamptz not null default statement_timestamp(),
  constraint trophy_settings_singleton check (id)
);
insert into app_private.trophy_settings (id) values (true);
alter table app_private.trophy_settings enable row level security;
alter table app_private.trophy_settings force row level security;
revoke all on app_private.trophy_settings from public, anon, authenticated, service_role;
comment on table app_private.trophy_settings is
  'The Trophées switch, one row, off by default. enabled lets trophies-tick grant trophies; last_run_at and last_result are the last pass''s bookkeeping. Changed only by app_private.trophy_configure.';

create function app_private.trophy_configure(p_enabled boolean default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result app_private.trophy_settings%rowtype;
begin
  -- A null leaves the switch as it is.
  update app_private.trophy_settings set
    enabled = coalesce(p_enabled, enabled),
    updated_at = statement_timestamp()
  where id
  returning * into result;
  return jsonb_build_object('enabled', result.enabled);
end;
$$;
revoke all on function app_private.trophy_configure(boolean)
  from public, anon, authenticated, service_role;
grant execute on function app_private.trophy_configure(boolean) to postgres;
comment on function app_private.trophy_configure(boolean) is
  'Owner-run switch for the Trophées evaluator: true lets trophies-tick grant trophies, false stops it; null leaves it as it is. Pausing does not undo a trophy. Executable by postgres only.';

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------
create table app.trophy_catalog (
  code text primary key,
  family text not null,
  -- season: earned once per Fantasy season; card: earned once, ever (the founding cohort).
  scope text not null default 'season',
  rules_version integer not null default 1,
  -- The threshold of the rule when it has one: a score, a number of journées, a gain in points,
  -- a league rank. The evaluator reads it from here so the screens and the rule cannot drift.
  need integer,
  label_fr text not null,
  label_ar text not null,
  sort_order smallint not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint trophy_catalog_code_check check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint trophy_catalog_family_check check (family in ('paliers', 'journees', 'decisions', 'ligue', 'carte')),
  constraint trophy_catalog_scope_check check (scope in ('season', 'card')),
  constraint trophy_catalog_rules_version_check check (rules_version >= 1),
  constraint trophy_catalog_need_check check (need is null or need >= 1),
  constraint trophy_catalog_status_check check (status in ('active', 'retired')),
  constraint trophy_catalog_labels_check check (
    char_length(btrim(label_fr)) between 1 and 48 and char_length(btrim(label_ar)) between 1 and 48
  )
);
create trigger trophy_catalog_set_updated_at
before update on app.trophy_catalog
for each row execute function app_private.set_updated_at();
alter table app.trophy_catalog enable row level security;
alter table app.trophy_catalog force row level security;
revoke all on app.trophy_catalog from public, anon, authenticated, service_role;
comment on table app.trophy_catalog is
  'The Trophées a manager can earn (rules version 1), by family: paliers, journees, decisions, ligue, carte. need is the rule''s threshold. Labels in French and Arabic. Changed by the owner''s script; read through api.get_my_trophies. Display only: no ranking, league, Fantasy or Manager Card function reads it.';

insert into app.trophy_catalog (code, family, scope, need, label_fr, label_ar, sort_order)
values
  ('first_rating', 'paliers', 'season', null, 'Première note', 'أول تقييم', 10),
  ('first_stade', 'paliers', 'season', null, 'Premier passage STADE', 'أول مرة في مستوى ملعب', 11),
  ('first_pro', 'paliers', 'season', null, 'Premier passage PRO', 'أول مرة في مستوى محترف', 12),
  ('first_champion', 'paliers', 'season', null, 'Premier passage CHAMPION', 'أول مرة في مستوى بطل', 13),
  ('first_legend', 'paliers', 'season', null, 'Premier passage LEGEND', 'أول مرة في مستوى أسطورة', 14),
  ('gw_80', 'journees', 'season', 80, 'Journée à 80 pts', 'جولة بـ 80 نقطة', 20),
  ('ten_gameweeks', 'journees', 'season', 10, '10 journées jouées', '10 جولات لُعبت', 21),
  ('thirty_gameweeks', 'journees', 'season', 30, '30 journées jouées', '30 جولة لُعبت', 22),
  ('winning_transfer', 'decisions', 'season', 10, 'Transfert gagnant', 'انتقال رابح', 30),
  ('league_podium', 'ligue', 'season', 3, 'Podium de la ligue', 'منصة الدوري', 40),
  ('league_leader', 'ligue', 'season', 1, 'En tête de votre ligue', 'صدارة دوريك', 41),
  ('founder_2026', 'carte', 'card', null, 'Fondateur 2026', 'مؤسس 2026', 50);

-- ---------------------------------------------------------------------------
-- The earned trophies
-- ---------------------------------------------------------------------------
create table app.trophies_earned (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  trophy_code text not null references app.trophy_catalog(code) on delete cascade,
  -- null for a card-scope trophy
  fantasy_season_id uuid references app.fantasy_seasons(id) on delete cascade,
  gameweek_seq integer,
  -- The figure that earned it, as it was when it was earned (a score, a rating, names of
  -- players, a rank). Kept as it was: a later correction does not rewrite it.
  facts jsonb not null default '{}'::jsonb,
  rules_version integer not null,
  -- When the result that earned it was published (the gameweek's finalized_at).
  source_published_at timestamptz not null,
  earned_at timestamptz not null default statement_timestamp(),
  constraint trophies_earned_gameweek_check check (gameweek_seq is null or gameweek_seq >= 1),
  constraint trophies_earned_facts_check check (jsonb_typeof(facts) = 'object')
);
-- One row per manager, trophy and season (and one per card-scope trophy).
create unique index trophies_earned_season_key
  on app.trophies_earned (user_id, trophy_code, fantasy_season_id)
  where fantasy_season_id is not null;
create unique index trophies_earned_card_key
  on app.trophies_earned (user_id, trophy_code)
  where fantasy_season_id is null;
create index trophies_earned_trophy_code_idx on app.trophies_earned (trophy_code);
create index trophies_earned_season_idx on app.trophies_earned (fantasy_season_id);
-- the cascade from an erased account scans by user; the two unique indexes above are partial
create index trophies_earned_user_idx on app.trophies_earned (user_id);

-- NEVER TAKEN BACK. An earned row is never changed and never removed by a statement. The
-- cascades (an erased account, a removed season, a removed catalogue entry) run one trigger
-- level deeper than the statement, so they pass; a direct delete does not.
create function app_private.trophies_earned_keep()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception using errcode = 'P0001', message = 'trophy_is_never_changed';
  end if;
  if pg_trigger_depth() <= 1 then
    raise exception using errcode = 'P0001', message = 'trophy_is_never_taken_back';
  end if;
  return old;
end;
$$;
revoke all on function app_private.trophies_earned_keep()
  from public, anon, authenticated, service_role;
comment on function app_private.trophies_earned_keep() is
  'Refuses to change an earned trophy and refuses a direct delete: a trophy is never taken back after a corrected result. Cascades from an erased account, season or catalogue entry pass. No grant.';
create trigger trophies_earned_keep_update
before update on app.trophies_earned
for each row execute function app_private.trophies_earned_keep();
create trigger trophies_earned_keep_delete
before delete on app.trophies_earned
for each row execute function app_private.trophies_earned_keep();

alter table app.trophies_earned enable row level security;
alter table app.trophies_earned force row level security;
revoke all on app.trophies_earned from public, anon, authenticated, service_role;
comment on table app.trophies_earned is
  'The trophies a manager has earned, one row per trophy and season. Written only by app_private.trophy_grant (the evaluator). Never updated, never deleted by a statement: a trophy is not taken back after a corrected result. source_published_at is when the result behind it was published. Row security forced, no policy, no grant: only definer functions read it. Cascades from the profile.';

-- ---------------------------------------------------------------------------
-- The frames
-- ---------------------------------------------------------------------------
-- A FRAME is how the Manager Card is bordered. standard is free and always allowed; every other
-- frame is the reward of one trophy and is shown only to a member who has earned that trophy.
create table app.card_frames (
  code text primary key,
  trophy_code text unique references app.trophy_catalog(code) on delete restrict,
  status text not null default 'active',
  label_fr text not null,
  label_ar text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint card_frames_code_check check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint card_frames_status_check check (status in ('active', 'retired')),
  -- standard has no trophy; every other frame carries the code of its trophy
  constraint card_frames_trophy_check check (
    (code = 'standard' and trophy_code is null) or (code <> 'standard' and trophy_code = code)
  ),
  constraint card_frames_standard_check check (code <> 'standard' or status = 'active'),
  constraint card_frames_labels_check check (
    char_length(btrim(label_fr)) between 1 and 48 and char_length(btrim(label_ar)) between 1 and 48
  )
);
create trigger card_frames_set_updated_at
before update on app.card_frames
for each row execute function app_private.set_updated_at();
alter table app.card_frames enable row level security;
alter table app.card_frames force row level security;
revoke all on app.card_frames from public, anon, authenticated, service_role;
comment on table app.card_frames is
  'The Manager Card frames. standard is free; every other frame is the reward of the trophy with the same code and is shown to a member who has earned it. Cosmetic: nothing computes from it. Changed by the owner''s script; read through api functions.';

insert into app.card_frames (code, trophy_code, label_fr, label_ar, sort_order)
values
  ('standard', null, 'Standard', 'عادي', 0),
  ('founder_2026', 'founder_2026', 'Fondateur 2026', 'مؤسس 2026', 1),
  ('first_stade', 'first_stade', 'STADE', 'ملعب', 2),
  ('first_pro', 'first_pro', 'PRO', 'محترف', 3),
  ('first_champion', 'first_champion', 'CHAMPION', 'بطل', 4),
  ('first_legend', 'first_legend', 'LEGEND', 'أسطورة', 5),
  ('winning_transfer', 'winning_transfer', 'Transfert gagnant', 'انتقال رابح', 6),
  ('ten_gameweeks', 'ten_gameweeks', '10 journées', '10 جولات', 7),
  ('thirty_gameweeks', 'thirty_gameweeks', '30 journées', '30 جولة', 8);

create table app.card_frame_choices (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  frame_code text not null references app.card_frames(code) on delete restrict,
  chosen_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
create index card_frame_choices_frame_idx on app.card_frame_choices (frame_code);
create trigger card_frame_choices_set_updated_at
before update on app.card_frame_choices
for each row execute function app_private.set_updated_at();
create trigger card_frame_choices_refuse_unverified_mfa_actor
before insert or update or delete on app.card_frame_choices
for each statement execute function app_private.refuse_unverified_mfa_actor();
alter table app.card_frame_choices enable row level security;
alter table app.card_frame_choices force row level security;
revoke all on app.card_frame_choices from public, anon, authenticated, service_role;
comment on table app.card_frame_choices is
  'The frame a manager chose for their card (display only). Written only by api.choose_card_frame, which checks the trophy and the membership. Kept when membership lapses (the card shows standard until it is renewed). Row security forced, no policy, no grant. Cascades from the profile.';

notify pgrst, 'reload schema';
$bg_20261015150000_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261015150100',
  'trophies_evaluator',
  array[$bg_20261015150100_file$-- BotolaGO+ Trophées, part 2: the evaluator and its two scheduled jobs.
--
-- The evaluator READS what Fantasy and the Manager Card have already stored and final, through
-- the same read-only helpers the premium career and league reads use (card_week_rows,
-- card_transfer_rows, card_league_members), and WRITES one table: app.trophies_earned, through
-- app_private.trophy_grant. It never writes a Fantasy, Manager Card, league, ranking or
-- Pronostics table, and nothing in those calculations reads a trophy (a pgTAP test lists the
-- functions that name the new tables).
--
-- THE RULES (version 1). A trophy is granted when its rule is true over final results; the rule
-- is then never asked again, so a later correction cannot take it back (the table refuses it
-- too, 20261015150000).
--
--   first_rating      the first week the card shows a rating (the card's own minimum of counted
--                     weeks applies)
--   first_stade, first_pro, first_champion, first_legend
--                     the first week the card shows that tier or a higher one
--   gw_80             the first journée with a final score of at least 80 points (catalogue need)
--   ten_gameweeks, thirty_gameweeks
--                     the journée in which the 10th (30th) played and published journée of the
--                     season is reached
--   winning_transfer  the first counted transfer (the card's TRF definition, gain after its share
--                     of the points hit) worth at least +10 points
--   league_podium     the first journée after which the manager is in the first 3 of a private
--                     league that ranks at least 3 managers
--   league_leader     the same, first place
--   founder_2026      the manager holds the founding-cohort mark (no season)
--
-- PUBLICATION STAMP. source_published_at is the finalized_at of the gameweek that completed the
-- rule (for a transfer: the last gameweek of the window that counted it). A rule whose source has
-- no stamp is not granted yet; the next pass tries again.
--
-- THE JOB. trophies-tick runs at minutes 10 and 40 of every hour and does nothing until the
-- owner switches app_private.trophy_settings on. It evaluates the active teams of the current
-- Fantasy season, one manager at a time (a manager that fails is counted and skipped, the pass
-- goes on), under an advisory lock so two passes never overlap. trophies-history-prune deletes
-- only this tick's cron.job_run_details rows older than 7 days, daily at 03:31 UTC, whatever the
-- switch says.

-- ---------------------------------------------------------------------------
-- The one writer
-- ---------------------------------------------------------------------------
create function app_private.trophy_grant(
  p_user uuid,
  p_code text,
  p_season uuid,
  p_gameweek_seq integer,
  p_facts jsonb,
  p_published timestamptz
)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_version integer;
  v_scope text;
  v_rows integer;
begin
  select c.rules_version, c.scope into v_version, v_scope
  from app.trophy_catalog c
  where c.code = p_code and c.status = 'active';
  -- an unknown or retired trophy, a rule with no publication stamp, or a season trophy without
  -- a season: nothing is granted (and the next pass asks again)
  if not found or p_published is null or (v_scope = 'season' and p_season is null) then
    return 0;
  end if;
  insert into app.trophies_earned (
    user_id, trophy_code, fantasy_season_id, gameweek_seq, facts, rules_version, source_published_at
  )
  values (
    p_user, p_code, case when v_scope = 'card' then null else p_season end,
    p_gameweek_seq, coalesce(p_facts, '{}'::jsonb), v_version, p_published
  )
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
revoke all on function app_private.trophy_grant(uuid, text, uuid, integer, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
comment on function app_private.trophy_grant(uuid, text, uuid, integer, jsonb, timestamptz) is
  'Grants one trophy once (on conflict nothing): the only writer of app.trophies_earned. Returns 1 when a row was added, 0 when it was already there, unknown, or has no publication stamp. Called by the evaluator. No grant.';

-- ---------------------------------------------------------------------------
-- League ranks, week by week, for the private leagues the manager plays in
-- ---------------------------------------------------------------------------
-- One row per league and evaluable week: the manager's competition rank on the cumulative final
-- score through that week, and how many managers are ranked. The same arithmetic as the league
-- context read (20261014150000), restricted to the manager's own leagues.
create function app_private.trophy_league_ranks(p_user uuid, p_season uuid)
returns table (league_id uuid, seq integer, gameweek_id uuid, rk integer, n integer)
language sql
stable
set search_path = ''
as $$
  with leagues as (
    select l.id
    from app.fantasy_leagues l
    join app.fantasy_league_memberships me
      on me.league_id = l.id and me.user_id = p_user and me.status = 'active'
    where l.fantasy_season_id = p_season and l.visibility = 'private' and l.active
  ), mem as (
    select l.id as league_id, m.user_id
    from leagues l
    cross join lateral app_private.card_league_members(l.id) m
  ), wk as (
    select m.league_id, m.user_id, w.seq, w.gameweek_id, w.score
    from mem m
    cross join lateral app_private.card_week_rows(m.user_id, p_season) w
  ), gws as (
    select distinct wk.league_id, wk.seq, wk.gameweek_id from wk
  ), grid as (
    select g.league_id, g.seq, g.gameweek_id, m.user_id,
      (select sum(w.score)::integer from wk w
        where w.league_id = g.league_id and w.user_id = m.user_id and w.seq <= g.seq) as total
    from gws g
    join mem m on m.league_id = g.league_id
  ), ranked as (
    select r.*,
      case when r.total is not null
        then rank() over (partition by r.league_id, r.seq order by r.total desc nulls last) end as rk,
      count(r.total) over (partition by r.league_id, r.seq) as n
    from grid r
  )
  select r.league_id, r.seq, r.gameweek_id, r.rk::integer, r.n::integer
  from ranked r
  where r.user_id = p_user and r.total is not null;
$$;
revoke all on function app_private.trophy_league_ranks(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.trophy_league_ranks(uuid, uuid) is
  'The manager''s rank in each private league they play in, after each evaluable week, with the number of managers ranked. Competition ranks on the cumulative final score. Read only. No grant.';

-- ---------------------------------------------------------------------------
-- The rules, for one manager and one season
-- ---------------------------------------------------------------------------
create function app_private.trophies_evaluate_season(p_user uuid, p_season uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  granted integer := 0;
  r record;
begin
  for r in
    with need as (
      select c.code, c.need from app.trophy_catalog c where c.status = 'active'
    ), wk as (
      select w.seq, w.score, w.ovr, w.tier, gw.finalized_at as published,
        row_number() over (order by w.seq) as nth
      from app_private.card_week_rows(p_user, p_season) w
      join app.fantasy_gameweeks gw on gw.id = w.gameweek_id
      where gw.finalized_at is not null
    ), tiers(code, tier) as (
      values ('first_stade', 'stade'), ('first_pro', 'pro'),
        ('first_champion', 'champion'), ('first_legend', 'legend')
    ), lr as (
      select l.seq, l.rk, l.n, gw.finalized_at as published
      from app_private.trophy_league_ranks(p_user, p_season) l
      join app.fantasy_gameweeks gw on gw.id = l.gameweek_id
      where l.n >= 3 and gw.finalized_at is not null
    ), cands as (
      select 'first_rating'::text as code, x.seq, jsonb_build_object('ovr', x.ovr, 'tier', x.tier) as facts,
        x.published
      from (select * from wk where ovr is not null order by seq limit 1) x
      union all
      select t.code, x.seq, jsonb_build_object('ovr', x.ovr, 'tier', x.tier), x.published
      from tiers t
      cross join lateral (
        select * from wk
        where tier is not null
          and app_private.manager_card_tier_rank(wk.tier) >= app_private.manager_card_tier_rank(t.tier)
        order by seq limit 1) x
      union all
      select 'gw_80', x.seq, jsonb_build_object('score', x.score), x.published
      from (select * from wk
        where score >= (select n.need from need n where n.code = 'gw_80') order by seq limit 1) x
      union all
      select 'ten_gameweeks', x.seq, jsonb_build_object('played', x.nth), x.published
      from wk x where x.nth = (select n.need from need n where n.code = 'ten_gameweeks')
      union all
      select 'thirty_gameweeks', x.seq, jsonb_build_object('played', x.nth), x.published
      from wk x where x.nth = (select n.need from need n where n.code = 'thirty_gameweeks')
      union all
      select 'winning_transfer', t.gameweek_seq,
        jsonb_build_object('playerOut', t.player_out, 'playerIn', t.player_in, 'gain', round(t.gain)::integer),
        -- published when the last gameweek of the window that counted it was
        (select max(f.finalized_at)
         from (
           select gw.finalized_at
           from app_private.card_evaluable_gameweeks(p_season) e
           join app.fantasy_gameweeks gw on gw.id = e.gameweek_id
           where e.seq >= t.gameweek_seq
           order by e.seq
           limit greatest(t.window_used, 1)) f)
      from (
        select * from app_private.card_transfer_rows(p_user, p_season) tr
        where tr.ready and tr.gain >= (select n.need from need n where n.code = 'winning_transfer')
        order by tr.gameweek_seq, tr.sequence_number
        limit 1) t
      union all
      select 'league_podium', x.seq, jsonb_build_object('rank', x.rk, 'of', x.n), x.published
      from (select * from lr
        where rk <= (select n.need from need n where n.code = 'league_podium')
        order by seq, rk limit 1) x
      union all
      select 'league_leader', x.seq, jsonb_build_object('rank', x.rk, 'of', x.n), x.published
      from (select * from lr
        where rk <= (select n.need from need n where n.code = 'league_leader')
        order by seq, rk limit 1) x
    )
    select c.code, c.seq, c.facts, c.published from cands c
  loop
    granted := granted + app_private.trophy_grant(p_user, r.code, p_season, r.seq, r.facts, r.published);
  end loop;
  return granted;
end;
$$;
revoke all on function app_private.trophies_evaluate_season(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.trophies_evaluate_season(uuid, uuid) is
  'Evaluates the version 1 trophy rules for one manager over one Fantasy season''s final results and grants what is true (once; a granted trophy is never asked again). Returns the number of trophies added. Reads Fantasy and card data, writes only app.trophies_earned through trophy_grant. No grant.';

-- ---------------------------------------------------------------------------
-- One manager: the season and the card-scope trophy
-- ---------------------------------------------------------------------------
create function app_private.trophies_evaluate_user(p_user uuid, p_season uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  granted integer := 0;
  card app.manager_cards%rowtype;
begin
  select * into card from app.manager_cards c
  where c.user_id = p_user and c.founder_cohort is not null;
  if found then
    granted := granted + app_private.trophy_grant(
      p_user, 'founder_2026', null, null,
      jsonb_build_object('cohort', card.founder_cohort), card.founder_granted_at);
  end if;
  if p_season is not null then
    granted := granted + app_private.trophies_evaluate_season(p_user, p_season);
  end if;
  return granted;
end;
$$;
revoke all on function app_private.trophies_evaluate_user(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.trophies_evaluate_user(uuid, uuid) is
  'Evaluates the trophies of one manager: the founding-cohort trophy and the season rules. Returns the number added. Writes only app.trophies_earned. No grant.';

-- ---------------------------------------------------------------------------
-- The pass
-- ---------------------------------------------------------------------------
create function app_private.trophies_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_season uuid;
  v_user uuid;
  v_users integer := 0;
  v_granted integer := 0;
  v_errors integer := 0;
  v_result jsonb;
begin
  select s.enabled into v_enabled from app_private.trophy_settings s where s.id;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('status', 'off');
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('botolago:trophies-tick', 0)) then
    return jsonb_build_object('status', 'busy');
  end if;
  if not exists (select 1 from app_private.manager_card_active_rules() r where r.usable) then
    return jsonb_build_object('status', 'no_rules');
  end if;
  v_season := app_private.manager_card_fantasy_season();
  if v_season is null then
    return jsonb_build_object('status', 'no_season');
  end if;

  for v_user in
    select distinct t.user_id
    from app.fantasy_teams t
    join app.profiles p on p.id = t.user_id and p.deleted_at is null
    where t.fantasy_season_id = v_season and t.status = 'active'
  loop
    v_users := v_users + 1;
    begin
      v_granted := v_granted + app_private.trophies_evaluate_user(v_user, v_season);
    exception when others then
      -- one manager (for instance an account erased mid-pass) never stops the pass
      v_errors := v_errors + 1;
    end;
  end loop;

  v_result := jsonb_build_object(
    'status', 'ok', 'season', v_season, 'users', v_users, 'granted', v_granted, 'errors', v_errors);
  update app_private.trophy_settings
  set last_run_at = statement_timestamp(), last_result = v_result, updated_at = statement_timestamp()
  where id;
  return v_result;
end;
$$;
revoke all on function app_private.trophies_tick() from public, anon, authenticated, service_role;
grant execute on function app_private.trophies_tick() to postgres;
comment on function app_private.trophies_tick() is
  'The Trophées pass: answers off until app_private.trophy_settings.enabled, then evaluates every active team of the current Fantasy season under an advisory lock. Returns {status, season, users, granted, errors}. Writes only app.trophies_earned and its own bookkeeping. Executable by postgres (pg_cron) only.';

-- ---------------------------------------------------------------------------
-- The jobs (cron.schedule with a name replaces a job of that name)
-- ---------------------------------------------------------------------------
select cron.schedule(
  'trophies-tick',
  '10,40 * * * *',
  $job$set local statement_timeout = '10min'; select app_private.trophies_tick();$job$
);

select cron.schedule(
  'trophies-history-prune',
  '31 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'trophies-tick')
      and end_time < now() - interval '7 days';
  $prune$
);

notify pgrst, 'reload schema';
$bg_20261015150100_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261015150200',
  'trophies_reads',
  array[$bg_20261015150200_file$-- BotolaGO+ Trophées, part 3: the reads and the frame choice.
--
-- THREE api functions and three helpers, all display only:
--
--   api.get_my_trophies(p_season)       the caller's cabinet: what they earned (each with the time
--                                       its result was published), what is waiting for a
--                                       publication, how far they are from the rest (figures the
--                                       server counts), and the frames they hold
--   api.choose_card_frame(p_code)       the frame drawn around the caller's Manager Card
--   api.get_trophy_card_frames(p_teams) the frame other people see on up to 100 cards
--
-- WHO SEES WHAT (owner decisions, 2026-10-15). Trophées are earned by everyone, so the cabinet's
-- LIST is readable by every signed-in manager once BotolaGO+ is on; what BotolaGO+ adds is the
-- presentation: choosing a frame (a trophy earned and a membership held) and, on the screens, the
-- lit cabinet and the story card. The member flag in the answer says which the caller is.
--
--   BotolaGO+ off, or the Manager Card reads off     {"available": false}
--   preview, caller not a member                      {"available": false}
--   on, caller not a member                           {"available": true, "member": false, ...}
--   a member                                          {"available": true, "member": true, ...}
--
-- app_private.trophy_access(user) answers off / free / member in one place, so the three
-- functions cannot disagree. It is the one new function that names the membership functions; the
-- test card_editions.test.sql lists it.
--
-- FRAMES copy the card editions (20261013100100): cosmetic, public where the card is drawn,
-- standard when the membership ends (the choice is remembered), and in preview a member's frame
-- is shown to its owner only. Nothing here changes a score, a rating, a tier or a rank.
--
-- NEVER TAKEN BACK. Nothing here deletes or changes a trophy. A trophy the evaluator granted is
-- served as it was granted, whatever the card's calculation says later.

-- ---------------------------------------------------------------------------
-- Helpers (app_private, no grant)
-- ---------------------------------------------------------------------------
create function app_private.trophy_access(p_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case app_private.card_reads_mode()
    when 'on' then case when app_private.has_premium(p_user) then 'member' else 'free' end
    when 'preview' then case when app_private.has_premium(p_user) then 'member' else 'off' end
    else 'off'
  end;
$$;
revoke all on function app_private.trophy_access(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.trophy_access(uuid) is
  'What the Trophées reads show this person: off (BotolaGO+ or the card reads off, or preview and not a member), free (on, not a member) or member. No grant.';

-- The frame a card is drawn in for a viewer: the chosen frame when it is live, the trophy behind
-- it is earned and the manager is a member now (in preview, only to the manager); else standard.
create function app_private.card_frame_effective(p_user uuid, p_viewer uuid default null)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select f.code
    from app.card_frame_choices c
    join app.card_frames f on f.code = c.frame_code
    where c.user_id = p_user
      and f.status = 'active'
      and f.code <> 'standard'
      and app_private.trophy_access(p_user) = 'member'
      and (p_user is not distinct from p_viewer or app_private.card_premium_mode() = 'on')
      and exists (
        select 1 from app.trophies_earned e
        where e.user_id = p_user and e.trophy_code = f.trophy_code)
  ), 'standard');
$$;
revoke all on function app_private.card_frame_effective(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.card_frame_effective(uuid, uuid) is
  'The frame code a manager''s card shows to a viewer: the chosen frame when active, earned, and the manager is a member now (in preview, only to the manager); else standard. Cosmetic: nothing computes from it. No grant.';

-- The journée a podium may be waiting on. The manager plays in a private league of at least three
-- managers, has not earned the podium this season, and there is a journée with a result that is
-- not yet final for the card (ratings not all published): when the manager would stand in the
-- first three on the scores that exist today, that journée's number; otherwise null. Shown as
-- "en attente", never as a trophy.
create function app_private.trophy_pending_podium(p_user uuid, p_season uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  with waiting as (
    select max(g.sequence_number) as seq
    from app.fantasy_team_gameweek_results r
    join app.fantasy_teams t on t.id = r.fantasy_team_id and t.user_id = p_user
      and t.fantasy_season_id = p_season
    join app.fantasy_gameweeks g on g.id = r.gameweek_id
    where g.id not in (select e.gameweek_id from app_private.card_evaluable_gameweeks(p_season) e)
  ), leagues as (
    select l.id
    from app.fantasy_leagues l
    join app.fantasy_league_memberships me
      on me.league_id = l.id and me.user_id = p_user and me.status = 'active'
    where l.fantasy_season_id = p_season and l.visibility = 'private' and l.active
  ), mem as (
    select l.id as league_id, m.user_id, m.team_id
    from leagues l cross join lateral app_private.card_league_members(l.id) m
  ), tot as (
    select m.league_id, m.user_id,
      coalesce((select sum(w.score) from app_private.card_week_rows(m.user_id, p_season) w), 0)
      + coalesce((
          select coalesce(r.final_score, r.provisional_score)
          from app.fantasy_team_gameweek_results r
          join app.fantasy_gameweeks g on g.id = r.gameweek_id
          where r.fantasy_team_id = m.team_id and g.fantasy_season_id = p_season
            and g.sequence_number = (select w.seq from waiting w)), 0) as total
    from mem m
  ), ranked as (
    select t.*, rank() over (partition by t.league_id order by t.total desc) as rk,
      count(*) over (partition by t.league_id) as n
    from tot t
  )
  select case when exists (
      select 1 from ranked r
      where r.user_id = p_user and r.n >= 3
        and r.rk <= (select c.need from app.trophy_catalog c where c.code = 'league_podium'))
    and not exists (
      select 1 from app.trophies_earned e
      where e.user_id = p_user and e.trophy_code = 'league_podium' and e.fantasy_season_id = p_season)
    then (select w.seq from waiting w) end;
$$;
revoke all on function app_private.trophy_pending_podium(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.trophy_pending_podium(uuid, uuid) is
  'The journée whose unpublished ratings keep the league podium waiting for this manager, or null. Read only. No grant.';

-- ---------------------------------------------------------------------------
-- api.get_my_trophies
-- ---------------------------------------------------------------------------
create function api.get_my_trophies(p_season text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  access text;
  v_season uuid;
  v_played integer;
  v_best integer;
  v_counted integer;
  v_ovr integer;
  v_gain numeric;
  v_min_rated integer;
  v_tiers jsonb;
  v_pending integer;
  v_earned jsonb;
  v_catalog jsonb;
  v_progress jsonb;
  v_frames jsonb;
begin
  if p_season is not null
    and p_season !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and p_season !~ '^[0-9]{4}/([0-9]{2}|[0-9]{4})$' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  mode := app_private.card_reads_mode();
  if mode is distinct from 'on' and mode is distinct from 'preview' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  access := app_private.trophy_access(actor);
  if access = 'off' then
    return jsonb_build_object('available', false);
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'profile_not_found';
  end if;

  if p_season is null then
    v_season := app_private.manager_card_fantasy_season();
  else
    v_season := app_private.card_resolve_season(p_season);
    if v_season is null then
      raise exception using errcode = 'PT404', message = 'card_season_not_found';
    end if;
  end if;

  -- What the caller earned in the season, and the card-scope trophy.
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', e.trophy_code,
      'family', c.family,
      'labelFr', c.label_fr,
      'labelAr', c.label_ar,
      'seasonId', e.fantasy_season_id,
      'gameweekSeq', e.gameweek_seq,
      'facts', e.facts,
      'publishedAt', e.source_published_at,
      'earnedAt', e.earned_at
    ) order by c.sort_order, e.earned_at), '[]'::jsonb)
  into v_earned
  from app.trophies_earned e
  join app.trophy_catalog c on c.code = e.trophy_code
  where e.user_id = actor
    and (e.fantasy_season_id is not distinct from v_season or e.fantasy_season_id is null);

  select coalesce(jsonb_agg(jsonb_build_object(
      'code', c.code, 'family', c.family, 'scope', c.scope, 'need', c.need,
      'labelFr', c.label_fr, 'labelAr', c.label_ar
    ) order by c.sort_order), '[]'::jsonb)
  into v_catalog
  from app.trophy_catalog c where c.status = 'active';

  -- The figures the server counts, for the trophies still to earn.
  select count(*)::integer, max(w.score)::integer, max(w.gameweeks_counted)::integer,
    (array_agg(w.ovr order by w.seq desc) filter (where w.ovr is not null))[1]::integer
  into v_played, v_best, v_counted, v_ovr
  from app_private.card_week_rows(actor, v_season) w;
  select max(t.gain) into v_gain
  from app_private.card_transfer_rows(actor, v_season) t where t.ready;
  select r.min_rated, r.tiers into v_min_rated, v_tiers from app_private.manager_card_active_rules() r;

  select coalesce(jsonb_agg(jsonb_build_object(
      'code', c.code,
      'have', case c.code
        when 'ten_gameweeks' then v_played
        when 'thirty_gameweeks' then v_played
        when 'gw_80' then v_best
        when 'first_rating' then v_counted
        when 'winning_transfer' then floor(v_gain)::integer
        when 'first_stade' then v_ovr
        when 'first_pro' then v_ovr
        when 'first_champion' then v_ovr
        when 'first_legend' then v_ovr
      end,
      'need', case
        when c.code = 'first_rating' then v_min_rated
        when c.code = 'first_stade' then ceil((v_tiers ->> 'stade')::numeric)::integer
        when c.code = 'first_pro' then ceil((v_tiers ->> 'pro')::numeric)::integer
        when c.code = 'first_champion' then ceil((v_tiers ->> 'champion')::numeric)::integer
        when c.code = 'first_legend' then ceil((v_tiers ->> 'legend')::numeric)::integer
        else c.need
      end,
      'unit', case
        when c.code in ('ten_gameweeks', 'thirty_gameweeks', 'first_rating') then 'gameweeks'
        when c.code in ('gw_80', 'winning_transfer') then 'points'
        when c.code like 'first\_%' then 'rating'
        else 'rank'
      end
    ) order by c.sort_order), '[]'::jsonb)
  into v_progress
  from app.trophy_catalog c
  where c.status = 'active' and c.code <> 'founder_2026'
    and not exists (
      select 1 from app.trophies_earned e
      where e.user_id = actor and e.trophy_code = c.code
        and e.fantasy_season_id is not distinct from case when c.scope = 'card' then null else v_season end);

  v_pending := case when v_season is not null then app_private.trophy_pending_podium(actor, v_season) end;

  select coalesce(jsonb_agg(jsonb_build_object(
      'code', f.code,
      'trophyCode', f.trophy_code,
      'labelFr', f.label_fr,
      'labelAr', f.label_ar,
      'earned', f.trophy_code is null or exists (
        select 1 from app.trophies_earned e where e.user_id = actor and e.trophy_code = f.trophy_code)
    ) order by f.sort_order), '[]'::jsonb)
  into v_frames
  from app.card_frames f where f.status = 'active';

  return jsonb_build_object(
    'available', true,
    'member', access = 'member',
    'season', case when v_season is not null then jsonb_build_object(
      'id', v_season, 'label', app_private.manager_card_season_label(v_season)) end,
    'journeesPlayed', coalesce(v_played, 0),
    'catalog', v_catalog,
    'earned', v_earned,
    'pending', case when v_pending is not null then jsonb_build_array(jsonb_build_object(
      'code', 'league_podium', 'gameweekSeq', v_pending, 'reason', 'ratings_not_published'))
      else '[]'::jsonb end,
    'progress', v_progress,
    'frames', v_frames,
    'chosenFrame', coalesce((select c.frame_code from app.card_frame_choices c where c.user_id = actor), 'standard'),
    'frame', app_private.card_frame_effective(actor, actor)
  );
end;
$$;
revoke all on function api.get_my_trophies(text) from public, anon, authenticated, service_role;
grant execute on function api.get_my_trophies(text) to authenticated, service_role;
comment on function api.get_my_trophies(text) is
  'The caller''s Trophées for a Fantasy season (default the current one): {available, member, season, journeesPlayed, catalog, earned, pending, progress, frames, chosenFrame, frame}. earned carries each trophy''s facts and the time its result was published; a trophy is never removed. progress counts the rest on the server. Readable by every signed-in manager once BotolaGO+ is on (member says whether they hold the subscription); {available:false} while BotolaGO+ or the card reads are off, or in preview for a non-member. Nothing is written. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.choose_card_frame
-- ---------------------------------------------------------------------------
create function api.choose_card_frame(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  access text;
  frame app.card_frames%rowtype;
begin
  if p_code is null or p_code !~ '^[a-z][a-z0-9_]{1,39}$' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  mode := app_private.card_reads_mode();
  if mode is distinct from 'on' and mode is distinct from 'preview' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  access := app_private.trophy_access(actor);
  if access = 'off' then
    return jsonb_build_object('available', false);
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'profile_not_found';
  end if;

  select * into frame from app.card_frames f where f.code = p_code and f.status = 'active';
  if not found then
    raise exception using errcode = 'PT404', message = 'card_frame_not_found';
  end if;
  -- The standard frame is always allowed, so a lapsed member can go back to it. Any other frame
  -- needs the membership now AND the trophy earned.
  if frame.code <> 'standard' then
    if access <> 'member' then
      raise exception using errcode = 'PT403', message = 'premium_required';
    end if;
    if not exists (
      select 1 from app.trophies_earned e where e.user_id = actor and e.trophy_code = frame.trophy_code
    ) then
      raise exception using errcode = 'PT403', message = 'trophy_not_earned';
    end if;
  end if;

  insert into app.card_frame_choices (user_id, frame_code)
  values (actor, frame.code)
  on conflict (user_id) do update set
    frame_code = excluded.frame_code,
    chosen_at = statement_timestamp();

  return jsonb_build_object(
    'available', true,
    'chosenFrame', frame.code,
    'frame', app_private.card_frame_effective(actor, actor)
  );
end;
$$;
revoke all on function api.choose_card_frame(text) from public, anon, authenticated, service_role;
grant execute on function api.choose_card_frame(text) to authenticated, service_role;
comment on function api.choose_card_frame(text) is
  'Chooses the caller''s card frame: {available, chosenFrame, frame}. standard is always allowed; another frame needs BotolaGO+ (PT403 premium_required) and the trophy it rewards (PT403 trophy_not_earned). {available:false} while BotolaGO+ or the card reads are off. Cosmetic only. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.get_trophy_card_frames
-- ---------------------------------------------------------------------------
create function api.get_trophy_card_frames(p_team_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  result jsonb;
begin
  if p_team_ids is null or cardinality(p_team_ids) > 1000
    or (select count(distinct asked.id) from unnest(p_team_ids) as asked(id)) > 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  mode := app_private.card_reads_mode();
  if mode is distinct from 'on' and mode is distinct from 'preview' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  -- Only the cards that wear a frame are listed; every other card is the standard frame.
  select coalesce(jsonb_agg(jsonb_build_object('teamId', found.team_id, 'frame', found.frame)
    order by found.team_id), '[]'::jsonb)
  into result
  from (
    select team.id as team_id, app_private.card_frame_effective(team.user_id, actor) as frame
    from app.fantasy_teams team
    join app.profiles profile on profile.id = team.user_id and profile.deleted_at is null
    where team.id in (select distinct t.id from unnest(p_team_ids) as t(id) where t.id is not null)
  ) found
  where found.frame <> 'standard';
  return jsonb_build_object('available', true, 'frames', result);
end;
$$;
revoke all on function api.get_trophy_card_frames(uuid[]) from public, anon, authenticated, service_role;
grant execute on function api.get_trophy_card_frames(uuid[]) to authenticated, service_role;
comment on function api.get_trophy_card_frames(uuid[]) is
  'The frames up to 100 Fantasy teams'' cards are drawn in: {available, frames:[{teamId, frame}]}, only the cards that wear a frame (public where the card is drawn; in preview a member''s frame is shown to its owner only). {available:false} while BotolaGO+ or the card reads are off. Nothing is written. Signed-in, step-up.';

notify pgrst, 'reload schema';
$bg_20261015150200_file$]
);

-- ---------------------------------------------------------------------------
-- Run them from the history, in order, once each is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261015150000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261015150000'
  );
  part_20261015150100 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261015150100'
  );
  part_20261015150200 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261015150200'
  );
begin
  if encode(sha256(convert_to(part_20261015150000, 'UTF8')), 'hex')
    is distinct from '44bd910480f2ce2c42d5772fd7c19d46b572a3b4a48e83416ce2388b2b497b47' then
    raise exception 'stop: 20261015150000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261015150100, 'UTF8')), 'hex')
    is distinct from '4d4ed28f29e7da918bc4ddc5ccd995a33a647d860e561d4652bfde341befa395' then
    raise exception 'stop: 20261015150100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261015150200, 'UTF8')), 'hex')
    is distinct from '3a7fcf37a74421c91a7d0612496931d495ed20fa12ffca56995c9451dff0d441' then
    raise exception 'stop: 20261015150200 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261015150000;
  execute part_20261015150100;
  execute part_20261015150200;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own) and keep what was
-- computed in a session setting, so the result row can show it after the rollback
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  who text;
  rel text;
  sig text;
  rec record;
  premium_mode text;
  answer jsonb;
  pass jsonb;
  state jsonb;
begin
  -- The five tables: row security enabled and forced, no client privilege.
  foreach rel in array array['app.trophy_catalog', 'app.trophies_earned', 'app.card_frames',
    'app.card_frame_choices', 'app_private.trophy_settings'] loop
    if to_regclass(rel) is null then
      problems := problems || (rel || ' is missing');
    else
      if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid = to_regclass(rel)) then
        problems := problems || (rel || ' does not force row security');
      end if;
      foreach who in array array['anon', 'authenticated', 'service_role'] loop
        if has_table_privilege(who, to_regclass(rel), 'select,insert,update,delete,references') then
          problems := problems || (who || ' has a privilege on ' || rel);
        end if;
      end loop;
    end if;
  end loop;

  -- Configuration: twelve trophies, nine frames, the switch off, nothing earned or chosen.
  if (select count(*) from app.trophy_catalog where status = 'active') <> 12 then
    problems := problems || 'the catalogue does not have twelve trophies'::text;
  end if;
  if (select count(*) from app.card_frames where status = 'active') <> 9 then
    problems := problems || 'there are not nine frames'::text;
  end if;
  if (select s.enabled from app_private.trophy_settings s where s.id) is distinct from false then
    problems := problems || 'the evaluator is not switched off'::text;
  end if;
  if (select count(*) from app.trophies_earned) <> 0 or (select count(*) from app.card_frame_choices) <> 0 then
    problems := problems || 'a trophy or a frame choice exists -- this script adds none'::text;
  end if;

  -- A trophy is never taken back: both triggers are on the table.
  if (select count(*) from pg_trigger t
      where t.tgrelid = to_regclass('app.trophies_earned') and not t.tgisinternal
        and t.tgname in ('trophies_earned_keep_update', 'trophies_earned_keep_delete')) <> 2 then
    problems := problems || 'the never-taken-back triggers are not both there'::text;
  end if;

  -- The three api functions: who may run them, how they run.
  foreach sig in array array['api.get_my_trophies(text)', 'api.choose_card_frame(text)',
    'api.get_trophy_card_frames(uuid[])'] loop
    if to_regprocedure(sig) is null then
      problems := problems || (sig || ' is missing');
    else
      foreach who in array array['authenticated', 'service_role'] loop
        if not has_function_privilege(who, to_regprocedure(sig), 'execute') then
          problems := problems || (who || ' cannot run ' || sig);
        end if;
      end loop;
      foreach who in array array['anon', 'public'] loop
        if has_function_privilege(who, to_regprocedure(sig), 'execute') then
          problems := problems || (who || ' can run ' || sig);
        end if;
      end loop;
      if not (select p.prosecdef and p.proconfig @> array['search_path=""']
        from pg_proc p where p.oid = to_regprocedure(sig)) then
        problems := problems || (sig || ' is not security definer with an empty search_path');
      end if;
    end if;
  end loop;
  foreach sig in array array['api.get_my_trophies(text)', 'api.get_trophy_card_frames(uuid[])'] loop
    if to_regprocedure(sig) is not null
      and (select p.provolatile from pg_proc p where p.oid = to_regprocedure(sig)) <> 's' then
      problems := problems || (sig || ' is not STABLE');
    end if;
  end loop;

  -- The helpers and the pass: no API role may run them; only postgres runs the pass and the switch.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and (p.proname like 'trophy\_%' or p.proname like 'trophies\_%' or p.proname = 'card_frame_effective')
  loop
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, rec.oid, 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private'
        and (p.proname like 'trophy\_%' or p.proname like 'trophies\_%' or p.proname = 'card_frame_effective')) <> 10 then
    problems := problems || 'the ten app_private functions are not all there'::text;
  end if;

  -- Replaces nothing: the card reads, the editions, the membership check and the card tick are as they were.
  if (select string_agg(
        p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
      from pg_proc p where p.oid in (
        'api.choose_card_design(text)'::regprocedure, 'api.get_my_manager_card()'::regprocedure,
        'api.get_manager_cards(uuid[])'::regprocedure, 'app_private.has_premium(uuid,timestamptz)'::regprocedure,
        'app_private.card_reads_mode()'::regprocedure, 'app_private.card_week_rows(uuid,uuid)'::regprocedure,
        'app_private.card_transfer_rows(uuid,uuid)'::regprocedure,
        'app_private.card_evaluable_gameweeks(uuid)'::regprocedure,
        'app_private.card_league_members(uuid)'::regprocedure,
        'app_private.manager_card_tick()'::regprocedure))
    is distinct from current_setting('bg.trophies_defs', true) then
    problems := problems || 'an existing function changed -- this script replaces none'::text;
  end if;

  -- Off means off (checked only while BotolaGO+ is off; if it is already on the reads cannot be
  -- called here without a signed-in user).
  select s.mode into premium_mode from app_private.premium_settings s where s.id;
  if premium_mode = 'off' then
    answer := api.get_my_trophies();
    if answer is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the cabinet does not answer off while BotolaGO+ is off: '
        || coalesce(answer::text, 'nothing'));
    end if;
    answer := api.choose_card_frame('standard');
    if answer is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the frame choice does not answer off while BotolaGO+ is off: '
        || coalesce(answer::text, 'nothing'));
    end if;
  end if;

  -- The pass answers off and writes nothing.
  pass := app_private.trophies_tick();
  if pass is distinct from '{"status": "off"}'::jsonb then
    problems := problems || ('the pass does not answer off: ' || coalesce(pass::text, 'nothing'));
  end if;

  -- Exactly the two jobs were added, and the history rows are there.
  if (select count(*) from cron.job)::text is distinct from (current_setting('bg.trophies_jobs', true)::integer + 2)::text then
    problems := problems || 'the number of scheduled jobs did not grow by exactly two'::text;
  end if;
  if (select count(*) from cron.job where jobname in ('trophies-tick', 'trophies-history-prune')) <> 2 then
    problems := problems || 'the two Trophées jobs are not both scheduled'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version in ('20261015150000', '20261015150100', '20261015150200')) <> 3 then
    problems := problems || 'a history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  state := jsonb_build_object(
    'premiumMode', premium_mode,
    'tables', 5,
    'trophies', (select count(*) from app.trophy_catalog),
    'frames', (select count(*) from app.card_frames),
    'apiFunctions', 3,
    'helpers', 10,
    'jobsAdded', 2,
    'passWhileOff', pass,
    'readWhileOff', case when premium_mode = 'off' then answer end,
    'historyRows', 3
  );
  perform set_config('bg.trophies_state', state::text, true);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('bg.trophies_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.trophies_state', true);
  end if;
  raise notice 'trophies: applying: %', current_setting('bg.trophies_state', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261015150000')
    then 'Applied. The Trophées backend is in place and OFF: the evaluator is switched off and every read answers off while BotolaGO+ is off. Next: docs/backend/TROPHIES_OPERATIONS_RUNBOOK.md.'
  else 'NOT applied: nothing was saved (a rehearsal, or a check stopped it).'
end as result;
