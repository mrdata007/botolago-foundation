-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Manager Card: install RULES V3 ("week one"), owner decisions 2026-10-12.
--
-- WHAT IT DOES, in one transaction
--   1. Records and applies migration 20261012200100 (manager_card_week_one)
--      with the exact reviewed text. It replaces
--        app_private.manager_card_evaluate_gameweek   (two optional rules keys,
--                                                     rating changes recorded,
--                                                     their notification)
--        api.get_my_manager_card                      (adds card.ovrChanges)
--        api.ack_manager_card_moments                 (accepts ovr_up:/ovr_down: keys)
--        app_private.notification_push_topic / _ttl   (know the new type)
--      and adds app.manager_card_ovr_changes, the switch column
--      manager_card_settings.notify_ovr_changes (OFF) with
--      app_private.manager_card_notify_configure, the helpers
--      app_private.manager_card_notify_ovr_changes and
--      app_private.manager_card_ovr_moments, four notification templates
--      (up/down, French/Arabic), and widens the acknowledgement key check.
--      A rules row without the new keys (v1, v2) gives exactly the figures it
--      gave before.
--   2. Inserts rules version 3 and makes it the one active row (version 2 goes
--      inactive; rows are never edited):
--         minimum_gameweeks            2 -> 1   (a card is rated from week 1)
--         ovr_min_stats                (new) 1  (OVR from the stats that exist)
--         empty_stat_neutral           (new) true (a stat with no sample reads 50)
--         cap_ignore_deadlines_before  removed  (CAP counts every week, the
--                                               captain the builder gave
--                                               before PR #376 included)
--      Everything else is v2 (the script refuses otherwise): provisional below
--      5 weeks, the scales, the shrinkage k = 4, Selection on the picked eleven.
--   Compute stays OFF, the tick stays paused, and the notification switch stays
--   OFF: this script switches nothing on. Once the tick runs again it
--   recomputes EVERY finished gameweek under v3, a few per tick; that
--   recalculation records no rating change and sends no notification (a switch
--   of rules version is not a change of rating).
--
-- ORDER
--   1. apply-manager-card-rules-v2-calm.sql                 committed (20261012170000, rules v2)
--   2. apply-20261012200000-manager-card-ovr-change-type.sql committed (the type)
--   3. THIS SCRIPT
--   Steps 1 and 3 can be run back to back while the tick is paused: the tick
--   then recalculates once, under v3.
--
-- BEFORE (AGENTS.md "One writer at a time": this is a database write)
--   a. The pull request is merged and its database-quality job passed.
--   b. Read and note the switches, then pause the card's writers:
--        select compute_enabled, read_enabled, notify_ovr_changes from app_private.manager_card_settings;
--          (notify_ovr_changes does not exist yet: read the first two)
--        select app_private.manager_card_configure(false, null);
--        select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-tick'), active := false);
--      Wait until no manager-card-tick run is in progress (the script checks it).
--   c. Push must be off (it is until the phone app exists):
--        select mode from app_private.notification_push_settings;   -- 'off'
--      This script replaces two functions the push claim reads.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Paste this WHOLE file and press Run. As shipped it ends in
--      ROLLBACK. Read the last result row. Confirm independently that nothing
--      was kept:
--        select count(*) from supabase_migrations.schema_migrations where version = '20261012200100';   -- 0
--        select version, active from app_private.manager_card_rules order by version;                  -- v2 active
--   2. Change ONLY the final `rollback;` to `commit;` and run it once.
--   3. Read it back: one 20261012200100 row, three rules rows, v3 the only active one.
--   4. Restore the writers right away, exactly as they were:
--        select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-tick'), active := true);
--        select app_private.manager_card_configure(true, null);   -- only if compute was on before
--      The notification stays off until the owner turns it on:
--        select app_private.manager_card_notify_configure(true);
--   If any check fails the script stops with a message and nothing is saved. Do
--   not edit a check to make it pass.
--
-- WHAT IT CHECKS
--   Before: 20261012200100 is absent, 20261012170000 and 20261012200000 are
--   recorded and the new type exists; each function it replaces is byte for
--   byte the reviewed one (md5 of its body); none of what it adds exists yet;
--   exactly two rules rows, v1 inactive and v2 active, and the pasted v3 differs
--   from v2 only where intended; compute is off, the tick job is paused and
--   idle, no card statement is running, push is off, and the card's lock is
--   free. After applying: the migration text is the reviewed bytes (sha256,
--   checked before it runs); every new or replaced body is the reviewed one
--   (md5); owners, security definer, empty search_path and grants as reviewed;
--   the new table is closed. After inserting: three rows, v3 the only active
--   one, v1 and v2 unchanged; every key present with the right type and no
--   unknown key; compute and the notification are still off, the tick answers
--   {"outcome":"off"} and nothing was written to the card.
-- ============================================================================
begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  -- ==========================================================================
  -- The v3 config: version 2 with the intended changes. A JSON object.
  -- ==========================================================================
  config_text text := $rules_v3_config${"minimum_gameweeks":1,"provisional_below":5,"trf_window_gameweeks":3,"batch_size":2000,"scales":{"cap":[[0,1],[1,99]],"sel":[[0.5,1],[0.8,50],[1,99]],"trf":[[-10,1],[0,50],[10,99]],"con":[[0,1],[1,99]]},"tiers":{"stade":50,"pro":65,"champion":80,"legend":90},"shrinkage":{"cap":4,"sel":4,"con":4,"trf":4},"sel_numerator":"picked_starters","ovr_min_stats":1,"empty_stat_neutral":true}$rules_v3_config$;
  -- ==========================================================================
  cfg jsonb;
  v1 jsonb;
  v2 jsonb;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261012200100') then
    raise exception 'stop: migration 20261012200100 is already recorded -- was this script already applied?';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version in ('20261008123000', '20261008123100', '20261008123200', '20261008123300', '20261008123400',
        '20261010120000', '20261010120100', '20261010120200', '20261010120300', '20261012170000')) <> 10 then
    raise exception 'stop: the Manager Card migrations up to 20261012170000 (rules v2) are not all recorded -- run apply-manager-card-rules-v2-calm.sql first';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261012200000')
    or not exists (select 1 from pg_enum e where e.enumtypid = 'app.notification_type'::regtype
      and e.enumlabel = 'manager_card_ovr_change') then
    raise exception 'stop: the notification type manager_card_ovr_change is not saved -- run apply-20261012200000-manager-card-ovr-change-type.sql with commit first';
  end if;

  -- The functions this replaces are exactly the reviewed ones.
  if md5((select prosrc from pg_proc where oid = 'app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure))
      is distinct from '02c36e056d098d66d4575502e97a54dc' then
    raise exception 'stop: manager_card_evaluate_gameweek is not the reviewed version (20261012170000) this script replaces';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.get_my_manager_card()'::regprocedure))
      is distinct from 'be618187afacc75a675070acda9271b7' then
    raise exception 'stop: api.get_my_manager_card is not the reviewed version (20261010120200) this script replaces';
  end if;
  if md5((select prosrc from pg_proc where oid = 'api.ack_manager_card_moments(text[])'::regprocedure))
      is distinct from '5da42fa04d60fe4b9f31b6b2ec793a59' then
    raise exception 'stop: api.ack_manager_card_moments is not the reviewed version (20261010120200) this script replaces';
  end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.notification_push_topic(text)'::regprocedure))
      is distinct from '030491f4eec5a434d803cef80c4b02b5' then
    raise exception 'stop: notification_push_topic is not the reviewed version (20261005135000) this script replaces';
  end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.notification_push_ttl(text)'::regprocedure))
      is distinct from '0d63d4c0f4def67d3ee9d9f3f1ac0441' then
    raise exception 'stop: notification_push_ttl is not the reviewed version (20261005135000) this script replaces';
  end if;
  -- None of what it adds exists yet.
  if to_regclass('app.manager_card_ovr_changes') is not null
    or to_regprocedure('app_private.manager_card_notify_configure(boolean)') is not null
    or to_regprocedure('app_private.manager_card_notify_ovr_changes(uuid)') is not null
    or to_regprocedure('app_private.manager_card_ovr_moments(uuid)') is not null
    or exists (select 1 from information_schema.columns where table_schema = 'app_private'
      and table_name = 'manager_card_settings' and column_name = 'notify_ovr_changes')
    or exists (select 1 from app.notification_templates
      where template_key in ('manager_card_ovr_up', 'manager_card_ovr_down')) then
    raise exception 'stop: part of migration 20261012200100 already exists -- find out why before going on';
  end if;

  -- The writers are paused and drained.
  if not exists (select 1 from app_private.manager_card_settings) then
    raise exception 'stop: the Manager Card settings row is missing';
  end if;
  if exists (select 1 from app_private.manager_card_settings where compute_enabled) then
    raise exception 'stop: compute is switched on -- pause it first: select app_private.manager_card_configure(false, null);';
  end if;
  if not exists (select 1 from cron.job where jobname = 'manager-card-tick') then
    raise exception 'stop: the manager-card-tick job does not exist';
  end if;
  if exists (select 1 from cron.job where jobname = 'manager-card-tick' and active) then
    raise exception 'stop: the manager-card-tick job is active -- pause it: select cron.alter_job((select jobid from cron.job where jobname = ''manager-card-tick''), active := false);';
  end if;
  if exists (
    select 1 from cron.job_run_details run join cron.job job on job.jobid = run.jobid
    where job.jobname = 'manager-card-tick' and run.status not in ('succeeded', 'failed')
  ) then
    raise exception 'stop: a manager-card-tick run is still in progress -- wait for it to finish';
  end if;
  if exists (
    select 1 from pg_stat_activity
    where pid <> pg_backend_pid() and state = 'active' and query ~* 'manager_card'
  ) then
    raise exception 'stop: a statement mentioning the Manager Card is running -- wait for it to finish';
  end if;
  if exists (select 1 from app_private.notification_push_settings where mode <> 'off') then
    raise exception 'stop: push is switched on -- this script replaces two functions the push claim reads; pause it first: select app_private.notification_push_configure(''off'');';
  end if;
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0)) then
    raise exception 'stop: a Manager Card calculation holds the card lock';
  end if;

  -- The rules: v1 inactive, v2 active; the pasted v3 differs from v2 only where intended.
  if (select count(*) from app_private.manager_card_rules) <> 2
    or not exists (select 1 from app_private.manager_card_rules where version = 1 and not active)
    or not exists (select 1 from app_private.manager_card_rules where version = 2 and active) then
    raise exception 'stop: expected exactly two rules rows, version 1 inactive and version 2 active';
  end if;
  select config into v1 from app_private.manager_card_rules where version = 1;
  select config into v2 from app_private.manager_card_rules where version = 2;
  if v2 ?| array['ovr_min_stats', 'empty_stat_neutral'] then
    raise exception 'stop: rules v2 already carries a v3 key';
  end if;

  if left(btrim(config_text), 1) <> '{' then
    raise exception 'stop: the rules config is not a JSON object';
  end if;
  begin
    cfg := config_text::jsonb;
  exception when others then
    raise exception 'stop: the rules config is not valid JSON (%)', sqlerrm;
  end;
  if jsonb_typeof(cfg) is distinct from 'object' then
    raise exception 'stop: the rules config must be one JSON object';
  end if;
  -- Only the intended differences: minimum_gameweeks, the two new keys, and no CAP cut-off.
  if (cfg - 'minimum_gameweeks' - 'ovr_min_stats' - 'empty_stat_neutral')
    is distinct from (v2 - 'minimum_gameweeks' - 'cap_ignore_deadlines_before') then
    raise exception 'stop: the v3 config differs from the stored rules v2 in more than the intended keys -- find out why before going on';
  end if;

  perform set_config('manager_card.rules_v3_config', cfg::text, true);
  perform set_config('manager_card.rules_v1_before', v1::text, true);
  perform set_config('manager_card.rules_v2_before', v2::text, true);
  perform set_config('manager_card.card_before', concat_ws('#',
    (select count(*) from app.manager_cards), (select count(*) from app.manager_card_seasons),
    (select count(*) from app.manager_card_gameweeks), (select count(*) from app_private.manager_card_evaluations),
    (select count(*) from app_private.manager_card_job_log),
    (select count(*) from app_private.notification_events), (select count(*) from app.notifications)), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migration: recorded with the exact reviewed text, then executed
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261012200100', 'manager_card_week_one', array[$migration$-- Manager Card "week one", migration 2 of 2 (the type is 20261012200000).
-- Owner decisions 2026-10-12: "Everything counts from week 1; every time the
-- rating goes up or down there's a notification saying your score went up /
-- went down, and it shows as an animation when the user opens the app and
-- checks the card." Then: CAP, SEL, TRF and CON each have a number from a
-- manager's first finished gameweek, and OVR is built from all four.
-- Calculation and display only: no Fantasy point, rule, price or lineup is
-- touched, and the card stays display only.
--
-- WHAT
--
--   1. app_private.manager_card_evaluate_gameweek(uuid, integer) is replaced.
--      Its body is that of 20261012170000 with these changes only:
--        a. two optional rules keys, read after the shrinkage:
--             ovr_min_stats       1..4, default 3: OVR is the rounded mean of
--                                 the stats that exist when at least this many
--                                 do (rules v1 and v2: three of four);
--             empty_stat_neutral  boolean, default false: a stat with no
--                                 sample yet (no transfer judged, no CAP week,
--                                 every week Bench Boost) reads 50, the value
--                                 the shrinkage gives at n = 0, instead of
--                                 staying empty, once the team is past the
--                                 minimum. Its raw figure stays null.
--           A present but malformed key is manager_card_rules_invalid.
--        b. the rating change of each team at the gameweek is read before its
--           history row is written and recorded in app.manager_card_ovr_changes
--           after it (see 3);
--        c. the notification of those changes is created (see 4), inside its
--           own sub-transaction so that a failure there never costs the card
--           its figures.
--      Week one itself needs no code: rules v3 sets minimum_gameweeks 1 and
--      leaves cap_ignore_deadlines_before out, so CAP counts every week,
--      including those whose captain the squad builder assigned by default
--      before PR #376. The database has no per-week fact telling a default
--      captain from a chosen one (before #376 the builder saved its default
--      armband as an ordinary captain row), so a key to skip only default
--      captains would have nothing reliable to read and is not offered.
--
--   2. app.manager_card_ovr_changes: one row per manager and gameweek whose
--      OVR differs from the previous evaluated OVR (the latest earlier history
--      row of the season), with both values and tiers. A change is recorded
--      only when both OVRs exist and the earlier row is under the same rules
--      version, and this gameweek's own row is new or already under it. So
--      the first OVR a card ever gets is no change (that is the existing
--      first_rating moment), and the recalculation a NEW rules version starts
--      (every history row still under the old one) records none: switching
--      versions never reads as the card moving. A later recalculation under
--      the same version (a scoring correction) updates or removes the row.
--
--   3. Moments. The card's existing moments (app_private.manager_card_moments)
--      are untouched; the change moments come from the new helper
--      app_private.manager_card_ovr_moments, keyed ovr_up:<gameweek id> or
--      ovr_down:<gameweek id>. Only the latest change of the current season
--      under the card's rules, whose new OVR is still the card's OVR and not
--      yet acknowledged, is pending. api.get_my_manager_card adds one key to
--      the card, ovrChanges (the pending ones, zero or one), and changes
--      nothing else; a front end that does not know the key ignores it (zod
--      drops unknown keys). api.ack_manager_card_moments accepts the two new
--      key shapes (and the table's key check is widened to match), so a
--      change animates once, on one device, and never again on another.
--
--   4. Notification "manager_card_ovr_change" (category fantasy), in-app and
--      push, through the existing tables: one event per manager and gameweek
--      (deduplication key manager_card:ovr_change:<user>:<gameweek>), one
--      notification, its in-app delivery, and a push delivery per working
--      phone when the reader has push on (the push claim sends it only while
--      the push switch is on). It goes to readers with notifications, in-app
--      notifications and Fantasy reminders on (the switch that already covers
--      Fantasy messages; turning it off is the opt-out), not deleted. Quiet
--      hours move its available_at, as everywhere else. Text in French and
--      Arabic (four templates: up and down in each language). No email: the
--      free email plan is kept for the moments that need it. Only the
--      season's latest finished gameweek is told: a correction of an older
--      week is not news. The push rules learn the type (topic "fantasy", life
--      12 hours).
--      SHIPS OFF: app_private.manager_card_settings gains notify_ovr_changes,
--      false, changed only by app_private.manager_card_notify_configure. While
--      off, changes are still recorded (the animation needs them) but no
--      notification is created, and none is created later for them.
--
-- COMPATIBILITY. A rules row without ovr_min_stats and empty_stat_neutral
-- (v1, v2) produces exactly the figures it produced before; the pgTAP file
-- manager_card_week_one.test.sql checks v1 and v2 against their stored
-- figures under this body. The signature, security definer, search_path,
-- owner and grants of the replaced functions are kept (create or replace
-- keeps owner and grants). Installed by
-- scripts/backend/apply-manager-card-rules-v3-week-one.sql after
-- scripts/backend/apply-20261012200000-manager-card-ovr-change-type.sql.

-- ---------------------------------------------------------------------------
-- The switch for the notification (off)
-- ---------------------------------------------------------------------------
alter table app_private.manager_card_settings
  add column notify_ovr_changes boolean not null default false;
comment on column app_private.manager_card_settings.notify_ovr_changes is
  'Whether a rating change creates a notification (manager_card_ovr_change). Off by default; changed only by app_private.manager_card_notify_configure. Changes are recorded either way.';

create function app_private.manager_card_notify_configure(p_enabled boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare result app_private.manager_card_settings%rowtype;
begin
  if p_enabled is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  update app_private.manager_card_settings set
    notify_ovr_changes = p_enabled,
    updated_at = statement_timestamp()
  where id
  returning * into result;
  return jsonb_build_object('notifyOvrChanges', result.notify_ovr_changes);
end;
$$;
revoke all on function app_private.manager_card_notify_configure(boolean)
  from public, anon, authenticated, service_role;
grant execute on function app_private.manager_card_notify_configure(boolean) to postgres;
comment on function app_private.manager_card_notify_configure(boolean) is
  'Owner-run switch for the rating-change notification of the Manager Card (true or false). Executable by postgres only.';

-- ---------------------------------------------------------------------------
-- The rating changes
-- ---------------------------------------------------------------------------
create table app.manager_card_ovr_changes (
  user_id uuid not null references app.profiles(id) on delete cascade,
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete cascade,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete cascade,
  rules_version integer not null,
  from_ovr smallint not null,
  to_ovr smallint not null,
  from_tier text,
  to_tier text,
  notified_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint manager_card_ovr_changes_pkey primary key (user_id, gameweek_id),
  constraint manager_card_ovr_changes_values_check check (
    from_ovr between 1 and 99 and to_ovr between 1 and 99 and from_ovr <> to_ovr
  ),
  constraint manager_card_ovr_changes_tier_check check (
    (from_tier is null or from_tier in ('homa', 'stade', 'pro', 'champion', 'legend'))
    and (to_tier is null or to_tier in ('homa', 'stade', 'pro', 'champion', 'legend'))
  ),
  constraint manager_card_ovr_changes_rules_version_check check (rules_version > 0)
);
create index manager_card_ovr_changes_gameweek_idx on app.manager_card_ovr_changes (gameweek_id);
create index manager_card_ovr_changes_season_idx on app.manager_card_ovr_changes (fantasy_season_id);
alter table app.manager_card_ovr_changes enable row level security;
alter table app.manager_card_ovr_changes force row level security;
revoke all on app.manager_card_ovr_changes from public, anon, authenticated, service_role;
comment on table app.manager_card_ovr_changes is
  'Manager Card rating changes: one row per manager and gameweek whose OVR differs from the previous evaluated OVR under the same rules version. Written only by app_private.manager_card_evaluate_gameweek; read by the moments and the notification. Display only. Row security forced, no policy, no grant. Cascades from the profile, the season and the gameweek.';

-- The acknowledgement keys gain ovr_up:<gameweek id> and ovr_down:<gameweek id>.
alter table app.manager_card_moment_acks
  drop constraint manager_card_moment_acks_key_check;
alter table app.manager_card_moment_acks
  add constraint manager_card_moment_acks_key_check check (
    char_length(moment_key) <= 80 and moment_key ~ (
      '^(card_created|founder_granted|tier_changed:(stade|pro|champion|legend)|'
      || '(first_rating|provisional_cleared|season_closed|season_started|ovr_up|ovr_down):'
      || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
  );

-- ---------------------------------------------------------------------------
-- The text, French and Arabic. No AI notice, no model credit.
-- ---------------------------------------------------------------------------
insert into app.notification_templates (
  template_key, notification_type, category, channel, language, version,
  title_template, body_template, required_variables, max_title_length,
  max_body_length, active, activated_at
) values
  ('manager_card_ovr_up', 'manager_card_ovr_change', 'fantasy', 'in_app', 'fr', 1,
    'Votre note Curva monte à {{ovr}} (+{{delta}}) 📈',
    'Journée {{gameweek}} : ouvrez votre carte Curva pour voir ce qui a bougé.',
    array['ovr', 'delta', 'gameweek'], 120, 300, true, statement_timestamp()),
  ('manager_card_ovr_up', 'manager_card_ovr_change', 'fantasy', 'in_app', 'ar', 1,
    'تقييمك في كورفا يرتفع إلى {{ovr}} (+{{delta}}) 📈',
    'الجولة {{gameweek}}: افتح بطاقتك في كورفا لترى ما الذي تغيّر.',
    array['ovr', 'delta', 'gameweek'], 120, 300, true, statement_timestamp()),
  ('manager_card_ovr_down', 'manager_card_ovr_change', 'fantasy', 'in_app', 'fr', 1,
    'Votre note Curva descend à {{ovr}} (−{{delta}})',
    'Journée {{gameweek}} : ouvrez votre carte Curva pour voir ce qui a bougé.',
    array['ovr', 'delta', 'gameweek'], 120, 300, true, statement_timestamp()),
  ('manager_card_ovr_down', 'manager_card_ovr_change', 'fantasy', 'in_app', 'ar', 1,
    'تقييمك في كورفا ينخفض إلى {{ovr}} (−{{delta}})',
    'الجولة {{gameweek}}: افتح بطاقتك في كورفا لترى ما الذي تغيّر.',
    array['ovr', 'delta', 'gameweek'], 120, 300, true, statement_timestamp());

-- ---------------------------------------------------------------------------
-- The push rules learn the type: a Fantasy message (the Fantasy reminders
-- switch), worth sending for 12 hours (quiet hours included). Otherwise the
-- bodies of 20261005135000.
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_push_topic(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'match_starting' then 'match'
    when 'goal' then 'match'
    when 'goal_cancelled' then 'match'
    when 'full_time' then 'match'
    when 'followed_team_result' then 'match'
    when 'deadline_24h' then 'fantasy'
    when 'deadline_1h' then 'fantasy'
    when 'manager_card_ovr_change' then 'fantasy'
    else null
  end;
$$;

create or replace function app_private.notification_push_ttl(p_type text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'goal' then interval '10 minutes'
    when 'goal_cancelled' then interval '10 minutes'
    when 'match_starting' then interval '20 minutes'
    when 'full_time' then interval '30 minutes'
    when 'followed_team_result' then interval '30 minutes'
    when 'deadline_1h' then interval '30 minutes'
    when 'deadline_24h' then interval '2 hours'
    when 'manager_card_ovr_change' then interval '12 hours'
    else interval '1 hour'
  end;
$$;

-- ---------------------------------------------------------------------------
-- The notification of a gameweek's rating changes
-- ---------------------------------------------------------------------------
create function app_private.manager_card_notify_ovr_changes(p_gameweek_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  enabled boolean;
  gw app.fantasy_gameweeks%rowtype;
  change record;
  event_key text;
  new_event uuid;
  template app.notification_templates%rowtype;
  variables jsonb;
  available timestamptz;
  new_notification uuid;
  created integer := 0;
begin
  select s.notify_ovr_changes into enabled from app_private.manager_card_settings s where s.id;
  if not coalesce(enabled, false) or p_gameweek_id is null then
    return 0;
  end if;
  select * into gw from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found then
    return 0;
  end if;
  -- Only the season's latest finished gameweek is news.
  if exists (
    select 1 from app.fantasy_gameweeks later
    where later.fantasy_season_id = gw.fantasy_season_id
      and later.sequence_number > gw.sequence_number
      and later.status in ('finalized', 'corrected')
  ) then
    return 0;
  end if;

  for change in
    select c.user_id, c.from_ovr, c.to_ovr, profile.preferred_language,
      preference.notifications_enabled, preference.in_app_notifications_enabled,
      preference.fantasy_deadline_reminders, preference.push_notifications_enabled,
      preference.notification_timezone, preference.quiet_hours_enabled,
      preference.quiet_hours_start, preference.quiet_hours_end,
      profile.id is not null and profile.deleted_at is null as present
    from app.manager_card_ovr_changes c
    left join app.profiles profile on profile.id = c.user_id
    left join app.user_preferences preference on preference.user_id = c.user_id
    where c.gameweek_id = p_gameweek_id and c.notified_at is null
    order by c.user_id
    for update of c
  loop
    -- Considered once, told or not: a reader who turns the switch on later is
    -- not told of an old week.
    update app.manager_card_ovr_changes set notified_at = statement_timestamp()
    where user_id = change.user_id and gameweek_id = p_gameweek_id;

    if not coalesce(change.present and change.notifications_enabled
        and change.in_app_notifications_enabled and change.fantasy_deadline_reminders, false) then
      continue;
    end if;
    select * into template from app.notification_templates t
    where t.template_key = case when change.to_ovr > change.from_ovr
        then 'manager_card_ovr_up' else 'manager_card_ovr_down' end
      and t.channel = 'in_app' and t.language = change.preferred_language and t.active
    order by t.version desc
    limit 1;
    if not found then
      continue;
    end if;

    event_key := 'manager_card:ovr_change:' || change.user_id || ':' || p_gameweek_id;
    new_event := null;
    insert into app_private.notification_events (
      id, event_type, source_domain, source_entity_id, target_user_id, occurred_at,
      schema_version, deduplication_key, correlation_id, safe_payload, status,
      processing_started_at, completed_at
    ) values (
      gen_random_uuid(), 'manager_card_ovr_change', 'fantasy', p_gameweek_id, change.user_id,
      statement_timestamp(), 1, event_key, p_gameweek_id,
      jsonb_build_object('gameweek', gw.sequence_number, 'fromOvr', change.from_ovr,
        'toOvr', change.to_ovr, 'delta', change.to_ovr - change.from_ovr),
      'completed', statement_timestamp(), statement_timestamp()
    )
    on conflict (deduplication_key) do nothing
    returning id into new_event;
    if new_event is null then
      continue;
    end if;

    variables := jsonb_build_object(
      'ovr', change.to_ovr::text,
      'delta', abs(change.to_ovr - change.from_ovr)::text,
      'gameweek', gw.sequence_number::text);
    available := app_private.defer_for_quiet_hours(
      statement_timestamp(), change.notification_timezone, change.quiet_hours_enabled,
      change.quiet_hours_start, change.quiet_hours_end, false);
    insert into app.notifications (
      user_id, event_id, template_id, notification_type, category, priority, language,
      title, body, deep_link_target, deep_link_entity_id, source_domain, source_entity_id,
      available_at
    ) values (
      change.user_id, new_event, template.id, 'manager_card_ovr_change', template.category,
      'normal', change.preferred_language,
      app_private.render_notification_template(template.title_template, template.required_variables, variables),
      app_private.render_notification_template(template.body_template, template.required_variables, variables),
      'none', null, 'fantasy', p_gameweek_id, available
    )
    on conflict (event_id, user_id) do nothing
    returning id into new_notification;
    if new_notification is null then
      continue;
    end if;
    insert into app.notification_deliveries (
      notification_id, channel, provider_key, status, attempt_count, sent_at, delivered_at
    ) values (new_notification, 'in_app', 'database', 'delivered', 1,
      statement_timestamp(), statement_timestamp());
    -- A push per working phone when the reader has push on; the push claim
    -- sends it only while the push switch allows, and re-checks the reader.
    if change.push_notifications_enabled then
      insert into app.notification_deliveries (
        notification_id, channel, device_registration_id, provider_key, status
      )
      select new_notification, 'push', device.id, device.push_provider::text, 'pending'
      from app.device_registrations device
      join app_private.push_destinations destination on destination.device_registration_id = device.id
      where device.user_id = change.user_id
        and device.enabled and device.invalidated_at is null
        and device.push_provider::text in ('fcm', 'apns')
      on conflict do nothing;
    end if;
    created := created + 1;
  end loop;
  return created;
end;
$$;
revoke all on function app_private.manager_card_notify_ovr_changes(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.manager_card_notify_ovr_changes(uuid) to postgres;
comment on function app_private.manager_card_notify_ovr_changes(uuid) is
  'While notify_ovr_changes is on, creates one manager_card_ovr_change notification (event, in-app delivery, a push delivery per working phone with push on) for each rating change of the gameweek not yet considered, when it is the season''s latest finished gameweek and the reader has notifications, in-app notifications and Fantasy reminders on. Marks every change it considers. Called by manager_card_evaluate_gameweek. Executable by postgres only.';

create or replace function app_private.manager_card_evaluate_gameweek(p_gameweek_id uuid, p_rules_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  gw app.fantasy_gameweeks%rowtype;
  season app.fantasy_seasons%rowtype;
  rules app_private.manager_card_rules%rowtype;
  cfg jsonb;
  min_weeks integer;
  provisional_below integer;
  trf_window integer;
  cap_ignore timestamptz;
  scales jsonb;
  tiers jsonb;
  sel_numerator text;
  shrink_cap numeric;
  shrink_sel numeric;
  shrink_con numeric;
  shrink_trf numeric;
  ovr_min integer;
  neutral_empty boolean;
  fingerprint_before text;
  fingerprint_after text;
  last_seq integer;
  team_count integer;
  mismatch_count integer;
  season_changed integer;
  history_changed integer;
  new_user uuid;
begin
  if p_gameweek_id is null or p_rules_version is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- Same key as the tick (re-entrant inside the tick's own transaction).
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0)) then
    return jsonb_build_object('outcome', 'busy');
  end if;

  select * into rules from app_private.manager_card_rules where version = p_rules_version;
  if not found then
    raise exception using errcode = 'PT404', message = 'manager_card_rules_not_found';
  end if;
  cfg := rules.config;
  min_weeks := app_private.manager_card_config_number(cfg, 'minimum_gameweeks')::integer;
  provisional_below := app_private.manager_card_config_number(cfg, 'provisional_below')::integer;
  trf_window := app_private.manager_card_config_number(cfg, 'trf_window_gameweeks')::integer;
  if trf_window < 1 then
    raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
  end if;
  scales := cfg -> 'scales';
  tiers := cfg -> 'tiers';
  if jsonb_typeof(scales) is distinct from 'object' or jsonb_typeof(tiers) is distinct from 'object'
    or jsonb_typeof(scales -> 'cap') is distinct from 'array' or jsonb_typeof(scales -> 'sel') is distinct from 'array'
    or jsonb_typeof(scales -> 'trf') is distinct from 'array' or jsonb_typeof(scales -> 'con') is distinct from 'array' then
    raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
  end if;
  cap_ignore := case when jsonb_typeof(cfg -> 'cap_ignore_deadlines_before') = 'string'
    then (cfg ->> 'cap_ignore_deadlines_before')::timestamptz end;
  -- Optional behaviours (absent = the plain calculation of rules v1): the
  -- numerator of SEL, and how hard each stat is pulled toward 50 (k = 0: not).
  sel_numerator := 'starting_points';
  if cfg ? 'sel_numerator' then
    if jsonb_typeof(cfg -> 'sel_numerator') is distinct from 'string'
      or (cfg ->> 'sel_numerator') not in ('starting_points', 'picked_starters') then
      raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
    end if;
    sel_numerator := cfg ->> 'sel_numerator';
  end if;
  shrink_cap := 0; shrink_sel := 0; shrink_con := 0; shrink_trf := 0;
  if cfg ? 'shrinkage' then
    if jsonb_typeof(cfg -> 'shrinkage') is distinct from 'object' then
      raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
    end if;
    shrink_cap := app_private.manager_card_config_number(cfg -> 'shrinkage', 'cap');
    shrink_sel := app_private.manager_card_config_number(cfg -> 'shrinkage', 'sel');
    shrink_con := app_private.manager_card_config_number(cfg -> 'shrinkage', 'con');
    shrink_trf := app_private.manager_card_config_number(cfg -> 'shrinkage', 'trf');
    if least(shrink_cap, shrink_sel, shrink_con, shrink_trf) < 0 then
      raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
    end if;
  end if;
  -- Week one (absent = rules v1 and v2): how many of the four stats OVR needs
  -- (default 3), and whether a stat with no sample yet reads the neutral 50
  -- (what the shrinkage gives at n = 0) instead of staying empty.
  ovr_min := 3;
  if cfg ? 'ovr_min_stats' then
    if jsonb_typeof(cfg -> 'ovr_min_stats') is distinct from 'number'
      or (cfg ->> 'ovr_min_stats') !~ '^[1-4]$' then
      raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
    end if;
    ovr_min := (cfg ->> 'ovr_min_stats')::integer;
  end if;
  neutral_empty := false;
  if cfg ? 'empty_stat_neutral' then
    if jsonb_typeof(cfg -> 'empty_stat_neutral') is distinct from 'boolean' then
      raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
    end if;
    neutral_empty := (cfg ->> 'empty_stat_neutral')::boolean;
  end if;

  select * into gw from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  select * into season from app.fantasy_seasons where id = gw.fantasy_season_id;

  if not (
    gw.status in ('finalized', 'corrected') and gw.points_state = 'final'
    and exists (
      select 1 from app_private.fantasy_gameweek_postwork work
      where work.gameweek_id = gw.id and work.calculation_version = gw.scoring_input_version
        and work.completed_at is not null
    )
  ) then
    return jsonb_build_object('outcome', 'not_evaluable', 'gameweekId', gw.id);
  end if;

  fingerprint_before := app_private.manager_card_season_fingerprint(season.id);

  -- Evaluable gameweeks of the season up to and including this one.
  execute pg_catalog.concat($q$
  create temp table mc_gws on commit drop as
  select g.id as gameweek_id, g.sequence_number as seq, g.deadline_at
  from app.fantasy_gameweeks g
  where g.fantasy_season_id = $1
    and g.sequence_number <= $3
    and g.status in ('finalized', 'corrected') and g.points_state = 'final'
    and exists (
      select 1 from app_private.fantasy_gameweek_postwork work
      where work.gameweek_id = g.id and work.calculation_version = g.scoring_input_version
        and work.completed_at is not null
    )
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create unique index mc_gws_idx on pg_temp.mc_gws (gameweek_id)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- Every non-cancelled gameweek of the season (the TRF windows walk these).
  execute pg_catalog.concat($q$
  create temp table mc_all on commit drop as
  select g.id as gameweek_id, g.sequence_number as seq
  from app.fantasy_gameweeks g
  where g.fantasy_season_id = $1 and g.status <> 'cancelled'
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create unique index mc_all_idx on pg_temp.mc_all (seq)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  select max(seq)  from pg_temp.mc_all
  $q$, '') into last_seq using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- The managers rated by this run: active teams with a final result in this
  -- gameweek whose profile is not marked for deletion.
  execute pg_catalog.concat($q$
  create temp table mc_teams on commit drop as
  select t.id as team_id, t.user_id
  from app.fantasy_teams t
  join app.profiles p on p.id = t.user_id and p.deleted_at is null
  join app.fantasy_team_gameweek_results r
    on r.fantasy_team_id = t.id and r.gameweek_id = $2 and r.state = 'final'
  where t.fantasy_season_id = $1 and t.status = 'active'
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create unique index mc_teams_idx on pg_temp.mc_teams (team_id)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- Their final results in every evaluable gameweek so far.
  execute pg_catalog.concat($q$
  create temp table mc_res on commit drop as
  select r.fantasy_team_id as team_id, r.gameweek_id, g.seq, g.deadline_at, r.final_score,
    r.starting_points, r.chip_type, r.scoring_details, l.id as lineup_id
  from pg_temp.mc_teams t
  join app.fantasy_team_gameweek_results r on r.fantasy_team_id = t.team_id and r.state = 'final'
  join pg_temp.mc_gws g on g.gameweek_id = r.gameweek_id
  left join app.fantasy_lineups l on l.fantasy_team_id = t.team_id and l.gameweek_id = r.gameweek_id
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create unique index mc_res_idx on pg_temp.mc_res (team_id, gameweek_id)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create index mc_res_lineup_idx on pg_temp.mc_res (lineup_id)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- Every player's points in those gameweeks (owned or not).
  execute pg_catalog.concat($q$
  create temp table mc_pts on commit drop as
  select p.fantasy_player_id, p.gameweek_id, coalesce(p.final_points, 0) as pts, p.minutes_played as mins
  from app.fantasy_player_gameweek_points p
  join pg_temp.mc_gws g on g.gameweek_id = p.gameweek_id
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create unique index mc_pts_idx on pg_temp.mc_pts (fantasy_player_id, gameweek_id)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- The locked lineups of those results, with each player's week.
  execute pg_catalog.concat($q$
  create temp table mc_lp on commit drop as
  select r.team_id, r.gameweek_id, r.lineup_id, lp.fantasy_player_id, lp.slot, lp.captain, lp.vice_captain,
    fp.position_id, coalesce(pp.pts, 0) as pts, coalesce(pp.mins, 0) as mins
  from pg_temp.mc_res r
  join app.fantasy_lineup_players lp on lp.lineup_id = r.lineup_id
  join app.fantasy_players fp on fp.id = lp.fantasy_player_id
  left join pg_temp.mc_pts pp on pp.fantasy_player_id = lp.fantasy_player_id and pp.gameweek_id = r.gameweek_id
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create index mc_lp_idx on pg_temp.mc_lp (lineup_id)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_res
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_pts
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_lp
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- CAP: one ratio per team-week, null when the week is skipped.
  execute pg_catalog.concat($q$
  create temp table mc_cap on commit drop as
  with per_lineup as (
    select lp.lineup_id,
      max(lp.pts) filter (where lp.slot = 'starter') as best,
      (array_agg(lp.fantasy_player_id) filter (where lp.captain))[1] as cap_id,
      coalesce(max(lp.mins) filter (where lp.captain), 0) as cap_mins,
      coalesce(max(lp.pts) filter (where lp.captain), 0) as cap_pts,
      (array_agg(lp.fantasy_player_id) filter (where lp.vice_captain))[1] as vice_id,
      coalesce(max(lp.mins) filter (where lp.vice_captain), 0) as vice_mins,
      coalesce(max(lp.pts) filter (where lp.vice_captain), 0) as vice_pts
    from pg_temp.mc_lp lp
    group by lp.lineup_id
  ), effective as (
    select pl.lineup_id, pl.best,
      case when pl.cap_id is null then null
           when pl.cap_mins > 0 then pl.cap_id
           when pl.vice_id is not null and pl.vice_mins > 0 then pl.vice_id end as eff_id,
      case when pl.cap_id is null then null
           when pl.cap_mins > 0 then pl.cap_pts
           when pl.vice_id is not null and pl.vice_mins > 0 then pl.vice_pts end as eff_pts
    from per_lineup pl
  )
  select r.team_id, r.gameweek_id,
    ($5 is not null and r.deadline_at < $5) as ignored,
    (e.eff_id is not null
      and r.scoring_details is not null and r.scoring_details ? 'effectiveCaptainId'
      and (r.scoring_details ->> 'effectiveCaptainId') is distinct from e.eff_id::text) as mismatch,
    case
      when $5 is not null and r.deadline_at < $5 then null
      when e.eff_id is null or e.best is null or e.best <= 0 then null
      when r.scoring_details is not null and r.scoring_details ? 'effectiveCaptainId'
        and (r.scoring_details ->> 'effectiveCaptainId') is distinct from e.eff_id::text then null
      else greatest(0, e.eff_pts::numeric / e.best)
    end as ratio
  from pg_temp.mc_res r
  left join effective e on e.lineup_id = r.lineup_id
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  select count(*)  from pg_temp.mc_cap where mismatch and not ignored
  $q$, '') into mismatch_count using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- SEL: the legal formations from the season's ruleset, then the best eleven
  -- the lineup's fifteen could have produced.
  execute pg_catalog.concat($q$
  create temp table mc_form on commit drop as
  with recursive pr as (
    select rule.position_id, rule.starting_minimum as mn, rule.starting_maximum as mx,
      row_number() over (order by rule.position_id) as rn
    from app.fantasy_position_rules rule
    where rule.ruleset_id = $4
  ), xis as (
    select distinct s.n from (
      select lineup_id, count(*)::integer as n from pg_temp.mc_lp where slot = 'starter' group by lineup_id
    ) s
  ), f(xi, rn, total, ns) as (
    select xis.n, 0::integer, 0::integer, array[]::integer[] from xis
    union all
    select f.xi, pr.rn::integer, f.total + k, f.ns || k
    from f
    join pr on pr.rn = f.rn + 1
    cross join lateral generate_series(pr.mn, least(pr.mx, f.xi - f.total)) as k
  ), forms as (
    select row_number() over (order by f.xi, f.ns) as fid, f.xi, f.ns
    from f
    where f.rn = (select max(rn) from pr) and f.total = f.xi
  )
  select forms.fid, forms.xi, pr.position_id, forms.ns[pr.rn] as n
  from forms cross join pr
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  execute pg_catalog.concat($q$
  create temp table mc_lpos on commit drop as
  select ranked.lineup_id, ranked.position_id, ranked.k,
    sum(ranked.pts) over (
      partition by ranked.lineup_id, ranked.position_id order by ranked.k rows unbounded preceding
    ) as cs
  from (
    select lp.lineup_id, lp.position_id, lp.pts,
      row_number() over (
        partition by lp.lineup_id, lp.position_id order by lp.pts desc, lp.fantasy_player_id
      ) as k
    from pg_temp.mc_lp lp
  ) ranked
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create index mc_lpos_idx on pg_temp.mc_lpos (lineup_id, position_id, k)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_lpos
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  execute pg_catalog.concat($q$
  create temp table mc_best on commit drop as
  select scored.lineup_id, max(scored.total) as best
  from (
    select l.lineup_id, f.fid, sum(coalesce(c.cs, 0)) as total,
      bool_and(f.n = 0 or c.k is not null) as ok
    from (
      select lineup_id, count(*) filter (where slot = 'starter') as xi
      from pg_temp.mc_lp group by lineup_id
    ) l
    join pg_temp.mc_form f on f.xi = l.xi
    left join pg_temp.mc_lpos c
      on c.lineup_id = l.lineup_id and c.position_id = f.position_id and c.k = f.n
    group by l.lineup_id, f.fid
  ) scored
  where scored.ok
  group by scored.lineup_id
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  execute pg_catalog.concat($q$
  create temp table mc_sel on commit drop as
  select r.team_id, r.gameweek_id,
    least(1, greatest(0, (
      -- $13 = 'picked_starters': the points of the eleven picked as starters
      -- (lineup players with slot 'starter', their own final_points, 0 when
      -- they did not play), not the automatic substitutions' result. Otherwise
      -- the result's starting_points, as before.
      case when $13 = 'picked_starters' then picked.pts else r.starting_points::numeric end
    ) / b.best)) as ratio
  from pg_temp.mc_res r
  join pg_temp.mc_best b on b.lineup_id = r.lineup_id
  left join lateral (
    select coalesce(sum(lp.pts), 0) as pts
    from pg_temp.mc_lp lp
    where lp.lineup_id = r.lineup_id and lp.slot = 'starter'
  ) picked on true
  where r.chip_type is distinct from 'bench_boost' and b.best > 0
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version, sel_numerator;

  -- CON: rank every active team's final result of each evaluable gameweek.
  execute pg_catalog.concat($q$
  create temp table mc_con on commit drop as
  select ranked.team_id, ranked.gameweek_id, (ranked.above * 2 < ranked.n) as top_half
  from (
    select r.fantasy_team_id as team_id, r.gameweek_id,
      rank() over (partition by r.gameweek_id order by r.final_score desc) - 1 as above,
      count(*) over (partition by r.gameweek_id) as n
    from app.fantasy_team_gameweek_results r
    join app.fantasy_teams t
      on t.id = r.fantasy_team_id and t.fantasy_season_id = $1 and t.status = 'active'
    join pg_temp.mc_gws g on g.gameweek_id = r.gameweek_id
    where r.state = 'final'
  ) ranked
  where ranked.team_id in (select team_id from pg_temp.mc_teams)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- TRF: confirmed, non-Free-Hit batches whose window is evaluable.
  execute pg_catalog.concat($q$
  create temp table mc_trf on commit drop as
  with batches as (
    select b.id as batch_id, b.fantasy_team_id as team_id, b.point_hit, b.transfers_count,
      bg.sequence_number as b_seq
    from app.fantasy_transfer_batches b
    join pg_temp.mc_teams t on t.team_id = b.fantasy_team_id
    join app.fantasy_gameweeks bg on bg.id = b.gameweek_id
    where b.status = 'confirmed' and b.chip_type is distinct from 'free_hit'
  ), win as (
    select bt.batch_id, a.gameweek_id, a.seq,
      row_number() over (partition by bt.batch_id order by a.seq) as rn
    from batches bt
    join pg_temp.mc_all a on a.seq >= bt.b_seq
  ), win_w as (
    select * from win where rn <= $6
  ), ready as (
    select ww.batch_id
    from win_w ww
    left join pg_temp.mc_gws g on g.gameweek_id = ww.gameweek_id
    group by ww.batch_id
    having bool_and(g.gameweek_id is not null)
      or exists (select 1 from pg_temp.mc_gws lg where lg.seq = $7)
  ), used as (
    select ww.batch_id, ww.gameweek_id
    from win_w ww
    join ready on ready.batch_id = ww.batch_id
    join pg_temp.mc_gws g on g.gameweek_id = ww.gameweek_id
  )
  select bt.team_id, tr.id as transfer_id,
    coalesce(sum(case when p.fantasy_player_id = tr.player_in_id then p.pts else -p.pts end), 0)
      - bt.point_hit::numeric / bt.transfers_count as value
  from batches bt
  join ready on ready.batch_id = bt.batch_id
  join app.fantasy_transfers tr on tr.transfer_batch_id = bt.batch_id
  left join used u on u.batch_id = bt.batch_id
  left join pg_temp.mc_pts p
    on p.gameweek_id = u.gameweek_id and p.fantasy_player_id in (tr.player_in_id, tr.player_out_id)
  group by bt.team_id, tr.id, bt.point_hit, bt.transfers_count
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  execute pg_catalog.concat($q$
  analyze pg_temp.mc_teams
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_cap
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_sel
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_con
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_trf
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- The figures.
  execute pg_catalog.concat($q$
  create temp table mc_fig on commit drop as
  with counted as (
    select team_id, count(*)::integer as counted from pg_temp.mc_res group by team_id
  ), cap_avg as (
    select team_id, round(avg(ratio), 6) as v, count(*)::integer as n from pg_temp.mc_cap where ratio is not null group by team_id
  ), sel_avg as (
    select team_id, round(avg(ratio), 6) as v, count(*)::integer as n from pg_temp.mc_sel group by team_id
  ), trf_avg as (
    select team_id, round(avg(value), 6) as v, count(*)::integer as n from pg_temp.mc_trf group by team_id
  ), con_avg as (
    select team_id, round(avg(case when top_half then 1 else 0 end), 6) as v, count(*)::integer as n from pg_temp.mc_con group by team_id
  ), raw as (
    select t.team_id, t.user_id, coalesce(c.counted, 0) as counted,
      cap_avg.v as cap_raw, sel_avg.v as sel_raw, trf_avg.v as trf_raw, con_avg.v as con_raw,
      cap_avg.n as cap_n, sel_avg.n as sel_n, trf_avg.n as trf_n, con_avg.n as con_n
    from pg_temp.mc_teams t
    left join counted c on c.team_id = t.team_id
    left join cap_avg on cap_avg.team_id = t.team_id
    left join sel_avg on sel_avg.team_id = t.team_id
    left join trf_avg on trf_avg.team_id = t.team_id
    left join con_avg on con_avg.team_id = t.team_id
  ), gated as (
    select raw.team_id, raw.user_id, raw.counted, raw.cap_n, raw.sel_n, raw.trf_n, raw.con_n,
      case when raw.counted >= $8 then raw.cap_raw end as cap_raw,
      case when raw.counted >= $8 then raw.sel_raw end as sel_raw,
      case when raw.counted >= $8 then raw.trf_raw end as trf_raw,
      case when raw.counted >= $8 then raw.con_raw end as con_raw
    from raw
  ), scaled as (
    select g.*,
      app_private.manager_card_scale(g.cap_raw, $10 -> 'cap') as cap_s,
      app_private.manager_card_scale(g.sel_raw, $10 -> 'sel') as sel_s,
      app_private.manager_card_scale(g.trf_raw, $10 -> 'trf') as trf_s,
      app_private.manager_card_scale(g.con_raw, $10 -> 'con') as con_s
    from gated g
  ), shrunk as (
    -- Toward 50 by the stat's own sample count n and its k ($14..$17):
    -- 50 + (scaled - 50) * n / (n + k). k = 0 (no shrinkage key) keeps the
    -- scaled figure as it is. A stat with no sample is null, or the neutral 50
    -- when the rules ask for it ($18, empty_stat_neutral) and the team is past
    -- the minimum.
    select s.team_id, s.user_id, s.counted, s.cap_raw, s.sel_raw, s.trf_raw, s.con_raw,
      coalesce(case when $14 > 0 and s.cap_s is not null
        then least(99, greatest(1, round(50 + (s.cap_s - 50)::numeric * s.cap_n / (s.cap_n + $14))))::smallint
        else s.cap_s end, case when $18 and s.counted >= $8 then 50::smallint end) as cap,
      coalesce(case when $15 > 0 and s.sel_s is not null
        then least(99, greatest(1, round(50 + (s.sel_s - 50)::numeric * s.sel_n / (s.sel_n + $15))))::smallint
        else s.sel_s end, case when $18 and s.counted >= $8 then 50::smallint end) as sel,
      coalesce(case when $16 > 0 and s.trf_s is not null
        then least(99, greatest(1, round(50 + (s.trf_s - 50)::numeric * s.trf_n / (s.trf_n + $16))))::smallint
        else s.trf_s end, case when $18 and s.counted >= $8 then 50::smallint end) as trf,
      coalesce(case when $17 > 0 and s.con_s is not null
        then least(99, greatest(1, round(50 + (s.con_s - 50)::numeric * s.con_n / (s.con_n + $17))))::smallint
        else s.con_s end, case when $18 and s.counted >= $8 then 50::smallint end) as con
    from scaled s
  ), rated as (
    select s.*,
      case when (s.cap is not null)::integer + (s.sel is not null)::integer
        + (s.trf is not null)::integer + (s.con is not null)::integer >= $19
      then round((coalesce(s.cap, 0) + coalesce(s.sel, 0) + coalesce(s.trf, 0) + coalesce(s.con, 0))::numeric
        / ((s.cap is not null)::integer + (s.sel is not null)::integer
          + (s.trf is not null)::integer + (s.con is not null)::integer))::smallint
      end as ovr
    from shrunk s
  )
  select r.team_id, r.user_id, r.counted, r.cap_raw, r.sel_raw, r.trf_raw, r.con_raw,
    r.cap, r.sel, r.trf, r.con, r.ovr,
    app_private.manager_card_tier(r.ovr, $11) as tier,
    (r.counted < $9) as provisional
  from rated r
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version, sel_numerator, shrink_cap, shrink_sel, shrink_trf, shrink_con, neutral_empty, ovr_min;
  execute pg_catalog.concat($q$
  select count(*)  from pg_temp.mc_fig
  $q$, '') into team_count using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- The scoring may have moved while this ran: write nothing.
  fingerprint_after := app_private.manager_card_season_fingerprint(season.id);
  if fingerprint_after is distinct from fingerprint_before then
    perform app_private.manager_card_drop_temp();
    return jsonb_build_object('outcome', 'version_changed', 'gameweekId', gw.id);
  end if;
  -- The rating change of each team at this gameweek, read before its history
  -- row is written: the latest earlier history row of the season (the
  -- previous evaluated OVR). A change counts only when both OVRs exist, they
  -- differ, the earlier row is under these rules, and this gameweek's own row
  -- is new or already under these rules: a recalculation under a NEW rules
  -- version (rows still under the old one) records no change, so switching
  -- versions never reads as the card moving.
  execute pg_catalog.concat($q$
  create temp table mc_chg on commit drop as
  select f.user_id, f.ovr as to_ovr, f.tier as to_tier, prev.ovr as from_ovr, prev.tier as from_tier,
    coalesce(f.ovr is not null and prev.ovr is not null and f.ovr <> prev.ovr
      and prev.rules_version = $12
      and (cur.user_id is null or cur.rules_version = $12), false) as changed
  from pg_temp.mc_fig f
  left join app.manager_card_gameweeks cur on cur.user_id = f.user_id and cur.gameweek_id = $2
  left join lateral (
    select h.ovr, h.tier, h.rules_version
    from app.manager_card_gameweeks h
    join app.fantasy_gameweeks g on g.id = h.gameweek_id
    where h.user_id = f.user_id and h.fantasy_season_id = $1 and g.sequence_number < $3
    order by g.sequence_number desc
    limit 1
  ) prev on true
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- Writes: the card, its number, the history row, the season row, the ledger.
  execute pg_catalog.concat($q$
  insert into app.manager_cards (user_id)
  select f.user_id from pg_temp.mc_fig f
  on conflict (user_id) do nothing
  $q$, '');

  for new_user in execute pg_catalog.concat(
    'select card.user_id from app.manager_cards card
     where card.serial is null and card.user_id in (select user_id from pg_temp.mc_fig)
     order by card.user_id', '')
  loop
    perform app_private.manager_card_assign_serial(new_user);
  end loop;

  execute pg_catalog.concat($q$
  with written as (
    insert into app.manager_card_gameweeks as h (
      user_id, fantasy_season_id, gameweek_id, ovr, tier, cap, sel, trf, con,
      cap_raw, sel_raw, trf_raw, con_raw, gameweeks_counted, provisional, rules_version
    )
    select f.user_id, $1, $2, f.ovr, f.tier, f.cap, f.sel, f.trf, f.con,
      f.cap_raw, f.sel_raw, f.trf_raw, f.con_raw, f.counted, f.provisional, $12
    from pg_temp.mc_fig f
    on conflict (user_id, gameweek_id) do update set
      fantasy_season_id = excluded.fantasy_season_id, ovr = excluded.ovr, tier = excluded.tier,
      cap = excluded.cap, sel = excluded.sel, trf = excluded.trf, con = excluded.con,
      cap_raw = excluded.cap_raw, sel_raw = excluded.sel_raw, trf_raw = excluded.trf_raw,
      con_raw = excluded.con_raw, gameweeks_counted = excluded.gameweeks_counted,
      provisional = excluded.provisional, rules_version = excluded.rules_version,
      calculated_at = statement_timestamp()
    where (h.fantasy_season_id, h.ovr, h.tier, h.cap, h.sel, h.trf, h.con, h.cap_raw, h.sel_raw, h.trf_raw,
        h.con_raw, h.gameweeks_counted, h.provisional, h.rules_version)
      is distinct from
      (excluded.fantasy_season_id, excluded.ovr, excluded.tier, excluded.cap, excluded.sel, excluded.trf,
        excluded.con, excluded.cap_raw, excluded.sel_raw, excluded.trf_raw, excluded.con_raw,
        excluded.gameweeks_counted, excluded.provisional, excluded.rules_version)
    returning 1
  )
  select count(*)::integer from written
  $q$, '') into history_changed using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  execute pg_catalog.concat($q$
  with written as (
    insert into app.manager_card_seasons as s (
      user_id, fantasy_season_id, fantasy_team_id, ovr, tier, cap, sel, trf, con,
      cap_raw, sel_raw, trf_raw, con_raw, gameweeks_counted, provisional, rules_version, through_gameweek_id
    )
    select f.user_id, $1, f.team_id, f.ovr, f.tier, f.cap, f.sel, f.trf, f.con,
      f.cap_raw, f.sel_raw, f.trf_raw, f.con_raw, f.counted, f.provisional, $12, $2
    from pg_temp.mc_fig f
    on conflict (user_id, fantasy_season_id) do update set
      fantasy_team_id = excluded.fantasy_team_id, ovr = excluded.ovr, tier = excluded.tier,
      cap = excluded.cap, sel = excluded.sel, trf = excluded.trf, con = excluded.con,
      cap_raw = excluded.cap_raw, sel_raw = excluded.sel_raw, trf_raw = excluded.trf_raw,
      con_raw = excluded.con_raw, gameweeks_counted = excluded.gameweeks_counted,
      provisional = excluded.provisional, rules_version = excluded.rules_version,
      through_gameweek_id = excluded.through_gameweek_id, calculated_at = statement_timestamp()
    -- An older gameweek never pulls the season row back: during a correction
    -- the row keeps its figures until the re-evaluation reaches the latest week.
    where (select through.sequence_number from app.fantasy_gameweeks through
           where through.id = s.through_gameweek_id) <= $3
      and (s.fantasy_team_id, s.ovr, s.tier, s.cap, s.sel, s.trf, s.con, s.cap_raw, s.sel_raw, s.trf_raw,
        s.con_raw, s.gameweeks_counted, s.provisional, s.rules_version, s.through_gameweek_id)
      is distinct from
      (excluded.fantasy_team_id, excluded.ovr, excluded.tier, excluded.cap, excluded.sel, excluded.trf,
        excluded.con, excluded.cap_raw, excluded.sel_raw, excluded.trf_raw, excluded.con_raw,
        excluded.gameweeks_counted, excluded.provisional, excluded.rules_version, excluded.through_gameweek_id)
    returning 1
  )
  select count(*)::integer  from written
  $q$, '') into season_changed using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- The rating changes (display and notification only): one row per manager
  -- and gameweek, kept in step with the history row. A recalculation that no
  -- longer finds a change removes the row; one that finds a different change
  -- updates it.
  execute pg_catalog.concat($q$
  delete from app.manager_card_ovr_changes c
  using pg_temp.mc_chg x
  where c.user_id = x.user_id and c.gameweek_id = $2 and not x.changed
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  insert into app.manager_card_ovr_changes as c (
    user_id, fantasy_season_id, gameweek_id, rules_version, from_ovr, to_ovr, from_tier, to_tier
  )
  select x.user_id, $1, $2, $12, x.from_ovr, x.to_ovr, x.from_tier, x.to_tier
  from pg_temp.mc_chg x
  where x.changed
  on conflict (user_id, gameweek_id) do update set
    fantasy_season_id = excluded.fantasy_season_id, rules_version = excluded.rules_version,
    from_ovr = excluded.from_ovr, to_ovr = excluded.to_ovr,
    from_tier = excluded.from_tier, to_tier = excluded.to_tier, updated_at = statement_timestamp()
  where (c.fantasy_season_id, c.rules_version, c.from_ovr, c.to_ovr, c.from_tier, c.to_tier)
    is distinct from
    (excluded.fantasy_season_id, excluded.rules_version, excluded.from_ovr, excluded.to_ovr,
      excluded.from_tier, excluded.to_tier)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  -- Not in manager_card_drop_temp's list: dropped here, so that the next
  -- gameweek evaluated in the same transaction can create it again.
  execute pg_catalog.concat($q$
  drop table pg_temp.mc_chg
  $q$, '');

  -- The notification of those changes, while its switch is on. A failure there
  -- never costs the card its figures: it is undone alone and retried by no
  -- one (the next gameweek brings the next change).
  begin
    perform app_private.manager_card_notify_ovr_changes(gw.id);
  exception when others then
    null;
  end;

  -- The ledger keeps the version that was read at the start, and when (the
  -- real clock, so gameweeks evaluated in one tick are ordered): a gameweek
  -- whose entry is older than an earlier gameweek's is evaluated again, which
  -- lets a correction's cascade resume if a tick stopped part-way.
  insert into app_private.manager_card_evaluations as e
    (gameweek_id, rules_version, scoring_input_version, evaluated_at, cards_written)
  values (gw.id, p_rules_version, gw.scoring_input_version, clock_timestamp(), season_changed)
  on conflict (gameweek_id, rules_version) do update set
    scoring_input_version = excluded.scoring_input_version,
    evaluated_at = excluded.evaluated_at,
    cards_written = excluded.cards_written;

  perform app_private.manager_card_drop_temp();

  return jsonb_build_object(
    'outcome', 'evaluated',
    'gameweekId', gw.id,
    'rulesVersion', p_rules_version,
    'teams', team_count,
    'cardsWritten', season_changed,
    'historyWritten', history_changed,
    'capMismatches', mismatch_count
  );
end;
$$;

comment on function app_private.manager_card_evaluate_gameweek(uuid, integer) is
  'Recomputes the Manager Card figures of the active teams with a final result in the gameweek, from every evaluable gameweek of the season up to it. Rules may ask (config.shrinkage, config.sel_numerator, config.ovr_min_stats, config.empty_stat_neutral) for stats pulled toward 50 by their sample count, Selection counted on the picked starters, OVR from fewer stats and a neutral 50 for a stat with no sample; without those keys the figures are the plain ones. Records the rating change against the previous evaluated OVR under the same rules, and notifies it while that switch is on. Writes only card tables, the ledger and (switch on) the notification tables; writes nothing when the scoring version moved during the run. Idempotent.';

-- ---------------------------------------------------------------------------
-- The change moments (read by the card and the acknowledgement)
-- ---------------------------------------------------------------------------
create function app_private.manager_card_ovr_moments(p_user_id uuid)
returns table (moment_key text, occurred_at timestamptz, moment jsonb, pending boolean)
language sql
stable
set search_path = ''
as $$
  with season_row as (
    select s.fantasy_season_id, s.rules_version, s.ovr, s.gameweeks_counted
    from app.manager_card_seasons s
    where s.user_id = p_user_id
      and s.fantasy_season_id = app_private.manager_card_fantasy_season()
  ),
  rules as (
    select r.min_rated from app_private.manager_card_active_rules() r
  ),
  changes as (
    select c.gameweek_id, c.fantasy_season_id, c.rules_version, c.from_ovr, c.to_ovr,
      c.from_tier, c.to_tier, c.updated_at, gw.sequence_number as seq,
      case when c.to_ovr > c.from_ovr then 'ovr_up' else 'ovr_down' end
        || ':' || c.gameweek_id::text as mkey
    from app.manager_card_ovr_changes c
    join app.fantasy_gameweeks gw on gw.id = c.gameweek_id
    where c.user_id = p_user_id
  ),
  latest as (
    select ch.gameweek_id
    from changes ch
    join season_row sr on sr.fantasy_season_id = ch.fantasy_season_id
      and sr.rules_version = ch.rules_version
    order by ch.seq desc
    limit 1
  )
  select ch.mkey, ch.updated_at,
    jsonb_build_object('kind', 'ovr_changed', 'key', ch.mkey,
      'direction', case when ch.to_ovr > ch.from_ovr then 'up' else 'down' end,
      'occurredAt', ch.updated_at, 'gameweekSeq', ch.seq,
      'fromOvr', ch.from_ovr, 'toOvr', ch.to_ovr, 'delta', ch.to_ovr - ch.from_ovr,
      'fromTier', ch.from_tier, 'toTier', ch.to_tier),
    coalesce(
      ch.gameweek_id = (select l.gameweek_id from latest l)
      and exists (
        select 1 from season_row sr cross join rules
        where sr.ovr = ch.to_ovr and sr.gameweeks_counted >= rules.min_rated)
      and not exists (
        select 1 from app.manager_card_moment_acks a
        where a.user_id = p_user_id and a.moment_key = ch.mkey),
      false)
  from changes ch
  order by ch.updated_at, ch.mkey;
$$;
revoke all on function app_private.manager_card_ovr_moments(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.manager_card_ovr_moments(uuid) is
  'Every rating-change moment of a manager (ovr_up:<gameweek id> / ovr_down:<gameweek id>, kind ovr_changed) with pending = the latest change of the current season under the card''s rules, whose new OVR is still the card''s OVR, past the minimum and not acknowledged. Derived from app.manager_card_ovr_changes. No grant.';

-- ---------------------------------------------------------------------------
-- api.get_my_manager_card: the same answer plus card.ovrChanges
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
  card jsonb;
begin
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  card := app_private.manager_card_my_card(actor);
  -- Additive: the pending rating change (zero or one), which the card animates
  -- once and then acknowledges.
  if card is not null then
    card := card || jsonb_build_object('ovrChanges', coalesce((
      select jsonb_agg(m.moment order by m.occurred_at, m.moment_key)
      from app_private.manager_card_ovr_moments(actor) m
      where m.pending), '[]'::jsonb));
  end if;
  return jsonb_build_object('available', true, 'card', card);
end;
$$;
comment on function api.get_my_manager_card() is
  'The caller''s Manager Card for the current Fantasy season: {available:true, card} (card null without a team this season), or {available:false} while off. card.ovrChanges lists the pending rating change (zero or one). Signed-in, step-up. Display only.';

-- ---------------------------------------------------------------------------
-- api.ack_manager_card_moments: the body of 20261010120200 plus the two
-- change-moment key shapes, recorded when derivable now.
-- ---------------------------------------------------------------------------
create or replace function api.ack_manager_card_moments(p_keys text[])
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
      || '(first_rating|provisional_cleared|season_closed|season_started|ovr_up|ovr_down):'
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
  from (
    select moments.moment_key from app_private.manager_card_moments(actor) moments
    union
    select changes.moment_key from app_private.manager_card_ovr_moments(actor) changes
  ) m
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
comment on function api.ack_manager_card_moments(text[]) is
  'Records Manager Card moments as seen (1..16 well-formed keys, the rating changes ovr_up:<gameweek id> and ovr_down:<gameweek id> included): {acknowledged, ignored}. While off everything is ignored and nothing is written. Only moments derivable now are recorded. Signed-in, step-up. Display only.';

notify pgrst, 'reload schema';
$migration$]);

do $apply$
declare source text;
begin
  select statements[1] into source from supabase_migrations.schema_migrations where version = '20261012200100';
  if encode(sha256(convert_to(source, 'UTF8')), 'hex')
    is distinct from '3d43c5bdb0158a10ebbfd41ff1132b0a70cd1dd63a6c711a6be19c45180dbdc9'
  then raise exception 'stop: migration differs from reviewed repository bytes'; end if;
  execute source;
end $apply$;

do $verify$
declare
  problems text[] := '{}';
begin
  if md5((select prosrc from pg_proc where oid = 'app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure))
    is distinct from '8a0ea1ae87c3a80e3c5294dee0b961f2' then problems := problems || 'manager_card_evaluate_gameweek body'::text; end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.manager_card_notify_ovr_changes(uuid)'::regprocedure))
    is distinct from '6a67a4a4d6c8076f02ee3e951d6378f1' then problems := problems || 'manager_card_notify_ovr_changes body'::text; end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.manager_card_ovr_moments(uuid)'::regprocedure))
    is distinct from '09eeb27c2dae9d64304deb3b7adc9b8a' then problems := problems || 'manager_card_ovr_moments body'::text; end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.manager_card_notify_configure(boolean)'::regprocedure))
    is distinct from '34bf84682e72e0e0b8ca5322cae6123a' then problems := problems || 'manager_card_notify_configure body'::text; end if;
  if md5((select prosrc from pg_proc where oid = 'api.get_my_manager_card()'::regprocedure))
    is distinct from '0a84f24018a32a77a048a76db0366016' then problems := problems || 'get_my_manager_card body'::text; end if;
  if md5((select prosrc from pg_proc where oid = 'api.ack_manager_card_moments(text[])'::regprocedure))
    is distinct from 'ada5244109fb537a1ade1f14981a8dc8' then problems := problems || 'ack_manager_card_moments body'::text; end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.notification_push_topic(text)'::regprocedure))
    is distinct from 'ab7c8ff0424e9e551fa86dbd5ce6e816' then problems := problems || 'notification_push_topic body'::text; end if;
  if md5((select prosrc from pg_proc where oid = 'app_private.notification_push_ttl(text)'::regprocedure))
    is distinct from 'ffe9424fb7357dc3a9080acacbaf2227' then problems := problems || 'notification_push_ttl body'::text; end if;

  -- Owner, definer rights and search_path.
  if exists (
    select 1 from pg_proc p
    where p.oid in ('app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure,
        'app_private.manager_card_notify_ovr_changes(uuid)'::regprocedure,
        'app_private.manager_card_notify_configure(boolean)'::regprocedure,
        'api.get_my_manager_card()'::regprocedure, 'api.ack_manager_card_moments(text[])'::regprocedure)
      and not (p.prosecdef and p.proowner = 'postgres'::regrole and p.proconfig @> array['search_path=""'])
  ) then problems := problems || 'owner, security definer or search_path of a definer function'::text; end if;
  if exists (
    select 1 from pg_proc p
    where p.oid in ('app_private.manager_card_ovr_moments(uuid)'::regprocedure,
        'app_private.notification_push_topic(text)'::regprocedure, 'app_private.notification_push_ttl(text)'::regprocedure)
      and not (not p.prosecdef and p.proowner = 'postgres'::regrole and p.proconfig @> array['search_path=""'])
  ) then problems := problems || 'owner or search_path of an invoker function'::text; end if;

  -- Grants: the app_private functions are closed to the API roles; the two api
  -- functions keep signed-in and service role, never anon.
  if exists (
    select 1 from pg_proc p cross join unnest(array['anon', 'authenticated', 'service_role']) r(role)
    where p.oid in ('app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure,
        'app_private.manager_card_notify_ovr_changes(uuid)'::regprocedure,
        'app_private.manager_card_notify_configure(boolean)'::regprocedure,
        'app_private.manager_card_ovr_moments(uuid)'::regprocedure)
      and has_function_privilege(r.role, p.oid, 'execute')
  ) then problems := problems || 'an app_private function is executable by an API role'::text; end if;
  if has_function_privilege('anon', 'api.get_my_manager_card()', 'execute')
    or not has_function_privilege('authenticated', 'api.get_my_manager_card()', 'execute')
    or not has_function_privilege('service_role', 'api.get_my_manager_card()', 'execute')
    or has_function_privilege('anon', 'api.ack_manager_card_moments(text[])', 'execute')
    or not has_function_privilege('authenticated', 'api.ack_manager_card_moments(text[])', 'execute')
    or not has_function_privilege('service_role', 'api.ack_manager_card_moments(text[])', 'execute') then
    problems := problems || 'grants of the two api functions'::text;
  end if;

  -- The new table: row security forced, no policy, no right for any API role.
  if not exists (select 1 from pg_class c where c.oid = 'app.manager_card_ovr_changes'::regclass
      and c.relrowsecurity and c.relforcerowsecurity)
    or exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename = 'manager_card_ovr_changes')
    or has_table_privilege('anon', 'app.manager_card_ovr_changes', 'select,insert,update,delete')
    or has_table_privilege('authenticated', 'app.manager_card_ovr_changes', 'select,insert,update,delete')
    or has_table_privilege('service_role', 'app.manager_card_ovr_changes', 'select,insert,update,delete') then
    problems := problems || 'app.manager_card_ovr_changes is not closed'::text;
  end if;
  if (select count(*) from app.notification_templates
      where template_key in ('manager_card_ovr_up', 'manager_card_ovr_down') and active and channel = 'in_app'
        and notification_type = 'manager_card_ovr_change') <> 4 then
    problems := problems || 'the four templates'::text;
  end if;
  if (select notify_ovr_changes from app_private.manager_card_settings) is distinct from false then
    problems := problems || 'the notification switch is not off'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the migration did not check out: %', problems;
  end if;
end $verify$;

-- ---------------------------------------------------------------------------
-- Rules v3: the one insert, version 2 goes inactive (never edited)
-- ---------------------------------------------------------------------------
update app_private.manager_card_rules set active = false where version = 2 and active;
insert into app_private.manager_card_rules (version, config, active)
values (3, current_setting('manager_card.rules_v3_config')::jsonb, true);

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  cfg jsonb;
  problems text[] := '{}';
  expected_top text[] := array[
    'minimum_gameweeks', 'provisional_below', 'trf_window_gameweeks', 'batch_size',
    'scales', 'tiers', 'shrinkage', 'sel_numerator', 'ovr_min_stats', 'empty_stat_neutral'
  ];
  one_key text;
  ticked jsonb;
begin
  if (select count(*) from app_private.manager_card_rules) <> 3
    or (select count(*) from app_private.manager_card_rules where active) <> 1
    or not exists (select 1 from app_private.manager_card_rules where version = 3 and active) then
    raise exception 'stop: expected exactly three rules rows, version 3 the only active one';
  end if;
  if (select config from app_private.manager_card_rules where version = 1)
      is distinct from current_setting('manager_card.rules_v1_before')::jsonb
    or (select config from app_private.manager_card_rules where version = 2)
      is distinct from current_setting('manager_card.rules_v2_before')::jsonb then
    raise exception 'stop: rules v1 or v2 changed';
  end if;
  select config into cfg from app_private.manager_card_rules where version = 3;
  if cfg is distinct from current_setting('manager_card.rules_v3_config')::jsonb then
    raise exception 'stop: the stored config differs from the pasted one';
  end if;

  for one_key in select k from jsonb_object_keys(cfg) k loop
    if one_key <> all (expected_top) then
      problems := array_append(problems, ('unknown key ' || one_key)::text);
    end if;
  end loop;
  foreach one_key in array expected_top loop
    if not cfg ? one_key then
      problems := array_append(problems, ('missing key ' || one_key)::text);
    end if;
  end loop;
  if cfg -> 'minimum_gameweeks' is distinct from '1'::jsonb then
    problems := array_append(problems, 'minimum_gameweeks must be 1 in rules v3'::text);
  end if;
  if cfg -> 'ovr_min_stats' is distinct from '1'::jsonb then
    problems := array_append(problems, 'ovr_min_stats must be 1 in rules v3'::text);
  end if;
  if cfg -> 'empty_stat_neutral' is distinct from 'true'::jsonb then
    problems := array_append(problems, 'empty_stat_neutral must be true in rules v3'::text);
  end if;
  if cfg ? 'cap_ignore_deadlines_before' then
    problems := array_append(problems, 'rules v3 has no CAP cut-off'::text);
  end if;
  if (cfg ->> 'provisional_below')::numeric < (cfg ->> 'minimum_gameweeks')::numeric then
    problems := array_append(problems, 'provisional_below must not be below minimum_gameweeks'::text);
  end if;
  -- The read API accepts the row (a minimum of at least 1, rising tiers).
  if not coalesce((select r.usable and r.version = 3 and r.min_rated = 1
      from app_private.manager_card_active_rules() r), false) then
    problems := array_append(problems, 'the read API does not find rules v3 usable'::text);
  end if;

  -- Compute and the notification are still off, the tick does nothing, nothing was written.
  if exists (select 1 from app_private.manager_card_settings where compute_enabled or notify_ovr_changes) then
    problems := array_append(problems, 'compute or the notification is switched on'::text);
  end if;
  ticked := app_private.manager_card_tick();
  if ticked is distinct from '{"outcome": "off"}'::jsonb then
    problems := array_append(problems, ('the tick answered ' || coalesce(ticked::text, 'nothing') || ' instead of off')::text);
  end if;
  if concat_ws('#',
    (select count(*) from app.manager_cards), (select count(*) from app.manager_card_seasons),
    (select count(*) from app.manager_card_gameweeks), (select count(*) from app_private.manager_card_evaluations),
    (select count(*) from app_private.manager_card_job_log),
    (select count(*) from app_private.notification_events), (select count(*) from app.notifications))
      is distinct from current_setting('manager_card.card_before')
    or exists (select 1 from app.manager_card_ovr_changes) then
    problems := array_append(problems, 'something was written to the card or the notifications'::text);
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: rules v3 did not check out: %', problems;
  end if;
  raise notice 'manager card rules v3: migration applied, bodies and grants as reviewed, one active row, every key valid, compute and notification still off';
end
$postflight$;

-- What was verified (read this row; the transaction is rolled back below unless you changed it).
select 'All checks passed: migration 20261012200100 applied with the reviewed bytes, bodies and grants as reviewed, rules v3 inserted and active (v1 and v2 inactive, unchanged), compute and the notification still off. If the last line of this script says rollback; nothing was saved; if it says commit; this is now installed -- restore the writers (see the header), the tick then recalculates every finished gameweek under v3.' as result,
  (select string_agg(version::text || case when active then ' (active)' else '' end, ', ' order by version) from app_private.manager_card_rules) as rules_rows,
  (select count(*) from supabase_migrations.schema_migrations where version = '20261012200100') as migration_rows_in_this_transaction;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To install for real, change ONLY the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;
