-- ============================================================================
-- FILLED COPY (BG-0158, owner decision 2026-10-08): fixed scales by meaning,
-- not calibrated percentiles. The calibration dry run found 2 finished
-- gameweeks and 7 teams, too few for percentile scales, so the owner chose
-- fixed scales that mean the same with any number of managers:
--   CAP  captain's points / best starter's: 0 -> 1, 1 (always the best) -> 99
--   SEL  your eleven / best possible eleven: 0.5 -> 1, 1 -> 99
--   TRF  points gained per transfer over 3 gameweeks: -10 -> 1, 0 -> 50, +10 -> 99
--   CON  share of weeks in the top half: 0 -> 1, all -> 99
--   Tiers: STADE 50+, PRO 65+, CHAMPION 80+, LEGEND 90+, HOMA below 50.
-- Minimum 2 finished weeks, never provisional (owner, 2026-10-10). CAP counts only weeks whose
-- deadline is at or after 2026-10-10T12:38:05Z, when PR #376 (no automatic
-- captain) was first seen live on botolago.com after the Lovable publish.
-- Generated from apply-manager-card-rules-v1.sql by replacing the marker
-- only; everything else (guards, checks) is identical.
-- ============================================================================
-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Manager Card (BG-0158): install RULES V1, the first and only ruleset.
--
-- WHAT IT DOES
--   Inserts one row into app_private.manager_card_rules: version 1, active, with
--   the calibrated config (the four scales, the tier cut-offs, the minimum
--   weeks, the transfer window, the batch size). Until a row like this exists
--   the card calculates nothing. Compute stays OFF: this script does not switch
--   it on. A rules row can never be edited afterwards (a trigger refuses), and
--   every figure the card stores is filed under its rules version, so a change
--   of formula later is a NEW version, never an edit. Check the numbers before
--   you commit.
--
-- THIS FILE IS A TEMPLATE
--   Search for the marker made of the words RULES_V1_CONFIG_JSON between double
--   underscores (it appears once, in the box marked "PUT THE CONFIG HERE" below,
--   inside the two $rules_v1_config$ tags). It must be replaced by the calibrated
--   config, a single JSON object: the "proposedRulesV1" block from the
--   calibration dry run (scripts/backend/manager-card-calibration-dry-run.sql),
--   reviewed by the owner, plus "cap_ignore_deadlines_before" once PR #376 has
--   shipped. While the marker is still there the script REFUSES to run, so a
--   half-filled file can never insert anything.
--
-- WHEN
--   After the Manager Card backend is applied and the calibration dry run has
--   been reviewed, and before compute is switched on and before the founder
--   grant. Any quiet moment: it takes a brief lock on one small table.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query.
--   2. Paste this WHOLE file (with the marker already replaced) and press Run.
--      As shipped it is a REHEARSAL: the row is inserted, checked, and then
--      ROLLED BACK. The result row should say "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the config is not what the card reads, or the database is not in the state
--   this script expects.
--
-- WHAT IT CHECKS
--   Before: the marker is gone and the config is a JSON object; the five card
--   migrations are recorded; there is no rules row yet; compute is off.
--   After the insert: exactly one rules row, version 1, active, equal to what
--   you pasted; every key present with the right type (minimum_gameweeks,
--   provisional_below, trf_window_gameweeks, batch_size are numbers; each of
--   scales cap/sel/trf/con is a list of at least two [raw, score] pairs with
--   raw strictly rising and score between 1 and 99; tiers stade < pro <
--   champion < legend, all between 1 and 99; no unknown key); the card's own
--   scale and tier functions accept the config; compute is still off; the tick
--   still answers {"outcome":"off"} and wrote nothing.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  -- ==========================================================================
  -- PUT THE CONFIG HERE: replace the marker below, and only the marker, with
  -- the JSON object. Keep the two $rules_v1_config$ tags around it.
  -- ==========================================================================
  config_text text := $rules_v1_config${"minimum_gameweeks": 2, "provisional_below": 2, "trf_window_gameweeks": 3, "batch_size": 2000, "scales": {"cap": [[0, 1], [1, 99]], "sel": [[0.5, 1], [1, 99]], "trf": [[-10, 1], [0, 50], [10, 99]], "con": [[0, 1], [1, 99]]}, "tiers": {"stade": 50, "pro": 65, "champion": 80, "legend": 90}, "cap_ignore_deadlines_before": "2026-10-10T12:38:05Z"}$rules_v1_config$;
  -- ==========================================================================
  cfg jsonb;
