-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply the Gradins read API of the Manager Card (BG-0158), migrations
-- 20261010120000 to 20261010120300, on top of the five Manager Card
-- migrations 20261008123000 to 20261008123400 already applied:
--   * 20261010120000 app.manager_card_moment_acks, the moments a manager has
--     seen (written only by api.ack_manager_card_moments);
--   * 20261010120100 the read helpers in app_private (no grant at all);
--   * 20261010120200 the read API of the merged front end: it adds
--     api.manager_card_status() and api.ack_manager_card_moments(text[]),
--     replaces api.get_my_manager_card(), api.get_manager_cards(uuid[]) and
--     api.get_my_manager_card_history(), and drops api.get_manager_card(uuid),
--     the old two-argument history and the two #381 builders in app_private;
--   * 20261010120300 the manager_card health check, last in
--     app_private.ops_health_checks().
--
-- IT CHANGES NOTHING ANYONE SEES. The read switch must be off (the script
-- refuses otherwise) and reads stay off: every read now answers
-- {"available": false}, the status answers {"enabled": false}. Nothing is
-- calculated by this script, no switch changes, no rules row is inserted.
-- Switching reads on is a later, separate step
-- (docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md).
--
-- WHEN
--   After the pull request that adds this file is merged, after the five
--   migrations of the 2026-10-08 script are applied, and after every earlier
--   repository migration, in order, each with its own script:
--     1. the Fantasy durable progression migration 20261009091728
--        (scripts/backend/apply-fantasy-durable-progression.sql, PR #384);
--     2. Home stories 20261009094920 and 20261009113132
--        (scripts/backend/apply-home-stories.sql, PR #386);
--     3. AI home stories 20261009195943
--        (scripts/backend/apply-ai-home-stories.sql, PR #389);
--     4. the story presentation repair 20261009211234
--        (scripts/backend/apply-story-presentation-repair.sql, PR #390);
--     5. the compact story labels 20261010055425
--        (scripts/backend/apply-compact-story-labels.sql, PR #393).
--   The newest migration recorded must be exactly 20261010055425: the script
--   refuses otherwise, so the migrations go in repository order. Any quiet
--   moment; not at minute 12 of an hour (the Fantasy season orchestrator). It
--   takes short locks on app.profiles (one foreign key) and replaces
--   app_private.ops_health_checks().
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Make sure nothing else is writing to this database: no GitHub Actions
--     run in progress, no pg_cron job mid-run, no other query running. The
--     scheduled jobs are listed in AGENTS.md. No Fantasy table is touched (the
--     only foreign key added points at app.profiles), so the Fantasy tick need
--     not be paused.
--   * Check that reads are off:
--       select read_enabled from app_private.manager_card_settings;
--     must say false. The script refuses while it is true.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query.
--   2. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of the four migrations is recorded,
--     or where the newest recorded migration is not exactly 20261010055425
--     (the last repository migration before these four), or where any of the
--     five 2026-10-08 migrations is missing or differs from the reviewed
--     repository file (sha256 of the recorded text), or where
--     the read switch is on, or where a table or function it builds on is
--     missing or one it creates already exists;
--   * records each of the four migration files in
--     supabase_migrations.schema_migrations, whole as statements[1], and runs
--     them in order from those records once each one's sha256 matches the
--     repository file;
--   * checks the result without saving anything: the five api functions answer
--     exactly the reviewed roles, the dropped functions are gone, the new
--     table has forced row security, no API right and its guard trigger and is
--     empty, no app_private Manager Card function answers an API role, the
--     status answers enabled false, the manager_card health check is last and
--     ok while compute is off, both switches, the rules rows and every card
--     table are exactly as the preflight read them, and nine Manager Card
--     migrations are in the history.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  needed text;
  switches app_private.manager_card_settings%rowtype;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
    where version in ('20261008123000', '20261008123100', '20261008123200', '20261008123300', '20261008123400')) <> 5 then
    raise exception 'stop: the five Manager Card migrations 20261008123000 to 20261008123400 are not all applied yet -- run scripts/backend/apply-20261008123000-manager-card.sql first';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations
    where version in ('20261010120000', '20261010120100', '20261010120200', '20261010120300')) then
    raise exception 'stop: a Gradins read API migration (20261010120000 to 20261010120300) is already recorded as applied';
  end if;
  -- Repository order: these four sort after every other repository migration,
  -- and the last of those is 20261010055425 (the compact story labels).
  -- The newest recorded migration must be exactly that one. It matters beyond
  -- tidiness: 20261009091728 (PR #384) wraps app_private.ops_health_checks()
  -- before 20261010120300 does, and applied the other way round its rename
  -- would swallow this one's wrapper and the manager_card check would no
  -- longer be last. Each earlier script requires the one before it to be the
  -- newest recorded migration (Fantasy durable progression wants 20261008123400,
  -- Home stories wants 20261009091728, AI home stories wants 20261009113132,
  -- the story presentation repair wants 20261009195943, the compact story
  -- labels want 20261009211234), so this one comparison stands for the whole
  -- chain.
  if (select max(version) from supabase_migrations.schema_migrations) is distinct from '20261010055425' then
    raise exception 'stop: the newest applied migration is %, expected 20261010055425 -- apply every earlier repository migration first, in order (Fantasy durable progression 20261009091728, Home stories 20261009094920 and 20261009113132, AI home stories 20261009195943, story presentation repair 20261009211234, compact story labels 20261010055425), so the migrations go in repository order', (select max(version) from supabase_migrations.schema_migrations);
  end if;
  -- The installed objects are the reviewed ones: the recorded text of each of
  -- the five is the repository file the 2026-10-08 script checked.
  if (select statements[1] from supabase_migrations.schema_migrations where version = '20261008123000') is null
    or encode(sha256(convert_to((select statements[1] from supabase_migrations.schema_migrations where version = '20261008123000'), 'UTF8')), 'hex')
      is distinct from '681c670f3994c4038c950ee54be58887628f6681d825940f20be00db9a2d3e23' then
    raise exception 'stop: the recorded 20261008123000 is not the reviewed repository file -- production does not hold the objects this script was written against';
  end if;
  if (select statements[1] from supabase_migrations.schema_migrations where version = '20261008123100') is null
    or encode(sha256(convert_to((select statements[1] from supabase_migrations.schema_migrations where version = '20261008123100'), 'UTF8')), 'hex')
      is distinct from '7455c4d7cce3759b590ac6a462e308a7127dea57b74852b21af03838ab9e3890' then
    raise exception 'stop: the recorded 20261008123100 is not the reviewed repository file -- production does not hold the objects this script was written against';
  end if;
  if (select statements[1] from supabase_migrations.schema_migrations where version = '20261008123200') is null
    or encode(sha256(convert_to((select statements[1] from supabase_migrations.schema_migrations where version = '20261008123200'), 'UTF8')), 'hex')
      is distinct from '2db758f1ada9ce07ad3aa335afc698f48b65343f48a7922c80e89cf1b2bcfce8' then
    raise exception 'stop: the recorded 20261008123200 is not the reviewed repository file -- production does not hold the objects this script was written against';
  end if;
  if (select statements[1] from supabase_migrations.schema_migrations where version = '20261008123300') is null
    or encode(sha256(convert_to((select statements[1] from supabase_migrations.schema_migrations where version = '20261008123300'), 'UTF8')), 'hex')
      is distinct from '556fcb7d3c26106d6905b24aac012f22366d96f338c0cf8d816e67eb5ea33f36' then
    raise exception 'stop: the recorded 20261008123300 is not the reviewed repository file -- production does not hold the objects this script was written against';
  end if;
  if (select statements[1] from supabase_migrations.schema_migrations where version = '20261008123400') is null
    or encode(sha256(convert_to((select statements[1] from supabase_migrations.schema_migrations where version = '20261008123400'), 'UTF8')), 'hex')
      is distinct from '75f37a8486bd729296ccc64d0cc0aee9a9bbd2a7aaab464ff1abf8f9ada99918' then
    raise exception 'stop: the recorded 20261008123400 is not the reviewed repository file -- production does not hold the objects this script was written against';
  end if;
  foreach needed in array array[
    'app.profiles', 'app.fantasy_seasons', 'app.fantasy_teams', 'app.fantasy_gameweeks',
    'app.user_preferences', 'app.teams', 'app.team_translations', 'app.seasons',
    'app_private.fantasy_gameweek_postwork', 'app_private.account_deletion_settings',
    'app.manager_cards', 'app.manager_card_seasons', 'app.manager_card_gameweeks',
    'app_private.manager_card_settings', 'app_private.manager_card_rules',
    'app_private.manager_card_retired_serials', 'app_private.manager_card_evaluations',
    'app_private.manager_card_job_log', 'auth.users', 'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'api.get_my_manager_card()',
    'api.get_manager_card(uuid)',
    'api.get_manager_cards(uuid[])',
    'api.get_my_manager_card_history(integer,integer)',
    'app_private.manager_card_json(uuid,uuid)',
    'app_private.manager_card_current_season(uuid)',
    'app_private.manager_card_minimum()',
    'app_private.manager_card_qualifies(integer,smallint)',
    'app_private.assert_mfa_step_up()',
    'app_private.refuse_unverified_mfa_actor()',
    'app_private.ops_health_checks()',
    'app_private.ops_health_checks_before_account_deletion()'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if to_regclass('app.manager_card_moment_acks') is not null then
    raise exception 'stop: app.manager_card_moment_acks already exists';
  end if;
  foreach needed in array array[
    'api.manager_card_status()',
    'api.ack_manager_card_moments(text[])',
    'app_private.ops_health_checks_before_manager_card()'
  ] loop
    if to_regprocedure(needed) is not null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: a function this creates already exists: %', missing;
  end if;

  -- This apply must not change a live answer: reads are off.
  select * into switches from app_private.manager_card_settings where id;
  if not found then
    raise exception 'stop: the Manager Card settings row is missing';
  end if;
  if switches.read_enabled then
    raise exception 'stop: the Manager Card read switch is on -- this apply replaces the read API; switch reads off first with select app_private.manager_card_configure(null, false); and switch them back on only after the apply';
  end if;

  -- Baseline for the postflight (transaction-local).
  perform set_config('botolago.mc_compute', switches.compute_enabled::text, true);
  perform set_config('botolago.mc_baseline', jsonb_build_object(
    'rules', (select count(*) from app_private.manager_card_rules),
    'cards', (select count(*) from app.manager_cards),
    'seasons', (select count(*) from app.manager_card_seasons),
    'gameweeks', (select count(*) from app.manager_card_gameweeks),
    'evaluations', (select count(*) from app_private.manager_card_evaluations),
    'jobs', (select count(*) from app_private.manager_card_job_log),
    'retired', (select count(*) from app_private.manager_card_retired_serials)
  )::text, true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The four migrations, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261010120000',
  'manager_card_moment_acks',
  array[$bg_20261010120000_file$-- Manager Card (BG-0158), gap plan 3.1: the moments a manager has seen.
--
-- D21: the moments a manager has already seen (a card created, a tier reached,
-- a season closed...) are recorded on the server so they do not come back on
-- another device. Written only by api.ack_manager_card_moments
-- (20261010120200), read only by app_private.manager_card_moments
-- (20261010120100). Display only. Rows go with the profile (cascade) and are
-- never pruned: a row is what stops a moment repeating.
--
-- No foreign key to app.manager_cards (card_created can be acknowledged on a
-- forming card that has no card row yet) and none to seasons (a key whose
-- season disappears simply stops matching). The uuid inside a key is a
-- fantasy_season_id. "homa" is never a key: a card starts there.

create table app.manager_card_moment_acks (
  user_id uuid not null references app.profiles(id) on delete cascade,
  moment_key text not null,
  acknowledged_at timestamptz not null default statement_timestamp(),
  constraint manager_card_moment_acks_pkey primary key (user_id, moment_key),
  constraint manager_card_moment_acks_key_check check (
    char_length(moment_key) <= 80 and moment_key ~ (
      '^(card_created|founder_granted|tier_changed:(stade|pro|champion|legend)|'
      || '(first_rating|provisional_cleared|season_closed|season_started):'
      || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
  )
);

alter table app.manager_card_moment_acks enable row level security;
alter table app.manager_card_moment_acks force row level security;
revoke all on app.manager_card_moment_acks from public, anon, authenticated, service_role;

create trigger manager_card_moment_acks_refuse_unverified_mfa_actor
before insert or update or delete on app.manager_card_moment_acks
for each statement execute function app_private.refuse_unverified_mfa_actor();

comment on table app.manager_card_moment_acks is
  'The Manager Card moments a manager has seen (display only, D21). Written only by api.ack_manager_card_moments. Row security forced, no policy, no grant: only definer functions read it. Cascades from the profile; never pruned.';
$bg_20261010120000_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261010120100',
  'manager_card_read_helpers',
  array[$bg_20261010120100_file$-- Manager Card (BG-0158), gap plan 3.2: ten read helpers for the Gradins contract.
--
-- Everything the merged front end (src/backend/manager-card/contracts.ts) shows
-- and #381 does not store is derived here at read time from #381's tables: the
-- usable rules, the current season, club names, null reasons, moments, the
-- caller's card and a member's card. No column of any #381 table changes and the
-- tick is untouched.
--
-- The helpers live in app_private, are not security definer (they run inside the
-- security definer api functions of 20261010120200), carry no grant at all and
-- do not read the caller: the api functions own the caller, the step-up and the
-- switch. Display only.
--
-- Tier order everywhere: homa < stade < pro < champion < legend.
-- "Qualifies": gameweeks_counted >= the rules' minimum. A "rated row" is a
-- history row (app.manager_card_gameweeks) that qualifies and has an OVR. "The
-- order" of a manager's history rows is fantasy_seasons.starts_at,
-- fantasy_seasons.id, fantasy_gameweeks.sequence_number.

-- H1. The active rules, read defensively. Never raises; no active row, no row.
create function app_private.manager_card_active_rules()
returns table (
  version integer,
  min_rated integer,
  min_confirmed integer,
  tiers jsonb,
  cap_ignore timestamptz,
  usable boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  rule app_private.manager_card_rules%rowtype;
  v_min_rated integer;
  v_min_confirmed integer;
  v_tiers jsonb;
  v_cap_ignore timestamptz;
  v_stade numeric;
  v_pro numeric;
  v_champion numeric;
  v_legend numeric;
  v_usable boolean;
begin
  select * into rule from app_private.manager_card_rules r where r.active;
  if not found then
    return;
  end if;

  if (rule.config ->> 'minimum_gameweeks') ~ '^[0-9]{1,6}$' then
    v_min_rated := (rule.config ->> 'minimum_gameweeks')::integer;
  end if;
  if (rule.config ->> 'provisional_below') ~ '^[0-9]{1,6}$' then
    v_min_confirmed := (rule.config ->> 'provisional_below')::integer;
  end if;
  v_tiers := rule.config -> 'tiers';
  if jsonb_typeof(rule.config -> 'cap_ignore_deadlines_before') = 'string' then
    begin
      v_cap_ignore := (rule.config ->> 'cap_ignore_deadlines_before')::timestamptz;
    exception when others then
      v_cap_ignore := null;
    end;
  end if;

  if jsonb_typeof(v_tiers) = 'object'
    and jsonb_typeof(v_tiers -> 'stade') = 'number'
    and jsonb_typeof(v_tiers -> 'pro') = 'number'
    and jsonb_typeof(v_tiers -> 'champion') = 'number'
    and jsonb_typeof(v_tiers -> 'legend') = 'number' then
    v_stade := (v_tiers ->> 'stade')::numeric;
    v_pro := (v_tiers ->> 'pro')::numeric;
    v_champion := (v_tiers ->> 'champion')::numeric;
    v_legend := (v_tiers ->> 'legend')::numeric;
  end if;

  v_usable := coalesce(
    v_min_rated >= 1
    and v_min_confirmed >= v_min_rated
    and v_stade >= 1 and v_legend <= 99
    and v_stade < v_pro and v_pro < v_champion and v_champion < v_legend,
    false
  );

  return query select rule.version, v_min_rated, v_min_confirmed, v_tiers, v_cap_ignore, v_usable;
end;
$$;
revoke all on function app_private.manager_card_active_rules()
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_active_rules() is
  'The active Manager Card rules row read defensively: version, minimum_gameweeks, provisional_below, tiers, cap_ignore_deadlines_before and whether the numbers are usable for the API (a minimum of at least 1, a provisional line at or above it, four rising tiers between 1 and 99). No active row, no row. Never raises. No grant.';

-- H2. May the reads answer? Switch on and a usable active rules row.
create function app_private.manager_card_read_ready()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select s.read_enabled from app_private.manager_card_settings s where s.id), false)
    and coalesce((select r.usable from app_private.manager_card_active_rules() r), false);
$$;
revoke all on function app_private.manager_card_read_ready()
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_read_ready() is
  'True when manager_card_settings.read_enabled is on and the active rules row is usable (manager_card_active_rules). While false every Manager Card read answers {available:false}. No grant.';

-- H3. The Fantasy season the section shows: the open or active one (latest
-- start), else the latest completed one, else null.
create function app_private.manager_card_fantasy_season()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select fs.id from app.fantasy_seasons fs
      where fs.status in ('registration_open', 'active')
      order by fs.starts_at desc, fs.id desc limit 1),
    (select fs.id from app.fantasy_seasons fs
      where fs.status = 'completed'
      order by fs.starts_at desc, fs.id desc limit 1)
  );
$$;
revoke all on function app_private.manager_card_fantasy_season()
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_fantasy_season() is
  'The current Fantasy season for the Manager Card: open or active (latest start), else the latest completed, else null. No grant.';

-- H4. The season label as the card shows it: 2026/2027 becomes 2026/27.
create function app_private.manager_card_season_label(p_fantasy_season_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case when s.label ~ '^[0-9]{4}/[0-9]{4}$' then left(s.label, 5) || right(s.label, 2)
    else s.label end
  from app.fantasy_seasons fs
  join app.seasons s on s.id = fs.football_season_id
  where fs.id = p_fantasy_season_id;
$$;
revoke all on function app_private.manager_card_season_label(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_season_label(uuid) is
  'The label of a Fantasy season''s football season, NNNN/NNNN shortened to NNNN/NN; null for an unknown season. No grant.';

-- H5. Tier order.
create function app_private.manager_card_tier_rank(p_tier text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tier
    when 'homa' then 1 when 'stade' then 2 when 'pro' then 3
    when 'champion' then 4 when 'legend' then 5 end;
$$;
revoke all on function app_private.manager_card_tier_rank(text)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_tier_rank(text) is
  'homa 1 .. legend 5; null for anything else. No grant.';

-- H6. The manager's club as the card shows it, or null.
create function app_private.manager_card_club(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', team.id,
    'slug', team.slug,
    'code', nullif(btrim(team.code), ''),
    'name', jsonb_build_object(
      'fr', coalesce(fr.name, team.name), 'ar', coalesce(ar.name, team.name)),
    'shortName', jsonb_build_object(
      'fr', coalesce(fr.short_name, team.short_name),
      'ar', coalesce(ar.short_name, team.short_name)),
    'city', null,
    'primaryColor', team.primary_color,
    'secondaryColor', team.secondary_color
  )
  from app.user_preferences preference
  cross join lateral (
    select picked.id from (
      select t.id, 1 as rank from app.teams t where t.id = preference.favorite_team_id
      union all
      select t.id, 2 from app.teams t
      where preference.favorite_team_id is null
        and t.id::text = preference.favorite_team_provisional_ref
      union all
      select t.id, 3 from app.teams t
      where preference.favorite_team_id is null
        and t.slug = preference.favorite_team_provisional_ref
    ) picked
    order by picked.rank
    limit 1
  ) pick
  join app.teams team on team.id = pick.id
  left join app.team_translations fr on fr.team_id = team.id and fr.language = 'fr'
  left join app.team_translations ar on ar.team_id = team.id and ar.language = 'ar'
  where preference.user_id = p_user_id;
$$;
revoke all on function app_private.manager_card_club(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_club(uuid) is
  'The manager''s club for the card: user_preferences.favorite_team_id, else favorite_team_provisional_ref matched to a team id, then a slug. Eight keys; city is always null; null when there is none. Never writes. No grant.';

-- H7. Why a stat that is null is null. Used only for a qualifying season, and
-- only for stats that are null.
create function app_private.manager_card_stat_reasons(
  p_user_id uuid,
  p_fantasy_season_id uuid,
  p_fantasy_team_id uuid,
  p_cap_ignore timestamptz
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'cap', case when p_cap_ignore is not null and exists (
        select 1
        from app.manager_card_gameweeks h
        join app.fantasy_gameweeks gw on gw.id = h.gameweek_id
        where h.user_id = p_user_id and h.fantasy_season_id = p_fantasy_season_id
          and gw.deadline_at < p_cap_ignore
      ) then 'pre_captain_fix' else 'excluded_weeks_only' end,
    'sel', 'excluded_weeks_only',
    'trf', case
      when not exists (
        select 1 from app.fantasy_transfer_batches b
        where b.fantasy_team_id = p_fantasy_team_id and b.status = 'confirmed'
      ) then 'no_transfers'
      when not exists (
        select 1 from app.fantasy_transfer_batches b
        where b.fantasy_team_id = p_fantasy_team_id and b.status = 'confirmed'
          and b.chip_type is distinct from 'free_hit'
      ) then 'excluded_weeks_only'
      else 'window_open' end,
    'con', 'excluded_weeks_only'
  );
$$;
revoke all on function app_private.manager_card_stat_reasons(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_stat_reasons(uuid, uuid, uuid, timestamptz) is
  'The reason each of cap, sel, trf, con is null in a qualifying season, read live. The caller uses a reason only for a null stat. board_not_final is never emitted. No grant.';

-- H8. Every derivable moment of a manager, with whether it is still pending.
create function app_private.manager_card_moments(p_user_id uuid)
returns table (moment_key text, occurred_at timestamptz, moment jsonb, pending boolean)
language sql
stable
set search_path = ''
as $$
  with rules as (
    select r.min_rated from app_private.manager_card_active_rules() r
  ),
  cur as (
    select app_private.manager_card_fantasy_season() as season_id
  ),
  team as (
    select t.id, t.created_at
    from app.fantasy_teams t
    join cur on t.fantasy_season_id = cur.season_id
    where t.user_id = p_user_id
    limit 1
  ),
  card as (
    select c.created_at, c.founder_cohort, c.founder_granted_at
    from app.manager_cards c
    where c.user_id = p_user_id
  ),
  rated as (
    select h.fantasy_season_id as season_id, gw.sequence_number as seq, h.ovr, h.tier,
      h.provisional, h.gameweeks_counted, h.calculated_at,
      row_number() over (order by fs.starts_at, fs.id, gw.sequence_number) as rn
    from app.manager_card_gameweeks h
    join app.fantasy_seasons fs on fs.id = h.fantasy_season_id
    join app.fantasy_gameweeks gw on gw.id = h.gameweek_id
    join rules on h.gameweeks_counted >= rules.min_rated
    where h.user_id = p_user_id and h.ovr is not null
  ),
  user_seasons as (
    select s.fantasy_season_id as season_id, fs.status as season_status, fs.starts_at, fs.ends_at,
      s.ovr, s.tier, (s.gameweeks_counted >= rules.min_rated) as q
    from app.manager_card_seasons s
    join app.fantasy_seasons fs on fs.id = s.fantasy_season_id
    cross join rules
    where s.user_id = p_user_id
  ),
  cur_row as (
    select us.* from user_seasons us join cur on us.season_id = cur.season_id
  ),
  cur_tier as (
    select case when cr.q and cr.ovr is not null then cr.tier end as tier from cur_row cr
  ),
  all_moments as (
    -- card_created
    select 'card_created'::text as mkey, (select c.created_at from card c) as mat,
      jsonb_build_object('kind', 'card_created', 'key', 'card_created',
        'occurredAt', (select c.created_at from card c),
        'seasonLabel', app_private.manager_card_season_label(cur.season_id)) as mjson,
      true as mwin
    from cur
    where cur.season_id is not null
      and (exists (select 1 from card) or exists (select 1 from team))
    union all
    -- first_rating
    select 'first_rating:' || f.season_id, f.calculated_at,
      jsonb_build_object('kind', 'first_rating', 'key', 'first_rating:' || f.season_id,
        'occurredAt', f.calculated_at, 'gameweekSeq', f.seq, 'ovr', f.ovr, 'tier', f.tier,
        'provisional', f.provisional, 'gameweeksCounted', f.gameweeks_counted,
        'firstEver', f.rn = 1),
      coalesce(f.season_id = cur.season_id, false)
    from (select distinct on (r.season_id) r.* from rated r order by r.season_id, r.rn) f
    cross join cur
    union all
    -- provisional_cleared
    select 'provisional_cleared:' || f.season_id, f.calculated_at,
      jsonb_build_object('kind', 'provisional_cleared',
        'key', 'provisional_cleared:' || f.season_id,
        'occurredAt', f.calculated_at, 'gameweekSeq', f.seq, 'ovr', f.ovr,
        'gameweeksCounted', f.gameweeks_counted),
      coalesce(f.season_id = cur.season_id, false)
    from (select distinct on (r.season_id) r.* from rated r
      where not r.provisional order by r.season_id, r.rn) f
    cross join cur
    union all
    -- tier_changed
    select 'tier_changed:' || e.tier, e.calculated_at,
      jsonb_build_object('kind', 'tier_changed', 'key', 'tier_changed:' || e.tier,
        'occurredAt', e.calculated_at, 'tier', e.tier, 'previousTier', p.tier,
        'ovr', e.ovr, 'gameweekSeq', e.seq,
        'seasonLabel', app_private.manager_card_season_label(e.season_id)),
      coalesce(app_private.manager_card_tier_rank((select ct.tier from cur_tier ct))
        >= app_private.manager_card_tier_rank(e.tier), false)
    from (select distinct on (r.tier) r.* from rated r
      where r.tier in ('stade', 'pro', 'champion', 'legend')
      order by r.tier, r.rn) e
    join rated p on p.rn = e.rn - 1
    where app_private.manager_card_tier_rank(p.tier) < app_private.manager_card_tier_rank(e.tier)
    union all
    -- founder_granted
    select 'founder_granted', c.founder_granted_at,
      jsonb_build_object('kind', 'founder_granted', 'key', 'founder_granted',
        'occurredAt', c.founder_granted_at, 'cohort', c.founder_cohort, 'cutoffDate', null),
      true
    from card c
    where c.founder_cohort is not null
    union all
    -- season_closed
    select 'season_closed:' || us.season_id, us.ends_at,
      jsonb_build_object('kind', 'season_closed', 'key', 'season_closed:' || us.season_id,
        'occurredAt', us.ends_at,
        'seasonLabel', app_private.manager_card_season_label(us.season_id),
        'ovr', case when us.q then us.ovr end,
        'tier', case when us.q and us.ovr is not null then us.tier end),
      us.season_id = (
        select u2.season_id from user_seasons u2
        where u2.season_status = 'completed'
        order by u2.starts_at desc, u2.season_id desc limit 1)
    from user_seasons us
    where us.season_status = 'completed'
    union all
    -- season_started
    select 'season_started:' || cur.season_id, team.created_at,
      jsonb_build_object('kind', 'season_started', 'key', 'season_started:' || cur.season_id,
        'occurredAt', team.created_at,
        'seasonLabel', app_private.manager_card_season_label(cur.season_id),
        'previous', jsonb_build_object(
          'label', app_private.manager_card_season_label(prev.season_id),
          'ovr', case when prev.q then prev.ovr end,
          'tier', case when prev.q and prev.ovr is not null then prev.tier end)),
      not exists (select 1 from cur_row cr where cr.q and cr.ovr is not null)
    from cur
    join team on true
    join app.fantasy_seasons cs on cs.id = cur.season_id
    cross join lateral (
      select us.* from user_seasons us
      where us.season_status = 'completed' and us.starts_at < cs.starts_at
      order by us.starts_at desc, us.season_id desc
      limit 1
    ) prev
  )
  select m.mkey, m.mat, m.mjson,
    (coalesce(m.mwin, false) and not exists (
      select 1 from app.manager_card_moment_acks a
      where a.user_id = p_user_id and a.moment_key = m.mkey))
  from all_moments m
  order by m.mat nulls first, m.mkey;
$$;
revoke all on function app_private.manager_card_moments(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_moments(uuid) is
  'Every derivable Manager Card moment of a manager (contracts.ts moment DTOs) with pending = inside its window and not yet acknowledged. Derived at read time from the card tables and app.manager_card_moment_acks. No grant.';

-- H9. The caller's own card, the thirty keys of myCardSchema, or null.
create function app_private.manager_card_my_card(p_user_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_season uuid := app_private.manager_card_fantasy_season();
  rules record;
  profile app.profiles%rowtype;
  team app.fantasy_teams%rowtype;
  card app.manager_cards%rowtype;
  season_row app.manager_card_seasons%rowtype;
  season app.fantasy_seasons%rowtype;
  qualifies boolean;
  state text;
  v_ovr smallint;
  v_tier text;
  v_next text;
  v_best text;
  v_reasons jsonb;
  v_counted integer[];
  v_start integer;
  v_rating_gameweeks integer[];
  v_through integer;
  v_first_counted integer;
  v_first_rated integer;
  v_previous jsonb;
  v_seasons jsonb;
  v_moments jsonb;
begin
  select * into profile from app.profiles p where p.id = p_user_id and p.deleted_at is null;
  if not found or v_season is null then
    return null;
  end if;
  select * into team from app.fantasy_teams t
    where t.user_id = p_user_id and t.fantasy_season_id = v_season;
  if not found then
    return null;
  end if;
  select * into rules from app_private.manager_card_active_rules() r;
  if not found or rules.min_rated is null or rules.min_confirmed is null then
    return null;
  end if;
  select * into season from app.fantasy_seasons fs where fs.id = v_season;
  select * into card from app.manager_cards c where c.user_id = p_user_id;
  select * into season_row from app.manager_card_seasons s
    where s.user_id = p_user_id and s.fantasy_season_id = v_season;

  qualifies := season_row.user_id is not null and season_row.gameweeks_counted >= rules.min_rated;
  state := case
    when not qualifies then 'forming'
    when season_row.ovr is null then 'insufficient'
    when season_row.provisional then 'provisional'
    else 'rated' end;
  v_ovr := case when qualifies then season_row.ovr end;
  v_tier := case when v_ovr is not null then season_row.tier end;

  select h.tier into v_best
  from app.manager_card_gameweeks h
  where h.user_id = p_user_id and h.fantasy_season_id = v_season
    and h.gameweeks_counted >= rules.min_rated and h.ovr is not null and h.tier is not null
  order by app_private.manager_card_tier_rank(h.tier) desc
  limit 1;

  v_next := case v_tier
    when 'homa' then 'stade' when 'stade' then 'pro'
    when 'pro' then 'champion' when 'champion' then 'legend' end;

  v_reasons := app_private.manager_card_stat_reasons(
    p_user_id, v_season, team.id, rules.cap_ignore);

  select gw.sequence_number into v_through
  from app.fantasy_gameweeks gw where gw.id = season_row.through_gameweek_id;

  select min(gw.sequence_number) into v_first_counted
  from app.manager_card_gameweeks h
  join app.fantasy_gameweeks gw on gw.id = h.gameweek_id
  where h.user_id = p_user_id and h.fantasy_season_id = v_season;

  select min(gw.sequence_number) into v_first_rated
  from app.manager_card_gameweeks h
  join app.fantasy_gameweeks gw on gw.id = h.gameweek_id
  where h.user_id = p_user_id and h.fantasy_season_id = v_season
    and h.gameweeks_counted >= rules.min_rated and h.ovr is not null;

  if state = 'forming' and season.status is distinct from 'completed' then
    select coalesce(array_agg(gw.sequence_number order by gw.sequence_number), '{}')
      into v_counted
    from app.manager_card_gameweeks h
    join app.fantasy_gameweeks gw on gw.id = h.gameweek_id
    where h.user_id = p_user_id and h.fantasy_season_id = v_season;

    v_start := case when cardinality(v_counted) > 0 then v_counted[cardinality(v_counted)] + 1 end;
    if v_start is null then
      select min(gw.sequence_number) into v_start
      from app.fantasy_lineups l
      join app.fantasy_gameweeks gw on gw.id = l.gameweek_id
      where l.fantasy_team_id = team.id and gw.fantasy_season_id = v_season;
    end if;
    if v_start is null then
      select min(gw.sequence_number) into v_start
      from app.fantasy_gameweeks gw
      where gw.fantasy_season_id = v_season
        and gw.status in ('scheduled', 'open', 'locked', 'live', 'provisional', 'finalizing');
    end if;
    if v_start is not null then
      v_rating_gameweeks := v_counted || coalesce((
        select array_agg(next.sequence_number order by next.sequence_number)
        from (
          select gw.sequence_number
          from app.fantasy_gameweeks gw
          where gw.fantasy_season_id = v_season and gw.status <> 'cancelled'
            and gw.sequence_number >= v_start
          order by gw.sequence_number
          limit greatest(rules.min_rated - cardinality(v_counted), 0)
        ) next
      ), '{}');
      if cardinality(v_rating_gameweeks) = 0 then
        v_rating_gameweeks := null;
      end if;
    end if;
  end if;

  select jsonb_build_object(
    'label', app_private.manager_card_season_label(prev.fantasy_season_id),
    'ovr', case when prev.gameweeks_counted >= rules.min_rated then prev.ovr end,
    'tier', case when prev.gameweeks_counted >= rules.min_rated and prev.ovr is not null
      then prev.tier end)
  into v_previous
  from app.manager_card_seasons prev
  join app.fantasy_seasons pfs on pfs.id = prev.fantasy_season_id
  where prev.user_id = p_user_id and pfs.starts_at < season.starts_at
  order by pfs.starts_at desc, pfs.id desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'seasonId', s.id,
      'label', app_private.manager_card_season_label(s.id),
      'ovr', case when s.counted >= rules.min_rated then s.ovr end,
      'tier', case when s.counted >= rules.min_rated and s.ovr is not null then s.tier end,
      'bestTier', (
        select h.tier from app.manager_card_gameweeks h
        where h.user_id = p_user_id and h.fantasy_season_id = s.id
          and h.gameweeks_counted >= rules.min_rated and h.ovr is not null
          and h.tier is not null
        order by app_private.manager_card_tier_rank(h.tier) desc limit 1),
      'gameweeksCounted', s.counted,
      'closedAt', case when s.status = 'completed' then s.ends_at end
    ) order by s.starts_at desc, s.id desc), '[]'::jsonb)
  into v_seasons
  from (
    select fs.id, fs.starts_at, fs.status, fs.ends_at, ms.gameweeks_counted as counted,
      ms.ovr, ms.tier
    from app.manager_card_seasons ms
    join app.fantasy_seasons fs on fs.id = ms.fantasy_season_id
    where ms.user_id = p_user_id
    union all
    select fs.id, fs.starts_at, fs.status, fs.ends_at, 0, null::smallint, null::text
    from app.fantasy_seasons fs
    where fs.id = v_season and season_row.user_id is null
  ) s;

  select coalesce(jsonb_agg(m.moment order by m.occurred_at nulls first, m.moment_key), '[]'::jsonb)
  into v_moments
  from app_private.manager_card_moments(p_user_id) m
  where m.pending;

  return jsonb_build_object(
    'teamId', team.id,
    'name', coalesce(nullif(btrim(profile.display_name), ''), team.name),
    'handle', profile.username,
    'season', jsonb_build_object('id', v_season, 'label', app_private.manager_card_season_label(v_season)),
    'serial', card.serial,
    'founder', case when card.founder_cohort is not null then jsonb_build_object(
      'cohort', card.founder_cohort, 'grantedAt', card.founder_granted_at, 'cutoffDate', null)
      end,
    'club', app_private.manager_card_club(p_user_id),
    'ratingState', state,
    'ovr', v_ovr,
    'ovrNullReason', case state when 'forming' then 'pending_minimum'
      when 'insufficient' then 'too_few_stats' end,
    'tier', v_tier,
    'bestTier', v_best,
    'nextTier', case when v_ovr is not null and v_next is not null then jsonb_build_object(
      'code', v_next, 'fromOvr', ceil((rules.tiers ->> v_next)::numeric)::integer) end,
    'provisional', v_ovr is not null and season_row.provisional,
    'stats', jsonb_build_object(
      'cap', jsonb_build_object(
        'value', case when state <> 'forming' then season_row.cap end,
        'nullReason', case when state = 'forming' then 'pending_minimum'
          when season_row.cap is null then v_reasons ->> 'cap' end),
      'sel', jsonb_build_object(
        'value', case when state <> 'forming' then season_row.sel end,
        'nullReason', case when state = 'forming' then 'pending_minimum'
          when season_row.sel is null then v_reasons ->> 'sel' end),
      'trf', jsonb_build_object(
        'value', case when state <> 'forming' then season_row.trf end,
        'nullReason', case when state = 'forming' then 'pending_minimum'
          when season_row.trf is null then v_reasons ->> 'trf' end),
      'con', jsonb_build_object(
        'value', case when state <> 'forming' then season_row.con end,
        'nullReason', case when state = 'forming' then 'pending_minimum'
          when season_row.con is null then v_reasons ->> 'con' end)
    ),
    'gameweeksCounted', coalesce(season_row.gameweeks_counted, 0),
    'minRated', rules.min_rated,
    'minConfirmed', rules.min_confirmed,
    'rulesVersion', case when season_row.user_id is not null
      then 'v' || season_row.rules_version end,
    'throughGameweekSeq', v_through,
    'calculatedAt', season_row.calculated_at,
    'firstCountedGameweekSeq', v_first_counted,
    'firstRatedGameweekSeq', v_first_rated,
    'ratingGameweeks', to_jsonb(v_rating_gameweeks),
    'ratingGameweeksComplete', v_rating_gameweeks is not null
      and cardinality(v_rating_gameweeks) >= rules.min_rated,
    'previousSeason', v_previous,
    'seasonClosed', season.status = 'completed',
    'seasons', v_seasons,
    'createdAt', card.created_at,
    'moments', v_moments
  );
end;
$$;
revoke all on function app_private.manager_card_my_card(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_my_card(uuid) is
  'The caller''s card for the current Fantasy season in the shape of myCardSchema (30 keys), or null (no profile, deleted-pending, no season, no team). Figures are null under the minimum. Display only. No grant.';

-- H10. Other managers' cards, the fourteen keys of memberCardSchema each, for a
-- list of Fantasy teams at once. One row per known team with a visible profile;
-- unknown teams and deleted-pending profiles give no row. It takes the whole
-- list on purpose: called once per team (a function per row, each call with its
-- own nested club, label and rules calls) it cost about 1 ms a team on the local
-- stack, 200 ms for 100 teams; as one statement over the list it takes under
-- 10 ms.
create function app_private.manager_card_member_card(p_fantasy_team_ids uuid[])
returns table (team_id uuid, card jsonb)
language sql
stable
set search_path = ''
as $$
  select t.id, jsonb_build_object(
    'teamId', t.id,
    'name', coalesce(nullif(btrim(p.display_name), ''), t.name),
    'club', app_private.manager_card_club(t.user_id),
    'serial', c.serial,
    'founderCohort', c.founder_cohort,
    'seasonLabel', app_private.manager_card_season_label(t.fantasy_season_id),
    'ratingState', st.state,
    'ovr', case when st.q then s.ovr end,
    'tier', case when st.q and s.ovr is not null then s.tier end,
    'provisional', st.q and s.ovr is not null and s.provisional,
    'stats', jsonb_build_object(
      'cap', case when st.q then s.cap end,
      'sel', case when st.q then s.sel end,
      'trf', case when st.q then s.trf end,
      'con', case when st.q then s.con end),
    'gameweeksCounted', coalesce(s.gameweeks_counted, 0),
    'minRated', rules.min_rated,
    'firstRatedGameweekSeq', (
      select min(gw.sequence_number)
      from app.manager_card_gameweeks h
      join app.fantasy_gameweeks gw on gw.id = h.gameweek_id
      where h.user_id = t.user_id and h.fantasy_season_id = t.fantasy_season_id
        and h.gameweeks_counted >= rules.min_rated and h.ovr is not null)
  )
  from app.fantasy_teams t
  join app.profiles p on p.id = t.user_id and p.deleted_at is null
  left join app.manager_cards c on c.user_id = t.user_id
  left join app.manager_card_seasons s
    on s.user_id = t.user_id and s.fantasy_season_id = t.fantasy_season_id
  cross join (select r.min_rated from app_private.manager_card_active_rules() r) rules
  cross join lateral (
    select coalesce(s.gameweeks_counted >= rules.min_rated, false) as q,
      case
        when not coalesce(s.gameweeks_counted >= rules.min_rated, false) then 'forming'
        when s.ovr is null then 'insufficient'
        when s.provisional then 'provisional'
        else 'rated' end as state
  ) st
  where t.id = any (p_fantasy_team_ids);
$$;
revoke all on function app_private.manager_card_member_card(uuid[])
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_member_card(uuid[]) is
  'The cards of the given Fantasy teams for each team''s own season in the shape of memberCardSchema (14 keys), one (team_id, card) row per known team with a visible profile; unknown teams and deleted-pending profiles give no row. A team with no card row is a forming card. Set-based: one statement for the whole list. No handle, moments, user id or e-mail. No grant.';
$bg_20261010120100_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261010120200',
  'manager_card_api_v2',
  array[$bg_20261010120200_file$-- Manager Card (BG-0158), gap plan 3.3: the read API of the merged Gradins front end.
--
-- Replaces #381's read API (20261008123300) with the contract in
-- src/backend/manager-card/contracts.ts and drops what that contract does not
-- use. OFF IS AN ANSWER, not an error: while app_private.manager_card_read_ready()
-- is false (switch off, or no usable active rules row) every read answers HTTP
-- 200 {"available": false} (the acknowledgement answers everything "ignored"),
-- checked before the step-up and before the caller is read.
--
--   api.manager_card_status()                         anon too; never raises
--   api.get_my_manager_card()                         {available, card}
--   api.get_manager_cards(p_team_ids)                 {available, cards}
--   api.get_my_manager_card_history(season, before, limit)
--                                                     {available, items, nextBeforeSeq}
--   api.ack_manager_card_moments(p_keys)              {acknowledged, ignored}
--
-- The four signed-in functions run, in this order: argument check (PT400
-- validation_failed), the off answer, app_private.assert_mfa_step_up(), the
-- caller (PT401 authentication_required). Granted to authenticated and
-- service_role, never to anon. Display only: the acknowledgement writes only
-- app.manager_card_moment_acks.

drop function api.get_manager_card(uuid);
drop function api.get_manager_cards(uuid[]);
drop function api.get_my_manager_card_history(integer, integer);

-- ---------------------------------------------------------------------------
-- api.manager_card_status
-- ---------------------------------------------------------------------------
create function api.manager_card_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', app_private.manager_card_read_ready(),
    'minRated', case when app_private.manager_card_read_ready()
      then (select r.min_rated from app_private.manager_card_active_rules() r) end,
    'minConfirmed', case when app_private.manager_card_read_ready()
      then (select r.min_confirmed from app_private.manager_card_active_rules() r) end
  );
$$;

-- ---------------------------------------------------------------------------
-- api.get_my_manager_card
-- ---------------------------------------------------------------------------
create or replace function api.get_my_manager_card()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  return jsonb_build_object('available', true, 'card', app_private.manager_card_my_card(actor));
end;
$$;

-- ---------------------------------------------------------------------------
-- api.get_manager_cards
-- ---------------------------------------------------------------------------
create function api.get_manager_cards(p_team_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  result jsonb;
begin
  if p_team_ids is null or cardinality(p_team_ids) > 1000
    or (select count(distinct asked.id) from unnest(p_team_ids) as asked(id)) > 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  -- The order each team was first asked for; unknown teams and hidden
  -- profiles are left out.
  select coalesce(jsonb_agg(found.card order by found.position), '[]'::jsonb)
  into result
  from (
    select asked.position, built.card
    from (
      select t.id, min(t.position) as position
      from unnest(p_team_ids) with ordinality as t(id, position)
      where t.id is not null
      group by t.id
    ) asked
    join app_private.manager_card_member_card(p_team_ids) built on built.team_id = asked.id
  ) found;
  return jsonb_build_object('available', true, 'cards', result);
end;
$$;

-- ---------------------------------------------------------------------------
-- api.get_my_manager_card_history
-- ---------------------------------------------------------------------------
create function api.get_my_manager_card_history(
  p_season_id uuid default null,
  p_before_seq integer default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  v_season uuid;
  rules record;
  page_items jsonb;
  last_sequence integer;
  more boolean;
begin
  if p_limit is null or p_limit not between 1 and 50
    or (p_before_seq is not null and p_before_seq < 1) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;

  v_season := coalesce(p_season_id, app_private.manager_card_fantasy_season());
  if v_season is null or not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    return jsonb_build_object('available', true, 'items', '[]'::jsonb, 'nextBeforeSeq', null);
  end if;
  select * into rules from app_private.manager_card_active_rules() r;

  -- One row more than asked for says whether there is another page.
  with page as (
    select gw.sequence_number, history.fantasy_season_id, history.ovr, history.tier,
      history.cap, history.sel, history.trf, history.con, history.provisional,
      history.gameweeks_counted, history.calculated_at,
      history.gameweeks_counted >= rules.min_rated as ok,
      row_number() over (order by gw.sequence_number desc) as position
    from app.manager_card_gameweeks history
    join app.fantasy_gameweeks gw on gw.id = history.gameweek_id
    where history.user_id = actor
      and history.fantasy_season_id = v_season
      and (p_before_seq is null or gw.sequence_number < p_before_seq)
    order by gw.sequence_number desc
    limit p_limit + 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'seasonId', page.fantasy_season_id,
      'seasonLabel', app_private.manager_card_season_label(page.fantasy_season_id),
      'gameweekSeq', page.sequence_number,
      'ovr', case when page.ok then page.ovr end,
      'tier', case when page.ok and page.ovr is not null then page.tier end,
      'provisional', page.ok and page.ovr is not null and page.provisional,
      'gameweeksCounted', page.gameweeks_counted,
      'stats', jsonb_build_object(
        'cap', case when page.ok then page.cap end,
        'sel', case when page.ok then page.sel end,
        'trf', case when page.ok then page.trf end,
        'con', case when page.ok then page.con end
      ),
      'calculatedAt', page.calculated_at
    ) order by page.sequence_number desc) filter (where page.position <= p_limit), '[]'::jsonb),
    min(page.sequence_number) filter (where page.position <= p_limit),
    coalesce(bool_or(page.position > p_limit), false)
  into page_items, last_sequence, more
  from page;

  return jsonb_build_object(
    'available', true,
    'items', page_items,
    'nextBeforeSeq', case when more then last_sequence end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- api.ack_manager_card_moments
-- ---------------------------------------------------------------------------
create function api.ack_manager_card_moments(p_keys text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid;
  asked text[];
  acknowledged text[];
  ignored text[];
begin
  if p_keys is null or cardinality(p_keys) = 0 or cardinality(p_keys) > 64
    or exists (select 1 from unnest(p_keys) as k(key) where k.key is null) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- Distinct keys in request order.
  select coalesce(array_agg(d.key order by d.position), '{}')
  into asked
  from (
    select k.key, min(k.position) as position
    from unnest(p_keys) with ordinality as k(key, position)
    group by k.key
  ) d;
  if cardinality(asked) > 16 or exists (
    select 1 from unnest(asked) as k(key)
    where char_length(k.key) > 80 or k.key !~ (
      '^(card_created|founder_granted|tier_changed:(stade|pro|champion|legend)|'
      || '(first_rating|provisional_cleared|season_closed|season_started):'
      || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
  ) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('acknowledged', '[]'::jsonb, 'ignored', to_jsonb(asked));
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    return jsonb_build_object('acknowledged', '[]'::jsonb, 'ignored', to_jsonb(asked));
  end if;

  -- Only moments that are derivable now (pending or not), so a benign race
  -- never fails.
  insert into app.manager_card_moment_acks (user_id, moment_key)
  select actor, m.moment_key
  from app_private.manager_card_moments(actor) m
  where m.moment_key = any (asked)
  on conflict do nothing;

  select coalesce(array_agg(k.key order by k.position) filter (where a.moment_key is not null), '{}'),
    coalesce(array_agg(k.key order by k.position) filter (where a.moment_key is null), '{}')
  into acknowledged, ignored
  from unnest(asked) with ordinality as k(key, position)
  left join app.manager_card_moment_acks a on a.user_id = actor and a.moment_key = k.key;

  return jsonb_build_object('acknowledged', to_jsonb(acknowledged), 'ignored', to_jsonb(ignored));
end;
$$;

-- The #381 builders have no caller left.
drop function app_private.manager_card_json(uuid, uuid);
drop function app_private.manager_card_current_season(uuid);

-- ---------------------------------------------------------------------------
-- Grants and comments
-- ---------------------------------------------------------------------------
revoke all on function api.manager_card_status() from public, anon, authenticated, service_role;
grant execute on function api.manager_card_status() to anon, authenticated, service_role;
revoke all on function api.get_my_manager_card() from public, anon, authenticated, service_role;
grant execute on function api.get_my_manager_card() to authenticated, service_role;
revoke all on function api.get_manager_cards(uuid[]) from public, anon, authenticated, service_role;
grant execute on function api.get_manager_cards(uuid[]) to authenticated, service_role;
revoke all on function api.get_my_manager_card_history(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.get_my_manager_card_history(uuid, integer, integer)
  to authenticated, service_role;
revoke all on function api.ack_manager_card_moments(text[])
  from public, anon, authenticated, service_role;
grant execute on function api.ack_manager_card_moments(text[]) to authenticated, service_role;

comment on function api.manager_card_status() is
  'Whether the Manager Card section is on: {enabled, minRated, minConfirmed}, numbers null while off. Granted to anon too; reads no caller, no step-up, never raises. Off means the switch is off or the active rules row is not usable. Display only.';
comment on function api.get_my_manager_card() is
  'The caller''s Manager Card for the current Fantasy season: {available:true, card} (card null without a team this season), or {available:false} while off. Signed-in, step-up. Display only.';
comment on function api.get_manager_cards(uuid[]) is
  'Member cards for up to 100 distinct Fantasy team ids, in the order first asked: {available:true, cards}, or {available:false} while off. A team with no card row is a forming card; unknown teams and deleted-pending profiles are left out. Signed-in, step-up. Display only.';
comment on function api.get_my_manager_card_history(uuid, integer, integer) is
  'The caller''s card history for a season (default the current one), newest gameweek first, keyset by sequence (limit 1..50): {available:true, items, nextBeforeSeq}, or {available:false} while off. Signed-in, step-up. Display only.';
comment on function api.ack_manager_card_moments(text[]) is
  'Records Manager Card moments as seen (1..16 well-formed keys): {acknowledged, ignored}. While off everything is ignored and nothing is written. Only moments derivable now are recorded. Signed-in, step-up. Display only.';

notify pgrst, 'reload schema';
$bg_20261010120200_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261010120300',
  'manager_card_health',
  array[$bg_20261010120300_file$-- BG-0158 P3: the `manager_card` health check.
--
-- Once the card's compute is switched on, the one silent failure that matters
-- is "a finished gameweek never got its cards". This adds a check named
-- `manager_card` to app_private.ops_health_checks(), last, like
-- `account_deletion` (20261006143700): warn after 2 hours, fail (which pages
-- the owner through ops-alert-tick) after 12 hours. The waiting-gameweek
-- warning and failure apply only while compute is on and the active rules are
-- usable. Counts only; no user id.
--
-- How long a gameweek has waited starts at the latest of: its post-work
-- completion, the active rules row's creation, and the last settings change
-- (the compute switch). Otherwise switching compute on, or activating a new
-- rules version, would make every old finished gameweek look 12 hours late at
-- once and page the owner for a backlog the tick has not yet had a chance to
-- clear. While the last tick (within 30 minutes) reported more_pending it is
-- still catching up, so the check warns and does not fail. Gameweeks of
-- cancelled Fantasy seasons are skipped, as the tick skips them.
--
-- scripts/ops/watchdog.ts REQUIRED_DATABASE_CHECKS does not list it until
-- production has this migration.

alter function app_private.ops_health_checks() rename to ops_health_checks_before_manager_card;

create function app_private.manager_card_health()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_compute boolean;
  v_read boolean;
  v_usable boolean;
  v_version integer;
  v_stale integer;
  v_oldest timestamptz;
  v_since timestamptz;
  v_catching_up boolean;
  v_errors integer;
  v_status text;
  v_detail text;
begin
  select s.compute_enabled, s.read_enabled, s.updated_at into v_compute, v_read, v_since
  from app_private.manager_card_settings s where s.id;
  v_compute := coalesce(v_compute, false);
  v_read := coalesce(v_read, false);
  select r.version, r.usable into v_version, v_usable from app_private.manager_card_active_rules() r;
  v_usable := coalesce(v_usable, false);
  v_since := greatest(
    v_since,
    (select r.created_at from app_private.manager_card_rules r where r.version = v_version));
  select coalesce(bool_and(l.outcome = 'more_pending'), false) into v_catching_up
  from (
    select x.outcome from app_private.manager_card_job_log x
    where x.started_at > statement_timestamp() - interval '30 minutes'
    order by x.id desc limit 1
  ) l;

  select count(*), min(greatest(work.completed_at, v_since)) into v_stale, v_oldest
  from app.fantasy_gameweeks gw
  join app.fantasy_seasons season on season.id = gw.fantasy_season_id and season.status <> 'cancelled'
  join app_private.fantasy_gameweek_postwork work
    on work.gameweek_id = gw.id and work.calculation_version = gw.scoring_input_version
    and work.completed_at is not null
  where gw.status in ('finalized', 'corrected') and gw.points_state = 'final'
    and v_version is not null
    and not exists (
      select 1 from app_private.manager_card_evaluations ev
      where ev.gameweek_id = gw.id and ev.scoring_input_version = gw.scoring_input_version
        and ev.rules_version = v_version);

  select count(*) into v_errors
  from app_private.manager_card_job_log l
  where l.outcome = 'error' and l.started_at > statement_timestamp() - interval '24 hours';

  if not v_compute and not v_read then
    v_status := 'ok';
    v_detail := 'switched off';
  elsif v_read and not v_usable then
    v_status := 'warn';
    v_detail := 'reads on but no usable rules: the section answers off';
  elsif v_compute and not v_usable then
    v_status := 'warn';
    v_detail := 'compute on but no usable rules';
  elsif v_read and not v_compute then
    v_status := 'warn';
    v_detail := 'reads on, compute off: cards frozen';
  elsif v_compute and v_stale > 0 and not v_catching_up
    and v_oldest < statement_timestamp() - interval '12 hours' then
    v_status := 'fail';
    v_detail := v_stale || ' finished gameweek(s) waiting for their cards for more than 12 hours';
  elsif v_compute and v_stale > 0 and v_oldest < statement_timestamp() - interval '2 hours' then
    v_status := 'warn';
    v_detail := v_stale || ' finished gameweek(s) waiting for their cards for more than 2 hours';
  elsif v_errors > 0 then
    v_status := 'warn';
    v_detail := v_errors || ' tick error(s) in the last 24 hours';
  else
    v_status := 'ok';
    v_detail := 'cards current under rules v' || coalesce(v_version::text, '?');
  end if;

  return jsonb_build_object('name', 'manager_card', 'status', v_status, 'detail', v_detail);
end;
$$;

comment on function app_private.manager_card_health() is
  'The manager_card health check: ok / warn / fail with counts only. Fails (and pages) when compute is on, the rules are usable and a finished gameweek has waited more than 12 hours for its cards (counted from the latest of its completion, the rules row and the switch, and not while the tick reports more_pending); warns after 2 hours. Skips cancelled seasons. No grant.';

create function app_private.ops_health_checks()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result jsonb := app_private.ops_health_checks_before_manager_card();
  checks jsonb := coalesce(result -> 'checks', '[]'::jsonb) || app_private.manager_card_health();
begin
  return result || jsonb_build_object(
    'status', case
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'fail') then 'fail'
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'warn') then 'warn'
      else 'ok' end,
    'checks', checks);
end;
$$;

revoke all on function
  app_private.ops_health_checks(),
  app_private.ops_health_checks_before_manager_card(),
  app_private.manager_card_health()
from public, anon, authenticated, service_role;
grant execute on function
  app_private.ops_health_checks(),
  app_private.ops_health_checks_before_manager_card()
to postgres;
$bg_20261010120300_file$]
);

-- ---------------------------------------------------------------------------
-- Run them, in order, from the history once each is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261010120000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261010120000'
  );
  part_20261010120100 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261010120100'
  );
  part_20261010120200 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261010120200'
  );
  part_20261010120300 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261010120300'
  );
begin
  if encode(sha256(convert_to(part_20261010120000, 'UTF8')), 'hex')
    is distinct from '3201060010af0e41bd0b5f1878db92471d5b737f3d3f85a03879b33ce840c00c' then
    raise exception 'stop: 20261010120000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261010120100, 'UTF8')), 'hex')
    is distinct from 'ffa54adb02cb1ad6126ea45cd2ee076651acc3b19f9a64541b10a50988e28d6b' then
    raise exception 'stop: 20261010120100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261010120200, 'UTF8')), 'hex')
    is distinct from 'd1336625f45a8c89a598f2cb0a4a9ffc355ffcb398a54be11985e0fb34fbaf46' then
    raise exception 'stop: 20261010120200 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261010120300, 'UTF8')), 'hex')
    is distinct from '7af53eb9008ba8d6e08c63a5235e89d94d133996c005b3c58db1ca77828ba1b1' then
    raise exception 'stop: 20261010120300 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261010120000;
  execute part_20261010120100;
  execute part_20261010120200;
  execute part_20261010120300;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn text;
  who text;
  tbl text;
  rec record;
  base jsonb := current_setting('botolago.mc_baseline')::jsonb;
  checks jsonb;
  health jsonb;
begin
  -- The five api functions: exactly the reviewed roles, never PUBLIC.
  foreach fn in array array[
    'api.manager_card_status()',
    'api.get_my_manager_card()',
    'api.get_manager_cards(uuid[])',
    'api.get_my_manager_card_history(uuid,integer,integer)',
    'api.ack_manager_card_moments(text[])'
  ] loop
    if to_regprocedure(fn) is null then
      problems := problems || (fn || ' is missing');
      continue;
    end if;
    foreach who in array array['authenticated', 'service_role'] loop
      if not has_function_privilege(who, to_regprocedure(fn), 'execute') then
        problems := problems || (who || ' cannot run ' || fn);
      end if;
    end loop;
    if has_function_privilege('public', to_regprocedure(fn), 'execute') then
      problems := problems || ('public can run ' || fn);
    end if;
    if fn = 'api.manager_card_status()' then
      if not has_function_privilege('anon', to_regprocedure(fn), 'execute') then
        problems := problems || ('anon cannot run ' || fn);
      end if;
    elsif has_function_privilege('anon', to_regprocedure(fn), 'execute') then
      problems := problems || ('anon can run ' || fn);
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname like '%manager\_card%') <> 5 then
    problems := problems || 'the api schema does not hold exactly five Manager Card functions'::text;
  end if;

  -- What the contract no longer uses is gone.
  foreach fn in array array[
    'api.get_manager_card(uuid)',
    'api.get_my_manager_card_history(integer,integer)',
    'app_private.manager_card_json(uuid,uuid)',
    'app_private.manager_card_current_season(uuid)'
  ] loop
    if to_regprocedure(fn) is not null then problems := problems || (fn || ' still exists'); end if;
  end loop;

  -- The acknowledgements table: forced row security, no API right, the guard
  -- trigger, empty.
  if to_regclass('app.manager_card_moment_acks') is null then
    problems := problems || 'app.manager_card_moment_acks is missing'::text;
  else
    if not (select c.relrowsecurity and c.relforcerowsecurity
      from pg_class c where c.oid = 'app.manager_card_moment_acks'::regclass) then
      problems := problems || 'row security is not forced on app.manager_card_moment_acks'::text;
    end if;
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_any_column_privilege(who, 'app.manager_card_moment_acks'::regclass, 'select,insert,update,references')
        or has_table_privilege(who, 'app.manager_card_moment_acks'::regclass, 'delete,truncate,trigger') then
        problems := problems || (who || ' has a right on app.manager_card_moment_acks');
      end if;
    end loop;
    if not exists (select 1 from pg_trigger t
      where t.tgrelid = 'app.manager_card_moment_acks'::regclass
        and t.tgname = 'manager_card_moment_acks_refuse_unverified_mfa_actor' and not t.tgisinternal) then
      problems := problems || 'the acknowledgements guard trigger is missing'::text;
    end if;
    if exists (select 1 from app.manager_card_moment_acks) then
      problems := problems || 'app.manager_card_moment_acks is not empty'::text;
    end if;
  end if;

  -- Every Manager Card function in app_private: no API role.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname like '%manager\_card%'
  loop
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, rec.oid, 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
  end loop;

  -- Every Manager Card table: no right for any API role, row security forced.
  foreach tbl in array array[
    'app.manager_cards', 'app.manager_card_seasons', 'app.manager_card_gameweeks',
    'app_private.manager_card_settings', 'app_private.manager_card_rules',
    'app_private.manager_card_retired_serials', 'app_private.manager_card_evaluations',
    'app_private.manager_card_job_log'
  ] loop
    foreach who in array array['anon', 'authenticated', 'service_role'] loop
      if has_any_column_privilege(who, tbl::regclass, 'select,insert,update,references')
        or has_table_privilege(who, tbl::regclass, 'delete,truncate,trigger') then
        problems := problems || (who || ' has a right on ' || tbl);
      end if;
    end loop;
    if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid = tbl::regclass) then
      problems := problems || ('row security is not forced on ' || tbl);
    end if;
  end loop;

  -- Off is an answer.
  if api.manager_card_status() is distinct from
    '{"enabled": false, "minRated": null, "minConfirmed": null}'::jsonb then
    problems := problems || ('the status answered ' || coalesce(api.manager_card_status()::text, 'nothing'));
  end if;

  -- The health check is last; ok while compute is off.
  checks := app_private.ops_health_checks() -> 'checks';
  health := checks -> (jsonb_array_length(checks) - 1);
  if health ->> 'name' is distinct from 'manager_card' then
    problems := problems || 'the manager_card health check is not the last check'::text;
  elsif current_setting('botolago.mc_compute') = 'false' and health ->> 'status' is distinct from 'ok' then
    problems := problems || ('the manager_card health check answered ' || coalesce(health::text, 'nothing'));
  end if;

  -- Nothing else moved: switches, rules and every card table as the preflight read them.
  if exists (select 1 from app_private.manager_card_settings where read_enabled)
    or (select compute_enabled::text from app_private.manager_card_settings) is distinct from current_setting('botolago.mc_compute')
    or (select count(*) from app_private.manager_card_settings) <> 1 then
    problems := problems || 'a Manager Card switch changed'::text;
  end if;
  if (select count(*) from app_private.manager_card_rules) <> (base ->> 'rules')::bigint
    or (select count(*) from app.manager_cards) <> (base ->> 'cards')::bigint
    or (select count(*) from app.manager_card_seasons) <> (base ->> 'seasons')::bigint
    or (select count(*) from app.manager_card_gameweeks) <> (base ->> 'gameweeks')::bigint
    or (select count(*) from app_private.manager_card_evaluations) <> (base ->> 'evaluations')::bigint
    or (select count(*) from app_private.manager_card_job_log) <> (base ->> 'jobs')::bigint
    or (select count(*) from app_private.manager_card_retired_serials) <> (base ->> 'retired')::bigint then
    problems := problems || 'a Manager Card row count changed'::text;
  end if;

  -- All nine migrations are in the history.
  if (select count(*) from supabase_migrations.schema_migrations
    where version in ('20261008123000', '20261008123100', '20261008123200', '20261008123300', '20261008123400', '20261010120000', '20261010120100', '20261010120200', '20261010120300')) <> 9 then
    problems := problems || 'a history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'manager card read API: five functions with the reviewed grants, old ones dropped, acknowledgements table locked and empty, status answers off, health check last, switches and rows unchanged';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261010120000')
    then 'Applied. The Gradins read API is in place and reads are still OFF. Next: docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