begin
  -- The placeholder check does not name the marker in full, so replacing every
  -- occurrence of the marker cannot switch it off.
  if position('RULES_V1' || '_CONFIG_JSON' in config_text) > 0
    or left(btrim(config_text), 1) <> '{' then
    raise exception 'stop: the rules config has not been filled in -- replace the marker in the box marked PUT THE CONFIG HERE with the calibrated JSON object';
  end if;
  begin
    cfg := config_text::jsonb;
  exception when others then
    raise exception 'stop: the rules config is not valid JSON (%)', sqlerrm;
  end;
  if jsonb_typeof(cfg) is distinct from 'object' then
    raise exception 'stop: the rules config must be one JSON object';
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
    where version in ('20261008123000', '20261008123100', '20261008123200', '20261008123300', '20261008123400')) <> 5 then
    raise exception 'stop: the five Manager Card migrations are not all recorded -- apply the card first (scripts/backend/apply-20261008123000-manager-card.sql)';
  end if;
  if to_regclass('app_private.manager_card_rules') is null
    or to_regclass('app_private.manager_card_settings') is null
    or to_regprocedure('app_private.manager_card_scale(numeric,jsonb)') is null
    or to_regprocedure('app_private.manager_card_tier(integer,jsonb)') is null
    or to_regprocedure('app_private.manager_card_tick()') is null then
    raise exception 'stop: a Manager Card table or function is missing';
  end if;
  if exists (select 1 from app_private.manager_card_rules) then
    raise exception 'stop: a rules row already exists -- rules are never edited; a change is a new version, see the runbook';
  end if;
  if not exists (select 1 from app_private.manager_card_settings) then
    raise exception 'stop: the Manager Card settings row is missing';
  end if;
  if exists (select 1 from app_private.manager_card_settings where compute_enabled) then
    raise exception 'stop: compute is switched on -- switch it off first: select app_private.manager_card_configure(false, null);';
  end if;
  if exists (select 1 from app.manager_card_seasons)
    or exists (select 1 from app_private.manager_card_evaluations) then
    raise exception 'stop: the card already holds figures -- rules v1 is meant to be installed on an empty card';
  end if;

  -- Hand the config to the insert below (this transaction only).
  perform set_config('manager_card.rules_v1_config', cfg::text, true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The one insert
-- ---------------------------------------------------------------------------
insert into app_private.manager_card_rules (version, config, active)
values (1, current_setting('manager_card.rules_v1_config')::jsonb, true);

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  cfg jsonb;
  problems text[] := '{}';
  expected_top text[] := array[
    'minimum_gameweeks', 'provisional_below', 'trf_window_gameweeks', 'batch_size',
    'scales', 'tiers', 'cap_ignore_deadlines_before'
  ];
  one_key text;
  stat text;
  tier_name text;
  pair_count integer;
  bad_pairs integer;
  bad_order integer;
  probe smallint;
  tier_probe text;
  ticked jsonb;
  lo numeric; hi numeric; previous_value numeric;
begin
  -- Exactly one rules row, version 1, active, equal to what was pasted.
  if (select count(*) from app_private.manager_card_rules) <> 1
    or (select count(*) from app_private.manager_card_rules where active) <> 1
    or not exists (select 1 from app_private.manager_card_rules where version = 1 and active) then
    raise exception 'stop: expected exactly one rules row, version 1, active';
  end if;
  select config into cfg from app_private.manager_card_rules where version = 1;
  if cfg is distinct from current_setting('manager_card.rules_v1_config')::jsonb then
    raise exception 'stop: the stored config differs from the pasted one';
  end if;

  -- Unknown top-level keys (a typo would otherwise be ignored silently).
  for one_key in select k from jsonb_object_keys(cfg) k loop
    if one_key <> all (expected_top) then
      problems := array_append(problems, ('unknown key ' || one_key)::text);
    end if;
  end loop;

  -- The four numbers.
  foreach one_key in array array['minimum_gameweeks', 'provisional_below', 'trf_window_gameweeks', 'batch_size'] loop
    if jsonb_typeof(cfg -> one_key) is distinct from 'number' then
      problems := array_append(problems, (one_key || ' is missing or not a number')::text);
    elsif (cfg ->> one_key)::numeric <> trunc((cfg ->> one_key)::numeric)
      or (cfg ->> one_key)::numeric < 1 then
      problems := array_append(problems, (one_key || ' must be a whole number of at least 1')::text);
    end if;
  end loop;
  if jsonb_typeof(cfg -> 'minimum_gameweeks') = 'number' and jsonb_typeof(cfg -> 'provisional_below') = 'number'
    and (cfg ->> 'provisional_below')::numeric < (cfg ->> 'minimum_gameweeks')::numeric then
    problems := array_append(problems, 'provisional_below must not be below minimum_gameweeks'::text);
  end if;

  -- Optional CAP start date.
  if (cfg -> 'cap_ignore_deadlines_before') is not null then
    if jsonb_typeof(cfg -> 'cap_ignore_deadlines_before') is distinct from 'string' then
      problems := array_append(problems, 'cap_ignore_deadlines_before must be a string (ISO 8601 with Z) or left out'::text);
    else
      begin
        perform (cfg ->> 'cap_ignore_deadlines_before')::timestamptz;
      exception when others then
        problems := array_append(problems, 'cap_ignore_deadlines_before is not a date and time'::text);
      end;
    end if;
  end if;

  -- The four scales.
  if jsonb_typeof(cfg -> 'scales') is distinct from 'object' then
    problems := array_append(problems, 'scales is missing or not an object'::text);
  else
    foreach stat in array array['cap', 'sel', 'trf', 'con'] loop
      if jsonb_typeof(cfg -> 'scales' -> stat) is distinct from 'array'
        or jsonb_array_length(cfg -> 'scales' -> stat) < 2 then
        problems := array_append(problems, ('scales.' || stat || ' must be a list of at least two [raw, score] pairs')::text);
        continue;
      end if;
      select count(*) filter (where jsonb_typeof(point) is distinct from 'array'
          or jsonb_array_length(point) <> 2
          or jsonb_typeof(point -> 0) is distinct from 'number'
          or jsonb_typeof(point -> 1) is distinct from 'number')
      into bad_pairs
      from jsonb_array_elements(cfg -> 'scales' -> stat) point;
      if bad_pairs > 0 then
        problems := array_append(problems, ('scales.' || stat || ' has an entry that is not a [number, number] pair')::text);
        continue;
      end if;
      -- raw strictly rising, score between 1 and 99
      select count(*) filter (where previous_x is not null and x <= previous_x),
        count(*) filter (where y < 1 or y > 99)
      into bad_order, bad_pairs
      from (
        select (point ->> 0)::numeric as x, (point ->> 1)::numeric as y,
          lag((point ->> 0)::numeric) over (order by ordinality) as previous_x
        from jsonb_array_elements(cfg -> 'scales' -> stat) with ordinality as t(point, ordinality)
      ) pts;
      if bad_order > 0 then
        problems := array_append(problems, ('scales.' || stat || ': the raw values must strictly rise')::text);
      end if;
      if bad_pairs > 0 then
        problems := array_append(problems, ('scales.' || stat || ': every score must be between 1 and 99')::text);
      end if;
      -- The card's own function must accept it (low end, high end).
      select (point ->> 0)::numeric into lo from jsonb_array_elements(cfg -> 'scales' -> stat) point limit 1;
      probe := app_private.manager_card_scale(lo, cfg -> 'scales' -> stat);
      if probe is null or probe < 1 or probe > 99 then
        problems := array_append(problems, ('scales.' || stat || ' did not parse in manager_card_scale')::text);
      end if;
    end loop;
  end if;

  -- The tiers.
  if jsonb_typeof(cfg -> 'tiers') is distinct from 'object' then
    problems := array_append(problems, 'tiers is missing or not an object'::text);
  else
    previous_value := 0;
    foreach tier_name in array array['stade', 'pro', 'champion', 'legend'] loop
      if jsonb_typeof(cfg -> 'tiers' -> tier_name) is distinct from 'number' then
        problems := array_append(problems, ('tiers.' || tier_name || ' is missing or not a number')::text);
        previous_value := null;
      elsif (cfg -> 'tiers' ->> tier_name)::numeric < 1 or (cfg -> 'tiers' ->> tier_name)::numeric > 99 then
        problems := array_append(problems, ('tiers.' || tier_name || ' must be between 1 and 99')::text);
        previous_value := null;
      elsif previous_value is not null and (cfg -> 'tiers' ->> tier_name)::numeric <= previous_value then
        problems := array_append(problems, 'tiers must rise: stade < pro < champion < legend'::text);
        previous_value := (cfg -> 'tiers' ->> tier_name)::numeric;
      else
        previous_value := (cfg -> 'tiers' ->> tier_name)::numeric;
      end if;
    end loop;
    if (select count(*) from jsonb_object_keys(cfg -> 'tiers')) <> 4 then
      problems := array_append(problems, 'tiers must have exactly stade, pro, champion and legend'::text);
    end if;
    if cardinality(problems) = 0 then
      tier_probe := app_private.manager_card_tier(50, cfg -> 'tiers');
      if tier_probe is null then
        problems := array_append(problems, 'tiers did not parse in manager_card_tier'::text);
      end if;
    end if;
  end if;

  -- Compute is still off, and the tick still does nothing.
  if exists (select 1 from app_private.manager_card_settings where compute_enabled or read_enabled) then
    problems := array_append(problems, 'a Manager Card switch is on'::text);
  end if;
  ticked := app_private.manager_card_tick();
  if ticked is distinct from '{"outcome": "off"}'::jsonb then
    problems := array_append(problems, ('the tick answered ' || coalesce(ticked::text, 'nothing') || ' instead of off')::text);
  end if;
  if (select count(*) from app_private.manager_card_job_log) <> 0
    or (select count(*) from app_private.manager_card_evaluations) <> 0
    or (select count(*) from app.manager_cards) <> 0
    or (select count(*) from app.manager_card_seasons) <> 0
    or (select count(*) from app.manager_card_gameweeks) <> 0 then
    problems := array_append(problems, 'something was written to the card'::text);
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: rules v1 did not check out: %', problems;
  end if;
  raise notice 'manager card rules v1: one active row, every key valid, scales and tiers parse, compute still off';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To install for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from app_private.manager_card_rules where version = 1 and active)
    then 'Applied. Rules v1 is installed and active; compute is still OFF. Next: the founder grant, then switch compute on (docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md).'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
